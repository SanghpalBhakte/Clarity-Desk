# Register artifact review (2026-11-12)

Review of the "Register" direction board (https://claude.ai/artifact/PQuEdNQ7jPMfTNETgyYcHy) against the real app, before any code. Decision: **selective rehabilitation** of Welcome, Today and Tasks; tokens and type app-wide.

## Strongest three decisions
1. **Today as a day rail.** Classes on one time column, the next class marked in place, a "now" marker moving through the day. It replaces a floating card plus an unrelated list with one mental model.
2. **One meaning per colour.** Marigold = now, red = late, board green = the action. Colour only reinforces; position and words carry the meaning.
3. **Older work separated from today's work.** The "N older tasks from <month>" line (already on Today since #317) also applies on Tasks, so backlog never leads either screen.

## Three highest risks
1. **The system becomes a formula.** Big date, small caps, ruled rows on every screen reads as a template. Mitigation: the rail is Today's signature only; Tasks keeps its own sections; Welcome keeps a looser, warmer layout; small-cap labels are used for Today's two sections only.
2. **Attendance precision.** The board's "last 20 classes" tick strip cannot be drawn honestly: the overall % (`getOverallAttendance`, v2 = `computeOverallErpPercent` over per-subject tallies) mixes portal baselines (counts only, no per-class history) with marks in `cos_attendance`. Rejected; see below.
3. **Font change churn and offline.** New fonts change every screenshot and must be cached for offline first use. Mitigation: self-host like the current fonts (`fonts/*.woff2`, `@font-face` in `index.html`, precached in `sw.js`), system fallbacks, slice 1 is tokens and type only.

## Adopt, adapt, reject

| Board idea | Decision | How |
|---|---|---|
| Paper / ink / board green / marigold / red | **Adopt** as new values of the two real base themes (`paper-slate`, `midnight-ink`); the 3 accent palettes stay | Layer-1 `--raw-*` values in `style.css`; new semantic token `--color-now` (+ `-wash`, `-ink`) |
| Bricolage Grotesque + Instrument Sans | **Adopt, self-hosted** | `fonts/` woff2 (Latin subset), `--font-display` / `--font-sans`, `sw.js` precache list |
| Day rail on Today | **Adopt** | Restructure the class card + `.schedule-ledger` into one rail; same data (`dayClasses`, `activeClass`, `nextClass`, `attendanceKeyFor`, `setAttendance`) |
| Big date masthead | **Adapt** | Smaller (about 40px, not 58) so the rail's first row stays in the first 375x812 screen; date + greeting + context line on one block |
| Small-cap section labels | **Adapt** | Today's "Your day" / "Due" only; other screens keep sentence-case headings |
| "One filled button per screen" | **Reject as a rule** | Keep one clear primary action; no rule overrides usability |
| No cards anywhere | **Adapt** | Default to rules and space; keep surfaces for the sheet, modals, the add bar and focused regions |
| 20-tick attendance strip | **Reject** | Keep the existing proportional bar (attended/skipped of `total`) + target notch, restyled, with its sentence as the text equivalent (`aria-hidden` stays on the bar) |
| "Mark all done" on the older-tasks line | **Adapt** | Move it inside the opened list ("Mark these N done"), so it is only offered after the student has seen the tasks; Undo stays |
| Two-week strip on phone Tasks | **Reject for phones** | Keep the existing laptop strip only; on a phone it would be decoration |
| Tasks floating add bar | **Adapt** | Keep it in flow at the end of the list on phones (no overlap by construction); test at 320 and 375 with the keyboard open |
| Laptop sidebar label "You" | **Reject** | Keep current groups (Desk / Study / Preferences) and labels; no relabel in this pass |
| Welcome audience line + ruled field + example row | **Adopt** | Example stays the existing non-persisted `onboardingComingUpHtml()` example (opens a sample-day sheet that saves nothing) |

## Data each screen reads (no new state)
- **Today masthead:** `todayStr()`, `getDisplayName()`, `getDynamicGreeting`, `buildDashboardContextLine` (classes left/first class, recent overdue, exam).
- **Today rail:** `loadTimetable()[day].filter(isTeachingClass)`, `currentTimeMinutes()`, `activeClass` / `nextClass`, `cos_attendance[date][attendanceKeyFor(c)]`, `setAttendance`, `standingForClass`, `findNextClassDay` (no classes), holiday state (`isHolidayActive`).
- **Today due:** `allTasks()` pending, `isTaskStale` (14 days), `formatRelativeDueDate`, `resolveTask`, `openTaskFromToday`.
- **Attendance:** `getOverallAttendance()`, `getAttendanceTarget()`, `calculateSmartAttendanceGuidance`, setup step `att`.
- **Tasks:** the existing Tasks render (`tkQuickAdd`, sections Late/Today/This week/Later/Ongoing), plus `isTaskStale` for the older-tasks line.
- **Welcome:** unchanged handlers (`onboardingAddDue`, `onboardingPasteMessage`, `onboardingTakePhoto`, `showAddTimetableChoice`, `setupSelfStudy`, `onboardingShowName`, `onboardingLogin`).

## Protected (untouched)
`cos_*` keys and shapes, attendance maths (v1 and v2), sync payload and hash, backup/restore, routes and hashes, `navigateTo`, service-worker update flow (only the precache list gains the font files), OCR/import flows, 12-hour times, theme choice stored in `cos_theme` / `cos_accent`.

## Fallback states to check (slices 2 and 3)
No timetable, self-study, holiday, no classes today, one class, eight classes, a class in progress, all classes ended (day bar), overlapping or missing end times, very long subject names, no tasks, only older tasks, offline, 320px, 200% text zoom.

## Slice 1 (first PR): tokens and type
- **Change:** new `--raw-*` values for `paper-slate` and `midnight-ink` (Register paper/ink/board green/marigold/red), `--color-now*` tokens, self-hosted Bricolage Grotesque + Instrument Sans (variable woff2, Latin, about 100 KB together) replacing Quicksand, Nunito and Comfortaa, which were removed. Fallback is the system sans stack with `font-display: swap`; no `size-adjust`, because the files are preloaded and precached, so the swap only happens on a first visit. Late and absent markers use the error red; the now markers use `--color-now`. No layout changes.
- **Who sees it:** everyone on the two base themes, including students who never chose a theme. The accent palettes (lavender, apricot, rose) keep working on top.
- **Acceptance:** `npm test`, `test:a11y` (light + dark, axe contrast), `test:pwa-smoke` (fonts precached, offline reload), `test:visual` with refreshed Mac and Linux snapshots reviewed at phone size, a manual check of Today, Tasks, Welcome, Timetable, Settings at 375 and 1280 in both themes, no console errors.

## Slice 2 (Today): kept, adapted, rejected after testing
Checked against the board at 320×812, 375×812, 188px wide (200% zoom) and a laptop, with real data states (`tests/today-rail.spec.ts`).
- **Kept:** the day rail on Today only; marigold for now, red only for late; the smaller date masthead; the real attendance bar and sentence (no invented history); "Mark these N done" only inside the opened older-task list, with one Undo; no subject filler ("General" is dropped).
- **Adapted:**
  - Present / Absent are 44px tall pills with `aria-pressed` and the mark in words on the row ("Marked present"), not a 32px chip with a tick.
  - The now line is hidden during a class, so it never competes with the "In class" row.
  - The rail shows at most 6 rows chosen by need, with "+N more classes".
  - The late-task fixes moved from a top card into the task's own Due row (option A).
  - The attendance sentence says when it rests on portal counts only or on marks over 3 weeks old.
- **Rejected:** a per-class attendance tick strip (no such history exists); a countdown shown only in colour; a separate "Now" card above the rail.
- **Still open (later):** the Tasks headline content rule (slice 3), the sidebar destinations, one shared definition across the four colour sets, and the app icon (needs a safe PWA icon change).
