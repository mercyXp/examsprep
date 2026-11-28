"""Revision plan and which assist providers are configured."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.provider import provider_info
from app.assist.elevenlabs import stt_configured, tts_configured
from app.assist.firecrawl import configured as firecrawl_configured
from app.assist.revision import revision_plan
from app.assist.snap import tesseract_available
from app.db import get_session
from app.models import User
from app.security import require_user

router = APIRouter(prefix="/api/learn", tags=["revision"])
USER = Depends(require_user)
DB = Depends(get_session)


@router.get("/revision-plan", summary="Personal revision plan")
def plan(user: User = USER, session: Session = DB) -> dict[str, Any]:
    """Builds a day list from completed lessons, quiz scores, practice results, activity, and exam dates. No readiness percentage."""
    return revision_plan(session, user)


@router.get("/assist/status", summary="Which assist providers are configured")
def assist_status(_user: User = USER) -> dict[str, Any]:
    """Booleans only. Keys stay on the API and are never returned."""
    info = provider_info()
    return {
        "ok": True,
        "firecrawl": firecrawl_configured(),
        "elevenlabs": tts_configured(),
        "elevenlabsSpeechToText": stt_configured(),
        "ai": bool(info.get("configured")),
        "aiModel": info.get("model") or "",
        "tesseract": tesseract_available(),
    }
