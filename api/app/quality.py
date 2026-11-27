"""Pre-submit checks for lesson slides. Warnings do not publish or block a save."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.config import settings

_MEDIA = re.compile(
    r"^/api/media/([0-9a-fA-F-]{36})/([0-9a-fA-F-]{36}\.(?:jpg|png|gif|webp))$"
)


def _media_dir() -> Path:
    root = Path(settings.media_root)
    if not root.is_absolute():
        root = Path(__file__).resolve().parent.parent / root
    return root


def image_problem(url: str) -> str | None:
    text = (url or "").strip()
    if not text:
        return "This image has no file."
    lowered = text.lower()
    if lowered.startswith(("javascript:", "data:")):
        return "This image address is not supported."
    if not (lowered.startswith("http://") or lowered.startswith("https://") or text.startswith("/")):
        return "This image address is not a valid link."
    match = _MEDIA.match(text)
    if not match:
        return None
    folder = (_media_dir() / match.group(1)).resolve()
    path = (folder / match.group(2)).resolve()
    try:
        path.relative_to(folder)
    except ValueError:
        return "This image file is missing."
    if not path.is_file():
        return "This image file is missing."
    return None


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def block_has_content(block: dict[str, Any]) -> bool:
    kind = block.get("type")
    if kind == "text":
        return bool(_text(block.get("text")) or any(_text(item) for item in block.get("items") or []))
    if kind == "code":
        return bool(_text(block.get("code")))
    if kind == "image":
        return bool(_text(block.get("url")))
    if kind == "callout":
        return bool(_text(block.get("text")))
    if kind == "video":
        return bool(_text(block.get("url")) or _text(block.get("title")))
    if kind == "audio":
        return bool(_text(block.get("url")) or _text(block.get("transcript")))
    if kind == "table":
        if _text(block.get("caption")):
            return True
        return any(_text(cell) for row in block.get("rows") or [] for cell in row)
    if kind in {"check", "quiz"}:
        return bool(_text(block.get("prompt")))
    if kind == "math":
        return bool(_text(block.get("latex")))
    if kind == "flashcard":
        return bool(_text(block.get("front")) or _text(block.get("back")))
    if kind == "game":
        if _text(block.get("title")) or _text(block.get("prompt")):
            return True
        for pair in block.get("pairs") or []:
            if _text(pair.get("left")) or _text(pair.get("right")):
                return True
        return any(_text(item.get("label")) for item in block.get("items") or [])
    return False


def _warn(code: str, message: str, *, slide_id: str = "", block_id: str = "") -> dict[str, str]:
    return {"code": code, "message": message, "slideId": slide_id, "blockId": block_id}


def quality_warnings(slides: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    rows = slides or []
    if not rows:
        warnings.append(_warn("empty_lesson", "This lesson has no slides."))
        return warnings
    for index, slide in enumerate(rows):
        if not isinstance(slide, dict):
            continue
        title = _text(slide.get("title")) or f"Slide {index + 1}"
        slide_id = _text(slide.get("id"))
        blocks = [block for block in slide.get("blocks") or [] if isinstance(block, dict)]
        if not any(block_has_content(block) for block in blocks):
            warnings.append(_warn("empty_slide", f"“{title}” has no content.", slide_id=slide_id))
        for block in blocks:
            block_id = _text(block.get("id"))
            kind = block.get("type")
            if kind == "image":
                problem = image_problem(_text(block.get("url")))
                if problem:
                    warnings.append(_warn("broken_image", f"“{title}”: {problem}", slide_id=slide_id, block_id=block_id))
            if kind == "check" or (kind == "quiz" and block.get("kind") != "blank"):
                if not _text(block.get("prompt")):
                    continue
                options = block.get("options") or []
                known = {item.get("id") for item in options if isinstance(item, dict)}
                correct = _text(block.get("correctId"))
                if not correct or correct not in known:
                    label = "Knowledge check" if kind == "check" else "Quiz"
                    warnings.append(
                        _warn(
                            "missing_answer",
                            f"“{title}”: {label} has no correct answer.",
                            slide_id=slide_id,
                            block_id=block_id,
                        )
                    )
            if kind == "quiz" and block.get("kind") == "blank" and _text(block.get("prompt")) and not _text(block.get("answer")):
                warnings.append(
                    _warn(
                        "missing_answer",
                        f"“{title}”: Fill-in-the-blank question has no answer.",
                        slide_id=slide_id,
                        block_id=block_id,
                    )
                )
    return warnings
