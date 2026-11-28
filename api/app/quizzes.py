"""Score a published quiz from the question version stored on the attempt.

Students never send the correct answers. The server compares their selection
or written response with the stored version, so a later edit cannot rewrite a
finished score.

Multiple choice and true/false are marked by option id. Short answers are
marked when the normalised response matches an accepted answer. Structured
answers are marked from key points: each accepted phrase that appears in the
response earns a share of the points. A structured question with no key points
is not auto-marked.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

CHOICE_KINDS = {"mcq", "true_false"}
WRITTEN_KINDS = {"short", "blank", "structured"}
_WORD = re.compile(r"[a-z0-9]+")
_PUNCT = re.compile(r"[^a-z0-9\s]+")


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
    kind: str = "mcq"
    accepted: tuple[str, ...] = ()
    model_answer: str = ""


@dataclass(frozen=True)
class QuestionResult:
    question_version_id: str
    correct: bool
    points_awarded: int
    selected_option_ids: tuple[str, ...]
    response_text: str = ""
    key_points_matched: int = 0
    key_points_possible: int = 0


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


def normalize_answer(value: str) -> str:
    cleaned = _PUNCT.sub(" ", value.lower())
    return " ".join(cleaned.split())


def _tokens(value: str) -> set[str]:
    return {word for word in _WORD.findall(value.lower()) if len(word) > 2}


def key_point_hit(response: str, key: str) -> bool:
    phrase = normalize_answer(key)
    given = normalize_answer(response)
    if not phrase or not given:
        return False
    if phrase in given:
        return True
    key_tokens = _tokens(key)
    if len(key_tokens) < 2:
        return False
    overlap = len(key_tokens & _tokens(response)) / len(key_tokens)
    return overlap >= 0.75


def _selection(question: GradedQuestion, selected: list[str], response_text: str) -> tuple[str, ...]:
    chosen = tuple(selected)
    if chosen or question.kind not in CHOICE_KINDS:
        return chosen
    needle = response_text.strip().lower()
    if not needle:
        return chosen
    for choice in question.choices:
        if choice.id.lower() == needle or choice.label.strip().lower() == needle:
            return (choice.id,)
    return chosen


def grade_question(question: GradedQuestion, selected: list[str], response_text: str) -> QuestionResult:
    kind = question.kind if question.kind in CHOICE_KINDS | WRITTEN_KINDS else "mcq"
    response = response_text.strip()[:8000]
    if kind in CHOICE_KINDS or kind == "mcq":
        chosen = _selection(question, selected, response)
        correct = set(chosen) == set(question.correct_ids) and len(question.correct_ids) > 0
        return QuestionResult(
            question_version_id=question.question_version_id,
            correct=correct,
            points_awarded=question.points if correct else 0,
            selected_option_ids=chosen,
            response_text=response,
        )
    accepted = tuple(item.strip() for item in question.accepted if item and item.strip())
    if kind == "structured":
        if not accepted:
            return QuestionResult(
                question_version_id=question.question_version_id,
                correct=False,
                points_awarded=0,
                selected_option_ids=(),
                response_text=response,
                key_points_possible=0,
            )
        hits = sum(1 for key in accepted if key_point_hit(response, key))
        awarded = int(round(question.points * hits / len(accepted)))
        return QuestionResult(
            question_version_id=question.question_version_id,
            correct=hits == len(accepted) and hits > 0,
            points_awarded=awarded,
            selected_option_ids=(),
            response_text=response,
            key_points_matched=hits,
            key_points_possible=len(accepted),
        )
    given = normalize_answer(response)
    accepted_norm = {normalize_answer(item) for item in accepted}
    model = normalize_answer(question.model_answer)
    if model:
        accepted_norm.add(model)
    correct = bool(given) and given in accepted_norm
    return QuestionResult(
        question_version_id=question.question_version_id,
        correct=correct,
        points_awarded=question.points if correct else 0,
        selected_option_ids=(),
        response_text=response,
    )


def grade_questions(
    questions: list[GradedQuestion],
    selected: dict[str, list[str]],
    written: dict[str, str] | None = None,
) -> tuple[list[QuestionResult], int, int]:
    """Return per-question results, points earned, and points possible."""
    responses = written or {}
    results: list[QuestionResult] = []
    earned = 0
    possible = 0
    for question in questions:
        possible += question.points
        result = grade_question(
            question,
            list(selected.get(question.question_version_id, [])),
            responses.get(question.question_version_id, ""),
        )
        earned += result.points_awarded
        results.append(result)
    return results, earned, possible


def percent_score(earned: int, possible: int) -> int:
    if possible <= 0:
        return 0
    return int(round((earned / possible) * 100))


def passed_score(percent: int, pass_mark: int | None) -> bool:
    mark = 50 if pass_mark is None else pass_mark
    return percent >= mark
