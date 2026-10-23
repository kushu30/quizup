# Features and behaviour

Reference notes for each feature. For setup, see the [README](../README.md).

## Quiz management

Hosts (and the admin) manage quizzes from `/host`: create, rename, change mode and delete quizzes; add, edit and delete questions; import questions from CSV; and search the question bank at `/host/questions` by text, topic and difficulty. All of it goes through the server API, which validates every request with the shared Zod schemas and checks that the quiz belongs to the caller.

CSV import: header row `topic,difficulty,stem,option_a,option_b,option_c,option_d,correct`. Difficulty is `easy`, `medium` or `hard`; `correct` is `A` to `D`. If any row is invalid nothing is imported and the bad rows are listed.

API (all need `Authorization: Bearer <access token>` from a host or admin): `GET/POST /quizzes`, `GET/PATCH/DELETE /quizzes/:quizId`, `POST /quizzes/:quizId/questions`, `POST /quizzes/:quizId/questions/import`, `GET /questions`, `GET /questions/topics`, `PATCH/DELETE /questions/:questionId`.

## Live sessions

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

## Learner history (removed)

Per-student learner profiles were removed. Every participant, signed in or not, starts an adaptive session from the default rating, and nothing about a student is carried between sessions. Migration 0009 drops the `learner_profiles` table and the `apply_learner_profile` function, so applying it deletes any stored profiles permanently. Question ratings and `answers_count` (the **provisional** marker in the host difficulty table, until a question has 30 responses) are unaffected. Run `supabase db reset` to apply migration 0009.

## Exam mode and proctoring

Choose **Timed exam** as the assessment type (with a length in minutes) in the quiz editor. Adaptive selection and Elo/BKT updates are off for exams. Students join with the code and wait in the lobby; the host opens the exam; each student sees a consent screen, and accepting it creates their attempt with a private timer and a personal question and option order, and requests full screen. Attempts are stored in the database, so a refresh or a server restart does not reset them (the student resumes with the same join code, name and rejoin token). The server auto-submits expired attempts, and ending the session submits all open ones. There is no leaderboard; the host sees a progress table (alphabetical) and a per-student proctor timeline, and releases results with the Release results button. Until then students only see "Submitted. Results will be released by your host." Release works from the database alone, even after a restart. Run `supabase db reset` to apply migration 0007.

What each signal means and how it is captured (all in the student's browser, only during an open attempt):

| Signal            | Meaning                                          | How it is captured                                      |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `tab_switch`      | The student switched to another tab or minimized | `visibilitychange` to hidden                            |
| `window_blur`     | The exam window lost focus while still visible   | `blur` on the window, only if the page is still visible |
| `focus_return`    | The student came back; carries the time away     | `visibilitychange` to visible, or window `focus`        |
| `fullscreen_exit` | The student left full screen                     | `fullscreenchange` when the document leaves full screen |
| `copy`            | Copy or cut (cut is flagged); length only        | `copy` and `cut` events; selection length               |
| `paste`           | A paste; length only                             | `paste` event; length of the pasted text                |
| `right_click`     | The context menu was opened                      | `contextmenu` event                                     |
| `resize`          | The window size changed by 20 px or more         | `resize`, debounced 500 ms                              |
| `consent_given`   | The student accepted the terms                   | Written by the server once, not sent by the browser     |

Events are timestamped by the browser and again by the server. They are queued in the browser while offline (up to 200) and flagged "late" if delivered more than 5 seconds after they happened. The server accepts at most 20 events per second per connection and counts any it drops.

Never collected: no screen recording, no keystrokes, no clipboard content (copy and paste record only a length), and no video or audio of any kind (see _Camera and microphone proctoring_ for the opt-in camera and microphone checks, which analyse on the student's device and send only flags). The consent screen says this, and the server stores which version of the text each student accepted.

Honest limits: these are browser-side signals. A determined student can evade or spoof them, for example by using a second device or a phone, a second monitor, a virtual machine, browser developer tools, or by blocking events. Missing signals do not mean no misconduct, and signals do not prove misconduct. Treat them as indicators for a human to review, with the student's context.

Proctor latency check (simulated):

```sh
npm run proctor:sim
```

It starts the server in-process with the in-memory repository, one host socket and 20 simulated exam students who consent, start, and each emit every signal type. It prints p50, p95 and max per signal for how long the host takes to receive the `proctor:timeline` event and how long until the row is stored, plus the number dropped by the rate cap, and exits non-zero if the overall p95 is above 1000 ms. The numbers are simulated and local: the server and the simulated students share one Node process on your machine, so they say nothing about a deployed server or real networks. Stored latency is dominated by the 200 ms batch flush.

After an exam ends the server keeps the session in memory for 7 days; after a restart it reloads exams that ended within the last 7 days. Beyond that window students can no longer reopen their results screen in the app, but the host can still release results, view the summary and download the CSVs, because those read from the database.

## Analytics

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

## Adaptive mode

Every live session now keeps a skill rating per student (Elo) and a per-topic mastery estimate (Bayesian knowledge tracing), updated each time a question closes. Choosing **Adaptive quiz** as the assessment type in the quiz editor (the number of rounds is automatic: the smaller of 10 and the approved question count) changes only which questions students get: in synchronized rounds each student receives their own question, chosen by their current rating from the approved questions they have not seen. Scoring and the leaderboard stay points-based, and ratings and mastery are never sent to students. The host console shows a table with each student's rating and last question.

Constants (all exported from `packages/shared`):

| Constant              | Value                                                                          |
| --------------------- | ------------------------------------------------------------------------------ |
| Elo K factor          | 32 for both students and questions                                             |
| Rating bounds         | 100 to 3000, students start at 1000                                            |
| Starting question Elo | easy 800, medium 1000, hard 1200                                               |
| Speed range           | a correct answer scores 0.9 (at the deadline) to 1.0 (instant); wrong scores 0 |
| Selection sigma       | 200 (weight `exp(-(Q-P)^2 / (2*200^2))`, floor 0.01)                           |
| BKT                   | p_init 0.3, p_learn 0.15, p_slip 0.1, p_guess 0.2                              |
| Default rounds        | min(10, approved questions), never more than the approved count                |

Run `supabase db reset` to apply migration 0005 (question ratings, the atomic rating function, rating snapshot columns on responses).

See it work without a database:

```sh
npm run adaptive:sim
```

It simulates 10 rounds over 30 questions for a strong (ability 1400) and a weak (ability 600) student, prints both difficulty sequences and rating trajectories, and a summary over 200 seeds. It is not run in CI.

## Branded assessments

In the quiz editor, **Branding** sets how the assessment looks to students: a logo (PNG, JPEG or WebP, up to 1 MB, uploaded to the Supabase Storage bucket `branding`), the institution name, and optional tagline, brand colour, welcome message and instructions. Branding is stored in `quizzes.settings.branding` and validated by `brandingSchema` (https logo links only, `#RRGGBB` colours, length limits). The server sends `quizTitle` and `branding` in `room:state`, so students never read quiz rows directly; a broken stored branding value is ignored rather than breaking the session.

Students first see an intro (logo, institution, title, welcome) and then instructions (the host's text plus standard rules for the assessment type) before the lobby or the exam consent screen. Play screens show a compact "<institution>, powered by QuizUp" strip; the host console join panel and the session summary carry the same brand. Text on the brand colour switches between dark and light by contrast. Quizzes without branding look as before, with QuizUp branding only.

The join link is branded too. Opening `/join/<CODE>` (or typing a full code on `/join`) looks the quiz up through the public, rate-limited `GET /join-info/:code`, which returns only the title, brand, assessment type and status (never questions, ids or the host). The join page then shows the institution card, welcome message and a brand-coloured Join button; a stripe and a light tint in the brand colour carry through the intro, the quiz and the results, and the institution sits in the header once the quiz starts. Ended quizzes say so and cannot be joined.

Run `supabase db reset` to apply migration 0010, which creates the public `branding` bucket (1 MB limit, PNG, JPEG and WebP only) and lets hosts and admins write only inside a folder named after their own user id.

## Student feedback

When a live quiz ends, or once a student submits their exam, students see a short form: a rating from 1 to 5 and an optional comment (up to 500 characters). It is sent over the socket (`feedback:submit`) and accepted only after the session has ended or the student's own exam attempt is submitted; sending again replaces the earlier answer (one row per student per session). Feedback is anonymous to the host: the summary shows the average, the count and each rating with its comment, listed from highest to lowest rating, with no names, ids or times (the server keeps a link to the student only so a second answer replaces the first). Run `supabase db reset` to apply migration 0011 (`session_feedback`, server access only).

## History

Each quiz has a **History** page (button in the quiz editor, `/host/quizzes/:quizId/history`) listing every session: when it started, its type and status, how many students joined and the average feedback rating. Ended sessions link to the full summary and CSV exports; sessions still open link back to the host console. Served by `GET /quizzes/:quizId/sessions` (quiz owner only).

Signed-in students see **My results** in the top bar (`/me/results`, `GET /me/results`): each assessment they joined while signed in, with the institution brand, score and rank. Exam scores stay hidden until the host releases results. Students who join without signing in have no history, because nothing links their answers to an account.

## Email (tokens and host access)

QuizUp can email invited students their access token and tell a new host they can start. It can send through the Brevo HTTPS API (recommended) or through plain SMTP. Nothing is sent, and no email buttons appear, until `MAIL_FROM` and either `BREVO_API_KEY` or all of `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` are set. If both are set the API is used.

**Render free blocks SMTP.** Free web services on Render cannot open outbound connections on ports 25, 465 or 587, so SMTP mail that works on your laptop fails once deployed. The Brevo API uses HTTPS (port 443) and is not affected. The server retries a network failure twice, and every failure is shown to the host in plain words (blocked port, rejected key, unverified sender, rate limit) instead of a generic error. Settings live only in `.env` (or the host's environment variables on Render).

Brevo (free tier, no domain needed; check Brevo's page for the current daily limit). For the HTTPS API: in Brevo open **SMTP & API**, then the **API keys** tab, generate a key, and set it as `BREVO_API_KEY` together with `MAIL_FROM` (a verified sender). If you turned on **Authorized IPs** in Brevo's security settings, switch that off or add Render's outbound addresses, otherwise Brevo answers 401. For SMTP instead:

1. Create a Brevo account, then open **SMTP & API** and the **SMTP** tab.
2. Note the SMTP server (`smtp-relay.brevo.com`), the port (587) and the login Brevo shows you, and generate an **SMTP key** to use as the password.
3. Under **Senders, domains and dedicated IPs** add and verify the address you want to send from; use it as `MAIL_FROM`.
4. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, optionally `MAIL_FROM_NAME` and `MAIL_REPLY_TO`, and `APP_URL` (the public address of the web app, for example `https://quizup.kushu30.me`). Restart the server.

Gmail also works for small classes: `smtp.gmail.com`, port 465 or 587, your address as user and sender, and an app password (not your normal password).

What it sends:

- **Access tokens.** In the invited-students panel, **Email tokens** (all students with an email address) or **Email** on a row (one student) opens a dialog. You edit the subject and message, using the placeholders `{{student_name}}`, `{{quiz_title}}`, `{{institution_name}}`, `{{join_code}}`, `{{token}}` and `{{join_link}}` (click a chip to insert it; each student gets their own values), and see the exact formatted email for a real student on the right. **Send a test to me** sends a copy to your own address with an example token; **Send to N students** sends. Unknown placeholders are refused before anything is sent. A student only ever receives their own token. The server keeps issued tokens in memory only, so the buttons work until the server restarts or you issue **New token**; the panel then says who has no email, who needs a new token, and who failed. Nothing is sent without a click.
- **Accounts for students.** Each token email also mentions that a QuizUp account is optional, and why: signed-in students keep their results under My results, and they can take the assessment without one. A student who already has an account is told to sign in before joining instead. The server looks the address up in its user records for this; if the lookup fails the email is still sent.
- **Look of the emails.** A quiz with an institution brand shows the institution logo and name on its colour (text switches to dark on bright colours), then "Powered by" and the QuizUp logo; a quiz without a brand shows the QuizUp logo alone. The QuizUp logos are PNG files in `apps/web/public/email/` and are loaded from your web app (`APP_URL`), so they appear once the web app is deployed; the institution logo is the https address stored with the quiz. Every message has a button, the plain link under it, the join code and token, and a note that the link is personal.
- **Host access.** When an admin adds an email to the host allowlist, the Admin page asks the server to email them, and the server first checks whether that address already has an account. With no account, the email says host access is tied to that address and asks them to create an account; its button opens the sign-up page with the address filled in and locked (name and password only), and they land on the host dashboard. With an account (the database upgrades it to host automatically), the email says to sign in and the button opens sign-in with the address filled in. **Email again** resends it. The server only mails addresses that are on the allowlist, and only for admins. If email is not set up the host is still added and the page says the email was not sent.

To check your mail settings without deploying anything, put the same variables in `apps/server/.env` and run `npm run mail:smoke -- you@example.com`. It sends one clearly marked test message and tells you, without printing any secret, whether the provider accepted it.

Every email, with sample names and when it is sent, is shown in [docs/email-samples.md](docs/email-samples.md).

Sample files: the question import and the student list both have a **Download a sample** button, and the student list can be filled from a CSV file (a `name,email` header row is fine). To ask for host access, people write to kushagra.shukla2005@gmail.com; that address is shown in the footer, on the sign-up page, and when a student opens the host area.

## Proctoring for every assessment type

When the host presses **Start** (or **Open the exam**), a dialog asks whether to proctor this session. Proctoring records tab switches, the window losing focus, copy and paste (lengths only), right-clicks and window resizes, and shows them to the host; exams also ask students to stay in full screen. It records no screen or keystrokes, and camera and microphone checks are off unless the host turns them on (see _Camera and microphone proctoring_). Students are told before they begin: the intro lists it as the host's choice, a proctored quiz shows a notice on every question, and a proctored exam shows the monitoring list on the consent screen. If the host starts without proctoring, no signals are recorded or shown, the exam consent says so, and the exam asks for no full screen. When the start request does not say, exams default to proctored and quizzes to not proctored. The host console shows a **Proctoring** panel for proctored quizzes (counts, latest signal, a timeline per student) and the summary page shows the signals table whenever a session was proctored. Run `supabase db push` to apply migration 0013 (`sessions.proctored`, `participants.devices`; exam sessions already stored are marked proctored).

## Where each student joined from

The server reads the browser's user agent plus the screen size and touch support the page sends when joining, and keeps a short description per student (for example "Phone, iOS 17, Safari 17, 390 × 844"). A student who comes back from another device gets a second entry. Hosts see it as a small dropdown in the exam progress table, the live proctoring panel and the summary page's "Where students joined from" panel; students never receive other students' devices. It is a description of the browser, not an identity check, and saving it never blocks a join.

## Landing page and system status

The home page opens with a small interactive walkthrough (student and host views, five steps you can click through or let play; it is labelled as simulated). It uses the visitor's first name in the sample question when signed in, and a generic question otherwise; the clock and the server status with its response time are live. The page then introduces the three assessment types, the three steps from questions to results and what makes it fit a classroom, with the join box at the top. The QuizUp logo (four squares and an amber check) is in the header, footer, favicon and the "Powered by" line. The server health and socket round-trip check moved into a quiet **Status** button in the footer of every page; it only runs when someone opens it.

## Reconnecting and invited-only quizzes

A student who loses connection keeps their screen. A banner says the connection is being restored, the exam timer keeps running, and answers picked while offline are kept in the page and sent as soon as the seat is back (the submit button waits until then). If the server turns a reconnect away for a moment, the page tries again on its own.

If a browser forgets its seat (cleared site data, another device), the student sees a clear message. The host presses **Let back in** next to the disconnected student in the console; for five minutes the student can join again with the same name and gets the same seat, answers and timer, with a fresh private credential. Opening a seat on a second device closes the first, which offers a "Use this device" button.

**Who can join** is a setting next to the assessment type. _Invited students only_ turns the console's **Invited students** panel on: the panel walks you through three steps. (1) Add students, either by pasting one per line (a name, or a name and an email) or by uploading a CSV with `name` and optional `email` columns (the file is loaded into the list so you can check it first; a sample CSV is one click away). (2) Send each student their personal token (ten characters, shown once) by email, a CSV download, or the Copy link button on each row. (3) Watch them join. Download the CSV for names, tokens and personal links (`/join/<CODE>#token=...`; the token sits in the URL fragment so it never reaches a server log). The join page then asks for the token instead of a name, and the name comes from your list. A token maps to one seat: using it again resumes that seat, **New token** replaces a lost or leaked one, and the panel shows when a token was opened on another device. Wrong tokens are throttled per visitor (20 a minute), so one person guessing cannot lock the others out. Invited students may arrive after an exam has opened; live and adaptive quizzes still close at the start. Run `supabase db reset` (or `supabase db push`) to apply migration 0012 (`session_roster`, server access only; it stores token hashes, never tokens).

The exam screen hides the site navigation and shows a large timer that turns amber at ten minutes and red in the last minute, with a screen-reader announcement at each milestone.

## AI question generation

Hosts can generate multiple-choice questions into a quiz from a topic or a pasted passage (the "Generate with AI" panel in the quiz editor). Generated questions are saved as **pending** and tagged "AI generated". Review, edit and approve them under "Needs review"; only approved questions can ever be used in a live session.

Server environment variables (server only, never put them in the web app or on Vercel):

| Variable         | Required | Meaning                                                                              |
| ---------------- | -------- | ------------------------------------------------------------------------------------ |
| `LLM_PROVIDER`   | no       | Provider to use, only `gemini` today (default)                                       |
| `GEMINI_API_KEY` | no       | Google AI Studio key. Without it the server still boots and the endpoint returns 503 |
| `GEMINI_MODEL`   | no       | Overrides the built-in default model id (`gemini-3.8-flash` at the time of writing)  |

Getting a key: open [Google AI Studio](https://aistudio.google.com/apikey), sign in, choose Create API key, and paste it into `apps/server/.env` locally or into the environment of the Render service. Keep it on Render only; it must never reach the browser or Vercel. In the Google Cloud console for that project, set a quota limit and a budget alert or spend cap, because anyone who can reach a host account can trigger generations (the server also limits each host to 10 generations an hour and one at a time).

Check the integration with one real call (not part of CI, uses your key, prints only whether the output validated):

```sh
npm run llm:smoke
```

## Google sign-in

Create a Google OAuth client with redirect URI `<supabase url>/auth/v1/callback`. Locally, set `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in your shell and set `enabled = true` under `[auth.external.google]` in `supabase/config.toml`, then `supabase stop && supabase start`. On a hosted project, enable the Google provider in the dashboard. The button on `/login` is hidden unless the web app has `VITE_GOOGLE_AUTH_ENABLED=true`; set it once the provider is enabled. Google accounts follow the same role rules: student unless the email is allowlisted.

## Modules, question order and images

- **Modules.** A question's topic is now an optional **Module** (for example Module 1, Module 2). Leave it empty and the question goes to **Unsorted**. The question bank groups questions by module; tick questions (or a whole module) and use **Move to module** to reorganise. The CSV `topic` column is optional.
- **Order.** In a quiz, approved questions are a numbered list: drag a question, or use **Move up** and **Move down**. Students get the questions in that order. The quiz details have a **Delivery** block (not shown for adaptive quizzes):
  - **Shuffle question order.** Live quiz: each session mixes the questions into one random order for the whole room (off by default). Timed exam: every student gets their own random order (on by default).
  - **Shuffle answer options** (timed exams only, on by default): every student sees the answers in their own order, and answers are mapped back for scoring. Live rounds show everyone the same question at once, so options are not shuffled there.
  - **Question pools.** Add a rule such as "Draw 5 from Module 2". Modules without a rule are always included. In a live session the draw happens once when the session is created; in a timed exam every student gets their own draw, stored with their attempt, and their score and total are counted out of the questions they received. The editor shows "Each student gets 12 of 20 questions" and warns when a rule asks for more than the module holds. Rules are saved with the quiz and fixed when a session is created.
  - Switching the assessment type resets the two shuffles to that type's defaults.
- **Images.** Each question can have one picture (PNG, JPEG or WebP, up to 2 MB) with a required description for screen readers. It shows in the editor, the bank, the host console and on the student's screen, live and in exams. Images are stored in the public `question-images` bucket, in a folder named after the host; the server only accepts addresses from that bucket.
- **Database.** Run `supabase db push` (or `supabase db reset` locally) to apply migrations 0014 (question position, `reorder_questions`) and 0015 (image columns and bucket) **before** deploying the server, because the server now reads those columns.

## Saved student groups

Hosts keep reusable class lists under **Students** in the top menu (`/host/groups`). A group has a name (unique per host, up to 60 characters) and up to 500 students, each with a name and an optional email, added by pasting lines or uploading a CSV exactly as in the invite panel. In an invited-only session, step 1 of the **Invited students** panel has **Add a saved group**: it copies the group's students into that session's roster and issues their tokens. Students already on the roster (same name, ignoring case) are skipped and counted. Later edits to a group never change a session that already used it, and deleting a group leaves those sessions alone. Groups are private to their host: another host's request returns 404.

API (host or admin): `GET/POST /groups`, `GET/PUT/DELETE /groups/:groupId`. `PUT` replaces the name and all students in one transaction (`save_student_group`). Run `supabase db push` to apply migration 0016 (`student_groups`, `student_group_members`, server access only).

## Results for students and hosts

Results are only ever viewed inside the app: no PDF export, nothing is emailed or sent to students.

- **Student.** In **My results**, a finished assessment's title links to a detail page (`/me/results/:sessionId`) with score, rank, time taken, accuracy per module and every question with the student's answer. Exam results stay hidden until the host releases them, and a live quiz result appears once the session has ended. A student only ever gets their own attempt.
- **Show correct answers.** A quiz setting in the editor's **Results** block (`showCorrectAnswers`): on by default for live and adaptive quizzes, off by default for timed exams. When it is off, the student still sees their score, rank, time and the answers they gave, but no per-question right or wrong, no correct option and no module accuracy; the server leaves those fields out, so they never reach the browser.
- **Host.** The session summary has a **Students** table; each name opens `/sessions/:sessionId/students/:participantId` with the same result view (always with correct answers), plus that student's proctor signal counts and timeline, and device. Only the quiz's own host (or an admin) can open it.
- **Time taken.** Exams: from the student's start to submit. Live quizzes: the sum of the time spent on each answer.
- **API.** `GET /me/results/:sessionId` (409 `session_not_finished` or `results_not_released` when not ready) and `GET /sessions/:sessionId/participants/:participantId/result` (host or admin). No database change.

## Camera and microphone proctoring

An opt-in extra for any proctored session. In the quiz editor, **Proctoring** is a yes or no (saved with the quiz); choosing yes reveals the camera, microphone and, for exams, auto-submit options. The Start dialog opens with those saved choices and the host can still change them for that session. It has two cards, **Watch the camera** and **Listen to the microphone**, and for exams an optional **Submit the exam automatically after repeated flags** switch with a limit of 3 to 50 (suggested 10).

**Nothing is recorded, uploaded or streamed.** Detection runs in the student's browser. A small face detector (MediaPipe BlazeFace, served from our own site) looks at one frame per second, and a volume meter reads the microphone level every quarter second. Only a flag's type and time reach the server, through the same channel as the other proctor signals.

| Flag                                                     | Raised when                                          | Counts toward the limit |
| -------------------------------------------------------- | ---------------------------------------------------- | ----------------------- |
| `face_missing`                                           | No face for 3 s                                      | Yes                     |
| `multiple_faces`                                         | Two or more faces for 2 s                            | Yes                     |
| `looking_away`                                           | Head turned for 4 s (nose far off the eye midpoint)  | Yes                     |
| `camera_blocked`                                         | A dark frame for 3 s                                 | Yes                     |
| `loud_audio`                                             | Sound well above the room's quiet level for 2 s      | Yes                     |
| `camera_denied`, `mic_denied`, `camera_lost`, `mic_lost` | Permission refused, no device, or the device stopped | No (recorded only)      |
| `auto_submitted`                                         | The exam was submitted at the limit                  | No (server-written)     |

Each continuous problem is one flag, plus one more every 30 s while it goes on. A problem only counts as over once it has stayed clear for 3 s (a flickering detector does not split one absence into many flags), and then the same problem is ignored for 5 s. A hidden tab pauses detection and counts as nothing (a tab switch is already its own signal). All numbers live in `apps/web/src/lib/proctorMedia/thresholds.ts`.

**The student sees it.** In an exam, after accepting the terms and before the timer starts, a pre-check screen asks for permission and shows a local self-view and a level bar (never sent anywhere); **Continue** always works, and a student who declines the terms never has the camera turned on. In a live quiz there is no check screen (it would run while question 1 is on the clock); the browser's permission prompt appears when the quiz starts. During the session a dark "Camera on / Mic on" pill is shown, plus "Flags 2 of 10" when there is a limit. Each flag shows a short warning in a reserved space (in the sticky header during an exam, so it is visible however far the student has scrolled, and the page never jumps); one flag before the limit it turns red: "One more and your exam will be submitted." The camera and microphone are switched off as soon as the attempt or quiz is over. Flags raised while the connection is down are held and sent once the student is back in the session.

**Refusal never blocks.** A student who denies access, has no device, or whose browser cannot run the detector still takes the session; the host sees `camera_denied` / `mic_denied`.

**Auto-submit is decided by the server**, which counts serious flags per attempt (also after a restart), stores `auto_submitted`, and submits through the normal path, so answers given so far are graded as usual. Hosts see an **Auto-submitted by proctoring** marker in the progress table and on the student's result page. It applies to exams only. It never changes a score.

**Consent.** When a device is on, the exam consent screen has a different version (`exam-consent-2026-10-media-v1`), lists what the camera and microphone are used for, says nothing is recorded or sent, and states the limit if there is one.

**Honest limits.** A second person, a phone or an earpiece outside the frame, or a photo held up to the camera, defeats this. Face detectors can misfire in poor light, with glasses glare or head coverings, and loud sound is not cheating. Treat flags as hints for a person to review. The thresholds are deliberately a little strict, which is why the limit is off by default.

**Setup.** `@mediapipe/tasks-vision` is pinned to 1.1.0. `npm run dev` and `npm run build` in `apps/web` first copy its wasm files into `apps/web/public/proctor/wasm` (git-ignored); the 230 KB face model is committed in `apps/web/public/proctor/`. A student's browser downloads one ~13 MB wasm file the first time camera proctoring runs, then caches it. Run `supabase db push` to apply migration 0017 (`sessions.proctor_camera`, `proctor_mic`, `proctor_flag_limit`). Do not run a plain `npm install <package>` in this repo without checking `git diff --stat package-lock.json`: it strips the `lightningcss` platform entries the Linux builds need.

Manual checks that CI cannot do are in [proctoring-manual-check.md](proctoring-manual-check.md).
