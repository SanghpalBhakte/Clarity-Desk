// One key list: every storage key the app uses is either a DESK_DATASETS row
// (app.js: it leaves this device in a backup or the cloud copy) or a
// device-only key in tests/storage-keys.json with its reason, never both.
// The backup, restore, cloud copy, apply, change check and sign-in safety
// copy built from the rows are checked here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApp } from './app-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const J = JSON.stringify;
const reg = JSON.parse(read('tests/storage-keys.json'));

let passed = 0, failed = 0;
function check(name, problems) {
  if (problems.length === 0) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.log(`✗ [FAIL] ${name}\n    ${problems.join('\n    ')}`); }
}

// Keys used in the app's own files.
const sources = fs.readdirSync(ROOT).filter((f) => /\.(js|html)$/.test(f) && !f.includes('.example.'));
const used = new Map();
for (const f of sources) {
  for (const m of read(f).matchAll(/['"`](cos_[a-z0-9_]*)/g)) {
    if (m[1] === 'cos_') continue; // prefix scans like k.startsWith('cos_')
    if (!used.has(m[1])) used.set(m[1], f);
  }
}
const { DESK_DATASETS: allRows, deskRowsIn, deskBackupSnapshot, deskCloudCopy, restoreDeskFromBackup, signinBackupKeys, store, writes } =
  loadApp(['DESK_DATASETS', 'deskRowsIn', 'deskBackupSnapshot', 'deskCloudCopy', 'restoreDeskFromBackup', 'signinBackupKeys']);
// A row's places (`at`): each list it is in gets a whole number no other row
// in that list has.
const placesIn = (list) => allRows.filter((d) => d.at && d.at[list] != null);
check('every place in a row\'s `at` is a known list and a whole number, used once per list',
  allRows.flatMap((d) => Object.entries(d.at || {}).filter(([list, n]) => !['restore', 'cloud', 'apply', 'signin'].includes(list) || !Number.isInteger(n) || n < 1
    || placesIn(list).filter((o) => o.at[list] === n).length > 1).map(([list, n]) => `${d.backup || d.cloud}: at.${list} = ${n}`)));
const rowKeys = new Set(allRows.map((d) => d.key).filter(Boolean));
const prefixes = Object.keys(reg.prefixes || {});
const deviceOnly = (k) => k in reg.keys || prefixes.some((p) => k.startsWith(p));

check('every storage key in the app is a DESK_DATASETS row or a device-only key in tests/storage-keys.json',
  [...used].filter(([k]) => !rowKeys.has(k) && !deviceOnly(k)).map(([k, f]) => `${k} (${f}): add a row, or list it as device-only with a reason`));
check('no key is both a row and device-only',
  [...rowKeys].filter(deviceOnly).map((k) => `${k} is a DESK_DATASETS row and listed in storage-keys.json`));
check('every listed key and every row key is still used',
  [...Object.keys(reg.keys), ...prefixes, ...rowKeys].filter((k) => ![...used.keys()].some((u) => u === k || u.startsWith(k))).map((k) => `${k} is listed but no app file uses it`));
check('every device-only key says why',
  [...Object.entries(reg.keys), ...Object.entries(reg.prefixes || {})].filter(([, v]) => !v.why).map(([k]) => k));

// The backup file and restore are built from DESK_DATASETS (one row per
// backed-up key); the rows must match the keys listed with a backup field.
const rows = allRows.filter((d) => d.backup);   // backed-up rows

check('every row has its own key and backup field (only the cloud-only summary has neither)',
  (() => { const k = rows.map((d) => d.key), f = rows.map((d) => d.backup);
    return [...allRows.filter((d) => !d.backup && (d.key || !d.cloud)).map((d) => `${d.key} / ${d.cloud}: needs a backup field`),
      ...(new Set(k).size !== k.length || new Set(f).size !== f.length || k.some((x) => !x) ? [`keys ${J(k)} or fields ${J(f)} repeat or are missing`] : [])]; })());
check('every row can be read for a backup and restored from one',
  rows.filter((d) => typeof d.read !== 'function' || typeof d.restore !== 'function').map((d) => `${d.key}: needs read() and restore()`));
check('every backed-up row, and only those, has a restore place',
  allRows.filter((d) => !!d.backup !== !!(d.at && d.at.restore)).map((d) => `${d.backup || d.cloud}: backup ${d.backup}, restore place ${d.at && d.at.restore}`));

// A restore writes in that order: delete markers before tasks, the vault last
// (the order restore had before the table, kept on purpose).
{
  const backup = {
    profile: { name: 'Riya' }, tombstones: [{ id: 'x', deletedAt: Date.now() }], customTasks: [], customTimetable: { 1: [] }, timetableChoice: 'custom',
    attendance: { '2026-11-09': {} }, attendanceBaseline: {}, attendanceLive: {}, hiddenSubjects: [], stripLabels: { DS: 'DS' }, syllabus: [],
    userBatch: 'A2', attTarget: 75, holiday: { on: false }, assignmentStatuses: {}, notificationPrefs: {}, noticeChannels: { whatsappTitle: 'P' },
    theme: 'midnight-ink', accent: 'rose', customLinks: [{ subject: 'DS', code: 'DS', resources: [] }]
  };
  for (const k of Object.keys(store)) delete store[k];
  writes.length = 0;
  restoreDeskFromBackup(backup);
  const first = (k) => writes.indexOf(k);
  const want = ['cos_profile', 'cos_tombstones', 'cos_custom_tasks', 'cos_custom_timetable', 'cos_timetable_choice', 'cos_attendance', 'cos_attendance_baseline',
    'cos_attendance_live', 'cos_hidden_subjects', 'cos_strip_labels', 'cos_syllabus', 'cos_user_batch', 'cos_att_target', 'cos_holiday', 'cos_assignments',
    'cos_notif_prefs', 'cos_notice_channels', 'cos_theme', 'cos_accent', 'cos_custom_links'];
  const missing = want.filter((k) => first(k) < 0);
  const outOfOrder = want.filter((k, i) => i && first(k) < first(want[i - 1]));
  check('a restore writes the datasets in restore order, the vault last',
    [...missing.map((k) => `${k} never written`), ...outOfOrder.map((k) => `${k} written before the dataset listed ahead of it`),
     ...(writes.lastIndexOf('cos_custom_links') < Math.max(...want.slice(0, -1).map((k) => writes.lastIndexOf(k))) ? ['the vault is not written last'] : [])]);
}

// The cloud copy and applying it come from the same rows.
const synced = allRows.filter((d) => d.cloud);
check('every synced row, and only those, has a cloud place, and the cloud copy has exactly those fields in that order',
  [...allRows.filter((d) => !!d.cloud !== !!(d.at && d.at.cloud)).map((d) => `${d.backup || d.cloud}: cloud ${d.cloud}, cloud place ${d.at && d.at.cloud}`),
   ...(J(Object.keys(deskCloudCopy())) === J(deskRowsIn('cloud').map((d) => d.cloud)) ? [] : [`copy ${J(Object.keys(deskCloudCopy()))}`])]);
check('every row with an apply, and only those, has an apply place',
  allRows.filter((d) => (typeof d.apply === 'function') !== !!(d.at && d.at.apply)).map((d) => `${d.cloud || d.backup}: apply place ${d.at && d.at.apply}`));
check('a synced, stored row with no apply of its own is one the task merge covers (vault, delete markers)',
  synced.filter((d) => d.key && typeof d.apply !== 'function' && !['customLinks', 'tombstones'].includes(d.cloud)).map((d) => `${d.cloud}: nothing applies it`));

// Applying a cloud copy writes in apply order: the timetable before attendance
// (the date repair reads it), and the synced base only after all three
// attendance maps are in.
{
  const app = loadApp(['applyDeskFromCloud']);
  app.eval('state.customTasks = []');
  app.applyDeskFromCloud({ customTimetable: { 1: [] }, attendance: { '2026-11-09': {} }, attendanceBaseline: { DS: { present: 1, absent: 0 } }, attendanceLive: { DS: { present: 1 } } });
  const at = (k) => app.writes.indexOf(k);
  const order = ['cos_custom_timetable', 'cos_attendance', 'cos_attendance_baseline', 'cos_attendance_live', 'cos_sync_last_pushed'];
  check('applying a cloud copy writes the timetable, then attendance, then the synced base',
    order.filter((k, i) => at(k) < 0 || (i && at(k) < at(order[i - 1]))).map((k) => `${k} out of order: ${app.writes.join()}`));
}

check('the backup file has exactly the rows\' backup fields, in row order',
  (() => { const got = Object.keys(deskBackupSnapshot()), want = rows.map((d) => d.backup); return J(got) === J(want) ? [] : [`got ${J(got)}, want ${J(want)}`]; })());

// The sign-in safety copy: every backed-up row named once, and everything
// applying a cloud copy writes is in it (so Undo is exact).
check('only backed-up rows have a sign-in place',
  placesIn('signin').filter((d) => !d.backup).map((d) => `${d.cloud}: has a sign-in place but no backup field`));
{
  const app = loadApp(['applyDeskFromCloud', 'deskCloudCopy']);
  app.eval('state.customTasks = []');
  const full = { profile: { name: 'Riya' }, customTasks: [], customTimetable: { 1: [] }, timetableChoice: 'custom', customLinks: [], assignmentStatuses: { a: 'done' },
    attendance: { '2026-11-09': {} }, attendanceBaseline: { DS: { present: 1, absent: 0 } }, attendanceLive: { DS: { present: 1 } }, syllabus: [], theme: 'midnight-ink',
    accent: 'rose', notificationPrefs: { on: true }, noticeChannels: { whatsappTitle: 'P' }, attTarget: 70, aims: { kind: 'line', line: 70 },
    holiday: { on: true, since: '2026-12-20', until: '2027-01-04', changedAt: 1 }, tombstones: [{ id: 'gone', deletedAt: Date.now() }] };
  full.customTasks = [{ id: 't1', title: 'Read', subject: 'DS', type: 'task', updatedAt: Date.now() }];
  full.customLinks = [{ subject: 'DS', code: 'DS', resources: [{ label: 'Notes', url: 'https://example.edu', updatedAt: Date.now() }] }];
  app.applyDeskFromCloud(full);
  const safe = new Set(signinBackupKeys());
  // Every synced, stored row gets a value here, so a new one cannot slip past.
  check('applying a cloud copy only writes rows the sign-in safety copy holds',
    [...allRows.filter((d) => d.cloud && d.key && !(d.cloud in full)).map((d) => `${d.cloud}: add a value to this check's cloud copy`),
     ...[...new Set(app.writes)].filter((k) => rowKeys.has(k) && !safe.has(k)).map((k) => `${k} is written by applying but has no sign-in place (at.signin)`)]);
}

// The change check: every synced row except theme and palette counts.
{
  const fresh = loadApp(['deskCloudCopy', 'calculatePayloadHash']);   // a new phone: nothing saved
  fresh.eval('state.customTasks = []');
  const base = fresh.deskCloudCopy();
  const changed = (field, v) => fresh.calculatePayloadHash(base) !== fresh.calculatePayloadHash({ ...base, [field]: v });
  check('changing the theme or palette leaves the change check unchanged',
    [['theme', 'midnight-ink'], ['theme', 'paper-slate'], ['accent', 'rose']].filter(([f, v]) => changed(f, v)).map(([f, v]) => `${f} = ${v} changes it`));
  const samples = { profile: { name: 'Riya' }, customTasks: [{ id: 't1', title: 'Read', subject: 'DS', type: 'task' }], customTimetable: { 1: [] }, timetableChoice: 'custom',
    customLinks: [{ subject: 'DS', code: 'DS', resources: [] }], assignmentStatuses: { a: 'done' }, attendance: { d: {} }, attendanceBaseline: { DS: {} }, attendanceLive: { DS: {} },
    syllabus: [{ subjectName: 'DS', topics: [] }], notificationPrefs: { on: true }, noticeChannels: { x: 1 }, attTarget: 70, aims: { kind: 'count', count: 3 },
    holiday: { on: true }, tombstones: [{ id: 'x', deletedAt: 1 }] };
  check('a change to any other synced, stored dataset counts as new',
    allRows.filter((d) => d.cloud && d.key && !['theme', 'accent'].includes(d.cloud)).filter((d) => !(d.cloud in samples) || !changed(d.cloud, samples[d.cloud])).map((d) => `${d.cloud}: a change is not counted`));
}

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
console.log('All storage key checks passed.');
