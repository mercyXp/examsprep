from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.identity import User
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Announcement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="general", server_default="general", index=True)
    audience_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="all", server_default="all")
    programme_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    module_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    year_of_study: Mapped[int | None] = mapped_column(Integer, nullable=True)
    semester_of_study: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="normal", server_default="normal")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", server_default="draft", index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    publish_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    link_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    link_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    published_by: Mapped[User | None] = relationship(foreign_keys=[published_by_id])


class AnnouncementRead(Base):
    __tablename__ = "announcement_reads"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_announcement_read_user"),)

    announcement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("announcements.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
