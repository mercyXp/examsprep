"""Small JSON and binary HTTP helper. Responses are data, not instructions."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.assist.urls import UrlRejected, canonical_url


@dataclass
class UpstreamError(Exception):
    status: int
    message: str
    blocked: bool = False
    payment: bool = False

    def __str__(self) -> str:
        return self.message


def _message_from(body: bytes, status_code: int) -> UpstreamError:
    text = ""
    try:
        payload = json.loads(body.decode("utf-8", errors="replace"))
    except (json.JSONDecodeError, UnicodeError):
        payload = None
    if isinstance(payload, dict):
        raw = payload.get("error") or payload.get("message") or payload.get("detail") or ""
        if isinstance(raw, dict):
            raw = raw.get("message") or raw.get("error") or ""
        text = str(raw)
    text = " ".join(text.split())[:500]
    if not text:
        text = f"The provider returned HTTP {status_code}."
    lowered = text.lower()
    blocked = status_code in {401, 403} or any(
        token in lowered for token in ("robot", "blocked", "forbidden", "denied", "not allowed")
    )
    payment = status_code == 402 or any(token in lowered for token in ("credit", "payment", "quota", "upgrade"))
    return UpstreamError(status_code, text, blocked=blocked, payment=payment)


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 40,
    data: bytes | None = None,
    content_type: str | None = None,
) -> tuple[int, dict | list | bytes]:
    body = data if data is not None else (json.dumps(payload).encode() if payload is not None else None)
    header_map = {"Accept": "application/json", **(headers or {})}
    if body is not None and payload is not None:
        header_map.setdefault("Content-Type", "application/json")
    if content_type:
        header_map["Content-Type"] = content_type
    request = urllib.request.Request(url, data=body, headers=header_map, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            status = int(response.status)
            mime = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        raw = error.read()
        raise _message_from(raw, int(error.code)) from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise UpstreamError(0, "The provider could not be reached.") from error
    if "json" in mime or raw[:1] in {b"{", b"["}:
        try:
            return status, json.loads(raw.decode())
        except (json.JSONDecodeError, UnicodeError):
            return status, raw
    return status, raw


def fetch_text(url: str, *, timeout: int = 8, max_bytes: int = 200_000) -> tuple[int, str]:
    """Fetch a small public text file such as robots.txt. Redirects must stay public."""
    try:
        canonical_url(url)
    except UrlRejected as error:
        raise UpstreamError(0, str(error), blocked=True) from error

    class _Guard(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            try:
                canonical_url(newurl)
            except UrlRejected as error:
                raise UpstreamError(0, str(error), blocked=True) from error
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    opener = urllib.request.build_opener(_Guard)
    request = urllib.request.Request(url, headers={"User-Agent": "ExamsPrep"})
    try:
        with opener.open(request, timeout=timeout) as response:
            status = int(response.status)
            raw = response.read(max_bytes)
    except UpstreamError:
        raise
    except urllib.error.HTTPError as error:
        return int(error.code), error.read(max_bytes).decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as error:
        raise UpstreamError(0, "robots.txt could not be read.") from error
    return status, raw.decode("utf-8", errors="replace")
