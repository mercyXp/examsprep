# Research, voice, snap, practice, and revision

OpenAPI for these routes is served by the API at `GET /openapi.json`. Tags: `research`, `audio`, `tutor`, `snap`, `practice`, `revision`.

The browser calls Next.js. Android calls the FastAPI paths below with `Authorization: Bearer <token>`.

Keys stay on the API. A missing key returns HTTP 503 and the sentence “No result was generated.” The handlers do not fill in a sample lesson, transcript, or score.

## Storage on the free Render plan

Generated MP3 and snapped photos are `bytea` rows in Postgres. Each object is capped (`AUDIO_MAX_BYTES` and `SNAP_MAX_BYTES`, default 4 MB). Render’s disk is wiped on restart, so it is not the store for this audio. The free database is 1 GB and expires after 30 days; large voice libraries will not fit. Lesson images and PDFs still use `MEDIA_ROOT` on disk.

Speech uses ElevenLabs `eleven_flash_v2_5` and `mp3_22050_32`, which stay on the free tier. `ELEVENLABS_MAX_CHARS` (default 2500) truncates a long lesson and the player says so. `scribe_v1` was removed in 2026; speech-to-text uses `scribe_v2`.

Firecrawl crawl limit defaults to 4 pages. JSON extract costs extra credits; a credit error retries markdown only.

AI calls share `AI_RATE_LIMIT` (default 12) per `AI_RATE_WINDOW_SECONDS` (default 600). The counter is in memory on the single free web instance.

## Research Assistant

Staff only. Programme and course are required. Imports are drafts and a second import of the same job does not publish or duplicate the lessons.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/admin/research/jobs` | Scrape, or crawl a single site/syllabus URL |
| GET | `/api/admin/research/jobs?module_id=` | List jobs in scope |
| GET | `/api/admin/research/jobs/{id}` | Status, pages, outline. Polls a running crawl once |
| POST | `/api/admin/research/jobs/{id}/propose` | Outline when `AI_API_KEY` is set |
| POST | `/api/admin/research/jobs/{id}/import` | Draft chapters, lessons, and question-bank rows |

Duplicate URL sets for the same course return the existing job with `duplicate: true` unless `force` is true. `robots.txt` blocks and access errors are stored on the job and are not sent to Firecrawl.

## Speech

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/learn/lessons/{id}/audio` | Published lesson text, cached by content hash |
| POST | `/api/learn/audio/quiz` | `instruction`, `prompt`, `option`, or `explanation` |
| GET | `/api/learn/audio/{assetId}` | MP3, with `Range` for seek |

Explanation audio is refused until that student has submitted the quiz. The web player is at `/api/stream/learn/audio/{assetId}` so the browser cookie can be forwarded. Android uses the FastAPI path directly.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/learn/tutor/sessions` | Optional `module_id` and `lesson_id` |
| GET | `/api/learn/tutor/sessions/{id}` | Turns |
| POST | `/api/learn/tutor/sessions/{id}/turns` | Multipart field `audio` |

## Snap, practice, revision

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/learn/snap` | Multipart field `image` |
| GET | `/api/learn/snap` | My Questions |
| POST | `/api/learn/snap/{id}/followups` | `{ "question": "..." }` |
| GET | `/api/learn/snap/{id}/image` | The saved photo |
| POST | `/api/learn/practice/generate` | From published lesson text. `official` is false |
| POST | `/api/learn/practice/{id}/answer` | MCQ and short answers checked on the server |
| GET | `/api/learn/practice/performance` | Attempt counts, not a readiness score |
| GET | `/api/learn/revision-plan` | Days, weak topics, and the counts behind them |
| GET | `/api/learn/assist/status` | Booleans for configured providers. No secrets |

Practice rows are not copied into the question bank. Research questions are draft bank rows with source `research`.

## Live check

`python scripts/live_providers.py` from `api/` calls Firecrawl, ElevenLabs, and the AI provider only when the matching key is set. Unit tests in `tests/test_assist.py` are mocked and do not make those calls.
