# Roadmap

## Now

- Landing page and visual system.
- Programme catalogue on the homepage; Computing programme explorer.
- Email/password auth against FastAPI and Postgres. Google and forgot-password still return an honest “not connected” response.
- Student dashboard, My Courses, and the lesson player (published content only).
- Admin CMS: modules, chapters, typed lesson editor, drafts, preview, publish.
- Scoped staff roles: Super Admin, program administrator, content creator. Assignments name a programme and a module. Backend enforcement, no URL bypass. See [access-control.md](../architecture/access-control.md).

## Next

1. Apply the lesson submit → review → publish pattern to questions, quizzes, and mock exams.
2. Dedicated review queue UI and scoped audit-log views.
3. Permission tests for assignment revocation and URL guessing.
4. Migrate marketing catalogue pages off `app/src/data/` onto FastAPI.

Confirm remaining Computing module lists (all years/semesters) and credits with the official curriculum in parallel.

## Later

- AI tutor over published notes.
- Remaining Cavendish programmes as content is ready (`available` / `coming_soon` / `preview`).
- Object storage for PDFs and lecture notes.
- Past papers where authorised.

## Hosting

Vercel (Next.js) + Railway (FastAPI and managed Postgres). Stay near K0/month while developing; pay for always-on API and non-expiring Postgres before real student records. Details: [operations/deployment.md](../operations/deployment.md).
