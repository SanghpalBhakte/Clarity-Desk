// ==================================================================
// Clarity Desk: WHATSAPP DEADLINE IMPORT (deadline-import.js)
// ==================================================================
// The parser that turns a WhatsApp class-group chat into deadline rows
// for the review list. Pure functions, no DOM, so it runs here in Node.
//
// Covers: the 10 reference messages (now = 20 Oct 2026, sent 19 Oct 2026
// 9 pm), all four WhatsApp layouts (sender, sent date, multi-line text),
// DD/MM vs MM/DD detection, repeated-reminder collapse, the task-field
// mapping, the .ics export, and a 5,000-line chat in under 300 ms.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FIX = path.join(ROOT, 'tests', 'fixtures', 'deadline-import');

// package.json is "type": "commonjs", so load the browser ES module from source.
const src = fs.readFileSync(path.join(ROOT, 'deadline-import.js'), 'utf8');
const P = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? `  -> ${detail}` : ''}`); }
}

const NOW = new Date(2026, 9, 20, 10, 0);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (d) => `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
const fmtT = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const describe = (c) => c ? `${c.kind}, ${fmtDay(c.date)}, ${c.hasTime ? fmtT(c.date) + (c.end ? ' to ' + fmtT(c.end) : '') : 'all day'}` : 'nothing';
const asChat = (msg) => `19/10/26, 9:00 pm - Prof. Kulkarni: ${msg}`;

console.log('\n1. Reference messages (sent Mon 19 Oct 2026, 9 pm)');
const CASES = [
  ['Extra lecture on Wednesday, 21st of October, 10 to 12', 'lec, Wed 21 Oct, 10:00 to 12:00'],
  ['Extra lecture on Wednesday 21st Oct 10-12 in room 304', 'lec, Wed 21 Oct, 10:00 to 12:00'],
  ['DBMS practical file submission on 23/10 between 2-4', 'sub, Fri 23 Oct, 14:00 to 16:00'],
  ['Unit test 2 on Friday 11:30 am', 'exam, Fri 23 Oct, 11:30'],
  ['lecture shifted to tomorrow 3 to 5', 'lec, Tue 20 Oct, 15:00 to 17:00'],
  ['Dear students, assignment 4 last date is 28th oct. Late submissions not accepted.', 'sub, Wed 28 Oct, all day', 'assignment 4 last date'],
  ['viva on 3/11 from 10.30 to 1', 'exam, Tue 3 Nov, 10:30 to 13:00'],
  ['No lecture on Monday, holiday', 'lec, Mon 26 Oct, all day'],
  ['Journal submission last date 28th Oct before 4 pm', 'sub, Wed 28 Oct, 16:00'],
  ['ok thanks', 'nothing'],
];
for (const [msg, want, titleStart] of CASES) {
  const items = P.extractDeadlines(asChat(msg), NOW);
  const got = items.length > 1 ? `${items.length} items` : describe(items[0]);
  check(`"${msg}" -> ${want}`, got === want, got);
  if (titleStart) check(`  title starts "${titleStart}"`, !!items[0] && items[0].title.startsWith(titleStart), items[0] && items[0].title);
}

console.log('\n2. WhatsApp layouts');
for (const file of ['android.txt', 'iphone.txt', 'web-copy.txt', '24-hour.txt']) {
  const raw = fs.readFileSync(path.join(FIX, file), 'utf8');
  const { msgs, recognised } = P.splitMessages(raw);
  const teacher = msgs.find(m => m.who === 'Prof. Kulkarni');
  check(`${file}: recognised at least 2 message lines`, recognised >= 2, String(recognised));
  check(`${file}: sender read`, !!teacher, msgs.map(m => JSON.stringify(m.who)).join(', '));
  check(`${file}: sent date is 19 Oct 2026, 9:00 pm`, !!teacher && teacher.sent.getTime() === new Date(2026, 9, 19, 21, 0).getTime(), teacher && String(teacher.sent));
  const lines = teacher ? teacher.text.trim().split('\n') : [];
  check(`${file}: multi-line message kept together (3 lines)`, lines.length === 3 && lines[2].startsWith('Bring the printed copy'), JSON.stringify(lines));
  const { items } = P.scanChat(raw, NOW);
  check(`${file}: finds the submission only`, items.length === 1 && describe(items[0]) === 'sub, Fri 23 Oct, 14:00 to 16:00', items.map(describe).join(' | '));
  check(`${file}: who is kept on the candidate`, items[0] && items[0].who === 'Prof. Kulkarni');
}

console.log('\n3. Chat details');
{
  const us = ['10/19/26, 9:00 pm - A: hello', '10/25/26, 9:00 pm - A: Quiz on 10/28'].join('\n');
  const { dayFirst } = P.splitMessages(us);
  check('MM/DD chat is detected', dayFirst === false);
  const items = P.extractDeadlines(us, NOW);
  check('MM/DD chat reads 10/28 as 28 Oct', items[0] && fmtDay(items[0].date) === 'Wed 28 Oct', items.map(describe).join(' | '));

  const india = ['03/10/26, 9:00 pm - A: hello', '19/10/26, 9:00 pm - A: Quiz on 3/11'].join('\n');
  check('DD/MM is the default', P.splitMessages(india).dayFirst === true);

  const repeat = [
    '18/10/26, 9:00 pm - Prof: Reminder: assignment 4 last date is 28th oct.',
    '19/10/26, 9:00 pm - Prof: Assignment 4 last date is 28th oct.',
  ].join('\n');
  const r = P.extractDeadlines(repeat, NOW);
  check('Repeated reminder collapses into one (latest kept)', r.length === 1 && r[0].sent.getDate() === 19, r.length + ' items');

  const rel = '17/10/26, 9:00 pm - Prof: Quiz tomorrow at 10:30';
  const q = P.extractDeadlines(rel, NOW)[0];
  check('"tomorrow" is relative to the sent date, not today', q && fmtDay(q.date) === 'Sun 18 Oct', describe(q));

  const sys = '19/10/26, 9:00 pm - Prof: This message was deleted';
  check('Deleted message is skipped', P.extractDeadlines(sys, NOW).length === 0);

  check('shortTitle strips greetings', P.shortTitle('Good morning all, Notice: UT-2 timetable is out') === 'UT-2 timetable is out', P.shortTitle('Good morning all, Notice: UT-2 timetable is out'));
  check('shortTitle caps at 80 chars', P.shortTitle('Submission '.repeat(20)).length <= 80);
  check('Links are replaced in the kept text', P.extractDeadlines(asChat('Assignment due 28th Oct https://x.y/z'), NOW)[0].text.includes('[link]'));
  check('Every candidate has an id', P.extractDeadlines(asChat('Quiz on 28th oct'), NOW).every(c => typeof c.id === 'string' && c.id));
}

console.log('\n4. Task fields');
{
  const [lec] = P.extractDeadlines(asChat('Extra lecture on Wednesday 21st Oct 10-12 in room 304'), NOW);
  const f = P.candidateToTaskFields(lec);
  check('lecture -> general task, due 2026-10-21, 10:00 to 12:00, source whatsapp',
    f.taskType === 'general' && f.dueDate === '2026-10-21' && f.startTime === '10:00' && f.endTime === '12:00' && f.source === 'whatsapp', JSON.stringify(f));
  const [sub] = P.extractDeadlines(asChat('Dear students, assignment 4 last date is 28th oct. ' + 'x'.repeat(400)), NOW);
  const g = P.candidateToTaskFields(sub);
  check('submission -> assignment, all day (no time fields)', g.taskType === 'assignment' && !('startTime' in g) && !('endTime' in g), JSON.stringify(g).slice(0, 120));
  check('original message trimmed to 300 chars', g.description.length === 300);
  check('exam -> exam, presentation -> project', P.candidateToTaskFields({ kind: 'exam', date: NOW, title: 't' }).taskType === 'exam'
    && P.candidateToTaskFields({ kind: 'pres', date: NOW, title: 't' }).taskType === 'project');
}

console.log('\n5. Calendar export');
{
  const items = P.extractDeadlines([
    asChat('Extra lecture on Wednesday 21st Oct 10-12 in room 304'),
    asChat('Dear students, assignment 4 last date is 28th oct, no extensions; okay?'),
  ].join('\n'), NOW);
  const ics = P.buildIcs(items, NOW);
  check('one VEVENT per item', (ics.match(/BEGIN:VEVENT/g) || []).length === 2);
  check('timed event uses TZID Asia/Kolkata', ics.includes('DTSTART;TZID=Asia/Kolkata:20261021T100000') && ics.includes('DTEND;TZID=Asia/Kolkata:20261021T120000'));
  check('all-day event uses VALUE=DATE', ics.includes('DTSTART;VALUE=DATE:20261028') && ics.includes('DTEND;VALUE=DATE:20261029'));
  check('text is escaped', ics.includes('\\,') && ics.includes('\\;'));
  check('CRLF line endings, no line over 75 octets', ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75) && !/[^\r]\n/.test(ics));
}

console.log('\n6. Privacy and worker');
{
  check('parser makes no network or storage calls', !/\b(fetch|XMLHttpRequest|localStorage|indexedDB|sendBeacon|console\.)/.test(src));
  const worker = fs.readFileSync(path.join(ROOT, 'deadline-import-worker.js'), 'utf8');
  check('worker imports scanChat from deadline-import.js', /import\s*\{\s*scanChat\s*\}\s*from\s*'\.\/deadline-import\.js'/.test(worker));
  check('worker makes no network or storage calls', !/\b(fetch|XMLHttpRequest|localStorage|indexedDB|sendBeacon|console\.)/.test(worker));
}

console.log('\n7. Speed');
{
  const samples = [
    'ok thanks', 'Extra lecture on Wednesday 21st Oct 10-12 in room 304', 'anyone has the notes?',
    'DBMS practical file submission on 23/10 between 2-4', 'Unit test 2 on Friday 11:30 am', 'lol',
    'Dear students, assignment 4 last date is 28th oct. Late submissions not accepted.', 'see you tomorrow',
  ];
  const lines = [];
  let t = new Date(2026, 6, 1, 8, 0);
  while (lines.length < 5000) {
    const i = lines.length;
    t = new Date(t.getTime() + 37 * 60 * 1000);
    const h = t.getHours(), hh = h % 12 || 12, ap = h < 12 ? 'am' : 'pm';
    const d = `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/26`;
    lines.push(`${d}, ${hh}:${String(t.getMinutes()).padStart(2, '0')} ${ap} - Student ${i % 40}: ${samples[i % samples.length]}`);
    if (i % 10 === 0) lines.push('and one more line of the same message');
  }
  const raw = lines.slice(0, 5000).join('\n');
  P.scanChat(raw, NOW); // warm up
  const t0 = performance.now();
  const res = P.scanChat(raw, NOW);
  const ms = performance.now() - t0;
  check(`5,000-line chat parses in under 300 ms (${ms.toFixed(1)} ms, ${res.items.length} found)`, ms < 300 && res.items.length > 0);
}

console.log('\n8. Task schema (sanitizeTask in app.js)');
{
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const fnSrc = appSrc.match(/const VALID_TASK_TYPES[\s\S]*?\nfunction sanitizeTask\(t\) \{[\s\S]*?\n\}\n/)[0];
  const sanitizeTask = new Function(`const todayStr = () => '2026-10-20';\n${fnSrc}\nreturn sanitizeTask;`)();
  const old = { id: 'c-1', subject: 'DBMS', code: 'CS301', title: 'Lab 3', taskType: 'lab', dueDate: '2026-10-22', priority: 'high', status: 'pending', marks: 5 };
  const oldOut = sanitizeTask(old);
  check('an existing task keeps exactly its old keys', JSON.stringify(Object.keys(oldOut)) === JSON.stringify(['id', 'subject', 'code', 'title', 'taskType', 'noDeadline', 'description', 'dueDate', 'priority', 'status', 'marks', 'isCustom']), Object.keys(oldOut).join(','));
  const wa = sanitizeTask({ ...old, source: 'whatsapp', startTime: '10:00', endTime: '12:00' });
  check('source, startTime and endTime survive a save', wa.source === 'whatsapp' && wa.startTime === '10:00' && wa.endTime === '12:00');
  const bad = sanitizeTask({ ...old, source: 'evil', startTime: '25:00', endTime: '09:00' });
  check('unknown source and invalid times are dropped', !('source' in bad) && !('startTime' in bad) && !('endTime' in bad));
  const backwards = sanitizeTask({ ...old, startTime: '14:00', endTime: '13:00' });
  check('end time before start is dropped, start kept', backwards.startTime === '14:00' && !('endTime' in backwards));
  const ongoing = sanitizeTask({ ...old, taskType: 'mission', dueDate: '', startTime: '10:00' });
  check('no-deadline tasks never carry a time', !('startTime' in ongoing));
}

console.log('\n9. Share target and offline');
{
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const st = manifest.share_target || {};
  check('manifest share_target posts multipart to ./share-target', st.action === './share-target' && st.method === 'POST' && st.enctype === 'multipart/form-data');
  const accept = (st.params && st.params.files && st.params.files[0] && st.params.files[0].accept) || [];
  check('share_target accepts text/plain and zip files plus text', accept.includes('text/plain') && accept.includes('application/zip') && st.params.text === 'text');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check('sw.js handles POST /share-target before the GET-only guard', sw.indexOf("endsWith('/share-target')") > -1 && sw.indexOf("endsWith('/share-target')") < sw.indexOf("if (e.request.method !== 'GET') return;"));
  const shareBlock = sw.slice(sw.indexOf('let pendingShare'), sw.indexOf("self.addEventListener('fetch'"));
  check('shared chat is never written to the Cache API or storage', !/caches\.|cache\.put|indexedDB|localStorage/.test(shareBlock));
  for (const f of ['./deadline-import.js', './deadline-import-worker.js', './vendor/jszip.min.js']) {
    check(`sw.js precaches ${f} for offline use`, sw.includes(`'${f}'`));
  }
  check('vendored JSZip is present', fs.existsSync(path.join(ROOT, 'vendor', 'jszip.min.js')));
  const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const waBlock = appSrc.slice(appSrc.indexOf('// ── Import from WhatsApp'), appSrc.indexOf('// Android share target: sw.js'));
  check('import screen never stores, sends or logs the chat', !/localStorage|safeSetStorage|indexedDB|fetch\(|sendBeacon|console\./.test(waBlock));
  check('import saves through saveCustomTasks()', /saveCustomTasks\(\)/.test(waBlock));
  check('no em dashes in import UI copy', !/—/.test(waBlock.replace(/^\s*\/\/.*$/gm, '')));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
