# Today, lighter and worth reopening: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (native, no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Today fit about one screen on a busy day on phone, laptop and desktop, keep one-tap marking, and make the screen visibly lighter as the day is dealt with.

**Architecture:** Display-only changes to two renderers in `app.js` (`dayRailHTML` and the Due panel in `renderDashboard`), new CSS sections appended to `style.css`, one line in the `index.html` head bootstrap, and additive `manifest.json` entries. No storage key, stored shape, attendance sum or parser changes. Open/closed states of the new folds live in memory only.

**Tech Stack:** Vanilla JS, CSS, no build step. Playwright specs in `tests/`. Local preview `node tests/serve.mjs` (http://127.0.0.1:4173).

**Spec:** `docs/superpowers/specs/2026-11-14-today-lighter-design.md` (read it first; this plan argues from it).

## Global Constraints

- Look stays Board and Sheet: marigold = "now" only, red = late, green = done. No cards, no new fonts, no icon-only controls, no hover-only controls.
- Protected, do not change: `setAttendance`, `markEndedPresent`, `resolveTask`, `moveTaskTomorrow`, `pickTaskDay`, `toggleAssignment`, `pickDueRows`, `navigate`, every `cos_*` and `cd_*` key and shape, timetable parsing, backup/restore, `sw.js`. Call them; never edit their bodies.
- Times keep `formatDisplayTime` (12-hour AM/PM). Long names keep `railClassLabel`.
- Every tappable control: tap area at least 44×44px, visible focus ring, works with keyboard.
- All motion inside `@media (prefers-reduced-motion: no-preference)`.
- New CSS goes in a new commented section at the end of `style.css`, scoped to `#page-dashboard` where it is Today-only. Do not edit older rules unless a step names them.
- Existing tests that assert the old markup (the `.due-fix` Done button, "Why this order?" in the heading) are updated to the new behaviour, never deleted or loosened; list each such change in the PR body.
- One PR per task, branch `claude/today-lighter-<n>-<name>` cut from fresh `main`. Never run `npm run ship`.
- If a guardrail number cannot be met without breaking a rule above, stop and report the measured number; do not shrink type or tap areas to hit it.

## Review Focus

1. Long class name, unmarked, at 360px wide: Present / Absent stay fully visible and never overlap the words (test in Task 1).
2. Minute re-render while "Move" or the earlier-classes fold is open: it stays open and the date picker is not lost (tests in Tasks 1 and 2).
3. Keyboard: Enter on "Move" opens the choices and focus lands on "Tomorrow"; Escape closes and returns focus to "Move" (test in Task 1).
4. Every class ended and marked: the rail shows the fold line and the "Day marked" line, not an empty box; a day with more than `RAIL_MAX_ROWS` classes still shows "+N more classes" (tests in Task 2).
5. A saved sidebar choice (`cd_sidebar_collapsed` = `'0'`) on a tablet is respected, and nothing is written to storage by the default (test in Task 3).

## Decisions made in planning (each can be overruled by the user)

- **All late-task choices fold behind "Move".** Why: the checkbox already means Done, and two open button rows are the main cause of the height.
- **Wide layout keeps the existing 1100px breakpoint, not 1024px.** Why: Today already switches to a grid at 1100px (`style.css` ~7996); a second breakpoint 76px lower adds risk for no visible gain, and 1280×720 is covered.
- **Page cross-fade is CSS only, not `startViewTransition`.** Why: `startViewTransition` runs its callback on a later frame, which would change the timing of `navigate` (protected).
- **Folded classes do not count against `RAIL_MAX_ROWS`.** Why: otherwise opening the fold could hide a class that still needs marking.

## Shared test seed

Tasks 1 to 3 use one busy seed. Put it in `tests/helpers/today-busy-seed.ts` (create in Task 1), exporting `seedBusyToday(page, { width, height, at })`. It follows the pattern in `tests/today-calm.spec.ts` (`page.clock.setFixedTime`, `page.addInitScript` setting `cos_onboarding_dismissed`, `cos_onboarding_done`, `cos_profile`, `cos_custom_timetable`, `cos_notified_history`, `cos_custom_tasks`):

- Thursday `2026-09-24T11:20:00`.
- 4 classes that day: 9:00–10:00 (ended), 10:00–11:00 (ended), 11:00–12:00 (live), 2:00–4:00 PM with the name `Database Management Systems Laboratory (Combined Batch A+B)`.
- 6 custom tasks: 2 due before 2026-09-24 (late), 4 due after.

Also export `tapTargetsOnFirstScreen(page)`: counts visible `button, a[href], input, select, [role="button"]` inside `#page-dashboard`, the top bar and the tab bar whose box intersects the viewport at scroll 0.

---

### Task 1: Lighter rows

**Files:**
- Create: `tests/helpers/today-busy-seed.ts`, `tests/today-lighter.spec.ts`
- Modify: `app.js` `dayRailHTML` (`markButtons`, `rowHTML`, ~9371–9450); `app.js` Due panel in `renderDashboard` (~11913–11970); `style.css` (new end section; the old `.rail-marks` rule at ~8128 and `.due-fix` at ~8148 are overridden there, not edited); `docs/ARCHITECTURE.md` ("Today as a projection")
- Test: `tests/today-lighter.spec.ts`, plus updates in `tests/today-calm.spec.ts`, `tests/today-rail.spec.ts`, `tests/today-hub.spec.ts`

**Interfaces:**
- Produces: `.rail-line` (wrapper holding `.rail-meta` and `.rail-marks` on one line); `button.due-move[aria-expanded][aria-controls]`; `window.toggleDueMove(btn: HTMLButtonElement): void`; in-memory `dueMoveOpenId: string | null`; `.due-foot` (line under the Due list holding `.dash-why` and the "+N more tasks" link); helpers `seedBusyToday`, `tapTargetsOnFirstScreen`.

- [ ] **Step 1: Write the failing tests** in `tests/today-lighter.spec.ts` (viewport 390×844 unless stated):

```ts
test('unmarked class is two lines with marks on the status line', ...)
// for each .rail-row.needs-mark: the .rail-marks box top is within 6px of the .rail-meta box top;
// row height < 76; Present and Absent boxes are each >= 44 high (hit area) and inside the viewport.
test('one tap still marks a class', ...)
// click Present on the first .needs-mark row -> row text contains "Marked present"; "Change" visible; click Change -> Present has aria-pressed="true".
test('late task: checkbox is Done, Move opens the choices', ...)
// .due-fix is not visible; .task-ledger-item.has-fix has no button named "Done";
// click .due-move -> aria-expanded="true", "Tomorrow" and "Pick a day" visible, focus is on "Tomorrow";
// Escape -> closed, focus on .due-move; click Tomorrow -> row leaves the late state and the Undo toast shows.
test('Move stays open across the minute re-render', ...)
// open Move, page.clock advance 61s (or call the dashboard render), expect aria-expanded="true".
test('Why this order sits at the end of the list', ...)
// .panel-header has no .dash-why; .due-foot contains "Why this order?" and "+3 more tasks".
test('busy phone day fits the guardrails', ...)
// scrollHeight / 844 <= 1.3 ; tapTargetsOnFirstScreen(page) <= 12
test('360px: long lab name does not push the marks off screen', ...)
// viewport 360x780, 4:10 PM so the long lab is ended and unmarked: Present/Absent right edge <= 360, no overlap with .rail-meta text box.
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx playwright test tests/today-lighter.spec.ts --project=chromium-desktop`
Expected: FAIL (marks on their own line, `.due-move` missing, height about 1.76).

- [ ] **Step 3: Rail markup.** In `rowHTML`, wrap `.rail-meta` and the output of `markButtons(x)` in `<div class="rail-line">` inside `.rail-body` (marks no longer a sibling of `.rail-body`). Buttons keep their classes, words, `aria-pressed`, `data-key` and `onclick`. `railShowMarks` keeps working (it looks up `.rail-row`).

- [ ] **Step 4: Rail CSS.** `.rail-line` is a no-wrap flex row; `.rail-meta` gets `min-width: 0` with ellipsis; `.rail-marks` loses its top margin and sits at the end. `.rail-att` is drawn as a compact text control (about 30px visual height, hairline rule, no fill until `.is-on`) with the 44px hit area from padding or a pseudo-element. At text zoom where both do not fit, `.rail-line` may wrap (use `flex-wrap: wrap` under a container width threshold, not at 360–430px normal zoom).

- [ ] **Step 5: Late tasks.** In the Due row: remove the Done button; add `<button class="due-move" aria-expanded aria-controls="due-move-${id}" onclick="toggleDueMove(this)">Move</button>` as the last item of `.task-ledger-meta` when `canFix`; the `.due-fix` group gets `id="due-move-${id}"` and `hidden` unless `dueMoveOpenId === id`. Add `window.toggleDueMove` (toggle, set `dueMoveOpenId`, move focus to the first choice on open; Escape handler on the group closes and refocuses). Tomorrow / Pick a day keep their existing `onclick`s and the hidden date input.

- [ ] **Step 6: Due heading.** Move the `.dash-why` button out of `.panel-header` into a new `.due-foot` line with the "+N more tasks →" link (shown when either exists). `#dash-why-line` stays directly under `.due-foot`.

- [ ] **Step 7: Run the new tests, then fix the old ones that assert the old markup**

Run: `npx playwright test tests/today-lighter.spec.ts tests/today-calm.spec.ts tests/today-rail.spec.ts tests/today-hub.spec.ts tests/today-returning.spec.ts --project=chromium-desktop`
Expected: PASS. Old asserts on the Done button become asserts on the checkbox; nothing else is loosened.

- [ ] **Step 8: Full checks**

Run: `npm test`, `npm run test:a11y`, `npm run test:mobile`, `npm run test:visual`
Expected: PASS, except visual snapshots of Today, which change on purpose: `npm run test:visual:update` locally, then refresh the Linux snapshots (see handoff prompt).

- [ ] **Step 9: Update `docs/ARCHITECTURE.md`** ("Today as a projection": marks on the status line, Move, `.due-foot`).

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "Today is lighter: mark a class and move a late task from the same line"
```

---

### Task 2: Reasons to come back

**Files:**
- Modify: `app.js` `dayRailHTML` (~9371); the "Your day" panel heading in `renderDashboard` (~11892); the `onclick` strings of `.rail-att` and `.task-checkbox` on Today only; `style.css` (end section); `docs/ARCHITECTURE.md`
- Test: `tests/today-lighter.spec.ts` (new `describe('come back')`)

**Interfaces:**
- Consumes: `seedBusyToday`, `.rail-line` from Task 1.
- Produces: `li.rail-earlier > button.rail-earlier-toggle[aria-expanded]`; `window.toggleRailEarlier(): void`; in-memory `railEarlierOpen: boolean`; `.panel-count` in the "Your day" heading; `window.todaySettle(key: string): void` with in-memory `{ key, at }`; class `is-settling` on the row that was just acted on.

- [ ] **Step 1: Write the failing tests**

```ts
test('ended and marked classes fold into one line', ...)
// seed attendance: the two ended classes marked attended. Expect .rail-earlier-toggle text "2 earlier classes · marked",
// aria-expanded="false", and 2 visible .rail-row (live + later). Click -> 4 visible rows, aria-expanded="true".
test('one marked class reads "1 earlier class · marked"', ...)
test('ended and unmarked classes never fold', ...)
// only the 9:00 class marked: its row is folded, the 10:00 row is visible with .needs-mark.
test('fold stays open across the minute re-render', ...)
test('heading counts marks in words', ...)
// "Your day" heading contains "1 of 4 marked" with one mark; no .panel-count before the first class starts (8:00 AM).
test('all classes ended and marked', ...)
// 5:00 PM, all four marked: rail shows "4 earlier classes · marked" and "Day marked. Books down, feet up." in the first screen.
test('more than RAIL_MAX_ROWS classes', ...)
// 8 classes, 2 ended+marked: fold line + 6 rows + a "+… more classes" link is not shown (6 left); with 9 classes it reads "+1 more class".
test('marking settles the row once', ...)
// click Present -> that row has .is-settling; after 700ms and a re-render it does not. With reducedMotion: 'reduce' the computed animation-name is "none".
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx playwright test tests/today-lighter.spec.ts -g "come back" --project=chromium-desktop`
Expected: FAIL (`.rail-earlier-toggle` not found).

- [ ] **Step 3: Fold.** In `dayRailHTML`, split `all` into `earlier` (state `ended` and has a status) and the rest before the `RAIL_MAX_ROWS` cap; cap and "+N more classes" apply to the rest only. When `earlier.length > 0`, render `li.rail-earlier` first (copy: `${n} earlier class${n === 1 ? '' : 'es'} · marked`), followed by the earlier rows only when `railEarlierOpen`. `toggleRailEarlier` flips the flag and re-renders Today the way other Today toggles do. The existing `.rail-then` lines are untouched.

- [ ] **Step 4: Heading count.** Add `<span class="panel-count">${marked} of ${total} marked</span>` to the "Your day" heading when `total > 0` and at least one class has started. Plain small-caps label style already used by `.panel-title.is-label`; no bar, no ring.

- [ ] **Step 5: Settle.** `window.todaySettle(key)` stores `{ key, at: Date.now() }` in memory. Prefix the Today `onclick`s: `todaySettle(this.dataset.key); setAttendance(...)` and `todaySettle('${id}'); toggleAssignment('${id}')`. Renderers add `is-settling` to the matching row when `Date.now() - at < 600`. CSS: a 200ms tick draw / background settle on `.is-settling`, inside the reduced-motion guard.

- [ ] **Step 6: Run tests**

Run: `npx playwright test tests/today-lighter.spec.ts tests/today-rail.spec.ts tests/today-calm.spec.ts tests/today-hub.spec.ts --project=chromium-desktop`, then `npm test`, `npm run test:a11y`, `npm run test:visual`
Expected: PASS (visual: Today snapshots change on purpose).

- [ ] **Step 7: Update `docs/ARCHITECTURE.md`**, then commit

```bash
git add -A && git commit -m "Today folds away classes you have marked and shows how many are marked"
```

---

### Task 3: Fit per screen

**Files:**
- Modify: `style.css` (end section; overrides the `@media (min-width: 1100px)` Today grid at ~7996–8010 without editing it); `index.html:36` (sidebar bootstrap); `docs/ARCHITECTURE.md`
- Test: `tests/today-lighter.spec.ts` (new `describe('fit')`)

**Interfaces:**
- Consumes: `seedBusyToday`.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the failing tests**

```ts
test('1280x720: busy day fits one screen in two columns', ...)
// document.documentElement.scrollHeight <= 720; the Due panel's left edge is right of the "Your day" panel's right edge;
// the quick add input and the attendance panel are in the same column as Due.
test('1440x900: same two columns, no horizontal scroll', ...)
test('1099px wide: single column as before', ...)
test('820x1180, no saved choice: sidebar starts as the icon rail', ...)
// html has class sidebar-collapsed; localStorage.getItem('cd_sidebar_collapsed') === null
test('820x1180, saved "0": sidebar stays open', ...)
test('1280x720, no saved choice: sidebar open', ...)
test('tab order follows reading order on wide screens', ...)
// Tab from the first .rail-name reaches a Due row before the attendance panel.
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx playwright test tests/today-lighter.spec.ts -g "fit" --project=chromium-desktop`
Expected: FAIL (height about 1.61 screens; sidebar open at 820px).

- [ ] **Step 3: Wide layout.** At `min-width: 1100px`: `.dashboard-left` becomes `display: contents`; the "Your day" panel takes column 1; the Due panel (with the quick add) and `.dashboard-right-panel` stack in column 2; columns become roughly `minmax(0, 1.15fr) minmax(340px, 0.85fr)`. DOM order is unchanged. Keep the reserved rows 1–9 for the full-width items exactly as the existing comment describes. Give the two panels distinct hooks by adding classes `panel-day` and `panel-due` to their `.dashboard-panel` divs in `renderDashboard` (class additions only).

- [ ] **Step 4: Tablet default.** Replace the line at `index.html:36` so the class is added when the saved value is `'1'`, or when it is `null` and `matchMedia('(min-width: 768px) and (max-width: 1023px)').matches`. No write. `toggleSidebar` and `syncSidebarBtn` are untouched.

- [ ] **Step 5: Run tests**

Run: `npx playwright test tests/today-lighter.spec.ts --project=chromium-desktop`, then `npm test`, `npm run test:a11y`, `npm run test:mobile`, `npm run test:visual`, `npm run test:pwa-smoke` (index.html changed)
Expected: PASS (visual: desktop and tablet snapshots change on purpose).

- [ ] **Step 6: Update `docs/ARCHITECTURE.md`**, then commit

```bash
git add -A && git commit -m "Today uses the full width on laptops, and tablets start with the slim sidebar"
```

---

### Task 4: App shell

**Files:**
- Modify: `manifest.json` (add `screenshots`; `background_color` only if Step 1 says so); `index.html` (theme-color metas, only if Step 1 says so); `style.css` (end section)
- Create: two PNGs beside the existing icon files named in `manifest.json` (`screenshot-phone.png` 1080×1920, `screenshot-wide.png` 1920×1080); `scripts/capture-install-screenshots.mjs`
- Test: `tests/pwa-smoke.spec.ts` (add checks), `tests/today-lighter.spec.ts` (`describe('shell')`)

**Interfaces:**
- Consumes: `seedBusyToday` (for the capture script's seed data).
- Produces: nothing later tasks use.

- [ ] **Step 1: Ask the user for the real-phone check and do not block on it.** Question to post in the PR and the report: "Installed app on your phone, light theme, then dark: on launch, does the splash or the status bar show a dark band against a light page (or the reverse)?" Until they answer, build Steps 2–6 only. If they say yes: add `<meta name="theme-color" media="(prefers-color-scheme: light)">` and the dark twin with the default palette's page colours (read them from the head bootstrap at `index.html:34`; keep that script's runtime update working), and set manifest `background_color` to the light page colour. If no: change nothing.

- [ ] **Step 2: Write the failing tests**

```ts
// pwa-smoke: manifest.screenshots has one entry with form_factor "narrow" (1080x1920) and one "wide" (1920x1080),
// each src returns 200 with content-type image/png; id, start_url and scope are unchanged ("/clarity-desk", "./index.html", ".").
// shell: with CDP Emulation.setEmulatedMedia features [{name:'display-mode', value:'standalone'}], after navigateTo('assignments')
// the active page's computed animation-name is "cd-page-in"; in a normal tab it is "none"; with reducedMotion 'reduce' it is "none".
```

- [ ] **Step 3: Run and confirm they fail**

Run: `npm run test:pwa-smoke` and `npx playwright test tests/today-lighter.spec.ts -g "shell" --project=chromium-desktop`
Expected: FAIL (no `screenshots`, no `cd-page-in`).

- [ ] **Step 4: Screenshots.** `scripts/capture-install-screenshots.mjs` starts from the running local server, seeds the busy day, light theme, and saves Today at 360×640 @3x and 1280×720 @1.5x. Run it, commit the PNGs, add the `screenshots` array (`src`, `sizes`, `type: "image/png"`, `form_factor`, `label`). Do not add them to the `sw.js` precache list.

- [ ] **Step 5: Page cross-fade.** CSS only: `@media (display-mode: standalone) and (prefers-reduced-motion: no-preference)` gives the active page container a 160ms opacity-only `cd-page-in` animation. Confirm the page container selector first (`grep -n 'class="page' index.html`). No JS; `navigate` is not edited.

- [ ] **Step 6: Run tests**

Run: `npm test`, `npm run test:pwa-smoke`, `npm run test:visual`, `npx playwright test tests/today-lighter.spec.ts --project=chromium-desktop`
Expected: PASS, no visual change in a browser tab.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Smoother page changes in the installed app, and a richer install screen"
```

---

### Task 5: Sweep report (no app code)

**Files:**
- Create: `docs/superpowers/reports/2026-11-14-screens-sweep.md`

- [ ] **Step 1: Capture** Timetable, Subjects, Tasks, Vault, Briefing and Settings at 360, 390, 820, 1280 and 1440px wide with the busy seed (scratchpad script, screenshots not committed).
- [ ] **Step 2: Write the report**: one table, columns Screen / Width / Mismatch with Today (row height, button weight, type scale, empty column) / Suggested fix / Size (S, M, L). Only real mismatches; say "none found" where true. End with one recommended order.
- [ ] **Step 3: Commit** `chore: screen consistency report after the lighter Today`, open the PR, and stop. Fixes need the user's approval.

---

## Self-review (done 2026-11-14)

- Spec coverage: section 1 → Task 1; 2 → Task 2 (evening close kept, checked in "all classes ended and marked"); 3 → Task 3; 4 → Task 4; 5 → Task 5. Guardrails are tests in Tasks 1 and 3.
- Deviations from the spec are listed under "Decisions made in planning".
- Names used across tasks: `seedBusyToday`, `tapTargetsOnFirstScreen`, `.rail-line`, `toggleDueMove`, `dueMoveOpenId`, `toggleRailEarlier`, `railEarlierOpen`, `todaySettle`, `panel-day`, `panel-due`, `cd-page-in`.
