# Evening mark reminder + backup nudge (spec, 2026-11-14)

Status: spec only, not built. Two small slices, one PR each. Both are opt-in or
quiet, additive, and need no migration.

## Why (honest review of v302)

- Attendance is why students install the app. Marking is already one tap:
  `markEndedPresent` ("I was at all N", with Undo), the post-class greeting
  "Mark today, then the evening's yours", the day rail, and "can miss N" lines.
  A separate "Mark the day" sheet would duplicate this. Not built, on purpose.
- What is missing is the **trigger**. Nothing tells a student, in the evening, that
  today is still unmarked. `attendanceAlerts` only fires on low percentage, and
  `ongoingNudges` is about tasks with no deadline.
- Signed-out students have one copy of their data (`localStorage`).
  `navigator.storage.persist()` is requested (`app.js` ~18068) but nothing tracks
  or prompts a backup. Losing a semester of attendance is the worst failure.

Opinion, not measured: no usage data was available when this was written. Check
Cloudflare visits and the `week4_return` / `attendance_two_weeks` events first.

## Slice 1: "Mark today" evening reminder

One more reminder kind in the existing push path. No server change.

- **Pref:** new additive field `markReminder` in `cos_notif_prefs`, `"off" | "evening"`.
  Missing means `"off"` (existing students get no surprise notification).
  Balanced preset sets `"evening"`; Calm and Off keep `"off"`.
- **Settings:** one row in Reminders: "Mark today's classes". Options: Off / In the evening.
- **When:** in `buildUpcomingReminders`, for each teaching day (same filters as
  `reminderClassesFor`, skip `isHolidayActive`), fire at the end of the last
  teaching class + 30 min, never later than 20:30. One per day, tag `mark_rem_<dateKey>`.
- **Copy:** neutral, true even if already marked: title "Today's classes are done",
  body "Mark them in ten seconds." Never names a percentage.
- **Opens:** `./#today` (the day rail and "I was at all N"). Reuse, no new screen.
- **Already marked:** the push is scheduled ahead, so it cannot know. After a mark that
  leaves nothing to mark, today's `mark_rem_` reminder must be dropped on the next
  `syncPushReminders` (verify it replaces by id; if it does not, skip the drop and
  accept one redundant ping, do not add server logic). The in-app path
  (`checkScheduledNotifications`, used when push is not active) must skip when
  `endedUnmarkedClassKeys(today)` is empty.
- **Limits:** counts toward `PUSH_MAX_REMINDERS` (200); 14 days of one-per-day is small.
- **Protected areas touched:** notification prefs shape (additive), push sync. Attendance
  math and storage are not touched.

## Slice 2: Backup nudge

- **Key:** `cos_last_backup` (ISO date), device-local. Not in the export or the cloud
  field list: it describes this phone, not the data.
- **Write:** in `downloadBackupFile` when the file is handed to the browser. It is
  optimistic (a browser cannot confirm the save); say "Last backup file made".
- **Settings, Data & account:** one quiet line: "Last backup: never" or the date.
  Signed in and syncing: "Saved to your account" instead (no nudge needed).
- **Prompt:** pure function `backupNudgeDue(state)`, true only when all hold:
  signed out; 7+ days since the first launch; at least 10 attendance marks or 3 tasks;
  no backup ever, or 30+ days since the last; not shown in the last 30 days
  (`cos_backup_nudge` date). Shown as one toast with a "Back up now" action
  (existing `exportData`), never as a modal or card, never on first run, never in a
  tour. Dismissing counts as shown.
- **Protected areas touched:** backup/restore only by calling `exportData`. The export
  shape does not change, so restore stays compatible.

## Not doing

- A separate "Mark the day" sheet, per-class P/A in a notification, sounds.
- Auto-download of backups, a backup scheduler, any new account or server.
- Badge or haptic work (both already exist).

## Tests and checks

- `npm test`: unit tests for the new reminder (time, last-class-end rule, 20:30 cap,
  holiday skip, `off` and missing pref, preset values) and for `backupNudgeDue`
  (each condition flips it).
- `npm run test:pwa-smoke` (push and notification code paths).
- `npm run test:visual` for the new Settings rows; refresh Linux screenshots.
- Browser check: with a seeded timetable, the reminder appears in the built list at
  the right minute; the toast shows once and not again.
- Update `docs/ARCHITECTURE.md` (prefs shape, `cos_last_backup`, `cos_backup_nudge`).

## Risks

- A reminder the student finds noisy: mitigated by opt-in, one per day, neutral copy.
- The push server cannot cancel after the student has marked. See "Already marked".
- Download confirmation is not knowable, so "Last backup" can be slightly optimistic.
- iOS installed apps may route the backup file through the share sheet; check once.

## Order

Slice 1 first (the retention trigger), slice 2 second (cheap, protects the data).
Judge both by "would a student notice this in a week?" before adding anything else.
