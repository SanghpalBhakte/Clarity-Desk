// ==================================================================
// Clarity Desk: DEV NOTES GENERATOR TEXT
// ==================================================================
// Commit bodies are hard-wrapped at ~72 columns. The generator used to
// turn each wrapped line into its own point (notes ending mid-sentence,
// u33/u34) and repeated the summary as the first point (u38). Feeds
// made-up commit bodies through the real helper and checks the result.
// ==================================================================
import fs from 'fs';
import { stripFooter, toSummaryAndPoints } from '../scripts/devnotes-text.mjs';

let failed = 0;
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`); }
}
const show = (v) => JSON.stringify(v);

console.log('Dev Notes generator text');

// 1. Wrapped bullets become whole points; wrapped prose is the summary.
{
  const body = stripFooter(`The timetable now remembers your last week
view after a reload.

- Opening the app on a Sunday shows next
  week instead of an empty grid.
* Labs that run over two slots show as one
  block, with the room on the second line.

Co-Authored-By: Someone <x@example.com>
Claude-Session: https://example.com/s`);
  const { summary, points } = toSummaryAndPoints('Timetable remembers your week', body);
  check('summary is the whole first sentence',
    summary === 'The timetable now remembers your last week view after a reload.', show(summary));
  check('two bullets, each a whole sentence', show(points) === show([
    'Opening the app on a Sunday shows next week instead of an empty grid.',
    'Labs that run over two slots show as one block, with the room on the second line.',
  ]), show(points));
  check('footer lines dropped', !points.some((p) => /Co-Authored-By|Claude-Session/.test(p)));
}

// 2. Prose only, no blank lines (the u38 case): summary not repeated.
{
  const body = `A mark you cleared used to come back after the next sync.
Deleted +1 taps came back the same way.
Now each delete is sent to your cloud copy too.`;
  const { summary, points } = toSummaryAndPoints('Clearing a mark stays cleared', body);
  check('u38 case: summary is the first sentence',
    summary === 'A mark you cleared used to come back after the next sync.', show(summary));
  check('u38 case: summary is not the first point', points[0] !== summary, show(points));
  check('u38 case: rest joined into one whole point', show(points) === show([
    'Deleted +1 taps came back the same way. Now each delete is sent to your cloud copy too.',
  ]), show(points));
}

// 3. Wrapped prose paragraphs separated by blank lines (the u33 case).
{
  const body = `The browser console showed an error on every load
because an optional file was missing.

The app now only asks for that file when you
run it on your own computer.

Nothing changes for students.`;
  const { summary, points } = toSummaryAndPoints('Fixed a console error', body);
  check('u33 case: summary is a whole sentence',
    summary === 'The browser console showed an error on every load because an optional file was missing.', show(summary));
  check('u33 case: one point per paragraph, none cut off', show(points) === show([
    'The app now only asks for that file when you run it on your own computer.',
    'Nothing changes for students.',
  ]), show(points));
}

// 4. No body: subject is the summary and is not repeated as a point.
{
  const { summary, points } = toSummaryAndPoints('Polish the settings page', '');
  check('empty body: summary is the subject', summary === 'Polish the settings page', show(summary));
  check('empty body: subject not repeated as a point', !points.includes(summary), show(points));
}

// 5. Every point in every case ends like a sentence (no mid-sentence cut).
{
  const body = `- First change wraps
  over three
  lines.
- Second change.`;
  const { points } = toSummaryAndPoints('Two changes', body);
  check('points end with punctuation', points.every((p) => /[.!?]$/.test(p)), show(points));
  check('subject used as summary when body is only bullets',
    toSummaryAndPoints('Two changes', body).summary === 'Two changes');
}

// 6. Tooling-only commits never become Dev Notes, with or without a scope.
{
  const src = fs.readFileSync(new URL('../scripts/generate-devnotes.mjs', import.meta.url), 'utf8');
  const SKIP = eval(src.match(/const SKIP_PATTERNS = (\[[^\n]*\]);/)[1]);
  const skipped = (subj) => SKIP.some((re) => re.test(subj));
  check('skips Dependabot "chore(deps-dev): ..."', skipped('chore(deps-dev): bump the dev-dependencies group with 2 updates'));
  check('skips chore:, test:, build(deps):, ci:', ['chore: bump the cache version', 'test: add checks', 'build(deps): bump x', 'ci: speed up'].every(skipped));
  check('keeps student-facing subjects', !skipped('Class reminders now arrive when the app is closed') && !skipped('Choreography club notices now show'));
}

// 7. No "(vN)" label on Dev Notes: ship no longer adds it, and older notes
// show without it (the card already shows the date).
{
  const ship = fs.readFileSync(new URL('../scripts/ship.mjs', import.meta.url), 'utf8');
  check('ship does not add "(vN)" to the commit message', !/message \+= ` \(v\$\{ver\}\)`/.test(ship));
  const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const devNoteText = eval(`(${app.match(/function devNoteText\(s\) \{[\s\S]*?\n\}/)[0]})`);
  check('old "(v194)" label is hidden', devNoteText('The countdown now works for any exam. (v194)') === 'The countdown now works for any exam.');
  check('text without a label is unchanged', devNoteText('Holiday mode now has start and end dates') === 'Holiday mode now has start and end dates');
  check('"(v2)" in the middle is kept', devNoteText('Attendance (v2) math is faster.') === 'Attendance (v2) math is faster.');
  check('cards use it for title and summary', (app.match(/escHtml_cd\(devNoteText\(item\.(title|summary)\)\)/g) || []).length === 2);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
