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

Access model: [docs/architecture/access-control.md](../docs/architecture/access-control.md).

## Railway

Create a Postgres service and a FastAPI service in the same project. Set `DATABASE_URL` to a `postgresql+psycopg://` URL. Run `alembic upgrade head` and `python -m app.seed` on deploy before storing student records.
