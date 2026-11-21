// ==================================================================
// Clarity Desk: what a full desk turns into, saved (issue #402)
// ==================================================================
// One sample desk with every dataset filled in. This records what today's
// app makes of it: the backup file, the cloud copy, the change check and
// the sign-in safety copy. The work in #401 builds these from one dataset
// table; until it is finished they must stay exactly as saved here.
//
// Saved outputs: tests/golden/desk-saved-outputs.json. After a change that
// is MEANT to alter one of them, refresh with
//   UPDATE_GOLDEN=1 node tests/verify_desk_saved_outputs.mjs
// and say why in the PR. Names, ids and dates are made up.
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadApp } from './app-loader.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GOLDEN = path.join(ROOT, 'tests/golden/desk-saved-outputs.json');
const J = JSON.stringify;

const DS = { subject: 'Data Structures', code: 'DS', time: '10:00', end: '11:00', type: 'lecture', batches: [], room: 'B-204', teacher: 'Prof. Rao' };
const LAB = { subject: 'DS Lab', code: 'DSL', time: '13:30', end: '15:30', type: 'lab', batches: ['A2'] };
const OS = { subject: 'Operating Systems', code: 'OS', time: '11:15', end: '12:15', type: 'lecture', batches: [] };
const task = (id, over) => ({ id, subject: 'Data Structures', code: 'DS', title: `Task ${id}`, taskType: 'assignment', noDeadline: false, description: '—', dueDate: '2026-11-14', priority: 'medium', status: 'pending', marks: 0, isCustom: true, updatedAt: 1794200000000, ...over });

export const SAMPLE_DESK = {
  cos_profile: J({ name: 'Riya', college: 'Sample College', branch: 'CSE', year: 'SE', rollNo: '42', batch: 'A2', examDate: '2026-12-01', examLabel: 'End-Sem', studyMode: '' }),
  cos_custom_tasks: J([
    task('t-lab', { title: 'DS lab record', firstStep: 'Print the first two programs' }),
    task('t-quiz', { subject: 'Operating Systems', code: 'OS', title: 'OS quiz', taskType: 'quiz', dueDate: '2026-11-08', priority: 'high' }),
    task('t-read', { title: 'Read chapter 4', noDeadline: true, dueDate: '', checkins: ['2026-11-08', '2026-11-09'] })
  ]),
  cos_assignments: J({ 't-old': 'submitted' }),
  // One deleted 3 days ago (kept), one 40 days ago (past the 30-day limit: dropped from backup and cloud).
  cos_tombstones: J([{ id: 't-gone', deletedAt: 1794000000000 }, { id: 't-long-gone', deletedAt: 1790829000000 }]),
  cos_custom_timetable: J({ 1: [DS, LAB], 2: [OS], 3: [DS, OS], 4: [], 5: [OS], 6: [], 0: [] }),
  cos_timetable_choice: 'custom',
  cos_user_batch: 'A2',
  cos_hidden_subjects: J(['Environmental Studies']),
  cos_attendance: J({ '2026-11-09': { DS_1000: 'attended', DSL_1330: 'skipped' }, '2026-11-10': { DS_1000: 'attended' } }),
  cos_attendance_baseline: J({ DS: { subjectName: 'Data Structures', present: 18, absent: 4 }, OS: { subjectName: 'Operating Systems', present: 12, absent: 6 } }),
  cos_attendance_live: J({ DS: { present: 2 }, OS: { present: 1 } }),
  cos_custom_links: J([
    { subject: 'Data Structures', code: 'DS', color: '#394B63', resources: [
      { label: 'Course page', url: 'https://example.edu/ds', icon: 'link' },
      { label: 'unit1.pdf', url: 'data:application/pdf;base64,JVBERi0xLjQK', icon: 'book-open', isUpload: true, fileSize: '9 B', fileId: 'f-unit1', mime: 'application/pdf' }
    ] }
  ]),
  cos_syllabus: J([{ subjectName: 'Data Structures', examDate: '2026-12-01', topics: [
    { id: 'tp1', title: 'Stacks', status: 'done', doneAt: '2026-11-02', importance: 3, marks: 10 },
    { id: 'tp2', title: 'Queues', status: 'revised', doneAt: '2026-11-05' },
    { id: 'tp3', title: 'Trees', status: 'todo', importance: 1 }
  ] }]),
  cos_att_target: '75',
  cos_aims: J({ v: 1, kind: 'finish', line: 75, by: '2026-11-30', scope: '', subjects: { DS: 80 } }),
  // A planned break (starts later), switched on 2 days ago.
  cos_holiday: J({ on: true, since: '2026-12-20', until: '2027-01-04', changedAt: 1794100000000 }),
  cos_strip_labels: J({ 'Data Structures': 'DSA' }),
  cos_notif_prefs: J({ taskUpcoming: 'day_before', taskOverdue: 'daily', classReminders: '10', attendanceAlerts: 'on', ongoingNudges: 'off', ongoingNudgeTime: '18:00' }),
  cos_notice_channels: J({ whatsappTitle: 'College portal', whatsappUrl: 'https://portal.example.edu' }),
  cos_theme: 'midnight-ink',
  cos_accent: 'lavender'
};

// The four outputs, from a fresh app on the sample desk.
function deskOutputs(store = SAMPLE_DESK) {
  const sets = [];
  globalThis.firebase = { firestore: { FieldValue: { delete: () => ({ __delete: true }), serverTimestamp: () => 'server-time' }, FieldPath: class {} } };
  const ref = { set: (p) => { sets.push(JSON.parse(J(p))); return Promise.resolve(); }, update: () => Promise.resolve() };
  const app = loadApp(['exportData', 'pushLocalDataToCloud', 'calculatePayloadHash', 'saveSigninBackup', 'safeGetStorage'], { store });
  app.eval('state.customTasks = loadCustomTasks()');

  let backup = null;
  globalThis.__deskBackup = (d) => { backup = JSON.parse(J(d)); };
  app.eval('downloadBackupFile = (d) => globalThis.__deskBackup(d)');
  app.exportData();

  globalThis.__deskDb = { collection: () => ({ doc: () => ref }) };
  app.eval('db = globalThis.__deskDb; currentUser = { uid: "u1" }; signinSeen = () => true');
  app.pushLocalDataToCloud('u1');
  const cloud = sets[0];

  app.saveSigninBackup('u1');
  return { app, backup, cloud, changeCheck: app.calculatePayloadHash(cloud), signinCopy: app.safeGetStorage('cos_signin_backup', null) };
}

let total = 0, passed = 0;
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else console.error(`✗ [FAIL] ${name}: ${res}`);
  } catch (err) { console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

const out = deskOutputs();
// cos_aims holds one aim at a time, so each kind gets its own run of the same desk.
const AIMS = {
  line: { v: 1, kind: 'line', line: 80, subjects: { DS: 85, OS: 70 } },
  count: { v: 1, kind: 'count', line: 75, count: 4, subjects: {} },
  rhythm: { v: 1, kind: 'rhythm', line: 75, goal: 't-read', times: 3, subjects: {} },
  finish: { v: 1, kind: 'finish', line: 75, by: '2026-11-30', scope: 'datastructures', subjects: { DS: 80 } }
};
const aimsByKind = Object.fromEntries(Object.entries(AIMS).map(([kind, aim]) => {
  const o = deskOutputs({ ...SAMPLE_DESK, cos_aims: J(aim), cos_att_target: String(aim.line) });
  return [kind, { backup: o.backup.aims, cloud: o.cloud.aims, attTarget: o.cloud.attTarget, changeCheck: JSON.parse(o.changeCheck).am }];
}));
const saved = { backup: out.backup, cloud: out.cloud, changeCheck: out.changeCheck, signinCopy: out.signinCopy, aimsByKind };
const text = J(saved, null, 2) + '\n';

if (process.env.UPDATE_GOLDEN) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, text);
  console.log(`Saved outputs written to ${path.relative(ROOT, GOLDEN)}`);
}
if (!fs.existsSync(GOLDEN)) {
  console.error(`✗ ${path.relative(ROOT, GOLDEN)} is missing: run UPDATE_GOLDEN=1 node tests/verify_desk_saved_outputs.mjs once and commit it`);
  process.exit(1);
}
const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

// What a student would notice, checked against the spec rather than the code.
check('the backup holds every dataset of the desk', () => {
  const want = ['profile', 'customTasks', 'tombstones', 'customTimetable', 'timetableChoice', 'customLinks', 'assignmentStatuses',
    'attendance', 'attendanceBaseline', 'attendanceLive', 'hiddenSubjects', 'syllabus', 'userBatch', 'attTarget', 'aims',
    'holiday', 'stripLabels', 'notificationPrefs', 'noticeChannels', 'theme', 'accent', 'exportedAt'];
  const got = Object.keys(out.backup);
  return J(got) === J(want) || `fields: ${J(got)}`;
});
check('the backup keeps the vault file itself; the cloud copy gets a placeholder', () => {
  const inBackup = out.backup.customLinks[0].resources[1].url;
  const inCloud = out.cloud.customLinks[0].resources[1];
  return inBackup.startsWith('data:') && !String(inCloud.url || '').startsWith('data:') ? true : J({ inBackup, inCloud });
});
check('strip names, hidden subjects and lab group are backed up but not synced', () => {
  const b = out.backup, c = out.cloud;
  return b.stripLabels.DS === undefined && b.stripLabels['Data Structures'] === 'DSA' && b.userBatch === 'A2' && b.hiddenSubjects.length === 1
    && !('stripLabels' in c) && !('userBatch' in c) && !('hiddenSubjects' in c) ? true : J({ b: [b.stripLabels, b.userBatch], c: Object.keys(c) });
});
check('the cloud copy carries an attendance summary the backup does not', () =>
  'attSummary' in out.cloud && !('attSummary' in out.backup) || Object.keys(out.cloud).join());
check('the change check ignores theme and palette', () => {
  const other = { ...out.cloud, theme: 'paper-slate', accent: 'rose' };
  return out.app.calculatePayloadHash(other) === out.changeCheck || 'theme changed the check';
});
check('the change check moves when a mark changes', () => {
  const other = { ...out.cloud, attendance: { ...out.cloud.attendance, '2026-11-10': { DS_1000: 'skipped' } } };
  return out.app.calculatePayloadHash(other) !== out.changeCheck || 'a new mark left the check the same';
});
check('the sign-in safety copy holds the stored strings, the vault without file bytes', () => {
  const k = out.signinCopy.keys;
  return k.cos_strip_labels === SAMPLE_DESK.cos_strip_labels && k.cos_theme === 'midnight-ink' && !k.cos_custom_links.includes('data:')
    && !('cos_user_batch' in k) ? true : J(Object.keys(k));
});

check('a recent delete marker reaches the backup and the cloud; one past 30 days does not', () => {
  const ids = (l) => J((l || []).map(t => t.id));
  return ids(out.backup.tombstones) === '["t-gone"]' && ids(out.cloud.tombstones) === '["t-gone"]' || J([out.backup.tombstones, out.cloud.tombstones]);
});
check('syllabus progress survives: done, revised and not started', () => {
  const st = (o) => o.syllabus[0].topics.map(t => t.status).join();
  return st(out.backup) === 'done,revised,todo' && st(out.cloud) === 'done,revised,todo' || J([st(out.backup), st(out.cloud)]);
});
check('every aim kind is kept as its own kind', () =>
  Object.entries(aimsByKind).every(([k, v]) => v.backup.kind === k && v.cloud.kind === k) || J(aimsByKind));

// Exactly as saved.
for (const name of ['backup', 'cloud', 'changeCheck', 'signinCopy', 'aimsByKind']) {
  check(`the ${name} matches the saved output exactly`, () => {
    const a = J(saved[name], null, 2), b = J(golden[name], null, 2);
    if (a === b) return true;
    const i = [...a].findIndex((ch, n) => ch !== b[n]);
    return `first difference at character ${i}: now …${a.slice(Math.max(0, i - 60), i + 60)}… saved …${b.slice(Math.max(0, i - 60), i + 60)}…`;
  });
}
check('a second run gives the same outputs (nothing depends on the real clock)', () => {
  const again = deskOutputs();
  return J([again.backup, again.cloud, again.changeCheck, again.signinCopy]) === J([out.backup, out.cloud, out.changeCheck, out.signinCopy]) || 'outputs differ between runs';
});

console.log(`\nPASSED: ${passed}/${total}`);
if (passed !== total) process.exit(1);
