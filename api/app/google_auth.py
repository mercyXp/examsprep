"""Verify a Google sign-in and create a student account, or sign an existing one in.

The browser sends the access token from Google's account popup. This module asks
Google who that token belongs to and checks that it was issued for this app.
It never trusts an email supplied beside the token. New accounts are students.
An existing account keeps the roles it already has.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AuditLog, Role, User, UserRole
from app.models.enums import UserStatus
from app.profile import ensure_profile
from app.security import load_user_by_email

logger = logging.getLogger("app.google_auth")


def _confirmed(value: object) -> bool:
    return value is True or value == "true"


def _google_json(url: str, access_token: str, *, bearer: bool) -> dict[str, object]:
    if bearer:
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {access_token}"})
    else:
        quoted = urllib.parse.quote(access_token, safe="")
        request = urllib.request.Request(f"{url}?access_token={quoted}")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        logger.warning("google.auth.failed status=%s", exc.code)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google sign-in could not be verified.")
    except Exception as exc:
        logger.warning("google.auth.failed error=%s", type(exc).__name__)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google sign-in could not be verified.")
    if not isinstance(payload, dict):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")
    return payload


def identity_from_claims(tokeninfo: dict[str, object], profile: dict[str, object], client_id: str) -> tuple[str, str]:
    audience = tokeninfo.get("aud") or tokeninfo.get("azp")
    if audience != client_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in could not be verified.")
    email = profile.get("email") if isinstance(profile.get("email"), str) else tokeninfo.get("email")
    confirmed = _confirmed(profile.get("email_verified")) or _confirmed(tokeninfo.get("email_verified"))
    if not isinstance(email, str) or "@" not in email or not confirmed:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google did not confirm this email address.")
    raw_name = profile.get("name") if isinstance(profile.get("name"), str) else ""
    name = raw_name.strip()[:120] or email.split("@", 1)[0][:120]
    return email.strip().lower(), name


def verified_google_identity(access_token: str) -> tuple[str, str]:
    client_id = (settings.google_client_id or "").strip()
    if not client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in isn’t configured yet.",
        )
    try:
        tokeninfo = _google_json("https://www.googleapis.com/oauth2/v3/tokeninfo", access_token, bearer=False)
        profile = _google_json("https://www.googleapis.com/oauth2/v3/userinfo", access_token, bearer=True)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("google.auth.failed error=%s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in could not be verified.",
        ) from None
    return identity_from_claims(tokeninfo, profile, client_id)


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
