"""Question-bank rows from CSV, Excel, and past-paper text. Every row stays a draft."""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field

from app.authoring_access import DRAFT_STATUS

HEADER_ALIASES = {
    "prompt": "prompt",
    "question": "prompt",
    "stem": "prompt",
    "kind": "kind",
    "type": "kind",
    "option_a": "a",
    "choice_a": "a",
    "a": "a",
    "option_b": "b",
    "choice_b": "b",
    "b": "b",
    "option_c": "c",
    "choice_c": "c",
    "c": "c",
    "option_d": "d",
    "choice_d": "d",
    "d": "d",
    "option_e": "e",
    "choice_e": "e",
    "e": "e",
    "correct": "correct",
    "answer": "correct",
    "correct_answer": "correct",
    "explanation": "explanation",
    "model_answer": "model_answer",
    "model": "model_answer",
    "topic": "topic",
    "status": "status",
    "label": "label",
}

QUESTION_SPLIT = re.compile(
    r"(?im)^[ \t]*(?:question\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|q\s*\d+\b)"
)
OPTION_LINE = re.compile(r"^[ \t]*(?:\(([A-Ha-h])\)|([A-Ha-h])[.)])\s+(\S.*)$")
KIND_ALIASES = {
    "mcq": "mcq",
    "multiple_choice": "mcq",
    "multiple choice": "mcq",
    "multi": "mcq",
    "blank": "blank",
    "fill": "blank",
    "fill_in": "blank",
    "fill-in-the-blank": "blank",
    "fill in the blank": "blank",
    "short": "short",
    "short_answer": "short",
    "essay": "short",
}


@dataclass
class QuestionDraft:
    prompt: str
    kind: str = "mcq"
    choices: list[str] = field(default_factory=list)
    correct_index: int | None = None
    accepted: list[str] = field(default_factory=list)
    explanation: str = ""
    model_answer: str = ""
    topic: str = ""
    label: str = ""
    source: str = "import"
    status: str = DRAFT_STATUS


def rows_from_csv(data: bytes) -> list[dict[str, str]]:
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows: list[dict[str, str]] = []
    for raw in reader:
        row = {_header(key): (value or "").strip() for key, value in raw.items() if key}
        if any(row.values()):
            rows.append(row)
    return rows


def rows_from_xlsx(data: bytes) -> list[dict[str, str]]:
    from openpyxl import load_workbook

    book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        sheet = book.active
        grid = [list(row) for row in sheet.iter_rows(values_only=True)]
    finally:
        book.close()
    if not grid:
        return []
    headers = [_header(cell) for cell in grid[0]]
    rows: list[dict[str, str]] = []
    for raw in grid[1:]:
        row: dict[str, str] = {}
        for index, header in enumerate(headers):
            if not header:
                continue
            value = raw[index] if index < len(raw) else ""
            row[header] = "" if value is None else str(value).strip()
        if any(row.values()):
            rows.append(row)
    return rows


def rows_to_questions(rows: list[dict[str, str]], *, source: str = "import") -> list[QuestionDraft]:
    drafts: list[QuestionDraft] = []
    for row in rows:
        prompt = (row.get("prompt") or "").strip()
        if not prompt:
            continue
        kind = KIND_ALIASES.get((row.get("kind") or "").strip().lower(), "")
        choices = [row.get(letter, "").strip() for letter in ("a", "b", "c", "d", "e")]
        choices = [choice for choice in choices if choice]
        if not kind:
            kind = "mcq" if len(choices) >= 2 else "short"
        correct_index = None
        accepted: list[str] = []
        answer = (row.get("correct") or "").strip()
        if kind == "mcq":
            correct_index = _correct_index(answer, choices)
        elif answer:
            accepted = [answer]
        # A status column is ignored. Imports are drafts until a person reviews them.
        drafts.append(
            QuestionDraft(
                prompt=prompt[:4000],
                kind=kind if kind in {"mcq", "blank", "short"} else "short",
                choices=choices[:8],
                correct_index=correct_index,
                accepted=accepted[:6],
                explanation=(row.get("explanation") or "")[:4000],
                model_answer=(row.get("model_answer") or "")[:8000],
                topic=(row.get("topic") or "")[:180],
                label=(row.get("label") or "")[:80],
                source=source,
                status=DRAFT_STATUS,
            )
        )
    return drafts


def split_past_paper(text: str) -> list[QuestionDraft]:
    raw = (text or "").replace("\r\n", "\n").strip()
    if not raw:
        return []
    matches = list(QUESTION_SPLIT.finditer(raw))
    chunks: list[tuple[str, str]] = []
    if len(matches) >= 1:
        if matches[0].start() > 0:
            preface = raw[: matches[0].start()].strip()
            if len(preface) > 40:
                chunks.append(("", preface))
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
            label = " ".join(match.group(0).split())
            body = raw[match.end() : end].strip()
            chunks.append((label, f"{label}\n{body}".strip()))
    else:
        chunks.append(("", raw))
    drafts: list[QuestionDraft] = []
    for label, body in chunks:
        if not body.strip():
            continue
        drafts.append(_draft_from_stem(body.strip(), label=label))
    return drafts


def _draft_from_stem(body: str, *, label: str) -> QuestionDraft:
    lines = body.splitlines()
    options: list[str] = []
    prompt_lines: list[str] = []
    for line in lines:
        match = OPTION_LINE.match(line)
        if match and (options or len(prompt_lines) > 0):
            options.append(match.group(3).strip())
            continue
        if options:
            options[-1] = f"{options[-1]} {line.strip()}".strip()
            continue
        prompt_lines.append(line)
    prompt = "\n".join(prompt_lines).strip() or body.strip()
    kind = "mcq" if len(options) >= 3 else "short"
    return QuestionDraft(
        prompt=prompt[:4000],
        kind=kind,
        choices=options[:8],
        correct_index=None,
        label=label[:80],
        source="past_paper",
        status=DRAFT_STATUS,
    )


def _header(value: object) -> str:
    text = "" if value is None else str(value)
    key = re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")
    return HEADER_ALIASES.get(key, key)


def _correct_index(answer: str, choices: list[str]) -> int | None:
    if not answer or not choices:
        return None
    token = answer.strip()
    if len(token) == 1 and token.upper() in "ABCDEFGH":
        index = ord(token.upper()) - ord("A")
        return index if index < len(choices) else None
    lowered = token.lower()
    for index, choice in enumerate(choices):
        if choice.lower() == lowered:
            return index
    return None
