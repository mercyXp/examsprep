from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.access import AccessScope, programme_id_for_module
from app.models import AcademicPeriod, AcademicYear, ExamType, Module, ModuleExamSlot, ProgramExamSchedule, Programme, Semester, User

DEFAULT_EXAM_TYPES = (
    ("regular", "Regular examinations", 1),
    ("supplementary", "Supplementary examinations", 2),
    ("deferred", "Deferred examinations", 3),
    ("other", "Other / resit", 4),
)

DEFAULT_YEAR = "2026/2027"
DEFAULT_SEMESTER = 2
DEFAULT_NAME = "November 2026 examinations"
DEFAULT_START = date(2026, 11, 16)
DEFAULT_END = date(2026, 11, 27)

MODULE_DEMO_SLOTS = {
    "IT211": (date(2026, 11, 18), time(9, 0)),
    "IT212": (date(2026, 11, 20), time(9, 0)),
    "IT213": (date(2026, 11, 23), time(14, 0)),
    "IT214": (date(2026, 11, 25), time(9, 0)),
    "IT215": (date(2026, 11, 27), time(9, 0)),
}


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _hhmm(value: time | None) -> str | None:
    return value.strftime("%H:%M") if value else None


def parse_date(value: str, *, field: str = "date") -> date:
    try:
        return date.fromisoformat(value.strip())
    except (AttributeError, TypeError, ValueError) as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Use a valid {field}.") from error


def parse_time(value: str | None) -> time | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        parts = text.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        return time(hour, minute)
    except (IndexError, TypeError, ValueError) as error:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use a valid examination time.") from error


def require_range(start: date, end: date, message: str) -> None:
    if end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, message)


def exam_type_out(row: ExamType) -> dict[str, Any]:
    return {"id": str(row.id), "slug": row.slug, "name": row.name, "position": row.position}


def ensure_exam_types(session: Session) -> list[ExamType]:
    rows = list(session.scalars(select(ExamType).order_by(ExamType.position, ExamType.name)))
    existing = {row.slug for row in rows}
    changed = False
    for slug, name, position in DEFAULT_EXAM_TYPES:
        if slug in existing:
            continue
        session.add(ExamType(slug=slug, name=name, position=position, is_active=True))
        changed = True
    if changed:
        session.flush()
        rows = list(session.scalars(select(ExamType).order_by(ExamType.position, ExamType.name)))
    return rows


def load_exam_type(session: Session, exam_type_id: uuid.UUID | None = None) -> ExamType:
    ensure_exam_types(session)
    if exam_type_id is not None:
        row = session.get(ExamType, exam_type_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Examination type not found.")
        return row
    row = session.scalar(select(ExamType).where(ExamType.slug == "regular"))
    if row is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Regular examinations is not configured.")
    return row


def load_period(session: Session, period_id: uuid.UUID | None = None) -> AcademicPeriod:
    if period_id is None:
        return ensure_current_period(session)
    row = session.get(AcademicPeriod, period_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Academic period not found.")
    return row


def current_period(session: Session, *, published_only: bool = False) -> AcademicPeriod | None:
    filters = [AcademicPeriod.is_published.is_(True)] if published_only else []
    current = session.scalar(select(AcademicPeriod).where(AcademicPeriod.is_current.is_(True), *filters).limit(1))
    if current is not None:
        return current
    return session.scalar(select(AcademicPeriod).where(*filters).order_by(AcademicPeriod.window_start.desc()).limit(1))


def ensure_current_period(session: Session) -> AcademicPeriod:
    row = current_period(session)
    if row is not None:
        return row
    row = AcademicPeriod(
        name=DEFAULT_NAME,
        academic_year=DEFAULT_YEAR,
        semester_number=DEFAULT_SEMESTER,
        window_start=DEFAULT_START,
        window_end=DEFAULT_END,
        is_current=True,
        is_published=True,
    )
    session.add(row)
    session.flush()
    return row


def set_current_period(session: Session, period: AcademicPeriod) -> None:
    for item in session.scalars(select(AcademicPeriod)).all():
        item.is_current = item.id == period.id
    period.is_current = True
    session.flush()


def seed_demo_schedule(session: Session) -> None:
    period = ensure_current_period(session)
    period.window_start = min(period.window_start, DEFAULT_START)
    period.window_end = max(period.window_end, DEFAULT_END)
    period.is_published = True
    regular = load_exam_type(session)
    computing = session.scalar(select(Programme).where(Programme.slug == "computing"))
    if computing is None:
        return
    schedule = session.scalar(
        select(ProgramExamSchedule).where(
            ProgramExamSchedule.period_id == period.id,
            ProgramExamSchedule.programme_id == computing.id,
            ProgramExamSchedule.exam_type_id == regular.id,
        )
    )
    if schedule is None:
        session.add(
            ProgramExamSchedule(
                period_id=period.id,
                programme_id=computing.id,
                exam_type_id=regular.id,
                start_date=period.window_start,
                end_date=period.window_end,
                admins_can_edit=False,
            )
        )
    modules = list(
        session.scalars(
            select(Module)
            .options(joinedload(Module.semester).joinedload(Semester.academic_year))
            .where(Module.code.in_(MODULE_DEMO_SLOTS))
        ).unique()
    )
    existing = {
        row.module_id
        for row in session.scalars(
            select(ModuleExamSlot).where(
                ModuleExamSlot.period_id == period.id,
                ModuleExamSlot.exam_type_id == regular.id,
            )
        )
    }
    for module in modules:
        if module.id in existing:
            continue
        exam_date, exam_time = MODULE_DEMO_SLOTS[module.code]
        session.add(
            ModuleExamSlot(
                period_id=period.id,
                module_id=module.id,
                exam_type_id=regular.id,
                exam_date=exam_date,
                exam_time=exam_time,
            )
        )
    session.flush()


def period_out(row: AcademicPeriod) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "name": row.name,
        "academicYear": row.academic_year,
        "semesterNumber": row.semester_number,
        "windowStart": _iso(row.window_start),
        "windowEnd": _iso(row.window_end),
        "isCurrent": bool(row.is_current),
        "isPublished": bool(row.is_published),
    }


def _warnings_for(period: AcademicPeriod, schedules: list[ProgramExamSchedule], slots: list[ModuleExamSlot]) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    if period.window_end < period.window_start:
        warnings.append(
            {
                "level": "error",
                "code": "period_range",
                "message": "The overall examination period ends before it starts.",
            }
        )
    schedule_by_programme = {row.programme_id: row for row in schedules}
    for row in schedules:
        name = row.programme.name if row.programme else "This program"
        if row.end_date < row.start_date:
            warnings.append(
                {
                    "level": "error",
                    "code": "program_range",
                    "message": f"{name}: the examination window ends before it starts.",
                }
            )
        if row.start_date < period.window_start or row.end_date > period.window_end:
            warnings.append(
                {
                    "level": "warning",
                    "code": "program_outside_period",
                    "message": f"{name}: the program window sits outside the overall examination period.",
                }
            )
    clashes: dict[tuple[uuid.UUID | None, date, str], list[ModuleExamSlot]] = defaultdict(list)
    for slot in slots:
        module = slot.module
        programme_id = programme_id_for_module(module) if module else None
        label = f"{module.code} ({module.name})" if module else "A module"
        schedule = schedule_by_programme.get(programme_id) if programme_id else None
        if slot.exam_date < period.window_start or slot.exam_date > period.window_end:
            warnings.append(
                {
                    "level": "warning",
                    "code": "module_outside_period",
                    "message": f"{label}: the exam date sits outside the overall examination period.",
                }
            )
        if schedule and (slot.exam_date < schedule.start_date or slot.exam_date > schedule.end_date):
            program_name = schedule.programme.name if schedule.programme else "its program"
            warnings.append(
                {
                    "level": "warning",
                    "code": "module_outside_program",
                    "message": f"{label}: the exam date sits outside the {program_name} examination window.",
                }
            )
        if programme_id and slot.exam_time is not None:
            clashes[(programme_id, slot.exam_type_id, slot.exam_date, _hhmm(slot.exam_time) or "")].append(slot)
    for group in clashes.values():
        if len(group) < 2:
            continue
        labels = ", ".join(f"{item.module.code}" for item in group if item.module)
        warnings.append(
            {
                "level": "warning",
                "code": "module_clash",
                "message": f"{labels} are scheduled at the same date and time in the same program.",
            }
        )
    return warnings


def schedule_payload(
    session: Session,
    period: AcademicPeriod,
    scope: AccessScope,
    exam_type: ExamType | None = None,
) -> dict[str, Any]:
    exam_type = exam_type or load_exam_type(session)
    programme_ids = None if scope.super_admin else set(scope.programme_ids)
    schedules = list(
        session.scalars(
            select(ProgramExamSchedule)
            .options(joinedload(ProgramExamSchedule.programme))
            .where(
                ProgramExamSchedule.period_id == period.id,
                ProgramExamSchedule.exam_type_id == exam_type.id,
            )
        ).unique()
    )
    slots = list(
        session.scalars(
            select(ModuleExamSlot)
            .options(
                joinedload(ModuleExamSlot.module)
                .joinedload(Module.semester)
                .joinedload(Semester.academic_year)
                .joinedload(AcademicYear.programme)
            )
            .where(
                ModuleExamSlot.period_id == period.id,
                ModuleExamSlot.exam_type_id == exam_type.id,
            )
        ).unique()
    )
    programmes = list(session.scalars(select(Programme).order_by(Programme.name)))
    modules = list(
        session.scalars(
            select(Module)
            .options(joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme))
            .order_by(Module.code)
        ).unique()
    )
    if programme_ids is not None:
        programmes = [item for item in programmes if item.id in programme_ids]
        allowed = set(programme_ids)
        schedules = [item for item in schedules if item.programme_id in allowed]
        modules = [item for item in modules if programme_id_for_module(item) in allowed]
        slots = [item for item in slots if item.module and programme_id_for_module(item.module) in allowed]

    slot_by_module = {row.module_id: row for row in slots}
    schedule_by_programme = {row.programme_id: row for row in schedules}
    programme_rows = []
    for item in programmes:
        schedule = schedule_by_programme.get(item.id)
        programme_rows.append(
            {
                "id": str(item.id),
                "name": item.name,
                "slug": item.slug,
                "startDate": _iso(schedule.start_date) if schedule else None,
                "endDate": _iso(schedule.end_date) if schedule else None,
                "adminsCanEdit": bool(schedule.admins_can_edit) if schedule else False,
                "scheduled": schedule is not None,
                "canEdit": scope.can_edit_program_schedule(
                    item.id,
                    admins_can_edit=bool(schedule.admins_can_edit) if schedule else False,
                ),
            }
        )
    module_rows = []
    for item in modules:
        programme_id = programme_id_for_module(item)
        slot = slot_by_module.get(item.id)
        schedule = schedule_by_programme.get(programme_id) if programme_id else None
        module_rows.append(
            {
                "id": str(item.id),
                "code": item.code,
                "name": item.name,
                "programmeId": str(programme_id) if programme_id else None,
                "programmeName": item.semester.academic_year.programme.name
                if item.semester and item.semester.academic_year and item.semester.academic_year.programme
                else None,
                "examDate": _iso(slot.exam_date) if slot else None,
                "examTime": _hhmm(slot.exam_time) if slot else None,
                "scheduled": slot is not None,
                "canEdit": scope.can_edit_program_schedule(
                    programme_id,
                    admins_can_edit=bool(schedule.admins_can_edit) if schedule else False,
                )
                if programme_id
                else scope.super_admin,
            }
        )
    return {
        "period": period_out(period),
        "periods": [period_out(item) for item in session.scalars(select(AcademicPeriod).order_by(AcademicPeriod.window_start.desc()))],
        "examType": exam_type_out(exam_type),
        "examTypes": [exam_type_out(item) for item in ensure_exam_types(session) if item.is_active],
        "permissions": {
            "canManagePeriod": scope.super_admin,
            "canCreatePeriod": scope.super_admin,
        },
        "programmes": programme_rows,
        "modules": module_rows,
        "warnings": _warnings_for(period, schedules, slots),
    }


def student_plan_for(profile, code: str) -> dict[str, str | None]:
    raw = profile.module_exam_plans.get(code) if profile and isinstance(profile.module_exam_plans, dict) else None
    if not isinstance(raw, dict):
        estimated = None
        if profile and isinstance(profile.exam_timetable, dict):
            value = profile.exam_timetable.get(code)
            estimated = value[:10] if isinstance(value, str) else None
        return {
            "examType": "regular",
            "dateMode": "official" if not estimated else "estimated",
            "estimatedDate": estimated,
        }
    exam_type = raw.get("examType") if isinstance(raw.get("examType"), str) else "regular"
    date_mode = raw.get("dateMode") if isinstance(raw.get("dateMode"), str) else "official"
    estimated = raw.get("estimatedDate") if isinstance(raw.get("estimatedDate"), str) else None
    return {
        "examType": exam_type or "regular",
        "dateMode": date_mode if date_mode in {"official", "estimated", "none"} else "official",
        "estimatedDate": estimated[:10] if estimated else None,
    }


def resolve_student_schedule(session: Session, user: User) -> dict[str, Any]:
    types = {item.slug: item for item in ensure_exam_types(session)}
    regular = types.get("regular")
    period = current_period(session, published_only=True)
    profile = user.profile
    codes = [item for item in (profile.module_codes or []) if isinstance(item, str)] if profile else []
    if period is None:
        return {
            "period": None,
            "examTypes": [exam_type_out(item) for item in types.values() if item.is_active],
            "modules": [],
            "sittings": [],
            "dates": [],
            "nextDate": None,
            "source": "none",
            "reminders": [],
            "revisionStart": profile.revision_start.isoformat() if profile and profile.revision_start else None,
        }

    query = select(Module).options(
        joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme)
    )
    modules = list(session.scalars(query.where(Module.code.in_(codes)).order_by(Module.code)).unique()) if codes else []
    module_ids = [item.id for item in modules]
    slots = list(
        session.scalars(
            select(ModuleExamSlot).where(
                ModuleExamSlot.period_id == period.id,
                ModuleExamSlot.module_id.in_(module_ids),
            )
        )
        if module_ids
        else []
    )
    slot_by_key = {(row.module_id, row.exam_type_id): row for row in slots}
    schedules = list(
        session.scalars(
            select(ProgramExamSchedule)
            .options(joinedload(ProgramExamSchedule.programme))
            .where(ProgramExamSchedule.period_id == period.id)
        ).unique()
    )
    schedule_by_key = {(row.programme_id, row.exam_type_id): row for row in schedules}

    sittings = []
    for module in modules:
        programme_id = programme_id_for_module(module)
        for exam_type in types.values():
            if not exam_type.is_active:
                continue
            slot = slot_by_key.get((module.id, exam_type.id))
            schedule = schedule_by_key.get((programme_id, exam_type.id)) if programme_id else None
            if slot:
                exam_date = _iso(slot.exam_date)
                sittings.append(
                    {
                        "code": module.code,
                        "examType": exam_type.slug,
                        "examTypeName": exam_type.name,
                        "source": "module",
                        "examDate": exam_date,
                        "examTime": _hhmm(slot.exam_time),
                        "windowStart": exam_date,
                        "windowEnd": exam_date,
                        "official": True,
                    }
                )
            elif schedule:
                sittings.append(
                    {
                        "code": module.code,
                        "examType": exam_type.slug,
                        "examTypeName": exam_type.name,
                        "source": "program",
                        "examDate": None,
                        "examTime": None,
                        "windowStart": _iso(schedule.start_date),
                        "windowEnd": _iso(schedule.end_date),
                        "official": True,
                    }
                )

    items = []
    dates: list[str] = []
    for module in modules:
        plan = student_plan_for(profile, module.code)
        exam_type = types.get(str(plan["examType"])) or regular
        programme_id = programme_id_for_module(module)
        slot = slot_by_key.get((module.id, exam_type.id)) if exam_type else None
        schedule = schedule_by_key.get((programme_id, exam_type.id)) if programme_id and exam_type else None
        estimated = plan["estimatedDate"]
        if slot:
            source = "module"
            exam_date = _iso(slot.exam_date)
            exam_time = _hhmm(slot.exam_time)
            window_start = exam_date
            window_end = exam_date
            official = True
        elif schedule:
            source = "program"
            exam_date = None
            exam_time = None
            window_start = _iso(schedule.start_date)
            window_end = _iso(schedule.end_date)
            official = True
        elif estimated:
            source = "estimated"
            exam_date = estimated
            exam_time = None
            window_start = exam_date
            window_end = exam_date
            official = False
        else:
            source = "unpublished"
            exam_date = None
            exam_time = None
            window_start = None
            window_end = None
            official = False
        if exam_date:
            dates.append(exam_date)
        items.append(
            {
                "moduleId": str(module.id),
                "code": module.code,
                "name": module.name,
                "programmeId": str(programme_id) if programme_id else None,
                "programmeName": module.semester.academic_year.programme.name
                if module.semester and module.semester.academic_year and module.semester.academic_year.programme
                else None,
                "examType": exam_type.slug if exam_type else "regular",
                "examTypeName": exam_type.name if exam_type else "Regular examinations",
                "source": source,
                "examDate": exam_date,
                "examTime": exam_time,
                "windowStart": window_start,
                "windowEnd": window_end,
                "official": official,
                "estimatedDate": estimated if not official else None,
            }
        )
    dates = sorted({item for item in dates if item})
    today = date.today().isoformat()
    upcoming = [item for item in dates if item >= today]
    next_date = upcoming[0] if upcoming else (dates[0] if dates else None)
    reminders = []
    for item in items:
        reminder_date = item["examDate"] or (item["windowStart"] if item["official"] else None)
        if not reminder_date:
            continue
        reminders.append(
            {
                "code": item["code"],
                "name": item["name"],
                "examDate": reminder_date,
                "examTime": item["examTime"],
                "source": item["source"],
                "official": item["official"],
                "examTypeName": item["examTypeName"],
                "windowStart": item["windowStart"],
                "windowEnd": item["windowEnd"],
            }
        )
    reminders.sort(key=lambda item: item.get("examDate") or "")
    source = "unpublished"
    if any(item["source"] == "module" for item in items):
        source = "module"
    elif any(item["source"] == "program" for item in items):
        source = "program"
    elif any(item["source"] == "estimated" for item in items):
        source = "estimated"
    return {
        "period": period_out(period),
        "examTypes": [exam_type_out(item) for item in types.values() if item.is_active],
        "modules": items,
        "sittings": sittings,
        "dates": dates,
        "nextDate": next_date,
        "source": source,
        "reminders": reminders,
        "revisionStart": profile.revision_start.isoformat() if profile and profile.revision_start else None,
    }
