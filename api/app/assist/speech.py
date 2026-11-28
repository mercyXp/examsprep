"""Speak published lessons and published quiz parts. Text is taken from the database."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.assist.audio import asset_out, cached_or_speak
from app.cms import slides_plain_text
from app.models import QuizAttempt, User
from app.models.enums import ContentStatus
from app.routers.learn import load_lesson, visible_module_ids
from app.routers.quizzes import _published_quiz, _questions


def speak_lesson(session: Session, user: User, lesson_id: uuid.UUID) -> dict:
    lesson = load_lesson(session, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")
    allowed = visible_module_ids(session, user, include_history=True)
    if allowed is not None and lesson.module_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lesson not found.")
    if lesson.status != ContentStatus.PUBLISHED or lesson.published_version is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Listen to this lesson is available after the lesson is published.",
        )
    version = lesson.published_version
    body = (version.body or slides_plain_text(version.slides or [])).strip()
    text = f"{lesson.title}. {body}".strip()
    if len(text) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This lesson has no text to read yet.")
    asset, from_cache = cached_or_speak(
        session,
        owner_kind="lesson",
        owner_key=str(lesson.id),
        text=text,
        access="lesson",
        user=None,
    )
    payload = asset_out(asset)
    payload["cached"] = from_cache
    if asset.truncated:
        payload["message"] = (
            f"The free-tier voice reads the first {asset.character_count} characters. "
            "The rest of the lesson was not sent to ElevenLabs."
        )
    else:
        payload["message"] = ""
    return {"ok": True, **payload}


def speak_quiz(
    session: Session,
    user: User,
    *,
    quiz_id: uuid.UUID,
    part: str,
    question_version_id: uuid.UUID | None,
    option_id: str | None,
) -> dict:
    quiz = _published_quiz(session, quiz_id, user)
    version = quiz.published_version
    questions = _questions(quiz)
    if part == "instruction":
        bits = [f"{quiz.title}. This is a {quiz.kind.value} quiz."]
        if version and version.pass_mark_percent is not None:
            bits.append(f"The pass mark is {version.pass_mark_percent} percent.")
        if version and version.time_limit_seconds:
            minutes = max(version.time_limit_seconds // 60, 1)
            bits.append(f"The time limit is {minutes} minutes.")
        text = " ".join(bits)
        owner = f"{quiz.id}:instruction"
        access = "quiz"
    else:
        if question_version_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a question to read.")
        match = next((item for item in questions if item.question_version_id == str(question_version_id)), None)
        if match is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
        if part == "prompt":
            text = match.prompt
            owner = f"{quiz.id}:{question_version_id}:prompt"
            access = "quiz"
        elif part == "option":
            if not option_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose an option to read.")
            choice = next((item for item in match.choices if item.id == option_id), None)
            if choice is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Option not found.")
            text = choice.label
            owner = f"{quiz.id}:{question_version_id}:option:{option_id}"
            access = "quiz"
        elif part == "explanation":
            submitted = session.scalar(
                select(QuizAttempt.id).where(
                    QuizAttempt.user_id == user.id,
                    QuizAttempt.quiz_id == quiz.id,
                    QuizAttempt.submitted_at.is_not(None),
                )
            )
            if submitted is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Submit this quiz before listening to the explanation.",
                )
            text = match.explanation or "No explanation is saved for this question."
            owner = f"{quiz.id}:{question_version_id}:explanation"
            access = "quiz_explanation"
        else:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Choose instruction, prompt, option, or explanation.",
            )
    if not str(text).strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "There is no text to read for that part.")
    asset, from_cache = cached_or_speak(
        session,
        owner_kind=f"quiz_{part}",
        owner_key=owner,
        text=str(text),
        access=access,
        user=None,
    )
    payload = asset_out(asset)
    payload["cached"] = from_cache
    payload["message"] = ""
    return {"ok": True, **payload}


def lesson_id_from_asset(owner_key: str) -> uuid.UUID:
    return uuid.UUID(owner_key)


def quiz_id_from_asset(owner_key: str) -> uuid.UUID:
    return uuid.UUID(owner_key.split(":", 1)[0])
