from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db import get_session
from app.models import User, UserRole
from app.models.enums import UserStatus

bearer = HTTPBearer(auto_error=False)


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(*, user_id: UUID, email: str, roles: list[str], token_version: int = 0) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "roles": roles,
        "ver": token_version,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def role_slugs(user: User) -> list[str]:
    return [item.role.slug for item in user.roles if item.role is not None]


def load_user_by_email(session: Session, email: str) -> User | None:
    return session.scalars(
        select(User)
        .options(joinedload(User.roles).joinedload(UserRole.role), joinedload(User.profile))
        .where(User.email == email)
    ).unique().one_or_none()


def load_user_by_id(session: Session, user_id: UUID) -> User | None:
    return session.scalars(
        select(User)
        .options(joinedload(User.roles).joinedload(UserRole.role), joinedload(User.profile))
        .where(User.id == user_id)
    ).unique().one_or_none()


def require_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")

    try:
        payload = jwt.decode(credentials.credentials, settings.secret_key, algorithms=["HS256"])
        user_id = UUID(str(payload["sub"]))
        token_version = int(payload.get("ver", 0))
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
        ) from error

    user = load_user_by_id(session, user_id)
    if user is None or user.status != UserStatus.ACTIVE or int(user.token_version or 0) != token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return user


STAFF_ROLES = frozenset({"creator", "administrator", "super_administrator"})
ADMIN_ROLES = frozenset({"administrator", "super_administrator"})


def require_staff(user: User = Depends(require_user)) -> User:
    if not STAFF_ROLES.intersection(role_slugs(user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required.")
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if not ADMIN_ROLES.intersection(role_slugs(user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access is required.")
    return user
