"""Personal practice. These questions never enter the official exam bank."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.assist.practice import answer_practice, generate_practice, list_practice, performance
from app.assist.rate_limit import enforce_ai_limit
from app.db import get_session
from app.models import User
from app.security import require_user

router = APIRouter(prefix="/api/learn/practice", tags=["practice"])
USER = Depends(require_user)
DB = Depends(get_session)


class GenerateIn(BaseModel):
    module_id: uuid.UUID
    lesson_id: uuid.UUID | None = None
    kinds: list[str] = Field(default_factory=lambda: ["mcq"])
    difficulty: str = "standard"
    topic: str = ""
    count: int = 4


class AnswerIn(BaseModel):
    answer: str = ""
    selected_option_ids: list[str] = Field(default_factory=list)


@router.post("/generate", summary="Generate practice from a published lesson")
def generate(
    body: GenerateIn,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """MCQ, true/false, short, structured, or exam-style questions. Stored only on this account."""
    enforce_ai_limit(user.id, "practice")
    return generate_practice(
        session,
        user,
        module_id=body.module_id,
        lesson_id=body.lesson_id,
        kinds=body.kinds,
        difficulty=body.difficulty,
        topic=body.topic,
        count=body.count,
    )


@router.get("", summary="Saved practice questions")
def saved(
    module_id: uuid.UUID | None = None,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    return {"ok": True, "items": list_practice(session, user, module_id), "official": False}


@router.post("/{question_id}/answer", summary="Mark a practice answer")
def answer(
    question_id: uuid.UUID,
    body: AnswerIn,
    user: User = USER,
    session: Session = DB,
) -> dict[str, Any]:
    """MCQ and short answers are checked against the saved key. Longer answers use the model when a key is set."""
    if body.answer.strip() and not body.selected_option_ids:
        enforce_ai_limit(user.id, "practice")
    return answer_practice(
        session,
        user,
        question_id,
        answer_text=body.answer,
        selected_option_ids=body.selected_option_ids,
    )


@router.get("/performance", summary="Practice attempt counts")
def practice_performance(user: User = USER, session: Session = DB) -> dict[str, Any]:
    """Counts of saved attempts by topic and type. This is not an exam readiness score."""
    return performance(session, user)
