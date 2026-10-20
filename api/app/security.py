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


def create_access_token(*, user_id: UUID, email: str, roles: list[str]) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "roles": roles,
        "exp": datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def role_slugs(user: User) -> list[str]:
    return [item.role.slug for item in user.roles if item.role is not None]


def load_user_by_email(session: Session, email: str) -> User | None:
    return session.scalars(
        select(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
        .where(User.email == email)
    ).unique().one_or_none()


def load_user_by_id(session: Session, user_id: UUID) -> User | None:
    return session.scalars(
        select(User)
        .options(joinedload(User.roles).joinedload(UserRole.role))
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
    except (jwt.InvalidTokenError, KeyError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
        ) from error

    user = load_user_by_id(session, user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return user
