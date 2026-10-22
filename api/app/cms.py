from __future__ import annotations

import copy
import uuid
from typing import Any

from fastapi import HTTPException, status

BLOCK_TYPES = {"text", "code", "image", "callout", "check", "video", "audio", "table"}
TEXT_VARIANTS = {"heading", "paragraph", "list", "definition", "quote"}
TEXT_FONTS = {"sans", "serif", "mono"}
CALLOUT_TONES = {"note", "tip", "warning", "important"}
DIFFICULTIES = {"beginner", "intermediate", "advanced"}
PUBLISH_STATUSES = {"DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"}
APPEAR_MODES = {"click", "immediate"}
ANIMATIONS = {"fade", "none", "up", "left", "right", "zoom"}
REVEAL_MODES = {"block", "sentence"}
SLIDE_LAYOUTS = {
    "title",
    "text",
    "text_image",
    "image_text",
    "image",
    "video",
    "two_column",
    "code",
    "summary",
    "assessment",
    "case",
    "custom",
}
RESOURCE_KINDS = {"link", "video", "file", "textbook"}
MEDIA_ALIGNS = {"left", "center", "right"}


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


def as_choice(value: Any, field: str, allowed: set[str], default: str) -> str:
    text = as_str(value, field, required=False, max_len=32) or default
    return text if text in allowed else default


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return default


def as_percent(value: Any, default: int = 100) -> int:
    if value is None:
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(20, min(100, number))


def as_int(value: Any, default: int | None = None, *, lo: int = 1, hi: int = 240) -> int | None:
    if value is None or value == "":
        return default
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, number))


def clean_url(value: Any, field: str, *, required: bool = False) -> str:
    text = as_str(value, field, required=required, max_len=2000)
    if not text:
        return ""
    lowered = text.lower()
    if lowered.startswith(("javascript:", "data:text/html", "vbscript:")):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} is not a supported URL.")
    if not (lowered.startswith(("http://", "https://", "/"))):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{field} must be an http(s) or site-relative URL.")
    return text


def clean_objectives(value: Any) -> list[str]:
    items = []
    for item in as_list(value):
        if isinstance(item, str) and item.strip():
            items.append(item.strip()[:400])
    return items[:20]


def reveal_fields(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "appear": as_choice(raw.get("appear"), "appear", APPEAR_MODES, "click"),
        "animation": as_choice(raw.get("animation"), "animation", ANIMATIONS, "fade"),
        "notesOnly": as_bool(raw.get("notesOnly", raw.get("notes_only")), False),
    }


def clean_resource(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    title = as_str(raw.get("title"), "resource title", required=False, max_len=180)
    url = clean_url(raw.get("url"), "resource url", required=False)
    if not title and not url:
        return None
    return {
        "id": as_str(raw.get("id"), "resource id", required=False, max_len=64) or new_id(),
        "title": title or "Resource",
        "description": as_str(raw.get("description"), "resource description", required=False, max_len=800),
        "kind": as_choice(raw.get("kind"), "resource kind", RESOURCE_KINDS, "link"),
        "url": url,
    }


def clean_block(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Each content block must be an object.")
    block_type = as_str(raw.get("type"), "block type", max_len=32)
    if block_type not in BLOCK_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported content block type.")
    block_id = as_str(raw.get("id"), "block id", required=False, max_len=64) or new_id()
    extra = reveal_fields(raw)
    if block_type == "text":
        variant = as_choice(raw.get("variant"), "text variant", TEXT_VARIANTS, "paragraph")
        items = [as_str(item, "list item", max_len=500) for item in as_list(raw.get("items")) if str(item).strip()]
        text = as_str(raw.get("text"), "text", required=False, max_len=12000)
        return {
            "id": block_id,
            "type": "text",
            "variant": variant,
            "text": text,
            "items": items,
            "font": as_choice(raw.get("font"), "font", TEXT_FONTS, "sans"),
            **extra,
        }
    if block_type == "code":
        return {
            "id": block_id,
            "type": "code",
            "language": as_str(raw.get("language"), "language", required=False, max_len=40) or "text",
            "code": as_str(raw.get("code"), "code", required=False, max_len=20000),
            **extra,
        }
    if block_type == "image":
        return {
            "id": block_id,
            "type": "image",
            "url": clean_url(raw.get("url"), "image url", required=False),
            "alt": as_str(raw.get("alt"), "image description", required=False, max_len=400),
            "caption": as_str(raw.get("caption"), "image caption", required=False, max_len=400),
            "align": as_choice(raw.get("align"), "image align", MEDIA_ALIGNS, "center"),
            "widthPercent": as_percent(raw.get("widthPercent", raw.get("width_percent"))),
            **extra,
        }
    if block_type == "callout":
        tone = as_choice(raw.get("tone"), "callout tone", CALLOUT_TONES, "note")
        return {
            "id": block_id,
            "type": "callout",
            "tone": tone,
            "text": as_str(raw.get("text"), "callout text", required=False),
            **extra,
        }
    if block_type == "video":
        return {
            "id": block_id,
            "type": "video",
            "url": clean_url(raw.get("url"), "video url", required=False),
            "title": as_str(raw.get("title"), "video title", required=False, max_len=180),
            "caption": as_str(raw.get("caption"), "video caption", required=False, max_len=400),
            **extra,
        }
    if block_type == "audio":
        return {
            "id": block_id,
            "type": "audio",
            "url": clean_url(raw.get("url"), "audio url", required=False),
            "title": as_str(raw.get("title"), "audio title", required=False, max_len=180),
            "transcript": as_str(raw.get("transcript"), "audio transcript", required=False, max_len=12000),
            **extra,
        }
    if block_type == "table":
        headers = [as_str(item, "table header", required=False, max_len=120) or "Column" for item in as_list(raw.get("headers"))] or [
            "Column 1",
            "Column 2",
        ]
        rows = []
        for row in as_list(raw.get("rows")):
            if isinstance(row, list):
                rows.append([as_str(cell, "table cell", required=False, max_len=400) for cell in row])
        if not rows:
            rows = [[""] * len(headers)]
        return {
            "id": block_id,
            "type": "table",
            "caption": as_str(raw.get("caption"), "table caption", required=False, max_len=400),
            "headers": headers[:8],
            "rows": rows[:30],
            **extra,
        }
    options = []
    for option in as_list(raw.get("options")):
        if not isinstance(option, dict):
            continue
        options.append(
            {
                "id": as_str(option.get("id"), "option id", required=False, max_len=64) or new_id(),
                "label": as_str(option.get("label"), "option label", required=False, max_len=400) or "Option",
            }
        )
    if len(options) < 2:
        first = new_id()
        second = new_id()
        options = [{"id": first, "label": "Option A"}, {"id": second, "label": "Option B"}]
    correct_id = as_str(raw.get("correctId") or raw.get("correct_id"), "correct option", required=False, max_len=64)
    if correct_id not in {item["id"] for item in options}:
        correct_id = options[0]["id"]
    return {
        "id": block_id,
        "type": "check",
        "prompt": as_str(raw.get("prompt"), "question", required=False, max_len=2000),
        "options": options,
        "correctId": correct_id,
        "explanation": as_str(raw.get("explanation"), "explanation", required=False, max_len=4000),
        "feedbackCorrect": as_str(raw.get("feedbackCorrect") or raw.get("feedback_correct"), "feedback", required=False),
        "feedbackWrong": as_str(raw.get("feedbackWrong") or raw.get("feedback_wrong"), "feedback", required=False),
        **extra,
    }


def clean_slides(raw: Any) -> list[dict[str, Any]]:
    slides = []
    for index, item in enumerate(as_list(raw)):
        if not isinstance(item, dict):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Each slide must be an object.")
        resources = [cleaned for cleaned in (clean_resource(row) for row in as_list(item.get("resources"))) if cleaned]
        slides.append(
            {
                "id": as_str(item.get("id"), "slide id", required=False, max_len=64) or new_id(),
                "title": as_str(item.get("title"), "slide title", required=False, max_len=180) or f"Slide {index + 1}",
                "layout": as_choice(item.get("layout"), "slide layout", SLIDE_LAYOUTS, "text"),
                "revealMode": as_choice(item.get("revealMode") or item.get("reveal_mode"), "reveal mode", REVEAL_MODES, "block"),
                "titleImmediate": as_bool(item.get("titleImmediate", item.get("title_immediate")), True),
                "transition": as_choice(item.get("transition"), "slide transition", ANIMATIONS, "fade"),
                "background": as_str(item.get("background"), "slide background", required=False, max_len=32),
                "estimatedMinutes": as_int(item.get("estimatedMinutes", item.get("estimated_minutes")), None),
                "altText": as_str(item.get("altText") or item.get("alt_text"), "slide accessibility text", required=False, max_len=400),
                "requireAllItems": as_bool(item.get("requireAllItems", item.get("require_all_items")), True),
                "clickToAdvance": as_bool(item.get("clickToAdvance", item.get("click_to_advance")), True),
                "resources": resources,
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
                lines.append(str(block.get("alt") or block.get("caption") or block.get("url") or ""))
            elif kind == "video":
                lines.append(str(block.get("title") or block.get("url") or ""))
            elif kind == "audio":
                lines.append(str(block.get("title") or block.get("transcript") or ""))
            elif kind == "table":
                lines.append(str(block.get("caption") or " ".join(block.get("headers") or [])))
        for resource in slide.get("resources") or []:
            lines.append(str(resource.get("title") or resource.get("url") or ""))
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
        for resource in slide.get("resources") or []:
            resource["id"] = new_id()
    return cloned
