import unittest

from fastapi import HTTPException

from app.cms import clean_block, clean_slides, slides_plain_text


class CleanSlidesTests(unittest.TestCase):
    def test_block_reveal_fields_and_video(self) -> None:
        slides = clean_slides(
            [
                {
                    "title": "Introduction to Systems Analysis",
                    "layout": "text",
                    "revealMode": "block",
                    "blocks": [
                        {
                            "type": "text",
                            "variant": "paragraph",
                            "text": "Systems analysis helps us understand the real problem.",
                            "appear": "immediate",
                            "animation": "fade",
                        },
                        {
                            "type": "text",
                            "variant": "paragraph",
                            "text": "It involves studying the current system, its users, and their needs.",
                            "appear": "click",
                            "animation": "up",
                        },
                        {
                            "type": "image",
                            "url": "https://example.com/diagram.png",
                            "alt": "Users, processes, data, and outputs",
                            "caption": "Context diagram",
                            "align": "center",
                            "widthPercent": 80,
                        },
                        {
                            "type": "video",
                            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                            "title": "Walkthrough",
                        },
                    ],
                    "resources": [{"title": "Reading", "url": "https://example.com/notes.pdf", "kind": "file"}],
                }
            ]
        )
        self.assertEqual(len(slides), 1)
        slide = slides[0]
        self.assertEqual(slide["revealMode"], "block")
        self.assertTrue(slide["titleImmediate"])
        self.assertEqual(len(slide["blocks"]), 4)
        self.assertEqual(slide["blocks"][0]["appear"], "immediate")
        self.assertEqual(slide["blocks"][1]["animation"], "up")
        self.assertEqual(slide["blocks"][2]["widthPercent"], 80)
        self.assertEqual(slide["blocks"][3]["type"], "video")
        self.assertEqual(slide["resources"][0]["kind"], "file")
        self.assertIn("Systems analysis", slides_plain_text(slides))

    def test_draft_blocks_may_be_empty(self) -> None:
        block = clean_block({"type": "text", "variant": "paragraph", "text": ""})
        self.assertEqual(block["text"], "")
        image = clean_block({"type": "image", "url": ""})
        self.assertEqual(image["url"], "")

    def test_rejects_javascript_urls(self) -> None:
        with self.assertRaises(HTTPException):
            clean_block({"type": "image", "url": "javascript:alert(1)"})

    def test_sentence_mode_is_opt_in(self) -> None:
        slides = clean_slides([{"title": "One", "blocks": [{"type": "text", "text": "Hello there."}]}])
        self.assertEqual(slides[0]["revealMode"], "block")
        slides = clean_slides(
            [{"title": "One", "revealMode": "sentence", "blocks": [{"type": "text", "text": "Hello there."}]}]
        )
        self.assertEqual(slides[0]["revealMode"], "sentence")


if __name__ == "__main__":
    unittest.main()
