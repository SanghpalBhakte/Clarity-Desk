---
name: ui-council
description: Polish one Clarity Desk screen with a cheap hill-climbing loop - screenshot it, have ONE Claude reviewer judge it through four lenses against a brief, make the smallest fix, re-judge blind A/B on contact sheets, keep only what wins. Use when asked to "run the council", "hill-climb" or polish a screen's UI.
---

# UI Council (lean)

Treat one screen's design as something to measure and improve in small steps. Votes pick which version to show the user. They never replace the user's eye: nothing becomes a PR until the user has seen the before/after.

**Budget: about 30–40k tokens per round.** The first version cost about 400k per round. It ran 4 reviewer agents at about 100k each, each reading 14 PNGs one by one, and echoed an 8k script on every shot. The rules below exist to keep it cheap. Don't undo them.

## Inputs (ask once only if missing; otherwise use the defaults)
- **Screen**: `tasks`, `today` or `calendar` (add more in `SCREENS` in `scripts/ui-council/shoot.mjs`).
- **Brief**: one sentence in student terms. Default for Tasks: "a student sees what's due and overdue in 3 seconds, on phone and laptop, in both themes."
- **Rounds**: round 0, plus at most 2 A/B rounds. Stop early when no fix has 2+ votes.

## House rules every fix follows
Follow memories `no-generic-ui-styles`, `avoid-cards` and `student-first-offline`:
- **Polish, don't redesign.** Fixes are spacing, type, weight, colour, alignment, wording and tap areas. No new sections, layout swaps or features.
- A type-led Clarity Desk look: rules and space instead of card containers, no UI-kit patterns.
- Change only the screen's CSS in `style.css`, plus that screen's render code in `app.js`. Never touch `cos_*` data, the protected systems in CLAUDE.md, or 12-hour times.
- Both themes, phone and laptop, and reduced motion must still work.

## Setup (once)
1. Work in a worktree on a `claude/ui-council-<screen>` branch.
2. Start `PORT=4179 node tests/serve.mjs` in the background from the worktree. Check with `curl -sI` that `/scripts/ui-council/shoot.mjs` returns 200, which proves it serves this worktree.

## Each round
1. **Shoot**: `npm run ui:shots -- --screen <s> --out test-results/ui-council/r<N> --mcp`, then run the Playwright MCP tool `browser_run_code_unsafe` with `filename: test-results/ui-council/r<N>/mcp-job.js`. The job is a tiny loader, and its result lists only failures; clean views come back as one `ok` line. (If Chromium can start, as outside the sandbox, run the same command without `--mcp`.)
   - `contrast` (below WCAG AA) and `tapTargets` (below 24px) are measured fails and must be fixed. "under 44px" is advice only.
2. **Sheet**: `node scripts/ui-council/pair.mjs --a <kept dir> --b r<N> --out test-results/ui-council/r<N>-ab --mcp`, then run `sheet-job.js` the same way. This writes `sheet-1.png`…`sheet-K.png`: each view's A and B side by side, phone views two to a sheet, with the A/B side randomised. Views that are byte-identical are skipped. For round 0 there is no A/B: use `--a r0 --b r0`, or review the single shots on one sheet.
3. **Look once yourself**: read at most 2 sheets. Don't Read single PNGs. If something looks broken, measure it with a small `browser_run_code_unsafe` probe (`getBoundingClientRect`, `elementFromPoint`, computed styles) rather than taking more screenshots. Screenshot artifacts are not bugs.
4. **Review**: start ONE `general-purpose` Agent with `model: "sonnet"`. Prompt it with the brief, the house rules, the sheet paths, the failing checks (if any), and these instructions:
   - "Read all sheets in a single turn (parallel Reads), then reply. Make no other tool calls. Don't open `*.key.json`."
   - "Judge as four lenses:
     - Typographer: hierarchy, scale, weight, rhythm.
     - Student: 11 PM, tired, phone in one hand.
     - Accessibility: colour-only meaning, dark theme, reachability.
     - Jester: long names, empty state, overlaps, odd labels."
   - "Reply with JSON only: `{"<lens>": {"prefer": {"<view>": "A"|"B"|"same"}, "score": 1-10, "fixes": ["element: change (why)"]}}`, with at most 2 fixes per lens, each one CSS rule or one text edit."
   - In round 0, ask for `score` and `fixes` only.
5. **Unblind** with `<out>.key.json`. **Keep** the change if at least 3 of the 4 lenses prefer the new version on most changed views, the median score doesn't drop, and no new measured fail appears. Then commit it in plain words for students. Otherwise revert it with `git checkout -- <files>`.
6. **Pick next fixes**: a fix raised by 2 or more lenses (or across rounds), plus every measured fail. Batch up to 3 per round. Skip any fix that breaks a house rule.
7. **Log** one line per round in `test-results/ui-council/log.md`: scores, fixes tried, kept or reverted.

**Cheap shortcut:** when the remaining fixes are small and already agreed (2+ votes), apply them without another review. Re-shoot, look at the sheet yourself, and move to Finish.

## Finish
- Run `npm test` and `npm run test:visual` (`npm run test:*` runs outside the sandbox). Screenshot diffs are expected on a UI change. Report them, and don't refresh baselines until the user approves.
- Show the before/after: `pair.mjs --a r0 --b <final>` gives the sheets. Give the user the sheet paths and the key, plus the score/kept table from `log.md`.
- Only after the user approves: open the PR, refresh the Linux screenshots (memory `linux-visual-snapshots`), and follow the CLAUDE.md merge rules. Never ship.

## Optional outside reviewers
If `.env.council` has free Gemini/Groq/OpenRouter keys, run `npm run ui:outside-review -- --brief "<brief>" <sheet PNGs>`. Their fixes count as votes, but they never decide whether to keep a change. On an error (quota, 429), skip them.
