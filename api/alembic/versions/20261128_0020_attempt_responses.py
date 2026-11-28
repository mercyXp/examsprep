"""Store written quiz answers and whether a timed attempt ran long.

Revision ID: 20261128_0020
Revises: 20261128_0019
Create Date: 2026-11-28

Fresh databases already create these columns from the models in the initial
migration. This revision adds them when an older database is upgraded.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261128_0020"
down_revision: str | None = "20261128_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if "response_text" not in _columns("attempt_answers"):
        op.add_column(
            "attempt_answers",
            sa.Column("response_text", sa.Text(), nullable=False, server_default=""),
        )
    if "timed_out" not in _columns("quiz_attempts"):
        op.add_column("quiz_attempts", sa.Column("timed_out", sa.Boolean(), nullable=True))


def downgrade() -> None:
    if "timed_out" in _columns("quiz_attempts"):
        op.drop_column("quiz_attempts", "timed_out")
    if "response_text" in _columns("attempt_answers"):
        op.drop_column("attempt_answers", "response_text")
