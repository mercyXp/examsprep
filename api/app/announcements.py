from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.access import AccessScope
from app.calendar import parse_date
from app.models import Module, Programme, StudentProfile, User
from app.models.comms import Announcement, AnnouncementRead

KINDS = {
    "examination": "Examination",
    "academic": "Academic notice",
    "course": "Course update",
    "reminder": "Study reminder",
    "general": "General",
}
PRIORITIES = {"normal": "Normal", "important": "Important", "urgent": "Urgent"}
AUDIENCES = {"all": "All students", "programmes": "Selected programs", "modules": "Selected modules", "group": "Specific group"}
ACTIONS = {"draft", "publish", "schedule"}
LINK_KINDS = {"planner", "course", None, ""}


def require_announce(scope: AccessScope) -> None:
    if scope.super_admin or "administrator" in scope.roles:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You don’t have permission to manage announcements.")


def effective_status(row: Announcement, today: date | None = None) -> str:
    today = today or date.today()
    if row.status == "draft":
        return "draft"
    if row.expires_at and row.expires_at < today:
        return "expired"
    if row.publish_at and row.publish_at > today:
        return "scheduled"
    return "published"


def _as_uuid_strings(values: list[uuid.UUID] | list[str] | None) -> list[str]:
    cleaned: list[str] = []
    for item in values or []:
        text = str(item).strip()
        if not text:
            continue
        try:
            cleaned.append(str(uuid.UUID(text)))
        except ValueError as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use a valid program or module.") from error
    return cleaned


def validate_audience(
    scope: AccessScope,
    audience_kind: str,
    programme_ids: list[uuid.UUID] | None,
    module_ids: list[uuid.UUID] | None,
    year_of_study: int | None,
    semester_of_study: int | None,
) -> tuple[str, list[str], list[str], int | None, int | None]:
    kind = audience_kind if audience_kind in AUDIENCES else "all"
    programmes = _as_uuid_strings(programme_ids)
    modules = _as_uuid_strings(module_ids)
    if kind == "all":
        if not scope.super_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a super administrator can announce to all students.")
        return kind, [], [], None, None
    if kind == "programmes":
        if not programmes:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one program.")
        for item in programmes:
            scope.require_programme(uuid.UUID(item))
        return kind, programmes, [], None, None
    if kind == "modules":
        if not modules:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one module.")
        for item in modules:
            scope.require_module(uuid.UUID(item))
        return kind, [], modules, None, None
    if kind == "group":
        if len(programmes) != 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select one program for this group.")
        if year_of_study is None or semester_of_study is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select the year and semester.")
        if year_of_study not in {1, 2, 3, 4} or semester_of_study not in {1, 2}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Use a valid year and semester.")
        scope.require_programme(uuid.UUID(programmes[0]))
        return kind, programmes, [], year_of_study, semester_of_study
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose who should see this announcement.")


def apply_action(row: Announcement, action: str, actor_id: uuid.UUID, publish_at: date | None) -> None:
    today = date.today()
    if action not in ACTIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose save draft, publish, or schedule.")
    if action == "draft":
        row.status = "draft"
        row.published_by_id = None
        row.published_at = None
        row.publish_at = publish_at
        return
    if not publish_at:
        publish_at = today
    if action == "schedule" or publish_at > today:
        if publish_at <= today:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a future date to schedule this announcement.")
        row.status = "scheduled"
        row.publish_at = publish_at
        row.published_by_id = actor_id
        row.published_at = datetime.now(UTC)
        return
    row.status = "published"
    row.publish_at = publish_at or today
    row.published_by_id = actor_id
    row.published_at = datetime.now(UTC)


def _names_for(session: Session, programme_ids: list[str], module_ids: list[str]) -> tuple[list[str], list[str]]:
    programmes = []
    modules = []
    if programme_ids:
        ids = [uuid.UUID(item) for item in programme_ids]
        programmes = [item.name for item in session.scalars(select(Programme).where(Programme.id.in_(ids)).order_by(Programme.name))]
    if module_ids:
        ids = [uuid.UUID(item) for item in module_ids]
        modules = [
            f"{item.code} — {item.name}"
            for item in session.scalars(select(Module).where(Module.id.in_(ids)).order_by(Module.code))
        ]
    return programmes, modules


def link_out(row: Announcement) -> dict[str, str] | None:
    if row.link_kind == "planner":
        return {"kind": "planner", "href": "/dashboard/planner", "label": "Open examination timetable"}
    if row.link_kind == "course" and row.link_id:
        return {"kind": "course", "href": f"/dashboard/courses/{row.link_id}", "label": "Open course"}
    return None


def announcement_out(
    session: Session,
    row: Announcement,
    *,
    read: bool | None = None,
) -> dict[str, Any]:
    today = date.today()
    programme_names, module_names = _names_for(session, list(row.programme_ids or []), list(row.module_ids or []))
    payload = {
        "id": str(row.id),
        "title": row.title,
        "message": row.message,
        "kind": row.kind,
        "kindLabel": KINDS.get(row.kind, row.kind),
        "audienceKind": row.audience_kind,
        "audienceLabel": AUDIENCES.get(row.audience_kind, row.audience_kind),
        "programmeIds": list(row.programme_ids or []),
        "moduleIds": list(row.module_ids or []),
        "programmeNames": programme_names,
        "moduleNames": module_names,
        "yearOfStudy": row.year_of_study,
        "semesterOfStudy": row.semester_of_study,
        "priority": row.priority,
        "priorityLabel": PRIORITIES.get(row.priority, row.priority),
        "status": row.status,
        "effectiveStatus": effective_status(row, today),
        "isPinned": row.is_pinned,
        "publishAt": row.publish_at.isoformat() if row.publish_at else None,
        "expiresAt": row.expires_at.isoformat() if row.expires_at else None,
        "linkKind": row.link_kind,
        "linkId": str(row.link_id) if row.link_id else None,
        "link": link_out(row),
        "createdById": str(row.created_by_id),
        "createdByName": row.created_by.name if row.created_by else None,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
        "publishedById": str(row.published_by_id) if row.published_by_id else None,
        "publishedByName": row.published_by.name if row.published_by else None,
        "publishedAt": row.published_at.isoformat() if row.published_at else None,
        "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
    }
    if read is not None:
        payload["read"] = read
    return payload


def admin_query(session: Session, scope: AccessScope) -> list[Announcement]:
    rows = list(
        session.scalars(
            select(Announcement)
            .options(joinedload(Announcement.created_by), joinedload(Announcement.published_by))
            .order_by(Announcement.created_at.desc())
        ).unique()
    )
    if scope.super_admin:
        return rows
    programme_ids = {str(item) for item in scope.programme_ids}
    module_ids = {str(item) for item in (scope.module_ids or set())}
    visible = []
    for row in rows:
        if row.created_by_id == scope.user.id:
            visible.append(row)
            continue
        if programme_ids.intersection(str(item) for item in (row.programme_ids or [])):
            visible.append(row)
            continue
        if module_ids.intersection(str(item) for item in (row.module_ids or [])):
            visible.append(row)
    return visible


def student_can_see(session: Session, row: Announcement, profile: StudentProfile | None) -> bool:
    if effective_status(row) in {"draft", "scheduled", "expired"}:
        return False
    if row.audience_kind == "all":
        return True
    if profile is None:
        return False
    programme_name = (profile.programme or "").strip()
    module_codes = {item for item in (profile.module_codes or []) if isinstance(item, str)}
    if row.audience_kind in {"programmes", "group"}:
        names, _ = _names_for(session, list(row.programme_ids or []), [])
        if programme_name not in names:
            return False
        if row.audience_kind == "group":
            if row.year_of_study != profile.year_of_study or row.semester_of_study != profile.semester_of_study:
                return False
        return True
    if row.audience_kind == "modules":
        ids = [uuid.UUID(item) for item in (row.module_ids or [])]
        if not ids:
            return False
        codes = set(session.scalars(select(Module.code).where(Module.id.in_(ids))))
        return bool(module_codes & codes)
    return False


def student_feed(session: Session, user: User) -> list[dict[str, Any]]:
    rows = list(
        session.scalars(
            select(Announcement)
            .options(joinedload(Announcement.created_by), joinedload(Announcement.published_by))
            .where(Announcement.status.in_(("published", "scheduled")))
            .order_by(Announcement.is_pinned.desc(), Announcement.publish_at.desc(), Announcement.created_at.desc())
        ).unique()
    )
    profile = user.profile
    visible = [row for row in rows if student_can_see(session, row, profile)]
    visible.sort(
        key=lambda item: (
            0 if item.is_pinned or item.priority == "urgent" else 1,
            0 if item.priority == "urgent" else 1 if item.priority == "important" else 2,
            -(item.publish_at.toordinal() if item.publish_at else item.created_at.toordinal()),
        )
    )
    reads = {
        row.announcement_id
        for row in session.scalars(select(AnnouncementRead).where(AnnouncementRead.user_id == user.id, AnnouncementRead.announcement_id.in_([item.id for item in visible])))
    } if visible else set()
    return [announcement_out(session, row, read=row.id in reads) for row in visible]


def load_announcement(session: Session, announcement_id: uuid.UUID) -> Announcement:
    row = session.scalars(
        select(Announcement)
        .options(joinedload(Announcement.created_by), joinedload(Announcement.published_by))
        .where(Announcement.id == announcement_id)
    ).unique().one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Announcement not found.")
    return row


def parse_optional_date(value: str | None, *, field: str) -> date | None:
    if not value:
        return None
    return parse_date(value, field=field)


def fill_announcement(row: Announcement, body: Any, scope: AccessScope) -> None:
    title = " ".join((body.title or "").split())
    message = (body.message or "").strip()
    if not title:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter an announcement title.")
    if not message:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Enter the announcement message.")
    kind = body.kind if body.kind in KINDS else "general"
    priority = body.priority if body.priority in PRIORITIES else "normal"
    audience_kind, programme_ids, module_ids, year_of_study, semester_of_study = validate_audience(
        scope,
        body.audience_kind,
        body.programme_ids,
        body.module_ids,
        body.year_of_study,
        body.semester_of_study,
    )
    publish_at = parse_optional_date(body.publish_at, field="publish date")
    expires_at = parse_optional_date(body.expires_at, field="expiry date")
    if publish_at and expires_at and expires_at < publish_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The expiry date cannot be before the publish date.")
    link_kind = body.link_kind if body.link_kind in {"planner", "course"} else None
    link_id = body.link_id if link_kind == "course" else None
    if link_kind == "course" and link_id:
        scope.require_module(link_id)
    row.title = title[:160]
    row.message = message
    row.kind = kind
    row.audience_kind = audience_kind
    row.programme_ids = programme_ids
    row.module_ids = module_ids
    row.year_of_study = year_of_study
    row.semester_of_study = semester_of_study
    row.priority = priority
    row.is_pinned = bool(body.is_pinned)
    row.expires_at = expires_at
    row.link_kind = link_kind
    row.link_id = link_id
    apply_action(row, body.action or "draft", scope.user.id, publish_at)
