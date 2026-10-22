"""Invitation-based staff accounts.

Public signup stays student-only. A super administrator invites a creator or
an administrator. The raw token is emailed once and stored only as a hash.
"""

from __future__ import annotations

import hashlib
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models.enums import UserStatus
from app.models.identity import Role, User, UserRole
from app.models.staff import StaffInvitation
from app.security import hash_password, role_slugs

INVITE_ROLES = frozenset({"creator", "administrator"})
INVITE_HOURS = 24
ROLE_LABELS = {"creator": "Creator", "administrator": "Administrator"}


class StaffInviteError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def invitation_state(row: StaffInvitation, now: datetime | None = None) -> str:
    if row.accepted_at is not None:
        return "accepted"
    if row.revoked_at is not None:
        return "revoked"
    moment = now or datetime.now(timezone.utc)
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires <= moment:
        return "expired"
    return "pending"


def _role(session: Session, slug: str) -> Role:
    if slug not in INVITE_ROLES:
        raise StaffInviteError("Choose Creator or Administrator.", 422)
    role = session.scalar(select(Role).where(Role.slug == slug))
    if role is None:
        raise StaffInviteError("Roles aren’t ready yet.", 503)
    return role


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _user_by_email(session: Session, email: str) -> User | None:
    return session.scalars(
        select(User).options(joinedload(User.roles).joinedload(UserRole.role)).where(User.email == email)
    ).unique().one_or_none()


def create_invitation(
    session: Session,
    *,
    email: str,
    role_slug: str,
    invited_by_id,
) -> tuple[StaffInvitation, str]:
    email = _normalize_email(email)
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise StaffInviteError("Enter a valid email address.", 422)
    _role(session, role_slug)
    if _user_by_email(session, email) is not None:
        raise StaffInviteError(
            "That email already belongs to an account. Staff are invited as new accounts, not upgraded from students.",
            409,
        )
    waiting = session.scalars(select(StaffInvitation).where(StaffInvitation.email == email)).all()
    if any(invitation_state(row) == "pending" for row in waiting):
        raise StaffInviteError("An invitation is already waiting for that email. Resend it instead.", 409)

    raw = secrets.token_urlsafe(32)
    row = StaffInvitation(
        email=email,
        role_slug=role_slug,
        token_hash=hash_token(raw),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=INVITE_HOURS),
        invited_by_id=invited_by_id,
    )
    session.add(row)
    session.flush()
    return row, raw


def resend_invitation(session: Session, invitation_id) -> tuple[StaffInvitation, str]:
    row = session.get(StaffInvitation, invitation_id)
    if row is None:
        raise StaffInviteError("Invitation not found.", 404)
    if row.accepted_at is not None:
        raise StaffInviteError("This invitation has already been used.", 409)
    if _user_by_email(session, row.email) is not None:
        raise StaffInviteError("That email already belongs to an account.", 409)
    raw = secrets.token_urlsafe(32)
    row.token_hash = hash_token(raw)
    row.expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITE_HOURS)
    row.revoked_at = None
    session.flush()
    return row, raw


def revoke_invitation(session: Session, invitation_id) -> StaffInvitation:
    row = session.get(StaffInvitation, invitation_id)
    if row is None:
        raise StaffInviteError("Invitation not found.", 404)
    if row.accepted_at is not None:
        raise StaffInviteError("This invitation has already been used.", 409)
    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        session.flush()
    return row


def find_invitation(session: Session, raw_token: str) -> StaffInvitation:
    if not raw_token or len(raw_token) < 20:
        raise StaffInviteError("This invitation link is not valid.", 404)
    row = session.scalar(select(StaffInvitation).where(StaffInvitation.token_hash == hash_token(raw_token)))
    if row is None:
        raise StaffInviteError("This invitation link is not valid.", 404)
    return row


def accept_invitation(session: Session, raw_token: str, name: str, password: str) -> User:
    row = find_invitation(session, raw_token)
    state = invitation_state(row)
    if state == "accepted":
        raise StaffInviteError("This invitation has already been used.", 409)
    if state == "revoked":
        raise StaffInviteError("This invitation is no longer valid.", 410)
    if state == "expired":
        raise StaffInviteError("This invitation has expired. Ask a super administrator to send a new one.", 410)

    name = name.strip()
    if not name or len(name) > 120:
        raise StaffInviteError("Enter your name.", 422)
    if len(password) < 8 or len(password) > 128:
        raise StaffInviteError("Use a password between 8 and 128 characters.", 422)
    if _user_by_email(session, row.email) is not None:
        raise StaffInviteError("That email already belongs to an account.", 409)

    role = _role(session, row.role_slug)
    user = User(
        name=name,
        email=row.email,
        password_hash=hash_password(password),
        status=UserStatus.ACTIVE,
    )
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=role.id))
    row.accepted_at = datetime.now(timezone.utc)
    row.accepted_user_id = user.id
    session.flush()
    loaded = _user_by_email(session, user.email)
    if loaded is None:
        raise StaffInviteError("The account could not be activated.", 500)
    if row.role_slug not in role_slugs(loaded):
        raise StaffInviteError("The account could not be activated.", 500)
    if "student" in role_slugs(loaded) or "super_administrator" in role_slugs(loaded):
        raise StaffInviteError("The account could not be activated.", 500)
    return loaded


def change_staff_role(session: Session, user_id, role_slug: str) -> User:
    role = _role(session, role_slug)
    user = session.scalars(
        select(User).options(joinedload(User.roles).joinedload(UserRole.role)).where(User.id == user_id)
    ).unique().one_or_none()
    if user is None:
        raise StaffInviteError("Staff member not found.", 404)
    slugs = set(role_slugs(user))
    if "super_administrator" in slugs:
        raise StaffInviteError("The super administrator role is not managed here.", 403)
    if not slugs.intersection(INVITE_ROLES):
        raise StaffInviteError("This account is not a staff member.", 422)
    for link in list(user.roles):
        if link.role is not None and link.role.slug in INVITE_ROLES and link.role.slug != role_slug:
            session.delete(link)
    if role_slug not in slugs:
        session.add(UserRole(user_id=user.id, role_id=role.id))
    session.flush()
    session.expire(user, ["roles"])
    loaded = _user_by_email(session, user.email)
    if loaded is None:
        raise StaffInviteError("Staff member not found.", 404)
    return loaded


def set_staff_access(session: Session, user_id, active: bool) -> User:
    user = session.scalars(
        select(User).options(joinedload(User.roles).joinedload(UserRole.role)).where(User.id == user_id)
    ).unique().one_or_none()
    if user is None:
        raise StaffInviteError("Staff member not found.", 404)
    slugs = set(role_slugs(user))
    if "super_administrator" in slugs:
        raise StaffInviteError("The super administrator account is not managed here.", 403)
    if not slugs.intersection(INVITE_ROLES):
        raise StaffInviteError("This account is not a staff member.", 422)
    user.status = UserStatus.ACTIVE if active else UserStatus.SUSPENDED
    session.flush()
    return user


def acceptance_url(raw_token: str) -> str:
    base = (settings.app_url or "http://localhost:3000").rstrip("/")
    return f"{base}/invite/{raw_token}"


def send_invitation_email(email: str, role_slug: str, raw_token: str) -> bool:
    """Send the link when SMTP is configured. Return False when mail is not set up or sending fails."""
    host = (settings.smtp_host or "").strip()
    sender = (settings.smtp_from or "").strip()
    if not host or not sender:
        return False
    label = ROLE_LABELS.get(role_slug, "staff member")
    link = acceptance_url(raw_token)
    message = EmailMessage()
    message["Subject"] = f"Your ExamsPrep {label} invitation"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        "\n".join(
            [
                f"You have been invited to ExamsPrep as a {label}.",
                "",
                "Open this link to choose your password and activate your account.",
                "The link works once and expires in 24 hours.",
                "",
                link,
                "",
                "If you were not expecting this, you can ignore the message.",
            ]
        )
    )
    try:
        with smtplib.SMTP(host, int(settings.smtp_port or 587), timeout=10) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            username = (settings.smtp_username or "").strip()
            if username:
                smtp.login(username, settings.smtp_password or "")
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        return False
    return True
