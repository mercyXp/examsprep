"""Verify a Google ID token and sign in, or create a student account.

The browser sends Google's signed credential. This module checks that signature
and the intended audience. It never trusts an email supplied beside the token.
New accounts are students. An existing account keeps the roles it already has.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AuditLog, Role, User, UserRole
from app.models.enums import UserStatus
from app.profile import ensure_profile
from app.security import load_user_by_email

logger = logging.getLogger("app.google_auth")


def verified_google_identity(credential: str) -> tuple[str, str]:
    client_id = (settings.google_client_id or "").strip()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in isn’t configured yet.",
        )
    try:
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
    except Exception as exc:
        logger.warning("google.auth.failed error=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in could not be verified.",
        ) from exc

    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email or claims.get("email_verified") is not True:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google did not confirm this email address.",
        )
    raw_name = claims.get("name") if isinstance(claims.get("name"), str) else ""
    name = raw_name.strip()[:120] or email.split("@", 1)[0][:120]
    return email.strip().lower(), name


def sign_in_with_google(session: Session, email: str, name: str) -> User:
    existing = load_user_by_email(session, email)
    if existing is not None:
        if existing.status != UserStatus.ACTIVE:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "This account isn’t active.")
        existing.last_login_at = datetime.now(timezone.utc)
        ensure_profile(session, existing)
        session.add(
            AuditLog(
                actor_id=existing.id,
                action="user.google.login",
                resource_type="user",
                resource_id=existing.id,
                payload={"email": email},
            )
        )
        session.flush()
        loaded = load_user_by_email(session, email)
        assert loaded is not None
        return loaded

    student = session.scalar(select(Role).where(Role.slug == "student"))
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn’t create your account. Roles aren’t seeded yet.",
        )
    user = User(
        name=name,
        email=email,
        password_hash=None,
        status=UserStatus.ACTIVE,
        last_login_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=student.id))
    ensure_profile(session, user)
    session.add(
        AuditLog(
            actor_id=user.id,
            action="user.google.signup",
            resource_type="user",
            resource_id=user.id,
            payload={"email": email, "role": "student"},
        )
    )
    session.flush()
    loaded = load_user_by_email(session, email)
    assert loaded is not None
    return loaded
