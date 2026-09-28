// ==================================================================
// Clarity Desk: ATTENDANCE REACHES EVERY DEVICE + APP ICONS (v168)
// ==================================================================
// Cloud sync decides whether an incoming snapshot is "new" by a hash of the
// data. That hash left out attendance and hashed only the timetable's day
// count, so a Present tapped on the phone never reached the laptop (not even
// after a reload), and it depended on object key order, so Firestore handing
// the same data back in a different order looked like a change and rebuilt
// the page. Also checks that the manifest's icons are real files of the
// declared size and that Android gets a transparent monochrome status-bar
// icon (without one it draws the opaque app icon as a white square).
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

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
const domStub = (id) => ({ id, style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null });
globalThis.document = {
  getElementById: domStub, querySelector: () => null, querySelectorAll: () => [],
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
const app = new Function(`${code}\n return { calculatePayloadHash, attendanceKeyFor };`)();

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try {
    const res = fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

// Synthetic data only.
const base = () => ({
  profile: { name: 'Test Student', batch: 'A1', college: 'Test College' },
  customTasks: [{ id: 't1', title: 'Lab file' }],
  customTimetable: { 2: [{ subject: 'Data Structures Lab', code: 'DSL', time: '10:00', end: '12:00' }] },
  assignmentStatuses: {},
  attendance: { '2026-09-29': { DSL_1000: 'attended', OE2_1245: 'skipped' } },
  attendanceBaseline: { DSL: { present: 6, absent: 1, leave: 0, notEntered: 1 } },
  attendanceLive: {},
  theme: 'midnight-ink',
  accent: 'terracotta'
});
const H = (d) => app.calculatePayloadHash(d);

console.log('==================================================================');
console.log('🔄 ATTENDANCE REACHES EVERY DEVICE + APP ICONS');
console.log('==================================================================');

check('The same data in a different key order is not treated as a change', () => {
  const a = base();
  const b = base();
  b.profile = { college: 'Test College', batch: 'A1', name: 'Test Student' };
  b.attendance = { '2026-09-29': { OE2_1245: 'skipped', DSL_1000: 'attended' } };
  b.attendanceBaseline = { DSL: { notEntered: 1, leave: 0, absent: 1, present: 6 } };
  return H(a) === H(b) ? true : 'hash depends on key order';
});

check('A Present / Absent mark from another device is picked up', () => {
  const b = base();
  b.attendance['2026-09-29'].OE2_1245 = 'attended';
  return H(base()) !== H(b) ? true : 'attendance change ignored';
});

check('A new attendance day, a baseline edit and a timetable edit are each picked up', () => {
  const day = base(); day.attendance['2026-09-30'] = { DSL_1000: 'attended' };
  const bl = base(); bl.attendanceBaseline.DSL.present = 7;
  const tt = base(); tt.customTimetable[2][0].time = '10:15';   // same day count as before
  const bad = [['day', day], ['baseline', bl], ['timetable', tt]].filter(([, d]) => H(d) === H(base())).map(([n]) => n);
  return bad.length ? `ignored: ${bad.join(', ')}` : true;
});

check('Theme, accent and the server timestamp alone do not rebuild the page', () => {
  const b = base(); b.theme = 'paper-slate'; b.accent = 'rose'; b.updatedAt = { seconds: 1790000000, nanoseconds: 0 };
  return H(base()) === H(b) ? true : 'cosmetic-only change treated as new data';
});

check('Every screen stores a class mark under the same key', () => {
  const k1 = app.attendanceKeyFor({ code: 'DS', subject: 'Data Structures', time: '10:00' });
  const k2 = app.attendanceKeyFor({ subject: 'Open Elective 2', time: '12:45' });
  const dup = (appSrc.match(/`\$\{c\.code \|\| c\.subject\}_\$\{c\.time\}`/g) || []).length;
  if (k1 !== 'DS_1000' || k2 !== 'OpenElective2_1245') return `keys ${k1} / ${k2}`;
  return dup === 1 ? true : `${dup} copies of the key formula (should be 1, in attendanceKeyFor)`;
});

// ── Icons ─────────────────────────────────────────────────────────────
function pngInfo(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  if (buf.toString('latin1', 1, 4) !== 'PNG') return null;
  const colorType = buf[25];
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 || buf.includes(Buffer.from('tRNS')) };
}
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

check('Every manifest icon is a real PNG of the size it declares', () => {
  const bad = manifest.icons.map((i) => {
    const f = i.src.replace(/^\.\//, '');
    if (!fs.existsSync(path.join(ROOT, f))) return `${f} missing`;
    const info = pngInfo(f);
    if (!info) return `${f} is not a PNG`;
    return i.sizes === `${info.w}x${info.h}` ? null : `${f} is ${info.w}x${info.h}, declared ${i.sizes}`;
  }).filter(Boolean);
  return bad.length ? bad.join('; ') : true;
});

check('Android gets a transparent monochrome icon for the status bar, the same one notifications use', () => {
  const mono = manifest.icons.find((i) => (i.purpose || '').split(' ').includes('monochrome'));
  if (!mono) return 'no "monochrome" icon in manifest.json';
  const f = mono.src.replace(/^\.\//, '');
  if (!pngInfo(f).alpha) return `${f} has no transparency (Android would draw a solid square)`;
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const uses = [sw, appSrc].every((src) => (src.match(/NOTIF_DEFAULT_BADGE\s*=\s*'\.\/([^']+)'/) || [])[1] === f);
  return uses ? true : `sw.js / app.js notification badge is not ${f}`;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');
if (errors.length) { console.error('❌ SYNC CONSISTENCY TESTS FAILED'); process.exit(1); }
console.log('🏆 ALL SYNC CONSISTENCY TESTS PASSED! 🚀');
process.exit(0);
