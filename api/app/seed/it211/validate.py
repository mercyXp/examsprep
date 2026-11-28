"""Check the IT211 content files before they are written to the database."""

from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
FORBIDDEN = ("todo", "lorem ipsum", "placeholder", "tbd", "[insert", "xxx", "fixme")
CHECK_KINDS = ("mcq", "true_false", "short", "structured")


class ContentError(ValueError):
    pass


def load_course() -> tuple[list[dict], dict]:
    chapters = []
    for path in sorted(DATA_DIR.glob("chapter-*.json")):
        chapters.append(json.loads(path.read_text(encoding="utf-8")))
    assessments = json.loads((DATA_DIR / "assessments.json").read_text(encoding="utf-8"))
    return chapters, assessments


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ContentError(message)


def _scan(text: str, where: str) -> None:
    lowered = text.lower()
    for word in FORBIDDEN:
        _require(word not in lowered, f"{where} contains unfinished text ({word}).")


def validate_course(chapters: list[dict] | None = None, assessments: dict | None = None) -> dict[str, int]:
    if chapters is None or assessments is None:
        chapters, assessments = load_course()
    _require(len(chapters) == 8, "IT211 needs exactly 8 chapters.")
    lesson_count = 0
    question_count = 0
    introductions: set[str] = set()
    titles: set[str] = set()
    for chapter in chapters:
        _scan(chapter["title"], chapter["title"])
        _require(chapter["description"].strip(), f"{chapter['title']} needs a description.")
        lessons = chapter["lessons"]
        _require(lessons, f"{chapter['title']} has no lessons.")
        for lesson in lessons:
            lesson_count += 1
            title = lesson["title"].strip()
            _require(title not in titles, f"Duplicate lesson title: {title}")
            titles.add(title)
            _scan(json.dumps(lesson), title)
            _require(len(lesson["objectives"]) >= 3, f"{title} needs at least 3 objectives.")
            _require(len(lesson["introduction"]) >= 2, f"{title} needs an introduction.")
            _require(all(len(part) >= 80 for part in lesson["introduction"]), f"{title} introduction is too thin.")
            opening = lesson["introduction"][0][:80]
            _require(opening not in introductions, f"{title} repeats another introduction.")
            introductions.add(opening)
            _require(len(lesson["explanation"]) >= 3, f"{title} needs a fuller explanation.")
            _require(len(lesson["definitions"]) >= 3, f"{title} needs key definitions.")
            _require(lesson["exampleTitle"].strip() and lesson["example"], f"{title} needs a worked example.")
            _require(len(lesson["takeaways"]) >= 3, f"{title} needs takeaways.")
            _require(len(lesson["revision"]) >= 3, f"{title} needs revision questions.")
            _require(len(lesson["summary"]) >= 80, f"{title} needs a summary.")
            kinds = [item["kind"] for item in lesson["checks"]]
            for kind in CHECK_KINDS:
                _require(kind in kinds, f"{title} is missing a {kind} knowledge check.")
            if "diagram" in title.lower() or chapter["title"].startswith("System Modelling") or "Diagram" in title or title.endswith("Diagrams"):
                _require((lesson.get("diagram") or "").strip(), f"{title} needs a diagram.")
    quizzes = assessments["quizzes"]
    codes = [quiz["code"] for quiz in quizzes]
    _require(codes.count("mock") == 1, "A timed mock exam is required.")
    _require(any(quiz["code"] == "practice" for quiz in quizzes), "A practice exam is required.")
    chapter_quizzes = [quiz for quiz in quizzes if quiz["code"].startswith("ch")]
    _require(len(chapter_quizzes) == 8, "Each chapter needs a quiz.")
    for quiz in quizzes:
        _scan(json.dumps(quiz), quiz["title"])
        questions = quiz["questions"]
        _require(questions, f"{quiz['title']} has no questions.")
        if quiz["code"] == "mock":
            _require(len(questions) == 30, "The mock exam must have 30 questions.")
            _require(quiz.get("timeLimitSeconds") == 2700, "The mock exam is timed for 45 minutes.")
        question_count += len(questions)
        for question in questions:
            _require(question["kind"] in CHECK_KINDS, f"Unsupported question kind in {quiz['title']}.")
            _require(len(question["prompt"]) >= 20, f"Short prompt in {quiz['title']}.")
            _require(question["explanation"].strip(), f"Missing explanation in {quiz['title']}.")
            if question["kind"] in {"mcq", "true_false"}:
                _require(len(question["choices"]) >= 2, f"Choices missing in {quiz['title']}.")
            if question["kind"] == "short":
                _require(question["accepted"], f"Short answer has no accepted answers in {quiz['title']}.")
            if question["kind"] == "structured":
                _require(len(question["accepted"]) >= 2, f"Structured question needs key points in {quiz['title']}.")
                _require(question.get("modelAnswer", "").strip(), f"Structured question needs a model answer in {quiz['title']}.")
    return {
        "chapters": len(chapters),
        "lessons": lesson_count,
        "quizzes": len(quizzes),
        "questions": question_count,
    }
