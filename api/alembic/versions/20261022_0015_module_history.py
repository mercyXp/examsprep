"""Remember modules a student has removed from their active selection.

Revision ID: 20261022_0015
Revises: 20261022_0014
Create Date: 2026-10-22

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261022_0015"
down_revision: str | None = "20261022_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("student_profiles")}
    if "module_history" in columns:
        return
    op.add_column(
        "student_profiles",
        sa.Column(
            "module_history",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("student_profiles", "module_history")
