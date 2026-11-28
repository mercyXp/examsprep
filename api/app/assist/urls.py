"""Public http(s) URLs only. Blocks loopback, private, and link-local targets."""

from __future__ import annotations

import hashlib
import ipaddress
from urllib.parse import urlsplit

from fastapi import HTTPException, status

BLOCKED_HOSTS = {"localhost", "metadata", "metadata.google.internal"}


class UrlRejected(ValueError):
    pass


def canonical_url(value: str) -> str:
    raw = (value or "").strip()
    parts = urlsplit(raw)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise UrlRejected("Use a public http or https URL.")
    if parts.username or parts.password:
        raise UrlRejected("Remove the username and password from the URL.")
    host = parts.hostname.lower().rstrip(".")
    if host in BLOCKED_HOSTS or host.endswith((".local", ".internal", ".localhost")):
        raise UrlRejected("That address is not a public page.")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None and (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified
    ):
        raise UrlRejected("That address is not a public page.")
    path = parts.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    port = f":{parts.port}" if parts.port and parts.port not in {80, 443} else ""
    url = f"{parts.scheme}://{host}{port}{path}"
    if parts.query:
        url = f"{url}?{parts.query}"
    return url


def normalise_urls(values: list[str], *, limit: int = 5) -> list[str]:
    if not values:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Paste at least one public URL.")
    if len(values) > limit:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Paste at most {limit} URLs at a time.")
    cleaned: list[str] = []
    for value in values:
        try:
            url = canonical_url(value)
        except UrlRejected as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error
        if url not in cleaned:
            cleaned.append(url)
    return cleaned


def fingerprint(urls: list[str]) -> str:
    payload = "\n".join(sorted(urls))
    return hashlib.sha256(payload.encode()).hexdigest()
