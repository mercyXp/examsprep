"""Build editable lesson drafts. The model never chooses published status."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.ai.provider import AIProvider, Completion, HeuristicProvider, select_provider
from app.authoring_access import DRAFT_STATUS
from app.cms import clean_slides, new_id

SYSTEM = """You draft study material for Cavendish University Zambia computing courses.
Write the way a lecturer's short exam paper does: command words such as State, Explain, Distinguish, Identify, and List.
Use only the lecture text you are given. Return one JSON object and no markdown.
The object has "title", "slides", and "questions".
Each slide has "title" and "blocks".
Block types you may use: text (variant paragraph or heading, text), callout (tone tip, text),
flashcard (front, back), quiz (kind mcq or blank, prompt, options as {label}, correctLabel, answer, explanation),
game (kind matching or drag, title, pairs as {left, right}, bins, items as {label, bin}).
questions is a list of {prompt, kind, choices, correctLabel, answer, explanation, modelAnswer}.
Do not include a status field. A person reviews the draft before it is published.
"""


@dataclass
class DraftBundle:
    title: str
    slides: list[dict]
    questions: list[dict] = field(default_factory=list)
    provider: str = "heuristic"
    degraded: bool = False
    status: str = DRAFT_STATUS


def draft_action(
    action: str,
    lesson_text: str,
    examples: list[str] | None = None,
    *,
    provider: AIProvider | None = None,
) -> DraftBundle:
    kind = action.strip().lower()
    if kind not in {"summarize", "flashcards", "quiz", "game", "mock"}:
        raise ValueError("Choose summarise, flashcards, quiz, game, or mock exam.")
    source = (lesson_text or "").strip()
    if not source:
        raise ValueError("Add some lesson content before asking for a draft.")
    chosen = provider or select_provider()
    examples = [item.strip() for item in (examples or []) if item and item.strip()]
    if not isinstance(chosen, HeuristicProvider):
        completion = chosen.complete(SYSTEM, _user_prompt(kind, source, examples))
        if completion.text:
            parsed = _bundle_from_model(completion, fallback_title=_title_for(kind))
            if parsed is not None:
                return parsed
        bundle = _heuristic(kind, source, examples)
        bundle.degraded = True
        bundle.provider = "heuristic"
        return bundle
    return _heuristic(kind, source, examples)


def provider_info():
    from app.ai.provider import provider_info as info

    return info()


def _user_prompt(action: str, source: str, examples: list[str]) -> str:
    example_block = "\n".join(f"- {item[:500]}" for item in examples[:6]) or "None uploaded yet."
    return (
        f"Action: {action}\n"
        f"Past-paper examples to imitate, not to copy verbatim:\n{example_block}\n\n"
        f"Lecture text:\n{source[:12000]}"
    )


def _bundle_from_model(completion: Completion, *, fallback_title: str) -> DraftBundle | None:
    payload = _extract_json(completion.text)
    if not isinstance(payload, dict):
        return None
    try:
        slides = clean_slides(_normalise_model_slides(payload.get("slides")))
    except Exception:
        return None
    if not slides:
        return None
    title = str(payload.get("title") or fallback_title).strip()[:180] or fallback_title
    questions = [_normalise_question(row) for row in payload.get("questions") or [] if isinstance(row, dict)]
    questions = [row for row in questions if row]
    return DraftBundle(
        title=title,
        slides=slides,
        questions=questions,
        provider=completion.provider,
        degraded=completion.degraded,
        status=DRAFT_STATUS,
    )


def _extract_json(text: str) -> dict | None:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        payload = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _normalise_model_slides(raw: object) -> list[dict]:
    slides: list[dict] = []
    if not isinstance(raw, list):
        return slides
    for item in raw:
        if not isinstance(item, dict):
            continue
        blocks = []
        for block in item.get("blocks") or []:
            if isinstance(block, dict):
                blocks.append(_normalise_block(block))
        slides.append({"id": new_id(), "title": str(item.get("title") or "Draft"), "blocks": [b for b in blocks if b]})
    return slides


def _normalise_block(block: dict) -> dict:
    kind = str(block.get("type") or "text")
    base = {"id": new_id(), "type": kind, "appear": "click"}
    if kind == "text":
        variant = block.get("variant") if block.get("variant") in {"heading", "paragraph", "list", "quote"} else "paragraph"
        return {**base, "variant": variant, "text": str(block.get("text") or ""), "items": []}
    if kind == "callout":
        return {**base, "tone": "tip", "text": str(block.get("text") or "")}
    if kind == "flashcard":
        return {**base, "front": str(block.get("front") or ""), "back": str(block.get("back") or "")}
    if kind == "quiz":
        quiz_kind = "blank" if block.get("kind") == "blank" else "mcq"
        options = []
        correct_id = ""
        wanted = str(block.get("correctLabel") or block.get("correct") or "").strip().lower()
        for option in block.get("options") or []:
            label = option.get("label") if isinstance(option, dict) else str(option)
            option_id = new_id()
            options.append({"id": option_id, "label": str(label or "Option")})
            if wanted and str(label or "").strip().lower() == wanted:
                correct_id = option_id
        return {
            **base,
            "kind": quiz_kind,
            "prompt": str(block.get("prompt") or ""),
            "options": options,
            "correctId": correct_id if quiz_kind == "mcq" else "",
            "answer": str(block.get("answer") or ""),
            "explanation": str(block.get("explanation") or ""),
        }
    if kind == "game":
        game_kind = "drag" if block.get("kind") == "drag" else "matching"
        pairs = []
        for pair in block.get("pairs") or []:
            if isinstance(pair, dict):
                pairs.append({"id": new_id(), "left": str(pair.get("left") or ""), "right": str(pair.get("right") or "")})
        return {
            **base,
            "kind": game_kind,
            "title": str(block.get("title") or "Game"),
            "prompt": str(block.get("prompt") or ""),
            "pairs": pairs,
            "bins": [str(item) for item in block.get("bins") or []],
            "items": [
                {"id": new_id(), "label": str(item.get("label") or ""), "bin": str(item.get("bin") or "")}
                for item in block.get("items") or []
                if isinstance(item, dict)
            ],
        }
    if kind == "code":
        return {**base, "language": str(block.get("language") or "text"), "code": str(block.get("code") or "")}
    return {**base, "type": "text", "variant": "paragraph", "text": str(block.get("text") or ""), "items": []}


def _normalise_question(row: dict) -> dict | None:
    prompt = str(row.get("prompt") or "").strip()
    if not prompt:
        return None
    kind = "blank" if row.get("kind") in {"blank", "short"} else "mcq"
    choices = []
    for choice in row.get("choices") or []:
        label = choice.get("label") if isinstance(choice, dict) else str(choice)
        if str(label or "").strip():
            choices.append(str(label).strip())
    return {
        "prompt": prompt[:4000],
        "kind": kind if kind == "mcq" and len(choices) >= 2 else "short",
        "choices": choices[:6],
        "correctLabel": str(row.get("correctLabel") or ""),
        "answer": str(row.get("answer") or row.get("modelAnswer") or ""),
        "explanation": str(row.get("explanation") or "")[:4000],
        "modelAnswer": str(row.get("modelAnswer") or row.get("answer") or "")[:8000],
        "status": DRAFT_STATUS,
    }


def _heuristic(action: str, source: str, examples: list[str]) -> DraftBundle:
    sentences = _sentences(source)
    title = _title_for(action)
    if action == "summarize":
        slides = [_summary_slide(sentences)]
    elif action == "flashcards":
        slides = [_flashcard_slide(sentences)]
    elif action == "quiz":
        slides = [_quiz_slide(sentences)]
    elif action == "game":
        slides = [_game_slide(sentences)]
    else:
        slides = [_mock_slide(sentences, examples)]
    questions = [_mock_questions(sentences, examples)] if action == "mock" else []
    questions = [item for item in questions if item]
    flat = [row for group in questions for row in group] if questions and isinstance(questions[0], list) else questions
    return DraftBundle(title=title, slides=clean_slides(slides), questions=flat, provider="heuristic", degraded=True, status=DRAFT_STATUS)


def _mock_questions(sentences: list[str], examples: list[str]) -> list[dict]:
    topic = sentences[0][:80] if sentences else "this topic"
    rows = [
        {
            "prompt": f"Explain {topic.rstrip('.')} in your own words.",
            "kind": "short",
            "choices": [],
            "answer": sentences[0] if sentences else "",
            "modelAnswer": " ".join(sentences[:2]),
            "explanation": "",
            "status": DRAFT_STATUS,
        },
        {
            "prompt": "State two points from the lecture that a short exam question could test.",
            "kind": "short",
            "choices": [],
            "answer": "",
            "modelAnswer": " ".join(sentences[:3]),
            "explanation": "",
            "status": DRAFT_STATUS,
        },
    ]
    if examples:
        rows[0]["explanation"] = f"Styled on a past paper, not copied from it: {examples[0][:180]}"
    return rows


def _summary_slide(sentences: list[str]) -> dict:
    blocks: list[dict] = [
        {"id": new_id(), "type": "text", "variant": "heading", "text": "Revision notes", "items": [], "appear": "immediate"}
    ]
    for sentence in sentences[:6]:
        blocks.append({"id": new_id(), "type": "text", "variant": "paragraph", "text": sentence, "items": [], "appear": "click"})
    if not sentences:
        blocks.append({"id": new_id(), "type": "text", "variant": "paragraph", "text": "Add lecture notes to summarise.", "items": []})
    return {"id": new_id(), "title": "Revision notes", "blocks": blocks}


def _flashcard_slide(sentences: list[str]) -> dict:
    blocks = []
    for index, sentence in enumerate(sentences[:6]):
        words = sentence.split()
        front = " ".join(words[:6]).rstrip(".")
        blocks.append(
            {
                "id": new_id(),
                "type": "flashcard",
                "front": front or f"Card {index + 1}",
                "back": sentence,
                "appear": "immediate" if index == 0 else "click",
            }
        )
    if not blocks:
        blocks.append({"id": new_id(), "type": "flashcard", "front": "Key idea", "back": "Add notes first.", "appear": "immediate"})
    return {"id": new_id(), "title": "Flashcards", "blocks": blocks}


def _quiz_slide(sentences: list[str]) -> dict:
    blocks: list[dict] = []
    if sentences:
        correct = sentences[0]
        distractors = sentences[1:3] or ["A different idea from later in the notes", "None of the lecture points"]
        options = [{"id": new_id(), "label": correct[:180]}]
        correct_id = options[0]["id"]
        for item in distractors:
            options.append({"id": new_id(), "label": item[:180]})
        blocks.append(
            {
                "id": new_id(),
                "type": "quiz",
                "kind": "mcq",
                "prompt": "Which statement matches the lecture?",
                "options": options[:4],
                "correctId": correct_id,
                "answer": "",
                "explanation": "The correct option is taken from the notes. Check the wording before you submit.",
                "appear": "immediate",
            }
        )
        keyword = _keyword(sentences[0])
        masked = sentences[0].replace(keyword, "____", 1) if keyword else f"____ — {sentences[0]}"
        blocks.append(
            {
                "id": new_id(),
                "type": "quiz",
                "kind": "blank",
                "prompt": masked,
                "options": [],
                "correctId": "",
                "answer": keyword,
                "explanation": "",
                "appear": "click",
            }
        )
    return {"id": new_id(), "title": "Practice quiz", "layout": "assessment", "blocks": blocks}


def _game_slide(sentences: list[str]) -> dict:
    pairs = []
    for sentence in sentences[:4]:
        words = sentence.split()
        left = " ".join(words[:4]).rstrip(".") or "Term"
        pairs.append({"id": new_id(), "left": left, "right": sentence[:180]})
    if len(pairs) < 2:
        pairs.append({"id": new_id(), "left": "Term", "right": sentences[0][:180] if sentences else "Definition"})
    return {
        "id": new_id(),
        "title": "Match the idea",
        "blocks": [
            {
                "id": new_id(),
                "type": "game",
                "kind": "matching",
                "title": "Match the idea",
                "prompt": "Pair each phrase with the lecture point.",
                "pairs": pairs[:6],
                "bins": ["Concept", "Example"],
                "items": [],
                "appear": "immediate",
            }
        ],
    }


def _mock_slide(sentences: list[str], examples: list[str]) -> dict:
    topic = sentences[0][:100] if sentences else "this topic"
    style = (
        f"Styled on an uploaded past paper: {examples[0][:180]}"
        if examples
        else "No past paper is uploaded for this module yet. These stems follow a short university exam style and need a lecturer to add model answers."
    )
    blocks: list[dict] = [
        {"id": new_id(), "type": "callout", "tone": "note", "text": style, "appear": "immediate"},
        {
            "id": new_id(),
            "type": "quiz",
            "kind": "blank",
            "prompt": f"Explain the following in your own words: {topic}",
            "options": [],
            "correctId": "",
            "answer": "",
            "explanation": "Add a model answer before review.",
            "appear": "click",
        },
        {
            "id": new_id(),
            "type": "quiz",
            "kind": "blank",
            "prompt": "Distinguish two ideas from the lecture that students often confuse.",
            "options": [],
            "correctId": "",
            "answer": "",
            "explanation": "",
            "appear": "click",
        },
    ]
    return {"id": new_id(), "title": "Mock exam draft", "layout": "assessment", "blocks": blocks}


def _sentences(text: str) -> list[str]:
    pieces = re.split(r"(?<=[.!?])\s+|\n+", text.strip())
    cleaned = []
    for piece in pieces:
        line = " ".join(piece.split())
        if len(line) >= 12:
            cleaned.append(line[:400])
    return cleaned[:12]


def _keyword(sentence: str) -> str:
    words = [word.strip(".,:;()[]") for word in sentence.split()]
    ranked = [word for word in words if len(word) > 5 and word[:1].islower()]
    if ranked:
        return ranked[-1]
    long_words = [word for word in words if len(word) > 4]
    return long_words[-1] if long_words else ""


def _title_for(action: str) -> str:
    return {
        "summarize": "Revision notes",
        "flashcards": "Flashcards",
        "quiz": "Practice quiz",
        "game": "Match the idea",
        "mock": "Mock exam draft",
    }[action]
