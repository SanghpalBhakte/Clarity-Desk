# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first-run welcome, swipe tour and "Get started" card with a questions welcome, a skippable name step, a spotlight tour of the real app, and one-ask-at-a-time setup cards on Today.

**Architecture:** All logic stays in `app.js` next to the current onboarding block (`checkOnboarding` ~8179 to `finishOnboarding` ~8421) and the Today setup card block (~8615 to ~8865). `welcome-tour.js` keeps its name and lazy `import()`, but now exports a spotlight tour over the live page. Small "remember this" flags go into the existing `cos_notified_history` map. No new storage keys.

**Tech Stack:** Vanilla JS, no build step. Node `.mjs` logic tests (stubbed DOM, `new Function` over `app.js`). Playwright for the browser tests.

**Spec:** `docs/superpowers/specs/2026-10-29-onboarding-redesign-design.md`

## Global Constraints

- All copy is exactly the spec's text. No dashes of any kind (`-`, `–`, `—`) in any onboarding string a student sees. No "seamless", "effortless", "unlock", "journey".
- No new `cos_*` keys and no stored shape changes. Profile writes touch only `name` and `batch`, using the `{ ...loadProfile(), field }` pattern from `setSelfStudyMode` (app.js ~8383), then `liveProfile.field = value; syncToCloud()`.
- Flags live in `cos_notified_history`: `onb_group_skip`, `onb_name_skip`, `onb_att_later_<YYYY-MM-DD>`, `onb_tt_day: 'YYYY-MM-DD'`.
- Keep the event names `welcome_shown` and `welcome_choice` (explore, login, look, scan, manual, self) plus `bunk_calc_used`. New events: `name_given`, `name_skipped`, `tour_step` (1 to 6), `tour_done`, `tour_skipped`.
- At most 7 screens before Today (welcome, name, 5 tour stops).
- Both themes, 390px phone and 1280px laptop. Existing tokens only (`--accent`, `--surface`, `--border`, `--text-*`, `--font-display`).
- Escape every user string with `escHtml_cd`.
- Protected systems (scan, scan review, baseline modal, bunk math, attendance math, the `checkOnboarding` conditions) are called, never edited.

## Review Focus

1. **A long or odd name** (40 characters, `<b>`, quotes, only spaces). It must be trimmed and escaped, nothing gets saved when it's blank, and the greeting and tour titles never break the layout. Test in Task 2.
2. **Closing the tour halfway, then reloading.** The welcome must not come back if a name was saved or the welcome was dismissed, and Today shows the timetable card. Test in Task 2.
3. **A timetable with no lab groups, or a profile that already has a batch.** The group card never shows, and the name fallback is next. Test in Task 4.
4. **Pruning `cos_notified_history` after more than 100 notifications.** The `onb_*` flags must survive, or skipped cards come back. Test in Task 1.
5. **The tour on a phone 320px wide and with a collapsed laptop sidebar.** The bubble stays fully on screen, and the target exists or is skipped. Test in Task 5.

---

### Task 1: Onboarding state helpers

**Files:**
- Modify: `app.js` (helpers just above `checkOnboarding`, ~8179; pruning at ~5591)
- Create: `tests/verify_onboarding_flow.mjs` (copy the harness top of `tests/verify_onboarding_returning.mjs` lines 1 to 60, with the same FakeDate `2026-10-14T10:20:00+05:30`, and extend the `makeApp` return list as later tasks need)
- Modify: `package.json` (`test` script: add `&& node tests/verify_onboarding_flow.mjs` right after `verify_onboarding_returning.mjs`)

**Interfaces:**
- Produces: `onbGet(key: string): any` (reads `cos_notified_history[key]`, `undefined` if missing), `onbSet(key: string, value: any): void`, `saveProfileField(field: 'name'|'batch', value: string): void` (trims, does nothing when empty), `timetableBatches(): string[]` (sorted unique `batches` across `loadTimetable()` days), `noteTimetableDay(): void` (sets `onb_tt_day` to `todayStr()` once a timetable exists and it is unset).

- [ ] **Step 1: Write failing checks** in `verify_onboarding_flow.mjs`:
  - `onbSet('onb_name_skip', true)` → `JSON.parse(store.cos_notified_history).onb_name_skip === true`, and other keys in the map are kept.
  - `saveProfileField('name', '  Riya  ')` → stored profile `name === 'Riya'`, other profile fields unchanged. `saveProfileField('name', '   ')` → profile unchanged.
  - `timetableBatches()` with days holding `batches: ['B2']`, `['A1','B2']`, `[]` → `['A1','B2']`. With an empty timetable → `[]`.
  - `noteTimetableDay()` with no timetable → no `onb_tt_day`. With one → `'2026-10-14'`. Called again on a later date → still `'2026-10-14'`.
  - Pruning: seed `cos_notified_history` with `onb_tt_day` first, then 120 other keys, and run the pruning path (call the reminder function that owns it, ~5456, the same way `verify_push_reminders.mjs` does). Assert `onb_tt_day` survives.
- [ ] **Step 2: Run** `node tests/verify_onboarding_flow.mjs`. Expected: FAIL (`onbGet is not defined`).
- [ ] **Step 3: Implement the helpers.** In the pruning block, carry every `onb_` key into `pruned` before `keys.slice(-50)`.
- [ ] **Step 4: Run** `node tests/verify_onboarding_flow.mjs && node tests/verify_push_reminders.mjs`. Expected: all PASS.
- [ ] **Step 5: Commit** `chore: add onboarding state helpers`

### Task 2: Questions welcome and name screen

**Files:**
- Modify: `app.js` `showOnboardingModal` (~8203 to ~8318), `onboardingExplore` (~8343). Remove `onboarding-step-2`, `showOnboardingStep2`, `finishOnboarding` (only step 2 used them, per the `docs/AUDIT.md` #7 note).
- Modify: `style.css` (new `.ob-full`, `.ob-q`, `.ob-note-chip` near the existing `.ob-*` rules)
- Modify: `tests/verify_bunk_calc.mjs:136-142`, `tests/verify_countdown_self_study.mjs:178-184` (they slice up to `id="onboarding-step-2"`; slice the `showOnboardingModal` template up to `document.body.appendChild(backdrop)` instead)
- Test: `tests/verify_onboarding_flow.mjs`

**Interfaces:**
- Consumes: `saveProfileField`.
- Produces: `window.onboardingShowName(): void` (swaps `#onboarding-step-1` to the name screen), `window.onboardingSaveName(skip: boolean): void` (saves or skips, fires `name_given` / `name_skipped`, then calls `onboardingStartTour()`), `window.onboardingStartTour(): Promise<void>` (calls `dismissOnboarding()`, then `import('./welcome-tour.js')` and `T.startTour({ name, onDone })`; on import failure just leaves Today showing).

- [ ] **Step 1: Write failing checks:**
  - Welcome HTML contains the three question strings and the three answer notes verbatim from the spec, plus buttons calling `onboardingShowName()` and `onboardingLogin()`. Exactly 2 `<button`. No `id="onboarding-step-2"`, no `ob-bunk`.
  - None of the welcome, name or tour copy (collected from the `showOnboardingModal` / `onboardingShowName` source and `welcome-tour.js`) matches `/[–—]|\s-\s/` or `/seamless|effortless|unlock|journey/i`.
  - `onboardingSaveName(false)` with `#ob-name` value `'<b>Riya</b> "x"'` → stored name is that text trimmed, and any later render escapes it (`renderDashboard` HTML has no raw `<b>Riya`). A 40-character name is stored whole.
  - `onboardingSaveName(false)` with a blank value behaves like a skip: no `name` written, `name_skipped` counted.
  - After `onboardingSaveName(true)`, `cos_onboarding_dismissed === 'true'`, and a fresh `makeApp().checkOnboarding()` queues no welcome timer.
- [ ] **Step 2: Run** `node tests/verify_onboarding_flow.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Welcome = full screen `.ob-full`, using the exact copy and markup shape from mockup `V1-questions.png`, notes tilted `-1.2deg`, `1deg`, `-0.8deg`. Keep the `usageActive()` note and `trackUsage('welcome_shown')`. "Show me around" fires `welcome_choice explore` then `onboardingShowName()`.
  - Name screen copy from spec step 2. The input is `autofocus`, `maxlength="40"`, `autocomplete="given-name"`, and Enter submits.
  - `onboardingLogin` is unchanged.
- [ ] **Step 4: Run** `node tests/verify_onboarding_flow.mjs && node tests/verify_bunk_calc.mjs && node tests/verify_countdown_self_study.mjs && node tests/verify_onboarding_returning.mjs`. Expected: all PASS.
- [ ] **Step 5: Commit** `chore: new welcome screen and name step`

### Task 3: One timetable card and the "how to add it" dialog

**Files:**
- Modify: `app.js` setup card block (~8615 to ~8865: `setupSteps`, `setupBanner`). Add `window.showAddTimetableChoice()` next to `setupScanTimetable` (~8407).
- Modify: `tests/verify_bunk_calc.mjs:144-165`, `tests/verify_countdown_self_study.mjs` ("College path unchanged…" check), `tests/verify_onboarding_returning.mjs` (its empty Today check)
- Test: `tests/verify_onboarding_flow.mjs`

**Interfaces:**
- Consumes: `setupScanTimetable`, `setupAddClasses`, `setupSelfStudy` (unchanged).
- Produces: `window.showAddTimetableChoice(): void` (dialog `#add-tt-choice-backdrop` with two rows calling `setupScanTimetable()` / `setupAddClasses()` after closing itself, plus Not now).

- [ ] **Step 1: Write failing checks.** Empty Today (no timetable, not self-study):
  - Exactly one `class="desk-setup-guide"`, containing "Let's add your timetable", "Takes about a minute. The rest can wait.", `onclick="showAddTimetableChoice()"` and `onclick="setupSelfStudy()"`.
  - No "steps left", no `id="today-bunk"`.
  - `showAddTimetableChoice()` appends HTML with "How do you want to add it?", `setupScanTimetable()` and `setupAddClasses()`.
  - Self-study with no exam date still shows the existing countdown step.
  - Update the old checks to match: the calculator check moves to Task 4's card, and "Scan your timetable" / "Add classes myself" now live in the dialog.
- [ ] **Step 2: Run** the four test files from Task 2 Step 4. Expected: the new checks FAIL.
- [ ] **Step 3: Implement.** Drop the step counter and the `bunkCalcHtml('today')` line from `setupBanner`. The `tt` step renders the spec step 4 card. The other steps move to Task 4.
- [ ] **Step 4: Run** the same four files. Expected: PASS.
- [ ] **Step 5: Commit** `chore: one timetable card on a new Today`

### Task 4: Group card, name fallback, next-day attendance card

**Files:**
- Modify: `app.js` setup card block (the `profile` and `att` steps), the greeting at ~8944 (`<div class="desk-greeting">${greeting}</div>`), and `renderDashboard` start (call `noteTimetableDay()`)
- Test: `tests/verify_onboarding_flow.mjs`

**Interfaces:**
- Consumes: `onbGet`, `onbSet`, `saveProfileField`, `timetableBatches`, `noteTimetableDay`, `bunkCalcHtml(idPrefix)` (unchanged).
- Produces: `window.onbPickGroup(batch: string|null): void` (null = skip → `onb_group_skip`), `window.onbSaveGreetingName(skip: boolean): void` (reads `#greet-name`, skip → `onb_name_skip`), `window.onbAttLater(): void` (`onb_att_later_<today>`), `window.onbShowBunk(): void` (reveals `bunkCalcHtml('today')` inside the attendance card). Each one re-renders with `renderPage(state.currentPage)`.

Display rules (one card at a time, in this order, all with a timetable and not self-study):
1. Group card if `timetableBatches().length && !profile.batch && !onbGet('onb_group_skip')`.
2. Otherwise, greeting name ask if `!profile.name && !onbGet('onb_name_skip')`. This replaces the greeting text, it isn't a card.
3. Otherwise, attendance card if `onbGet('onb_tt_day') < todayStr()`, no baselines, no marks, not on holiday, and `!onbGet('onb_att_later_' + todayStr())`.

- [ ] **Step 1: Write failing checks:**
  - Timetable with batches `['A1','A2']` and no batch: the card has "Timetable added ✓ One quick thing" and chips `A1`, `A2`, Skip. `onbPickGroup('A2')` → profile `batch === 'A2'`.
  - Timetable with no batches, **or** profile batch already `'B1'`: no group card, and the greeting shows "What should we call you?".
  - Profile name `'Riya'`: no greeting ask, and the greeting contains `Riya`.
  - `onbSaveGreetingName(true)` → `onb_name_skip`, and the next render shows the normal greeting.
  - `onb_tt_day === todayStr()` → no attendance card. Set it to `'2026-10-13'` → the card has "Want your attendance %?", `showBaselineModal(null, 'manual')` and `onbAttLater()`. After `onbAttLater()` it's hidden today and back on `2026-10-15`.
  - The attendance card is hidden when on holiday, with baselines set, or with any mark in `cos_attendance_records`.
  - `onbShowBunk()` → the card contains `id="today-bunk"`, and typing `75` of `100` gives the same answer as `bunkCalcAnswer` (reuse the `verify_bunk_calc.mjs` assertion).
- [ ] **Step 2: Run** `node tests/verify_onboarding_flow.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement**, using the exact spec copy for step 6 and step 7.
- [ ] **Step 4: Run** `npm test`. Expected: every file PASS.
- [ ] **Step 5: Commit** `chore: setup asks one thing at a time after the timetable`

### Task 5: Spotlight tour

**Files:**
- Modify (rewrite): `welcome-tour.js`
- Modify: `style.css` (`.tour-spot`, `.tour-bubble`; remove the unused `.ob-tour-track`, `.ob-slide`, `.ob-dots`, `.ob-dot` rules)
- Create: `tests/onboarding-tour.spec.ts` (Playwright; start from the first-visit setup in `tests/pwa-smoke.spec.ts`)

**Interfaces:**
- Consumes: called by `onboardingStartTour()` (Task 2).
- Produces: `export function startTour({ name: string, onDone: () => void }): void`. Stops are `{ phone: selector, laptop: selector, title, text }`:
  - phone `.bottom-nav-item[data-nav="dashboard"]` / laptop `#sidebar-dashboard`
  - `…[data-nav="timetable"]` / `#sidebar-timetable`
  - `…[data-nav="subjects"]` / `#sidebar-subjects`
  - `…[data-nav="assignments"]` / `#sidebar-assignments`
  - `#bnav-more` / `#sidebar-notices`
  - last stop `.desk-setup-guide`

  Pick the visible one (`offsetParent !== null`) and skip a stop whose target is missing. The copy is the spec's step 3, with the name inserted via `textContent`, never innerHTML. Next, Skip tour and Escape fire `tour_step` / `tour_done` / `tour_skipped` through `window.trackUsage`. "Let's do it" calls `window.showAddTimetableChoice()`. Arrow keys move between stops. The bubble is clamped to 12px inside the viewport, and the tour repositions on `resize`. The dim layer is one element with a `box-shadow: 0 0 0 9999px` cut-out (as in the mockups). Focus moves to the bubble's main button.

- [ ] **Step 1: Write failing Playwright tests** in `onboarding-tour.spec.ts`, one each for phone 390 and 320 wide and laptop 1280 (and laptop with the sidebar collapsed via `toggleSidebar()`):
  - Tap "Show me around", type `Riya`, press Enter. The bubble says "Okay Riya, this is Today".
  - Each Next highlights the right element (the spotlight box is within 8px of the target's rect).
  - The bubble's `getBoundingClientRect()` stays inside the viewport at every stop.
  - The last stop's "Let's do it" opens `#add-tt-choice-backdrop`.
  - Escape on stop 2 removes the tour, and a reload shows no welcome.
  - With Skip on the name step, the title is "This is Today".
- [ ] **Step 2: Run** `node tests/serve.mjs` then `npx playwright test tests/onboarding-tour.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `startTour` and the CSS (both themes).
- [ ] **Step 4: Run** `npx playwright test tests/onboarding-tour.spec.ts && npm run test:pwa-smoke`. Expected: PASS, with the tour file still precached and working offline.
- [ ] **Step 5: Commit** `chore: tour of the real app`

### Task 6: Docs, visuals, full check

**Files:**
- Modify: `docs/ARCHITECTURE.md` (Welcome line ~44), `PROJECT_MEMORY.md` (§4 onboarding order: add the new flow and the `onb_*` flags), `docs/AUDIT.md` (mark #7 fixed)
- Modify: visual snapshots (`tests/clarity-visual-verification.spec.ts-snapshots/`)

- [ ] **Step 1: Run** `npm run test:visual`. Expected: only the empty-Today and welcome snapshots differ. Look at each diff before updating.
- [ ] **Step 2: Run** `npm run test:visual:update`, then `npm run test:visual`. Expected: PASS.
- [ ] **Step 3: Update the docs** listed above.
- [ ] **Step 4: Run** `npm test && npm run test:pwa-smoke && npx playwright test tests/onboarding-tour.spec.ts && npm run test:mobile`. Expected: all PASS.
- [ ] **Step 5: Manual run** on `node tests/serve.mjs` at 390 and 1280, in both themes, with fresh storage: welcome → name → tour → add timetable (Type it in, 2 classes with a lab group) → group card → (skip) → greeting name ask is skipped because the name was given → set `onb_tt_day` to yesterday in DevTools → attendance card. Screenshot each and compare with the mockups.
- [ ] **Step 6: Commit** with the student-facing subject `New students now get a quick look around the app and set things up one step at a time.`, then push `claude/onboarding-redesign` and open the PR.
