"""Wallet links, badge receipts, and prize pools.

The chain is the source of truth for whether a badge or a payout exists.
These rows are the app's copy: they remember the human-readable subject
(the chain only stores a hash) and the transaction signature.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.catalogue import Programme
from app.models.identity import User
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class WalletLink(TimestampMixin, Base):
    __tablename__ = "wallet_links"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Base58 Solana address. Empty until the signed challenge is accepted.
    address: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    challenge_nonce: Mapped[str | None] = mapped_column(String(80), nullable=True)
    challenge_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()


class BadgeAward(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "badge_awards"
    __table_args__ = (UniqueConstraint("user_id", "kind", "subject_key"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    wallet_address: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_key: Mapped[str] = mapped_column(String(160), nullable=False)
    subject_label: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    detail: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    tx_signature: Mapped[str | None] = mapped_column(String(128), nullable=True)

    user: Mapped[User] = relationship()


class PrizePool(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "prize_pools"

    programme_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("programmes.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    top_n: Mapped[int] = mapped_column(Integer, nullable=False)
    mint: Mapped[str] = mapped_column(String(64), nullable=False)
    onchain_pool_id: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    pool_address: Mapped[str] = mapped_column(String(64), nullable=False)
    vault_address: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", server_default="open")
    sponsor_wallet: Mapped[str | None] = mapped_column(String(64), nullable=True)
    total_amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    create_tx: Mapped[str | None] = mapped_column(String(128), nullable=True)
    fund_tx: Mapped[str | None] = mapped_column(String(128), nullable=True)
    settle_tx: Mapped[str | None] = mapped_column(String(128), nullable=True)

    programme: Mapped[Programme | None] = relationship()
    created_by: Mapped[User] = relationship()
    payouts: Mapped[list[PrizePayout]] = relationship(back_populates="pool", cascade="all, delete-orphan")


class PrizePayout(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "prize_payouts"
    __table_args__ = (UniqueConstraint("pool_id", "user_id"),)

    pool_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("prize_pools.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    wallet_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tx_signature: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str] = mapped_column(String(200), nullable=False, default="", server_default="")

    pool: Mapped[PrizePool] = relationship(back_populates="payouts")
    user: Mapped[User] = relationship()
