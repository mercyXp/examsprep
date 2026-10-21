"""Academic periods, program exam windows, and module timetable.

Revision ID: 20261021_0008
Revises: 20261021_0007
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261021_0008"
down_revision: str | None = "20261021_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "academic_periods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("academic_year", sa.String(length=32), nullable=False),
        sa.Column("semester_number", sa.Integer(), nullable=False),
        sa.Column("window_start", sa.Date(), nullable=False),
        sa.Column("window_end", sa.Date(), nullable=False),
        sa.Column("is_current", sa.Boolean(), server_default="false", nullable=False),
        sa.CheckConstraint("semester_number BETWEEN 1 AND 2", name="academic_period_semester_range"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "program_exam_schedules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=False),
        sa.Column("programme_id", sa.Uuid(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("admins_can_edit", sa.Boolean(), server_default="false", nullable=False),
        sa.ForeignKeyConstraint(["period_id"], ["academic_periods.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_id", "programme_id", name="uq_program_exam_period_programme"),
    )
    op.create_index("ix_program_exam_schedules_period_id", "program_exam_schedules", ["period_id"])
    op.create_index("ix_program_exam_schedules_programme_id", "program_exam_schedules", ["programme_id"])
    op.create_table(
        "module_exam_slots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("exam_time", sa.Time(), nullable=True),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["period_id"], ["academic_periods.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_id", "module_id", name="uq_module_exam_period_module"),
    )
    op.create_index("ix_module_exam_slots_period_id", "module_exam_slots", ["period_id"])
    op.create_index("ix_module_exam_slots_module_id", "module_exam_slots", ["module_id"])
    op.execute(
        """
        INSERT INTO academic_periods (id, name, academic_year, semester_number, window_start, window_end, is_current)
        SELECT
            COALESCE(academic_calendars.id, gen_random_uuid()),
            'November 2026 examinations',
            academic_calendars.academic_year,
            academic_calendars.semester_number,
            DATE '2026-11-16',
            DATE '2026-11-27',
            TRUE
        FROM academic_calendars
        """
    )
    op.drop_table("academic_calendars")


def downgrade() -> None:
    op.create_table(
        "academic_calendars",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("academic_year", sa.String(length=32), nullable=False),
        sa.Column("semester_number", sa.Integer(), nullable=False),
        sa.Column("exam_dates", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.drop_table("module_exam_slots")
    op.drop_table("program_exam_schedules")
    op.drop_table("academic_periods")
