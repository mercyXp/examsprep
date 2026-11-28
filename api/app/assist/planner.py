"""Revision days from saved progress, scores, and dates. No readiness score."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


@dataclass
class LessonFact:
    module_code: str
    module_name: str
    title: str
    lesson_id: str
    completed: bool


@dataclass
class QuizFact:
    module_code: str
    title: str
    score_percent: float
    attempts: int


@dataclass
class TopicFact:
    module_code: str
    topic: str
    correct: int
    attempts: int


@dataclass
class ExamFact:
    module_code: str
    module_name: str
    on: date | None
    window_end: date | None
    source: str
    official: bool


@dataclass
class PlanInput:
    today: date
    daily_goal_minutes: int
    study_days: list[str] = field(default_factory=list)
    lessons: list[LessonFact] = field(default_factory=list)
    quizzes: list[QuizFact] = field(default_factory=list)
    topics: list[TopicFact] = field(default_factory=list)
    exams: list[ExamFact] = field(default_factory=list)
    lessons_touched: int = 0
    quiz_attempts: int = 0
    practice_attempts: int = 0


def build_plan(data: PlanInput) -> dict:
    evidence = _evidence(data)
    weak = _weak_topics(data.topics)
    incomplete = [item for item in data.lessons if not item.completed]
    if not weak and not incomplete and not data.quizzes and data.practice_attempts == 0 and data.lessons_touched == 0:
        return {
            "ok": True,
            "days": [],
            "weakTopics": [],
            "exams": [_exam_out(item) for item in data.exams],
            "evidence": evidence,
            "dailyGoalMinutes": data.daily_goal_minutes,
            "message": "There is no lesson progress, quiz result, or practice attempt to plan from yet.",
        }
    horizon = _horizon(data)
    days = []
    lesson_cursor = 0
    topic_cursor = 0
    for offset in range(horizon):
        day = data.today + timedelta(days=offset)
        if not _is_study_day(day, data.study_days):
            continue
        blocks = _blocks_for_day(data, day, incomplete, weak, lesson_cursor, topic_cursor)
        lesson_cursor += sum(1 for block in blocks if block["kind"] == "lesson")
        topic_cursor += sum(1 for block in blocks if block["kind"] == "practice")
        if blocks:
            days.append({"date": day.isoformat(), "blocks": blocks})
        if len(days) >= 14:
            break
    message = ""
    if not any(item.official and (item.on or item.window_end) for item in data.exams):
        message = "No published exam date is on the timetable, so these days are not tied to an official sitting."
    return {
        "ok": True,
        "days": days,
        "weakTopics": weak,
        "exams": [_exam_out(item) for item in data.exams],
        "evidence": evidence,
        "dailyGoalMinutes": data.daily_goal_minutes,
        "message": message,
    }


def _evidence(data: PlanInput) -> list[str]:
    lines = []
    by_module: dict[str, list[LessonFact]] = {}
    for lesson in data.lessons:
        by_module.setdefault(lesson.module_code, []).append(lesson)
    for code, lessons in sorted(by_module.items()):
        done = sum(1 for item in lessons if item.completed)
        lines.append(f"You completed {done} of {len(lessons)} published lessons in {code}.")
    for quiz in data.quizzes:
        lines.append(
            f"Your latest {quiz.title} score in {quiz.module_code} is {quiz.score_percent:.0f}% across {quiz.attempts} attempt{'s' if quiz.attempts != 1 else ''}."
        )
    for topic in data.topics:
        if topic.attempts:
            lines.append(
                f"You answered {topic.correct} of {topic.attempts} practice questions on {topic.topic} in {topic.module_code} correctly."
            )
    lines.append(
        f"In the saved activity there are {data.lessons_touched} lesson updates, {data.quiz_attempts} quiz attempts, and {data.practice_attempts} practice attempts."
    )
    lines.append(f"Your daily goal is {data.daily_goal_minutes} minutes.")
    if data.study_days:
        lines.append(f"Your saved study days are {', '.join(data.study_days)}.")
    else:
        lines.append("No study days are saved, so the plan uses every day in the window.")
    return lines


def _weak_topics(topics: list[TopicFact]) -> list[dict]:
    weak = []
    for topic in topics:
        if topic.attempts < 1:
            continue
        if topic.correct / topic.attempts >= 0.6:
            continue
        weak.append(
            {
                "moduleCode": topic.module_code,
                "topic": topic.topic,
                "correct": topic.correct,
                "attempts": topic.attempts,
                "because": (
                    f"{topic.correct} of {topic.attempts} marked practice answers on {topic.topic} were correct, which is under 60%."
                ),
            }
        )
    weak.sort(key=lambda item: (item["correct"] / item["attempts"], -item["attempts"]))
    return weak


def _horizon(data: PlanInput) -> int:
    future = []
    for exam in data.exams:
        target = exam.on or exam.window_end
        if target is None:
            continue
        if target >= data.today:
            future.append((target - data.today).days + 1)
    if not future:
        return 7
    return max(1, min(min(future), 14))


def _is_study_day(day: date, study_days: list[str]) -> bool:
    if not study_days:
        return True
    return WEEKDAYS[day.weekday()] in set(study_days)


def _blocks_for_day(
    data: PlanInput,
    day: date,
    incomplete: list[LessonFact],
    weak: list[dict],
    lesson_cursor: int,
    topic_cursor: int,
) -> list[dict]:
    remaining = max(int(data.daily_goal_minutes or 0), 0)
    if remaining <= 0:
        return []
    blocks = []
    if weak:
        topic = weak[topic_cursor % len(weak)]
        minutes = min(25, remaining)
        exam_line = _exam_line(data, topic["moduleCode"])
        because = [topic["because"]]
        if exam_line:
            because.append(exam_line)
        blocks.append(
            {
                "minutes": minutes,
                "kind": "practice",
                "title": f"Practice {topic['topic']}",
                "moduleCode": topic["moduleCode"],
                "because": because,
            }
        )
        remaining -= minutes
    if remaining >= 15 and incomplete:
        lesson = incomplete[lesson_cursor % len(incomplete)]
        minutes = min(remaining, 30)
        because = [f"You have not completed “{lesson.title}” in {lesson.module_code}."]
        exam_line = _exam_line(data, lesson.module_code)
        if exam_line:
            because.append(exam_line)
        blocks.append(
            {
                "minutes": minutes,
                "kind": "lesson",
                "title": lesson.title,
                "moduleCode": lesson.module_code,
                "lessonId": lesson.lesson_id,
                "because": because,
            }
        )
        remaining -= minutes
    if remaining >= 15 and data.quizzes:
        weakest = min(data.quizzes, key=lambda item: item.score_percent)
        if weakest.score_percent < 70:
            because = [
                f"Your latest score on {weakest.title} is {weakest.score_percent:.0f}% from {weakest.attempts} attempt{'s' if weakest.attempts != 1 else ''}."
            ]
            blocks.append(
                {
                    "minutes": min(remaining, 20),
                    "kind": "quiz",
                    "title": f"Retry {weakest.title}",
                    "moduleCode": weakest.module_code,
                    "because": because,
                }
            )
    return blocks


def _exam_line(data: PlanInput, module_code: str) -> str:
    matches = [item for item in data.exams if item.module_code == module_code]
    if not matches:
        return ""
    exam = matches[0]
    if exam.official and exam.on:
        return f"The published timetable lists {module_code} on {exam.on.isoformat()}."
    if exam.official and exam.window_end:
        return (
            f"{module_code} has an official exam window ending {exam.window_end.isoformat()}. "
            "No single sitting date is published."
        )
    if exam.on:
        return f"You saved {exam.on.isoformat()} for {module_code}. It is not a published sitting."
    return ""


def _exam_out(exam: ExamFact) -> dict:
    return {
        "moduleCode": exam.module_code,
        "moduleName": exam.module_name,
        "date": exam.on.isoformat() if exam.on else None,
        "windowEnd": exam.window_end.isoformat() if exam.window_end else None,
        "source": exam.source,
        "official": exam.official,
    }
