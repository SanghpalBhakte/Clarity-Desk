// ==================================================================
// Clarity Desk: WHATSAPP LINKS → SUBJECT HUBS
// ==================================================================
// Locked down here:
//  - links are found in Android, iPhone and Web chat layouts, cleaned
//    (tracking bits, trailing punctuation), de-duplicated, and sorted by
//    kind; group invites, wa.me and map links are skipped;
//  - scanChat returns them next to the deadlines (worker path included);
//  - subject guess by name or code, General otherwise;
//  - only ticked rows are saved, links already in the vault are never
//    added twice, a new subject is created only when needed, undo removes
//    exactly what was added, and full storage says "Not saved";
//  - the parser stays private: no storage, network or console calls.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');
const parserSrc = fs.readFileSync(`${ROOT}/deadline-import.js`, 'utf8');
const P = await import('data:text/javascript;base64,' + Buffer.from(parserSrc).toString('base64'));

let QUOTA = Infinity;
const store = {};
const used = (except) => Object.entries(store).reduce((n, [k, v]) => k === except ? n : n + k.length + v.length, 0);
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { v = String(v); if (used(k) + k.length + v.length > QUOTA) throw new Error('QuotaExceededError'); store[k] = v; },
  removeItem: (k) => { delete store[k]; }, clear() {}
};
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.window = globalThis;
globalThis.scrollTo = () => {};
globalThis.console.warn = () => {};
const toasts = [];
let undo = null;
let dom = {};
const el = (tag) => {
  const o = { tagName: tag, style: {}, children: [], textContent: '', innerHTML: '', classList: { add() {}, remove() {} },
    get lastElementChild() { return o.children[o.children.length - 1] || null; },
    appendChild(c) { o.children.push(c); if (o.id === 'toast-container' && c.children) toasts.push(c.children.map(x => x.textContent).join(' ')); },
    addEventListener(type, fn) { if (type === 'click' && o.tagName === 'button') undo = fn; },
    removeEventListener() {}, remove() {}, setAttribute() {}, focus() {}, querySelector: () => null, querySelectorAll: () => [] };
  return o;
};
globalThis.document = {
  getElementById: (id) => (dom[id] ||= Object.assign(el('div'), { id })),
  querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  createElement: el, body: { appendChild() {} }, head: { appendChild() {} }, documentElement: { setAttribute() {}, getAttribute: () => null, style: {} }
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '', onLine: true }, configurable: true, writable: true });
Object.defineProperty(globalThis, 'location', { value: { hostname: 'localhost', hash: '', search: '', pathname: '/' }, configurable: true, writable: true });

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { waGuessLinkSubject, waLinkSubjects, waSaveLinks, waLinkToggle, waLinkSubject, waNormUrl, vaultIconForUrl, USAGE_EVENTS, setWa(v) { _wa = v; } };`)();

const getLinks = () => JSON.parse(store.cos_custom_links || '[]');
function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
  QUOTA = Infinity; toasts.length = 0; undo = null; dom = {};
}

let total = 0, passed = 0; const errors = [];
function check(name, fn) {
  total++;
  try { const r = fn(); if (r === true) { passed++; console.log(`✓ [PASS] ${name}`); } else { errors.push(name); console.error(`✗ [FAIL] ${name}: ${r}`); } }
  catch (e) { errors.push(name); console.error(`✗ [ERROR] ${name}: ${e.stack}`); }
}

console.log('==================================================================');
console.log('🔗 WHATSAPP LINKS → SUBJECT HUBS');
console.log('==================================================================');

const ANDROID = [
  '20/10/26, 9:15 pm - Prof Rao: DBMS unit 3 notes https://drive.google.com/file/d/abc/view?usp=sharing&utm_source=wa).',
  '20/10/26, 9:16 pm - Asha: join the group https://chat.whatsapp.com/XYZ123',
  '20/10/26, 9:17 pm - Asha: call me wa.me/919999 or https://wa.me/919999',
  '21/10/26, 10:00 am - CR: OS lecture recording https://youtu.be/q1w2e3?si=zz',
  '21/10/26, 10:01 am - CR: OS syllabus pdf https://college.edu/files/os.pdf',
  '21/10/26, 10:02 am - CR: venue https://maps.app.goo.gl/abc',
  '21/10/26, 10:05 am - Prof Rao: DBMS unit 3 notes (final) https://drive.google.com/file/d/abc/view?usp=sharing',
].join('\n');
const IPHONE = '[20/10/26, 9:15:32 PM] Prof Rao: CN assignment doc https://docs.google.com/document/d/xyz/edit\n[20/10/26, 9:16:01 PM] CR: Classroom https://classroom.google.com/c/MTIz';
const WEB = '[9:15 pm, 20/10/2026] CR: Lab code https://github.com/college/dsa-lab\n[9:16 pm, 20/10/2026] CR: random https://example.com/page';

check('Android: links found, cleaned, invites/wa.me/maps skipped, repeated link kept once (latest wins)', () => {
  const l = P.extractLinks(ANDROID);
  const urls = l.map(x => x.url);
  const drive = l.find(x => x.kind === 'drive');
  if (urls.length !== 3) return `got ${urls.length}: ${urls}`;
  if (urls.some(u => /whatsapp|wa\.me|maps/.test(u))) return 'skip list failed';
  if (drive.url !== 'https://drive.google.com/file/d/abc/view?usp=sharing') return `drive url ${drive.url}`;
  if (!/final/.test(drive.title) || drive.who !== 'Prof Rao') return `latest message not kept: ${drive.title}`;
  return l.find(x => x.kind === 'video').url === 'https://youtu.be/q1w2e3' && l.some(x => x.kind === 'pdf') ? true : JSON.stringify(l);
});

check('iPhone and Web layouts: doc, classroom, code and other kinds', () => {
  const kinds = [...P.extractLinks(IPHONE), ...P.extractLinks(WEB)].map(x => x.kind).sort().join();
  return kinds === 'classroom,code,doc,other' ? true : kinds;
});

check('scanChat returns links next to the deadlines (so the worker path has them too)', () => {
  const r = P.scanChat(ANDROID, new Date('2026-10-21T12:00:00+05:30'));
  return Array.isArray(r.links) && r.links.length === 3 && Array.isArray(r.items) ? true : JSON.stringify(Object.keys(r));
});

check('Titles come from the message, not the URL; domain falls back when there is no text', () => {
  const [a] = P.extractLinks('20/10/26, 9:15 pm - CR: https://drive.google.com/drive/folders/f1');
  const [b] = P.extractLinks('20/10/26, 9:15 pm - CR: Unit 2 slides https://docs.google.com/presentation/d/p1');
  return a.title === 'drive.google.com' && b.title === 'Unit 2 slides' ? true : `${a.title} | ${b.title}`;
});

check('Subject guess: by name, by code, else General', () => {
  const subjects = [{ name: 'Database Management Systems', code: 'DBMS' }, { name: 'Operating Systems', code: 'OS' }];
  const g = (t) => app.waGuessLinkSubject(t, subjects);
  return g('DBMS unit 3 notes') === 'Database Management Systems' && g('operating systems recording') === 'Operating Systems' && g('OS lab') === 'Operating Systems' && g('random notes') === 'General' && g('cost sheet') === 'General'
    ? true : [g('DBMS unit 3 notes'), g('operating systems recording'), g('OS lab'), g('random notes'), g('cost sheet')].join();
});

const LINKS = () => [
  { id: 'wl-0', url: 'https://drive.google.com/file/d/abc/view', kind: 'drive', domain: 'drive.google.com', title: 'DBMS unit 3 notes', subject: 'DBMS' },
  { id: 'wl-1', url: 'https://youtu.be/q1w2e3', kind: 'video', domain: 'youtu.be', title: 'OS lecture', subject: 'Operating Systems' },
  { id: 'wl-2', url: 'https://example.com/page', kind: 'other', domain: 'example.com', title: 'random', subject: 'General' },
];
const VAULT = [{ subject: 'DBMS', code: 'DBMS', color: '#394B63', resources: [{ label: 'Old', url: 'https://other.com', icon: 'link', isUpload: false, fileSize: '' }] }];
const wa = (sel, dup = []) => ({ links: LINKS(), linkSel: new Set(sel), linkDup: new Set(dup), subjects: [], tab: 'links' });

check('Only ticked links are saved, into the right subjects; a missing subject is created', () => {
  seed({ cos_custom_links: JSON.stringify(VAULT) });
  app.setWa(wa(['wl-0', 'wl-1']));
  app.waSaveLinks();
  const v = getLinks();
  const dbms = v.find(s => s.subject === 'DBMS'), os = v.find(s => s.subject === 'Operating Systems');
  if (!dbms || dbms.resources.length !== 2 || dbms.resources[1].url !== LINKS()[0].url || dbms.resources[1].icon !== 'database') return JSON.stringify(dbms);
  if (!os || os.resources.length !== 1 || os.resources[0].icon !== 'video') return JSON.stringify(os);
  const shape = Object.keys(dbms.resources[1]).sort().join();
  if (shape !== 'fileSize,icon,isUpload,label,url') return `shape ${shape}`;
  return !v.some(s => s.subject === 'General') && toasts.some(t => /Added 2 links/.test(t)) ? true : `${JSON.stringify(v)} ${toasts}`;
});

check('Links already in the vault are never added twice', () => {
  seed({ cos_custom_links: JSON.stringify(VAULT) });
  app.setWa(wa(['wl-0'], ['wl-0']));
  app.waLinkToggle('wl-0', true);
  app.waSaveLinks();
  return getLinks()[0].resources.length === 1 ? true : JSON.stringify(getLinks());
});

check('Undo removes exactly the added links and the subject it created', () => {
  seed({ cos_custom_links: JSON.stringify(VAULT) });
  app.setWa(wa(['wl-0', 'wl-1']));
  app.waSaveLinks();
  if (typeof undo !== 'function') return 'no undo button';
  undo();
  return JSON.stringify(getLinks()) === JSON.stringify(VAULT) ? true : JSON.stringify(getLinks());
});

check('Full storage: "Not saved", nothing written', () => {
  seed({ cos_custom_links: JSON.stringify(VAULT) });
  QUOTA = used() + 20;
  app.setWa(wa(['wl-0', 'wl-1', 'wl-2']));
  app.waSaveLinks();
  return toasts.some(t => /Not saved/.test(t)) && JSON.stringify(getLinks()) === JSON.stringify(VAULT) ? true : toasts.join(' | ');
});

check('A changed subject is used when saving', () => {
  seed();
  app.setWa(wa(['wl-2']));
  app.waLinkSubject('wl-2', 'Computer Networks');
  app.waSaveLinks();
  const v = getLinks();
  return v.length === 1 && v[0].subject === 'Computer Networks' ? true : JSON.stringify(v);
});

check('Usage event is allow-listed', () => app.USAGE_EVENTS.includes('wa_links_saved') ? true : 'missing');

check('Parser stays private: no storage, network or console calls', () => {
  const bad = ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'console.'].filter(w => parserSrc.includes(w));
  return bad.length === 0 ? true : bad.join(', ');
});

check('Entry points: Links tab in the review, and a Study Vault button', () =>
  appSrc.includes("onclick=\"showWhatsAppImport(null, { tab: 'links' })\"") && appSrc.includes('waTabsHtml()') ? true : 'missing');

console.log('\n========================================');
console.log(`WHATSAPP LINKS: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
