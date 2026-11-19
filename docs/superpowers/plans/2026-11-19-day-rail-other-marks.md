# Day Rail "More" marks (Didn't happen / OD): Implementation Plan

> **For agentic workers (Sonnet 5.5, fresh session):** Read `CLAUDE.md`, then this whole plan, before touching anything. Work task by task; steps use checkbox (`- [ ]`) syntax. Native, no subagents. If any step's facts don't match the code (line numbers drift), stop, re-read the named function, and adapt. Do not guess.

**Goal:** A class that was cancelled, or that the student missed on On Duty, can be marked straight from Today's Day Rail. Today it can only be marked Present or Absent, so students either take a false Absent or leave the row nagging "Ended · not marked".

**Why it is small:** The statuses `cancelled` and `od_pending` already exist end to end. `setAttendance` stores them and shows the Undo toast and haptic (`app.js` ~10580). `ATT_STATUS_LABEL` names them (~13196). The rail meta already says `Marked · Didn't happen` (~9447). V1 and V2 math already exclude `cancelled` from classes held. The only thing missing is a button on the rail.

**Architecture:** Display-only change to `dayRailHTML` (`app.js` ~9408) plus one small in-memory open-state variable and one toggle function next to `railShowMarks` (~9378). New CSS goes in a new section at the end of `style.css`. No storage key, stored shape, attendance math, parser, sync or `sw.js` change. No `docs/ARCHITECTURE.md` update needed, because data flow is unchanged.

**Tech stack:** Vanilla JS, CSS, no build step. Playwright specs in `tests/`. Local preview: `node tests/serve.mjs` (http://127.0.0.1:4173). A plain static server shows the live jsDelivr code, not your edits.

## Before you start (findings from the review session, 2026-11-19)

- Working tree on `main` already has **unrelated modified/untracked visual snapshots** under `tests/clarity-visual-verification.spec.ts-snapshots/`. They are not yours. Never `git add -A` or commit them. Stage only the files this plan names.
- `attMoreMenuHTML` (~10688) already offers the same two options in the weekly tracker. **Do not reuse it on the rail.** It puts the raw `classKey` inside an inline `onclick` string (it breaks on keys with quotes), it is icon-only (`⋯`, against the Today rules), and it is a `<details>` popover that a minute re-render would close. Copy the rail's own pattern instead: `data-key` and `this.dataset.key`, as in `markButtons` → `btn()` (~9436).
- Clicking the already-on status clears the mark (toggle, existing behaviour in `setAttendance`). Keep it.
- `od_accepted` / `od_rejected` (confirming an OD later) stay where they are now (weekly tracker / attendance screens). Out of scope here.

## Global constraints

- Protected, call but never edit: `setAttendance`, `markEndedPresent`, `todaySettle`, `ATT_STATUS_LABEL`, `attendanceKeyFor`, every `cos_*` / `cd_*` key and shape, V1/V2 attendance math, `sw.js`, `manifest.json`.
- Look stays Board and Sheet: text buttons, no cards, no icon-only controls, no hover-only controls, no new colours. Marigold = now, red = late, green = done.
- Every new control: tap area ≥ 44×44px, visible focus ring, works with keyboard, says its job in its `aria-label`.
- Times keep `formatDisplayTime`. Long names keep `railClassLabel`.
- Motion only inside `@media (prefers-reduced-motion: no-preference)` (none is needed here).
- Existing tests are updated only if the new markup legitimately changes what they assert. Never delete or loosen one. List any such change in the PR body.
- Smallest safe change. No cleanup of nearby code.

## Task 1: "More" on rail rows → "Didn't happen" and "OD"

**Branch:** `claude/day-rail-other-marks` from fresh `main` (`git fetch && git switch -c claude/day-rail-other-marks origin/main`). Report `git status`, branch and remotes first, as CLAUDE.md asks.

### Behaviour (what the student sees)

On a rail row that is **ended or live** (the only rows that get mark buttons today):

1. The marks group reads: `[Present] [Absent] More`. "More" is a quiet text button (underlined link style like `.rail-change`), `aria-expanded="false"`, `aria-label="More marks for <subject>"`.
2. Tapping More shows a second line in the same group: `[Didn't happen] [On duty (OD)]`, using the same `.rail-att` pill style. Focus moves to "Didn't happen". `aria-expanded` becomes `true`. Tapping More again, or pressing Escape inside the group, hides it and returns focus to More.
3. Tapping one calls `todaySettle(key); setAttendance(dateStr, key, 'cancelled' | 'od_pending')`, exactly like Present/Absent do. The existing toast, Undo and haptic follow for free. The row then folds like any marked row, and its meta reads `Marked · Didn't happen` / `Marked · OD · waiting for teacher` (already implemented).
4. The open state **survives the minute re-render**. Keep it in memory as `railMoreOpenKey` (the class key), the way `dueMoveOpenId` (~9350) does for "Move". Clear it when that key is no longer on the rail, or after a mark is set.
5. If a row's current status is `cancelled` or `od_pending` and the student taps **Change**, the second line is already open and the matching pill is `is-on` / `aria-pressed="true"`. Focus goes to it. `railShowMarks` already focuses `.rail-att.is-on`, so that works if the pill is in the DOM and visible.
6. A `cancelled` / `od_pending` row is not "unmarked": no "Ended · not marked", no `needs-mark` class, and it is not counted in "I was at all N". All of this already follows from `status !== 'unset'`. **Verify it, don't change it.**

### Steps

- [ ] **1. Read before editing.** `app.js`: `dayRailHTML` (~9408–9500), `railShowMarks` (~9378), `dueMoveOpenId` / `toggleDueMove` (~9350–9365) for the open-state pattern, `setAttendance` (~10580–10625). `style.css`: `.rail-marks`, `.rail-att`, `.rail-change` (~8128–8157) and the `#page-dashboard .rail-line …` overrides (~8570–8595). `tests/today-rail.spec.ts` in full (fixtures and the `open()` helper).
- [ ] **2. Write the failing tests first** in `tests/today-rail.spec.ts`, reusing its `open()`, `DAY` and clock pattern (2026-09-24 is a Thursday; at 12:40 Data Structures and DBMS have ended unmarked). Add:
  - `'a class that did not happen: More offers Didn't happen and OD, the mark is in words and Undo takes it back'`:
    - More button for Data Structures exists, ≥ 44px tall, `aria-expanded="false"`. Didn't happen is hidden.
    - Click More → `aria-expanded="true"` and the Didn't happen button is focused.
    - Click Didn't happen → `page.clock.runFor(300)` → `localStorage['cos_attendance']['2026-09-24'][<DS key>] === 'cancelled'`. Read the key from storage rather than hardcoding it.
    - Open the earlier fold (`.rail-earlier-toggle`) → the DS meta contains `Marked · Didn't happen`.
    - Click the toast's Undo → the meta says `Ended · not marked` again.
  - `'OD from the rail is stored as waiting for teacher and is not counted as unmarked'`: mark DS as OD via More, then assert the stored `od_pending`, the meta `Marked · OD · waiting for teacher`, and that "I was at all 2" is gone (only DBMS is left).
  - `'More stays open across the minute re-render; Escape closes it and returns focus'`: open More → `page.clock.runFor(61_000)` → still `aria-expanded="true"` and the pills are visible. Press Escape → closed, More focused.
  - `'Change on a "Didn't happen" row shows it selected'`: seed `cos_attendance` with DS = `cancelled` via the `extra` arg → open the fold → click Change → Didn't happen is visible with `aria-pressed="true"` and is focused.
  - Extend the existing 360px / 200%-zoom checks, or add one: at 360×812 with More open on the long-name row, no horizontal scroll, and every pill is fully on screen and ≥ 44px tall.

  Run `npx playwright test tests/today-rail.spec.ts`. The new tests must fail for the right reason (no More button).
- [ ] **3. Implement in `dayRailHTML` → `markButtons`.**
  - Generalise `btn(val, word)`'s `aria-label`, which today maps only attended/skipped. Use `${word}, mark ${name} as ${ATT_STATUS_LABEL[val] || (val === 'attended' ? 'attended' : 'skipped')}`. Keep the existing two labels byte-identical, because tests match them.
  - After the Present/Absent buttons, add the More button: `class="rail-more" data-key=… aria-expanded=… aria-controls="rail-more-<safe id>" onclick="toggleRailMore(this)"`. Build the id from the row index `x.i`, not the raw key.
  - Add `<span class="rail-more-marks" id="rail-more-<x.i>" role="group" aria-label="Other marks for <name>" onkeydown="if(event.key==='Escape'){event.stopPropagation();toggleRailMore(this.parentElement.querySelector('.rail-more'))}" ${open ? '' : 'hidden'}>${btn('cancelled', "Didn't happen")}${btn('od_pending', 'On duty (OD)')}</span>`.
  - Make it open when `railMoreOpenKey === x.key`, **or** when `x.status` is `cancelled` / `od_pending`. In that second case it stays visually folded with the rest of the group until Change, because `.rail-marks.is-folded` hides the whole group.
  - Escape everything through the existing `attrSafe` / `escHtml_cd`.
- [ ] **4. Add `toggleRailMore`** next to `railShowMarks`: `let railMoreOpenKey = null; window.toggleRailMore = function(btn) { … }`. It flips `hidden` on the sibling group, sets `aria-expanded`, updates `railMoreOpenKey`, and focuses the first pill on open or `btn` on close. Do **not** re-render the dashboard. In `dayRailHTML`, if `railMoreOpenKey` is not among the rows' keys, set it to `null`. In the pill `onclick`, set `railMoreOpenKey = null` before `setAttendance` (add a tiny `window.railMoreClear` or inline the assignment through a window function; don't expose a mutable global another way).
- [ ] **5. CSS.** Add a new commented section at the end of `style.css`: `/* Day Rail: More marks (Didn't happen / OD), 2026-11-19 */`.
  - `.rail-more` copies `.rail-change`'s link look (44px min tap, underline, `--color-action-primary`, focus ring).
  - `.rail-more-marks { display: flex; flex-wrap: wrap; gap: 8px; flex-basis: 100%; }` puts it on its own line. `.rail-more-marks[hidden] { display: none; }`.
  - Scope Today overrides under `#page-dashboard .rail-line` so they match the existing compact pills there (~8576–8579).
  - Check at 360px and 200% zoom that the pills wrap and never overlap the meta text.
- [ ] **6. Run and look.**
  - `npx playwright test tests/today-rail.spec.ts tests/today-lighter.spec.ts tests/mobile-layout.spec.ts tests/toasts.spec.ts`
  - `npm test`
  - `npm run test:visual`. If Today snapshots change only because of the new "More" link, regenerate **only those** with `npx playwright test tests/clarity-visual-verification.spec.ts --update-snapshots -g "<name>"`, look at each new PNG, and name each one in the PR body. Never touch the pre-existing unrelated snapshot changes.
  - Quick look: `node tests/serve.mjs`, then open Today at 360px and desktop in both themes (paper-slate, midnight-ink) with an ended unmarked class. Screenshot More closed and open.
- [ ] **7. Commit and PR.** Stage only `app.js`, `style.css`, `tests/today-rail.spec.ts`, any snapshot PNGs you deliberately regenerated, and this plan file. Commit subject in plain words for students (it becomes a Dev Note), no version label:
  `On Today, mark a class as "Didn't happen" or "On duty" right from your day`
  End the message with the Co-Authored-By line from the session's attribution reminder. Push and open the PR; its body lists the files changed, the tests added, any updated assertions or snapshots, and the risk notes below.
- [ ] **8. Merge rule (CLAUDE.md).** Merge only when CI `Tests` is green on the latest commit, there is no conflict and no unresolved review thread. Then `git pull --ff-only` on `main` and confirm `HEAD` matches `origin/main` and `git status` is clean, apart from the pre-existing snapshot files. **Do not run `npm run ship`.** The user batches ships.

### Review focus / risks

1. **Attendance is protected.** The plan adds no new status and no math, but double-check with `verify_attendance_v2_statuses` and `verify_attendance_percentage` in `npm test` that `cancelled` drops out of classes held and `od_pending` counts as absent-until-confirmed, unchanged.
2. **Minute re-render** must not close More or steal focus mid-tap (the test in step 2 covers it).
3. **Long names at 360px:** Present / Absent / More stay fully visible. The second line wraps and never overlaps.
4. **Keyboard:** Tab reaches More, Enter opens it and focuses Didn't happen, Escape closes it and returns focus.
5. **Older rows:** the weekly tracker's `⋯` menu still works (unchanged).

### Report back (CLAUDE.md format)

Files changed and what changed in each, commands run with their actual pass/fail counts, before/after screenshots, PR link, CI state, and remaining risks. Say plainly if anything was skipped.

## Later tasks: do NOT start without the user's go-ahead

Each needs its own short spec in `docs/superpowers/specs/` first, then approval, then its own `claude/*` PR. Listed in the recommended order.

1. **Evening "Tomorrow" view on the Day Rail.** After the last class has ended, or after 5 PM, a `[Today | Tomorrow]` text toggle shows tomorrow's classes (read-only, no marks) and what's due tomorrow. It reuses `dayRailHTML` with tomorrow's `dayIdx`. Watch for holiday mode, self-study, the "no classes tomorrow" wording and 12-hour times. Display only.
2. **In-app viewer for Vault PDFs.** Replace the three `window.open('', '_blank')` calls (`app.js` ~5804, ~6483, ~6494) with an in-app full-height sheet (`<iframe src=blobURL>` / `<img>`), plus an explicit "Open outside the app" button. Check iOS Safari standalone (inline PDF rendering is limited, so keep the external fallback), revoke object URLs on close, and test offline. Vault/IDB is near protected data, so read-only use of blobs only.
3. **App badge counts unmarked classes after 4 PM** (`app.js` ~20962). Add today's ended-unmarked count to the due count. Never count `cancelled` / OD. Clear it at midnight.
4. **Manifest launch colour.** `index.html` already syncs `meta[name=theme-color]` per theme at boot. `manifest.json`'s `#101613` only affects the splash, and a manifest can't vary by theme, so this is a choice of one neutral colour. Ask the user first. It is a PWA change, so run `npm run test:pwa-smoke`.

Explicitly **not** planned, from the external review: splitting `app.js` into lazy modules (unmeasured gain, touches protected vault/attendance/SW caching), Window Controls Overlay, swipe gestures, pull-to-sync, subtasks (new stored shape), extra-class modal and what-if bunk projection (attendance math), and image/PDF share target (needs SW + OCR review flow). Raise any of these only if the user asks.
