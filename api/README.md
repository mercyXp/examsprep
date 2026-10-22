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

Demo logins (password `examsready`): `student@examsprep.local`, `creator@examsprep.local`, `admin@examsprep.local`, `super@examsprep.local`. Google and password reset are still disconnected.

Access model: [docs/architecture/access-control.md](../docs/architecture/access-control.md). Lesson JSON schema and studio notes: [docs/cms/lesson-studio.md](../docs/cms/lesson-studio.md).

```bash
python -m unittest tests.test_cms_slides tests.test_media
```

## Production super administrator

Public signup creates students only. `python -m app.seed` creates the demo super administrator only when `SEED_DEMO_USERS=true`. Production must leave that flag `false`.

Create the real super administrator once, from the API environment that already has `DATABASE_URL` set. The command prompts for the name, email, and password. It does not print the password or the database URL.

```bash
python -m app.create_super_admin
```

The `super_administrator` role must already exist. A database restored from the local backup has it. On an empty migrated database, `SEED_DEMO_USERS=false python -m app.seed` creates roles and the course catalogue without demo accounts, and still does not create a super administrator. Run the bootstrap command after that.

The command refuses demo credentials, an email that already exists, and a second super administrator. It is not available from the API or the website.

## Railway

Create a Postgres service and a FastAPI service in the same project. Set `DATABASE_URL` to a `postgresql+psycopg://` URL. Run `alembic upgrade head` and `python -m app.seed` on deploy before storing student records.
