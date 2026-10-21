"""Administrator announcements and student read state.

Revision ID: 20261021_0011
Revises: 20261021_0010
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261021_0011"
down_revision: str | None = "20261021_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=32), server_default="general", nullable=False),
        sa.Column("audience_kind", sa.String(length=32), server_default="all", nullable=False),
        sa.Column("programme_ids", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("module_ids", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("year_of_study", sa.Integer(), nullable=True),
        sa.Column("semester_of_study", sa.Integer(), nullable=True),
        sa.Column("priority", sa.String(length=16), server_default="normal", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("is_pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("publish_at", sa.Date(), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("link_kind", sa.String(length=32), nullable=True),
        sa.Column("link_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), nullable=False),
        sa.Column("published_by_id", sa.Uuid(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["published_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["link_id"], ["modules.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_announcements_kind", "announcements", ["kind"])
    op.create_index("ix_announcements_status", "announcements", ["status"])
    op.create_index("ix_announcements_created_by_id", "announcements", ["created_by_id"])
    op.create_table(
        "announcement_reads",
        sa.Column("announcement_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["announcement_id"], ["announcements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("announcement_id", "user_id"),
        sa.UniqueConstraint("announcement_id", "user_id", name="uq_announcement_read_user"),
    )


def downgrade() -> None:
    op.drop_table("announcement_reads")
    op.drop_index("ix_announcements_created_by_id", table_name="announcements")
    op.drop_index("ix_announcements_status", table_name="announcements")
    op.drop_index("ix_announcements_kind", table_name="announcements")
    op.drop_table("announcements")
