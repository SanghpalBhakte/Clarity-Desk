# Feedback Voice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clarity Desk's generic toasts with one calm, specific feedback system ("The thread"), move form-validation errors next to their fields, and rewrite every message to the voice guide.

**Architecture:** Everything stays in the existing files. `showToast` / `showUndoToast` in `app.js` are rebuilt in place around a small toast controller (two lanes, keys, pause, announcers), keeping their signatures and the DOM hooks tests rely on. A read-only `whereSavedLine()` reads existing sync state; sync code only gains one `notifyToastSync()` call at each state change. Field errors get three helpers next to the toast code.

**Tech Stack:** Vanilla JS (no build step, globals), CSS tokens in `style.css`, Playwright (`tests/*.spec.ts`, served by `tests/serve.mjs`), Node verify scripts (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-11-feedback-voice-design.md`

## Global Constraints

- No change to sync logic, stored data, `cos_*` keys, attendance maths or the timetable reader. Sync code may only gain `notifyToastSync()` calls.
- Keep: `#toast-container`, `.toast`, `.toast-has-action`, `.toast-action` on the action button, `.toast-show` for visible, new toast = container's last child when `showUndoToast` returns.
- Kinds `done | note | wait | fail`; map `success→done`, `info→note`, `error→fail`.
- Timing: ordinary `clamp(4000 + 60*chars, 4000, 10000)` ms; with action `clamp(same, 7000, 12000)`; `fail` sticky. Chars = visible line 1 + line 2 only.
- Keys: `kind:source:id`, never raw student text, ≤ 80 chars; default = type + short hash of message.
- Item names inserted with `textContent` only.
- Dismiss button `aria-label="Dismiss notification"`; hit areas ≥ 44 px.
- No emoji, ✓, ✨ or ↩ in toast text; avoid `!`, "successfully", "Please", "Something went wrong", "Try again later", "Operation", "Success" (review guard reports, does not fail).
- Colours from tokens only; text ≥ 4.5:1, thread/error words ≥ 3:1 against the slip, in every theme.
- 12-hour AM/PM and existing `formatDate` / `formatDisplayTime`.
- No new files in the app shell, no new dependencies.
- Playwright needs the sandbox disabled (port 4173). Kill any stale server on 4173 before a run.
- Commit subjects in plain words for students; tooling/test-only commits start with `chore:`.

## Review Focus

1. **Item names that are hostile or huge** (`<img src=x onerror=alert(1)>`, 200-character titles, emoji titles): rendered as literal text, wrapped, never executed. Test in Task 1 and Task 3.
2. **The tab is hidden while a toast runs** (student switches apps): the timer pauses while `document.hidden` and resumes on return, so a message is not missed. Test in Task 1.
3. **A toast while a sheet or modal is open**: the toast must not cover the sheet's own buttons; it moves to the top position, as with the keyboard. Test in Task 3.
4. **Tick then untick the same task quickly**: one toast keyed `done:task:<id>` updated in place; the last action's text wins; Undo undoes the last action only. Test in Task 2.
5. **Undo after navigating away** (tick on Today, open Tasks, press Undo): the task is restored and the current page re-renders. Test in Task 2.

## Execution amendments (review of 2026-11-11, binding)

**Order and gates.** Run order: 1 → 2 → 4 → 3 → 5 → 6 → 7 (sync-state contract before the look). After Tasks 1, 2, 4 and 6, stop for a self-review gate: re-read the diff, the toast DOM, timers, announcements (after 1), queue priority and interruption (after 2), sync transitions (after 4), the per-area copy and voice report (after 6), and record the result in the ledger. Task 7 prepares the PR; **no merge, no ship without the user's explicit approval** (this overrides Task 7 Step 5).

**A1 Hidden tab (Task 1).** The timer stores remaining milliseconds; on return it resumes with that remainder, never a fresh duration. Add tests: `visibilitychange` while visible keeps it visible; remainder resumes after return; a sticky `fail` stays across hide/show; a toast created while hidden starts its timer only when visible; an update by key while hidden restarts to its full duration but does not run until visible. Each hide test also asserts nothing closed during `clock.runFor(30000)` while hidden.

**A2 Stale sync callbacks (Task 4).** Presentation guard, no sync change: `toastAuthGen` (number) increments in `logoutUser` and on every auth state change. Each `where` toast stores the gen at creation. `notifyToastSync()` updates only toasts whose gen equals `toastAuthGen`. On a gen change, `where` toasts of the old gen get line 2 `On this phone only` (when signed out) and stop updating. Test `late push after sign-out`: signed in, save, `logoutUser()`, then resolve the old push → line 2 stays `On this phone only`; same with sign-out then sign-in again before the old push resolves.

**A3/A4 Failure lane (Task 2).** Policy: **newest-first** (the latest problem is the one the student just caused or saw); the count line `N more issue(s)` is always present while others wait and is recomputed on every change; dismissing reveals the next newest, so the order is deterministic and every failure is reachable. Failures never wait behind ordinary toasts. An interrupted Undo toast returns only after the failure lane is empty, with its preserved remainder (no 7 s restart). Duplicates are de-duplicated by key while open; after a dismiss the same key may show again. Extra tests: three unique failures (count 2 → 1 → none, order F3, F2, F1); a failure arriving while a failure is visible; over a plain ordinary toast; over an Undo toast; duplicate after the original was dismissed (shows again); a Retry that fails followed by a new different failure (two failures, retried one keeps its key).

**A5 Snapshots (Task 3).** Generate only the new snapshots with `--update-snapshots -g "toast"`, open each PNG and compare against the board (option 1), confirm no unrelated diffs with a plain `npm run test:visual` run before and after. Never use update to turn a failing visual test green. Manually inspect (screenshots in the workspace): 320 px, 390 px, landscape, open sheet, keyboard state, Paper Slate, Midnight Ink, long name, three-line toast with action + dismiss, toast above bar and add button.

**A6 Top placement (Task 3).** Signals, in order: an open modal/sheet (app state); a focused text field on a coarse pointer (`matchMedia('(pointer: coarse)')` and `activeElement` is `input`, `textarea` or `[contenteditable]`); `visualViewport` height < 75 % of `innerHeight` only as a supplement. Safety: after placing, if the toast box intersects the focused element or the open sheet's buttons, flip to the other edge. Tests add false-positive checks: small desktop window (900×500) with no focus → bottom; landscape phone with no focus → bottom; desktop with a focused input (fine pointer) → bottom and not overlapping the input.

**A7 Field errors (Task 5).** Messages are plain text via `textContent` (the link hint is text, never an anchor). Error ids are `fe-<input.id>` (stable), falling back to a counter only for id-less inputs. Re-submitting with the same errors focuses the first invalid field only if focus is not already in an invalid field. Summary names come from the field's accessible name (label text or `aria-label`), never the placeholder. Field notes are not live regions; only the multi-error summary is announced, once, via `#cd-announce`; no toast. Add a **table-driven test** with one row per migrated site (all 15 in Task 5 Step 3), each row: how to open the form, how to trigger, the field selector, the expected note text, and a valid value that clears it.

**A8 Tick/untick (Task 2).** Local writes are synchronous (`saveData`); cloud push is debounced, so the final local state is what is pushed. Undo reverses the **last** action (the key `done:task:<id>` toast is updated with the last action's undo). Test asserts stored `cos_custom_tasks` state after tick, after untick, after Undo, and after `navigate` away and back.

**A9 Undo stability (Task 2).** Undo closures act on a stable item id and saved prior state, never a DOM node or list index (audit the existing closures at `:9281`, `:9668`, `:9710`, `:11913-11919`, `:15623`, `:16725`, `:16871`, `:17644`, `:19872`). Tests: Undo after leaving and returning to Today; after a forced re-render; after a sync failure toast was shown and dismissed; after a same-key update; after the task's date was edited (only completion is reverted); after the task was deleted elsewhere (Undo does nothing harmful and shows `Couldn’t undo: that task was removed` as a `note`).

**A10 Celebration (Task 6).** Tests: ring has `aria-hidden="true"`; title + subtitle written once to `#cd-announce`, never to `#cd-alert`; not counted in the queue; while a `fail` is visible, a celebration waits until the failure lane is empty (it never covers or delays a failure); its class stays `celebrate-card` and its box differs from `.toast` (larger padding/size check).

**A11 Voice report (Task 6).** The guard walk attaches a per-toast table: names an item (has `<b>` when the call passed `item`), verb from the allowed list, saved-location line present on saves, no raw technical codes (`/[a-z]+-[a-z]+\b|Firebase|Firestore|permission/i` reported), no "synced" before the push resolved, avoided words, action present on recoverable failures, length > 60 chars. The report is reviewed manually in the Task 6 gate; only emoji / ✓ / ✨ / ↩ fail the test.

---

### Task 1: Toast core (anatomy, timing, keys, pause, announcers)

**Files:**
- Modify: `app.js:360-404` (`getToastContainer`, `showToast`), `app.js:16894-16911` (`showUndoToast`)
- Test: `tests/toasts.spec.ts` (create)
- Modify: `package.json` (add `tests/toasts.spec.ts` to `test:sync-flows`)

**Interfaces:**
- Produces:
  - `showToast(msg: string, type?: string, opts?: { detail?: string, action?: { label: string, fn: () => void }, sticky?: boolean, key?: string, item?: string, where?: boolean }) → HTMLElement` (the toast element)
  - `showUndoToast(msg, onUndo, type?, opts?) → HTMLElement`
  - `dismissToast(key: string) → void`
  - `toastDuration(text: string, hasAction: boolean) → number` (ms; pure)
  - `toastKey(type: string, msg: string, opts) → string` (pure)
  - DOM: `#cd-announce` (`role="status"`, `aria-live="polite"`), `#cd-alert` (`role="alert"`), both visually hidden, siblings of `#toast-container`, which loses its live-region attributes.
  - Toast DOM: `.toast.toast-<kind>` > `.toast-text` (> `.toast-line1` with `<b>` item, `.toast-line2`), `.toast-action` button, `.toast-dismiss` button, `.toast-thread` span. Data: `data-key`.
  - Old `type` names map to new kinds before use; `toast-success`/`toast-error`/`toast-info` classes are **not** kept.

- [ ] **Step 1: Write the failing tests** in `tests/toasts.spec.ts`, using the `openApp` pattern from `tests/offline-sync.spec.ts` (seed `cos_onboarding_dismissed`, `cos_onboarding_done`, `cos_timetable_choice`), `page.clock.install()` before load, and `page.evaluate` to call globals:
  - `durations follow the table`: `toastDuration('a'.repeat(10), false) === 4600`; `toastDuration('a'.repeat(200), false) === 10000`; `toastDuration('ab', true) === 7000`; `toastDuration('a'.repeat(200), true) === 12000`.
  - `item name is text`: `showToast('is done','done',{item:'<img src=x onerror="window.__x=1">'})` → `.toast-line1 b` textContent equals the raw string; `window.__x` undefined.
  - `ordinary toast closes on time`: show a 20-char `note`; `clock.runFor(5100)` → still visible; `runFor(200)` → gone.
  - `fail is sticky and dismissable`: `showToast('Couldn\'t sync','fail')`; `runFor(30000)` → visible; click `.toast-dismiss` (name "Dismiss notification") → gone.
  - `same key updates in place`: two `showToast(..., {key:'done:task:1'})` with different text → one `.toast`, text is the second.
  - `announced once, right region`: a `note` → `#cd-announce` contains its text, `#cd-alert` empty; a `fail` → `#cd-alert` contains it, `#cd-announce` does not; an update with same key and same line 1 does not rewrite the announcer (record via `MutationObserver` count).
  - `pause: touch`: `page.touchscreen.tap` on the toast mid-way, then `runFor(full duration)` → still visible while… (tap = enter/down/up/leave, so it resumes) → closes after remaining time; `pause: hover` → `hover()` keeps it past its time; moving the mouse away resumes.
  - `pause: keyboard focus`: focus `.toast-action` → stays past its time; `Tab` out → closes after remaining time.
  - `paused then updated is not stuck`: hover, update via same key, move mouse away → closes after the new full duration.
  - `pointer safety net`: dispatch `pointerdown` without `pointerup`; `runFor(20000 + duration)` → closed.
  - `hidden tab pauses`: set `document.hidden` via `Object.defineProperty` + dispatch `visibilitychange`; `runFor(15000)` → visible; unhide → closes after remaining time.
  - `no focus steal`: `document.activeElement` unchanged after showing any toast.
  - `action names`: an Undo toast's `.toast-action` has accessible name `Undo` and `aria-describedby` pointing at its `.toast-line1`; DOM order inside `.toast` is line 1, line 2, action, dismiss.
  - `reduced motion`: `page.emulateMedia({ reducedMotion: 'reduce' })` → `.toast-thread` `getAnimations().length === 0`; a timed toast still closes on time; a `fail` thread is visible, a timed toast's thread is hidden.

- [ ] **Step 2: Run to verify they fail**
  Run: `npx playwright test tests/toasts.spec.ts --project=chromium-desktop`
  Expected: FAIL (`toastDuration is not defined`, missing `#cd-alert`, etc.)

- [ ] **Step 3: Implement** in `app.js`, replacing the bodies at the lines above. Approach: one controller object `toastState = { visible, ordinaryQueue: [], failQueue: [] }` (queues used fully in Task 2; here a toast just replaces the visible one). Timer = remaining-ms bookkeeping with `setTimeout`; pauses tracked as a `Set` (`'pointer' | 'focus' | 'hidden'`); `--toast-ms` custom property drives the thread's CSS animation duration and `animation-play-state` follows the pause set. Announce by setting the announcer's `textContent` to `line1 + '. ' + line2` once per toast (and again only when line 1 changes). Remove the icon span and the trailing-✓ strip. `showUndoToast` = `showToast(msg, type || 'done', {...opts, action:{label:'Undo', fn:onUndo}})`, keeping the old "button disables, toast removed, then `onUndo()`" order.

- [ ] **Step 4: Run the new spec and the old toast-dependent tests**
  Run: `npx playwright test tests/toasts.spec.ts --project=chromium-desktop && node tests/verify_attendance_undo.mjs && node tests/verify_sync_failure.mjs`
  Expected: all PASS. If a Node stub DOM lacks something the new code calls (e.g. `setAttribute`, `classList`), extend the stub with the missing no-op method; never remove an assertion.

- [ ] **Step 5: Commit**
  `git commit -m "chore: rebuild the toast core: timing by length, pause on touch and focus, one announcement each"`

### Task 2: Queue lanes and failure priority

**Files:**
- Modify: `app.js` (the controller from Task 1)
- Test: `tests/toasts.spec.ts`

**Interfaces:**
- Consumes: Task 1's `showToast`, `toastState`, `dismissToast`.
- Produces: queue rules used by every caller; `retryToast(key: string, run: () => Promise<boolean>) → Promise<void>` (sets the toast with that key to `wait` "Trying again…", awaits `run`, then on `true` dismisses it, on `false` returns it to `fail` with the same key).

- [ ] **Step 1: Write the failing tests**
  - `one visible, two waiting`: four quick `note`s A–D → one `.toast` (A) visible; B, C wait; D arrives and drops B (oldest waiting) → visible sequence over time is exactly A, C, D.
  - `failure jumps ahead`: visible `note` A (no action), queue B; `fail` F arrives → F visible at once, A gone; dismiss F → B.
  - `undo steps aside`: visible Undo toast U at 2 s in; `fail` F → F visible; dismiss F → U visible again with ≤ remaining time and ≥ 7 s minimum not reapplied (remaining = original − elapsed).
  - `two different failures`: F1 then F2 within 100 ms → F2 visible, line 2 ends with "1 more issue"; dismiss → F1 visible; dismiss → none.
  - `same failure twice`: two `fail` with key `fail:sync:push` → one toast; `#cd-alert` written once.
  - `retry resolves in place`: `fail` key K with Retry wired to `retryToast(K, async () => true)` → after click, the same element shows "Trying again…" (`toast-wait`), then disappears; `.toast-fail` count stays ≤ 1 throughout; with `run` returning `false` it returns to `toast-fail`, still one element.
  - `tick then untick` (Review Focus 4): through the real Today checkbox on a seeded task, tick then untick within 1 s → one toast; its text is the untick message; Undo restores the ticked state.
  - `undo after navigating` (Review Focus 5): tick on Today, `navigate('assignments')`, click Undo → task pending in `cos_custom_tasks` and visible on the Tasks page.

- [ ] **Step 2: Run to verify they fail**
  Run: `npx playwright test tests/toasts.spec.ts --project=chromium-desktop -g "visible|failure|undo|retry|tick"`
  Expected: FAIL.

- [ ] **Step 3: Implement** the lanes per spec section 1 "Queue": ordinary queue max 2 (drop oldest waiting on overflow); fail queue de-duplicated by key, newest shown first, "N more issue(s)" appended to its line 2 while others wait; an ordinary toast with an action interrupted by a fail is re-queued at the front with its remaining time; without an action it is closed. Ordinary toasts never show while a fail is visible.

- [ ] **Step 4: Run** `npx playwright test tests/toasts.spec.ts --project=chromium-desktop` → PASS.

- [ ] **Step 5: Commit** `git commit -m "chore: toast queue keeps failures first and never drops one"`

### Task 3: The thread look and placement

**Files:**
- Modify: `style.css:3895-3946` (toast rules), `style.css:6390-6396` (`.toast-action`), the phone rule near `style.css:7953`, `style.css:2629` (generalise `[aria-invalid]` is Task 5, not here)
- Modify: `app.js` (placement class toggling)
- Test: `tests/toasts.spec.ts`, `tests/clarity-visual-verification.spec.ts`

**Interfaces:**
- Consumes: Task 1 DOM classes.
- Produces: `#toast-container.toast-at-top` (set when the keyboard is open or a sheet/modal is open), CSS var `--toast-ms`.

- [ ] **Step 1: Write the failing tests** (in `toasts.spec.ts`, run under both `chromium-desktop` and `chromium-mobile`; widths 320×640, 390×844, landscape 844×390; themes `paper-slate` and `midnight-ink` via `document.documentElement.dataset.theme`):
  - `does not cover bar or add button`: a 3-line toast (200-char item name, action + dismiss) → its bounding box does not intersect `.bottom-nav` or `[data-testid="add-task-button"]`; `document.documentElement.scrollWidth <= innerWidth`.
  - `keyboard open moves it up`: focus `#quick-add-input`, simulate keyboard by `page.setViewportSize` to 40 % height and firing `visualViewport` `resize` → container has `toast-at-top`; toast box does not intersect the focused input.
  - `sheet open moves it up` (Review Focus 3): open the Add Task modal via `fabAction()` → `toast-at-top`; toast does not intersect the modal's submit button.
  - `contrast`: for each theme, compute contrast of `.toast-line1`, `.toast-line2`, `.toast-action` colour vs the toast background (helper in the spec using WCAG relative luminance) → ≥ 4.5; `.toast-thread` and `.toast-fail .toast-line1 em` (error words) → ≥ 3.
  - Visual: add two snapshots to `clarity-visual-verification.spec.ts`: `toast-thread-paper.png` and `toast-thread-ink.png` at 390 px, clock frozen, one Undo toast.

- [ ] **Step 2: Run to verify they fail**
  Run: `npx playwright test tests/toasts.spec.ts -g "cover|keyboard|sheet|contrast"`
  Expected: FAIL.

- [ ] **Step 3: Implement** per spec section 1 "Anatomy" and "Placement": slip on `--color-surface`, `--radius-sm`, `--shadow-md`, no `backdrop-filter`; thread = absolutely placed 2 px span, `transform-origin: left`, `animation: toast-run var(--toast-ms) linear forwards`; kind colours `--color-action-primary` / `--color-warning` / `--color-error`; enter fade + 8 px rise 220 ms with the existing `cubic-bezier(0.16, 1, 0.3, 1)`, exit fade 160 ms; reduced motion = fade only, timed thread hidden, fail thread static. Phone `bottom: calc(var(--nav-h) + var(--fab-safe) + env(safe-area-inset-bottom, 0px))`; laptop bottom-right, `max-width: 420px`. `toast-at-top` puts it below the top bar (`top: calc(var(--topbar-h, 56px) + env(safe-area-inset-top, 0px) + 8px)`; use the real top-bar variable if one exists). Toggle `toast-at-top` from a `visualViewport` resize listener (visible height < 75 % of `innerHeight`) and when an open modal/sheet is detected (reuse the app's existing open-modal check).

- [ ] **Step 4: Run** the spec under both projects → PASS; then `npm run test:visual:update` for the two new snapshots only, inspect both PNGs, then `npm run test:visual` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Messages now appear as a quiet note with a thin line that shows how long they stay"`

### Task 4: Saved-location line and sync badge words

**Files:**
- Modify: `app.js` near `hasPendingSync` (`:498`): add helpers; `onCloudPushOk` (`:526`), `onCloudPushError` (`:536`), online/offline handlers (`:20122`, `:20130`), `logoutUser` (`:3386`): one `notifyToastSync()` call each; `updateSyncUI` (`:568-610`): labels, titles, aria-labels, emoji removal.
- Test: `tests/toasts.spec.ts` (sync block, fake Firebase from `tests/signin-review.spec.ts`)

**Interfaces:**
- Produces:
  - `whereSavedLine() → string`, exactly: `'On this phone only'` (no `currentUser`); `'Saved here · couldn’t sync'` (`cloudPushFailed`); `'Saved here · waiting to sync'` (offline and `hasPendingSync()`); `'Saved here · syncing to your account'` (online and `hasPendingSync()`); `'Saved here · synced to your account'` (signed in, nothing pending).
  - `notifyToastSync() → void`: re-reads `whereSavedLine()` into every visible/queued toast created with `opts.where`; writes to no announcer.
  - Badge labels: `On this phone only`, `Syncing…`, `Synced · <time>`, `Waiting to sync`, `Couldn’t sync · saved here`, `Sync blocked · saved here`.

- [ ] **Step 1: Write the failing tests** (fake Firebase whose `set()` promise the test resolves or rejects by hand):
  - `signed out` → `showToast('x','done',{where:true})` line 2 `On this phone only`.
  - `syncing then synced`: signed in, quick-add a task → toast line 2 `Saved here · syncing to your account`; resolve the push → line 2 `Saved here · synced to your account`; announcers unchanged by the update.
  - `syncing then failed`: reject the push → line 2 `Saved here · couldn’t sync`; `#sync-text` = `Couldn’t sync · saved here`.
  - `offline after saving`: `context.setOffline(true)` → line 2 `Saved here · waiting to sync`.
  - `sign out mid-push`: call `logoutUser()` before resolving → line 2 `On this phone only`.
  - `reload with pending`: pending change, offline, reload → `#sync-text` = `Waiting to sync`.
  - `badge has no emoji`: `#sync-icon` textContent matches no `\p{Extended_Pictographic}` in every state above.
  - `critical failures are persistent`: for `cloud-full`, `permission-denied` and a push failure, the badge text stays after the toast is dismissed.

- [ ] **Step 2: Run to verify they fail** — `npx playwright test tests/toasts.spec.ts -g "sync|signed|offline|badge|critical"` → FAIL.

- [ ] **Step 3: Implement** the two helpers and the hook calls; reword `updateSyncUI` strings only (branch order and conditions untouched). Confirm in code that each save path calls `syncToCloud()` (which sets `localPushPendingAt`) before its toast; where a toast fires first, move the toast call after the save in that function, not the other way round. Storage-full on this phone (`app.js:4745`): if no persistent indicator exists, show it in the badge as `Phone storage full · saved here` using the existing yellow dot. That is a label addition only.

- [ ] **Step 4: Run** `npx playwright test tests/toasts.spec.ts tests/offline-sync.spec.ts tests/signin-review.spec.ts --project=chromium-desktop && node tests/verify_sync_failure.mjs` → PASS (update expected badge strings in those tests to the new labels; no assertion removed).

- [ ] **Step 5: Commit** `git commit -m "Every save now says where it is kept: on this phone, waiting to sync, or synced"`

### Task 5: Errors next to the field

**Files:**
- Modify: `app.js` (helpers beside the toast code; call sites `:3103`, `:3112`, `:3119`, `:9009`, `:9015`, `:13439`, `:14641`, `:14647`, `:14851`, `:15425`, `:16225`, `:17782`, `:18025`, `:18030`, `:18978`), `style.css:2629` (generalise to `.form-input[aria-invalid="true"]`, add `.field-note`)
- Test: `tests/toasts.spec.ts` (field block)

**Interfaces:**
- Produces:
  - `fieldError(input: HTMLElement, msg: string, isValid?: (value: string) => boolean) → void`
  - `clearFieldError(input: HTMLElement) → void`
  - `reportFormErrors(errors: Array<{ input, msg, isValid }>) → boolean` (returns `true` when there were errors; focuses the first, announces a summary through `#cd-announce` when more than one: `"2 fields need a look: title and date."`, field names from each input's label text, lower-cased)
  - Note element: `<p class="field-note" id="fe-<input.id or counter>">`.

- [ ] **Step 1: Write the failing tests**
  - `empty add task`: open Add Task, submit empty → `.field-note` under title and under date, both inputs `aria-invalid="true"`, `document.activeElement` is the title, `#cd-announce` = `2 fields need a look: title and date.`, `.toast` count 0.
  - `clears only when valid`: type `x` into date (invalid) → note stays; enter a valid date → note gone, `aria-invalid` removed; focus stayed in the date field throughout.
  - `keeps existing describedby`: give the title input `aria-describedby="hint1"` before submit → after submit it contains both `hint1` and the note id; after clearing only `hint1` is left.
  - `timetable row`: in the editor, a row with time `9:00 AM` on Monday and no subject → save → the row's subject field has a note `Monday, 9:00 AM: add the subject name.`; no toast.
  - `no classes`: editor with zero rows → form-level note above the save button.

- [ ] **Step 2: Run to verify they fail** — `npx playwright test tests/toasts.spec.ts -g "add task|clears|describedby|timetable|no classes"` → FAIL.

- [ ] **Step 3: Implement** the helpers, then replace each listed `showToast(..., 'error')` with `fieldError` / `reportFormErrors` using the messages below (exact copy):
  - title: `Add a title, like "Lab record"` · date: `Enter a date, like tomorrow or 12 Nov`
  - subject (all three forms): `Type the subject name, like Physics`
  - topic: `Give the topic a name` · duplicate: `That topic is already in the list`
  - vault name/link missing: `Add a name and a file or link` · bad link: `Links need to start with http:// or https://`
  - baseline subject: `Pick the subject this baseline is for`
  - holiday start: `Pick a first day off from today on` · end: `The last day off has to be on or after the first`
  - feedback: `Write your message first`
  - timetable row subject: `<Day>, <h:mm AM>: add the subject name.` · time: `<Day> row: write the time like 9:30 AM.` · no classes: `Add at least one class, or pick "All batches".`

- [ ] **Step 4: Run** the field block, then `npm test` → PASS (update any verify script that matched an old error toast string to the new field text).

- [ ] **Step 5: Commit** `git commit -m "Form mistakes now show right under the field, with a hint on how to fix them"`

### Task 6: Rewrite every message, celebration ring, review guard

**Files:**
- Modify: `app.js` (every remaining `showToast` / `showUndoToast` / `showSyncUndoToast` call, about 140; `showCelebration` `:409-455` and its callers `:456`, `:8295`, `:14496`, `:19871`), `style.css:6397-6421` (celebration icon → ring)
- Test: `tests/toasts.spec.ts` (guard), existing tests whose expected strings change

**Interfaces:**
- Consumes: `showToast` opts (`item`, `where`, `key`, `action`, `detail`), `retryToast`, `whereSavedLine` from Tasks 1, 2, 4.
- Produces: no new API. `showCelebration(icon, title, subtitle)` keeps its signature but ignores `icon` and draws the ring.

- [ ] **Step 1: Write the failing guard test** `voice review guard`: a scripted walk (quick-add a task, tick it, Undo, add a subject in the hub, add a vault link, save settings, download backup, go offline and back, mark a class Present) collecting every `.toast` text via a `MutationObserver`. Fails if any text matches `/\p{Extended_Pictographic}|✓|✨|↩/u`. Words from "Words to avoid" are written to `testInfo.attach('voice-report', …)` without failing. Plus `celebration has no emoji`: trigger `showCelebration('🎉','All caught up','x')` → card text has no pictographic character and contains a `.celebrate-ring` element.

- [ ] **Step 2: Run to verify it fails** — `npx playwright test tests/toasts.spec.ts -g "voice|celebration"` → FAIL (current ✓ and emoji).

- [ ] **Step 3: Rewrite call sites by area**, one commit per area, using spec section 2 ("Writing rules" and the rewrites table) as the source. For each save, pass `{ item, where: true, key }`. Use `retryToast` for: backup download (`:19197`), report send (`:19011`), cloud push failure (`:560-565`). Keys per area: `done:task:<id>`, `done:subject:<key>`, `done:vault:<id>`, `fail:sync:push`, `fail:sync:full`, `fail:storage:local`, `fail:backup`, `fail:report`, `note:online`. Areas and the lines to touch:
  1. Tasks and quick add (`:9228`, `:9281`, `:9358`, `:15591-15661`, `:16289`, `:16725-16731`, `:19872-19938`)
  2. Attendance and hubs (`:9653-9710`, `:11737-11938`, `:12950-13089`, `:13469-13487`, `:14313-14804`)
  3. Timetable and holidays (`:3171`, `:3309`, `:8805`, `:9024-9048`, `:15457-15473`)
  4. Vault and links (`:5098-5251`, `:5797`, `:16866-16882`, `:17530-18053`)
  5. Sync, sign-in, backup, restore, settings, reminders, reports, offline (`:547-565`, `:3391-3660`, `:4271-4745`, `:4913`, `:5955-6135`, `:6404-6797`, `:14167-14257`, `:18978-19298`, `:19570`, `:20124-20131`)
  Then replace the celebration emoji span with `<span class="celebrate-ring" aria-hidden="true">` drawn in CSS (a 2.5 px ring in `--color-action-primary`); the card stays outside the queue and is announced once through `#cd-announce` (title + subtitle).

- [ ] **Step 4: Run everything that reads message text**
  Run: `npm test && npx playwright test tests/toasts.spec.ts tests/mobile-layout.spec.ts --project=chromium-mobile && npm run test:sync-flows`
  Expected: PASS. Update expected strings in tests that match old wording (e.g. `tests/verify_push_reminders.mjs:187` slices on `` showToast(`Added "${t.title}"``: re-point the slice at the new call), never removing an assertion. Read the attached voice report and fix any listed word without a reason to keep it.

- [ ] **Step 5: Commit** (per area, then the celebration)
  e.g. `git commit -m "Task messages now name the task and say where it is saved"`

### Task 7: Docs, full verification, PR

**Files:**
- Modify: `docs/ARCHITECTURE.md` (a short "Feedback" section: kinds, lanes, keys, announcers, `whereSavedLine`, field errors), `PROJECT_MEMORY.md` only if it lists toast behaviour

- [ ] **Step 1: Update `docs/ARCHITECTURE.md`** with the section above (≤ 20 lines).
- [ ] **Step 2: Full run** (sandbox off, port 4173 free):
  `npm test && npm run test:visual && npm run test:sync-flows && npm run test:mobile && npm run test:onboarding && npm run test:pwa-smoke && npx playwright test tests/toasts.spec.ts`
  Expected: all PASS; report any failure as regression, setup issue or pre-existing problem.
- [ ] **Step 3: Manual check** in `node tests/serve.mjs` at 320 px and laptop, both themes: tick, Undo, offline add, a forced failure; one VoiceOver pass on a phone if the user can run it (otherwise listed as not verified).
- [ ] **Step 4: Push and open the PR** from `claude/feedback-voice-spec` (rename to `claude/feedback-voice` first). Subject: `Messages now say which item changed, where it is saved, and what you can do next`. Trigger "Refresh Linux screenshots" for the new snapshots.
- [ ] **Step 5: Merge** once `Tests` is green, no conflict and no open review thread; `git pull --ff-only` on `main`; confirm `HEAD` matches `origin/main` and `git status` is clean. Do not ship.
