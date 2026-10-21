from __future__ import annotations

import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.catalogue import Chapter, Module, Topic
from app.models.enums import (
    ContentStatus,
    QuizKind,
    ResourceKind,
    ReviewDecision,
    VersionStatus,
    content_status_enum,
    quiz_kind_enum,
    resource_kind_enum,
    review_decision_enum,
    version_status_enum,
)
from app.models.identity import User
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Lesson(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("module_id", "position", name="uq_lessons_module_position", deferrable=True, initially="DEFERRED"),
    )

    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    chapter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"), nullable=True)
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    objectives: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[ContentStatus] = mapped_column(
        content_status_enum,
        nullable=False,
        default=ContentStatus.DRAFT,
        server_default=ContentStatus.DRAFT.value,
    )
    published_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("lesson_versions.id", use_alter=True, name="fk_lessons_published_version_id"),
        nullable=True,
    )

    module: Mapped[Module] = relationship(back_populates="lessons")
    chapter: Mapped[Chapter | None] = relationship(back_populates="lessons")
    creator: Mapped[User] = relationship(foreign_keys=[creator_id])
    versions: Mapped[list[LessonVersion]] = relationship(
        back_populates="lesson",
        cascade="all, delete-orphan",
        foreign_keys="LessonVersion.lesson_id",
        order_by="LessonVersion.version_number",
    )
    published_version: Mapped[LessonVersion | None] = relationship(
        foreign_keys=[published_version_id],
        post_update=True,
    )


class LessonVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "lesson_versions"
    __table_args__ = (UniqueConstraint("lesson_id", "version_number"),)

    lesson_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    slides: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    attachments: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[VersionStatus] = mapped_column(
        version_status_enum,
        nullable=False,
        default=VersionStatus.DRAFT,
        server_default=VersionStatus.DRAFT.value,
    )

    lesson: Mapped[Lesson] = relationship(
        back_populates="versions",
        foreign_keys=[lesson_id],
    )
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    reviews: Mapped[list[ContentReview]] = relationship(
        back_populates="lesson_version",
        cascade="all, delete-orphan",
    )


class Question(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "questions"

    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[ContentStatus] = mapped_column(
        content_status_enum,
        nullable=False,
        default=ContentStatus.DRAFT,
        server_default=ContentStatus.DRAFT.value,
    )
    published_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("question_versions.id", use_alter=True, name="fk_questions_published_version_id"),
        nullable=True,
    )

    module: Mapped[Module] = relationship(back_populates="questions")
    creator: Mapped[User] = relationship(foreign_keys=[creator_id])
    versions: Mapped[list[QuestionVersion]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        foreign_keys="QuestionVersion.question_id",
        order_by="QuestionVersion.version_number",
    )
    published_version: Mapped[QuestionVersion | None] = relationship(
        foreign_keys=[published_version_id],
        post_update=True,
    )


class QuestionVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "question_versions"
    __table_args__ = (UniqueConstraint("question_id", "version_number"),)

    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    choices: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    correct_option_ids: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    explanation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[VersionStatus] = mapped_column(
        version_status_enum,
        nullable=False,
        default=VersionStatus.DRAFT,
        server_default=VersionStatus.DRAFT.value,
    )

    question: Mapped[Question] = relationship(back_populates="versions", foreign_keys=[question_id])
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    reviews: Mapped[list[ContentReview]] = relationship(
        back_populates="question_version",
        cascade="all, delete-orphan",
    )


class Quiz(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "quizzes"

    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[QuizKind] = mapped_column(
        quiz_kind_enum,
        nullable=False,
        default=QuizKind.PRACTICE,
        server_default=QuizKind.PRACTICE.value,
    )
    status: Mapped[ContentStatus] = mapped_column(
        content_status_enum,
        nullable=False,
        default=ContentStatus.DRAFT,
        server_default=ContentStatus.DRAFT.value,
    )
    published_version_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("quiz_versions.id", use_alter=True, name="fk_quizzes_published_version_id"),
        nullable=True,
    )

    module: Mapped[Module] = relationship(back_populates="quizzes")
    creator: Mapped[User] = relationship(foreign_keys=[creator_id])
    versions: Mapped[list[QuizVersion]] = relationship(
        back_populates="quiz",
        cascade="all, delete-orphan",
        foreign_keys="QuizVersion.quiz_id",
        order_by="QuizVersion.version_number",
    )
    published_version: Mapped[QuizVersion | None] = relationship(
        foreign_keys=[published_version_id],
        post_update=True,
    )


class QuizVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "quiz_versions"
    __table_args__ = (UniqueConstraint("quiz_id", "version_number"),)

    quiz_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pass_mark_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[VersionStatus] = mapped_column(
        version_status_enum,
        nullable=False,
        default=VersionStatus.DRAFT,
        server_default=VersionStatus.DRAFT.value,
    )

    quiz: Mapped[Quiz] = relationship(back_populates="versions", foreign_keys=[quiz_id])
    author: Mapped[User] = relationship(foreign_keys=[author_id])
    questions: Mapped[list[QuizVersionQuestion]] = relationship(
        back_populates="quiz_version",
        cascade="all, delete-orphan",
        order_by="QuizVersionQuestion.position",
    )
    reviews: Mapped[list[ContentReview]] = relationship(
        back_populates="quiz_version",
        cascade="all, delete-orphan",
    )


class QuizVersionQuestion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "quiz_version_questions"
    __table_args__ = (
        UniqueConstraint("quiz_version_id", "position", name="uq_quiz_version_questions_position"),
        UniqueConstraint(
            "quiz_version_id",
            "question_version_id",
            name="uq_quiz_version_questions_question",
        ),
    )

    quiz_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    question_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("question_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")

    quiz_version: Mapped[QuizVersion] = relationship(back_populates="questions")
    question_version: Mapped[QuestionVersion] = relationship()


class ContentReview(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "content_reviews"
    __table_args__ = (
        CheckConstraint(
            "(lesson_version_id IS NOT NULL)::int + "
            "(question_version_id IS NOT NULL)::int + "
            "(quiz_version_id IS NOT NULL)::int = 1",
            name="one_review_target",
        ),
    )

    lesson_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("lesson_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    question_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("question_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    quiz_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("quiz_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    decision: Mapped[ReviewDecision] = mapped_column(review_decision_enum, nullable=False)
    feedback: Mapped[str] = mapped_column(Text, nullable=False, default="")

    lesson_version: Mapped[LessonVersion | None] = relationship(back_populates="reviews")
    question_version: Mapped[QuestionVersion | None] = relationship(back_populates="reviews")
    quiz_version: Mapped[QuizVersion | None] = relationship(back_populates="reviews")
    reviewer: Mapped[User] = relationship(foreign_keys=[reviewer_id])


class Resource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "resources"

    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("topics.id", ondelete="SET NULL"), nullable=True)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[ResourceKind] = mapped_column(resource_kind_enum, nullable=False)
    object_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    module: Mapped[Module] = relationship(back_populates="resources")
    topic: Mapped[Topic | None] = relationship(back_populates="resources")
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
