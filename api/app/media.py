from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, status

from app.config import settings

SAFE_NAME = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|gif|webp|mp4|webm|mp3|wav|pdf)$"
)
CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".pdf": "application/pdf",
}

KIND_FAMILIES = {
    "image": {"image/jpeg", "image/png", "image/gif", "image/webp"},
    "video": {"video/mp4", "video/webm"},
    "audio": {"audio/mpeg", "audio/wav"},
    "file": {"application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"},
}


@dataclass(frozen=True)
class MediaType:
    extension: str
    content_type: str
    max_bytes: int


def media_root() -> Path:
    root = Path(settings.media_root)
    if not root.is_absolute():
        root = Path(__file__).resolve().parent.parent / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def sniff_media(data: bytes) -> MediaType:
    if len(data) >= 3 and data[:3] == b"\xff\xd8\xff":
        return MediaType(".jpg", "image/jpeg", 8 * 1024 * 1024)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return MediaType(".png", "image/png", 8 * 1024 * 1024)
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return MediaType(".gif", "image/gif", 8 * 1024 * 1024)
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return MediaType(".webp", "image/webp", 8 * 1024 * 1024)
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return MediaType(".mp4", "video/mp4", 80 * 1024 * 1024)
    if data.startswith(b"\x1aE\xdf\xa3"):
        return MediaType(".webm", "video/webm", 80 * 1024 * 1024)
    if data.startswith(b"ID3") or data[:2] in {b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"}:
        return MediaType(".mp3", "audio/mpeg", 25 * 1024 * 1024)
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return MediaType(".wav", "audio/wav", 25 * 1024 * 1024)
    if data.startswith(b"%PDF"):
        return MediaType(".pdf", "application/pdf", 20 * 1024 * 1024)
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file type is not supported.")


def store_upload(lesson_id: uuid.UUID, data: bytes, *, kind: str, original_name: str) -> dict[str, str | int]:
    if kind not in KIND_FAMILIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose image, video, audio, or file.")
    detected = sniff_media(data)
    if detected.content_type not in KIND_FAMILIES[kind]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"That file is not a valid {kind} upload.")
    if len(data) > detected.max_bytes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file is too large.")
    folder = media_root() / str(lesson_id)
    folder.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4()}{detected.extension}"
    (folder / stored).write_bytes(data)
    display = Path(original_name).name[:180] if original_name else stored
    return {
        "url": f"/api/media/{lesson_id}/{stored}",
        "filename": stored,
        "originalName": display,
        "contentType": detected.content_type,
        "size": len(data),
        "kind": kind,
    }


def media_path(lesson_id: uuid.UUID, filename: str) -> Path:
    if not SAFE_NAME.match(filename):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    path = (media_root() / str(lesson_id) / filename).resolve()
    root = (media_root() / str(lesson_id)).resolve()
    if path.parent != root or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found.")
    return path
