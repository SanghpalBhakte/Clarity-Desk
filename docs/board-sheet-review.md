# Board and Sheet review (2026-11-12)

Review of the "Board and Sheet" board (https://claude.ai/artifact/LZ8MRBXoLgP3iX2BtnxzUF) and its refinement brief against the real app. Decision: **keep the idea, turn the volume down.** Built in slices; this file is updated as each slice lands.

## The rule
- **Board** = top bar, sidebar, phone dock. The palette's own deep colour. It tells you which app and which palette you are in, and nothing else.
- **Sheet** = the page. The brightest, plainest surface. All reading happens here.
- **Signal** = the palette's one loud colour. Budget per screen: the small bar beside the page you are on, and the class that is on now. Never a large fill.
- Red = late and green = done stay the same in every palette. A state is always said in words or shape as well as colour.

## Kept
| Idea | Why |
|---|---|
| Board frame around a bright sheet | Gives the app an identity without colouring the reading surface |
| Signal colour for "where you are" and "now" | One meaning, easy to learn |
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
2. Today. 3. Timetable. 4. Tasks. 5. Welcome. 6. Adjacent screens only where consistency improves.

## Known limits
- The phone More sheet and the Ask Desk panel sit on the sheet scale, not the board.
- Visual snapshots change on every screen (frame colour); Linux snapshots are refreshed by the workflow.
