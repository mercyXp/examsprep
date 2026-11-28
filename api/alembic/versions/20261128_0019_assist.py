"""Research jobs, audio cache, snap photos, practice, and tutor history.

Revision ID: 20261128_0019
Revises: 20261127_0018
Create Date: 2026-11-28

Fresh databases already create these tables from the models in the initial
migration. This revision adds them when an older database is upgraded.

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "20261128_0019"
down_revision: str | None = "20261127_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "extraction_jobs" not in tables:
        op.create_table(
            "extraction_jobs",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("programme_id", sa.Uuid(), nullable=False),
            sa.Column("module_id", sa.Uuid(), nullable=False),
            sa.Column("created_by", sa.Uuid(), nullable=False),
            sa.Column("content_type", sa.String(length=32), nullable=False),
            sa.Column("mode", sa.String(length=16), nullable=False),
            sa.Column("urls", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("url_fingerprint", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("error", sa.Text(), nullable=False, server_default=""),
            sa.Column("note", sa.Text(), nullable=False, server_default=""),
            sa.Column("provider", sa.String(length=32), nullable=False),
            sa.Column("crawl_id", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("pages", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("structured", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("proposal", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("proposal_status", sa.String(length=32), nullable=False),
            sa.Column("proposal_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("duplicate_of", sa.Uuid(), nullable=True),
            sa.Column("imported_lesson_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("imported_question_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("imported_chapter_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], name="fk_extraction_jobs_created_by_users", ondelete="RESTRICT"),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], name="fk_extraction_jobs_module_id_modules", ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"], name="fk_extraction_jobs_programme_id_programmes", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_extraction_jobs"),
        )
        op.create_index("ix_extraction_jobs_module_id", "extraction_jobs", ["module_id"])
        op.create_index("ix_extraction_jobs_url_fingerprint", "extraction_jobs", ["url_fingerprint"])

    if "audio_assets" not in tables:
        op.create_table(
            "audio_assets",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("owner_kind", sa.String(length=40), nullable=False),
            sa.Column("owner_key", sa.String(length=220), nullable=False),
            sa.Column("content_hash", sa.String(length=64), nullable=False),
            sa.Column("voice_id", sa.String(length=80), nullable=False),
            sa.Column("mime", sa.String(length=40), nullable=False),
            sa.Column("byte_size", sa.Integer(), nullable=False),
            sa.Column("payload", sa.LargeBinary(), nullable=False),
            sa.Column("truncated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("character_count", sa.Integer(), nullable=False),
            sa.Column("access", sa.String(length=32), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_audio_assets_user_id_users", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_audio_assets"),
            sa.UniqueConstraint("owner_kind", "owner_key", "content_hash", "voice_id", name="uq_audio_assets_cache"),
        )

    if "tutor_sessions" not in tables:
        op.create_table(
            "tutor_sessions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("module_id", sa.Uuid(), nullable=True),
            sa.Column("lesson_id", sa.Uuid(), nullable=True),
            sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], name="fk_tutor_sessions_lesson_id_lessons", ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], name="fk_tutor_sessions_module_id_modules", ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_tutor_sessions_user_id_users", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_tutor_sessions"),
        )
        op.create_index("ix_tutor_sessions_user_id", "tutor_sessions", ["user_id"])

    if "tutor_turns" not in tables:
        op.create_table(
            "tutor_turns",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("session_id", sa.Uuid(), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("text", sa.Text(), nullable=False, server_default=""),
            sa.Column("audio_asset_id", sa.Uuid(), nullable=True),
            sa.ForeignKeyConstraint(["audio_asset_id"], ["audio_assets.id"], name="fk_tutor_turns_audio_asset_id_audio_assets", ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["session_id"], ["tutor_sessions.id"], name="fk_tutor_turns_session_id_tutor_sessions", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_tutor_turns"),
        )
        op.create_index("ix_tutor_turns_session_id", "tutor_turns", ["session_id"])

    if "snapped_questions" not in tables:
        op.create_table(
            "snapped_questions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("mime", sa.String(length=40), nullable=False),
            sa.Column("image", sa.LargeBinary(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("subject", sa.String(length=120), nullable=False, server_default=""),
            sa.Column("topic", sa.String(length=180), nullable=False, server_default=""),
            sa.Column("question_text", sa.Text(), nullable=False),
            sa.Column("concept", sa.Text(), nullable=False, server_default=""),
            sa.Column("steps", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("final_answer", sa.Text(), nullable=False, server_default=""),
            sa.Column("similar", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
            sa.Column("followups", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("provider", sa.String(length=32), nullable=False, server_default=""),
            sa.Column("message", sa.Text(), nullable=False, server_default=""),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_snapped_questions_user_id_users", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_snapped_questions"),
        )
        op.create_index("ix_snapped_questions_user_id", "snapped_questions", ["user_id"])

    if "practice_questions" not in tables:
        op.create_table(
            "practice_questions",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("module_id", sa.Uuid(), nullable=False),
            sa.Column("lesson_id", sa.Uuid(), nullable=True),
            sa.Column("topic", sa.String(length=180), nullable=False, server_default=""),
            sa.Column("kind", sa.String(length=32), nullable=False),
            sa.Column("difficulty", sa.String(length=32), nullable=False),
            sa.Column("prompt", sa.Text(), nullable=False),
            sa.Column("choices", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("correct_option_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("accepted_answers", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("explanation", sa.Text(), nullable=False, server_default=""),
            sa.Column("model_answer", sa.Text(), nullable=False, server_default=""),
            sa.Column("source", sa.String(length=32), nullable=False, server_default="ai_practice"),
            sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], name="fk_practice_questions_lesson_id_lessons", ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["module_id"], ["modules.id"], name="fk_practice_questions_module_id_modules", ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_practice_questions_user_id_users", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_practice_questions"),
        )
        op.create_index("ix_practice_questions_user_id", "practice_questions", ["user_id"])

    if "practice_attempts" not in tables:
        op.create_table(
            "practice_attempts",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("question_id", sa.Uuid(), nullable=False),
            sa.Column("answer_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("selected_option_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
            sa.Column("is_correct", sa.Boolean(), nullable=True),
            sa.Column("feedback", sa.Text(), nullable=False, server_default=""),
            sa.ForeignKeyConstraint(["question_id"], ["practice_questions.id"], name="fk_practice_attempts_question_id_practice_questions", ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_practice_attempts_user_id_users", ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id", name="pk_practice_attempts"),
        )
        op.create_index("ix_practice_attempts_user_id", "practice_attempts", ["user_id"])


def downgrade() -> None:
    tables = _tables()
    for name in (
        "practice_attempts",
        "practice_questions",
        "snapped_questions",
        "tutor_turns",
        "tutor_sessions",
        "audio_assets",
        "extraction_jobs",
    ):
        if name in tables:
            op.drop_table(name)
