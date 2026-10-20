# Clarity Desk — Agent Instructions

Offline-first academic PWA (timetable, attendance, tasks, vault, notices, "Ask Desk" assistant).
Vanilla JS, no build step. `localStorage` is the source of truth; Firebase is optional and must stay optional.

## Key files
- `index.html` — app shell, head theme bootstrap, modal templates, nav
- `app.js` — core logic (monolithic, ~11k lines, no module boundaries — high risk)
- `style.css` — themes, layout, responsive system
- `data.js` — fallback/default datasets
- `manifest.json`, `sw.js` — PWA manifest and service worker/cache versioning
- `firebase-config.js` — optional cloud config
- `PROJECT_MEMORY.md` — architecture history, storage schema, past bug-fix intent
- `tests/` — regression, normalization, PWA smoke, visual, release gate

## Working rules
- Inspect first before editing.
- Plan first for non-trivial or multi-file tasks; wait for explicit approval before implementing.
- Make the smallest safe change. No unrelated cleanup, refactors, or redesigns.
- Don't invent new architecture unless clearly necessary.

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
- Logic changes → `npm test`
- PWA/service worker/manifest/offline changes → `npm run test:pwa-smoke`
- UI/theme/layout/modal changes → `npm run test:visual`
- Release readiness → `npm run release:check`
- Report exact failures; distinguish real regression vs setup issue vs pre-existing problem. Never weaken a test to pass.

## Git safety
- No `git reset --hard`, `git clean -fd`, force push, or branch deletion.
- Claude may commit and push to its own `claude/*` branch and open a PR without asking. Never push to `main` directly; `main` only changes through a merged PR or `npm run ship`.
- Claude may merge its own `claude/*` PR into `main` without asking, only when CI (`Tests`) is green on the latest commit, there is no merge conflict, and no review thread is unresolved. Never merge Dependabot or anyone else's PR.
- Before pull/merge/rebase, report `git status`, branch, and remotes first.

## Shipping (Claude runs it after every change)
- After every change, once CI (`Tests`) is green, there's no conflict and no review thread is unresolved: merge the `claude/*` PR, pull `main` (`git pull --ff-only`), run `npm run ship`, and confirm the folder matches `origin/main` (same `HEAD`, clean `git status`).
- Before running ship, remove stray untracked files: the script runs `git add -A`.
- Changes that arrive through a merged PR leave ship nothing to commit, so the PR's commit subject becomes the Dev Note. Write that subject in plain words for students.
- `npm run ship` (`scripts/ship.mjs`): bumps the cache version if app files changed, runs `npm test`, commits, adds Dev Notes, pushes, runs `firebase deploy --only hosting` (plus the AI proxy if `ai-proxy/` changed), then runs the live smoke test (`npm run test:smoke` against the live site). A smoke failure prints a red warning and exits 1; the deploy stays live, nothing is rolled back. `npm run ship:check` previews it.
- After shipping, report the shipped version, the smoke result, and anything the script does not do (e.g. `npm run test:visual:update` on Windows when screenshots changed). Commit messages: plain words for students, because they become Dev Notes. Start with `chore:` for tooling/test-only changes. Leave out `(vN)`: the script adds it.
- Git commands run from the Cowork VM on this folder (e.g. `git status`) can leave a `.git/index.lock` the VM cannot delete, which blocks the user's commit. If one appears, move it aside (`mv .git/index.lock .git/index.lock.stale`).

## Reporting format
After any change, report: files changed, what changed in each, commands run, actual results, remaining risks. Never say "done" without evidence.
