# Local setup

ExamsPrep is a Next.js app in `app/` and a FastAPI + PostgreSQL backend in `api/`. There is no Docker. Local Postgres is the Windows installer plus pgAdmin, or `psql` from PowerShell.

This machine currently runs **PostgreSQL 18** on port **5433** (not 5432), because PostgreSQL 17 is also installed. If your installer used 5432, use 5432 everywhere below.

## What you need

- Python 3.12
- Node.js 20+ (for the frontend)
- PostgreSQL and pgAdmin from the [official Windows installer](https://www.postgresql.org/download/windows/)

Remember the **postgres** password and the **port** shown at the end of the installer.

## 1. Confirm Postgres is running

In PowerShell:

```powershell
Get-Service *postgres*
```

The service should be **Running** (for example `postgresql-x64-18`). If it is stopped:

```powershell
Start-Service postgresql-x64-18
```

To see which port it is listening on:

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.OwningProcess -in @(Get-Process postgres -ErrorAction SilentlyContinue).Id } |
  Select-Object LocalAddress, LocalPort
```

Use that port in pgAdmin, `psql`, and `api/.env`.

## 2. Connect pgAdmin

1. Open **pgAdmin 4**.
2. If **Object Explorer → Servers** is empty, click **Add New Server**.
3. **General** tab: **Name** `PostgreSQL`.
4. **Connection** tab:
   - **Host name/address:** `localhost`
   - **Port:** `5433` on this machine (`5432` if that is what you installed)
   - **Maintenance database:** `postgres`
   - **Username:** `postgres`
   - **Password:** the password from the installer
5. Tick **Save password** if you want, then **Save**.

A connection timeout on 5432 almost always means Postgres is on another port. Check step 1 and retry.

## 3. Create the `examsprep` database

**pgAdmin**

1. Expand **Servers → PostgreSQL → Databases**.
2. Right-click **Databases** → **Create** → **Database…**
3. **Database:** `examsprep`
4. **Owner:** `postgres`
5. **Save**

Or right-click the `postgres` database → **Query Tool**, run `api/scripts/create_database.sql`, and execute it.

**PowerShell**

`psql` is not on PATH by default:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -p 5433 -c "CREATE DATABASE examsprep;"
```

To use `psql` without the full path in this window:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\18\bin"
psql -U postgres -p 5433 -c "CREATE DATABASE examsprep;"
```

## 4. Configure the API

```powershell
cd C:\examsprep\api
copy .env.example .env
```

Edit `.env` and put your real password in the URL. If the password contains `@`, `#`, `/`, or `:`, URL-encode those characters.

```
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5433/examsprep
```

Do not commit `.env`.

## 5. Create tables and seed data

Do not paste the schema into pgAdmin. Alembic creates the tables.

```powershell
cd C:\examsprep\api
python -m venv .venv
.\.venv\Scripts\activate
pip install -e .
alembic upgrade head
python -m app.seed
```

Then start the API:

```powershell
uvicorn app.main:app --reload
```

- `GET http://127.0.0.1:8000/health` — process is up
- `GET http://127.0.0.1:8000/health/db` — database is reachable

### What the seed loads

- Roles: student, creator, administrator, super_administrator
- Named permissions mapped to those roles
- BSc Computing (`available`), years 1–4, both semesters
- Year 2 Semester 1 modules IT211–IT215
- Coming-soon programme stubs: Accounting, Law, Business, Health Sciences
- Local demo accounts (password for all is `examsready`):

| Email | Role |
| --- | --- |
| student@examsprep.local | Student |
| creator@examsprep.local | Content creator |
| admin@examsprep.local | Administrator |

You can also create a new account on `/signup`. New students go through `/onboarding` before the dashboard. The demo student account already has onboarding completed. Google and forgot-password still return an honest “not connected” response.

## 6. View tables in pgAdmin

1. Right-click **examsprep** → **Refresh**.
2. Expand **examsprep → Schemas → public → Tables**.

You should see `users`, `roles`, `permissions`, `programmes`, `academic_years`, `semesters`, `modules`, `lessons`, `lesson_versions`, `content_reviews`, `audit_logs`, and the rest.

To inspect rows: right-click a table → **View/Edit Data → All Rows**.

Or right-click **examsprep** → **Query Tool**:

```sql
SELECT slug, name, status FROM programmes;
SELECT code, name FROM modules ORDER BY code;
```

## 7. Run the Next.js app

Keep the API running. In a second terminal:

```powershell
cd C:\examsprep\app
copy .env.example .env
npm install
npm run dev
```

`app/.env` should contain `API_URL=http://127.0.0.1:8000`.

Open [http://localhost:3000/login](http://localhost:3000/login) and sign in with `student@examsprep.local` / `examsready`. The marketing catalogue is still in-repo until those pages read FastAPI.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| `connection timeout expired` on port 5432 | Postgres 18 on this machine listens on **5433**. Change the port in pgAdmin and `DATABASE_URL`. |
| pgAdmin cannot connect | Confirm `Get-Service postgresql-x64-18` is Running. Start it if needed. |
| Tables folder is empty | Run `alembic upgrade head`, then right-click **examsprep** → **Refresh**. |
| `password authentication failed` | Use the installer postgres password. Encode special characters in the URL. |
| `psql` is not recognized | Use `C:\Program Files\PostgreSQL\18\bin\psql.exe`, or add that `bin` folder to PATH. |
| Sign in says the account service isn’t running | Start FastAPI with `uvicorn app.main:app --reload` from `api/`, and set `API_URL=http://127.0.0.1:8000` in `app/.env`. |

Production hosting (Vercel + Railway) is described in [operations/deployment.md](operations/deployment.md). Schema details are in [database/erd.md](database/erd.md).
