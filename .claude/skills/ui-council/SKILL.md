---
name: ui-council
description: Polish one Clarity Desk screen with a hill-climbing loop - screenshot it, have a council of Claude reviewers (plus optional free Gemini/Groq/OpenRouter reviewers) judge it against a brief, make the smallest fix, re-judge blind A/B, keep only what wins. Use when asked to "run the council", "hill-climb" or polish a screen's UI.
---

# UI Council

Treat one screen's design as something to measure and improve in small steps. Scores and A/B votes pick which version to show the user. They never replace the user's eye: nothing becomes a PR until the user has seen the before/after.

## Inputs (ask once only if missing; otherwise use the defaults)
- **Screen**: `tasks`, `today` or `calendar` (add more in `SCREENS` in `scripts/ui-council/shoot.mjs`).
- **Brief**: one sentence in student terms. Default for Tasks: "a student sees what's due and overdue in 3 seconds, on phone and laptop, in both themes."
- **Target**: by default the Claude reviewers' median is ≥ 8, no reviewer is below 7, and `tapTargets` and `contrast` are empty.
- **Rounds**: at most 5. Stop early after 2 rounds in a row with no kept change.

## House rules every reviewer and every fix follows
Before the first round, read these memories: `no-generic-ui-styles`, `avoid-cards`, `student-first-offline` and `template-screens-redesign`. They mean:
- **Polish, don't redesign.** A screen that was drawn on an approved board keeps its structure: no new sections, no layout swaps, no new features. Fixes are spacing, type, weight, colour, alignment, wording and tap areas.
- A distinctive Clarity Desk look: type-led, rules and space instead of card containers, no UI-kit patterns.
- Reference products set the quality bar, not the look. Name 2–3 of them in the brief, and say which quality you mean, such as "Things 3's calm list rhythm".
- Change only the screen's CSS in `style.css`, plus that screen's render code in `app.js`. Never touch `cos_*` data, the protected systems in CLAUDE.md, or 12-hour times.
- Both themes (`paper-slate`, `midnight-ink`), phone and laptop, and reduced motion must all still work.

## Setup
1. Work in a worktree (`EnterWorktree`) on a `claude/ui-council-<screen>` branch. Other sessions may be using the main folder.
2. **Shots, path A** (Chromium can start): `npm run ui:shots -- --screen <screen> --out test-results/ui-council/r<N>`. It serves the local files on port 4179 itself and writes the PNGs and `checks.json`.
3. **Shots, path B** (inside the Claude Code Bash sandbox, where Chromium fails with a `MachPortRendezvous` / permission error). No user action is needed:
   - Run `PORT=4179 node tests/serve.mjs` once in the background, from the worktree. Check with `curl` that `/scripts/ui-council/shoot.mjs` returns 200, which proves it serves the worktree and not an old copy.
   - `npm run ui:shots -- --screen <screen> --out test-results/ui-council/r<N> --mcp` writes `mcp-job.js`.
   - Run it with the Playwright MCP tool `browser_run_code_unsafe` and `filename: test-results/ui-council/r<N>/mcp-job.js`. The tool only reads files inside the worktree, so the output must stay under `test-results/`, which is gitignored.
   - Save the returned JSON as `checks.json` in the same folder.
4. Read at least one PNG yourself before calling the council. Sample-data quirks must not reach reviewers: if a task shows a wrong code, fix the seed in `shoot.mjs`, not the app.
5. `checks.json` holds measured facts:
   - `contrast`: text below WCAG AA. `measured` and `skipped` prove the check really ran. Many skipped means it couldn't see the background.
   - `tapTargets`: below WCAG 2.5.8 (24 px, with the spacing exception). These must be fixed.
   - `tapComfort`: under 44 px. This is advice; it counts as one vote.

## The council (one round)
Start four fresh `general-purpose` Agents in one message. Each gets the brief, the house rules, the PNG paths to `Read`, and `checks.json`:

| Member | Lens |
|---|---|
| Typographer | hierarchy, type scale, weight, line length, rhythm |
| Student | "11 PM, tired, phone in one hand": what's due, what's late, what to tap |
| Accessibility | `checks.json`, colour-only meaning, focus order, reading on dark theme |
| Jester | breaks it: long names, empty state, crowding, odd labels, wrong times |

**Round 0** returns JSON only: `{"score": n, "fixes": ["element: change (why)"]}`. Ask for at most 3 fixes, each small enough for one CSS rule or one render-string edit.

**From round 1 on**, run `node scripts/ui-council/pair.mjs --a <kept dir> --b <new dir> --out test-results/ui-council/r<N>-ab`. Reviewers then see each view as `A-…png` and `B-…png` in random order, and return `{"prefer": "A"|"B"|"same", "score": n, "fixes": [...]}`, where the score is for the one they prefer. Unblind with the `key.json` that `pair.mjs` writes. A pairwise choice drifts less than an absolute score.

If `.env.council` has keys, also run `npm run ui:outside-review -- --brief "<brief>" <up to 4 PNGs>`. Outside reviewers are advisory: their fixes count as votes, but they never decide whether to keep a change. On an error (quota, 429), carry on Claude-only.

## Climb
1. **Pick fixes**: anything 2 or more members raise, plus every `tapTargets` or `contrast` entry. At most 3 per round. Skip anything that breaks a house rule, however many votes it gets.
2. **Make** the smallest CSS or markup change. Reuse the existing tokens (`--ds-*`, `--color-*`) and classes.
3. **Re-shoot and re-run the council** (blind A/B).
4. **Keep** the change only if at least 3 of 4 prefer the new one or call it "same" with a higher score, the median doesn't drop, and no new measured failures appear. Then commit it in plain words for students.
5. **Otherwise revert** it with `git checkout -- <files>`, and tell the next round what was tried and why it lost.
6. Log every round in `test-results/ui-council/log.md`: scores, fixes tried, kept or reverted.

## Finish
- Run `npm test` and `npm run test:visual` (`npm run test:*` runs outside the sandbox). Screenshot diffs are expected on a UI change. Report them, and don't refresh baselines until the user approves.
- Publish an Artifact board: round 0 next to the final shots, the score table per round, and what was kept or reverted.
- Only after the user approves: open the PR, refresh the Linux screenshots (memory `linux-visual-snapshots`), and follow the CLAUDE.md merge rules. Never ship.

## Cost
Each round is 4 Claude reviewer agents, plus up to 3 free outside calls. A typical screen takes 3–5 rounds.
