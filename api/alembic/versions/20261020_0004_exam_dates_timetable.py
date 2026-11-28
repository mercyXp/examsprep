"""Add exam_dates and exam_timetable to student profiles.

Revision ID: 20261020_0004
Revises: 20261020_0003
Create Date: 2026-10-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261020_0004"
down_revision: str | None = "20261020_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("student_profiles")}
    if "exam_dates" in columns:
        return
    op.add_column(
        "student_profiles",
        sa.Column("exam_dates", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "student_profiles",
        sa.Column("exam_timetable", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )
    op.execute(
        """
        UPDATE student_profiles
        SET exam_dates = jsonb_build_array(to_char(exam_date, 'YYYY-MM-DD'))
        WHERE exam_date IS NOT NULL
          AND (exam_dates IS NULL OR exam_dates = '[]'::jsonb)
        """
    )


def downgrade() -> None:
    op.drop_column("student_profiles", "exam_timetable")
    op.drop_column("student_profiles", "exam_dates")
