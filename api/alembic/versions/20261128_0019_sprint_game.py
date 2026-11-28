"""ExamSprint sessions and achievements.

Revision ID: 20261128_0019
Revises: 20261127_0018
Create Date: 2026-11-28

These tables belong to the ExamSprint game. They do not change quizzes,
lessons, or the Solana reward tables.

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
        "sprint_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("player_key", sa.String(length=80), nullable=False),
        sa.Column("player_kind", sa.String(length=16), nullable=False),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("agent_key_hash", sa.String(length=64), nullable=True),
        sa.Column("subject_id", sa.String(length=64), nullable=False),
        sa.Column("subject_name", sa.String(length=180), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("phase", sa.String(length=16), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("speed_bonus", sa.Integer(), nullable=False),
        sa.Column("correct_count", sa.Integer(), nullable=False),
        sa.Column("streak", sa.Integer(), nullable=False),
        sa.Column("best_streak", sa.Integer(), nullable=False),
        sa.Column("moves", sa.Integer(), nullable=False),
        sa.Column("question_index", sa.Integer(), nullable=False),
        sa.Column("question_started_ms", sa.BigInteger(), nullable=False),
        sa.Column("round_size", sa.Integer(), nullable=False),
        sa.Column("limit_ms", sa.Integer(), nullable=False),
        sa.Column("last_move_id", sa.String(length=80), nullable=True),
        sa.Column("deck", postgresql.JSONB(), nullable=False),
        sa.Column("answers", postgresql.JSONB(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("agent_key_hash"),
    )
    op.create_index("ix_sprint_sessions_player_key", "sprint_sessions", ["player_key"])
    op.create_index("ix_sprint_sessions_leaderboard", "sprint_sessions", ["status", "score"])
    op.create_table(
        "sprint_achievements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("player_key", sa.String(length=80), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["sprint_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("player_key", "code", name="uq_sprint_achievements_player_code"),
    )
    op.create_index("ix_sprint_achievements_player_key", "sprint_achievements", ["player_key"])


def downgrade() -> None:
    op.drop_index("ix_sprint_achievements_player_key", table_name="sprint_achievements")
    op.drop_table("sprint_achievements")
    op.drop_index("ix_sprint_sessions_leaderboard", table_name="sprint_sessions")
    op.drop_index("ix_sprint_sessions_player_key", table_name="sprint_sessions")
    op.drop_table("sprint_sessions")
