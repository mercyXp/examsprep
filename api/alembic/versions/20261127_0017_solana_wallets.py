"""Wallet links, badge receipts, and leaderboard prize pools.

Revision ID: 20261127_0017
Revises: 20261127_0016
Create Date: 2026-11-27

Production is already stamped at 20261127_0016 (the authoring-bank migration).
This revision keeps that id and follows it, so a database at 20261127_0016
upgrades by adding only the Solana tables.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261127_0017"
down_revision: str | None = "20261127_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "wallet_links" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "wallet_links",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("address", sa.String(length=64), nullable=True),
        sa.Column("challenge_nonce", sa.String(length=80), nullable=True),
        sa.Column("challenge_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint("address"),
    )
    op.create_table(
        "badge_awards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("wallet_address", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("subject_key", sa.String(length=160), nullable=False),
        sa.Column("subject_label", sa.String(length=200), nullable=False),
        sa.Column("detail", sa.Integer(), server_default="0", nullable=False),
        sa.Column("tx_signature", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "kind", "subject_key"),
    )
    op.create_index("ix_badge_awards_wallet_address", "badge_awards", ["wallet_address"])
    op.create_table(
        "prize_pools",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("programme_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("top_n", sa.Integer(), nullable=False),
        sa.Column("mint", sa.String(length=64), nullable=False),
        sa.Column("onchain_pool_id", sa.BigInteger(), nullable=False),
        sa.Column("pool_address", sa.String(length=64), nullable=False),
        sa.Column("vault_address", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="open", nullable=False),
        sa.Column("sponsor_wallet", sa.String(length=64), nullable=True),
        sa.Column("total_amount", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("create_tx", sa.String(length=128), nullable=True),
        sa.Column("fund_tx", sa.String(length=128), nullable=True),
        sa.Column("settle_tx", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("onchain_pool_id"),
    )
    op.create_table(
        "prize_payouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("pool_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=False),
        sa.Column("amount", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("wallet_address", sa.String(length=64), nullable=True),
        sa.Column("tx_signature", sa.String(length=128), nullable=True),
        sa.Column("note", sa.String(length=200), server_default="", nullable=False),
        sa.ForeignKeyConstraint(["pool_id"], ["prize_pools.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pool_id", "user_id"),
    )


def downgrade() -> None:
    op.drop_table("prize_payouts")
    op.drop_table("prize_pools")
    op.drop_index("ix_badge_awards_wallet_address", table_name="badge_awards")
    op.drop_table("badge_awards")
    op.drop_table("wallet_links")
