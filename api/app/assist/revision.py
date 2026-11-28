"""Load the facts the revision plan is allowed to use."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.assist.planner import ExamFact, LessonFact, PlanInput, QuizFact, TopicFact, build_plan
from app.calendar import resolve_student_schedule
from app.models import (
    Lesson,
    LessonProgress,
    Module,
    PracticeAttempt,
    PracticeQuestion,
    Quiz,
    QuizAttempt,
    User,
)
from app.models.enums import ContentStatus
from app.routers.learn import visible_module_ids


def revision_plan(session: Session, user: User, *, today=None) -> dict:
    profile = user.profile
    daily_goal = int(profile.daily_goal_minutes) if profile is not None else 60
    study_days = [str(day) for day in (profile.study_days or []) if isinstance(day, str)] if profile is not None else []
    allowed = visible_module_ids(session, user, include_history=False)
    lesson_query = select(Lesson).where(Lesson.status == ContentStatus.PUBLISHED)
    if allowed is not None:
        if not allowed:
            lessons = []
        else:
            lessons = list(session.scalars(lesson_query.where(Lesson.module_id.in_(allowed))))
    else:
        lessons = list(session.scalars(lesson_query))
    module_ids = {lesson.module_id for lesson in lessons}
    modules = {
        row.id: row
        for row in session.scalars(select(Module).where(Module.id.in_(module_ids)))
    } if module_ids else {}
    progress = {
        row.lesson_id: row
        for row in session.scalars(select(LessonProgress).where(LessonProgress.user_id == user.id))
    }
    lesson_facts = [
        LessonFact(
            module_code=modules[lesson.module_id].code if lesson.module_id in modules else "",
            module_name=modules[lesson.module_id].name if lesson.module_id in modules else "",
            title=lesson.title,
            lesson_id=str(lesson.id),
            completed=progress.get(lesson.id) is not None and progress[lesson.id].completed_at is not None,
        )
        for lesson in lessons
    ]
    quiz_facts = _quiz_facts(session, user, allowed)
    topic_facts = _topic_facts(session, user)
    since = datetime.now(UTC) - timedelta(days=14)
    lessons_touched = session.scalar(
        select(func.count()).select_from(LessonProgress).where(
            LessonProgress.user_id == user.id,
            LessonProgress.updated_at >= since,
        )
    ) or 0
    quiz_attempts = session.scalar(
        select(func.count()).select_from(QuizAttempt).where(
            QuizAttempt.user_id == user.id,
            QuizAttempt.submitted_at.is_not(None),
            QuizAttempt.submitted_at >= since,
        )
    ) or 0
    practice_attempts = session.scalar(
        select(func.count()).select_from(PracticeAttempt).where(
            PracticeAttempt.user_id == user.id,
            PracticeAttempt.created_at >= since,
        )
    ) or 0
    plan = build_plan(
        PlanInput(
            today=today or datetime.now(UTC).date(),
            daily_goal_minutes=daily_goal,
            study_days=study_days,
            lessons=lesson_facts,
            quizzes=quiz_facts,
            topics=topic_facts,
            exams=_exams(resolve_student_schedule(session, user)),
            lessons_touched=int(lessons_touched),
            quiz_attempts=int(quiz_attempts),
            practice_attempts=int(practice_attempts),
        )
    )
    plan["activity"] = {
        "lessonUpdates": int(lessons_touched),
        "quizAttempts": int(quiz_attempts),
        "practiceAttempts": int(practice_attempts),
        "windowDays": 14,
    }
    return plan


def _quiz_facts(session: Session, user: User, allowed: set | None) -> list[QuizFact]:
    rows = list(
        session.scalars(
            select(QuizAttempt)
            .options(joinedload(QuizAttempt.quiz).joinedload(Quiz.module))
            .where(QuizAttempt.user_id == user.id, QuizAttempt.submitted_at.is_not(None))
        ).unique()
    )
    grouped: dict = {}
    for row in rows:
        quiz = row.quiz
        if quiz is None:
            continue
        if allowed is not None and quiz.module_id not in allowed:
            continue
        bucket = grouped.setdefault(
            quiz.id,
            {
                "code": quiz.module.code if quiz.module else "",
                "title": quiz.title,
                "latest": row,
                "count": 0,
            },
        )
        bucket["count"] += 1
        if row.submitted_at and bucket["latest"].submitted_at and row.submitted_at >= bucket["latest"].submitted_at:
            bucket["latest"] = row
    facts = []
    for bucket in grouped.values():
        score = bucket["latest"].score_percent
        facts.append(
            QuizFact(
                module_code=bucket["code"],
                title=bucket["title"],
                score_percent=float(score or 0),
                attempts=bucket["count"],
            )
        )
    return facts


def _topic_facts(session: Session, user: User) -> list[TopicFact]:
    questions = {
        row.id: row
        for row in session.scalars(select(PracticeQuestion).where(PracticeQuestion.user_id == user.id))
    }
    if not questions:
        return []
    module_ids = {row.module_id for row in questions.values()}
    modules = {row.id: row for row in session.scalars(select(Module).where(Module.id.in_(module_ids)))}
    attempts = list(session.scalars(select(PracticeAttempt).where(PracticeAttempt.user_id == user.id)))
    tallies: dict[tuple[str, str], list[int]] = {}
    for attempt in attempts:
        question = questions.get(attempt.question_id)
        if question is None or attempt.is_correct is None:
            continue
        code = modules[question.module_id].code if question.module_id in modules else ""
        topic = question.topic or "Untagged"
        correct, total = tallies.get((code, topic), [0, 0])
        tallies[(code, topic)] = [correct + int(attempt.is_correct), total + 1]
    return [
        TopicFact(module_code=code, topic=topic, correct=values[0], attempts=values[1])
        for (code, topic), values in tallies.items()
    ]


def _exams(schedule: dict) -> list[ExamFact]:
    facts = []
    for item in schedule.get("modules") or []:
        source = str(item.get("source") or "")
        official = bool(item.get("official"))
        on = _date(item.get("examDate"))
        window_end = _date(item.get("windowEnd"))
        if source == "module" and on:
            facts.append(
                ExamFact(item.get("code") or "", item.get("name") or "", on, on, "module", True)
            )
        elif source == "program" and window_end:
            facts.append(
                ExamFact(item.get("code") or "", item.get("name") or "", None, window_end, "program", True)
            )
        elif source == "estimated" and on:
            facts.append(
                ExamFact(item.get("code") or "", item.get("name") or "", on, None, "saved", False)
            )
        elif official and on:
            facts.append(
                ExamFact(item.get("code") or "", item.get("name") or "", on, window_end, source or "official", True)
            )
    return facts


def _date(value: object):
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        year, month, day = (int(part) for part in value[:10].split("-"))
        return datetime(year, month, day).date()
    except ValueError:
        return None
