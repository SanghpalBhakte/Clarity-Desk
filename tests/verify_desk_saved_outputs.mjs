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
  const app = loadApp(['exportData', 'pushLocalDataToCloud', 'calculatePayloadHash', 'saveSigninBackup', 'safeGetStorage', 'localDeskHash', 'localHasData'], { store });
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
  return { app, backup, cloud, changeCheck: app.calculatePayloadHash(cloud), signinCopy: app.safeGetStorage('cos_signin_backup', null),
    localChangeCheck: app.localDeskHash(), localHasData: app.localHasData() };
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
const AIMS_LINE_80 = J({ v: 1, kind: 'line', line: 80, subjects: {} });
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
// Restore: the saved backup file put back on an empty phone. Every stored key
// afterwards (raw strings, sorted), and the toast the student sees.
async function restoredDesk(backup, store) {
  globalThis.FileReader = class { readAsText() { Promise.resolve().then(() => this.onload({ target: { result: J(backup) } })); } };
  const toasts = [];
  globalThis.__deskToast = (msg, kind) => toasts.push(`${kind}: ${msg}`);
  const app = loadApp(['importData'], { store });
  app.eval('renderSettings = () => {}; showToast = (msg, kind) => globalThis.__deskToast(msg, kind)');
  app.importData({ target: { files: [{}] } });
  for (let i = 0; i < 50 && !toasts.length; i++) await new Promise(r => setImmediate(r));
  return { store: Object.fromEntries(Object.keys(app.store).sort().map(k => [k, app.store[k]])), toasts };
}
const restored = await restoredDesk(out.backup);
// An older backup file (before strip names, aims and delete markers) restored
// on a phone that has them: they stay as they were.
const OLD_BACKUP = Object.fromEntries(Object.entries(out.backup).filter(([k]) => !['stripLabels', 'aims', 'tombstones'].includes(k)));
const restoredOld = await restoredDesk(OLD_BACKUP, { cos_strip_labels: J({ 'Operating Systems': 'OSY' }), cos_aims: AIMS_LINE_80, cos_att_target: '80', cos_tombstones: J([{ id: 't-kept', deletedAt: 1794100000000 }]) });
// Apply: a cloud copy put on a phone, the way a snapshot from the account
// lands (applyCloudDataInner, as applyCloudDataToLocalState calls it). Every
// stored key afterwards (raw strings, sorted) and whether a push was asked for.
function appliedDesk(cloud, store, { keepLocal = false } = {}) {
  const app = loadApp(['applyCloudDataInner'], { store });
  app.eval('state.currentPage = "none"; state.customTasks = loadCustomTasks()');
  if (keepLocal) app.eval('keepLocalWhole = true');
  let pushes = 0;
  globalThis.__deskPush = () => { pushes++; };
  app.eval('syncToCloud = () => globalThis.__deskPush()');
  app.applyCloudDataInner(JSON.parse(J(cloud)));
  return { store: Object.fromEntries(Object.keys(app.store).sort().map(k => [k, app.store[k]])), pushAsked: pushes > 0 };
}
// A phone with its own desk: its own theme and palette, a holiday switched
// after the cloud's, one task and one vault link the cloud lacks, a name only.
const LIVED_IN = {
  cos_profile: J({ name: 'Riya S', college: '' }),
  cos_theme: 'paper-slate', cos_accent: 'rose',
  cos_holiday: J({ on: false, since: '', until: '', changedAt: 1794200000000 }),
  cos_custom_tasks: J([task('t-local', { title: 'Only on this phone', updatedAt: 1794250000000 })]),
  cos_custom_links: J([{ subject: 'Operating Systems', code: 'OS', color: '#394B63', resources: [{ label: 'OS notes', url: 'https://example.edu/os', icon: 'link' }] }]),
  cos_custom_timetable: J({ 1: [OS], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] }),
  cos_attendance: J({ '2026-11-10': { OS_1115: 'attended' } }),
  cos_att_target: '80'
};
const applied = {
  freshPhone: appliedDesk(out.cloud),
  livedIn: appliedDesk(out.cloud, LIVED_IN),
  livedInKeepLocal: appliedDesk(out.cloud, LIVED_IN, { keepLocal: true }),
  // An aim line outside 50-100 and a theme name from an old version.
  oddValues: appliedDesk({ ...out.cloud, attTarget: 120, theme: 'dark' })
};
// Rule cases on a small cloud copy, each with one thing to look at.
const without = (o, ...keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const rules = {
  // Over-long fields are cut; a field the cloud lacks keeps this phone's value.
  profile: appliedDesk({ profile: { name: 'R'.repeat(120), rollNo: '9'.repeat(70), college: '' } },
    { cos_profile: J({ name: 'Riya', college: 'Sample College', batch: 'A2' }) }),
  // No aim in the copy, so only the aim line rule decides.
  lineTooHigh: appliedDesk({ attTarget: 120 }, { cos_att_target: '80' }),
  lineTooLow: appliedDesk({ attTarget: 40 }, { cos_att_target: '80' }),
  lineInRange: appliedDesk({ attTarget: 70 }, { cos_att_target: '80' }),
  // The cloud's holiday is newer than this phone's: it replaces it, no push.
  holidayNewerInCloud: appliedDesk({ holiday: { on: true, since: '2026-12-20', until: '2027-01-04', changedAt: 1794200000000 } },
    { cos_holiday: J({ on: false, since: '', until: '', changedAt: 1794100000000 }) }),
  // This phone's holiday is newer and nothing else differs: kept, and one push.
  holidayNewerHere: appliedDesk({ holiday: { on: false, since: '', until: '', changedAt: 1794100000000 } },
    { cos_holiday: J({ on: true, since: '2026-12-20', until: '2027-01-04', changedAt: 1794200000000 }) })
};
// "Does this desk hold the student's own data?" (the first sign-in question
// is asked only when both this phone and the account say yes).
const hasDataCases = {
  empty: {},
  onlyProfileAndTheme: { profile: { name: 'Riya' }, theme: 'midnight-ink', syllabus: [{ subjectName: 'DS', topics: [] }] },
  emptyVaultSection: { customLinks: [{ subject: 'DS', code: 'DS', resources: [] }] },
  vaultLink: { customLinks: [{ subject: 'DS', code: 'DS', resources: [{ label: 'x', url: 'https://example.edu' }] }] },
  emptyTimetableDays: { customTimetable: { 1: [], 2: [] } },
  timetableClass: { customTimetable: { 1: [DS] } },
  oneTask: { customTasks: [task('t1')] },
  emptyAttendanceMaps: { attendance: {}, attendanceBaseline: {}, attendanceLive: {} },
  baselineOnly: { attendanceBaseline: { DS: { present: 1, absent: 0 } } },
  liveOnly: { attendanceLive: { DS: { present: 1 } } },
  markOnly: { attendance: { '2026-11-09': { DS_1000: 'attended' } } },
  wrongShapes: { customTasks: {}, customLinks: 'x', attendance: [] }
};
const hasData = (() => {
  const app = loadApp(['cloudHasData']);
  return { cloud: Object.fromEntries(Object.entries(hasDataCases).map(([k, v]) => [k, app.cloudHasData(v)])), sampleDeskPhone: out.localHasData,
    emptyPhone: loadApp(['localHasData']).localHasData() };
})();
const saved = { backup: out.backup, cloud: out.cloud, changeCheck: out.changeCheck, signinCopy: out.signinCopy, aimsByKind, restored, restoredOld, applied, rules,
  localChangeCheck: out.localChangeCheck, hasData };
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

check('a restore puts every backed-up dataset back and says so', () => {
  const st = restored.store;
  const back = (k) => st[k] !== undefined;
  const keys = ['cos_profile', 'cos_custom_tasks', 'cos_tombstones', 'cos_custom_timetable', 'cos_timetable_choice', 'cos_custom_links', 'cos_assignments',
    'cos_attendance', 'cos_attendance_baseline', 'cos_attendance_live', 'cos_hidden_subjects', 'cos_syllabus', 'cos_user_batch', 'cos_att_target',
    'cos_aims', 'cos_holiday', 'cos_strip_labels', 'cos_notif_prefs', 'cos_notice_channels', 'cos_theme', 'cos_accent'];
  const missing = keys.filter(k => !back(k));
  return !missing.length && restored.toasts.join() === 'done: Your desk is restored from the backup'
    && st.cos_strip_labels === SAMPLE_DESK.cos_strip_labels && st.cos_user_batch === 'A2' && st.cos_theme === 'midnight-ink'
    && JSON.parse(st.cos_custom_links)[0].resources[1].url.startsWith('data:') ? true : J({ missing, toasts: restored.toasts });
});

check('an older backup leaves strip names, aims and delete markers as they were', () => {
  const st = restoredOld.store;
  return st.cos_strip_labels === J({ 'Operating Systems': 'OSY' }) && st.cos_aims === AIMS_LINE_80
    && JSON.parse(st.cos_tombstones).map(t => t.id).join() === 't-kept' && restoredOld.toasts.join() === 'done: Your desk is restored from the backup'
    ? true : J({ strip: st.cos_strip_labels, aims: st.cos_aims, ts: st.cos_tombstones, toasts: restoredOld.toasts });
});

check('a cloud copy on a fresh phone puts back every synced dataset', () => {
  const st = applied.freshPhone.store;
  const want = ['cos_profile', 'cos_custom_tasks', 'cos_tombstones', 'cos_custom_timetable', 'cos_timetable_choice', 'cos_custom_links', 'cos_assignments',
    'cos_attendance', 'cos_attendance_baseline', 'cos_attendance_live', 'cos_syllabus', 'cos_att_target', 'cos_aims', 'cos_holiday', 'cos_notif_prefs',
    'cos_notice_channels', 'cos_theme', 'cos_accent'];
  const missing = want.filter(k => st[k] === undefined);
  const notSynced = ['cos_strip_labels', 'cos_user_batch', 'cos_hidden_subjects'].filter(k => st[k] !== undefined);
  return !missing.length && !notSynced.length ? true : J({ missing, notSynced });
});
check('a cloud copy keeps this phone\'s theme, palette and newer holiday, and merges tasks and vault', () => {
  const st = applied.livedIn.store;
  const ids = JSON.parse(st.cos_custom_tasks).map(t => t.id).sort().join();
  const vault = JSON.parse(st.cos_custom_links).map(s => s.code).sort().join();
  return st.cos_theme === 'paper-slate' && st.cos_accent === 'rose' && st.cos_holiday === LIVED_IN.cos_holiday
    && ids === 't-lab,t-local,t-quiz,t-read' && vault === 'DS,OS' && JSON.parse(st.cos_profile).name === 'Riya' && applied.livedIn.pushAsked
    ? true : J({ theme: st.cos_theme, accent: st.cos_accent, holiday: st.cos_holiday, ids, vault, push: applied.livedIn.pushAsked });
});
check('keep-this-phone mode leaves whole fields alone and still merges tasks and vault', () => {
  const st = applied.livedInKeepLocal.store;
  const ids = JSON.parse(st.cos_custom_tasks).map(t => t.id).sort().join();
  const vault = JSON.parse(st.cos_custom_links).map(s => s.code).sort().join();
  return st.cos_custom_timetable === LIVED_IN.cos_custom_timetable && st.cos_attendance === LIVED_IN.cos_attendance && st.cos_att_target === '80'
    && JSON.parse(st.cos_profile).name === 'Riya S' && ids === 't-lab,t-local,t-quiz,t-read' && vault === 'DS,OS' ? true
    : J({ tt: st.cos_custom_timetable, att: st.cos_attendance, tg: st.cos_att_target, p: st.cos_profile, ids, vault });
});
check('profile from the cloud: long fields are cut (name 80, roll number 50); a blank or missing field keeps this phone\'s', () => {
  const p = JSON.parse(rules.profile.store.cos_profile);
  return p.name === 'R'.repeat(80) && p.rollNo === '9'.repeat(50) && p.college === 'Sample College' && p.batch === 'A2' ? true : J(p);
});
check('an aim line from the cloud is taken only within 50-100', () => {
  const tg = (r) => rules[r].store.cos_att_target;
  return tg('lineTooHigh') === '80' && tg('lineTooLow') === '80' && tg('lineInRange') === '70' ? true : J([tg('lineTooHigh'), tg('lineTooLow'), tg('lineInRange')]);
});
check('holiday: a newer cloud copy replaces this phone\'s; an older one is ignored and this phone pushes its own once', () => {
  const inCloud = JSON.parse(rules.holidayNewerInCloud.store.cos_holiday), here = JSON.parse(rules.holidayNewerHere.store.cos_holiday);
  return inCloud.on === true && inCloud.changedAt === 1794200000000 && !rules.holidayNewerInCloud.pushAsked
    && here.on === true && here.changedAt === 1794200000000 && rules.holidayNewerHere.pushAsked ? true
    : J({ inCloud, pushA: rules.holidayNewerInCloud.pushAsked, here, pushB: rules.holidayNewerHere.pushAsked });
});

check('the first sign-in question counts tasks, vault items, classes and attendance as the student\'s data, nothing else', () => {
  const want = { empty: false, onlyProfileAndTheme: false, emptyVaultSection: false, vaultLink: true, emptyTimetableDays: false, timetableClass: true,
    oneTask: true, emptyAttendanceMaps: false, baselineOnly: true, liveOnly: true, markOnly: true, wrongShapes: false };
  return J(hasData.cloud) === J(want) && hasData.sampleDeskPhone === true && hasData.emptyPhone === false ? true : J(hasData);
});
check('this phone\'s change check equals the check of the copy it would send', () =>
  out.localChangeCheck === out.changeCheck || 'local and sent copies check differently');

// Exactly as saved.
for (const name of ['backup', 'cloud', 'changeCheck', 'signinCopy', 'aimsByKind', 'restored', 'restoredOld', 'applied', 'rules', 'localChangeCheck', 'hasData']) {
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
