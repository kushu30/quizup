# Classroom Professional Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the QuizUp web app (`apps/web`) to the approved "Classroom Professional" direction without changing behaviour.

**Architecture:** Design tokens live in `apps/web/src/index.css` (`@theme`). Shared presentational components live in `apps/web/src/components/ui/`. Screens swap repeated raw Tailwind classes for those components and tokens. No logic, props of feature components, API calls, sockets, routes or hooks change, except a `?code=` prefill on `/join` used by the landing join box.

**Tech Stack:** React 18, Vite 7, Tailwind CSS 4, react-router 6, vitest + Testing Library (jsdom).

**Spec:** the approved chat proposal "Classroom Professional" (palette, type, layout, nine stages), restated in Global Constraints.

## Global Constraints

- Palette: ink `#1C2533`, paper `#F7F8FA`, rule `#D8DDE5`, board (primary green) `#1E5446`, marker (accent amber) `#E9B949`, alert `#B42318`.
- One type family: Schibsted Grotesk, self-hosted via `@fontsource-variable/schibsted-grotesk` (the only new dependency). Tabular figures for timers, scores, join codes.
- Type scale 14 / 16 / 20 / 28 / 44 px, 72 px for join code and countdown.
- No all-caps labels, no eyebrow labels, no arrows on buttons, no decorative motion. Light mode only: remove existing `dark:` variants.
- Wide layout (`max-w-6xl`) for `/host*`, `/sessions/*`, `/admin`; focused layout (`max-w-3xl`) elsewhere.
- Visible keyboard focus everywhere; `prefers-reduced-motion` respected; WCAG AA contrast (4.5:1 text) including the four answer colours with white text.
- Do not change backend, shared package, migrations, env, configs (other than the font import), or commit.

## Review Focus

- Long join codes / long display names / long question stems: text must wrap, never overflow at 375 px (checked in screenshots and by `break-words` on stems).
- Disabled and busy states (Start quiz with 0 students, Generate while running): must stay visibly disabled and not clickable (Button test).
- Form errors must stay announced and tied to inputs (TextField test: `aria-invalid`, `aria-describedby`).
- Answer buttons on the play screen must keep white-text contrast ≥ 4.5:1 (contrast script in Task 1).
- Fullscreen overlay and timers in exam mode must keep working (existing `useProctor` tests + no logic diff in exam files).

---

### Task 1: Foundation (tokens, font, base styles)

**Files:** Modify `apps/web/src/index.css`, `apps/web/package.json` (font dependency).

- [ ] Install `@fontsource-variable/schibsted-grotesk` in `apps/web`.
- [ ] Define `@theme` tokens: colours above plus `muted` (secondary text, ≥ 4.5:1 on paper), soft tints for board/marker/alert, success; `--font-sans`; text sizes `title` 28, `hero` 44, `display` 72; answer colours `answer-a..d`.
- [ ] Base layer: body paper/ink/font-sans, `color-scheme: light`, `:focus-visible` 3 px board outline, reduced-motion override.
- [ ] Verify answer colours and muted text contrast with a node script (expected ≥ 4.5 each).
- [ ] Run lint, typecheck, build, test. Expected: all pass, no logic diff.

### Task 2: UI components (TDD)

**Files:** Create `apps/web/src/components/ui/{Button,TextField,Badge,Notice,PageHeader,Panel,TableFrame,index}.tsx`, test `apps/web/src/components/ui/ui.test.tsx`.

**Interfaces (produces):**
- `buttonClasses(variant?: 'primary'|'secondary'|'ghost'|'danger'|'brand', size?: 'sm'|'md'|'lg'): string`; `Button` (button props + `variant`, `size`; default `type="button"`).
- `inputClasses(): string`; `TextField` (label, error?, hint?, plus input props), `SelectField`, `TextAreaField` (same pattern).
- `Badge({ tone: 'neutral'|'brand'|'success'|'warning'|'danger', children })`.
- `Notice({ tone: 'info'|'success'|'warning'|'danger', children })`: `role="alert"` for danger, `role="status"` otherwise.
- `PageHeader({ title, description?, actions?, back?: { to: string; label: string } })` renders the page `h1`.
- `Panel({ title?, description?, actions?, children })`: `section` labelled by its heading when a title exists.
- `TableFrame({ children, label? })`: scroll container that styles nested `table/th/td`.

- [ ] Write failing tests: Button default type and disabled click; TextField label association, `aria-invalid`, `aria-describedby` → error text; Notice roles; PageHeader h1 and back link; Panel `aria-labelledby`.
- [ ] Run, see them fail; implement; run, see them pass.

### Task 3: App shell
**Files:** Modify `components/Layout.tsx`. Wordmark, active nav (`NavLink`), mobile disclosure menu (button with `aria-expanded`), route-based width. Test: Layout renders nav links per auth (mock `useAuth`), menu toggle sets `aria-expanded`.

### Task 4: Landing, Join, Login
**Files:** `pages/Landing.tsx`, `pages/Join.tsx`, `pages/Login.tsx`, `components/ServerStatus.tsx`. Landing gains a join-code box that routes to `/join?code=…`; Join reads `code` from the query string as initial value. Server status stays (moved to a quieter footer slot). Test: Join prefill from `?code=`.

### Task 5: Student play and exam screens
**Files:** `pages/Play.tsx`, `components/QuestionTimer.tsx`, `components/Leaderboard.tsx`, `components/exam/{ExamPlay,ExamConsent,ExamAttemptView}.tsx`. Class-only changes plus answer colour tokens; no handler or state edits.

### Task 6: Host dashboard and authoring
**Files:** `pages/Host.tsx`, `pages/QuizEditor.tsx`, `pages/QuestionBankPage.tsx`, `components/{QuestionBank,QuestionForm,GenerateQuestionsPanel,CsvImport}.tsx`. Group the editor into labelled sections (Details & mode, Live session, Add questions, Needs review, Approved).

### Task 7: Host console, analytics, summary
**Files:** `pages/HostConsole.tsx`, `pages/SessionSummaryPage.tsx`, `components/AdaptiveTable.tsx`, `components/analytics/*`, `components/exam/{ExamProgressTable,ProctorTimeline}.tsx`. Join-code panel in board green with display type; two-column on wide screens; tables in `TableFrame`; remove `dark:`.

### Task 8: Admin, learning data, consistency
**Files:** `pages/Admin.tsx`, `pages/LearnerProfilePage.tsx`, `components/RequireRole.tsx`. Grep for leftover raw button/input class strings and `dark:`.

### Task 9: Verification
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` from the repo root: all pass.
- [ ] Headless Chrome screenshots at 375 × 812 and 1280 × 800 of public routes; a temporary, uncommitted component gallery (fixture props) for host/exam/analytics components; delete the gallery afterwards.
- [ ] Review `git diff` for logic changes in non-styling code, debug output, unused imports.
