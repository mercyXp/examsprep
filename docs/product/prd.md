# Product requirements — ExamsPrep

## Vision

ExamsPrep helps Cavendish University Zambia students prepare for exams through programme-based revision: modules, quizzes, notes, mock exams, and an AI coach grounded in **published, reviewed** course materials.

The first release serves **Bachelor of Science in Computing**. Accounting, Law, Business, Health Sciences, and the rest of the university catalogue stay visible as coming soon until their content is actually ready.

## Who it is for

- **Students** at Cavendish University Zambia, starting with Computing (Years 1–4, two semesters each).
- **Content creators** who draft lessons, quizzes, and mock exams.
- **Administrators** who review academic quality and publish.
- **Super administrators** who assign roles and own platform configuration.
- Public visitors can browse the marketing site and programme catalogue without an account.

Not a multi-university catalogue yet. Programmes are organised by degree, not by institution.

## Problem

Revision is scattered across notes, chats, and past papers. Students do not have one place that follows their degree → year → semester → module, with honest status for programmes that are not ready. Publishing unreviewed material would mislead students, so creation and publication are separate rights.

## Roles

| Role | Can | Cannot |
| --- | --- | --- |
| Student | Browse entitled published content; sit quizzes; see own scores and progress; use bookmarks and the AI tutor; report issues | Publish, review, or change other students’ scores |
| Content creator | Create/edit own drafts; upload resources; submit for review; read feedback; resubmit | Publish; approve own (or others’) submissions; change student scores |
| Administrator | Review, request changes, reject, approve; publish only an approved version; unpublish with a reason; manage programmes/modules; limited account management | Approve a submission then publish a different unreviewed version; skip audit logging |
| Super administrator | All administrator capabilities plus role assignment, security policy, integrations, full audit logs | Bypass audit logs or version controls |

A user with both creator and administrator roles still cannot self-approve.

## MVP (now)

- Marketing site: landing (hero, what’s inside, programmes, how it works), features page, theme (light/dark).
- Programme discovery: Computing featured and available; four academic groups marked coming soon.
- Computing programme page: year and semester filters; Year 2 Semester 1 modules from the supplied curriculum.
- Shared header and footer on marketing pages.
- Sign in / create account / forgot password screens that do **not** pretend accounts exist.

## Next product slice

1. Users, roles, permissions, and FastAPI authentication (Railway + Postgres).
2. Programme / module models in Postgres (stop hardcoding the catalogue).
3. Lesson drafts, versions, submit → review → approve → publish.
4. Student access to published lessons only.
5. The same versioning pattern for quizzes and mock exams.
6. Admin review queue, audit logs, and permission tests.

## Success

- A visitor can find Computing from the homepage in one tap and see real module codes for Year 2 Semester 1.
- Coming-soon programmes never look like they open exam tools.
- Students never see a draft or an unapproved revision.
- Adding Accounting later does not require redesigning the catalogue.

## Out of scope for the current frontend MVP

Live quizzes, connected authentication, file uploads, payments, and multi-university search.
