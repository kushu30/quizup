# Camera and microphone proctoring: manual check

The detectors need a real camera and microphone, so CI cannot test them. Run this once on a laptop and once on a phone before a real exam. Start a timed exam with **Watch the camera**, **Listen to the microphone** and **Submit automatically** (limit 3) turned on, and join it as a student in another window or device.

## Setup

- [ ] The Start dialog shows both cards and, once one is on, the auto-submit switch with a stepper (3 to 50, default 10).
- [ ] The student intro mentions camera and microphone.
- [ ] After the intro, the pre-check asks for permission, shows a self-view and a moving level bar, and Continue works.
- [ ] The consent screen lists the camera and microphone uses, says nothing is recorded or sent, and states the limit ("flagged 3 times").

## Camera

- [ ] Sit normally for a minute: no warnings.
- [ ] Leave the frame for about 5 s: "We can't see your face" appears, the host timeline shows **No face in view**.
- [ ] Have a second person (or a photo of one) in frame for 3 s: **Several faces**.
- [ ] Turn your head well to the side for about 5 s: **Looking away**. A small natural movement should not flag.
- [ ] Cover the lens: **Camera blocked**, and not also "No face".
- [ ] Dim the room, then add glare behind you: note whether false flags appear (tune `thresholds.ts` if so).

## Microphone

- [ ] Silence for 10 s: no flag.
- [ ] Talk steadily for 3 s: **Loud sound**. A single cough should not flag.

## Failure paths

- [ ] Deny the camera in the pre-check: the exam still starts, the host sees **Camera denied**, the pill says "Camera unavailable".
- [ ] Unplug the camera mid-exam: **Camera lost** once, no crash.
- [ ] Switch tab for 30 s and come back: a tab switch is recorded, but no "No face" flag appears on return.
- [ ] Reload the page mid-exam: the exam resumes, and the flag count is unchanged.
- [ ] Restart the server mid-exam: the count survives and the next flag continues from it.

## Limit

- [ ] The third flag auto-submits the exam; the student sees the explanation; the host sees **Auto-submitted by proctoring** in the progress table and on the student's result page.
- [ ] One flag before the limit, the warning is red: "One more and your exam will be submitted."

## Phone

- [ ] The pre-check works in Safari (iOS) and Chrome (Android).
- [ ] Note battery drain and heat after 10 minutes.
