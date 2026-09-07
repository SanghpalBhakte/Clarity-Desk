import fs from 'fs';

// Stage 13: the attendance-photo scanner's reconstructAttendanceTableFromGrid
// was rewritten from a naive sequential-Y-overlap row grouping (which could
// not handle multi-line-wrapped Course Name / Faculty Name cells -- common
// in real college ERP exports) to anchor-based row banding: a numeric
// attendance-count anchor line identifies each logical row, and every word
// above/below it (including wrapped continuation lines) is assigned to that
// row's band by Y-center. Three real, distinct bugs were found and fixed
// against 3 real erp.mgmu.ac.in screenshots; this file locks each one down
// with a minimal synthetic fixture so no future change can silently
// reintroduce it.
const appSrc = fs.readFileSync('D:/Clarity Desk/app.js', 'utf8');

const localStorageData = {};
globalThis.localStorage = {
  getItem: (k) => localStorageData[k] !== undefined ? localStorageData[k] : null,
  setItem: (k, v) => { localStorageData[k] = String(v); },
  removeItem: (k) => { delete localStorageData[k]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); }
};

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.window = globalThis;

globalThis.document = {
  getElementById: (id) => ({
    id, style: {}, classList: { add: () => {}, remove: () => {} },
    appendChild: () => {}, remove: () => {}, focus: () => {}, value: '', textContent: '', innerHTML: '',
    querySelector: () => null
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag, style: {}, classList: { add: () => {}, remove: () => {} },
    appendChild: () => {}, remove: () => {}, addEventListener: () => {}, removeEventListener: () => {}
  }),
  body: { appendChild: () => {} }
};

let codeToRun = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: 'Test Student', batch: 'A1', roll: '101' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = [];
  const NOTICES = [];
  const QUICK_LINKS = [];
`);

const sandboxCode = `
  ${codeToRun}

  return { reconstructAttendanceTableFromGrid };
`;

function createSandbox() {
  return new Function(sandboxCode)();
}

let passed = 0;
let total = 0;
const errors = [];

function check(name, testFn) {
  total++;
  try {
    const res = testFn();
    if (res === true || res === undefined) {
      console.log(`✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${name}: ${res}`);
      errors.push({ name, error: res });
    }
  } catch (err) {
    console.error(`✗ [ERROR] ${name}: ${err.stack || err}`);
    errors.push({ name, error: err.message });
  }
}

// bbox helper: text + pixel coordinates, matching the {text, bbox, confidence}
// shape real Tesseract OCR words come in as.
function w(text, x0, y0, x1, y1, conf = 90) {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: conf };
}

console.log('==================================================================');
console.log('🏆 VERIFICATION: ATTENDANCE SCAN ROW RECONSTRUCTION (Stage 13)');
console.log('==================================================================\n');

check('A. Multi-line wrapped Course Name + Faculty Name cells band into ONE row each, not scrambled across rows', () => {
  const mod = createSandbox();

  // A clean, fully-legible header -- every numeric column identifiable, so
  // parseRowWithIntervals resolves present/absent directly (no solver
  // fallback needed). This isolates the row-BANDING fix specifically.
  const header = [
    w('Course', 50, 100, 110, 125), w('Name', 115, 100, 160, 125),
    w('Total', 200, 100, 250, 125), w('Sessions', 255, 100, 330, 125),
    w('Faculty', 370, 100, 430, 125), w('Name', 435, 100, 480, 125),
    w('Present', 520, 100, 590, 125), w('Count', 595, 100, 650, 125),
    w('Absent', 690, 100, 750, 125), w('Count', 755, 100, 800, 125),
    w('Leave', 840, 100, 900, 125), w('Applied', 905, 100, 960, 125),
    w('Not', 1000, 100, 1030, 125), w('Entered', 1035, 100, 1100, 125),
    w('Total', 1140, 100, 1190, 125), w('Count', 1195, 100, 1240, 125),
    w('Percentage', 1280, 100, 1380, 125)
  ];

  const row1 = [
    // Anchor line: course-name start + faculty start + all 6 numeric fields
    w('Data', 60, 200, 100, 225), w('Dr.Smith', 390, 200, 450, 225),
    w('5', 530, 200, 550, 225), w('2', 700, 200, 720, 225),
    w('0', 850, 200, 870, 225), w('0', 1010, 200, 1030, 225),
    w('7', 1150, 200, 1170, 225), w('71.43', 1290, 200, 1350, 225),
    // Wrapped continuation line: rest of the course name + faculty name
    w('Structures', 60, 228, 140, 250), w('Kumar', 390, 228, 440, 250)
  ];
  const row2 = [
    w('Web', 60, 300, 100, 325), w('Prof.Rao', 390, 300, 450, 325),
    w('8', 530, 300, 550, 325), w('3', 700, 300, 720, 325),
    w('0', 850, 300, 870, 325), w('1', 1010, 300, 1030, 325),
    w('12', 1150, 300, 1180, 325), w('66.67', 1290, 300, 1350, 325),
    w('Development', 60, 328, 160, 350), w('Extra', 390, 328, 450, 350)
  ];

  const rows = mod.reconstructAttendanceTableFromGrid({ words: [...header, ...row1, ...row2] }, []);

  if (rows.length !== 2) return `expected exactly 2 rows, got ${rows.length}: ${JSON.stringify(rows.map(r => r.subject))}`;

  const data = rows.find(r => /Data/.test(r.subject));
  const web = rows.find(r => /Web/.test(r.subject));
  if (!data) return `expected a "Data Structures" row, got subjects: ${JSON.stringify(rows.map(r => r.subject))}`;
  if (!web) return `expected a "Web Development" row, got subjects: ${JSON.stringify(rows.map(r => r.subject))}`;

  if (!/Data\s+Structures/i.test(data.subject)) return `expected wrapped course name to merge into "Data Structures", got "${data.subject}"`;
  if (!/Web\s+Development/i.test(web.subject)) return `expected wrapped course name to merge into "Web Development", got "${web.subject}"`;

  if (data.present !== 5 || data.absent !== 2) return `"Data Structures" expected P=5/A=2, got P=${data.present}/A=${data.absent}`;
  if (web.present !== 8 || web.absent !== 3) return `"Web Development" expected P=8/A=3, got P=${web.present}/A=${web.absent}`;
  return true;
});

check('B. Garbled numeric-column headers: an unambiguous row is solved correctly, a genuinely ambiguous one reports uncertain instead of a false-confident wrong number', () => {
  const mod = createSandbox();

  // Header where Course Name / Total Sessions / Faculty Name are legible
  // but the Present/Absent/Leave/NotEntered/Total/Percentage LABELS
  // themselves are too garbled to recognise (mirrors a real Sem I
  // screenshot) -- no anchor-type column gets identified at all, forcing
  // the numeric-zone fallback path.
  const header = [
    w('Course', 50, 100, 110, 125), w('Name', 115, 100, 160, 125),
    w('Total', 200, 100, 250, 125), w('Sessions', 255, 100, 330, 125),
    w('Faculty', 370, 100, 430, 125), w('Name', 435, 100, 480, 125),
    w('Prosantigsheont', 520, 100, 650, 125),
    w('SL', 690, 100, 750, 125),
    w('saves', 840, 100, 900, 125),
    w('Not', 1000, 100, 1030, 125), w('Wil', 1035, 100, 1070, 125), w('ey', 1075, 100, 1100, 125)
  ];

  // Row 1: numeric zone OCR'd cleanly -- an unambiguous 4-term balance
  // exists (7+4+0+1=12), matching a real recovered row exactly.
  const rowClean = [
    w('English', 60, 200, 120, 225), w('20', 220, 200, 250, 225), w('Ashok', 390, 200, 450, 225),
    w('7', 530, 200, 550, 225), w('4', 700, 200, 720, 225), w('0', 850, 200, 870, 225),
    w('1', 1010, 200, 1030, 225), w('12', 1150, 200, 1180, 225), w('63.64', 1290, 200, 1350, 225)
  ];
  // Row 2: one numeric token OCR'd as unrecoverable glyph soup ("U", "a",
  // ".") -- mirrors a real row where no arithmetic balance exists among
  // what's left. The pre-fix code confidently misattributed the trailing
  // Total/Percentage values as Absent (P=0/A=64); the fix must instead
  // report present=absent=leave=notEntered=0 with isUncertain=true.
  const rowGarbled = [
    w('Physics', 60, 300, 120, 325), w('60', 220, 300, 250, 325), w('Harshada', 390, 300, 460, 325),
    w('9', 530, 300, 550, 325), w('0', 700, 300, 720, 325), w('U', 850, 300, 870, 325),
    w('a', 1010, 300, 1030, 325), w('.', 1050, 300, 1060, 325), w('64.00', 1290, 300, 1350, 325)
  ];

  const rows = mod.reconstructAttendanceTableFromGrid({ words: [...header, ...rowClean, ...rowGarbled] }, []);
  if (rows.length !== 2) return `expected 2 rows, got ${rows.length}: ${JSON.stringify(rows)}`;

  const clean = rows.find(r => /English/i.test(r.subject));
  const garbled = rows.find(r => /Physics/i.test(r.subject));
  if (!clean) return `expected an "English" row, got: ${JSON.stringify(rows.map(r => r.subject))}`;
  if (!garbled) return `expected a "Physics" row, got: ${JSON.stringify(rows.map(r => r.subject))}`;

  if (clean.present !== 7 || clean.absent !== 4 || clean.leave !== 0 || clean.notEntered !== 1) {
    return `unambiguous row: expected P=7/A=4/L=0/N=1, got P=${clean.present}/A=${clean.absent}/L=${clean.leave}/N=${clean.notEntered}`;
  }
  if (clean.isUncertain) return `unambiguous row: expected isUncertain=false once solved, got true`;

  if (garbled.present !== 0 || garbled.absent !== 0 || garbled.leave !== 0 || garbled.notEntered !== 0) {
    return `unrecoverable row: expected an honest all-zero result (not a guessed value), got P=${garbled.present}/A=${garbled.absent}/L=${garbled.leave}/N=${garbled.notEntered}`;
  }
  if (!garbled.isUncertain) return `unrecoverable row: expected isUncertain=true so the review UI flags it, got false`;
  return true;
});

check('C. A wrapped course name ending in "Lab" survives even when sessions-column OCR noise sits directly beside it', () => {
  const mod = createSandbox();

  // Same clean, fully-legible header as check A -- isolates the name-
  // reconstruction fix, not the numeric-zone fallback.
  const header = [
    w('Course', 50, 100, 110, 125), w('Name', 115, 100, 160, 125),
    w('Total', 200, 100, 250, 125), w('Sessions', 255, 100, 330, 125),
    w('Faculty', 370, 100, 430, 125), w('Name', 435, 100, 480, 125),
    w('Present', 520, 100, 590, 125), w('Count', 595, 100, 650, 125),
    w('Absent', 690, 100, 750, 125), w('Count', 755, 100, 800, 125),
    w('Leave', 840, 100, 900, 125), w('Applied', 905, 100, 960, 125),
    w('Not', 1000, 100, 1030, 125), w('Entered', 1035, 100, 1100, 125),
    w('Total', 1140, 100, 1190, 125), w('Count', 1195, 100, 1240, 125),
    w('Percentage', 1280, 100, 1380, 125)
  ];

  // "Python" / "Programming" / "Lab" wraps across 3 physical lines. The
  // Total-Sessions cell's own digits OCR'd with trailing punctuation
  // ("25;", not a pure digit token) -- real OCR noise that previously got
  // pulled into the course-name text as a wrapped-name "overflow" word,
  // sitting adjacent to "Lab" and false-matching ROOM_PATTERN's
  // "Lab<number>" rule (silently deleting both "Lab" and "25;" from the
  // subject: "Python Programming Lab" -> "Python Programming").
  const row = [
    w('Python', 60, 200, 120, 225), w('Nitin', 390, 200, 440, 225),
    w('9', 530, 200, 550, 225), w('3', 700, 200, 720, 225),
    w('0', 850, 200, 870, 225), w('0', 1010, 200, 1030, 225),
    w('12', 1150, 200, 1180, 225), w('75.00', 1290, 200, 1350, 225),
    w('Programming', 60, 228, 160, 250), w('25;', 220, 228, 250, 250), w('Chavan', 390, 228, 450, 250),
    w('Lab', 60, 253, 100, 275)
  ];

  const rows = mod.reconstructAttendanceTableFromGrid({ words: [...header, ...row] }, []);
  if (rows.length !== 1) return `expected exactly 1 row, got ${rows.length}: ${JSON.stringify(rows.map(r => r.subject))}`;
  if (!/Lab/i.test(rows[0].subject)) return `expected "Lab" to survive in the subject, got "${rows[0].subject}"`;
  if (!/Python/i.test(rows[0].subject) || !/Programming/i.test(rows[0].subject)) {
    return `expected the full wrapped name to survive, got "${rows[0].subject}"`;
  }
  if (rows[0].present !== 9 || rows[0].absent !== 3) return `expected P=9/A=3 unaffected by the name fix, got P=${rows[0].present}/A=${rows[0].absent}`;
  return true;
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${errors.length}`);
console.log('========================================');

if (errors.length > 0) {
  console.error('\n❌ FAILURES:');
  errors.forEach(e => console.error(`  - ${e.name}: ${e.error}`));
  process.exit(1);
} else {
  console.log('🏆 ALL ATTENDANCE SCAN ROW RECONSTRUCTION TESTS PASSED! 🚀\n');
}
