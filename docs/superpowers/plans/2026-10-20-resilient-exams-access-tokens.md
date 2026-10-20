# Resilient exams and access-token mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Reconnect and seat recovery for students, plus an access-token mode with a host roster.

**Architecture:** `accessMode` joins quiz settings; the engine keeps a per-session roster (memory, mirrored to `session_roster`); `room:join` accepts `accessToken`; REST endpoints under `/sessions/:id` manage the roster and "let back in"; the web client keeps its screen across disconnects and queues exam answers.

**Tech Stack:** React 18, Express, Socket.IO, Supabase, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-20-resilient-exams-access-tokens-design.md`

## Global Constraints

- TypeScript strict; Zod in `packages/shared` with `.js` relative imports; no code comments; minimal diffs.
- Do not commit, push or deploy. Migration 0012 is applied by the user.
- Scoring, timers, proctoring and exam logic unchanged.
- 375 px and 1280 px without horizontal overflow.

## Review Focus

- Same token used from two devices: the first connection is closed, one participant row only.
- Two simultaneous first joins with one token create one participant.
- Wrong tokens are throttled and never reveal whether a roster name exists.
- A name-only join to a token session is refused.
- Let back in expires after 5 minutes and works once.
- Offline answers survive a room:state refresh and are sent once the seat is restored.

### Task 1: Shared contracts
- Files: `packages/shared/src/{adaptive,socket,joinInfo,roster}.ts` (+ tests), `index.ts`
- Produces: `quizSettings.accessMode`, `studentJoinPayloadSchema` with optional `displayName`/`accessToken`, error codes `invalid_access_token`, `access_token_required`, ack `displayName`, `JoinInfo.accessMode`, roster schemas, `parseRosterText`, `normalizeAccessToken`.
- [ ] Tests first, implement, run shared tests.

### Task 2: Persistence
- Files: `supabase/migrations/0012_session_roster.sql`, `apps/server/src/live/{types,supabaseRepository,inMemoryRepository}.ts`
- Produces: repository `listRoster`, `insertRoster`, `updateRosterEntry`, `deleteRosterEntry`, `updateParticipantTokenHash`.

### Task 3: Engine, routes
- Files: `apps/server/src/live/engine.ts`, `apps/server/src/routes/sessions.ts`, `apps/server/src/joinInfo`, `apps/server/src/socket.ts`
- Tests: `apps/server/src/live/accessToken.test.ts`.

### Task 4: Student client
- Files: `Play.tsx`, `Join.tsx`, `storedJoin.ts`, `ExamAttemptView.tsx` (+ tests)

### Task 5: Host client
- Files: `QuizEditor.tsx`/`AssessmentTypePicker.tsx`, `RosterPanel.tsx`, `StudentRoster.tsx`, `HostConsole.tsx`, `lib/api.ts`

### Task 6: Exam chrome and timer
- Files: `Layout.tsx`, `ExamAttemptView.tsx`

### Task 7: Docs and verification
- README, decisions.md, flow.md; lint, typecheck, build, test; browser check.
