"""Replaceable completion provider. Without a key, authoring uses a local draft."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from app.config import settings


@dataclass
class Completion:
    text: str
    provider: str
    degraded: bool


class AIProvider:
    name = "heuristic"

    @property
    def configured(self) -> bool:
        return False

    def complete(self, system: str, user: str) -> Completion:
        raise NotImplementedError


class HeuristicProvider(AIProvider):
    name = "heuristic"

    def complete(self, system: str, user: str) -> Completion:
        return Completion(text="", provider=self.name, degraded=True)


class OpenAICompatibleProvider(AIProvider):
    """Chat completions against any OpenAI-compatible base URL."""

    name = "openai"

    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.model = model.strip() or "gpt-4o-mini"

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    def complete(self, system: str, user: str) -> Completion:
        if not self.api_key:
            return Completion(text="", provider="heuristic", degraded=True)
        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = json.loads(response.read().decode())
            text = str(body["choices"][0]["message"]["content"])
        except (urllib.error.URLError, TimeoutError, KeyError, IndexError, json.JSONDecodeError, TypeError, ValueError):
            return Completion(text="", provider="heuristic", degraded=True)
        return Completion(text=text, provider=self.name, degraded=False)


def select_provider() -> AIProvider:
    choice = (settings.ai_provider or "auto").strip().lower()
    key = (settings.ai_api_key or "").strip()
    if choice in {"heuristic", "local", "none"}:
        return HeuristicProvider()
    if choice in {"", "auto"} and not key:
        return HeuristicProvider()
    if choice not in {"", "auto", "openai", "compatible"}:
        return HeuristicProvider()
    return OpenAICompatibleProvider(key, settings.ai_base_url or "https://api.openai.com/v1", settings.ai_model or "gpt-4o-mini")


def provider_info() -> dict[str, str | bool]:
    provider = select_provider()
    configured = isinstance(provider, OpenAICompatibleProvider) and provider.configured
    return {
        "provider": "openai" if configured else "heuristic",
        "configured": configured,
        "model": settings.ai_model if configured else "",
    }
