from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.catalogue import Programme
from app.models.content import Lesson, LessonVersion, QuestionVersion, Quiz, QuizVersion
from app.models.enums import BookmarkTarget, EnrolmentStatus, bookmark_target_enum, enrolment_status_enum
from app.models.identity import User
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Enrolment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "enrolments"
    __table_args__ = (UniqueConstraint("user_id", "programme_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    programme_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programmes.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[EnrolmentStatus] = mapped_column(
        enrolment_status_enum,
        nullable=False,
        default=EnrolmentStatus.ENROLLED,
        server_default=EnrolmentStatus.ENROLLED.value,
    )

    user: Mapped[User] = relationship()
    programme: Mapped[Programme] = relationship()


class LessonProgress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lesson_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    last_viewed_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lesson_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_slide_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    revealed_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    check_results: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb"))

    user: Mapped[User] = relationship()
    lesson: Mapped[Lesson] = relationship()
    last_viewed_version: Mapped[LessonVersion | None] = relationship()


class Bookmark(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    target_type: Mapped[BookmarkTarget] = mapped_column(
        bookmark_target_enum,
        nullable=False,
    )
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)

    user: Mapped[User] = relationship()


class QuizAttempt(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "quiz_attempts"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    quiz_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="RESTRICT"), nullable=False)
    quiz_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score_percent: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    passed: Mapped[bool | None] = mapped_column(nullable=True)
    timed_out: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    user: Mapped[User] = relationship()
    quiz: Mapped[Quiz] = relationship()
    quiz_version: Mapped[QuizVersion] = relationship()
    answers: Mapped[list[AttemptAnswer]] = relationship(
        back_populates="attempt",
        cascade="all, delete-orphan",
    )


class AttemptAnswer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "attempt_answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_version_id"),)

    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_attempts.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("question_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    selected_option_ids: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    response_text: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    is_correct: Mapped[bool | None] = mapped_column(nullable=True)
    points_awarded: Mapped[int | None] = mapped_column(Integer, nullable=True)

    attempt: Mapped[QuizAttempt] = relationship(back_populates="answers")
    question_version: Mapped[QuestionVersion] = relationship()
