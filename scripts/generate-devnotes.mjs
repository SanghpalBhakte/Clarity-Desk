#!/usr/bin/env node
// scripts/generate-devnotes.mjs
//
// Regenerates the "Dev Notes" changelog (DEV_UPDATES in data.js) from real
// git commits, so it stops being a hand-maintained array that goes stale.
//
// Usage:
//   node scripts/generate-devnotes.mjs             regenerate for real, advance the state marker
//   node scripts/generate-devnotes.mjs --dry-run    preview only, touches no files
//   node scripts/generate-devnotes.mjs --since <sha> [--dry-run]
//                                                    override the starting commit (for testing/backfill)
//
// Run this before `firebase deploy --only hosting` so Dev Notes reflects what
// actually shipped (npm run devnotes).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data.js');
const STATE_FILE = path.join(ROOT, '.devnotes-state.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const sinceIdx = args.indexOf('--since');
const sinceOverride = sinceIdx !== -1 ? args[sinceIdx + 1] : null;

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(sha) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ lastSha: sha, updatedAt: new Date().toISOString() }, null, 2) + '\n'
  );
}

function currentHeadSha() {
  return execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim();
}

const state = readState();
const sinceSha = sinceOverride || (state && state.lastSha) || null;

if (!sinceSha) {
  console.error(
    'No starting point found. Create .devnotes-state.json (see scripts/generate-devnotes.mjs header) ' +
    'or run once with --since <sha>.'
  );
  process.exit(1);
}

const head = currentHeadSha();
if (sinceSha === head) {
  console.log(`Dev Notes already up to date with HEAD (${head.slice(0, 7)}). Nothing to do.`);
  process.exit(0);
}

// One record per commit, oldest first, merges skipped.
const SEP1 = '\x1f';
const SEP2 = '\x1e';
const raw = execSync(
  `git log --no-merges --date=short --pretty=format:"%H${SEP1}%ad${SEP1}%s${SEP1}%b${SEP2}" --reverse ${sinceSha}..${head}`,
  { cwd: ROOT, maxBuffer: 1024 * 1024 * 16 }
).toString();

const commits = raw
  .split(SEP2)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((rec) => {
    const [hash, date, subject, body] = rec.split(SEP1);
    return { hash, date, subject: (subject || '').trim(), body: (body || '').trim() };
  });

// Skip housekeeping-only commits -- nothing a student user would care about.
const SKIP_PATTERNS = [/^wip\b/i, /^chore:/i, /^test:/i, /^merge\b/i, /^bump\b/i];
const relevant = commits.filter((c) => !SKIP_PATTERNS.some((re) => re.test(c.subject)));

if (!relevant.length) {
  console.log(`No user-facing commits between ${sinceSha.slice(0, 7)} and ${head.slice(0, 7)}.`);
  if (!sinceOverride) writeState(head);
  process.exit(0);
}

const TAG_RULES = [
  { re: /^(fix|revert)\b/i, tag: 'Fix', tagColor: 'var(--red)' },
  { re: /^(add|new|introduce)\b/i, tag: 'Feature', tagColor: 'var(--accent)' },
  { re: /^(redesign|rework|rebuild|improve|simplify)\b/i, tag: 'Improvement', tagColor: 'var(--green)' },
  { re: /^(polish|refine|style|design)\b/i, tag: 'Design', tagColor: 'var(--yellow)' },
];
function classify(subject) {
  for (const rule of TAG_RULES) {
    if (rule.re.test(subject)) return rule;
  }
  return { tag: 'Update', tagColor: 'var(--blue)' };
}

function stripFooter(body) {
  return body
    .split('\n')
    .filter((line) => !/^Co-Authored-By:/i.test(line.trim()) && !/^Claude-Session:/i.test(line.trim()))
    .join('\n')
    .trim();
}

function toPoints(subject, cleanBody) {
  const bulletLines = cleanBody
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, ''));
  if (bulletLines.length) return bulletLines;

  const prose = cleanBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^[-*]\s+/.test(l));
  if (prose.length) return prose;

  return [subject];
}

function toSummary(subject, cleanBody) {
  const firstProseLine = cleanBody
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^[-*]\s+/.test(l));
  return firstProseLine || subject;
}

// Existing ids look like 'u1'..'u6' -- find the next free number.
const existingSrc = fs.readFileSync(DATA_FILE, 'utf8');
const idNums = [...existingSrc.matchAll(/id:\s*['"]u(\d+)['"]/g)].map((m) => parseInt(m[1], 10));
let nextIdNum = (idNums.length ? Math.max(...idNums) : 0) + 1;

const newEntries = relevant
  .map((c) => {
    const cleanBody = stripFooter(c.body);
    const { tag, tagColor } = classify(c.subject);
    return {
      id: `u${nextIdNum++}`,
      date: c.date,
      title: c.subject,
      category: tag,
      tag,
      tagColor,
      summary: toSummary(c.subject, cleanBody),
      points: toPoints(c.subject, cleanBody),
    };
  })
  .reverse(); // newest first, matching the existing array's order

function entryToJs(e) {
  const pointsJs = e.points.map((p) => `      ${JSON.stringify(p)}`).join(',\n');
  return `  {
    id: ${JSON.stringify(e.id)},
    date: ${JSON.stringify(e.date)},
    title: ${JSON.stringify(e.title)},
    category: ${JSON.stringify(e.category)},
    tag: ${JSON.stringify(e.tag)},
    tagColor: ${JSON.stringify(e.tagColor)},
    summary: ${JSON.stringify(e.summary)},
    points: [
${pointsJs}
    ]
  }`;
}

const newEntriesJs = newEntries.map(entryToJs).join(',\n');

console.log(
  `Found ${newEntries.length} new Dev Notes entr${newEntries.length === 1 ? 'y' : 'ies'} ` +
    `(${sinceSha.slice(0, 7)}..${head.slice(0, 7)}):`
);
newEntries.forEach((e) => console.log(`  - [${e.date}] ${e.title}`));

if (DRY_RUN) {
  console.log('\n--dry-run: no files changed.');
  process.exit(0);
}

const marker = 'export const DEV_UPDATES = [';
if (!existingSrc.includes(marker)) {
  console.error('Could not find "export const DEV_UPDATES = [" in data.js -- aborting without changes.');
  process.exit(1);
}
const updatedSrc = existingSrc.replace(marker, `${marker}\n${newEntriesJs},`);
fs.writeFileSync(DATA_FILE, updatedSrc);

if (!sinceOverride) writeState(head);

console.log('\ndata.js updated. Review the new entries, then commit and deploy.');
