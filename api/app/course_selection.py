"""Student-controlled module selection.

Year and semester choose the first suggestions. They do not limit which
published modules in the student's programme can be active. Seven is the
maximum active selection. Removed modules stay in history so progress remains.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.catalogue import AcademicYear, Module, Programme, Semester
from app.models.enums import ContentStatus
from app.models.identity import StudentProfile

ACTIVE_LIMIT = 7


class CourseSelectionError(Exception):
    def __init__(self, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class CatalogueModule:
    code: str
    year: int | None
    semester: int | None


def _clean(values: list[str] | None) -> list[str]:
    seen: list[str] = []
    for item in values or []:
        if isinstance(item, str) and item not in seen:
            seen.append(item)
    return seen


def add_code(active: list[str], history: list[str], code: str, allowed: set[str]) -> tuple[list[str], list[str]]:
    chosen = _clean(active)
    previous = [item for item in _clean(history) if item not in chosen]
    if code not in allowed:
        raise CourseSelectionError("That module is not published in your programme.", 404)
    if code in chosen:
        return chosen, previous
    if len(chosen) >= ACTIVE_LIMIT:
        raise CourseSelectionError("You can keep seven active modules. Remove one before adding another.", 409)
    return [*chosen, code], [item for item in previous if item != code]


def remove_code(active: list[str], history: list[str], code: str) -> tuple[list[str], list[str]]:
    chosen = _clean(active)
    if code not in chosen:
        raise CourseSelectionError("That module is not in your active selection.", 404)
    remaining = [item for item in chosen if item != code]
    previous = [item for item in _clean(history) if item not in remaining and item != code]
    previous.append(code)
    return remaining, previous


def default_codes(modules: list[CatalogueModule], *, year: int | None, semester: int | None) -> list[str]:
    matched = [item.code for item in modules if item.year == year and item.semester == semester]
    return _clean(matched)[:ACTIVE_LIMIT]


def published_modules(session: Session, programme_name: str | None) -> list[Module]:
    name = (programme_name or "").strip()
    if not name:
        return []
    return list(
        session.scalars(
            select(Module)
            .join(Module.semester)
            .join(Semester.academic_year)
            .join(AcademicYear.programme)
            .where(Programme.name == name, Module.status == ContentStatus.PUBLISHED)
            .options(joinedload(Module.semester).joinedload(Semester.academic_year))
            .order_by(AcademicYear.year_number, Semester.semester_number, Module.code)
        ).unique()
    )


def catalogue_rows(modules: list[Module]) -> list[CatalogueModule]:
    rows: list[CatalogueModule] = []
    for module in modules:
        semester = module.semester
        year = semester.academic_year if semester is not None else None
        rows.append(
            CatalogueModule(
                code=module.code,
                year=year.year_number if year is not None else None,
                semester=semester.semester_number if semester is not None else None,
            )
        )
    return rows


def published_codes(session: Session, programme_name: str | None) -> set[str]:
    return {module.code for module in published_modules(session, programme_name)}


def store_selection(profile: StudentProfile, active: list[str], history: list[str]) -> None:
    profile.module_codes = active
    profile.module_history = [item for item in history if item not in active]


def select_module(session: Session, profile: StudentProfile, code: str) -> None:
    allowed = published_codes(session, profile.programme)
    active, history = add_code(list(profile.module_codes or []), list(profile.module_history or []), code, allowed)
    store_selection(profile, active, history)


def deselect_module(profile: StudentProfile, code: str) -> None:
    active, history = remove_code(list(profile.module_codes or []), list(profile.module_history or []), code)
    store_selection(profile, active, history)


def initial_module_codes(session: Session, profile: StudentProfile) -> list[str]:
    modules = catalogue_rows(published_modules(session, profile.programme))
    return default_codes(modules, year=profile.year_of_study, semester=profile.semester_of_study)


def accept_onboarding_codes(session: Session, profile: StudentProfile, codes: list[str]) -> list[str]:
    allowed = published_codes(session, profile.programme)
    chosen = [code for code in _clean(codes) if code in allowed]
    if len(_clean(codes)) > ACTIVE_LIMIT or len(chosen) > ACTIVE_LIMIT:
        raise CourseSelectionError("Choose at most seven modules.", 422)
    return chosen
