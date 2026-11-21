# Today C2: copy-paste prompts, one new session per task

Run them **in this order**. Each task needs the one before it, so the order can't be changed.

Before each prompt, start a new session and set the model with `/model`. Each prompt is self-contained.

Why a new session each time: a fresh context reads only the plan and its own task, which is cheaper and faster than one long chat.

| # | Task | Model | Why this model |
|---|---|---|---|
| 1 | Desktop overlap fix | Sonnet | Small CSS fix with a clear test |
| 2 | Look, palettes, Auto dark | **Opus** | Theme bootstrap, service worker and fonts are protected |
| 3 | Tab bar and sidebar | Sonnet, then Opus review | Restyle with fixed selectors; navigation is protected, so Opus checks it |
| 4 | Strip label helpers | Sonnet | Pure functions with exact tests |
| 5 | Strip, rows, gestures | **Opus** | Attendance writes plus gesture feel; hardest task |
| 6 | Task tools | Sonnet, then Opus review | Follows Task 5's patterns |
| 7 | Mode views | Sonnet | Spec lists every mode |
| 8 | Name on the strip | **Opus** | Backup, restore and sign-in are protected |
| 9 | Laptop and parity pass | Sonnet, then Opus final review | Layout work, then a whole-redesign check |

---

## Prompt for any task (fill in N and the model)

```
Implement Task N of docs/superpowers/plans/2026-11-20-today-c2.md on a new branch claude/today-c2-N-<slug> from main.
Read first, in this order: CLAUDE.md, that plan's header and Global Constraints and Review Focus, Task N only, and the spec sections Task N cites in docs/superpowers/specs/2026-11-20-today-c2-design.md. The visual target is docs/superpowers/specs/assets/2026-11-20-today-c2-mock.html (open it with node tests/serve.mjs or a file URL and screenshot the same state).
Use superpowers:executing-plans. Follow the task's steps exactly: failing test first, then code, then the listed commands. Read app.js only by line range (grep first).
Open a PR with the parity screenshots and the test output. Merge it yourself only when CI "Tests" is green, there's no conflict, no open review thread, and (for Tasks 5 and 6) I have replied "device check passed". Then pull main and confirm a clean folder matching origin/main. Do not ship.
Report: files changed, commands run, real results, remaining risks.
```

Note: the plan file is on branch `claude/today-redesign-spec` until its PR is merged. If main doesn't have it yet, add: `First run: git fetch && git checkout origin/claude/today-redesign-spec -- docs/superpowers` (only before Task 1).

## Opus review prompt (after Tasks 3, 6 and 9)

```
/model opus
Review the open PR for Task N of docs/superpowers/plans/2026-11-20-today-c2.md against that task, the plan's Global Constraints and Review Focus, and the spec docs/superpowers/specs/2026-11-20-today-c2-design.md. Check protected systems in CLAUDE.md (navigation, cos_* storage, attendance, service worker) and compare the PR's screenshots to the mock. Run the task's test commands yourself. Fix real problems on the same branch; list anything you chose not to fix and why. Don't merge if anything is red.
```

## Device check (you, after Tasks 5 and 6)

Open the PR's preview on your iPhone (Add to Home Screen) and on an Android phone in Chrome. Try each item:

- swipe right
- short swipe left, then tap a button
- quick flick
- hold, then release
- hold, then move your finger (it must cancel)
- scroll fast over the list (rows must not slide)
- Undo
- rotate the phone
- 200% text size
- VoiceOver / TalkBack: row, then sheet, then mark

Reply in the session with "device check passed", or list what felt wrong.

Rules (decided 2026-11-21):
- Android is required; iPhone is not (no device). An iPhone report after ship is fixed as an urgent ship.
- Blocking: a wrong mark (wrong class, or a mark on hold, scroll or hold + move) or Undo failing. Feel issues are noted and fixed after ship.
- Preview: a Firebase channel deployed from a `git archive` copy of the commit with the jsDelivr links stripped. A plain channel deploy serves the pinned, shipped code, not the branch.

## Shipping

After all 9 are merged, say "ship" in any session.
