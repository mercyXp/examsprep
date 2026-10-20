from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import AuditLog, Role, User, UserRole
from app.models.enums import UserStatus
from app.profile import ensure_profile, user_out
from app.schemas import AuthOut, ErrorOut, ForgotPasswordIn, LoginIn, SignupIn, UserOut
from app.security import (
    create_access_token,
    hash_password,
    load_user_by_email,
    require_user,
    role_slugs,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _auth_out(user: User) -> AuthOut:
    roles = role_slugs(user)
    token = create_access_token(user_id=user.id, email=user.email, roles=roles)
    return AuthOut(access_token=token, user=user_out(user))


@router.post("/signup", response_model=AuthOut, responses={400: {"model": ErrorOut}, 409: {"model": ErrorOut}})
def signup(body: SignupIn, session: Session = Depends(get_session)) -> AuthOut:
    email = _normalize_email(body.email)
    name = body.name.strip()
    if "@" not in email or not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter your name, email, and password.",
        )

    if load_user_by_email(session, email) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    student = session.scalar(select(Role).where(Role.slug == "student"))
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn’t create your account. Roles aren’t seeded yet.",
        )

    user = User(name=name, email=email, password_hash=hash_password(body.password), status=UserStatus.ACTIVE)
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=student.id))
    ensure_profile(session, user)
    session.add(
        AuditLog(
            actor_id=user.id,
            action="user.signup",
            resource_type="user",
            resource_id=user.id,
            payload={"email": email, "role": "student"},
        )
    )
    session.flush()
    loaded = load_user_by_email(session, email)
    assert loaded is not None
    return _auth_out(loaded)


@router.post("/login", response_model=AuthOut, responses={401: {"model": ErrorOut}})
def login(body: LoginIn, session: Session = Depends(get_session)) -> AuthOut:
    email = _normalize_email(body.email)
    user = load_user_by_email(session, email)
    if (
        user is None
        or user.password_hash is None
        or not verify_password(body.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="We couldn’t sign you in. Check your email and password.",
        )
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account isn’t active.",
        )
    ensure_profile(session, user)
    loaded = load_user_by_email(session, email)
    assert loaded is not None
    return _auth_out(loaded)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(require_user), session: Session = Depends(get_session)) -> UserOut:
    ensure_profile(session, user)
    return user_out(user)


@router.post("/google", response_model=ErrorOut, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
def google() -> ErrorOut:
    return ErrorOut(message="Google sign-in isn’t connected yet.")


@router.post("/forgot-password", response_model=ErrorOut, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
def forgot_password(body: ForgotPasswordIn) -> ErrorOut:
    if not _normalize_email(body.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter your email.")
    return ErrorOut(message="We couldn’t send a reset link. Email isn’t connected yet.")
