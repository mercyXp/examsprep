"""Calls Byte Arena only at the endpoints published in the game spec.

https://app.bytearena.fun/api/game-spec section 12 documents preview and save.
Both need an upload token minted at https://app.bytearena.fun/games.
"""

from __future__ import annotations

import ipaddress
import json
import urllib.error
import urllib.request
from urllib.parse import urlparse

from app.config import settings
from app.sprint.byte_manifest import render_manifest

BYTE_ORIGIN = "https://app.bytearena.fun"


class ByteNetworkError(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


def _host_is_public(host: str) -> bool:
    lowered = host.lower().rstrip(".")
    if not lowered or lowered == "localhost" or lowered.endswith(".local"):
        return False
    try:
        address = ipaddress.ip_address(lowered)
    except ValueError:
        return True
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
    )


def public_base_url() -> str | None:
    raw = settings.sprint_public_base_url.strip().rstrip("/")
    if not raw:
        return None
    parsed = urlparse(raw)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    if not _host_is_public(parsed.hostname):
        return None
    return raw


def configuration_reasons() -> list[str]:
    reasons: list[str] = []
    if not settings.byte_game_token.strip():
        reasons.append(
            "BYTE_GAME_TOKEN is unset. Mint an upload token at "
            "https://app.bytearena.fun/games (for devs) and set it on the API. "
            "Do not commit the token."
        )
    if public_base_url() is None:
        reasons.append(
            "SPRINT_PUBLIC_BASE_URL must be a public https origin with no trailing slash. "
            "Byte blocks localhost and private IPs, so a local API cannot be registered."
        )
    return reasons


def status_payload() -> dict:
    reasons = configuration_reasons()
    return {
        "ok": True,
        "configured": not reasons,
        "tokenConfigured": bool(settings.byte_game_token.strip()),
        "publicBaseUrl": public_base_url(),
        "reasons": reasons,
        "spec": "https://app.bytearena.fun/api/game-spec",
        "upload": "https://app.bytearena.fun/games",
        "leaderboard": "https://app.bytearena.fun/api/leaderboard",
    }


def live_manifest() -> str:
    base = public_base_url() or "https://YOUR_PUBLIC_API"
    return render_manifest(base)


def _post(path: str, payload: dict) -> tuple[int, object]:
    token = settings.byte_game_token.strip()
    request = urllib.request.Request(
        BYTE_ORIGIN + path,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode()
            code = response.status
    except urllib.error.HTTPError as error:
        raw = error.read().decode(errors="replace")
        code = error.code
    except urllib.error.URLError as error:
        raise ByteNetworkError(str(error.reason)) from error
    try:
        parsed: object = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        parsed = {"raw": raw[:2000]}
    return code, parsed


def submit_manifest(*, save: bool) -> dict:
    """Preview, or preview-and-save. Does not request publication."""
    reasons = configuration_reasons()
    if reasons:
        return {"ok": True, "configured": False, "saved": False, "reasons": reasons, "byte": None}
    text = render_manifest(public_base_url() or "")
    path = "/api/my-games" if save else "/api/my-games/preview"
    payload: dict = {"text": text}
    if save:
        payload["name"] = "ExamSprint"
    try:
        code, body = _post(path, payload)
    except ByteNetworkError as error:
        return {
            "ok": False,
            "configured": True,
            "saved": False,
            "reasons": [f"Could not reach {BYTE_ORIGIN}: {error.reason}"],
            "byte": None,
        }
    return {
        "ok": code < 400,
        "configured": True,
        "saved": save and code < 400,
        "reasons": [] if code < 400 else ["Byte rejected the manifest. The response is in byte."],
        "byteStatus": code,
        "byte": body,
    }
