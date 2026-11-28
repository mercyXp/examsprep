"""Plain messages when a provider key is missing. Never invent a result."""

from __future__ import annotations

from fastapi import HTTPException, status


def not_configured(feature: str, *env_names: str) -> HTTPException:
    names = " and ".join(env_names)
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        f"{feature} is not configured. Set {names} on the API server. No result was generated.",
    )
