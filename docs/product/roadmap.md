# Roadmap

## Now

- Landing page and visual system (done).
- Programme catalogue on the homepage; Computing programme explorer (in progress).
- Auth screens (sign in, create account, forgot password) — honest 503 until FastAPI exists.
- Documentation in `docs/` for hosting, roles, and the review workflow.
- PostgreSQL schema, Alembic migration, and Computing seed in `api/` (not yet connected to the Next.js app).

## Next (backend foundation)

Build in this order so the lesson workflow becomes the pattern for quizzes and exams:

1. FastAPI authentication against `users` / `roles` / `permissions`.
2. Programme catalogue API; migrate the Next.js app off `app/src/data/`.
3. Lessons and `lesson_versions`; creator draft editor in Next.js.
4. Submit, review, feedback, approve/reject (no self-approval).
5. Version-safe publish / unpublish and student retrieval of the live version only.
6. Apply the same rules to questions, quizzes, and mock exams.
7. Admin review queue, audit logs, and permission tests.

Confirm remaining Computing module lists (all years/semesters) and credits with the official curriculum in parallel.

## Later

- Student dashboard, enrolments, attempts, bookmarks, AI tutor over published notes.
- Remaining Cavendish programmes as content is ready (`available` / `coming_soon` / `preview`).
- Object storage for PDFs and lecture notes.
- Past papers where authorised.

## Hosting

Vercel (Next.js) + Railway (FastAPI and managed Postgres). Stay near K0/month while developing; pay for always-on API and non-expiring Postgres before real student records. Details: [operations/deployment.md](../operations/deployment.md).
