#!/usr/bin/env node
// scripts/ship.mjs -- test, commit, push and deploy in one command.
//
//   npm run ship                    asks for a commit message, then does everything
//   npm run ship:check              shows what would happen; changes nothing
//   node scripts/ship.mjs "Msg"     same as ship, message given up front
//   node scripts/ship.mjs --skip-tests   emergencies only
//
// Order: bump the cache version if app files changed and it wasn't bumped
// -> npm test -> commit -> Dev Notes (npm run devnotes, own "chore:" commit)
// -> push -> firebase deploy (+ AI proxy if ai-proxy/ changed). Stops at the
// first failure. Never resets, cleans or force-pushes. "Claude outputs/" is
// never committed. The commit message becomes a Dev Note in the app unless it
// starts with chore:, test:, wip: or bump.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_TESTS = args.includes('--skip-tests');
let message = args.filter((a) => !a.startsWith('--')).join(' ').trim();
const EXCLUDE = ['Claude outputs'].map((p) => `:(exclude)${p}`);
const SITE = 'https://campusos-83365.web.app';

const step = (s) => console.log(`\n▶ ${s}`);
const fail = (s) => { console.error(`\n✗ ${s}`); process.exit(1); };
function run(cmd, cmdArgs, { shell = false, capture = false, cwd } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd, shell, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (r.error) fail(`Could not start ${cmd}: ${r.error.message}`);
  return r;
}
// npm / firebase / npx are .cmd files on Windows, so they go through the shell
// as one command line (passing an args array with shell:true is deprecated).
const sh = (line, cwd) => run(line, [], { shell: true, cwd });
function git(...a) {
  const r = run('git', a, { capture: true });
  if (r.status !== 0) fail(`git ${a.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
}

// data.js must still load, with a non-empty DEV_UPDATES list.
async function devNotesLoad() {
  const tmp = path.join(os.tmpdir(), `clarity-data-${process.pid}.mjs`);
  fs.copyFileSync('data.js', tmp);
  try { const m = await import(pathToFileURL(tmp).href); return Array.isArray(m.DEV_UPDATES) && m.DEV_UPDATES.length > 0; }
  catch { return false; }
  finally { fs.rmSync(tmp, { force: true }); }
}

// ── What's changed ────────────────────────────────────────────────────
const branch = git('branch', '--show-current').trim();
if (!branch) fail('Not on a branch (detached HEAD). Check out main first.');

const changes = [];
const entries = git('status', '--porcelain', '-z', '--untracked-files=all', '--', '.', ...EXCLUDE).split('\0');
for (let i = 0; i < entries.length; i++) {
  const e = entries[i];
  if (!e) continue;
  changes.push({ code: e.slice(0, 2), file: e.slice(3) });
  if (/[RC]/.test(e[0])) i++;            // renames carry the old path as a second entry
}

// ── Cache version (sw.js + ?v= in index.html / 404.html) ──────────────
const swSrc = fs.readFileSync('sw.js', 'utf8');
const verOf = (src) => Number((src.match(/clarity-desk-v(\d+)/) || [])[1]);
const cur = verOf(swSrc);
const head = verOf(git('show', 'HEAD:sw.js'));
if (!cur) fail("Couldn't find the cache version (clarity-desk-vN) in sw.js.");
for (const f of ['index.html', '404.html']) {
  const bad = [...fs.readFileSync(f, 'utf8').matchAll(/\?v=(\d+)/g)].filter((m) => Number(m[1]) !== cur);
  if (bad.length) fail(`${f} has ?v=${bad[0][1]} but sw.js is v${cur}. Make them match before shipping.`);
}
const runtime = new Set(['404.html', ...[...(swSrc.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1]
  .matchAll(/'([^']*)'/g)].map((m) => m[1].replace(/^\.\//, '')).filter(Boolean)]);
const appChanged = changes.some((c) => runtime.has(c.file));
const needsBump = appChanged && cur === head;
const ver = needsBump ? cur + 1 : cur;
const workerChanged = changes.some((c) => c.file.startsWith('ai-proxy/'));

// ── Plan ──────────────────────────────────────────────────────────────
console.log(`Branch: ${branch}`);
if (changes.length) {
  console.log(`Files to commit (${changes.length}):`);
  changes.forEach((c) => console.log(`  ${c.code} ${c.file}`));
} else {
  console.log('Nothing new to commit: will push and deploy what is already committed.');
}
console.log(`Cache version: ${needsBump ? `v${cur} -> v${ver} (app files changed)` : `v${ver}${cur !== head ? ' (already bumped)' : ''}`}`);
if (workerChanged) console.log('ai-proxy/ changed: the AI proxy will be deployed too.');
if (DRY) {
  console.log('\nDev Notes (commits so far; this commit is added too unless it starts with chore:/test:):');
  sh('node scripts/generate-devnotes.mjs --dry-run');
  console.log('\nDry run: nothing was changed.');
  process.exit(0);
}

if (changes.length && !message) {
  console.log('\nThe message becomes a Dev Note in the app. Start it with "chore:" to leave it out.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  message = (await rl.question('\nCommit message (Enter to cancel): ')).trim();
  rl.close();
  if (!message) { console.log('Cancelled. Nothing was changed.'); process.exit(0); }
}
if (changes.length && appChanged && !message.includes(`v${ver}`)) message += ` (v${ver})`;

// ── Ship ──────────────────────────────────────────────────────────────
if (needsBump) {
  step(`Bumping cache version v${cur} -> v${ver}`);
  for (const f of ['index.html', '404.html']) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split(`?v=${cur}`).join(`?v=${ver}`));
  fs.writeFileSync('sw.js', swSrc.replace(`clarity-desk-v${cur}`, `clarity-desk-v${ver}`));
}

if (!SKIP_TESTS) {
  step('Running npm test');
  if (sh('npm test').status !== 0) fail('Tests failed. Nothing was committed, pushed or deployed.');
}

if (changes.length) {
  step(`Committing: ${message}`);
  git('add', '-A', '--', '.', ...EXCLUDE);
  if (run('git', ['commit', '-m', message]).status !== 0) fail('Commit failed. Nothing was pushed or deployed.');
}

step('Updating Dev Notes');
if (sh('node scripts/generate-devnotes.mjs').status !== 0) fail('Dev Notes update failed. Nothing was pushed or deployed.');
const NOTES = ['data.js', '.devnotes-state.json'];
const notesChanged = git('diff', '--name-only', '--', ...NOTES).split('\n').filter(Boolean);
if (notesChanged.includes('data.js')) {
  if (!(await devNotesLoad())) {
    git('checkout', '--', ...NOTES);      // undo only what the generator just wrote
    fail('The Dev Notes update broke data.js, so it was undone. Nothing was pushed or deployed.');
  }
  git('add', '--', ...NOTES);
  if (run('git', ['commit', '-m', 'chore: update Dev Notes']).status !== 0) fail('Dev Notes commit failed. Nothing was pushed or deployed.');
} else if (notesChanged.length) {
  // No new notes (only chore:/test: commits): keep the committed state file,
  // so the tool's own "chore: update Dev Notes" commits never need a commit.
  git('checkout', '--', '.devnotes-state.json');
}

step(`Pushing to origin/${branch}`);
if (run('git', ['push']).status !== 0) {
  fail('Push failed. Nothing was deployed. Your commit is saved locally: fix the push, then run npm run ship again.');
}

step('Deploying hosting');
if (sh('firebase deploy --only hosting').status !== 0) fail('Firebase deploy failed. Code is committed and pushed.');

if (workerChanged) {
  step('Deploying the AI proxy');
  if (sh('npx wrangler@latest deploy', 'ai-proxy').status !== 0) fail('AI proxy deploy failed. Hosting is live.');
}

console.log(`\n✓ Shipped v${ver}: ${SITE}`);
