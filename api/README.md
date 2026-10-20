# ExamsPrep API

FastAPI + PostgreSQL. This folder owns the database schema, migrations, and seed data. Auth and review endpoints come after the schema is running.

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

- Roles: student, creator, administrator, super_administrator
- Named permissions mapped to those roles
- BSc Computing (`available`) with years 1–4 and both semesters
- Year 2 Semester 1 modules IT211–IT215
- Coming-soon programme stubs: Accounting, Law, Business, Health Sciences

No user accounts are created. Login remains disconnected until authentication is implemented.

## Railway

Create a Postgres service and a FastAPI service in the same project. Set `DATABASE_URL` to a `postgresql+psycopg://` URL. Run `alembic upgrade head` and `python -m app.seed` on deploy before storing student records.
