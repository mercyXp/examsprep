"""Personal practice questions. Stored apart from the official question bank."""

from __future__ import annotations

import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.provider import select_provider
from app.assist.messages import not_configured
from app.assist.outline import parse_json_object
from app.cms import new_id, slides_plain_text
from app.models import Lesson, Module, PracticeAttempt, PracticeQuestion, User
from app.models.enums import ContentStatus
from app.routers.learn import published_lesson, visible_module_ids

KINDS = {"mcq", "tf", "short", "structured", "exam"}
DIFFICULTIES = {"foundation", "standard", "challenge"}

PRACTICE_SYSTEM = """You write practice questions from the lesson text only.
Return one JSON object and no markdown: {"questions": [...]} or {"error": "topic_missing"}.
Each question has prompt, kind, difficulty, topic, choices, correctLabel, acceptedAnswers,
explanation, modelAnswer.
kind is one of mcq, tf, short, structured, exam.
Use the requested kinds and difficulty. Do not copy the lesson verbatim as the prompt.
If the lesson text does not cover the requested topic, return {"error": "topic_missing"}.
Do not include a status field. These questions are practice, not an official exam.
"""

MARK_SYSTEM = """Mark a student's answer against the model answer.
Return one JSON object: {"correct": true or false, "feedback": "short reason"}.
correct is true only when the meaning matches the model answer.
Do not award a readiness percentage.
"""


def generate_practice(
    session: Session,
    user: User,
    *,
    module_id: uuid.UUID,
    lesson_id: uuid.UUID | None,
    kinds: list[str],
    difficulty: str,
    topic: str,
    count: int,
) -> dict:
    provider = select_provider()
    if not provider.configured:
        raise not_configured("Practice questions", "AI_API_KEY")
    _require_module(session, user, module_id)
    level = difficulty if difficulty in DIFFICULTIES else ""
    if not level:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose foundation, standard, or challenge.")
    selected = [kind for kind in kinds if kind in KINDS]
    if not selected:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Choose at least one question type: mcq, tf, short, structured, or exam.",
        )
    amount = min(max(count, 1), 8)
    source, lesson = _lesson_text(session, user, module_id, lesson_id)
    module = session.get(Module, module_id)
    code = module.code if module else ""
    prompt = (
        f"Course: {code}\nDifficulty: {level}\nKinds: {', '.join(selected)}\n"
        f"Count: {amount}\nTopic filter: {topic.strip() or 'any topic in the lesson'}\n\n"
        f"Lesson text:\n{source[:8000]}"
    )
    completion = provider.complete(PRACTICE_SYSTEM, prompt)
    if completion.degraded or not completion.text.strip():
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The AI provider did not return practice questions. Nothing was saved.",
        )
    payload = parse_json_object(completion.text)
    if payload is None:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The model reply was not usable. Nothing was saved.")
    if payload.get("error") == "topic_missing":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This lesson does not cover that topic, so no practice questions were created.",
        )
    created = []
    for item in payload.get("questions") or []:
        row = _row_from_model(user, module_id, lesson.id if lesson else None, item, level, selected, topic)
        if row is None:
            continue
        session.add(row)
        created.append(row)
        if len(created) >= amount:
            break
    if not created:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The model did not return any usable questions. Nothing was saved.")
    session.flush()
    return {"ok": True, "items": [question_out(row, reveal=False) for row in created], "official": False}


def answer_practice(
    session: Session,
    user: User,
    question_id: uuid.UUID,
    *,
    answer_text: str,
    selected_option_ids: list[str],
) -> dict:
    question = session.get(PracticeQuestion, question_id)
    if question is None or question.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Practice question not found.")
    if question.kind in {"mcq", "tf"}:
        correct_ids = {str(item) for item in question.correct_option_ids or []}
        chosen = [str(item) for item in selected_option_ids]
        if not chosen:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose an option.")
        is_correct: bool | None = set(chosen) == correct_ids and bool(correct_ids)
        feedback = question.explanation or ("That matches the saved answer." if is_correct else "That does not match the saved answer.")
    elif question.kind == "short":
        if not answer_text.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Type an answer.")
        is_correct = short_matches(answer_text, list(question.accepted_answers or []), question.model_answer)
        feedback = question.explanation or (
            "That matches the saved answer." if is_correct else "That does not match the saved answer."
        )
    else:
        if not answer_text.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Type an answer.")
        is_correct, feedback = mark_long_answer(answer_text, question)
    attempt = PracticeAttempt(
        user_id=user.id,
        question_id=question.id,
        answer_text=answer_text.strip()[:4000],
        selected_option_ids=list(selected_option_ids),
        is_correct=is_correct,
        feedback=feedback[:2000],
    )
    session.add(attempt)
    session.flush()
    revealed = question_out(question, reveal=True)
    revealed["attempt"] = {
        "id": str(attempt.id),
        "correct": attempt.is_correct,
        "feedback": attempt.feedback,
    }
    revealed["official"] = False
    return {"ok": True, "item": revealed}


def list_practice(session: Session, user: User, module_id: uuid.UUID | None) -> list[dict]:
    query = select(PracticeQuestion).where(PracticeQuestion.user_id == user.id).order_by(PracticeQuestion.created_at.desc())
    if module_id is not None:
        query = query.where(PracticeQuestion.module_id == module_id)
    rows = list(session.scalars(query.limit(40)))
    return [question_out(row, reveal=False) for row in rows]


def performance(session: Session, user: User) -> dict:
    attempts = list(session.scalars(select(PracticeAttempt).where(PracticeAttempt.user_id == user.id)))
    questions = {
        row.id: row
        for row in session.scalars(select(PracticeQuestion).where(PracticeQuestion.user_id == user.id))
    }
    by_topic: dict[str, dict[str, int]] = {}
    by_kind: dict[str, dict[str, int]] = {}
    correct = 0
    marked = 0
    unmarked = 0
    for attempt in attempts:
        question = questions.get(attempt.question_id)
        topic = (question.topic if question else "") or "Untagged"
        kind = question.kind if question else "unknown"
        topic_row = by_topic.setdefault(topic, {"attempts": 0, "correct": 0, "unmarked": 0})
        kind_row = by_kind.setdefault(kind, {"attempts": 0, "correct": 0, "unmarked": 0})
        topic_row["attempts"] += 1
        kind_row["attempts"] += 1
        if attempt.is_correct is None:
            unmarked += 1
            topic_row["unmarked"] += 1
            kind_row["unmarked"] += 1
        else:
            marked += 1
            if attempt.is_correct:
                correct += 1
                topic_row["correct"] += 1
                kind_row["correct"] += 1
    return {
        "ok": True,
        "attempts": len(attempts),
        "markedAttempts": marked,
        "markedCorrect": correct,
        "unmarked": unmarked,
        "byTopic": [{"topic": key, **value} for key, value in sorted(by_topic.items())],
        "byKind": [{"kind": key, **value} for key, value in sorted(by_kind.items())],
        "note": "Counts are saved practice attempts. They are not an exam readiness score, and they are not official exam questions.",
    }


def short_matches(answer: str, accepted: list[str], model_answer: str) -> bool:
    got = normalise_answer(answer)
    if not got:
        return False
    targets = [normalise_answer(item) for item in accepted]
    targets.append(normalise_answer(model_answer))
    return got in {item for item in targets if item}


def normalise_answer(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").casefold()).strip()


def mark_long_answer(answer: str, question: PracticeQuestion) -> tuple[bool | None, str]:
    provider = select_provider()
    if not provider.configured:
        return None, (
            "This answer was not marked because AI_API_KEY is not set. "
            "Compare it with the model answer. Nothing was scored automatically."
        )
    prompt = (
        f"Question: {question.prompt}\nModel answer: {question.model_answer}\n"
        f"Explanation: {question.explanation}\nStudent answer: {answer[:4000]}"
    )
    completion = provider.complete(MARK_SYSTEM, prompt)
    payload = parse_json_object(completion.text) if not completion.degraded else None
    if payload is None or not isinstance(payload.get("correct"), bool):
        return None, "This answer was not marked because the AI provider did not return a result. Compare it with the model answer."
    feedback = str(payload.get("feedback") or "").strip() or "Marked against the saved model answer."
    return bool(payload["correct"]), feedback


def question_out(row: PracticeQuestion, *, reveal: bool) -> dict:
    payload = {
        "id": str(row.id),
        "moduleId": str(row.module_id),
        "lessonId": str(row.lesson_id) if row.lesson_id else None,
        "topic": row.topic,
        "kind": row.kind,
        "difficulty": row.difficulty,
        "prompt": row.prompt,
        "choices": list(row.choices or []),
        "source": row.source,
        "official": False,
    }
    if reveal:
        payload["correctOptionIds"] = list(row.correct_option_ids or [])
        payload["acceptedAnswers"] = list(row.accepted_answers or [])
        payload["explanation"] = row.explanation
        payload["modelAnswer"] = row.model_answer
    return payload


def _lesson_text(session: Session, user: User, module_id: uuid.UUID, lesson_id: uuid.UUID | None) -> tuple[str, Lesson | None]:
    if lesson_id is not None:
        lesson = published_lesson(session, lesson_id, user)
        if lesson.module_id != module_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That lesson is not in the selected course.")
        version = lesson.published_version
        text = ""
        if version is not None:
            text = version.body or slides_plain_text(version.slides or [])
        if not text.strip():
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That published lesson has no text to practice from.")
        return text, lesson
    lessons = list(
        session.scalars(
            select(Lesson)
            .where(Lesson.module_id == module_id, Lesson.status == ContentStatus.PUBLISHED)
            .order_by(Lesson.position)
            .limit(6)
        )
    )
    chunks = []
    for lesson in lessons:
        version = lesson.published_version
        if version is None:
            continue
        body = version.body or slides_plain_text(version.slides or [])
        if body.strip():
            chunks.append(f"{lesson.title}\n{body.strip()}")
    if not chunks:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "This course has no published lesson text to practice from.")
    return "\n\n".join(chunks), None


def _require_module(session: Session, user: User, module_id: uuid.UUID) -> None:
    allowed = visible_module_ids(session, user)
    if allowed is not None and module_id not in allowed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found.")


def _row_from_model(
    user: User,
    module_id: uuid.UUID,
    lesson_id: uuid.UUID | None,
    item: object,
    difficulty: str,
    kinds: list[str],
    topic_filter: str,
) -> PracticeQuestion | None:
    if not isinstance(item, dict):
        return None
    prompt = str(item.get("prompt") or "").strip()
    kind = str(item.get("kind") or "").strip().lower()
    if kind == "truefalse":
        kind = "tf"
    if kind not in kinds or len(prompt) < 8:
        return None
    choices = []
    correct_ids: list[str] = []
    labels = [str(choice).strip() for choice in item.get("choices") or [] if str(choice).strip()]
    if kind == "tf":
        labels = ["True", "False"]
    correct = str(item.get("correctLabel") or "").strip()
    if kind in {"mcq", "tf"}:
        if len(labels) < 2 or not correct:
            return None
        matched = False
        for label in labels[:6]:
            option_id = new_id()
            choices.append({"id": option_id, "label": label[:400]})
            if label.casefold() == correct.casefold():
                correct_ids.append(option_id)
                matched = True
        if not matched:
            return None
    accepted = [str(value).strip() for value in item.get("acceptedAnswers") or [] if str(value).strip()]
    model_answer = str(item.get("modelAnswer") or "").strip()
    if kind == "short" and not accepted and not model_answer and correct:
        accepted = [correct]
    if kind in {"short", "structured", "exam"} and not model_answer and not accepted:
        return None
    topic = str(item.get("topic") or topic_filter or "").strip()[:180]
    return PracticeQuestion(
        user_id=user.id,
        module_id=module_id,
        lesson_id=lesson_id,
        topic=topic,
        kind=kind,
        difficulty=difficulty,
        prompt=prompt[:2000],
        choices=choices,
        correct_option_ids=correct_ids,
        accepted_answers=accepted[:8],
        explanation=str(item.get("explanation") or "")[:4000],
        model_answer=model_answer[:4000],
        source="ai_practice",
    )
