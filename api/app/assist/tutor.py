"""Voice tutor: browser audio -> ElevenLabs STT -> course AI -> ElevenLabs TTS."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.provider import select_provider
from app.assist.audio import asset_out, cached_or_speak
from app.assist.elevenlabs import public_error, stt_configured, transcribe, tts_configured
from app.assist.http import UpstreamError
from app.assist.messages import not_configured
from app.cms import slides_plain_text
from app.models import Lesson, Module, TutorSession, TutorTurn, User
from app.models.enums import ContentStatus
from app.routers.learn import visible_module_ids

TUTOR_SYSTEM = """You are a course tutor for ExamsPrep.
Answer only from the course notes in the user message.
If the notes do not contain the answer, say that you cannot find it in the course notes.
Do not invent exam predictions or a readiness percentage.
Keep the reply under 120 words so it can be read aloud.
"""

AUDIO_TYPES = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "video/webm": ".webm",
}


def create_session(session: Session, user: User, module_id: uuid.UUID | None, lesson_id: uuid.UUID | None) -> TutorSession:
    if module_id is not None:
        _require_visible_module(session, user, module_id)
    row = TutorSession(user_id=user.id, module_id=module_id, lesson_id=lesson_id)
    session.add(row)
    session.flush()
    return row


def own_session(session: Session, user: User, session_id: uuid.UUID) -> TutorSession:
    row = session.get(TutorSession, session_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tutor session not found.")
    return row


def take_turn(session: Session, user: User, tutor: TutorSession, audio: bytes, mime: str) -> dict:
    if not stt_configured():
        raise not_configured("Voice tutor speech-to-text", "ELEVENLABS_API_KEY")
    content_type = mime.split(";", 1)[0].strip().lower()
    if content_type not in AUDIO_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Record audio as WebM, WAV, MP3, M4A, or Ogg.")
    if len(audio) < 800:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That recording is too short. Hold the button and speak the question.")
    if len(audio) > 8 * 1024 * 1024:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That recording is too large. Keep it under 8 MB.")
    try:
        transcript = transcribe(audio, content_type, f"question{AUDIO_TYPES[content_type]}")
    except UpstreamError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, public_error(error)) from error
    if len(transcript) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No speech was detected. Try again closer to the microphone.")
    session.add(TutorTurn(session_id=tutor.id, role="user", text=transcript))
    session.flush()
    provider = select_provider()
    if not provider.configured:
        return {
            "ok": True,
            "transcript": transcript,
            "answer": None,
            "audio": None,
            "message": (
                "The voice tutor model is not configured. Set AI_API_KEY on the API server. "
                "Your transcript was saved. No answer was generated."
            ),
        }
    history = _history(session, tutor.id)
    notes = _course_notes(session, user, tutor)
    prompt = f"Course notes:\n{notes or 'No published lesson text is available.'}\n\nConversation:\n{history}\n\nStudent: {transcript}"
    completion = provider.complete(TUTOR_SYSTEM, prompt)
    if completion.degraded or not completion.text.strip():
        return {
            "ok": True,
            "transcript": transcript,
            "answer": None,
            "audio": None,
            "message": "The AI provider did not return an answer. Nothing was invented.",
        }
    answer = completion.text.strip()[:2000]
    turn = TutorTurn(session_id=tutor.id, role="assistant", text=answer)
    session.add(turn)
    session.flush()
    audio_meta = None
    message = ""
    if tts_configured():
        try:
            asset, from_cache = cached_or_speak(
                session,
                owner_kind="tutor",
                owner_key=str(turn.id),
                text=answer,
                access="private",
                user=user,
            )
        except HTTPException as error:
            message = str(error.detail)
        else:
            turn.audio_asset_id = asset.id
            audio_meta = asset_out(asset)
            audio_meta["cached"] = from_cache
    else:
        message = (
            "Playback is not configured. Set ELEVENLABS_VOICE_ID on the API server. "
            "The written answer is shown. No audio was generated."
        )
    session.flush()
    return {"ok": True, "transcript": transcript, "answer": answer, "audio": audio_meta, "message": message}


def history_out(session: Session, tutor: TutorSession) -> dict:
    turns = list(
        session.scalars(select(TutorTurn).where(TutorTurn.session_id == tutor.id).order_by(TutorTurn.created_at))
    )
    return {
        "ok": True,
        "id": str(tutor.id),
        "moduleId": str(tutor.module_id) if tutor.module_id else None,
        "lessonId": str(tutor.lesson_id) if tutor.lesson_id else None,
        "turns": [
            {
                "id": str(turn.id),
                "role": turn.role,
                "text": turn.text,
                "audioUrl": f"/api/learn/audio/{turn.audio_asset_id}" if turn.audio_asset_id else None,
            }
            for turn in turns
        ],
    }


def _history(session: Session, session_id: uuid.UUID) -> str:
    turns = list(
        session.scalars(
            select(TutorTurn).where(TutorTurn.session_id == session_id).order_by(TutorTurn.created_at.desc()).limit(8)
        )
    )
    lines = [f"{turn.role}: {turn.text}" for turn in reversed(turns)]
    return "\n".join(lines)


def _course_notes(session: Session, user: User, tutor: TutorSession) -> str:
    if tutor.module_id is None:
        return ""
    lessons = list(
        session.scalars(
            select(Lesson)
            .where(Lesson.module_id == tutor.module_id, Lesson.status == ContentStatus.PUBLISHED)
            .order_by(Lesson.position)
            .limit(8)
        )
    )
    module = session.get(Module, tutor.module_id)
    lines = []
    if module is not None:
        lines.append(f"{module.code} {module.name}")
    for lesson in lessons:
        lines.append(f"Lesson: {lesson.title}")
    if tutor.lesson_id is not None:
        focus = session.get(Lesson, tutor.lesson_id)
        if focus is not None and focus.published_version_id is not None:
            version = focus.published_version
            if version is not None:
                body = version.body or slides_plain_text(version.slides or [])
                lines.append(body[:2000])
    return "\n".join(lines)[:4000]


def _require_visible_module(session: Session, user: User, module_id: uuid.UUID) -> None:
    allowed = visible_module_ids(session, user)
    if allowed is not None and module_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")
