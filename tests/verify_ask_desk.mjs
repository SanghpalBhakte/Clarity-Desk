// ==================================================================
// Clarity Desk: ASK DESK UNDERSTANDS EVERYDAY QUESTIONS
// ==================================================================
// Ask Desk runs on the phone (no AI model, no network). Locked down here:
//  - real student phrasing reaches the right answer: greetings in front,
//    slang (bunk, tmrw), typos, a subject (DBMS, OS) and a day (tomorrow,
//    Friday) inside the question;
//  - "what about OS?" continues the last question;
//  - skip answers say yes/no from the same attendance math the app shows;
//  - a short code that is also an English word ("it") is not a subject
//    unless typed in capitals;
//  - an unclear question gets "did you mean" buttons, not a dead end;
//  - the Today box gives the same answer as the panel.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { withDeskAssistant } from './lazy-modules.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

// Tuesday 29 Sep 2026, 09:00
const RealDate = Date;
const NOW = new RealDate('2026-09-29T09:00:00+05:30').getTime();
class FakeDate extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(NOW); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = globalThis;
let domCache = {};
const domStub = (id) => (domCache[id] ||= { id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: (tag) => ({ tagName: tag, style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }),
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const NOTICES = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
`);
const makeApp = () => new Function(`${withDeskAssistant(code)}\n return { ClarityAssistant, AIService };`)();

const DBMS = { subject: 'Database Management Systems', code: 'DBMS', time: '10:00', end: '11:00', room: 'LT-1', teacher: 'Prof. A', type: 'lecture' };
const OS   = { subject: 'Operating Systems', code: 'CS202', time: '11:00', end: '12:00', room: 'LT-2', teacher: 'Prof. B', type: 'lecture' };
const IT   = { subject: 'Internet Technology', code: 'IT', time: '14:00', end: '15:00', room: 'LT-3', teacher: 'Prof. C', type: 'lecture' };
function seed() {
  for (const k of Object.keys(store)) delete store[k];
  domCache = {};
  // Tue: DBMS, OS · Wed: OS · Fri: OS, IT
  store.cos_custom_timetable = JSON.stringify({ 0: [], 1: [], 2: [DBMS, OS], 3: [OS], 4: [], 5: [OS, IT], 6: [] });
  store.cos_onboarding_dismissed = 'true';
  store.cos_attendance = JSON.stringify({});
  store.cos_attendance_baseline = JSON.stringify({
    DBMS:  { subjectName: DBMS.subject, subjectCode: 'DBMS', present: 20, absent: 2, leave: 0, notEntered: 0 },   // 90.91%: can miss 4
    CS202: { subjectName: OS.subject, subjectCode: 'CS202', present: 6, absent: 4, leave: 0, notEntered: 0 }      // 60%: attend 6
  });
  store.cos_custom_tasks = JSON.stringify([
    { id: 't1', title: 'DBMS journal', subject: DBMS.subject, dueDate: '2026-09-30', status: 'pending', taskType: 'assignment' },
    { id: 't2', title: 'OS unit test', subject: OS.subject, dueDate: '2026-10-02', status: 'pending', taskType: 'exam' }
  ]);
}

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('==================================================================');
console.log('💬 ASK DESK UNDERSTANDS EVERYDAY QUESTIONS');
console.log('==================================================================');

seed();
const app = makeApp();
const A = app.ClarityAssistant;
const sub = (u) => (u.subject ? u.subject.name : '-');
const day = (u) => (u.day ? u.day.label : '-');

// [question, intent, subject (or '-'), day label (or '-')]
const CASES = [
  ['hello what is my next class', 'next_class', '-', '-'],
  ['hi', 'greeting', '-', '-'],
  ['thanks!', 'thanks', '-', '-'],
  ['what do I have today?', 'today_summary', '-', 'today'],
  ['show my day', 'today_summary', '-', '-'],
  ['do i have class tomorrow', 'day_schedule', '-', 'tomorrow'],
  ['what do i have tmrw', 'day_schedule', '-', 'tomorrow'],
  ['classes on friday', 'day_schedule', '-', 'Friday'],
  ['what classes on monday', 'day_schedule', '-', 'Monday'],
  ['show my timetable', 'timetable_view', '-', '-'],
  ['my full time table', 'timetable_view', '-', '-'],
  ['can i bunk tomorrow', 'day_skip', '-', 'tomorrow'],
  ['is it safe to skip today', 'day_skip', '-', 'today'],
  ['can i skip DBMS on friday', 'subject_skip', 'Database Management Systems', 'Friday'],
  ['how many classes can i miss in OS', 'subject_skip', 'Operating Systems', '-'],
  ['can I bunk operating systems', 'subject_skip', 'Operating Systems', '-'],
  ['how many classes can i skip', 'skip_overview', '-', '-'],
  ["what's my attendance in DBMS", 'subject_attendance', 'Database Management Systems', '-'],
  ['dbms attendence', 'subject_attendance', 'Database Management Systems', '-'],
  ['how is my attendance', 'attendance_general', '-', '-'],
  ['which subject is at risk', 'attendance_risk', '-', '-'],
  ['am i below 75 in any subject', 'attendance_risk', '-', '-'],
  ['what tasks are urgent', 'tasks_urgent', '-', '-'],
  ['show tasks due tomorrow', 'tasks_day', '-', 'tomorrow'],
  ['what is due on friday', 'tasks_day', '-', 'Friday'],
  ['what is due this week', 'tasks_week', '-', '-'],
  ['tasks due next week', 'tasks_week', '-', '-'],
  ['what are my pending tasks', 'tasks_all', '-', '-'],
  ['my assignments', 'tasks_all', '-', '-'],
  ['when is my exam', 'exams', '-', '-'],
  ['any tests coming up', 'exams', '-', '-'],
  ['what time does my last class end', 'day_end', '-', '-'],
  ['when do i finish tomorrow', 'day_end', '-', 'tomorrow'],
  ['when is my next OS class', 'next_class', 'Operating Systems', '-'],
  ['when is my next lab', 'next_class', '-', '-'],
  ['any updates from college', 'notices', '-', '-'],
  ['show notices', 'notices', '-', '-'],
  ['remind me to submit OS lab', 'create_task', 'Operating Systems', '-'],
  ['add task for dbms', 'create_task', 'Database Management Systems', '-'],
  ['plan my week', 'weekly_plan', '-', '-'],
  ['what should i study tonight', 'study_plan', '-', 'today'],
  ['which subject needs the most attention', 'subject_guidance', '-', '-'],
  ['is anything missing from my setup', 'setup_gaps', '-', '-'],
  ['help me set up attendance', 'setup_attendance', '-', '-'],
  ['import timetable', 'import_timetable', '-', '-'],
  ['review timetable import', 'parser_review', '-', '-'],
  ['clean my desk', 'declutter_desk', '-', '-'],
  ['who am i', 'profile', '-', '-'],
  ['what can you do', 'help', '-', '-'],
  ['DBMS', 'subject_info', 'Database Management Systems', '-'],
  ['tell me about operating systems', 'subject_info', 'Operating Systems', '-'],
  ['hey can you tell me my attendance', 'attendance_general', '-', '-'],
  ['good morning, classes tomorrow?', 'day_schedule', '-', 'tomorrow'],
  ['scedule for tommorow', 'day_schedule', '-', 'tomorrow'],
  ['is it raining', 'unknown', '-', '-'],
];

CASES.forEach(([q, intent, s, d]) => {
  check(`"${q}" → ${intent}${s !== '-' ? ' · ' + s : ''}${d !== '-' ? ' · ' + d : ''}`, () => {
    const u = A.understand(q);
    const got = [u.intent, sub(u), day(u)];
    return got[0] === intent && got[1] === s && got[2] === d ? true : `got ${got.join(' | ')}`;
  });
});

check('"is it safe..." does not read the word "it" as the subject IT; "IT" in capitals does', () => {
  const a = A.understand('is it safe to skip today');
  const b = A.understand('can I skip IT on friday');
  return !a.subject && b.subject && b.subject.name === 'Internet Technology' ? true : `${sub(a)} / ${sub(b)}`;
});

check('Follow-up: "what about OS?" after a DBMS skip question asks the same about OS, keeping the day', () => {
  A.respond('can i skip DBMS on friday');
  const u = A.understand('what about OS?');
  return u.intent === 'subject_skip' && sub(u) === 'Operating Systems' && day(u) === 'Friday' ? true : `${u.intent} ${sub(u)} ${day(u)}`;
});

check('Follow-up: "and thursday?" after "classes tomorrow" lists Thursday', () => {
  A.respond('classes tomorrow');
  const u = A.understand('and thursday?');
  return u.intent === 'day_schedule' && day(u) === 'Thursday' ? true : `${u.intent} ${day(u)}`;
});

check('Skip answer for a safe subject says Yes with the same "can miss" number as the subject page', () => {
  const html = A.respond('can I skip DBMS');
  return html.includes('>Yes<') && html.includes('4 more Database Management Systems classes') ? true : html.slice(0, 200);
});

check('Skip answer for a subject below target says No and how many to attend', () => {
  const html = A.respond('can I bunk OS');
  return html.includes('>No<') && html.includes('60') && html.includes('next <strong>6 classes') ? true : html.slice(0, 240);
});

check('Day skip: today has OS below target, so the answer is not a plain yes', () => {
  const html = A.respond('can i skip today');
  return html.includes('Not all of it') && html.includes('Operating Systems') && html.includes('Can miss 4') ? true : html.slice(0, 240);
});

check('Subject not on that day is said plainly', () => {
  const html = A.respond('can i skip DBMS on friday');
  return html.includes("isn't on your timetable on Friday") ? true : html.slice(0, 300);
});

check('Tomorrow (Wednesday) lists OS and the DBMS journal due then', () => {
  const html = A.respond('what do i have tomorrow');
  return html.includes('Wednesday') && html.includes('Operating Systems') && html.includes('DBMS journal') && !html.includes('Database Management Systems</span>') ? true : html.slice(0, 300);
});

check('Tasks due on Friday finds the OS unit test', () => {
  const html = A.respond('what is due on friday');
  return html.includes('OS unit test') ? true : html;
});

check('Exams lists exam-type tasks', () => {
  const html = A.respond('when is my exam');
  return html.includes('OS unit test') ? true : html.slice(0, 200);
});

check('Last class today ends at 12:00 PM after OS', () => {
  const html = A.respond('when do i finish today');
  return html.includes('12:00 PM') && html.includes('Operating Systems') ? true : html;
});

check('Next OS class is today at 11:00 AM', () => {
  const html = A.respond('when is my next OS class');
  return html.includes('today') && html.includes('11:00 AM') ? true : html;
});

check('Unclear question gets clickable "did you mean" suggestions', () => {
  const html = A.respond('week stuff');
  return html.includes('Did you mean') && html.includes("sendAssistantMessage('") ? true : html.slice(0, 200);
});

check('Nothing recognised at all still offers starter questions', () => {
  const html = A.respond('is it raining');
  return html.includes("sendAssistantMessage('") ? true : html.slice(0, 200);
});

check('Every button in every answer has well-formed quotes', () => {
  seed();
  const a = makeApp().ClarityAssistant;
  const bad = [];
  CASES.forEach(([q]) => {
    (a.respond(q).match(/onclick="[^"]*"/g) || []).forEach(attr => {
      const quotes = (attr.replace(/\\'/g, '').match(/'/g) || []).length;
      if (quotes % 2) bad.push(`${q}: ${attr}`);
    });
  });
  return bad.length ? bad.slice(0, 3).join(' | ') : true;
});

check('Answers never write to storage', () => {
  seed();
  const before = JSON.stringify(store);
  const a = makeApp().ClarityAssistant;
  CASES.forEach(([q]) => a.respond(q));
  return JSON.stringify(store) === before ? true : 'storage changed';
});

// The answer arrives once desk-assistant.js has loaded (a promise), so ask
// first and let it settle before checking.
seed();
const sameAnswerApp = new Function(`${withDeskAssistant(code)}\n return { ClarityAssistant };`)();
domCache['assistant-input'] = { ...domStub('assistant-input'), value: 'can i skip DBMS' };
// handleAssistantQuestion is a window global defined by app.js
globalThis.window.handleAssistantQuestion();
await new Promise((r) => setTimeout(r, 0));

check('Today box and panel give the same answer', () => {
  const inst = sameAnswerApp;
  const box = domCache['assistant-answer-container'].innerHTML;
  return box.includes(inst.ClarityAssistant.respond('can i skip DBMS')) ? true : box.slice(0, 200);
});

console.log('');
console.log('──────────────────────────────────────────────────────────────────');
console.log('📘 SYLLABUS QUESTIONS');
console.log('──────────────────────────────────────────────────────────────────');

// DBMS exam on Sat 4 Oct (5 days). OS has no exam date.
const T = (id, title, status, importance, marks) => ({ id, title, status, importance, ...(marks ? { marks } : {}) });
function seedSyllabus() {
  seed();
  store.cos_syllabus = JSON.stringify([
    { subjectKey: 'databasemanagementsystems', subjectName: 'Database Management Systems', examDate: '2026-10-04', topics: [
      T('d1', 'ER model', 'done', 2, 10), T('d2', 'Normalization', 'todo', 3, 12), T('d3', 'Transactions', 'todo', 2),
      T('d4', 'Indexing', 'revised', 2), T('d5', 'Joins', 'done', 3)
    ] },
    { subjectKey: 'operatingsystems', subjectName: 'Operating Systems', examDate: '', topics: [
      T('o1', 'Paging', 'todo', 3), T('o2', 'Deadlocks', 'done', 2), T('o3', 'Scheduling', 'todo', 1)
    ] }
  ]);
}
seedSyllabus();
const S = makeApp().ClarityAssistant;

const SYL_CASES = [
  ['how much syllabus is left', 'syllabus_overview', '-', '-'],
  ['syllabus progress', 'syllabus_overview', '-', '-'],
  ['how much of my portion is done', 'syllabus_overview', '-', '-'],
  ['how many topics are left', 'syllabus_overview', '-', '-'],
  ['DBMS syllabus', 'subject_syllabus', 'Database Management Systems', '-'],
  ['how much of DBMS is done', 'subject_syllabus', 'Database Management Systems', '-'],
  ['os sylabus progress', 'subject_syllabus', 'Operating Systems', '-'],
  ['what should i revise', 'syllabus_revise', '-', '-'],
  ['what to revise in DBMS', 'syllabus_revise', 'Database Management Systems', '-'],
  ['revision plan', 'syllabus_revise', '-', '-'],
  ['important topics left', 'syllabus_important', '-', '-'],
  ['which topics carry the most marks', 'syllabus_important', '-', '-'],
  ['imp topics in OS', 'syllabus_important', 'Operating Systems', '-'],
  ['high weightage topics', 'syllabus_important', '-', '-'],
  ['am i on track', 'syllabus_pace', '-', '-'],
  ['can i finish DBMS before the exam', 'syllabus_pace', 'Database Management Systems', '-'],
  ['will i complete the syllabus', 'syllabus_pace', '-', '-'],
  ['how many topics per day', 'syllabus_pace', '-', '-'],
  ['have i done normalization', 'syllabus_topic', '-', '-'],
  ['is deadlock done', 'syllabus_topic', '-', '-'],
  ['did i finish paging yet', 'syllabus_topic', '-', '-'],
  ['hey, have i revised joins?', 'syllabus_topic', '-', '-'],
  ['status of er model', 'syllabus_topic', '-', '-'],
  // Old questions keep their answers.
  ['what should i study today', 'study_plan', '-', 'today'],
  ['any important notices', 'notices', '-', '-'],
  ['am i on track with attendance', 'attendance_general', '-', '-'],
  ['when do i finish today', 'day_end', '-', 'today'],
  ['did i finish my tasks', 'tasks_all', '-', '-'],
  ['when is my exam', 'exams', '-', '-'],
  ['is it safe to skip today', 'day_skip', '-', 'today'],
];

SYL_CASES.forEach(([q, intent, s, d]) => {
  check(`"${q}" → ${intent}${s !== '-' ? ' · ' + s : ''}${d !== '-' ? ' · ' + d : ''}`, () => {
    const u = S.understand(q);
    const got = [u.intent, sub(u), day(u)];
    return got[0] === intent && got[1] === s && got[2] === d ? true : `got ${got.join(' | ')}`;
  });
});

check('Follow-up: "what about OS?" after "DBMS syllabus" asks about the OS syllabus', () => {
  S.respond('DBMS syllabus');
  const u = S.understand('what about OS?');
  return u.intent === 'subject_syllabus' && sub(u) === 'Operating Systems' ? true : `${u.intent} ${sub(u)}`;
});

check('Overview: average and furthest-behind subject first (OS 33% before DBMS 58%)', () => {
  const html = S.respond('how much syllabus is left');
  const os = html.indexOf('Operating Systems · 33%'), db = html.indexOf('Database Management Systems · 58%');
  return html.includes('46% across 2 subjects') && os > -1 && db > os ? true : html.slice(0, 400);
});

check('Subject syllabus: counts, exam days and the heaviest topic left first', () => {
  const html = S.respond('how much of DBMS is done');
  const n = html.indexOf('Normalization'), t = html.indexOf('Transactions');
  return html.includes('58% done') && html.includes('3 of 5 topics, 1 revised') && html.includes('Exam in 5 days') && n > -1 && t > n ? true : html.slice(0, 400);
});

check('Study plan: weightage × exam date, revision first in the final week, at most 2 per subject', () => {
  const html = S.respond('what should i study today');
  const order = ['ER model', 'Normalization', 'Paging'].map(x => html.indexOf(x));
  if (order.some(i => i < 0) || !(order[0] < order[1] && order[1] < order[2])) return `order ${order.join(',')}`;
  if (html.includes('Transactions') || html.includes('Joins')) return 'third DBMS topic picked';
  return html.includes('not started') && html.includes('done, not revised') && html.includes('exam in 5 days') ? true : 'reasons missing';
});

check('Revise: done-but-not-revised topics only, ER model (10 marks) before Joins', () => {
  const html = S.respond('what should i revise');
  const er = html.indexOf('ER model'), j = html.indexOf('Joins');
  if (html.includes('Indexing')) return 'already-revised topic listed';
  return html.includes('3 topics done but not revised') && er > -1 && j > er ? true : html.slice(0, 400);
});

check('Important: not-started topics with weightage, most marks first', () => {
  const html = S.respond('important topics left');
  const n = html.indexOf('Normalization'), p = html.indexOf('Paging');
  return html.includes('2 important topics not started') && n > -1 && p > n && !html.includes('Joins') ? true : html.slice(0, 400);
});

check('Pace: topics a day for a dated exam, honest about a missing date', () => {
  const html = S.respond('am i on track');
  return html.includes('2 topics left, 5 days') && html.includes('1 a day') && html.includes('no exam date set') ? true : html.slice(0, 500);
});

check('Topic lookup: done, not started, revised', () => {
  const a = S.respond('is deadlock done'), b = S.respond('have i done normalization'), c = S.respond('did i study indexing');
  if (!a.includes('Deadlocks') || !a.includes('Yes, done')) return a.slice(0, 200);
  if (!b.includes('Not yet')) return b.slice(0, 200);
  return c.includes('done and revised') ? true : c.slice(0, 200);
});

check('Topic lookup: an unknown topic falls through to the normal answers', () => {
  const u = S.understand('have i done quantum physics');
  return u.intent !== 'syllabus_topic' ? true : 'matched a topic that does not exist';
});

check('Existing answers gain one syllabus line (subject, week, today, focus radar)', () => {
  const info = S.respond('DBMS');
  if (!info.includes('Syllabus: <strong>58%</strong>')) return 'subject info: ' + info.slice(0, 200);
  const week = S.respond('plan my week');
  if (!week.includes('Furthest behind: <strong>Operating Systems</strong>')) return 'week: ' + week.slice(0, 300);
  const today = S.respond('what do i have today');
  if (!today.includes('Syllabus: 46% across 2 subjects')) return 'today: ' + today.slice(-300);
  const radar = S.respond('which subject needs the most attention');
  return radar.includes('syllabus only <strong>58%</strong> done with the exam in 5 days') ? true : 'radar: ' + radar.slice(0, 400);
});

check('Without a syllabus the answers say so and offer a way to add one', () => {
  seed();
  const a = makeApp().ClarityAssistant;
  const all = a.respond('how much syllabus is left');
  const one = a.respond('DBMS syllabus');
  const plan = a.respond('what should i study today');
  if (!all.includes("haven't added a syllabus")) return all.slice(0, 200);
  if (!one.includes('openSubjectSyllabus(') || !one.includes('Add Database Management Systems topics')) return one.slice(0, 300);
  return plan.includes('Add your syllabus in a Subject Hub') ? true : plan.slice(-300);
});

check('Syllabus answers never write to storage and have well-formed buttons', () => {
  seedSyllabus();
  const before = JSON.stringify(store);
  const a = makeApp().ClarityAssistant;
  const bad = [];
  SYL_CASES.forEach(([q]) => (a.respond(q).match(/onclick="[^"]*"/g) || []).forEach(attr => {
    if ((attr.replace(/\\'/g, '').match(/'/g) || []).length % 2) bad.push(`${q}: ${attr}`);
  }));
  if (bad.length) return bad.slice(0, 3).join(' | ');
  return JSON.stringify(store) === before ? true : 'storage changed';
});

check('Topic names are escaped in answers', () => {
  seed();
  store.cos_syllabus = JSON.stringify([{ subjectName: 'Database Management Systems', examDate: '', topics: [T('x1', '<img src=x onerror=alert(1)> joins', 'todo', 3)] }]);
  const html = makeApp().ClarityAssistant.respond('important topics left');
  return !html.includes('<img src=x') && html.includes('&lt;img') ? true : html.slice(0, 300);
});

console.log('');
console.log('──────────────────────────────────────────────────────────────────');
console.log('⚡ SCANS TRY HEALTHY AI MODELS FIRST');
console.log('──────────────────────────────────────────────────────────────────');

check('A model that ran out of quota moves to the back of the line, and comes back after the cooldown', () => {
  const ai = makeApp().AIService;
  const ids = ['m1', 'm2', 'm3'];
  ai._coolDown('gemini:m1', 429);
  const order = ai._healthyFirst(ids, m => `gemini:${m}`).join(',');
  ai._cooldowns['gemini:m1'] = Date.now() - 1;
  const later = ai._healthyFirst(ids, m => `gemini:${m}`).join(',');
  return order === 'm2,m3,m1' && later === 'm1,m2,m3' ? true : `${order} / ${later}`;
});

check('Only lasting failures cool a model down (not a bad answer or a 400)', () => {
  const ai = makeApp().AIService;
  [[404, true], [429, true], [403, true], ['timeout', true], [503, true], [400, false], [200, false]].forEach(([st]) => ai._coolDown(`x:${st}`, st));
  const cooled = [404, 429, 403, 'timeout', 503].every(st => ai._isCooling(`x:${st}`));
  return cooled && !ai._isCooling('x:400') && !ai._isCooling('x:200') ? true : JSON.stringify(ai._cooldowns);
});

check('Nothing is ever dropped: every model is still tried when all are cooling', () => {
  const ai = makeApp().AIService;
  ['a', 'b'].forEach(m => ai._coolDown(`gemini:${m}`, 429));
  return ai._healthyFirst(['a', 'b'], m => `gemini:${m}`).join(',') === 'a,b' ? true : 'list changed';
});

check('Lazy load: app.js imports desk-assistant.js, which sw.js precaches and ship.mjs publishes', () => {
  const sw = fs.readFileSync(`${ROOT}/sw.js`, 'utf8');
  const ship = fs.readFileSync(`${ROOT}/scripts/ship.mjs`, 'utf8');
  const precache = sw.slice(sw.indexOf('PRECACHE_ASSETS = ['), sw.indexOf('];', sw.indexOf('PRECACHE_ASSETS = [')));
  if (appSrc.includes('const ClarityAssistant = (() => {')) return 'the assistant is still built inside app.js';
  if (!appSrc.includes("import('./desk-assistant.js')")) return 'app.js does not import desk-assistant.js';
  if (!/\/desk-assistant\.js'/.test(precache)) return 'sw.js does not precache desk-assistant.js (Ask Desk offline)';
  if (!/CDN_FILES = \[[^\]]*'desk-assistant\.js'/.test(ship)) return 'ship.mjs does not check desk-assistant.js on jsDelivr';
  return true;
});

console.log('');
console.log(`Result: ${passed}/${total} passed`);
if (errors.length) {
  console.error(`\n${errors.length} failing check(s).`);
  process.exit(1);
}
