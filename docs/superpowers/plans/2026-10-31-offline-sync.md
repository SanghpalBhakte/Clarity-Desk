# Offline-first Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-AI features work fully offline, and local and cloud data merge per record (newest edit wins) when the network returns, without extra Firestore cost.

**Architecture:** Keep one Firestore doc per user. Add `updatedAt` stamps (hybrid clock) to tasks and vault resources, tombstones for deletes, and a pure `mergeRecords` helper placed in a marked block inside `app.js` (a new boot-critical file would need the jsDelivr pin, the `sw.js` precache and the ship script changed, which are protected systems). Stamping and tombstoning happen at the save chokepoints by diffing old vs new lists.

**Tech Stack:** Vanilla JS, Firestore compat SDK 10.8.0 (persistent cache already on, `app.js:250-257`), Node `verify_*.mjs` tests (source-eval harness, see `tests/verify_sync_deletes.mjs`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-offline-sync-design.md`

## Global Constraints
- One Firestore doc `users/{uid}`; no per-record docs, no new dependency, no rules change, free tier only.
- New storage keys only: `cos_tombstones`, `cos_sync_clock`, `cos_signin_backup`, `cos_sync_prev`. Never rename or reshape an existing `cos_*` key; `updatedAt` is an optional added field.
- Conflict rule: higher `updatedAt` wins per record; tie goes to the cloud copy; missing stamp = `0`; stamps more than 24 h in the future are clamped to now when read.
- Tombstones expire after 30 days, capped at 200 (oldest dropped first).
- Doc size guard: warn at 700 KB, skip the push at 900 KB.
- Push retry backoff: 5 s, 30 s, 2 min, then wait for the next local change or `online`. Debounce stays 2.5 s. Skip a push when the payload hash equals the last pushed hash.
- No silent destructive writes: first sign-in with data on both sides goes through a review step with a backup and Undo.
- Protected systems touched: `cos_*` schemas, backup/restore, offline behavior. Attendance, timetable, SW/manifest are not changed. Do not bump `sw.js` by hand; `npm run ship` does it.
- Plain-words commit subjects (they become Dev Notes); `chore:` for tests/docs only. No `(vN)` labels. Each task is its own PR from a `claude/*` branch; merge only when CI `Tests` is green; ship only when the user says "ship".

## Review Focus
- A delete on device A of a task device B never saw (id absent locally): merge must not resurrect or error.
- Tombstone for id X, then the student re-adds a task that reuses id X later: the newer record must win.
- `cos_custom_tasks` is a legacy array with no stamps and a cloud doc with stamps (and the reverse): no record lost either way.
- Cloud snapshot arrives while a local edit is still unsynced (`hasPendingWrites`): the local edit must survive.
- Doc over 900 KB or quota/permission error: data stays on the device and the student sees a message, never a silent failure.

---

### Task 1: Offline baseline tests and sign-in probe (no app change)

**Files:**
- Create: `tests/offline-sync.spec.ts` (Playwright, uses `tests/serve.mjs` like `tests/pwa-smoke.spec.ts`)
- Create: `tests/probe_signin_overwrite.mjs` (not added to `npm test`; prints findings)

**Interfaces:**
- Consumes: the harness pattern in `tests/verify_sync_deletes.mjs:1-60` (fake Firestore + source-eval of `app.js`).
- Produces: a verified yes/no for spec gap 4 (does a cloud doc overwrite local tasks on first sign-in), written into the plan's Task 5 header.

- [ ] **Step 1:** Write Playwright tests `adds a task while offline and keeps it after reload`, `every non-AI page renders offline` (loop over `PAGES`: dashboard, timetable, subjects, assignments, calendar, notices, resources, links, summary, settings, review; assert no uncaught `pageerror` and the page container non-empty), and `edits made offline are still there after coming back online`. Use `context.setOffline(true)` after the first load has populated the service worker cache.
- [ ] **Step 2:** Run `npx playwright test tests/offline-sync.spec.ts`. Expected: pass. Any failing page is a real offline bug: list it, fix the smallest cause in its own commit inside this task, rerun until green.
- [ ] **Step 3:** Write `probe_signin_overwrite.mjs`: with local `cos_custom_tasks=[A]` and a fake cloud doc `{customTasks:[B]}`, call `subscribeUserCloudData('u1')` through the harness and print the resulting local tasks and whether a push happened.
- [ ] **Step 4:** Run it with `node tests/probe_signin_overwrite.mjs`; record the output in the PR description and update Task 5's "Gap confirmed: yes/no" line.
- [ ] **Step 5:** Commit `chore: test that the app works offline and keeps edits after reconnecting`; open PR; merge on green.

### Task 2: Clock, tombstones, `mergeRecords` (pure, not yet wired)

**Files:**
- Modify: `app.js` (new block `// ── Sync merge (offline-first) ──` directly above `calculatePayloadHash`, ~`app.js:3627`; new key constants beside `KEY_SYNC_LAST_PUSHED` at `app.js:24`)
- Create: `tests/verify_sync_merge.mjs`; add to the `npm test` chain in `package.json`.

**Interfaces:**
- Produces (all in `app.js`, pure unless noted):
  - `nextStamp(): number` (impure: reads/writes `cos_sync_clock`); `max(Date.now(), last+1)`.
  - `observeStamp(n: number): void` raises `cos_sync_clock` to `n` when larger (clamped to now+24 h).
  - `clampStamp(n: unknown, now?: number): number` returns `0` for non-finite or missing, `now` when more than 24 h ahead.
  - `mergeRecords(local: Rec[], cloud: Rec[], tombstones: Tomb[], keyOf: (r:Rec)=>string): { merged: Rec[], changed: boolean, removedLocal: Rec[] }` where `Rec` has optional `updatedAt`, `Tomb = {id: string, deletedAt: number}`. Rule per key: highest clamped stamp wins, tie takes the cloud copy; a tombstone with `deletedAt` greater than the record's stamp removes it; unmatched records on either side are kept.
  - `pruneTombstones(t: Tomb[], now?: number): Tomb[]` drops entries older than 30 days, keeps newest 200.
  - `mergeTombstones(a: Tomb[], b: Tomb[]): Tomb[]` union by id, larger `deletedAt` wins.

- [ ] **Step 1:** In `verify_sync_merge.mjs` (same source-eval harness) write failing tests with exact assertions: newer local beats older cloud; newer cloud beats older local; equal stamps return the cloud copy; unstamped vs stamped (`0`) loses; stamp `Date.now()+3*86400000` is clamped so a real edit made now beats it after 1 s; tombstone newer than record removes it; record edited after tombstone survives; tombstone for an id absent locally causes no throw and no phantom record; `pruneTombstones` drops a 31-day-old entry and caps at 200 keeping newest; `nextStamp()` called twice in the same millisecond returns strictly increasing values; after `observeStamp(Date.now()+1000)` the next `nextStamp()` is greater.
- [ ] **Step 2:** Run `node tests/verify_sync_merge.mjs`. Expected: FAIL (functions undefined).
- [ ] **Step 3:** Implement the helpers above in the new `app.js` block. `mergeRecords` is a single pass over a `Map` keyed by `keyOf`, no storage or DOM access.
- [ ] **Step 4:** Run `node tests/verify_sync_merge.mjs`, then `npm test`. Expected: all PASS.
- [ ] **Step 5:** Commit `chore: add the building blocks for safer syncing (not used yet)`; PR; merge on green.

### Task 3: Stamp and tombstone at the save chokepoints

**Files:**
- Modify: `app.js` — `sanitizeTask` (`app.js:3558`, keep `updatedAt` only when finite), `saveCustomTasks` (`app.js:5716`), `saveCustomLinks` (`app.js:4076`), and the direct `safeSetStorage(KEY_CUSTOM_TASKS, …)` / `KEY_CUSTOM_LINKS` writers at `app.js:9700, 12008-12009, 12104-12107, 13457, 16775, 16840, 17526, 3089, 3174, 4380`.
- Test: `tests/verify_sync_merge.mjs` (extend).

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces:
  - `stampChanges(prev: Rec[], next: Rec[], keyOf): Rec[]` returns `next` where each new or content-changed record gets `updatedAt = nextStamp()` and unchanged ones keep theirs; ids present in `prev` and absent in `next` are appended to `cos_tombstones` (via `mergeTombstones` + `pruneTombstones`).
  - `taskKey(t) => t.id`; `vaultKey(section, res) => ${section.code||section.subject}|${res.fileId||res.url}|${res.label}` (vault resources have no id today; a label edit is treated as delete plus add, acceptable and documented in `ARCHITECTURE.md`).
  - Vault records are stamped on the resource object; `mergeCloudLinks` keeps working on stamped objects.

- [ ] **Step 1:** Failing tests: editing a task title stamps only that task; deleting a task writes one tombstone; bulk delete (`app.js:13446`) writes one tombstone per id in one pass; restore of an old backup stamps the restored records at restore time (so older cloud copies cannot beat them); a vault resource edit stamps just that resource; an older-version payload with no `updatedAt` loads without error.
- [ ] **Step 2:** Run them; expected FAIL.
- [ ] **Step 3:** Implement `stampChanges`; call it in `saveCustomTasks`/`saveCustomLinks` and at each listed direct writer by loading the previous list first. Writers that apply cloud data (`app.js:3768-3780`) must NOT stamp.
- [ ] **Step 4:** Add `tombstones` to `buildBackup`-style export (find with `grep -n "customTasks" app.js` near `downloadBackupFile`) and read it in `importData`; old backups without it must restore as before. Run `npm test`.
- [ ] **Step 5:** Commit `chore: remember when a task or vault item was last changed and what was deleted`; PR; merge on green.

### Task 4: Wire merge into apply/push, hash fix, push guards

**Files:**
- Modify: `app.js` — `applyCloudDataToLocalState` (`app.js:3737-3781`), `pushLocalDataToCloud` (`app.js:3858`), `calculatePayloadHash` (`app.js:3627`), `subscribeUserCloudData` seed hash (`app.js:3676`), `onCloudPushError` (`app.js:432`).
- Test: new `tests/verify_sync_two_devices.mjs` (fake Firestore, two client instances) plus extend `verify_sync_consistency.mjs` expectations only where the hash gains fields (never weaken an assertion).

**Interfaces:**
- Consumes: `mergeRecords`, `mergeTombstones`, `stampChanges`.
- Produces: `pushGuard(payload: object): { ok: boolean, bytes: number, level: 'ok'|'warn'|'full' }` (UTF-8 byte size via `new Blob([JSON.stringify(payload)]).size`; 700 000 warn, 900 000 full); `nextPushDelay(failCount: number): number | null` returning 5000, 30000, 120000, then `null`.

- [ ] **Step 1:** Failing tests in `verify_sync_two_devices.mjs`: A and B each edit a different task offline, both sync, both edits survive on both devices; same task edited on both, the later stamp wins on both; A deletes task, B (not editing it) syncs, task stays deleted; B edits the task after A deleted it, task comes back; a snapshot with `hasPendingWrites` does not overwrite an unsynced local edit; a merge whose result equals the cloud triggers zero writes; payload of 950 KB skips `set` and records a "full" state; `nextPushDelay` sequence above; the hash changes when only a vault resource changes.
- [ ] **Step 2:** Run them; expected FAIL.
- [ ] **Step 3:** In `applyCloudDataToLocalState`, replace the `customTasks` and `customLinks` assignments with `mergeRecords` (vault keeps placeholder logic from `mergeCloudLinks` inside the keyed merge); take `data.tombstones` into the local set; call `observeStamp` for every incoming stamp; schedule one push only when `changed` and the merged hash differs from the cloud hash. Save the pre-merge lists to `cos_sync_prev` before applying when `removedLocal` is non-empty.
- [ ] **Step 4:** In `pushLocalDataToCloud`, add `tombstones` to the payload, call `pushGuard`, skip when the hash equals the last pushed hash, and retry per `nextPushDelay` after `onCloudPushError` (reset the count on success or on `online`). Add `customLinks`, task stamps and tombstones to `calculatePayloadHash`.
- [ ] **Step 5:** Run `npm test` and `npm run test:pwa-smoke`. Expected PASS.
- [ ] **Step 6:** Commit `Your tasks and vault no longer overwrite each other when you use two devices`; PR; merge on green.

### Task 5: First sign-in review, backup and Undo

**Files:**
- Modify: `app.js` — sign-in path around `app.js:285` and `app.js:4479` (`subscribeUserCloudData` callers), new modal using the existing modal helpers (find the declutter review `showDeclutterDeskModal` for the pattern), `index.html` modal template if that pattern uses one.
- Modify: `style.css` only if the shared modal classes are not enough.
- Test: `tests/verify_signin_merge.mjs`; extend `tests/mobile-layout.spec.ts` or `tests/clarity-visual-verification.spec.ts` for the modal.

**Interfaces:**
- Consumes: `mergeRecords`, probe result from Task 1 (Gap confirmed: yes. A cloud doc replaces local tasks on first sign-in; the local task is lost and nothing is pushed).
- Produces: `needsSigninReview(uid: string, localHasData: boolean, cloudHasData: boolean): boolean` (true only if both have data and `cos_signin_seen` does not list `uid`); `applySigninChoice(choice: 'both'|'cloud'|'device', cloudData: object): void`; `undoSignin(): boolean` restoring `cos_signin_backup`.

- [ ] **Step 1:** Failing tests: one side empty returns false and nothing is shown; both have data returns true and nothing is written until a choice; `cos_signin_backup` exists before any write; `'both'` equals `mergeRecords` result; `undoSignin()` restores the exact prior tasks and links; second sign-in with the same uid never asks again.
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement the modal ("Keep both" default, "Use cloud copy", "Use this device", plain student wording) and an Undo toast; hold the first cloud apply until the choice is made.
- [ ] **Step 4:** Run `npm test`, then `npm run test:visual` (modal screenshot; refresh Linux screenshots with the "Refresh Linux screenshots" workflow).
- [ ] **Step 5:** Commit `Signing in on a phone that already has data now asks before mixing it with your account`; PR; merge on green.

### Task 6: Sync status, reconnect push, messages

**Files:**
- Modify: `app.js` — `updateSyncUI` (`app.js:446`), `online` handler (`app.js:17708`), `onCloudPushError` messages.
- Test: `tests/verify_sync_failure.mjs` (extend), `tests/offline-sync.spec.ts` (extend).

**Interfaces:**
- Consumes: `pushGuard` level, `cloudPushFailed`.
- Produces: `hasPendingSync(): boolean` (true when `cos_sync_last_pushed` hash differs from the current payload hash); `updateSyncUI` states "Saved here" (signed out), "Waiting to sync" (pending), "Synced · time" (clean), plus the existing offline/failed/denied states.

- [ ] **Step 1:** Failing tests: pending change while offline shows "Waiting to sync"; the `online` event triggers one push when `hasPendingSync()`; no push when clean; `pushGuard` `'warn'` shows the "getting full" toast once; `'full'` shows "safe on this device" and no `set`.
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement; reuse the existing badge elements (`sync-icon`, `sync-text`), no new markup.
- [ ] **Step 4:** Run `npm test`, `npm run test:pwa-smoke`, `npm run test:visual`.
- [ ] **Step 5:** Commit `The sync badge now says when changes are waiting and sends them as soon as you're back online`; PR; merge on green.

### Task 7: Docs and release check

**Files:**
- Modify: `docs/ARCHITECTURE.md` (storage keys, sync flow, vault key note), `docs/AUDIT.md` (#1 and #6 marked fixed with the PR links).

- [ ] **Step 1:** Update both docs; keep `ARCHITECTURE.md` wording style.
- [ ] **Step 2:** Run `npm run release:check`. Expected: pass.
- [ ] **Step 3:** Commit `chore: update the sync notes`; PR; merge on green. Then wait for the user to say "ship" (`npm run ship:check` first).
