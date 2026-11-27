import json
import unittest
import uuid
from unittest.mock import patch
from urllib.error import URLError

from fastapi import HTTPException

from app.access import AccessScope
from app.ai.drafts import draft_action
from app.ai.provider import AIProvider, Completion, OpenAICompatibleProvider
from app.authoring_access import ensure_client_cannot_publish, ensure_editor_scope, force_draft
from app.models.enums import UserStatus
from app.models.identity import User


def scope_for(module_ids: set[uuid.UUID], *, publish: bool = False, super_admin: bool = False) -> AccessScope:
    user = User(id=uuid.uuid4(), name="Editor", email=f"{uuid.uuid4()}@examsprep.local", status=UserStatus.ACTIVE)
    return AccessScope(
        user=user,
        roles=["super_administrator"] if super_admin else ["creator"],
        super_admin=super_admin,
        module_ids=None if super_admin else module_ids,
        can_publish=publish or super_admin,
    )


class PermissionTests(unittest.TestCase):
    def test_creator_cannot_leave_scope_or_publish(self) -> None:
        allowed = uuid.uuid4()
        other = uuid.uuid4()
        scope = scope_for({allowed})
        ensure_editor_scope(scope, allowed, allowed)
        with self.assertRaises(HTTPException) as denied:
            ensure_editor_scope(scope, allowed, other)
        self.assertEqual(denied.exception.status_code, 403)
        with self.assertRaises(HTTPException) as publish:
            scope.require_module(allowed, publish=True)
        self.assertEqual(publish.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            ensure_client_cannot_publish("PUBLISHED")
        self.assertEqual(force_draft("PUBLISHED"), "DRAFT")

    def test_super_admin_can_copy_between_modules(self) -> None:
        scope = scope_for(set(), super_admin=True)
        ensure_editor_scope(scope, uuid.uuid4(), uuid.uuid4())
        ensure_client_cannot_publish("DRAFT")


class DraftTests(unittest.TestCase):
    def test_missing_key_stays_a_local_draft(self) -> None:
        from app.ai.provider import HeuristicProvider

        with patch("app.ai.drafts.select_provider", return_value=HeuristicProvider()):
            bundle = draft_action("quiz", "Normalisation removes repeating groups. A primary key identifies one row.")
        self.assertEqual(bundle.status, "DRAFT")
        self.assertTrue(bundle.slides)
        self.assertEqual(bundle.provider, "heuristic")

    def test_model_cannot_mark_a_draft_published(self) -> None:
        class Fake(AIProvider):
            def complete(self, system: str, user: str) -> Completion:
                return Completion(
                    text=json.dumps(
                        {
                            "status": "PUBLISHED",
                            "title": "Keys",
                            "slides": [
                                {
                                    "title": "Check",
                                    "blocks": [
                                        {
                                            "type": "quiz",
                                            "kind": "mcq",
                                            "prompt": "Which key is unique?",
                                            "options": [{"label": "Primary"}, {"label": "Duplicate"}],
                                            "correctLabel": "Primary",
                                        }
                                    ],
                                }
                            ],
                            "questions": [{"prompt": "Explain a primary key.", "kind": "short", "status": "PUBLISHED", "modelAnswer": "It identifies a row."}],
                        }
                    ),
                    provider="openai",
                    degraded=False,
                )

        bundle = draft_action("quiz", "A primary key identifies one row in a table.", provider=Fake())
        self.assertEqual(bundle.status, "DRAFT")
        self.assertEqual(bundle.provider, "openai")
        self.assertEqual(bundle.questions[0]["status"], "DRAFT")
        self.assertNotEqual(bundle.slides[0].get("status"), "PUBLISHED")

    def test_bad_model_output_degrades_to_a_draft(self) -> None:
        class Broken(AIProvider):
            def complete(self, system: str, user: str) -> Completion:
                return Completion(text="sorry, no json", provider="openai", degraded=False)

        bundle = draft_action(
            "mock",
            "Atomicity means a transaction is all or nothing. Consistency keeps the database valid.",
            ["QUESTION 1 Explain atomicity."],
            provider=Broken(),
        )
        self.assertEqual(bundle.status, "DRAFT")
        self.assertTrue(bundle.degraded)
        self.assertIn("QUESTION 1", json.dumps(bundle.slides))
        self.assertTrue(bundle.questions)

    def test_provider_error_does_not_raise(self) -> None:
        provider = OpenAICompatibleProvider("test-key", "https://example.invalid/v1", "gpt-4o-mini")

        def explode(*_args, **_kwargs):
            raise URLError("offline")

        with patch("app.ai.provider.urllib.request.urlopen", explode):
            completion = provider.complete("system", "user")
        self.assertTrue(completion.degraded)
        self.assertEqual(completion.provider, "heuristic")


if __name__ == "__main__":
    unittest.main()
