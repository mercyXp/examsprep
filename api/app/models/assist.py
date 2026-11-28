"""Research jobs, generated audio, snap photos, practice, and tutor turns.

These rows are not official exam content. Research imports land in the lesson
and question editors as drafts. Practice rows stay in their own tables.
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ExtractionJob(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "extraction_jobs"

    programme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False, default="article")
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="scrape")
    urls: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    url_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    error: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="firecrawl")
    crawl_id: Mapped[str] = mapped_column(String(80), nullable=False, default="", server_default="")
    pages: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    structured: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    proposal: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    proposal_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    proposal_message: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    imported_lesson_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    imported_question_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    imported_chapter_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )


class AudioAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Cached speech audio. Bytes live in Postgres so a Render restart keeps them."""

    __tablename__ = "audio_assets"
    __table_args__ = (
        UniqueConstraint(
            "owner_kind",
            "owner_key",
            "content_hash",
            "voice_id",
            name="uq_audio_assets_cache",
        ),
    )

    owner_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    owner_key: Mapped[str] = mapped_column(String(220), nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    voice_id: Mapped[str] = mapped_column(String(80), nullable=False)
    mime: Mapped[str] = mapped_column(String(40), nullable=False, default="audio/mpeg")
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    truncated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    character_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    access: Mapped[str] = mapped_column(String(32), nullable=False, default="private")
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)


class TutorSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tutor_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"), nullable=True)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)


class TutorTurn(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tutor_turns"

    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tutor_sessions.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    audio_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("audio_assets.id", ondelete="SET NULL"),
        nullable=True,
    )


class SnappedQuestion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "snapped_questions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    mime: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    image: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="saved")
    subject: Mapped[str] = mapped_column(String(120), nullable=False, default="", server_default="")
    topic: Mapped[str] = mapped_column(String(180), nullable=False, default="", server_default="")
    question_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    concept: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    steps: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    final_answer: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    similar: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))
    followups: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    message: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")


class PracticeQuestion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Personal practice. These rows are never copied into the official question bank."""

    __tablename__ = "practice_questions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True)
    topic: Mapped[str] = mapped_column(String(180), nullable=False, default="", server_default="")
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="mcq")
    difficulty: Mapped[str] = mapped_column(String(32), nullable=False, default="standard")
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    choices: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    correct_option_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    accepted_answers: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    explanation: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    model_answer: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="ai_practice", server_default="ai_practice")


class PracticeAttempt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "practice_attempts"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("practice_questions.id", ondelete="CASCADE"),
        nullable=False,
    )
    answer_text: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    selected_option_ids: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    feedback: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
