import base64
import io
import unittest
from pathlib import Path
import tempfile
import uuid
from unittest.mock import patch

from docx import Document
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches

from app.authoring_service import materialise_images, parse_upload
from app.cms import clean_slides
from app.importers.notes import parse_notes
from app.importers.questions import rows_from_csv, rows_from_xlsx, rows_to_questions, split_past_paper
from app.quality import quality_warnings

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def pdf_with_lines(lines: list[str]) -> bytes:
    commands = ["BT /F1 12 Tf 72 740 Td"]
    for index, line in enumerate(lines):
        if index:
            commands.append("0 -18 Td")
        safe = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        commands.append(f"({safe}) Tj")
    commands.append("ET")
    stream = " ".join(commands).encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(output))
        output += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(output)
    output += f"xref\n0 {len(objects) + 1}\n".encode()
    output += b"0000000000 65535 f \n"
    for offset in offsets:
        output += f"{offset:010d} 00000 n \n".encode()
    output += f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return bytes(output)


class NotesImportTests(unittest.TestCase):
    def test_headings_become_slides_and_bullets_become_reveal_items(self) -> None:
        parsed = parse_notes(
            """
# Normalisation
Remove repeating groups.

- First normal form
- Second normal form

## Keys
A primary key identifies a row.

```sql
SELECT id FROM students;
```

| Form | Rule |
| --- | --- |
| 1NF | Atomic values |

![Diagram](https://example.com/keys.png)
            """
        )
        self.assertEqual(parsed.title, "Normalisation")
        self.assertGreaterEqual(len(parsed.slides), 2)
        first = parsed.slides[0]
        self.assertEqual(first["title"], "Normalisation")
        bullets = [block for block in first["blocks"] if block["type"] == "text" and "normal form" in block["text"]]
        self.assertEqual(len(bullets), 2)
        self.assertEqual(bullets[0]["appear"], "click")
        second = parsed.slides[1]
        self.assertEqual(second["title"], "Keys")
        kinds = [block["type"] for block in second["blocks"]]
        self.assertIn("code", kinds)
        self.assertIn("table", kinds)
        self.assertIn("image", kinds)
        image = next(block for block in second["blocks"] if block["type"] == "image")
        self.assertEqual(image["url"], "https://example.com/keys.png")
        cleaned = clean_slides(parsed.slides)
        self.assertEqual(cleaned[0]["title"], "Normalisation")
        self.assertTrue(any(block["type"] == "image" for block in cleaned[1]["blocks"]))

    def test_html_paste_keeps_structure(self) -> None:
        html = """
        <h2>Transactions</h2>
        <ul><li>Atomicity</li><li>Consistency</li></ul>
        <table><tr><th>State</th><th>Meaning</th></tr><tr><td>Commit</td><td>Saved</td></tr></table>
        <pre>BEGIN;</pre>
        <img src="https://example.com/tx.png" alt="States">
        """
        parsed = parse_notes(html)
        self.assertEqual(parsed.slides[0]["title"], "Transactions")
        kinds = [block["type"] for block in parsed.slides[0]["blocks"]]
        self.assertEqual(kinds.count("text"), 2)
        self.assertIn("table", kinds)
        self.assertIn("code", kinds)
        self.assertIn("image", kinds)

    def test_pptx_docx_and_pdf(self) -> None:
        presentation = Presentation()
        slide = presentation.slides.add_slide(presentation.slide_layouts[1])
        slide.shapes.title.text = "Normalisation"
        frame = slide.placeholders[1].text_frame
        frame.text = "Remove repeating groups"
        frame.add_paragraph().text = "Each field holds one value"
        table = slide.shapes.add_table(2, 2, Inches(0.5), Inches(3), Inches(4), Inches(1)).table
        table.cell(0, 0).text = "Form"
        table.cell(0, 1).text = "Rule"
        table.cell(1, 0).text = "1NF"
        table.cell(1, 1).text = "Atomic"
        slide.shapes.add_picture(io.BytesIO(PNG), Inches(5), Inches(1), Inches(1), Inches(1))
        pptx_buffer = io.BytesIO()
        presentation.save(pptx_buffer)
        pptx = parse_upload("lecture.pptx", pptx_buffer.getvalue(), "")
        self.assertEqual(pptx.slides[0]["title"], "Normalisation")
        pptx_kinds = [block["type"] for block in pptx.slides[0]["blocks"]]
        self.assertIn("text", pptx_kinds)
        self.assertIn("table", pptx_kinds)
        self.assertIn("image", pptx_kinds)
        self.assertTrue(pptx.images)

        document = Document()
        document.add_heading("Transactions", level=1)
        document.add_paragraph("A transaction is a unit of work.")
        document.add_paragraph("Atomicity", style="List Bullet")
        document.add_paragraph("SELECT * FROM accounts;")
        grid = document.add_table(rows=2, cols=2)
        grid.cell(0, 0).text = "State"
        grid.cell(0, 1).text = "Meaning"
        grid.cell(1, 0).text = "Commit"
        grid.cell(1, 1).text = "Saved"
        document.add_picture(io.BytesIO(PNG), width=Inches(1))
        docx_buffer = io.BytesIO()
        document.save(docx_buffer)
        word = parse_upload("notes.docx", docx_buffer.getvalue(), "")
        self.assertEqual(word.slides[0]["title"], "Transactions")
        word_kinds = [block["type"] for block in word.slides[0]["blocks"]]
        self.assertIn("text", word_kinds)
        self.assertIn("code", word_kinds)
        self.assertIn("table", word_kinds)
        self.assertIn("image", word_kinds)

        pdf = parse_upload(
            "slides.pdf",
            pdf_with_lines(["Question 1", "What is a primary key?", "A. A unique identifier", "B. A duplicate row", "C. A null value"]),
            "",
        )
        text = " ".join(block.get("text", "") for block in pdf.slides[0]["blocks"])
        self.assertIn("primary key", text)

    def test_imported_image_is_stored_for_the_lesson(self) -> None:
        parsed = parse_notes('<h2>Figure</h2><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" alt="Dot">')
        lesson_id = uuid.uuid4()
        with tempfile.TemporaryDirectory() as folder:
            with patch("app.media.media_root", return_value=Path(folder)):
                slides = materialise_images(lesson_id, parsed.slides, parsed.images)
        image = next(block for block in slides[0]["blocks"] if block["type"] == "image")
        self.assertTrue(image["url"].startswith(f"/api/media/{lesson_id}/"))
        self.assertNotIn("importKey", image)
        cleaned = clean_slides(slides)
        self.assertEqual(cleaned[0]["blocks"][0]["type"], "image")


class QuestionImportTests(unittest.TestCase):
    def test_csv_and_xlsx_ignore_a_published_status(self) -> None:
        csv_data = (
            "prompt,kind,option_a,option_b,option_c,correct,topic,status\n"
            "Which key is unique?,mcq,Primary,Foreign,Composite,A,Keys,PUBLISHED\n"
            "A ____ identifies a row.,blank,,,,,answer text,Keys,PUBLISHED\n"
        ).encode()
        drafts = rows_to_questions(rows_from_csv(csv_data))
        self.assertEqual(len(drafts), 2)
        self.assertTrue(all(item.status == "DRAFT" for item in drafts))
        self.assertEqual(drafts[0].correct_index, 0)
        self.assertEqual(drafts[0].topic, "Keys")
        self.assertEqual(drafts[1].kind, "blank")
        book = Workbook()
        sheet = book.active
        sheet.append(["prompt", "kind", "status"])
        sheet.append(["Explain a transaction.", "short", "PUBLISHED"])
        buffer = io.BytesIO()
        book.save(buffer)
        excel = rows_to_questions(rows_from_xlsx(buffer.getvalue()))
        self.assertEqual(excel[0].status, "DRAFT")
        self.assertEqual(excel[0].kind, "short")

    def test_past_paper_split_leaves_the_answer_blank(self) -> None:
        text = pdf_text = """
QUESTION 1
What is a primary key?
A. A unique identifier
B. A duplicate row
C. A null value

QUESTION 2
Explain atomicity in a transaction.
"""
        drafts = split_past_paper(pdf_text)
        self.assertEqual(len(drafts), 2)
        self.assertEqual(drafts[0].kind, "mcq")
        self.assertIsNone(drafts[0].correct_index)
        self.assertEqual(drafts[0].status, "DRAFT")
        self.assertEqual(drafts[0].source, "past_paper")
        self.assertIn("atomicity", drafts[1].prompt.lower())
        self.assertEqual(drafts[1].kind, "short")
        parsed = parse_upload("paper.pdf", pdf_with_lines(["QUESTION 1", "Define a candidate key."]), "")
        joined = " ".join(block.get("text", "") for slide in parsed.slides for block in slide["blocks"] if block["type"] == "text")
        self.assertIn("candidate key", joined)
        self.assertIn("QUESTION", text)


class QualityTests(unittest.TestCase):
    def test_empty_slides_missing_answers_and_broken_images(self) -> None:
        warnings = quality_warnings(
            [
                {"id": "s1", "title": "Empty", "blocks": []},
                {
                    "id": "s2",
                    "title": "Quiz",
                    "blocks": [
                        {"id": "q", "type": "quiz", "kind": "mcq", "prompt": "Which is a key?", "options": [{"id": "a", "label": "Primary"}], "correctId": ""},
                        {"id": "b", "type": "quiz", "kind": "blank", "prompt": "A ____ is unique.", "answer": ""},
                        {"id": "img", "type": "image", "url": ""},
                        {"id": "gone", "type": "image", "url": "/api/media/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222.png"},
                    ],
                },
            ]
        )
        codes = {item["code"] for item in warnings}
        self.assertIn("empty_slide", codes)
        self.assertIn("missing_answer", codes)
        self.assertIn("broken_image", codes)
        self.assertGreaterEqual(sum(item["code"] == "missing_answer" for item in warnings), 2)


if __name__ == "__main__":
    unittest.main()
