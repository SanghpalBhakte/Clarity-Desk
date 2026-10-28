#!/usr/bin/env node
// scripts/ship.mjs -- test, commit, push and deploy in one command.
//
//   npm run ship                    asks for a commit message, then does everything
//   npm run ship:check              shows what would happen; changes nothing
//   node scripts/ship.mjs "Msg"     same as ship, message given up front
//   node scripts/ship.mjs --skip-tests   emergencies only
//
// Order: bump the cache version if app files changed and it wasn't bumped
// (changed = uncommitted, or different from what the live site serves, e.g.
// merged through a pull request; if the site can't be reached, committed
// after the commit that set the current version) -> npm test -> commit -> Dev Notes (npm run devnotes, own "chore:" commit)
// -> (after the smoke test) the same check from GitHub's servers via
// .github/workflows/live-check.yml, whose result decides when this
// computer's network can't reach the site quickly
// -> point index.html/404.html/sw.js at the jsDelivr copy of HEAD's app files
// (own "chore:" commit, only if they changed) -> push -> check jsDelivr serves
// exactly those files -> firebase deploy (+ AI proxy if ai-proxy/ changed) -> live smoke
// test (npm run test:smoke against each of SITES; a failure warns in red and exits 1,
// but the deploy stays live -- nothing is rolled back). Stops at the
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
// Both Hosting sites (targets "app" and "claritydesk" in .firebaserc) get the same deploy;
// each one is smoke-tested. SITE stays the one the live version check reads.
const SITES = [SITE, 'https://claritydesk.web.app'];
// app.js, style.css and data.js load from jsDelivr (Cloudflare) pinned to a git
// commit, with this site as the fallback; desk-assistant.js, scanners.js, deadline-import.js and welcome-tour.js come along
// through app.js's import(). See index.html.
const CDN = 'https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@';
const CDN_RE = /https:\/\/cdn\.jsdelivr\.net\/gh\/SanghpalBhakte\/Clarity-Desk@([0-9a-f]{40})\//g;
const CDN_FILES = ['app.js', 'style.css', 'data.js', 'desk-assistant.js', 'scanners.js', 'deadline-import.js', 'welcome-tour.js'];
const CDN_PAGES = ['index.html', '404.html', 'sw.js'];

const step = (s) => console.log(`\n▶ ${s}`);
const fail = (s) => { console.error(`\n✗ ${s}`); process.exit(1); };
function run(cmd, cmdArgs, { shell = false, capture = false, cwd } = {}) {
  // app.js is over spawnSync's 1 MB default output limit (git show in checkCdn).
  const r = spawnSync(cmd, cmdArgs, { cwd, shell, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
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

// The one jsDelivr commit index.html, 404.html and sw.js load the app from.
function cdnCommit() {
  const shas = new Set(CDN_PAGES.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(CDN_RE)].map((m) => m[1])));
  if (shas.size !== 1) fail(`index.html, 404.html and sw.js must load the app from one jsDelivr commit (found ${shas.size}).`);
  return [...shas][0];
}
// True when the app files at `sha` are the same as at HEAD.
const sameAppFiles = (sha) => run('git', ['cat-file', '-e', `${sha}^{commit}`], { capture: true }).status === 0
  && run('git', ['diff', '--quiet', sha, 'HEAD', '--', ...CDN_FILES], { capture: true }).status === 0;

// jsDelivr must serve exactly the committed files before the pages that use
// them go live. It reads them from GitHub, so this runs after the push.
async function checkCdn(sha) {
  for (const f of CDN_FILES) {
    const want = git('show', `${sha}:${f}`);
    let why = '';
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(`${CDN}${sha}/${f}`, { signal: AbortSignal.timeout(30000) });
        const got = await r.text();
        if (r.ok && got === want) { why = ''; break; }
        why = r.ok ? 'content differs' : `HTTP ${r.status}`;
      } catch (err) { why = err.message; }
      await new Promise((res) => setTimeout(res, 5000));
    }
    if (why) fail(`jsDelivr does not serve ${f} for commit ${sha.slice(0, 7)} (${why}).\n` +
      '  The commit is pushed but NOT deployed; the live site is unchanged. Run npm run ship again in a few minutes.');
  }
}

// Runs .github/workflows/live-check.yml (smoke test of both sites) on GitHub's
// servers and waits for it. true = passed, false = failed, null = couldn't
// run it here (no gh CLI / not logged in / no run found): fall back to the
// local smoke result.
async function remoteLiveCheck() {
  const gh = (...a) => spawnSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const runs = () => {
    const r = gh('run', 'list', '--workflow', 'live-check.yml', '--event', 'workflow_dispatch', '--limit', '5', '--json', 'databaseId');
    try { return r.status === 0 ? JSON.parse(r.stdout).map((x) => x.databaseId) : null; } catch { return null; }
  };
  const before = runs();
  if (!before) { console.warn("\x1b[33m! Couldn't use the gh CLI to start the check on GitHub. Using this computer's result.\x1b[0m"); return null; }
  const start = gh('workflow', 'run', 'live-check.yml', '--ref', branch);
  if (start.status !== 0) { console.warn(`\x1b[33m! Couldn't start live-check.yml on GitHub (${start.stderr.trim()}). Using this computer's result.\x1b[0m`); return null; }
  let id = null;
  for (let i = 0; i < 20 && !id; i++) {
    await new Promise((res) => setTimeout(res, 3000));
    id = (runs() || []).find((x) => !before.includes(x)) || null;
  }
  if (!id) { console.warn("\x1b[33m! The check started on GitHub but its run didn't appear. Using this computer's result.\x1b[0m"); return null; }
  console.log(`Waiting for https://github.com/SanghpalBhakte/Clarity-Desk/actions/runs/${id} (about 4 minutes)`);
  return spawnSync('gh', ['run', 'watch', String(id), '--exit-status', '--interval', '20'], { stdio: ['ignore', 'ignore', 'inherit'] }).status === 0;
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
for (const f of ['index.html', '404.html', 'sw.js']) {
  const bad = [...fs.readFileSync(f, 'utf8').matchAll(/\?v=(\d+)/g)].filter((m) => Number(m[1]) !== cur);
  if (bad.length) fail(`${f} has ?v=${bad[0][1]} but sw.js is v${cur}. Make them match before shipping.`);
}
const cdnFrom = cdnCommit();
const runtime = new Set(['404.html', ...[...(swSrc.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1]
  .matchAll(/'([^']*)'/g)].map((m) => m[1].replace(/^\.\//, '').replace(new RegExp(CDN_RE.source), '').replace(/\?v=\d+$/, '')).filter(Boolean)]);
const appChanged = changes.some((c) => runtime.has(c.file));

// Changes merged through a pull request are already committed, so the check
// above misses them. Compare with what the live site serves instead: same
// version number but different app files means phones would keep the old
// cached copy. Unreachable site: fall back to committedSinceBump() below.
async function liveCheck() {
  const get = async (f) => {
    const r = await fetch(`${SITE}/${f}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  };
  try {
    const liveVer = verOf((await get('sw.js')).toString('utf8'));
    if (!liveVer) throw new Error('no version in the live sw.js');
    if (liveVer !== cur) return { liveVer, differs: [] };
    const files = [...new Set([...runtime].map((f) => f || 'index.html'))].filter((f) => fs.existsSync(f));
    const differs = [];
    for (const f of files) if (!(await get(f)).equals(fs.readFileSync(f))) differs.push(f);
    return { liveVer, differs };
  } catch (err) {
    const cause = err.cause ? ` / ${err.cause.code || err.cause.message}` : '';
    console.warn(`\x1b[33m! Couldn't compare with the live site (${err.message}${cause}). Checking git history instead.\x1b[0m`);
    return null;
  }
}

// Fallback when the live site can't be reached: app files committed after the
// commit that set the current version in sw.js have not been shipped under a
// new version yet. Ship's own "chore: update Dev Notes" commits are skipped:
// they are deployed in the same run as the version they follow. If that
// commit can't be found, stop rather than guess -- a missed bump leaves
// phones on the old cached app.
function committedSinceBump() {
  // A shallow clone's oldest commit looks like it added everything.
  const shallow = git('rev-parse', '--is-shallow-repository').trim() === 'true';
  const anchor = shallow ? '' : git('log', '-1', '--format=%H', `-Sclarity-desk-v${cur}`, '--', 'sw.js').trim();
  if (!anchor) {
    fail(`Couldn't reach the live site, and couldn't find the commit that set v${cur} in sw.js, so it's unclear whether the cache version needs a bump.\n` +
      '  Nothing was changed. Run npm run ship again once the live site is reachable.');
  }
  const files = new Set();
  const log = git('log', '--format=%x00%s', '--name-only', `${anchor}..HEAD`, '--', ...runtime);
  for (const chunk of log.split('\0').filter(Boolean)) {
    const [subject, ...names] = chunk.split('\n').map((l) => l.trim());
    if (subject === 'chore: update Dev Notes') continue;
    names.filter(Boolean).forEach((f) => files.add(f));
  }
  return [...files];
}

const live = await liveCheck();
const liveStale = !!live && live.liveVer === cur && live.differs.length > 0;
const committed = !live && cur === head ? committedSinceBump() : [];
const needsBump = (appChanged && cur === head) || liveStale || committed.length > 0;
const ver = needsBump ? cur + 1 : cur;
// A bump with nothing else to commit still needs its own commit.
const bumpOnly = needsBump && !changes.length;
const workerChanged = changes.some((c) => c.file.startsWith('ai-proxy/'));

// ── Plan ──────────────────────────────────────────────────────────────
console.log(`Branch: ${branch}`);
if (changes.length) {
  console.log(`Files to commit (${changes.length}):`);
  changes.forEach((c) => console.log(`  ${c.code} ${c.file}`));
} else {
  console.log('Nothing new to commit: will push and deploy what is already committed.');
}
const bumpWhy = appChanged && cur === head ? 'app files changed'
  : liveStale ? `the live site is v${cur} but ${live.differs.join(', ')} ${live.differs.length === 1 ? 'differs' : 'differ'} from it`
  : `${committed.join(', ')} changed in commits after v${cur} was set`;
console.log(`Cache version: ${needsBump ? `v${cur} -> v${ver} (${bumpWhy})` : `v${ver}${cur !== head ? ' (already bumped)' : ''}`}`);
if (bumpOnly) console.log(`The bump gets its own commit: "chore: bump the cache version to v${ver}".`);
if (workerChanged) console.log('ai-proxy/ changed: the AI proxy will be deployed too.');
console.log(`jsDelivr copy: commit ${cdnFrom.slice(0, 7)}${!changes.length && sameAppFiles(cdnFrom) ? ' (same app files as HEAD, stays)' : ' (moves to the commit being deployed if app files changed)'}.`);
console.log(`After deploy: live smoke test against ${SITES.join(' and ')} (npm run test:smoke), from here and from GitHub's servers (live-check.yml).`);
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
// No "(vN)" on the message: each Dev Note already shows its date, and the
// cache number stays internal (sw.js, ?v=, feedback reports).

// ── Ship ──────────────────────────────────────────────────────────────
if (needsBump) {
  step(`Bumping cache version v${cur} -> v${ver}`);
  for (const f of ['index.html', '404.html']) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split(`?v=${cur}`).join(`?v=${ver}`));
  fs.writeFileSync('sw.js', swSrc.replace(`clarity-desk-v${cur}`, `clarity-desk-v${ver}`).split(`?v=${cur}`).join(`?v=${ver}`));
}

if (!SKIP_TESTS) {
  step('Running npm test');
  if (sh('npm test').status !== 0) fail('Tests failed. Nothing was committed, pushed or deployed.');
}

if (bumpOnly) message = `chore: bump the cache version to v${ver}`;
if (changes.length || bumpOnly) {
  step(`Committing: ${message}`);
  git('add', '-A', '--', '.');
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

step('Pointing the app at its jsDelivr copy');
let cdnSha = cdnCommit();
if (sameAppFiles(cdnSha)) {
  console.log(`Unchanged: commit ${cdnSha.slice(0, 7)} has the same app files.`);
} else {
  const headSha = git('rev-parse', 'HEAD').trim();
  for (const f of CDN_PAGES) fs.writeFileSync(f, fs.readFileSync(f, 'utf8').split(cdnSha).join(headSha));
  git('add', '--', ...CDN_PAGES);
  if (run('git', ['commit', '-m', `chore: load the app files from jsDelivr at ${headSha.slice(0, 7)}`]).status !== 0) {
    fail('Commit failed. Nothing was pushed or deployed.');
  }
  cdnSha = headSha;
}

step(`Pushing to origin/${branch}`);
if (run('git', ['push']).status !== 0) {
  fail('Push failed. Nothing was deployed. Your commit is saved locally: fix the push, then run npm run ship again.');
}

step(`Checking the jsDelivr copy at ${cdnSha.slice(0, 7)}`);
await checkCdn(cdnSha);

step('Deploying hosting');
if (sh('firebase deploy --only hosting').status !== 0) fail('Firebase deploy failed. Code is committed and pushed.');

if (workerChanged) {
  step('Deploying the AI proxy');
  if (sh('npx wrangler@latest deploy', 'ai-proxy').status !== 0) fail('AI proxy deploy failed. Hosting is live.');
}

const smokeFailed = [];
for (const site of SITES) {
  step(`Live smoke test against ${site}`);
  process.env.SMOKE_BASE_URL = site;          // read by playwright.config.ts; works the same on Windows
  if (sh('npm run test:smoke').status !== 0) smokeFailed.push(site);
}
step("Live smoke test from GitHub's servers (live-check.yml)");
const remoteOk = await remoteLiveCheck();
if (remoteOk === false) {
  console.error(`\n\x1b[31m✗ v${ver} is LIVE, but the live smoke test FAILED on GitHub's servers.\n` +
    '  Nothing was rolled back. Open the site and check it now; the run log is linked above and in the "Live site check failing" issue.\x1b[0m');
  process.exit(1);
}
if (smokeFailed.length && remoteOk !== true) {
  console.error(`\n\x1b[31m✗ v${ver} is LIVE, but the live smoke test FAILED on ${smokeFailed.join(' and ')}.\n` +
    '  Nothing was rolled back. Open the site and check it now, then read the failures above.\n' +
    '  If Playwright could not start a browser, run: npx playwright install chromium\x1b[0m');
  process.exit(1);
}
if (smokeFailed.length) {
  console.warn(`\n\x1b[33m! The smoke test from this computer failed on ${smokeFailed.join(' and ')}, but it passed on GitHub's servers for both sites.\n` +
    "  The site works; this computer's network reaches Firebase Hosting slowly. Read the failures above if they aren't timeouts.\x1b[0m");
}

console.log(`\n✓ Shipped v${ver}: ${SITES.join(' and ')}`);
