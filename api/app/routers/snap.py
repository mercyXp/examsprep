"""Snap a Question. Photos stay on the signed-in student's account."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.assist.rate_limit import enforce_ai_limit
from app.assist.snap import follow_up, list_snaps, own_snap, snap_out, snap_question
from app.db import get_session
from app.models import User
from app.security import require_user

router = APIRouter(prefix="/api/learn/snap", tags=["snap"])
USER = Depends(require_user)
DB = Depends(get_session)
PHOTO = File(description="JPEG, PNG, GIF, or WebP. Maximum 4 MB.")


class FollowIn(BaseModel):
    question: str = Field(description="A follow-up about the saved snap.")


@router.post("", summary="Upload a question photo")
async def create_snap(
    image: UploadFile = PHOTO,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """Reads the photo with the configured vision model, or Tesseract when no AI key is set. Unreadable photos are rejected."""
    enforce_ai_limit(user.id, "snap")
    data = await image.read()
    return {"ok": True, "item": snap_question(session, user, data)}


@router.get("", summary="My Questions")
def my_questions(user: User = USER, session: Session = DB) -> dict[str, Any]:
    """Questions this student saved from photos. They are not added to the official bank."""
    return {"ok": True, "items": list_snaps(session, user)}


@router.get("/{snap_id}", summary="One saved snap")
def read_snap(
    snap_id: uuid.UUID,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    return {"ok": True, "item": snap_out(own_snap(session, user, snap_id))}


@router.post("/{snap_id}/followups", summary="Ask a follow-up")
def ask_follow_up(
    snap_id: uuid.UUID,
    body: FollowIn,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """Answers from the configured model using the saved question. Does not invent an answer when the key is missing."""
    enforce_ai_limit(user.id, "snap")
    return {"ok": True, "item": follow_up(session, user, snap_id, body.question)}


@router.get("/{snap_id}/image", summary="Saved photo")
def snap_image(
    snap_id: uuid.UUID,
    user: User = USER,
    session: Session = DB,
) -> Response:
    row = own_snap(session, user, snap_id)
    if not row.image:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found.")
    return Response(bytes(row.image), media_type=row.mime or "image/jpeg")
