#!/usr/bin/env node
// scripts/merge-when-ready.mjs -- merge one of Claude's own PRs once it is safe, then bring main up to date.
//
//   npm run merge-pr -- 448             wait for CI, check the rules, merge, pull main
//   npm run merge-pr -- 448 --dry-run   same checks, merges nothing
//
// The rules are the ones in CLAUDE.md (Git safety): a `claude/*` branch, not a draft, not
// Dependabot's, CI (`test`) green on the latest commit, no merge conflict, no unresolved
// review thread. It waits for CI to register and finish (gh's own --watch quits early),
// stops at the first broken rule and says which one. Never force-pushes or resets.

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const PR = args.find((a) => /^\d+$/.test(a));
if (!PR) { console.error('Usage: npm run merge-pr -- <pr-number> [--dry-run]'); process.exit(2); }

const WAIT_FOR_CHECKS_MS = 3 * 60 * 1000;   // CI can take a minute to show up after a push
const WAIT_FOR_GREEN_MS = 20 * 60 * 1000;
const POLL_MS = 20 * 1000;

const run = (cmd, argv) => spawnSync(cmd, argv, { encoding: 'utf8' });
const gh = (...argv) => { const r = run('gh', argv); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const stop = (why) => { console.error(`✗ Not merging #${PR}: ${why}`); process.exit(1); };
const ghJson = (...argv) => { const r = gh(...argv); if (!r.ok) stop(`gh ${argv.slice(0, 2).join(' ')} failed: ${r.err.split('\n')[0]}`); return JSON.parse(r.out); };

const pr = ghJson('pr', 'view', PR, '--json', 'state,isDraft,headRefName,author');
if (pr.state !== 'OPEN') stop(`it is ${pr.state}`);
if (pr.isDraft) stop('it is a draft');
if (!pr.headRefName.startsWith('claude/')) stop(`branch "${pr.headRefName}" is not a claude/* branch`);
if (/dependabot/i.test(pr.author?.login || '')) stop('Dependabot PRs are never merged here');

// Wait until the checks exist and none is pending.
const started = Date.now();
let checks = [];
for (;;) {
  const r = gh('pr', 'checks', PR, '--json', 'name,bucket');
  checks = r.out ? JSON.parse(r.out) : [];   // "no checks reported" exits non-zero with no JSON
  const failed = checks.filter((c) => c.bucket === 'fail' || c.bucket === 'cancel');
  if (failed.length) stop(`CI failed: ${failed.map((c) => c.name).join(', ')}`);
  const pending = checks.filter((c) => c.bucket === 'pending');
  if (checks.length && !pending.length) break;
  const waited = Date.now() - started;
  if (!checks.length && waited > WAIT_FOR_CHECKS_MS) stop('no CI checks appeared after 3 minutes');
  if (waited > WAIT_FOR_GREEN_MS) stop(`CI still pending after 20 minutes: ${pending.map((c) => c.name).join(', ')}`);
  console.log(checks.length ? `… waiting for ${pending.map((c) => c.name).join(', ')}` : '… waiting for CI to start');
  await sleep(POLL_MS);
}
if (!checks.some((c) => c.name === 'test' && c.bucket === 'pass')) stop('the "test" check did not pass');
console.log(`✓ CI green (${checks.map((c) => `${c.name}: ${c.bucket}`).join(', ')})`);

// GitHub needs a moment to work out mergeability after the checks finish.
let state = {};
for (let i = 0; i < 6; i++) {
  state = ghJson('pr', 'view', PR, '--json', 'mergeable,mergeStateStatus');
  if (state.mergeable !== 'UNKNOWN') break;
  await sleep(5000);
}
if (state.mergeable !== 'MERGEABLE') stop(`mergeable is ${state.mergeable} (${state.mergeStateStatus})`);
console.log(`✓ No conflict (${state.mergeStateStatus})`);

const { nameWithOwner } = ghJson('repo', 'view', '--json', 'nameWithOwner');
const [owner, name] = nameWithOwner.split('/');
const threads = ghJson('api', 'graphql', '-f', `query={repository(owner:"${owner}",name:"${name}"){pullRequest(number:${PR}){reviewThreads(first:100){nodes{isResolved}}}}}`)
  .data.repository.pullRequest.reviewThreads.nodes;
const open = threads.filter((t) => !t.isResolved).length;
if (open) stop(`${open} review thread(s) unresolved`);
console.log(`✓ No unresolved review threads (${threads.length} total)`);

if (DRY) { console.log(`Dry run: #${PR} is ready to merge. Nothing was changed.`); process.exit(0); }

const merged = gh('pr', 'merge', PR, '--merge');
if (!merged.ok) stop(`gh pr merge failed: ${merged.err}`);
console.log(`✓ Merged #${PR}`);

// Bring the folder level with origin/main (CLAUDE.md: report status, branch and remotes before pulling).
const git = (...argv) => { const r = run('git', argv); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };
console.log(`git status: ${git('status', '-sb').out.split('\n')[0]}`);
console.log(`remote: ${git('remote', 'get-url', 'origin').out}`);
if (git('status', '--porcelain').out) { console.error('✗ Working tree has changes, so main was not pulled. Merge is done.'); process.exit(1); }
for (const step of [['switch', 'main'], ['pull', '--ff-only']]) {
  const r = git(...step);
  if (!r.ok) { console.error(`✗ git ${step.join(' ')} failed: ${r.err}`); process.exit(1); }
}
const head = git('rev-parse', 'HEAD').out;
const origin = git('rev-parse', 'origin/main').out;
const clean = !git('status', '--porcelain').out;
console.log(head === origin && clean ? `✓ main = origin/main at ${head.slice(0, 7)}, tree clean` : `✗ main is at ${head.slice(0, 7)}, origin/main at ${origin.slice(0, 7)}, clean: ${clean}`);
process.exit(head === origin && clean ? 0 : 1);
