# ExamsPrep API

FastAPI + PostgreSQL. This folder owns the database schema, migrations, seed data, auth, CMS, learn APIs, and scoped staff assignments.

## Local setup

Step-by-step for Windows PostgreSQL, pgAdmin, migrations, seed, and viewing tables: [docs/SETUP.md](../docs/SETUP.md).

```bash
cd api
copy .env.example .env
python -m venv .venv
.\.venv\Scripts\activate
pip install -e .
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

`GET /health` and `GET /health/db` confirm the process and the database.

## What is seeded

- Roles: student, creator, administrator (program administrator), super_administrator
- Named permissions mapped to those roles
- BSc Computing (`available`) with years 1–4 and both semesters
- Year 2 Semester 1 modules IT211–IT215
- Coming-soon programme stubs: Accounting, Law, Business, Health Sciences
- Demo assignments: Ann Admin → Computing; Cam Creator → Computing IT212 and IT213

Demo logins (password `examsready`): `student@examsprep.local`, `creator@examsprep.local`, `admin@examsprep.local`, `super@examsprep.local`. Google sign-in verifies a Google ID token when `GOOGLE_CLIENT_ID` is set. New Google accounts are students. Password reset and staff invitations send mail through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set. See [deployment.md](../docs/operations/deployment.md).

Access model: [docs/architecture/access-control.md](../docs/architecture/access-control.md). Lesson JSON schema and studio notes: [docs/cms/lesson-studio.md](../docs/cms/lesson-studio.md). Solana badges, wallet linking, and prize pools: [docs/architecture/solana.md](../docs/architecture/solana.md).

```bash
python -m unittest tests.test_cms_slides tests.test_media
```

## Production

Signup creates students only. The demo super administrator is created only when `SEED_DEMO_USERS=true`. Production leaves that flag `false`.

Create the real super administrator once with `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, and `SUPER_ADMIN_PASSWORD` on the API host, or with `python -m app.create_super_admin` where a shell is available. Hosting, the database URL scheme, and the one-time account steps are in [docs/operations/deployment.md](../docs/operations/deployment.md). Who can assign the other roles is in [docs/architecture/access-control.md](../docs/architecture/access-control.md).
