"""Snap a Question. Vision first, Tesseract only when no AI key is set.

A missing key returns a clear not-configured error. Unreadable photos are
rejected. Nothing is filled in with a guessed question.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.provider import select_provider
from app.assist.messages import not_configured
from app.assist.outline import parse_json_object
from app.config import settings
from app.media import sniff_media
from app.models import SnappedQuestion, User

SNAP_SYSTEM = """You read a photo of one study question.
Return one JSON object and no markdown.
Keys: readable (boolean), subject, topic, question, concept, steps (list of strings),
answer, similarQuestion, similarAnswer.
If the photo is blurry, cropped, or not a question, set readable to false and leave the other fields empty.
Use only what is visible plus standard working for that exact question. Do not invent a different question in the question field.
Write mathematics with $...$ or $$...$$.
"""

FOLLOW_SYSTEM = """You answer a follow-up about a question a student photographed.
Use the saved question, working, and answer. If the follow-up is not about that question, say so.
Return plain text under 180 words. Write mathematics with $...$ or $$...$$.
Do not invent a readiness score.
"""


def read_image(data: bytes) -> tuple[str, str]:
    if len(data) < 64:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This image is too small to contain a question. Retake the photo so the question fills the frame.",
        )
    if len(data) > int(settings.snap_max_bytes):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That photo is too large. Keep it under 4 MB.")
    try:
        detected = sniff_media(data)
    except HTTPException as error:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Upload a JPEG, PNG, GIF, or WebP photo of the question.",
        ) from error
    if not detected.content_type.startswith("image/"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a photo of the question, not another file type.")
    return detected.content_type, detected.extension


def snap_question(session: Session, user: User, data: bytes) -> dict:
    mime, extension = read_image(data)
    provider = select_provider()
    if provider.configured:
        completion = provider.complete_vision(SNAP_SYSTEM, "Read this question photo.", [(mime, data)])
        if completion.degraded or not completion.text.strip():
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "The configured vision model could not read this photo. Nothing was invented. Try a sharper picture or another model in AI_MODEL.",
            )
        payload = parse_json_object(completion.text)
        if payload is None or payload.get("readable") is False:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "This photo is too unclear to read. Retake it so the full question is sharp and fills the frame.",
            )
        question = str(payload.get("question") or "").strip()
        if len(question) < 8:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "This photo is too unclear to read. Retake it so the full question is sharp and fills the frame.",
            )
        row = _save(
            session,
            user,
            data=data,
            mime=mime,
            provider=completion.provider,
            status_value="saved",
            subject=str(payload.get("subject") or "")[:120],
            topic=str(payload.get("topic") or "")[:180],
            question=question,
            concept=str(payload.get("concept") or ""),
            steps=_steps(payload.get("steps")),
            answer=str(payload.get("answer") or ""),
            similar={
                "question": str(payload.get("similarQuestion") or ""),
                "answer": str(payload.get("similarAnswer") or ""),
            },
            message="",
        )
        return snap_out(row)
    text = tesseract_text(data, extension)
    if text is None:
        raise not_configured("Snap a Question", "AI_API_KEY")
    if len(text) < 8:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This photo is too unclear to read. Retake it so the full question is sharp and fills the frame.",
        )
    row = _save(
        session,
        user,
        data=data,
        mime=mime,
        provider="tesseract",
        status_value="partial",
        subject="",
        topic="",
        question=text[:4000],
        concept="",
        steps=[],
        answer="",
        similar={},
        message=(
            "The photo was read with Tesseract because AI_API_KEY is not set. "
            "Subject, working, the final answer, and a similar question were not generated."
        ),
    )
    return snap_out(row)


def follow_up(session: Session, user: User, snap_id: uuid.UUID, question: str) -> dict:
    row = own_snap(session, user, snap_id)
    asked = question.strip()
    if len(asked) < 3:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Type a follow-up question.")
    provider = select_provider()
    if not provider.configured:
        raise not_configured("Snap follow-up", "AI_API_KEY")
    context = (
        f"Question: {row.question_text}\nTopic: {row.topic}\nConcept: {row.concept}\n"
        f"Steps: {row.steps}\nAnswer: {row.final_answer}\n\nFollow-up: {asked[:1000]}"
    )
    completion = provider.complete(FOLLOW_SYSTEM, context)
    if completion.degraded or not completion.text.strip():
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The AI provider did not answer this follow-up. Nothing was invented.")
    answer = completion.text.strip()[:4000]
    followups = list(row.followups or [])
    followups.append({"id": str(uuid.uuid4()), "question": asked[:1000], "answer": answer})
    row.followups = followups
    session.flush()
    return snap_out(row)


def list_snaps(session: Session, user: User) -> list[dict]:
    rows = session.scalars(
        select(SnappedQuestion).where(SnappedQuestion.user_id == user.id).order_by(SnappedQuestion.created_at.desc()).limit(50)
    )
    return [snap_out(row) for row in rows]


def own_snap(session: Session, user: User, snap_id: uuid.UUID) -> SnappedQuestion:
    row = session.get(SnappedQuestion, snap_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    return row


def snap_out(row: SnappedQuestion) -> dict:
    similar = row.similar if isinstance(row.similar, dict) else {}
    return {
        "id": str(row.id),
        "status": row.status,
        "provider": row.provider,
        "message": row.message,
        "subject": row.subject,
        "topic": row.topic,
        "question": row.question_text,
        "concept": row.concept,
        "steps": list(row.steps or []),
        "answer": row.final_answer,
        "similarQuestion": str(similar.get("question") or ""),
        "similarAnswer": str(similar.get("answer") or ""),
        "followups": list(row.followups or []),
        "imageUrl": f"/api/learn/snap/{row.id}/image",
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def tesseract_text(data: bytes, extension: str) -> str | None:
    binary = shutil.which("tesseract")
    if not binary:
        return None
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / f"snap{extension}"
        path.write_bytes(data)
        try:
            completed = subprocess.run(
                [binary, str(path), "stdout", "--psm", "6"],
                check=False,
                capture_output=True,
                timeout=25,
            )
        except (OSError, subprocess.TimeoutExpired):
            return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.decode("utf-8", errors="replace").strip()


def _steps(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:500] for item in value if str(item).strip()][:12]


def _save(session: Session, user: User, **fields: object) -> SnappedQuestion:
    row = SnappedQuestion(
        user_id=user.id,
        mime=str(fields["mime"]),
        image=fields["data"],
        status=str(fields["status_value"]),
        subject=str(fields["subject"]),
        topic=str(fields["topic"]),
        question_text=str(fields["question"]),
        concept=str(fields["concept"]),
        steps=fields["steps"],
        final_answer=str(fields["answer"]),
        similar=fields["similar"],
        provider=str(fields["provider"]),
        message=str(fields["message"]),
    )
    session.add(row)
    session.flush()
    return row
