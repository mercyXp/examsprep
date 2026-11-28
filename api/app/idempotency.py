"""Store one response per Idempotency-Key so a retried sync does not double-write.

The phone writes the key into its outbox before the request. If the response
never arrives, the same key is sent again. The second call returns the first
response and does not grade the quiz a second time.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.mobile import SyncReceipt

_KEY = re.compile(r"^[A-Za-z0-9_-]{8,80}$")


def clean_idempotency_key(raw: str | None) -> str | None:
    if raw is None:
        return None
    key = raw.strip()
    if not key:
        return None
    if _KEY.fullmatch(key) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Idempotency-Key must be 8 to 80 letters, numbers, underscores, or hyphens.",
        )
    return key


def stored_response(session: Session, user_id: uuid.UUID, scope: str, key: str | None) -> dict[str, Any] | None:
    if not key:
        return None
    row = session.scalar(
        select(SyncReceipt).where(
            SyncReceipt.user_id == user_id,
            SyncReceipt.scope == scope,
            SyncReceipt.idempotency_key == key,
        )
    )
    if row is None or not isinstance(row.response_json, dict):
        return None
    payload = dict(row.response_json)
    payload["replayed"] = True
    return payload


def remember_response(
    session: Session,
    user_id: uuid.UUID,
    scope: str,
    key: str | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Save the response in this transaction. A duplicate key rolls the write back."""
    if not key:
        return payload
    session.add(
        SyncReceipt(
            user_id=user_id,
            scope=scope,
            idempotency_key=key,
            response_json=payload,
        )
    )
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        prior = stored_response(session, user_id, scope, key)
        if prior is not None:
            return prior
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That sync is already being saved. Retry with the same Idempotency-Key.",
        ) from None
    return payload
