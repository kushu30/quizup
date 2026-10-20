# Branded, previewable emails

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).

**Goal:** Let the host preview and edit the token email (subject and message, with placeholders) before it is sent, and make every email a branded, professional message: institution logo and name with "Powered by QuizUp" for branded quizzes, the QuizUp logo alone otherwise.

**Architecture:** Placeholder handling and the default wording live in packages/shared so the web dialog and the server agree. The server renders the real HTML (the preview endpoint and the send path share one renderer), so what the host sees is what is sent. Logos in email are PNG files served from the web app's public folder; the institution logo is its stored https URL.

**Spec:** the user's message of 2026-10-20.

## Global Constraints
- No code comments; TypeScript strict; Zod in packages/shared; minimal diffs; never commit, push or deploy; no secrets in code.
- Email HTML is table based with inline styles, 600px wide, readable with images blocked (alt text, text fallbacks).
- All host-typed text is escaped; subject has no line breaks; only known placeholders are allowed.
- A student only ever receives their own token; the preview and test mail never send real tokens to anyone but the host's own screen.

## Review Focus
- Unknown placeholders are rejected with a clear message and nothing is sent.
- A light brand colour (for example yellow) still gives a readable header and button.
- An institution logo URL that is not https is never put into an email.
- The preview shows exactly the HTML that would be sent.
- Test mail goes only to the signed-in host's own address and carries no real token.

### Task 1: Shared (readableTextOn, placeholders, defaults, payload schemas)
### Task 2: Email templates and PNG logo assets
### Task 3: Server endpoints (preview, send with custom text, test to host)
### Task 4: Web dialog (editor, placeholder chips, live preview, test, send)
### Task 5: Samples document, README, decisions, verification
