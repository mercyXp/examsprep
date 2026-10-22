from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.cms import (
    DIFFICULTIES,
    PUBLISH_STATUSES,
    clean_objectives,
    clean_slides,
    duplicate_slides,
    lesson_is_complete,
    slides_plain_text,
)
from app.access import (
    AccessScope,
    ensure_program_module,
    first_semester_for_programme,
    programme_id_for_module,
    scope_out,
    staff_scope,
    write_audit,
)
from app.announcements import (
    admin_query,
    announcement_out,
    effective_status,
    fill_announcement,
    load_announcement,
    require_announce,
)
from app.calendar import (
    ensure_exam_types,
    exam_type_out,
    load_exam_type,
    load_period,
    parse_date,
    parse_time,
    require_range,
    schedule_payload,
    set_current_period,
)
from app.db import get_session
from app.media import store_upload
from app.models import (
    AcademicPeriod,
    AcademicYear,
    Announcement,
    ExamType,
    Chapter,
    Lesson,
    LessonProgress,
    LessonVersion,
    Module,
    ModuleExamSlot,
    Programme,
    ProgramExamSchedule,
    Quiz,
    Role,
    Semester,
    StudentProfile,
    User,
    UserRole,
)
from app.models.access import ContentCreatorAssignment, ProgramAdminAssignment, ProgramModule
from app.models.enums import ContentStatus, UserStatus, VersionStatus
from app.security import role_slugs

router = APIRouter(prefix="/api/admin", tags=["admin"])
SCOPE = Depends(staff_scope)


class ModuleIn(BaseModel):
    code: str
    name: str
    description: str = ""
    objectives: list[str] = Field(default_factory=list)
    cover_color: str | None = None
    status: str = "PUBLISHED"
    programme_id: uuid.UUID | None = None
    semester_id: uuid.UUID | None = None


class ChapterIn(BaseModel):
    module_id: uuid.UUID
    title: str
    description: str = ""
    status: str = "DRAFT"


class LessonMetaIn(BaseModel):
    title: str
    description: str = ""
    objectives: list[str] = Field(default_factory=list)
    duration_minutes: int | None = None
    difficulty: str | None = None
    module_id: uuid.UUID
    chapter_id: uuid.UUID | None = None
    status: str = "DRAFT"


class LessonContentIn(BaseModel):
    slides: list[dict[str, Any]] = Field(default_factory=list)


class ReorderIn(BaseModel):
    ids: list[uuid.UUID]


class StudentStatusIn(BaseModel):
    status: str


class ProgramAdminIn(BaseModel):
    user_id: uuid.UUID
    programme_id: uuid.UUID


class CreatorAssignIn(BaseModel):
    user_id: uuid.UUID
    programme_id: uuid.UUID
    module_id: uuid.UUID


class ReviewIn(BaseModel):
    decision: str
    reason: str = ""


def parse_status(value: str | None, *, default: ContentStatus) -> ContentStatus:
    raw = (value or default.value).upper()
    if raw not in PUBLISH_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose Draft, Published, Unpublished, or Archived.")
    return ContentStatus(raw)


def parse_uuid(value: str | uuid.UUID, label: str) -> uuid.UUID:
    try:
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid {label}.") from error


def get_module(session: Session, module_id: uuid.UUID) -> Module:
    row = session.get(Module, module_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found.")
    return row


def get_chapter(session: Session, chapter_id: uuid.UUID) -> Chapter:
    row = session.get(Chapter, chapter_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chapter not found.")
    return row


def get_lesson(session: Session, lesson_id: uuid.UUID) -> Lesson:
    row = session.scalars(
        select(Lesson)
        .options(selectinload(Lesson.versions), joinedload(Lesson.module), joinedload(Lesson.chapter))
        .where(Lesson.id == lesson_id)
    ).unique().one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")
    return row


def latest_version(lesson: Lesson) -> LessonVersion | None:
    if not lesson.versions:
        return None
    return max(lesson.versions, key=lambda item: item.version_number)


def next_position(session: Session, model, **filters: Any) -> int:
    query = select(func.coalesce(func.max(model.position), -1)).filter_by(**filters)
    current = session.scalar(query)
    return int(current if current is not None else -1) + 1


def module_out(module: Module, *, chapter_count: int = 0, lesson_count: int = 0, published_lessons: int = 0) -> dict[str, Any]:
    semester = module.semester
    year = semester.academic_year if semester else None
    programme = year.programme if year else None
    return {
        "id": str(module.id),
        "code": module.code,
        "name": module.name,
        "description": module.description or "",
        "objectives": module.objectives or [],
        "coverColor": module.cover_color,
        "status": module.status.value,
        "credits": module.credits,
        "semesterId": str(module.semester_id),
        "programmeId": str(programme.id) if programme else None,
        "programmeName": programme.name if programme else None,
        "yearNumber": year.year_number if year else None,
        "semesterNumber": semester.semester_number if semester else None,
        "chapterCount": chapter_count,
        "lessonCount": lesson_count,
        "publishedLessons": published_lessons,
        "createdAt": module.created_at.isoformat() if module.created_at else None,
        "updatedAt": module.updated_at.isoformat() if module.updated_at else None,
    }


def scoped_modules(session: Session, scope: AccessScope, q: str = ""):
    query = select(Module).options(
        joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme)
    )
    if not scope.super_admin:
        if not scope.module_ids:
            return []
        query = query.where(Module.id.in_(scope.module_ids))
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(Module.code.ilike(like), Module.name.ilike(like)))
    return list(session.scalars(query.order_by(Module.code)).unique())


def chapter_out(chapter: Chapter, *, lesson_count: int = 0) -> dict[str, Any]:
    return {
        "id": str(chapter.id),
        "moduleId": str(chapter.module_id),
        "title": chapter.title,
        "description": chapter.description or "",
        "position": chapter.position,
        "status": chapter.status.value,
        "lessonCount": lesson_count,
        "updatedAt": chapter.updated_at.isoformat() if chapter.updated_at else None,
    }


def lesson_out(lesson: Lesson, *, slides: list | None = None, include_content: bool = False) -> dict[str, Any]:
    version = latest_version(lesson)
    payload = {
        "id": str(lesson.id),
        "moduleId": str(lesson.module_id),
        "chapterId": str(lesson.chapter_id) if lesson.chapter_id else None,
        "title": lesson.title,
        "description": lesson.description or "",
        "objectives": lesson.objectives or [],
        "durationMinutes": lesson.duration_minutes,
        "difficulty": lesson.difficulty,
        "position": lesson.position,
        "status": lesson.status.value,
        "updatedAt": lesson.updated_at.isoformat() if lesson.updated_at else None,
        "moduleCode": lesson.module.code if lesson.module else None,
        "moduleName": lesson.module.name if lesson.module else None,
        "chapterTitle": lesson.chapter.title if lesson.chapter else None,
        "slideCount": len(version.slides or []) if version else 0,
        "versionNumber": version.version_number if version else 0,
    }
    if include_content:
        payload["slides"] = slides if slides is not None else (version.slides if version else [])
    return payload


@router.get("/scope")
def current_scope(scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    return scope_out(session, scope)


@router.get("/overview")
def overview(scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    module_filter = None if scope.super_admin else (scope.module_ids or set())
    student_query = select(func.count()).select_from(StudentProfile)
    if not scope.super_admin and scope.can_manage_students:
        names = [item.name for item in session.scalars(select(Programme).where(Programme.id.in_(scope.programme_ids)))]
        student_query = student_query.where(StudentProfile.programme.in_(names or ["__none__"]))
    elif not scope.can_manage_students:
        student_query = student_query.where(StudentProfile.user_id == None)  # noqa: E711
    total_students = session.scalar(student_query) or 0
    active_query = (
        select(func.count())
        .select_from(StudentProfile)
        .join(User, User.id == StudentProfile.user_id)
        .where(User.status == UserStatus.ACTIVE)
    )
    if not scope.super_admin and scope.can_manage_students:
        names = [item.name for item in session.scalars(select(Programme).where(Programme.id.in_(scope.programme_ids)))]
        active_query = active_query.where(StudentProfile.programme.in_(names or ["__none__"]))
    elif not scope.can_manage_students:
        active_query = active_query.where(StudentProfile.user_id == None)  # noqa: E711
    active_students = session.scalar(active_query) or 0
    module_query = select(func.count()).select_from(Module)
    lesson_query = select(func.count()).select_from(Lesson).where(Lesson.status == ContentStatus.PUBLISHED)
    if module_filter is not None:
        module_query = module_query.where(Module.id.in_(module_filter or [uuid.UUID(int=0)]))
        lesson_query = lesson_query.where(Lesson.module_id.in_(module_filter or [uuid.UUID(int=0)]))
    total_modules = session.scalar(module_query) or 0
    published_lessons = session.scalar(lesson_query) or 0
    total_quizzes = session.scalar(select(func.count()).select_from(Quiz)) or 0
    recent_q = select(Lesson).options(joinedload(Lesson.module)).order_by(Lesson.updated_at.desc()).limit(6)
    if module_filter is not None:
        recent_q = recent_q.where(Lesson.module_id.in_(module_filter or [uuid.UUID(int=0)]))
    recent_lessons = list(session.scalars(recent_q))
    recent_activity = [
        {
            "id": str(item.id),
            "title": item.title,
            "status": item.status.value,
            "moduleCode": item.module.code if item.module else None,
            "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
        }
        for item in recent_lessons
    ]
    return {
        "ok": True,
        "stats": {
            "totalStudents": total_students,
            "activeStudents": active_students,
            "totalModules": total_modules,
            "publishedLessons": published_lessons,
            "totalQuizzes": total_quizzes,
        },
        "recentLessons": recent_activity,
        "recentActivity": recent_activity,
    }


def _scoped_student_ids(session: Session, scope: AccessScope):
    query = select(User.id).join(StudentProfile, StudentProfile.user_id == User.id)
    if not scope.super_admin:
        names = [item.name for item in session.scalars(select(Programme).where(Programme.id.in_(scope.programme_ids)))]
        query = query.where(StudentProfile.programme.in_(names or ["__none__"]))
    return query


@router.get("/students")
def list_students(
    q: str = "",
    status_filter: str = Query("", alias="status"),
    programme: str = "",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_students()
    scoped = _scoped_student_ids(session, scope)
    summary = {
        "total": session.scalar(select(func.count()).select_from(scoped.subquery())) or 0,
        "active": session.scalar(select(func.count()).select_from(scoped.where(User.status == UserStatus.ACTIVE).subquery())) or 0,
        "withProgress": session.scalar(
            select(func.count(func.distinct(LessonProgress.user_id))).where(LessonProgress.user_id.in_(scoped))
        )
        or 0,
        "completedLessons": session.scalar(
            select(func.count(func.distinct(LessonProgress.user_id))).where(
                LessonProgress.user_id.in_(scoped),
                LessonProgress.completed_at.is_not(None),
            )
        )
        or 0,
    }
    query = select(User).options(joinedload(User.profile), joinedload(User.roles).joinedload(UserRole.role)).join(User.profile)
    if not scope.super_admin:
        names = [item.name for item in session.scalars(select(Programme).where(Programme.id.in_(scope.programme_ids)))]
        query = query.where(StudentProfile.programme.in_(names or ["__none__"]))
    if status_filter.strip():
        try:
            query = query.where(User.status == UserStatus(status_filter.strip().lower()))
        except ValueError as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose active, pending, or suspended.") from error
    if programme.strip():
        query = query.where(StudentProfile.programme == programme.strip())
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(like), User.email.ilike(like)))
    total = session.scalar(select(func.count()).select_from(query.order_by(None).subquery())) or 0
    rows = list(
        session.scalars(query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).unique()
    )
    items = []
    for user in rows:
        profile = user.profile
        started, completed = session.execute(
            select(func.count(), func.count(LessonProgress.completed_at)).where(LessonProgress.user_id == user.id)
        ).one()
        started, completed = int(started or 0), int(completed or 0)
        items.append(
            {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "status": user.status.value,
                "programme": profile.programme if profile else None,
                "yearOfStudy": profile.year_of_study if profile else None,
                "semesterOfStudy": profile.semester_of_study if profile else None,
                "moduleCodes": profile.module_codes or [] if profile else [],
                "onboardingCompleted": bool(profile.onboarding_completed) if profile else False,
                "lessonsStarted": started,
                "lessonsCompleted": completed,
                "createdAt": user.created_at.isoformat() if user.created_at else None,
                "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
            }
        )
    return {"ok": True, "total": total, "page": page, "pageSize": page_size, "summary": summary, "items": items}


@router.get("/students/{student_id}")
def student_detail(student_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_students()
    user = session.scalars(
        select(User).options(joinedload(User.profile), joinedload(User.roles).joinedload(UserRole.role)).where(User.id == student_id)
    ).unique().one_or_none()
    if user is None or user.profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    if not scope.super_admin:
        names = [item.name for item in session.scalars(select(Programme).where(Programme.id.in_(scope.programme_ids)))]
        if user.profile.programme not in names:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    progress = list(
        session.scalars(
            select(LessonProgress).options(joinedload(LessonProgress.lesson).joinedload(Lesson.module)).where(LessonProgress.user_id == user.id)
        )
    )
    profile = user.profile
    return {
        "ok": True,
        "student": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "status": user.status.value,
            "programme": profile.programme,
            "yearOfStudy": profile.year_of_study,
            "semesterOfStudy": profile.semester_of_study,
            "moduleCodes": profile.module_codes or [],
            "onboardingCompleted": bool(profile.onboarding_completed),
            "createdAt": user.created_at.isoformat() if user.created_at else None,
            "lastLoginAt": user.last_login_at.isoformat() if user.last_login_at else None,
        },
        "progress": [
            {
                "lessonId": str(item.lesson_id),
                "title": item.lesson.title if item.lesson else None,
                "moduleCode": item.lesson.module.code if item.lesson and item.lesson.module else None,
                "completedAt": item.completed_at.isoformat() if item.completed_at else None,
                "currentSlideIndex": item.current_slide_index,
            }
            for item in progress
        ],
    }


@router.patch("/students/{student_id}")
def update_student(
    student_id: uuid.UUID,
    body: StudentStatusIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_students()
    user = session.get(User, student_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found.")
    try:
        user.status = UserStatus(body.status.lower())
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose active, pending, or suspended.") from error
    session.flush()
    return {"ok": True, "id": str(user.id), "status": user.status.value}


@router.get("/modules")
def list_modules(q: str = "", scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    modules = scoped_modules(session, scope, q)
    counts = {
        row[0]: row
        for row in session.execute(
            select(
                Lesson.module_id,
                func.count(),
                func.count().filter(Lesson.status == ContentStatus.PUBLISHED),
            ).group_by(Lesson.module_id)
        )
    }
    chapter_counts = dict(session.execute(select(Chapter.module_id, func.count()).group_by(Chapter.module_id)).all())
    items = []
    for module in modules:
        total, published = 0, 0
        if module.id in counts:
            _id, total, published = counts[module.id]
        items.append(
            module_out(
                module,
                chapter_count=int(chapter_counts.get(module.id, 0)),
                lesson_count=int(total),
                published_lessons=int(published),
            )
        )
    return {"ok": True, "items": items}


@router.post("/modules")
def create_module(body: ModuleIn, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    if not scope.can_manage_catalogue:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a program administrator can create modules.")
    code = body.code.strip().upper()
    name = body.name.strip()
    if not code or not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Module code and name are required.")
    semester_id = body.semester_id
    programme_id = body.programme_id
    if semester_id is None:
        if programme_id is None and not scope.super_admin and len(scope.programme_ids) == 1:
            programme_id = next(iter(scope.programme_ids))
        if programme_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a programme for this module.")
        scope.require_programme(programme_id)
        semester = first_semester_for_programme(session, programme_id)
        if semester is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Create a semester before adding modules.")
        semester_id = semester.id
    else:
        semester = session.get(Semester, semester_id)
        if semester is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Semester not found.")
        year = session.get(AcademicYear, semester.academic_year_id)
        if year:
            scope.require_programme(year.programme_id)
            programme_id = year.programme_id
    clash = session.scalar(
        select(Module)
        .join(Semester, Module.semester_id == Semester.id)
        .join(AcademicYear, Semester.academic_year_id == AcademicYear.id)
        .where(AcademicYear.programme_id == programme_id, Module.code == code)
    ) if programme_id else None
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "A module with that code already exists in this programme.")
    module = Module(
        semester_id=semester_id,
        code=code,
        name=name,
        description=body.description.strip(),
        objectives=clean_objectives(body.objectives),
        cover_color=body.cover_color,
        status=parse_status(body.status, default=ContentStatus.PUBLISHED),
    )
    session.add(module)
    session.flush()
    module = session.scalars(
        select(Module).options(joinedload(Module.semester).joinedload(Semester.academic_year)).where(Module.id == module.id)
    ).unique().one()
    ensure_program_module(session, module)
    write_audit(session, scope.user, "module.create", "module", module.id, {"code": module.code})
    return {"ok": True, "item": module_out(module)}


@router.patch("/modules/{module_id}")
def update_module(
    module_id: uuid.UUID,
    body: ModuleIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_module(module_id, catalogue=True)
    module = get_module(session, module_id)
    code = body.code.strip().upper()
    name = body.name.strip()
    if not code or not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Module code and name are required.")
    programme_id = programme_id_for_module(module)
    clash_q = (
        select(Module)
        .join(Semester, Module.semester_id == Semester.id)
        .join(AcademicYear, Semester.academic_year_id == AcademicYear.id)
        .where(Module.code == code, Module.id != module.id)
    )
    if programme_id:
        clash_q = clash_q.where(AcademicYear.programme_id == programme_id)
    clash = session.scalar(clash_q)
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "A module with that code already exists in this programme.")
    module.code = code
    module.name = name
    module.description = body.description.strip()
    module.objectives = clean_objectives(body.objectives)
    module.cover_color = body.cover_color
    module.status = parse_status(body.status, default=module.status)
    session.flush()
    write_audit(session, scope.user, "module.update", "module", module.id, {"code": module.code})
    return {"ok": True, "item": module_out(module)}


@router.get("/chapters")
def list_chapters(module_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_module(module_id)
    get_module(session, module_id)
    chapters = list(session.scalars(select(Chapter).where(Chapter.module_id == module_id).order_by(Chapter.position, Chapter.title)))
    counts = dict(session.execute(select(Lesson.chapter_id, func.count()).where(Lesson.module_id == module_id).group_by(Lesson.chapter_id)).all())
    return {"ok": True, "items": [chapter_out(item, lesson_count=int(counts.get(item.id, 0))) for item in chapters]}


@router.post("/chapters")
def create_chapter(body: ChapterIn, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_module(body.module_id)
    get_module(session, body.module_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Chapter title is required.")
    chapter = Chapter(
        module_id=body.module_id,
        title=title,
        description=body.description.strip(),
        status=parse_status(body.status, default=ContentStatus.DRAFT),
        position=next_position(session, Chapter, module_id=body.module_id),
    )
    session.add(chapter)
    session.flush()
    write_audit(session, scope.user, "chapter.create", "chapter", chapter.id, {"title": chapter.title})
    return {"ok": True, "item": chapter_out(chapter)}


@router.patch("/chapters/{chapter_id}")
def update_chapter(
    chapter_id: uuid.UUID,
    body: ChapterIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    chapter = get_chapter(session, chapter_id)
    scope.require_module(chapter.module_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Chapter title is required.")
    chapter.title = title
    chapter.description = body.description.strip()
    chapter.status = parse_status(body.status, default=chapter.status)
    session.flush()
    write_audit(session, scope.user, "chapter.update", "chapter", chapter.id, {"title": chapter.title})
    return {"ok": True, "item": chapter_out(chapter)}


@router.delete("/chapters/{chapter_id}")
def delete_chapter(chapter_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    chapter = get_chapter(session, chapter_id)
    scope.require_module(chapter.module_id)
    lessons = list(session.scalars(select(Lesson).where(Lesson.chapter_id == chapter.id)))
    for lesson in lessons:
        lesson.chapter_id = None
    write_audit(session, scope.user, "chapter.delete", "chapter", chapter.id, {"title": chapter.title})
    session.delete(chapter)
    session.flush()
    return {"ok": True}


@router.post("/modules/{module_id}/reorder-chapters")
def reorder_chapters(
    module_id: uuid.UUID,
    body: ReorderIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_module(module_id)
    chapters = list(session.scalars(select(Chapter).where(Chapter.module_id == module_id)))
    lookup = {item.id: item for item in chapters}
    if set(body.ids) != set(lookup):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Chapter order is incomplete.")
    for index, chapter_id in enumerate(body.ids):
        lookup[chapter_id].position = index
    session.flush()
    return {"ok": True}


@router.get("/lessons")
def list_lessons(
    module_id: uuid.UUID | None = None,
    chapter_id: uuid.UUID | None = None,
    q: str = "",
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if module_id:
        scope.require_module(module_id)
    query = select(Lesson).options(joinedload(Lesson.module), joinedload(Lesson.chapter), selectinload(Lesson.versions))
    if not scope.super_admin:
        if not scope.module_ids:
            return {"ok": True, "items": []}
        query = query.where(Lesson.module_id.in_(scope.module_ids))
    if module_id:
        query = query.where(Lesson.module_id == module_id)
    if chapter_id:
        query = query.where(Lesson.chapter_id == chapter_id)
    if q.strip():
        query = query.where(Lesson.title.ilike(f"%{q.strip()}%"))
    lessons = list(session.scalars(query.order_by(Lesson.position, Lesson.title)).unique())
    return {"ok": True, "items": [lesson_out(item) for item in lessons]}


@router.post("/lessons")
def create_lesson(body: LessonMetaIn, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_module(body.module_id)
    user = scope.user
    get_module(session, body.module_id)
    if body.chapter_id:
        chapter = get_chapter(session, body.chapter_id)
        if chapter.module_id != body.module_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That chapter does not belong to this module.")
    title = body.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lesson title is required.")
    if body.difficulty and body.difficulty not in DIFFICULTIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose beginner, intermediate, or advanced.")
    lesson_status = parse_status(body.status, default=ContentStatus.DRAFT)
    if lesson_status == ContentStatus.PUBLISHED:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add slides before publishing a lesson.")
    lesson = Lesson(
        module_id=body.module_id,
        chapter_id=body.chapter_id,
        creator_id=user.id,
        title=title,
        description=body.description.strip(),
        objectives=clean_objectives(body.objectives),
        duration_minutes=body.duration_minutes,
        difficulty=body.difficulty,
        position=next_position(session, Lesson, module_id=body.module_id),
        status=ContentStatus.DRAFT,
    )
    session.add(lesson)
    session.flush()
    version = LessonVersion(
        lesson_id=lesson.id,
        version_number=1,
        body="",
        slides=[{"id": str(uuid.uuid4()), "title": "Slide 1", "blocks": []}],
        author_id=user.id,
        status=VersionStatus.DRAFT,
    )
    session.add(version)
    session.flush()
    write_audit(session, user, "lesson.create", "lesson", lesson.id, {"title": lesson.title, "moduleId": str(lesson.module_id)})
    return {"ok": True, "item": lesson_out(lesson, include_content=True, slides=version.slides)}


@router.get("/lessons/{lesson_id}")
def get_lesson_detail(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    return {"ok": True, "item": lesson_out(lesson, include_content=True)}


@router.patch("/lessons/{lesson_id}")
def update_lesson_meta(
    lesson_id: uuid.UUID,
    body: LessonMetaIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    scope.require_module(body.module_id)
    get_module(session, body.module_id)
    if body.chapter_id:
        chapter = get_chapter(session, body.chapter_id)
        if chapter.module_id != body.module_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That chapter does not belong to this module.")
    title = body.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lesson title is required.")
    if body.difficulty and body.difficulty not in DIFFICULTIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose beginner, intermediate, or advanced.")
    lesson.module_id = body.module_id
    lesson.chapter_id = body.chapter_id
    lesson.title = title
    lesson.description = body.description.strip()
    lesson.objectives = clean_objectives(body.objectives)
    lesson.duration_minutes = body.duration_minutes
    lesson.difficulty = body.difficulty
    session.flush()
    write_audit(session, scope.user, "lesson.update", "lesson", lesson.id, {"title": lesson.title})
    return {"ok": True, "item": lesson_out(lesson, include_content=True)}


@router.put("/lessons/{lesson_id}/content")
def save_lesson_content(
    lesson_id: uuid.UUID,
    body: LessonContentIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    user = scope.user
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    slides = clean_slides(body.slides)
    version = latest_version(lesson)
    if version is None:
        version = LessonVersion(lesson_id=lesson.id, version_number=1, author_id=user.id, status=VersionStatus.DRAFT)
        session.add(version)
    version.slides = slides
    version.body = slides_plain_text(slides)
    version.status = VersionStatus.DRAFT
    if lesson.status == ContentStatus.PUBLISHED:
        lesson.status = ContentStatus.DRAFT
    session.flush()
    write_audit(session, user, "lesson.save", "lesson", lesson.id, {"slides": len(slides)})
    return {"ok": True, "item": lesson_out(lesson, include_content=True, slides=slides)}


@router.post("/lessons/{lesson_id}/media")
def upload_lesson_media(
    lesson_id: uuid.UUID,
    kind: str = Query("image"),
    file: UploadFile = File(...),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    data = file.file.read()
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a file to upload.")
    stored = store_upload(lesson.id, data, kind=kind, original_name=file.filename or "")
    write_audit(session, scope.user, "lesson.media", "lesson", lesson.id, {"filename": stored["filename"], "kind": kind})
    return {"ok": True, "item": stored}


@router.post("/lessons/{lesson_id}/duplicate")
def duplicate_lesson(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    user = scope.user
    source = get_lesson(session, lesson_id)
    scope.require_module(source.module_id)
    version = latest_version(source)
    lesson = Lesson(
        module_id=source.module_id,
        chapter_id=source.chapter_id,
        creator_id=user.id,
        title=f"{source.title} (copy)",
        description=source.description,
        objectives=list(source.objectives or []),
        duration_minutes=source.duration_minutes,
        difficulty=source.difficulty,
        position=next_position(session, Lesson, module_id=source.module_id),
        status=ContentStatus.DRAFT,
    )
    session.add(lesson)
    session.flush()
    session.add(
        LessonVersion(
            lesson_id=lesson.id,
            version_number=1,
            body=version.body if version else "",
            slides=duplicate_slides(version.slides if version else []),
            author_id=user.id,
            status=VersionStatus.DRAFT,
        )
    )
    session.flush()
    write_audit(session, user, "lesson.duplicate", "lesson", lesson.id, {"from": str(source.id)})
    return {"ok": True, "item": lesson_out(get_lesson(session, lesson.id), include_content=True)}


@router.post("/lessons/{lesson_id}/submit")
def submit_lesson(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    version = latest_version(lesson)
    if version is None or not lesson_is_complete(lesson.title, version.slides or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add a title, at least one slide, and some content before submitting.")
    lesson.status = ContentStatus.IN_REVIEW
    version.status = VersionStatus.IN_REVIEW
    session.flush()
    write_audit(session, scope.user, "lesson.submit", "lesson", lesson.id, {"title": lesson.title})
    return {"ok": True, "item": lesson_out(lesson, include_content=True)}


@router.post("/lessons/{lesson_id}/review")
def review_lesson(
    lesson_id: uuid.UUID,
    body: ReviewIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id, publish=True)
    decision = body.decision.strip().lower()
    if decision not in {"approve", "reject"}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose approve or reject.")
    version = latest_version(lesson)
    if decision == "reject":
        lesson.status = ContentStatus.CHANGES_REQUESTED
        if version:
            version.status = VersionStatus.REJECTED
        session.flush()
        write_audit(session, scope.user, "lesson.reject", "lesson", lesson.id, {"reason": body.reason})
        return {"ok": True, "item": lesson_out(lesson, include_content=True)}
    if version is None or not lesson_is_complete(lesson.title, version.slides or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This lesson is not complete enough to publish.")
    version.status = VersionStatus.APPROVED
    lesson.published_version_id = version.id
    lesson.status = ContentStatus.PUBLISHED
    session.flush()
    write_audit(session, scope.user, "lesson.approve", "lesson", lesson.id, {"reason": body.reason})
    return {"ok": True, "item": lesson_out(lesson, include_content=True)}


@router.post("/lessons/{lesson_id}/publish")
def publish_lesson(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id, publish=True)
    version = latest_version(lesson)
    slides = version.slides if version else []
    if not lesson_is_complete(lesson.title, slides or []):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add a title, at least one slide, and some content before publishing.")
    if version is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Save the lesson before publishing.")
    version.status = VersionStatus.APPROVED
    lesson.published_version_id = version.id
    lesson.status = ContentStatus.PUBLISHED
    session.flush()
    write_audit(session, scope.user, "lesson.publish", "lesson", lesson.id, {"title": lesson.title})
    return {"ok": True, "item": lesson_out(lesson, include_content=True)}


@router.post("/lessons/{lesson_id}/unpublish")
def unpublish_lesson(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id, publish=True)
    lesson.status = ContentStatus.UNPUBLISHED
    session.flush()
    write_audit(session, scope.user, "lesson.unpublish", "lesson", lesson.id, {"title": lesson.title})
    return {"ok": True, "item": lesson_out(lesson, include_content=True)}


@router.post("/lessons/{lesson_id}/archive")
def archive_lesson(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    lesson.status = ContentStatus.ARCHIVED
    session.flush()
    write_audit(session, scope.user, "lesson.archive", "lesson", lesson.id, {"title": lesson.title})
    return {"ok": True, "item": lesson_out(lesson)}


@router.delete("/lessons/{lesson_id}")
def delete_lesson(lesson_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    if lesson.status == ContentStatus.PUBLISHED:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unpublish the lesson before deleting it.")
    write_audit(session, scope.user, "lesson.delete", "lesson", lesson.id, {"title": lesson.title})
    session.delete(lesson)
    session.flush()
    return {"ok": True}


@router.post("/modules/{module_id}/reorder-lessons")
def reorder_lessons(
    module_id: uuid.UUID,
    body: ReorderIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_module(module_id)
    lessons = list(session.scalars(select(Lesson).where(Lesson.module_id == module_id)))
    lookup = {item.id: item for item in lessons}
    if set(body.ids) != set(lookup):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Lesson order is incomplete.")
    for index, lesson_id in enumerate(body.ids):
        lookup[lesson_id].position = index
    session.flush()
    return {"ok": True}


def _ensure_role(session: Session, user: User, slug: str) -> None:
    role = session.scalar(select(Role).where(Role.slug == slug))
    if role is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Roles aren’t seeded yet.")
    already = session.scalar(select(UserRole).where(UserRole.user_id == user.id, UserRole.role_id == role.id))
    if already is None:
        session.add(UserRole(user_id=user.id, role_id=role.id))


def _staff_users(session: Session, slug: str) -> list[User]:
    return list(
        session.scalars(
            select(User)
            .options(joinedload(User.roles).joinedload(UserRole.role))
            .join(UserRole)
            .join(Role)
            .where(Role.slug == slug, User.status == UserStatus.ACTIVE)
            .order_by(User.name)
        ).unique()
    )


@router.get("/programmes")
def list_programmes(scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    query = select(Programme).order_by(Programme.name)
    if not scope.super_admin:
        if not scope.programme_ids:
            return {"ok": True, "items": []}
        query = query.where(Programme.id.in_(scope.programme_ids))
    items = [
        {"id": str(item.id), "name": item.name, "slug": item.slug, "status": item.status.value}
        for item in session.scalars(query)
    ]
    return {"ok": True, "items": items}


@router.get("/assignments")
def list_assignments(scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    admin_q = select(ProgramAdminAssignment).options(
        joinedload(ProgramAdminAssignment.user),
        joinedload(ProgramAdminAssignment.programme),
    )
    creator_q = select(ContentCreatorAssignment).options(
        joinedload(ContentCreatorAssignment.user),
        joinedload(ContentCreatorAssignment.program_module).joinedload(ProgramModule.programme),
        joinedload(ContentCreatorAssignment.program_module).joinedload(ProgramModule.module),
    )
    if not scope.super_admin:
        if not scope.can_assign_creators:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot manage assignments.")
        admin_q = admin_q.where(ProgramAdminAssignment.programme_id.in_(scope.programme_ids or [uuid.UUID(int=0)]))
        creator_q = creator_q.join(ProgramModule).where(ProgramModule.programme_id.in_(scope.programme_ids or [uuid.UUID(int=0)]))
    admins = []
    for row in session.scalars(admin_q).unique():
        admins.append(
            {
                "id": str(row.id),
                "userId": str(row.user_id),
                "name": row.user.name if row.user else "",
                "email": row.user.email if row.user else "",
                "programmeId": str(row.programme_id),
                "programmeName": row.programme.name if row.programme else "",
            }
        )
    creators = []
    for row in session.scalars(creator_q).unique():
        link = row.program_module
        creators.append(
            {
                "id": str(row.id),
                "userId": str(row.user_id),
                "name": row.user.name if row.user else "",
                "email": row.user.email if row.user else "",
                "programmeId": str(link.programme_id) if link else None,
                "programmeName": link.programme.name if link and link.programme else "",
                "moduleId": str(link.module_id) if link else None,
                "moduleCode": link.module.code if link and link.module else "",
                "moduleName": link.module.name if link and link.module else "",
            }
        )
    people = []
    for user in _staff_users(session, "administrator") + _staff_users(session, "creator"):
        people.append(
            {
                "id": str(user.id),
                "name": user.name,
                "email": user.email,
                "roles": role_slugs(user),
            }
        )
    seen: set[str] = set()
    unique_people = []
    for person in people:
        if person["id"] in seen:
            continue
        seen.add(person["id"])
        unique_people.append(person)
    return {"ok": True, "programAdmins": admins, "creators": creators, "people": unique_people}


@router.post("/assignments/program-admins")
def assign_program_admin(body: ProgramAdminIn, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_assign_admins()
    user = session.get(User, body.user_id)
    programme = session.get(Programme, body.programme_id)
    if user is None or programme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User or programme not found.")
    _ensure_role(session, user, "administrator")
    existing = session.scalar(
        select(ProgramAdminAssignment).where(
            ProgramAdminAssignment.user_id == user.id,
            ProgramAdminAssignment.programme_id == programme.id,
        )
    )
    if existing:
        return {"ok": True, "id": str(existing.id)}
    row = ProgramAdminAssignment(user_id=user.id, programme_id=programme.id, assigned_by_id=scope.user.id)
    session.add(row)
    session.flush()
    write_audit(
        session,
        scope.user,
        "assignment.program_admin",
        "programme",
        programme.id,
        {"userId": str(user.id), "email": user.email},
    )
    return {"ok": True, "id": str(row.id)}


@router.delete("/assignments/program-admins/{assignment_id}")
def revoke_program_admin(assignment_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_assign_admins()
    row = session.get(ProgramAdminAssignment, assignment_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found.")
    write_audit(
        session,
        scope.user,
        "assignment.program_admin.revoke",
        "programme",
        row.programme_id,
        {"userId": str(row.user_id)},
    )
    session.delete(row)
    session.flush()
    return {"ok": True}


@router.post("/assignments/creators")
def assign_creator(body: CreatorAssignIn, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_programme(body.programme_id, assign_creators=True)
    user = session.get(User, body.user_id)
    module = session.scalars(
        select(Module).options(joinedload(Module.semester).joinedload(Semester.academic_year)).where(Module.id == body.module_id)
    ).unique().one_or_none()
    if user is None or module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User or module not found.")
    actual = programme_id_for_module(module)
    if actual != body.programme_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That module does not belong to the selected programme.")
    scope.require_module(module.id)
    link = ensure_program_module(session, module)
    if link is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This module isn’t linked to a programme yet.")
    _ensure_role(session, user, "creator")
    existing = session.scalar(
        select(ContentCreatorAssignment).where(
            ContentCreatorAssignment.user_id == user.id,
            ContentCreatorAssignment.program_module_id == link.id,
        )
    )
    if existing:
        return {"ok": True, "id": str(existing.id)}
    row = ContentCreatorAssignment(user_id=user.id, program_module_id=link.id, assigned_by_id=scope.user.id)
    session.add(row)
    session.flush()
    write_audit(
        session,
        scope.user,
        "assignment.creator",
        "module",
        module.id,
        {"userId": str(user.id), "programmeId": str(body.programme_id), "moduleCode": module.code},
    )
    return {"ok": True, "id": str(row.id)}


@router.delete("/assignments/creators/{assignment_id}")
def revoke_creator(assignment_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    row = session.scalars(
        select(ContentCreatorAssignment)
        .options(joinedload(ContentCreatorAssignment.program_module))
        .where(ContentCreatorAssignment.id == assignment_id)
    ).unique().one_or_none()
    if row is None or row.program_module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found.")
    scope.require_programme(row.program_module.programme_id, assign_creators=True)
    write_audit(
        session,
        scope.user,
        "assignment.creator.revoke",
        "module",
        row.program_module.module_id,
        {"userId": str(row.user_id)},
    )
    session.delete(row)
    session.flush()
    return {"ok": True}


class AcademicPeriodIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    academic_year: str = Field(min_length=4, max_length=32)
    semester_number: int = Field(ge=1, le=2)
    window_start: str
    window_end: str
    is_current: bool = False
    is_published: bool = False


class ProgramScheduleIn(BaseModel):
    start_date: str
    end_date: str
    admins_can_edit: bool | None = None
    exam_type_id: uuid.UUID | None = None


class ModuleSlotIn(BaseModel):
    exam_date: str
    exam_time: str | None = None
    exam_type_id: uuid.UUID | None = None


class ExamTypeIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)


def apply_period_fields(row: AcademicPeriod, body: AcademicPeriodIn) -> None:
    name = " ".join(body.name.split())
    year = " ".join(body.academic_year.split())
    if not name or not year:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the period name and academic year.")
    start = parse_date(body.window_start, field="examination period start date")
    end = parse_date(body.window_end, field="examination period end date")
    require_range(start, end, "The overall examination period ends before it starts.")
    row.name = name
    row.academic_year = year
    row.semester_number = body.semester_number
    row.window_start = start
    row.window_end = end
    row.is_published = body.is_published


def schedule_response(
    session: Session,
    scope: AccessScope,
    period: AcademicPeriod,
    exam_type: ExamType | None = None,
) -> dict[str, Any]:
    payload = schedule_payload(session, period, scope, exam_type=exam_type)
    return {"ok": True, **payload}


@router.get("/exam-types")
def list_exam_types(scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_academic_view()
    return {"ok": True, "items": [exam_type_out(item) for item in ensure_exam_types(session) if item.is_active]}


@router.post("/exam-types")
def create_exam_type(
    body: ExamTypeIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_super()
    name = " ".join(body.name.split())
    slug = "-".join("".join(ch.lower() if ch.isalnum() else " " for ch in name).split())
    if not slug:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter an examination type name.")
    existing = session.scalar(select(ExamType).where(ExamType.slug == slug))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That examination type already exists.")
    position = (session.scalar(select(func.max(ExamType.position))) or 0) + 1
    row = ExamType(slug=slug, name=name, position=position, is_active=True)
    session.add(row)
    write_audit(session, scope.user, "exam_type.create", "exam_type", row.id, {"name": name, "slug": slug})
    session.flush()
    return {"ok": True, "item": exam_type_out(row), "items": [exam_type_out(item) for item in ensure_exam_types(session) if item.is_active]}


@router.get("/academic-calendar")
def get_academic_calendar(
    period_id: uuid.UUID | None = Query(default=None),
    exam_type_id: uuid.UUID | None = Query(default=None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_academic_view()
    period = load_period(session, period_id)
    return schedule_response(session, scope, period, load_exam_type(session, exam_type_id))


@router.post("/academic-periods")
def create_academic_period(
    body: AcademicPeriodIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_super()
    row = AcademicPeriod(
        name="Period",
        academic_year="2026/2027",
        semester_number=1,
        window_start=parse_date(body.window_start, field="examination period start date"),
        window_end=parse_date(body.window_end, field="examination period end date"),
        is_current=False,
    )
    apply_period_fields(row, body)
    session.add(row)
    session.flush()
    if body.is_current:
        set_current_period(session, row)
    write_audit(
        session,
        scope.user,
        "academic_period.create",
        "academic_period",
        row.id,
        {"name": row.name, "academicYear": row.academic_year, "semesterNumber": row.semester_number},
    )
    return schedule_response(session, scope, row)


@router.patch("/academic-periods/{period_id}")
def update_academic_period(
    period_id: uuid.UUID,
    body: AcademicPeriodIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_super()
    row = load_period(session, period_id)
    apply_period_fields(row, body)
    if body.is_current:
        set_current_period(session, row)
    write_audit(
        session,
        scope.user,
        "academic_period.update",
        "academic_period",
        row.id,
        {"name": row.name, "academicYear": row.academic_year, "semesterNumber": row.semester_number},
    )
    session.flush()
    return schedule_response(session, scope, row)


@router.delete("/academic-periods/{period_id}")
def delete_academic_period(
    period_id: uuid.UUID,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_super()
    row = load_period(session, period_id)
    remaining = [item for item in session.scalars(select(AcademicPeriod).where(AcademicPeriod.id != row.id))]
    if not remaining:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Keep at least one academic period.")
    was_current = row.is_current
    write_audit(session, scope.user, "academic_period.delete", "academic_period", row.id, {"name": row.name})
    session.delete(row)
    session.flush()
    next_period = remaining[0]
    if was_current:
        set_current_period(session, next_period)
    return schedule_response(session, scope, next_period if was_current else remaining[0])


@router.put("/academic-periods/{period_id}/programmes/{programme_id}")
def upsert_program_schedule(
    period_id: uuid.UUID,
    programme_id: uuid.UUID,
    body: ProgramScheduleIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_academic_view()
    period = load_period(session, period_id)
    exam_type = load_exam_type(session, body.exam_type_id)
    programme = session.get(Programme, programme_id)
    if programme is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program not found.")
    row = session.scalar(
        select(ProgramExamSchedule).where(
            ProgramExamSchedule.period_id == period.id,
            ProgramExamSchedule.programme_id == programme.id,
            ProgramExamSchedule.exam_type_id == exam_type.id,
        )
    )
    admins_can_edit = bool(row.admins_can_edit) if row else False
    if row is None:
        scope.require_super()
    else:
        scope.require_program_schedule_edit(programme.id, admins_can_edit=admins_can_edit)
    start = parse_date(body.start_date, field="program examination start date")
    end = parse_date(body.end_date, field="program examination end date")
    require_range(start, end, "The program examination window ends before it starts.")
    if row is None:
        row = ProgramExamSchedule(
            period_id=period.id,
            programme_id=programme.id,
            exam_type_id=exam_type.id,
            start_date=start,
            end_date=end,
        )
        session.add(row)
    row.start_date = start
    row.end_date = end
    if scope.super_admin and body.admins_can_edit is not None:
        row.admins_can_edit = body.admins_can_edit
    write_audit(
        session,
        scope.user,
        "program_exam_schedule.upsert",
        "programme",
        programme.id,
        {"periodId": str(period.id), "startDate": start.isoformat(), "endDate": end.isoformat()},
    )
    session.flush()
    return schedule_response(session, scope, period, exam_type)


@router.delete("/academic-periods/{period_id}/programmes/{programme_id}")
def delete_program_schedule(
    period_id: uuid.UUID,
    programme_id: uuid.UUID,
    exam_type_id: uuid.UUID | None = Query(default=None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_academic_view()
    period = load_period(session, period_id)
    exam_type = load_exam_type(session, exam_type_id)
    row = session.scalar(
        select(ProgramExamSchedule).where(
            ProgramExamSchedule.period_id == period.id,
            ProgramExamSchedule.programme_id == programme_id,
            ProgramExamSchedule.exam_type_id == exam_type.id,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program examination schedule not found.")
    scope.require_program_schedule_edit(programme_id, admins_can_edit=bool(row.admins_can_edit))
    write_audit(session, scope.user, "program_exam_schedule.delete", "programme", programme_id, {"periodId": str(period.id)})
    session.delete(row)
    session.flush()
    return schedule_response(session, scope, period, exam_type)


@router.put("/academic-periods/{period_id}/modules/{module_id}")
def upsert_module_slot(
    period_id: uuid.UUID,
    module_id: uuid.UUID,
    body: ModuleSlotIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_academic_view()
    period = load_period(session, period_id)
    exam_type = load_exam_type(session, body.exam_type_id)
    module = session.scalars(
        select(Module)
        .options(joinedload(Module.semester).joinedload(Semester.academic_year))
        .where(Module.id == module_id)
    ).unique().one_or_none()
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found.")
    programme_id = programme_id_for_module(module)
    if programme_id is None:
        scope.require_super()
    else:
        schedule = session.scalar(
            select(ProgramExamSchedule).where(
                ProgramExamSchedule.period_id == period.id,
                ProgramExamSchedule.programme_id == programme_id,
                ProgramExamSchedule.exam_type_id == exam_type.id,
            )
        )
        scope.require_program_schedule_edit(
            programme_id,
            admins_can_edit=bool(schedule.admins_can_edit) if schedule else False,
        )
    exam_date = parse_date(body.exam_date, field="module examination date")
    exam_time = parse_time(body.exam_time)
    row = session.scalar(
        select(ModuleExamSlot).where(
            ModuleExamSlot.period_id == period.id,
            ModuleExamSlot.module_id == module.id,
            ModuleExamSlot.exam_type_id == exam_type.id,
        )
    )
    if row is None:
        row = ModuleExamSlot(
            period_id=period.id,
            module_id=module.id,
            exam_type_id=exam_type.id,
            exam_date=exam_date,
            exam_time=exam_time,
        )
        session.add(row)
    row.exam_date = exam_date
    row.exam_time = exam_time
    write_audit(
        session,
        scope.user,
        "module_exam_slot.upsert",
        "module",
        module.id,
        {"periodId": str(period.id), "examTypeId": str(exam_type.id), "examDate": exam_date.isoformat(), "examTime": body.exam_time},
    )
    session.flush()
    return schedule_response(session, scope, period, exam_type)


@router.delete("/academic-periods/{period_id}/modules/{module_id}")
def delete_module_slot(
    period_id: uuid.UUID,
    module_id: uuid.UUID,
    exam_type_id: uuid.UUID | None = Query(default=None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_academic_view()
    period = load_period(session, period_id)
    exam_type = load_exam_type(session, exam_type_id)
    module = session.scalars(
        select(Module)
        .options(joinedload(Module.semester).joinedload(Semester.academic_year))
        .where(Module.id == module_id)
    ).unique().one_or_none()
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found.")
    programme_id = programme_id_for_module(module)
    if programme_id is None:
        scope.require_super()
    else:
        schedule = session.scalar(
            select(ProgramExamSchedule).where(
                ProgramExamSchedule.period_id == period.id,
                ProgramExamSchedule.programme_id == programme_id,
                ProgramExamSchedule.exam_type_id == exam_type.id,
            )
        )
        scope.require_program_schedule_edit(
            programme_id,
            admins_can_edit=bool(schedule.admins_can_edit) if schedule else False,
        )
    row = session.scalar(
        select(ModuleExamSlot).where(
            ModuleExamSlot.period_id == period.id,
            ModuleExamSlot.module_id == module.id,
            ModuleExamSlot.exam_type_id == exam_type.id,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module examination date not found.")
    write_audit(session, scope.user, "module_exam_slot.delete", "module", module.id, {"periodId": str(period.id)})
    session.delete(row)
    session.flush()
    return schedule_response(session, scope, period, exam_type)


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=8000)
    kind: str = "general"
    audience_kind: str = "all"
    programme_ids: list[uuid.UUID] = Field(default_factory=list)
    module_ids: list[uuid.UUID] = Field(default_factory=list)
    year_of_study: int | None = Field(default=None, ge=1, le=4)
    semester_of_study: int | None = Field(default=None, ge=1, le=2)
    priority: str = "normal"
    is_pinned: bool = False
    publish_at: str | None = None
    expires_at: str | None = None
    link_kind: str | None = None
    link_id: uuid.UUID | None = None
    action: str = "draft"


def _announcement_stats(rows: list[Announcement]) -> dict[str, int]:
    statuses = [effective_status(item) for item in rows]
    return {
        "total": len(rows),
        "published": sum(1 for item in statuses if item == "published"),
        "drafts": sum(1 for item in statuses if item == "draft"),
        "scheduled": sum(1 for item in statuses if item == "scheduled"),
    }


@router.get("/announcements")
def list_announcements(
    q: str = "",
    status_filter: str | None = Query(default=None, alias="status"),
    kind: str | None = None,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    require_announce(scope)
    rows = admin_query(session, scope)
    stats = _announcement_stats(rows)
    needle = q.strip().lower()
    if needle:
        rows = [item for item in rows if needle in item.title.lower() or needle in item.message.lower()]
    if status_filter:
        rows = [item for item in rows if effective_status(item) == status_filter]
    if kind:
        rows = [item for item in rows if item.kind == kind]
    return {"ok": True, "items": [announcement_out(session, item) for item in rows], "stats": stats}


@router.post("/announcements")
def create_announcement(
    body: AnnouncementIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    require_announce(scope)
    row = Announcement(created_by_id=scope.user.id, title=body.title, message=body.message)
    session.add(row)
    fill_announcement(row, body, scope)
    session.flush()
    write_audit(
        session,
        scope.user,
        f"announcement.{body.action or 'draft'}",
        "announcement",
        row.id,
        {"title": row.title, "status": row.status, "audienceKind": row.audience_kind},
    )
    return {"ok": True, "item": announcement_out(session, load_announcement(session, row.id))}


@router.get("/announcements/{announcement_id}")
def get_announcement(
    announcement_id: uuid.UUID,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    require_announce(scope)
    row = load_announcement(session, announcement_id)
    if row.id not in {item.id for item in admin_query(session, scope)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found.")
    return {"ok": True, "item": announcement_out(session, row)}


@router.patch("/announcements/{announcement_id}")
def update_announcement(
    announcement_id: uuid.UUID,
    body: AnnouncementIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    require_announce(scope)
    row = load_announcement(session, announcement_id)
    if row.id not in {item.id for item in admin_query(session, scope)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found.")
    fill_announcement(row, body, scope)
    session.flush()
    write_audit(
        session,
        scope.user,
        f"announcement.{body.action or 'draft'}",
        "announcement",
        row.id,
        {"title": row.title, "status": row.status, "audienceKind": row.audience_kind},
    )
    return {"ok": True, "item": announcement_out(session, load_announcement(session, row.id))}


@router.delete("/announcements/{announcement_id}")
def delete_announcement(
    announcement_id: uuid.UUID,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    require_announce(scope)
    row = load_announcement(session, announcement_id)
    if row.id not in {item.id for item in admin_query(session, scope)}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found.")
    if effective_status(row) == "published" and not scope.super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super administrator can remove a published announcement.")
    write_audit(session, scope.user, "announcement.delete", "announcement", row.id, {"title": row.title})
    session.delete(row)
    session.flush()
    return {"ok": True}
