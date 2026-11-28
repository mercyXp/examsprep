"""Decide who has earned a badge from lessons and quizzes the API already stores.

These functions do not talk to Solana and do not need a database. The router
loads rows, turns them into the small records below, and calls these rules.
That keeps the rules easy to test.

A study day is a UTC date on which the student completed a lesson or submitted
a quiz. Opening a lesson without finishing it does not count. Lesson progress
stores the completion time, not a history of every visit, so a streak is built
from those completion and submission timestamps.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

STREAK_DAYS = 3

KIND_TOPIC = "topic_mastered"
KIND_MOCK = "mock_exam_passed"
KIND_STREAK = "study_streak"
KIND_WEEKLY = "weekly_leaderboard"

# Byte stored on-chain. Keep this table in sync with programs/examsprep/src/lib.rs.
KIND_BYTE = {
    KIND_TOPIC: 0,
    KIND_MOCK: 1,
    KIND_STREAK: 2,
    KIND_WEEKLY: 3,
}

SELF_SERVE_KINDS = frozenset({KIND_TOPIC, KIND_MOCK, KIND_STREAK})


@dataclass(frozen=True)
class PublishedLesson:
    subject_key: str
    subject_label: str
    lesson_id: str


@dataclass(frozen=True)
class MockPass:
    quiz_id: str
    label: str
    score_percent: int


@dataclass(frozen=True)
class Eligibility:
    kind: str
    subject_key: str
    subject_label: str
    detail: int
    reason: str


@dataclass(frozen=True)
class ScoreRow:
    user_id: str
    display_name: str
    quiz_points: int
    lessons_completed: int
    latest_activity: datetime


def mastered_topics(
    published: list[PublishedLesson],
    completed_lesson_ids: set[str],
) -> list[Eligibility]:
    """A topic is mastered when every published lesson in that subject is complete."""
    by_subject: dict[str, list[PublishedLesson]] = {}
    labels: dict[str, str] = {}
    for lesson in published:
        by_subject.setdefault(lesson.subject_key, []).append(lesson)
        labels[lesson.subject_key] = lesson.subject_label

    found: list[Eligibility] = []
    for subject_key in sorted(by_subject):
        lessons = by_subject[subject_key]
        if not lessons:
            continue
        done = sum(1 for lesson in lessons if lesson.lesson_id in completed_lesson_ids)
        if done == len(lessons):
            found.append(
                Eligibility(
                    kind=KIND_TOPIC,
                    subject_key=subject_key,
                    subject_label=labels[subject_key],
                    detail=done,
                    reason=f"Completed all {done} published lessons.",
                )
            )
    return found


def passed_mocks(passes: list[MockPass]) -> list[Eligibility]:
    best: dict[str, MockPass] = {}
    for item in passes:
        current = best.get(item.quiz_id)
        if current is None or item.score_percent > current.score_percent:
            best[item.quiz_id] = item
    return [
        Eligibility(
            kind=KIND_MOCK,
            subject_key=item.quiz_id,
            subject_label=item.label,
            detail=item.score_percent,
            reason=f"Passed with {item.score_percent}%.",
        )
        for item in sorted(best.values(), key=lambda row: row.quiz_id)
    ]


def streak_length(study_days: set[date], today: date) -> int:
    """Consecutive study days ending today, or yesterday if today is still empty."""
    if today in study_days:
        cursor = today
    elif (today - timedelta(days=1)) in study_days:
        cursor = today - timedelta(days=1)
    else:
        return 0
    length = 0
    while cursor in study_days:
        length += 1
        cursor -= timedelta(days=1)
    return length


def streak_eligibility(study_days: set[date], today: date) -> Eligibility | None:
    length = streak_length(study_days, today)
    if length < STREAK_DAYS:
        return None
    return Eligibility(
        kind=KIND_STREAK,
        subject_key="streak",
        subject_label=f"{length}-day study streak",
        detail=length,
        reason=f"Studied on {length} consecutive days.",
    )


def iso_week_key(day: date) -> str:
    year, week, _weekday = day.isocalendar()
    return f"{year}-W{week:02d}"


def rank_students(rows: list[ScoreRow]) -> list[ScoreRow]:
    """Higher quiz total wins. Lessons break a tie. An earlier finish breaks the next tie."""
    return sorted(
        rows,
        key=lambda row: (-row.quiz_points, -row.lessons_completed, row.latest_activity, row.user_id),
    )


def linked_prize_shares(
    ranked_ids: list[str],
    linked_ids: set[str],
    total: int,
    top_n: int,
) -> list[tuple[str, int, int]]:
    """Return `(user_id, rank, amount)` for linked students inside the top N.

    Rank is the 1-based place in `ranked_ids`, including students with no wallet.
    The pot is split across the linked students only. The first linked student
    receives any remainder. A zero share is omitted, matching `split_prize`.
    """
    top = ranked_ids[:top_n]
    payable = [(index, user_id) for index, user_id in enumerate(top, start=1) if user_id in linked_ids]
    amounts = split_prize(total, len(payable))
    return [
        (user_id, rank, amount)
        for (rank, user_id), amount in zip(payable, amounts, strict=False)
    ]


def split_prize(total: int, winners: int) -> list[int]:
    """Split base units as evenly as possible. The first place gets any remainder."""
    if winners <= 0 or total <= 0:
        return []
    share = total // winners
    amounts = [share] * winners
    amounts[0] += total - share * winners
    # A zero share cannot be paid on-chain. Drop empty tail shares if the pot is tiny.
    while amounts and amounts[-1] == 0:
        amounts.pop()
    if amounts:
        amounts[0] += total - sum(amounts)
    return amounts
