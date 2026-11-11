# Feedback voice: one toast system for Clarity Desk

Date: 2026-11-11 · Status: approved with 10 amendments (all folded in below), ready for the implementation plan
Board: https://claude.ai/artifact/9sjvxLhiuzPPZKosHj1CeL (option 1, "The thread", chosen)

## Why

Every save, tick, sync and failure in the app talks to the student through a toast. Today those toasts look like a template (filled green/red blocks, emoji icons) and many speak generically ("Timetable saved!", "restored successfully! ↩", "Backup failed. Please try again."). They also behave badly: every toast stays 3.2 s regardless of length, so long sync and storage errors vanish before they can be read; nothing pauses on touch; any number can stack; errors are announced the same polite way as "Settings saved"; about 12 form-validation errors exist only as a disappearing toast.

Goal: one recognisable Clarity Desk feedback voice, calm and specific, that always tells the student which item was affected, where it is safe, and what they can do next.

## Scope

In:
- The toast component (`showToast`, `showUndoToast` in `app.js`, `.toast*` rules in `style.css`).
- Rewriting every toast message (about 150 call sites) to the voice guide below.
- Sync badge labels in `updateSyncUI` aligned to the same words; its emoji icons removed (the coloured status dot stays).
- Moving form-validation errors from toasts to a note under the field.
- A voice check of the celebration card (section 4), without a redesign.
- Browser tests for all of the above.

Out:
- Any change to sync logic, stored data, `cos_*` keys, attendance maths or the timetable reader. Presentation and copy only. The one behavioural hook into sync is read-only: the toast reads sync state and listens for its changes.
- The sign-in sheet copy (fixed in #304).
- The update banner (`app.js:460`, does not auto-dismiss).

## 1. Component

### API (backwards-compatible)

```js
showToast(msg, type = 'note', opts = {})
// opts: { detail, action: { label, fn }, sticky, key, item, where }
showUndoToast(msg, onUndo, type, opts)  // thin wrapper: action = { label: 'Undo', fn: onUndo }
dismissToast(key)                       // closes a toast by key, e.g. when a failure resolves
```

- `type`: `done`, `note`, `wait`, `fail`. Old names map: `success → done`, `info → note`, `error → fail`. Untouched calls keep working.
- `msg`: line 1. `opts.item` is the item name; it is inserted as a bold text node, never as HTML (it is student input).
- `opts.detail`: optional line 2. `opts.where: true` makes line 2 the live saved-location line (section 2).
- `opts.action`: one button on the right (Undo, Retry, Open).
- `opts.sticky`: stays until closed. Default `true` for `fail`, `false` otherwise.
- `opts.key`: identity for de-duplication (section 1, "Keys").

### Anatomy and look ("The thread")

- A sheet-coloured slip (`--color-surface`), radius `--radius-sm`, shadow `--shadow-md`; no blur, no fill colour per kind.
- DOM order = reading order: line 1, line 2, action, dismiss.
- Line 1: Quicksand 600, ink; the item name in 700. On `fail`, the opening words ("Couldn't sync") take the error colour.
- Line 2: Nunito, secondary ink, smaller.
- Action: terracotta text button (Quicksand 700). Dismiss: `×` with `aria-label="Dismiss notification"`. Both use the existing 44 px hit-area pattern.
- The thread: a 2 px line under the text, inset to the text edges. `done` / `note` terracotta, `wait` the warning token, `fail` the error token. On timed toasts it shortens from full to zero over the display time (`transform: scaleX`, linear), so it is the countdown. On a sticky failure it is full and still, meaning "this stays".
- No emoji, no green or red fills. The ✓ / ⚠️ / ℹ️ icon span is removed.
- Colours from tokens only, so every theme and accent variant works. Midnight Ink contrast is measured (text ≥ 4.5:1, thread and error words ≥ 3:1 against the slip).

### Timing

Characters counted = visible text of line 1 + line 2. The action label, dismiss label and hidden text are not counted.

| Kind | Display time |
|---|---|
| Ordinary (`done`, `note`, `wait`) | 4 s + 60 ms × chars, min 4 s, max 10 s |
| With an action (Undo, Retry, Open) | same formula, min 7 s, max 12 s |
| Sticky failure | until dismissed, or until resolved by `dismissToast(key)` |

- An update to the visible toast through the same key restarts the full duration (min 7 s if it carries an action).
- Reduced motion: the timer still runs; only the countdown animation stops. Timed toasts then hide the thread (a full still line would wrongly say "this stays"); sticky failures keep their full still line.

### Pause

One model, pointer and focus events only:
- `pointerenter` and `pointerdown` add a `pointer` pause; `pointerleave`, `pointerup` and `pointercancel` remove it. Touch works through pointer events (a tap fires enter → down → up → leave).
- `focusin` adds a `focus` pause; `focusout` to an element outside the toast removes it.
- The timer runs only when no pause is held; it resumes with the time that was left, and the thread's `animation-play-state` follows.
- Dismissing, replacing or updating a toast clears all its pauses, so a toast can never stay paused after it has changed.
- Safety net: a `pointer` pause that is still held 20 s after the last pointer event is released (covers a lost `pointerup`). A `focus` pause has no limit; a keyboard or screen-reader user stays in control.

### Queue

Two lanes.

- **Ordinary lane**: one visible toast and at most two waiting. When a third arrives, the oldest waiting one is dropped.
- **Failure lane**: failures are de-duplicated by key and take priority.
  - A new failure is shown at once. If an ordinary toast is visible, it steps aside: if it carries an action (Undo), it goes back to the front of the ordinary queue with its remaining time; otherwise it is closed, since it was already shown and announced.
  - While a failure is visible, ordinary toasts wait, under the same two-item limit.
  - If more than one distinct failure is open, the newest is shown with "1 more issue" / "N more issues" on line 2. Dismissing it reveals the next one. Nothing is discarded silently.
  - The failure lane is bounded by its keys: each failure site has a fixed key, so the lane can hold at most one toast per kind of failure.
- **Critical problems are never only in a toast.** Sync failure, a full cloud copy, permission denied and a full phone storage also show in the sync badge, which stays until the state changes. The implementation plan lists each critical failure and its persistent place; any without one gets it in the badge or Settings.

### Keys

- Built by the caller from stable parts: `kind:source:id`, for example `fail:sync:push` or `done:task:<taskId>`. Never from raw titles or other student text; capped at 80 characters.
- The default key (no `opts.key`) is `type` plus a short hash of the message text.
- Same key as the visible toast: update it in place and restart its timer; no new toast, no second announcement unless the text changed.
- Same key as a waiting toast: replace the waiting one.
- Retry on a failure: the same toast changes to `wait` ("Trying again…"), then either closes with a `done` line or returns to `fail` with the same key. It never creates a second failure toast.
- Repeated identical saves (same key within the display time) show one toast.

### Announcements

- The visible toast container is not a live region. Two visually hidden announcers sit beside it: `#cd-announce` (`role="status"`, polite) and `#cd-alert` (`role="alert"`).
- Each toast is announced once, when it first shows, by writing its line 1 and line 2 to one announcer: `fail` to `#cd-alert`, everything else to `#cd-announce`. A toast is never moved between regions, so nothing is read twice.
- Updates to line 2 (the live saved-location line) change the visible toast only. They are not announced again; the sync badge carries the new state for screen readers.
- An update through the same key is re-announced only if line 1 changed.
- No toast takes focus. Focus moves only if focus was inside the toast when it closed; it then returns to the element that had focus before the toast was entered.
- The action button's name is its visible label; `aria-describedby` points it at line 1, so "Undo" is read with what it undoes.

### Placement

- Phone: above the bottom bar and the add button, from the existing variables: `bottom: calc(var(--nav-h) + var(--fab-safe) + env(safe-area-inset-bottom, 0px))`. No new hard-coded offsets.
- Keyboard open (detected with `visualViewport`: visible height clearly smaller than the layout height): the toast moves to the top, below the top bar, so it never covers the focused field or the keyboard.
- Landscape phone: same rules; max width 420 px, centred.
- Laptop: bottom right as today, max width 420 px.
- Long item names wrap; a toast may grow to three lines. It never covers the bottom bar, the add button or a focused form control (checked in tests).

## 2. Voice guide

### Saved-location line

One helper, `whereSavedLine()`, derives line 2 from the real sync state at the moment it is read:

| State | Line 2 |
|---|---|
| Not signed in | On this phone only |
| Signed in, last push failed (`cloudPushFailed`) | Saved here · couldn't sync |
| Signed in, offline, change pending | Saved here · waiting to sync |
| Signed in, online, change pending (`hasPendingSync()`) | Saved here · syncing to your account |
| Signed in, no change pending after this save (push confirmed) | Saved here · synced to your account |

- "Syncing" is used only when a change is actually pending. The plan checks, per call site, that the save has already queued the push (`syncToCloud` sets `localPushPendingAt`) before the toast reads the state.
- A toast with `opts.where` keeps line 2 live while visible: it re-reads `whereSavedLine()` on push success, push failure, `online` / `offline` and sign-out. So a visible "syncing" line becomes "synced" or "couldn't sync" rather than staying wrong. These visual updates are not re-announced (section 1).
- Signing out while a change is pending: line 2 becomes "On this phone only"; the toast stays.

### Writing rules

1. **Name the item.** "**DBMS lab record** is done", "**Lab record** added for Thu, 12 Nov", "**Physics** removed". Not "Task marked completed".
2. **Past tense, plain verbs.** added, done, saved, moved, removed, put back, couldn't.
3. **Line 2 says where the data is** (`opts.where`) for every save; not for navigation or settings toggles.
4. **A failure says three things**: what didn't happen, that the data is safe (when true), and the next step.
5. **Uncertain results say so.** "Couldn't read the date. Left blank so you can pick it."
6. **Concrete over poetic.** The student should never have to interpret what happened.
7. **Short.** Line 1 ≤ 60 characters where possible; detail goes to line 2.
8. Keep the 12-hour AM/PM format and the existing date helpers (`formatDate`, `formatDisplayTime`).

### Words to avoid

Avoid these in routine feedback unless an accessibility, legal or product reason needs them: `!`, "successfully", "Please", "Something went wrong", "Try again later", "Operation", "Success" as a label. Emoji, a trailing ✓, ✨ and ↩ have no such reason, so they are not used in toasts at all.

### Representative rewrites

Final wording is set per call site during implementation.

| Today | New line 1 | New line 2 / action |
|---|---|---|
| Task marked completed ✓ | **DBMS lab record** is done | where · Undo |
| Task added to desk ✓ | **Lab record** added for Thu, 12 Nov | where |
| Timetable saved! 24 classes loaded. (editor save) | Timetable saved · 24 classes | where |
| Timetable saved! … (new import) | Timetable added · 24 classes | where |
| Backup failed. Please try again. | Couldn't make the backup file | Nothing changed on this phone · Retry |
| Previous desk setup restored successfully! ↩ | Your earlier desk setup is back | where |
| Weekly reset complete! Ready for a clear, focused week. ✨ | Week reset | Done tasks cleared from this week (wording matched to what the reset does) |
| Notifications enabled! | Reminders are on | You'll get them on this device |
| Could not send your report. | Couldn't send your report | Your message is still here · Retry |
| (photo picked for a task) | Photo added | Check the date before saving |
| You're offline. Changes are saved on this device. | You're offline | Changes stay on this phone until you're back |

"Desk" stays where it is used: the app already says "your desk" elsewhere.

### Sync badge (`updateSyncUI`)

Labels use the same words: "On this phone only", "Syncing…", "Synced · 7:42 PM", "Waiting to sync", "Couldn't sync · saved here", "Sync blocked · saved here" (denied). Logic and states are unchanged. The emoji icons (🔒 ⚠️ ⏳ 💾 ⚡) are removed; the coloured dot and the text carry the state. Titles and `aria-label`s are reworded to match.

## 3. Errors next to the field

```js
fieldError(input, msg, isValid)   // note under the field; isValid(value) decides when it clears
clearFieldError(input)
reportFormErrors(form, errors)    // errors: [{ input, msg, isValid }]
```

- The note is `<p class="field-note" id="fe-<unique>">` placed after the field, in the error colour, Nunito, small. IDs are unique per field (from the input's id, or a counter).
- `aria-invalid="true"` is set. The note's id is **added** to `aria-describedby`, keeping any existing ids, and removed again on clear.
- Clearing happens on `input` only when `isValid(value)` passes, not on any keystroke.
- On submit, `reportFormErrors` marks every invalid field, focuses the **first** one and scrolls it into view with `block: 'nearest'`. Focus is never moved again while the student corrects another field.
- With more than one error, one polite announcement sums it up: "2 fields need a look: title and date." With one error, the field's own description is enough.
- The existing `[aria-invalid="true"]` border (`style.css:2629`) is generalised to `.form-input[aria-invalid="true"]`.
- Messages say how to fix it: "Enter a date, like tomorrow or 12 Nov", not "Invalid date".
- No toast for these.

Sites:
- Add Task: missing title / date (`app.js:16225`).
- Subject name: subject editor (`15425`), vault subject (`17782`), new hub subject (`14851`).
- Topic name and duplicate topic (`14641`, `14647`).
- Vault material: name or link missing, link not http(s) (`18025`, `18030`).
- Attendance baseline subject (`13439`).
- Holiday dates (`9009`, `9015`).
- Feedback message empty (`18978`).
- Timetable editor rows (`3103`, `3112`, `3119`): the problem field in the row (time or subject) gets the note, in plain words: "Monday, 9:00 AM: add the subject name." "Tuesday row: write the time like 9:30 AM." The no-classes case (`3103`) is a form-level note above the save button.

## 4. Celebration card check

Not redesigned. Checked against the voice guide in this pass:
- Its icons are emoji (🎯 🌟 📅 🎉, `app.js:456`, `8295`, `14496`, `19871`). They are replaced with the app's ring mark drawn in CSS (one shape, accent colour), with the same function signature.
- Copy ("Back on track", "All caught up · Every task is done. Nice work.") fits the voice and stays.
- It is announced once through `#cd-announce` and is not part of the queue. It stays visually distinct from ordinary toasts (larger, its own layout) because it marks a real milestone.

## 5. Tests

New `tests/toasts.spec.ts` (Playwright, real app via `tests/serve.mjs`).

Component and queue:
1. Tick a task on Today: the toast names the task, line 2 says "On this phone only", Undo puts the task back.
2. Rapid ordinary actions: one visible, at most two waiting, the oldest waiting is dropped.
3. Two different failures close together: both are kept; the newest shows with "1 more issue"; dismissing it reveals the other.
4. The same failure twice: one toast, one announcement.
5. A failure arriving over a visible Undo toast: the failure shows; the Undo toast comes back after it, with time left.
6. Retry on a failure: the same toast goes to "Trying again…", then resolves; no second failure toast.
7. Repeated identical saves: one toast.

Timing and pause:
8. Display times follow the table (fake clock): short ordinary 4 s, long ordinary capped at 10 s, action at least 7 s and at most 12 s, sticky stays.
9. Touch tap and release (`page.touchscreen`) pauses then resumes; the toast closes after its remaining time.
10. Keyboard focus into the toast pauses; tabbing away resumes.
11. A paused toast that is replaced or updated is not left paused.
12. Reduced motion: no running animation; the toast still closes on time.

Announcements:
13. A failure's text appears once in `#cd-alert` and never in `#cd-announce`; an ordinary toast appears once in `#cd-announce`.
14. A live line-2 update does not write to either announcer.
15. The dismiss button's accessible name is "Dismiss notification"; Undo is described by line 1; no toast takes focus on show.

Saved-location line (sync stubbed through the existing test fixtures in `tests/offline-sync.spec.ts`):
16. Signed in: the save shows "syncing"; the push succeeds while visible and line 2 becomes "synced".
17. The push fails while visible: line 2 becomes "couldn't sync"; the badge says "Couldn't sync · saved here".
18. Go offline after saving: line 2 becomes "waiting to sync".
19. Sign out before the push finishes: line 2 becomes "On this phone only".
20. Reload with a pending change: the badge says "Waiting to sync".

Field errors:
21. Empty Add Task submit: notes under title and date, `aria-invalid`, focus on the title, one summary announcement, no toast. Typing an invalid value keeps the note; a valid value clears it; focus is not moved while correcting the date.
22. A field that already had `aria-describedby` keeps its own id alongside the note's.
23. Timetable row with no subject: the note names the day and time.

Mobile obstruction (320 px, a normal phone, landscape, both themes):
24. The toast does not overlap the bottom bar or the add button (bounding boxes).
25. With an input focused and the keyboard simulated (viewport height reduced), the toast sits at the top and does not overlap the focused field.
26. A long item name with action and dismiss wraps to three lines without overflow or overlap.
27. Midnight Ink: computed contrast of line 1, line 2 and the action meets the thresholds in section 1.

Voice review guard:
28. A scripted walk of common actions collects every toast text. Emoji, ✓, ✨ or ↩ fail the test. The words in "Words to avoid" are listed in the test report for review, without failing.

Visual: one toast per theme at phone width added to the visual suite; Linux screenshots refreshed through the existing workflow.

Existing suites (`npm test`, `npm run test:visual`, `tests/offline-sync.spec.ts`, `tests/mobile-layout.spec.ts`, `tests/signin-review.spec.ts`, `tests/verify_attendance_undo.mjs`, `tests/verify_sync_failure.mjs`) must pass. Where a test matches an old message, its expected text is updated to the new wording; no assertion is removed or loosened.

## Compatibility

These stay: `#toast-container`, `.toast`, `.toast-has-action`, `.toast-action` on the action button, `toast-show` for the visible state, and the new toast being the container's last child when `showUndoToast` returns.

## Risks

- **Many call sites** (about 150 edits in a monolithic file). No logic changes at call sites besides the toast call; reviewed per area; the review guard catches leftovers.
- **Reading sync state from toasts.** Read-only, through existing functions (`hasPendingSync`, `cloudPushFailed`, `currentUser`); the only new hooks are notifications fired from `onCloudPushOk`, `onCloudPushError`, the online/offline handlers and sign-out.
- **Keyboard detection** with `visualViewport` varies by browser; the fallback is the bottom position, which is no worse than today.
- **Screen-reader behaviour** differs between readers; tests cover the DOM contract, and one manual VoiceOver pass on a phone is part of the plan.

## Rollout

One `claude/*` PR, merged on green CI; it waits on `main` for the next "ship" with the other merged PRs. Dev Note subject in student words, for example: "Messages now say which item changed, where it is saved, and what you can do next."
