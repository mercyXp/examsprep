"""Staff invitation tokens.

Revision ID: 20261022_0013
Revises: 20261022_0012
Create Date: 2026-10-22

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261022_0013"
down_revision: str | None = "20261022_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "staff_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("role_slug", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("invited_by_id", sa.Uuid(), nullable=True),
        sa.Column("accepted_user_id", sa.Uuid(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_staff_invitations_email", "staff_invitations", ["email"])


def downgrade() -> None:
    op.drop_index("ix_staff_invitations_email", table_name="staff_invitations")
    op.drop_table("staff_invitations")
