import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.models.enums import UserStatus
from app.models.identity import User
from app.models.recovery import PasswordResetToken
from app.password_reset import PasswordResetError, consume_reset, hash_reset_token, request_reset
from app.routers.auth import forgot_password
from app.schemas import ForgotPasswordIn
from app.security import hash_password, verify_password


class PasswordResetTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        User.__table__.create(self.engine)
        PasswordResetToken.__table__.create(self.engine)
        self.session: Session = sessionmaker(bind=self.engine)()
        self.user = User(
            name="Ada",
            email="ada@example.com",
            password_hash=hash_password("old-password"),
            status=UserStatus.ACTIVE,
        )
        self.session.add(self.user)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def _request(self) -> str:
        with patch("app.password_reset.send_password_reset", return_value=True) as send:
            request_reset(self.session, "Ada@Example.com")
            self.session.commit()
        self.assertEqual(send.call_count, 1)
        link = send.call_args.args[1]
        token = parse_qs(urlparse(link).query)["token"][0]
        stored = self.session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.used_at.is_(None))
        )
        assert stored is not None
        self.assertNotEqual(stored.token_hash, token)
        self.assertEqual(stored.token_hash, hash_reset_token(token))
        expires_at = stored.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        self.assertLess(abs(expires_at - datetime.now(timezone.utc) - timedelta(minutes=15)), timedelta(seconds=30))
        self.assertNotIn(token, stored.token_hash)
        return token

    def test_unknown_and_known_emails_get_the_same_response(self) -> None:
        with patch("app.routers.auth.request_reset") as request:
            missing = forgot_password(ForgotPasswordIn(email="missing@example.com"), self.session)
            present = forgot_password(ForgotPasswordIn(email="ada@example.com"), self.session)
        self.assertEqual(missing.message, present.message)
        self.assertNotIn("ada@example.com", missing.message)
        self.assertEqual(request.call_count, 2)

    def test_expired_and_reused_tokens_do_not_change_the_password(self) -> None:
        token = self._request()
        row = self.session.scalar(select(PasswordResetToken))
        assert row is not None
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        self.session.commit()
        with self.assertRaises(PasswordResetError) as expired:
            consume_reset(self.session, token, "a-new-secret")
        self.assertEqual(expired.exception.status_code, 410)
        self.assertTrue(verify_password("old-password", self.user.password_hash or ""))

        fresh = self._request()
        with patch("app.password_reset.send_password_changed", return_value=True):
            consume_reset(self.session, fresh, "a-new-secret")
            self.session.commit()
        self.assertTrue(verify_password("a-new-secret", self.user.password_hash or ""))
        with self.assertRaises(PasswordResetError) as reused:
            consume_reset(self.session, fresh, "another-secret")
        self.assertEqual(reused.exception.status_code, 409)
        self.assertTrue(verify_password("a-new-secret", self.user.password_hash or ""))

    def test_delivery_includes_the_reset_link_and_not_the_hash(self) -> None:
        with patch("app.emailer.resend.Emails.send", return_value={"id": "email_2"}) as send:
            from app.config import settings

            previous_key = settings.resend_api_key
            previous_from = settings.email_from
            settings.resend_api_key = "re_test_secret"
            settings.email_from = "ExamsPrep <invites@example.com>"
            try:
                with self.assertLogs("app.email", level="INFO") as captured:
                    request_reset(self.session, "ada@example.com")
            finally:
                settings.resend_api_key = previous_key
                settings.email_from = previous_from
        payload = send.call_args.args[0]
        self.assertIn("/reset-password?token=", payload["html"])
        self.assertIn("/reset-password?token=", payload["text"])
        stored = self.session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.used_at.is_(None))
        )
        assert stored is not None
        self.assertNotIn(stored.token_hash, payload["html"])
        output = "\n".join(captured.output)
        self.assertNotIn(stored.token_hash, output)
        self.assertNotIn("re_test_secret", output)
