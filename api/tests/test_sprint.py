"""ExamSprint scoring, agent play, and the Byte registration gate.

These tests use sqlite for the sprint tables. They do not call Byte Arena.
"""

from __future__ import annotations

import importlib.util
import json
import unittest
import uuid
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models.enums import UserStatus
from app.models.identity import User
from app.models.sprint import SprintAchievement, SprintSession
from app.sprint.bank import card_from_parts
from app.sprint.byte_client import configuration_reasons, public_base_url, submit_manifest
from app.sprint.byte_manifest import manifest_contract, render_manifest
from app.sprint.engine import (
    apply_answer,
    apply_continue,
    apply_quit,
    new_run,
    public_state,
    speed_bonus,
    unlocked_codes,
)
from app.sprint.service import (
    agent_answer,
    agent_continue,
    answer_human,
    leaderboard,
    row_for_agent_key,
    start_agent,
    start_human,
)

ROOT = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 11, 28, 12, 0, tzinfo=UTC)


def _deck() -> list[dict]:
    cards = []
    for index in range(9):
        correct = index % 4
        cards.append(
            {
                "id": f"q{index}",
                "prompt": f"Question {index}",
                "choices": [
                    {"id": "0", "label": "Zero"},
                    {"id": "1", "label": "One"},
                    {"id": "2", "label": "Two"},
                    {"id": "3", "label": "Three"},
                ],
                "correctIds": [str(correct)],
                "explanation": f"SECRET_EXPLANATION_{index}",
            }
        )
    return cards


class EngineTests(unittest.TestCase):
    def test_speed_bonus_shrinks_as_the_clock_runs_down(self) -> None:
        self.assertEqual(speed_bonus(0, 15_000), 50)
        self.assertEqual(speed_bonus(7_500, 15_000), 25)
        self.assertEqual(speed_bonus(15_000, 15_000), 0)

    def test_a_fast_human_scores_the_bonus_and_an_agent_does_not(self) -> None:
        human = new_run(
            player_kind="human",
            subject_id="practice",
            subject_name="Practice sprint",
            source="practice",
            deck=_deck(),
            now_ms=1_000,
            display_name="Ada",
        )
        self.assertIsNone(apply_answer(human, choice_id="0", move_id="m1", now_ms=1_000))
        self.assertEqual(human.score, 150)
        self.assertEqual(human.speed_bonus, 50)

        agent = new_run(
            player_kind="agent",
            subject_id="practice",
            subject_name="Practice sprint",
            source="practice",
            deck=_deck(),
            now_ms=1_000,
            display_name="byte",
        )
        self.assertIsNone(apply_answer(agent, choice_id="0", move_id="m1", now_ms=50_000))
        self.assertEqual(agent.score, 100)
        self.assertEqual(agent.speed_bonus, 0)
        self.assertTrue(public_state(agent, 50_000)["timerPaused"])

    def test_a_late_human_answer_scores_nothing_and_a_retry_does_not_double(self) -> None:
        run = new_run(
            player_kind="human",
            subject_id="practice",
            subject_name="Practice sprint",
            source="practice",
            deck=_deck(),
            now_ms=0,
            display_name="Ada",
        )
        self.assertIsNone(apply_answer(run, choice_id="0", move_id="m1", now_ms=17_000))
        self.assertEqual(run.score, 0)
        self.assertEqual(run.correct, 0)
        self.assertIsNone(apply_answer(run, choice_id="1", move_id="m1", now_ms=17_100))
        self.assertEqual(run.moves, 1)
        self.assertEqual(run.index, 1)

    def test_the_current_card_does_not_reveal_the_answer(self) -> None:
        run = new_run(
            player_kind="agent",
            subject_id="practice",
            subject_name="Practice sprint",
            source="practice",
            deck=_deck(),
            now_ms=0,
            display_name="byte",
        )
        encoded = json.dumps(public_state(run, 0))
        self.assertNotIn("SECRET_EXPLANATION", encoded)
        self.assertNotIn("correctIds", encoded)
        self.assertIsNone(public_state(run, 0)["lastResult"])
        self.assertEqual(public_state(run, 0)["legalChoices"], ["A", "B", "C", "D"])

    def test_rounds_break_and_a_perfect_run_is_flawless(self) -> None:
        run = new_run(
            player_kind="agent",
            subject_id="practice",
            subject_name="Practice sprint",
            source="practice",
            deck=_deck(),
            now_ms=0,
            display_name="byte",
        )
        for index in range(9):
            choice = run.deck[run.index]["correctIds"][0]
            self.assertIsNone(apply_answer(run, choice_id=choice, move_id=f"m{index}", now_ms=index))
            if index in {2, 5}:
                self.assertEqual(run.phase, "round_break")
                self.assertIsNone(apply_continue(run, move_id=f"c{index}", now_ms=index))
        self.assertEqual(run.status, "finished")
        self.assertEqual(run.outcome, "flawless")
        self.assertEqual(run.score, 900)
        state = public_state(run, 20)
        self.assertEqual(state["status"], "finished")
        self.assertIn("SECRET_EXPLANATION_0", json.dumps(state))

    def test_quit_is_sticky_and_does_not_count_as_a_win(self) -> None:
        run = new_run(
            player_kind="human",
            subject_id="practice",
            subject_name="Practice sprint",
            source="practice",
            deck=_deck(),
            now_ms=0,
            display_name="Ada",
        )
        apply_quit(run, move_id="stop")
        apply_quit(run, move_id="stop-again")
        self.assertEqual(run.outcome, "quit")
        self.assertEqual(run.moves, 1)
        self.assertEqual(unlocked_codes(run), [])


class BankTests(unittest.TestCase):
    def test_only_single_answer_cards_with_the_key_in_the_first_four_choices(self) -> None:
        self.assertIsNone(
            card_from_parts(
                card_id="a",
                prompt="Pick two",
                raw_choices=["a", "b", "c", "d"],
                raw_correct=["0", "1"],
                explanation="",
            )
        )
        self.assertIsNone(
            card_from_parts(
                card_id="b",
                prompt="Too short",
                raw_choices=["only"],
                raw_correct=["0"],
                explanation="",
            )
        )
        card = card_from_parts(
            card_id="c",
            prompt="Which is GET?",
            raw_choices=["POST", "GET", "DELETE"],
            raw_correct=["1"],
            explanation="GET reads.",
        )
        self.assertIsNotNone(card)
        assert card is not None
        self.assertEqual(card["correctIds"], ["1"])
        self.assertEqual(len(card["choices"]), 3)


class ServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        SprintSession.__table__.create(self.engine)
        SprintAchievement.__table__.create(self.engine)
        self.session: Session = sessionmaker(bind=self.engine, expire_on_commit=False)()
        self.user = User(
            name="Ada Student",
            email=f"{uuid.uuid4()}@examsprep.local",
            status=UserStatus.ACTIVE,
        )
        self.session.add(self.user)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_agent_play_hides_answers_and_ranks_above_a_lower_human(self) -> None:
        with patch("app.sprint.service.deal", return_value=("practice", "Practice sprint", "practice", _deck())):
            agent = start_agent(self.session, "byte", None, NOW)
            human = start_human(self.session, self.user, "practice", NOW)
        self.session.commit()
        self.assertIn("apiKey", agent)
        self.assertNotIn("apiKey", json.dumps(agent["question"]))
        encoded = json.dumps({key: value for key, value in agent.items() if key != "apiKey"})
        self.assertNotIn("SECRET_EXPLANATION", encoded)
        self.assertNotIn("correctIds", encoded)

        token = agent["apiKey"]
        from fastapi import HTTPException

        step = 0
        while step < 40:
            row = row_for_agent_key(self.session, token)
            if row.status == "finished":
                break
            if row.phase == "round_break":
                agent_continue(self.session, token, move_id=f"cont-{step}", moment=NOW)
            else:
                letter = _letter_for(row.deck[row.question_index])
                played = agent_answer(self.session, token, choice=letter, move_id=f"move-{step}", moment=NOW)
                again = agent_answer(self.session, token, choice=letter, move_id=f"move-{step}", moment=NOW)
                self.assertEqual(played["score"], again["score"])
                self.assertEqual(played["moves"], again["moves"])
            step += 1
        self.session.commit()
        finished = row_for_agent_key(self.session, token)
        self.assertEqual(finished.status, "finished")
        self.assertEqual(finished.outcome, "flawless")

        with self.assertRaises(HTTPException):
            answer_human(
                self.session,
                self.user,
                uuid.UUID(human["sessionId"]),
                choice_id="nope",
                move_id="bad",
                moment=NOW,
            )
        wrong = answer_human(
            self.session,
            self.user,
            uuid.UUID(human["sessionId"]),
            choice_id="1",
            move_id="human-1",
            moment=NOW,
        )
        self.assertEqual(wrong["score"], 0)
        self.session.commit()
        board = leaderboard(self.session)
        self.assertEqual(board["entries"][0]["displayName"], "byte")
        self.assertEqual(board["entries"][0]["playerKind"], "agent")
        self.assertEqual(leaderboard(self.session, kind="human")["entries"], [])
        self.assertEqual(len(leaderboard(self.session, kind="agent")["entries"]), 1)

    def test_a_player_cannot_read_someone_elses_run(self) -> None:
        from fastapi import HTTPException

        from app.sprint.service import read_human

        other = User(name="Bea", email=f"{uuid.uuid4()}@examsprep.local", status=UserStatus.ACTIVE)
        self.session.add(other)
        self.session.commit()
        with patch("app.sprint.service.deal", return_value=("practice", "Practice sprint", "practice", _deck())):
            opened = start_human(self.session, self.user, "practice", NOW)
        with self.assertRaises(HTTPException) as caught:
            read_human(self.session, other, uuid.UUID(opened["sessionId"]), NOW)
        self.assertEqual(caught.exception.status_code, 404)


def _letter_for(card: dict) -> str:
    correct = card["correctIds"][0]
    for index, choice in enumerate(card["choices"]):
        if choice["id"] == correct:
            return "ABCD"[index]
    raise AssertionError("correct choice missing")


class ByteGateTests(unittest.TestCase):
    def test_registration_does_not_call_byte_until_it_is_configured(self) -> None:
        with (
            patch.object(settings, "byte_game_token", ""),
            patch.object(settings, "sprint_public_base_url", "http://localhost:8000"),
            patch("urllib.request.urlopen") as opened,
        ):
            self.assertIsNone(public_base_url())
            self.assertTrue(configuration_reasons())
            result = submit_manifest(save=True)
        opened.assert_not_called()
        self.assertFalse(result["configured"])
        self.assertFalse(result["saved"])

    def test_a_public_https_origin_is_accepted(self) -> None:
        with patch.object(settings, "sprint_public_base_url", "https://api.examsprep.xyz"):
            self.assertEqual(public_base_url(), "https://api.examsprep.xyz")
        with patch.object(settings, "sprint_public_base_url", "https://10.0.0.8"):
            self.assertIsNone(public_base_url())

    def test_the_manifest_matches_the_checked_in_contract(self) -> None:
        text = render_manifest("https://YOUR_PUBLIC_API")
        contract = manifest_contract(text)
        api = contract["api"]
        self.assertEqual(api["baseUrl"], "https://YOUR_PUBLIC_API")
        self.assertEqual(api["finish"], {"path": "status", "equals": ["finished"]})
        self.assertEqual(api["result"]["score"]["path"], "score")
        self.assertEqual([action["name"] for action in api["actions"]], ["answer", "continue", "quit"])
        self.assertIn("{{runId}}", api["watchUrl"])
        self.assertEqual(api["start"]["save"]["apiKey"], "apiKey")
        checked_in = (ROOT / "mobile-examsprint" / "BYTE_GAME.md").read_text()
        self.assertEqual(checked_in, text)

    def test_revision_follows_the_it211_attempt_migration(self) -> None:
        path = ROOT / "api" / "alembic" / "versions" / "20261128_0021_sprint_game.py"
        spec = importlib.util.spec_from_file_location("sprint_migration", path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.revision, "20261128_0021")
        self.assertEqual(module.down_revision, "20261128_0020")


if __name__ == "__main__":
    unittest.main()
