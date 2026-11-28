"""Verify a Seeker Genesis Token from mint account bytes.

The rules match @solana-mobile/skr-genesis-token: a Token-2022 mint is an SGT
only when its TokenGroupMember group and its MetadataPointer both equal the
published group mint. Zero-balance token accounts are ignored. Frozen accounts
are kept, because a held SGT is frozen. This module does not talk to the
network; the router does, and an RPC failure stays a failure.
"""

from __future__ import annotations

import base64
import binascii
import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from solders.pubkey import Pubkey

SGT_GROUP_ADDRESS = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te"
TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

ACCOUNT_TYPE_OFFSET = 165
ACCOUNT_TYPE_MINT = 1
EXTENSIONS_OFFSET = 166
EXTENSION_HEADER_LENGTH = 4
EXTENSION_TYPE_UNINITIALIZED = 0
EXTENSION_TYPE_METADATA_POINTER = 18
EXTENSION_TYPE_TOKEN_GROUP_MEMBER = 23
METADATA_POINTER_LENGTH = 64
TOKEN_GROUP_MEMBER_LENGTH = 72


class SeekerRpcError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass(frozen=True)
class SeekerMint:
    mint: str
    member_number: int
    token_account: str


def decode_seeker_genesis_token_mint(mint_data: bytes) -> dict[str, object] | None:
    """Return group, member number, and metadata address, or None when it is not an SGT."""
    if len(mint_data) < EXTENSIONS_OFFSET or mint_data[ACCOUNT_TYPE_OFFSET] != ACCOUNT_TYPE_MINT:
        return None
    group: str | None = None
    member_number: int | None = None
    metadata_address: str | None = None
    offset = EXTENSIONS_OFFSET
    while offset + EXTENSION_HEADER_LENGTH <= len(mint_data):
        extension_type = int.from_bytes(mint_data[offset : offset + 2], "little")
        length = int.from_bytes(mint_data[offset + 2 : offset + 4], "little")
        start = offset + EXTENSION_HEADER_LENGTH
        end = start + length
        if extension_type == EXTENSION_TYPE_UNINITIALIZED or end > len(mint_data):
            break
        if extension_type == EXTENSION_TYPE_METADATA_POINTER and length == METADATA_POINTER_LENGTH:
            metadata_address = str(Pubkey.from_bytes(mint_data[start + 32 : start + 64]))
        elif extension_type == EXTENSION_TYPE_TOKEN_GROUP_MEMBER and length == TOKEN_GROUP_MEMBER_LENGTH:
            group = str(Pubkey.from_bytes(mint_data[start + 32 : start + 64]))
            member_number = int.from_bytes(mint_data[start + 64 : start + 72], "little")
        offset = end
    if group != SGT_GROUP_ADDRESS or metadata_address != SGT_GROUP_ADDRESS or member_number is None:
        return None
    return {"group": group, "memberNumber": member_number, "metadataAddress": metadata_address}


def is_seeker_genesis_token_mint(mint_data: bytes) -> bool:
    return decode_seeker_genesis_token_mint(mint_data) is not None


def _rpc(rpc_url: str, method: str, params: list) -> object:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(rpc_url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        raise SeekerRpcError(f"Mainnet RPC returned HTTP {exc.code}.") from exc
    except Exception as exc:
        raise SeekerRpcError("Mainnet RPC could not be reached.") from exc
    if not isinstance(payload, dict):
        raise SeekerRpcError("Mainnet RPC returned an unexpected response.")
    if payload.get("error"):
        error = payload["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise SeekerRpcError(str(message or "Mainnet RPC rejected the request."))
    return payload.get("result")


def _account_bytes(value: object) -> bytes | None:
    if not isinstance(value, dict):
        return None
    data = value.get("data")
    if isinstance(data, list) and data and isinstance(data[0], str):
        try:
            return base64.b64decode(data[0])
        except (ValueError, binascii.Error):
            return None
    return None


def seeker_mints_for_owner(rpc_url: str, owner: str) -> list[SeekerMint]:
    """Held SGT mints for a wallet. Raises SeekerRpcError when the RPC fails.

    An empty list means the wallet holds none. It is never used to hide an outage.
    """
    Pubkey.from_string(owner)
    result = _rpc(
        rpc_url,
        "getTokenAccountsByOwner",
        [owner, {"programId": TOKEN_2022_PROGRAM}, {"encoding": "jsonParsed"}],
    )
    rows = result.get("value") if isinstance(result, dict) else None
    if not isinstance(rows, list):
        raise SeekerRpcError("Mainnet RPC did not return token accounts.")
    held: dict[str, str] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        account = row.get("account")
        parsed = account.get("data") if isinstance(account, dict) else None
        info = parsed.get("parsed", {}).get("info") if isinstance(parsed, dict) else None
        if not isinstance(info, dict):
            continue
        amount = str((info.get("tokenAmount") or {}).get("amount") or "0")
        if amount in {"", "0"}:
            continue
        mint = info.get("mint")
        token_account = row.get("pubkey")
        if isinstance(mint, str) and isinstance(token_account, str) and mint not in held:
            held[mint] = token_account
    if not held:
        return []
    mints = list(held)
    found: list[SeekerMint] = []
    for start in range(0, len(mints), 100):
        chunk = mints[start : start + 100]
        fetched = _rpc(rpc_url, "getMultipleAccounts", [chunk, {"encoding": "base64"}])
        values = fetched.get("value") if isinstance(fetched, dict) else None
        if not isinstance(values, list):
            raise SeekerRpcError("Mainnet RPC did not return mint accounts.")
        for mint, value in zip(chunk, values, strict=False):
            raw = _account_bytes(value)
            if raw is None:
                continue
            decoded = decode_seeker_genesis_token_mint(raw)
            if decoded is None:
                continue
            found.append(
                SeekerMint(
                    mint=mint,
                    member_number=int(decoded["memberNumber"]),
                    token_account=held[mint],
                )
            )
    found.sort(key=lambda item: item.member_number)
    return found
