"""Exam types and per-module official sittings.

Revision ID: 20261021_0010
Revises: 20261021_0009
Create Date: 2026-10-21

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261021_0010"
down_revision: str | None = "20261021_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if "exam_types" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "exam_types",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("slug", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("position", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_exam_types_slug", "exam_types", ["slug"])
    op.execute(
        """
        INSERT INTO exam_types (id, slug, name, position, is_active)
        VALUES
            (gen_random_uuid(), 'regular', 'Regular examinations', 1, TRUE),
            (gen_random_uuid(), 'supplementary', 'Supplementary examinations', 2, TRUE),
            (gen_random_uuid(), 'deferred', 'Deferred examinations', 3, TRUE),
            (gen_random_uuid(), 'other', 'Other / resit', 4, TRUE)
        """
    )
    op.add_column("program_exam_schedules", sa.Column("exam_type_id", sa.Uuid(), nullable=True))
    op.add_column("module_exam_slots", sa.Column("exam_type_id", sa.Uuid(), nullable=True))
    op.execute(
        """
        UPDATE program_exam_schedules
        SET exam_type_id = (SELECT id FROM exam_types WHERE slug = 'regular')
        WHERE exam_type_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE module_exam_slots
        SET exam_type_id = (SELECT id FROM exam_types WHERE slug = 'regular')
        WHERE exam_type_id IS NULL
        """
    )
    op.alter_column("program_exam_schedules", "exam_type_id", nullable=False)
    op.alter_column("module_exam_slots", "exam_type_id", nullable=False)
    op.create_foreign_key(
        "fk_program_exam_schedules_exam_type_id",
        "program_exam_schedules",
        "exam_types",
        ["exam_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_module_exam_slots_exam_type_id",
        "module_exam_slots",
        "exam_types",
        ["exam_type_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_program_exam_schedules_exam_type_id", "program_exam_schedules", ["exam_type_id"])
    op.create_index("ix_module_exam_slots_exam_type_id", "module_exam_slots", ["exam_type_id"])
    op.drop_constraint("uq_program_exam_period_programme", "program_exam_schedules", type_="unique")
    op.drop_constraint("uq_module_exam_period_module", "module_exam_slots", type_="unique")
    op.create_unique_constraint(
        "uq_program_exam_period_programme_type",
        "program_exam_schedules",
        ["period_id", "programme_id", "exam_type_id"],
    )
    op.create_unique_constraint(
        "uq_module_exam_period_module_type",
        "module_exam_slots",
        ["period_id", "module_id", "exam_type_id"],
    )
    op.add_column(
        "student_profiles",
        sa.Column("module_exam_plans", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )
    op.add_column("student_profiles", sa.Column("revision_start", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("student_profiles", "revision_start")
    op.drop_column("student_profiles", "module_exam_plans")
    op.drop_constraint("uq_module_exam_period_module_type", "module_exam_slots", type_="unique")
    op.drop_constraint("uq_program_exam_period_programme_type", "program_exam_schedules", type_="unique")
    op.create_unique_constraint("uq_module_exam_period_module", "module_exam_slots", ["period_id", "module_id"])
    op.create_unique_constraint("uq_program_exam_period_programme", "program_exam_schedules", ["period_id", "programme_id"])
    op.drop_constraint("fk_module_exam_slots_exam_type_id", "module_exam_slots", type_="foreignkey")
    op.drop_constraint("fk_program_exam_schedules_exam_type_id", "program_exam_schedules", type_="foreignkey")
    op.drop_column("module_exam_slots", "exam_type_id")
    op.drop_column("program_exam_schedules", "exam_type_id")
    op.drop_table("exam_types")
