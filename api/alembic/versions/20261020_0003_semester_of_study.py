"""Add semester_of_study to student profiles.

Revision ID: 20261020_0003
Revises: 20261020_0002
Create Date: 2026-10-20

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261020_0003"
down_revision: str | None = "20261020_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("student_profiles", sa.Column("semester_of_study", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("student_profiles", "semester_of_study")
