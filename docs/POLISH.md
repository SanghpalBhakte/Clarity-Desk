# Polish rules

What "finished" means for any screen a student sees. Approved on the #458 board
(https://claude.ai/artifact/QE4s9HHbu33cvVydbtCugw). Most rules are checked by tests;
the rest are checked by eye on the phone before a ship.

Boards and before/after pictures are shots of the real app with the messy desk
(`npm run ui:shots -- --desk messy`), not hand-drawn pages: a tidy mock hides what real data does.

## The rule for adding things

Anything new on Today must replace or fold something already there, or change the spec
(`docs/superpowers/specs/2026-11-20-today-c2-design.md`) first. Polish wears away one
"small addition" at a time.

## Type and space

- One font: Lexend, for every screen and every Theme.
- Five sizes on a phone: 34 title, 20 smart line, 16 rows, 14 second lines, 12 strip.
  A laptop adds 38 (title) and 22 (smart line).
- Spacing in steps of 4 and 8. Side gutter 20. Rows at least 58 tall, taps at least 44.
- Numbers line up: percentages and times sit in a fixed column with tabular figures.

## Less text (#454)

- At most 2 lines per row. Task titles may end in "…" on one line; the full title is in the sheet.
- One "see more" per section.
- A number or status word, not a sentence ("76% · can miss 3").
- No year on this year's dates. No course codes. Initials for subjects with no short name.
- Class names never wrap: the full name if it fits one line, else the short name.
- Large titles fit on one line.
- Late never piles up on Today: one line, "3 Late · oldest 104 days · Look through".

## Themes

- A Theme is its colours, its title weight and one "now" detail. Layout is the same in all four.
- Status colours (green, red, the Late icon) never change.
- The accent marks only "now". A free gap is a neutral hatched outline; red or pink never means free.
- Words: "Theme" and "Light / Dark / Auto" (GLOSSARY.md).

## Big screens

Filled with information, not wider rows: laptop two columns, PC three. Lines stay under about 70 characters.

## Checks

| Check | Where | Runs in |
|---|---|---|
| Clutter rules on the messy desk (`tests/messy-desk.mjs`) at 360, 393, 412, 1280, 1920, every Theme, Light and Dark at 393 and 1280 | `tests/polish.spec.ts` | `npm run test:visual` (CI) |
| No new raw hex colours or px font sizes outside tokens | `tests/verify_style_tokens.mjs` | `npm test` |
| Contrast and labels in every Theme | `tests/a11y.spec.ts` | `npm run test:a11y` (CI) |
| The app next to the approved board, same state, 5 screens at 393 and 1280 | `tests/board-side-by-side.mjs` (board copy in `docs/board/`) | `npm run board:compare` → `test-results/board-side-by-side/`; attach to UI PRs |
| Clutter rules against the live site | `tests/polish.spec.ts` with `SMOKE_BASE_URL` | `npm run test:smoke`: after `npm run ship`, and daily (`live-check.yml`) |
| Clutter rules on `main`, weekly | `tests/polish.spec.ts` | Sunday `weekly-checks.yml` |

`tests/polish.spec.ts` lists screens that are not calm yet in `PENDING`, each with its ticket.
Those tests are expected to fail; when a ticket makes one pass, the test fails until its
`PENDING` entry is removed. Never add an entry to make a new problem pass.

## By eye, before a ship

On a phone: Today in the morning, in class and in the evening. About 30 seconds. It catches
what tests can't: feel, font rendering, the notification icon.
