from __future__ import annotations

import copy
import uuid
from typing import Any

from fastapi import HTTPException, status

BLOCK_TYPES = {"text", "code", "image", "callout", "check"}
TEXT_VARIANTS = {"heading", "paragraph", "list", "definition"}
CALLOUT_TONES = {"note", "tip", "warning", "important"}
DIFFICULTIES = {"beginner", "intermediate", "advanced"}
PUBLISH_STATUSES = {"DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"}


def new_id() -> str:
    return str(uuid.uuid4())


def as_str(value: Any, field: str, *, required: bool = True, max_len: int = 8000) -> str:
    if value is None:
        if required:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} is required.")
        return ""
    if not isinstance(value, str):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} must be text.")
    text = value.strip()
    if required and not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} is required.")
    if len(text) > max_len:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} is too long.")
    return text


def as_list(value: Any) -> list:
    if value is None:
        return []
    if not isinstance(value, list):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Expected a list.")
    return value


def clean_objectives(value: Any) -> list[str]:
    items = []
    for item in as_list(value):
        if isinstance(item, str) and item.strip():
            items.append(item.strip()[:400])
    return items[:20]


def clean_block(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Each content block must be an object.")
    block_type = as_str(raw.get("type"), "block type", max_len=32)
    if block_type not in BLOCK_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported content block type.")
    block_id = as_str(raw.get("id"), "block id", required=False, max_len=64) or new_id()
    if block_type == "text":
        variant = as_str(raw.get("variant"), "text variant", required=False, max_len=32) or "paragraph"
        if variant not in TEXT_VARIANTS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported text variant.")
        items = [as_str(item, "list item", max_len=500) for item in as_list(raw.get("items")) if str(item).strip()]
        text = as_str(raw.get("text"), "text", required=variant != "list", max_len=12000)
        if variant == "list" and not items:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Add at least one list item.")
        return {"id": block_id, "type": "text", "variant": variant, "text": text, "items": items}
    if block_type == "code":
        return {
            "id": block_id,
            "type": "code",
            "language": as_str(raw.get("language"), "language", required=False, max_len=40) or "text",
            "code": as_str(raw.get("code"), "code", max_len=20000),
        }
    if block_type == "image":
        return {
            "id": block_id,
            "type": "image",
            "url": as_str(raw.get("url"), "image url", max_len=2000),
            "alt": as_str(raw.get("alt"), "image description", required=False, max_len=400),
        }
    if block_type == "callout":
        tone = as_str(raw.get("tone"), "callout tone", required=False, max_len=32) or "note"
        if tone not in CALLOUT_TONES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported callout tone.")
        return {"id": block_id, "type": "callout", "tone": tone, "text": as_str(raw.get("text"), "callout text")}
    options = []
    for option in as_list(raw.get("options")):
        if not isinstance(option, dict):
            continue
        options.append(
            {
                "id": as_str(option.get("id"), "option id", required=False, max_len=64) or new_id(),
                "label": as_str(option.get("label"), "option label", max_len=400),
            }
        )
    if len(options) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Knowledge checks need at least two options.")
    correct_id = as_str(raw.get("correctId") or raw.get("correct_id"), "correct option", max_len=64)
    if correct_id not in {item["id"] for item in options}:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a correct option for the knowledge check.")
    return {
        "id": block_id,
        "type": "check",
        "prompt": as_str(raw.get("prompt"), "question", max_len=2000),
        "options": options,
        "correctId": correct_id,
        "explanation": as_str(raw.get("explanation"), "explanation", required=False, max_len=4000),
        "feedbackCorrect": as_str(raw.get("feedbackCorrect") or raw.get("feedback_correct"), "feedback", required=False),
        "feedbackWrong": as_str(raw.get("feedbackWrong") or raw.get("feedback_wrong"), "feedback", required=False),
    }


def clean_slides(raw: Any) -> list[dict[str, Any]]:
    slides = []
    for index, item in enumerate(as_list(raw)):
        if not isinstance(item, dict):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Each slide must be an object.")
        slides.append(
            {
                "id": as_str(item.get("id"), "slide id", required=False, max_len=64) or new_id(),
                "title": as_str(item.get("title"), "slide title", required=False, max_len=180) or f"Slide {index + 1}",
                "blocks": [clean_block(block) for block in as_list(item.get("blocks"))],
            }
        )
    return slides


def lesson_is_complete(title: str, slides: list[dict[str, Any]]) -> bool:
    if not title.strip():
        return False
    if not slides:
        return False
    return any(slide.get("blocks") for slide in slides)


def slides_plain_text(slides: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for slide in slides:
        lines.append(str(slide.get("title") or ""))
        for block in slide.get("blocks") or []:
            kind = block.get("type")
            if kind == "text":
                lines.append(str(block.get("text") or ""))
                lines.extend(str(item) for item in block.get("items") or [])
            elif kind == "code":
                lines.append(str(block.get("code") or ""))
            elif kind == "callout":
                lines.append(str(block.get("text") or ""))
            elif kind == "check":
                lines.append(str(block.get("prompt") or ""))
            elif kind == "image":
                lines.append(str(block.get("alt") or block.get("url") or ""))
    return "\n".join(part for part in lines if part).strip()


def duplicate_slides(slides: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cloned = copy.deepcopy(slides)
    for slide in cloned:
        slide["id"] = new_id()
        for block in slide.get("blocks") or []:
            block["id"] = new_id()
            if block.get("type") == "check":
                mapping = {}
                for option in block.get("options") or []:
                    fresh = new_id()
                    mapping[option["id"]] = fresh
                    option["id"] = fresh
                if block.get("correctId") in mapping:
                    block["correctId"] = mapping[block["correctId"]]
    return cloned
