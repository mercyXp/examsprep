"""Starter lessons. Callers always save them as drafts."""

from __future__ import annotations

from app.cms import new_id

TEMPLATES: dict[str, dict[str, str]] = {
    "lecture_notes": {
        "label": "Lecture notes",
        "description": "Title, outcomes, teaching points, and a summary.",
    },
    "topic_quiz": {
        "label": "Topic + quiz",
        "description": "A short explanation followed by a multiple-choice check and a fill-in-the-blank.",
    },
    "revision_sheet": {
        "label": "Revision sheet",
        "description": "Key points, a callout, and flashcards.",
    },
    "mock_exam": {
        "label": "Mock exam",
        "description": "Exam instructions and questions in a university short-answer style.",
    },
}


def template_catalog() -> list[dict[str, str]]:
    return [{"id": key, "label": value["label"], "description": value["description"]} for key, value in TEMPLATES.items()]


def template_slides(template_id: str, title: str) -> tuple[str, list[dict]]:
    if template_id not in TEMPLATES:
        raise ValueError("Choose a lecture notes, topic + quiz, revision sheet, or mock exam template.")
    name = title.strip() or TEMPLATES[template_id]["label"]
    builders = {
        "lecture_notes": _lecture,
        "topic_quiz": _topic_quiz,
        "revision_sheet": _revision,
        "mock_exam": _mock,
    }
    return name, builders[template_id](name)


def _slide(title: str, blocks: list[dict], *, layout: str = "text") -> dict:
    return {
        "id": new_id(),
        "title": title,
        "layout": layout,
        "revealMode": "block",
        "titleImmediate": True,
        "blocks": blocks,
    }


def _text(text: str, *, variant: str = "paragraph", appear: str = "click") -> dict:
    return {"id": new_id(), "type": "text", "variant": variant, "text": text, "items": [], "appear": appear}


def _lecture(title: str) -> list[dict]:
    return [
        _slide(
            title,
            [
                _text("Lesson outcomes", variant="heading", appear="immediate"),
                _text("By the end of this lesson you can explain the idea in your own words."),
                _text("State where it shows up in the module."),
            ],
            layout="title",
        ),
        _slide(
            "Teaching points",
            [
                _text("Main idea", variant="heading", appear="immediate"),
                _text("Write the definition the lecture uses."),
                _text("Add one example from the slides."),
                _text("Add one point students often mix up."),
            ],
        ),
        _slide(
            "Summary",
            [
                _text("Remember", variant="heading", appear="immediate"),
                {"id": new_id(), "type": "callout", "tone": "tip", "text": "Three points a student should revise tonight.", "appear": "click"},
            ],
            layout="summary",
        ),
    ]


def _topic_quiz(title: str) -> list[dict]:
    option_a = new_id()
    option_b = new_id()
    return [
        _slide(title, [_text("Explain the topic in two or three short points.", appear="immediate")]),
        _slide(
            "Check yourself",
            [
                {
                    "id": new_id(),
                    "type": "quiz",
                    "kind": "mcq",
                    "prompt": "Which statement matches the lecture?",
                    "options": [{"id": option_a, "label": "Correct statement"}, {"id": option_b, "label": "A common mix-up"}],
                    "correctId": "",
                    "answer": "",
                    "explanation": "Say why the correct statement matches the notes.",
                    "appear": "immediate",
                },
                {
                    "id": new_id(),
                    "type": "quiz",
                    "kind": "blank",
                    "prompt": "The lecture calls this idea ____.",
                    "options": [],
                    "correctId": "",
                    "answer": "",
                    "explanation": "",
                    "appear": "click",
                },
            ],
            layout="assessment",
        ),
    ]


def _revision(title: str) -> list[dict]:
    return [
        _slide(
            f"Revision: {title}",
            [
                _text("Key points", variant="heading", appear="immediate"),
                _text("Point one from the lecture."),
                _text("Point two from the lecture."),
                {"id": new_id(), "type": "callout", "tone": "important", "text": "A distinction that shows up in exams.", "appear": "click"},
            ],
            layout="summary",
        ),
        _slide(
            "Flashcards",
            [
                {"id": new_id(), "type": "flashcard", "front": "Term", "back": "Definition from the notes.", "appear": "immediate"},
                {"id": new_id(), "type": "flashcard", "front": "Second term", "back": "How it differs from the first.", "appear": "click"},
            ],
        ),
    ]


def _mock(title: str) -> list[dict]:
    return [
        _slide(
            f"Mock exam: {title}",
            [
                _text("Instructions", variant="heading", appear="immediate"),
                _text("Answer in the style of a Cavendish University Zambia computing paper. Time yourself."),
                {
                    "id": new_id(),
                    "type": "quiz",
                    "kind": "blank",
                    "prompt": "State two reasons why this topic matters in the module.",
                    "options": [],
                    "correctId": "",
                    "answer": "",
                    "explanation": "Add a model answer before you submit the lesson.",
                    "appear": "click",
                },
                {
                    "id": new_id(),
                    "type": "quiz",
                    "kind": "blank",
                    "prompt": "Distinguish the two ideas students most often confuse.",
                    "options": [],
                    "correctId": "",
                    "answer": "",
                    "explanation": "",
                    "appear": "click",
                },
            ],
            layout="assessment",
        )
    ]
