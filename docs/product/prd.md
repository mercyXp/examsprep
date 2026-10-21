# Product requirements — ExamsPrep

## Vision

ExamsPrep helps Cavendish University Zambia students prepare for exams through programme-based revision: modules, quizzes, notes, mock exams, and an AI coach grounded in **published, reviewed** course materials.

The first release serves **Bachelor of Science in Computing**. Accounting, Law, Business, Health Sciences, and the rest of the university catalogue stay visible as coming soon until their content is actually ready.

## Who it is for

- **Students** at Cavendish University Zambia, starting with Computing (Years 1–4, two semesters each).
- **Content creators** who draft lessons, quizzes, and mock exams for **explicitly assigned programme–module combinations**.
- **Program administrators** who manage all content inside their assigned programme or programmes, review submissions, and assign creators within that scope.
- **Super administrators** who own the catalogue, assign program administrators and creators anywhere, and inspect audit logs.
- Public visitors can browse the marketing site and programme catalogue without an account.

Not a multi-university catalogue yet. Programmes are organised by degree, not by institution.

## Problem

Revision is scattered across notes, chats, and past papers. Students do not have one place that follows their degree → year → semester → module, with honest status for programmes that are not ready. Publishing unreviewed material would mislead students, so creation and publication are separate rights.

## Roles

| Role | Scope | Can | Cannot |
| --- | --- | --- | --- |
| Student | Enrolled or authorised published content | View published lessons; complete activities; track personal progress | Publish, review, or see unpublished content |
| Content creator | Only assigned programme–module pairs | Create and edit lessons for those modules; save drafts; preview; submit for review | Publish; manage other modules or programmes; assign users |
| Program administrator | One or more assigned programmes | Manage every module and lesson in those programmes; review and publish; assign content creators inside that scope | Grant access outside assigned programmes; assign other program administrators |
| Super administrator | Entire platform | Create programmes and modules; assign administrators and creators; review, publish, and inspect audit logs | Bypass audit logs |

A content creator assignment is a separate row from the user’s role. One person can hold several creator assignments without becoming a program administrator. Assignments always name **both** the programme and the module.

See [access-control.md](../architecture/access-control.md) for the process map, enforcement rules, and seeded demo accounts.

## MVP (now)

- Marketing site: landing (hero, what’s inside, programmes, how it works), features page, theme (light/dark).
- Programme discovery: Computing featured and available; four academic groups marked coming soon.
- Computing programme page: year and semester filters; Year 2 Semester 1 modules from the supplied curriculum.
- Email/password accounts, onboarding, student dashboard, My Courses, and the lesson player.
- Admin CMS: modules, chapters, typed lesson editor, submit → review → publish.
- Scoped staff roles: Super Admin, program administrator, content creator (programme + module assignments).

## Next product slice

Auth, scoped staff roles, the lesson editor, student player, and submit → review → publish for lessons are in place. Remaining:

1. Apply the same versioning and review rules to questions, quizzes, and mock exams.
2. Dedicated review queue UI and scoped audit-log views.
3. Move the marketing catalogue off `app/src/data/` onto FastAPI.
4. Permission tests covering URL bypass and assignment revocation.

## Success

- A visitor can find Computing from the homepage in one tap and see real module codes for Year 2 Semester 1.
- Coming-soon programmes never look like they open exam tools.
- Students never see a draft or an unapproved revision.
- A content creator cannot open another module by changing a URL.
- Adding Accounting later does not require redesigning the catalogue.

## Out of scope for the current slice

Live quizzes with the same review workflow, file uploads, payments, multi-university search, Google sign-in, and password reset email.
