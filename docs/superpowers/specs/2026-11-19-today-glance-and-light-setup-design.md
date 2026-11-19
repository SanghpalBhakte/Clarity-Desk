# Today at a glance, and a lighter setup: design

Status: draft for review (2026-11-19). **The visual direction below is superseded; read `2026-11-19-handoff.md` first.** The audit, the desktop bug and the "visible holes" setup decision still stand. Scope: Today on every screen size, the new-student first run (welcome to a filled Today), and a short trust/polish list. Other screens are out of scope except where Today links into them.

## Understanding

Said by the user (2026-11-19):
- The UI feels bland and like a project, not a product students can trust.
- Today should be the dashboard: in about a minute a student knows everything that matters today. Detail lives in the tabs.
- Setup has too many steps for a new student.
- Spec it once, properly, so it can ship as a polished, marketable app.

Assumed (correct if wrong):
- The look stays Board and Sheet (palettes, type, Register default). This is about what Today shows and how setup flows, not a new visual language.
- No streaks, points or pressure. Everything new on Today is display only and stores nothing.
- Free tier only; no new dependencies.

How this differs from the 2026-11-14 "calm" and "lighter" specs: those removed noise from two lists. They did not add a summary, so Today still has nothing a student can read in one look: no attendance number, no exam distance, no week view. This spec adds that summary and keeps the lists short beneath it.

Success:
1. Busy day, phone 390x844: the first screen shows the glance row (next class, attendance, due, exam), the next class row and the top task, with no scrolling.
2. A new student goes from opening the app to a Today with their classes on it in 3 taps plus the timetable check, with no extra cards on later days.
3. No overlapping or unclickable controls at 320, 390, 768, 1280 and 1864px widths.

## Audit (local build, 2026-11-19)

Seed: 4 classes all ended and unmarked, 2 late tasks, 3 upcoming tasks, 10:55 PM Thursday; then an empty first-run state.

| Finding | Where | Effect |
|---|---|---|
| **Bug: first-run "Add it when you're ready →" cannot be clicked on wide desktop.** The Due panel's grid area sits on top of the setup line (`elementsFromPoint` returns the Due list's div above `.setup-first-btn`); "Have a timetable?" and "No tasks yet." draw over each other | `.desk-setup-guide.setup-first` vs `.panel-due` in the 1100px+ grid (`style.css`, Today desktop section) | A new desktop student cannot start timetable setup from Today |
| No summary anywhere on Today | `renderDashboard` (`app.js:11514`) | Attendance %, exam countdown and "how many due this week" need 3 tabs to find |
| Ended, unmarked classes take 3 lines each | `dayRailHTML` (`app.js:9422`) | At night the whole day column is Present/Absent pills; 4 classes fill the screen |
| Attendance setup ask lives in the Due column | setup step `att` | Looks like part of the task list; a fourth heading on a first screen |
| Setup is spread over days | welcome → timetable card → lab group card → name in greeting → attendance card next day (`showOnboardingModal` `app.js:11232`, `showAddTimetableChoice` `:11417`, `onbPickGroup` `:11456`) | Student keeps meeting new setup cards; never feels "done" |
| Welcome hides 5 more paths under "Set up more later" | `<details>` in the welcome | Choice overload behind a fold; the tour and name step add two more screens |

## Design

### 1. Today = header, glance row, two short lists

```
19  Evening, Riya.                         (date + greeting, as now)
    2 classes to mark · 2 late tasks.      (one status sentence, as now)

┌ Next class ─┐ ┌ Attendance ─┐ ┌ Due ────────┐ ┌ Exams ──────┐
│ DS · 9:00 AM│ │ 82%         │ │ 5 · 2 late  │ │ 18 days     │
│ tomorrow    │ │ can miss 3  │ │ this week   │ │ End-Sem     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

YOUR DAY                      DUE
(classes, one line each)      (top 3, as now)
```

Glance row (new, display only, `glanceRowHTML()`):
- Four tiles, same size, one number or name plus one short line. Each tile is a link to its tab: Next class → Timetable, Attendance → Review, Due → Tasks, Exams → Calendar.
- Sources, all existing: next class from the same `nextClass` / `lookAhead` that `dayRailHTML` gets; attendance from `getOverallAttendance()` and the target from `getAttendanceTarget()` (the "can miss N / attend next N" words from `attendanceStandingLine`); Due from the list `pickDueRows` already sorts; Exams from the countdown date and `getCountdownLabel()`.
- A tile with no data becomes its setup step in place: "Add timetable", "Add your counts", "Add a deadline", "Set exam date". One tap opens the existing flow. This replaces the setup cards (see section 2).
- Risk states stay in words, not colour alone: "71% · below 75%". Holiday mode hides Next class and Attendance tiles the way it hides them now.
- Phone: 2x2 grid. Tablet and desktop: one row of four across both columns.

Your day (changed):
- Ended, unmarked classes collapse into one row: "4 classes to mark · Mark all present · Choose". "Choose" opens the existing per-class marks (`railShowMarks`). Live and next class keep their own row. Reuses `markEndedPresent` and `setAttendance`; no new write path.
- Every class is one line on desktop, two at most on phones.

Due: unchanged (top 3, late first, "+N more"). The attendance setup ask leaves this column (it is now the Attendance tile).

Removed from Today: the setup card stack above the lists, the attendance ask panel, the "Next class: Tomorrow…" footer line (now the Next class tile).

### 2. Setup: no drip cards, holes are visible

Current path: welcome → timetable card → lab group card → name in greeting → attendance card the next day; plus tour and name screens behind "Set up more later".

Proposed:
- Welcome keeps its value-first field ("Add deadline") and the two alternates (paste, photo). "Set up more later" becomes one line: "Have a timetable? Add it" (photo or typing, the existing `showAddTimetableChoice`). The example day stays as a quiet link. Tour and the name step leave the welcome; the name is asked once, inline in the greeting, as now.
- After the welcome, Today asks nothing with cards. Missing data shows as glance tiles with a one-tap action. The student sees what is set up and what is not, and chooses.
- Lab group is asked inside the timetable review sheet (same choice, same `onbPickGroup` result) when the parsed timetable has batches, not as a later card.
- Attendance counts: Attendance tile says "Add your counts" until counts or marks exist. No dated "ask tomorrow" logic.
- Old `onb_*` keys in `cos_notified_history` are left in place and still read where they matter (nothing renamed, no shape change). A student who skipped a card is not asked again by a card; the tile still offers it.

### 3. Trust and polish (each its own small slice)

- Fix the desktop overlap bug first (it is broken for students now).
- One visual sweep of Today at 320/390/768/1280/1864 for overlaps and clipped text, with a `tests/today-glance.spec.ts` outcome check at each width.
- Settings: a visible "Your data" line: "Saved on this device · last backup N days ago · Back up now". Uses existing backup; display only.
- A short "About & privacy" row in Settings: what is stored, where, that nothing needs an account.

## Protected systems touched

| System | Touch | Risk |
|---|---|---|
| Attendance calculations | Read only (`getOverallAttendance`, standing line) | Low; tiles must show the same number Review shows |
| Onboarding / `cos_notified_history` `onb_*` | Cards stop rendering; keys kept | Existing tests (`onboarding-polish`, `first-visit`, `verify_onboarding_*`, `today-calm`, `today-lighter`, `today-hub`) assert the cards; they change with the design, not weakened |
| Navigation | Tiles link to existing pages | Low |
| Timetable parsing | Lab group question moves into the review sheet; parser untouched | Medium; group filter result must be identical |
| Storage schemas, backup, SW | None | None (cache bump at ship only) |

Visual snapshots for Today and first run will change; update them on Windows with `npm run test:visual:update` after review.

## Slices (one PR each)

1. Fix: first-run setup line overlapped by Due on wide desktop. (Urgent fix candidate.)
2. Glance row on Today (tiles with data only), with outcome tests.
3. Empty tiles become setup actions; remove the Today setup cards and the attendance ask panel.
4. Collapse ended, unmarked classes into one row.
5. Welcome trimmed; lab group inside timetable review.
6. Settings "Your data" and "About & privacy".
7. Width sweep and snapshot refresh.

`docs/ARCHITECTURE.md` is updated in slices 2, 3 and 5.

## Decided

Setup approach (section 2): "visible holes" (no guided steps; tiles invite setup), chosen by the user 2026-11-19 over a 3-screen guided setup.
