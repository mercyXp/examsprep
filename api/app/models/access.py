from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.catalogue import Module, Programme
from app.models.identity import User
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class ProgramModule(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A module offered inside a specific programme.

    Module rows already sit under a semester, but creator assignments must name
    both the programme and the module so the same code can exist in two programmes.
    """

    __tablename__ = "program_modules"
    __table_args__ = (UniqueConstraint("programme_id", "module_id", name="uq_program_modules_programme_module"),)

    programme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False)
    module_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)

    programme: Mapped[Programme] = relationship()
    module: Mapped[Module] = relationship()
    creator_assignments: Mapped[list[ContentCreatorAssignment]] = relationship(
        back_populates="program_module",
        cascade="all, delete-orphan",
    )


class ProgramAdminAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "program_admin_assignments"
    __table_args__ = (UniqueConstraint("user_id", "programme_id", name="uq_program_admin_assignments_user_programme"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    programme_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("programmes.id", ondelete="CASCADE"), nullable=False)
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    programme: Mapped[Programme] = relationship()
    assigned_by: Mapped[User | None] = relationship(foreign_keys=[assigned_by_id])


class ContentCreatorAssignment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "content_creator_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "program_module_id", name="uq_content_creator_assignments_user_program_module"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    program_module_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("program_modules.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    program_module: Mapped[ProgramModule] = relationship(back_populates="creator_assignments")
    assigned_by: Mapped[User | None] = relationship(foreign_keys=[assigned_by_id])
