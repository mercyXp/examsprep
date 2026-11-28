"""Firecrawl jobs for Lesson Studio. Imports are always drafts."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.access import AccessScope, programme_id_for_module, write_audit
from app.ai.provider import select_provider
from app.assist.firecrawl import FirecrawlClient
from app.assist.http import UpstreamError, fetch_text
from app.assist.messages import not_configured
from app.assist.outline import (
    CONTENT_TYPES,
    OUTLINE_SYSTEM,
    choose_mode,
    combined_markdown,
    parse_proposal,
    question_drafts,
    slides_from_pages,
    slides_from_proposal,
)
from app.assist.robots import decide_robots, robots_url_for
from app.assist.urls import fingerprint, normalise_urls
from app.authoring_access import DRAFT_STATUS, ensure_editor_scope
from app.authoring_service import _new_lesson, add_question_drafts, save_draft_slides
from app.config import settings
from app.models import Chapter, ExtractionJob, Module, Semester
from app.models.catalogue import AcademicYear
from app.models.enums import ContentStatus
from app.routers.admin import get_module, next_position

TERMINAL = {"succeeded", "failed", "blocked", "imported"}
REUSABLE = {"succeeded", "imported", "running"}


def require_firecrawl() -> None:
    if not (settings.firecrawl_api_key or "").strip():
        raise not_configured("Research Assistant", "FIRECRAWL_API_KEY")


def load_module(session: Session, module_id: uuid.UUID) -> Module:
    row = session.scalars(
        select(Module)
        .options(joinedload(Module.semester).joinedload(Semester.academic_year).joinedload(AcademicYear.programme))
        .where(Module.id == module_id)
    ).unique().one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Module not found.")
    return row


def start_job(
    session: Session,
    scope: AccessScope,
    *,
    programme_id: uuid.UUID,
    module_id: uuid.UUID,
    urls: list[str],
    content_type: str,
    mode: str,
    force: bool,
    client: FirecrawlClient | None = None,
) -> dict[str, Any]:
    require_firecrawl()
    kind = content_type.strip().lower()
    if kind not in CONTENT_TYPES:
        allowed = ", ".join(sorted(CONTENT_TYPES))
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Choose a content type: {allowed}.")
    scope.require_programme(programme_id)
    ensure_editor_scope(scope, module_id)
    module = load_module(session, module_id)
    actual_programme = programme_id_for_module(module)
    if actual_programme != programme_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That course is not in the selected programme.")
    cleaned = normalise_urls(urls)
    chosen = choose_mode(kind, len(cleaned), mode)
    digest = fingerprint(cleaned)
    if not force:
        existing = _reusable_job(session, module_id, digest)
        if existing is not None:
            payload = job_out(existing, detail=True)
            payload["duplicate"] = True
            return payload
    notes, blocked = _robots_gate(cleaned)
    job = ExtractionJob(
        programme_id=programme_id,
        module_id=module_id,
        created_by=scope.user.id,
        content_type=kind,
        mode=chosen,
        urls=cleaned,
        url_fingerprint=digest,
        status="blocked" if blocked else "running",
        error=blocked or "",
        note=" ".join(note for note in notes if note),
        provider="firecrawl",
        proposal_status="pending",
    )
    session.add(job)
    session.flush()
    write_audit(session, scope.user, "research.start", "extraction_job", job.id, {"urls": len(cleaned), "mode": chosen})
    if blocked:
        return job_out(job, detail=True)
    try:
        _extract(job, client or FirecrawlClient())
    except UpstreamError as error:
        job.status = "blocked" if error.blocked else "failed"
        job.error = _public_provider_error(error)
    except HTTPException:
        raise
    else:
        if job.status == "succeeded":
            _attach_proposal(job, module)
    session.flush()
    return job_out(job, detail=True)


def refresh_job(session: Session, scope: AccessScope, job: ExtractionJob, client: FirecrawlClient | None = None) -> dict[str, Any]:
    ensure_editor_scope(scope, job.module_id)
    if job.status == "running" and job.crawl_id:
        require_firecrawl()
        try:
            _pull_crawl(job, client or FirecrawlClient())
        except UpstreamError as error:
            job.status = "blocked" if error.blocked else "failed"
            job.error = _public_provider_error(error)
        else:
            if job.status == "succeeded" and job.proposal_status == "pending":
                module = get_module(session, job.module_id)
                _attach_proposal(job, module)
        session.flush()
    return job_out(job, detail=True)


def propose_job(session: Session, scope: AccessScope, job: ExtractionJob) -> dict[str, Any]:
    ensure_editor_scope(scope, job.module_id)
    if job.status not in {"succeeded", "imported"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Wait until extraction finishes before asking for an outline.")
    module = get_module(session, job.module_id)
    _attach_proposal(job, module)
    session.flush()
    return job_out(job, detail=True)


def import_job(session: Session, scope: AccessScope, job: ExtractionJob) -> dict[str, Any]:
    ensure_editor_scope(scope, job.module_id)
    if job.status not in {"succeeded", "imported"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "There is no extracted content to send into Lesson Studio.")
    if job.imported_lesson_ids:
        return {
            "ok": True,
            "status": DRAFT_STATUS,
            "published": False,
            "alreadyImported": True,
            "lessons": [{"id": item, "status": DRAFT_STATUS} for item in job.imported_lesson_ids],
            "questions": [{"id": item, "status": DRAFT_STATUS} for item in job.imported_question_ids],
            "chapters": [{"id": item, "status": DRAFT_STATUS} for item in job.imported_chapter_ids],
        }
    module = get_module(session, job.module_id)
    urls = [str(url) for url in job.urls or []]
    lesson_rows: list[dict[str, str]] = []
    chapter_rows: list[dict[str, str]] = []
    proposal = job.proposal if isinstance(job.proposal, dict) else None
    if proposal and proposal.get("lessons"):
        chapter_ids = _ensure_chapters(session, module.id, proposal.get("chapters") or [])
        chapter_rows = [{"id": str(item), "status": DRAFT_STATUS} for item in chapter_ids.values()]
        for item in proposal.get("lessons") or []:
            chapter_id = chapter_ids.get(str(item.get("chapter") or "").casefold())
            slides = slides_from_proposal(item, urls)
            lesson = _new_lesson(
                session,
                scope,
                module.id,
                str(item.get("title") or "Research draft"),
                chapter_id,
                description=_source_description(urls, outlined=True),
                objectives=list(item.get("objectives") or []),
            )
            if lesson.status != ContentStatus.DRAFT:
                lesson.status = ContentStatus.DRAFT
            save_draft_slides(session, scope, lesson, slides, action="lesson.research")
            lesson_rows.append({"id": str(lesson.id), "title": lesson.title, "status": DRAFT_STATUS})
        drafts = question_drafts(list(proposal.get("questions") or []), urls)
        created = add_question_drafts(session, scope.user, module.id, drafts) if drafts else []
        question_ids = [str(item.id) for item in created]
    else:
        for title, _url, slides in slides_from_pages(list(job.pages or [])):
            lesson = _new_lesson(
                session,
                scope,
                module.id,
                title,
                None,
                description=_source_description(urls, outlined=False),
            )
            lesson.status = ContentStatus.DRAFT
            save_draft_slides(session, scope, lesson, slides, action="lesson.research")
            lesson_rows.append({"id": str(lesson.id), "title": lesson.title, "status": DRAFT_STATUS})
        question_ids = []
    if not lesson_rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The extraction did not include any text to save.")
    job.imported_lesson_ids = [row["id"] for row in lesson_rows]
    job.imported_question_ids = question_ids
    job.imported_chapter_ids = [row["id"] for row in chapter_rows]
    job.status = "imported"
    write_audit(
        session,
        scope.user,
        "research.import",
        "extraction_job",
        job.id,
        {"lessons": len(lesson_rows), "questions": len(question_ids), "status": DRAFT_STATUS},
    )
    session.flush()
    return {
        "ok": True,
        "status": DRAFT_STATUS,
        "published": False,
        "alreadyImported": False,
        "proposalStatus": job.proposal_status,
        "lessons": lesson_rows,
        "questions": [{"id": item, "status": DRAFT_STATUS} for item in question_ids],
        "chapters": chapter_rows,
    }


def list_jobs(session: Session, scope: AccessScope, module_id: uuid.UUID | None) -> list[dict[str, Any]]:
    query = select(ExtractionJob).order_by(ExtractionJob.created_at.desc())
    if module_id is not None:
        ensure_editor_scope(scope, module_id)
        query = query.where(ExtractionJob.module_id == module_id)
    elif not scope.super_admin and scope.module_ids is not None:
        query = query.where(ExtractionJob.module_id.in_(scope.module_ids))
    rows = list(session.scalars(query.limit(40)))
    return [job_out(row, detail=False) for row in rows]


def get_job(session: Session, scope: AccessScope, job_id: uuid.UUID) -> ExtractionJob:
    job = session.get(ExtractionJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Extraction job not found.")
    ensure_editor_scope(scope, job.module_id)
    return job


def job_out(job: ExtractionJob, *, detail: bool) -> dict[str, Any]:
    pages = []
    for page in job.pages or []:
        if not isinstance(page, dict):
            continue
        markdown = str(page.get("markdown") or "")
        item = {
            "url": page.get("url") or "",
            "title": page.get("title") or "",
            "characters": len(markdown),
        }
        if detail:
            item["markdown"] = markdown[:8000]
        pages.append(item)
    return {
        "ok": True,
        "id": str(job.id),
        "programmeId": str(job.programme_id),
        "moduleId": str(job.module_id),
        "contentType": job.content_type,
        "mode": job.mode,
        "urls": list(job.urls or []),
        "status": job.status,
        "error": job.error,
        "note": job.note,
        "provider": job.provider,
        "duplicate": False,
        "pages": pages,
        "structured": list(job.structured or []) if detail else [],
        "proposal": job.proposal if detail else None,
        "proposalStatus": job.proposal_status,
        "proposalMessage": job.proposal_message,
        "published": False,
        "lessons": [{"id": item, "status": DRAFT_STATUS} for item in job.imported_lesson_ids or []],
        "questions": [{"id": item, "status": DRAFT_STATUS} for item in job.imported_question_ids or []],
    }


def _reusable_job(session: Session, module_id: uuid.UUID, digest: str) -> ExtractionJob | None:
    return session.scalar(
        select(ExtractionJob)
        .where(
            ExtractionJob.module_id == module_id,
            ExtractionJob.url_fingerprint == digest,
            ExtractionJob.status.in_(tuple(REUSABLE)),
        )
        .order_by(ExtractionJob.created_at.desc())
    )


def _robots_gate(urls: list[str]) -> tuple[list[str], str]:
    notes: list[str] = []
    for url in urls:
        try:
            status_code, body = fetch_text(robots_url_for(url))
        except UpstreamError as error:
            if error.blocked:
                return notes, error.message
            notes.append("robots.txt could not be read. Firecrawl will still apply its own robots check.")
            continue
        decision = decide_robots(url, status_code, body)
        if not decision.allowed:
            return notes, decision.message
        if decision.message:
            notes.append(decision.message)
    return notes, ""


def _extract(job: ExtractionJob, client: FirecrawlClient) -> None:
    limit = max(1, min(int(settings.firecrawl_crawl_limit or 4), 8))
    if job.mode == "crawl":
        job.crawl_id = client.start_crawl(job.urls[0], limit=limit, structured=True)
        _pull_crawl(job, client)
        return
    pages = []
    structured = []
    for url in job.urls:
        page = client.scrape(url, structured=True)
        pages.append({"url": page.url or url, "title": page.title, "markdown": page.markdown})
        if page.structured:
            structured.append({"url": page.url or url, **page.structured})
    if not any(str(page.get("markdown") or "").strip() for page in pages):
        job.status = "failed"
        job.error = "Firecrawl returned no text for these URLs."
        return
    job.pages = pages
    job.structured = structured
    job.status = "succeeded"


def _pull_crawl(job: ExtractionJob, client: FirecrawlClient) -> None:
    snapshot = client.crawl_status(job.crawl_id)
    if snapshot.status in {"failed", "cancelled"}:
        job.status = "blocked" if "robot" in snapshot.error.lower() else "failed"
        job.error = snapshot.error or "Firecrawl could not crawl this site."
        return
    if snapshot.pages:
        job.pages = [{"url": page.url, "title": page.title, "markdown": page.markdown} for page in snapshot.pages]
        job.structured = [
            {"url": page.url, **page.structured} for page in snapshot.pages if isinstance(page.structured, dict)
        ]
    if snapshot.status == "completed":
        if not job.pages:
            job.status = "failed"
            job.error = "The crawl finished without any pages."
            return
        job.status = "succeeded"
        return
    job.status = "running"


def _attach_proposal(job: ExtractionJob, module: Module) -> None:
    provider = select_provider()
    if not provider.configured:
        job.proposal = None
        job.proposal_status = "not_configured"
        job.proposal_message = (
            "An outline was not generated. Set AI_API_KEY on the API server. "
            "The extracted text can still be sent to Lesson Studio as drafts."
        )
        return
    source = combined_markdown(list(job.pages or []))
    if not source.strip():
        job.proposal_status = "failed"
        job.proposal_message = "There is no extracted text to outline."
        return
    user = (
        f"Course: {module.code} {module.name}\n"
        f"Content type: {job.content_type}\n\n"
        f"Extracted text:\n{source}"
    )
    completion = provider.complete(OUTLINE_SYSTEM, user)
    if completion.degraded or not completion.text.strip():
        job.proposal = None
        job.proposal_status = "failed"
        job.proposal_message = "The AI provider did not return an outline. Nothing was invented. The extracted text is still available."
        return
    proposal = parse_proposal(completion.text)
    if proposal is None:
        job.proposal = None
        job.proposal_status = "failed"
        job.proposal_message = "The model reply was not a usable outline. Nothing was saved as a lesson."
        return
    job.proposal = proposal
    job.proposal_status = "ready"
    job.proposal_message = "Review the outline, then send it to Lesson Studio. It stays a draft."


def _ensure_chapters(session: Session, module_id: uuid.UUID, chapters: list) -> dict[str, uuid.UUID]:
    existing = list(session.scalars(select(Chapter).where(Chapter.module_id == module_id)))
    by_title = {row.title.casefold(): row.id for row in existing}
    created: dict[str, uuid.UUID] = {}
    for item in chapters:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()[:180]
        if not title:
            continue
        key = title.casefold()
        if key in by_title:
            created[key] = by_title[key]
            continue
        row = Chapter(
            module_id=module_id,
            title=title,
            description=str(item.get("summary") or "")[:1000],
            position=next_position(session, Chapter, module_id=module_id),
            status=ContentStatus.DRAFT,
        )
        session.add(row)
        session.flush()
        by_title[key] = row.id
        created[key] = row.id
    return created


def _source_description(urls: list[str], *, outlined: bool) -> str:
    cited = ", ".join(urls[:5])
    if outlined:
        return f"Draft from Research Assistant. Review before submitting. Sources: {cited}"
    return (
        "Draft from extracted pages. No AI outline was applied. Review before submitting. "
        f"Sources: {cited}"
    )


def _public_provider_error(error: UpstreamError) -> str:
    if error.blocked:
        return error.message or "The site blocked this URL, or robots.txt disallows it."
    if error.payment:
        return "Firecrawl refused the request because the free credit limit was reached. No content was invented."
    if error.status == 401:
        return "Firecrawl rejected FIRECRAWL_API_KEY. Check the key on the API server."
    return error.message or "Firecrawl could not extract this URL."
