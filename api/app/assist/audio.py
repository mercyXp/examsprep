"""Store generated speech in Postgres and serve it back with range requests.

Render's disk is wiped on restart, and the free Postgres plan is 1 GB and
expires. Each clip is capped by AUDIO_MAX_BYTES (default 4 MB). Lesson and
quiz clips are shared by content hash. Tutor clips belong to one user.
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.assist.elevenlabs import content_hash, public_error, synthesize, tts_configured
from app.assist.http import UpstreamError
from app.assist.messages import not_configured
from app.config import settings
from app.models import AudioAsset, User


def cached_or_speak(
    session: Session,
    *,
    owner_kind: str,
    owner_key: str,
    text: str,
    access: str,
    user: User | None,
) -> tuple[AudioAsset, bool]:
    if not tts_configured():
        raise not_configured("Speech", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID")
    voice = settings.elevenlabs_voice_id.strip()
    model = (settings.elevenlabs_tts_model or "eleven_flash_v2_5").strip()
    digest = content_hash(text, voice, model)
    existing = session.scalar(
        select(AudioAsset).where(
            AudioAsset.owner_kind == owner_kind,
            AudioAsset.owner_key == owner_key,
            AudioAsset.content_hash == digest,
            AudioAsset.voice_id == voice,
        )
    )
    if existing is not None:
        return existing, True
    try:
        payload, truncated, characters = synthesize(text)
    except UpstreamError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, public_error(error)) from error
    session.execute(
        delete(AudioAsset).where(
            AudioAsset.owner_kind == owner_kind,
            AudioAsset.owner_key == owner_key,
            AudioAsset.content_hash != digest,
        )
    )
    asset = AudioAsset(
        owner_kind=owner_kind,
        owner_key=owner_key,
        content_hash=digest,
        voice_id=voice,
        mime="audio/mpeg",
        byte_size=len(payload),
        payload=payload,
        truncated=truncated,
        character_count=characters,
        access=access,
        user_id=user.id if user is not None and access == "private" else None,
    )
    session.add(asset)
    session.flush()
    return asset, False


def asset_out(asset: AudioAsset) -> dict[str, str | int | bool]:
    return {
        "assetId": str(asset.id),
        "url": f"/api/learn/audio/{asset.id}",
        "contentType": asset.mime,
        "cached": True,
        "truncated": asset.truncated,
        "characters": asset.character_count,
        "contentHash": asset.content_hash,
        "bytes": asset.byte_size,
    }


def stream_asset(asset: AudioAsset, request: Request) -> Response:
    payload = bytes(asset.payload or b"")
    size = len(payload)
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": asset.mime or "audio/mpeg",
        "Cache-Control": "private, max-age=86400",
    }
    range_header = request.headers.get("range")
    if not range_header:
        headers["Content-Length"] = str(size)
        return Response(payload, status_code=200, headers=headers, media_type=asset.mime)
    start, end = _parse_range(range_header, size)
    chunk = payload[start : end + 1]
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(len(chunk))
    return Response(chunk, status_code=206, headers=headers, media_type=asset.mime)


def load_asset(session: Session, asset_id: uuid.UUID) -> AudioAsset:
    asset = session.get(AudioAsset, asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found.")
    return asset


def _parse_range(header: str, size: int) -> tuple[int, int]:
    if not header.startswith("bytes=") or size <= 0:
        raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "That audio range is not available.")
    piece = header.removeprefix("bytes=").split(",", 1)[0].strip()
    start_text, _, end_text = piece.partition("-")
    try:
        if start_text == "":
            length = int(end_text)
            start = max(size - length, 0)
            end = size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
    except ValueError as error:
        raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "That audio range is not available.") from error
    end = min(end, size - 1)
    if start < 0 or start > end:
        raise HTTPException(status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, "That audio range is not available.")
    return start, end
