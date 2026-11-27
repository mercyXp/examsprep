"""Score a published quiz from the question version stored on the attempt.

Students never send the correct answers. The server compares their selection
with `question_versions.correct_option_ids` and stores that result on the
attempt, so a later edit to the question cannot rewrite a finished score.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Choice:
    id: str
    label: str


@dataclass(frozen=True)
class GradedQuestion:
    question_version_id: str
    points: int
    correct_ids: frozenset[str]
    prompt: str
    explanation: str
    choices: tuple[Choice, ...]


@dataclass(frozen=True)
class QuestionResult:
    question_version_id: str
    correct: bool
    points_awarded: int
    selected_option_ids: tuple[str, ...]


def normalize_choices(raw: object) -> tuple[Choice, ...]:
    if not isinstance(raw, list):
        return ()
    choices: list[Choice] = []
    for index, item in enumerate(raw):
        if isinstance(item, str):
            choices.append(Choice(str(index), item))
        elif isinstance(item, dict):
            choice_id = str(item.get("id", index))
            label = item.get("label") or item.get("text") or item.get("prompt") or ""
            choices.append(Choice(choice_id, str(label)))
    return tuple(choices)


def correct_id_set(raw: object) -> frozenset[str]:
    if not isinstance(raw, list):
        return frozenset()
    return frozenset(str(item) for item in raw)


def grade_questions(
    questions: list[GradedQuestion],
    selected: dict[str, list[str]],
) -> tuple[list[QuestionResult], int, int]:
    """Return per-question results, points earned, and points possible."""
    results: list[QuestionResult] = []
    earned = 0
    possible = 0
    for question in questions:
        possible += question.points
        chosen = tuple(selected.get(question.question_version_id, []))
        correct = set(chosen) == set(question.correct_ids) and len(question.correct_ids) > 0
        points = question.points if correct else 0
        earned += points
        results.append(
            QuestionResult(
                question_version_id=question.question_version_id,
                correct=correct,
                points_awarded=points,
                selected_option_ids=chosen,
            )
        )
    return results, earned, possible


def percent_score(earned: int, possible: int) -> int:
    if possible <= 0:
        return 0
    return int(round((earned / possible) * 100))


def passed_score(percent: int, pass_mark: int | None) -> bool:
    mark = 50 if pass_mark is None else pass_mark
    return percent >= mark
