"""Idempotent seed: roles, permissions, Computing catalogue, coming-soon programmes."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import AcademicYear, Module, Permission, Programme, Role, RolePermission, Semester
from app.models.enums import ProgrammeStatus

ROLES = [
    ("student", "Student", "Consumes published content and tracks personal progress."),
    ("creator", "Content creator", "Prepares drafts and submits them for review."),
    ("administrator", "Administrator", "Reviews, publishes, and operates the catalogue."),
    (
        "super_administrator",
        "Super administrator",
        "Assigns roles, owns platform configuration, and inspects audit logs.",
    ),
]

PERMISSIONS = [
    ("lesson:view_published", "View published lessons"),
    ("lesson:create", "Create lesson drafts"),
    ("lesson:edit_own", "Edit own drafts"),
    ("lesson:edit_any", "Edit another creator’s drafts"),
    ("lesson:submit", "Submit a version for review"),
    ("review:list", "List content reviews"),
    ("review:decide", "Approve, reject, or request changes"),
    ("lesson:publish", "Publish or unpublish an approved version"),
    ("user:manage_roles_limited", "Limited role management"),
    ("user:manage_roles", "Assign and revoke all roles"),
    ("audit:view_own", "View own audit activity"),
    ("audit:view_scoped", "View audit logs in an administrator’s scope"),
    ("audit:view_all", "View all audit logs"),
]

ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "student": ("lesson:view_published", "audit:view_own"),
    "creator": (
        "lesson:view_published",
        "lesson:create",
        "lesson:edit_own",
        "lesson:submit",
        "audit:view_own",
    ),
    "administrator": (
        "lesson:view_published",
        "lesson:create",
        "lesson:edit_own",
        "lesson:edit_any",
        "lesson:submit",
        "review:list",
        "review:decide",
        "lesson:publish",
        "user:manage_roles_limited",
        "audit:view_scoped",
    ),
    "super_administrator": tuple(code for code, _ in PERMISSIONS),
}

COMING_SOON = [
    ("accounting-finance", "Accounting & Finance", "Accounting & Finance", "Numbers, business and financial thinking."),
    ("law", "Law", "Law", "Build knowledge through legal reasoning."),
    ("business-management", "Business & Management", "Business & Management", "Explore management, enterprise and strategy."),
    ("health-sciences", "Health Sciences", "Health Sciences", "Prepare for a future in health and medicine."),
]

Y2S1_MODULES = [
    ("IT211", "Systems Analysis and Design"),
    ("IT212", "Database Management Systems"),
    ("IT213", "Networking and Data Communication I"),
    ("IT214", "Operating Systems"),
    ("IT215", "Discrete Mathematics"),
]


def _get_or_create_role(session: Session, slug: str, name: str, description: str) -> Role:
    role = session.scalar(select(Role).where(Role.slug == slug))
    if role is None:
        role = Role(slug=slug, name=name, description=description)
        session.add(role)
        session.flush()
        return role
    role.name = name
    role.description = description
    return role


def _get_or_create_permission(session: Session, code: str, description: str) -> Permission:
    permission = session.scalar(select(Permission).where(Permission.code == code))
    if permission is None:
        permission = Permission(code=code, description=description)
        session.add(permission)
        session.flush()
        return permission
    permission.description = description
    return permission


def seed_identity(session: Session) -> None:
    roles = {
        slug: _get_or_create_role(session, slug, name, description)
        for slug, name, description in ROLES
    }
    permissions = {
        code: _get_or_create_permission(session, code, description)
        for code, description in PERMISSIONS
    }
    for slug, codes in ROLE_PERMISSIONS.items():
        role = roles[slug]
        for code in codes:
            permission = permissions[code]
            exists = session.scalar(
                select(RolePermission).where(
                    RolePermission.role_id == role.id,
                    RolePermission.permission_id == permission.id,
                )
            )
            if exists is None:
                session.add(RolePermission(role_id=role.id, permission_id=permission.id))


def seed_programmes(session: Session) -> None:
    computing = session.scalar(select(Programme).where(Programme.slug == "computing"))
    if computing is None:
        computing = Programme(
            slug="computing",
            name="Bachelor of Science in Computing",
            category="Computing & Technology",
            status=ProgrammeStatus.AVAILABLE,
            duration_years=4,
            blurb=(
                "From programming and databases to artificial intelligence, "
                "build your understanding one module at a time."
            ),
        )
        session.add(computing)
        session.flush()
    else:
        computing.status = ProgrammeStatus.AVAILABLE
        computing.duration_years = 4

    for year_number in range(1, 5):
        year = session.scalar(
            select(AcademicYear).where(
                AcademicYear.programme_id == computing.id,
                AcademicYear.year_number == year_number,
            )
        )
        if year is None:
            year = AcademicYear(programme_id=computing.id, year_number=year_number)
            session.add(year)
            session.flush()
        for semester_number in (1, 2):
            semester = session.scalar(
                select(Semester).where(
                    Semester.academic_year_id == year.id,
                    Semester.semester_number == semester_number,
                )
            )
            if semester is None:
                session.add(Semester(academic_year_id=year.id, semester_number=semester_number))
                session.flush()

    y2s1 = session.scalar(
        select(Semester)
        .join(AcademicYear)
        .where(
            AcademicYear.programme_id == computing.id,
            AcademicYear.year_number == 2,
            Semester.semester_number == 1,
        )
    )
    assert y2s1 is not None
    existing_codes = set(session.scalars(select(Module.code).where(Module.semester_id == y2s1.id)))
    for code, name in Y2S1_MODULES:
        if code not in existing_codes:
            session.add(Module(semester_id=y2s1.id, code=code, name=name))

    for slug, name, category, blurb in COMING_SOON:
        row = session.scalar(select(Programme).where(Programme.slug == slug))
        if row is None:
            session.add(
                Programme(
                    slug=slug,
                    name=name,
                    category=category,
                    status=ProgrammeStatus.COMING_SOON,
                    blurb=blurb,
                )
            )


def seed(session: Session | None = None) -> None:
    own_session = session is None
    session = session or SessionLocal()
    try:
        seed_identity(session)
        seed_programmes(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        if own_session:
            session.close()


if __name__ == "__main__":
    seed()
    print("Seed complete.")
