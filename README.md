# QuizUp

Open-source, self-hostable, AI-assisted real-time assessment platform. Hosts build quizzes (or generate questions with AI) and run them as live quizzes, adaptive quizzes or timed, proctored exams. Students join with a code, no account needed.

**Stack:** React + Vite (web), Node 22 + Express + Socket.IO (server), Supabase (Postgres, Auth, Storage), shared Zod schemas, Vitest. Hosted on Vercel, Render and Supabase.

```
apps/web         React app (host console, student screens)
apps/server      REST API, live engine, mail, AI
packages/shared  Schemas and pure logic used by both
supabase         SQL migrations and seed
docs             Feature and configuration reference
```

## Get it running

You need **Node 22** (`nvm use`) and the two private `.env` files from the project owner. Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli) are only needed for a local database.

```sh
git clone https://github.com/kushu30/quizup.git
cd quizup
nvm use
npm install
```

Put the env files at `apps/server/.env` and `apps/web/.env` (templates: the `.env.example` next to each), then:

```sh
npm run dev
```

The server runs on <http://localhost:4000> and the web app on <http://localhost:5173>. Check `curl localhost:4000/health` and the **Status** button in the page footer.

> The shared env points at the real database. Never run `supabase db reset` against it.

**Own local database instead:** copy both `.env.example` files to `.env`, run `supabase start && supabase db reset`, then copy the `service_role` and `anon` keys from `supabase status` into the two files.

## Becoming a host

New accounts are students. Sign up, then run once in the Supabase SQL editor to make yourself admin:

```sql
update public.profiles set role = 'admin' where email = '<your email>';
```

Then add host emails at `/admin`. Hosts create quizzes at `/host`; students join at `/join` with the code.

## Everyday commands

| Command                                | What it does                            |
| -------------------------------------- | --------------------------------------- |
| `npm run dev`                          | Shared (watch), server and web together |
| `npm test`                             | Whole suite, no database needed         |
| `npm run lint` / `typecheck` / `build` | The checks CI runs                      |

Run lint, typecheck and tests before you push. More scripts are in [docs/configuration.md](docs/configuration.md).

## Deploying

Database: `supabase link` then `supabase db push` (before deploying a server that needs new columns). Server: Render Blueprint from `render.yaml`. Web: Vercel, using `vercel.json`. Free Render servers sleep when idle, so point a free monitor (cron-job.org or UptimeRobot) at `<server>/health` every 5 minutes. Details and all environment variables: [docs/configuration.md](docs/configuration.md).

## More documentation

- [docs/configuration.md](docs/configuration.md): environment variables, scripts, deployment
- [docs/features.md](docs/features.md): how each feature works
- [docs/email-samples.md](docs/email-samples.md): every email the app sends
- [docs/adaptive-evaluation.md](docs/adaptive-evaluation.md): adaptive mode evaluation
