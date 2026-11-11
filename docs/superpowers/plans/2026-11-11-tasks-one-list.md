# Tasks, One List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tasks page show each item once in the list (and at most once on the strip), with honest section names, so a full desk reads as calm instead of complex.

**Architecture:** Render-only change inside `renderAssignments` in `app.js` (≈16380-16660) plus the Tasks CSS block in `style.css` (≈7670-7830). No storage, filter state, sync or backup change: `state.assignSubjectFilter`, `setAssignSubject()`, `toggleTaskFold()` and the `cos_custom_tasks` shape stay as they are.

**Tech Stack:** Vanilla JS, CSS, Playwright (`chromium-desktop` 1440×980, `chromium-mobile`).

**Spec:** Visual board https://claude.ai/artifact/NtPhMKqoiFghVNvHmAd8md plus the decisions table below (the external review, triaged against the code on 2026-11-11).

## Decisions from the review

| Review point | Decision | Why |
|---|---|---|
| Single list, drop By subject copy rows | **Do** (Task 3) | Biggest source of repetition (fact) |
| Honest buckets: Late / Next 7 days | **Do** (Task 1) | "This week" holds next week's dates (fact: `d <= 7`) |
| Strip: 7 days or only busy days | **Keep 14 days** | End-sem dates are 5-9 days out; 7 days would drop Fri 20 (fact). Strip is already laptop-only and hidden when empty |
| Full subject names | **Do** (Tasks 2, 3) | Tooltip + accessible name on codes; full name in the "Showing only" line |
| Mobile add is weak | **No change** | Phone already has a pinned 52px ringed bar with + and Paste above the nav (fact, `style.css:7793`); the board drew it too faint |
| Paste / photo capture | **Paste already in bar.** Photo in the Tasks bar is out of scope | Separate idea; note it, don't build here |
| Goals separate from deadlines | **Already its own fold**; no change | Opinion: a fold below deadlines is separation enough |
| Check box beside the date | **Dropped** | Phone thumbs expect it right; capping list width (Task 3) fixes the laptop distance instead |

## Global Constraints

- No storage key or stored shape changes. No new dependencies.
- Copy is plain words for students; no counts that the headline already gives.
- Late keeps a non-colour cue (`!` on strip, "N days late" in rows).
- 12-hour formatting and existing navigation untouched.
- Work on branch `claude/tasks-one-list`; one PR. Commit subject (becomes Dev Note): `Tasks page is calmer: one list, clearer sections, subject names on the two-week strip`.

## Review Focus

1. **Only due-today items, nothing late** → first section reads "Today", not "Late". Test in Task 1.
2. **Late and due-today both present** → "Late and today". Test in Task 1.
3. **Task with no code (GEN/OTH category or empty code)** → strip shows its title, not "GEN"/blank. Test in Task 2.
4. **Picked subject filter** → strip still dims other subjects; "Showing only" line shows the full name. Test in Task 3.
5. **Later bucket with mixed types and undated items** → summary counts only what is there, no "0 exams", no crash on missing `dueDate`. Test in Task 4.

---

### Task 1: Honest section names, no per-section counts

**Files:**
- Modify: `app.js` `renderGroupedTasks` / `openList` (≈16583-16605)
- Modify: `style.css:7694-7696` (remove `.tk-group-head span` rule and the midnight-ink override line 7698)
- Create: `tests/tasks-one-list.spec.ts`; add it to `test:sync-flows` in `package.json`

**Interfaces:**
- Produces: `tests/tasks-one-list.spec.ts` with helper `open(page, tasks)` (seed `cos_custom_tasks`, onboarding flags, `navigateTo('assignments')`, same as `tests/tasks-long-subjects.spec.ts`) and `dayKey(offset: number): string` (local `YYYY-MM-DD` relative to today). Later tasks add tests to this file.

- [ ] **Step 1: Write failing tests** (`chromium-desktop`):
  - `late-only first section is "Late"`: seed one task `dueDate: dayKey(-3)` and one `dayKey(4)`. Expect `.tk-group-now .tk-group-head h2` text `Late`; `.tk-group-week .tk-group-head h2` text `Next 7 days`; `.tk-group-head span` count `0`.
  - `today-only first section is "Today"`: one task `dayKey(0)` → `Today`.
  - `late and today reads "Late and today"`: `dayKey(-1)` + `dayKey(0)` → `Late and today`.
- [ ] **Step 2:** `npx playwright test tests/tasks-one-list.spec.ts --project=chromium-desktop` → FAIL (`Now`, `This week`).
- [ ] **Step 3:** In `openList`, label for key `now` = `Late` if every item `isTaskOverdue`, `Today` if none is, else `Late and today`; key `week` label `Next 7 days`. Drop `<span>${list.length} left</span>`. Keep `aria-label` equal to the visible label.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `chore: tasks section names say late, today and next 7 days`.

### Task 2: Strip shows subject codes, no legend

**Files:**
- Modify: `app.js` `stripHTML` (≈16471-16499)
- Modify: `style.css:7763-7769, 7778-7781` (remove `.tk-strip-key*`; exam tick becomes filled block)
- Test: `tests/tasks-one-list.spec.ts`

**Interfaces:**
- Produces: `tickLabel(a) -> string` (inside `renderAssignments`): `a.code` trimmed, unless empty or in `['GEN','MIS','OTH']` (case-insensitive) → `a.title || 'Task'`. Task 3 does not use it.

- [ ] **Step 1: Failing tests:**
  - `strip names the subject`: seed exam `{code:'DEMP', subject:'Digital Electronics and Microprocessors', title:'End sem', taskType:'exam', dueDate: dayKey(2)}`. Expect a `.tk-tick.is-exam` with text `DEMP` and `title` containing `End sem` and `Digital Electronics and Microprocessors`.
  - `no-code task shows its title`: `{code:'GEN', subject:'General', title:'Fee form', dueDate: dayKey(1)}` → a `.tk-tick` with text `Fee form`.
  - `no legend`: `.tk-strip-key` count `0`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Use `tickLabel(a)` for tick text; `title` = `${a.title} · ${a.subject}`. Remove the `tk-strip-key` span (keep the `Two weeks` h2). CSS: `.tk-tick.is-exam { border-left: 0; padding: 0 5px; border-radius: 3px; background: var(--text-primary); color: var(--color-canvas); }`; late exam keeps `!` and uses `--status-error` as background. Done/dim rules unchanged.
- [ ] **Step 4:** Run → PASS. Check exam block contrast in all themes during Task 5 screenshots.
- [ ] **Step 5:** Commit `chore: two-week strip names the subject instead of the task title`.

### Task 3: Subjects become one line on every screen; list width capped

**Files:**
- Modify: `app.js` `nextDueFor` + `subjIndex` (≈16455-16466) and the page template (≈16625-16630, `.tk-side` aside, `has-side` class, `narrowing`)
- Modify: `style.css` laptop block 7802-7820 (drop `has-side` areas, `.tk-side`, laptop `.tk-subjects`/`.tk-subj-pick`/`.tk-subj-next` overrides) and 7686, 7691
- Test: `tests/tasks-one-list.spec.ts`; `tests/tasks-long-subjects.spec.ts` must still pass unchanged

**Interfaces:**
- Produces: `subjectFullName(s: string) -> string` (inside `renderAssignments`): the `subject` of the first task in `all` whose `code === s`, else `s`.

- [ ] **Step 1: Failing tests:**
  - `subjects are one line, not a column`: seed DEMP + DS tasks. Expect `.tk-side` count `0`, `.tk-subj-next` count `0`; all `.tk-subj-pick` share one `boundingBox().y`; the DEMP pick has `title` `Digital Electronics and Microprocessors`.
  - `picked subject shows its full name`: click DEMP pick → `.tk-narrow` contains `Digital Electronics and Microprocessors`; DS strip tick has class `is-dim`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Delete `nextDueFor` and the `.tk-side-head`; render `subjIndex` inside `.tk-main` above the list (below the select bar). Each pick gets `title` and `aria-label` = `subjectFullName(s)` (`All` → `Show all subjects`). Add the picked subject to `narrowing` as `subjectFullName(state.assignSubjectFilter)`. Remove `has-side`. Laptop CSS: grid areas `"head add" "strip strip" "main main"`; `.tk-main` `max-width: 760px`; the phone `.tk-subjects` row style applies at all widths.
- [ ] **Step 4:** Run new spec and `npx playwright test tests/tasks-long-subjects.spec.ts --project=chromium-desktop` → PASS.
- [ ] **Step 5:** Commit `chore: subjects become one filter line on laptops too`.

### Task 4: Later fold reads as a sentence

**Files:**
- Modify: `app.js` `titles()` use for the `later` fold (≈16602-16604); Goals fold keeps `titles()`
- Test: `tests/tasks-one-list.spec.ts`

**Interfaces:**
- Produces: `laterSummary(list) -> string`. Counts by `typeLabel(taskType)` lower-cased and pluralised with `s` (`1 exam`, `5 exams`, `2 assignments`), most common first, at most two types joined with `, `, `+ N more` if others remain. Then, if any item has a `dueDate`, ` · next ${tickLabel(first)} ${shortDate(first.dueDate)}` using the earliest-dated item.

- [ ] **Step 1: Failing tests:**
  - `later summary counts by type`: exams at `dayKey(9)` (code PBST) and `dayKey(20)`, assignment at `dayKey(15)`. Expect `.tk-group-later .tk-fold-sum` text `2 exams, 1 assignment · next PBST <shortDate>` (compute expected date text in the test as `${d.getDate()} ${'Jan Feb …'[month]}`).
  - `later with an undated task`: one assignment with no `dueDate` and `noDeadline` false → text `1 assignment` (no `· next`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `laterSummary` and pass it as the Later fold summary.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `chore: later fold says how many of each, and what is next`.

### Task 5: Full checks, screenshots, PR

- [ ] **Step 1:** Kill any server on port 4173 first (a stale one serves the wrong files). Run `npm test`, `npm run test:sync-flows`, `npm run test:mobile` → all PASS (report any failure as real / setup / pre-existing).
- [ ] **Step 2:** `npm run test:visual` → only `clarity-tasks-*` screenshots differ. Inspect the diffs for every theme (exam block contrast, no overlap at 1440 and mobile). Then `npm run test:visual:update` for local darwin files.
- [ ] **Step 3:** Browser check at http://127.0.0.1:4173 (`node tests/serve.mjs`) with the user's real-looking desk (8 items, 7 subjects) at 1440 and 390 wide.
- [ ] **Step 4:** Push `claude/tasks-one-list`, open PR with the Dev Note subject above; run the "Refresh Linux screenshots" workflow (CI compares the *-linux.png files); merge when `Tests` is green, then `git pull --ff-only` on `main`. No ship.
