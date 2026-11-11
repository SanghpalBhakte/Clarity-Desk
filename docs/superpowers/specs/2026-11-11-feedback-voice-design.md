# Feedback voice: one toast system for Clarity Desk

Date: 2026-11-11 · Status: design approved in chat, spec waiting for review
Board: https://claude.ai/artifact/9sjvxLhiuzPPZKosHj1CeL (option 1, "The thread", chosen)

## Why

Every save, tick, sync and failure in the app talks to the student through a toast. Today those toasts look like a template (filled green/red blocks, emoji icons) and many speak generically ("Timetable saved!", "restored successfully! ↩", "Backup failed. Please try again."). They also behave badly: every toast stays 3.2 s regardless of length, so long sync and storage errors vanish before they can be read; nothing pauses on touch; any number can stack; errors are announced the same polite way as "Settings saved"; about 12 form-validation errors exist only as a disappearing toast.

Goal: one recognisable Clarity Desk feedback voice, calm and specific, that always tells the student which item was affected, where it is safe, and what they can do next.

## Scope

In:
- The toast component (`showToast`, `showUndoToast` in `app.js`, `.toast*` rules in `style.css`).
- Rewriting every toast message (about 150 call sites) to the voice rules below.
- Wording of the sync badge in `updateSyncUI` to match.
- Moving form-validation errors from toasts to a note under the field.
- Browser tests for the above.

Out:
- The celebration card (`showCelebration`): it keeps its look and timing; it shares the container but is not queued.
- The sign-in sheet copy (fixed in #304).
- Any change to sync logic, stored data, `cos_*` keys, attendance maths or the timetable reader. This is a presentation and copy change only.
- The update banner (`app.js:460`, does not auto-dismiss) stays as it is.

## 1. Component

### API (backwards-compatible)

```js
showToast(msg, type = 'note', opts = {})
// opts: { detail, action: { label, fn }, sticky, key }
showUndoToast(msg, onUndo, type, opts)  // thin wrapper: action = { label: 'Undo', fn: onUndo }
```

- `type`: `done`, `note`, `wait`, `fail`. Old names map: `success → done`, `info → note`, `error → fail`. Untouched calls keep working.
- `msg`: line 1. A string, or a string where the item name is wrapped so it can be bolded. Item names are inserted as text nodes, never as HTML (they are student input).
- `opts.detail`: optional line 2.
- `opts.action`: one button on the right (Undo, Retry, Open).
- `opts.sticky`: stays until closed. Default `true` for `fail`, `false` otherwise.
- `opts.key`: identity for de-duplication; defaults to `type + msg`.

### Anatomy and look ("The thread")

- A sheet-coloured slip (`--color-surface`), radius from the existing scale (`--radius-sm`), the existing soft shadow token (`--shadow-md`); no blur, no fill colour per kind.
- Line 1: Quicksand 600, ink. The item name in weight 700. On `fail`, the opening words ("Couldn't sync") take the error colour.
- Line 2: Nunito, secondary ink, smaller.
- Right: the action as terracotta text (`--accent` family, Quicksand 700), then `×` when sticky. Both with the existing 44 px hit-area pattern.
- The thread: a 2 px line under the text, inset to the text edges.
  - `done` / `note`: terracotta (`--color-action-primary`).
  - `wait`: the warning token.
  - `fail`: the error token, full length, still, slightly faded.
  - For timed toasts it shortens from full to zero over the display time (CSS `transform: scaleX`, linear), so the line is the countdown.
- No emoji, no green or red fills. The ✓ / ⚠️ / ℹ️ icon span is removed.
- Both themes from tokens only (Paper Slate and Midnight Ink, plus their accent variants).

### Timing

- Display time = 4 s + 60 ms per character of line 1 + line 2, capped at 10 s.
- With an action: at least 7 s (today's Undo time).
- `fail`: sticky by default; closes on `×` or `Escape` while focused.
- Pause: `pointerenter`, `touchstart` and `focusin` pause the timer and the line (`animation-play-state: paused`); leaving resumes with the remaining time.

### Queue

- One toast visible at a time. Up to two wait behind it; a third pushes out the oldest waiting non-`fail` toast.
- A toast whose `key` matches the visible one restarts its timer (and updates its text) instead of stacking.
- A `fail` is never dropped from the queue by newer non-fail toasts.
- When an action button is used, the toast closes and the next one shows.

### Announcements

- The container keeps `role="status"`, `aria-live="polite"`.
- A `fail` is placed in a sibling region with `role="alert"` so it is announced at once.
- Closing a toast never moves focus unless focus was inside it; then focus returns to where it was before.

### Motion

- Enter: fade + 8 px rise, 220 ms, the existing ease-out curve. Exit: fade, 160 ms.
- `prefers-reduced-motion: reduce`: fade only, and the thread stands still at full length.

### Placement

- Phone: unchanged rule, above the bottom bar (`style.css` "Phones: toasts sit above the bottom bar"). Must not cover the add button (`--fab-safe`); verify at 320 px and a normal phone.
- Laptop: bottom right as today, `max-width: 420px`.

### Compatibility

These stay, because tests and code depend on them: `#toast-container`, `.toast`, `.toast-has-action`, `.toast-action` on the action button, `toast-show` for the visible state, and the toast being the container's last child when `showUndoToast` returns. `tests/verify_attendance_undo.mjs`, `tests/verify_sync_failure.mjs`, `tests/offline-sync.spec.ts`, `tests/mobile-layout.spec.ts` and `tests/signin-review.spec.ts` must pass unchanged in logic (text expectations may be updated where a message is reworded; a test is never weakened).

## 2. Voice rules

Every message follows these:

1. **Name the item.** "**DBMS lab record** is done", "**Lab record** added for Thu, 12 Nov", "**Physics** removed". Not "Task marked completed".
2. **Past tense, plain verbs.** added, done, saved, moved, removed, put back, couldn't.
3. **Line 2 says where the data is**, from the real sync state at that moment, via one helper `whereSavedLine()`:
   - not signed in: "On this phone only"
   - signed in, online: "Saved here · syncing to your account"
   - signed in, offline or push pending with no network: "Saved here · waiting to sync"
   Used only where a change was saved; not on navigation or settings toggles.
4. **A failure says three things**: what didn't happen, that the data is safe (when true), and the next step. "Couldn't sync your last change. It's safe on this phone." + Retry.
5. **Uncertain results say so.** "Couldn't read the date. Left blank so you can pick it."
6. **Banned**: `!`, "successfully", trailing ✓, ✨, ↩, "Please", "Something went wrong", "Try again later", "Operation", "Success".
7. **Short.** Line 1 ≤ 60 characters where possible; detail goes to line 2.
8. Keep the 12-hour AM/PM format and existing date formatting helpers (`formatDate`, `formatDisplayTime`).

Representative rewrites (final wording is set per call site during implementation):

| Today | New line 1 | New line 2 |
|---|---|---|
| Task marked completed ✓ | **DBMS lab record** is done | whereSavedLine() · Undo |
| Task added to desk ✓ | **Lab record** added for Thu, 12 Nov | whereSavedLine() |
| Timetable saved! 24 classes loaded. | Timetable saved: 24 classes | whereSavedLine() |
| Backup failed. Please try again. | Couldn't make the backup file | Nothing changed on this phone. Retry |
| Previous desk setup restored successfully! ↩ | Your earlier desk setup is back | whereSavedLine() |
| Weekly reset complete! Ready for a clear, focused week. ✨ | Week reset. A clear week ahead. | — |
| Notifications enabled! | Reminders are on | You'll get them on this device |
| Could not send your report. | Couldn't send your report | It's still in the box. Retry |
| You're offline. Changes are saved on this device. | You're offline | Changes stay on this phone until you're back |

### Sync badge (`updateSyncUI`)

The badge text uses the same words: "On this phone only", "Syncing…", "Synced · 7:42 PM", "Waiting to sync", "Couldn't sync · saved here". Logic and states are unchanged; only labels are aligned.

## 3. Errors next to the field

New helper:

```js
fieldError(input, msg)   // shows a note under the field, sets aria-invalid + aria-describedby, focuses it
clearFieldError(input)   // called on the next 'input' event
```

- The note is a `<p class="field-note" id="…">` inserted after the field (or its label wrapper), in the error colour, Nunito, small. Reuses the existing `[aria-invalid="true"]` border treatment (`style.css:2629`), generalised to `.form-input[aria-invalid="true"]`.
- No toast is shown for these.

Sites (from the current code):
- Add Task: missing title / date (`app.js:16225`).
- Subject name: subject editor (`15425`), vault subject (`17782`), new hub subject (`14851`).
- Topic name and duplicate topic (`14641`, `14647`).
- Vault material: name or link missing, link not http(s) (`18025`, `18030`).
- Attendance baseline subject (`13439`).
- Holiday dates (`9009`, `9015`).
- Feedback message empty (`18978`).
- Timetable editor rows (`3103`, `3112`, `3119`): no single field, so the offending row gets `aria-invalid` and the note sits under the row; the first bad row is scrolled into view and focused.

## 4. Tests

New `tests/toasts.spec.ts` (Playwright, real app via `tests/serve.mjs`):
1. Tick a task on Today → toast names the task, line 2 says "On this phone only"; Undo puts the task back.
2. Two quick actions → only one toast visible; the second shows after the first closes; a fourth action never drops a waiting `fail`.
3. A repeated message restarts instead of stacking.
4. A forced sync failure → toast stays past 10 s, sits in the `role="alert"` region, closes on `×`.
5. Hover/focus pauses: the toast is still there after its display time while hovered.
6. Offline (context offline) add → line 2 says "waiting to sync" for a signed-in stub, or "On this phone only" when signed out.
7. Empty Add Task submit → note under the title field, `aria-invalid="true"`, focus in the field, no toast; typing clears it.
8. Reduced motion (`emulateMedia`) → thread has no running animation.
9. Copy guard: across a scripted walk of common actions, no visible toast text contains `!`, `successfully`, `✓`, `✨` or "Please".
10. Visual: one toast in Paper Slate and one in Midnight Ink at phone width (snapshots added to the visual suite; Linux screenshots refreshed via the existing workflow).

Commands: `npm test`, `npm run test:visual`, and the new spec.

## Risks

- **Many call sites**: about 150 message edits in a monolithic file. Mitigation: no logic changes at call sites besides the toast call; the diff is reviewed per area; the copy guard test catches leftovers.
- **Tests that read toast text**: some `verify_*.mjs` files match exact strings. They are updated to the new wording, never loosened.
- **Covering controls on phones**: one toast at a time and the placement check at 320 px.
- **Screen-reader noise**: alerts only for `fail`; everything else polite.

## Rollout

One `claude/*` PR, merged on green CI; waits on `main` for the next "ship" with the other merged PRs. The Dev Note subject in student words, e.g. "Messages now say which item changed, where it is saved, and what you can do next."
