import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Covers the OCR scan improvements ported from PR #33
// (claude/gifted-feynman-s1s33y): dark-theme auto-invert, the
// Subject|Abbreviation legend parser, and digit/letter OCR-confusion
// correction. Deskew and illumination-flattening are NOT covered here --
// this codebase has its own separate deskew (detectSkewAngle /
// rotateCanvasByAngle) and local-contrast (tile-based blend) implementations
// instead of PR #33's estimateSkewAngleFromGray / computeIlluminationFlattenedGray,
// so those aren't part of this file.
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
    reconstructTimetable2DGrid
  };
`;

const mod = new Function(sandboxCode)();
const {
  isDarkDominantForInvert,
  parseSubjectAbbreviationLegend,
  correctDigitLetterConfusion,
  normalizeSubjectIdentity,
  reconstructTimetable2DGrid
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
console.log('🏆 VERIFICATION: OCR SCAN IMPROVEMENTS PORTED FROM PR #33');
console.log('==================================================================\n');

// ── 1. Dark-dominant auto-invert threshold ──────────────────────────
check('1A. Light-background mean (e.g. paper photo, ~200): does not trigger invert', () => {
  return isDarkDominantForInvert(200) === false;
});

check('1B. Dark-background mean (e.g. dark-theme screenshot, ~60): triggers invert', () => {
  return isDarkDominantForInvert(60) === true;
});

// ── 2. Subject/Abbreviation legend parsing (image-1-style legend table) ──
check('2A. Parses a real-shaped Subject|Abbreviation|Lab|Hall legend into an abbrev->name map', () => {
  const words = [
    w('Subject', 20, 10, 90, 25), w('Abbrivation', 220, 10, 300, 25),
    w('Lab', 320, 10, 350, 25), w('Hall', 380, 10, 410, 25), w('No.', 415, 10, 440, 25),
    w('Digital', 20, 40, 70, 55), w('Electronics', 75, 40, 150, 55), w('&', 155, 40, 165, 55),
    w('Microprocessor', 170, 40, 260, 55), w('DEMP', 270, 40, 310, 55),
    w('DMP', 320, 40, 345, 55), w('Lab', 350, 40, 375, 55), w('FF-38', 385, 40, 420, 55),
    w('Web', 20, 65, 50, 80), w('Development', 55, 65, 130, 80), w('WD', 270, 65, 295, 80),
    w('Data', 20, 90, 50, 105), w('Structure', 55, 90, 110, 105), w('DS', 270, 90, 295, 105),
    w('Constitution', 20, 115, 100, 130), w('of', 105, 115, 120, 130), w('India', 125, 115, 165, 130), w('COI', 270, 115, 300, 130)
  ];
  const legend = parseSubjectAbbreviationLegend(words);
  if (legend.DEMP !== 'Digital Electronics & Microprocessor') return `DEMP => ${legend.DEMP}`;
  if (legend.WD !== 'Web Development') return `WD => ${legend.WD}`;
  if (legend.DS !== 'Data Structure') return `DS => ${legend.DS}`;
  if (legend.COI !== 'Constitution of India') return `COI => ${legend.COI}`;
  return true;
});

check('2B. Does not misread an adjacent faculty-initials legend table as subject rows', () => {
  const words = [
    w('Subject', 20, 10, 90, 25), w('Abbrivation', 220, 10, 300, 25),
    w('Data', 20, 40, 50, 55), w('Structure', 55, 40, 110, 55), w('DS', 270, 40, 295, 55),
    w('Name', 20, 100, 50, 115), w('of', 55, 100, 70, 115), w('the', 75, 100, 100, 115), w('faculty', 105, 100, 160, 115),
    w('VAK', 20, 130, 50, 145), w('Prof.', 60, 130, 90, 145), w('V.', 95, 130, 110, 145), w('A.', 115, 130, 130, 145), w('Kulkarni', 135, 130, 200, 145)
  ];
  const legend = parseSubjectAbbreviationLegend(words);
  if (legend.VAK) return `expected no VAK entry from the faculty table, got "${legend.VAK}"`;
  if (legend.DS !== 'Data Structure') return `DS => ${legend.DS}`;
  return true;
});

check('2C. No legend table present: returns an empty map, not a guess', () => {
  const words = [w('Monday', 20, 10, 90, 25), w('DEMP', 100, 40, 140, 55)];
  const legend = parseSubjectAbbreviationLegend(words);
  return Object.keys(legend).length === 0 || `expected empty, got ${JSON.stringify(legend)}`;
});

// ── 3. Digit/letter OCR-confusion correction (0/O, 1/I, 5/S, 8/B) ──────
check('3A. "8MFA" corrects to "BMFA"', () => correctDigitLetterConfusion('8MFA') === 'BMFA' || correctDigitLetterConfusion('8MFA'));
check('3B. "0S" corrects to "OS"', () => correctDigitLetterConfusion('0S') === 'OS' || correctDigitLetterConfusion('0S'));
check('3C. "5DJ" corrects to "SDJ"', () => correctDigitLetterConfusion('5DJ') === 'SDJ' || correctDigitLetterConfusion('5DJ'));
check('3D. "DEMP1" corrects to "DEMPI"', () => correctDigitLetterConfusion('DEMP1') === 'DEMPI' || correctDigitLetterConfusion('DEMP1'));
check('3E. Token with no digits: returns null (no-op, nothing to correct)', () => correctDigitLetterConfusion('DEMP') === null || 'expected null');

// ── 4. End-to-end: normalizeSubjectIdentity resolves via scan legend + digit correction ──
check('4A. Unknown-to-the-app abbreviation resolves via this scan\'s own subject legend', () => {
  const legend = { XYZ: 'Xenobiology Zoology' };
  const norm = normalizeSubjectIdentity('XYZ', [], null, {}, legend);
  if (norm.canonicalName !== 'Xenobiology Zoology') return `got "${norm.canonicalName}"`;
  return norm.resolvedFromScanLegend === true || 'expected resolvedFromScanLegend flag set';
});

check('4B. Digit-corrupted abbreviation ("8MFA") resolves against the scan legend after correction', () => {
  const legend = { BMFA: 'Business Management and Financial Accounting' };
  const norm = normalizeSubjectIdentity('8MFA', [], null, {}, legend);
  if (norm.canonicalName !== 'Business Management and Financial Accounting') return `got "${norm.canonicalName}"`;
  return norm.digitConfusionCorrected === true || 'expected digitConfusionCorrected flag set';
});

check('4C. Digit-corrupted abbreviation resolves against the hardcoded CANONICAL_SUBJECT_MAP after correction ("0S" -> "OS")', () => {
  const norm = normalizeSubjectIdentity('0S', [], null, {}, {});
  return norm.canonicalName === 'Operating Systems' || `got "${norm.canonicalName}"`;
});

check('4D. Truly unresolvable abbreviation (no map, no legend, no digit-fix match): left as raw code, never invented', () => {
  const norm = normalizeSubjectIdentity('QRZT', [], null, {}, {});
  if (norm.canonicalName !== 'QRZT') return `expected raw passthrough "QRZT", got "${norm.canonicalName}"`;
  return norm.resolvedFromScanLegend === false && norm.digitConfusionCorrected === false;
});

// ── 5. Regression lock: subjectLegend threads correctly through the full grid reconstructor ──
check('5. A scan-legend-only abbreviation resolves end-to-end via reconstructTimetable2DGrid', () => {
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
  console.log('🏆 ALL PORTED OCR SCAN IMPROVEMENT SCENARIOS PASSED! 🚀');
}
