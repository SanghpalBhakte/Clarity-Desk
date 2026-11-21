// ==================================================================
// Clarity Desk: one way for Node tests to load app.js
// ==================================================================
// loadApp(names, opts) runs the real app.js (plus the lazy files, as after
// their first use) as one script and hands back the functions named in
// `names`. A test asks for what it needs by name; it never cuts a function
// out of the file by text, so moving or renaming code elsewhere in app.js
// does not break it.
//
// Each call is its own app: its own storage, timers and clock.
//   opts.store   initial localStorage contents ({ key: raw string })
//   opts.now     fixed clock (anything Date accepts); default 2026-11-10 10:00 India time
//   opts.data    replaces the data.js datasets (source text); default the real data.js
// Returned besides the named functions:
//   store        the raw localStorage map (read it, or set keys before a call)
//   timers       queued setTimeout/setInterval callbacks; nothing runs on its own
//   eval(js)     run code inside the app's scope: read or set a `let`, swap a
//                function the test must not run (e.g. the file download)
// Time zone is India (Asia/Kolkata) for the whole test process.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_toast-dom-shim.mjs';
import { withLazyModules } from './lazy-modules.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_SRC = fs.readFileSync(`${ROOT}/data.js`, 'utf8').replace(/^export /gm, '');
const APP_SRC = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const DATA_IMPORT = /^import\s+\{[^}]*\}\s+from\s+['"]\.\/data\.js['"];?/m;
if (!DATA_IMPORT.test(APP_SRC)) throw new Error('app-loader: the data.js import line in app.js changed');

export const DEFAULT_NOW = '2026-11-10T10:00:00+05:30';

// A small fake page, enough for app.js to start and for toasts to be built.
function stubElement(id) {
  return {
    id, style: {}, dataset: {}, children: [], value: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, remove() {}, focus() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [],
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {}
  };
}
if (!globalThis.document) {
  const els = {};
  globalThis.document = {
    // Still loading: start-up code that waits for DOMContentLoaded never runs,
    // so a test starts from the stored data alone, not a booted page.
    readyState: 'loading',
    getElementById: (id) => els[id] || (els[id] = stubElement(id)),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    createElement: (tag) => Object.assign(stubElement(''), { tagName: tag }),
    body: stubElement('body'),
    documentElement: { setAttribute() {}, getAttribute: () => null, style: {}, classList: { add() {}, remove() {}, toggle() {} } }
  };
}
globalThis.window ??= globalThis;
globalThis.requestAnimationFrame ??= () => 0;
globalThis.cancelAnimationFrame ??= () => {};

function makeStorage(initial) {
  const store = { ...(initial || {}) };
  const api = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; }
  };
  return { store, api };
}

function fixedDate(now) {
  const RealDate = Date;
  const at = new RealDate(now).getTime();
  if (Number.isNaN(at)) throw new Error(`app-loader: bad opts.now ${now}`);
  return class FixedDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(at); }
    static now() { return at; }
  };
}

export function loadApp(names = [], opts = {}) {
  const { store, api } = makeStorage(opts.store);
  const session = makeStorage().api;
  const timers = [];
  const queue = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const code = withLazyModules(APP_SRC.replace(DATA_IMPORT, opts.data ?? DATA_SRC));
  const out = names.map(n => `${JSON.stringify(n)}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(',\n');
  const run = new Function('localStorage', 'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date',
    `${code}\n;return { ${out}${out ? ',' : ''} eval: (__js) => eval(__js) };`);
  const app = run(api, session, queue, () => {}, queue, () => {}, fixedDate(opts.now ?? DEFAULT_NOW));
  app.store = store;
  app.timers = timers;
  return app;
}
