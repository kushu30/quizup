# Resilient exams and access-token mode: design

Approved in conversation on 2026-10-20 ("first lets put 1 and 2"). Coding questions with a self-hosted runner are a separate later design.

## Intent

A student who loses connection, closes the tab or switches device must be able to get back into the same attempt without help in the common case and with one click from the host in the rare case. A host who needs to know exactly who sat the assessment can restrict it to invited students, each holding a personal access token, so nobody can join under another name.

## Goals

1. Reconnect without losing the screen: a dropped socket keeps the exam or quiz visible with a "Reconnecting" banner; answers chosen while offline are kept and sent after the seat is restored.
2. Lost credential recovery: a student whose browser forgot its seat sees a clear message; the host presses "Let back in" next to their name; the student joins again with the same name within 5 minutes and gets the same seat (answers, timer unchanged).
3. One live connection per seat: opening the seat on a second device replaces the first; the first shows "This quiz is open on another device" with a "Use this device" button.
4. Access-token mode: quiz setting `accessMode: 'open' | 'token'`, available for every assessment type. In token mode the join form asks for a token instead of a name, the name comes from the host's roster, and a token maps to exactly one seat.
5. Roster: host adds students (one per line, "Name" or "Name, email"), the server issues one token each and returns them once; host downloads a CSV with name, email, token and personal join link; reissue replaces a token; remove deletes an entry that has not joined.
6. Late arrivals: in an exam, an invited student may join after the exam has opened; in live and adaptive quizzes only before the start.
7. The host sees which invited students have joined, are connected, and how many times their seat was opened on another device.
8. Exam screen has no site navigation and a prominent timer (follow-up tasks of this change).

## Non-goals

- A fresh attempt that discards answers (only resume is offered).
- Revoking a token while its holder is connected, kicking sockets from the host.
- Emailing tokens; per-student tokens for anonymous quizzes created without a roster.
- Coding questions.

## Anti-goals

- Token or name guessing: failed token joins are throttled per session; tokens are 10 characters from a 32-symbol alphabet (50 bits) and stored only as SHA-256 hashes; the join link carries the token in the URL fragment so it never reaches a server log.
- A second device silently sharing a seat; a lost seat being claimable by anyone without the host's action.
- Changing scoring, timers, proctoring or exam rules.

## Constraints

Standing rules: TypeScript strict, Zod in packages/shared, no code comments, minimal diffs, server is source of truth, user commits and applies migrations. Migration `0012_session_roster.sql`, server-role access only, applied by the user.

## Decided by the user

Resume (not discard) on reconnect; token mode as a mode; self-hosted runner for coding later; build 1 and 2 first.

## Left to the builder (my calls)

Token alphabet and length; 5-minute let-back-in window; roster stored per session; join link fragment; takeover counter; no revoke.
