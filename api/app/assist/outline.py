"""Turn model JSON and extracted markdown into Lesson Studio draft slides.

Nothing here sets a published status. Callers save through the draft helpers.
"""

from __future__ import annotations

import json
import re

from app.cms import new_id
from app.importers.questions import QuestionDraft

CONTENT_TYPES = {"article", "lecture", "syllabus", "reference", "site"}
PAGE_LIMIT = 20_000
SLIDE_TEXT = 3500

OUTLINE_SYSTEM = """You outline study material for a university course.
Use only the extracted source text. Do not add facts that are not in it.
Return one JSON object and no markdown.
Keys: chapters (list of {title, summary}),
lessons (list of {title, chapter, objectives, body, definitions: [{term, meaning}], examples: [string]}),
questions (list of {prompt, kind, choices, correctLabel, explanation, modelAnswer, topic}).
kind is mcq, tf, short, structured, or exam.
Do not include a status field.
"""


def parse_json_object(text: str) -> dict | None:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).strip()
        raw = re.sub(r"```$", "", raw).strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        payload = json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def choose_mode(content_type: str, url_count: int, requested: str) -> str:
    mode = (requested or "auto").strip().lower()
    if mode not in {"auto", "scrape", "crawl"}:
        mode = "auto"
    if mode == "auto":
        if content_type in {"site", "syllabus"} and url_count == 1:
            return "crawl"
        return "scrape"
    if mode == "crawl" and url_count != 1:
        return "scrape"
    return mode


def _section_slides(title: str, body: str, source_url: str) -> list[dict]:
    chunks = _split_markdown(body)
    if not chunks:
        chunks = [(title or "Extracted page", "")]
    slides = []
    for index, (heading, text) in enumerate(chunks[:12]):
        blocks = []
        if index == 0 and source_url:
            blocks.append(
                {
                    "id": new_id(),
                    "type": "callout",
                    "tone": "note",
                    "text": f"Source: {source_url}",
                }
            )
        if text.strip():
            blocks.append(
                {
                    "id": new_id(),
                    "type": "text",
                    "variant": "paragraph",
                    "text": text.strip()[:SLIDE_TEXT],
                }
            )
        resources = []
        if index == 0 and source_url:
            resources.append({"id": new_id(), "title": "Source", "kind": "link", "url": source_url, "description": ""})
        slides.append({"id": new_id(), "title": (heading or title or "Extracted page")[:180], "blocks": blocks, "resources": resources})
    return slides


def slides_from_pages(pages: list[dict]) -> list[tuple[str, str, list[dict]]]:
    """One draft lesson per extracted page. Text is the source, not an outline."""
    lessons = []
    for page in pages:
        url = str(page.get("url") or "")
        title = str(page.get("title") or "Extracted page")[:180]
        body = str(page.get("markdown") or "").strip()
        if not body:
            continue
        lessons.append((title, url, _section_slides(title, body, url)))
    return lessons


def parse_proposal(text: str) -> dict | None:
    payload = parse_json_object(text)
    if payload is None:
        return None
    chapters = []
    for item in payload.get("chapters") or []:
        if isinstance(item, str) and item.strip():
            chapters.append({"title": item.strip()[:180], "summary": ""})
        elif isinstance(item, dict) and str(item.get("title") or "").strip():
            chapters.append(
                {"title": str(item.get("title")).strip()[:180], "summary": str(item.get("summary") or "").strip()[:1000]}
            )
    lessons = []
    for item in payload.get("lessons") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()[:180]
        body = str(item.get("body") or "").strip()
        if not title or not body:
            continue
        definitions = []
        for row in item.get("definitions") or []:
            if isinstance(row, dict) and str(row.get("term") or "").strip():
                definitions.append(
                    {"term": str(row.get("term")).strip()[:180], "meaning": str(row.get("meaning") or "").strip()[:1000]}
                )
        examples = [str(row).strip()[:500] for row in item.get("examples") or [] if str(row).strip()]
        objectives = [str(row).strip()[:240] for row in item.get("objectives") or [] if str(row).strip()]
        lessons.append(
            {
                "title": title,
                "chapter": str(item.get("chapter") or "").strip()[:180],
                "objectives": objectives[:8],
                "body": body[:PAGE_LIMIT],
                "definitions": definitions[:12],
                "examples": examples[:8],
            }
        )
    if not lessons and not chapters:
        return None
    return {"chapters": chapters[:12], "lessons": lessons[:12], "questions": payload.get("questions") or []}


def slides_from_proposal(lesson: dict, source_urls: list[str]) -> list[dict]:
    source = source_urls[0] if source_urls else ""
    blocks = []
    if source:
        cited = ", ".join(source_urls[:5])
        blocks.append({"id": new_id(), "type": "callout", "tone": "note", "text": f"Source: {cited}"})
    blocks.append({"id": new_id(), "type": "text", "variant": "paragraph", "text": str(lesson.get("body") or "")[:SLIDE_TEXT]})
    for item in lesson.get("definitions") or []:
        blocks.append(
            {
                "id": new_id(),
                "type": "flashcard",
                "front": item.get("term") or "",
                "back": item.get("meaning") or "",
            }
        )
    for example in lesson.get("examples") or []:
        blocks.append({"id": new_id(), "type": "callout", "tone": "tip", "text": f"Example: {example}"})
    resources = [
        {"id": new_id(), "title": "Source", "kind": "link", "url": url, "description": ""}
        for url in source_urls[:5]
    ]
    return [{"id": new_id(), "title": lesson.get("title") or "Draft lesson", "blocks": blocks, "resources": resources}]


def question_drafts(raw_questions: list, source_urls: list[str]) -> list[QuestionDraft]:
    citation = source_urls[0] if source_urls else ""
    drafts: list[QuestionDraft] = []
    for item in raw_questions:
        if not isinstance(item, dict):
            continue
        prompt = str(item.get("prompt") or "").strip()
        if len(prompt) < 8:
            continue
        kind = str(item.get("kind") or "short").strip().lower()
        choices = [str(choice).strip() for choice in item.get("choices") or [] if str(choice).strip()]
        explanation = str(item.get("explanation") or "").strip()
        if citation:
            explanation = f"{explanation}\n\nSource: {citation}".strip()
        model_answer = str(item.get("modelAnswer") or item.get("answer") or "").strip()
        topic = str(item.get("topic") or "").strip()[:180]
        correct = str(item.get("correctLabel") or item.get("correct") or "").strip()
        if kind == "tf":
            choices = ["True", "False"]
            kind = "mcq"
            if correct.casefold() not in {"true", "false"}:
                continue
        if kind == "mcq":
            if len(choices) < 2:
                continue
            index = _correct_index(choices, correct)
            if index is None:
                continue
            drafts.append(
                QuestionDraft(
                    prompt=prompt[:2000],
                    kind="mcq",
                    choices=choices[:6],
                    correct_index=index,
                    explanation=explanation[:4000],
                    topic=topic,
                    label="Research",
                    source="research",
                )
            )
            continue
        bank_kind = "blank" if kind == "blank" else "short"
        accepted = [correct] if correct else []
        if not model_answer and not accepted:
            continue
        drafts.append(
            QuestionDraft(
                prompt=prompt[:2000],
                kind=bank_kind,
                accepted=accepted,
                explanation=explanation[:4000],
                model_answer=model_answer[:4000],
                topic=topic,
                label="Research",
                source="research",
            )
        )
    return drafts[:20]


def _correct_index(choices: list[str], correct: str) -> int | None:
    if not correct:
        return None
    wanted = correct.casefold()
    for index, label in enumerate(choices):
        if label.casefold() == wanted:
            return index
    if len(wanted) == 1 and wanted.isalpha():
        index = ord(wanted) - ord("a")
        if 0 <= index < len(choices):
            return index
    return None


def _split_markdown(body: str) -> list[tuple[str, str]]:
    lines = body.splitlines()
    sections: list[tuple[str, list[str]]] = []
    heading = ""
    bucket: list[str] = []
    for line in lines:
        match = re.match(r"^#{1,3}\s+(.+)$", line.strip())
        if match:
            if heading or any(part.strip() for part in bucket):
                sections.append((heading, bucket))
            heading = match.group(1).strip()[:180]
            bucket = []
            continue
        bucket.append(line)
    if heading or any(part.strip() for part in bucket):
        sections.append((heading, bucket))
    return [(title, "\n".join(text).strip()) for title, text in sections if "\n".join(text).strip() or title]


def combined_markdown(pages: list[dict], *, limit: int = 12_000) -> str:
    parts = []
    for page in pages:
        url = str(page.get("url") or "")
        body = str(page.get("markdown") or "").strip()
        if not body:
            continue
        parts.append(f"Source: {url}\n{body}")
    return "\n\n".join(parts)[:limit]
