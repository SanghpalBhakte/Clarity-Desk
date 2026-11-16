# New-Semester Reel, Phase 2: Screen Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce clean, honest captures of the real app for shots 3-7 of the reel, the sample data behind them, the chosen theme, and the v4 record.

**Architecture:** A small capture project in a sibling folder drives the local app (`node tests/serve.mjs`) with Playwright at a phone viewport, seeds invented sample data through `localStorage`, and saves numbered stills per shot. A verify script checks every capture exists, has the right size and breaks no honesty rule. The PWA is not changed.

**Tech Stack:** Node 24, Playwright (reused from the PWA repo's `node_modules`, no install), the PWA's own `tests/serve.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-14-new-semester-reel-design.md`

## Global Constraints

- Reel folder: `~/Projects/clarity-desk-reel/` (own local `git init`, no remote). Nothing is written into the PWA repo by this phase.
- No app change. No new dependency. No paid tool. FFmpeg is not installed and is not needed in this phase.
- Screens are captured from the real app with sample data. Nothing is redrawn, and no response is mocked.
- Sample data uses invented subject names, rooms and teachers. Nothing from `attendance-practice-kit/`, `scanner-practice-kit/` or `data.js`.
- Shot 5 sample data uses Present and Absent marks only. The line is set to 80. The result line is whatever the app prints; it is never typed in by hand.
- Shot 3 shows the review step. Shot 7 is captured with the network really off.
- Stills: viewport 390x844, `deviceScaleFactor: 3`, so each PNG is 1170x2532. `reducedMotion: 'reduce'`.
- Times stay in the app's 12-hour AM/PM format (do not change locale or format).
- Local preview only: `http://127.0.0.1:4173` from `node tests/serve.mjs`. Kill any old server on port 4173 first.

## Review Focus

1. A stale server on 4173 serves old files: captures show the old look. Expect the harness to refuse to run unless the served `app.js` matches the repo's `app.js`.
2. The first-run welcome, install sheet, FAB hint or a toast covers the screen. Expect every still to be free of overlays that the shot does not call for.
3. The scan reads the sample timetable wrongly. Expect the review screen to be captured as the app shows it, with fixes made by hand in the review, never by editing the response.
4. The fixed clock makes Today show "no class now". Expect shot 4 to show a class in progress and a next class.
5. Offline capture silently stays online (service worker not ready, or `setOffline` set too late). Expect proof in the manifest that a network request failed while Today rendered.

---

## File Structure

```
~/Projects/clarity-desk-reel/
  README.md              what this folder is, how to re-run
  capture/
    lib.mjs              Playwright harness: open the app seeded, save stills
    sample-data.mjs      the invented semester (one source for every shot)
    theme.mjs            Task 2: Today in each theme
    shot3-scan.mjs       one script per shot
    shot4-today.mjs
    shot5-attendance.mjs
    shot6-tasks.mjs
    shot7-offline.mjs
    v4-frames.mjs        Task 7: frames from the old reel
    verify.mjs           checks every capture
    assets/timetable.html   the sample timetable "photo" source
  captures/
    theme/  shot3/  shot4/  shot5/  shot6/  shot7/  v4/
    CAPTURES.md          manifest: file, shot, what it shows, app text on screen
  V4-NOTES.md
```

Still names: `captures/shotN/NN-<state>.png`, numbered in the order they appear in the shot.

---

### Task 1: Reel folder, sample data and harness

**Files:**
- Create: `~/Projects/clarity-desk-reel/README.md`, `capture/lib.mjs`, `capture/sample-data.mjs`, `capture/verify.mjs`, `.gitignore` (ignore nothing yet)

**Interfaces:**
- Produces, from `capture/sample-data.mjs`:
  - `AT = '2026-11-19T10:20:00'` (a Thursday, mid-morning; one constant, so a later date change is one edit)
  - `PROFILE = { name: 'Riya' }`
  - `WEEK`: `cos_custom_timetable` shape `{0..6: [cls]}`, `cls = { subject, code, time, end, type, room, teacher, batches: [] }`. Thursday has four classes, one running at 10:20 and one next. Subjects: Data Structures (DS), Probability and Statistics (PBST), Database Systems (DBS), Database Systems Lab (DBL, 2:00-4:00 PM lab). Rooms like `B-204`; teachers invented (`Prof. Meera Kulkarni`, `Dr. Arjun Sen`, `Prof. Nisha Rao`).
  - `TASKS`: five `cos_custom_tasks` items due 2026-11-19 to 2026-11-25, shape as in `tests/helpers/today-busy-seed.ts`.
  - `BASELINE`: `cos_attendance_baseline` for the four subjects, `present`/`absent` only, `leave: 0`, `notEntered: 0`; DS is `present: 26, absent: 4`.
  - `SEED = { cos_profile, cos_custom_timetable, cos_custom_tasks, cos_attendance_baseline, cos_notified_history: { onb_tt_day: '2026-11-15' } }`
  - `FORBIDDEN`: array of strings that must never appear on screen (teacher names and rooms found in the PWA's `data.js`, built at run time by reading that file).
- Produces, from `capture/lib.mjs`:
  - `PWA = '/Users/bhakt/Projects/Clarity Desk'`, `BASE = 'http://127.0.0.1:4173'`
  - `openDesk({ theme = null, at = AT, seed = SEED, offline = false }) -> { browser, context, page }`. Imports Playwright with `createRequire(PWA + '/package.json')('@playwright/test')`. Viewport and scale from Global Constraints, `colorScheme: 'light'`. `page.clock.setFixedTime(new Date(at))`. Init script sets `cos_onboarding_dismissed='true'`, `cos_onboarding_done='1'`, `fabHintDismissed='1'`, `cos_theme` when given, then each seed key as JSON, once per session (`sessionStorage.__seeded`, as in `tests/helpers/today-busy-seed.ts`). Goes to `BASE`, waits for `window.navigate`.
  - `assertFreshServer()`: fetches `BASE/app.js` and throws unless its bytes equal `PWA/app.js`. `openDesk` calls it first.
  - `still(page, shot, name) -> path`: asserts no visible `.modal-backdrop`, toast or install sheet unless `{ allowOverlay: true }`, then saves `captures/<shot>/<name>.png` and appends a row to `captures/CAPTURES.md` with the visible text of `#main` trimmed to 200 characters.
- Produces, from `capture/verify.mjs`: `node capture/verify.mjs [shot]` exits 0 only if every expected file exists, is 1170x2532, and its manifest text contains no `FORBIDDEN` string.

- [ ] **Step 1: Ask for write access to `~/Projects/clarity-desk-reel/`** (outside the sandbox allowlist), then create the folder and `git init`.
- [ ] **Step 2: Write `verify.mjs` with the expected-file list for all shots**, read from one `EXPECTED` map (`theme: 2, shot3: 4, shot4: 2, shot5: 4, shot6: 2, shot7: 3` files).
- [ ] **Step 3: Run it.** `node capture/verify.mjs` → FAIL, lists every missing file.
- [ ] **Step 4: Write `sample-data.mjs` and `lib.mjs`** to the interfaces above.
- [ ] **Step 5: Smoke run.** Kill port 4173, start `node tests/serve.mjs` from the PWA folder, then a one-off `openDesk()` + `still(page, 'theme', '00-smoke')`. Expected: a 1170x2532 PNG of Today showing Riya's Thursday with a class in progress. Read the PNG and look at it. Delete the smoke file.
- [ ] **Step 6: Stale-server check.** Temporarily point `assertFreshServer` at a wrong path; expected: `openDesk` throws "server is not serving this repo's app.js". Restore.
- [ ] **Step 7: Commit** in the reel folder: `chore: capture harness and sample semester`.

### Task 2: Theme stills and the owner's choice

**Files:**
- Create: `capture/theme.mjs`

**Interfaces:**
- Consumes: `openDesk`, `still`.
- Produces: `captures/theme/01-paper-slate.png`, `captures/theme/02-midnight-ink.png` (the two values of `ALL_THEMES` in `app.js`); a `THEME` constant exported from `sample-data.mjs` once chosen. Every later script passes `theme: THEME`.

- [ ] **Step 1: Capture Today in both themes.** Run `node capture/theme.mjs`; `node capture/verify.mjs theme` → PASS.
- [ ] **Step 2: Show both stills to the owner** with one recommendation and a one-line why. Stop until they choose.
- [ ] **Step 3: Write the choice into `THEME`** and commit: `chore: theme chosen for the reel`.

### Task 3: Shots 4 and 6 (Today, Tasks)

**Files:**
- Create: `capture/shot4-today.mjs`, `capture/shot6-tasks.mjs`

**Interfaces:**
- Consumes: `openDesk`, `still`, `THEME`.
- Produces: `shot4/01-today.png` (top of Today: class now and next, each with room and time), `shot4/02-today-next.png` (same screen one class later, clock at `2026-11-19T11:20:00`, for a motion beat); `shot6/01-tasks.png` (Tasks, nearest first), `shot6/02-tasks-top.png` (clipped to the first three rows with `page.screenshot({ clip })` at scale 3).

- [ ] **Step 1: Write both scripts.** Tasks is reached with the app's own `navigate('tasks')`.
- [ ] **Step 2: Assert before saving.** Shot 4: `#page-dashboard` contains a room from `WEEK` and a time matching `/\d{1,2}:\d{2} (AM|PM)/`. Shot 6: the first task row's title is the task with the earliest `dueDate` in `TASKS`.
- [ ] **Step 3: Run and verify.** `node capture/verify.mjs shot4 && node capture/verify.mjs shot6` → PASS. Look at each PNG.
- [ ] **Step 4: Commit:** `chore: capture Today and Tasks`.

### Task 4: Shot 5 (attendance line and result)

**Files:**
- Create: `capture/shot5-attendance.mjs`

**Interfaces:**
- Consumes: `openDesk`, `still`, `THEME`, `BASELINE`.
- Produces: `shot5/01-line-80.png` (Settings, `#s-att-target` showing 80), `shot5/02-before-mark.png` (the Data Structures class row before marking), `shot5/03-marked.png` (after marking Present through the app's own control), `shot5/04-result.png` (the app's result line, clipped around the row or toast); a `RESULT_LINE` string written into `CAPTURES.md`.

- [ ] **Step 1: Set the line through the UI.** Open Settings, fill `#s-att-target` with `80`, save with the app's own save control. Assert `localStorage.cos_att_target` is `80` afterwards.
- [ ] **Step 2: Mark one class Present through the UI** on the class row for Data Structures. Do not write attendance keys directly after the seed.
- [ ] **Step 3: Read the result from the DOM** and assert it matches `/^\d{2,3}% · can miss \d+$/` with the count at least 1. If the app prints a different form for this data (for example "attend the next N"), stop and change `BASELINE`, not the screen.
- [ ] **Step 4: Assert no Leave, OD or "not entered" text is on any of the four stills.**
- [ ] **Step 5: Run and verify.** `node capture/verify.mjs shot5` → PASS. Look at each PNG.
- [ ] **Step 6: Commit:** `chore: capture the attendance line and result`.

### Task 5: Shot 3 (timetable scan with review)

**Files:**
- Create: `capture/assets/timetable.html`, `capture/shot3-scan.mjs`

**Interfaces:**
- Consumes: `openDesk` with `seed` minus `cos_custom_timetable` (an empty desk, so the scan is the first timetable), `still`, `THEME`, `WEEK`.
- Produces: `shot3/00-timetable-photo.png` (the sample timetable, rendered from `timetable.html` at 1200x900: a plain printed-grid look built from `WEEK`, so the scan result can be compared with the source), `shot3/01-scan-entry.png` (the app's scan entry point), `shot3/02-review.png` (the review screen, `allowOverlay: true`), `shot3/03-saved-week.png` (the timetable after the app's own save).

- [ ] **Step 1: Render `00-timetable-photo.png`** from `timetable.html`.
- [ ] **Step 2: Drive the real scan.** Upload the PNG through the app's scan file input with `setInputFiles`. The scan sends the image to the app's AI proxy; nothing is mocked. If the proxy is unreachable from the sandbox, re-run with its host allowed; if it still fails, use the app's offline scan path and record which path was used in `CAPTURES.md`.
- [ ] **Step 3: Capture the review as shown.** Compare the review rows with `WEEK`. Wrong rows are fixed in the review inputs (the app's own `updatePreviewEntry` fields), and the number of hand fixes is recorded in `CAPTURES.md`. If more than three rows need fixing, simplify `timetable.html` and scan again, so the reel does not show a result better than the scan really gave.
- [ ] **Step 4: Save through the app's confirm control** and capture the saved week. Assert `localStorage.cos_custom_timetable` now has Thursday's four classes.
- [ ] **Step 5: Run and verify.** `node capture/verify.mjs shot3` → PASS. Look at each PNG.
- [ ] **Step 6: Commit:** `chore: capture the timetable scan and review`.

### Task 6: Shot 7 (offline)

**Files:**
- Create: `capture/shot7-offline.mjs`

**Interfaces:**
- Consumes: `openDesk`, `still`, `THEME`. Pattern: `tests/offline-sync.spec.ts`.
- Produces: `shot7/01-online.png` (Today, online), `shot7/02-offline-today.png` (Today after a reload with the network off), `shot7/03-offline-marked.png` (a class marked while offline); an `OFFLINE_PROOF` line in `CAPTURES.md`.

- [ ] **Step 1: Load online and wait for the service worker** (`navigator.serviceWorker.ready`), capture `01`.
- [ ] **Step 2: `context.setOffline(true)`, reload, capture `02`.** Assert Today shows the same class as `01`.
- [ ] **Step 3: Prove it is offline.** `fetch('https://claritydesk.web.app/manifest.json', { cache: 'no-store' })` in the page must reject; write the error text as `OFFLINE_PROOF`.
- [ ] **Step 4: Mark a class Present while offline, capture `03`, reload, and assert the mark is still there.**
- [ ] **Step 5: Run and verify.** `node capture/verify.mjs shot7` → PASS. Look at each PNG.
- [ ] **Step 6: Commit:** `chore: capture Today with the network off`.

### Task 7: The v4 record, manifest and final check

**Files:**
- Create: `capture/v4-frames.mjs`, `V4-NOTES.md`
- Modify: `captures/CAPTURES.md`, `README.md`

**Interfaces:**
- Consumes: `~/Downloads/clarity-desk-reel-v4.mp4` (read only).
- Produces: `captures/v4/frame-<seconds>.png` at 0, 1, 2, 3, 5, 8, 12, 16, 20, 25 s and the last second; `V4-NOTES.md` with five headed lines: hook line, first visual, product reveal, closing line, footage used, plus "Must not reuse" with the four items from the spec.

- [ ] **Step 1: Extract frames without FFmpeg.** Open the file in a `<video>` element in Playwright launched with `channel: 'chrome'` (installed Chrome plays H.264), seek to each time, screenshot. If Chrome is not installed or the file will not play, stop and ask the owner to state the five points; do not guess them.
- [ ] **Step 2: Write `V4-NOTES.md`** from the frames. Anything that can only be heard (a spoken hook) is marked "not verified, audio only" and asked of the owner.
- [ ] **Step 3: Compare with the spec's shot list.** If shot 1 or shot 8 repeats v4's hook, opening shot, wording or closing beat, list the clash at the top of `V4-NOTES.md` and raise it with the owner before phase 3.
- [ ] **Step 4: Full check.** `node capture/verify.mjs` → PASS for every shot. In the PWA folder, `git status` → clean (this phase wrote nothing there).
- [ ] **Step 5: Finish `README.md`** (how to re-run each script) and commit: `chore: v4 record and capture manifest`.
- [ ] **Step 6: Show the owner one contact sheet** of all stills (an HTML page in the reel folder) for approval. Phase 2 is done when they say every shot has a clean capture.

---

## Decisions and why

- **Stills, not screen video.** Playwright records video at 390x844, too soft for 1080 wide. Stills at 3x are sharp, and the movement between states (scan line, mark, Wi-Fi drop) is built in phase 3.
- **Playwright from the PWA's `node_modules`.** No second install, and the same browser build the tests use.
- **The scan is real.** A mocked response could show a review screen the app would never produce.
- **Clock at 2026-11-19 10:20.** A Thursday morning with a class running. The date shows on Today; change `AT` if the reel should show a date in the new semester.
