# Clarity Desk — Agent Instructions

Offline-first academic PWA (timetable, attendance, tasks, vault, notices, "Ask Desk" assistant).
Vanilla JS, no build step. `localStorage` is the source of truth; Firebase is optional and must stay optional.

## Key files
- `index.html` — app shell, head theme bootstrap, modal templates, nav
- `app.js` — core logic (monolithic, no module boundaries — high risk)
- `style.css` — themes, layout, responsive system
- `data.js` — fallback/default datasets
- `manifest.json`, `sw.js` — PWA manifest and service worker/cache versioning
- `firebase-config.js` — optional cloud config
- `PROJECT_MEMORY.md` — architecture history, storage schema, past bug-fix intent
- `tests/` — regression, normalization, PWA smoke, visual, release gate

## Working rules
- Inspect first before editing.
- Plan first for non-trivial or multi-file tasks; wait for explicit approval before implementing.
- For look/feel or will-it-work questions, a quick browser check beats a long plan (it changes nothing).
- Make the smallest safe change. No unrelated cleanup, refactors, or redesigns.
- Don't invent new architecture unless clearly necessary.
- Be concise. No explanations unless asked.
- Read only the files you need. Grep/glob before opening directories (`app.js` is huge; read line ranges).
- Reuse existing components, helpers, styles and patterns. Never create parallel versions of existing things.
- Edits: show only changed files as diffs. Never rewrite untouched files.
- No new dependencies unless unavoidable; justify in one line.
- Free tiers only. Nothing needing a paid plan (including Firebase Blaze).
- Ask one question before coding if something is ambiguous.
- If you change structure or data flow, update `docs/ARCHITECTURE.md` in the same task.
- Read `docs/ARCHITECTURE.md` for structure and data flow instead of exploring from scratch; `docs/AUDIT.md` lists known issues.
- Screens students see follow `docs/POLISH.md`: anything new on Today replaces or folds something, or changes the spec first.

## Protected systems — inspect carefully, explain risk before touching
- `cos_*` storage schemas
- attendance calculations and history
- timetable parsing
- General + user-group filtering
- backup / restore
- OCR flows
- offline-first behavior
- service worker / manifest / cache update behavior
- subject normalization compatibility
- existing navigation behavior
- current 12-hour AM/PM formatting

## Data safety
- Never rename storage keys or change stored shapes without a migration path.
- No silent destructive writes: parser/OCR/AI/cleanup output must go through a review/preview flow before persisting.
- Backup/restore must stay compatible.

## Verification (run, don't assume)
- Logic changes → `npm run lint && npm test`
- PWA/service worker/manifest/offline changes → `npm run test:pwa-smoke`
- UI/theme/layout/modal changes → `npm run test:visual`
- Release readiness → `npm run release:check`
- Looking at a screen (boards, before/after) → `npm run ui:shots -- --screen <s> --desk messy --scale 1 [--crop <sel>]`: the real app at phone and laptop size, cached. Linux screenshots for CI → `gh workflow run visual-snapshots.yml --ref <branch>` (commits them and reruns Tests).
- Local preview: use `node tests/serve.mjs` (http://127.0.0.1:4173). `index.html` loads `app.js`, `data.js` and `style.css` from jsDelivr at a pinned commit, so a plain static server shows the live code, not local edits; `tests/serve.mjs` rewrites those links to the local files.
- Report exact failures; distinguish real regression vs setup issue vs pre-existing problem. Never weaken a test to pass.

## Git safety
- No `git reset --hard`, `git clean -fd`, force push, or branch deletion.
- Claude may commit and push to its own `claude/*` branch and open a PR without asking. Never push to `main` directly; `main` only changes through a merged PR or `npm run ship`.
- Claude may merge its own `claude/*` PR into `main` without asking, only when CI (`Tests`) is green on the latest commit, there is no merge conflict, and no review thread is unresolved. Never merge Dependabot or anyone else's PR.
- Before pull/merge/rebase, report `git status`, branch, and remotes first.

## Shipping (batched: only when the user says "ship")
- After every change, once CI (`Tests`) is green, there's no conflict and no review thread is unresolved: merge the `claude/*` PR, pull `main` (`git pull --ff-only`), and confirm the folder matches `origin/main` (same `HEAD`, clean `git status`). Do not run `npm run ship` then: merged PRs wait on `main` (nothing goes live until ship).
- Run `npm run ship` only when the user says to ship, so several PRs go out as one version: follow the `ship` skill. Exception: an urgent fix for something broken for students ships right away.
- Commit messages and PR commit subjects: plain words for students, because they become Dev Notes. Start with `chore:` for tooling/test-only changes. Never add a version label like `(vN)`: Dev Notes show the date, and the cache number stays internal.
- Git commands run from the Cowork VM on this folder (e.g. `git status`) can leave a `.git/index.lock` the VM cannot delete, which blocks the user's commit. If one appears, move it aside (`mv .git/index.lock .git/index.lock.stale`).

## Reporting format
After any change, report: files changed, what changed in each, commands run, actual results, remaining risks. Never say "done" without evidence.

## Agent skills

### Issue tracker

GitHub Issues on SanghpalBhakte/Clarity-Desk (via `gh`). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
