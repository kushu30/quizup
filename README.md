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
| `GEMINI_API_KEY`            | server  | no       | Reserved for later phases                       |
| `OPENAI_API_KEY`            | server  | no       | Reserved for later phases                       |
| `VITE_SERVER_URL`           | web     | yes      | Public URL of the server                        |
| `VITE_SUPABASE_URL`         | web     | yes      | Supabase project URL                            |
| `VITE_SUPABASE_ANON_KEY`    | web     | yes      | Supabase anon key                               |

The server and the web app both fail at startup with a list of the invalid variables.
