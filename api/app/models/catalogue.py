from __future__ import annotations

import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import ContentStatus, ProgrammeStatus, content_status_enum, programme_status_enum
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class Programme(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "programmes"

    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[ProgrammeStatus] = mapped_column(
        programme_status_enum,
        nullable=False,
        default=ProgrammeStatus.COMING_SOON,
        server_default=ProgrammeStatus.COMING_SOON.value,
    )
    duration_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    blurb: Mapped[str] = mapped_column(Text, nullable=False, default="")

    years: Mapped[list[AcademicYear]] = relationship(
        back_populates="programme",
        cascade="all, delete-orphan",
        order_by="AcademicYear.year_number",
    )


class AcademicYear(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "academic_years"
    __table_args__ = (
        UniqueConstraint("programme_id", "year_number"),
        CheckConstraint("year_number BETWEEN 1 AND 4", name="year_number_range"),
    )

    programme_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programmes.id", ondelete="CASCADE"),
        nullable=False,
    )
    year_number: Mapped[int] = mapped_column(Integer, nullable=False)

    programme: Mapped[Programme] = relationship(back_populates="years")
    semesters: Mapped[list[Semester]] = relationship(
        back_populates="academic_year",
        cascade="all, delete-orphan",
        order_by="Semester.semester_number",
    )


class Semester(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "semesters"
    __table_args__ = (
        UniqueConstraint("academic_year_id", "semester_number"),
        CheckConstraint("semester_number BETWEEN 1 AND 2", name="semester_number_range"),
    )

    academic_year_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("academic_years.id", ondelete="CASCADE"),
        nullable=False,
    )
    semester_number: Mapped[int] = mapped_column(Integer, nullable=False)

    academic_year: Mapped[AcademicYear] = relationship(back_populates="semesters")
    modules: Mapped[list[Module]] = relationship(
        back_populates="semester",
        cascade="all, delete-orphan",
        order_by="Module.code",
    )


class Module(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "modules"
    __table_args__ = (UniqueConstraint("semester_id", "code"),)

    semester_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("semesters.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    objectives: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
    cover_color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[ContentStatus] = mapped_column(
        content_status_enum,
        nullable=False,
        default=ContentStatus.PUBLISHED,
        server_default=ContentStatus.PUBLISHED.value,
    )

    semester: Mapped[Semester] = relationship(back_populates="modules")
    topics: Mapped[list["Topic"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="module",
        cascade="all, delete-orphan",
        order_by="Chapter.position",
    )
    lessons: Mapped[list["Lesson"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    quizzes: Mapped[list["Quiz"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    questions: Mapped[list["Question"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    resources: Mapped[list["Resource"]] = relationship(back_populates="module", cascade="all, delete-orphan")


class Chapter(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chapters"
    __table_args__ = (
        UniqueConstraint("module_id", "position", name="uq_chapters_module_position", deferrable=True, initially="DEFERRED"),
    )

    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[ContentStatus] = mapped_column(
        content_status_enum,
        nullable=False,
        default=ContentStatus.DRAFT,
        server_default=ContentStatus.DRAFT.value,
    )

    module: Mapped[Module] = relationship(back_populates="chapters")
    lessons: Mapped[list["Lesson"]] = relationship(back_populates="chapter")


class Topic(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "topics"
    __table_args__ = (UniqueConstraint("module_id", "position"),)

    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    module: Mapped[Module] = relationship(back_populates="topics")
    resources: Mapped[list["Resource"]] = relationship(back_populates="topic")
