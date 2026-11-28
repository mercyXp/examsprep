"""Store written quiz answers and whether a timed attempt ran long.

Revision ID: 20261128_0019
Revises: 20261127_0018
Create Date: 2026-11-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261128_0019"
down_revision: str | None = "20261127_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "attempt_answers",
        sa.Column("response_text", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column("quiz_attempts", sa.Column("timed_out", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("quiz_attempts", "timed_out")
    op.drop_column("attempt_answers", "response_text")
