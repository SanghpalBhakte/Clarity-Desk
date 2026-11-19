// Clarity Desk: Auto dark mode + palette names (Today C2, Task 2). Pure-function checks.
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
const stub = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, remove() {}, focus() {}, value: '', textContent: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, addEventListener() {} });
globalThis.document = {
  getElementById: () => stub(), querySelector: () => null, querySelectorAll: () => [],
  activeElement: null, hidden: false, addEventListener() {}, removeEventListener() {},
  createElement: () => stub(), body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = [];
  const NOTICES = [];
`);
const app = new Function(`${code}\n return { resolveThemeMode, normalizeThemeSetting, nextThemeSetting, ACCENT_LABELS, PALETTE_SWATCHES };`)();
let fails = 0;
const check = (name, ok) => { if (!ok) { fails++; console.error('FAIL', name); } else console.log('ok  ', name); };

check('no saved value is auto', app.normalizeThemeSetting(null) === 'auto');
check('midnight-ink stays', app.normalizeThemeSetting('midnight-ink') === 'midnight-ink');
check('paper-slate stays', app.normalizeThemeSetting('paper-slate') === 'paper-slate');
check('auto stays', app.normalizeThemeSetting('auto') === 'auto');
check('legacy quiet-dark maps to midnight-ink', app.normalizeThemeSetting('quiet-dark') === 'midnight-ink');
check('legacy light maps to paper-slate', app.normalizeThemeSetting('light') === 'paper-slate');
check('legacy flat palette theme maps to paper-slate', app.normalizeThemeSetting('dusty-rose') === 'paper-slate');
check('garbage becomes auto', app.normalizeThemeSetting('banana') === 'auto');
check('empty string becomes auto', app.normalizeThemeSetting('') === 'auto');
check('prototype keys do not leak', app.normalizeThemeSetting('constructor') === 'auto' && app.normalizeThemeSetting('__proto__') === 'auto');
check('auto + phone dark = midnight-ink', app.resolveThemeMode('auto', true) === 'midnight-ink');
check('auto + phone light = paper-slate', app.resolveThemeMode('auto', false) === 'paper-slate');
check('saved light wins over a dark phone', app.resolveThemeMode('paper-slate', true) === 'paper-slate');
check('saved dark wins over a light phone', app.resolveThemeMode('midnight-ink', false) === 'midnight-ink');
check('garbage follows the phone', app.resolveThemeMode('banana', true) === 'midnight-ink' && app.resolveThemeMode(null, false) === 'paper-slate');
check('tap cycle, light phone: auto -> dark -> light -> auto', app.nextThemeSetting('auto', false) === 'midnight-ink' && app.nextThemeSetting('midnight-ink', false) === 'paper-slate' && app.nextThemeSetting('paper-slate', false) === 'auto');
check('tap cycle, dark phone: auto -> light -> dark -> auto', app.nextThemeSetting('auto', true) === 'paper-slate' && app.nextThemeSetting('paper-slate', true) === 'midnight-ink' && app.nextThemeSetting('midnight-ink', true) === 'auto');
check('tap from nothing saved or garbage behaves like auto', app.nextThemeSetting(null, false) === 'midnight-ink' && app.nextThemeSetting('banana', true) === 'paper-slate');
check('palette names', app.ACCENT_LABELS.apricot === 'Lo-fi' && app.ACCENT_LABELS.terracotta === 'Highlighter' && app.ACCENT_LABELS.rose === 'Old Campus' && app.ACCENT_LABELS.lavender === 'Last Bench');
const note = Object.fromEntries(app.PALETTE_SWATCHES.map(p => [p.accent, p.note]));
check('palette notes', note.terracotta === 'Charcoal ink, marigold highlighter' && note.rose === 'Old brick and olive lawns' && note.lavender === 'Evening navy, persimmon sky' && note.apricot === 'Deep teal, lamplight lilac');
const sw = Object.fromEntries(app.PALETTE_SWATCHES.map(p => [p.accent, p.colors.join(',').toLowerCase()]));
check('swatch colours (page, ink, now card)', sw.terracotta === '#f3f1ea,#1d2024,#25292f' && sw.rose === '#eef0e4,#2e3428,#683238' && sw.lavender === '#eaeef2,#1d3346,#223f5d' && sw.apricot === '#e7edeb,#1d3433,#1c4a4e');
if (fails) { console.error(`${fails} theme check(s) failed`); process.exit(1); }
console.log('All theme auto checks passed.');
