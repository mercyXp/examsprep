from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.access import load_scope
from app.announcements import load_announcement, student_can_see, student_feed
from app.calendar import resolve_student_schedule
from app.course_selection import (
    ACTIVE_LIMIT,
    CourseSelectionError,
    deselect_module,
    published_modules,
    select_module,
)
from app.db import get_session
from app.models import AcademicYear, Chapter, Lesson, LessonProgress, LessonVersion, Module, Semester, User
from app.profile import ensure_profile
from app.models.comms import AnnouncementRead
from app.models.enums import ContentStatus
from app.security import STAFF_ROLES, require_user, role_slugs

router = APIRouter(prefix="/api/learn", tags=["learn"])


class ProgressIn(BaseModel):
    current_slide_index: int = Field(ge=0)
    revealed_units: int = Field(ge=0)
    check_results: dict[str, Any] = Field(default_factory=dict)
    completed: bool = False


class SelectionIn(BaseModel):
    code: str = Field(min_length=2, max_length=32)


def load_lesson(session: Session, lesson_id: uuid.UUID) -> Lesson | None:
    return session.scalars(
        select(Lesson)
        .options(
            joinedload(Lesson.module),
            joinedload(Lesson.chapter),
            joinedload(Lesson.published_version),
            selectinload(Lesson.versions),
        )
        .where(Lesson.id == lesson_id)
    ).unique().one_or_none()


def _student_codes(user: User, *, include_history: bool) -> list[str]:
    profile = user.profile
    if profile is None:
        return []
    active = [item for item in (profile.module_codes or []) if isinstance(item, str)]
    if not include_history:
        return active
    history = [item for item in (profile.module_history or []) if isinstance(item, str) and item not in active]
    return [*active, *history]


def visible_module_ids(session: Session, user: User, *, include_history: bool = False) -> set[uuid.UUID] | None:
    """None means all published modules. A set filters. Empty set means none."""
    roles = set(role_slugs(user))
    if STAFF_ROLES.intersection(roles):
        scope = load_scope(session, user)
        if scope.super_admin:
            return None
        return set(scope.module_ids or set())
    codes = _student_codes(user, include_history=include_history)
    if codes:
        return set(session.scalars(select(Module.id).where(Module.code.in_(codes), Module.status == ContentStatus.PUBLISHED)))
    return set()


def _require_student(user: User) -> None:
    roles = set(role_slugs(user))
    if "student" not in roles or STAFF_ROLES.intersection(roles):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Course selection is for students.")


def published_lesson(session: Session, lesson_id: uuid.UUID, user: User, *, preview: bool = False) -> Lesson:
    lesson = load_lesson(session, lesson_id)
    staff = bool(STAFF_ROLES.intersection(role_slugs(user)))
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")
    allowed = visible_module_ids(session, user, include_history=True)
    if allowed is not None and lesson.module_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")
    if lesson.status == ContentStatus.PUBLISHED and lesson.published_version_id is not None:
        return lesson
    if preview and staff:
        scope = load_scope(session, user)
        if scope.allows_module(lesson.module_id):
            return lesson
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")


def progress_out(row: LessonProgress | None) -> dict[str, Any]:
    if row is None:
        return {
            "currentSlideIndex": 0,
            "revealedUnits": 0,
            "checkResults": {},
            "completedAt": None,
            "completed": False,
        }
    return {
        "currentSlideIndex": row.current_slide_index,
        "revealedUnits": row.revealed_units,
        "checkResults": row.check_results or {},
        "completedAt": row.completed_at.isoformat() if row.completed_at else None,
        "completed": row.completed_at is not None,
    }


def student_slides(version: LessonVersion | None) -> list:
    return list(version.slides or []) if version else []


@router.get("/exam-schedule")
def exam_schedule(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    return {"ok": True, **resolve_student_schedule(session, user)}


@router.get("/modules")
def list_modules(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    query = (
        select(Module)
        .options(joinedload(Module.semester).joinedload(Semester.academic_year))
        .where(Module.status == ContentStatus.PUBLISHED)
        .order_by(Module.code)
    )
    allowed = visible_module_ids(session, user)
    if allowed is not None:
        if not allowed:
            return {"ok": True, "items": []}
        query = query.where(Module.id.in_(allowed))
    modules = list(session.scalars(query).unique())
    published = list(
        session.scalars(
            select(Lesson).where(Lesson.status == ContentStatus.PUBLISHED, Lesson.published_version_id.is_not(None))
        )
    )
    progress_rows = list(session.scalars(select(LessonProgress).where(LessonProgress.user_id == user.id)))
    completed_ids = {row.lesson_id for row in progress_rows if row.completed_at}
    started = {row.lesson_id: row for row in progress_rows}
    by_module: dict[uuid.UUID, list[Lesson]] = {}
    for lesson in published:
        by_module.setdefault(lesson.module_id, []).append(lesson)
    items = []
    for module in modules:
        lessons = sorted(by_module.get(module.id, []), key=lambda item: item.position)
        total = len(lessons)
        done = sum(1 for lesson in lessons if lesson.id in completed_ids)
        continue_lesson = next((lesson for lesson in lessons if lesson.id in started and lesson.id not in completed_ids), None)
        if continue_lesson is None:
            continue_lesson = next((lesson for lesson in lessons if lesson.id not in completed_ids), None)
        semester = module.semester
        year = semester.academic_year if semester is not None else None
        items.append(
            {
                "id": str(module.id),
                "code": module.code,
                "name": module.name,
                "description": module.description or "",
                "objectives": module.objectives or [],
                "coverColor": module.cover_color,
                "yearNumber": year.year_number if year is not None else None,
                "semesterNumber": semester.semester_number if semester is not None else None,
                "totalLessons": total,
                "completedLessons": done,
                "progressPercent": int(round((done / total) * 100)) if total else 0,
                "continueLessonId": str(continue_lesson.id) if continue_lesson else None,
            }
        )
    return {"ok": True, "items": items}


def _catalogue_payload(session: Session, user: User) -> dict[str, Any]:
    profile = ensure_profile(session, user)
    active = [item for item in (profile.module_codes or []) if isinstance(item, str)]
    items = []
    for module in published_modules(session, profile.programme):
        semester = module.semester
        year = semester.academic_year if semester is not None else None
        items.append(
            {
                "id": str(module.id),
                "code": module.code,
                "name": module.name,
                "yearNumber": year.year_number if year is not None else None,
                "semesterNumber": semester.semester_number if semester is not None else None,
                "selected": module.code in active,
            }
        )
    return {
        "ok": True,
        "programme": profile.programme,
        "yearOfStudy": profile.year_of_study,
        "semesterOfStudy": profile.semester_of_study,
        "limit": ACTIVE_LIMIT,
        "activeCount": len(active),
        "items": items,
    }


@router.get("/catalogue")
def course_catalogue(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    _require_student(user)
    return _catalogue_payload(session, user)


@router.post("/selections")
def add_course(body: SelectionIn, user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    _require_student(user)
    profile = ensure_profile(session, user)
    try:
        select_module(session, profile, body.code.strip())
    except CourseSelectionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
    session.flush()
    return _catalogue_payload(session, user)


@router.delete("/selections/{code}")
def remove_course(code: str, user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    _require_student(user)
    profile = ensure_profile(session, user)
    try:
        deselect_module(profile, code)
    except CourseSelectionError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
    session.flush()
    return _catalogue_payload(session, user)


@router.get("/history")
def learning_history(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    _require_student(user)
    profile = ensure_profile(session, user)
    history = [item for item in (profile.module_history or []) if isinstance(item, str)]
    modules = [module for module in published_modules(session, profile.programme) if module.code in history]
    if not modules:
        return {"ok": True, "items": []}
    published = list(
        session.scalars(
            select(Lesson).where(
                Lesson.module_id.in_([module.id for module in modules]),
                Lesson.status == ContentStatus.PUBLISHED,
                Lesson.published_version_id.is_not(None),
            )
        )
    )
    progress_rows = list(session.scalars(select(LessonProgress).where(LessonProgress.user_id == user.id)))
    completed_ids = {row.lesson_id for row in progress_rows if row.completed_at}
    by_module: dict[uuid.UUID, list[Lesson]] = {}
    for lesson in published:
        by_module.setdefault(lesson.module_id, []).append(lesson)
    items = []
    for module in modules:
        lessons = by_module.get(module.id, [])
        total = len(lessons)
        done = sum(1 for lesson in lessons if lesson.id in completed_ids)
        semester = module.semester
        year = semester.academic_year if semester is not None else None
        items.append(
            {
                "id": str(module.id),
                "code": module.code,
                "name": module.name,
                "yearNumber": year.year_number if year is not None else None,
                "semesterNumber": semester.semester_number if semester is not None else None,
                "totalLessons": total,
                "completedLessons": done,
                "progressPercent": int(round((done / total) * 100)) if total else 0,
            }
        )
    return {"ok": True, "items": items}


@router.get("/modules/{module_id}")
def module_overview(module_id: uuid.UUID, user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    module = session.get(Module, module_id)
    if module is None or module.status != ContentStatus.PUBLISHED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    allowed = visible_module_ids(session, user, include_history=True)
    if allowed is not None and module.id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
    chapters = list(session.scalars(select(Chapter).where(Chapter.module_id == module.id).order_by(Chapter.position, Chapter.title)))
    lessons = list(
        session.scalars(
            select(Lesson)
            .where(
                Lesson.module_id == module.id,
                Lesson.status == ContentStatus.PUBLISHED,
                Lesson.published_version_id.is_not(None),
            )
            .order_by(Lesson.position, Lesson.title)
        )
    )
    progress_rows = {
        row.lesson_id: row
        for row in session.scalars(
            select(LessonProgress).where(LessonProgress.user_id == user.id, LessonProgress.lesson_id.in_([item.id for item in lessons] or [uuid.uuid4()]))
        )
    }
    chapter_payload = []
    used: set[uuid.UUID] = set()
    for chapter in chapters:
        chapter_lessons = [item for item in lessons if item.chapter_id == chapter.id]
        used.update(item.id for item in chapter_lessons)
        chapter_payload.append(
            {
                "id": str(chapter.id),
                "title": chapter.title,
                "description": chapter.description or "",
                "lessons": [
                    {
                        "id": str(item.id),
                        "title": item.title,
                        "description": item.description or "",
                        "durationMinutes": item.duration_minutes,
                        "difficulty": item.difficulty,
                        "completed": progress_rows.get(item.id) is not None and progress_rows[item.id].completed_at is not None,
                        "currentSlideIndex": progress_rows[item.id].current_slide_index if item.id in progress_rows else 0,
                    }
                    for item in chapter_lessons
                ],
            }
        )
    leftover = [item for item in lessons if item.id not in used]
    if leftover:
        chapter_payload.append(
            {
                "id": "unassigned",
                "title": "Lessons",
                "description": "",
                "lessons": [
                    {
                        "id": str(item.id),
                        "title": item.title,
                        "description": item.description or "",
                        "durationMinutes": item.duration_minutes,
                        "difficulty": item.difficulty,
                        "completed": progress_rows.get(item.id) is not None and progress_rows[item.id].completed_at is not None,
                        "currentSlideIndex": progress_rows[item.id].current_slide_index if item.id in progress_rows else 0,
                    }
                    for item in leftover
                ],
            }
        )
    total = len(lessons)
    done = sum(1 for item in lessons if item.id in progress_rows and progress_rows[item.id].completed_at)
    return {
        "ok": True,
        "item": {
            "id": str(module.id),
            "code": module.code,
            "name": module.name,
            "description": module.description or "",
            "objectives": module.objectives or [],
            "coverColor": module.cover_color,
            "totalLessons": total,
            "completedLessons": done,
            "progressPercent": int(round((done / total) * 100)) if total else 0,
            "chapters": chapter_payload,
        },
    }


@router.get("/lessons/{lesson_id}")
def get_lesson(
    lesson_id: uuid.UUID,
    preview: bool = False,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = published_lesson(session, lesson_id, user, preview=preview)
    siblings = list(
        session.scalars(
            select(Lesson)
            .where(
                Lesson.module_id == lesson.module_id,
                Lesson.status == ContentStatus.PUBLISHED,
                Lesson.published_version_id.is_not(None),
            )
            .order_by(Lesson.position, Lesson.title)
        )
    )
    index = next((i for i, item in enumerate(siblings) if item.id == lesson.id), 0)
    next_lesson = siblings[index + 1] if index + 1 < len(siblings) else None
    prev_lesson = siblings[index - 1] if index > 0 else None
    progress = session.scalar(select(LessonProgress).where(LessonProgress.user_id == user.id, LessonProgress.lesson_id == lesson.id))
    version = lesson.published_version
    if preview and (version is None or not version.slides):
        versions = sorted(lesson.versions, key=lambda item: item.version_number)
        version = versions[-1] if versions else None
    return {
        "ok": True,
        "item": {
            "id": str(lesson.id),
            "title": lesson.title,
            "description": lesson.description or "",
            "objectives": lesson.objectives or [],
            "durationMinutes": lesson.duration_minutes,
            "difficulty": lesson.difficulty,
            "moduleId": str(lesson.module_id),
            "moduleCode": lesson.module.code if lesson.module else None,
            "moduleName": lesson.module.name if lesson.module else None,
            "chapterId": str(lesson.chapter_id) if lesson.chapter_id else None,
            "chapterTitle": lesson.chapter.title if lesson.chapter else None,
            "slides": student_slides(version),
            "nextLessonId": str(next_lesson.id) if next_lesson else None,
            "previousLessonId": str(prev_lesson.id) if prev_lesson else None,
            "progress": progress_out(progress),
        },
    }


@router.put("/lessons/{lesson_id}/progress")
def save_progress(
    lesson_id: uuid.UUID,
    body: ProgressIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = published_lesson(session, lesson_id, user)
    version = lesson.published_version
    slides = student_slides(version)
    slide_count = max(len(slides), 1)
    slide_index = min(body.current_slide_index, slide_count - 1)
    row = session.scalar(select(LessonProgress).where(LessonProgress.user_id == user.id, LessonProgress.lesson_id == lesson.id))
    if row is None:
        row = LessonProgress(user_id=user.id, lesson_id=lesson.id)
        session.add(row)
    row.last_viewed_version_id = lesson.published_version_id
    row.current_slide_index = slide_index
    row.revealed_units = body.revealed_units
    row.check_results = body.check_results or {}
    required_checks = [
        block["id"]
        for slide in slides
        for block in slide.get("blocks") or []
        if block.get("type") == "check"
    ]
    checks_passed = all(row.check_results.get(block_id, {}).get("correct") is True for block_id in required_checks)
    at_end = slide_index >= len(slides) - 1 if slides else True
    if body.completed and at_end and checks_passed:
        row.completed_at = row.completed_at or datetime.now(UTC)
    elif not checks_passed:
        row.completed_at = None
    session.flush()
    return {"ok": True, "progress": progress_out(row)}


@router.get("/announcements")
def list_student_announcements(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    return {"ok": True, "items": student_feed(session, user)}


@router.post("/announcements/{announcement_id}/read")
def mark_announcement_read(
    announcement_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    row = load_announcement(session, announcement_id)
    if not student_can_see(session, row, user.profile):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found.")
    existing = session.scalar(
        select(AnnouncementRead).where(
            AnnouncementRead.announcement_id == announcement_id,
            AnnouncementRead.user_id == user.id,
        )
    )
    if existing is None:
        session.add(AnnouncementRead(announcement_id=announcement_id, user_id=user.id))
        session.flush()
    return {"ok": True}
