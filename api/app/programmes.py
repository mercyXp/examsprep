"""Create, edit, and archive programmes.

Only a super administrator may change a programme. Programme administrators
read the programmes assigned to them. A new programme is given its years and
semesters so a module can be added immediately.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.access import AccessScope, write_audit
from app.models import AcademicYear, Module, Programme, Semester
from app.models.enums import ProgrammeStatus

_SLUG = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    return _SLUG.sub("-", value.strip().lower()).strip("-")[:80]


def _unique_slug(session: Session, base: str, ignore_id: uuid.UUID | None = None) -> str:
    root = slugify(base) or "program"
    candidate = root
    number = 2
    while True:
        existing = session.scalar(select(Programme).where(Programme.slug == candidate))
        if existing is None or existing.id == ignore_id:
            return candidate
        suffix = f"-{number}"
        candidate = f"{root[:80 - len(suffix)]}{suffix}"
        number += 1


def parse_status(value: str) -> ProgrammeStatus:
    try:
        return ProgrammeStatus(value.strip().lower())
    except ValueError as error:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Choose available, coming soon, preview, or archived.",
        ) from error


def require_programme_manager(scope: AccessScope) -> None:
    if not scope.super_admin:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only a super administrator can change programs.",
        )


def reject_if_archived(programme: Programme | None) -> None:
    if programme is not None and programme.status == ProgrammeStatus.ARCHIVED:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "That program is archived. Restore it before adding modules.",
        )


def ensure_years(session: Session, programme: Programme, duration_years: int) -> None:
    years = max(1, min(int(duration_years or 1), 4))
    for year_number in range(1, years + 1):
        year = session.scalar(
            select(AcademicYear).where(
                AcademicYear.programme_id == programme.id,
                AcademicYear.year_number == year_number,
            )
        )
        if year is None:
            year = AcademicYear(programme_id=programme.id, year_number=year_number)
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


def module_count(session: Session, programme_id: uuid.UUID) -> int:
    total = session.scalar(
        select(func.count(Module.id))
        .join(Semester, Module.semester_id == Semester.id)
        .join(AcademicYear, Semester.academic_year_id == AcademicYear.id)
        .where(AcademicYear.programme_id == programme_id)
    )
    return int(total or 0)


def programme_out(session: Session, programme: Programme) -> dict[str, Any]:
    raw_status = programme.status
    status_value = raw_status.value if isinstance(raw_status, ProgrammeStatus) else str(raw_status)
    return {
        "id": str(programme.id),
        "name": programme.name,
        "slug": programme.slug,
        "category": programme.category,
        "status": status_value,
        "durationYears": programme.duration_years,
        "blurb": programme.blurb or "",
        "moduleCount": module_count(session, programme.id),
    }


def programmes_for(session: Session, scope: AccessScope) -> list[Programme]:
    query = select(Programme).order_by(Programme.name)
    if not scope.super_admin:
        if not scope.programme_ids:
            return []
        query = query.where(Programme.id.in_(scope.programme_ids))
    return list(session.scalars(query))


def create_programme(
    session: Session,
    scope: AccessScope,
    *,
    name: str,
    slug: str | None,
    category: str,
    status_value: str,
    duration_years: int,
    blurb: str,
) -> Programme:
    require_programme_manager(scope)
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Program name is required.")
    years = max(1, min(int(duration_years or 4), 4))
    programme = Programme(
        name=clean_name[:180],
        slug=_unique_slug(session, (slug or clean_name)),
        category=(category or "General").strip()[:120] or "General",
        status=parse_status(status_value),
        duration_years=years,
        blurb=blurb.strip(),
    )
    session.add(programme)
    session.flush()
    ensure_years(session, programme, years)
    write_audit(
        session,
        scope.user,
        "programme.create",
        "programme",
        programme.id,
        {"name": programme.name, "slug": programme.slug},
    )
    return programme


def update_programme(
    session: Session,
    scope: AccessScope,
    programme_id: uuid.UUID,
    *,
    name: str,
    category: str,
    status_value: str,
    duration_years: int,
    blurb: str,
) -> Programme:
    require_programme_manager(scope)
    programme = session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program not found.")
    clean_name = name.strip()
    if not clean_name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Program name is required.")
    years = max(1, min(int(duration_years or programme.duration_years or 1), 4))
    programme.name = clean_name[:180]
    programme.category = (category or "General").strip()[:120] or "General"
    programme.status = parse_status(status_value)
    programme.duration_years = years
    programme.blurb = blurb.strip()
    ensure_years(session, programme, years)
    write_audit(
        session,
        scope.user,
        "programme.update",
        "programme",
        programme.id,
        {"name": programme.name, "status": programme.status.value},
    )
    return programme


def archive_programme(session: Session, scope: AccessScope, programme_id: uuid.UUID) -> Programme:
    require_programme_manager(scope)
    programme = session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program not found.")
    programme.status = ProgrammeStatus.ARCHIVED
    write_audit(
        session,
        scope.user,
        "programme.archive",
        "programme",
        programme.id,
        {"name": programme.name},
    )
    session.flush()
    return programme
