"""Read .pptx, .docx, and .pdf lecture files into the same slide shape as pasted notes."""

from __future__ import annotations

import re
from io import BytesIO

from app.cms import new_id
from app.importers.notes import ImportError, ImportResult, _add_block, _slide, _text_block, slides_from_text


def parse_pptx(data: bytes) -> ImportResult:
    try:
        from pptx import Presentation
        from pptx.enum.shapes import MSO_SHAPE_TYPE
    except ImportError as error:  # pragma: no cover - dependency is installed with the API
        raise ImportError("PowerPoint import is not available on this server.") from error
    try:
        presentation = Presentation(BytesIO(data))
    except Exception as error:
        raise ImportError("That PowerPoint file could not be read. Save it as .pptx and try again.") from error
    slides: list[dict] = []
    images: dict[str, bytes] = {}
    for index, source in enumerate(presentation.slides, start=1):
        title_shape = source.shapes.title
        title_id = getattr(title_shape, "shape_id", None)
        title = ""
        if title_shape is not None:
            title = (title_shape.text or "").strip()
        slide = _slide(title or f"Slide {index}")
        _walk_shapes(source.shapes, slide, images, skip_id=title_id, group_type=MSO_SHAPE_TYPE.GROUP, picture_type=MSO_SHAPE_TYPE.PICTURE)
        if not slide["blocks"] and title:
            _add_block(slide, _text_block(title))
        slides.append(slide)
    if not slides:
        raise ImportError("That PowerPoint file has no slides.")
    return ImportResult(title=str(slides[0]["title"]), slides=slides, images=images)


def _walk_shapes(shapes, slide: dict, images: dict[str, bytes], *, skip_id: int | None, group_type, picture_type) -> None:
    for shape in shapes:
        shape_type = getattr(shape, "shape_type", None)
        if shape_type == group_type and hasattr(shape, "shapes"):
            _walk_shapes(shape.shapes, slide, images, skip_id=skip_id, group_type=group_type, picture_type=picture_type)
            continue
        if skip_id is not None and getattr(shape, "shape_id", None) == skip_id:
            continue
        if getattr(shape, "has_table", False):
            table = shape.table
            raw_rows = [[(cell.text or "").strip() for cell in row.cells] for row in table.rows]
            if raw_rows:
                headers = raw_rows[0] or ["Column 1"]
                body = raw_rows[1:] or [[""] * len(headers)]
                _add_block(
                    slide,
                    {"id": new_id(), "type": "table", "caption": "", "headers": headers[:8], "rows": body[:30]},
                )
            continue
        if shape_type == picture_type:
            try:
                blob = shape.image.blob
            except Exception:
                blob = b""
            if blob:
                key = new_id()
                images[key] = blob
                _add_block(
                    slide,
                    {
                        "id": new_id(),
                        "type": "image",
                        "url": "",
                        "alt": (getattr(shape, "name", "") or "Slide image").strip() or "Slide image",
                        "importKey": key,
                    },
                )
            continue
        if not getattr(shape, "has_text_frame", False):
            continue
        for paragraph in shape.text_frame.paragraphs:
            text = (paragraph.text or "").strip()
            if not text:
                continue
            if _looks_like_code(text):
                _add_block(slide, {"id": new_id(), "type": "code", "language": "text", "code": text})
            else:
                _add_block(slide, _text_block(text))


def parse_docx(data: bytes) -> ImportResult:
    try:
        from docx import Document
        from docx.oxml.ns import qn
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except ImportError as error:  # pragma: no cover
        raise ImportError("Word import is not available on this server.") from error
    try:
        document = Document(BytesIO(data))
    except Exception as error:
        raise ImportError("That Word file could not be read. Save it as .docx and try again.") from error
    slides: list[dict] = []
    images: dict[str, bytes] = {}
    current = _slide("Notes")

    def start(title: str) -> None:
        nonlocal current
        if current["blocks"]:
            slides.append(current)
        current = _slide(title)

    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            paragraph = Paragraph(child, document)
            style = paragraph.style.name if paragraph.style is not None else ""
            text = (paragraph.text or "").strip()
            for blob in _paragraph_images(paragraph):
                key = new_id()
                images[key] = blob
                _add_block(
                    current,
                    {"id": new_id(), "type": "image", "url": "", "alt": "Imported figure", "importKey": key},
                )
            if not text:
                continue
            if style.startswith("Heading"):
                start(text)
                continue
            if _looks_like_code(text) or "Code" in style or style == "HTML Preformatted":
                _add_block(current, {"id": new_id(), "type": "code", "language": "text", "code": text})
                continue
            _add_block(current, _text_block(text))
        elif child.tag == qn("w:tbl"):
            table = Table(child, document)
            raw_rows = [[(cell.text or "").strip() for cell in row.cells] for row in table.rows]
            if not raw_rows:
                continue
            headers = raw_rows[0] or ["Column 1"]
            body = raw_rows[1:] or [[""] * len(headers)]
            _add_block(current, {"id": new_id(), "type": "table", "caption": "", "headers": headers[:8], "rows": body[:30]})
    if current["blocks"]:
        slides.append(current)
    if not slides:
        raise ImportError("That Word file did not contain any text.")
    return ImportResult(title=str(slides[0]["title"]), slides=slides, images=images)


def parse_pdf(data: bytes) -> ImportResult:
    pages = _pdf_pages(data)
    slides: list[dict] = []
    images: dict[str, bytes] = {}
    for index, text, page_images in pages:
        parsed = slides_from_text(text, fallback_title=f"Page {index}") if text.strip() else ImportResult(title=f"Page {index}", slides=[])
        page_slides = parsed.slides or [_slide(f"Page {index}")]
        if page_images and page_slides:
            for key in page_images:
                _add_block(
                    page_slides[0],
                    {"id": new_id(), "type": "image", "url": "", "alt": f"Page {index} figure", "importKey": key},
                )
                images[key] = page_images[key]
        slides.extend(page_slides)
    if not any(slide.get("blocks") for slide in slides):
        raise ImportError("That PDF did not contain readable text or images.")
    return ImportResult(title=str(slides[0]["title"]), slides=slides, images=images)


def pdf_plain_text(data: bytes) -> str:
    pages = _pdf_pages(data)
    chunks = [text.strip() for _index, text, _images in pages if text.strip()]
    if not chunks:
        raise ImportError("That PDF did not contain readable text.")
    return "\n\n".join(chunks)


def _pdf_pages(data: bytes) -> list[tuple[int, str, dict[str, bytes]]]:
    try:
        from pypdf import PdfReader
    except ImportError as error:  # pragma: no cover
        raise ImportError("PDF import is not available on this server.") from error
    try:
        reader = PdfReader(BytesIO(data))
    except Exception as error:
        raise ImportError("That PDF could not be read.") from error
    if getattr(reader, "is_encrypted", False):
        raise ImportError("This PDF is password protected. Export an unlocked copy and try again.")
    pages: list[tuple[int, str, dict[str, bytes]]] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        images: dict[str, bytes] = {}
        for image in getattr(page, "images", []) or []:
            blob = getattr(image, "data", b"") or b""
            if not blob:
                continue
            images[new_id()] = blob
        pages.append((index, text, images))
    return pages


def _paragraph_images(paragraph) -> list[bytes]:
    blobs: list[bytes] = []
    namespace = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    try:
        blips = paragraph._element.xpath(".//*[local-name()='blip']")
    except Exception:
        return blobs
    for blip in blips:
        embed = blip.get(f"{namespace}embed")
        if not embed:
            continue
        part = paragraph.part.related_parts.get(embed)
        blob = getattr(part, "blob", b"") if part is not None else b""
        if blob:
            blobs.append(blob)
    return blobs


def _looks_like_code(text: str) -> bool:
    sample = text.strip()
    return sample.startswith("```") or bool(
        re.match(r"^(SELECT|INSERT|UPDATE|DELETE|CREATE|def |class |import |#include)\b", sample)
    )
