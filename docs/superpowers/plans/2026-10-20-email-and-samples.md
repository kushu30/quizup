# Email tokens, host-access email, sample CSVs and contact details

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline).

**Goal:** Let hosts email each invited student their access token, email a host when an admin grants host access, offer sample CSVs, and show who to contact for host access.

**Architecture:** A small SMTP mailer (nodemailer, configured only by `.env`, disabled when unset) is injected into the app. Roster tokens are kept in server memory after issue so they can be emailed once; host-access mail is sent by an admin-only endpoint the Admin page calls after adding to the allowlist. Sample CSVs are generated from shared constants so they cannot drift from the parsers.

**Tech Stack:** Express, nodemailer (new dependency), Zod, React, Vitest.

**Spec:** the user's message of 2026-10-20; approach agreed earlier (SMTP so Brevo, Gmail or any provider works). Contact address given by the user: kushagra.shukla2005@gmail.com.

## Global Constraints
- No secrets in code; SMTP settings only in `.env` (`.env.example` committed). Never print secret values.
- Email disabled and its buttons hidden when SMTP is not configured; nothing else changes.
- TypeScript strict, Zod in packages/shared, no code comments, minimal diffs, never commit, push or deploy.
- Anything simulated is labelled; tests use a fake mailer, never a real provider.

## Review Focus
- Email HTML must escape student names, quiz titles and institution names (host-controlled text).
- Only the session's host can email tokens; only an admin can send host-access mail, and only for an address that is on the allowlist.
- A student's token is emailed only to that student's own address, never to the host or in a list.
- Plain tokens live only in memory and are dropped when reissued, removed or the session ends.
- A provider failure on one address must not stop the others and must not leak provider details with secrets.

### Task 1: Shared contracts (env, roster email schemas, sample CSVs, header skipping, contact constant)
### Task 2: Mailer and templates (nodemailer dependency, token email, host-access email)
### Task 3: Token emailing (in-memory tokens, endpoint, emailable flag)
### Task 4: Host-access email (admin endpoint, Admin page call)
### Task 5: Web (roster email buttons, sample and upload, CSV import sample, contact details)
### Task 6: Docs and verification
