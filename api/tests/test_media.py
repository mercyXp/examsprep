import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

from app.media import sniff_media, store_upload


class MediaSniffTests(unittest.TestCase):
    def test_jpeg_png_and_pdf(self) -> None:
        self.assertEqual(sniff_media(b"\xff\xd8\xff\xe0").extension, ".jpg")
        self.assertEqual(sniff_media(b"\x89PNG\r\n\x1a\n").extension, ".png")
        self.assertEqual(sniff_media(b"%PDF-1.7").content_type, "application/pdf")

    def test_rejects_html(self) -> None:
        with self.assertRaises(HTTPException):
            sniff_media(b"<html><script>alert(1)</script>")

    def test_store_image_for_lesson(self) -> None:
        lesson_id = uuid.uuid4()
        with tempfile.TemporaryDirectory() as folder:
            with patch("app.media.media_root", return_value=Path(folder)):
                stored = store_upload(lesson_id, b"\x89PNG\r\n\x1a\n", kind="image", original_name="diagram.png")
        self.assertTrue(stored["url"].startswith(f"/api/media/{lesson_id}/"))
        self.assertEqual(stored["kind"], "image")
        with self.assertRaises(HTTPException):
            store_upload(lesson_id, b"\x89PNG\r\n\x1a\n", kind="video", original_name="diagram.png")


if __name__ == "__main__":
    unittest.main()
