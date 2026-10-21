"""Chapters, lesson slides, and student lesson progress fields.

Revision ID: 20261020_0005
Revises: 20261020_0004
Create Date: 2026-10-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261020_0005"
down_revision: str | None = "20261020_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("description", sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "modules",
        sa.Column("objectives", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column("modules", sa.Column("cover_color", sa.String(length=32), nullable=True))
    op.add_column(
        "modules",
        sa.Column("status", sa.Enum(name="content_status", create_type=False), nullable=False, server_default="PUBLISHED"),
    )

    op.create_table(
        "chapters",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum(name="content_status", create_type=False),
            nullable=False,
            server_default="DRAFT",
        ),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("module_id", "position", name="uq_chapters_module_position", deferrable=True, initially="DEFERRED"),
    )
    op.create_index("ix_chapters_module_id", "chapters", ["module_id"])

    op.add_column("lessons", sa.Column("chapter_id", sa.Uuid(), nullable=True))
    op.add_column("lessons", sa.Column("description", sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "lessons",
        sa.Column("objectives", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column("lessons", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    op.add_column("lessons", sa.Column("difficulty", sa.String(length=32), nullable=True))
    op.add_column("lessons", sa.Column("position", sa.Integer(), nullable=True))
    op.execute(
        """
        UPDATE lessons AS lesson
        SET position = ranked.rn - 1
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY module_id ORDER BY created_at, id) AS rn
            FROM lessons
        ) AS ranked
        WHERE lesson.id = ranked.id
        """
    )
    op.alter_column("lessons", "position", existing_type=sa.Integer(), nullable=False, server_default="0")
    op.create_foreign_key("fk_lessons_chapter_id", "lessons", "chapters", ["chapter_id"], ["id"], ondelete="SET NULL")
    op.execute(
        "ALTER TABLE lessons ADD CONSTRAINT uq_lessons_module_position UNIQUE (module_id, position) DEFERRABLE INITIALLY DEFERRED"
    )

    op.add_column(
        "lesson_versions",
        sa.Column("slides", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )

    op.add_column("lesson_progress", sa.Column("current_slide_index", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("lesson_progress", sa.Column("revealed_units", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(
        "lesson_progress",
        sa.Column("check_results", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("lesson_progress", "check_results")
    op.drop_column("lesson_progress", "revealed_units")
    op.drop_column("lesson_progress", "current_slide_index")
    op.drop_column("lesson_versions", "slides")
    op.drop_constraint("uq_lessons_module_position", "lessons", type_="unique")
    op.drop_constraint("fk_lessons_chapter_id", "lessons", type_="foreignkey")
    op.drop_column("lessons", "position")
    op.drop_column("lessons", "difficulty")
    op.drop_column("lessons", "duration_minutes")
    op.drop_column("lessons", "objectives")
    op.drop_column("lessons", "description")
    op.drop_column("lessons", "chapter_id")
    op.drop_index("ix_chapters_module_id", table_name="chapters")
    op.drop_table("chapters")
    op.drop_column("modules", "status")
    op.drop_column("modules", "cover_color")
    op.drop_column("modules", "objectives")
    op.drop_column("modules", "description")
