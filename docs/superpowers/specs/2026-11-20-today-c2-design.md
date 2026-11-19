# Today C2, shared look and tab bar: design

Status: draft for review (2026-11-20). Stage 3 of 4 (audit → mockup → **spec** → PR plan).
Replaces the visual and Today parts of `2026-11-19-today-glance-and-light-setup-design.md`. That spec's desktop overlap bug and its "visible holes" setup decision still stand.

- Working mockup (the target): https://claude.ai/artifact/EQT3sdLMRaecm4Qu6BX3Zx
- Audit: `2026-11-20-today-c-audit.md`
- Tetsu lamp colour options: https://claude.ai/artifact/JZAxXBiVmbihcmHy4bWEbs

## 1. Understanding

What the user said (2026-11-19 and 2026-11-20):
- Simple, uncongested screens. Calm and minimal, as in mockup C.
- Keep the labelled day strip. It must hold real timetables: no cut names and no hidden classes.
- Apple-like feel: swipes, hold, sheets, large title. Every gesture is tested before it ships.
- The real app must look as polished as the mock on a phone **and** on a laptop.
- Palettes stay subtle, and no two may look alike. Red and pink must never mean "free".
- Short subject names should be smart (Digital Electronics and Microprocessors → DEMP), and students can set their own.
- Scope: Today, the shared look and the tab bar. Onboarding, the other tabs, motion and graphics get their own specs later.

Assumptions (correct me if wrong):
- Lexend replaces Instrument Sans and Bricolage everywhere. It is self-hosted, never loaded from Google Fonts.
- Haptics run on Android only. iOS PWAs cannot vibrate, and the app does not pretend they can.

## 2. Success criteria

1. On a 390 px phone with a timetable of 8 periods, a split batch or a 5:30 PM class, no strip label is cut and no class is missing from the rows.
2. Every action reachable by swipe or hold is also reachable by one tap and by keyboard.
3. Each PR's phone (390×844) and laptop (1280×800) screenshots match the mock's layout, spacing and type. Any differences are listed in the PR.
4. Gesture tests (section 9) pass in CI, and the manual device checklist is done on an iPhone (installed PWA) and an Android phone before the slice merges.
5. Attendance numbers, backups and existing saved settings behave exactly as before.

## 3. Today, by time of day

One column on phone. Two columns on laptop (section 7). From top to bottom:

| Part | Rule |
|---|---|
| Large title | "Today" (after 9 PM, "Tomorrow"), with the date above it. Ask Desk is the only button. On scroll, the title tucks into a slim frosted bar |
| Smart line | One fact plus one suggestion, at most 2 lines at 390 px. It comes from the existing `chooseTodayBanner` priority, so risk, holiday and welcome-back still win |
| Strip | Section 4 |
| Attendance line | "Overall 84%, you can miss 12 more". Below 75% it says "below the 75% rule", and the smart line explains the risk |
| Now card | **In class only.** It is the only card on the screen: name, time, room, progress, subject ring, and Present / More. Swipe right marks Present, swipe left marks Absent |
| Your day / Rest of today | Class rows (section 5) |
| Due | Task rows, "+N more in Tasks", quick-add line |
| Study | One row of 3 shortcuts (existing Today hub logic). Hidden in class |
| Foot | Exam countdown line |

Mode differences:
- **Morning:** the next class row is bold, with "In 50 min" and "Can I skip this?" under it. The free gap shows as a row.
- **In class:** the now card replaces that class's row. Study is hidden.
- **Evening:** a "Mark all present" button (marigold-type accent) above the rows, which then list all of today's classes. Earlier rows do not fold away.
- **Night:** shows tomorrow's strip and rows, with the first class opened up. Due shows tomorrow's items and late ones (max 2), plus a "Mark today" link if today has unmarked classes.
- **Holiday:** one sentence and "End holiday early". No strip and no attendance.
- **Self-study / exam:** no strip. The exam countdown takes the smart line.
- **No classes today:** "No classes today." Due moves up.
- **New student:** dashed empty strip, then "Add timetable", "Add attendance so far", "Add a deadline" and "See an example day". No setup cards.

## 4. The strip

- The span runs from the first class start to the last class end. If the day is shorter than 6 h, it is padded to 6 h. Blocks are drawn to scale with a 2 px gap.
- Overlapping classes (batches not chosen) merge into one striped block labelled "2 labs". The rows list each one.
- Block states:
  - later: filled
  - ended: lighter fill with a 1.5 px outline; never see-through text
  - live: now-card colour
  - present / on duty and absent: keep the ended fill, with a green or red label and a 6 px dot. Status is never a block fill, so it can't be mistaken for a palette's Free colour. Inside the dark now card, the ring and tick use `#5fe0a1` / `#ff8a78`
  - didn't happen: hatched
  - next: 2 px ink ring
- Free gap: the longest gap of 1.5 h or more, in accent-soft, labelled "Free" if it fits.
- Now mark: an accent line with a dot. The line is broken where it crosses a block label.
- Tapping a block scrolls to its row and flashes it once. The strip is `aria-hidden`; the rows carry everything.
- Labels are 12 px, weight 600, with 3 px side padding.

### Label for a block (display only)

The block tries each candidate in order and uses the first that fits **whole** and is not already used by a different subject that day:

1. **The student's own strip name**, if they set one (section 4.1). If it doesn't fit, the block stays plain. No other candidate is tried.
2. The full subject name.
3. The short form from the timetable: the entry's `code` (e.g. "DBMS", "COA"). Course numbers such as "CS302" are skipped here and kept for step 5.
4. If there's no code: the known short form from the existing `CODE_MAP` in `getCanonicalSubjectCode` (DS, DEMP, PBST, COI, DBMS, OS, CN, …), with " Lab" added for a lab of that subject. If it isn't in the map, a short form is made from the name:
   - Drop a last word "Lab" / "Practical(s)" / "Tutorial" (it comes back as " Lab" / " Tut"), and a last roman numeral or digit.
   - Skip the words and, of, the, &, for, in, to, with, on.
   - One word left: keep that word (Library, Maths).
   - Several words left: take initials. Compound words starting with micro, thermo, bio, nano, geo, hydro or aero give two letters (Microprocessors → MP, so Digital Electronics and Microprocessors → DEMP).
   - Try in order: with suffix ("DS Lab"), without suffix ("DS"), and for a numbered subject the letter plus number ("Maths III" → "M3").
5. A course number.
6. Nothing: a plain block.

Never cut a word, never add "…". The same function feeds the smart line ("DS at 9:00 AM").

### 4.1 Setting your own strip name

The class sheet has a row "Name on the strip · DBMS". It shows where the name came from: "From your timetable", "Made from the name" or "Your choice". Tapping the row opens a field (max 10 characters) with Save. Clearing the field goes back to the automatic name.

Stored in a **new key `cos_strip_labels`**: `{ [canonical subject name]: "EVS" }`.
- Why a new key and not `code`: `code` is part of how attendance finds a subject (`(s.code || s.name) === subjectKey`, app.js ~12853). Editing it could split a subject's history.
- The new key is additive and needs no migration. It must be added to `exportData`, the import path and `SIGNIN_BACKUP_KEYS`. Old backups without it restore fine.

## 5. Rows

- **Class row:** time (12-hour AM/PM), name (full, wraps to 2 lines, never cut), optional sub-line (room, or "Batch B, Lab 4"), status in words ("In 50 min", "In class", "Not marked", "Present", "Same time").
  - Rows end at 6 per section, then "+N more today", using the existing `RAIL_MAX_ROWS` idea.
  - Marked earlier classes fold into "N earlier classes, marked" (except in the evening).
- **Task row:** tick (44 px target), name, subject, when ("Tomorrow", "2 days late" in red with an icon).
  - Up to 3 rows, then "+N more in Tasks", then the quick-add line (the existing `handleQuickAdd`).
- Rows are separated by hairlines, never boxed. The minimum row height is 54 px.

## 6. Gestures and sheets (the Apple feel)

| Where | Gesture | Result |
|---|---|---|
| Class row (ended or live, not marked) | Swipe right past 110 px, or flick | Present. Row slides off, then a toast with Undo |
| | Swipe left past 60 px | Holds open at −160 px with **Absent** and **More** |
| Task row | Swipe right | Done, with Undo |
| | Swipe left | Holds open at −80 px with **Move** |
| Now card | Swipe right / left | Present / Absent, with Undo. Underlay words show which |
| Any class row or the now card | Tap or **hold 450 ms** | Class sheet: ring, Mark this class (Present, Absent, Didn't happen, On duty (OD)), Clear mark, Name on the strip. For a later class it shows "Can I skip this?" instead |
| Task row | Tap the name, or hold | Move sheet: Tomorrow, This weekend, Pick a day, Mark done instead |
| Laptop | Right-click a row | Same sheet |

Feel rules:
- The row follows the finger 1:1, with resistance past the limit (×0.25).
- Release animation: 380 ms `cubic-bezier(.23,1,.32,1)`.
- Direction lock after 8 px: vertical scroll never moves a row.
- Only one row is open at a time; touching elsewhere closes it.
- Hold: the row "lifts" (scale .975, tint) for 160 ms, then the sheet opens. Moving more than 8 px cancels the hold.
- A hold never marks anything.
- `-webkit-touch-callout: none` and `touch-action: pan-y` on rows.
- Press feedback within 100–150 ms on every tap target.
- Sheet:
  - Phone: bottom sheet, radius 24, slide 380 ms, scrim, grab handle.
  - Laptop: a 420 px panel from the right.
  - Focus moves into the sheet, Esc closes it, and focus returns to where it was.
- Undo toast for every mark and every task change, 4 s.
- Haptic: 8 ms on mark or done, Android only, and off under Reduce Motion.
- Reduce Motion: no slides or lifts; changes are instant.
- Marks go through `setAttendance` / `markEndedPresent` only. Didn't happen and On duty use the existing #365 statuses (`cancelled`, `od_pending`), so `tallyAttendanceSessions` counts them exactly as today.
- Swipe underlay buttons are `tabindex=-1`. The keyboard and screen reader path is the row button → sheet.

## 7. Shared look

**Type.** Lexend 400/500/600/700, self-hosted woff2. Preloaded in `index.html` and `404.html`, and precached in `sw.js` (bump the cache version). Sizes:

| Use | Size |
|---|---|
| Large title | 34 (laptop 38) |
| Smart line | 20 (laptop 22) |
| Card title | 24 |
| Body / rows | 16 |
| Secondary | 13–15 |
| Strip | 12 |

**Shape.** Now card 22. Strip blocks 10. Sheets 24. Shortcuts 16. Buttons, tab bar and sidebar items are fully round.

**Tokens.** One new token layer, placed **last** in `style.css` and owned by this redesign. Old layers are retired in a later cleanup PR.

**Palettes.** These are the four existing `cos_accent` choices; the stored ids are unchanged. Each sets five things only: page tint, ink, now-card colour, accent and accent-soft. Green, red and amber stay fixed for present, absent and late in every palette.

| Palette | Page | Ink | Now card | Accent / soft | Dark: page, now, accent |
|---|---|---|---|---|---|
| Highlighter (`terracotta`, was Register) | `#f3f1ea` | `#1d2024` | charcoal `#25292f` | marigold `#e9a00c` / `#f7e4b8` | `#0d0e10`, `#1e2126`, `#f2b13a` |
| Old Campus (`rose`, default, was Azuki & Matcha) | `#eef0e4` | `#2e3428` | wine `#683238` | olive `#8a9645` / `#e4ebc8` | `#0e0f0c`, `#2a1d1f`, `#b5c46a` |
| Last Bench (`lavender`, was Ai & Kaki) | `#eaeef2` | `#1d3346` | navy `#223f5d` | persimmon `#d0794f` / `#f6dccd` | `#0b0e12`, `#18263a`, `#f29372` |
| Lo-fi (`apricot`, was Tetsu lamp) | `#e7edeb` | `#1d3433` | iron teal `#1c4a4e` | lamp lilac `#b3a5ee` / `#e6e1fa` | `#0a0f0f`, `#16363a`, `#c3b8f7` |

**Dark mode.**
- `cos_theme` gains the value `auto`, which follows `prefers-color-scheme`.
- New installs default to `auto`. A saved light or dark choice wins.
- The head bootstrap maps unknown values to `auto`.
- `theme-color` meta follows the bar colour of the active palette and mode (no more hard-coded `#17352a`).

**Phone header and tab bar.**
- The topbar is removed on phone. Its parts move: the clock goes; sync status, the theme switch and the avatar move into More (Profile and settings, Appearance, Sync).
- Floating tab bar: 64 px pill, inset 16 px, 24 px above the safe area, frosted.
- Tabs and order are unchanged: Today, Timetable, Subjects, Tasks, More. The active tab shows its label; the dot badge stays on Tasks.
- `data-nav`, `#bnav-more`, `.bnav-dot` and `aria-current` are kept.
- `--nav-h` is updated, so the FAB, More sheet, toasts and content padding move with it.

**Laptop.**
- Floating sidebar: 232 px, radius 24, inset 16. It keeps its sections, the `[` collapse key (`cd_sidebar_collapsed`) and the icon rail at 768–1023 px.
- Today content: two columns (1.15fr / 1fr, gap 64), capped at 980 px, left-aligned beside the sidebar.
- Sheets open as a right-side panel.

## 8. Polish rules (so the app matches the mock)

1. **Density.**
   - At most one card per screen (the now card).
   - Lists are rows with hairlines.
   - No new boxed sections on Today without a spec change.
   - At most 3 tasks and 6 classes before "+N more".
2. **Spacing.**
   - 22 px phone side gutter; 30 px between sections.
   - Row minimum 54 px; tap targets at least 44 px.
3. **One colour accent per palette.** Status colours are never used for decoration.
4. **Parity check on every UI PR.** Screenshot the real app (through `tests/serve.mjs`) at 390×844 and 1280×800 in the PR's states, next to the mock in the same state, and attach both. Any differences are listed and approved, not left unexplained.
5. **Device check before merge** for gesture slices, on an iPhone (installed PWA) and an Android phone in Chrome:
   - swipe right, swipe left then tap, flick
   - hold and release; hold then move (must cancel)
   - scroll a list fast (rows must not slide)
   - Undo
   - rotate
   - 200% text zoom
   - VoiceOver / TalkBack: row → sheet → mark

## 9. Tests

- **Unit (`npm test`):**
  - Label cascade: full / code / known / derived / course number / blank, no repeats, own name wins.
  - `derive`: DEMP, OOP, DS Lab, M3, Library.
  - `cos_strip_labels` included in export, import and sign-in.
  - Theme `auto` bootstrap and unknown values.
- **Gesture tests (Playwright, new `tests/today-gestures.spec`).** These are ported from the mock's script, which passes 17/17 against the mockup today:

  | Check | Expected |
  |---|---|
  | Swipe right | Present |
  | Undo | Not marked |
  | Short swipe left, then Absent | Absent |
  | Vertical drag | No slide |
  | Task swipe right | Done |
  | Task swipe left, then Move | Sheet opens |
  | Esc | Sheet closes |
  | Hold a class | Sheet opens, nothing marked |
  | Hold a task | Move sheet opens |
  | Tap a row | Sheet opens |
  | Edit the strip name | Block shows it |
  | Real touch swipe on the now card (CDP touch events) | Present |
  | Split day | "2 labs" and DEMP |
  | Busy day | No cut or repeated labels |

- **Visual:** refresh the dashboard and holiday snapshots on all 3 OSes (Linux via the workflow).
- **Accessibility:** run the axe check (#316) on Today.
- **PWA:** `npm run test:pwa-smoke`, because fonts and the service worker change.

## 10. Protected systems

| System | Change | Guard |
|---|---|---|
| Attendance | New input paths only (swipe, hold, sheet); the same functions are called | Gesture tests; tally unit tests unchanged |
| `cos_*` storage | New `cos_strip_labels`; `cos_theme` gains `auto` | Additive; backup round-trip test |
| Backup / restore | One new field | Old backup files import cleanly |
| Batch filter / timetable parsing | None. The strip reads `timetableForDisplay` | Split-day test |
| Navigation | New markup, same selectors | Existing nav tests |
| Service worker / offline | Fonts and cache version | pwa-smoke |
| 12-hour AM/PM | Unchanged | Existing format tests |

## 11. Build order (detail goes in the plan)

0. Desktop first-run overlap fix (`style.css` ~8621).
1. Token layer, Lexend, four palettes, `auto` theme.
2. Floating tab bar, phone large title, header items into More, laptop floating sidebar.
3. Strip, label cascade and rows, read-only (tap → sheet).
4. Gestures and sheets: swipe, hold, Undo, haptics. Device checklist is required.
5. Task tools: swipe Done / Move, Move sheet, quick add, "+N more".
6. Mode views: evening, night, holiday, self-study, no classes, new student.
7. "Name on the strip" (`cos_strip_labels`) and backup wiring.
8. Laptop two-column polish and a full parity pass.

Each is its own PR, with its own tests and screenshots.

## 12. Open

- None blocking. Palette names and lilac were chosen on 2026-11-20 (https://claude.ai/artifact/9U5rjGoCWoczzjyNyjuxLK).
- Label cascade note: a student who never typed a code and whose subject is not in `CODE_MAP` gets made-up initials (Environmental Studies → ES). The fix is to add common subjects to `CODE_MAP` (EVS, OOP, COA, M3 style) in plan Task 4. "Name on the strip" covers the rest.
