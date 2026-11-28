"""Academic calendar settings and session token version.

Revision ID: 20261021_0007
Revises: 20261021_0006
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261021_0007"
down_revision: str | None = "20261021_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "token_version" not in user_columns:
        op.add_column(
            "users",
            sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
        )
    if "academic_calendars" in inspector.get_table_names():
        return
    op.create_table(
        "academic_calendars",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("academic_year", sa.String(length=32), nullable=False),
        sa.Column("semester_number", sa.Integer(), nullable=False),
        sa.Column(
            "exam_dates",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.CheckConstraint("semester_number BETWEEN 1 AND 2", name="academic_calendar_semester_range"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        """
        INSERT INTO academic_calendars (id, academic_year, semester_number, exam_dates)
        SELECT gen_random_uuid(), '2026/2027', 2, '["2026-11-23"]'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM academic_calendars)
        """
    )


def downgrade() -> None:
    op.drop_table("academic_calendars")
    op.drop_column("users", "token_version")
