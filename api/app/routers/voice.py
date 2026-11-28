"""Lesson audio, quiz audio, and the voice tutor."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assist.audio import load_asset, stream_asset
from app.assist.rate_limit import enforce_ai_limit
from app.assist.speech import quiz_id_from_asset, speak_lesson, speak_quiz
from app.assist.tutor import create_session, history_out, own_session, take_turn
from app.db import get_session
from app.models import AudioAsset, QuizAttempt, User
from app.routers.learn import published_lesson
from app.routers.quizzes import _published_quiz
from app.security import require_user

router = APIRouter(prefix="/api/learn", tags=["audio"])
USER = Depends(require_user)
DB = Depends(get_session)
AUDIO = File(description="Recorded question. WebM, WAV, MP3, M4A, or Ogg.")


class QuizAudioIn(BaseModel):
    quiz_id: uuid.UUID
    part: str = Field(description="instruction, prompt, option, or explanation.")
    question_version_id: uuid.UUID | None = None
    option_id: str | None = None


class TutorSessionIn(BaseModel):
    module_id: uuid.UUID | None = None
    lesson_id: uuid.UUID | None = None


@router.post("/lessons/{lesson_id}/audio", summary="Listen to a published lesson")
def lesson_audio(
    lesson_id: uuid.UUID,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """Returns a cached MP3 when the lesson text and voice are unchanged. Regenerates after the published text changes."""
    enforce_ai_limit(user.id, "audio")
    return speak_lesson(session, user, lesson_id)


@router.post("/audio/quiz", summary="Listen to a published quiz part")
def quiz_audio(
    body: QuizAudioIn,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """Reads the instruction, question, option, or explanation stored on the quiz. Explanations require a submitted attempt."""
    enforce_ai_limit(user.id, "audio")
    return speak_quiz(
        session,
        user,
        quiz_id=body.quiz_id,
        part=body.part,
        question_version_id=body.question_version_id,
        option_id=body.option_id,
    )


@router.get("/audio/{asset_id}", summary="Stream generated audio")
def read_audio(
    asset_id: uuid.UUID,
    request: Request,
    user: User = USER,
    session: Session = DB,
):
    """MP3 bytes. Supports Range so a player can seek. Authorization follows the lesson, quiz, or tutor session."""
    asset = load_asset(session, asset_id)
    _authorize(session, user, asset)
    return stream_asset(asset, request)


@router.post("/tutor/sessions", summary="Open a voice tutor session", tags=["tutor"])
def open_tutor(
    body: TutorSessionIn,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """Course context is optional. The reply uses published lesson titles and, when sent, one lesson's text."""
    row = create_session(session, user, body.module_id, body.lesson_id)
    return history_out(session, row)


@router.get("/tutor/sessions/{session_id}", summary="Voice tutor history", tags=["tutor"])
def tutor_history(
    session_id: uuid.UUID,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    row = own_session(session, user, session_id)
    return history_out(session, row)


@router.post("/tutor/sessions/{session_id}/turns", summary="Send a microphone recording", tags=["tutor"])
async def tutor_turn(
    session_id: uuid.UUID,
    audio: UploadFile = AUDIO,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """Speech-to-text, then the configured course model, then speech. Missing keys are reported and not replaced with a fake reply."""
    enforce_ai_limit(user.id, "tutor")
    row = own_session(session, user, session_id)
    data = await audio.read()
    return take_turn(session, user, row, data, audio.content_type or "")


def _authorize(session: Session, user: User, asset: AudioAsset) -> None:
    if asset.access == "private":
        if asset.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found.")
        return
    if asset.access == "lesson":
        published_lesson(session, uuid.UUID(asset.owner_key), user)
        return
    if asset.access in {"quiz", "quiz_explanation"}:
        quiz_id = quiz_id_from_asset(asset.owner_key)
        quiz = _published_quiz(session, quiz_id, user)
        if asset.access == "quiz_explanation":
            submitted = session.scalar(
                select(QuizAttempt.id).where(
                    QuizAttempt.user_id == user.id,
                    QuizAttempt.quiz_id == quiz.id,
                    QuizAttempt.submitted_at.is_not(None),
                )
            )
            if submitted is None:
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Submit this quiz before listening to the explanation.")
        return
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found.")
