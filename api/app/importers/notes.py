"""Paste rich text or plain notes and turn headings, bullets, tables, and code into slides."""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field
from html.parser import HTMLParser

from app.cms import new_id

HEADING_PREFIX = re.compile(r"^(?:chapter|unit|topic|section|lesson)\b", re.IGNORECASE)
FENCE = re.compile(r"^```([\w+-]*)\s*$")
BULLET = re.compile(r"^(?:[-*•–]|\d+[.)])\s+")
MARKDOWN_IMAGE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*$")
SETEXT = re.compile(r"^(?:=+|-+)\s*$")
HTML_MARK = re.compile(r"<(?:h1|h2|h3|h4|p|ul|ol|li|table|br|div|img|pre|blockquote)\b", re.IGNORECASE)
MAX_SLIDES = 80
MAX_BLOCKS = 40


class ImportError(ValueError):
    """The upload or paste did not contain lesson content we can read."""


@dataclass
class ImportResult:
    title: str
    slides: list[dict]
    images: dict[str, bytes] = field(default_factory=dict)


def parse_notes(text: str) -> ImportResult:
    raw = (text or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not raw:
        raise ImportError("Paste some notes or choose a lecture file.")
    if HTML_MARK.search(raw):
        result = _parse_html(raw)
        if result.slides:
            return result
    result = slides_from_text(raw, fallback_title="Notes")
    if not result.slides:
        raise ImportError("Those notes did not contain any text.")
    return result


def slides_from_text(text: str, *, fallback_title: str) -> ImportResult:
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    slides: list[dict] = []
    images: dict[str, bytes] = {}
    current = _slide(fallback_title)
    paragraph: list[str] = []
    in_code = False
    code_lang = ""
    code_lines: list[str] = []
    table_lines: list[str] = []
    skip_next = False

    def flush_paragraph() -> None:
        text_value = " ".join(part.strip() for part in paragraph if part.strip()).strip()
        paragraph.clear()
        if text_value:
            _add_block(current, _text_block(text_value))

    def flush_table() -> None:
        if not table_lines:
            return
        block = _table_from_markdown(table_lines)
        table_lines.clear()
        if block:
            _add_block(current, block)

    def flush_code() -> None:
        code = "\n".join(code_lines).strip("\n")
        code_lines.clear()
        if code:
            _add_block(current, {"id": new_id(), "type": "code", "language": code_lang or "text", "code": code})

    def start_slide(title: str) -> None:
        nonlocal current
        flush_paragraph()
        flush_table()
        if _slide_has_blocks(current) or (slides and current.get("title")):
            slides.append(current)
        current = _slide(title.strip() or fallback_title)

    for index, line in enumerate(lines):
        if skip_next:
            skip_next = False
            continue
        fence = FENCE.match(line.strip())
        if fence:
            flush_paragraph()
            flush_table()
            if in_code:
                flush_code()
                in_code = False
                code_lang = ""
            else:
                in_code = True
                code_lang = fence.group(1) or "text"
            continue
        if in_code:
            code_lines.append(line)
            continue
        if _is_table_line(line):
            flush_paragraph()
            table_lines.append(line)
            continue
        flush_table()
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            continue
        next_line = lines[index + 1] if index + 1 < len(lines) else ""
        if SETEXT.match(next_line.strip()) and len(stripped) <= 120 and not BULLET.match(stripped):
            skip_next = True
            start_slide(stripped)
            continue
        heading = stripped.lstrip("#").strip() if stripped.startswith("#") else stripped
        is_heading = stripped.startswith("#") or _is_heading_line(stripped)
        if is_heading and heading:
            if not paragraph and not _slide_has_blocks(current) and not slides and current["title"] == fallback_title:
                current["title"] = heading[:180]
                continue
            start_slide(heading)
            continue
        bullet = BULLET.match(stripped)
        if bullet:
            flush_paragraph()
            _add_block(current, _text_block(stripped[bullet.end() :].strip()))
            continue
        image = MARKDOWN_IMAGE.match(stripped)
        if image:
            flush_paragraph()
            block, stored = _image_from_src(image.group(2), image.group(1))
            if stored:
                images[stored[0]] = stored[1]
            if block:
                _add_block(current, block)
            continue
        paragraph.append(stripped)

    if in_code:
        flush_code()
    flush_paragraph()
    flush_table()
    slides.append(current)
    slides = [slide for slide in slides if _slide_has_blocks(slide) or slide is current][:MAX_SLIDES]
    if slides and not _slide_has_blocks(slides[0]) and len(slides) > 1:
        slides = slides[1:]
    title = str(slides[0]["title"]) if slides else fallback_title
    return ImportResult(title=title or fallback_title, slides=slides[:MAX_SLIDES], images=images)


def _parse_html(raw: str) -> ImportResult:
    parser = _NotesHTMLParser()
    parser.feed(raw)
    parser.close()
    slides: list[dict] = []
    images: dict[str, bytes] = {}
    current = _slide("Notes")

    def start(title: str) -> None:
        nonlocal current
        if _slide_has_blocks(current):
            slides.append(current)
        current = _slide(title.strip() or "Notes")

    for kind, payload in parser.events:
        if kind == "heading":
            start(str(payload))
        elif kind == "bullet":
            _add_block(current, _text_block(str(payload)))
        elif kind == "paragraph":
            text = str(payload).strip()
            if text:
                _add_block(current, _text_block(text))
        elif kind == "code":
            code = str(payload).strip("\n")
            if code:
                _add_block(current, {"id": new_id(), "type": "code", "language": "text", "code": code})
        elif kind == "table":
            headers, rows = payload
            if headers:
                _add_block(
                    current,
                    {
                        "id": new_id(),
                        "type": "table",
                        "caption": "",
                        "headers": headers[:8],
                        "rows": rows[:30],
                    },
                )
        elif kind == "image":
            src, alt = payload
            block, stored = _image_from_src(src, alt)
            if stored:
                images[stored[0]] = stored[1]
            if block:
                _add_block(current, block)

    if _slide_has_blocks(current):
        slides.append(current)
    if not slides:
        return ImportResult(title="Notes", slides=[], images=images)
    return ImportResult(title=str(slides[0]["title"]), slides=slides[:MAX_SLIDES], images=images)


class _NotesHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.events: list[tuple] = []
        self._skip = 0
        self._capture: str | None = None
        self._buf: list[str] = []
        self._table: list[list[str]] | None = None
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr = {key.lower(): value or "" for key, value in attrs}
        if tag in {"script", "style"}:
            self._skip += 1
            return
        if self._skip:
            return
        if tag in {"h1", "h2", "h3", "h4"}:
            self._flush_capture()
            self._capture = "heading"
            self._buf = []
        elif tag == "li":
            self._flush_capture()
            self._capture = "bullet"
            self._buf = []
        elif tag == "p":
            self._flush_capture()
            self._capture = "paragraph"
            self._buf = []
        elif tag == "pre":
            self._flush_capture()
            self._capture = "code"
            self._buf = []
        elif tag == "br":
            self._buf.append("\n")
        elif tag == "table":
            self._flush_capture()
            self._table = []
        elif tag == "tr" and self._table is not None:
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []
        elif tag == "img":
            self.events.append(("image", (attr.get("src", ""), attr.get("alt", ""))))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style"} and self._skip:
            self._skip -= 1
            return
        if self._skip:
            return
        if tag in {"h1", "h2", "h3", "h4", "li", "p", "pre"}:
            self._flush_capture()
        elif tag in {"td", "th"} and self._cell is not None and self._row is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None and self._table is not None:
            if any(cell.strip() for cell in self._row):
                self._table.append(self._row)
            self._row = None
        elif tag == "table" and self._table is not None:
            rows = self._table
            self._table = None
            if rows:
                headers = rows[0]
                body = rows[1:] or [[""] * len(headers)]
                width = len(headers)
                self.events.append(("table", (headers, [row[:width] + [""] * max(0, width - len(row)) for row in body])))

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._cell is not None:
            self._cell.append(data)
            return
        if self._capture:
            self._buf.append(data)

    def close(self) -> None:
        self._flush_capture()
        super().close()

    def _flush_capture(self) -> None:
        if not self._capture:
            return
        text = "".join(self._buf).strip()
        kind = self._capture
        self._capture = None
        self._buf = []
        if text:
            self.events.append((kind, text))


def _image_from_src(src: str, alt: str) -> tuple[dict | None, tuple[str, bytes] | None]:
    source = (src or "").strip()
    if not source:
        return None, None
    lowered = source.lower()
    if lowered.startswith("data:image/") and ";base64," in lowered:
        _header, encoded = source.split(",", 1)
        try:
            data = base64.b64decode(encoded, validate=False)
        except ValueError:
            return None, None
        if not data:
            return None, None
        key = new_id()
        return (
            {"id": new_id(), "type": "image", "url": "", "alt": alt or "Imported figure", "importKey": key},
            (key, data),
        )
    if lowered.startswith(("http://", "https://", "/")):
        return (
            {"id": new_id(), "type": "image", "url": source, "alt": alt or "Imported figure"},
            None,
        )
    return None, None


def _slide(title: str) -> dict:
    return {
        "id": new_id(),
        "title": (title or "Slide").strip()[:180] or "Slide",
        "layout": "text",
        "revealMode": "block",
        "titleImmediate": True,
        "blocks": [],
    }


def _text_block(text: str) -> dict:
    return {"id": new_id(), "type": "text", "variant": "paragraph", "text": text.strip(), "items": []}


def _add_block(slide: dict, block: dict) -> None:
    blocks = slide["blocks"]
    if len(blocks) >= MAX_BLOCKS:
        return
    if not blocks:
        block = {**block, "appear": "immediate"}
    else:
        block = {**block, "appear": "click"}
    blocks.append(block)


def _slide_has_blocks(slide: dict) -> bool:
    return bool(slide.get("blocks"))


def _is_table_line(line: str) -> bool:
    stripped = line.strip()
    return stripped.startswith("|") and stripped.endswith("|") and stripped.count("|") >= 2


def _is_heading_line(line: str) -> bool:
    if len(line) > 80 or line.endswith((".", ":", ";")):
        return False
    if HEADING_PREFIX.match(line):
        return True
    letters = [char for char in line if char.isalpha()]
    if len(letters) < 4 or " " not in line:
        return False
    return all(char.isupper() for char in letters)


def _table_from_markdown(lines: list[str]) -> dict | None:
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if cells and all(re.fullmatch(r":?-{3,}:?", cell or "-") for cell in cells):
            continue
        rows.append(cells)
    if not rows:
        return None
    width = max(len(row) for row in rows)
    headers = rows[0] + [""] * (width - len(rows[0]))
    body = [row + [""] * (width - len(row)) for row in rows[1:]] or [[""] * width]
    return {"id": new_id(), "type": "table", "caption": "", "headers": headers[:8], "rows": body[:30]}
