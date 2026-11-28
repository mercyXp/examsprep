"""Rules for badges, wallet signatures, prize splits, and instruction bytes.

These tests do not need Postgres or a Solana cluster. The on-chain behaviour
is covered by the Anchor tests in solana/tests/examsprep.ts.
"""

import base64
import unittest
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from solders.keypair import Keypair
from solders.pubkey import Pubkey

from app.access import AccessScope
from app.models.enums import UserStatus
from app.models.identity import User
from app.quizzes import (
    GradedQuestion,
    grade_questions,
    normalize_choices,
    passed_score,
    percent_score,
)
from app.solana.chain import (
    associated_token_address,
    award_badge_data,
    badge_pda,
    config_pda,
    claim_reward_data,
    create_pool_data,
    instruction_discriminator,
    pay_winners_data,
    pool_pda,
    receipt_pda,
    record_achievement_data,
    subject_hash,
    vault_pda,
)
from app.solana.eligibility import (
    KIND_MOCK,
    KIND_STREAK,
    KIND_TOPIC,
    MockPass,
    PublishedLesson,
    ScoreRow,
    linked_prize_shares,
    mastered_topics,
    passed_mocks,
    rank_students,
    split_prize,
    streak_eligibility,
    streak_length,
)
from app.solana.gates import assert_pool_admin, assert_rewards_viewer
from app.solana.wallet import WalletLinkError, link_message, verify_link_signature


def _user(roles: list[str], *, super_admin: bool = False, programmes: set | None = None) -> AccessScope:
    person = User(name="Ada Admin", email="ada@example.com", status=UserStatus.ACTIVE)
    return AccessScope(
        user=person,
        roles=roles,
        super_admin=super_admin,
        programme_ids=programmes or set(),
        module_ids=set(),
        can_publish="administrator" in roles or super_admin,
        can_manage_catalogue="administrator" in roles or super_admin,
        can_assign_admins=super_admin,
        can_assign_creators="administrator" in roles or super_admin,
        can_manage_students="administrator" in roles or super_admin,
    )


class EligibilityTests(unittest.TestCase):
    def test_a_topic_is_mastered_only_when_every_published_lesson_is_complete(self) -> None:
        lessons = [
            PublishedLesson("computing:IT212", "IT212 Databases", "l1"),
            PublishedLesson("computing:IT212", "IT212 Databases", "l2"),
            PublishedLesson("computing:IT213", "IT213 Networking", "l3"),
        ]
        self.assertEqual(mastered_topics(lessons, {"l1"}), [])
        mastered = mastered_topics(lessons, {"l1", "l2"})
        self.assertEqual(len(mastered), 1)
        self.assertEqual(mastered[0].kind, KIND_TOPIC)
        self.assertEqual(mastered[0].subject_key, "computing:IT212")
        self.assertEqual(mastered[0].detail, 2)

    def test_mock_passes_keep_the_best_score(self) -> None:
        badges = passed_mocks(
            [
                MockPass("quiz-1", "Mock A", 61),
                MockPass("quiz-1", "Mock A", 80),
                MockPass("quiz-2", "Mock B", 70),
            ]
        )
        self.assertEqual([item.kind for item in badges], [KIND_MOCK, KIND_MOCK])
        by_key = {item.subject_key: item.detail for item in badges}
        self.assertEqual(by_key["quiz-1"], 80)

    def test_a_streak_holds_through_yesterday_and_breaks_after_a_gap(self) -> None:
        today = datetime(2026, 11, 27, tzinfo=UTC).date()
        days = {today - timedelta(days=offset) for offset in range(1, 4)}
        self.assertEqual(streak_length(days, today), 3)
        badge = streak_eligibility(days, today)
        assert badge is not None
        self.assertEqual(badge.kind, KIND_STREAK)
        self.assertEqual(badge.detail, 3)
        self.assertIsNone(streak_eligibility({today - timedelta(days=2)}, today))

    def test_leaderboard_uses_quiz_points_then_lessons_then_who_finished_first(self) -> None:
        earlier = datetime(2026, 11, 20, tzinfo=UTC)
        later = datetime(2026, 11, 21, tzinfo=UTC)
        ranked = rank_students(
            [
                ScoreRow("b", "Bea", 90, 1, earlier),
                ScoreRow("a", "Amina", 90, 3, later),
                ScoreRow("c", "Chipo", 70, 9, earlier),
            ]
        )
        self.assertEqual([row.user_id for row in ranked], ["a", "b", "c"])

    def test_prize_split_gives_the_remainder_to_first_place(self) -> None:
        self.assertEqual(split_prize(10, 3), [4, 3, 3])
        self.assertEqual(split_prize(0, 2), [])

    def test_unlinked_places_are_skipped_and_the_first_linked_student_gets_the_remainder(self) -> None:
        shares = linked_prize_shares(["a", "b", "c"], {"b", "c"}, 10, 3)
        self.assertEqual(shares, [("b", 2, 5), ("c", 3, 5)])
        self.assertEqual(linked_prize_shares(["a", "b"], {"a", "b"}, 10, 1), [("a", 1, 10)])
        self.assertEqual(linked_prize_shares(["a"], set(), 10, 1), [])


class WalletTests(unittest.TestCase):
    def test_a_wallet_signature_links_and_a_wrong_one_does_not(self) -> None:
        wallet = Keypair()
        user_id = uuid.uuid4()
        message = link_message(user_id, "nonce-1")
        signature = base64.b64encode(bytes(wallet.sign_message(message.encode()))).decode()
        self.assertEqual(
            verify_link_signature(str(wallet.pubkey()), message, signature),
            str(wallet.pubkey()),
        )
        with self.assertRaises(WalletLinkError):
            verify_link_signature(str(wallet.pubkey()), message, base64.b64encode(b"\x00" * 64).decode())


class PoolAdminTests(unittest.TestCase):
    def test_programme_admins_stay_inside_their_programmes(self) -> None:
        computing = uuid.uuid4()
        business = uuid.uuid4()
        admin = _user(["administrator"], programmes={computing})
        assert_pool_admin(admin, computing)
        with self.assertRaises(HTTPException) as caught:
            assert_pool_admin(admin, business)
        self.assertEqual(caught.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            assert_pool_admin(admin, None)

        creator = _user(["creator"], programmes={computing})
        with self.assertRaises(HTTPException) as caught:
            assert_pool_admin(creator, computing)
        self.assertEqual(caught.exception.status_code, 403)

        super_admin = _user(["super_administrator"], super_admin=True)
        assert_pool_admin(super_admin, None)
        assert_pool_admin(super_admin, business)
        assert_rewards_viewer(super_admin)
        assert_rewards_viewer(admin)
        with self.assertRaises(HTTPException) as rewards:
            assert_rewards_viewer(creator)
        self.assertEqual(rewards.exception.status_code, 403)


class ChainLayoutTests(unittest.TestCase):
    def test_instruction_bytes_match_the_anchor_layout(self) -> None:
        subject = subject_hash("computing:IT212")
        data = award_badge_data(0, subject, 4)
        self.assertEqual(data[:8], instruction_discriminator("award_badge"))
        self.assertEqual(data[8], 0)
        self.assertEqual(data[9:41], subject)
        self.assertEqual(int.from_bytes(data[41:45], "little"), 4)
        self.assertEqual(len(create_pool_data(7, 10, 20, 3)), 8 + 8 + 8 + 8 + 1)
        self.assertEqual(pay_winners_data([2, 1])[8:12], (2).to_bytes(4, "little"))

        recorded = record_achievement_data(3, subject, 1, 7, 1_000_000)
        self.assertEqual(recorded[:8], instruction_discriminator("record_achievement"))
        self.assertEqual(recorded[8], 3)
        self.assertEqual(recorded[9:41], subject)
        self.assertNotIn(b"computing:IT212", recorded)
        claimed = claim_reward_data(3, subject, 1_000_000)
        self.assertEqual(claimed[:8], instruction_discriminator("claim_reward"))
        self.assertEqual(int.from_bytes(claimed[-8:], "little"), 1_000_000)

    def test_pdas_are_stable_and_the_vault_hangs_off_the_pool(self) -> None:
        program = Pubkey.from_string("Ebo9c8SiwLx37wXejAwQmx1vLv1YtR8kYVb2Lb6V8FVH")
        self.assertEqual(config_pda(program), config_pda(program))
        student = Keypair().pubkey()
        subject = subject_hash("streak")
        self.assertEqual(badge_pda(program, student, 2, subject), badge_pda(program, student, 2, subject))
        pool = pool_pda(program, 7)
        self.assertNotEqual(vault_pda(program, pool), pool)
        self.assertNotEqual(receipt_pda(program, pool, student), pool)
        self.assertEqual(receipt_pda(program, pool, student), receipt_pda(program, pool, student))
        mint = Pubkey.from_string("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
        self.assertEqual(associated_token_address(student, mint), associated_token_address(student, mint))


class QuizScoreTests(unittest.TestCase):
    def test_a_quiz_passes_at_the_pass_mark_and_ignores_a_partial_match(self) -> None:
        question = GradedQuestion(
            question_version_id="q1",
            points=2,
            correct_ids=frozenset({"b"}),
            prompt="SELECT",
            explanation="It reads rows.",
            choices=normalize_choices([{"id": "a", "label": "Deletes"}, {"id": "b", "label": "Reads"}]),
        )
        results, earned, possible = grade_questions([question], {"q1": ["a"]})
        self.assertFalse(results[0].correct)
        self.assertEqual(percent_score(earned, possible), 0)
        results, earned, possible = grade_questions([question], {"q1": ["b"]})
        self.assertTrue(results[0].correct)
        self.assertEqual(percent_score(earned, possible), 100)
        self.assertTrue(passed_score(50, 50))
        self.assertFalse(passed_score(49, 50))


if __name__ == "__main__":
    unittest.main()
