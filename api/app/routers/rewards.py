"""Wallet linking, badges, the public verify page, and prize pools.

Pool routes call assert_pool_admin. A creator or a student receives 403 even
if they guess the URL. Programme administrators only reach pools for a
programme they are assigned to.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.access import AccessScope, load_scope
from app.config import settings
from app.db import get_session
from app.models import User
from app.models.solana import BadgeAward, PrizePool
from app.security import require_admin, require_user
from app.solana.chain import chain_status, get_chain
from app.solana.gates import assert_rewards_viewer
from app.solana.service import (
    badge_out,
    claim_badge,
    claim_pool_reward,
    close_pool,
    create_pool,
    fund_pool,
    leaderboard_out,
    link_wallet,
    my_badges,
    pool_out,
    public_badges,
    settle_pool,
    start_challenge,
    unlink_wallet,
    wallet_out,
)

router = APIRouter(tags=["solana"])


class LinkIn(BaseModel):
    address: str = Field(min_length=32, max_length=64)
    signature: str = Field(min_length=64, max_length=200)


class ClaimIn(BaseModel):
    kind: str = Field(min_length=3, max_length=32)
    subject_key: str = Field(min_length=1, max_length=160)


class PoolIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    programme_id: uuid.UUID | None = None
    period_start: datetime
    period_end: datetime
    top_n: int = Field(default=3, ge=1, le=10)
    mint: str | None = None


class FundIn(BaseModel):
    amount: int = Field(gt=0)


def _scope(user: User = Depends(require_admin), session: Session = Depends(get_session)) -> AccessScope:
    return load_scope(session, user)


def _pool(session: Session, pool_id: uuid.UUID) -> PrizePool:
    pool = session.scalar(
        select(PrizePool).options(selectinload(PrizePool.payouts)).where(PrizePool.id == pool_id)
    )
    if pool is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prize pool not found.")
    return pool


@router.get("/api/solana/status")
def solana_status() -> dict:
    return chain_status()


@router.post("/api/wallet/challenge")
def wallet_challenge(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return start_challenge(session, user)


@router.post("/api/wallet/link")
def wallet_link(body: LinkIn, user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return link_wallet(session, user, body.address, body.signature)


@router.get("/api/wallet/me")
def wallet_me(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return wallet_out(session, user)


@router.delete("/api/wallet")
def wallet_delete(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return unlink_wallet(session, user)


@router.get("/api/badges/me")
def badges_me(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return my_badges(session, user)


@router.get("/api/badges/eligibility")
def badges_eligibility(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    payload = my_badges(session, user)
    return {"ok": True, "claimable": payload["claimable"], "badges": payload["badges"]}


@router.post("/api/badges/claim")
def badges_claim(body: ClaimIn, user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict:
    return claim_badge(session, user, body.kind, body.subject_key, get_chain())


@router.get("/api/badges/verify/{wallet}")
def badges_verify(wallet: str, session: Session = Depends(get_session)) -> dict:
    return public_badges(session, wallet)


@router.get("/api/leaderboard")
def leaderboard(
    days: int = 7,
    programme_id: uuid.UUID | None = None,
    _user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    window = min(max(days, 1), 31)
    end = datetime.now(UTC)
    start = end - timedelta(days=window)
    return leaderboard_out(session, start, end, programme_id, limit=20)


def _badge_row(award: BadgeAward) -> dict:
    try:
        item = badge_out(award)
    except ValueError:
        item = {
            "id": str(award.id),
            "kind": award.kind,
            "subjectKey": award.subject_key,
            "label": award.subject_label,
            "detail": award.detail,
            "tx": award.tx_signature,
            "awardedAt": award.created_at.isoformat() if award.created_at else None,
        }
    item["student"] = award.user.name if award.user else ""
    item["email"] = award.user.email if award.user else ""
    return item


@router.get("/api/admin/rewards")
def admin_rewards(
    scope: AccessScope = Depends(_scope),
    session: Session = Depends(get_session),
) -> dict:
    """Pools and badge awards for super administrators and programme administrators."""
    assert_rewards_viewer(scope)
    pools = list(
        session.scalars(
            select(PrizePool)
            .options(selectinload(PrizePool.payouts), selectinload(PrizePool.programme))
            .order_by(PrizePool.period_end.desc())
        ).unique()
    )
    if not scope.super_admin:
        pools = [pool for pool in pools if pool.programme_id in scope.programme_ids]
    awards = list(
        session.scalars(
            select(BadgeAward).options(joinedload(BadgeAward.user)).order_by(BadgeAward.created_at.desc())
        ).unique()
    )
    pool_items = []
    for pool in pools:
        item = pool_out(pool)
        item["programmeName"] = pool.programme.name if pool.programme else "All programmes"
        pool_items.append(item)
    return {"ok": True, "pools": pool_items, "badges": [_badge_row(award) for award in awards]}


@router.get("/api/pools")
def list_pools(session: Session = Depends(get_session)) -> dict:
    pools = list(
        session.scalars(
            select(PrizePool).options(selectinload(PrizePool.payouts)).order_by(PrizePool.period_end.desc())
        ).unique()
    )
    return {"ok": True, "items": [pool_out(pool) for pool in pools]}


@router.post("/api/admin/pools")
def admin_create_pool(
    body: PoolIn,
    scope: AccessScope = Depends(_scope),
    session: Session = Depends(get_session),
) -> dict:
    mint = (body.mint or settings.solana_usdc_mint).strip()
    pool = create_pool(
        session,
        scope,
        title=body.title,
        programme_id=body.programme_id,
        period_start=body.period_start,
        period_end=body.period_end,
        top_n=body.top_n,
        mint=mint,
        chain=get_chain(),
    )
    return {"ok": True, "pool": pool_out(pool)}


@router.post("/api/admin/pools/{pool_id}/fund")
def admin_fund_pool(
    pool_id: uuid.UUID,
    body: FundIn,
    scope: AccessScope = Depends(_scope),
    session: Session = Depends(get_session),
) -> dict:
    pool = fund_pool(session, scope, _pool(session, pool_id), body.amount, get_chain())
    return {"ok": True, "pool": pool_out(pool)}


@router.post("/api/pools/{pool_id}/claim")
def pool_claim(
    pool_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict:
    return claim_pool_reward(session, user, _pool(session, pool_id), get_chain())


@router.post("/api/admin/pools/{pool_id}/settle")
def admin_settle_pool(
    pool_id: uuid.UUID,
    scope: AccessScope = Depends(_scope),
    session: Session = Depends(get_session),
) -> dict:
    pool = settle_pool(session, scope, _pool(session, pool_id), get_chain())
    return {"ok": True, "pool": pool_out(pool)}


@router.post("/api/admin/pools/{pool_id}/close")
def admin_close_pool(
    pool_id: uuid.UUID,
    scope: AccessScope = Depends(_scope),
    session: Session = Depends(get_session),
) -> dict:
    pool = close_pool(session, scope, _pool(session, pool_id), get_chain())
    return {"ok": True, "pool": pool_out(pool)}
