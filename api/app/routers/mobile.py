"""Endpoints the Android app needs that the website does not.

Push tokens are stored so a later worker can send through Expo. This process
does not send them: Android delivery needs Firebase, which is documented with
the app. Local reminders on the phone do not use these rows.

Seeker verification reads the linked wallet on mainnet. The phone cannot grant
the achievement by itself.
"""

from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.models import User
from app.models.mobile import NotificationPreference, PushToken, SeekerClaim
from app.security import require_user
from app.seeker import SeekerRpcError, seeker_mints_for_owner
from app.solana.service import linked_wallet

router = APIRouter(prefix="/api/mobile", tags=["mobile"])

_TOKEN = re.compile(r"^[A-Za-z0-9_\[\]:\-\.]{16,256}$")


class PushTokenIn(BaseModel):
    token: str = Field(min_length=16, max_length=256)
    platform: str = Field(default="android", max_length=16)


class PreferenceIn(BaseModel):
    daily_study: bool = True
    streak_warning: bool = True
    exam_reminder: bool = True
    new_lesson: bool = True
    achievement: bool = True
    reward: bool = True
    leaderboard: bool = True
    daily_hour: int = Field(default=18, ge=0, le=23)
    daily_minute: int = Field(default=0, ge=0, le=59)


def _prefs(row: NotificationPreference) -> dict:
    return {
        "ok": True,
        "dailyStudy": row.daily_study,
        "streakWarning": row.streak_warning,
        "examReminder": row.exam_reminder,
        "newLesson": row.new_lesson,
        "achievement": row.achievement,
        "reward": row.reward,
        "leaderboard": row.leaderboard,
        "dailyHour": row.daily_hour,
        "dailyMinute": row.daily_minute,
    }


def _load_prefs(session: Session, user_id: uuid.UUID) -> NotificationPreference:
    row = session.get(NotificationPreference, user_id)
    if row is None:
        row = NotificationPreference(user_id=user_id)
        session.add(row)
        session.flush()
    return row


@router.get("/notification-preferences")
def get_preferences(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return _prefs(_load_prefs(session, user.id))


@router.put("/notification-preferences")
def put_preferences(
    body: PreferenceIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    row = _load_prefs(session, user.id)
    row.daily_study = body.daily_study
    row.streak_warning = body.streak_warning
    row.exam_reminder = body.exam_reminder
    row.new_lesson = body.new_lesson
    row.achievement = body.achievement
    row.reward = body.reward
    row.leaderboard = body.leaderboard
    row.daily_hour = body.daily_hour
    row.daily_minute = body.daily_minute
    session.flush()
    return _prefs(row)


@router.post("/push-tokens")
def register_push_token(
    body: PushTokenIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    token = body.token.strip()
    if _TOKEN.fullmatch(token) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That push token is not in a form we can store.")
    platform = body.platform.strip().lower() or "android"
    if platform not in {"android", "ios"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Platform must be android or ios.")
    existing = session.scalar(select(PushToken).where(PushToken.token == token))
    if existing is None:
        session.add(PushToken(user_id=user.id, token=token, platform=platform))
    else:
        existing.user_id = user.id
        existing.platform = platform
    session.flush()
    return {"ok": True}


@router.delete("/push-tokens")
def remove_push_token(
    body: PushTokenIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    token = body.token.strip()
    row = session.scalar(select(PushToken).where(PushToken.token == token, PushToken.user_id == user.id))
    if row is not None:
        session.delete(row)
        session.flush()
    return {"ok": True}


@router.post("/seeker/verify")
def verify_seeker(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    """Confirm the linked wallet holds a Seeker Genesis Token on mainnet.

    The wallet link already required a signature, so the address is one this
    account proved it controls. The mint is stored once. A later transfer of
    the same token does not create a second achievement.
    """
    wallet = linked_wallet(session, user.id)
    if wallet is None or not wallet.address:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Link a Solana wallet before checking for a Seeker.")
    rpc_url = (settings.solana_mainnet_rpc_url or "").strip()
    if not rpc_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Mainnet RPC is not configured.")
    try:
        mints = seeker_mints_for_owner(rpc_url, wallet.address)
    except SeekerRpcError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, exc.message) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The linked wallet address could not be checked.") from exc
    if not mints:
        return {
            "ok": True,
            "verified": False,
            "achievement": None,
            "message": "This linked wallet does not hold a Seeker Genesis Token.",
        }
    owned = {item.mint for item in mints}
    existing = list(session.scalars(select(SeekerClaim).where(SeekerClaim.user_id == user.id)))
    for row in existing:
        if row.mint_address in owned:
            return {
                "ok": True,
                "verified": True,
                "achievement": _achievement(row),
                "message": "Seeker achievement already on this account.",
            }
    for item in mints:
        claim = SeekerClaim(
            mint_address=item.mint,
            user_id=user.id,
            member_number=item.member_number,
            wallet_address=wallet.address,
        )
        try:
            with session.begin_nested():
                session.add(claim)
                session.flush()
                session.refresh(claim)
        except IntegrityError:
            continue
        return {
            "ok": True,
            "verified": True,
            "achievement": _achievement(claim),
            "message": "Seeker Genesis Token verified on mainnet.",
        }
    return {
        "ok": True,
        "verified": True,
        "achievement": None,
        "message": "This Seeker already has the achievement on another ExamsPrep account.",
    }


@router.get("/seeker")
def seeker_status(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    rows = list(session.scalars(select(SeekerClaim).where(SeekerClaim.user_id == user.id)))
    return {"ok": True, "items": [_achievement(row) for row in rows]}


def _achievement(row: SeekerClaim) -> dict:
    return {
        "kind": "seeker_genesis",
        "mint": row.mint_address,
        "memberNumber": row.member_number,
        "wallet": row.wallet_address,
        "awardedAt": row.created_at.isoformat() if row.created_at else None,
    }
