# Product requirements — ExamsPrep

## Vision

ExamsPrep helps Cavendish University Zambia students prepare for exams through programme-based revision: modules, quizzes, notes, mock exams, and an AI coach grounded in approved course materials.

The first release serves **Bachelor of Science in Computing**. Accounting, Law, Business, Health Sciences, and the rest of the university catalogue stay visible as coming soon until their content is actually ready.

## Who it is for

- **Students** at Cavendish University Zambia, starting with Computing (Years 1–4, two semesters each).
- **Administrators / content managers** (later): programmes, modules, notes, questions, and papers.
- Not a multi-university catalogue yet. Programmes are organised by degree, not by institution. Revisit this if other Zambian universities join.

## Problem

Revision is scattered across notes, chats, and past papers. Students do not have one place that follows their degree → year → semester → module, with honest status for programmes that are not ready.

## MVP (now)

- Marketing site: landing (hero, what’s inside, programmes, mock exam teaser), features page, theme (light/dark).
- Programme discovery: Computing featured and available; four academic groups marked coming soon.
- Computing programme page: year and semester filters; Year 2 Semester 1 modules from the supplied curriculum.
- Shared header and footer on every page.

## Later

- Study workspace per module (notes, AI tutor, quizzes, flashcards, past papers, progress).
- Student accounts, dashboard, and saved programmes.
- Remaining Computing semesters as official module lists are confirmed.
- Other degrees when content exists, using statuses **available**, **coming soon**, and **preview**.
- FastAPI backend, PostgreSQL, and AI retrieval over approved materials.

## Success

- A visitor can find Computing from the homepage in one tap and see real module codes for Year 2 Semester 1.
- Coming-soon programmes never look like they open exam tools.
- Adding Accounting later does not require redesigning the catalogue.

## Out of scope for MVP

Live quizzes, authentication, file uploads, payments, and multi-university search.
