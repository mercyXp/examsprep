"""Program admin and content creator assignments.

Revision ID: 20261021_0006
Revises: 20261020_0005
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261021_0006"
down_revision: str | None = "20261020_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "program_modules",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("programme_id", sa.Uuid(), nullable=False),
        sa.Column("module_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("programme_id", "module_id", name="uq_program_modules_programme_module"),
    )
    op.create_index("ix_program_modules_programme_id", "program_modules", ["programme_id"])
    op.create_index("ix_program_modules_module_id", "program_modules", ["module_id"])

    op.execute(
        """
        INSERT INTO program_modules (id, programme_id, module_id)
        SELECT gen_random_uuid(), academic_years.programme_id, modules.id
        FROM modules
        JOIN semesters ON semesters.id = modules.semester_id
        JOIN academic_years ON academic_years.id = semesters.academic_year_id
        """
    )

    op.create_table(
        "program_admin_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("programme_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_by_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["assigned_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["programme_id"], ["programmes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "programme_id", name="uq_program_admin_assignments_user_programme"),
    )

    op.create_table(
        "content_creator_assignments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("program_module_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_by_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["assigned_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["program_module_id"], ["program_modules.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "program_module_id", name="uq_content_creator_assignments_user_program_module"),
    )


def downgrade() -> None:
    op.drop_table("content_creator_assignments")
    op.drop_table("program_admin_assignments")
    op.drop_index("ix_program_modules_module_id", table_name="program_modules")
    op.drop_index("ix_program_modules_programme_id", table_name="program_modules")
    op.drop_table("program_modules")
