"""ExamSprint sessions and achievements. Separate from quizzes and the reward program."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

JsonDoc = JSON().with_variant(JSONB(), "postgresql")


class SprintSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sprint_sessions"
    __table_args__ = (Index("ix_sprint_sessions_leaderboard", "status", "score"),)

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )
    player_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    player_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    display_name: Mapped[str] = mapped_column(String(80), nullable=False)
    agent_key_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    subject_id: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_name: Mapped[str] = mapped_column(String(180), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="playing")
    phase: Mapped[str] = mapped_column(String(16), nullable=False, default="question")
    outcome: Mapped[str] = mapped_column(String(16), nullable=False, default="")
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    speed_bonus: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    best_streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moves: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    question_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    question_started_ms: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    round_size: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    limit_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=15000)
    last_move_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    deck: Mapped[list] = mapped_column(JsonDoc, nullable=False)
    answers: Mapped[list] = mapped_column(JsonDoc, nullable=False, default=list)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SprintAchievement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "sprint_achievements"
    __table_args__ = (UniqueConstraint("player_key", "code", name="uq_sprint_achievements_player_code"),)

    player_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sprint_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
