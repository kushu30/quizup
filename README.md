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

### Learner history (removed)

Per-student learner profiles were removed. Every participant, signed in or not, starts an adaptive session from the default rating, and nothing about a student is carried between sessions. Migration 0009 drops the `learner_profiles` table and the `apply_learner_profile` function, so applying it deletes any stored profiles permanently. Question ratings and `answers_count` (the **provisional** marker in the host difficulty table, until a question has 30 responses) are unaffected. Run `supabase db reset` to apply migration 0009.

### BKT fitting

`npm run bkt:fit` is a report only; it never changes the app. It reads live-session responses from the database grouped by student and topic (or `npm run bkt:fit -- --file sequences.json` with `[{"topic": "algebra", "correct": [true, false, true]}]`) and fits `p_init`, `p_learn`, `p_slip` and `p_guess` per topic by maximizing the sequence likelihood with a deterministic pattern search from five starting points (not EM). Slip and guess are each capped at 0.3 and slip + guess must stay below 0.6 so the model stays identifiable. A topic with fewer than 30 sequences prints "insufficient data, keeping defaults". The fitted values are printed next to the current defaults (0.30, 0.15, 0.10, 0.20).

`npm run bkt:fit -- --synthetic` generates simulated sequences from known parameters and prints how well they are recovered (all errors within 0.06 with 2000 sequences of length 8 per topic).

### Adaptive evaluation

`npm run adaptive:eval` compares fixed random question order with the production adaptive selection on **simulated** students: P(correct) = sigmoid((ability - difficulty) / 173.7) (the same scale as the Elo formula), ability ~ N(1000, 200), true difficulty = label (800, 1000 or 1200) + N(0, 60). For pool sizes 10, 30 and 100 it simulates 500 students (seed 424242), gives both arms the same students, questions and random draws per question, and records the error of the final Elo estimate against true ability (RMSE) and the Spearman correlation after 3, 5, 8 and 10 answered questions, with a paired bootstrap 95% interval (1000 resamples) for the RMSE difference. It also sweeps the sampling width (sigma 100, 200 and 400; production is 200). Nothing was tuned to favour adaptive mode. Question ratings stay at their label (no drift across students), so this isolates the selection effect. These are simulated results, not evidence from real students.

```
adaptive:eval - SIMULATED students, not real-student evidence.
student model: P(correct) = sigmoid((ability - difficulty) / 173.7), ability ~ N(1000, 200), true difficulty = label (800/1000/1200) + N(0, 60).
500 students per pool size, seed 424242, pools 10/30/100, sigma sweep 100/200/400 (production: 200), 1000 bootstrap resamples (paired, 95% interval).
Both arms see the same students, the same questions and the same random draws per question. Question ratings stay at their label (no cross-student drift). Selection uses the production selectNextAdaptiveQuestion code.

pool  10: predicting 1000 for everyone has RMSE 212.8
pool  30: predicting 1000 for everyone has RMSE 185.5
pool 100: predicting 1000 for everyone has RMSE 199.3

pool arm             k    RMSE Spearman  RMSE diff vs fixed [95% CI]    verdict
-----------------------------------------------------------------------------------------
  10 fixed order     3   197.0    0.615                                 
  10 adaptive s=100  3   194.6    0.668    -2.4 [-4.5, -0.6]            better
  10 adaptive s=200  3   195.8    0.662    -1.1 [-3.0, 0.7]             no significant difference
  10 adaptive s=400  3   196.6    0.641    -0.4 [-2.1, 1.6]             no significant difference
  10 fixed order     5   187.4    0.693                                 
  10 adaptive s=100  5   184.0    0.735    -3.4 [-5.3, -1.4]            better
  10 adaptive s=200  5   186.2    0.725    -1.1 [-3.0, 0.8]             no significant difference
  10 adaptive s=400  5   186.5    0.723    -0.9 [-2.9, 1.0]             no significant difference
  10 fixed order     8   174.9    0.774                                 
  10 adaptive s=100  8   171.0    0.793    -3.8 [-5.3, -2.3]            better
  10 adaptive s=200  8   172.5    0.802    -2.4 [-3.9, -0.9]            better
  10 adaptive s=400  8   172.8    0.808    -2.1 [-3.6, -0.6]            better
  10 fixed order    10   165.9    0.823                                 
  10 adaptive s=100 10   166.2    0.818     0.2 [-0.2, 0.6]             no significant difference
  10 adaptive s=200 10   166.0    0.817     0.1 [-0.3, 0.5]             no significant difference
  10 adaptive s=400 10   166.0    0.818     0.1 [-0.3, 0.5]             no significant difference
  30 fixed order     3   172.0    0.545                                 
  30 adaptive s=100  3   169.8    0.609    -2.1 [-4.5, 0.3]             no significant difference
  30 adaptive s=200  3   170.5    0.599    -1.4 [-3.8, 1.1]             no significant difference
  30 adaptive s=400  3   170.7    0.597    -1.3 [-3.7, 1.2]             no significant difference
  30 fixed order     5   162.2    0.676                                 
  30 adaptive s=100  5   159.8    0.711    -2.5 [-5.7, 0.4]             no significant difference
  30 adaptive s=200  5   160.2    0.717    -2.0 [-4.6, 0.4]             no significant difference
  30 adaptive s=400  5   161.0    0.707    -1.3 [-4.1, 1.7]             no significant difference
  30 fixed order     8   150.4    0.761                                 
  30 adaptive s=100  8   144.4    0.795    -6.0 [-9.4, -2.9]            better
  30 adaptive s=200  8   147.5    0.789    -3.0 [-5.9, -0.1]            better
  30 adaptive s=400  8   148.3    0.781    -2.1 [-5.0, 0.8]             no significant difference
  30 fixed order    10   143.2    0.800                                 
  30 adaptive s=100 10   135.1    0.817    -8.1 [-11.5, -4.7]           better
  30 adaptive s=200 10   139.1    0.817    -4.1 [-7.3, -1.2]            better
  30 adaptive s=400 10   140.9    0.809    -2.3 [-5.2, 0.7]             no significant difference
 100 fixed order     3   183.7    0.624                                 
 100 adaptive s=100  3   181.2    0.650    -2.5 [-4.8, -0.3]            better
 100 adaptive s=200  3   183.4    0.601    -0.3 [-2.5, 2.2]             no significant difference
 100 adaptive s=400  3   183.4    0.619    -0.4 [-2.7, 1.9]             no significant difference
 100 fixed order     5   174.7    0.686                                 
 100 adaptive s=100  5   171.6    0.721    -3.1 [-6.4, 0.1]             no significant difference
 100 adaptive s=200  5   174.0    0.681    -0.6 [-3.6, 2.4]             no significant difference
 100 adaptive s=400  5   174.3    0.692    -0.4 [-3.8, 2.8]             no significant difference
 100 fixed order     8   162.4    0.768                                 
 100 adaptive s=100  8   156.6    0.796    -5.8 [-9.1, -2.6]            better
 100 adaptive s=200  8   159.9    0.761    -2.5 [-6.0, 0.9]             no significant difference
 100 adaptive s=400  8   160.2    0.775    -2.2 [-5.6, 1.2]             no significant difference
 100 fixed order    10   154.4    0.813                                 
 100 adaptive s=100 10   148.2    0.824    -6.1 [-9.8, -2.3]            better
 100 adaptive s=200 10   151.7    0.790    -2.7 [-6.2, 0.6]             no significant difference
 100 adaptive s=400 10   152.7    0.802    -1.6 [-5.3, 2.0]             no significant difference

across all 36 adaptive cells: 12 better, 24 no significant difference

Where production adaptive (sigma 200) does NOT beat fixed order: 9 of 12 cells
  pool 10, k=3: no significant difference (RMSE diff -1.1, 95% CI -3.0 to 0.7)
  pool 10, k=5: no significant difference (RMSE diff -1.1, 95% CI -3.0 to 0.8)
  pool 10, k=10: no significant difference (RMSE diff 0.1, 95% CI -0.3 to 0.5)
  pool 30, k=3: no significant difference (RMSE diff -1.4, 95% CI -3.8 to 1.1)
  pool 30, k=5: no significant difference (RMSE diff -2.0, 95% CI -4.6 to 0.4)
  pool 100, k=3: no significant difference (RMSE diff -0.3, 95% CI -2.5 to 2.2)
  pool 100, k=5: no significant difference (RMSE diff -0.6, 95% CI -3.6 to 2.4)
  pool 100, k=8: no significant difference (RMSE diff -2.5, 95% CI -6.0 to 0.9)
  pool 100, k=10: no significant difference (RMSE diff -2.7, 95% CI -6.2 to 0.6)
Spearman is lower than fixed order in 5 sigma 200 cells: pool 10 k=10, pool 100 k=3, pool 100 k=5, pool 100 k=8, pool 100 k=10.
Absolute errors are large for both arms because Elo with K=32 starts at 1000 and moves at most about 16 points per answer, so after 10 answers it has not caught up with abilities spread over +/-200.
```

What this says honestly: the production setting (sigma 200) is better than fixed order in 3 of 12 cells and not distinguishable in the other 9; the gains are small (about 1 to 4 RMSE points out of roughly 140 to 200). A narrower width (sigma 100) did better than the production width in this model. Elo with K=32 moves slowly, so after 10 answers both arms are still far from true ability (but better than predicting 1000 for everyone). Spearman is not uniformly better for adaptive mode.

### Exam mode and proctoring

Choose **Timed exam** as the assessment type (with a length in minutes) in the quiz editor. Adaptive selection and Elo/BKT updates are off for exams. Students join with the code and wait in the lobby; the host opens the exam; each student sees a consent screen, and accepting it creates their attempt with a private timer and a personal question and option order, and requests full screen. Attempts are stored in the database, so a refresh or a server restart does not reset them (the student resumes with the same join code, name and rejoin token). The server auto-submits expired attempts, and ending the session submits all open ones. There is no leaderboard; the host sees a progress table (alphabetical) and a per-student proctor timeline, and releases results with the Release results button. Until then students only see "Submitted. Results will be released by your host." Release works from the database alone, even after a restart. Run `supabase db reset` to apply migration 0007.

What each signal means and how it is captured (all in the student's browser, only during an open attempt):

| Signal            | Meaning                                              | How it is captured                                                                 |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tab_switch`      | The student switched to another tab or minimized     | `visibilitychange` to hidden                                                       |
| `window_blur`     | The exam window lost focus while still visible       | `blur` on the window, only if the page is still visible                            |
| `focus_return`    | The student came back; carries the time away         | `visibilitychange` to visible, or window `focus`                                   |
| `fullscreen_exit` | The student left full screen                         | `fullscreenchange` when the document leaves full screen                            |
| `copy`            | Copy or cut (cut is flagged); length only            | `copy` and `cut` events; selection length                                          |
| `paste`           | A paste; length only                                 | `paste` event; length of the pasted text                                           |
| `right_click`     | The context menu was opened                          | `contextmenu` event                                                                |
| `resize`          | The window size changed by 20 px or more             | `resize`, debounced 500 ms                                                         |
| `consent_given`   | The student accepted the terms                       | Written by the server once, not sent by the browser                                |

Events are timestamped by the browser and again by the server. They are queued in the browser while offline (up to 200) and flagged "late" if delivered more than 5 seconds after they happened. The server accepts at most 20 events per second per connection and counts any it drops.

Never collected: no webcam, no microphone, no screen recording, no keystrokes, no clipboard content (copy and paste record only a length). The consent screen says this, and the server stores which version of the text each student accepted.

Honest limits: these are browser-side signals. A determined student can evade or spoof them, for example by using a second device or a phone, a second monitor, a virtual machine, browser developer tools, or by blocking events. Missing signals do not mean no misconduct, and signals do not prove misconduct. Treat them as indicators for a human to review, with the student's context.

Proctor latency check (simulated):

```sh
npm run proctor:sim
```

It starts the server in-process with the in-memory repository, one host socket and 20 simulated exam students who consent, start, and each emit every signal type. It prints p50, p95 and max per signal for how long the host takes to receive the `proctor:timeline` event and how long until the row is stored, plus the number dropped by the rate cap, and exits non-zero if the overall p95 is above 1000 ms. The numbers are simulated and local: the server and the simulated students share one Node process on your machine, so they say nothing about a deployed server or real networks. Stored latency is dominated by the 200 ms batch flush.

After an exam ends the server keeps the session in memory for 7 days; after a restart it reloads exams that ended within the last 7 days. Beyond that window students can no longer reopen their results screen in the app, but the host can still release results, view the summary and download the CSVs, because those read from the database.

### Analytics

The host live screen has an **Analytics** panel that updates in real time, and every ended session has a summary page with CSV exports.

What the live panel shows (all of it comes from one server event, `analytics:snapshot`, sent only to the host; there is no polling):

- **Live / Reconnecting** badge, driven by the socket connection.
- **Leaderboard**: the points-based leaderboard.
- **Mastery heatmap**: one row per student, one column per topic, colour = BKT mastery 0 to 1 with the number in the cell. A dash means no data yet. Rows are sorted by score (or name).
- **Response time**: a 10-bucket histogram of how much of the time limit students used, switchable between the current question (current round in adaptive sessions) and the whole session.
- **Question difficulty**: labeled difficulty against observed accuracy, flagged when an easy question is answered correctly less than 40% of the time or a hard one more than 80% of the time (needs at least 3 answers).

Summary page: `/sessions/:id/summary` (linked from the end-of-session screen) shows the final leaderboard, a per-question table (labeled difficulty, observed accuracy, median response time, mismatch flag), the response-time histogram, the mastery heatmap, where each student joined from and, for proctored sessions, the proctor signals. The summary is saved when the session ends. Older sessions without one are rebuilt from the responses once; rebuilt summaries use the slowest answer as the time limit.

CSV export (two buttons on the summary page, downloaded through an authenticated request; cells that start with `=`, `+`, `-` or `@` get a leading single quote):

- participants: Rank, Name, Final score, Answered, Correct, Accuracy, Avg response ms, Final Elo (adaptive sessions only), and one `Mastery: <topic>` column per topic.
- responses: Participant, Question, Topic, Labeled difficulty, Chosen option, Correct, Response ms, Points, Participant Elo before, Question Elo before.

Run `supabase db reset` to apply migration 0006 (summary columns on sessions).

Load check (simulated):

```sh
npm run load:sim
```

It starts the server in-process with the in-memory repository, one host socket and 20 simulated student sockets, and measures the time from each student's answer to the first analytics snapshot the host receives that includes it. Two scenarios: answers spread at random delays across each round, and all 20 answering inside one second. It prints p50, p95, max, snapshot count and CPU per answer, and exits non-zero if p95 is over 500 ms. The numbers are simulated and local: the server and the simulated clients share one Node process on your machine, so they say nothing about a deployed server or real networks.

### Adaptive mode

Every live session now keeps a skill rating per student (Elo) and a per-topic mastery estimate (Bayesian knowledge tracing), updated each time a question closes. Choosing **Adaptive quiz** as the assessment type in the quiz editor (the number of rounds is automatic: the smaller of 10 and the approved question count) changes only which questions students get: in synchronized rounds each student receives their own question, chosen by their current rating from the approved questions they have not seen. Scoring and the leaderboard stay points-based, and ratings and mastery are never sent to students. The host console shows a table with each student's rating and last question.

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

### Branded assessments

In the quiz editor, **Branding** sets how the assessment looks to students: a logo (PNG, JPEG or WebP, up to 1 MB, uploaded to the Supabase Storage bucket `branding`), the institution name, and optional tagline, brand colour, welcome message and instructions. Branding is stored in `quizzes.settings.branding` and validated by `brandingSchema` (https logo links only, `#RRGGBB` colours, length limits). The server sends `quizTitle` and `branding` in `room:state`, so students never read quiz rows directly; a broken stored branding value is ignored rather than breaking the session.

Students first see an intro (logo, institution, title, welcome) and then instructions (the host's text plus standard rules for the assessment type) before the lobby or the exam consent screen. Play screens show a compact "<institution>, powered by QuizUp" strip; the host console join panel and the session summary carry the same brand. Text on the brand colour switches between dark and light by contrast. Quizzes without branding look as before, with QuizUp branding only.

The join link is branded too. Opening `/join/<CODE>` (or typing a full code on `/join`) looks the quiz up through the public, rate-limited `GET /join-info/:code`, which returns only the title, brand, assessment type and status (never questions, ids or the host). The join page then shows the institution card, welcome message and a brand-coloured Join button; a stripe and a light tint in the brand colour carry through the intro, the quiz and the results, and the institution sits in the header once the quiz starts. Ended quizzes say so and cannot be joined.

Run `supabase db reset` to apply migration 0010, which creates the public `branding` bucket (1 MB limit, PNG, JPEG and WebP only) and lets hosts and admins write only inside a folder named after their own user id.

### Student feedback

When a live quiz ends, or once a student submits their exam, students see a short form: a rating from 1 to 5 and an optional comment (up to 500 characters). It is sent over the socket (`feedback:submit`) and accepted only after the session has ended or the student's own exam attempt is submitted; sending again replaces the earlier answer (one row per student per session). Feedback is anonymous to the host: the summary shows the average, the count and each rating with its comment, listed from highest to lowest rating, with no names, ids or times (the server keeps a link to the student only so a second answer replaces the first). Run `supabase db reset` to apply migration 0011 (`session_feedback`, server access only).

### History

Each quiz has a **History** page (button in the quiz editor, `/host/quizzes/:quizId/history`) listing every session: when it started, its type and status, how many students joined, the average score (from the stored session summary) and the average feedback rating. Ended sessions link to the full summary and CSV exports; sessions still open link back to the host console. Served by `GET /quizzes/:quizId/sessions` (quiz owner only).

Signed-in students see **My results** in the top bar (`/me/results`, `GET /me/results`): each assessment they joined while signed in, with the institution brand, score and rank. Exam scores stay hidden until the host releases results. Students who join without signing in have no history, because nothing links their answers to an account.

### Email (tokens and host access)

QuizUp can email invited students their access token and tell a new host they can start. It speaks plain SMTP, so any provider works; nothing is sent, and no email buttons appear, until all of `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` are set. Settings live only in `.env` (or the host's environment variables on Render).

Brevo (free tier, no domain needed; check Brevo's page for the current daily limit):

1. Create a Brevo account, then open **SMTP & API** and the **SMTP** tab.
2. Note the SMTP server (`smtp-relay.brevo.com`), the port (587) and the login Brevo shows you, and generate an **SMTP key** to use as the password.
3. Under **Senders, domains and dedicated IPs** add and verify the address you want to send from; use it as `MAIL_FROM`.
4. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, optionally `MAIL_FROM_NAME` and `MAIL_REPLY_TO`, and `APP_URL` (the public address of the web app, for example `https://quizup-khaki.vercel.app`). Restart the server.

Gmail also works for small classes: `smtp.gmail.com`, port 465 or 587, your address as user and sender, and an app password (not your normal password).

What it sends:

- **Access tokens.** In the invited-students panel, **Email tokens** (all students with an email address) or **Email** on a row (one student) opens a dialog. You edit the subject and message, using the placeholders `{{student_name}}`, `{{quiz_title}}`, `{{institution_name}}`, `{{join_code}}`, `{{token}}` and `{{join_link}}` (click a chip to insert it; each student gets their own values), and see the exact formatted email for a real student on the right. **Send a test to me** sends a copy to your own address with an example token; **Send to N students** sends. Unknown placeholders are refused before anything is sent. A student only ever receives their own token. The server keeps issued tokens in memory only, so the buttons work until the server restarts or you issue **New token**; the panel then says who has no email, who needs a new token, and who failed. Nothing is sent without a click.
- **Accounts for students.** Each token email also mentions that a QuizUp account is optional, and why: signed-in students keep their results under My results, and they can take the assessment without one. A student who already has an account is told to sign in before joining instead. The server looks the address up in its user records for this; if the lookup fails the email is still sent.
- **Look of the emails.** A quiz with an institution brand shows the institution logo and name on its colour (text switches to dark on bright colours), then "Powered by" and the QuizUp logo; a quiz without a brand shows the QuizUp logo alone. The QuizUp logos are PNG files in `apps/web/public/email/` and are loaded from your web app (`APP_URL`), so they appear once the web app is deployed; the institution logo is the https address stored with the quiz. Every message has a button, the plain link under it, the join code and token, and a note that the link is personal.
- **Host access.** When an admin adds an email to the host allowlist, the Admin page asks the server to email them, and the server first checks whether that address already has an account. With no account, the email says host access is tied to that address and asks them to create an account; its button opens the sign-up page with the address filled in and locked (name and password only), and they land on the host dashboard. With an account (the database upgrades it to host automatically), the email says to sign in and the button opens sign-in with the address filled in. **Email again** resends it. The server only mails addresses that are on the allowlist, and only for admins. If email is not set up the host is still added and the page says the email was not sent.

To check your mail settings without deploying anything, put the same variables in `apps/server/.env` and run `npm run mail:smoke -- you@example.com`. It sends one clearly marked test message and tells you, without printing any secret, whether the provider accepted it.

Every email, with sample names and when it is sent, is shown in [docs/email-samples.md](docs/email-samples.md).

Sample files: the question import and the student list both have a **Download a sample** button, and the student list can be filled from a CSV file (a `name,email` header row is fine). To ask for host access, people write to kushagra.shukla2005@gmail.com; that address is shown in the footer, on the sign-up page, and when a student opens the host area.

### Proctoring for every assessment type

When the host presses **Start** (or **Open the exam**), a dialog asks whether to proctor this session. Proctoring records tab switches, the window losing focus, copy and paste (lengths only), right-clicks and window resizes, and shows them to the host; exams also ask students to stay in full screen. It records no webcam, microphone, screen or keystrokes. Students are told before they begin: the intro lists it as the host's choice, a proctored quiz shows a notice on every question, and a proctored exam shows the monitoring list on the consent screen. If the host starts without proctoring, no signals are recorded or shown, the exam consent says so, and the exam asks for no full screen. When the start request does not say, exams default to proctored and quizzes to not proctored. The host console shows a **Proctoring** panel for proctored quizzes (counts, latest signal, a timeline per student) and the summary page shows the signals table whenever a session was proctored. Run `supabase db push` to apply migration 0013 (`sessions.proctored`, `participants.devices`; exam sessions already stored are marked proctored).

### Where each student joined from

The server reads the browser's user agent plus the screen size and touch support the page sends when joining, and keeps a short description per student (for example "Phone, iOS 17, Safari 17, 390 × 844"). A student who comes back from another device gets a second entry. Hosts see it as a small dropdown in the exam progress table, the live proctoring panel and the summary page's "Where students joined from" panel; students never receive other students' devices. It is a description of the browser, not an identity check, and saving it never blocks a join.

### Landing page and system status

The home page opens with a small interactive walkthrough (student and host views, five steps you can click through or let play; it is labelled as simulated). It uses the visitor's first name in the sample question when signed in, and a generic question otherwise; the clock and the server status with its response time are live. The page then introduces the three assessment types, the three steps from questions to results and what makes it fit a classroom, with the join box at the top. The QuizUp logo (four squares and an amber check) is in the header, footer, favicon and the "Powered by" line. The server health and socket round-trip check moved into a quiet **Status** button in the footer of every page; it only runs when someone opens it.

### Reconnecting and invited-only quizzes

A student who loses connection keeps their screen. A banner says the connection is being restored, the exam timer keeps running, and answers picked while offline are kept in the page and sent as soon as the seat is back (the submit button waits until then). If the server turns a reconnect away for a moment, the page tries again on its own.

If a browser forgets its seat (cleared site data, another device), the student sees a clear message. The host presses **Let back in** next to the disconnected student in the console; for five minutes the student can join again with the same name and gets the same seat, answers and timer, with a fresh private credential. Opening a seat on a second device closes the first, which offers a "Use this device" button.

**Who can join** is a setting next to the assessment type. *Invited students only* turns the console's **Invited students** panel on: paste one student per line (a name, or a name and an email), and each student gets a personal access token (ten characters, shown once). Download the CSV for names, tokens and personal links (`/join/<CODE>#token=...`; the token sits in the URL fragment so it never reaches a server log). The join page then asks for the token instead of a name, and the name comes from your list. A token maps to one seat: using it again resumes that seat, **New token** replaces a lost or leaked one, and the panel shows when a token was opened on another device. Wrong tokens are throttled per visitor (20 a minute), so one person guessing cannot lock the others out. Invited students may arrive after an exam has opened; live and adaptive quizzes still close at the start. Run `supabase db reset` (or `supabase db push`) to apply migration 0012 (`session_roster`, server access only; it stores token hashes, never tokens).

The exam screen hides the site navigation and shows a large timer that turns amber at ten minutes and red in the last minute, with a screen-reader announcement at each milestone.

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
| `APP_URL`                   | server  | no       | Public web URL used in emails (default: first `CORS_ORIGINS`) |
| `SMTP_HOST`                 | server  | no       | Mail server, for example `smtp-relay.brevo.com` |
| `SMTP_PORT`                 | server  | no       | Default 587 (465 uses implicit TLS)             |
| `SMTP_USER`                 | server  | no       | Mail server login                               |
| `SMTP_PASSWORD`             | server  | no       | Mail server password or SMTP key, server only   |
| `MAIL_FROM`                 | server  | no       | Sender address, must be allowed by your provider |
| `MAIL_FROM_NAME`            | server  | no       | Sender name, default `QuizUp`                   |
| `MAIL_REPLY_TO`             | server  | no       | Optional reply address                          |
| `VITE_SERVER_URL`           | web     | yes      | Public URL of the server                        |
| `VITE_SUPABASE_URL`         | web     | yes      | Supabase project URL                            |
| `VITE_SUPABASE_ANON_KEY`    | web     | yes      | Supabase anon key                               |
| `VITE_GOOGLE_AUTH_ENABLED`  | web     | no       | `true` shows the Google button, default `false` |

The server and the web app both fail at startup with a list of the invalid variables.

..