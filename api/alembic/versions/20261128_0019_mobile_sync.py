"""Phone sync receipts, push tokens, notification preferences, Seeker claims.

Revision ID: 20261128_0019
Revises: 20261127_0018
Create Date: 2026-11-28

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261128_0019"
down_revision: str | None = "20261127_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sync_receipts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=80), nullable=False),
        sa.Column("response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "scope", "idempotency_key", name="uq_sync_receipts_user_scope_key"),
    )
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token", sa.String(length=256), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_push_tokens_user_id", "push_tokens", ["user_id"])
    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("daily_study", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("streak_warning", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("exam_reminder", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("new_lesson", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("achievement", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("reward", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("leaderboard", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("daily_hour", sa.Integer(), server_default="18", nullable=False),
        sa.Column("daily_minute", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_table(
        "seeker_claims",
        sa.Column("mint_address", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("member_number", sa.BigInteger(), nullable=False),
        sa.Column("wallet_address", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("mint_address"),
    )
    op.create_index("ix_seeker_claims_user_id", "seeker_claims", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_seeker_claims_user_id", table_name="seeker_claims")
    op.drop_table("seeker_claims")
    op.drop_table("notification_preferences")
    op.drop_index("ix_push_tokens_user_id", table_name="push_tokens")
    op.drop_table("push_tokens")
    op.drop_table("sync_receipts")
