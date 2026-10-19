# QuizUp

Open-source, self-hostable, AI real-time assessment platform.

## Phase 0

Monorepo skeleton: shared types and schemas, Supabase schema with RLS, an Express + Socket.IO server with `/health` and a time ping, and a React web app that proves both are reachable.

### Prerequisites

- Node 22 (`nvm use`)
- Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli)

### Environment setup

```sh
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

Start Supabase, then copy the keys it prints (`supabase status`) into the env files: the `service_role` key goes into `apps/server/.env`, the `anon` key into `apps/web/.env`.

```sh
supabase start
supabase db reset
```

`supabase db reset` applies `0001_schema.sql` and `0002_rls.sql` and runs `seed.sql`.

### Run

```sh
npm install
npm run dev
```

This runs the shared package in watch mode, the server on `http://localhost:4000` and the web app on `http://localhost:5173`.

Other scripts: `npm run lint`, `npm run format`, `npm run typecheck`, `npm run build`.

### Verify

- `curl http://localhost:4000/health` returns `{"status":"ok","time":"...","uptimeSeconds":N}`.
- Open `http://localhost:5173`. The landing page shows a green "Server OK" badge and a "Socket round trip" badge with the latency in milliseconds. Red badges mean CORS, the server URL or websockets are misconfigured.
- Sign up at `/login`: every new account is a student. `/host` redirects non-hosts to `/` with a "Host access required" message, and unauthenticated visits go to `/login`. See Roles and host access below.
- `/join` validates the join code (6 letters or digits) and display name, then shows "joining arrives in Phase 1".

With email confirmations disabled (the local default), sign-up signs you in immediately.

### Roles and host access

- `admin`: the superadmin. Set once by hand, never through the app.
- `host`: only an email on the admin's host allowlist (`/admin`), and only once that email is confirmed.
- `student`: everyone else, and the default. Joining a quiz is open to everyone, including anonymous users.

Role never comes from client input. A database trigger assigns it at sign-up, and users can only update their own `name`.

Bootstrap the admin: sign up with the admin email, then run this once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = '<admin email>';
```

Notes:

- Turn Confirm email on in production. Hosts are only promoted once their email is confirmed.
- Add a host's email to the allowlist after that person has created their account. Adding promotes them at once, and removing demotes them.

### Quiz management

Hosts (and the admin) manage quizzes from `/host`: create, rename, change mode and delete quizzes; add, edit and delete questions; import questions from CSV; and search the question bank at `/host/questions` by text, topic and difficulty. All of it goes through the server API, which validates every request with the shared Zod schemas and checks that the quiz belongs to the caller.

CSV import: header row `topic,difficulty,stem,option_a,option_b,option_c,option_d,correct`. Difficulty is `easy`, `medium` or `hard`; `correct` is `A` to `D`. If any row is invalid nothing is imported and the bad rows are listed.

API (all need `Authorization: Bearer <access token>` from a host or admin): `GET/POST /quizzes`, `GET/PATCH/DELETE /quizzes/:quizId`, `POST /quizzes/:quizId/questions`, `POST /quizzes/:quizId/questions/import`, `GET /questions`, `GET /questions/topics`, `PATCH/DELETE /questions/:questionId`.

### Live sessions

Open a quiz at `/host/quizzes/:id`, set the seconds per question (5 to 120) and click Start live session. The host console at `/host/sessions/:id` shows the join code. Students enter the code and a display name at `/join` (no account needed), wait in the lobby, and the host starts the quiz and moves through questions with Next. Scoring, timing and question order are all decided by the server.

Try it locally with two browser windows:

1. Run `supabase db reset` (applies migration 0004), then `npm run dev`.
2. In window one, sign in as a host, open a quiz with at least one question and start a live session.
3. In a second window (a private window gives you a separate identity), open `/join`, enter the code and a name.
4. Add a third window to see rankings change. Refresh a student window mid-question: it returns to the same question with the timer still correct.

Tests:

```sh
npm test
```

Runs the unit tests (scoring, answer deadline and grace, clock offset, join codes, rate limiter) and an integration test that boots the real server with an in-memory repository and 2 to 3 socket.io clients. No database is needed.

Limitation: live session state (current question, timers, who answered) lives in the memory of one server process. Run a single instance. On boot every session that is not ended is marked ended, and a restart ends any running session.

### Adaptive mode

Every live session now keeps a skill rating per student (Elo) and a per-topic mastery estimate (Bayesian knowledge tracing), updated each time a question closes. Turning on **Adaptive mode** for a quiz (checkbox in the quiz editor, plus an optional number of rounds) changes only which questions students get: in synchronized rounds each student receives their own question, chosen by their current rating from the approved questions they have not seen. Scoring and the leaderboard stay points-based, and ratings and mastery are never sent to students. The host console shows a table with each student's rating and last question.

Constants (all exported from `packages/shared`):

| Constant              | Value                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| Elo K factor          | 32 for both students and questions                                            |
| Rating bounds         | 100 to 3000, students start at 1000                                           |
| Starting question Elo | easy 800, medium 1000, hard 1200                                              |
| Speed range           | a correct answer scores 0.9 (at the deadline) to 1.0 (instant); wrong scores 0 |
| Selection sigma       | 200 (weight `exp(-(Q-P)^2 / (2*200^2))`, floor 0.01)                          |
| BKT                   | p_init 0.3, p_learn 0.15, p_slip 0.1, p_guess 0.2                              |
| Default rounds        | min(10, approved questions), never more than the approved count               |

Run `supabase db reset` to apply migration 0005 (question ratings, the atomic rating function, rating snapshot columns on responses).

See it work without a database:

```sh
npm run adaptive:sim
```

It simulates 10 rounds over 30 questions for a strong (ability 1400) and a weak (ability 600) student, prints both difficulty sequences and rating trajectories, and a summary over 200 seeds. It is not run in CI.

### AI question generation

Hosts can generate multiple-choice questions into a quiz from a topic or a pasted passage (the "Generate with AI" panel in the quiz editor). Generated questions are saved as **pending** and tagged "AI generated". Review, edit and approve them under "Needs review"; only approved questions can ever be used in a live session.

Server environment variables (server only, never put them in the web app or on Vercel):

| Variable         | Required | Meaning                                                                                |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `LLM_PROVIDER`   | no       | Provider to use, only `gemini` today (default)                                         |
| `GEMINI_API_KEY` | no       | Google AI Studio key. Without it the server still boots and the endpoint returns 503   |
| `GEMINI_MODEL`   | no       | Overrides the built-in default model id (`gemini-3.8-flash` at the time of writing)    |

Getting a key: open [Google AI Studio](https://aistudio.google.com/apikey), sign in, choose Create API key, and paste it into `apps/server/.env` locally or into the environment of the Render service. Keep it on Render only; it must never reach the browser or Vercel. In the Google Cloud console for that project, set a quota limit and a budget alert or spend cap, because anyone who can reach a host account can trigger generations (the server also limits each host to 10 generations an hour and one at a time).

Check the integration with one real call (not part of CI, uses your key, prints only whether the output validated):

```sh
npm run llm:smoke
```

### Google sign-in

Create a Google OAuth client with redirect URI `<supabase url>/auth/v1/callback`. Locally, set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in your shell and set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, then `supabase stop && supabase start`. On a hosted project, enable the Google provider in the dashboard. The button on `/login` is hidden unless the web app has `VITE_GOOGLE_AUTH_ENABLED=true`; set it once the provider is enabled. Google accounts follow the same role rules: student unless the email is allowlisted.

### Deploy

Web on Vercel:

1. Import the repo. The root `vercel.json` sets install, build, output directory and the SPA rewrite.
2. Set `VITE_SERVER_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Server on Render:

1. Create a Blueprint from the repo; `render.yaml` defines the service and health check.
2. Fill the variables marked `sync: false`. Set `CORS_ORIGINS` to your Vercel URL(s), comma-separated.

Database: create a Supabase project and run `supabase link` then `supabase db push`.

### Environment variables

| Variable                    | Used by | Required | Description                                     |
| --------------------------- | ------- | -------- | ----------------------------------------------- |
| `PORT`                      | server  | no       | Listen port, default 4000                       |
| `CORS_ORIGINS`              | server  | yes      | Comma-separated allowed origins                 |
| `SUPABASE_URL`              | server  | yes      | Supabase project URL                            |
| `SUPABASE_SERVICE_ROLE_KEY` | server  | yes      | Service role key, server only, never in the web |
| `GEMINI_API_KEY`            | server  | no       | Enables AI question generation                  |
| `LLM_PROVIDER`              | server  | no       | `gemini` (default), see AI question generation  |
| `GEMINI_MODEL`              | server  | no       | Overrides the default Gemini model id           |
| `OPENAI_API_KEY`            | server  | no       | Reserved for later phases                       |
| `VITE_SERVER_URL`           | web     | yes      | Public URL of the server                        |
| `VITE_SUPABASE_URL`         | web     | yes      | Supabase project URL                            |
| `VITE_SUPABASE_ANON_KEY`    | web     | yes      | Supabase anon key                               |
| `VITE_GOOGLE_AUTH_ENABLED`  | web     | no       | `true` shows the Google button, default `false` |

The server and the web app both fail at startup with a list of the invalid variables.
