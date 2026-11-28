import unittest

from app.seed.it211.slides import lesson_slides
from app.seed.it211.validate import ContentError, validate_course


class It211ContentTests(unittest.TestCase):
    def test_course_shape_is_complete(self) -> None:
        counts = validate_course()
        self.assertEqual(counts["chapters"], 8)
        self.assertEqual(counts["lessons"], 62)
        self.assertEqual(counts["quizzes"], 10)
        self.assertGreaterEqual(counts["questions"], 82)

    def test_a_lesson_becomes_publishable_slides_with_plain_text(self) -> None:
        from app.cms import slides_plain_text
        from app.seed.it211.validate import load_course

        chapters, _assessments = load_course()
        lesson = chapters[3]["lessons"][2]
        slides = lesson_slides(4, 3, lesson)
        self.assertGreaterEqual(len(slides), 8)
        kinds = {block["type"] for slide in slides for block in slide["blocks"]}
        self.assertIn("check", kinds)
        self.assertIn("quiz", kinds)
        self.assertIn("table", kinds)
        text = slides_plain_text(slides)
        self.assertIn(lesson["title"] and lesson["objectives"][0][:24], text)
        self.assertNotIn("TODO", text)


class ValidatorGuardTests(unittest.TestCase):
    def test_placeholder_text_is_rejected(self) -> None:
        with self.assertRaises(ContentError):
            validate_course(
                [
                    {
                        "title": "Chapter",
                        "description": "Real",
                        "position": 1,
                        "lessons": [
                            {
                                "title": "Lesson",
                                "description": "TODO fill this later",
                                "durationMinutes": 10,
                                "objectives": ["a", "b", "c"],
                                "introduction": ["x" * 80, "y" * 80],
                                "explanation": ["a" * 40, "b" * 40, "c" * 40],
                                "definitions": [{"term": "t", "meaning": "m"}] * 3,
                                "exampleTitle": "Example",
                                "example": ["worked"],
                                "takeaways": ["1", "2", "3"],
                                "revision": ["1", "2", "3"],
                                "summary": "s" * 80,
                                "checks": [],
                            }
                        ],
                    }
                ],
                {"quizzes": []},
            )


if __name__ == "__main__":
    unittest.main()
