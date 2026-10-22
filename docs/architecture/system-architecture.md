# System architecture

## Current

Next.js in `app/` talks to FastAPI in `api/` over `/api/*` proxies. PostgreSQL holds users, the Computing catalogue, lessons, progress, and scoped staff assignments.

- **UI:** React, TypeScript, Tailwind v4, CSS custom properties for light/dark (`html[data-theme]`).
- **Marketing:** `/`, `/features`, `/programmes/computing`. Catalogue copy on those pages is still in `app/src/data/` until they read FastAPI.
- **Auth:** email/password against Postgres (`examsprep_token` cookie). Google sign-in is not connected. Password reset and staff invitations are emailed through Resend.
- **Student:** `/dashboard`, My Courses, lesson player with recorded progress. Students only receive **published** lessons they are authorised to see.
- **Staff:** `/admin` CMS — courses, chapters, Lesson Authoring Studio, assignments. Navigation and lists follow the signed-in user’s scope. The studio writes versioned `slides` JSON (ordered reveal items). The student player at `/learn/lessons/[id]` uses the same renderer for progressive reveal and full notes.
- **Access:** Super administrator, program administrator, and content creator. Creator assignments name a programme **and** a module. FastAPI checks every content operation. See [access-control.md](access-control.md).

```
Browser
  └─ Next.js (App Router)
       ├─ Marketing pages
       ├─ Auth → FastAPI
       ├─ Student dashboard + lesson player → FastAPI
       └─ Admin CMS + assignments → FastAPI
            └─ FastAPI → PostgreSQL
```

## Target hosting

| Layer | Choice | Host |
| --- | --- | --- |
| Frontend | Next.js, React, TypeScript, Tailwind | Vercel |
| Backend | FastAPI, Pydantic, OpenAPI | Render |
| Database | PostgreSQL, SQLAlchemy 2.x, Alembic | Render Postgres |
| Auth | Email and password, JWT cookie `examsprep_token`, roles in Postgres. Clerk is not assumed | Render |
| AI | Provider API behind a replaceable layer; RAG over **published** notes later | External API |
| Files | Object storage for PDFs, images, and lecture notes | Added when needed |

```
Browser → Next.js (Vercel) → FastAPI (Render) → PostgreSQL (Render, private)
                                  ├─ AI provider (explanations, quiz draft)
                                  └─ Object storage (later)
```

The browser never receives `DATABASE_URL`. Vercel calls Render through the server variable `API_URL`. See [operations/deployment.md](../operations/deployment.md).

## Academic hierarchy

Programme data must not assume Computing:

`Programme → AcademicYear → Semester → Module → Chapter → Lesson / Quiz → Topic → Resource`

`program_modules` records that a module is offered in a programme so creator assignments can name that pair. The same module code may exist in two programmes later, with different creators.

Statuses: `available` | `coming_soon` | `preview`.

Lessons are versioned. Students only see a **published** version they are authorised to access. See the content workflow below and [access-control.md](access-control.md).

## Roles and permissions

Four application roles, plus public visitors. Scope is assignment rows, not the role slug alone:

| Role | Job |
| --- | --- |
| Student | Consume published content, sit quizzes, track own progress |
| Content creator | Draft and edit lessons for assigned programme–module combinations; submit for review |
| Program administrator | Manage all modules in assigned programmes; review and publish; assign creators in that scope |
| Super administrator | System-wide catalogue, users, assignments, publish, and audit logs |

Named permissions (`lesson:publish`, `review:decide`, …) sit on roles. FastAPI then loads `AccessScope` from `program_admin_assignments` and `content_creator_assignments` and checks every CMS and learn route. Frontend filtering is not sufficient.

A program administrator cannot grant access outside assigned programmes. A content creator cannot publish. Administrators do not get unrestricted access to every student’s private data.

## Content workflow

Lessons today; the same pattern should apply to quizzes, question banks, and mock exams:

`DRAFT` → `IN_REVIEW` → `CHANGES_REQUESTED` or `PUBLISHED` → `UNPUBLISHED` / `ARCHIVED`

Rules FastAPI must enforce (clients cannot set `"status": "PUBLISHED"`):

- Creators save drafts and **submit for review**. Program administrators and Super Admins publish or review within their scope.
- Submitting records an audit event and moves the lesson to `IN_REVIEW`.
- Approve publishes that version; reject returns `CHANGES_REQUESTED`.
- Students keep seeing the last published version while a newer one is in draft or review.
- Guessing another lesson ID does not grant access.
- Completed quiz attempts should keep the question and scoring versions they used (when quizzes follow this workflow).

## Why this split

The Next.js app already owns the marketing UI and theme. FastAPI owns auth, review, and AI so publishing rights stay off the client. PostgreSQL matches a relational curriculum and an audit trail. Keep the AI provider swappable so cost and quality can change without rewriting the product.
