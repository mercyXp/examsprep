from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.access import load_scope
from app.db import get_session
from app.media import CONTENT_TYPES, media_path
from app.models import Lesson, User
from app.models.enums import ContentStatus
from app.security import STAFF_ROLES, require_user, role_slugs

router = APIRouter(prefix="/api/media", tags=["media"])


def lesson_for_media(session: Session, lesson_id: uuid.UUID) -> Lesson:
    lesson = session.scalars(select(Lesson).options(joinedload(Lesson.module)).where(Lesson.id == lesson_id)).unique().one_or_none()
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    return lesson


def can_read_media(session: Session, user: User, lesson: Lesson) -> bool:
    roles = set(role_slugs(user))
    if STAFF_ROLES.intersection(roles):
        return load_scope(session, user).allows_module(lesson.module_id)
    if lesson.status != ContentStatus.PUBLISHED:
        return False
    profile = user.profile
    codes = [item for item in (profile.module_codes or []) if isinstance(item, str)] if profile else []
    return bool(lesson.module and lesson.module.code in codes)


@router.get("/{lesson_id}/{filename}")
def read_media(
    lesson_id: uuid.UUID,
    filename: str,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
):
    lesson = lesson_for_media(session, lesson_id)
    if not can_read_media(session, user, lesson):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    path = media_path(lesson_id, filename)
    return FileResponse(
        path,
        media_type=CONTENT_TYPES.get(path.suffix, "application/octet-stream"),
        filename=filename,
        content_disposition_type="inline",
    )
