"""Phone sync receipts, push tokens, notification preferences, and Seeker claims.

Sync receipts make a retried offline upload return the first result.
Seeker claims record the Genesis Token mint, which is the device, not the wallet.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class SyncReceipt(TimestampMixin, Base):
    __tablename__ = "sync_receipts"
    __table_args__ = (UniqueConstraint("user_id", "scope", "idempotency_key"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scope: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(80), nullable=False)
    response_json: Mapped[dict] = mapped_column(JSONB, nullable=False)


class PushToken(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "push_tokens"
    __table_args__ = (UniqueConstraint("token"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(256), nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False, default="android")


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    daily_study: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    streak_warning: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    exam_reminder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    new_lesson: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    achievement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    reward: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    leaderboard: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    daily_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=18, server_default="18")
    daily_minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SeekerClaim(TimestampMixin, Base):
    __tablename__ = "seeker_claims"

    mint_address: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    member_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    wallet_address: Mapped[str] = mapped_column(String(64), nullable=False)
