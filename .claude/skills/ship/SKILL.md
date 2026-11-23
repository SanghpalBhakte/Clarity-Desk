---
name: ship
description: Use when the user says "ship" (or asks what is waiting to ship): runs the batched release of everything merged on main since the last ship.
---

# Ship

Merged PRs wait on `main`; nothing goes live until this runs. One ship sends several PRs out as one version.

1. See what is waiting: `npm run ship:check`. "Recent" or "unshipped" changes (e.g. for a review) means everything since the last ship.
2. Remove stray untracked files first: the script runs `git add -A`.
3. Run `npm run ship` (`scripts/ship.mjs`). It:
   - bumps the cache version if app files changed;
   - runs `npm test`, commits, and adds Dev Notes;
   - pushes, then runs `firebase deploy --only hosting` (plus the AI proxy if `ai-proxy/` changed);
   - runs the live smoke test (`npm run test:smoke` against the live site, and `live-check.yml` from GitHub's servers).
   A smoke failure prints a red warning and exits 1. The deploy stays live and nothing is rolled back.
4. Done when `main` matches `origin/main` (same `HEAD`) and `git status` is clean.

Dev Notes come from commit subjects. A change that arrives through a merged PR leaves ship nothing to commit, so the PR's commit subject becomes the Dev Note.

## Report

Report the shipped version, the smoke result (both sites, and GitHub's check), and anything the script does not do. For example, run `npm run test:visual:update` on Windows when screenshots changed.
