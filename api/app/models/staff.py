from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class StaffInvitation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A single-use invitation for a creator or administrator account."""

    __tablename__ = "staff_invitations"

    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role_slug: Mapped[str] = mapped_column(String(64), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    accepted_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
