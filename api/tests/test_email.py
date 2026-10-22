import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.access import AccessScope
from app.config import settings
from app.emailer import send_email, send_staff_invitation
from app.models.enums import UserStatus
from app.models.identity import User
from app.routers.mail import send_admin_test_email
from app.routers.staff import InviteIn, invite_staff


class EmailDeliveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.api_key = settings.resend_api_key
        self.sender = settings.email_from
        settings.resend_api_key = "re_test_secret"
        settings.email_from = "ExamsPrep <invites@example.com>"

    def tearDown(self) -> None:
        settings.resend_api_key = self.api_key
        settings.email_from = self.sender

    def test_sends_html_and_text_without_logging_secrets(self) -> None:
        token = "invite-token-not-for-logs"
        with patch("app.emailer.resend.Emails.send", return_value={"id": "email_1"}) as send:
            with self.assertLogs("app.email", level="INFO") as captured:
                sent = send_staff_invitation("person@example.com", "Creator", f"https://www.examsprep.xyz/invite/{token}")
        self.assertTrue(sent)
        payload = send.call_args.args[0]
        self.assertEqual(payload["to"], ["person@example.com"])
        self.assertIn(token, payload["html"])
        self.assertIn(token, payload["text"])
        self.assertIn("<p>", payload["html"])
        output = "\n".join(captured.output)
        self.assertIn("email.sent", output)
        self.assertNotIn(token, output)
        self.assertNotIn("re_test_secret", output)
        self.assertNotIn("invite-token", output)

    def test_provider_error_is_reported_without_the_message_body(self) -> None:
        secret = "reset-token-should-stay-out-of-logs"
        with patch("app.emailer.resend.Emails.send", side_effect=RuntimeError(f"provider down {secret} re_test_secret")):
            with self.assertLogs("app.email", level="INFO") as captured:
                sent = send_email(
                    kind="auth.password_reset",
                    to="person@example.com",
                    subject="Reset",
                    text=secret,
                    html=f"<p>{secret}</p>",
                )
        self.assertFalse(sent)
        output = "\n".join(captured.output)
        self.assertIn("email.failed", output)
        self.assertIn("RuntimeError", output)
        self.assertNotIn(secret, output)
        self.assertNotIn("re_test_secret", output)

    def test_missing_configuration_does_not_call_resend(self) -> None:
        settings.resend_api_key = ""
        with patch("app.emailer.resend.Emails.send") as send:
            sent = send_email(kind="mail.test", to="person@example.com", subject="Test", text="Hello", html="<p>Hello</p>")
        self.assertFalse(sent)
        send.assert_not_called()

    def test_only_a_super_administrator_can_send_the_test(self) -> None:
        user = User(name="Ada", email="ada@example.com", status=UserStatus.ACTIVE)
        creator = AccessScope(user=user, roles=["creator"], super_admin=False)
        with self.assertRaises(HTTPException) as caught:
            send_admin_test_email(creator)
        self.assertEqual(caught.exception.status_code, 403)

        boss = AccessScope(user=user, roles=["super_administrator"], super_admin=True)
        with patch("app.routers.mail.send_test_email", return_value=True) as send:
            result = send_admin_test_email(boss)
        self.assertTrue(result["ok"])
        send.assert_called_once_with("ada@example.com")

    def test_a_non_super_administrator_cannot_invite_staff(self) -> None:
        user = User(name="Ada", email="ada@example.com", status=UserStatus.ACTIVE)
        scope = AccessScope(user=user, roles=["creator"], super_admin=False)
        with self.assertRaises(HTTPException) as caught:
            invite_staff(InviteIn(email="new@example.com", role="creator"), scope, session=None)  # type: ignore[arg-type]
        self.assertEqual(caught.exception.status_code, 403)
