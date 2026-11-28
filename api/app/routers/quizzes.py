"""Student quizzes.

Only a published quiz is returned, and only when the signed-in person may see
that module. Correct answers stay on the server until the attempt is submitted.
The score is stored with the question-version ids that were used, so a later
edit cannot rewrite a finished attempt.

Timed mock exams are started and then submitted. The start time is stored on
the attempt. A submission a few seconds past the limit is still marked and
flagged as timed out. An untimed practice quiz can still be submitted in one
request, which is what the mobile app does.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db import get_session
from app.models import Quiz, QuizAttempt, Topic, User
from app.models.content import QuestionVersion, QuizVersion, QuizVersionQuestion
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

TIME_GRACE = timedelta(seconds=20)
CHOICE_KINDS = {"mcq", "true_false"}


class AnswerIn(BaseModel):
    question_version_id: uuid.UUID
    selected_option_ids: list[str] = Field(default_factory=list)
    response_text: str = ""


class SubmitIn(BaseModel):
    answers: list[AnswerIn] = Field(default_factory=list)


def _published_quiz(session: Session, quiz_id: uuid.UUID, user: User) -> Quiz:
    quiz = session.scalars(
        select(Quiz)
        .options(
            joinedload(Quiz.module),
            joinedload(Quiz.published_version)
            .joinedload(QuizVersion.questions)
            .joinedload(QuizVersionQuestion.question_version)
            .joinedload(QuestionVersion.question),
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
        parent = question.question
        accepted = question.accepted_answers if isinstance(question.accepted_answers, list) else []
        graded.append(
            GradedQuestion(
                question_version_id=str(question.id),
                points=link.points,
                correct_ids=correct_id_set(question.correct_option_ids),
                prompt=question.prompt,
                explanation=question.explanation or "",
                choices=normalize_choices(question.choices),
                kind=(parent.kind if parent is not None else "mcq") or "mcq",
                accepted=tuple(str(item) for item in accepted),
                model_answer=question.model_answer or "",
            )
        )
    return graded


def _public_question(question: GradedQuestion) -> dict[str, Any]:
    kind = question.kind if question.kind in CHOICE_KINDS or question.kind in {"short", "blank", "structured"} else "mcq"
    choices = [{"id": choice.id, "label": choice.label} for choice in question.choices] if kind in CHOICE_KINDS else []
    return {
        "id": question.question_version_id,
        "prompt": question.prompt,
        "points": question.points,
        "kind": kind,
        "choices": choices,
    }


def _attempt_summary(attempt: QuizAttempt) -> dict[str, Any]:
    return {
        "id": str(attempt.id),
        "quizId": str(attempt.quiz_id),
        "startedAt": attempt.started_at.isoformat(),
        "submittedAt": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "scorePercent": int(attempt.score_percent) if attempt.score_percent is not None else None,
        "passed": attempt.passed,
        "timedOut": bool(attempt.timed_out),
    }


def _deadline(attempt: QuizAttempt, limit: int | None) -> str | None:
    if not limit:
        return None
    return (attempt.started_at + timedelta(seconds=limit)).isoformat()


def _open_attempt(session: Session, user: User, quiz: Quiz) -> QuizAttempt | None:
    version = quiz.published_version
    if version is None:
        return None
    return session.scalar(
        select(QuizAttempt)
        .where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.quiz_version_id == version.id,
            QuizAttempt.submitted_at.is_(None),
        )
        .order_by(QuizAttempt.started_at.desc())
    )


def _result_payload(
    attempt: QuizAttempt,
    questions: list[GradedQuestion],
    results,
    earned: int,
    possible: int,
    percent: int,
    passed: bool,
) -> dict[str, Any]:
    by_id = {question.question_version_id: question for question in questions}
    return {
        "ok": True,
        "attemptId": str(attempt.id),
        "scorePercent": percent,
        "passed": passed,
        "timedOut": bool(attempt.timed_out),
        "pointsEarned": earned,
        "pointsPossible": possible,
        "questions": [
            {
                "id": result.question_version_id,
                "prompt": by_id[result.question_version_id].prompt,
                "kind": by_id[result.question_version_id].kind,
                "correct": result.correct,
                "pointsAwarded": result.points_awarded,
                "points": by_id[result.question_version_id].points,
                "explanation": by_id[result.question_version_id].explanation,
                "correctOptionIds": sorted(by_id[result.question_version_id].correct_ids),
                "modelAnswer": by_id[result.question_version_id].model_answer,
                "selectedOptionIds": list(result.selected_option_ids),
                "responseText": result.response_text,
                "keyPointsMatched": result.key_points_matched,
                "keyPointsPossible": result.key_points_possible,
                "choices": [
                    {"id": choice.id, "label": choice.label}
                    for choice in by_id[result.question_version_id].choices
                ],
            }
            for result in results
        ],
    }


def _grade_and_store(
    session: Session,
    quiz: Quiz,
    attempt: QuizAttempt,
    body: SubmitIn,
    *,
    timed_out: bool,
) -> dict[str, Any]:
    version = quiz.published_version
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found.")
    questions = _questions(quiz)
    if not questions:
        raise HTTPException(status.HTTP_409_CONFLICT, "This quiz has no questions yet.")
    selected = {str(answer.question_version_id): list(answer.selected_option_ids) for answer in body.answers}
    written = {str(answer.question_version_id): answer.response_text for answer in body.answers}
    results, earned, possible = grade_questions(questions, selected, written)
    percent = percent_score(earned, possible)
    passed = passed_score(percent, version.pass_mark_percent)
    now = datetime.now(UTC)
    attempt.submitted_at = now
    attempt.score_percent = percent
    attempt.passed = passed
    attempt.timed_out = timed_out
    session.add(attempt)
    session.flush()
    for result in results:
        session.add(
            AttemptAnswer(
                attempt_id=attempt.id,
                question_version_id=uuid.UUID(result.question_version_id),
                selected_option_ids=list(result.selected_option_ids),
                response_text=result.response_text,
                is_correct=result.correct,
                points_awarded=result.points_awarded,
            )
        )
    session.flush()
    return _result_payload(attempt, questions, results, earned, possible, percent, passed)


def _over_time(attempt: QuizAttempt, limit: int | None, now: datetime) -> bool:
    if not limit:
        return False
    started = attempt.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=UTC)
    return now > started + timedelta(seconds=limit) + TIME_GRACE


@router.get("/quizzes")
def list_quizzes(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    query = (
        select(Quiz)
        .options(joinedload(Quiz.module), joinedload(Quiz.published_version).joinedload(QuizVersion.questions))
        .where(Quiz.status == ContentStatus.PUBLISHED, Quiz.published_version_id.is_not(None))
        .order_by(Quiz.title)
    )
    allowed = visible_module_ids(session, user)
    if allowed is not None:
        if not allowed:
            return {"ok": True, "items": []}
        query = query.where(Quiz.module_id.in_(allowed))
    quizzes = list(session.scalars(query).unique())
    attempts = list(
        session.scalars(
            select(QuizAttempt).where(QuizAttempt.user_id == user.id, QuizAttempt.submitted_at.is_not(None))
        )
    )
    by_quiz: dict[uuid.UUID, list[QuizAttempt]] = {}
    for attempt in attempts:
        by_quiz.setdefault(attempt.quiz_id, []).append(attempt)
    items = []
    for quiz in quizzes:
        version = quiz.published_version
        history = sorted(by_quiz.get(quiz.id, []), key=lambda item: item.submitted_at or item.started_at, reverse=True)
        scores = [int(item.score_percent) for item in history if item.score_percent is not None]
        items.append(
            {
                "id": str(quiz.id),
                "title": quiz.title,
                "kind": quiz.kind.value,
                "moduleId": str(quiz.module_id),
                "moduleCode": quiz.module.code if quiz.module else None,
                "moduleName": quiz.module.name if quiz.module else None,
                "timeLimitSeconds": version.time_limit_seconds if version else None,
                "passMarkPercent": version.pass_mark_percent if version else 50,
                "questionCount": len(version.questions) if version else 0,
                "attemptCount": len(history),
                "bestScorePercent": max(scores) if scores else None,
                "latestScorePercent": scores[0] if scores else None,
            }
        )
    return {"ok": True, "items": items}


@router.get("/quizzes/{quiz_id}")
def get_quiz(
    quiz_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    quiz = _published_quiz(session, quiz_id, user)
    version = quiz.published_version
    open_attempt = _open_attempt(session, user, quiz)
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
            "openAttempt": None
            if open_attempt is None
            else {
                **_attempt_summary(open_attempt),
                "deadline": _deadline(open_attempt, version.time_limit_seconds if version else None),
            },
        },
    }


@router.post("/quizzes/{quiz_id}/attempts/start")
def start_quiz(
    quiz_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    quiz = _published_quiz(session, quiz_id, user)
    version = quiz.published_version
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found.")
    if not _questions(quiz):
        raise HTTPException(status.HTTP_409_CONFLICT, "This quiz has no questions yet.")
    attempt = _open_attempt(session, user, quiz)
    if attempt is None:
        attempt = QuizAttempt(
            user_id=user.id,
            quiz_id=quiz.id,
            quiz_version_id=version.id,
            started_at=datetime.now(UTC),
        )
        session.add(attempt)
        session.flush()
    return {
        "ok": True,
        "attemptId": str(attempt.id),
        "startedAt": attempt.started_at.isoformat(),
        "deadline": _deadline(attempt, version.time_limit_seconds),
        "timeLimitSeconds": version.time_limit_seconds,
        "questions": [_public_question(question) for question in _questions(quiz)],
    }


@router.post("/quizzes/{quiz_id}/attempts/{attempt_id}/submit")
def submit_started_quiz(
    quiz_id: uuid.UUID,
    attempt_id: uuid.UUID,
    body: SubmitIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    quiz = _published_quiz(session, quiz_id, user)
    attempt = session.get(QuizAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id or attempt.quiz_id != quiz.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found.")
    if attempt.submitted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This attempt has already been submitted.")
    version = quiz.published_version
    if version is None or attempt.quiz_version_id != version.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This attempt is for an older version of the quiz.")
    timed_out = _over_time(attempt, version.time_limit_seconds, datetime.now(UTC))
    return _grade_and_store(session, quiz, attempt, body, timed_out=timed_out)


@router.post("/quizzes/{quiz_id}/attempts")
def submit_quiz(
    quiz_id: uuid.UUID,
    body: SubmitIn,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Mark immediately. Used by clients that do not start a timed sitting first."""
    quiz = _published_quiz(session, quiz_id, user)
    version = quiz.published_version
    if version is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz not found.")
    now = datetime.now(UTC)
    attempt = QuizAttempt(
        user_id=user.id,
        quiz_id=quiz.id,
        quiz_version_id=version.id,
        started_at=now,
    )
    session.add(attempt)
    session.flush()
    return _grade_and_store(session, quiz, attempt, body, timed_out=False)


@router.get("/quizzes/{quiz_id}/attempts")
def list_attempts(
    quiz_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    quiz = _published_quiz(session, quiz_id, user)
    rows = list(
        session.scalars(
            select(QuizAttempt)
            .where(QuizAttempt.user_id == user.id, QuizAttempt.quiz_id == quiz.id, QuizAttempt.submitted_at.is_not(None))
            .order_by(QuizAttempt.submitted_at.desc())
        )
    )
    return {"ok": True, "items": [_attempt_summary(row) for row in rows]}


@router.get("/attempts/{attempt_id}")
def get_attempt(
    attempt_id: uuid.UUID,
    user: User = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    attempt = session.scalars(
        select(QuizAttempt)
        .options(
            joinedload(QuizAttempt.answers),
            joinedload(QuizAttempt.quiz).joinedload(Quiz.module),
            joinedload(QuizAttempt.quiz)
            .joinedload(Quiz.published_version)
            .joinedload(QuizVersion.questions)
            .joinedload(QuizVersionQuestion.question_version)
            .joinedload(QuestionVersion.question),
        )
        .where(QuizAttempt.id == attempt_id)
    ).unique().one_or_none()
    if attempt is None or attempt.user_id != user.id or attempt.quiz is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found.")
    allowed = visible_module_ids(session, user)
    if allowed is not None and attempt.quiz.module_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found.")
    if attempt.submitted_at is None:
        version = attempt.quiz.published_version
        return {
            "ok": True,
            "item": {
                **_attempt_summary(attempt),
                "title": attempt.quiz.title,
                "kind": attempt.quiz.kind.value,
                "moduleCode": attempt.quiz.module.code if attempt.quiz.module else None,
                "submitted": False,
                "deadline": _deadline(attempt, version.time_limit_seconds if version else None),
                "questions": [],
            },
        }
    questions = {question.question_version_id: question for question in _questions(attempt.quiz)}
    reviewed = []
    earned = 0
    possible = 0
    for answer in sorted(attempt.answers, key=lambda row: str(row.question_version_id)):
        question = questions.get(str(answer.question_version_id))
        points = int(answer.points_awarded or 0)
        earned += points
        ceiling = question.points if question is not None else points
        possible += ceiling
        reviewed.append(
            {
                "id": str(answer.question_version_id),
                "prompt": question.prompt if question else "",
                "kind": question.kind if question else "mcq",
                "correct": bool(answer.is_correct),
                "pointsAwarded": points,
                "points": ceiling,
                "explanation": question.explanation if question else "",
                "correctOptionIds": sorted(question.correct_ids) if question else [],
                "modelAnswer": question.model_answer if question else "",
                "selectedOptionIds": list(answer.selected_option_ids or []),
                "responseText": answer.response_text or "",
                "keyPointsMatched": 0,
                "keyPointsPossible": 0,
                "choices": [{"id": choice.id, "label": choice.label} for choice in question.choices] if question else [],
            }
        )
    reviewed.sort(key=lambda item: list(questions).index(item["id"]) if item["id"] in questions else 999)
    percent = int(attempt.score_percent) if attempt.score_percent is not None else percent_score(earned, possible)
    return {
        "ok": True,
        "item": {
            **_attempt_summary(attempt),
            "title": attempt.quiz.title,
            "kind": attempt.quiz.kind.value,
            "moduleCode": attempt.quiz.module.code if attempt.quiz.module else None,
            "submitted": True,
            "pointsEarned": earned,
            "pointsPossible": possible,
            "scorePercent": percent,
            "passed": bool(attempt.passed),
            "questions": reviewed,
        },
    }


@router.get("/performance")
def topic_performance(user: User = Depends(require_user), session: Session = Depends(get_session)) -> dict[str, Any]:
    attempts = list(
        session.scalars(
            select(QuizAttempt)
            .options(
                joinedload(QuizAttempt.quiz).joinedload(Quiz.module),
                joinedload(QuizAttempt.answers)
                .joinedload(AttemptAnswer.question_version)
                .joinedload(QuestionVersion.question),
            )
            .where(QuizAttempt.user_id == user.id, QuizAttempt.submitted_at.is_not(None))
            .order_by(QuizAttempt.submitted_at.desc())
        ).unique()
    )
    link_points = {
        (link.quiz_version_id, link.question_version_id): link.points
        for link in session.scalars(select(QuizVersionQuestion))
    }
    topic_titles = {row.id: row.title for row in session.scalars(select(Topic))}
    topics: dict[str, dict[str, Any]] = {}
    questions_answered = 0
    questions_correct = 0
    for attempt in attempts:
        for answer in attempt.answers:
            questions_answered += 1
            if answer.is_correct:
                questions_correct += 1
            version = answer.question_version
            parent = version.question if version is not None else None
            topic_key = str(parent.topic_id) if parent is not None and parent.topic_id else "general"
            module_code = attempt.quiz.module.code if attempt.quiz and attempt.quiz.module else ""
            title = topic_titles.get(parent.topic_id, "General") if parent is not None and parent.topic_id else "General"
            bucket = topics.setdefault(
                topic_key,
                {
                    "topicId": None if topic_key == "general" else topic_key,
                    "title": title,
                    "moduleCode": module_code,
                    "answered": 0,
                    "correct": 0,
                    "pointsAwarded": 0,
                    "pointsPossible": 0,
                },
            )
            ceiling = link_points.get((attempt.quiz_version_id, answer.question_version_id), int(answer.points_awarded or 0))
            bucket["answered"] += 1
            bucket["correct"] += 1 if answer.is_correct else 0
            bucket["pointsAwarded"] += int(answer.points_awarded or 0)
            bucket["pointsPossible"] += ceiling
    topic_rows = []
    for bucket in topics.values():
        possible = bucket.pop("pointsPossible")
        awarded = bucket.pop("pointsAwarded")
        percent = int(round((awarded / possible) * 100)) if possible else 0
        topic_rows.append({**bucket, "percent": percent})
    topic_rows.sort(key=lambda item: (item["moduleCode"] or "", item["title"]))
    scores = [int(item.score_percent) for item in attempts if item.score_percent is not None]
    return {
        "ok": True,
        "questionsAnswered": questions_answered,
        "questionsCorrect": questions_correct,
        "attemptCount": len(attempts),
        "averageScorePercent": int(round(sum(scores) / len(scores))) if scores else None,
        "topics": topic_rows,
        "recentAttempts": [
            {
                **_attempt_summary(item),
                "title": item.quiz.title if item.quiz else "Quiz",
                "kind": item.quiz.kind.value if item.quiz else "practice",
                "moduleCode": item.quiz.module.code if item.quiz and item.quiz.module else None,
            }
            for item in attempts[:8]
        ],
    }

