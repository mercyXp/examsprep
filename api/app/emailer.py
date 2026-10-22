"""Transactional email through Resend.

Logs record the message kind and the outcome. They do not record the API key,
message bodies, password-reset tokens, or invitation tokens.
"""

from __future__ import annotations

import logging
from html import escape

import resend

from app.config import public_origin, settings

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


def _role_blurb(role_label: str) -> str:
    if role_label == "Creator":
        return "You'll be able to create and manage learning content according to your assigned permissions."
    if role_label == "Administrator":
        return "You'll be able to manage courses, students, and announcements for the programmes assigned to you."
    return "Your access follows the role on this invitation."


def _brand_shell(body: str, footer: str) -> str:
    mark = escape(f"{public_origin()}/logo/mark.png", quote=True)
    return f"""<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;background:#eef1f8;font-family:Segoe UI,Arial,sans-serif;color:#1c2434;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e6e8f2;border-radius:18px;overflow:hidden;">
        <tr><td style="background:#5B4DFF;padding:28px 24px 24px;text-align:center;">
          <img src="{mark}" width="48" height="48" alt="" style="display:block;margin:0 auto 12px;border-radius:14px;background:#ffffff;padding:6px;" />
          <div style="color:#ffffff;font-size:22px;font-weight:700;line-height:1.2;">ExamsPrep</div>
          <div style="color:#e4e0ff;font-size:14px;margin-top:4px;">Learn. Practise. Succeed.</div>
        </td></tr>
        <tr><td style="padding:28px 32px 8px;text-align:left;">{body}</td></tr>
        <tr><td style="background:#f7f8fc;padding:22px 24px;text-align:center;color:#8b93a7;font-size:13px;line-height:1.6;">
          {footer}
          <div style="margin-top:4px;">© ExamsPrep · All rights reserved.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _action(link: str, label: str, wide: bool) -> str:
    href = escape(link, quote=True)
    width = "width:100%;" if wide else ""
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px auto;{width}">'
        f'<tr><td align="center" bgcolor="#5B4DFF" style="border-radius:12px;{width}">'
        f'<a href="{href}" style="display:inline-block;{width}box-sizing:border-box;padding:15px 28px;'
        f'color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;text-align:center;">{escape(label)}</a>'
        f"</td></tr></table>"
    )


def send_staff_invitation(email: str, role_label: str, link: str) -> bool:
    subject = "You're invited to join ExamsPrep"
    safe_role = escape(role_label)
    badge = escape(f"{role_label.upper()} INVITATION")
    blurb = escape(_role_blurb(role_label))
    href = escape(link, quote=True)
    shown = escape(link)
    text = "\n".join(
        [
            f"{role_label.upper()} INVITATION",
            "",
            "You're invited to join ExamsPrep!",
            "",
            "Hello there,",
            "",
            f"You've been invited to join ExamsPrep as a {role_label}. We're excited to have you on board!",
            "",
            f"Your role: {role_label}",
            _role_blurb(role_label),
            "",
            "To get started, set your password and activate your account using the link below.",
            "This invitation link can be used once and expires after 24 hours.",
            "",
            link,
            "",
            "If you weren't expecting this invitation, you can safely ignore this email.",
        ]
    )
    body = f"""
      <p style="margin:0 0 16px;"><span style="display:inline-block;background:#efeaff;color:#5B4DFF;font-size:11px;font-weight:700;letter-spacing:0.08em;padding:5px 10px;border-radius:999px;">{badge}</span></p>
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;">You're invited to join ExamsPrep!</h1>
      <p style="margin:0 0 12px;color:#5c6578;">Hello there,</p>
      <p style="margin:0 0 16px;color:#3c4558;line-height:1.55;">You've been invited to join ExamsPrep as a <strong style="color:#1c2434;">{safe_role}</strong>. We're excited to have you on board!</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ff;border-radius:14px;text-align:left;">
        <tr>
          <td width="52" valign="top" style="padding:16px 0 16px 16px;color:#5B4DFF;font-size:20px;">✓</td>
          <td style="padding:16px 16px 16px 8px;">
            <div style="font-weight:700;">Your role: {safe_role}</div>
            <div style="margin-top:4px;color:#5c6578;line-height:1.45;">{blurb}</div>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;color:#3c4558;line-height:1.55;">To get started, set your password and activate your account using the button below.</p>
      {_action(link, "Activate My Account →", False)}
      <p style="margin:0 0 18px;color:#5c6578;">This invitation link can be used once and expires after 24 hours.</p>
      <hr style="border:0;border-top:1px solid #e7e9f2;margin:0 0 16px;" />
      <p style="margin:0 0 8px;color:#5c6578;">If the button doesn't work, you can use the invitation link provided below.</p>
      <p style="margin:0 0 16px;word-break:break-all;"><a href="{href}" style="color:#5B4DFF;">{shown}</a></p>
      <p style="margin:0 0 20px;color:#5c6578;">If you weren't expecting this invitation, you can safely ignore this email.</p>
    """
    html = _brand_shell(body, "Helping you prepare for success.")
    return send_email(kind="staff.invitation", to=email, subject=subject, text=text, html=html)


def send_password_reset(email: str, link: str) -> bool:
    subject = "Reset your ExamsPrep password"
    href = escape(link, quote=True)
    shown = escape(link)
    text = "\n".join(
        [
            "Reset your password",
            "",
            "Hello,",
            "",
            "We received a request to reset your ExamsPrep password. Open the link below to choose a new password and regain access to your account.",
            "",
            "Link expires in 15 minutes.",
            "This link can only be used once. After a successful reset, it becomes invalid.",
            "",
            link,
            "",
            "If you didn't request a password reset, you can safely ignore this email. Your password won't change unless the reset process is completed.",
        ]
    )
    body = f"""
      <div style="width:52px;height:52px;border-radius:26px;background:#f3f1ff;color:#5B4DFF;text-align:center;line-height:52px;font-size:22px;margin-bottom:16px;">&#128274;</div>
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;">Reset your password</h1>
      <p style="margin:0 0 12px;color:#5c6578;">Hello,</p>
      <p style="margin:0;color:#3c4558;line-height:1.55;">We received a request to reset your ExamsPrep password. Click the button below to choose a new password and regain access to your account.</p>
      {_action(link, "Reset My Password →", True)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e9f2;border-radius:14px;">
        <tr><td style="padding:14px 16px;color:#1c2434;"><strong>Link expires in 15 minutes</strong></td></tr>
        <tr><td style="padding:0 16px 14px;color:#5c6578;line-height:1.5;">This link can only be used once. After a successful reset, it becomes invalid.</td></tr>
      </table>
      <p style="margin:16px 0;color:#5c6578;line-height:1.55;">If you didn't request a password reset, you can safely ignore this email. Your password won't change unless the reset process is completed.</p>
      <hr style="border:0;border-top:1px solid #e7e9f2;margin:0 0 16px;" />
      <p style="margin:0 0 8px;color:#5c6578;">Having trouble with the button? Copy your unique password-reset link into your browser.</p>
      <p style="margin:0 0 20px;word-break:break-all;"><a href="{href}" style="color:#5B4DFF;">{shown}</a></p>
    """
    html = _brand_shell(body, "Keeping your learning account secure.")
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
