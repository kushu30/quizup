# Branded assessments, history and simpler setup: design

Approved in conversation on 2026-10-19. Builds on the Classroom Professional redesign.

## Intent

QuizUp should feel like the platform powering an institution's assessment: "Lincoln High, powered by QuizUp". Hosts set up an assessment in plain terms, share it in a class group, brand it, and come back later to everything that happened. Students get a guided, branded experience from intro to feedback and can see their past results when signed in.

## Goals

1. Exam ends (submitted, closed, time up): the browser leaves full screen automatically.
2. Copy link: the host console has a "Copy link" button for `<origin>/join/<CODE>`.
3. Assessment type: one picker with Live quiz, Adaptive quiz, Timed exam. Adaptive explained in a small info box. Rounds and learner-history controls removed (rounds automatic).
4. Learning data removed completely: page, nav link, toggle, `/me/learner-profile`, engine seeding and writing, repository methods, the profile helpers and schemas in shared (`LearnerProfile`, `clampProfileElo`, `normalizeProfileMastery`, `learnerProfileTableSchema`; `PROVISIONAL_QUESTION_ANSWERS` and `isProvisionalQuestion` stay), and migration 0009 dropping `learner_profiles` and `apply_learner_profile`. Participants keep `user_id` (needed for student history). Adaptive question rating counts (`questions.answers_count`, `apply_question_rating_delta`) stay.
5. Branding per quiz: logo (file upload to a Supabase Storage bucket), institution name, optional tagline, brand colour, welcome message, custom instructions. Shown on every student screen and in the host console and summary as a co-brand ("<Institution> powered by QuizUp").
6. Student journey: Intro (logo, institution, assessment title, welcome) then Instructions (host text plus standard rules for the type) then the existing lobby / consent / exam / live screens, then a Finish screen with a Feedback form.
7. Feedback: rating 1 to 5 (required), "What went well or was hard?" (optional, 500 chars). One per participant per session. Host sees it in History and on the session summary.
8. History. Host: per-quiz History page listing every session (started, ended, type, students, average score, feedback average) linking to summary and exports. Student: signed-in students get "My results" listing past sessions with title, institution, date, score and rank (exam scores only after results are released).
9. Host dashboard revamp: quiz cards with branding thumbnail, assessment type, question count, last run; actions Run, Edit, History, Copy last link.

## Non-goals

- Anonymous student history (no account to attach to).
- Custom domains, per-institution accounts, white-label removal of QuizUp branding.
- Editing feedback after submitting.

## Anti-goals

- Brand colours that make text unreadable: the app picks ink or white text by contrast and never uses a brand colour for body text.
- Breaking existing sessions or exports; changing scoring, timers, proctoring or exam logic.
- Running migrations against the user's Supabase project (the user applies them).

## Constraints

- Standing rules: TypeScript strict, Zod in packages/shared, no code comments, minimal diffs, server is the source of truth, secrets only in .env, user commits.
- Migrations: 0009 (drop learner profiles), 0010 (branding storage bucket and policies), 0011 (session feedback). Each documented in README.
- Logo: PNG, JPEG or WebP (SVG excluded because it can carry scripts), max 1 MB, stored at `branding/<host_id>/<quiz_id>-<timestamp>.<ext>`; public read; hosts write only under their own id folder.
- Brand colour: `#RRGGBB`; text colour chosen for at least 4.5:1.

## Decided by the user

Remove learning data completely; logo by upload; branding everywhere with QuizUp co-branding and intro, instructions and feedback pages visible to the host; history for hosts and students; dashboard revamp; order 1 to 6 as listed in the plan.

## Left to the builder (my calls)

Feedback fields; branding field list and limits; Intro and Instructions shown before the lobby for live quizzes and before consent for exams; History columns; dashboard card layout.
