# Today, lighter and worth reopening: design

Status: draft for review (2026-11-14). Scope: the daily Today screen on every screen size, the installed-app shell, then a consistency sweep of the other screens. The Notices inbox and the new-student first run are out of scope.

## Understanding

Said by the user (2026-11-14):
- Today still feels dense after the calm-down slices (#343 to #345).
- The app should feel like a polished PWA with a good, non-generic UI: "different but not bad".
- It should look right and fit properly on phone, laptop and desktop, the way a well-made app looks at home on each device.
- Reduce density not only by removing things; make Today a screen students want to come back to.
- The app shell is good; look for room to improve. Check the other screens after the changes.
- Approved the design below ("yes go ahead and spec it").

Assumed (correct if wrong):
- The look stays Board and Sheet. This refines it; it is not a new direction.
- One Clarity Desk look, tuned per screen size and input type. No separate iOS and Android skins.
- No streaks, points or pressure. Everything new on Today is display only.

Success: a student on a busy day sees the whole day and what is due in about one screen, can still mark a class in one tap, and the screen visibly gets lighter as the day is dealt with.

## Audit (measured 2026-11-14, local build at v301)

Seed: 4 classes (one long combined lab name), 2 late tasks, 4 upcoming tasks, 11:20 AM on a Thursday.

| Screen | Height | Tap targets on first screen |
|---|---|---|
| Phone 390×844 | 1.76 screens | 18 |
| Phone, calm day (2 tasks, before class) | 1.34 screens | 15 |
| Laptop 1280×720 | 1.61 screens | 17 |
| Desktop 1440×900 | 1.29 screens | 28 |
| Tablet 820×1180 | 1.14 screens | 31 |

| Finding | Where | Cause |
|---|---|---|
| Class rows three lines tall | `.rail-marks` in `dayRailHTML` (`app.js:9371`, group built ~9397) | Present / Absent pills sit on a line of their own |
| Late task rows three lines tall | `.due-fix` in `renderDashboard` (`app.js` ~11943) | Done / Tomorrow / Pick a day row under each late task; Done repeats the checkbox |
| Due heading crowded | `.dash-why` (`app.js` ~11918) | "Why this order?" and "All tasks" share the heading line |
| Empty right column on wide screens | Today layout at 1024px and up | The side column holds only the attendance prompt; Your day and Due stack in one column |
| Sidebar takes about 29% of a portrait tablet | `.sidebar`, `html.sidebar-collapsed` (`style.css` ~6165) | Collapse exists but is only a saved choice (`cd_sidebar_collapsed`) |
| Splash and status bar may not match the page | `manifest.json` `theme_color` / `background_color` `#101613` | The phone page is light paper since #336; not yet confirmed on a real phone |
| Plain install prompt | `manifest.json` | No `screenshots` entry |

Not found wrong: the calm day reads well; the "Next" row with its countdown is the best part of the screen. The evening close already exists (`.rail-then`: "Day marked. Books down, feet up." and "Next class: … at …"). Safe-area insets are handled. Theme switching already uses a view transition with a reduced-motion guard (`app.js` ~8090).

## Design

### 1. Lighter rows (all sizes)

- **Marking a class.** Present / Absent move to the end of the row's status line as compact controls, so an unmarked class is two lines, the same height as any other class. Each control keeps a 44px tap area and its `aria-pressed` state. After a mark, the row still says the mark in words and "Change" still reveals the controls (`railShowMarks`). `setAttendance`, `markEndedPresent` and the Undo toast are unchanged.
- **Late tasks.** The checkbox is Done. The three-button row becomes one "Move" control on the row's meta line; it opens Tomorrow / Pick a day in place (same `resolveTask` calls, same Undo). The late label stays in red words on the row.
- **Due heading.** "Why this order?" leaves the heading and sits beside "+N more tasks" at the end of the list. The heading keeps "All tasks".
- **Unchanged:** every late or due-today task still shows (`pickDueRows`), times keep the 12-hour AM/PM format, the long-name shortening stays, the quick-add line stays in flow.

Targets (guardrails, same busy seed): phone 390px at most 1.3 screens and at most 12 tap targets on the first screen.

### 2. Reasons to come back (display only)

- **The day gets lighter.** Classes that are over and marked fold into one line at the top of the rail ("2 earlier classes · marked"), which opens them on tap. Ended and unmarked classes never fold. `RAIL_MAX_ROWS` logic is otherwise unchanged.
- **Progress in words.** The "Your day" heading carries a short count, for example "1 of 4 marked". No bar, no ring.
- **Evening close.** Already built; keep it. Only check it sits on the first screen once the earlier classes fold.
- **Completion moment.** Ticking a task or marking a class draws the tick and settles the row over about 200ms. With reduced motion the state changes with no animation. CSS only.

No storage, no new keys, no streak counts.

### 3. Fit per screen

- **Laptop and desktop (1024px and up).** Today becomes two columns: "Your day" on the left; "Due", the add line and the attendance prompt on the right. Target: the busy seed fits one screen at 1280×720.
- **Tablet portrait (768 to 1023px).** The sidebar starts as the icon rail when the student has made no choice (`cd_sidebar_collapsed` not set). A saved choice always wins. Nav behaviour and order are unchanged.
- **Phone.** Section 1 and 2 only. The frosted bars, tab bar and + button stay as they are.

### 4. App shell

- **Splash and status bar.** First confirm on a real phone (installed, light and dark). If the mismatch is real, add `theme-color` metas with `media` for light and dark, and set the manifest `background_color` to match the default palette's page. If it is not real, change nothing.
- **Install screenshots.** Add a phone and a wide `screenshots` entry to `manifest.json` so Android shows the richer install sheet. Images are captured from the real app.
- **Page changes.** In the installed app only (`display-mode: standalone`), page changes cross-fade briefly using the same view-transition approach and reduced-motion guard as the theme switch. No change in a browser tab.

Risk: `manifest.json` and the service worker are protected. The manifest changes are additive (no key renamed, `id`, `start_url` and `scope` untouched). New image files need adding to the precache list only if they must work offline; install screenshots do not. Run `npm run test:pwa-smoke`.

### 5. Other screens

After 1 to 4, capture Timetable, Subjects, Tasks, Vault, Briefing and Settings at 360, 390, 820, 1280 and 1440px. List only real mismatches with Today (row height, button weight, type scale, empty columns). Fixes are proposed as a separate list for approval, not built in this spec.

## Not doing

- No change to attendance sums, timetable parsing, `cos_*` shapes, backup or restore.
- No streaks, badges or points.
- No per-platform skins, no new fonts, no cards added.
- No hover-only controls: marking stays visible on every input type.

## Testing

- `tests/today-calm.spec.ts`: add the height and tap-target guardrails for the busy seed at 390px; keep every existing check.
- `tests/today-rail.spec.ts`: marking from the inline controls, "Change", folding of marked classes, unmarked classes never folded.
- `tests/today-hub.spec.ts` or a new block: "Move" opens Tomorrow / Pick a day and each calls `resolveTask` with Undo.
- A wide-screen check: at 1280×720 the busy seed does not scroll; at 820px with no saved choice the sidebar is the icon rail.
- `npm test` for every slice; `npm run test:visual` for 1 to 3 (refresh the Linux snapshots through the workflow); `npm run test:pwa-smoke` for 4; the axe check stays green.

## Slices

One PR each, in this order: (1) lighter rows, (2) come-back details, (3) wide and tablet layout, (4) app shell, (5) sweep report. `docs/ARCHITECTURE.md` "Today as a projection" is updated in the slice that changes what it describes.

## Open point

Folding the late-task buttons behind "Move" changes a choice made on purpose in #285. If the user prefers, the first late task keeps its choices open and only later ones fold.
