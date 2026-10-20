# Branded Assessments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simpler assessment setup, removal of learning data, co-branded student journey with feedback, host and student history, and a revamped host dashboard.

**Architecture:** Shared Zod schemas grow a `branding` object inside quiz settings and an `assessmentType` view over the existing settings; the engine copies branding and the quiz title into `room:state`; two new tables/buckets (feedback, branding storage) arrive by migration; history is served by two new REST endpoints that read existing session, participant and summary data.

**Tech Stack:** React 18, Vite, Tailwind 4, Express, Socket.IO, Supabase (Postgres, Storage), Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-19-branded-assessments-design.md`

## Global Constraints

- TypeScript strict; Zod schemas and types live in `packages/shared`; no code comments; minimal diffs.
- Server stays the source of truth: students never read quiz rows directly; everything they see arrives in `room:state` or via the server.
- Migrations are numbered 0009, 0010, 0011 and are applied by the user, never by us; README documents each.
- Do not commit or push. Do not deploy.
- Scoring, timers, proctoring and exam logic unchanged except where a task says so.
- Every UI string in sentence case; accessible labels on every control; 375 px and 1280 px without horizontal overflow.

## Review Focus

- A brand colour with poor contrast (for example `#FFFF00`) must still give readable text on every branded surface.
- A quiz without any branding (all existing quizzes) must look and behave exactly as today, with QuizUp branding only.
- Exam scores in "My results" must stay hidden until the host releases results.
- Feedback sent twice (double click, reconnect) must store one row.
- Logo upload with a wrong type or over 1 MB must be refused before upload with a clear message.

---

### Task 1: Quick fixes (exit full screen, copy link, assessment type)

**Files:**
- Modify: `apps/web/src/components/exam/ExamPlay.tsx`, `apps/web/src/pages/HostConsole.tsx`, `apps/web/src/pages/QuizEditor.tsx`
- Create: `apps/web/src/lib/fullscreen.ts`, `apps/web/src/components/CopyButton.tsx`, `apps/web/src/components/AssessmentTypePicker.tsx`, `packages/shared/src/assessmentType.ts`
- Test: `packages/shared/src/assessmentType.test.ts`, `apps/web/src/components/CopyButton.test.tsx`, `apps/web/src/components/AssessmentTypePicker.test.tsx`, `apps/web/src/components/exam/ExamPlay.test.tsx`, update `apps/web/src/pages/QuizEditor.test.tsx`

**Interfaces:**
- Produces: `type AssessmentType = 'live' | 'adaptive' | 'exam'`; `assessmentTypeOf(settings: QuizSettings): AssessmentType`; `settingsForAssessmentType(type: AssessmentType, durationMinutes?: number): QuizSettingsInput` (exam keeps duration; adaptive sets `adaptive: true`, rounds undefined).
- Produces: `exitFullscreenIfActive(): void`; `<CopyButton text label copiedLabel? />` (status text "Copied" for 2 s, fallback to selecting text when clipboard is unavailable).

- [ ] Tests first: shared mapping round-trips all three types; ExamPlay calls `document.exitFullscreen` when the view phase becomes `submitted` or `closed` and only when `document.fullscreenElement` is set; CopyButton writes to `navigator.clipboard` and announces "Copied"; picker is a radiogroup of three options with an info button that toggles an explanation; QuizEditor saves `{ mode: 'exam', durationMinutes }` for Timed exam and `{ adaptive: true }` for Adaptive quiz.
- [ ] Implement; editor drops the Quiz type select, Exam mode and Adaptive checkboxes, Rounds and Use learner history; `quiz.mode` column is written from the picker (`live` or `exam`).
- [ ] Verify: web tests, lint, typecheck, build; browser check of exam submit leaving full screen; screenshots of the picker at 375 and 1280.

### Task 2: Remove learning data completely

**Files:**
- Delete: `apps/web/src/pages/LearnerProfilePage.tsx`, `apps/server/src/live/learnerProfile.test.ts`
- Modify: `apps/web/src/App.tsx`, `apps/web/src/components/Layout.tsx` (+ test), `apps/web/src/lib/api.ts`, `apps/server/src/app.ts`, `apps/server/src/live/{engine,types,supabaseRepository,inMemoryRepository}.ts`, `packages/shared/src/{adaptive,learner,tables,index}.ts`, `packages/shared/src/learner.test.ts`, `README.md`
- Create: `supabase/migrations/0009_drop_learner_profiles.sql`

**Interfaces:**
- Removes: `useLearnerHistory` setting (parsing old settings that contain it must still succeed: strip unknown keys), `findLearnerProfile`, `applyLearnerProfile`, `deleteLearnerProfile`, `DELETE /me/learner-profile`, `api.deleteLearnerProfile`.
- Keeps: `participants.user_id`, `PROVISIONAL_QUESTION_ANSWERS`, `isProvisionalQuestion`, `questions.answers_count`.

- [ ] Test first: shared settings parse `{ adaptive: true, useLearnerHistory: false }` without error and the output has no `useLearnerHistory`; server test that `DELETE /me/learner-profile` now returns 404; adaptive engine tests still pass with no profile seeding.
- [ ] Remove code; migration `drop function if exists public.apply_learner_profile(...)`; `drop table if exists public.learner_profiles`.
- [ ] Verify: full `npm test`, lint, typecheck, build; `grep -ri learner` shows only provisional helpers and migration history.

### Task 3: Branding

**Files:**
- Create: `packages/shared/src/branding.ts` (+ test), `supabase/migrations/0010_branding_storage.sql`, `apps/web/src/components/branding/{BrandMark,BrandingForm,LogoUpload,PoweredBy}.tsx` (+ tests), `apps/web/src/lib/brandColor.ts` (+ test), `apps/web/src/components/StudentIntro.tsx` (+ test)
- Modify: `packages/shared/src/{adaptive,socket}.ts`, `apps/server/src/live/engine.ts` (+ test), `apps/web/src/pages/{QuizEditor,Play,HostConsole,SessionSummaryPage}.tsx`, `apps/web/src/components/exam/ExamPlay.tsx`, `README.md`

**Interfaces:**
- Produces: `brandingSchema = { institutionName?: string(1..80), logoUrl?: https url, tagline?: string(..120), brandColor?: /^#[0-9a-f]{6}$/i, welcomeMessage?: string(..500), instructions?: string(..2000) }`; `quizSettings.branding` optional.
- Produces: `room:state` gains `quizTitle: string` and `branding: Branding | null` for host and students.
- Produces: `readableTextOn(hex): '#ffffff' | '#1c2533'` (contrast ≥ 4.5 or the better of the two).
- Storage: bucket `branding`, public read; insert/update/delete only where `(storage.foldername(name))[1] = auth.uid()::text` and the user is host or admin.

- [ ] Tests first: schema accepts empty branding and rejects `javascript:` URLs and bad colours; `readableTextOn('#FFFF00')` is ink, `('#1E5446')` is white; engine puts quiz title and branding into room state; LogoUpload refuses SVG and files over 1 MB with a message; StudentIntro shows institution, title, welcome and "Powered by QuizUp", then instructions with standard rules per type, and a Continue button.
- [ ] Implement; Play and ExamPlay show Intro then Instructions once per session (remembered in sessionStorage per join code) before lobby or consent; co-brand header on student screens; host console join panel and summary header show the brand.
- [ ] Verify: tests, lint, typecheck, build; harness-driven screenshots with and without branding; unbranded flow unchanged.

### Task 4: Feedback form

**Files:**
- Create: `supabase/migrations/0011_session_feedback.sql`, `packages/shared/src/feedback.ts` (+ test), `apps/web/src/components/FeedbackForm.tsx` (+ test)
- Modify: `packages/shared/src/socket.ts`, `apps/server/src/socket.ts`, `apps/server/src/live/{types,supabaseRepository,inMemoryRepository}.ts`, `apps/server/src/routes/sessions.ts` (+ tests), `apps/web/src/pages/{Play,SessionSummaryPage}.tsx`, `apps/web/src/components/exam/ExamPlay.tsx`, `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: socket `feedback:submit { rating: 1..5, comment?: string(..500) }` → `Ack`; only for a student in an ended session or a submitted exam attempt; upsert on `(session_id, participant_id)`.
- Produces: `GET /sessions/:id/feedback` (host owner) → `{ count, averageRating, items: { displayName, rating, comment, createdAt }[] }`.
- Table `session_feedback(id, session_id fk cascade, participant_id fk cascade, rating smallint check 1..5, comment text check length ≤ 500, created_at, unique(session_id, participant_id))`, RLS: no client access (server role only).

- [ ] Tests first: schema bounds; server rejects feedback before the session ends, accepts after, second submit updates the same row; host endpoint 403 for another host; FeedbackForm requires a rating, sends once, then shows "Thanks for your feedback".
- [ ] Implement and wire Finish screens (live ended, exam submitted/results) to show the form; summary page shows the feedback panel.
- [ ] Verify as Task 3.

### Task 5: History (host and student)

**Files:**
- Create: `packages/shared/src/history.ts` (+ test), `apps/web/src/pages/QuizHistoryPage.tsx` (+ test), `apps/web/src/pages/MyResultsPage.tsx` (+ test)
- Modify: `apps/server/src/routes/quizzes.ts`, `apps/server/src/app.ts`, repositories and types (+ tests), `apps/web/src/App.tsx`, `apps/web/src/components/Layout.tsx`, `apps/web/src/lib/api.ts`

**Interfaces:**
- Produces: `GET /quizzes/:quizId/sessions` (owner) → `QuizSessionHistoryRow[] = { sessionId, joinCode, status, mode, adaptive, startedAt, endedAt, participantCount, averageScore | null, feedbackCount, averageRating | null }` newest first.
- Produces: `GET /me/results` (any signed-in user) → `MyResultRow[] = { sessionId, quizTitle, branding, mode, endedAt, score | null, rank | null, participantCount, resultsHidden: boolean }` where exam rows have `resultsHidden: true` and null score until `results_released_at` is set.
- Routes: `/host/quizzes/:quizId/history`, `/me/results`; nav "My results" for signed-in users.

- [ ] Tests first: endpoint ownership, ordering, averages from stored summaries, unreleased exam hiding; pages render rows, empty states and links to summaries.
- [ ] Implement and verify as above.

### Task 6: Host dashboard revamp

**Files:** Modify `apps/web/src/pages/Host.tsx` (+ test), `apps/server/src/routes/quizzes.ts` only if `listQuizzes` needs `last_session` (prefer a client call to the history endpoint per card if counts are small; decide by measuring).

- [ ] Tests first: each quiz card shows title, assessment type, question count, branding logo or initials, last run date; actions Run (creates session), Edit, History, Copy link (last session code, disabled when none).
- [ ] Implement and verify; final whole-branch review; docs (`decisions.md`, `flow.md`, README).
