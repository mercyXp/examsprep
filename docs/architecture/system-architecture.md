# System architecture

## Current (frontend MVP)

The product is a Next.js App Router app in `app/`:

- **UI:** React, TypeScript, Tailwind v4, CSS custom properties for light/dark (`html[data-theme]`).
- **Pages:** `/` (hero, features, programmes), `/features`, `/programmes/computing`, `/login`, `/signup`, `/forgot-password`.
- **Chrome:** `Header` and `Footer` on marketing pages; auth screens are full-bleed and return home via the logo.
- **Catalogue data:** TypeScript modules in `app/src/data/` until a database exists.
- **Auth / API / AI:** UI only. Login, signup, Google, and password-reset routes return honest 503 until FastAPI is connected. The PostgreSQL schema, migrations, and seed data now live in `api/`.

```
Browser
  └─ Next.js (App Router)
       ├─ Landing + programme pages
       ├─ Auth screens (not connected)
       └─ Static assets (logo, hero art)
```

## Target hosting

| Layer | Choice | Host |
| --- | --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind | Vercel |
| Backend | FastAPI, Pydantic, OpenAPI | Railway |
| Database | PostgreSQL, SQLAlchemy 2.x, Alembic | Railway (managed) |
| Auth | FastAPI sessions or tokens; roles in Postgres. Clerk is not assumed | Railway |
| AI | Provider API behind a replaceable layer; RAG over **published** notes later | External API |
| Files | Object storage for PDFs, images, and lecture notes | Added when needed |

```
Browser → Next.js (Vercel) → FastAPI (Railway) → PostgreSQL (Railway, private)
                                  ├─ AI provider (explanations, quiz draft)
                                  └─ Object storage (later)
```

Start with Vercel + Railway. Do not add extra services until the product needs them. See [operations/deployment.md](../operations/deployment.md).

## Academic hierarchy

Programme data must not assume Computing:

`Programme → AcademicYear → Semester → Module → Lesson / Quiz → Topic → Resource`

Statuses: `available` | `coming_soon` | `preview`.

Lessons and quizzes are versioned. Students only see a **published** approved version. See the content workflow below.

## Roles and permissions

Four application roles, plus public visitors:

| Role | Job |
| --- | --- |
| Student | Consume published content, sit quizzes, track own progress |
| Content creator | Draft lessons and quizzes, submit for review, correct after feedback |
| Administrator | Review, approve/reject, publish/unpublish, manage catalogue |
| Super administrator | Assign roles, platform config, audit logs, high-impact account actions |

Permissions are named capabilities (`lesson:publish`, `review:approve`, …), not scattered role-name checks. FastAPI exposes `require_permission()` plus resource ownership checks.

A creator who also holds administrator must **not** approve their own submission. Administrators do not get unrestricted access to every student’s private data.

## Content workflow

Applies to lessons, quizzes, question banks, and mock exams:

`DRAFT` → `IN_REVIEW` → `CHANGES_REQUESTED` or `APPROVED` → `PUBLISHED` → `UNPUBLISHED` / `ARCHIVED`

Rules FastAPI must enforce (clients cannot set `"status": "PUBLISHED"`):

- Submitting freezes a **version**. Later edits create a new version; they do not mutate what is under review.
- Approval binds to that version. A changed file after approval is not covered by the old approval.
- Only an approved version can be published.
- Students keep seeing the last published version while a newer one is in draft or review.
- Unpublish records a reason. Live edits go through review again.
- Completed quiz attempts keep the question and scoring versions they used.

## Why this split

The Next.js app already owns the marketing UI and theme. FastAPI owns auth, review, and AI so publishing rights stay off the client. PostgreSQL matches a relational curriculum and an audit trail. Keep the AI provider swappable so cost and quality can change without rewriting the product.
