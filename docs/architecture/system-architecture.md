# System architecture

## Current (frontend MVP)

The product is a Next.js App Router app in `app/`:

- **UI:** React, TypeScript, Tailwind v4, CSS custom properties for light/dark (`html[data-theme]`).
- **Pages:** `/` (hero, features, programmes), `/features`, `/programmes/computing`.
- **Chrome:** `Header` and `Footer` in the root layout.
- **Catalogue data:** TypeScript modules in `app/src/data/` until a database exists.
- **Auth / API / AI:** not implemented.

```
Browser
  └─ Next.js (App Router)
       ├─ Landing + programme pages
       └─ Static assets (logo, hero art)
```

## Target

| Layer | Choice |
| --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind |
| Backend | FastAPI (Python), Pydantic, generated OpenAPI |
| Database | PostgreSQL, SQLAlchemy 2.x, Alembic |
| Auth | Session or token-based; Clerk is not assumed |
| AI | Provider API behind a replaceable layer; RAG over approved notes later |
| Files | Object storage for PDFs and lecture notes |
| Jobs | Add a queue when bulk generation or ingestion needs it |

```
Browser → Next.js  →  FastAPI  →  PostgreSQL
                       ├─ AI provider (explanations, quiz draft)
                       └─ File storage
```

Programme data must not assume Computing. Hierarchy:

`Programme → AcademicYear → Semester → Module → Topic → Resource`

Statuses: `available` | `coming_soon` | `preview`.

## Why this split

The Next.js app already owns the marketing UI and theme. FastAPI fits document processing, quiz generation, and a clear OpenAPI contract. PostgreSQL matches a relational curriculum. Keep the AI provider swappable so cost and quality can change without rewriting the product.
