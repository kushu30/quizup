# Camera and microphone proctoring: design

Requested by the host on 2026-10-23. Status: **approved with changes on 2026-10-24 (stricter detection, live warnings, auto-submit, polished UI). Nothing built yet.**

## Intent

Hosts running proctored sessions want to know when a student leaves the camera frame, is joined by someone else, or when the room gets loud. Today proctoring only sees what happens inside the browser (tab switches, paste, and so on). This adds camera and microphone signals, kept as light and free as possible: the analysis runs **in the student's browser**, and only small events reach the server. No video or audio is ever recorded, uploaded or streamed.

## Goals

- Detect, in the browser: no face, more than one face, head turned away, camera blocked or lost, sustained loud audio, microphone lost.
- Report them as proctor events through the existing pipeline, so they appear in the existing counts, timeline, summary table and the per-student result page with no redesign.
- Zero cost: no paid service, no TURN or media server, no extra storage.
- Negligible server load: tens of small events per student per exam.
- Honest consent: students are told exactly what is analysed, that nothing is recorded or sent, and (for exams) the auto-submit limit if the host set one.
- Moderately strict: flag early, tell the student at once, and let the host end an exam automatically after repeated serious flags.
- A polished interface that matches the existing button, notice and pill styles, not a bolted-on panel.

## Non-goals

- Live video or audio streaming to the host. (Needs relay servers, not free, not light.)
- Recording, storing or uploading video, audio or photos. **Decided: events only, no evidence snapshots.**
- Speech-to-text, identity verification, eye-gaze tracking, score penalties of any kind.

## Anti-goals

- Any score change. **Auto-submit only ends the exam early; answers given so far are graded normally.** Signals are indicators for a human to review, never proof, and an auto-submitted attempt is clearly marked so the host can review it. The README and consent screen must keep saying this.
- Locking out a student because of missing hardware. **Decided: a refusal never blocks starting; it is logged.** (A student who denied the camera simply has no camera flags to accumulate.)
- A heavy page: the models must not slow a cheap laptop or drain a phone battery noticeably.

## Decisions made by the host

1. **Events only.** No snapshots, no storage, no retention policy to run.
2. **Refusal never blocks.** If the student denies camera or microphone access (or has no device), they continue; a `camera_denied` or `mic_denied` event is logged and shown to the host.
3. **Opt-in on any proctored session.** The proctoring choice dialog gains two checkboxes, camera and microphone, available whenever proctoring is on (exams and live quizzes). Both default off.
4. **A little strict (decided 2026-10-24):** tighter thresholds, live warnings to the student, and an optional auto-submit limit. Not chosen: requiring camera or microphone to start.

## Behaviour

### Host

- In the dialog shown on Start (today asks "proctor this session?"), when proctoring is on, two extra checkboxes: **Watch the camera** and **Listen to the microphone**. Each has a one-line plain description of what it detects and that nothing is recorded.
- For **timed exams** only, a third control appears once camera or microphone is on: **Submit the exam automatically after N serious flags** (off by default; when on, N is 3 to 50, suggested 10). It does not apply to live quizzes, which have no per-student submit.
- The choice is fixed when the session starts, like `proctored` today.
- An auto-submitted attempt shows an **Auto-submitted by proctoring** marker in the progress table, the proctor timeline and the student's result page, with the flag count that triggered it.
- The host's Proctoring panel, the summary "Proctor signals per student" table and the per-student result page show the new signals in the same way as the existing ones.

### Student

1. **Intro and consent.** The intro lists camera and microphone as the host's choice. For exams the consent screen states: the camera is used to notice no face, several faces or turning away; the microphone only to notice loud or sustained sound; processing happens on your device; no video or audio is recorded or sent; only event names and times are sent and shown to your host. A new consent version string is stored (see Data).
2. **Pre-check (before the first question or the exam timer starts).** A small screen asks for permission and shows a live self-view (local only, never sent) and a mic level bar, with "I can see myself" / "It hears me" confirmations being implicit (the indicators just show). A **Continue** button always works. If permission is denied or no device exists, the screen says the host will see that, and continues.
3. **During the session.** A small "Camera on" and/or "Mic on" indicator stays visible so the student always knows. The self-view preview is **not** shown during questions (saves rendering work).
4. **Live warnings.** When a serious flag is raised, the student sees a clear, non-blocking banner at the top of the screen (for example "We can't see your face. Please stay in view.") with their running count, "Flag 3 of 10" when the host set a limit. Warnings are announced to screen readers (`aria-live`), stay visible for about 8 seconds, never cover the question and answers, and do not repeat for the same ongoing episode more than once per 30 seconds.
5. **Final warning.** One flag before the limit, the banner turns to the alert colour: "One more and your exam will be submitted."
6. **If access is lost mid-session** (permission revoked, device unplugged), a `camera_lost` or `mic_lost` event is logged and a gentle notice is shown. Nothing blocks.

## Detection

All thresholds below are **my calls** (tightened from the first draft at the host's request) and must be tunable constants in one place.

### Video

- Library: `@mediapipe/tasks-vision` **FaceDetector** with the short-range BlazeFace model (about 230 KB), self-hosted under `apps/web/public/` so it works offline and without a third-party request at exam time. Loaded only when the host enabled the camera and only after consent.
- Sample **1 frame per second** from a hidden `<video>` (small resolution request, 320×240). Skip sampling while the tab is hidden.
- Per sample classify: `faces = 0`, `faces = 1`, `faces >= 2`; and for one face, a **turned-away** estimate from keypoints (nose offset from the eye midpoint beyond a ratio); and **camera blocked** (mean frame brightness near zero for several samples).
- Events (state-change based, with a hold time so one bad frame does nothing):
  - `face_missing`: no face for **3** consecutive seconds. Cleared when a face returns.
  - `multiple_faces`: two or more faces for **2** consecutive seconds.
  - `looking_away`: head turned for **4** consecutive seconds.
  - `camera_blocked`: dark frame for **3** consecutive seconds.
  - **Episodes.** Each continuous condition is one episode and counts as one flag. While an episode continues, it counts one more flag every 30 seconds, so stepping away for a minute is two or three flags, not hundreds and not one. A new episode of the same type needs the condition to have cleared first, plus a 5-second cooldown.

### Audio

- Web Audio `AnalyserNode` on the microphone stream, level (RMS) read every 250 ms. No recording node, no `MediaRecorder`.
- Calibrate a baseline from the first 5 seconds of the session; the threshold is baseline plus a fixed margin, with a minimum floor so a dead-quiet room does not flag a cough.
- Event `loud_audio`: level above threshold for **2** consecutive seconds; same episode, 30-second continuation and 5-second cooldown rules.

### Cost control

- Models and audio graphs are created once per attempt and torn down on submit or leave.
- Pause detection when the tab is hidden; resume on return.
- Never more than the existing rate cap (20 events per second per connection). The browser queue behaviour for offline use is reused as is.

## Data and server

- **Serious flags** are a fixed list in shared code: `face_missing`, `multiple_faces`, `looking_away`, `camera_blocked`, `loud_audio`. Only these count toward the auto-submit limit and the student's "Flag X of N" counter; existing browser signals (tab switch and so on) do not, so this feature never changes how they behave.
- **Event types** (in `packages/shared/src/exam.ts`): add `face_missing`, `multiple_faces`, `looking_away`, `camera_blocked`, `camera_lost`, `camera_denied`, `loud_audio`, `mic_lost`, `mic_denied`. Add the serious ones to the counted types (so they feed the counts table and summary); the lost, denied and `auto_submitted` types are record-only like `focus_return`. Also add `auto_submitted`. Extend `PROCTOR_TYPE_LABELS`, `emptyProctorCounts` and the counts schema accordingly; the CSV exports that list proctor columns must include the new counted types.
- **Database.** `proctor_events.type` is plain text, so new event types need **no migration**. The new host choices need three columns on `sessions` (migration `0017`): `proctor_camera boolean not null default false`, `proctor_mic boolean not null default false` and `proctor_flag_limit integer null check (proctor_flag_limit between 3 and 50)`. `sessions.proctored` stays and remains the master switch; the two flags are only meaningful when it is true.
- **API and sockets.**
  - `sessionStartSchema` gains optional `proctorCamera` and `proctorMic` booleans and an optional `proctorFlagLimit` integer (3 to 50, exams only). All are ignored unless `proctored` is true.
  - The room state sent to students carries the flags and the limit next to `proctored`, so the student's browser knows what to run and can show "Flag X of N".
  - **Auto-submit is decided on the server.** The exam service counts serious flags per attempt as events are stored; when the count reaches the limit it submits that attempt exactly as a manual or timer-based submit would, records an `auto_submitted` event, and tells the student's screen. The browser never decides this, so it cannot be dodged by blocking client code.
  - Student events use the existing `proctor:event` socket event and the existing batching, ordering and dropped-event counting. The server validates the new types through the shared enum; events of media types are only accepted when the session enabled the matching flag.
- **Consent.** `EXAM_CONSENT_VERSION` is bumped when camera or microphone is enabled for an exam; the text gains the media paragraph and, when a limit is set, the exact sentence "If you are flagged N times, your exam is submitted automatically". Which version each student accepted is already stored.
- **Defaults.** Sessions started without the new flags behave exactly as today. Existing data is unaffected.

## Interface

The interface follows the existing design system (`landing/cta.ts` buttons with `0.8rem` corners and a thin edge, `ui/` notices, and the new `StatusPill` language), so it looks native.

- **Start dialog.** The two checkboxes are cards in the same style as the existing delivery switches: a title, a one-line description and a small icon. The auto-submit control is a switch that reveals a compact number stepper.
- **Pre-check screen.** One centred panel: a rounded live self-view with a soft edge, a mic level bar that fills as the student speaks, two status rows each with a pill (Ready, Blocked, Not found), and a primary **Continue** button. Denied states explain how to fix it in the browser in one sentence, without blocking Continue.
- **In-exam indicators.** A small dark pill in the exam header shows a dot and "Camera on" / "Mic on", and a quiet counter "Flags 2 of 10" appears only when a limit is set.
- **Warning banner.** Slides in under the header using the existing pop animation, with an icon, one line of text and the counter; amber normally, alert-coloured on the final warning; respects reduced-motion.
- **Host views.** New signals use the same table, timeline and badge styles as the existing ones; the auto-submitted marker is a dark pill on the student's row.

## Constraints

- Free and self-contained: MediaPipe and the Web Audio API are free; the model file ships with the web app.
- Must work in current Chrome, Edge, Firefox and Safari. On unsupported browsers or devices without WebGL/WASM, the camera check logs a `camera_denied`-style event and continues.
- Auto-submit follows the same path as the timer-based submit, so a reconnect or server restart does not lose or repeat it.
- Phones: allowed, but detection may be less reliable (handheld camera, screen off when the tab hides). Documented as a limit, not blocked.
- Camera and mic APIs need a secure context (HTTPS), which production already is; localhost is allowed for development.

## Honest limits (to be stated in the README and consent text)

- A second person, phone or earpiece outside the frame defeats this; so does a photo or video held up to the camera.
- Face detectors can misfire in poor light, with glasses glare, head coverings or on some skin tones. Thresholds are conservative and signals are reviewed by a human.
- Loud audio does not mean cheating (a fan, traffic, a cough). Because the thresholds are now tighter and a limit can end an exam, false positives matter more: the limit is off by default, the host chooses it per exam, and every auto-submit is clearly marked for review.

## Left to the builder

- Exact threshold values and the keypoint ratio for "turned away" (tune on real webcam footage; keep them in one constants file).
- Whether the model runs on the main thread or a worker (a worker if it measurably affects typing responsiveness).
- Visual design of the pre-check screen and the "camera on" indicator, following the existing button and notice styles.
- Copy for the consent paragraph, within the facts listed above.

## Testing

- Unit tests for the detection state machines (hold time, cooldown, re-arm) driven by synthetic per-second inputs, with no camera or model.
- Shared tests for the new schemas, counts, labels and CSV columns.
- Server tests: flags saved and sent in room state, media events accepted only when enabled, rate cap unchanged.
- Component tests for the host checkboxes, the pre-check screen (granted, denied, no device) and the indicator, with the camera and microphone APIs mocked.
- A manual checklist run on a real laptop and a phone, since the detectors themselves cannot be exercised in CI.

## Out of scope for this piece

Snapshot evidence, retention jobs, recording, streaming, and any automatic decision other than the optional auto-submit.
