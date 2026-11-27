"""Question bank fields, past papers, and reusable games.

Revision ID: 20261127_0016
Revises: 20261022_0015
Create Date: 2026-11-27

Fresh databases create these from the models in the initial migration.
This revision adds them when an older database is upgraded.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261127_0016"
down_revision: str | None = "20261022_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    tables = _tables()
    if "past_papers" not in tables:
        op.create_table(
            "past_papers",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("module_id", sa.Uuid(), nullable=False),
            sa.Column("uploaded_by_id", sa.Uuid(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("original_filename", sa.String(length=200), nullable=False, server_default=""),
            sa.Column("year", sa.Integer(), nullable=True),
            sa.Column("storage_key", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("status", postgresql.ENUM(name="content_status", create_type=False), nullable=False, server_default="DRAFT"),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="RESTRICT"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_past_papers_module_id", "past_papers", ["module_id"])

    if "reusable_games" not in tables:
        op.create_table(
            "reusable_games",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("module_id", sa.Uuid(), nullable=False),
            sa.Column("creator_id", sa.Uuid(), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False),
            sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("status", postgresql.ENUM(name="content_status", create_type=False), nullable=False, server_default="DRAFT"),
            sa.ForeignKeyConstraint(["creator_id"], ["users.id"], ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_reusable_games_module_id", "reusable_games", ["module_id"])

    question_columns = _columns("questions") if "questions" in _tables() else set()
    if "topic_id" not in question_columns:
        op.add_column("questions", sa.Column("topic_id", sa.Uuid(), nullable=True))
        op.create_foreign_key("fk_questions_topic_id_topics", "questions", "topics", ["topic_id"], ["id"], ondelete="SET NULL")
    if "past_paper_id" not in question_columns:
        op.add_column("questions", sa.Column("past_paper_id", sa.Uuid(), nullable=True))
        op.create_foreign_key(
            "fk_questions_past_paper_id_past_papers",
            "questions",
            "past_papers",
            ["past_paper_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "kind" not in question_columns:
        op.add_column("questions", sa.Column("kind", sa.String(length=32), nullable=False, server_default="mcq"))
    if "source" not in question_columns:
        op.add_column("questions", sa.Column("source", sa.String(length=32), nullable=False, server_default="manual"))
    if "paper_label" not in question_columns:
        op.add_column("questions", sa.Column("paper_label", sa.String(length=80), nullable=False, server_default=""))

    version_columns = _columns("question_versions") if "question_versions" in _tables() else set()
    if "model_answer" not in version_columns:
        op.add_column("question_versions", sa.Column("model_answer", sa.Text(), nullable=False, server_default=""))
    if "accepted_answers" not in version_columns:
        op.add_column(
            "question_versions",
            sa.Column(
                "accepted_answers",
                postgresql.JSONB(astext_type=sa.Text()),
                nullable=False,
                server_default=sa.text("'[]'::jsonb"),
            ),
        )


def downgrade() -> None:
    tables = _tables()
    if "question_versions" in tables:
        columns = _columns("question_versions")
        if "accepted_answers" in columns:
            op.drop_column("question_versions", "accepted_answers")
        if "model_answer" in columns:
            op.drop_column("question_versions", "model_answer")
    if "questions" in tables:
        columns = _columns("questions")
        if "past_paper_id" in columns:
            op.drop_constraint("fk_questions_past_paper_id_past_papers", "questions", type_="foreignkey")
            op.drop_column("questions", "past_paper_id")
        if "topic_id" in columns:
            op.drop_constraint("fk_questions_topic_id_topics", "questions", type_="foreignkey")
            op.drop_column("questions", "topic_id")
        if "paper_label" in columns:
            op.drop_column("questions", "paper_label")
        if "source" in columns:
            op.drop_column("questions", "source")
        if "kind" in columns:
            op.drop_column("questions", "kind")
    if "reusable_games" in tables:
        op.drop_index("ix_reusable_games_module_id", table_name="reusable_games")
        op.drop_table("reusable_games")
    if "past_papers" in tables:
        op.drop_index("ix_past_papers_module_id", table_name="past_papers")
        op.drop_table("past_papers")
