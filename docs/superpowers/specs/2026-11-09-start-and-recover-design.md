# Start and recover: First step + kinder overdue (2026-11-09)

Approved 2026-11-09. Source: "Working Foundation" PDF (friction lens) plus a short research pass.

## Goal
Make it easier for a student to **start** a task and to **recover** after one slips, without new screens, AI-made content or a new look.

## Evidence (and how strong it is)
- Implementation intentions ("when/what I'll do first") help people *start* a specific action: d≈0.65 across 94 studies (Gollwitzer & Sheeran 2006). Student trials for ongoing procrastination are mixed, so this helps starting, not everything.
- Self-forgiveness after a delay went with less procrastination next time (Carleton, second-hand). Shame/guilt feed procrastination (correlational).
- Undo beats routine confirm dialogs (expert consensus, not experiments). The app already uses undo toasts.
- Broken streaks can demotivate (Silverman & Barasch 2023). Not acted on: the attendance streak only shows in a toast.

## 0. Working rules (config only)
- `~/.claude/CLAUDE.md`: recommend one option with a one-line why and label opinion vs fact; add one `Why:` line for decisions that aren't obvious.
- Project `CLAUDE.md` Working rules: for look/feel or will-it-work questions, a quick browser check beats a long plan.

## 1. First step (PR 1)
- **Data:** optional `firstStep` on a task (string, trimmed, at most 80 chars). `sanitizeTask` keeps it only when it isn't empty. Additive like `startTime`: old tasks, backups and the cloud copy are unchanged; older app versions drop it.
- **Task form:** one visible input under the title, "First step (optional)", placeholder "e.g. Read the aim, 15 min". Written by the student, never auto-filled.
- **Today focus:** a task with a first step qualifies when due within 2 days (others: today or overdue, as now). Subline "Start: <first step>"; button **Start** (opens the task like Open). Unmarked classes keep priority.
- **Tests:** sanitizeTask keep/trim/drop; backup round-trip keeps it; focus shows "Start:" for a task with a step due in 2 days and no early pick without one.

## 2. Kinder overdue recovery (PR 2)
- **Today focus on an overdue task:** quiet **Done** · **Tomorrow** · **Pick a day** buttons, each with an Undo toast (`showUndoToast`). One shared helper marks done / moves the date; Weekly Review's rollover uses the same helper.
- **Copy:** "N overdue tasks need attention before anything else." → "N tasks slipped. Pick a new day or mark them done."; notification title "Task Overdue: X" → "Still open: X". Overdue styling stays.
- **No delete, no data change.**
- **Tests:** done and redate change the task and Undo restores it; copy checks.

## Out of scope
Suggested start dates (planning fallacy, mixed evidence), AI-generated next steps, timers, streak changes.

## Verification
Each PR: `npm test`, `npm run test:visual`, browser check at 390 and 1280 with the network off, PR, green CI, merge. Ship only when the user says so.
