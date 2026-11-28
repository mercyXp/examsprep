"""Official Firecrawl v2 HTTP API (scrape, crawl, markdown, JSON extract).

https://docs.firecrawl.dev/api-reference/endpoint/scrape
The free plan charges one credit per page, and JSON extract costs extra credits.
Crawl limit defaults to 4. A payment error retries markdown only.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.assist.http import UpstreamError, request_json
from app.config import settings

API = "https://api.firecrawl.dev/v2"

EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "headings": {"type": "array", "items": {"type": "string"}},
        "definitions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "term": {"type": "string"},
                    "meaning": {"type": "string"},
                },
            },
        },
    },
}


@dataclass
class Page:
    url: str
    title: str
    markdown: str
    structured: dict | None = None


@dataclass
class CrawlSnapshot:
    crawl_id: str
    status: str
    pages: list[Page] = field(default_factory=list)
    error: str = ""


def configured() -> bool:
    return bool((settings.firecrawl_api_key or "").strip())


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.firecrawl_api_key.strip()}"}


def _page(url: str, data: dict, *, limit: int = 20_000) -> Page:
    meta = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    source = str(meta.get("sourceURL") or meta.get("url") or url)
    title = str(meta.get("title") or data.get("title") or source)
    markdown = str(data.get("markdown") or "")[:limit]
    structured = data.get("json") if isinstance(data.get("json"), dict) else None
    return Page(url=source, title=title[:180], markdown=markdown, structured=structured)


def _formats(structured: bool) -> list:
    formats: list = ["markdown"]
    if structured:
        formats.append({"type": "json", "schema": EXTRACT_SCHEMA, "prompt": "Extract teaching points only."})
    return formats


class FirecrawlClient:
    def scrape(self, url: str, *, structured: bool = True) -> Page:
        try:
            return self._scrape(url, structured=structured)
        except UpstreamError as error:
            if structured and error.payment:
                page = self._scrape(url, structured=False)
                page.structured = None
                return page
            raise

    def _scrape(self, url: str, *, structured: bool) -> Page:
        status, payload = request_json(
            f"{API}/scrape",
            method="POST",
            payload={"url": url, "formats": _formats(structured), "onlyMainContent": True},
            headers=_headers(),
            timeout=45,
        )
        if not isinstance(payload, dict) or payload.get("success") is False:
            message = "Firecrawl did not return this page."
            if isinstance(payload, dict):
                message = str(payload.get("error") or message)
            raise UpstreamError(status, message[:500])
        data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
        if not isinstance(data, dict):
            raise UpstreamError(status, "Firecrawl did not return this page.")
        return _page(url, data)

    def start_crawl(self, url: str, *, limit: int, structured: bool = True) -> str:
        try:
            return self._start_crawl(url, limit=limit, structured=structured)
        except UpstreamError as error:
            if structured and error.payment:
                return self._start_crawl(url, limit=limit, structured=False)
            raise

    def _start_crawl(self, url: str, *, limit: int, structured: bool) -> str:
        status, payload = request_json(
            f"{API}/crawl",
            method="POST",
            payload={
                "url": url,
                "limit": limit,
                "maxDiscoveryDepth": 1,
                "scrapeOptions": {"formats": _formats(structured), "onlyMainContent": True},
            },
            headers=_headers(),
            timeout=30,
        )
        if not isinstance(payload, dict) or not payload.get("id"):
            message = "Firecrawl did not start a crawl."
            if isinstance(payload, dict):
                message = str(payload.get("error") or message)
            raise UpstreamError(status, message[:500])
        return str(payload["id"])

    def crawl_status(self, crawl_id: str) -> CrawlSnapshot:
        status, payload = request_json(
            f"{API}/crawl/{crawl_id}",
            headers=_headers(),
            timeout=30,
        )
        if not isinstance(payload, dict):
            raise UpstreamError(status, "Firecrawl did not return crawl status.")
        state = str(payload.get("status") or "scraping")
        error = str(payload.get("error") or "")
        pages = []
        for item in payload.get("data") or []:
            if isinstance(item, dict):
                pages.append(_page(str(item.get("metadata", {}).get("sourceURL") or ""), item))
        if state == "failed" and not error:
            error = "Firecrawl could not crawl this site."
        return CrawlSnapshot(crawl_id=crawl_id, status=state, pages=pages, error=error[:500])
