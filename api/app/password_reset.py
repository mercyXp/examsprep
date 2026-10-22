"""Single-use password reset links.

The request endpoint always answers the same way, whether or not the email
belongs to an account. The raw token is emailed and stored only as a hash.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import public_origin
from app.emailer import send_password_changed, send_password_reset
from app.models.enums import UserStatus
from app.models.identity import User
from app.models.recovery import PasswordResetToken
from app.security import hash_password

RESET_MINUTES = 15
GENERIC_MESSAGE = "If an account exists for that email, we sent a reset link. It expires in 15 minutes."


class PasswordResetError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def reset_url(raw_token: str) -> str:
    return f"{public_origin()}/reset-password?token={quote(raw_token, safe='')}"


def request_reset(session: Session, email: str) -> None:
    normalized = email.strip().lower()
    user = session.scalar(select(User).where(User.email == normalized))
    if user is None or user.status != UserStatus.ACTIVE:
        return
    now = datetime.now(timezone.utc)
    pending = session.scalars(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
    ).all()
    for row in pending:
        row.used_at = now
    raw = secrets.token_urlsafe(32)
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_reset_token(raw),
            expires_at=now + timedelta(minutes=RESET_MINUTES),
        )
    )
    session.flush()
    send_password_reset(user.email, reset_url(raw))


def _moment(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def consume_reset(session: Session, raw_token: str, password: str) -> None:
    if not raw_token or len(raw_token) < 20:
        raise PasswordResetError("This reset link is not valid.")
    if len(password) < 8 or len(password) > 128:
        raise PasswordResetError("Use a password between 8 and 128 characters.", 422)
    row = session.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_reset_token(raw_token)))
    if row is None:
        raise PasswordResetError("This reset link is not valid.")
    if row.used_at is not None:
        raise PasswordResetError("This reset link has already been used.", 409)
    if _moment(row.expires_at) <= datetime.now(timezone.utc):
        raise PasswordResetError("This reset link has expired. Request a new one.", 410)
    user = session.get(User, row.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise PasswordResetError("This reset link is not valid.")
    user.password_hash = hash_password(password)
    user.token_version = int(user.token_version or 0) + 1
    row.used_at = datetime.now(timezone.utc)
    session.flush()
    send_password_changed(user.email)
