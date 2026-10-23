# Camera and Microphone Proctoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect missing face, extra faces, looking away, blocked camera and sustained loud audio in the student's browser, report them as proctor events, warn the student live, and optionally auto-submit an exam after N serious flags.

**Architecture:** Detection runs entirely in the browser (MediaPipe FaceDetector at 1 frame per second, Web Audio level meter). Pure state machines turn per-sample conditions into "episodes" that become flags. Flags travel through the existing `proctor:event` socket path; the server counts them, tells the student their count, and auto-submits through the existing submit path.

**Tech Stack:** TypeScript, React, Vite, Socket.IO, Zod, Vitest, `@mediapipe/tasks-vision`, Web Audio API, Supabase migration.

**Spec:** `docs/superpowers/specs/2026-10-23-camera-mic-proctoring-design.md`

## Global Constraints

- **Never run `git commit` or `git push`.** Where a task would commit, stop and tell the user the task is ready, with a plain suggested message and no Claude attribution.
- No video, audio or image ever leaves the device; events carry only a type, `clientAt` and an optional `{ continued: boolean }` detail.
- Camera and microphone are opt-in per session; a refusal never blocks (logs `camera_denied` / `mic_denied`).
- Serious flags (the only ones that count toward the limit and the student counter): `face_missing`, `multiple_faces`, `looking_away`, `camera_blocked`, `loud_audio`.
- Thresholds (all in one web constants file): face missing 3 s, multiple faces 2 s, looking away 4 s, camera blocked 3 s, loud audio 2 s, one extra flag every 30 s while an episode continues, 5 s cooldown after an episode clears, 1 frame per second, audio read every 250 ms, 5 s audio calibration.
- Auto-submit: exams only, off by default, limit 3 to 50 (suggested 10), decided on the server, never changes a score.
- Existing signals (tab switch and others) must not count toward the limit and must behave exactly as before.
- Consent text must name the camera/mic use and, when a limit is set, say: "If you are flagged N times, your exam is submitted automatically".
- UI follows the existing styles: `landing/cta.ts` buttons (`0.8rem` corners), `ui/` Notice, the `StatusPill` look; warnings use `aria-live`, respect reduced motion, never cover question or answers.
- Lint, typecheck and `npm test` stay green after every task.

## Review Focus

1. A student who denies camera or mic (or has no device, or no WebGL) still joins and finishes; one `camera_denied` / `mic_denied` event is logged, nothing crashes. (Task 5, 7)
2. A hidden browser tab produces no `face_missing` or `loud_audio` flags (sampling pauses; tab switching is already its own signal). (Task 5)
3. Server restart or reconnect mid-exam keeps the flag count, so the limit and the counter stay correct and an attempt is never auto-submitted twice. (Task 3)
4. A client sending a media event for a session that did not enable it is ignored and stored nowhere. (Task 3)
5. A condition that flaps around its threshold does not create an event storm (cooldown and continuation rules). (Task 4)

---

## File Structure

| File                                                           | Responsibility                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/shared/src/exam.ts`                                  | Event types, serious list, limit constants, schemas, consent copy and version |
| `packages/shared/src/socket.ts`                                | Room state fields, `proctor:flags` event                                      |
| `supabase/migrations/0017_proctor_media.sql`                   | Three `sessions` columns                                                      |
| `apps/server/src/exam/examService.ts`, `live/engine.ts`, repos | Accept, count, warn, auto-submit                                              |
| `apps/web/src/lib/proctorMedia/*`                              | Constants and pure detection logic                                            |
| `apps/web/src/hooks/useMediaProctor.ts`                        | Camera/mic access, sampling loops, event emission                             |
| `apps/web/src/components/proctor/*`                            | Pre-check, indicator, warning banner, layer that ties them together           |

---

### Task 1: Shared contract

**Files:**

- Modify: `packages/shared/src/exam.ts`, `packages/shared/src/socket.ts`, `packages/shared/src/csvExport.ts` (only if it lists proctor columns by name)
- Test: `packages/shared/src/proctorMedia.test.ts` (new)

**Interfaces:**

- Produces (in `exam.ts`):
  - `PROCTOR_SERIOUS_TYPES` (readonly tuple of the five serious types) and `type ProctorSeriousType`.
  - `PROCTOR_COUNTED_TYPES` now also contains the five serious types; `PROCTOR_RECORD_TYPES` also contains `camera_lost`, `camera_denied`, `mic_lost`, `mic_denied`, `auto_submitted`.
  - `PROCTOR_FLAG_LIMIT = { min: 3, max: 50, suggested: 10 }`.
  - `seriousFlagCount(counts: ProctorCounts): number`.
  - `sessionStartSchema` gains optional `proctorCamera`, `proctorMic` (booleans) and `proctorFlagLimit` (int, 3 to 50).
  - `examSubmitReasonSchema` gains `'proctor_limit'`.
  - `proctorEventPayloadSchema` accepts the five serious types (optional `detail: { continued: boolean }`) and the four lost/denied types (no detail); it does **not** accept `auto_submitted`.
  - `consentVersionFor(media: { camera: boolean; mic: boolean }): string` (unchanged `EXAM_CONSENT_VERSION` when neither; `'exam-consent-2026-10-media-v1'` otherwise) and `EXAM_CONSENT_MEDIA_TEXT` (monitored lines for camera and mic, "no video or audio is recorded or sent") plus `proctorLimitSentence(limit: number): string`.
  - `PROCTOR_TYPE_LABELS` entries for every new type ("No face in view", "Several faces", "Looking away", "Camera blocked", "Loud sound", "Camera lost", "Camera denied", "Microphone lost", "Microphone denied", "Auto-submitted by proctoring").
- Produces (in `socket.ts`): `roomStatePayloadSchema` gains `proctorCamera: boolean`, `proctorMic: boolean`, `proctorFlagLimit: number | null` (all defaulted so old payloads parse); `ServerToClientEvents['proctor:flags']: (payload: { count: number; limit: number | null; type: ProctorSeriousType }) => void`.

- [ ] **Step 1: Write failing tests** in `proctorMedia.test.ts`: `seriousFlagCount` sums only the five serious types (a tab_switch of 9 adds 0); `emptyProctorCounts()` has a key for each serious type; `proctorEventPayloadSchema` accepts `{type:'face_missing',clientAt:1,detail:{continued:true}}` and `{type:'camera_denied',clientAt:1}` and rejects `{type:'auto_submitted',clientAt:1}` and `{type:'face_missing',clientAt:1,detail:{x:1}}`; `sessionStartSchema` rejects `proctorFlagLimit` 2 and 51 and accepts 3 and 50; `consentVersionFor({camera:false,mic:false})` equals `EXAM_CONSENT_VERSION` and the media variants differ from it; `proctorLimitSentence(10)` contains "flagged 10 times"; every record type has a label.
- [ ] **Step 2:** Run `npx vitest run packages/shared/src/proctorMedia.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement the interfaces above in `exam.ts` and `socket.ts`; extend `proctorCountsSchema` and `emptyProctorCounts` for the new counted types; if `csvExport.ts` builds proctor columns from `PROCTOR_COUNTED_TYPES` nothing else changes, otherwise add the new columns.
- [ ] **Step 4:** Run `npm run typecheck && npx vitest run packages/shared`; expect PASS. Fix any web/server compile errors caused by the wider count type (they are expected, small, and belong to this task).
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: shared contract for camera and mic proctoring`).

---

### Task 2: Session settings, migration and room state

**Files:**

- Create: `supabase/migrations/0017_proctor_media.sql`
- Modify: `packages/shared/src/tables.ts` (`sessionSchema`), `apps/server/src/live/types.ts` (`SessionUpdate`), `inMemoryRepository.ts`, `supabaseRepository.ts`, `apps/server/src/live/engine.ts` (`startSession`, `getProctorInfo`, room state builder near line 1799), `apps/server/src/routes/sessions.ts`
- Test: `apps/server/src/live/proctorMediaSettings.test.ts` (new, harness style of `proctoring.test.ts`)

**Interfaces:**

- Consumes: Task 1 schemas.
- Produces: `sessions.proctor_camera boolean not null default false`, `sessions.proctor_mic boolean not null default false`, `sessions.proctor_flag_limit integer null check (between 3 and 50)`; `Session` gains `proctor_camera`, `proctor_mic`, `proctor_flag_limit`; `engine.startSession(sessionId, hostId, options: { proctored?: boolean; proctorCamera?: boolean; proctorMic?: boolean; proctorFlagLimit?: number })`; `engine.getProctorInfo(sessionId)` additionally returns `{ camera: boolean; mic: boolean; flagLimit: number | null }`; room state sends `proctorCamera`, `proctorMic`, `proctorFlagLimit`.

- [ ] **Step 1: Write failing tests**: starting with `{proctored:true, proctorCamera:true, proctorMic:false}` puts `proctorCamera:true, proctorMic:false` in the student's room state; the flags are forced false and the limit null when `proctored` is false; `proctorFlagLimit` is kept for an exam and dropped (null) for a live quiz; sessions started without the new options behave exactly as before.
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Write the migration; add the fields to `sessionSchema` with defaults; persist them in both repositories; apply the rules in the tests inside `startSession`; pass them from the route (`body.proctorCamera`, `body.proctorMic`, `body.proctorFlagLimit`); include them in the room state builder.
- [ ] **Step 4:** Run `npx vitest run apps/server`; expect PASS.
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: camera, mic and flag-limit session settings`). Remind the user to run migration `0017` on their own database only.

---

### Task 3: Server counts flags, warns the student and auto-submits

**Files:**

- Modify: `apps/server/src/exam/examService.ts` (`recordProctorEvent`, `recordLiveProctorEvent`, rehydration of `entry.counts`), `packages/shared/src/exam.ts` (`examProgressRowSchema` gains `autoSubmitted: boolean`)
- Test: `apps/server/src/exam/proctorMedia.test.ts` (new, same harness as `examSession.test.ts`)

**Interfaces:**

- Consumes: Task 1 and Task 2.
- Produces: after a serious event is stored, `emitToParticipant(participantId, 'proctor:flags', { count, limit, type })`; when `limit !== null` and `seriousFlagCount(entry.counts) >= limit` the service stores an `auto_submitted` record (`detail: { count, limit }`), then calls the existing `performSubmit(entry, 'proctor_limit')`; the progress row's `autoSubmitted` is true for such attempts.

- [ ] **Step 1: Write failing tests**: events of media types are ignored (nothing stored, `{ok:true}`) when the session did not enable the matching flag, and `looking_away` is ignored when only the mic is enabled; with camera on and limit 3, three `face_missing` events produce three `proctor:flags` messages with count 1,2,3, then one `auto_submitted` record, the attempt is submitted with reason `proctor_limit`, and `exam:submitted` reaches the student; a fourth event after submit is rejected as `no_open_attempt` and nothing is submitted twice; tab switches never increase the count; `camera_denied` is stored but does not count; in a live quiz flags are counted and `proctor:flags` is sent with `limit: null`, with no submit; after rebuilding the service from stored events (restart), the count and `autoSubmitted` are restored.
- [ ] **Step 2:** Run `npx vitest run apps/server/src/exam/proctorMedia.test.ts`; expect FAIL.
- [ ] **Step 3:** Implement: gate media types by `getProctorInfo().camera/mic`; use the shared `seriousFlagCount` for the exam entry and `liveCounts`; emit `proctor:flags`; trigger the auto-submit once; on rehydration rebuild counts from stored events of counted types (including the new ones) and set `autoSubmitted` from an `auto_submitted` event.
- [ ] **Step 4:** Run `npm test`; expect PASS.
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: server flag counting, warnings and auto-submit`).

---

### Task 4: Pure detection logic (web)

**Files:**

- Create: `apps/web/src/lib/proctorMedia/thresholds.ts`, `episodes.ts`, `frameAnalysis.ts`, `audioLevel.ts`
- Test: `episodes.test.ts`, `frameAnalysis.test.ts`, `audioLevel.test.ts` beside them

**Interfaces:**

- Produces:
  - `thresholds.ts`: the constants named in Global Constraints (`FACE_MISSING_HOLD_MS` and so on), plus `TURN_RATIO = 0.45`, `DARK_BRIGHTNESS_MAX = 12`, `AUDIO_MARGIN = 0.06`, `AUDIO_FLOOR = 0.08`.
  - `episodes.ts`: `createEpisodeTracker(options: { holdMs: number; continueMs: number; cooldownMs: number }): { update(active: boolean, nowMs: number): 'none' | 'start' | 'continue' }`.
  - `frameAnalysis.ts`: `interface FaceBox { keypoints: { x: number; y: number }[] }` (normalised 0 to 1, BlazeFace order: right eye, left eye, nose tip, mouth, right ear, left ear) and `classifyFrame(input: { faces: FaceBox[]; brightness: number }): { faceCount: number; turnedAway: boolean; blocked: boolean }` (`blocked` when brightness is at most `DARK_BRIGHTNESS_MAX`, `turnedAway` only with exactly one face and nose offset from the eye midpoint above `TURN_RATIO` of the eye distance).
  - `audioLevel.ts`: `rmsLevel(samples: Float32Array): number` and `createLoudnessDetector(): { push(level: number, nowMs: number): boolean }` (learns a baseline over the first `AUDIO_CALIBRATION_MS`, then returns true while level exceeds `max(baseline + AUDIO_MARGIN, AUDIO_FLOOR)`).

- [ ] **Step 1: Write failing tests** driven by synthetic time: a face missing for 2.9 s gives `'none'` and at 3 s `'start'`; then nothing until 30 s after the start, then `'continue'` every 30 s; after the condition clears a new `'start'` needs the hold time again and 5 s of cooldown; flapping on and off every second never reaches `'start'` (Review Focus 5); `classifyFrame` with no faces, two faces, one centred face, one face with the nose far to one side, and a black frame; `rmsLevel` of silence is 0 and of a full-scale sine is about 0.707; the loudness detector never fires during the first 5 s, fires after a sustained loud level, ignores a quiet room (below the floor) and a single loud blip.
- [ ] **Step 2:** Run `npx vitest run apps/web/src/lib/proctorMedia`; expect FAIL.
- [ ] **Step 3:** Implement the four files exactly to the signatures above; keep every number in `thresholds.ts`.
- [ ] **Step 4:** Run the same command; expect PASS.
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: pure camera and audio detection logic`).

---

### Task 5: Media access and the detection hook

**Files:**

- Create: `apps/web/src/lib/proctorMedia/mediaStreamStore.ts`, `apps/web/src/hooks/useMediaProctor.ts`, `apps/web/scripts/copy-proctor-assets.mjs`, `apps/web/public/proctor/blaze_face_short_range.tflite`
- Modify: `apps/web/package.json` (dependency `@mediapipe/tasks-vision` pinned to an exact version at least two weeks old; `prebuild` and `predev` scripts running the copy script), root `.gitignore` (`apps/web/public/proctor/wasm/`)
- Test: `apps/web/src/hooks/useMediaProctor.test.tsx` (new, mocks `navigator.mediaDevices`, the detector and `AudioContext`)

**Interfaces:**

- Consumes: Task 4 modules; `ProctorEventPayload` from Task 1.
- Produces:
  - `type DeviceState = 'ready' | 'denied' | 'missing' | 'lost'`.
  - `mediaStreamStore.ts`: `acquireMedia(want: { camera: boolean; mic: boolean }): Promise<{ stream: MediaStream | null; camera: DeviceState | null; mic: DeviceState | null }>`, `currentMedia()`, `releaseMedia(): void` (stops all tracks). One shared stream so the pre-check permission is reused.
  - `useMediaProctor(options: { enabled: boolean; camera: boolean; mic: boolean; send: (event: ProctorEventPayload) => void; now: () => number }): { camera: DeviceState | null; mic: DeviceState | null }`.

- [ ] **Step 1: Write failing tests** with fake timers and mocks: permission denied sends exactly one `camera_denied` and no flags, and the hook still returns `denied`; a missing device sends `mic_denied`; a track `ended` event sends one `camera_lost` / `mic_lost`; one fake face for 3 s sends `face_missing` only after the hold time, with `detail.continued` false, then `true` 30 s later; no frames are analysed and no events are sent while `document.hidden` is true (Review Focus 2); a browser without `mediaDevices` or without WebGL degrades to a denied event and no throw (Review Focus 1); unmounting stops the sampling intervals and the audio context.
- [ ] **Step 2:** Run `npx vitest run apps/web/src/hooks/useMediaProctor.test.tsx`; expect FAIL.
- [ ] **Step 3:** Implement. Camera request 320x240; sample a downscaled frame once per second from a hidden `<video>` through a small `<canvas>` for brightness and pass the video frame to the `FaceDetector` (CPU delegate, model and wasm from `/proctor/`, initialised once per mount); read audio through an `AnalyserNode` every 250 ms with no recording node; feed each condition through its `createEpisodeTracker` and send `{ type, clientAt: now(), detail: { continued } }` on `'start'` and `'continue'`. The copy script copies `node_modules/@mediapipe/tasks-vision/wasm` into `public/proctor/wasm`.
- [ ] **Step 4:** Run `npx vitest run apps/web && npm run build -w apps/web`; expect PASS and a successful build.
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: camera and microphone detection hook`). Tell the user the first install needs `npm install`.

---

### Task 6: Host controls and markers

**Files:**

- Modify: `apps/web/src/components/ProctoringChoiceDialog.tsx`, `apps/web/src/pages/HostConsole.tsx` (the `onChoose` call around line 798), `apps/web/src/components/exam/ExamProgressTable.tsx`, `apps/web/src/pages/StudentResultPage.tsx`, `apps/web/src/components/exam/ProctorTimeline.tsx` (labels already come from Task 1)
- Test: `ProctoringChoiceDialog.test.tsx`, `ExamProgressTable.test.tsx`, `StudentResultPage.test.tsx` (extend existing)

**Interfaces:**

- Consumes: Task 1 (`PROCTOR_FLAG_LIMIT`, `SessionStartInput`), Task 3 (`autoSubmitted` on progress rows).
- Produces: `ProctoringChoiceDialog` prop `onChoose: (choice: { proctored: boolean; proctorCamera: boolean; proctorMic: boolean; proctorFlagLimit?: number }) => void`; HostConsole passes the choice to `api.startSession(sessionId, choice)`.

- [ ] **Step 1: Write failing tests**: with "Start with proctoring" the choice carries the two checkboxes (default both off); the checkboxes are hidden when starting without proctoring; the auto-submit switch appears only for `kind="exam"` once a checkbox is on, reveals a stepper clamped to 3 to 50 with default 10, and is off by default (no `proctorFlagLimit` in the choice); a progress row with `autoSubmitted` shows an "Auto-submitted by proctoring" dark pill; the student result page shows the same marker when the timeline holds an `auto_submitted` event.
- [ ] **Step 2:** Run those test files; expect FAIL.
- [ ] **Step 3:** Implement. Option cards in the existing delivery-switch style (title, one-line description, small icon); the pill reuses the dark look of `StatusPill` ended; keep the dialog's current keyboard behaviour (Escape cancels, focus on the safe button).
- [ ] **Step 4:** Run `npx vitest run apps/web`; expect PASS.
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: host controls and markers for camera and mic proctoring`).

---

### Task 7: Student pre-check, indicator, warnings and consent

**Files:**

- Create: `apps/web/src/components/proctor/ProctorPrecheck.tsx`, `ProctorIndicator.tsx`, `ProctorWarningBanner.tsx`, `MediaProctorLayer.tsx` (+ a test file each)
- Modify: `apps/web/src/pages/Play.tsx` (pre-check gate after the intro gate, `proctor:flags` listener, layer next to `LiveProctor` at line 463), `apps/web/src/components/exam/ExamAttemptView.tsx` (layer beside `useProctor`), `apps/web/src/components/exam/ExamConsent.tsx` (media section and limit sentence, sends `consentVersionFor`), `apps/web/src/components/exam/ExamPlay.tsx` (message for reason `proctor_limit`)
- Test: the component tests above plus `Play.test.tsx` / `ExamConsent.test.tsx` additions

**Interfaces:**

- Consumes: `useMediaProctor`, `acquireMedia`, `releaseMedia` (Task 5); `proctor:flags`, room state fields, `EXAM_CONSENT_MEDIA_TEXT`, `proctorLimitSentence`, `consentVersionFor` (Task 1).
- Produces: `ProctorPrecheck({ camera: boolean; mic: boolean; onContinue: () => void })` (rounded live self-view, mic level bar, a status pill per device: Ready, Blocked, Not found; **Continue** always works; self-view and mic meter are local only); `ProctorIndicator({ camera: DeviceState | null; mic: DeviceState | null; flags: { count: number; limit: number | null } | null })` (dark pill with a dot and "Camera on" / "Mic on", and "Flags 2 of 10" only when a limit exists); `ProctorWarningBanner({ warning: { id: number; type: ProctorSeriousType; count: number; limit: number | null } | null })` (`role="status" aria-live="polite"`, about 8 s visible, amber, alert-coloured and "One more and your exam will be submitted." when `count === limit - 1`, at most one banner per 30 s per type); `MediaProctorLayer({ socket, room: { proctorCamera: boolean; proctorMic: boolean; proctorFlagLimit: number | null }, active: boolean, connected: boolean, now: () => number })`.

- [ ] **Step 1: Write failing tests**: the pre-check shows a pill per requested device, Continue works when access is denied (Review Focus 1), and the self-view is not rendered after Continue; the banner text per serious type ("We can't see your face. Please stay in view." and a line for each other type), the final-warning variant, and the rate limit of one banner per 30 s per type; the indicator hides the counter without a limit; `Play` shows the pre-check before the lobby when camera or mic is on and not again after Continue; the consent screen lists the camera/mic lines only when media is on, shows the limit sentence only with a limit, and `exam:start` is sent with `consentVersionFor`; the exam-submitted screen explains `proctor_limit` ("Your exam was submitted because it reached the proctoring flag limit.").
- [ ] **Step 2:** Run the new and extended test files; expect FAIL.
- [ ] **Step 3:** Implement with the existing `cta.ts` buttons, `Notice` and pill language; banner enters with the existing `animate-pop` (already disabled under reduced motion); the layer calls `useMediaProctor` with the socket's `proctor:event` and keeps the latest `proctor:flags` payload in state.
- [ ] **Step 4:** Run `npm test && npm run lint && npm run typecheck`; expect all PASS.
- [ ] **Step 5:** Stop. Ready to commit (suggested: `ADD: student camera and mic proctoring interface`).

---

### Task 8: Docs and manual checklist

**Files:**

- Modify: `docs/features.md` (new section "Camera and microphone proctoring": what is detected, thresholds, auto-submit, limits, privacy), `README.md` only if the privacy claim "no webcam, no microphone" appears there, `apps/server/.env.example` (no change expected)
- Create: `docs/proctoring-manual-check.md`

- [ ] **Step 1:** Update `features.md` and remove or correct every remaining "no webcam / no microphone" statement (search the repo, including the proctoring dialog copy from Task 6 and `EXAM_CONSENT_TEXT.notCollected`, which must now say camera and mic are used only when the host turns them on).
- [ ] **Step 2:** Write the manual checklist: real laptop and a phone; deny camera; deny mic; cover the lens; second face (photo of a person); turn head; talk loudly; unplug the camera; switch tab; reach the flag limit and check the auto-submit marker; restart the server mid-exam and check the count; low light; glasses glare.
- [ ] **Step 3:** Run `npx prettier --check docs README.md`; expect clean.
- [ ] **Step 4:** Stop. Ready to commit (suggested: `DOCS: camera and mic proctoring`).

---

## Self-review

- **Spec coverage:** goals (detect + events: Tasks 4, 5; server load: Task 3 uses the existing pipeline; consent: Tasks 1, 7; strictness and live warnings: Tasks 4, 7; auto-submit: Tasks 2, 3, 6; UI: Tasks 6, 7), decisions (events only: no storage anywhere; refusal never blocks: Tasks 5, 7; opt-in on any proctored session: Tasks 2, 6), data and server (event types, migration, room state, server-side auto-submit: Tasks 1 to 3), interface section (Tasks 6, 7), limits and docs (Task 8). Out of scope items have no task.
- **Type consistency:** `ProctorSeriousType`, `seriousFlagCount`, `DeviceState`, `consentVersionFor`, `proctorLimitSentence` and the `proctor:flags` payload are defined in Tasks 1 and 5 and used with the same names in 3, 6 and 7.
- **Proportion:** the plan is about twice the spec, because it carries the interface blocks and test lists the spec leaves out; it contains no function bodies.
