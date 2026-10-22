"""Transactional email through Resend.

Logs record the message kind and the outcome. They do not record the API key,
message bodies, password-reset tokens, or invitation tokens.
"""

from __future__ import annotations

import logging
from html import escape

import resend

from app.config import settings

logger = logging.getLogger("app.email")


def mail_configured() -> bool:
    return bool((settings.resend_api_key or "").strip() and (settings.email_from or "").strip())


def send_email(*, kind: str, to: str, subject: str, text: str, html: str) -> bool:
    recipient = to.strip()
    if "@" not in recipient:
        logger.warning("email.skipped kind=%s reason=invalid_recipient", kind)
        return False
    if not mail_configured():
        logger.info("email.skipped kind=%s reason=not_configured", kind)
        return False
    try:
        resend.api_key = settings.resend_api_key
        resend.Emails.send(
            {
                "from": settings.email_from.strip(),
                "to": [recipient],
                "subject": subject,
                "text": text,
                "html": html,
            }
        )
    except Exception as exc:
        logger.warning("email.failed kind=%s error=%s", kind, type(exc).__name__)
        return False
    logger.info("email.sent kind=%s", kind)
    return True


def _page(title: str, paragraphs: list[str], link: str | None = None, link_label: str = "Open") -> str:
    body = "".join(f"<p>{escape(paragraph)}</p>" for paragraph in paragraphs)
    action = ""
    if link:
        safe = escape(link, quote=True)
        action = f'<p><a href="{safe}">{escape(link_label)}</a></p><p>{safe}</p>'
    return f"<html><body><h1>{escape(title)}</h1>{body}{action}</body></html>"


def send_staff_invitation(email: str, role_label: str, link: str) -> bool:
    subject = f"Your ExamsPrep {role_label} invitation"
    text = "\n".join(
        [
            f"You have been invited to ExamsPrep as a {role_label}.",
            "",
            "Open this link to choose your password and activate your account.",
            "The link works once and expires in 24 hours.",
            "",
            link,
            "",
            "If you were not expecting this, you can ignore the message.",
        ]
    )
    html = _page(
        subject,
        [
            f"You have been invited to ExamsPrep as a {role_label}.",
            "Open this link to choose your password and activate your account. The link works once and expires in 24 hours.",
            "If you were not expecting this, you can ignore the message.",
        ],
        link,
        "Activate your account",
    )
    return send_email(kind="staff.invitation", to=email, subject=subject, text=text, html=html)


def send_password_reset(email: str, link: str) -> bool:
    subject = "Reset your ExamsPrep password"
    text = "\n".join(
        [
            "We received a request to reset your ExamsPrep password.",
            "",
            "Open this link to choose a new password. It works once and expires in 15 minutes.",
            "",
            link,
            "",
            "If you did not ask for this, you can ignore the message. Your password will stay the same.",
        ]
    )
    html = _page(
        subject,
        [
            "We received a request to reset your ExamsPrep password.",
            "This link works once and expires in 15 minutes. If you did not ask for this, you can ignore the message.",
        ],
        link,
        "Choose a new password",
    )
    return send_email(kind="auth.password_reset", to=email, subject=subject, text=text, html=html)


def send_password_changed(email: str) -> bool:
    subject = "Your ExamsPrep password was changed"
    text = "\n".join(
        [
            "The password on your ExamsPrep account was just changed.",
            "",
            "If you made this change, no further action is needed.",
            "If you did not, reset your password and contact the person who runs ExamsPrep.",
        ]
    )
    html = _page(subject, text.split("\n\n"))
    return send_email(kind="auth.password_changed", to=email, subject=subject, text=text, html=html)


def send_staff_role_notice(email: str, role_label: str) -> bool:
    subject = "Your ExamsPrep staff role changed"
    text = f"Your ExamsPrep staff role is now {role_label}."
    html = _page(subject, [text])
    return send_email(kind="staff.role_changed", to=email, subject=subject, text=text, html=html)


def send_staff_access_notice(email: str, active: bool) -> bool:
    subject = "Your ExamsPrep staff access changed"
    text = (
        "Your ExamsPrep staff access has been restored. You can sign in again."
        if active
        else "Your ExamsPrep staff access has been suspended. You cannot sign in until it is restored."
    )
    html = _page(subject, [text])
    return send_email(kind="staff.access_changed", to=email, subject=subject, text=text, html=html)


def send_test_email(email: str) -> bool:
    subject = "ExamsPrep email test"
    text = "This is a test message from ExamsPrep. No account was changed."
    html = _page(subject, [text])
    return send_email(kind="mail.test", to=email, subject=subject, text=text, html=html)
