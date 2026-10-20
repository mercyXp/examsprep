"""Initial PostgreSQL schema for identity, catalogue, versioned content, learning, and audit.

Revision ID: 20261020_0001
Revises:
Create Date: 2026-10-20

"""

from collections.abc import Sequence

from alembic import op

from app.db import Base
from app.models import *  # noqa: F401, F403
from app.models.enums import (
    bookmark_target_enum,
    content_status_enum,
    enrolment_status_enum,
    programme_status_enum,
    quiz_kind_enum,
    resource_kind_enum,
    review_decision_enum,
    user_status_enum,
    version_status_enum,
)

revision: str = "20261020_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS = (
    user_status_enum,
    programme_status_enum,
    content_status_enum,
    version_status_enum,
    review_decision_enum,
    quiz_kind_enum,
    resource_kind_enum,
    enrolment_status_enum,
    bookmark_target_enum,
)


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
    for enum in reversed(ENUMS):
        enum.drop(bind, checkfirst=True)
