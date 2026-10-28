# Hosting and deployment

The frontend, API, and database are three separate services. The browser talks only to Next.js. Next.js calls FastAPI. FastAPI is the only process that opens PostgreSQL.

## Production shape

| Component | Host | Role |
| --- | --- | --- |
| Next.js | Vercel | Landing, dashboard, lessons, quizzes |
| FastAPI | Render web service | Auth, business logic, APIs |
| PostgreSQL | Render Postgres | Users, programmes, lessons, questions, results, progress |
| Files | On the API disk for now (`MEDIA_ROOT`) | Images, video, audio, PDFs |
| AI | External API, later | Explanations and quiz drafts |

Railway deploys are paused, so Railway is not the current host. Keep the API and the database in the same Render region so the API can use the database’s internal URL.

Do not use Render’s free web sleep, or its free Postgres that expires and is then deleted, for real student records. A paid database is a new instance. Data moves only if you export it.

## Cost

While there are no live student accounts, Vercel Hobby and Render’s free tiers are enough. The free web service sleeps, and the free database is temporary.

Before real students use the platform, pay for an always-on API and a Postgres instance that does not expire.

## API service

Create the Render web service from this repo with root directory `api`.

| Setting | Value |
| --- | --- |
| Build | `pip install -e . && alembic upgrade head` |
| Start | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |

Environment variables on the API service:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The database **internal** URL, with the scheme rewritten to `postgresql+psycopg://`. A URL that starts with `postgresql://` fails because only psycopg 3 is installed. |
| `SECRET_KEY` | A long random string, different from the local default. |
| `CORS_ORIGINS` | The Vercel site origin, with no trailing slash. |
| `SEED_DEMO_USERS` | `false` before real students. `true` only while the demo accounts are intentional. |
| `SUPER_ADMIN_NAME` | One-time. See below. |
| `SUPER_ADMIN_EMAIL` | One-time. See below. |
| `SUPER_ADMIN_PASSWORD` | One-time. See below. |

`GET /health` means the process is up. `GET /health/db` means Postgres answered. `/` has no route and returns `{"ok": false, "message": "Not Found"}`.

The free Render plan has no shell. `alembic upgrade head` runs in the build command. Catalogue and role rows come from a database restore, or from `SEED_DEMO_USERS=false python -m app.seed` on a host that has a shell.

## Frontend

Keep the App Router app on Vercel. Set one server variable, then redeploy:

| Variable | Value |
| --- | --- |
| `API_URL` | The Render service URL, with no trailing slash. |

`API_URL` is read on the Vercel server. Do not use `NEXT_PUBLIC_API_URL`. Do not put `DATABASE_URL`, the database password, or `SECRET_KEY` on Vercel.

If signup or sign-in says the account service isn’t running, Vercel could not open a connection to `API_URL`. A missing value makes that call go to `http://127.0.0.1:8000` inside Vercel, where the API is not running. A database problem shows up only after `/health` succeeds and `/health/db` fails.

## Production super administrator

Public signup creates a student and nothing else. Staff accounts are invited; assignment screens do not promote a student. They never grant `super_administrator`. The demo super administrator (`super@examsprep.local`) is created only when `SEED_DEMO_USERS=true`.

Create the real super administrator once. Both ways below refuse the demo email, the demo password, an email that already belongs to someone, and a second super administrator. An existing account is not promoted. There is no public API and no website form.

On Render, set these three variables on the API service and redeploy:

```text
SUPER_ADMIN_NAME=Your Name
SUPER_ADMIN_EMAIL=you@your-domain.com
SUPER_ADMIN_PASSWORD=a long password that is not the demo password
```

Sign-in checks the email and password stored on the user row. It does not check these variables. On startup the API writes that row: it creates the account, or, if this email is already the super administrator, it stores the configured password.

If the only super administrator is the demo account `super@examsprep.local`, that user is kept and the super-administrator role moves to the configured email. The demo password can still sign in, but that account is no longer a super administrator. A different real super administrator is left unchanged, and the log says one already exists.

The deploy log prints `Super administrator created for you@your-domain.com.` or `Super administrator ready for you@your-domain.com.` It does not print the password. Delete the three variables and redeploy. While they remain set, a restart keeps that password on the configured account, and the password stays visible in the Render dashboard.

If the log says an account with that email already exists, the address belongs to someone who is not a super administrator. Choose a different email. The command does not promote that account.

A host with a shell can prompt for the same account instead:

```bash
python -m app.create_super_admin
```

The shell command does not create the `super_administrator` role. The Render variables do, when the tables from `alembic upgrade head` exist and that role row is missing. Who may assign the other roles is described in [access-control.md](../architecture/access-control.md).

Creator and administrator accounts are invited from Staff after this account exists. Password reset and those invitations are sent with Resend. See [Transactional email](#transactional-email) below.

Google sign-in uses the same Web client ID in two places. On Vercel set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. On the Render API set `GOOGLE_CLIENT_ID` to that same value. Do not put a client secret in the frontend. In Google Cloud, allow JavaScript origins `http://localhost:3000` and `https://www.examsprep.xyz`. A new Google account becomes a student. An existing account signs in with the roles it already has.

## Transactional email

Mail is sent by the API through [Resend](https://resend.com). The browser never receives `RESEND_API_KEY`.

On the Render API service set:

```text
RESEND_API_KEY=re_...
EMAIL_FROM=ExamsPrep <invites@examsprep.xyz>
FRONTEND_URL=https://www.examsprep.xyz
```

`FRONTEND_URL` has no trailing slash. Invitation and password-reset links are built from it. `APP_URL` is used only when `FRONTEND_URL` is empty, which is the local default `http://localhost:3000`.

In Resend, add the domain you send from, then publish the SPF and DKIM records Resend shows for that domain. Wait until Resend marks the domain verified. `EMAIL_FROM` must use an address on that verified domain. Do not put the API key in Git, the frontend, or the Vercel project.

Password reset always answers “If an account exists for that email, we sent a reset link.” It does not say whether the address is registered, and it never includes the link in the API response. Staff invitations still show the acceptance link to the signed-in super administrator only when Resend does not accept the message.

A super administrator can send a fixed test message to their own sign-in address with `POST /api/admin/email/test`. A shell on the API host can do the same:

```bash
python -m app.send_test_email you@your-domain.com
```

Apply the password-reset table before relying on reset links:

```bash
alembic upgrade head
```

That migration is `20261022_0014`. It adds `password_reset_tokens` and does not change existing user rows.

## Database access from a laptop

The API uses the internal `postgresql+psycopg://` URL. `pg_dump` and `pg_restore` use the database’s **external** URL, which starts with `postgresql://` and includes `sslmode=require`. Do not put either URL in Git.

Local Postgres for development listens on port **5433**. The walkthrough is [SETUP.md](../SETUP.md).
