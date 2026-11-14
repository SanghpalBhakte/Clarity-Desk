# Today, calmer on a phone: design

Status: draft for review (2026-11-14). Scope: the daily Today screen on phones (under 768px). New-student first run is out of scope.

## Understanding

The daily Today screen feels crowded. Measured at 412×915 on a busy Thursday (2 classes, 9 tasks, attendance below target): 36 text items and 17 tap targets above the fold, 12 size/weight combinations (five sizes between 11 and 13px), and the page is 1.75 screens tall. Only 3 of 9 tasks fit above the fold.

Decided by the user (2026-11-14):
- Keep the quips ("Chai first?"), but not in the title.
- Drop the date from Due rows (the chip already carries the relative day, or the date beyond a week).
- Rework the weak dark palettes (do not retire them). Register stays the default for new installs.

Confirmed by the user (2026-11-14): a quip appears only on calm days (no risk, no late task, no exam inside a week) or when a target or goal has been reached (attendance at or above the aim, all of today's tasks done), so a cheerful line never sits above an alarming one.

## Audit (what is there today)

All in `renderDashboard()` (`app.js:11395`) and `style.css`.

| Finding | Where | Cause |
|---|---|---|
| Two attendance messages | `buildDashboardContextLine` at-risk branch (`app.js` ~11478) and `todayFocusHTML` risk row (`app.js:9156`) | Both fire for the same state; a third lives in the Attendance panel |
| Two-line title | `getDynamicGreeting` (`app.js:8752`) returns "Morning, {n}. Chai first?" as one string | Title is rendered whole in `.desk-greeting` |
| Long class name | `.rail-name` in `dayRailHTML` (`app.js:9316`) | Combined lab entries print in full |
| Three-line task rows | task row template in `renderDashboard` (`metaBits`, `app.js` ~11870) | Subject, `formatDate`, and the chip all say when |
| Four due rows + links | `.slice(0, 4)` on `urgentTasks` (`app.js` ~11688) | Cap is four |
| Size sprawl | inline `font-size:var(--text-xs/2xs/sm)` in the row template; many `style.css` overrides | No single phone scale |
| Uneven rhythm | `.panel-header`, `.task-ledger-item`, `.rail-*` spacing | Set per component |

Not found wrong: the Weekly Review pill already shows only on Saturday and Sunday. The bottom of Today clears the tab bar and the + button at scroll end.

## Design

### A. Phone type and spacing (CSS, phones only)

| Role | Size / weight |
|---|---|
| Title | 30px / 700; one line for normal names, at most two lines for long ones (never truncated, never shrunk below 24px) |
| Class on now or next | 18px / 700 |
| Rows, body, status sentence | 16px / 500 and 600 |
| Meta, secondary | 14px / 400 |
| Section labels | 12px / 600, caps, +0.07em |

Nothing else under 13px. Spacing set: 8, 12, 16, 24, 32. Rows are separated by hairlines; no rule above a label. One new CSS section at the end of `style.css` scoped to `max-width: 767px` and `#page-dashboard`.

### B. Less on the first screen (Today renderer, display only)

1. **Title and quip.** No parsing of rendered HTML. A new pure helper `getGreetingParts({ name, state }) -> { title, quip, tone }` sits beside `getDynamicGreeting`, which stays for compatibility, and the renderer migrates to it. `quip` is empty unless the day is calm or a goal is reached. Title and quip are escaped separately. The title renders alone; the quip leads the status line.
2. **One attendance message.** When `todayFocusHTML` will show the attendance banner, `buildDashboardContextLine` skips its at-risk branch (new option `attendanceInBanner`) and falls to the next priority.
3. **Two-line task rows.** Meta line shows the subject (and "Start: step" when it applies). The date is removed; the chip keeps "Due in N days" or the date beyond a week.
4. **Three due rows, chosen by priority, not by position.** Order: overdue, due today, due next, upcoming, older backlog. Overdue and due-today tasks are never pushed out by the cap. "+N more tasks" shows the count and keeps every task one tap away.
5. **"Why this order?"** becomes a small info button on the Due label, same accessible name, same behaviour.
6. **One banner at a time**, by a fixed priority: (1) safety or an action in progress, (2) attendance risk, (3) setup the screen needs to be useful, (4) late or due-soon work, (5) welcome-back or quip. A suppressed message stays reachable from its own section. A test covers every combination. The first plan task audits which combinations can coexist today.

### C. Short class names (display only)

`railClassLabel(entry) -> string`, conservative: (1) the subject's existing short name, (2) the course code plus a shortened title, (3) truncation at a word boundary. No acronyms are invented. Batch and faculty codes move to the meta line; the full name stays in `title`, `aria-label` and the Subject Hub link. Timetable parsing and stored names are not touched.

### D. Palettes

- "Now" washes: Ai & Kaki and Azuki & Matcha light move to a marigold tint (start from `rgba(232,160,64,.22)`) so "now" is never pink (late) or green (done). Red stays late, green stays done.
- Dark pages: Tetsu lamp from `#2b3736` toward `#131d1c`; Azuki & Matcha from `#1e2224` toward `#1f1517`.
- Every changed colour is checked for text contrast and for the colour-meaning rule. Register stays the default, in light and dark.

## Constraints

Protected systems are untouched: `cos_*` schemas, attendance maths and history, timetable parsing, backup/restore, offline behaviour, service worker and manifest, existing navigation, 12-hour time format. No new dependencies. Update `docs/ARCHITECTURE.md` (Today masthead paragraph) in the same PRs as the behaviour changes.

## Success criteria

The numbers are guardrails, not the goal. Nothing useful is hidden just to hit a count. The outcome checks come first.

Outcome checks (manual on a phone plus Playwright where possible):
- The next class is identifiable in about three seconds.
- A class can be marked Present or Absent without leaving Today.
- The first task to act on is findable without reading every task.
- A deadline can be added or corrected without losing the place.
- Attendance risk reads as one message.
- A screen reader gets the same priorities in linear order.
- The page feels calmer, not empty.

Guardrails (measured with one reusable script on the busy fixture):

- Above the fold at 412×915: 24 or fewer text items (from 36), 12 or fewer tap targets (from 17), 7 or fewer size/weight combinations (from 12).
- No text under 13px except 12px uppercase labels.
- All three due rows and the quick-add line visible without scrolling.
- Task rows are two lines at 320, 360 and 412px with long subjects.
- Exactly one attendance message at a time; no two banners together.
- A 23-character name wraps to at most two lines at 320px, with the first class still above the fold.

## Tests

New: a density spec that measures the criteria above; unit checks for `splitGreeting`, `railClassLabel`, the `attendanceInBanner` option and the three-row cap. Update: `tests/verify_countdown_self_study.mjs` (context line), `tests/today-hub.spec.ts`, `tests/today-rail.spec.ts`, `tests/today-returning.spec.ts`, `tests/verify_today_focus.mjs`. Run `npm test`, `test:mobile`, `test:a11y`, `test:visual`; refresh Linux snapshots through the workflow.

## Slices (one PR each)

B first-screen content; C class labels; A type and spacing; D palettes. Order follows the content first: B (content model and hierarchy), C (class labels), then A (type and spacing, set after the duplicates are gone and checked with long names), then D (palettes, only after the hierarchy is stable). Slice 0 is a baseline capture of the busy fixture at 320, 360, 412 and 768px, light and dark, all palettes. Palettes are validated for contrast, now/next/done/late distinction, colour-blind reading and focus states; Register stays the loudest, the others quieter.
