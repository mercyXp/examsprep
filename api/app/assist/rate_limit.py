"""In-memory limit for calls that spend a provider credit or token.

Render's free web service is a single instance, so one process map is the
limit students actually hit. It resets on deploy. Set AI_RATE_LIMIT=0 to turn
it off in a test.
"""

from __future__ import annotations

import time
from uuid import UUID

from fastapi import HTTPException, status

from app.config import settings


class SlidingLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}

    def reset(self) -> None:
        self._hits.clear()

    def hit(self, key: str, *, limit: int, window: int) -> None:
        now = time.monotonic()
        recent = [stamp for stamp in self._hits.get(key, []) if now - stamp < window]
        if len(recent) >= limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many AI requests. The limit is {limit} every {window} seconds. Wait and try again.",
            )
        recent.append(now)
        self._hits[key] = recent


limiter = SlidingLimiter()


def enforce_ai_limit(user_id: UUID, bucket: str = "ai") -> None:
    limit = int(settings.ai_rate_limit)
    if limit <= 0:
        return
    window = max(int(settings.ai_rate_window_seconds), 1)
    limiter.hit(f"{user_id}:{bucket}", limit=limit, window=window)
