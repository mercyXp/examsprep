from __future__ import annotations

import uuid
from datetime import date, time

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ExamType(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "exam_types"

    slug: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")


class AcademicPeriod(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "academic_periods"
    __table_args__ = (CheckConstraint("semester_number BETWEEN 1 AND 2", name="academic_period_semester_range"),)

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(32), nullable=False)
    semester_number: Mapped[int] = mapped_column(Integer, nullable=False)
    window_start: Mapped[date] = mapped_column(Date, nullable=False)
    window_end: Mapped[date] = mapped_column(Date, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    program_schedules: Mapped[list[ProgramExamSchedule]] = relationship(
        back_populates="period",
        cascade="all, delete-orphan",
    )
    module_slots: Mapped[list[ModuleExamSlot]] = relationship(
        back_populates="period",
        cascade="all, delete-orphan",
    )


class ProgramExamSchedule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "program_exam_schedules"
    __table_args__ = (
        UniqueConstraint("period_id", "programme_id", "exam_type_id", name="uq_program_exam_period_programme_type"),
    )

    period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("academic_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    programme_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("programmes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    admins_can_edit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    period: Mapped[AcademicPeriod] = relationship(back_populates="program_schedules")
    programme: Mapped["Programme"] = relationship()
    exam_type: Mapped[ExamType] = relationship()


class ModuleExamSlot(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "module_exam_slots"
    __table_args__ = (UniqueConstraint("period_id", "module_id", "exam_type_id", name="uq_module_exam_period_module_type"),)

    period_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("academic_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exam_type_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exam_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    exam_time: Mapped[time | None] = mapped_column(Time, nullable=True)

    period: Mapped[AcademicPeriod] = relationship(back_populates="module_slots")
    module: Mapped["Module"] = relationship()
    exam_type: Mapped[ExamType] = relationship()
