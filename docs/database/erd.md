# Database design

No database is deployed yet. Catalogue rows live in `app/src/data/programmes.ts`. The schema below is what to migrate into PostgreSQL so Computing is one programme among many.

## Hierarchy

```
university (optional later)
  programme
    academic_year
      semester
        module
          topic
            resource          notes, PDFs, past papers
            quiz
              question
            flashcard
          attempt / progress  per student
```

## Core tables (first migration)

**programme** — `id`, `slug`, `name`, `category`, `status` (`available` \| `coming_soon` \| `preview`), `duration_years`, `blurb`, timestamps.

**academic_year** — `id`, `programme_id` (FK), `year_number` (1–4).

**semester** — `id`, `academic_year_id` (FK), `semester_number` (1–2).

**module** — `id`, `semester_id` (FK), `code` (e.g. IT212), `name`, `credits` (nullable until confirmed).

Unique: `(programme_id, slug)`, `(semester_id, code)`.

## Later

- `topic`, `resource`, `quiz`, `question`, `flashcard`
- `user`, `enrolment`, `attempt`, `progress`
- Indexes on `programme.slug`, `module.code`, `attempt.user_id`

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

When PostgreSQL is live: nightly managed backups, restore tested quarterly. Record the runbook in `docs/operations/` at that time.
