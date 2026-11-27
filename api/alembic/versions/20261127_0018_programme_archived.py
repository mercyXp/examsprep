"""Allow a programme to be archived.

Revision ID: 20261127_0018
Revises: 20261127_0017
Create Date: 2026-11-27

"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261127_0018"
down_revision: str | None = "20261127_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ADD VALUE cannot always run inside the migration transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE programme_status ADD VALUE IF NOT EXISTS 'archived'")


def downgrade() -> None:
    # PostgreSQL has no way to drop a single enum label while rows may use it.
    pass
