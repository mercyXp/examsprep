"""Build and send the ExamsPrep program's transactions.

The instruction bytes follow Anchor's layout: 8-byte discriminator
(first 8 bytes of SHA-256 of "global:<instruction_name>") then Borsh
arguments. Account order matches programs/examsprep/src/instructions.rs.

The authority secret never leaves this process. It is read from
SOLANA_AUTHORITY_KEYPAIR. The sponsor secret, used only to lock USDC into
a pool for the demo, is SOLANA_SPONSOR_KEYPAIR.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import struct
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from solders.hash import Hash
from solders.instruction import AccountMeta, Instruction
from solders.keypair import Keypair
from solders.message import Message
from solders.pubkey import Pubkey
from solders.transaction import Transaction

from app.config import settings

logger = logging.getLogger("app.solana")

TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
SYSTEM_PROGRAM_ID = Pubkey.from_string("11111111111111111111111111111111")

DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"


class ChainDisabled(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class ChainError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass
class ChainReceipt:
    signature: str
    already_existed: bool = False
    pool_address: str = ""
    vault_address: str = ""


def instruction_discriminator(name: str) -> bytes:
    return hashlib.sha256(f"global:{name}".encode()).digest()[:8]


def subject_hash(subject_key: str) -> bytes:
    return hashlib.sha256(subject_key.encode("utf-8")).digest()


def find_pda(seeds: list[bytes], program_id: Pubkey) -> Pubkey:
    address, _bump = Pubkey.find_program_address(seeds, program_id)
    return address


def config_pda(program_id: Pubkey) -> Pubkey:
    return find_pda([b"config"], program_id)


def badge_pda(program_id: Pubkey, student: Pubkey, kind: int, subject: bytes) -> Pubkey:
    return find_pda([b"badge", bytes(student), bytes([kind]), subject], program_id)


def pool_pda(program_id: Pubkey, pool_id: int) -> Pubkey:
    return find_pda([b"pool", pool_id.to_bytes(8, "little")], program_id)


def vault_pda(program_id: Pubkey, pool: Pubkey) -> Pubkey:
    return find_pda([b"vault", bytes(pool)], program_id)


def receipt_pda(program_id: Pubkey, pool: Pubkey, student: Pubkey) -> Pubkey:
    return find_pda([b"receipt", bytes(pool), bytes(student)], program_id)


def associated_token_address(owner: Pubkey, mint: Pubkey) -> Pubkey:
    address, _bump = Pubkey.find_program_address(
        [bytes(owner), bytes(TOKEN_PROGRAM_ID), bytes(mint)],
        ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    return address


def award_badge_data(kind: int, subject: bytes, detail: int) -> bytes:
    if len(subject) != 32:
        raise ChainError("A badge subject hash must be 32 bytes.")
    return instruction_discriminator("award_badge") + bytes([kind]) + subject + struct.pack("<I", detail)


def create_pool_data(pool_id: int, period_start: int, period_end: int, top_n: int) -> bytes:
    return (
        instruction_discriminator("create_pool")
        + struct.pack("<Q", pool_id)
        + struct.pack("<q", period_start)
        + struct.pack("<q", period_end)
        + bytes([top_n])
    )


def fund_pool_data(amount: int) -> bytes:
    return instruction_discriminator("fund_pool") + struct.pack("<Q", amount)


def pay_winners_data(amounts: list[int]) -> bytes:
    body = struct.pack("<I", len(amounts))
    for amount in amounts:
        body += struct.pack("<Q", amount)
    return instruction_discriminator("pay_winners") + body


def record_achievement_data(kind: int, subject: bytes, detail: int, pool_id: int, amount: int) -> bytes:
    if len(subject) != 32:
        raise ChainError("An achievement subject hash must be 32 bytes.")
    return (
        instruction_discriminator("record_achievement")
        + bytes([kind])
        + subject
        + struct.pack("<I", detail)
        + struct.pack("<Q", pool_id)
        + struct.pack("<Q", amount)
    )


def claim_reward_data(kind: int, subject: bytes, amount: int) -> bytes:
    if len(subject) != 32:
        raise ChainError("An achievement subject hash must be 32 bytes.")
    return instruction_discriminator("claim_reward") + bytes([kind]) + subject + struct.pack("<Q", amount)


def close_reward_pool_data() -> bytes:
    return instruction_discriminator("close_reward_pool")


def load_keypair(raw: str) -> Keypair:
    """Read a Solana keypair from a JSON array, a base58 secret, or a file path."""
    text = (raw or "").strip()
    if not text:
        raise ChainDisabled("Set SOLANA_AUTHORITY_KEYPAIR on the API. See docs/architecture/solana.md.")
    if Path(text).is_file():
        text = Path(text).read_text(encoding="utf-8").strip()
    if text.startswith("["):
        secret = bytes(json.loads(text))
        return Keypair.from_bytes(secret)
    return Keypair.from_base58_string(text)


def _meta(pubkey: Pubkey, *, signer: bool = False, writable: bool = False) -> AccountMeta:
    return AccountMeta(pubkey, signer, writable)


def initialize_instruction(program_id: Pubkey, authority: Pubkey) -> Instruction:
    return Instruction(
        program_id,
        instruction_discriminator("initialize"),
        [
            _meta(authority, signer=True, writable=True),
            _meta(config_pda(program_id), writable=True),
            _meta(SYSTEM_PROGRAM_ID),
        ],
    )


def award_instruction(
    program_id: Pubkey,
    authority: Pubkey,
    student: Pubkey,
    kind: int,
    subject: bytes,
    detail: int,
) -> Instruction:
    return Instruction(
        program_id,
        award_badge_data(kind, subject, detail),
        [
            _meta(authority, signer=True, writable=True),
            _meta(config_pda(program_id)),
            _meta(student),
            _meta(badge_pda(program_id, student, kind, subject), writable=True),
            _meta(SYSTEM_PROGRAM_ID),
        ],
    )


def create_pool_instruction(
    program_id: Pubkey,
    authority: Pubkey,
    mint: Pubkey,
    pool_id: int,
    period_start: int,
    period_end: int,
    top_n: int,
) -> Instruction:
    pool = pool_pda(program_id, pool_id)
    return Instruction(
        program_id,
        create_pool_data(pool_id, period_start, period_end, top_n),
        [
            _meta(authority, signer=True, writable=True),
            _meta(config_pda(program_id)),
            _meta(mint),
            _meta(pool, writable=True),
            _meta(vault_pda(program_id, pool), writable=True),
            _meta(TOKEN_PROGRAM_ID),
            _meta(SYSTEM_PROGRAM_ID),
        ],
    )


def fund_instruction(
    program_id: Pubkey,
    sponsor: Pubkey,
    mint: Pubkey,
    pool_id: int,
    amount: int,
) -> Instruction:
    pool = pool_pda(program_id, pool_id)
    return Instruction(
        program_id,
        fund_pool_data(amount),
        [
            _meta(sponsor, signer=True, writable=True),
            _meta(pool, writable=True),
            _meta(mint),
            _meta(associated_token_address(sponsor, mint), writable=True),
            _meta(vault_pda(program_id, pool), writable=True),
            _meta(TOKEN_PROGRAM_ID),
        ],
    )


def create_ata_idempotent_instruction(payer: Pubkey, owner: Pubkey, mint: Pubkey) -> Instruction:
    """Create the student's USDC account if they do not have one yet. Safe to repeat."""
    return Instruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        bytes([1]),
        [
            _meta(payer, signer=True, writable=True),
            _meta(associated_token_address(owner, mint), writable=True),
            _meta(owner),
            _meta(mint),
            _meta(SYSTEM_PROGRAM_ID),
            _meta(TOKEN_PROGRAM_ID),
        ],
    )


def record_instruction(
    program_id: Pubkey,
    authority: Pubkey,
    student: Pubkey,
    kind: int,
    subject: bytes,
    detail: int,
    pool_id: int,
    amount: int,
) -> Instruction:
    return Instruction(
        program_id,
        record_achievement_data(kind, subject, detail, pool_id, amount),
        [
            _meta(authority, signer=True, writable=True),
            _meta(config_pda(program_id)),
            _meta(student),
            _meta(badge_pda(program_id, student, kind, subject), writable=True),
            _meta(SYSTEM_PROGRAM_ID),
        ],
    )


def claim_instruction(
    program_id: Pubkey,
    authority: Pubkey,
    student: Pubkey,
    kind: int,
    subject: bytes,
    amount: int,
    mint: Pubkey,
    pool_id: int,
) -> Instruction:
    pool = pool_pda(program_id, pool_id)
    return Instruction(
        program_id,
        claim_reward_data(kind, subject, amount),
        [
            _meta(authority, signer=True, writable=True),
            _meta(config_pda(program_id)),
            _meta(student),
            _meta(pool, writable=True),
            _meta(badge_pda(program_id, student, kind, subject)),
            _meta(receipt_pda(program_id, pool, student), writable=True),
            _meta(mint),
            _meta(vault_pda(program_id, pool), writable=True),
            _meta(associated_token_address(student, mint), writable=True),
            _meta(TOKEN_PROGRAM_ID),
            _meta(SYSTEM_PROGRAM_ID),
        ],
    )


def close_instruction(
    program_id: Pubkey,
    authority: Pubkey,
    mint: Pubkey,
    pool_id: int,
    destination_owner: Pubkey,
) -> Instruction:
    pool = pool_pda(program_id, pool_id)
    return Instruction(
        program_id,
        close_reward_pool_data(),
        [
            _meta(authority, signer=True, writable=True),
            _meta(config_pda(program_id)),
            _meta(pool, writable=True),
            _meta(mint),
            _meta(vault_pda(program_id, pool), writable=True),
            _meta(associated_token_address(destination_owner, mint), writable=True),
            _meta(TOKEN_PROGRAM_ID),
        ],
    )


def pay_instruction(
    program_id: Pubkey,
    authority: Pubkey,
    mint: Pubkey,
    pool_id: int,
    winner_token_accounts: list[Pubkey],
    amounts: list[int],
) -> Instruction:
    pool = pool_pda(program_id, pool_id)
    accounts = [
        _meta(authority, signer=True, writable=True),
        _meta(config_pda(program_id)),
        _meta(pool, writable=True),
        _meta(mint),
        _meta(vault_pda(program_id, pool), writable=True),
        _meta(TOKEN_PROGRAM_ID),
    ]
    accounts.extend(_meta(token_account, writable=True) for token_account in winner_token_accounts)
    return Instruction(program_id, pay_winners_data(amounts), accounts)


def _already_there(message: str) -> bool:
    text = message.lower()
    return "already in use" in text


class RecordingChain:
    """Remembers what would have been sent. Used only when SOLANA_CHAIN_MODE=record."""

    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def award_badge(self, student: str, kind: int, subject_key: str, detail: int) -> ChainReceipt:
        self.calls.append(("award", student, kind, subject_key, detail))
        return ChainReceipt(signature=f"record-award-{len(self.calls)}")

    def create_pool(
        self,
        pool_id: int,
        period_start: int,
        period_end: int,
        top_n: int,
        mint: str,
    ) -> ChainReceipt:
        program_id = Pubkey.from_string(settings.solana_program_id)
        pool = pool_pda(program_id, pool_id)
        vault = vault_pda(program_id, pool)
        self.calls.append(("create_pool", pool_id, top_n, mint))
        return ChainReceipt(
            signature=f"record-pool-{pool_id}",
            pool_address=str(pool),
            vault_address=str(vault),
        )

    def fund_pool(self, pool_id: int, amount: int, mint: str) -> ChainReceipt:
        self.calls.append(("fund", pool_id, amount, mint))
        return ChainReceipt(signature=f"record-fund-{pool_id}")

    def pay_winners(self, pool_id: int, mint: str, winners: list[str], amounts: list[int]) -> ChainReceipt:
        self.calls.append(("pay", pool_id, tuple(winners), tuple(amounts)))
        return ChainReceipt(signature=f"record-pay-{pool_id}")

    def record_achievement(
        self,
        student: str,
        kind: int,
        subject_key: str,
        detail: int,
        pool_id: int,
        amount: int,
    ) -> ChainReceipt:
        self.calls.append(("record_achievement", student, kind, subject_key, detail, pool_id, amount))
        return ChainReceipt(signature=f"record-achievement-{len(self.calls)}")

    def claim_reward(
        self,
        student: str,
        kind: int,
        subject_key: str,
        detail: int,
        pool_id: int,
        amount: int,
        mint: str,
    ) -> ChainReceipt:
        self.calls.append(("claim", student, kind, subject_key, pool_id, amount, mint))
        program_id = Pubkey.from_string(settings.solana_program_id)
        pool = pool_pda(program_id, pool_id)
        return ChainReceipt(signature=f"record-claim-{pool_id}", pool_address=str(pool))

    def close_pool(self, pool_id: int, mint: str, destination_owner: str) -> ChainReceipt:
        self.calls.append(("close", pool_id, mint, destination_owner))
        return ChainReceipt(signature=f"record-close-{pool_id}")


class SolanaChain:
    def __init__(self, rpc_url: str, program_id: str, authority: Keypair, sponsor: Keypair | None) -> None:
        self.rpc_url = rpc_url
        self.program_id = Pubkey.from_string(program_id)
        self.authority = authority
        self.sponsor = sponsor

    def rpc(self, method: str, params: list) -> object:
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        request = urllib.request.Request(
            self.rpc_url,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            raise ChainError(f"Solana RPC returned HTTP {exc.code}.") from exc
        except Exception as exc:
            raise ChainError("The Solana RPC could not be reached.") from exc
        if not isinstance(payload, dict):
            raise ChainError("The Solana RPC returned an unexpected response.")
        if payload.get("error"):
            error = payload["error"]
            if isinstance(error, dict):
                message = str(error.get("message") or error)
                data = error.get("data")
                logs = data.get("logs") if isinstance(data, dict) else None
                if isinstance(logs, list) and logs:
                    message = f"{message} {' '.join(str(line) for line in logs)}"
            else:
                message = str(error)
            raise ChainError(message)
        return payload.get("result")

    def account_exists(self, address: Pubkey) -> bool:
        result = self.rpc("getAccountInfo", [str(address), {"encoding": "base64"}])
        return isinstance(result, dict) and result.get("value") is not None

    def send(self, instructions: list[Instruction], signers: list[Keypair]) -> str:
        blockhash_result = self.rpc("getLatestBlockhash", [{"commitment": "confirmed"}])
        if not isinstance(blockhash_result, dict):
            raise ChainError("The Solana RPC did not return a blockhash.")
        blockhash = Hash.from_string(blockhash_result["value"]["blockhash"])
        message = Message.new_with_blockhash(instructions, signers[0].pubkey(), blockhash)
        transaction = Transaction.new_unsigned(message)
        transaction.sign(signers, blockhash)
        raw = base64.b64encode(bytes(transaction)).decode()
        signature = self.rpc(
            "sendTransaction",
            [raw, {"encoding": "base64", "preflightCommitment": "confirmed"}],
        )
        if not isinstance(signature, str):
            raise ChainError("The Solana RPC did not return a transaction signature.")
        self._confirm(signature)
        return signature

    def _confirm(self, signature: str) -> None:
        for _ in range(20):
            result = self.rpc("getSignatureStatuses", [[signature]])
            value = result.get("value") if isinstance(result, dict) else None
            status = value[0] if isinstance(value, list) and value else None
            if isinstance(status, dict):
                if status.get("err"):
                    raise ChainError(f"The transaction failed: {status['err']}")
                if status.get("confirmationStatus") in {"confirmed", "finalized"}:
                    return
            time.sleep(0.5)
        logger.warning("solana.confirm.timeout signature=%s", signature)

    def _send_or_exists(self, instructions: list[Instruction], signers: list[Keypair]) -> ChainReceipt:
        try:
            signature = self.send(instructions, signers)
        except ChainError as exc:
            if _already_there(exc.message):
                return ChainReceipt(signature="", already_existed=True)
            raise
        return ChainReceipt(signature=signature)

    def ensure_config(self) -> None:
        if self.account_exists(config_pda(self.program_id)):
            return
        self.send([initialize_instruction(self.program_id, self.authority.pubkey())], [self.authority])

    def award_badge(self, student: str, kind: int, subject_key: str, detail: int) -> ChainReceipt:
        self.ensure_config()
        student_key = Pubkey.from_string(student)
        subject = subject_hash(subject_key)
        instruction = award_instruction(self.program_id, self.authority.pubkey(), student_key, kind, subject, detail)
        return self._send_or_exists([instruction], [self.authority])

    def create_pool(
        self,
        pool_id: int,
        period_start: int,
        period_end: int,
        top_n: int,
        mint: str,
    ) -> ChainReceipt:
        self.ensure_config()
        mint_key = Pubkey.from_string(mint)
        instruction = create_pool_instruction(
            self.program_id,
            self.authority.pubkey(),
            mint_key,
            pool_id,
            period_start,
            period_end,
            top_n,
        )
        receipt = self._send_or_exists([instruction], [self.authority])
        pool = pool_pda(self.program_id, pool_id)
        receipt.pool_address = str(pool)
        receipt.vault_address = str(vault_pda(self.program_id, pool))
        return receipt

    def fund_pool(self, pool_id: int, amount: int, mint: str) -> ChainReceipt:
        if self.sponsor is None:
            raise ChainDisabled(
                "Set SOLANA_SPONSOR_KEYPAIR to the wallet that will lock USDC into the prize pool."
            )
        mint_key = Pubkey.from_string(mint)
        sponsor_token = associated_token_address(self.sponsor.pubkey(), mint_key)
        if not self.account_exists(sponsor_token):
            raise ChainError(
                "The sponsor wallet has no token account for this mint. "
                "On devnet, create a USDC account for the sponsor and fund it before calling this."
            )
        instruction = fund_instruction(self.program_id, self.sponsor.pubkey(), mint_key, pool_id, amount)
        return self._send_or_exists([instruction], [self.sponsor])

    def pay_winners(self, pool_id: int, mint: str, winners: list[str], amounts: list[int]) -> ChainReceipt:
        if len(winners) != len(amounts) or not winners:
            raise ChainError("Winners and amounts must be the same non-empty list.")
        mint_key = Pubkey.from_string(mint)
        winner_keys = [Pubkey.from_string(winner) for winner in winners]
        creates = [
            create_ata_idempotent_instruction(self.authority.pubkey(), winner, mint_key) for winner in winner_keys
        ]
        token_accounts = [associated_token_address(winner, mint_key) for winner in winner_keys]
        payment = pay_instruction(
            self.program_id,
            self.authority.pubkey(),
            mint_key,
            pool_id,
            token_accounts,
            amounts,
        )
        try:
            signature = self.send([*creates, payment], [self.authority])
        except ChainError as exc:
            # A retry after a successful payout hits the program's AlreadyPaid
            # check. The tokens already moved, so the API can keep recording it.
            if "alreadypaid" in exc.message.lower() or "already paid" in exc.message.lower():
                return ChainReceipt(signature="", already_existed=True)
            raise
        return ChainReceipt(signature=signature)

    def record_achievement(
        self,
        student: str,
        kind: int,
        subject_key: str,
        detail: int,
        pool_id: int,
        amount: int,
    ) -> ChainReceipt:
        self.ensure_config()
        student_key = Pubkey.from_string(student)
        subject = subject_hash(subject_key)
        instruction = record_instruction(
            self.program_id,
            self.authority.pubkey(),
            student_key,
            kind,
            subject,
            detail,
            pool_id,
            amount,
        )
        return self._send_or_exists([instruction], [self.authority])

    def claim_reward(
        self,
        student: str,
        kind: int,
        subject_key: str,
        detail: int,
        pool_id: int,
        amount: int,
        mint: str,
    ) -> ChainReceipt:
        """Record the entitlement if it is missing, then claim. One transaction when both are needed."""
        self.ensure_config()
        student_key = Pubkey.from_string(student)
        subject = subject_hash(subject_key)
        mint_key = Pubkey.from_string(mint)
        achievement = badge_pda(self.program_id, student_key, kind, subject)
        instructions = [
            create_ata_idempotent_instruction(self.authority.pubkey(), student_key, mint_key),
        ]
        if not self.account_exists(achievement):
            instructions.insert(
                0,
                record_instruction(
                    self.program_id,
                    self.authority.pubkey(),
                    student_key,
                    kind,
                    subject,
                    detail,
                    pool_id,
                    amount,
                ),
            )
        instructions.append(
            claim_instruction(
                self.program_id,
                self.authority.pubkey(),
                student_key,
                kind,
                subject,
                amount,
                mint_key,
                pool_id,
            )
        )
        try:
            signature = self.send(instructions, [self.authority])
        except ChainError as exc:
            if _already_there(exc.message):
                return ChainReceipt(signature="", already_existed=True)
            raise
        return ChainReceipt(signature=signature)

    def close_pool(self, pool_id: int, mint: str, destination_owner: str) -> ChainReceipt:
        mint_key = Pubkey.from_string(mint)
        owner = Pubkey.from_string(destination_owner) if destination_owner else self.authority.pubkey()
        create = create_ata_idempotent_instruction(self.authority.pubkey(), owner, mint_key)
        close = close_instruction(self.program_id, self.authority.pubkey(), mint_key, pool_id, owner)
        try:
            signature = self.send([create, close], [self.authority])
        except ChainError as exc:
            if "pool is closed" in exc.message.lower() or "poolclosed" in exc.message.lower():
                return ChainReceipt(signature="", already_existed=True)
            raise
        return ChainReceipt(signature=signature)


_recording: RecordingChain | None = None


def get_chain() -> RecordingChain | SolanaChain:
    """The chain client for this process. Record mode never contacts a cluster."""
    mode = (settings.solana_chain_mode or "").strip().lower()
    if mode == "record":
        global _recording
        if _recording is None:
            _recording = RecordingChain()
        return _recording
    if mode == "off" or not (settings.solana_authority_keypair or "").strip():
        raise ChainDisabled(
            "Solana isn’t configured on the API yet. Set SOLANA_AUTHORITY_KEYPAIR and SOLANA_RPC_URL. "
            "See docs/architecture/solana.md."
        )
    sponsor_raw = (settings.solana_sponsor_keypair or "").strip()
    sponsor = load_keypair(sponsor_raw) if sponsor_raw else None
    return SolanaChain(
        rpc_url=settings.solana_rpc_url,
        program_id=settings.solana_program_id,
        authority=load_keypair(settings.solana_authority_keypair),
        sponsor=sponsor,
    )


def chain_status() -> dict[str, object]:
    """Public description of the deployment. Never includes secret keys."""
    mode = (settings.solana_chain_mode or "").strip().lower()
    configured = bool((settings.solana_authority_keypair or "").strip()) and mode != "off"
    authority = ""
    if configured and mode != "record":
        try:
            authority = str(load_keypair(settings.solana_authority_keypair).pubkey())
        except Exception:
            authority = ""
            configured = False
    program_id = Pubkey.from_string(settings.solana_program_id)
    return {
        "ok": True,
        "configured": configured or mode == "record",
        "mode": mode or ("live" if configured else "off"),
        "cluster": settings.solana_rpc_url,
        "programId": settings.solana_program_id,
        "configPda": str(config_pda(program_id)),
        "usdcMint": settings.solana_usdc_mint or DEVNET_USDC_MINT,
        "authority": authority,
    }
