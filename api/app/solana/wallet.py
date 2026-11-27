"""Link an ExamsPrep user to a Solana wallet by checking a signed message.

Mobile Wallet Adapter signs the raw message bytes. We check that signature
with the wallet's public key. A matching signature proves the person who is
signed in controls that wallet. It does not move SOL or USDC.
"""

from __future__ import annotations

import base64
from uuid import UUID

from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from solders.pubkey import Pubkey
from solders.signature import Signature


class WalletLinkError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        self.message = message
        self.status_code = status_code


def link_message(user_id: UUID, nonce: str) -> str:
    return (
        "ExamsPrep wallet link\n"
        f"user:{user_id}\n"
        f"nonce:{nonce}\n"
        "\n"
        "Sign this message to link your Solana wallet to your ExamsPrep account. "
        "This does not send SOL or USDC."
    )


def parse_address(value: str) -> str:
    """Return the canonical base58 address, or raise if it is not a public key."""
    try:
        return str(Pubkey.from_string(value.strip()))
    except Exception as exc:
        raise WalletLinkError("That does not look like a Solana wallet address.") from exc


def decode_signature(value: str) -> bytes:
    """Accept the base64 signature Mobile Wallet Adapter returns, or a base58 one."""
    raw_text = value.strip()
    try:
        decoded = base64.b64decode(raw_text, validate=True)
    except Exception:
        decoded = b""
    if len(decoded) == 64:
        return decoded
    try:
        decoded = bytes(Signature.from_string(raw_text))
    except Exception as exc:
        raise WalletLinkError("The wallet signature could not be read.") from exc
    if len(decoded) != 64:
        raise WalletLinkError("The wallet signature could not be read.")
    return decoded


def verify_link_signature(address: str, message: str, signature: str) -> str:
    """Return the canonical address when `signature` really signs `message`."""
    canonical = parse_address(address)
    signature_bytes = decode_signature(signature)
    try:
        VerifyKey(bytes(Pubkey.from_string(canonical))).verify(message.encode("utf-8"), signature_bytes)
    except BadSignatureError as exc:
        raise WalletLinkError("The wallet signature does not match this account.", status_code=401) from exc
    return canonical
