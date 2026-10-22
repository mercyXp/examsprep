"""Send one fixed test message. Local and operator use only.

    python -m app.send_test_email recipient@example.com
"""

from __future__ import annotations

import sys

from app.config import settings
from app.emailer import send_test_email


def main() -> None:
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        print("Usage: python -m app.send_test_email recipient@example.com", file=sys.stderr)
        raise SystemExit(2)
    if not (settings.resend_api_key or "").strip() or not (settings.email_from or "").strip():
        print("Set RESEND_API_KEY and EMAIL_FROM on the API host first.", file=sys.stderr)
        raise SystemExit(1)
    if not send_test_email(sys.argv[1].strip()):
        print("The provider did not accept the test message.", file=sys.stderr)
        raise SystemExit(1)
    print("Test email sent.")


if __name__ == "__main__":
    main()
