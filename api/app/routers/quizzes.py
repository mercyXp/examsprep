"""Student quizzes.

Only a published quiz is returned, and only when the signed-in person may see
that module. Correct answers stay on the server until the attempt is submitted.
The score is stored with the question-version ids that were used, so a later
edit cannot rewrite a finished attempt.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_session
from app.models import Quiz, QuizAttempt, User
from app.models.content import QuizVersion, QuizVersionQuestion
from app.models.enums import ContentStatus
from app.models.learning import AttemptAnswer
from app.quizzes import (
    GradedQuestion,
    correct_id_set,
    grade_questions,
    normalize_choices,
    passed_score,
    percent_score,
)
from app.routers.learn import visible_module_ids
from app.security import require_user

router = APIRouter(prefix="/api/learn", tags=["quizzes"])


class AnswerIn(BaseModel):
    question_version_id: uuid.UUID
    selected_option_ids: list[str] = Field(default_factory=list)


class SubmitIn(BaseModel):
    answers: list[AnswerIn] = Field(default_factory=list)


def _published_quiz(session: Session, quiz_id: uuid.UUID, user: User) -> Quiz:
    quiz = session.scalars(
        select(Quiz)
        .options(
            joinedload(Quiz.module),
            joinedload(Quiz.published_version)
            .joinedload(QuizVersion.questions)
            .joinedload(QuizVersionQuestion.question_version),
        )
        .where(Quiz.id == quiz_id)
    ).unique().one_or_none()
    if quiz is None or quiz.status != ContentStatus.PUBLISHED or quiz.published_version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found.")
    allowed = visible_module_ids(session, user)
    if allowed is not None and quiz.module_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found.")
    return quiz


def _questions(quiz: Quiz) -> list[GradedQuestion]:
    version = quiz.published_version
    if version is None:
        return []
    graded: list[GradedQuestion] = []
    for link in sorted(version.questions, key=lambda item: item.position):
        question = link.question_version
        if question is None:
            continue
        graded.append(
            GradedQuestion(
                question_version_id=str(question.id),
                points=link.points,
                correct_ids=correct_id_set(question.correct_option_ids),
                prompt=question.prompt,
                explanation=question.explanation or "",
                choices=normalize_choices(question.choices),
            )
        )
    return graded


def _public_question(question: GradedQuestion) -> dict[str, Any]:
    return {
        "id": question.question_version_id,
        "prompt": question.prompt,
        "points": question.points,
        "choices": [{"id": choice.id, "label": choice.label} for choice in question.choices],
    }


@router.get("/quizzes")
def list_quizzes(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    query = (
        select(Quiz)
        .options(joinedload(Quiz.module))
        .where(Quiz.status == ContentStatus.PUBLISHED, Quiz.published_version_id.is_not(None))
        .order_by(Quiz.title)
    )
    allowed = visible_module_ids(session, user)
    if allowed is not None:
        if not allowed:
            return {"ok": True, "items": []}
        query = query.where(Quiz.module_id.in_(allowed))
    quizzes = list(session.scalars(query).unique())
    return {
        "ok": True,
        "items": [
            {
                "id": str(quiz.id),
                "title": quiz.title,
                "kind": quiz.kind.value,
                "moduleId": str(quiz.module_id),
                "moduleCode": quiz.module.code if quiz.module else None,
                "moduleName": quiz.module.name if quiz.module else None,
            }
            for quiz in quizzes
        ],
    }


@router.get("/quizzes/{quiz_id}")
def get_quiz(
    quiz_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    quiz = _published_quiz(session, quiz_id, user)
    version = quiz.published_version
    return {
        "ok": True,
        "item": {
            "id": str(quiz.id),
            "title": quiz.title,
            "kind": quiz.kind.value,
            "moduleId": str(quiz.module_id),
            "moduleCode": quiz.module.code if quiz.module else None,
            "timeLimitSeconds": version.time_limit_seconds if version else None,
            "passMarkPercent": version.pass_mark_percent if version else 50,
            "questions": [_public_question(question) for question in _questions(quiz)],
        },
    }


@router.post("/quizzes/{quiz_id}/attempts")
def submit_quiz(
    quiz_id: uuid.UUID,
    body: SubmitIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    quiz = _published_quiz(session, quiz_id, user)
    version = quiz.published_version
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found.")
    questions = _questions(quiz)
    if not questions:
        raise HTTPException(status.HTTP_409_CONFLICT, "This quiz has no questions yet.")
    selected = {str(answer.question_version_id): list(answer.selected_option_ids) for answer in body.answers}
    results, earned, possible = grade_questions(questions, selected)
    percent = percent_score(earned, possible)
    passed = passed_score(percent, version.pass_mark_percent)
    now = datetime.now(UTC)
    attempt = QuizAttempt(
        user_id=user.id,
        quiz_id=quiz.id,
        quiz_version_id=version.id,
        started_at=now,
        submitted_at=now,
        score_percent=percent,
        passed=passed,
    )
    session.add(attempt)
    session.flush()
    by_id = {question.question_version_id: question for question in questions}
    for result in results:
        session.add(
            AttemptAnswer(
                attempt_id=attempt.id,
                question_version_id=uuid.UUID(result.question_version_id),
                selected_option_ids=list(result.selected_option_ids),
                is_correct=result.correct,
                points_awarded=result.points_awarded,
            )
        )
    session.flush()
    return {
        "ok": True,
        "attemptId": str(attempt.id),
        "scorePercent": percent,
        "passed": passed,
        "pointsEarned": earned,
        "pointsPossible": possible,
        "questions": [
            {
                "id": result.question_version_id,
                "correct": result.correct,
                "pointsAwarded": result.points_awarded,
                "explanation": by_id[result.question_version_id].explanation,
                "correctOptionIds": sorted(by_id[result.question_version_id].correct_ids),
            }
            for result in results
        ],
    }
