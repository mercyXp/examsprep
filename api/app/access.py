from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_session
from app.models import AcademicYear, AuditLog, Module, Programme, Semester, User
from app.models.access import ContentCreatorAssignment, ProgramAdminAssignment, ProgramModule
from app.models.enums import ProgrammeStatus
from app.security import require_staff, role_slugs

FORBIDDEN = "You don’t have access to this content."


def programme_id_for_module(module: Module) -> uuid.UUID | None:
    semester = module.semester
    year = semester.academic_year if semester else None
    return year.programme_id if year else None


def ensure_program_module(session: Session, module: Module) -> ProgramModule | None:
    programme_id = programme_id_for_module(module)
    if programme_id is None:
        return None
    row = session.scalar(
        select(ProgramModule).where(
            ProgramModule.programme_id == programme_id,
            ProgramModule.module_id == module.id,
        )
    )
    if row is None:
        row = ProgramModule(programme_id=programme_id, module_id=module.id)
        session.add(row)
        session.flush()
    return row


def sync_program_modules(session: Session) -> None:
    modules = list(
        session.scalars(select(Module).options(joinedload(Module.semester).joinedload(Semester.academic_year))).unique()
    )
    for module in modules:
        ensure_program_module(session, module)


def write_audit(
    session: Session,
    user: User,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditLog(
            actor_id=user.id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            payload=payload or {},
        )
    )


@dataclass
class AccessScope:
    user: User
    roles: list[str]
    super_admin: bool
    programme_ids: set[uuid.UUID] = field(default_factory=set)
    module_ids: set[uuid.UUID] | None = None
    can_publish: bool = False
    can_manage_catalogue: bool = False
    can_assign_admins: bool = False
    can_assign_creators: bool = False
    can_manage_students: bool = False

    def allows_module(self, module_id: uuid.UUID) -> bool:
        if self.super_admin:
            return True
        if self.module_ids is None:
            return True
        return module_id in self.module_ids

    def allows_programme(self, programme_id: uuid.UUID) -> bool:
        if self.super_admin:
            return True
        return programme_id in self.programme_ids

    def require_module(self, module_id: uuid.UUID, *, publish: bool = False, catalogue: bool = False) -> None:
        if catalogue and not self.can_manage_catalogue:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a program administrator can change modules.")
        if publish and not self.can_publish:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You don’t have permission to publish. Submit the lesson for review.")
        if not self.allows_module(module_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, FORBIDDEN)

    def require_programme(self, programme_id: uuid.UUID, *, assign_creators: bool = False) -> None:
        if assign_creators and not self.can_assign_creators:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot assign content creators.")
        if not self.allows_programme(programme_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, FORBIDDEN)

    def require_students(self) -> None:
        if not self.can_manage_students:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator access is required.")

    def require_assign_admins(self) -> None:
        if not self.can_assign_admins:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super administrator can assign program administrators.")

    def require_super(self) -> None:
        if not self.super_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super administrator can change academic configuration.")

    def can_view_academic(self) -> bool:
        return self.super_admin or "administrator" in self.roles

    def require_academic_view(self) -> None:
        if not self.can_view_academic():
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can view academic configuration.")

    def can_edit_program_schedule(self, programme_id: uuid.UUID, *, admins_can_edit: bool) -> bool:
        if self.super_admin:
            return True
        return "administrator" in self.roles and self.allows_programme(programme_id) and admins_can_edit

    def require_program_schedule_edit(self, programme_id: uuid.UUID, *, admins_can_edit: bool) -> None:
        if self.can_edit_program_schedule(programme_id, admins_can_edit=admins_can_edit):
            return
        if "administrator" in self.roles and self.allows_programme(programme_id):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "A super administrator must grant permission before you can edit this schedule.")
        raise HTTPException(status.HTTP_403_FORBIDDEN, FORBIDDEN)


def load_scope(session: Session, user: User) -> AccessScope:
    roles = role_slugs(user)
    role_set = set(roles)
    if "super_administrator" in role_set:
        return AccessScope(
            user=user,
            roles=roles,
            super_admin=True,
            programme_ids=set(),
            module_ids=None,
            can_publish=True,
            can_manage_catalogue=True,
            can_assign_admins=True,
            can_assign_creators=True,
            can_manage_students=True,
        )

    programme_ids: set[uuid.UUID] = set()
    module_ids: set[uuid.UUID] = set()
    is_admin = "administrator" in role_set
    is_creator = "creator" in role_set

    if is_admin:
        assigned = list(session.scalars(select(ProgramAdminAssignment).where(ProgramAdminAssignment.user_id == user.id)))
        programme_ids.update(item.programme_id for item in assigned)
        if programme_ids:
            module_ids.update(
                session.scalars(
                    select(Module.id)
                    .join(Semester, Module.semester_id == Semester.id)
                    .join(AcademicYear, Semester.academic_year_id == AcademicYear.id)
                    .where(AcademicYear.programme_id.in_(programme_ids))
                )
            )

    if is_creator:
        rows = list(
            session.scalars(
                select(ContentCreatorAssignment)
                .options(joinedload(ContentCreatorAssignment.program_module))
                .where(ContentCreatorAssignment.user_id == user.id)
            ).unique()
        )
        for row in rows:
            link = row.program_module
            if link is None:
                continue
            module_ids.add(link.module_id)
            programme_ids.add(link.programme_id)

    return AccessScope(
        user=user,
        roles=roles,
        super_admin=False,
        programme_ids=programme_ids,
        module_ids=module_ids,
        can_publish=is_admin,
        can_manage_catalogue=is_admin,
        can_assign_admins=False,
        can_assign_creators=is_admin,
        can_manage_students=is_admin,
    )


def staff_scope(
    user: User = Depends(require_staff),
    session: Session = Depends(get_session),
) -> AccessScope:
    return load_scope(session, user)


def modules_in_programme(session: Session, programme_id: uuid.UUID) -> list[Module]:
    return list(
        session.scalars(
            select(Module)
            .options(joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme))
            .join(Semester, Module.semester_id == Semester.id)
            .join(AcademicYear, Semester.academic_year_id == AcademicYear.id)
            .where(AcademicYear.programme_id == programme_id)
            .order_by(Module.code)
        ).unique()
    )


def first_semester_for_programme(session: Session, programme_id: uuid.UUID) -> Semester | None:
    return session.scalar(
        select(Semester)
        .join(AcademicYear)
        .where(AcademicYear.programme_id == programme_id)
        .order_by(AcademicYear.year_number, Semester.semester_number)
    )


def scope_out(session: Session, scope: AccessScope) -> dict[str, Any]:
    if scope.super_admin:
        programmes = list(session.scalars(select(Programme).order_by(Programme.name)))
        modules = list(
            session.scalars(
                select(Module)
                .options(joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme))
                .order_by(Module.code)
            ).unique()
        )
    else:
        programmes = (
            list(session.scalars(select(Programme).where(Programme.id.in_(scope.programme_ids)).order_by(Programme.name)))
            if scope.programme_ids
            else []
        )
        modules = (
            list(
                session.scalars(
                    select(Module)
                    .options(joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme))
                    .where(Module.id.in_(scope.module_ids or set()))
                    .order_by(Module.code)
                ).unique()
            )
            if scope.module_ids
            else []
        )

    primary = "creator"
    if scope.super_admin:
        primary = "super_administrator"
    elif "administrator" in scope.roles:
        primary = "administrator"

    return {
        "ok": True,
        "role": primary,
        "roles": scope.roles,
        "canPublish": scope.can_publish,
        "canManageCatalogue": scope.can_manage_catalogue,
        "canAssignAdmins": scope.can_assign_admins,
        "canAssignCreators": scope.can_assign_creators,
        "canManageStudents": scope.can_manage_students,
        "canViewAcademic": scope.can_view_academic(),
        "canManageAcademic": scope.super_admin,
        "canAnnounce": scope.super_admin or "administrator" in scope.roles,
        "canManageProgrammes": scope.super_admin,
        "canViewRewards": scope.super_admin or "administrator" in scope.roles,
        "programmes": [
            {"id": str(item.id), "name": item.name, "slug": item.slug}
            for item in programmes
            if item.status != ProgrammeStatus.ARCHIVED
        ],
        "modules": [
            {
                "id": str(item.id),
                "code": item.code,
                "name": item.name,
                "programmeId": str(programme_id_for_module(item)) if programme_id_for_module(item) else None,
                "programmeName": item.semester.academic_year.programme.name
                if item.semester and item.semester.academic_year and item.semester.academic_year.programme
                else None,
            }
            for item in modules
        ],
    }
