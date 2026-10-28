import unittest
import uuid
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from app.google_auth import sign_in_with_google, verified_google_identity
from app.models.enums import UserStatus
from app.models.identity import Role, User, UserRole
from app.security import role_slugs


CLIENT = "client.apps.googleusercontent.com"


def _google_payload(url: str, _token: str, *, bearer: bool) -> dict[str, object]:
    del bearer
    if url.endswith("/tokeninfo"):
        return {"aud": CLIENT, "email": "ada@example.com", "email_verified": "true"}
    return {"email": "ada@example.com", "email_verified": True, "name": "Ada"}


class GoogleAuthTests(unittest.TestCase):
    def test_unverified_email_is_rejected(self) -> None:
        def claims(url: str, _token: str, *, bearer: bool) -> dict[str, object]:
            del bearer
            if url.endswith("/tokeninfo"):
                return {"aud": CLIENT, "email": "ada@example.com", "email_verified": "false"}
            return {"email": "ada@example.com", "email_verified": False, "name": "Ada"}

        with patch("app.google_auth.settings") as settings:
            settings.google_client_id = CLIENT
            with patch("app.google_auth._google_json", side_effect=claims):
                with self.assertRaises(HTTPException) as caught:
                    verified_google_identity("ya29.google-access-token-value")
        self.assertEqual(caught.exception.status_code, 401)

    def test_token_for_another_app_is_rejected(self) -> None:
        def claims(url: str, _token: str, *, bearer: bool) -> dict[str, object]:
            payload = _google_payload(url, _token, bearer=bearer)
            if url.endswith("/tokeninfo"):
                return {**payload, "aud": "other.apps.googleusercontent.com"}
            return payload

        with patch("app.google_auth.settings") as settings:
            settings.google_client_id = CLIENT
            with patch("app.google_auth._google_json", side_effect=claims):
                with self.assertRaises(HTTPException) as caught:
                    verified_google_identity("ya29.google-access-token-value")
        self.assertEqual(caught.exception.status_code, 401)

    def test_missing_client_id_does_not_call_google(self) -> None:
        with patch("app.google_auth.settings") as settings:
            settings.google_client_id = ""
            with patch("app.google_auth._google_json") as fetch:
                with self.assertRaises(HTTPException) as caught:
                    verified_google_identity("ya29.google-access-token-value")
        fetch.assert_not_called()
        self.assertEqual(caught.exception.status_code, 503)

    def test_new_google_account_is_a_student_without_a_password(self) -> None:
        student = Role(slug="student", name="Student", id=uuid.uuid4())
        created: dict[str, User] = {}
        session = MagicMock()
        session.scalar.return_value = student

        def add(obj: object) -> None:
            if isinstance(obj, User):
                obj.id = uuid.uuid4()
                obj.roles = []
                created[obj.email] = obj
            elif isinstance(obj, UserRole):
                obj.role = student
                created["ada@example.com"].roles.append(obj)

        session.add.side_effect = add
        lookups = {"count": 0}

        def load(_session: object, email: str) -> User | None:
            lookups["count"] += 1
            if lookups["count"] == 1:
                return None
            return created[email]

        with patch("app.google_auth.load_user_by_email", side_effect=load):
            with patch("app.google_auth.ensure_profile"):
                user = sign_in_with_google(session, "ada@example.com", "Ada Lovelace")
                again = sign_in_with_google(session, "ada@example.com", "Someone Else")
        self.assertEqual(role_slugs(user), ["student"])
        self.assertIsNone(user.password_hash)
        self.assertEqual(again.id, user.id)
        self.assertEqual(again.name, "Ada Lovelace")
        self.assertEqual(role_slugs(again), ["student"])

    def test_existing_staff_keep_their_role(self) -> None:
        creator = Role(slug="creator", name="Creator", id=uuid.uuid4())
        user = User(name="Casey", email="casey@example.com", password_hash="hashed", status=UserStatus.ACTIVE)
        user.id = uuid.uuid4()
        link = UserRole(user_id=user.id, role_id=creator.id)
        link.role = creator
        user.roles = [link]
        session = MagicMock()
        with patch("app.google_auth.load_user_by_email", return_value=user):
            with patch("app.google_auth.ensure_profile"):
                signed_in = sign_in_with_google(session, "casey@example.com", "Casey")
        self.assertEqual(role_slugs(signed_in), ["creator"])
        session.scalar.assert_not_called()

    def test_suspended_account_cannot_sign_in(self) -> None:
        user = User(name="Ada", email="ada@example.com", status=UserStatus.SUSPENDED)
        with patch("app.google_auth.load_user_by_email", return_value=user):
            with self.assertRaises(HTTPException) as caught:
                sign_in_with_google(MagicMock(), "ada@example.com", "Ada")
        self.assertEqual(caught.exception.status_code, 403)

    def test_provider_errors_do_not_echo_the_credential(self) -> None:
        secret = "google-credential-must-stay-out-of-logs"
        with patch("app.google_auth.settings") as settings:
            settings.google_client_id = "client.apps.googleusercontent.com"
            with patch("app.google_auth._google_json", side_effect=ValueError(secret)):
                with self.assertLogs("app.google_auth", level="WARNING") as captured:
                    with self.assertRaises(HTTPException):
                        verified_google_identity(secret)
        output = "\n".join(captured.output)
        self.assertIn("ValueError", output)
        self.assertNotIn(secret, output)
