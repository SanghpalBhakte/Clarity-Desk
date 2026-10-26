// ==================================================================
// Clarity Desk: STUDY VAULT PHASE 1 (safe output, search, add several)
// ==================================================================
// Locked down here:
//  - labels and addresses are escaped; "javascript:" and page-like data:
//    URLs never become a link; bare "drive.google.com/x" gets https://;
//  - search narrows by subject, name or type, and keeps the real indices;
//  - "Add several": a review list first, one save, duplicates marked,
//    big files refused, 50 items at most, full storage keeps the list;
//  - no new cos_* key, and no cloud or network call in the new code
//    (so nothing here can use Firebase quota).
// ==================================================================
//  - restore writes the vault last and turns files that don't fit into
//    placeholders, keeping every link.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

// localStorage with a quota, like a phone: writes past QUOTA chars throw.
let QUOTA = Infinity;
const store = {};
const used = (except) => Object.entries(store).reduce((n, [k, v]) => k === except ? n : n + k.length + v.length, 0);
globalThis.localStorage = {
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i] ?? null,
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    v = String(v);
    if (used(k) + k.length + v.length > QUOTA) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    store[k] = v;
  },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; }
};
const timers = [];
globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
globalThis.console.warn = () => {};

let domCache = {};
const toasts = [];
const el = (tag) => {
  const o = { tagName: tag, style: {}, children: [], classList: { add() {}, remove() {} }, textContent: '', innerHTML: '',
    appendChild(c) { o.children.push(c); if (o.id === 'toast-container') toasts.push(c.children.map(x => x.textContent).join(' ')); },
    remove() { o.removed = true; }, addEventListener() {}, removeEventListener() {}, setAttribute() {}, focus() {} };
  return o;
};
const domStub = (id) => (domCache[id] ||= Object.assign(el('div'), { id, value: '' }));
globalThis.document = {
  getElementById: domStub,
  querySelector: () => null,
  querySelectorAll: () => [],
  activeElement: null, hidden: false,
  addEventListener() {}, removeEventListener() {},
  createElement: el,
  body: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
globalThis.FileReader = class {
  readAsDataURL(f) { this.result = 'data:application/pdf;base64,' + 'A'.repeat(f.size); queueMicrotask(() => this.onload()); }
};
globalThis.queueMicrotask = globalThis.queueMicrotask || ((fn) => Promise.resolve().then(fn));

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { vaultSafeUrl, vaultEsc, vaultNormalizeUrl, vaultTypeLabel, vaultStorageStats, vaultExtractLinks, renderLinksContent, vbState: () => _vb, VAULT_BULK_MAX_ROWS };`)();

const LINK = { label: 'DBMS playlist', url: 'https://youtube.com/playlist?list=x', icon: 'video', isUpload: false, fileSize: '' };
const vault = (...resources) => [{ subject: 'DBMS', code: 'DBMS', resources }];
const getLinks = () => JSON.parse(store.cos_custom_links || 'null');
const flush = () => new Promise(r => setTimeout.__real ? r() : Promise.resolve().then(() => Promise.resolve()).then(r));

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
  QUOTA = Infinity; domCache = {}; toasts.length = 0; timers.length = 0;
}
const file = (name, size) => ({ name, size });

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
console.log('📚 STUDY VAULT PHASE 1');
console.log('==================================================================');

check('Safe addresses: web links and saved files pass; javascript: and page-like data: do not', () => {
  const ok = ['https://drive.google.com/x', 'http://a.com', 'data:application/pdf;base64,AAAA'].every(u => app.vaultSafeUrl(u) === u);
  const bad = ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/svg+xml;base64,AAAA', 'ftp://x.com', '', null, 'vbscript:x'].every(u => app.vaultSafeUrl(u) === '');
  return ok && bad ? true : `ok=${ok} bad=${bad}`;
});

check('Escaping: angle brackets and both quote kinds become text', () => {
  const s = app.vaultEsc(`<img src=x onerror="a('b')">`);
  return !/[<>"']/.test(s) && s.includes('&lt;img') ? true : s;
});

check('A bare address gets https://; javascript: is left alone so it is refused', () => {
  return app.vaultNormalizeUrl('drive.google.com/abc') === 'https://drive.google.com/abc'
    && app.vaultNormalizeUrl('  https://a.com ') === 'https://a.com'
    && app.vaultSafeUrl(app.vaultNormalizeUrl('javascript:alert(1)')) === '' ? true : 'normalize';
});

check('Single add: javascript: is refused with a message and nothing is saved', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) });
  domStub('lrm-label').value = 'Evil'; domStub('lrm-url').value = 'javascript:alert(1)'; domStub('lrm-icon').value = 'link';
  globalThis._uploadedFileMeta = null;
  globalThis.saveLinkResource(0, null);
  return getLinks()[0].resources.length === 1 && toasts.some(t => /http/.test(t)) ? true : `toasts=${toasts}`;
});

check('Single add: "drive.google.com/abc" is saved as https://drive.google.com/abc', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) });
  domStub('lrm-label').value = 'Drive'; domStub('lrm-url').value = 'drive.google.com/abc'; domStub('lrm-icon').value = 'database';
  globalThis._uploadedFileMeta = null;
  globalThis.saveLinkResource(0, null);
  const r = getLinks()[0].resources;
  return r.length === 2 && r[1].url === 'https://drive.google.com/abc' ? true : JSON.stringify(r);
});

check('Drawing: a hostile name and address never reach the page as markup or a javascript: href', () => {
  seed({ cos_custom_links: JSON.stringify([{ subject: 'X<script>', code: '"><b>', resources: [
    { label: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', icon: 'link' },
    { label: 'ok', url: 'https://ok.com/a"onmouseover="x', icon: 'link' }] }]) });
  app.renderLinksContent(domStub('c'));
  const html = domStub('vault-grid').innerHTML;
  return !/<img|<script|<b>|href="javascript|onerror=alert\(1\)>/.test(html) && html.includes('Link blocked') && html.includes('&lt;img') && !/href="[^"]*"onmouseover/.test(html) ? true : html.slice(0, 600);
});

check('Search: by name, by subject, by type; no match says so; indices stay the real ones', () => {
  const pdf = { label: 'Unit 1.pdf', url: 'data:application/pdf;base64,AAAA', icon: 'book-open', isUpload: true, fileSize: '3 B' };
  seed({ cos_custom_links: JSON.stringify([{ subject: 'DBMS', code: 'DBMS', resources: [LINK, pdf] }, { subject: 'Physics', code: 'PHY', resources: [{ label: 'Optics', url: 'https://o.com', icon: 'link' }] }]) });
  app.renderLinksContent(domStub('c'));
  const grid = () => domStub('vault-grid').innerHTML;
  globalThis.vaultSearch('optics');
  const a = grid().includes('Optics') && !grid().includes('DBMS playlist') && !grid().includes('link-card-0');
  globalThis.vaultSearch('pdf');
  const b = grid().includes('Unit 1.pdf') && !grid().includes('Optics') && grid().includes('editLinkResource(0,1)');
  globalThis.vaultSearch('physics');
  const c = grid().includes('Optics') && !grid().includes('Unit 1.pdf');
  globalThis.vaultSearch('zzzz');
  const d = /Nothing matches/.test(grid());
  globalThis.vaultSearch('');
  const e = grid().includes('DBMS playlist') && grid().includes('Optics');
  return a && b && c && d && e ? true : `a=${a} b=${b} c=${c} d=${d} e=${e}`;
});

check('Type badges: files by extension or type, links by site', () => {
  const t = (r) => app.vaultTypeLabel(r);
  return t({ label: 'a.pdf', url: 'data:application/pdf;base64,A', isUpload: true }) === 'PDF'
    && t({ label: 'a.docx', url: 'data:x/y;base64,A', isUpload: true }) === 'DOC'
    && t({ label: 'Slides', url: 'data:application/vnd.ms-powerpoint;base64,A', isUpload: true }) === 'PPT'
    && t({ label: 'p.PNG', url: 'data:image/png;base64,A', isUpload: true }) === 'IMG'
    && t({ label: 'x.py', url: 'data:text/x-python;base64,A', isUpload: true }) === 'CODE'
    && t({ label: 'n', onDevice: true, url: '' }) === 'FILE'
    && t({ url: 'https://youtu.be/x' }) === 'VIDEO' && t({ url: 'https://drive.google.com/x' }) === 'DRIVE'
    && t({ url: 'https://github.com/a/b' }) === 'CODE' && t({ url: 'https://a.com/n.pdf' }) === 'PDF'
    && t({ url: 'https://a.com' }) === 'LINK' ? true : 'labels';
});

check('Storage meter: counts saved files, estimates percent of the phone, never above 100', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK, { label: 'f.pdf', url: 'data:application/pdf;base64,' + 'A'.repeat(4000), isUpload: true })) });
  const st = app.vaultStorageStats(getLinks());
  const full = (seed({ big: 'x'.repeat(6000000) }), app.vaultStorageStats([]));
  return st.fileCount === 1 && st.fileBytes > 2900 && st.fileBytes < 3200 && st.pct >= 0 && st.free > 4900000 && full.pct === 100 && full.free === 0 ? true : JSON.stringify({ st, full });
});

check('Pasted text: WhatsApp lines become titled links, duplicates and bad schemes dropped', () => {
  const out = app.vaultExtractLinks([
    '[12/10/24, 9:30 am] Rahul: DBMS unit 2 notes https://drive.google.com/file/d/1.',
    'www.example.com/slides (OS slides)',
    'https://drive.google.com/file/d/1',
    'javascript:alert(1) not a link',
    'two: https://a.com/x and https://b.com/y'].join('\n'));
  const urls = out.map(o => o.url);
  return out.length === 5 - 2 + 1 && out[0].title === 'DBMS unit 2 notes' && urls.includes('https://www.example.com/slides')
    && out.find(o => o.url === 'https://b.com/y').title === 'b.com link' && !urls.some(u => /javascript/.test(u)) ? true : JSON.stringify(out);
});

// ── Add several ───────────────────────────────────────────
seed({ cos_custom_links: JSON.stringify([{ subject: 'DBMS', code: 'DBMS', color: '#111111', resources: [LINK] }]) });
const keysBefore = Object.keys(store).sort().join();
globalThis.openVaultBulk(0);
globalThis.vbAddFiles([file('Unit1.pdf', 300), file('big.zip', 3 * 1048576), file('Unit2.pdf', 500)]);
await flush(); await flush();
const afterPick = app.vbState();

check('Add several: small files become rows, the 3 MB one is named as refused, nothing saved yet', () => {
  return afterPick.rows.length === 2 && afterPick.skipped.length === 1 && /big\.zip/.test(afterPick.skipped[0]) && getLinks()[0].resources.length === 1
    && afterPick.rows.every(r => r.sel && r.subject === 'DBMS') ? true : JSON.stringify({ rows: afterPick.rows.length, sk: afterPick.skipped });
});

check('Add several: Save adds every ticked row in one write, keeps names, sizes and icons', () => {
  globalThis.vbToggle(afterPick.rows[1].id, false);
  globalThis.vbTitle(afterPick.rows[0].id, 'Unit 1 notes.pdf');
  let writes = 0;
  const setItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = (k, v) => { if (k === 'cos_custom_links') writes++; return setItem(k, v); };
  globalThis.vbSave();
  globalThis.localStorage.setItem = setItem;
  const r = getLinks()[0].resources;
  return writes === 1 && r.length === 2 && r[1].label === 'Unit 1 notes.pdf' && r[1].isUpload === true && r[1].fileSize === '300 B' && r[1].url.startsWith('data:') && app.vbState() === null
    ? true : `writes=${writes} ${JSON.stringify(r).slice(0, 300)}`;
});

// Same bytes, different name: still the same file.
globalThis.openVaultBulk(0);
globalThis.vbAddFiles([file('Unit1-copy.pdf', 300)]);
await flush(); await flush();
check('Add several: the same file again is marked "Already saved", unticked, and Save adds nothing', () => {
  const vb = app.vbState();
  const before = store.cos_custom_links;
  globalThis.vbSave();
  return vb.rows.length === 1 && vb.rows[0].dup === true && vb.rows[0].sel === false && store.cos_custom_links === before ? true : JSON.stringify(vb.rows.map(r => ({ d: r.dup, s: r.sel })));
});

check('Add several: pasted links join the list; a link already in the vault is marked', () => {
  domStub('vb-paste').value = 'Playlist https://youtube.com/playlist?list=x\nNotes https://drive.google.com/new';
  globalThis.vbReadPaste();
  const rows = app.vbState().rows.filter(r => r.kind === 'link');
  return rows.length === 2 && rows.find(r => /youtube/.test(r.url)).dup === true && rows.find(r => /drive/.test(r.url)).dup === false && domStub('vb-paste').value === '' ? true : JSON.stringify(rows);
});

check('Add several from the header: subject guessed from the name; unknown goes to General and is created', () => {
  seed({ cos_custom_links: JSON.stringify([{ subject: 'DBMS', code: 'DBMS', color: '#111', resources: [] }]) });
  globalThis.openVaultBulk(null);
  domStub('vb-paste').value = 'DBMS unit 3 https://a.com/dbms\nrandom https://b.com/r';
  globalThis.vbReadPaste();
  const rows = app.vbState().rows;
  const guess = rows[0].subject === 'DBMS' && rows[1].subject === 'General';
  globalThis.vbSave();
  const l = getLinks();
  const dbms = l.find(s => s.subject === 'DBMS'), gen = l.find(s => s.subject === 'General');
  return guess && dbms.resources.length === 1 && gen && gen.resources.length === 1 && gen.resources[0].url === 'https://b.com/r' ? true : JSON.stringify({ guess, l });
});

check('Add several: 60 links give 50 rows and a note about the rest', () => {
  seed();
  globalThis.openVaultBulk(null);
  domStub('vb-paste').value = Array.from({ length: 60 }, (_, i) => `https://site${i}.com/p`).join('\n');
  globalThis.vbReadPaste();
  const vb = app.vbState();
  return vb.rows.length === app.VAULT_BULK_MAX_ROWS && vb.over === 10 && /first 50/.test(domStub('vb-review').innerHTML) ? true : `rows=${vb.rows.length} over=${vb.over}`;
});

check('Add several: full storage says "Not saved", keeps the list open, saves nothing', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) });
  globalThis.openVaultBulk(0);
  domStub('vb-paste').value = 'https://a.com/1';
  globalThis.vbReadPaste();
  QUOTA = used() + 20;
  const before = store.cos_custom_links;
  globalThis.vbSave();
  return toasts.some(t => /Not saved/.test(t)) && app.vbState() !== null && store.cos_custom_links === before ? true : `toasts=${toasts} state=${!!app.vbState()}`;
});

check('Closing the list throws the review away and saves nothing', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) });
  globalThis.openVaultBulk(0);
  domStub('vb-paste').value = 'https://a.com/1';
  globalThis.vbReadPaste();
  const before = store.cos_custom_links;
  globalThis.closeVaultBulk();
  return app.vbState() === null && store.cos_custom_links === before ? true : 'state';
});

check('No new storage key: only cos_custom_links was touched', () => {
  return keysBefore === 'cos_custom_links' && Object.keys(store).every(k => k === 'cos_custom_links') ? true : `${keysBefore} / ${Object.keys(store)}`;
});

check('Free plan: the new code makes no cloud, network or Firestore call', () => {
  const a = appSrc.indexOf('// ── Study Vault: safe output'), b = appSrc.indexOf('window.addLinkSubject = function');
  const block = appSrc.slice(a, b);
  return a > 0 && b > a && !/fetch\(|firebase|firestore|XMLHttpRequest|sendBeacon|WebSocket|\bsyncToCloud\b|getStorage\(|uploadBytes/i.test(block) ? true : 'cloud call found';
});

console.log('\n========================================');
console.log(`STUDY VAULT PHASE 1: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
