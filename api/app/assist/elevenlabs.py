"""Official ElevenLabs speech APIs.

TTS: POST /v1/text-to-speech/{voice_id}
STT: POST /v1/speech-to-text with model scribe_v2 (scribe_v1 was removed in 2026).
Audio format mp3_22050_32 stays on the free tier. 192 kbps MP3 does not.
"""

from __future__ import annotations

import hashlib
import re
import uuid

from app.assist.http import UpstreamError, request_json
from app.config import settings

API = "https://api.elevenlabs.io/v1"
OUTPUT_FORMAT = "mp3_22050_32"


def tts_configured() -> bool:
    return bool((settings.elevenlabs_api_key or "").strip() and (settings.elevenlabs_voice_id or "").strip())


def stt_configured() -> bool:
    return bool((settings.elevenlabs_api_key or "").strip())


def content_hash(text: str, voice_id: str, model: str) -> str:
    payload = f"{model}\n{voice_id}\n{text}"
    return hashlib.sha256(payload.encode()).hexdigest()


def clip_speech(text: str, limit: int | None = None) -> tuple[str, bool]:
    cap = limit if limit is not None else int(settings.elevenlabs_max_chars or 2500)
    cap = max(cap, 200)
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    if len(cleaned) <= cap:
        return cleaned, False
    clipped = cleaned[:cap].rsplit(" ", 1)[0].strip() or cleaned[:cap]
    return clipped, True


def _key_header() -> dict[str, str]:
    return {"xi-api-key": settings.elevenlabs_api_key.strip()}


def synthesize(text: str) -> tuple[bytes, bool, int]:
    spoken, truncated = clip_speech(text)
    if not spoken:
        raise UpstreamError(0, "There is no text to read.")
    voice = settings.elevenlabs_voice_id.strip()
    model = (settings.elevenlabs_tts_model or "eleven_flash_v2_5").strip()
    url = f"{API}/text-to-speech/{voice}?output_format={OUTPUT_FORMAT}"
    _status, payload = request_json(
        url,
        method="POST",
        payload={"text": spoken, "model_id": model},
        headers={**_key_header(), "Accept": "audio/mpeg"},
        timeout=60,
    )
    if not isinstance(payload, bytes) or not payload:
        raise UpstreamError(0, "ElevenLabs did not return audio.")
    if len(payload) > int(settings.audio_max_bytes):
        raise UpstreamError(0, "The audio is larger than the free-tier storage limit, so it was not saved.")
    return payload, truncated, len(spoken)


def transcribe(audio: bytes, mime: str, filename: str) -> str:
    model = (settings.elevenlabs_stt_model or "scribe_v2").strip()
    body, content_type = _multipart({"model_id": model}, "file", filename, audio, mime)
    _status, payload = request_json(
        f"{API}/speech-to-text",
        method="POST",
        data=body,
        content_type=content_type,
        headers=_key_header(),
        timeout=60,
    )
    if not isinstance(payload, dict):
        raise UpstreamError(0, "ElevenLabs did not return a transcript.")
    return str(payload.get("text") or "").strip()


def public_error(error: UpstreamError) -> str:
    if error.status == 401:
        return "ElevenLabs rejected ELEVENLABS_API_KEY. Check the key on the API server."
    if error.payment:
        return "ElevenLabs refused the request because the free quota was reached. No audio was invented."
    return error.message or "ElevenLabs could not complete this request."


def _multipart(fields: dict[str, str], file_field: str, filename: str, content: bytes, mime: str) -> tuple[bytes, str]:
    boundary = f"ExamsPrep{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in fields.items():
        chunks.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
        )
    safe_name = filename.replace('"', "") or "audio.webm"
    chunks.append(
        (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{safe_name}\"\r\n"
            f"Content-Type: {mime}\r\n\r\n"
        ).encode()
        + content
        + b"\r\n"
    )
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"
