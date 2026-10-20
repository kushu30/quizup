# Landing, logo, anonymous feedback, devices and proctoring for all modes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).

**Goal:** Remove the projection feature, make feedback anonymous, adopt the logo system and a bigger landing page with the server status tucked into the footer, show the device each student used, and let hosts proctor any assessment type.

**Architecture:** Shared Zod contracts first; engine and exam service store the device and the proctored flag (migration 0013); the web client reads them from room state and analytics.

**Tech Stack:** React 18, Tailwind 4, Express, Socket.IO, Supabase, Zod, Vitest.

**Spec:** the user's message of 2026-10-20 (no separate design document). Logo and palette come from the design artifact bdae911b (concept C, "four squares and a check").

## Global Constraints
- TypeScript strict; Zod in `packages/shared` with `.js` imports; no code comments; minimal diffs; never commit, push or deploy; migrations applied by the user.
- Anything simulated is labelled; no invented statistics on the landing page.
- 375 px and 1280 px without horizontal overflow.

## Review Focus
- Feedback endpoint and summary must carry no names, ids or timestamps that identify a student.
- A non-proctored session records and shows no proctor events and no consent monitoring text.
- A proctored live quiz must not demand full screen.
- Device strings come from a user agent the student controls: treat as untrusted text (length limits, rendered as text).
- The status check runs only when someone opens it, not on every page load.

### Task 1: Remove projection (shared, server, web, tests)
### Task 2: Anonymous feedback
### Task 3: Logo components, landing page, footer status pill
### Task 4: Device info (shared parser, join payload, engine, migration 0013, host dropdowns)
### Task 5: Proctoring for all modes (start dialog, session flag, live events, host panel, consent)
### Task 6: Docs and verification
