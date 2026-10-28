from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.emailer import send_password_changed
from app.google_auth import sign_in_with_google, verified_google_identity
from app.models import AuditLog, Role, User, UserRole
from app.password_reset import GENERIC_MESSAGE, PasswordResetError, consume_reset, request_reset
from app.models.enums import UserStatus
from app.profile import ensure_profile, user_out
from app.schemas import (
    AuthOut,
    ErrorOut,
    ForgotPasswordIn,
    GoogleIn,
    LoginIn,
    MessageOut,
    PasswordIn,
    ProfileIn,
    ResetPasswordIn,
    SignupIn,
    UserOut,
)
from app.security import (
    create_access_token,
    hash_password,
    load_user_by_email,
    load_user_by_id,
    require_user,
    role_slugs,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _auth_out(user: User) -> AuthOut:
    roles = role_slugs(user)
    token = create_access_token(
        user_id=user.id,
        email=user.email,
        roles=roles,
        token_version=int(user.token_version or 0),
    )
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

    user = User(
        name=name,
        email=email,
        password_hash=hash_password(body.password),
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
    user.last_login_at = datetime.now(timezone.utc)
    ensure_profile(session, user)
    loaded = load_user_by_email(session, email)
    assert loaded is not None
    return _auth_out(loaded)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(require_user), session: Session = Depends(get_session)) -> UserOut:
    ensure_profile(session, user)
    return user_out(user)


@router.patch("/me", response_model=UserOut)
def update_profile(body: ProfileIn, user: User = Depends(require_user), session: Session = Depends(get_session)) -> UserOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter your name.")
    user.name = name
    session.add(
        AuditLog(
            actor_id=user.id,
            action="user.profile.update",
            resource_type="user",
            resource_id=user.id,
            payload={"name": name},
        )
    )
    session.flush()
    ensure_profile(session, user)
    loaded = load_user_by_id(session, user.id)
    assert loaded is not None
    return user_out(loaded)


@router.post("/password", response_model=AuthOut)
def change_password(body: PasswordIn, user: User = Depends(require_user), session: Session = Depends(get_session)) -> AuthOut:
    if user.password_hash is None or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    if body.current_password == body.new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a new password that is different from the current one.")
    user.password_hash = hash_password(body.new_password)
    user.token_version = int(user.token_version or 0) + 1
    session.add(
        AuditLog(
            actor_id=user.id,
            action="user.password.change",
            resource_type="user",
            resource_id=user.id,
            payload={},
        )
    )
    session.flush()
    send_password_changed(user.email)
    loaded = load_user_by_id(session, user.id)
    assert loaded is not None
    return _auth_out(loaded)


@router.post("/google", response_model=AuthOut)
def google(body: GoogleIn, session: Session = Depends(get_session)) -> AuthOut:
    email, name = verified_google_identity(body.access_token)
    user = sign_in_with_google(session, email, name)
    return _auth_out(user)


@router.post("/forgot-password", response_model=MessageOut)
def forgot_password(body: ForgotPasswordIn, session: Session = Depends(get_session)) -> MessageOut:
    if not _normalize_email(body.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter your email.")
    request_reset(session, body.email)
    return MessageOut(message=GENERIC_MESSAGE)


@router.post("/reset-password", response_model=MessageOut)
def reset_password(body: ResetPasswordIn, session: Session = Depends(get_session)) -> MessageOut:
    try:
        consume_reset(session, body.token, body.password)
    except PasswordResetError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
    return MessageOut(message="Your password has been updated. Sign in with the new one.")
