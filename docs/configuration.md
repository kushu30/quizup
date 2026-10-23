# Configuration, scripts and deployment

Reference for the [README](../README.md).

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

| Command                                 | Purpose                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run mail:smoke -- you@example.com` | Send one test email to check your mail settings                                            |
| `npm run llm:smoke`                     | One real AI call to check your Gemini key                                                  |
| `npm run adaptive:sim`                  | Simulate an adaptive session, no database                                                  |
| `npm run load:sim`, `proctor:sim`       | Simulated latency checks for analytics and proctoring                                      |
| `npm run bkt:fit`, `adaptive:eval`      | Offline model fitting and evaluation, see [adaptive-evaluation.md](adaptive-evaluation.md) |

## Deploying

**Database (Supabase).** Create a project, then `supabase link` and `supabase db push`. Apply new migrations **before** deploying a server that reads new columns.

**Server (Render).** Create a Blueprint from the repo; `render.yaml` defines the service and health check. Fill the variables marked `sync: false`, and set `CORS_ORIGINS` to your Vercel URL(s), comma-separated.

**Web (Vercel).** Import the repo. The root `vercel.json` sets install, build, output directory and the SPA rewrite. Set `VITE_SERVER_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

**Keeping the free Render server awake.** Free services sleep after 15 idle minutes and take about a minute to wake. GitHub's scheduler proved unreliable for this, so use a free external monitor (cron-job.org or UptimeRobot) that requests `<server>/health` every 5 minutes. One always-on service fits in Render's 750 free hours a month. Before a real exam, open `/health` yourself a few minutes early.

## Testing and limits

`npm test` runs unit tests and integration tests that boot the real server with an in-memory repository and several socket clients, so no database is needed. CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build, and applies every migration to a fresh Supabase.

Live session state (current question, timers, who answered) lives in the memory of one server process, so run a single instance. On boot every session that is not ended is marked ended, so a restart ends any running session.

## Domains

The production address is **https://quizup.kushu30.me**. The Vercel address (`quizup-khaki.vercel.app`) stays as a backup and `http://localhost:5173` is for local development. The app has no address hardcoded; set these in each place:

| Where                                        | Setting                       | Value                                                                             |
| -------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| Vercel (project, Domains)                    | Add domain                    | `quizup.kushu30.me`                                                               |
| DNS (Namecheap)                              | `CNAME` record, host `quizup` | the target Vercel shows (usually `cname.vercel-dns.com`)                          |
| Render (server env)                          | `CORS_ORIGINS`                | `https://quizup.kushu30.me,https://quizup-khaki.vercel.app,http://localhost:5173` |
| Render (server env)                          | `APP_URL`                     | `https://quizup.kushu30.me`                                                       |
| Supabase (Authentication, URL Configuration) | Site URL                      | `https://quizup.kushu30.me`                                                       |
| Supabase (same page)                         | Redirect URLs                 | the three addresses above, each with `/**`                                        |
| Web env (Vercel)                             | `VITE_SERVER_URL`             | unchanged (the API address)                                                       |

`CORS_ORIGINS` also governs the live socket connection. List addresses exactly as the browser shows them, with `https://` and no trailing slash. The first entry is the fallback when `APP_URL` is empty. `APP_URL` decides the links and logos in emails, so set it to the production domain only once it opens.
