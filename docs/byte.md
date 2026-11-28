# Byte Arena and ExamSprint

Byte Arena is the Dev3pack gaming-track sponsor. An agent plays a game over HTTP, narrates the run, and can stream it. ExamSprint implements the public game contract and nothing past it.

## What the docs actually say

- Sponsor announcement: [Dev3pack × Byte Arena](https://www.linkedin.com/posts/dev3pack_dev3pack-x-bytearenafun-were-teaming-activity-7527777462307438592-ZE7w) and the hackathon at [hack.dev3pack.xyz](https://hack.dev3pack.xyz/).
- Product docs: [bytearena.fun/docs](https://www.bytearena.fun/docs).
- The integration spec is public, MIT-licensed, and served as plain text: [GET https://app.bytearena.fun/api/game-spec](https://app.bytearena.fun/api/game-spec).
- There is no game SDK. Integration is one markdown file, `BYTE_GAME.md`, with prose for the agent's prompt and one JSON block for the HTTP contract.
- A run has to be public HTTPS. The spec says localhost and private IPs are blocked and cannot be unblocked.
- Start is one call. Byte does not create an ExamsPrep account. The response must carry whatever later calls need (`apiKey`, `runId`).
- Moves are a closed list. Reaction time is not a legal way to play, so agent runs pause the clock. Humans still get the 15 second timer and the speed bonus.
- Every response is the full JSON state. Reading state has no side effects. The same `moveId` does not score twice. A finished run keeps answering with the finished state.
- `finish` is `status == "finished"`. `result.win` is `outcome == "flawless"`. `result.score` is `score`, labelled `pts`.
- The spectator page is `watchUrl`. It must be HTML (`text/html`), allow framing from `https://app.bytearena.fun`, and poll even when the iframe is not focused.
- Uploading is documented in section 12 of the spec:
  - Mint an upload token at [app.bytearena.fun/games](https://app.bytearena.fun/games) (for devs). The token is a Notlogin identity, only opens `/api/my-games`, and expires.
  - `POST https://app.bytearena.fun/api/my-games/preview` with `{"text": "<markdown>"}` and `Authorization: Bearer <token>`.
  - `POST https://app.bytearena.fun/api/my-games` with `{"text": "<markdown>", "name": "ExamSprint"}` saves it.
  - `GET https://app.bytearena.fun/api/my-games` lists yours.
  - Publishing is a review (`POST /api/my-games/:id` with `{"publish":"request","note":"…"}`). ExamSprint does not request publication.
- The public arena board is `GET https://app.bytearena.fun/api/leaderboard`. It returned 200 on 28 Nov 2026 with rows of `callsign`, `game`, `wins`, `best`, and `scoreLabel`. The ExamSprint app shows that list as Byte's board. It is not copied into our database.

## What this repo implements

| Piece | Where |
| --- | --- |
| Human sessions, scoring, rounds, achievements | `POST /api/sprint/sessions` and the answer, continue, and quit routes. Auth is the existing ExamsPrep bearer token. |
| Agent play | `POST /api/sprint/agent/start`, then `Authorization: Bearer <apiKey>` on state, answer, continue, and quit. |
| Leaderboard | `GET /api/sprint/leaderboard?kind=human\|agent`. Quit runs are excluded. `playerKind` separates agents and players. |
| Manifest | `mobile-examsprint/BYTE_GAME.md`, and `GET /api/sprint/byte/manifest` once `SPRINT_PUBLIC_BASE_URL` is a public https origin. |
| Spectator page | `GET /sprint/watch/{runId}` (HTML) and `GET /api/sprint/watch/{runId}` (JSON). |
| Register | `POST /api/sprint/byte/preview` and `POST /api/sprint/byte/register`, admin only. They call the two documented Byte URLs. |

## Not configured

`GET /api/sprint/byte/status` returns `configured: false` until both of these are set on the API. No outbound call is made in that state.

1. `BYTE_GAME_TOKEN` — the upload token from [app.bytearena.fun/games](https://app.bytearena.fun/games). Do not commit it.
2. `SPRINT_PUBLIC_BASE_URL` — the public `https` origin of this API, with no trailing slash. A local URL cannot be registered.

An administrator then calls `POST /api/sprint/byte/preview` and, if the preview is clean, `POST /api/sprint/byte/register`. The game stays private to that Byte account until someone requests review in the Byte editor. That review is Byte's decision, not something this API can grant.

## What we did not invent

- No Byte account is created from this codebase.
- No scores are pushed to Byte. Byte reads `score` from our final JSON, which is what section 8 of the spec says the board ranks.
- Agent runs are not reaction-time games. `timerPaused` is true and a correct card is 100 points.
- The checked-in manifest uses `https://YOUR_PUBLIC_API` on purpose. Upload the manifest from `GET /api/sprint/byte/manifest` after the public origin is set.
