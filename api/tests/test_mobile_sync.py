"""Offline sync rules and the Seeker Genesis Token mint check.

These tests do not need Postgres or a Solana cluster. They cover the bytes
the official skr-genesis-token package decodes, and the progress merge the
phone uses when a sync is replayed.
"""

import unittest

from fastapi import HTTPException
from solders.pubkey import Pubkey

from app.idempotency import clean_idempotency_key
from app.progress_merge import merge_slide_progress
from app.seeker import SGT_GROUP_ADDRESS, decode_seeker_genesis_token_mint, is_seeker_genesis_token_mint


def _address(value: str) -> bytes:
    return bytes(Pubkey.from_string(value))


def _mint(*, group: str, metadata: str, member: int = 7, account_type: int = 1) -> bytes:
    data = bytearray(166)
    data[165] = account_type
    data += (23).to_bytes(2, "little")
    data += (72).to_bytes(2, "little")
    data += b"\x22" * 32
    data += _address(group)
    data += member.to_bytes(8, "little")
    data += (18).to_bytes(2, "little")
    data += (64).to_bytes(2, "little")
    data += b"\x33" * 32
    data += _address(metadata)
    return bytes(data)


class IdempotencyKeyTests(unittest.TestCase):
    def test_blank_is_absent(self) -> None:
        self.assertIsNone(clean_idempotency_key(None))
        self.assertIsNone(clean_idempotency_key("   "))

    def test_a_phone_key_is_kept(self) -> None:
        self.assertEqual(clean_idempotency_key("attempt-12345678"), "attempt-12345678")

    def test_short_or_spaced_keys_are_rejected(self) -> None:
        for raw in ("short", "has space!", "bad/key!!"):
            with self.assertRaises(HTTPException):
                clean_idempotency_key(raw)


class ProgressMergeTests(unittest.TestCase):
    def test_website_save_can_still_clear_a_failed_check(self) -> None:
        index, revealed, completed, conflict = merge_slide_progress(
            server_index=2,
            server_revealed=3,
            server_completed=True,
            incoming_index=2,
            incoming_revealed=3,
            incoming_completed=True,
            checks_passed=False,
            at_end=True,
            guarded=False,
        )
        self.assertEqual((index, revealed, completed, conflict), (2, 3, False, None))

    def test_guarded_sync_does_not_walk_backwards_or_uncomplete(self) -> None:
        index, revealed, completed, conflict = merge_slide_progress(
            server_index=4,
            server_revealed=2,
            server_completed=True,
            incoming_index=1,
            incoming_revealed=1,
            incoming_completed=False,
            checks_passed=False,
            at_end=False,
            guarded=True,
        )
        self.assertEqual(index, 4)
        self.assertEqual(revealed, 2)
        self.assertTrue(completed)
        self.assertEqual(conflict, "kept-server-slide")

    def test_guarded_sync_can_move_forward(self) -> None:
        index, revealed, completed, conflict = merge_slide_progress(
            server_index=1,
            server_revealed=1,
            server_completed=False,
            incoming_index=3,
            incoming_revealed=2,
            incoming_completed=True,
            checks_passed=True,
            at_end=True,
            guarded=True,
        )
        self.assertEqual((index, revealed, completed, conflict), (3, 2, True, None))


class SeekerMintTests(unittest.TestCase):
    def test_official_group_and_metadata_pointer_count(self) -> None:
        raw = _mint(group=SGT_GROUP_ADDRESS, metadata=SGT_GROUP_ADDRESS, member=42)
        decoded = decode_seeker_genesis_token_mint(raw)
        self.assertIsNotNone(decoded)
        assert decoded is not None
        self.assertEqual(decoded["memberNumber"], 42)
        self.assertTrue(is_seeker_genesis_token_mint(raw))

    def test_wrong_group_is_not_a_seeker_token(self) -> None:
        other = "11111111111111111111111111111111"
        raw = _mint(group=other, metadata=SGT_GROUP_ADDRESS)
        self.assertIsNone(decode_seeker_genesis_token_mint(raw))

    def test_metadata_pointer_must_also_match(self) -> None:
        other = "11111111111111111111111111111111"
        raw = _mint(group=SGT_GROUP_ADDRESS, metadata=other)
        self.assertFalse(is_seeker_genesis_token_mint(raw))

    def test_short_or_non_mint_accounts_are_ignored(self) -> None:
        self.assertIsNone(decode_seeker_genesis_token_mint(b"\x01" * 10))
        raw = _mint(group=SGT_GROUP_ADDRESS, metadata=SGT_GROUP_ADDRESS, account_type=0)
        self.assertIsNone(decode_seeker_genesis_token_mint(raw))


if __name__ == "__main__":
    unittest.main()
