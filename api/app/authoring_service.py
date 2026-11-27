"""Save imported and generated lessons as drafts inside the editor's module scope."""

from __future__ import annotations

import copy
import re
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.access import AccessScope, write_audit
from app.ai.drafts import DraftBundle, draft_action
from app.authoring_access import ensure_client_cannot_publish, ensure_editor_scope
from app.cms import clean_block, clean_slides, duplicate_slides, new_id, slides_plain_text
from app.importers.notes import ImportError, ImportResult
from app.importers.office import parse_docx, parse_pdf, parse_pptx, pdf_plain_text
from app.importers.notes import parse_notes
from app.importers.questions import QuestionDraft, rows_from_csv, rows_from_xlsx, rows_to_questions, split_past_paper
from app.media import media_root, sniff_media, store_upload
from app.models import Chapter, Lesson, LessonVersion, PastPaper, Question, QuestionVersion, ReusableGame, Topic
from app.models.enums import ContentStatus, VersionStatus
from app.quality import block_has_content, quality_warnings
from app.routers.admin import get_chapter, get_lesson, get_module, latest_version, lesson_out, next_position
from app.templates_lib import template_slides

MAX_UPLOAD = 25 * 1024 * 1024
OPEN_FOR_EDIT = {ContentStatus.PUBLISHED, ContentStatus.IN_REVIEW, ContentStatus.APPROVED}


def read_upload(filename: str, data: bytes, text: str = "") -> ImportResult:
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file is too large. Keep it under 25 MB.")
    try:
        return parse_upload(filename, data, text)
    except ImportError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error


def parse_upload(filename: str, data: bytes, text: str = "") -> ImportResult:
    name = (filename or "").lower().strip()
    if data and name.endswith(".pptx"):
        return parse_pptx(data)
    if data and name.endswith(".docx"):
        return parse_docx(data)
    if data and name.endswith(".pdf"):
        return parse_pdf(data)
    if data and name.endswith((".txt", ".md", ".html", ".htm")):
        return parse_notes(data.decode("utf-8", errors="replace"))
    if data and name.endswith((".ppt", ".doc")):
        raise ImportError("Save the file as .pptx or .docx and upload it again.")
    if text.strip():
        return parse_notes(text)
    if data.startswith(b"%PDF"):
        return parse_pdf(data)
    if data.startswith(b"PK"):
        raise ImportError("Upload a .pptx or .docx file.")
    if data:
        return parse_notes(data.decode("utf-8", errors="replace"))
    raise ImportError("Paste notes or upload a .pptx, .pdf, or .docx file.")


def materialise_images(lesson_id: uuid.UUID, slides: list[dict], images: dict[str, bytes]) -> list[dict]:
    prepared = copy.deepcopy(slides)
    for slide in prepared:
        blocks = []
        for block in slide.get("blocks") or []:
            key = str(block.pop("importKey", "") or "")
            if not key:
                blocks.append(block)
                continue
            blob = images.get(key)
            if not blob:
                blocks.append(_image_note("An image in the upload could not be read."))
                continue
            try:
                stored = store_upload(lesson_id, blob, kind="image", original_name="figure.png")
            except HTTPException:
                blocks.append(_image_note("An image in the upload is not a PNG, JPEG, GIF, or WebP, so it was left as a note."))
                continue
            block["url"] = stored["url"]
            block["alt"] = block.get("alt") or "Imported figure"
            blocks.append(block)
        slide["blocks"] = blocks
    return prepared


def import_onto_lesson(
    session: Session,
    scope: AccessScope,
    lesson: Lesson,
    *,
    filename: str,
    data: bytes,
    text: str,
    mode: str,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, lesson.module_id)
    ensure_client_cannot_publish(requested_status)
    parsed = read_upload(filename, data, text)
    slides = materialise_images(lesson.id, parsed.slides, parsed.images)
    version = latest_version(lesson)
    current = list(version.slides or []) if version else []
    merged = slides if mode == "replace" or _only_placeholder(current) else current + slides
    item = save_draft_slides(session, scope, lesson, merged, action="lesson.import")
    return {"item": item, "title": parsed.title, "status": "DRAFT"}


def create_lesson_from_import(
    session: Session,
    scope: AccessScope,
    module_id: uuid.UUID,
    *,
    filename: str,
    data: bytes,
    text: str,
    title: str,
    chapter_id: uuid.UUID | None,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, module_id)
    ensure_client_cannot_publish(requested_status)
    get_module(session, module_id)
    _chapter_on_module(session, chapter_id, module_id)
    parsed = read_upload(filename, data, text)
    lesson = _new_lesson(
        session,
        scope,
        module_id,
        title.strip() or parsed.title or "Imported lesson",
        chapter_id,
        description="Imported from notes or a lecture file. Review the draft before submitting it.",
    )
    slides = materialise_images(lesson.id, parsed.slides, parsed.images)
    item = save_draft_slides(session, scope, lesson, slides, action="lesson.import")
    return {"item": item, "status": "DRAFT"}


def assist_lesson(
    session: Session,
    scope: AccessScope,
    lesson: Lesson,
    action: str,
    *,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, lesson.module_id)
    ensure_client_cannot_publish(requested_status)
    version = latest_version(lesson)
    source = version.body if version and version.body else slides_plain_text(version.slides if version else [])
    examples = past_paper_examples(session, lesson.module_id) if action == "mock" else []
    try:
        bundle = draft_action(action, source, examples)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error
    current = list(version.slides or []) if version else []
    if _only_placeholder(current):
        merged = bundle.slides
    else:
        merged = current + bundle.slides
    item = save_draft_slides(session, scope, lesson, merged, action=f"lesson.assist.{action}")
    created = []
    if bundle.questions:
        created = add_question_drafts(session, scope.user, lesson.module_id, [_draft_from_ai(row) for row in bundle.questions])
        write_audit(session, scope.user, "question.generate", "module", lesson.module_id, {"count": len(created), "status": "DRAFT"})
    return {
        "item": item,
        "provider": bundle.provider,
        "degraded": bundle.degraded,
        "status": bundle.status,
        "appended": len(bundle.slides),
        "questions": len(created),
    }


def apply_template(
    session: Session,
    scope: AccessScope,
    module_id: uuid.UUID,
    template_id: str,
    *,
    title: str,
    chapter_id: uuid.UUID | None,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, module_id)
    ensure_client_cannot_publish(requested_status)
    get_module(session, module_id)
    _chapter_on_module(session, chapter_id, module_id)
    try:
        name, slides = template_slides(template_id, title)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error
    lesson = _new_lesson(session, scope, module_id, name, chapter_id, description="Started from a template. Edit the draft before submitting it.")
    item = save_draft_slides(session, scope, lesson, slides, action="lesson.template")
    return {"item": item, "status": "DRAFT"}


def insert_template(
    session: Session,
    scope: AccessScope,
    lesson: Lesson,
    template_id: str,
    *,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, lesson.module_id)
    ensure_client_cannot_publish(requested_status)
    try:
        _name, slides = template_slides(template_id, lesson.title)
    except ValueError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error
    version = latest_version(lesson)
    current = list(version.slides or []) if version else []
    merged = slides if _only_placeholder(current) else current + slides
    item = save_draft_slides(session, scope, lesson, merged, action="lesson.template")
    return {"item": item, "status": "DRAFT"}


def copy_lesson_to_module(
    session: Session,
    scope: AccessScope,
    lesson: Lesson,
    target_module_id: uuid.UUID,
    chapter_id: uuid.UUID | None,
    *,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, lesson.module_id, target_module_id)
    ensure_client_cannot_publish(requested_status)
    get_module(session, target_module_id)
    _chapter_on_module(session, chapter_id, target_module_id)
    version = latest_version(lesson)
    copy = _new_lesson(
        session,
        scope,
        target_module_id,
        _copy_title(lesson.title),
        chapter_id,
        description=lesson.description,
        objectives=list(lesson.objectives or []),
        duration=lesson.duration_minutes,
        difficulty=lesson.difficulty,
    )
    slides = duplicate_slides(version.slides if version else [])
    item = save_draft_slides(session, scope, copy, slides, action="lesson.copy")
    write_audit(session, scope.user, "lesson.copy", "lesson", copy.id, {"from": str(lesson.id), "moduleId": str(target_module_id)})
    return {"item": item, "status": "DRAFT"}


def copy_chapter_to_module(
    session: Session,
    scope: AccessScope,
    chapter: Chapter,
    target_module_id: uuid.UUID,
    *,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, chapter.module_id, target_module_id)
    ensure_client_cannot_publish(requested_status)
    get_module(session, target_module_id)
    clone = Chapter(
        module_id=target_module_id,
        title=_copy_title(chapter.title),
        description=chapter.description,
        position=next_position(session, Chapter, module_id=target_module_id),
        status=ContentStatus.DRAFT,
    )
    session.add(clone)
    session.flush()
    sources = list(
        session.scalars(select(Lesson).where(Lesson.chapter_id == chapter.id, Lesson.module_id == chapter.module_id).order_by(Lesson.position))
    )
    items = []
    for source in sources:
        loaded = get_lesson(session, source.id)
        version = latest_version(loaded)
        copy = _new_lesson(
            session,
            scope,
            target_module_id,
            loaded.title,
            clone.id,
            description=loaded.description,
            objectives=list(loaded.objectives or []),
            duration=loaded.duration_minutes,
            difficulty=loaded.difficulty,
        )
        save_draft_slides(session, scope, copy, duplicate_slides(version.slides if version else []), action="lesson.copy")
        items.append(lesson_out(get_lesson(session, copy.id)))
    write_audit(
        session,
        scope.user,
        "chapter.copy",
        "chapter",
        clone.id,
        {"from": str(chapter.id), "moduleId": str(target_module_id), "lessons": len(items)},
    )
    return {
        "chapter": {"id": str(clone.id), "title": clone.title, "moduleId": str(clone.module_id), "status": "DRAFT"},
        "lessons": items,
        "status": "DRAFT",
    }


def import_question_file(
    session: Session,
    scope: AccessScope,
    module_id: uuid.UUID,
    filename: str,
    data: bytes,
    *,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, module_id)
    ensure_client_cannot_publish(requested_status)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file is too large. Keep it under 25 MB.")
    name = filename.lower()
    try:
        if name.endswith(".xlsx"):
            rows = rows_from_xlsx(data)
        elif name.endswith(".csv") or not name:
            rows = rows_from_csv(data)
        else:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload a .csv or .xlsx file.")
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That spreadsheet could not be read.") from error
    drafts = rows_to_questions(rows, source="import")
    if not drafts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No questions were found. Use a prompt column and one row per question.")
    created = add_question_drafts(session, scope.user, module_id, drafts)
    write_audit(session, scope.user, "question.import", "module", module_id, {"count": len(created), "status": "DRAFT"})
    return {"items": [question_out(session, item) for item in created], "status": "DRAFT"}


def import_past_paper(
    session: Session,
    scope: AccessScope,
    module_id: uuid.UUID,
    filename: str,
    data: bytes,
    *,
    requested_status: str | None,
) -> dict[str, Any]:
    ensure_editor_scope(scope, module_id)
    ensure_client_cannot_publish(requested_status)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That file is too large. Keep it under 25 MB.")
    if not filename.lower().endswith(".pdf") and not data.startswith(b"%PDF"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload the past paper as a PDF.")
    try:
        text = pdf_plain_text(data)
    except ImportError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(error)) from error
    drafts = split_past_paper(text)
    if not drafts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No questions were found in that PDF.")
    year_match = re.search(r"\b(19|20)\d{2}\b", text)
    paper = PastPaper(
        module_id=module_id,
        uploaded_by_id=scope.user.id,
        title=(filename.rsplit(".", 1)[0] or "Past paper")[:200],
        original_filename=filename[:200],
        year=int(year_match.group(0)) if year_match else None,
        storage_key="",
        status=ContentStatus.DRAFT,
    )
    session.add(paper)
    session.flush()
    paper.storage_key = _store_past_paper(paper.id, data)
    created = add_question_drafts(session, scope.user, module_id, drafts, past_paper_id=paper.id)
    write_audit(session, scope.user, "past_paper.import", "past_paper", paper.id, {"questions": len(created), "status": "DRAFT"})
    return {"paper": paper_out(paper, question_count=len(created)), "items": [question_out(session, item) for item in created], "status": "DRAFT"}


def update_question_draft(
    session: Session,
    scope: AccessScope,
    question: Question,
    body: dict[str, Any],
) -> dict[str, Any]:
    ensure_editor_scope(scope, question.module_id)
    ensure_client_cannot_publish(body.get("status"))
    version = latest_question_version(question)
    if version is None or version.status != VersionStatus.DRAFT:
        version = QuestionVersion(
            question_id=question.id,
            version_number=(version.version_number + 1) if version else 1,
            prompt=version.prompt if version else question.title,
            choices=list(version.choices or []) if version else [],
            correct_option_ids=list(version.correct_option_ids or []) if version else [],
            explanation=version.explanation if version else "",
            model_answer=version.model_answer if version else "",
            accepted_answers=list(version.accepted_answers or []) if version else [],
            author_id=scope.user.id,
            status=VersionStatus.DRAFT,
        )
        session.add(version)
    if body.get("prompt"):
        version.prompt = str(body["prompt"]).strip()[:8000]
        question.title = version.prompt.split("\n", 1)[0][:200]
    if body.get("kind") in {"mcq", "blank", "short"}:
        question.kind = body["kind"]
    if "explanation" in body and body["explanation"] is not None:
        version.explanation = str(body["explanation"])[:8000]
    if "model_answer" in body and body["model_answer"] is not None:
        version.model_answer = str(body["model_answer"])[:8000]
    if isinstance(body.get("accepted"), list):
        version.accepted_answers = [str(item).strip() for item in body["accepted"] if str(item).strip()][:8]
    if isinstance(body.get("choices"), list):
        choices = []
        correct_ids = []
        correct_index = body.get("correct_index")
        for index, label in enumerate(body["choices"]):
            text = str(label).strip()
            if not text:
                continue
            option_id = str(uuid.uuid4())
            choices.append({"id": option_id, "label": text[:400]})
            if correct_index == index:
                correct_ids.append(option_id)
        version.choices = choices
        version.correct_option_ids = correct_ids
    elif isinstance(body.get("correct_index"), int):
        options = version.choices or []
        if 0 <= body["correct_index"] < len(options):
            version.correct_option_ids = [options[body["correct_index"]]["id"]]
        else:
            version.correct_option_ids = []
    topic_name = (body.get("topic") or "").strip()
    if topic_name:
        question.topic_id = ensure_topic(session, question.module_id, topic_name).id
    elif body.get("topic_id"):
        topic = session.get(Topic, body["topic_id"])
        if topic is None or topic.module_id != question.module_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That topic is not in this module.")
        question.topic_id = topic.id
    question.status = ContentStatus.DRAFT
    version.status = VersionStatus.DRAFT
    session.flush()
    write_audit(session, scope.user, "question.update", "question", question.id, {"status": "DRAFT"})
    return question_out(session, question)


def list_module_questions(session: Session, module_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = list(
        session.scalars(
            select(Question)
            .options(selectinload(Question.versions))
            .where(Question.module_id == module_id)
            .order_by(Question.created_at.desc())
        )
    )
    return [question_out(session, row) for row in rows]


def list_topics(session: Session, module_id: uuid.UUID) -> list[dict[str, str]]:
    rows = session.scalars(select(Topic).where(Topic.module_id == module_id).order_by(Topic.position, Topic.title))
    return [{"id": str(row.id), "title": row.title} for row in rows]


def create_topic(session: Session, scope: AccessScope, module_id: uuid.UUID, title: str) -> dict[str, str]:
    ensure_editor_scope(scope, module_id)
    topic = ensure_topic(session, module_id, title)
    return {"id": str(topic.id), "title": topic.title}


def list_games(session: Session, module_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = session.scalars(select(ReusableGame).where(ReusableGame.module_id == module_id).order_by(ReusableGame.created_at.desc()))
    return [game_out(row) for row in rows]


def save_game(session: Session, scope: AccessScope, module_id: uuid.UUID, title: str, block: dict, *, requested_status: str | None) -> dict[str, Any]:
    ensure_editor_scope(scope, module_id)
    ensure_client_cannot_publish(requested_status)
    payload = dict(block)
    payload["type"] = "game"
    cleaned = clean_block(payload)
    row = ReusableGame(
        module_id=module_id,
        creator_id=scope.user.id,
        title=(title or cleaned.get("title") or "Game").strip()[:200],
        payload=cleaned,
        status=ContentStatus.DRAFT,
    )
    session.add(row)
    session.flush()
    write_audit(session, scope.user, "game.save", "game", row.id, {"status": "DRAFT"})
    return game_out(row)


def reuse_game(session: Session, scope: AccessScope, lesson: Lesson, game: ReusableGame, *, requested_status: str | None) -> dict[str, Any]:
    ensure_editor_scope(scope, lesson.module_id, game.module_id)
    ensure_client_cannot_publish(requested_status)
    cloned = duplicate_slides([{"id": new_id(), "title": game.title, "layout": "assessment", "blocks": [game.payload]}])
    version = latest_version(lesson)
    current = list(version.slides or []) if version else []
    item = save_draft_slides(session, scope, lesson, current + cloned, action="lesson.reuse_game")
    return {"item": item, "status": "DRAFT"}


def lesson_quality(slides: list[dict] | None) -> list[dict[str, str]]:
    cleaned = clean_slides(slides or [])
    return quality_warnings(cleaned)


def save_draft_slides(session: Session, scope: AccessScope, lesson: Lesson, slides: list, *, action: str) -> dict[str, Any]:
    cleaned = clean_slides(slides)
    version = latest_version(lesson)
    if version is None:
        version = LessonVersion(
            lesson_id=lesson.id,
            version_number=1,
            author_id=scope.user.id,
            body="",
            slides=[],
            status=VersionStatus.DRAFT,
        )
        session.add(version)
        lesson.versions.append(version)
    version.slides = cleaned
    version.body = slides_plain_text(cleaned)
    version.status = VersionStatus.DRAFT
    if lesson.status in OPEN_FOR_EDIT:
        lesson.status = ContentStatus.DRAFT
    session.flush()
    write_audit(session, scope.user, action, "lesson", lesson.id, {"slides": len(cleaned), "status": "DRAFT"})
    return lesson_out(get_lesson(session, lesson.id), include_content=True, slides=cleaned)


def add_question_drafts(
    session: Session,
    user,
    module_id: uuid.UUID,
    drafts: list[QuestionDraft],
    *,
    past_paper_id: uuid.UUID | None = None,
) -> list[Question]:
    created: list[Question] = []
    for draft in drafts:
        topic = ensure_topic(session, module_id, draft.topic) if draft.topic else None
        question = Question(
            module_id=module_id,
            creator_id=user.id,
            title=(draft.prompt.split("\n", 1)[0] or "Question")[:200],
            status=ContentStatus.DRAFT,
            kind=draft.kind if draft.kind in {"mcq", "blank", "short"} else "short",
            source=draft.source or "manual",
            topic_id=topic.id if topic else None,
            past_paper_id=past_paper_id,
            paper_label=draft.label[:80],
        )
        session.add(question)
        session.flush()
        choices, correct_ids = _choice_ids(draft)
        version = QuestionVersion(
            question_id=question.id,
            version_number=1,
            prompt=draft.prompt,
            choices=choices,
            correct_option_ids=correct_ids,
            explanation=draft.explanation,
            model_answer=draft.model_answer,
            accepted_answers=list(draft.accepted),
            author_id=user.id,
            status=VersionStatus.DRAFT,
        )
        session.add(version)
        question.versions.append(version)
        created.append(question)
    session.flush()
    return created


def past_paper_examples(session: Session, module_id: uuid.UUID) -> list[str]:
    rows = session.scalars(
        select(Question)
        .options(selectinload(Question.versions))
        .where(Question.module_id == module_id, Question.source == "past_paper")
        .order_by(Question.created_at.desc())
        .limit(6)
    )
    examples = []
    for question in rows:
        version = latest_question_version(question)
        if version and version.prompt.strip():
            examples.append(version.prompt.strip())
    return examples


def question_out(session: Session, question: Question) -> dict[str, Any]:
    version = latest_question_version(question)
    topic = session.get(Topic, question.topic_id) if question.topic_id else None
    choices = version.choices if version else []
    correct = set(version.correct_option_ids if version else [])
    warnings = []
    if question.kind == "mcq" and not correct:
        warnings.append("No correct answer yet.")
    if question.kind in {"blank", "short"} and not (version and (version.model_answer.strip() or version.accepted_answers)):
        warnings.append("No model answer yet.")
    return {
        "id": str(question.id),
        "moduleId": str(question.module_id),
        "title": question.title,
        "prompt": version.prompt if version else question.title,
        "kind": question.kind,
        "source": question.source,
        "status": question.status.value,
        "topicId": str(topic.id) if topic else None,
        "topicTitle": topic.title if topic else "",
        "pastPaperId": str(question.past_paper_id) if question.past_paper_id else None,
        "paperLabel": question.paper_label,
        "choices": choices or [],
        "correctOptionIds": list(correct),
        "acceptedAnswers": list(version.accepted_answers or []) if version else [],
        "explanation": version.explanation if version else "",
        "modelAnswer": version.model_answer if version else "",
        "warnings": warnings,
    }


def paper_out(paper: PastPaper, *, question_count: int = 0) -> dict[str, Any]:
    return {
        "id": str(paper.id),
        "moduleId": str(paper.module_id),
        "title": paper.title,
        "filename": paper.original_filename,
        "year": paper.year,
        "status": "DRAFT",
        "questionCount": question_count,
    }


def game_out(game: ReusableGame) -> dict[str, Any]:
    return {
        "id": str(game.id),
        "moduleId": str(game.module_id),
        "title": game.title,
        "status": "DRAFT",
        "block": game.payload,
    }


def ensure_topic(session: Session, module_id: uuid.UUID, title: str) -> Topic:
    cleaned = title.strip()
    if not cleaned:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Topic name is required.")
    existing = session.scalar(select(Topic).where(Topic.module_id == module_id, Topic.title.ilike(cleaned)))
    if existing:
        return existing
    topic = Topic(module_id=module_id, title=cleaned[:180], position=next_position(session, Topic, module_id=module_id))
    session.add(topic)
    session.flush()
    return topic


def latest_question_version(question: Question) -> QuestionVersion | None:
    if not question.versions:
        return None
    return max(question.versions, key=lambda item: item.version_number)


def load_question(session: Session, question_id: uuid.UUID) -> Question:
    row = session.scalars(
        select(Question).options(selectinload(Question.versions)).where(Question.id == question_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Question not found.")
    return row


def load_game(session: Session, game_id: uuid.UUID) -> ReusableGame:
    row = session.get(ReusableGame, game_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Game not found.")
    return row


def load_paper(session: Session, paper_id: uuid.UUID) -> PastPaper:
    row = session.get(PastPaper, paper_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Past paper not found.")
    return row


def past_paper_path(paper: PastPaper):
    folder = (media_root() / "past-papers" / str(paper.id)).resolve()
    path = (folder / "source.pdf").resolve()
    if path.parent != folder or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That past paper file is missing.")
    return path


def _new_lesson(
    session: Session,
    scope: AccessScope,
    module_id: uuid.UUID,
    title: str,
    chapter_id: uuid.UUID | None,
    *,
    description: str = "",
    objectives: list | None = None,
    duration: int | None = None,
    difficulty: str | None = None,
) -> Lesson:
    lesson = Lesson(
        module_id=module_id,
        chapter_id=chapter_id,
        creator_id=scope.user.id,
        title=(title or "Untitled lesson").strip()[:200],
        description=description or "",
        objectives=objectives or [],
        duration_minutes=duration,
        difficulty=difficulty,
        position=next_position(session, Lesson, module_id=module_id),
        status=ContentStatus.DRAFT,
    )
    session.add(lesson)
    session.flush()
    version = LessonVersion(
        lesson_id=lesson.id,
        version_number=1,
        body="",
        slides=[],
        author_id=scope.user.id,
        status=VersionStatus.DRAFT,
    )
    session.add(version)
    lesson.versions.append(version)
    session.flush()
    write_audit(session, scope.user, "lesson.create", "lesson", lesson.id, {"title": lesson.title, "status": "DRAFT"})
    return lesson


def _chapter_on_module(session: Session, chapter_id: uuid.UUID | None, module_id: uuid.UUID) -> None:
    if chapter_id is None:
        return
    chapter = get_chapter(session, chapter_id)
    if chapter.module_id != module_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That chapter does not belong to this module.")


def _only_placeholder(slides: list) -> bool:
    if not slides:
        return True
    if len(slides) != 1:
        return False
    blocks = slides[0].get("blocks") or []
    return not any(block_has_content(block) for block in blocks if isinstance(block, dict))


def _copy_title(title: str) -> str:
    cleaned = title.strip() or "Untitled"
    if cleaned.endswith("(copy)"):
        return cleaned[:200]
    return f"{cleaned} (copy)"[:200]


def _image_note(text: str) -> dict:
    return {"id": new_id(), "type": "callout", "tone": "note", "text": text}


def _choice_ids(draft: QuestionDraft) -> tuple[list[dict[str, str]], list[str]]:
    choices = []
    correct = []
    for index, label in enumerate(draft.choices):
        option_id = str(uuid.uuid4())
        choices.append({"id": option_id, "label": label[:400]})
        if draft.correct_index == index:
            correct.append(option_id)
    return choices, correct


def _draft_from_ai(row: dict) -> QuestionDraft:
    choices = [str(item) for item in row.get("choices") or []]
    correct_index = None
    wanted = str(row.get("correctLabel") or "").strip().lower()
    if wanted:
        for index, choice in enumerate(choices):
            if choice.lower() == wanted:
                correct_index = index
    kind = row.get("kind") if row.get("kind") in {"mcq", "blank", "short"} else "short"
    if kind == "mcq" and len(choices) < 2:
        kind = "short"
    answer = str(row.get("answer") or "")
    return QuestionDraft(
        prompt=str(row.get("prompt") or ""),
        kind=kind,
        choices=choices,
        correct_index=correct_index,
        accepted=[answer] if answer and kind != "mcq" else [],
        explanation=str(row.get("explanation") or ""),
        model_answer=str(row.get("modelAnswer") or answer or ""),
        source="ai",
        status="DRAFT",
    )


def _store_past_paper(paper_id: uuid.UUID, data: bytes) -> str:
    detected = sniff_media(data)
    if detected.content_type != "application/pdf":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Upload the past paper as a PDF.")
    if len(data) > detected.max_bytes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "That PDF is too large.")
    folder = media_root() / "past-papers" / str(paper_id)
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "source.pdf").write_bytes(data)
    return f"past-papers/{paper_id}/source.pdf"


def bundle_status(bundle: DraftBundle) -> str:
    return bundle.status
