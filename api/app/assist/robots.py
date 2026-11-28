"""robots.txt check before a Firecrawl credit is spent."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser


@dataclass(frozen=True)
class RobotsDecision:
    allowed: bool
    checked: bool
    message: str


def robots_url_for(page_url: str) -> str:
    parts = urlparse(page_url)
    return f"{parts.scheme}://{parts.netloc}/robots.txt"


def decide_robots(page_url: str, status_code: int, body: str) -> RobotsDecision:
    if status_code == 404:
        return RobotsDecision(True, True, "")
    if status_code in {401, 403}:
        return RobotsDecision(
            False,
            True,
            "The site refused robots.txt, so this URL was not fetched.",
        )
    if status_code >= 400 or not body.strip():
        return RobotsDecision(
            True,
            False,
            "robots.txt could not be read. Firecrawl will still apply its own robots check.",
        )
    parser = RobotFileParser()
    parser.parse(body.splitlines())
    agents = ("*", "FirecrawlAgent", "Firecrawl")
    if any(not parser.can_fetch(agent, page_url) for agent in agents):
        return RobotsDecision(
            False,
            True,
            "robots.txt disallows this URL, so it was not fetched.",
        )
    return RobotsDecision(True, True, "")
