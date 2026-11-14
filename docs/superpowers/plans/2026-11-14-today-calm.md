# Today, Calmer on a Phone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily Today screen on phones calmer (fewer duplicate messages, two-line task rows, one phone type scale, quieter palettes) without hiding anything useful.

**Architecture:** Display-only changes inside `renderDashboard` and its helpers in `app.js`, plus one new section at the end of `style.css` scoped to `max-width: 767px`. New logic lives in small pure functions next to the code they replace and is covered by `node tests/verify_*.mjs` checks. No storage, attendance, timetable or service-worker changes.

**Tech Stack:** Vanilla JS, CSS tokens, Node verify scripts (`tests/verify_*.mjs`, run through `new Function` as in `tests/verify_countdown_self_study.mjs`), Playwright (`tests/*.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-11-14-today-calm-design.md`

## Global Constraints

- Daily Today screen on phones (under 768px) only; first run (welcome, name, tour) is untouched.
- Protected, not touched: `cos_*` schemas, attendance maths and history, timetable parsing, backup/restore, offline behaviour, `sw.js`, `manifest.json`, existing navigation, 12-hour AM/PM time.
- Display-only: stored names and shapes never change; no migration is needed.
- Quips stay (voice). A quip shows only on calm days (no risk, no late task, no exam within 7 days) or when a target or goal is reached (attendance at or above the aim, all of today's tasks done).
- Due rows drop the date from the meta line; the chip keeps "Due in N days", or the date beyond a week.
- Banner priority, fixed: (1) safety or an action in progress, (2) attendance risk, (3) setup the screen needs, (4) late or due-soon work, (5) welcome-back or quip.
- Due list: three rows, chosen by priority (overdue, due today, due next, upcoming, backlog); overdue and due-today are never pushed out; "+N more tasks" shows the count.
- Phone scale: title 30/700 (one line normally, two lines max, never below 24px, never truncated); current/next class 18/700; rows and body 16/500-600; meta 14/400; section labels 12/600 caps +0.07em; nothing else under 13px. Spacing 8, 12, 16, 24, 32.
- Class labels: existing short name, else course code plus shortened title, else word-boundary cut; full name stays in `title`, `aria-label` and the Subject Hub link. No invented acronyms.
- Palettes: Register stays default; "now" never pink or green; red = late, green = done; contrast 4.5:1 text, 3:1 graphics.
- No new dependencies; free tiers only. Update `docs/ARCHITECTURE.md` (Today section) in the PRs that change behaviour.
- One `claude/*` branch and PR per slice; merge only on green `Tests`; ship only when the user says "ship".

## Review Focus

- A name of 23 characters at 320px: wraps to two lines, first class still above the fold, nothing truncated.
- Empty or missing name: `getGreetingParts` returns a title without a stray comma or "undefined".
- Every banner combination (welcome-back + risk + setup + late task): exactly one shows, and the suppressed one is still reachable from its section.
- Many overdue tasks (6+): all overdue still reachable, the three shown are overdue first, "+N more" count is exact.
- Class entry with no code, no teacher and a 60-character combined title: label stays readable, full name in `aria-label`.
- Holiday mode, weekend, evening with unmarked classes, and a day with zero tasks: no quip above an alarming line, no empty gaps.
- Dark mode and all four accents: the "now" wash is neither pink nor green; focus ring visible.

---

## File Structure

- `app.js`: `getGreetingParts` (beside `getDynamicGreeting`, ~line 8752), `chooseTodayBanner` (beside `todayFocusHTML`, ~9156), `buildDashboardContextLine` option (~8985), `railClassLabel` (beside `dayRailHTML`, ~9316), due-row markup and cap in `renderDashboard` (~11684 and ~11866).
- `style.css`: one new section appended at the end, `@media (max-width: 767px)` and `#page-dashboard` scoped; palette token edits in the existing per-palette blocks (~8173-8240).
- `tests/verify_today_calm.mjs` (new, added to the `npm test` chain): pure-function checks. `tests/today-calm.spec.ts` (new, in `test:sync-flows`): density and outcome checks on the busy fixture.
- `docs/ARCHITECTURE.md`: Today section.

---

### Task 0: Baseline and measuring spec (PR 1, with slice B)

**Files:**
- Create: `tests/today-calm.spec.ts`, `tests/fixtures/today-busy.json`
- Modify: `package.json` (add the spec to `test:sync-flows`)

**Interfaces:**
- Produces: `measureToday(page) -> { textItems: number, tapTargets: number, sizeCombos: number, dueRows: number, aboveFold: string[] }` used by later tasks' assertions.

- [ ] **Step 1: Write the fixture** `today-busy.json`: 2 classes (one with a 60-character combined lab title), 9 tasks (2 overdue, 1 due today, rest upcoming), attendance below the 75% target; seed method as in `tests/today-returning.spec.ts`.
- [ ] **Step 2: Write `measureToday` and one test per outcome check** at 320, 360 and 412 wide: next class visible without scrolling; Present/Absent buttons work on Today and mark attendance; first task row is the most urgent; quick-add is reachable. Record the current guardrail numbers (36 text items, 17 tap targets, 12 type combinations) in a comment and assert only the outcome checks for now.
- [ ] **Step 3: Run** `npx playwright test tests/today-calm.spec.ts --project=chromium-mobile`. Expected: outcome tests PASS on the current build.
- [ ] **Step 4: Capture baseline screenshots** at 320, 360, 412 and 768 for light and dark and the four accents into the scratchpad (not the repo).
- [ ] **Step 5: Commit** `chore: measuring spec for the Today screen`.

### Task 1: Structured greeting and the quip rule (slice B)

**Files:**
- Modify: `app.js` (~8752 and the render at ~11791/11802)
- Create: `tests/verify_today_calm.mjs`; add to the `npm test` chain in `package.json`

**Interfaces:**
- Produces: `getGreetingParts({ name: string, overdue?: number, holiday?: boolean, calm: boolean, goalReached: boolean }) -> { title: string, quip: string, tone: 'calm'|'alert' }`. `title` is escaped HTML (name wrapped in `.desk-greeting-name`); `quip` is escaped text, empty unless `calm || goalReached` and the pool entry has one. `getDynamicGreeting` is unchanged.
- Consumes: the same pools and seed as `getDynamicGreeting`.

- [ ] **Step 1: Write failing tests** in `verify_today_calm.mjs`: `getGreetingParts({ name: 'Asha', calm: true, goalReached: false })` at 10:00 on a day whose seed picks "Morning, {n}. Chai first?" gives `title` containing `Asha` and no "Chai", `quip === 'Chai first?'`; with `calm: false, goalReached: false` the quip is `''`; with `goalReached: true` it is back; `name: ''` gives no comma or "undefined"; `name: '<b>x</b>'` is escaped.
- [ ] **Step 2: Run** `node tests/verify_today_calm.mjs`. Expected: FAIL, `getGreetingParts` is not defined.
- [ ] **Step 3: Implement `getGreetingParts`.** Reuse the pools: split each pool string at the first ". " after the name placeholder into title and quip; escape each part separately.
- [ ] **Step 4: Render.** `renderDashboard` computes `calm` (no at-risk subject, no recent overdue, no exam within 7 days) and `goalReached` (attendance at or above target, and no task due or overdue today), shows the title in `.desk-greeting`, and puts a non-empty quip first in `.desk-greeting-sub`.
- [ ] **Step 5: Run** `node tests/verify_today_calm.mjs && node tests/verify_holiday_mode.mjs && node tests/verify_countdown_self_study.mjs`. Expected: PASS.
- [ ] **Step 6: Commit** `Today greeting keeps its quips, now on the quiet line under the title`.

### Task 2: One banner, one attendance message (slice B)

**Files:**
- Modify: `app.js` (`buildDashboardContextLine` ~8985, `todayFocusHTML` ~9156, banner assembly ~11595-11816)
- Test: `tests/verify_today_calm.mjs`, `tests/verify_countdown_self_study.mjs`, `tests/verify_today_focus.mjs`, `tests/today-hub.spec.ts`

**Interfaces:**
- Produces: `chooseTodayBanner({ safety: boolean, attendanceRisk: boolean, setupNeeded: boolean, lateOrSoon: boolean, welcomeBack: boolean }) -> 'safety'|'risk'|'setup'|'late'|'welcome'|null`, first true wins in that order.
- Produces: `buildDashboardContextLine(opts)` accepts `attendanceInBanner: boolean`; when true the at-risk branch (~9003) is skipped and the next priority is used.

- [ ] **Step 1: Audit.** List which of welcome-back, risk banner, setup card and late-task line can render together today (read ~11595-11816); put the table in a comment above `chooseTodayBanner`.
- [ ] **Step 2: Write failing tests:** all 32 true/false combinations return the documented single winner; `buildDashboardContextLine({ attendanceAtRisk: true, attendanceInBanner: true, overdue: 2, ... })` returns the overdue line, and without the flag returns the "below your target" line.
- [ ] **Step 3: Run** `node tests/verify_today_calm.mjs`. Expected: FAIL.
- [ ] **Step 4: Implement** `chooseTodayBanner` and the option; `renderDashboard` passes `attendanceInBanner` when `todayFocusHTML` will render the risk row, and renders only the chosen banner. A suppressed message stays reachable from its own section (Attendance panel, Tasks, setup card on Subjects/Settings).
- [ ] **Step 5: Update** the context-line expectations in `verify_countdown_self_study.mjs` and `verify_today_focus.mjs` only where the old duplicate was asserted; never weaken a check.
- [ ] **Step 6: Run** `npm test`, then `npx playwright test tests/today-hub.spec.ts tests/today-returning.spec.ts tests/today-rail.spec.ts --project=chromium-desktop`. Expected: PASS.
- [ ] **Step 7: Commit** `Today says your attendance once, and shows one banner at a time`.

### Task 3: Two-line task rows and a prioritised three (slice B)

**Files:**
- Modify: `app.js` (cap ~11684-11689, `metaBits` ~11870, "Why this order?" ~11853)
- Test: `tests/verify_today_calm.mjs`, `tests/today-calm.spec.ts`, `tests/today-hub.spec.ts`

**Interfaces:**
- Produces: `pickDueRows(tasks, today) -> { rows: Task[], more: number }` returning at most 3 rows ordered overdue, due today, due next, upcoming, backlog, with all overdue and due-today tasks included before any other (if there are more than 3 of those, all of them show). `more` is the exact count of tasks not shown.

- [ ] **Step 1: Write failing tests:** 6 overdue + 4 upcoming returns 6 rows (all overdue) and `more === 4`; 1 overdue + 1 today + 5 upcoming returns those two plus the next upcoming; 0 urgent returns `{ rows: [], more: 0 }`.
- [ ] **Step 2: Run** `node tests/verify_today_calm.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `pickDueRows`; replace `.slice(0, 4)` and `moreTasks`; remove the `formatDate` entry from `metaBits` (subject and "Start: step" stay); turn "Why this order?" into a small info button on the Due label, same text, `aria-expanded` and `aria-controls="dash-why-line"` behaviour.
- [ ] **Step 4: Test the row markup** in `today-calm.spec.ts`: at 320, 360 and 412 a row with a long subject is two lines; the "Why this order?" control keeps its accessible name; the three due rows and quick-add are visible without scrolling on the busy fixture.
- [ ] **Step 5: Run** `npx playwright test tests/today-calm.spec.ts tests/today-hub.spec.ts tests/a11y.spec.ts --project=chromium-mobile` and `npm test`. Expected: PASS.
- [ ] **Step 6: Update `docs/ARCHITECTURE.md`** (Today section: structured greeting, banner priority, due-row rule). **Commit** `Today shows your three most pressing tasks, two lines each`. Open PR "slice B", wait for green `Tests`, merge per project rules.

### Task 4: Conservative class labels (slice C, PR 2)

**Files:**
- Modify: `app.js` (`dayRailHTML` ~9364, add helper beside it)
- Test: `tests/verify_today_calm.mjs`, `tests/today-rail.spec.ts`

**Interfaces:**
- Produces: `railClassLabel(entry: { subject: string, code?: string }) -> string`. No stored short name exists today (checked: none in `app.js`), so the order is: `code` plus a title shortened at a word boundary when the subject is over 28 characters; else the subject unchanged; never an invented acronym. Empty or missing subject returns `''`.

- [ ] **Step 1: Write failing tests:** a 60-character combined lab subject with code `CS301` returns `CS301 · ` plus a word-boundary cut under 28 characters; a 20-character subject is unchanged; no-code long subject is cut at a word boundary with an ellipsis; `{}` returns `''`.
- [ ] **Step 2: Run** `node tests/verify_today_calm.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** and use it for the visible `.rail-name` text; keep the full subject in `title` and `aria-label`; `openSubjectHub` still receives the full subject.
- [ ] **Step 4: Run** `npm test` and `npx playwright test tests/today-rail.spec.ts --project=chromium-desktop`. Expected: PASS. **Commit** `Long class names on Today are shortened, the full name stays one tap away`. PR "slice C", merge on green.

### Task 5: Phone type scale and spacing (slice A, PR 3)

**Files:**
- Modify: `style.css` (new section at the end)
- Test: `tests/today-calm.spec.ts`, `tests/mobile-layout.spec.ts`, `tests/a11y.spec.ts`, visual snapshots

**Interfaces:**
- Consumes: Task 1-4 markup (`.desk-greeting`, `.desk-greeting-sub`, `.rail-name`, `.task-ledger-item`, `.task-ledger-meta`, `.due-badge`, panel labels).

- [ ] **Step 1: Write failing guardrail tests** in `today-calm.spec.ts`: on the busy fixture at 412×915 at most 24 text items, 12 tap targets, 7 size/weight combinations; no computed font-size under 13px except 12px uppercase labels; a 23-character name wraps to at most two lines at 320 with the first class above the fold.
- [ ] **Step 2: Run** the spec. Expected: FAIL on the three guardrails.
- [ ] **Step 3: Implement** the scale and spacing from Global Constraints in one `@media (max-width: 767px)` section scoped to `#page-dashboard`; replace inline `font-size:var(--text-*)` on Today rows by classes only where the scale needs it. Reduced motion and transparency rules are untouched.
- [ ] **Step 4: Run** `npm test`, `npm run test:mobile`, `npm run test:a11y`, `npm run test:visual` (stale local Mac snapshots are known and unchanged; compare to `main`). Expected: PASS apart from the known stale local failures.
- [ ] **Step 5: Check** long names, 200% zoom, dark mode and all four accents at 320, 360 and 412 by screenshot; lower sizes only if text still wraps cleanly.
- [ ] **Step 6: Refresh Linux snapshots** with the "Refresh Linux screenshots" workflow on the branch, commit the `*-linux.png` files. **Commit** `Today uses one calm type scale on phones`. PR "slice A", merge on green.

### Task 6: Palettes (slice D, PR 4)

**Files:**
- Modify: `style.css` (palette blocks ~8173-8240)
- Test: `tests/today-calm.spec.ts` (contrast check), `tests/a11y.spec.ts`, visual snapshots

**Interfaces:**
- Produces: contrast helper in `today-calm.spec.ts` returning WCAG ratio for two computed colours.

- [ ] **Step 1: Write failing tests:** for every palette and accent, the "now" wash is not within a pink or green hue range, now/next/done/late are pairwise distinguishable (hue or lightness), text on each wash is at least 4.5:1, rings and dots at least 3:1.
- [ ] **Step 2: Run** the spec. Expected: FAIL for Ai & Kaki and Azuki & Matcha light.
- [ ] **Step 3: Implement:** marigold "now" washes (start from `rgba(232,160,64,.22)`); Tetsu lamp dark page from `#2b3736` toward `#131d1c`; Azuki & Matcha dark page from `#1e2224` toward `#1f1517`. Register stays default and loudest; the others quieter.
- [ ] **Step 4: Run** `npm run test:a11y`, `npm run test:visual`, and view all palettes in light and dark by screenshot, including a colour-blind simulation of now vs late vs done.
- [ ] **Step 5: Refresh Linux snapshots**, update `docs/ARCHITECTURE.md` if tokens moved, **commit** `Calmer colours for the dark themes and no more pink "now"`. PR "slice D", merge on green.

### Task 7: Wrap-up

- [ ] **Step 1:** Run `npm run release:check`; report exact results, remaining risks, and what is waiting on "ship" (PRs #336-#340 plus slices B, C, A, D).
- [ ] **Step 2:** Update memory `today-density-spec.md` with the merged PR numbers.
