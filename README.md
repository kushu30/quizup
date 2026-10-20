# QuizUp

Open-source, self-hostable, AI-assisted real-time assessment platform. Hosts build quizzes (or generate questions with AI) and run them as live sessions, adaptive sessions or timed, proctored exams. Students join with a code, no account needed.

- Live quizzes with a leaderboard, adaptive quizzes (Elo and mastery tracking) and timed exams with proctoring signals
- Question bank grouped into modules, drag-to-reorder, images, shuffle and random question pools
- Invited-only quizzes with personal tokens, optionally emailed
- Live analytics, session history, CSV export, branded assessments

## Contents

1. [Tech stack](#tech-stack)
2. [Repository layout](#repository-layout)
3. [Getting started](#getting-started)
4. [Environment variables](#environment-variables)
5. [Scripts](#scripts)
6. [Testing and CI](#testing-and-ci)
7. [Roles and host access](#roles-and-host-access)
8. [Deploying](#deploying)
9. [More documentation](#more-documentation)

## Tech stack

| Part     | Technology                                                 |
| -------- | ---------------------------------------------------------- |
| Web      | React 18, Vite, TypeScript                                 |
| Server   | Node 22, Express, Socket.IO, TypeScript                    |
| Database | Supabase (Postgres, Auth, Storage) with row-level security |
| Shared   | Zod schemas and pure logic used by both apps               |
| Tests    | Vitest, Testing Library                                    |
| Hosting  | Vercel (web), Render (server), Supabase (database)         |

## Repository layout

```
apps/
  web/            React single-page app (host console, student play screens)
  server/         Express + Socket.IO server (REST API, live engine, mail, AI)
packages/
  shared/         Zod schemas, scoring, Elo/BKT, shuffle and pool logic
supabase/
  migrations/     Numbered SQL migrations (0001 to 0016)
  seed.sql        Local seed data
docs/             Feature reference, email samples, plans
.github/workflows CI
render.yaml       Render blueprint for the server
vercel.json       Vercel config for the web app
```

## Getting started

### 1. Prerequisites

- **Node 22** (the repo has an `.nvmrc`, so `nvm use` works)
- **Git**
- **Docker** and the **[Supabase CLI](https://supabase.com/docs/guides/cli)**, only if you want your own local database (option B below)

### 2. Clone and install

```sh
git clone <repo-url> quizup
cd quizup
nvm use
npm install
```

`npm install` at the root installs all three workspaces.

### 3. Environment files

There are two env files, one per app. Both are git-ignored.

| File               | Template                   |
| ------------------ | -------------------------- |
| `apps/server/.env` | `apps/server/.env.example` |
| `apps/web/.env`    | `apps/web/.env.example`    |

Pick one way to get a database:

**Option A: use the shared Supabase project (quickest).** The project owner sends you the two `.env` files privately. Put them at `apps/server/.env` and `apps/web/.env` and skip to step 4.

> **Warning:** the shared env points at a real database. Never run `supabase db reset` against it, because that wipes data. Ask before applying migrations, and use a test host account for experiments.

**Option B: your own local Supabase.**

```sh
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

supabase start        # needs Docker running
supabase db reset     # applies every migration and runs seed.sql
supabase status       # prints the keys
```

Copy the `service_role` key into `SUPABASE_SERVICE_ROLE_KEY` in `apps/server/.env` and the `anon` key into `VITE_SUPABASE_ANON_KEY` in `apps/web/.env`. The URLs in the templates already point at the local stack (`http://127.0.0.1:54321`). Email confirmation is off locally, so sign-up signs you in at once.

Everything else (AI, email, Google sign-in) is optional. The app boots without it and the related buttons stay hidden or return a clear message.

### 4. Run

```sh
npm run dev
```

This starts the shared package in watch mode, the server on <http://localhost:4000> and the web app on <http://localhost:5173>.

### 5. Check it works

- `curl http://localhost:4000/health` returns `{"status":"ok", ...}`.
- Open <http://localhost:5173>. The footer **Status** button shows "Server OK" and a socket round-trip time. Red means CORS, the server URL or websockets are misconfigured.
- Sign up at `/login`. Every new account is a student, so to reach the host area follow [Roles and host access](#roles-and-host-access).

### 6. Try a live session

1. Sign in as a host, create a quiz, add a few questions and approve them.
2. Open the quiz and click **Start live session**. The console shows a join code.
3. In a private window (a separate identity), open `/join`, enter the code and a name.
4. Start the quiz from the host console. Refresh the student window mid-question: it returns to the same place with the timer still correct.

## Environment variables

The server and the web app both fail at startup with a list of the invalid variables.

### Server (`apps/server/.env`)

| Variable                    | Required | Description                                                   |
| --------------------------- | -------- | ------------------------------------------------------------- |
| `PORT`                      | no       | Listen port, default 4000                                     |
| `CORS_ORIGINS`              | yes      | Comma-separated allowed web origins                           |
| `SUPABASE_URL`              | yes      | Supabase project URL                                          |
| `SUPABASE_SERVICE_ROLE_KEY` | yes      | Service role key. Server only, never in the web app           |
| `LLM_PROVIDER`              | no       | `gemini` (default)                                            |
| `GEMINI_API_KEY`            | no       | Enables AI question generation                                |
| `GEMINI_MODEL`              | no       | Overrides the default Gemini model id                         |
| `OPENAI_API_KEY`            | no       | Reserved for later                                            |
| `APP_URL`                   | no       | Public web URL used in emails (default: first `CORS_ORIGINS`) |
| `BREVO_API_KEY`             | no       | Brevo API key. Sends over HTTPS, works on Render free         |
| `SMTP_HOST`                 | no       | Mail server, for example `smtp-relay.brevo.com`               |
| `SMTP_PORT`                 | no       | Default 587 (465 uses implicit TLS)                           |
| `SMTP_USER`                 | no       | Mail server login                                             |
| `SMTP_PASSWORD`             | no       | Mail server password or SMTP key                              |
| `MAIL_FROM`                 | no       | Sender address, must be allowed by your provider              |
| `MAIL_FROM_NAME`            | no       | Sender name, default `QuizUp`                                 |
| `MAIL_REPLY_TO`             | no       | Optional reply address                                        |

Email is off until `MAIL_FROM` and either `BREVO_API_KEY` or all of `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` are set.

### Web (`apps/web/.env`)

| Variable                   | Required | Description                                     |
| -------------------------- | -------- | ----------------------------------------------- |
| `VITE_SERVER_URL`          | yes      | Public URL of the server                        |
| `VITE_SUPABASE_URL`        | yes      | Supabase project URL                            |
| `VITE_SUPABASE_ANON_KEY`   | yes      | Supabase anon key                               |
| `VITE_GOOGLE_AUTH_ENABLED` | no       | `true` shows the Google button, default `false` |

Anything starting with `VITE_` is shipped to the browser. Never put a secret in the web env.

## Scripts

Run from the repository root.

| Command             | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Shared (watch), server and web together    |
| `npm test`          | Whole test suite, no database needed       |
| `npm run lint`      | ESLint                                     |
| `npm run typecheck` | Type-check every workspace                 |
| `npm run build`     | Production build of shared, server and web |
| `npm run format`    | Prettier                                   |

Utilities (not part of CI):

| Command                                 | Purpose                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run mail:smoke -- you@example.com` | Send one test email to check your mail settings                               |
| `npm run llm:smoke`                     | One real AI call to check your Gemini key                                     |
| `npm run adaptive:sim`                  | Simulate an adaptive session, no database                                     |
| `npm run load:sim`, `proctor:sim`       | Simulated latency checks for analytics and proctoring                         |
| `npm run bkt:fit`, `adaptive:eval`      | Offline model fitting and evaluation, see [docs](docs/adaptive-evaluation.md) |

## Testing and CI

`npm test` runs the unit tests and integration tests that boot the real server with an in-memory repository and several socket clients. No database is needed.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build, and separately starts Supabase and applies every migration from scratch. Run lint, typecheck and tests locally before you push.

Known limitation: live session state (current question, timers, who answered) lives in the memory of one server process. Run a single instance. On boot every session that is not ended is marked ended, so a restart ends any running session.

## Roles and host access

- `admin`: the superadmin. Set once by hand, never through the app.
- `host`: only an email on the admin's host allowlist (`/admin`), and only once that email is confirmed.
- `student`: everyone else, and the default. Joining a quiz is open to everyone, including anonymous users.

Role never comes from client input. A database trigger assigns it at sign-up, and users can only update their own `name`.

**Become admin locally:** sign up with your email, then run this once in the Supabase SQL editor (Studio is at <http://127.0.0.1:54323> locally):

```sql
update public.profiles set role = 'admin' where email = '<your email>';
```

Then open `/admin`, add a host's email to the allowlist after they have created an account, and they become a host at once. Removing the email demotes them. Turn **Confirm email** on in production.

## Deploying

**Database (Supabase).** Create a project, then `supabase link` and `supabase db push`. Apply new migrations **before** deploying a server that reads new columns.

**Server (Render).** Create a Blueprint from the repo; `render.yaml` defines the service and health check. Fill the variables marked `sync: false`, and set `CORS_ORIGINS` to your Vercel URL(s), comma-separated.

**Web (Vercel).** Import the repo. The root `vercel.json` sets install, build, output directory and the SPA rewrite. Set `VITE_SERVER_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**Keeping the free Render server awake.** Free services sleep after 15 idle minutes and take about a minute to wake. GitHub's scheduler proved unreliable for this, so use a free external monitor (cron-job.org or UptimeRobot) that requests `<server>/health` every 5 minutes. One always-on service fits in Render's 750 free hours a month. Before a real exam, open `/health` yourself a few minutes early.

## More documentation

- [docs/features.md](docs/features.md): how each feature works (exam mode and proctoring signals, analytics, adaptive mode, branding, email, invited-only quizzes, AI generation, Google sign-in, modules, order, images and delivery)
- [docs/adaptive-evaluation.md](docs/adaptive-evaluation.md): BKT fitting and the simulated adaptive evaluation
- [docs/email-samples.md](docs/email-samples.md): every email the app sends
- [docs/superpowers/plans/2026-10-20-teacher-workflow-roadmap.md](docs/superpowers/plans/2026-10-20-teacher-workflow-roadmap.md): the teacher-workflow roadmap (all five phases done)

To ask for host access on the hosted app, write to kushagra.shukla2005@gmail.com.
