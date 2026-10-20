"""Student onboarding profiles.

Revision ID: 20261020_0002
Revises: 20261020_0001
Create Date: 2026-10-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261020_0002"
down_revision: str | None = "20261020_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "student_profiles",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("university", sa.String(length=160), nullable=True),
        sa.Column("programme", sa.String(length=160), nullable=True),
        sa.Column("year_of_study", sa.Integer(), nullable=True),
        sa.Column("exam_date", sa.Date(), nullable=False, server_default="2026-11-23"),
        sa.Column("daily_goal_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("pace", sa.String(length=16), nullable=False, server_default="balanced"),
        sa.Column(
            "study_days",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "module_codes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("onboarding_step", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("student_profiles")
