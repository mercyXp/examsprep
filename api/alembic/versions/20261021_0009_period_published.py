"""Mark academic periods as draft or published.

Revision ID: 20261021_0009
Revises: 20261021_0008
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261021_0009"
down_revision: str | None = "20261021_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("academic_periods")}
    if "is_published" in columns:
        return
    op.add_column(
        "academic_periods",
        sa.Column("is_published", sa.Boolean(), server_default="false", nullable=False),
    )
    op.execute("UPDATE academic_periods SET is_published = TRUE")


def downgrade() -> None:
    op.drop_column("academic_periods", "is_published")
