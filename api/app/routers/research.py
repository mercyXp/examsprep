"""Research Assistant routes. Staff only. Imports stay drafts."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.access import AccessScope, staff_scope
from app.assist.rate_limit import enforce_ai_limit
from app.assist.research import get_job, import_job, list_jobs, propose_job, refresh_job, start_job
from app.db import get_session

router = APIRouter(prefix="/api/admin/research", tags=["research"])
SCOPE = Depends(staff_scope)
DB = Depends(get_session)


class ResearchIn(BaseModel):
    programme_id: uuid.UUID = Field(description="Programme the course belongs to.")
    module_id: uuid.UUID = Field(description="Course that will receive draft lessons.")
    urls: list[str] = Field(default_factory=list, description="One or more public http(s) URLs.")
    content_type: str = Field(default="article", description="article, lecture, syllabus, reference, or site.")
    mode: str = Field(default="auto", description="auto, scrape, or crawl. Crawl is used for a single site or syllabus URL.")
    force: bool = Field(default=False, description="Extract again even when the same URLs were already imported.")


@router.post("/jobs", summary="Start a Firecrawl extraction")
def create_job(body: ResearchIn, scope: AccessScope = SCOPE, session: Session = DB) -> dict[str, Any]:
    """Scrape or crawl public URLs. Does not publish lessons. Duplicate URL sets return the existing job."""
    enforce_ai_limit(scope.user.id, "research")
    return start_job(
        session,
        scope,
        programme_id=body.programme_id,
        module_id=body.module_id,
        urls=body.urls,
        content_type=body.content_type,
        mode=body.mode,
        force=body.force,
    )


@router.get("/jobs", summary="List extraction jobs")
def jobs(module_id: uuid.UUID | None = None, scope: AccessScope = SCOPE, session: Session = DB) -> dict[str, Any]:
    """Jobs the signed-in editor can see. Pass module_id to limit the list to one course."""
    return {"ok": True, "items": list_jobs(session, scope, module_id)}


@router.get("/jobs/{job_id}", summary="Read an extraction job")
def read_job(job_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = DB) -> dict[str, Any]:
    """Returns status, extracted pages, and any AI outline. A running crawl is polled once."""
    job = get_job(session, scope, job_id)
    return refresh_job(session, scope, job)


@router.post("/jobs/{job_id}/propose", summary="Ask the configured model for an outline")
def propose(job_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = DB) -> dict[str, Any]:
    """Uses AI_API_KEY when it is set. Does not invent an outline when the key is missing."""
    enforce_ai_limit(scope.user.id, "research")
    job = get_job(session, scope, job_id)
    return propose_job(session, scope, job)


@router.post("/jobs/{job_id}/import", summary="Send extraction into Lesson Studio as drafts")
def import_drafts(job_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = DB) -> dict[str, Any]:
    """Creates draft chapters, lessons, and question-bank rows. Never publishes."""
    job = get_job(session, scope, job_id)
    return import_job(session, scope, job)
