# Board and Sheet review (2026-11-12)

Review of the "Board and Sheet" board (https://claude.ai/artifact/LZ8MRBXoLgP3iX2BtnxzUF) and its refinement brief against the real app. Decision: **keep the idea, turn the volume down.** Built in slices; this file is updated as each slice lands.

## The rule
- **Board** = top bar, sidebar, phone dock. The palette's own deep colour. It tells you which app and which palette you are in, and nothing else.
- **Sheet** = the page. The brightest, plainest surface. All reading happens here.
- **Signal** = the palette's one loud colour. It means "now" and nothing else: the class that is on, the now line, today's date. Never a large fill, never a hover, focus or selected state.
- **Where you are** in the nav is chalk (the board's own ink): a quiet fill and a small bar, plus `aria-current="page"`.
- Red = late and green = done stay the same in every palette. A state is always said in words or shape as well as colour.

## Kept
| Idea | Why |
|---|---|
| Board frame around a bright sheet | Gives the app an identity without colouring the reading surface |
| Signal colour for "now" | One meaning, easy to learn |
| Register rail on Today, Due below | Already the right model (#319-#325) |
| Four palettes, same rules | Meaning never moves when the palette changes |
| Existing palette names and stored values (`cos_theme`, `cos_accent`) | No migration; a saved palette keeps working |

## Changed
| Board showed | Now | Why |
|---|---|---|
| Active sidebar item as a full yellow block | Quiet chalk fill, chalk text, 3px signal bar | The nav must not compete with the live class |
| Live class as a large yellow block | Stays a signal edge plus the words "In class"; calmer treatment refined in the Today slice | One focal point per viewport |
| New palette set (Indigo, Plum, Graphite) | Boards derived from the four existing palettes: Register green, Ai & Kaki navy, Tetsu lamp teal, Azuki & Matcha azuki | Related, not four posters; nothing to rename or migrate |
| Dark mode as dark sheet + same board | Board sits one step *below* the sheet, near-black with a trace of the palette | Keeps the board/sheet order without a bright frame at night |
| Browser bar colour = page colour | Follows the board in a browser tab | The browser's own bar continues the top bar. Installed app stays pinned to `#101613` (manifest background) |

## Rejected
| Idea | Why |
|---|---|
| Restyling every `.topbar` / `.sidebar` / `.nav-item` rule | Many layered rules; instead the tokens those rules read are re-pointed inside the board elements, in one section at the end of `style.css` |
| Signal-coloured buttons on the sheet | Buttons keep the palette's action colour; signal is not an action colour |
| Renaming palettes to match the board's names | Storage and Settings labels stay as they are |
| Board behind the Welcome screen | First run is one calm sheet; the board appears with the app |

## Slices
1. **Frame and tokens** (this PR): `--board*` tokens per palette and mode, brighter light sheet, rounded sheet corner, active nav treatment, browser-tab colour. CSS plus one line in `applyThemeColorMeta`. No storage, routes, data flow or behaviour touched.
2. **Today**: CSS only, one section at the end of `style.css`. The class that is on now is the one tinted row on the page: a soft wash of the palette's signal, the signal edge, its name in the display face, and the words "In class". Between classes the next one takes that place, so there is never more than one. Marked classes step back to lighter weight and still say "Marked present/absent" with Change; an ended class that is not marked keeps full weight. Each palette now has its own "now" colour (Register marigold, Ai & Kaki kaki, Tetsu lamp, Azuki & Matcha matcha) in light and dark; Timetable's now line reads the same tokens. Attendance is left as it was: the panel once, plus the one-line warning only when at risk. No attendance maths, markup or storage touched.
3. **Timetable**: CSS only, one section at the end of `style.css`. The week strip reads like a calendar: today's date sits in a small disc of the "now" colour, and the day you are viewing keeps its underline, so "today" and "selected" are two different marks. The class on now gets the same faint wash as on Today. An unmarked Present is a plain outline (it was green, which looked already marked); a marked class shows one filled ink button, readable in every palette (on phones it was white text on pale green). At 320px the mark buttons start at the row edge so the edit button is no longer cut off. Rejected: restyling the Manage menu or the subtitle, and a week grid (the day list is what students mark from). No markup, parsing, attendance or storage touched.
4. **Tasks**: CSS only, one section at the end of `style.css`. Red is the only colour on this page, and it means late. The headline is all ink (the late half used to take the palette's action colour, which read as a second alarm beside the red rows). An unticked box is a plain ink outline, bigger on the rows to do first, so size says "start here" and colour does not. Today in the two-week strip uses the same "now" colour as Today and Timetable. Rejected: restyling the strip chips, highlighting a "first" row with a fill, and changing the headline wording or shortening in `app.js`. No markup, task actions, Undo or storage touched.
5. **Welcome**: audited, one CSS rule. The screen was already on the system: one sheet, one field, one filled button, an example that says "not saved", and all seven ways in. The only change: "Add it when you're ready" is now bold ink instead of the palette's action colour, so the Add button is the one coloured thing on first run and, in Tetsu lamp, a red-brown link no longer sits near the meaning of "late". Rejected: the board behind Welcome, any new step or question, and reflowing the two capture links at 320px (they stack; the page scrolls). No markup, copy, first-run flow or storage touched.
6. **Now is not "where you are"** (second brief, 2026-11-13): the bar beside the active nav item and the bar over the active dock tab were the signal colour, the same mark as the live class. They are now chalk, so the signal colour appears only for "now". The live class row carries `aria-current="time"` on Today and Timetable, and the active nav item carries `aria-current="page"`, so both are announced, not only coloured. Audited and left alone: the wash is not used for hover, focus or selection anywhere; Timetable already separates today (disc), viewed day (underline) and current time ("Now" and the edge); Tasks already folds work more than 14 days late into Older and adds in document flow; Welcome already has one action and an optional timetable. No storage, routes, attendance maths or actions touched.
7. **Finish fixes, JS** (2026-11-13): while Welcome is open the app behind it (skip link, top bar and pages, dock, Add button, More sheet, Ask Desk) is `inert`, so Tab stays on the sheet; it is released when Welcome closes (`dismissOnboarding`). The photo and sample-day steps are separate and unchanged. The hidden "New due date for…" inputs on late tasks have `tabindex="-1"` (4 Tab stops fewer per task); "Pick a day" still opens them. New test `tests/welcome-inert.spec.ts`. No storage, first-run flow or copy touched.
8. Adjacent screens only where consistency improves.

## Known limits
- The phone More sheet and the Ask Desk panel sit on the sheet scale, not the board.
- Visual snapshots change on every screen (frame colour); Linux snapshots are refreshed by the workflow.
- The small dot in the sidebar footer still shows the palette's signal colour. It is a palette swatch that opens Settings, not a state, so it was left.
- Azuki & Matcha's "now" is an olive green. It differs from the done green by hue, and both states are always said in words ("In class", "Marked present").
