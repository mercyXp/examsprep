# Database design

SQLAlchemy models and the first Alembic revision live in `api/`. Catalogue rows still also exist in `app/src/data/programmes.ts` until the Next.js app reads from FastAPI. Seed Computing and roles with `python -m app.seed` after `alembic upgrade head`.

## Hierarchy

```
users ── user_roles ── roles
programme
  academic_year
    semester
      module
        lesson ── lesson_versions ── content_reviews
        quiz ── quiz_questions ── questions ── question_versions
        topic
          resource
enrolment / attempt / progress / bookmark   (student learning)
audit_logs
```

## Identity and access

**users** — `id`, `name`, `email` (unique), `password_hash`, `status`, timestamps.

**roles** — `student` | `creator` | `administrator` | `super_administrator`.

**user_roles** — a person may hold more than one role when authorised.

Administrators must not receive blanket access to every student’s private fields. Scope reads to what the duty requires.

## Academic catalogue (first migration)

**programme** — `id`, `slug`, `name`, `category`, `status` (`available` \| `coming_soon` \| `preview`), `duration_years`, `blurb`, timestamps.

**academic_year** — `id`, `programme_id` (FK), `year_number` (1–4).

**semester** — `id`, `academic_year_id` (FK), `semester_number` (1–2).

**module** — `id`, `semester_id` (FK), `code` (e.g. IT212), `name`, `credits` (nullable until confirmed).

Unique: `(programme_id, slug)`, `(semester_id, code)`.

## Versioned learning content

**lessons** — identity and placement: `module_id`, `creator_id`, `title`, `status`, `published_version_id` (nullable FK to `lesson_versions`).

**lesson_versions** — immutable snapshot once submitted: body, attachments, `version_number`, author, checksum, created_at. Draft rows may still be edited; submitted/published rows are not silently rewritten.

**content_reviews** — `version_id`, reviewer, decision (`approve` \| `reject` \| `request_changes`), feedback, timestamps. History is appended, not overwritten.

**questions**, **question_versions**, **quizzes**, **quiz_questions** — same versioning for stems, keys, explanations, and scoring rules so a later edit cannot rewrite a completed attempt.

Overall lesson status and version status are separate. Example: lesson published at version 3 while version 4 is `IN_REVIEW`. Students still see version 3.

Allowed transitions (validated in FastAPI, not by writing a status column from the client):

| From | To |
| --- | --- |
| `DRAFT` | `IN_REVIEW` |
| `IN_REVIEW` | `CHANGES_REQUESTED` or `APPROVED` |
| `CHANGES_REQUESTED` | `IN_REVIEW` (after a new submitted version) |
| `APPROVED` | `PUBLISHED` |
| `PUBLISHED` | `UNPUBLISHED` |
| any retired path | `ARCHIVED` |

## Student learning (after the review workflow)

`enrolment`, `attempt` (stores the question-version ids used), `progress`, `bookmark`.

## Audit

**audit_logs** — actor, action, resource type/id, version id, payload, timestamp. Required for submit, approve, reject, publish, unpublish, role changes, and suspensions. Super administrators cannot bypass this.

## Seed (Computing)

Seed BSc Computing as `available`. Seed Year 2 Semester 1:

| Code | Name |
| --- | --- |
| IT211 | Systems Analysis and Design |
| IT212 | Database Management Systems |
| IT213 | Networking and Data Communication I |
| IT214 | Operating Systems |
| IT215 | Discrete Mathematics |

Other years/semesters: rows can exist with no modules until the official list is confirmed. The listed **1,290 credits** is from the supplied programme sheet — confirm meaning (programme credits vs contact hours) before storing it as a constraint.

## Backup

When PostgreSQL is live on Railway: use the provider’s managed backups, keep credentials out of Git, run schema changes through Alembic, and test a restore before storing real student records. Record the runbook in `docs/operations/` at that time.
