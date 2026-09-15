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
    estimateSkewAngleFromGray,
    computeIlluminationFlattenedGray,
    isDarkDominantForInvert,
    parseSubjectAbbreviationLegend,
    correctDigitLetterConfusion,
    normalizeSubjectIdentity,
    reconstructTimetable2DGrid
  };
`;

const mod = new Function(sandboxCode)();
const {
  estimateSkewAngleFromGray,
  computeIlluminationFlattenedGray,
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

// ── Synthetic grayscale fixture builders ──────────────────────────
// Builds a WxH grayscale array with `lineCount` horizontal dark bands
// (simulating text lines / grid rows on a light background), then rotates
// those bands by `angleDeg` to simulate a camera-skewed photo.
function buildRotatedLinesGray(width, height, lineCount, angleDeg) {
  const gray = new Uint8ClampedArray(width * height).fill(230);
  const rad = angleDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const cx = width / 2, cy = height / 2;
  const bandThickness = 3;
  for (let li = 0; li < lineCount; li++) {
    const lineY = Math.round(((li + 1) / (lineCount + 1)) * height);
    for (let x = 0; x < width; x++) {
      for (let t = -bandThickness; t <= bandThickness; t++) {
        // Rotate the (x, lineY+t) point around the image center by angleDeg
        const dx = x - cx, dy = (lineY + t) - cy;
        const rx = Math.round(cx + dx * cos - dy * sin);
        const ry = Math.round(cy + dx * sin + dy * cos);
        if (rx >= 0 && rx < width && ry >= 0 && ry < height) {
          gray[ry * width + rx] = 30;
        }
      }
    }
  }
  return gray;
}

console.log('==================================================================');
console.log('🏆 VERIFICATION: OCR SCAN PREPROCESSING & PARSING IMPROVEMENTS');
console.log('==================================================================\n');

// ── 1. Deskew angle estimation ─────────────────────────────────────
check('1A. Unrotated horizontal-line pattern: no correction applied (angle 0)', () => {
  const gray = buildRotatedLinesGray(240, 240, 6, 0);
  const angle = estimateSkewAngleFromGray(gray, 240, 240);
  return angle === 0 || `expected 0, got ${angle}`;
});

// estimateSkewAngleFromGray returns the skew the CONTENT is already at
// (matches the fixture's own rotation directly) -- the caller in
// preprocessImageForOCR then applies rotateCanvasByDegrees(canvas,
// -skewAngle) to cancel it out. This is verified algebraically: the
// rotation matrices compose to R(angleDeg_true - correctionDeg), which is
// identity exactly when correctionDeg == angleDeg_true == the value
// asserted below.
check('1B. Lines rotated 6°: detected angle matches the true skew directly', () => {
  const gray = buildRotatedLinesGray(240, 240, 6, 6);
  const angle = estimateSkewAngleFromGray(gray, 240, 240);
  return Math.abs(angle - 6) <= 1.5 || `expected ~6, got ${angle}`;
});

check('1C. Lines rotated -4°: detected angle matches the true skew directly', () => {
  const gray = buildRotatedLinesGray(240, 240, 6, -4);
  const angle = estimateSkewAngleFromGray(gray, 240, 240);
  return Math.abs(angle - (-4)) <= 1.5 || `expected ~-4, got ${angle}`;
});

check('1D. Blank/near-uniform image: returns 0 rather than a false angle', () => {
  const gray = new Uint8ClampedArray(200 * 200).fill(240);
  const angle = estimateSkewAngleFromGray(gray, 200, 200);
  return angle === 0 || `expected 0 on blank image, got ${angle}`;
});

// ── 2. Illumination flattening (shadow correction) ─────────────────
check('2A. Evenly-lit image: returned unchanged (reference-equal no-op)', () => {
  const gray = new Uint8ClampedArray(100 * 100).fill(200);
  const flattened = computeIlluminationFlattenedGray(gray, 100, 100);
  return flattened === gray || 'expected the exact same array reference back';
});

check('2B. Shadow gradient (dark right half): flattened output narrows the left/right brightness gap', () => {
  const width = 120, height = 120;
  const gray = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      gray[y * width + x] = x < width / 2 ? 210 : 90; // hard shadow edge
    }
  }
  const flattened = computeIlluminationFlattenedGray(gray, width, height);
  const avg = (arr, xMin, xMax) => {
    let s = 0, n = 0;
    for (let y = 0; y < height; y++) for (let x = xMin; x < xMax; x++) { s += arr[y * width + x]; n++; }
    return s / n;
  };
  const beforeGap = avg(gray, 0, width / 2) - avg(gray, width / 2, width);
  const afterGap = avg(flattened, 0, width / 2) - avg(flattened, width / 2, width);
  return Math.abs(afterGap) < Math.abs(beforeGap) || `expected gap to shrink: before=${beforeGap}, after=${afterGap}`;
});

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
