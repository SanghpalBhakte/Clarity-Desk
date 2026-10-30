# Offline-first sync: design

Status: draft for review. No code changed yet.

## Goal
Everything except the AI features works with no network. Data lives on the device first; when the network returns, local and cloud data are merged without losing a student's work, and without extra backend cost. Cloud stays optional.

## Decisions (agreed)
- Conflict rule for the same record edited on two devices: **newest edit wins, per record** (tasks, vault resources). No conflict screen.
- Free tier only: still **one Firestore doc per user** (`users/{uid}`). No per-record documents (that would multiply writes and reads).
- No new dependency, no new backend, no change to Firestore rules.

## Current gaps (verified in code)
1. `applyCloudDataToLocalState` replaces `customTasks` and `customLinks` whole (`app.js:3737`). The push also writes whole arrays, so concurrent edits on two devices lose one side.
2. Tasks and vault resources have no `updatedAt`; `sanitizeTask` has no field for it.
3. Deleting a record leaves no trace, so a merge cannot tell "deleted" from "not here yet".
4. A device signing in with local data while a cloud doc exists is overwritten by the cloud copy (not yet traced end to end; step 1 of the plan confirms it).
5. `calculatePayloadHash` leaves out `customLinks`, so a Vault change from another device is not detected (AUDIT #6 family).
6. The `online` event only shows a toast and flushes the feedback/usage queues; it does not push pending changes.
7. No browser tests for offline edit then reconnect, or for two devices.

## Design

### A. Record stamps
- Tasks and vault resources get `updatedAt` (integer ms). `sanitizeTask` keeps it only when it is a valid finite number, so older app versions simply drop it.
- Records with no stamp count as `0`. A real edit always beats them. The first push after this ships stamps them with the migration time only if the record changed; unchanged legacy records stay at `0` so two devices migrating at different times never fight.
- Stamps come from a **hybrid clock** helper `nextStamp()`: `max(Date.now(), lastStamp + 1)`, persisted in `cos_sync_clock`. Whenever a cloud record arrives with a bigger stamp, `lastStamp` is raised to it. A phone with a wrong clock therefore still orders its own later edits after what it has seen.
- Stamps more than 24 h in the future are clamped to now when read, so one device with a clock set to 2030 cannot make its records unbeatable.
- Ties: the cloud copy wins (deterministic on both devices).

### B. Deletes
- Deleting a task or vault resource records a tombstone `{id, deletedAt}` in a new local key `cos_tombstones`, synced as a top-level field `tombstones` in the user doc.
- Merge: a tombstone newer than the record's `updatedAt` removes it; a record edited after the tombstone brings it back (the edit wins, which matches "newest wins").
- Tombstones expire after 30 days and are capped at 200 (oldest dropped first), so the doc cannot grow without bound.
- Bulk deletes (existing bulk task delete, clear-all) write tombstones in one pass.

### C. Merge
- One pure function `mergeRecords(local, cloud, tombstones)` keyed by id, no DOM, no storage access (so it is unit-testable in Node like the other `verify_*` scripts).
- `applyCloudDataToLocalState` uses it for `customTasks` and `customLinks`. It never replaces the whole array. Device-only file placeholders (`mergeCloudLinks` behaviour) are preserved inside the merge.
- After a merge that changes local data and differs from the cloud copy, one push is scheduled (reuses the existing 2.5 s debounce).
- Attendance, timetable and the other fields keep today's behaviour (attendance is already a per-date map with tracked deletes). Out of scope.

### D. First sign-in on a device that has data
- If local data exists **and** the cloud doc has data, and this is the first time this device sees this uid, show a review step (existing modal pattern): "Keep both" is the default and merges by record; the alternatives are "Use cloud copy" and "Use this device".
- Before anything is written, local state is saved to `cos_signin_backup` (same idea as `cos_cleanup_backup`) and an Undo is offered. Nothing is written silently.
- If either side is empty, no screen is shown.

### E. Sync state and reconnect
- `updateSyncUI` gains three honest states: "Saved on this device" (cloud off or signed out), "Waiting to sync" (local change newer than the last server ack), "Synced · time".
- The `online` handler pushes pending changes (not just the toast).
- Add `customLinks` and the stamps to `calculatePayloadHash`.

### F. Safety and cost guards (the risk list)
| Risk | Guard |
|---|---|
| Wrong device clock | Hybrid clock + future clamp + deterministic tie (see A) |
| Firestore 1 MiB doc limit | Measure the payload size before each push. Warn the student at 700 KB ("Your cloud copy is getting full"), and at 900 KB skip the push, keep everything locally, and show a clear message. Vault files already stay off-cloud. Tombstone cap (B) keeps growth bounded. |
| Write cost / free-tier quota | Skip the push when the payload hash equals the last pushed hash. Keep the 2.5 s debounce. Failed pushes back off 5 s, 30 s, 2 min, then wait for the next local change or `online` (no hot retry loop). One write per sync, no extra reads from the merge. |
| Read cost | No new listeners. The existing "pause when hidden" listener behaviour stays. Merge uses data already delivered by the snapshot. |
| Ping-pong between two devices | A merge that results in the same hash as the cloud never pushes. Existing `lastCloudPayloadHash` echo handling stays and now includes stamps. |
| Older cached app versions still in use | They push whole arrays without stamps and never touch `tombstones`. New clients treat unstamped records as `0` and keep tombstones, so the worst case is the old behaviour, never worse. The service worker cache bump rolls clients forward. |
| Firestore persistence unavailable (private mode, old browser) | Local data is still the source of truth; sync degrades to "Saved on this device" and pushes when the listener works. Already optional; no new failure path. |
| Several tabs open | Existing `tabManager`; stamps are monotonic per device, so tab order does not matter. |
| Storage keys / shapes | New keys only (`cos_tombstones`, `cos_sync_clock`, `cos_signin_backup`). Existing keys keep their shape; `updatedAt` is an optional added field. No renames. |
| Backup / restore | New backups include `cos_tombstones`. Old backups restore as before (missing stamps count as `0`; restore stamps restored records at restore time so they are not silently beaten by older cloud copies). |
| Data loss from a merge bug | `cos_signin_backup` before the first-login merge; a local snapshot (`cos_sync_prev`) of tasks and links is kept before each applied merge that removes or overwrites records, with a one-tap Undo toast. |
| Permission-denied / quota errors | Existing `updateSyncUI('denied')` path; add a "cloud is full or paused, your data is safe on this device" message instead of silent failure. |

## Rollout (separate PRs, each merged only on green CI)
1. **Tests first, no app change:** Playwright offline flows (add task offline, reload offline, reconnect sync) and a two-context conflict test; confirm gap 4. Also an offline pass over every non-AI page.
2. **Stamps, clock, tombstones, `mergeRecords` + unit tests** (not yet wired into apply/push).
3. **Wire merge into apply/push, hash fix, push guards (hash-equal skip, backoff, size guard).**
4. **First sign-in review step + backups + Undo.**
5. **Sync status UI + `online` push + messages.**
6. **Docs:** `docs/ARCHITECTURE.md` (storage keys, sync flow), `docs/AUDIT.md` #1 and #6 marked fixed.

Step 2 onward only ships when the user says "ship" (batched), per project rules.

## Verification
- `npm test` for merge/stamp/tombstone logic (new `tests/verify_sync_merge.mjs`, plus the existing `verify_sync_*`).
- `npm run test:pwa-smoke` for offline behaviour; new Playwright specs for the sync flows.
- `npm run test:visual` for the first-sign-in modal and sync status chip (Linux screenshots refreshed via the workflow).
- `npm run release:check` before any ship.

## Acceptance criteria
- With the network off, every non-AI page loads and every edit is kept; after reload still there.
- On reconnect, pending changes reach the cloud within seconds with exactly one write per change burst.
- Two devices editing different tasks while apart: both edits survive. Same task: the later edit wins. A delete on one device is not undone by the other unless that device edited the task later.
- A first sign-in with data on both sides never overwrites anything without the review step, and can be undone.
- A device with a badly wrong clock cannot permanently win or lose conflicts.
- No increase in Firestore reads per session; writes per session no higher than today.

## Out of scope
Per-field merge inside a task, a conflict screen, syncing uploaded vault files, multi-user sharing, any paid service.
