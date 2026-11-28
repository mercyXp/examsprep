"""Mocked checks for research, speech, snap, practice, and the revision plan.

These tests do not call Firecrawl, ElevenLabs, or an AI provider.
The optional live script is api/scripts/live_providers.py.
"""

import json
import unittest
import uuid
from datetime import date

from fastapi import HTTPException

from app.ai.provider import HeuristicProvider
from app.assist.elevenlabs import clip_speech, content_hash
from app.assist.http import _message_from
from app.assist.messages import not_configured
from app.assist.outline import (
    choose_mode,
    parse_proposal,
    question_drafts,
    slides_from_pages,
    slides_from_proposal,
)
from app.assist.planner import ExamFact, LessonFact, PlanInput, QuizFact, TopicFact, build_plan
from app.assist.practice import normalise_answer, short_matches
from app.assist.rate_limit import SlidingLimiter
from app.assist.robots import decide_robots
from app.assist.urls import UrlRejected, canonical_url, fingerprint
from app.cms import clean_slides
from app.main import app


class UrlAndRobotTests(unittest.TestCase):
    def test_public_urls_and_private_hosts(self) -> None:
        self.assertEqual(canonical_url("https://Example.com/docs/"), "https://example.com/docs")
        for blocked in ("http://localhost/a", "http://127.0.0.1/a", "http://10.1.2.3/a", "file:///etc/passwd", "https://user:pass@example.com/a"):
            with self.assertRaises(UrlRejected):
                canonical_url(blocked)

    def test_fingerprint_ignores_order(self) -> None:
        first = fingerprint(["https://b.example/a", "https://a.example/b"])
        second = fingerprint(["https://a.example/b", "https://b.example/a"])
        self.assertEqual(first, second)

    def test_robots_block_and_missing_file(self) -> None:
        body = "User-agent: *\nDisallow: /private\n"
        blocked = decide_robots("https://example.com/private", 200, body)
        self.assertFalse(blocked.allowed)
        self.assertIn("robots.txt", blocked.message)
        allowed = decide_robots("https://example.com/notes", 200, body)
        self.assertTrue(allowed.allowed)
        missing = decide_robots("https://example.com/notes", 404, "")
        self.assertTrue(missing.allowed)

    def test_provider_error_flags_robots_and_credits(self) -> None:
        robots = _message_from(b'{"error":"blocked by robots.txt"}', 403)
        self.assertTrue(robots.blocked)
        credits = _message_from(b'{"error":"insufficient credits"}', 402)
        self.assertTrue(credits.payment)


class ResearchDraftTests(unittest.TestCase):
    def test_site_crawls_and_many_urls_scrape(self) -> None:
        self.assertEqual(choose_mode("site", 1, "auto"), "crawl")
        self.assertEqual(choose_mode("syllabus", 1, "auto"), "crawl")
        self.assertEqual(choose_mode("article", 3, "crawl"), "scrape")

    def test_slides_stay_draft_material_with_the_source(self) -> None:
        pages = slides_from_pages(
            [{"url": "https://example.com/it211", "title": "Normalisation", "markdown": "# Keys\n\nA key identifies a row."}]
        )
        cleaned = clean_slides(pages[0][2])
        text = json.dumps(cleaned)
        self.assertIn("https://example.com/it211", text)
        self.assertNotIn("PUBLISHED", text)
        proposal = parse_proposal(
            json.dumps(
                {
                    "chapters": [{"title": "Databases", "summary": "Tables"}],
                    "lessons": [
                        {
                            "title": "Keys",
                            "chapter": "Databases",
                            "objectives": ["State a key"],
                            "body": "A primary key identifies a row.",
                            "definitions": [{"term": "Key", "meaning": "An identifier"}],
                            "examples": ["student_id"],
                        }
                    ],
                    "questions": [
                        {
                            "prompt": "Which field identifies a row?",
                            "kind": "mcq",
                            "choices": ["A name", "A primary key"],
                            "correctLabel": "A primary key",
                            "explanation": "It is unique.",
                            "topic": "Keys",
                        }
                    ],
                }
            )
        )
        self.assertIsNotNone(proposal)
        slides = clean_slides(slides_from_proposal(proposal["lessons"][0], ["https://example.com/it211"]))
        self.assertIn("Source:", json.dumps(slides))
        drafts = question_drafts(proposal["questions"], ["https://example.com/it211"])
        self.assertEqual(drafts[0].source, "research")
        self.assertEqual(drafts[0].status, "DRAFT")
        self.assertEqual(drafts[0].correct_index, 1)
        skipped = question_drafts([{"prompt": "No key here?", "kind": "mcq", "choices": ["A", "B"]}], [])
        self.assertEqual(skipped, [])

    def test_missing_key_message_does_not_invent_content(self) -> None:
        error = not_configured("Research Assistant", "FIRECRAWL_API_KEY")
        self.assertEqual(error.status_code, 503)
        self.assertIn("No result was generated", error.detail)
        self.assertIn("FIRECRAWL_API_KEY", error.detail)
        self.assertTrue(HeuristicProvider().complete_vision("sys", "user", [("image/png", b"x")]).degraded)


class SpeechAndPracticeTests(unittest.TestCase):
    def test_cache_key_changes_when_the_lesson_changes(self) -> None:
        spoken, truncated = clip_speech("alpha beta " * 80, limit=220)
        self.assertTrue(truncated)
        self.assertLessEqual(len(spoken), 220)
        self.assertNotEqual(content_hash("One", "voice", "model"), content_hash("Two", "voice", "model"))

    def test_short_answers_use_the_saved_key(self) -> None:
        self.assertTrue(short_matches("Primary Key", ["primary key"], ""))
        self.assertFalse(short_matches("a guess", ["primary key"], "identifier"))
        self.assertEqual(normalise_answer("  Key! "), "key")

    def test_rate_limit(self) -> None:
        limiter = SlidingLimiter()
        limiter.hit("student", limit=2, window=60)
        limiter.hit("student", limit=2, window=60)
        with self.assertRaises(HTTPException) as caught:
            limiter.hit("student", limit=2, window=60)
        self.assertEqual(caught.exception.status_code, 429)


class PlannerTests(unittest.TestCase):
    def test_plan_uses_real_counts_and_skips_readiness(self) -> None:
        lessons = [
            LessonFact("IT211", "Databases", f"Lesson {index}", str(uuid.uuid4()), index < 2) for index in range(8)
        ]
        plan = build_plan(
            PlanInput(
                today=date(2026, 11, 28),
                daily_goal_minutes=50,
                study_days=["sat"],
                lessons=lessons,
                quizzes=[QuizFact("IT211", "Mock", 40, 1)],
                topics=[TopicFact("IT211", "Normalisation", 1, 4)],
                exams=[ExamFact("IT211", "Databases", date(2026, 12, 2), date(2026, 12, 2), "module", True)],
                lessons_touched=3,
                quiz_attempts=1,
                practice_attempts=4,
            )
        )
        blob = json.dumps(plan).lower()
        self.assertNotIn("readiness", blob)
        self.assertNotIn("readinesspercent", blob)
        evidence = " ".join(plan["evidence"])
        self.assertIn("2 of 8", evidence)
        self.assertIn("40%", evidence)
        self.assertIn("1 of 4", evidence)
        self.assertTrue(plan["days"])
        self.assertTrue(plan["days"][0]["blocks"][0]["because"])
        self.assertIn("2026-12-02", json.dumps(plan["days"]))

    def test_empty_activity_does_not_invent_a_plan(self) -> None:
        plan = build_plan(PlanInput(today=date(2026, 11, 28), daily_goal_minutes=60))
        self.assertEqual(plan["days"], [])
        self.assertIn("no lesson progress", plan["message"])


class OpenApiTests(unittest.TestCase):
    def test_assist_routes_are_documented(self) -> None:
        schema = app.openapi()
        paths = schema["paths"]
        for path in (
            "/api/admin/research/jobs",
            "/api/admin/research/jobs/{job_id}/import",
            "/api/learn/lessons/{lesson_id}/audio",
            "/api/learn/audio/quiz",
            "/api/learn/audio/{asset_id}",
            "/api/learn/tutor/sessions/{session_id}/turns",
            "/api/learn/snap",
            "/api/learn/practice/generate",
            "/api/learn/practice/performance",
            "/api/learn/revision-plan",
            "/api/learn/assist/status",
        ):
            self.assertIn(path, paths)
        tags = {tag["name"] for tag in schema.get("tags", [])} | {
            item for path in paths.values() for operation in path.values() if isinstance(operation, dict) for item in operation.get("tags", [])
        }
        for name in ("research", "audio", "tutor", "snap", "practice", "revision"):
            self.assertIn(name, tags)


if __name__ == "__main__":
    unittest.main()
