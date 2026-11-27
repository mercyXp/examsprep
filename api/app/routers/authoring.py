"""Import, templates, AI drafts, past papers, and reuse. Nothing here publishes."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.access import AccessScope, staff_scope
from app.ai.drafts import provider_info
from app.authoring_service import (
    apply_template,
    assist_lesson,
    copy_chapter_to_module,
    copy_lesson_to_module,
    create_lesson_from_import,
    create_topic,
    game_out,
    import_onto_lesson,
    import_past_paper,
    import_question_file,
    insert_template,
    lesson_quality,
    list_games,
    list_module_questions,
    list_topics,
    load_game,
    load_paper,
    load_question,
    paper_out,
    past_paper_path,
    reuse_game,
    save_game,
    update_question_draft,
)
from app.db import get_session
from app.routers.admin import get_chapter, get_lesson
from app.templates_lib import template_catalog

router = APIRouter(prefix="/api/admin", tags=["authoring"])
SCOPE = Depends(staff_scope)


class AssistIn(BaseModel):
    action: str
    status: str | None = None


class TemplateIn(BaseModel):
    template: str
    title: str = ""
    chapter_id: uuid.UUID | None = None
    status: str | None = None


class InsertTemplateIn(BaseModel):
    template: str
    status: str | None = None


class StatusIn(BaseModel):
    status: str | None = None


class CopyIn(BaseModel):
    module_id: uuid.UUID
    chapter_id: uuid.UUID | None = None
    status: str | None = None


class ChapterCopyIn(BaseModel):
    module_id: uuid.UUID
    status: str | None = None


class SlidesIn(BaseModel):
    slides: list[dict[str, Any]] = Field(default_factory=list)


class QuestionIn(BaseModel):
    prompt: str | None = None
    kind: str | None = None
    model_answer: str | None = None
    explanation: str | None = None
    topic: str | None = None
    topic_id: uuid.UUID | None = None
    choices: list[str] | None = None
    correct_index: int | None = None
    accepted: list[str] | None = None
    status: str | None = None


class TopicIn(BaseModel):
    title: str
    status: str | None = None


class GameIn(BaseModel):
    title: str = ""
    block: dict[str, Any]
    status: str | None = None


def _file_bytes(upload: UploadFile | None) -> tuple[str, bytes]:
    if upload is None:
        return "", b""
    data = upload.file.read()
    if not data:
        return upload.filename or "", b""
    return upload.filename or "upload", data


@router.get("/authoring/provider")
def authoring_provider(scope: AccessScope = SCOPE) -> dict[str, Any]:
    info = provider_info()
    return {"ok": True, "role": scope.roles[0] if scope.roles else "", **info}


@router.get("/templates")
def templates(_scope: AccessScope = SCOPE) -> dict[str, Any]:
    return {"ok": True, "items": template_catalog()}


@router.post("/modules/{module_id}/import")
def import_new_lesson(
    module_id: uuid.UUID,
    mode: str = Form("replace"),
    text: str = Form(""),
    title: str = Form(""),
    chapter_id: uuid.UUID | None = Form(None),
    status_value: str = Form(""),
    file: UploadFile | None = File(None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    filename, data = _file_bytes(file)
    payload = create_lesson_from_import(
        session,
        scope,
        module_id,
        filename=filename,
        data=data,
        text=text,
        title=title,
        chapter_id=chapter_id,
        requested_status=status_value,
    )
    return {"ok": True, **payload, "mode": mode}


@router.post("/lessons/{lesson_id}/import")
def import_existing_lesson(
    lesson_id: uuid.UUID,
    mode: str = Form("append"),
    text: str = Form(""),
    status_value: str = Form(""),
    file: UploadFile | None = File(None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    filename, data = _file_bytes(file)
    chosen = "replace" if mode == "replace" else "append"
    payload = import_onto_lesson(
        session,
        scope,
        lesson,
        filename=filename,
        data=data,
        text=text,
        mode=chosen,
        requested_status=status_value,
    )
    return {"ok": True, **payload}


@router.post("/lessons/{lesson_id}/assist")
def assist(
    lesson_id: uuid.UUID,
    body: AssistIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    payload = assist_lesson(session, scope, lesson, body.action, requested_status=body.status)
    return {"ok": True, **payload}


@router.post("/lessons/{lesson_id}/quality")
def quality(
    lesson_id: uuid.UUID,
    body: SlidesIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    scope.require_module(lesson.module_id)
    return {"ok": True, "warnings": lesson_quality(body.slides)}


@router.post("/modules/{module_id}/lessons/from-template")
def lesson_from_template(
    module_id: uuid.UUID,
    body: TemplateIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    payload = apply_template(
        session,
        scope,
        module_id,
        body.template,
        title=body.title,
        chapter_id=body.chapter_id,
        requested_status=body.status,
    )
    return {"ok": True, **payload}


@router.post("/lessons/{lesson_id}/template")
def lesson_insert_template(
    lesson_id: uuid.UUID,
    body: InsertTemplateIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    payload = insert_template(session, scope, lesson, body.template, requested_status=body.status)
    return {"ok": True, **payload}


@router.post("/lessons/{lesson_id}/copy")
def copy_lesson(
    lesson_id: uuid.UUID,
    body: CopyIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    payload = copy_lesson_to_module(
        session,
        scope,
        lesson,
        body.module_id,
        body.chapter_id,
        requested_status=body.status,
    )
    return {"ok": True, **payload}


@router.post("/chapters/{chapter_id}/copy")
def copy_chapter(
    chapter_id: uuid.UUID,
    body: ChapterCopyIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    chapter = get_chapter(session, chapter_id)
    payload = copy_chapter_to_module(session, scope, chapter, body.module_id, requested_status=body.status)
    return {"ok": True, **payload}


@router.get("/modules/{module_id}/questions")
def questions(
    module_id: uuid.UUID,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    scope.require_module(module_id)
    return {"ok": True, "items": list_module_questions(session, module_id)}


@router.post("/modules/{module_id}/questions/import")
def questions_import(
    module_id: uuid.UUID,
    status_value: str = Form(""),
    file: UploadFile | None = File(None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    filename, data = _file_bytes(file)
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a CSV or Excel file.")
    payload = import_question_file(session, scope, module_id, filename, data, requested_status=status_value)
    return {"ok": True, **payload}


@router.patch("/questions/{question_id}")
def patch_question(
    question_id: uuid.UUID,
    body: QuestionIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    question = load_question(session, question_id)
    item = update_question_draft(session, scope, question, body.model_dump(exclude_unset=True))
    return {"ok": True, "item": item, "status": item["status"]}


@router.get("/modules/{module_id}/topics")
def topics(module_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_module(module_id)
    return {"ok": True, "items": list_topics(session, module_id)}


@router.post("/modules/{module_id}/topics")
def add_topic(
    module_id: uuid.UUID,
    body: TopicIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    if (body.status or "").upper() == "PUBLISHED":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Topics are labels. They are not published on their own.")
    return {"ok": True, "item": create_topic(session, scope, module_id, body.title)}


@router.post("/modules/{module_id}/past-papers")
def past_paper(
    module_id: uuid.UUID,
    status_value: str = Form(""),
    file: UploadFile | None = File(None),
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    filename, data = _file_bytes(file)
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Choose a PDF past paper.")
    payload = import_past_paper(session, scope, module_id, filename, data, requested_status=status_value)
    return {"ok": True, **payload}


@router.get("/modules/{module_id}/past-papers")
def past_papers(module_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_module(module_id)
    from sqlalchemy import func, select

    from app.models import PastPaper, Question

    rows = list(session.scalars(select(PastPaper).where(PastPaper.module_id == module_id).order_by(PastPaper.created_at.desc())))
    items = []
    for paper in rows:
        count = session.scalar(select(func.count()).select_from(Question).where(Question.past_paper_id == paper.id)) or 0
        items.append(paper_out(paper, question_count=int(count)))
    return {"ok": True, "items": items}


@router.get("/past-papers/{paper_id}/file")
def past_paper_file(paper_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)):
    paper = load_paper(session, paper_id)
    scope.require_module(paper.module_id)
    path = past_paper_path(paper)
    return FileResponse(path, media_type="application/pdf", filename=paper.original_filename or "past-paper.pdf")


@router.get("/modules/{module_id}/games")
def games(module_id: uuid.UUID, scope: AccessScope = SCOPE, session: Session = Depends(get_session)) -> dict[str, Any]:
    scope.require_module(module_id)
    return {"ok": True, "items": list_games(session, module_id)}


@router.post("/modules/{module_id}/games")
def create_game(
    module_id: uuid.UUID,
    body: GameIn,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    item = save_game(session, scope, module_id, body.title, body.block, requested_status=body.status)
    return {"ok": True, "item": item, "status": "DRAFT"}


@router.post("/lessons/{lesson_id}/games/{game_id}")
def use_game(
    lesson_id: uuid.UUID,
    game_id: uuid.UUID,
    body: StatusIn | None = None,
    scope: AccessScope = SCOPE,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    lesson = get_lesson(session, lesson_id)
    game = load_game(session, game_id)
    requested = body.status if body else None
    payload = reuse_game(session, scope, lesson, game, requested_status=requested)
    return {"ok": True, **payload, "game": game_out(game)}
