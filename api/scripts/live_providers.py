"""Optional live calls. This is not part of the mocked unit tests.

Run from api/:
    python scripts/live_providers.py

The script exits 0 without calling a provider when that provider's key is unset.
It never prints the key.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ai.provider import select_provider
from app.assist.elevenlabs import stt_configured, synthesize, tts_configured
from app.assist.firecrawl import FirecrawlClient
from app.assist.firecrawl import configured as firecrawl_ready
from app.assist.http import UpstreamError


def main() -> int:
    print("LIVE integration check. Providers are mocked in tests/test_assist.py.")
    ran = False
    if not firecrawl_ready():
        print("SKIP Firecrawl: FIRECRAWL_API_KEY is not set.")
    else:
        ran = True
        try:
            page = FirecrawlClient().scrape("https://example.com", structured=False)
        except UpstreamError as error:
            print(f"FAIL Firecrawl: {error}")
            return 1
        print(f"OK Firecrawl scrape example.com ({len(page.markdown)} characters of markdown).")
    if not tts_configured():
        missing = "ELEVENLABS_API_KEY" if not stt_configured() else "ELEVENLABS_VOICE_ID"
        print(f"SKIP ElevenLabs speech: {missing} is not set.")
    else:
        ran = True
        try:
            audio, truncated, characters = synthesize("ExamsPrep live check.")
        except UpstreamError as error:
            print(f"FAIL ElevenLabs: {error}")
            return 1
        print(f"OK ElevenLabs speech ({len(audio)} bytes, {characters} characters, truncated={truncated}).")
    provider = select_provider()
    if not provider.configured:
        print("SKIP AI: AI_API_KEY is not set.")
    else:
        ran = True
        completion = provider.complete("Reply with the single word pong.", "ping")
        if completion.degraded or "pong" not in completion.text.lower():
            print("FAIL AI: the provider did not return pong.")
            return 1
        print(f"OK AI provider {completion.provider}.")
    if not ran:
        print("No live calls were made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
