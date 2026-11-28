"""Turn a lesson document into published Lesson Studio slides."""

from __future__ import annotations

from typing import Any

from app.cms import clean_slides


def _text(block_id: str, text: str, *, variant: str = "paragraph", items: list[str] | None = None, appear: str = "click") -> dict[str, Any]:
    return {
        "id": block_id,
        "type": "text",
        "variant": variant,
        "text": text,
        "items": items or [],
        "font": "sans",
        "appear": appear,
        "animation": "fade",
        "notesOnly": False,
    }


def _callout(block_id: str, text: str, tone: str = "note") -> dict[str, Any]:
    return {
        "id": block_id,
        "type": "callout",
        "tone": tone,
        "text": text,
        "appear": "click",
        "animation": "fade",
        "notesOnly": False,
    }


def _slide(slide_id: str, title: str, blocks: list[dict[str, Any]], layout: str = "text") -> dict[str, Any]:
    return {
        "id": slide_id,
        "title": title,
        "layout": layout,
        "revealMode": "block",
        "titleImmediate": True,
        "transition": "fade",
        "background": "",
        "requireAllItems": True,
        "clickToAdvance": True,
        "resources": [],
        "blocks": blocks,
    }


def _check_blocks(prefix: str, checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for index, check in enumerate(checks, start=1):
        kind = check["kind"]
        block_id = f"{prefix}-q{index}"
        explanation = check["explanation"]
        if kind == "mcq":
            options = [{"id": f"{block_id}-o{n}", "label": label} for n, label in enumerate(check["options"])]
            correct = options[int(check["correct"])]["id"]
            blocks.append(
                {
                    "id": block_id,
                    "type": "check",
                    "prompt": check["prompt"],
                    "options": options,
                    "correctId": correct,
                    "explanation": explanation,
                    "feedbackCorrect": "Correct. " + explanation,
                    "feedbackWrong": "Not quite. " + explanation,
                    "appear": "click",
                    "animation": "fade",
                    "notesOnly": False,
                }
            )
            continue
        if kind == "true_false":
            options = [
                {"id": f"{block_id}-true", "label": "True"},
                {"id": f"{block_id}-false", "label": "False"},
            ]
            correct = options[0]["id"] if check["correct"] else options[1]["id"]
            blocks.append(
                {
                    "id": block_id,
                    "type": "quiz",
                    "kind": "true_false",
                    "prompt": check["prompt"],
                    "options": options,
                    "correctId": correct,
                    "answer": "",
                    "explanation": explanation,
                    "appear": "click",
                    "animation": "fade",
                    "notesOnly": False,
                }
            )
            continue
        if kind == "short":
            blocks.append(
                {
                    "id": block_id,
                    "type": "quiz",
                    "kind": "blank",
                    "prompt": check["prompt"],
                    "options": [],
                    "correctId": "",
                    "answer": check["answers"][0],
                    "explanation": explanation,
                    "appear": "click",
                    "animation": "fade",
                    "notesOnly": False,
                }
            )
            continue
        blocks.append(
            {
                "id": block_id,
                "type": "quiz",
                "kind": "structured",
                "prompt": check["prompt"],
                "options": [],
                "correctId": "",
                "answer": " | ".join(check["points"]),
                "explanation": explanation,
                "appear": "click",
                "animation": "fade",
                "notesOnly": False,
            }
        )
    return blocks


def lesson_slides(chapter_position: int, lesson_position: int, lesson: dict[str, Any]) -> list[dict[str, Any]]:
    prefix = f"it211-c{chapter_position}-l{lesson_position}"
    slides: list[dict[str, Any]] = []
    slides.append(
        _slide(
            f"{prefix}-objectives",
            "Learning objectives",
            [
                _text(f"{prefix}-obj-h", "By the end of this lesson you should be able to:", variant="heading", appear="immediate"),
                _text(f"{prefix}-obj", "", variant="list", items=list(lesson["objectives"])),
            ],
        )
    )
    intro_blocks = [
        _text(f"{prefix}-intro-{index}", paragraph, appear="immediate" if index == 1 else "click")
        for index, paragraph in enumerate(lesson["introduction"], start=1)
    ]
    slides.append(_slide(f"{prefix}-intro", "Introduction", intro_blocks))
    explanation = lesson["explanation"]
    midpoint = max(2, len(explanation) // 2)
    slides.append(
        _slide(
            f"{prefix}-explain-1",
            "Explanation",
            [_text(f"{prefix}-ex-{index}", paragraph) for index, paragraph in enumerate(explanation[:midpoint], start=1)],
        )
    )
    slides.append(
        _slide(
            f"{prefix}-explain-2",
            "Explanation continued",
            [_text(f"{prefix}-ex2-{index}", paragraph) for index, paragraph in enumerate(explanation[midpoint:], start=1)],
        )
    )
    definition_rows = [[item["term"], item["meaning"]] for item in lesson["definitions"]]
    slides.append(
        _slide(
            f"{prefix}-definitions",
            "Key definitions",
            [
                _text(f"{prefix}-def-lead", "Use these terms the same way in your notes, diagrams, and exam answers.", appear="immediate"),
                {
                    "id": f"{prefix}-def-table",
                    "type": "table",
                    "caption": "Key terms",
                    "headers": ["Term", "Meaning"],
                    "rows": definition_rows,
                    "appear": "click",
                    "animation": "fade",
                    "notesOnly": False,
                },
            ],
        )
    )
    example_blocks: list[dict[str, Any]] = [
        _text(f"{prefix}-ex-title", lesson["exampleTitle"], variant="heading", appear="immediate"),
        *[_text(f"{prefix}-example-{index}", paragraph) for index, paragraph in enumerate(lesson["example"], start=1)],
    ]
    table = lesson.get("table")
    if table:
        example_blocks.append(
            {
                "id": f"{prefix}-table",
                "type": "table",
                "caption": table.get("caption") or "",
                "headers": table["headers"],
                "rows": table["rows"],
                "appear": "click",
                "animation": "fade",
                "notesOnly": False,
            }
        )
    diagram = (lesson.get("diagram") or "").strip()
    if diagram:
        example_blocks.append(
            {
                "id": f"{prefix}-diagram",
                "type": "code",
                "language": "text",
                "code": diagram,
                "appear": "click",
                "animation": "fade",
                "notesOnly": False,
            }
        )
    pseudocode = (lesson.get("pseudocode") or "").strip()
    if pseudocode:
        example_blocks.append(
            {
                "id": f"{prefix}-code",
                "type": "code",
                "language": "pseudocode",
                "code": pseudocode,
                "appear": "click",
                "animation": "fade",
                "notesOnly": False,
            }
        )
    slides.append(_slide(f"{prefix}-example", "Worked example", example_blocks, layout="case"))
    slides.append(
        _slide(
            f"{prefix}-application",
            "Practical application",
            [
                *[_text(f"{prefix}-app-{index}", paragraph) for index, paragraph in enumerate(lesson["application"], start=1)],
                _callout(f"{prefix}-app-tip", lesson.get("tip") or lesson["application"][-1], "tip"),
            ],
        )
    )
    slides.append(
        _slide(
            f"{prefix}-takeaways",
            "Key takeaways",
            [_text(f"{prefix}-take", "", variant="list", items=list(lesson["takeaways"]), appear="immediate")],
            layout="summary",
        )
    )
    slides.append(
        _slide(
            f"{prefix}-revision",
            "Revision questions",
            [
                _text(f"{prefix}-rev-lead", "Answer these in your own words before you look back at the notes.", appear="immediate"),
                _text(f"{prefix}-rev", "", variant="list", items=list(lesson["revision"])),
            ],
        )
    )
    slides.append(
        _slide(
            f"{prefix}-check",
            "Knowledge check",
            [
                _text(f"{prefix}-check-lead", "The first question is required before this lesson can be marked complete.", appear="immediate"),
                *_check_blocks(prefix, lesson["checks"]),
            ],
            layout="assessment",
        )
    )
    slides.append(
        _slide(
            f"{prefix}-summary",
            "Summary",
            [_text(f"{prefix}-summary", lesson["summary"], appear="immediate")],
            layout="summary",
        )
    )
    return clean_slides(slides)
