import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { withTimetableOcr } from './lazy-modules.mjs';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Mock browser environment (same pattern as verify_ocr_header_robustness.mjs),
// plus lightweight Image/canvas/Tesseract-worker mocks so the new
// low-confidence cell-region retry (Stage C) can be exercised end-to-end
// without a real browser or real OCR.
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

class FakeImage {
  set src(v) {
    this._src = v;
    this.width = 1600;
    this.height = 1174;
    if (this.onload) this.onload();
  }
  get src() { return this._src; }
}
globalThis.Image = FakeImage;

function makeFakeCanvas() {
  return {
    _width: 1, _height: 1,
    get width() { return this._width; },
    set width(v) { this._width = v; },
    get height() { return this._height; },
    set height(v) { this._height = v; },
    getContext: () => ({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: () => {},
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4).fill(180) }),
      putImageData: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillRect: () => {}
    }),
    toDataURL: (mime) => `data:${mime || 'image/png'};base64,FAKE`
  };
}

globalThis.document = {
  getElementById: (id) => ({
    id, style: {}, classList: { add: () => {}, remove: () => {} },
    appendChild: () => {}, remove: () => {}, focus: () => {}, value: '', textContent: '',
    querySelector: () => null
  }),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: (tag) => tag === 'canvas' ? makeFakeCanvas() : {
    tagName: tag, style: {}, classList: { add: () => {}, remove: () => {} },
    appendChild: () => {}, remove: () => {}, addEventListener: () => {}, removeEventListener: () => {}
  },
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
  ${withTimetableOcr(codeToRun)}

  return {
    reconstructTimetable2DGrid,
    extractTimetableFromImage,
    AIService
  };
`;

function createSandbox() {
  return new Function(sandboxCode)();
}

let passed = 0;
let total = 0;
const errors = [];

function check(name, testFn) {
  total++;
  const res = testFn();
  return Promise.resolve(res).then(
    (r) => {
      if (r === true || r === undefined) {
        console.log(`✓ [PASS] ${name}`);
        passed++;
      } else {
        console.error(`✗ [FAIL] ${name}: ${r}`);
        errors.push({ name, error: r });
      }
    },
    (e) => {
      console.error(`✗ [ERROR] ${name}: ${e.stack || e}`);
      errors.push({ name, error: e.message });
    }
  );
}

function w(text, x0, y0, x1, y1, conf = 90) {
  return { text, bbox: { x0, y0, x1, y1 }, confidence: conf };
}

console.log('==================================================================');
console.log('🏆 VERIFICATION: BODY-TEXT LOW-CONFIDENCE CELL RETRY (Stage C)');
console.log('==================================================================\n');

async function main() {

await check('1. A cell whose OCR words are mostly low-confidence is flagged in lowConfidenceClusters', () => {
  const mod = createSandbox();
  const ocrData = {
    words: [
      w('Thu', 20, 100, 60, 130, 95), w('10:00 - 11:00', 150, 30, 280, 60, 95),
      w('Pashilii', 150, 100, 210, 120, 20), w('Roce', 215, 100, 250, 120, 15),
      w('SDJ', 255, 100, 280, 120, 10), w('ss', 285, 100, 300, 120, 25)
    ]
  };
  const res = mod.reconstructTimetable2DGrid(ocrData, []);
  if (!res.lowConfidenceClusters || res.lowConfidenceClusters.length !== 1) {
    return `expected exactly 1 flagged cluster, got ${JSON.stringify(res.lowConfidenceClusters)}`;
  }
  const region = res.lowConfidenceClusters[0];
  if (region.day !== 'Thu') return `expected flagged region day 'Thu', got '${region.day}'`;
  if (!(region.bbox.x0 <= 150 && region.bbox.x1 >= 300)) return `flagged bbox doesn't cover the cell's words: ${JSON.stringify(region.bbox)}`;
  return true;
});

await check('2. A confidently-recognized cell is NOT flagged', () => {
  const mod = createSandbox();
  const ocrData = {
    words: [
      { text: 'Thursday', bbox: { x0: 20, y0: 100, x1: 90, y1: 130 }, confidence: 95 },
      { text: '10:00 - 11:00', bbox: { x0: 150, y0: 30, x1: 250, y1: 60 }, confidence: 95 },
      { text: 'Deep', bbox: { x0: 150, y0: 100, x1: 190, y1: 120 }, confidence: 90 },
      { text: 'Learning', bbox: { x0: 195, y0: 100, x1: 260, y1: 120 }, confidence: 90 },
      { text: 'Prof.', bbox: { x0: 150, y0: 125, x1: 180, y1: 140 }, confidence: 90 },
      { text: 'Verma', bbox: { x0: 185, y0: 125, x1: 235, y1: 140 }, confidence: 90 }
    ]
  };
  const res = mod.reconstructTimetable2DGrid(ocrData, []);
  if (!res.lowConfidenceClusters || res.lowConfidenceClusters.length !== 0) {
    return `expected no flagged clusters, got ${JSON.stringify(res.lowConfidenceClusters)}`;
  }
  return true;
});

await check('3. Orchestration: a flagged cell region is retried and the recovered, confident text replaces the garbled one', async () => {
  const mod = createSandbox();
  let recognizeCalls = 0;
  const paramCalls = [];
  globalThis.Tesseract = {
    createWorker: async () => ({
      setParameters: async (p) => { paramCalls.push(p); },
      recognize: async () => {
        recognizeCalls++;
        if (recognizeCalls === 1) {
          // First pass: clean day + 2 valid time-range tokens (so Stage
          // A's header retry does NOT trigger -- isolates this test to
          // the new Stage C body-cell retry), plus one badly garbled,
          // low-confidence body cell.
          return {
            data: {
              words: [
                w('Mon', 20, 100, 60, 130, 95),
                w('10:00 - 11:00', 150, 30, 280, 60, 95),
                w('11:00 - 12:00', 300, 30, 430, 60, 95),
                w('Pashilii', 300, 100, 350, 120, 20), w('Roce', 355, 100, 390, 120, 15),
                w('SDJ', 393, 100, 415, 120, 10), w('ss', 418, 100, 435, 120, 25)
              ],
              text: 'Mon 10:00 - 11:00 11:00 - 12:00 Pashilii Roce SDJ ss'
            }
          };
        }
        // Second pass: targeted cell-region retry. Coordinates are in
        // the crop's own upscaled space; reOcrCellRegion remaps them back
        // to roughly (310,100)-(420,120) in full-image space, landing in
        // the same time column as the words being replaced.
        return {
          data: {
            words: [
              { text: 'Web', bbox: { x0: 32, y0: 12, x1: 132, y1: 52 }, confidence: 92 },
              { text: 'Development', bbox: { x0: 142, y0: 12, x1: 252, y1: 52 }, confidence: 90 }
            ],
            text: 'Web Development'
          }
        };
      },
      terminate: async () => {}
    })
  };
  const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');

  if (recognizeCalls !== 2) return `expected exactly 2 recognize() calls (1 first pass + 1 cell retry), got ${recognizeCalls}`;
  if (JSON.stringify(paramCalls) !== JSON.stringify([{ tessedit_pageseg_mode: '6' }, { tessedit_pageseg_mode: '6' }])) {
    return `expected PSM set to 6 then reset to Tesseract.js's default (6), got ${JSON.stringify(paramCalls)}`;
  }
  const row = (result.schedule || []).find(r => r.subject === 'Web Development');
  if (!row) return `expected a recovered 'Web Development' row, got subjects: ${JSON.stringify((result.schedule || []).map(r => r.subject))}`;
  return true;
});

await check('4. Orchestration: a crop retry failure degrades safely (no crash, first-pass result kept)', async () => {
  const mod = createSandbox();
  let recognizeCalls = 0;
  const paramCalls = [];
  globalThis.Tesseract = {
    createWorker: async () => ({
      setParameters: async (p) => { paramCalls.push(p); },
      recognize: async () => {
        recognizeCalls++;
        if (recognizeCalls === 1) {
          return {
            data: {
              words: [
                w('Mon', 20, 100, 60, 130, 95),
                w('10:00 - 11:00', 150, 30, 280, 60, 95),
                w('11:00 - 12:00', 300, 30, 430, 60, 95),
                w('Pashilii', 300, 100, 350, 120, 20), w('Roce', 355, 100, 390, 120, 15)
              ],
              text: 'Mon 10:00 - 11:00 11:00 - 12:00 Pashilii Roce'
            }
          };
        }
        throw new Error('simulated cell-region crop OCR failure');
      },
      terminate: async () => {}
    })
  };
  const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');
  if (recognizeCalls !== 2) return `expected the retry to still be attempted, got ${recognizeCalls} recognize() calls`;
  if (!result || typeof result.schedule === 'undefined') return `expected a graceful result object, got ${JSON.stringify(result)}`;
  return true;
});

await check('5. Orchestration: a retry that would produce fewer rows is rejected, original result kept', async () => {
  const mod = createSandbox();
  let recognizeCalls = 0;
  globalThis.Tesseract = {
    createWorker: async () => ({
      setParameters: async () => {},
      recognize: async () => {
        recognizeCalls++;
        if (recognizeCalls === 1) {
          return {
            data: {
              words: [
                w('Mon', 20, 100, 60, 130, 95),
                w('10:00 - 11:00', 150, 30, 280, 60, 95),
                w('11:00 - 12:00', 450, 30, 580, 60, 95),
                // Clean cell in column 1 (kept as-is throughout)
                w('Database', 160, 100, 220, 120, 90), w('Systems', 225, 100, 280, 120, 90),
                // Garbled, low-confidence cell in column 2, well separated
                // from column 1 so they cluster independently (flagged for retry)
                w('Pashilii', 450, 100, 500, 120, 20), w('Roce', 505, 100, 540, 120, 15),
                w('SDJ', 543, 100, 565, 120, 10), w('ss', 568, 100, 585, 120, 25)
              ],
              text: 'Mon 10:00 - 11:00 11:00 - 12:00 Database Systems Pashilii Roce SDJ ss'
            }
          };
        }
        // Retry recovers a word that lands far outside every time column,
        // so it fails span computation and the row is dropped entirely --
        // a strictly worse outcome than keeping the original garbled row.
        return {
          data: {
            words: [{ text: 'Stray', bbox: { x0: 4000, y0: 4000, x1: 4100, y1: 4040 }, confidence: 92 }],
            text: 'Stray'
          }
        };
      },
      terminate: async () => {}
    })
  };
  const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');
  if (!result.schedule || result.schedule.length !== 2) {
    return `expected the original 2-row result to be kept (retry rejected as worse), got ${result.schedule?.length}: ${JSON.stringify(result.schedule?.map(r => r.subject))}`;
  }
  return true;
});

// First pass with one garbled, low-confidence cell (triggers the Stage C
// cell retry) and a result too small to pass the confidence gate, so the
// pipeline goes on to the vision AI. Used by 6 and 7.
function visionFirstPass() {
  return {
    data: {
      words: [
        w('Mon', 20, 100, 60, 130, 95),
        w('10:00 - 11:00', 150, 30, 280, 60, 95),
        w('11:00 - 12:00', 300, 30, 430, 60, 95),
        w('Pashilii', 300, 100, 350, 120, 20), w('Roce', 355, 100, 390, 120, 15),
        w('SDJ', 393, 100, 415, 120, 10), w('ss', 418, 100, 435, 120, 25)
      ],
      text: 'Mon 10:00 - 11:00 11:00 - 12:00 Pashilii Roce SDJ ss'
    }
  };
}

await check('6. Vision AI starts while the on-device retries still run, with the same prompt, and its answer is used', async () => {
  const mod = createSandbox();
  globalThis.CAMPUS_OS_AI_PROXY = 'https://proxy.test';
  let markVisionStarted;
  const visionStarted = new Promise(r => { markVisionStarted = r; });
  let stageCSawVision = null;
  let promptSeen = '';
  let recognizeCalls = 0;
  mod.AIService.extractStructuredFromImage = async (b64, mime, prompt, onStep) => {
    promptSeen = prompt;
    markVisionStarted();
    onStep('Gemini');
    return {
      periods: [{ n: 1, start: '10:00 AM', end: '11:00 AM' }, { n: 2, start: '11:00 AM', end: '12:00 PM' }],
      schedule: [{ day: 'Mon', periods: [2], entries: [{ subject: 'Deep Learning', code: 'DL', teacher: '', room: '', batch: '', type: 'lecture', isUncertain: false }] }]
    };
  };
  mod.AIService.generateContentFromText = async () => { throw new Error('text repair must not run when vision answered'); };
  globalThis.Tesseract = {
    createWorker: async () => ({
      setParameters: async () => {},
      recognize: async () => {
        recognizeCalls++;
        if (recognizeCalls === 1) return visionFirstPass();
        // Stage C cell retry: waits (up to 2 s) for the vision call. Before
        // this change the vision call only started after Stage C finished.
        stageCSawVision = await Promise.race([
          visionStarted.then(() => true),
          new Promise(r => setTimeout(() => r(false), 2000))
        ]);
        return { data: { words: [], text: '' } };
      },
      terminate: async () => {}
    })
  };
  try {
    const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');
    if (recognizeCalls < 2) return `expected the Stage C retry to run, got ${recognizeCalls} recognize() calls`;
    if (stageCSawVision !== true) return 'expected the vision call to start before the Stage C retry finished';
    if (!promptSeen.includes('Rough OCR text') || !promptSeen.includes('Pashilii Roce SDJ ss')) return 'expected the first-pass OCR text in the vision prompt, as before';
    if (result.confidence !== 88) return `expected the vision answer (confidence 88), got ${result.confidence}`;
    const row = (result.schedule || []).find(r => r.subject === 'Deep Learning');
    if (!row || row.day !== 'Mon' || row.time !== '11:00' || row.end !== '12:00') return `expected Deep Learning Mon 11:00-12:00, got ${JSON.stringify(result.schedule)}`;
    if (result.needsReview) return `a Gemini read must not ask to check every row, got needsReview ${result.needsReview}`;
    return true;
  } finally {
    delete globalThis.CAMPUS_OS_AI_PROXY;
  }
});

await check('7. A vision failure during the on-device retries is not an unhandled error and still falls back to text repair', async () => {
  const mod = createSandbox();
  globalThis.CAMPUS_OS_AI_PROXY = 'https://proxy.test';
  let unhandled = null;
  const onUnhandled = (e) => { unhandled = e; };
  process.on('unhandledRejection', onUnhandled);
  let textRepairCalled = false;
  let recognizeCalls = 0;
  mod.AIService.extractStructuredFromImage = async () => { throw new Error('every vision provider failed'); };
  mod.AIService.generateContentFromText = async () => { textRepairCalled = true; return { schedule: [] }; };
  globalThis.Tesseract = {
    createWorker: async () => ({
      setParameters: async () => {},
      recognize: async () => {
        recognizeCalls++;
        if (recognizeCalls === 1) return visionFirstPass();
        // Let the rejected vision promise settle while Stage C is still running.
        await new Promise(r => setTimeout(r, 50));
        return { data: { words: [], text: '' } };
      },
      terminate: async () => {}
    })
  };
  try {
    const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');
    await new Promise(r => setTimeout(r, 20));
    if (unhandled) return `unhandled rejection: ${unhandled.message || unhandled}`;
    if (!textRepairCalled) return 'expected the text-only repair to run after the vision failure, as before';
    if (!result.needsReview) return `expected the on-device result flagged needsReview, got ${JSON.stringify(result)}`;
    return true;
  } finally {
    process.off('unhandledRejection', onUnhandled);
    delete globalThis.CAMPUS_OS_AI_PROXY;
  }
});

await check('8. A first pass that is already confident sends no AI request', async () => {
  const mod = createSandbox();
  globalThis.CAMPUS_OS_AI_PROXY = 'https://proxy.test';
  let visionCalls = 0;
  mod.AIService.extractStructuredFromImage = async () => { visionCalls++; return { schedule: [] }; };
  mod.AIService.generateContentFromText = async () => { visionCalls++; return { schedule: [] }; };
  // Three clean day rows x two clean time columns = 6 confident rows on 3 days.
  const words = [w('10:00 - 11:00', 150, 30, 280, 60, 95), w('11:00 - 12:00', 450, 30, 580, 60, 95)];
  [['Mon', 100, 'Database', 'Systems', 'Operating', 'Systems'],
   ['Tue', 200, 'Computer', 'Networks', 'Machine', 'Learning'],
   ['Wed', 300, 'Data', 'Structures', 'Software', 'Engineering']].forEach(([d, y, a1, a2, b1, b2]) => {
    words.push(w(d, 20, y, 60, y + 30, 95),
      w(a1, 160, y, 220, y + 20, 92), w(a2, 225, y, 280, y + 20, 92),
      w(b1, 460, y, 520, y + 20, 92), w(b2, 525, y, 585, y + 20, 92));
  });
  globalThis.Tesseract = {
    createWorker: async () => ({
      setParameters: async () => {},
      recognize: async () => ({ data: { words, text: words.map(x => x.text).join(' ') } }),
      terminate: async () => {}
    })
  };
  try {
    const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');
    if ((result.schedule || []).length < 6) return `fixture should parse to a confident 6-row result, got ${JSON.stringify((result.schedule || []).map(r => r.day + ' ' + r.subject))}`;
    if (result.needsReview) return 'expected the confident on-device result, got needsReview';
    if (visionCalls !== 0) return `expected no AI request, got ${visionCalls}`;
    return true;
  } finally {
    delete globalThis.CAMPUS_OS_AI_PROXY;
  }
});

await check('9. A timetable read by a backup AI (not Gemini) asks the student to check every row', async () => {
  const results = [];
  for (const provider of ['Groq', 'Workers AI', 'OpenRouter']) {
    const mod = createSandbox();
    globalThis.CAMPUS_OS_AI_PROXY = 'https://proxy.test';
    mod.AIService.extractStructuredFromImage = async (b64, mime, prompt, onStep) => {
      onStep(provider);
      return { schedule: [{ day: 'Mon', time: '10:00', end: '11:00', subject: 'Deep Learning', type: 'lecture' }] };
    };
    let firstPass = true;
    globalThis.Tesseract = {
      createWorker: async () => ({
        setParameters: async () => {},
        recognize: async () => (firstPass ? (firstPass = false, visionFirstPass()) : { data: { words: [], text: '' } }),
        terminate: async () => {}
      })
    };
    try {
      const result = await mod.extractTimetableFromImage('ZmFrZQ==', 'image/png');
      if (result.confidence !== 88) return `${provider}: expected the vision answer, got confidence ${result.confidence}`;
      results.push(`${provider}=${result.needsReview}`);
    } finally {
      delete globalThis.CAMPUS_OS_AI_PROXY;
    }
  }
  return results.every(r => r.endsWith('=backup-ai')) ? true : results.join(', ');
});

console.log('\n========================================');
console.log(`TOTAL SCENARIOS CHECKED: ${total}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${errors.length}`);
console.log('========================================');

if (errors.length > 0) {
  process.exit(1);
} else {
  console.log('🏆 ALL BODY-TEXT RETRY TESTS PASSED! 🚀\n');
}

}

main();
