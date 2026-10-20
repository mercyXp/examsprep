# Hosting and deployment

ExamsPrep does not need a rented machine. The frontend, API, and database are three separate services that talk over HTTPS.

## Production shape

| Component | Host | Role |
| --- | --- | --- |
| Next.js | Vercel | Landing, dashboard, lessons, quizzes |
| FastAPI | Railway | Auth, business logic, AI, APIs |
| PostgreSQL | Railway (managed) | Users, programmes, lessons, questions, results, progress |
| Files | Object storage, later | Images, PDFs, Word documents |
| AI | External API, later | Explanations and quiz drafts |

Railway hosts FastAPI and PostgreSQL in one project. They remain separate services: FastAPI is the application server; PostgreSQL stores persistent data.

Render is a fallback if Railway is a poor fit. Do not use Render’s free web sleep or 30-day free Postgres for student records.

## Local database

Use the Windows PostgreSQL installer and pgAdmin. Create a database named `examsprep`, put the postgres password in `api/.env`, then from `api/`:

```bash
python -m venv .venv
pip install -e .
alembic upgrade head
python -m app.seed
```

Full local walkthrough (pgAdmin, port, PowerShell, seed, viewing tables): [SETUP.md](../SETUP.md). Keep `DATABASE_URL` out of Git.

## Cost

While the product is still being built (no live accounts, no student data), stay as close to **K0/month** as the trial tiers allow: Vercel Hobby plus Railway’s trial.

Before real students use the platform, pay a **small monthly amount** for a always-on FastAPI service and a managed Postgres that does not expire. Monitor usage and upgrade when load is real.

## Communication

Example sign-in path:

1. Student clicks Sign in on Next.js (Vercel).
2. FastAPI validates credentials (Railway API).
3. PostgreSQL returns the user (Railway database, private network).
4. Next.js loads the dashboard from published content and the student’s progress.

Keep the database private. Store secrets in environment variables. Use HTTPS, Alembic migrations, and managed backups before storing academic records.

## Frontend

Keep the App Router app on Vercel. Point it at the Railway API with `NEXT_PUBLIC_API_URL` (or a server-only equivalent for privileged calls). Do not put database credentials in the Next.js app.
