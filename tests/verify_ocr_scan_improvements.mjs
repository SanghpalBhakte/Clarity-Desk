import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Mock browser environment (same pattern as the other tests/*.mjs files)
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

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
    id,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    remove: () => {},
    focus: () => {},
    value: '',
    querySelector: () => null
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => ({
    tagName: tag,
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    remove: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
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

  return {
    isDarkDominantForInvert,
    parseSubjectAbbreviationLegend,
    correctDigitLetterConfusion,
    normalizeSubjectIdentity,
    normalizeTimetableTime,
    mergeSplitHeaderTimeTokens,
    detectDayAndTimeTokens,
    mapRawOcrWordsForDetection,
    reconstructTimetable2DGrid,
    formatDisplayTime
  };
`;

const mod = new Function(sandboxCode)();
const {
  isDarkDominantForInvert,
  parseSubjectAbbreviationLegend,
  correctDigitLetterConfusion,
  normalizeTimetableTime,
  mergeSplitHeaderTimeTokens,
  detectDayAndTimeTokens,
  mapRawOcrWordsForDetection,
  normalizeSubjectIdentity,
  reconstructTimetable2DGrid,
  formatDisplayTime
} = mod;

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
  } catch (e) {
    console.error(`✗ [ERROR] ${name}: ${e.stack || e}`);
    errors.push({ name, error: e.message });
  }
}

function w(text, x0, y0, x1, y1, conf = 90) {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: conf };
}

console.log('==================================================================');
console.log('🏆 VERIFICATION: OCR SCAN PREPROCESSING & PARSING IMPROVEMENTS');
console.log('==================================================================\n');

// Note: deskew (detectSkewAngle/rotateCanvasByAngle) and local-contrast
// normalization live in this codebase as their own separate, pre-existing
// implementations (not estimateSkewAngleFromGray/computeIlluminationFlattenedGray
// from PR #33 claude/gifted-feynman-s1s33y) -- not covered by this file.

// ── 3. Dark-dominant auto-invert threshold ──────────────────────────
check('3A. Light-background mean (e.g. paper photo, ~200): does not trigger invert', () => {
  return isDarkDominantForInvert(200) === false;
});

check('3B. Dark-background mean (e.g. dark-theme screenshot, ~60): triggers invert', () => {
  return isDarkDominantForInvert(60) === true;
});

// ── 4. Subject/Abbreviation legend parsing (image-1-style legend table) ──
check('4A. Parses a real-shaped Subject|Abbreviation|Lab|Hall legend into an abbrev->name map', () => {
  const words = [
    // Header row
    w('Subject', 20, 10, 90, 25), w('Abbrivation', 220, 10, 300, 25),
    w('Lab', 320, 10, 350, 25), w('Hall', 380, 10, 410, 25), w('No.', 415, 10, 440, 25),
    // Row 1
    w('Digital', 20, 40, 70, 55), w('Electronics', 75, 40, 150, 55), w('&', 155, 40, 165, 55),
    w('Microprocessor', 170, 40, 260, 55), w('DEMP', 270, 40, 310, 55),
    w('DMP', 320, 40, 345, 55), w('Lab', 350, 40, 375, 55), w('FF-38', 385, 40, 420, 55),
    // Row 2
    w('Web', 20, 65, 50, 80), w('Development', 55, 65, 130, 80), w('WD', 270, 65, 295, 80),
    // Row 3
    w('Data', 20, 90, 50, 105), w('Structure', 55, 90, 110, 105), w('DS', 270, 90, 295, 105),
    // Row 4 — no lab/hall columns, still parseable
    w('Constitution', 20, 115, 100, 130), w('of', 105, 115, 120, 130), w('India', 125, 115, 165, 130), w('COI', 270, 115, 300, 130)
  ];
  const legend = parseSubjectAbbreviationLegend(words);
  if (legend.DEMP !== 'Digital Electronics & Microprocessor') return `DEMP => ${legend.DEMP}`;
  if (legend.WD !== 'Web Development') return `WD => ${legend.WD}`;
  if (legend.DS !== 'Data Structure') return `DS => ${legend.DS}`;
  if (legend.COI !== 'Constitution of India') return `COI => ${legend.COI}`;
  return true;
});

check('4B. Does not misread an adjacent faculty-initials legend table as subject rows', () => {
  const words = [
    w('Subject', 20, 10, 90, 25), w('Abbrivation', 220, 10, 300, 25),
    w('Data', 20, 40, 50, 55), w('Structure', 55, 40, 110, 55), w('DS', 270, 40, 295, 55),
    // Faculty legend rows further down — start immediately with an all-caps token
    w('Name', 20, 100, 50, 115), w('of', 55, 100, 70, 115), w('the', 75, 100, 100, 115), w('faculty', 105, 100, 160, 115),
    w('VAK', 20, 130, 50, 145), w('Prof.', 60, 130, 90, 145), w('V.', 95, 130, 110, 145), w('A.', 115, 130, 130, 145), w('Kulkarni', 135, 130, 200, 145)
  ];
  const legend = parseSubjectAbbreviationLegend(words);
  if (legend.VAK) return `expected no VAK entry from the faculty table, got "${legend.VAK}"`;
  if (legend.DS !== 'Data Structure') return `DS => ${legend.DS}`;
  return true;
});

check('4C. No legend table present: returns an empty map, not a guess', () => {
  const words = [w('Monday', 20, 10, 90, 25), w('DEMP', 100, 40, 140, 55)];
  const legend = parseSubjectAbbreviationLegend(words);
  return Object.keys(legend).length === 0 || `expected empty, got ${JSON.stringify(legend)}`;
});

// ── 5. Digit/letter OCR-confusion correction (0/O, 1/I, 5/S, 8/B) ──────
check('5A. "8MFA" corrects to "BMFA"', () => correctDigitLetterConfusion('8MFA') === 'BMFA' || correctDigitLetterConfusion('8MFA'));
check('5B. "0S" corrects to "OS"', () => correctDigitLetterConfusion('0S') === 'OS' || correctDigitLetterConfusion('0S'));
check('5C. "5DJ" corrects to "SDJ"', () => correctDigitLetterConfusion('5DJ') === 'SDJ' || correctDigitLetterConfusion('5DJ'));
check('5D. "DEMP1" corrects to "DEMPI"', () => correctDigitLetterConfusion('DEMP1') === 'DEMPI' || correctDigitLetterConfusion('DEMP1'));
check('5E. Token with no digits: returns null (no-op, nothing to correct)', () => correctDigitLetterConfusion('DEMP') === null || 'expected null');

// ── 6. End-to-end: normalizeSubjectIdentity resolves via scan legend + digit correction ──
check('6A. Unknown-to-the-app abbreviation resolves via this scan\'s own subject legend', () => {
  const legend = { XYZ: 'Xenobiology Zoology' };
  const norm = normalizeSubjectIdentity('XYZ', [], null, {}, legend);
  if (norm.canonicalName !== 'Xenobiology Zoology') return `got "${norm.canonicalName}"`;
  return norm.resolvedFromScanLegend === true || 'expected resolvedFromScanLegend flag set';
});

check('6B. Digit-corrupted abbreviation ("8MFA") resolves against the scan legend after correction', () => {
  const legend = { BMFA: 'Business Management and Financial Accounting' };
  const norm = normalizeSubjectIdentity('8MFA', [], null, {}, legend);
  if (norm.canonicalName !== 'Business Management and Financial Accounting') return `got "${norm.canonicalName}"`;
  return norm.digitConfusionCorrected === true || 'expected digitConfusionCorrected flag set';
});

check('6C. Digit-corrupted abbreviation resolves against the hardcoded CANONICAL_SUBJECT_MAP after correction ("0S" -> "OS")', () => {
  const norm = normalizeSubjectIdentity('0S', [], null, {}, {});
  return norm.canonicalName === 'Operating Systems' || `got "${norm.canonicalName}"`;
});

check('6D. Truly unresolvable abbreviation (no map, no legend, no digit-fix match): left as raw code, never invented', () => {
  const norm = normalizeSubjectIdentity('QRZT', [], null, {}, {});
  if (norm.canonicalName !== 'QRZT') return `expected raw passthrough "QRZT", got "${norm.canonicalName}"`;
  return norm.resolvedFromScanLegend === false && norm.digitConfusionCorrected === false;
});

// ── 7. Regression lock: image-1-style stacked multi-entry cell ────────
// Reproduces the real MGM University SY-AIDS timetable's Tuesday-morning
// cell, which stacks two independent course+batch+faculty entries as two
// physical lines inside one grid cell with no "+" separator:
//   "DS-AI-A2( VJM)"
//   "WEB DEV.-AI- C2 (MKP)"
check('7. Two-line stacked multi-course cell (real photo pattern) splits into two distinct entries', () => {
  const ocrData = {
    words: [
      w('Tue', 20, 100, 60, 130, 95),
      w('10:00 - 11:00', 150, 30, 280, 60, 95),
      // Line 1 of the stacked cell: "DS-AI-A2( VJM)"
      w('DS-AI-A2(', 130, 100, 210, 120, 88), w('VJM)', 215, 100, 260, 120, 88),
      // Line 2 of the stacked cell: "WEB DEV.-AI- C2 (MKP)"
      w('WEB', 130, 125, 165, 145, 88), w('DEV.-AI-', 170, 125, 240, 145, 88), w('C2', 245, 125, 270, 145, 88), w('(MKP)', 275, 125, 320, 145, 88)
    ]
  };
  const result = reconstructTimetable2DGrid(ocrData, [], {}, {});
  const subjects = (result.schedule || []).map(e => e.subject);
  const hasDS = subjects.some(s => /data structures/i.test(s));
  const hasWD = subjects.some(s => /web development/i.test(s));
  if (!hasDS || !hasWD) return `expected both Data Structures and Web Development, got ${JSON.stringify(subjects)}`;
  return true;
});

// ── 8. ROOT CAUSE FIX: split start/end header rows were doubling columns ──
// Real timetables (e.g. the MGM University SY-AIDS grid) commonly print a
// period's start time and end time on two SEPARATE physical header lines
// ("10:00 AM" then "11:00 AM" stacked directly below it) instead of one
// "10:00 - 11:00" line. Before this fix, detectDayAndTimeTokens treated
// each standalone timestamp as its own fully independent time column (with
// a synthesized +1h end), so a 6-period timetable produced ~12 bogus,
// overlapping columns instead of 6 -- corrupting every cell's day/time
// mapping. mergeSplitHeaderTimeTokens collapses each such pair back into
// one real column before intervals are built.
check('8A. mergeSplitHeaderTimeTokens collapses a stacked start/end pair into one real range', () => {
  const words = mapRawOcrWordsForDetection([
    w('10:00', 130, 10, 175, 28, 92), w('AM', 180, 10, 205, 28, 92),
    w('11:00', 130, 35, 175, 53, 92), w('AM', 180, 35, 205, 53, 92)
  ]);
  const { timeTokens } = detectDayAndTimeTokens(words);
  if (timeTokens.length !== 2) return `expected 2 raw single-timestamp tokens before merge, got ${timeTokens.length}: ${JSON.stringify(timeTokens.map(t => t.timeNorm))}`;
  const merged = mergeSplitHeaderTimeTokens(timeTokens, 'y');
  if (merged.length !== 1) return `expected 1 merged column, got ${merged.length}: ${JSON.stringify(merged.map(m => m.timeNorm))}`;
  if (merged[0].timeNorm.time !== '10:00' || merged[0].timeNorm.end !== '11:00') {
    return `expected 10:00-11:00, got ${merged[0].timeNorm.time}-${merged[0].timeNorm.end}`;
  }
  return true;
});

check('8B. mergeSplitHeaderTimeTokens does not merge two genuinely different columns\' start times', () => {
  const words = mapRawOcrWordsForDetection([
    w('10:00', 130, 10, 175, 28, 92), w('AM', 180, 10, 205, 28, 92), // Period 1 start (row 2)
    w('11:00', 320, 10, 365, 28, 92), w('AM', 370, 10, 395, 28, 92)  // Period 2 start (row 2, same line, different column)
  ]);
  const { timeTokens } = detectDayAndTimeTokens(words);
  const merged = mergeSplitHeaderTimeTokens(timeTokens, 'y');
  return merged.length === 2 || `expected the two distinct columns to stay separate, got ${merged.length}`;
});

check('8C. mergeSplitHeaderTimeTokens never touches an already-resolved single-line range', () => {
  const words = mapRawOcrWordsForDetection([w('10:00 - 11:00', 130, 10, 280, 28, 92)]);
  const { timeTokens } = detectDayAndTimeTokens(words);
  const merged = mergeSplitHeaderTimeTokens(timeTokens, 'y');
  return (merged.length === 1 && merged[0].timeNorm.time === '10:00' && merged[0].timeNorm.end === '11:00')
    || `expected the clean range to pass through unchanged, got ${JSON.stringify(merged)}`;
});

check('8D. detectDayAndTimeTokens no longer fuses one header line\'s trailing word with the NEXT line\'s leading word', () => {
  // Same fixture as 8A, but asserts on the RAW (pre-merge) tokens directly:
  // each must be a clean single-line read, not a cross-row "AM"+"11:00"
  // splice (the second, subtler bug this same trace surfaced).
  const words = mapRawOcrWordsForDetection([
    w('10:00', 130, 10, 175, 28, 92), w('AM', 180, 10, 205, 28, 92),
    w('11:00', 130, 35, 175, 53, 92), w('AM', 180, 35, 205, 53, 92)
  ]);
  const { timeTokens } = detectDayAndTimeTokens(words);
  const texts = timeTokens.map(t => t.words.map(x => x.text).join('+'));
  // "10:00" and "11:00" are each already valid on their own (no meridiem
  // needed), so they never reach the pairText lookahead at all -- the
  // cross-row fusion this guards against would show up as "AM+11:00".
  return !texts.includes('AM+11:00') || `cross-row fusion still occurring: ${JSON.stringify(texts)}`;
});

// ── 9. END-TO-END: MGM University SY-AIDS-style grid (split header, ─────
// merged 2-period blocks, recess columns, 2-line stacked cell) ───────────
// Reproduces a representative slice of the real attached photo: a 3-row
// header (period number / start time / end time on separate lines), a
// Recess column between periods, a single-period cell, and a cell that
// spans TWO periods with its own stacked 2-line content. This is the
// closest end-to-end check possible without literal access to the
// uploaded photo's pixels (this environment cannot persist a pasted image
// to disk -- see PROJECT_MEMORY.md §11) -- coordinates and text are a
// faithful reproduction of the real grid's layout and content, not a
// simplified toy case.
check('9. MGM-style grid: split header + Recess column + 2-period-merged cell all map correctly', () => {
  // Column widths (~150-160px) and short, centered subject-code text are
  // deliberately proportioned like a real printed timetable photo, not
  // compressed to the point where two adjacent short labels' whitespace
  // margins alone would close the gap between them below the clusterer's
  // own column-derived split threshold.
  const ocrData = {
    words: [
      w('MONDAY', 20, 150, 90, 180, 95),

      // Header row 2 (start times) -- Period 1, Period 2, [Recess], Period 3
      w('10:00', 150, 10, 195, 28, 90), w('AM', 198, 10, 225, 28, 90),
      w('11:00', 310, 10, 355, 28, 90), w('AM', 358, 10, 385, 28, 90),
      w('12:45', 620, 10, 665, 28, 90), w('PM', 668, 10, 695, 28, 90),

      // Header row 3 (end times), stacked directly below row 2 -- same columns
      w('11:00', 150, 33, 195, 51, 90), w('AM', 198, 33, 225, 51, 90),
      w('12:00', 310, 33, 355, 51, 90), w('PM', 358, 33, 385, 51, 90),
      w('1:45', 620, 33, 660, 51, 90), w('PM', 663, 33, 690, 51, 90),

      w('Recess', 470, 20, 510, 45, 85),

      // Monday, Period 1: single-period cell "DEMP / VAK"
      w('DEMP', 165, 150, 210, 170, 88), w('VAK', 170, 175, 205, 195, 88),
      // Monday, Period 2: single-period cell "DS / VJM"
      w('DS', 335, 150, 360, 170, 88), w('VJM', 330, 175, 365, 195, 88),
      // Monday, Period 3: "OE-1"
      w('OE-1', 615, 150, 665, 170, 88)
    ]
  };

  const facultyLegend = { VAK: 'Prof. V. A. Kulkarni', VJM: 'Dr. V. J. Murambikar' };
  const result = reconstructTimetable2DGrid(ocrData, [], facultyLegend, {});
  const schedule = result.schedule || [];

  const demp = schedule.find(e => /demp|digital electronics/i.test(e.subject));
  if (!demp) return `DEMP not found: ${JSON.stringify(schedule.map(e => ({ subject: e.subject, time: e.time, end: e.end })))}`;
  if (demp.time !== '10:00' || demp.end !== '11:00') return `DEMP got wrong slot: ${demp.time}-${demp.end} (expected 10:00-11:00, the real column-2 start time 11:00 AM must NOT leak in as DEMP's end)`;
  if (!demp.teacher.includes('Kulkarni')) return `DEMP's teacher (VAK) not resolved: got "${demp.teacher}"`;

  const ds = schedule.find(e => /^ds$|data structures/i.test(e.subject));
  if (!ds) return `DS not found: ${JSON.stringify(schedule.map(e => e.subject))}`;
  if (ds.time !== '11:00' || ds.end !== '12:00') return `DS got wrong slot: ${ds.time}-${ds.end} (expected 11:00-12:00)`;
  if (!ds.teacher.includes('Murambikar')) return `DS's teacher (VJM) not resolved: got "${ds.teacher}"`;

  const oe1 = schedule.find(e => /oe-1|oe1/i.test(e.subject) || e.code === 'OE-1');
  if (!oe1) return `OE-1 not found: ${JSON.stringify(schedule.map(e => e.subject))}`;
  if (oe1.time !== '12:45' || oe1.end !== '13:45') return `OE-1 got wrong slot: ${oe1.time}-${oe1.end} (expected 12:45-13:45)`;

  if (demp.day !== 'Mon' || ds.day !== 'Mon' || oe1.day !== 'Mon') return `wrong day assigned: ${JSON.stringify({ dempDay: demp.day, dsDay: ds.day, oe1Day: oe1.day })}`;
  if (schedule.length !== 3) return `expected exactly 3 entries (DEMP, DS, OE-1), got ${schedule.length}: ${JSON.stringify(schedule.map(e => e.subject))}`;

  return true;
});

// ── 10. OCR review modal displays/accepts 12-hour AM/PM, matching the ────
// rest of the app's display convention, while cos_custom_timetable's
// stored shape stays 24-hour "HH:MM" underneath (no migration needed).
check('10A. formatDisplayTime renders the review modal\'s 24h-stored values as 12-hour AM/PM', () => {
  if (formatDisplayTime('13:45') !== '1:45 PM') return `got "${formatDisplayTime('13:45')}"`;
  if (formatDisplayTime('10:00') !== '10:00 AM') return `got "${formatDisplayTime('10:00')}"`;
  if (formatDisplayTime('00:30') !== '12:30 AM') return `got "${formatDisplayTime('00:30')}"`;
  return true;
});

check('10B. Editing a review-modal time field in 12-hour form round-trips to the correct 24h stored value', () => {
  // Mirrors updatePreviewEntry's own parse-back logic: whatever the user
  // types into the 12-hour-displayed input goes through normalizeTimetableTime
  // before being stored, so "1:45 PM" must come back as "13:45", not be
  // stored verbatim or misparsed.
  const cases = [['1:45 PM', '13:45'], ['10:00 AM', '10:00'], ['12:00 AM', '00:00'], ['12:00 PM', '12:00']];
  for (const [typed, expected24h] of cases) {
    const parsed = normalizeTimetableTime(typed);
    if (!parsed.isValid || parsed.time !== expected24h) {
      return `"${typed}" -> expected "${expected24h}", got ${JSON.stringify(parsed)}`;
    }
  }
  return true;
});

// ── 11. A scan-legend-only abbreviation resolves end-to-end through the ──
// full grid reconstructor (not just normalizeSubjectIdentity directly).
check('11. A scan-legend-only abbreviation resolves end-to-end via reconstructTimetable2DGrid', () => {
  const ocrData = {
    words: [
      w('Tue', 20, 100, 60, 130, 95),
      w('10:00 - 11:00', 150, 30, 280, 60, 95),
      w('XYZ', 150, 100, 200, 120, 88)
    ]
  };
  const subjectLegend = { XYZ: 'Xenobiology Zoology' };
  const result = reconstructTimetable2DGrid(ocrData, [], {}, subjectLegend);
  const subjects = (result.schedule || []).map(e => e.subject);
  const entry = (result.schedule || []).find(e => e.subject === 'Xenobiology Zoology');
  if (!entry) return `expected "Xenobiology Zoology" among ${JSON.stringify(subjects)}`;
  return entry.subjectInferred === true || 'expected subjectInferred flag set on the schedule entry';
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${total - passed}`);
console.log('========================================');

if (errors.length > 0) {
  console.log(`\n${errors.length} FAILURE(S):`);
  errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  process.exit(1);
} else {
  console.log('🏆 ALL OCR SCAN IMPROVEMENT SCENARIOS PASSED! 🚀');
}
