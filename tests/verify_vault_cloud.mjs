// ==================================================================
// Clarity Desk: STUDY VAULT FILES IN THE ACCOUNT
// ==================================================================
// A file added on one device can be downloaded on another:
//  - after a good push, this device's files the account lacks are uploaded
//    (parts ≤ 700 KB first, details last); unchanged desks read nothing;
//  - each account holds up to 50 MB; past that files stay on the device;
//  - a cloud copy is removed only when nothing points at it and a
//    tombstone says a device deleted it;
//  - the synced desk record is unchanged (plain placeholders);
//  - "On another device" rows download the file, keep it here, open it;
//  - offline, signed out, missing or broken copies say why, save nothing.
// ==================================================================
process.env.TZ = 'Asia/Kolkata';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSrc = fs.readFileSync(`${ROOT}/app.js`, 'utf8');

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
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window = globalThis;
globalThis.console.warn = () => {};
globalThis.confirm = () => true;

let domCache = {};
const toasts = [];
const el = (tag) => {
  const o = { tagName: tag, style: {}, children: [], classList: { add() {}, remove() {} }, textContent: '', innerHTML: '',
    appendChild(c) { o.children.push(c); if (o.id === 'toast-container') toasts.push(c.children.map(x => x.textContent).join(' ')); },
    remove() { o.removed = true; }, addEventListener() {}, removeEventListener() {}, setAttribute() {}, focus() {}, click() {} };
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
// appConfirm replaces confirm() in the app: answer it exactly as the confirm stub does.
{ const mk = document.createElement, body = document.body;
  document.createElement = (tag) => { const o = mk(tag); let h; o.querySelector = () => ({}); o.addEventListener = (t, f) => { if (t === 'click') h = f; }; o._click = (act) => h && h({ target: { closest: () => ({ dataset: { act } }) } }); return o; };
  const ap = body.appendChild; body.appendChild = (n) => { ap.call(body, n); if (n && n.id === 'app-confirm-backdrop') n._click(globalThis.confirm() ? 'yes' : 'no'); }; }
// FileReader over real Blobs/Files.
globalThis.FileReader = class {
  readAsDataURL(b) {
    b.arrayBuffer().then(buf => {
      this.result = `data:${b.type || 'application/octet-stream'};base64,` + Buffer.from(buf).toString('base64');
      if (this.onload) this.onload({ target: this });
    });
  }
};

// Small async IndexedDB fake with switches for failures.
const FAIL = { open: false, put: false, corrupt: false };
const idbData = new Map();
let created = false;
const later = (fn) => setImmediate(fn);
const fakeDb = {
  objectStoreNames: { contains: () => created },
  createObjectStore() { created = true; },
  transaction() {
    const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
    const end = (fail) => later(() => {
      if (fail) { tx.error = Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' }); tx.onerror && tx.onerror(); }
      else tx.oncomplete && tx.oncomplete();
    });
    const run = (fn) => { const r = { onsuccess: null, onerror: null, result: undefined }; later(() => { const fail = fn(r); if (!fail) r.onsuccess && r.onsuccess(); end(fail); }); return r; };
    tx.objectStore = () => ({
      put: (rec) => run(() => {
        if (FAIL.put) return true;
        idbData.set(rec.fileId, FAIL.corrupt ? { ...rec, blob: new Blob([new Uint8Array(rec.blob.size)], { type: rec.blob.type }) } : rec);
      }),
      get: (k) => run(r => { r.result = idbData.get(k); }),
      getAllKeys: () => run(r => { r.result = [...idbData.keys()]; }),
      delete: (k) => run(() => { idbData.delete(k); })
    });
    return tx;
  }
};
globalThis.indexedDB = {
  open() {
    const r = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
    later(() => {
      if (FAIL.open) { r.onerror && r.onerror(); return; }
      r.result = fakeDb;
      if (!created && r.onupgradeneeded) r.onupgradeneeded();
      r.onsuccess && r.onsuccess();
    });
    return r;
  }
};

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);

// Fake Firestore: users/{uid}/vaultFiles/{id} and .../parts/{n}, with a log
// of writes in order and switches for offline / failures.
const fsDocs = new Map();
const fsLog = [];
let fsReads = 0;
class FsBlob {
  constructor(u8) { this.u8 = u8; }
  static fromUint8Array(u8) { return new FsBlob(new Uint8Array(u8)); }
  toUint8Array() { return new Uint8Array(this.u8); }
}
const snapOf = (p) => ({ id: p.split('/').pop(), exists: fsDocs.has(p), data: () => fsDocs.get(p) });
const docRef = (p) => ({
  collection: (name) => colRef(`${p}/${name}`),
  get: async () => { fsReads++; return snapOf(p); },
  set: async (data) => { fsLog.push(['set', p]); fsDocs.set(p, data); },
  delete: async () => { fsLog.push(['delete', p]); fsDocs.delete(p); }
});
const colRef = (p) => ({
  doc: (id) => docRef(`${p}/${id}`),
  get: async () => {
    const kids = [...fsDocs.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'));
    fsReads += kids.length || 1;
    return { forEach: (fn) => kids.forEach(k => fn(snapOf(k))) };
  }
});
const fakeFs = { collection: (name) => colRef(name) };
const META = (id, uid = 'u1') => `users/${uid}/vaultFiles/${id}`;
const PART = (id, n, uid = 'u1') => `users/${uid}/vaultFiles/${id}/parts/${n}`;

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
let opened = [];
globalThis.URL.createObjectURL = (b) => { opened.push(b); return 'blob:x'; };
globalThis.URL.revokeObjectURL = () => {};
globalThis.open = () => null;

const makeApp = () => new Function(`${code}\n return {
  vaultIdbOpen, vaultPutBlob, linksForCloud, isVaultPlaceholder, vaultFileId, vaultResourceRow, vaultCloudSweep,
  vaultPlaceholderHere, VAULT_CLOUD_PART_BYTES, VAULT_CLOUD_MAX_BYTES, blobIds: () => _vaultBlobIds,
  setCloud: (u, d) => { currentUser = u; db = d; },
  resetSweep: () => { vaultCloudLastSweep = { uid: '', sig: '', at: 0 }; vaultCloudFullToastShown = false; }
};`)();

const flush = async (n = 60) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const bytesOf = (n, seed = 7) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 255; return b; };
const dataUrlOf = (b, mime = 'application/pdf') => `data:${mime};base64,` + Buffer.from(b).toString('base64');
const vault = (...resources) => [{ subject: 'DBMS', code: 'DBMS', resources }];
const getLinks = () => JSON.parse(store.cos_custom_links || 'null');
function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
  QUOTA = Infinity; domCache = {}; toasts.length = 0; opened = [];
  FAIL.open = FAIL.put = FAIL.corrupt = false;
  fsDocs.clear(); fsLog.length = 0; fsReads = 0;
  navigator.onLine = true;
}

let total = 0, passed = 0; const errors = [];
async function check(name, fn) {
  total++;
  try {
    const res = await fn();
    if (res === true) { passed++; console.log(`✓ [PASS] ${name}`); }
    else { errors.push({ name, error: res }); console.error(`✗ [FAIL] ${name}: ${res}`); }
  } catch (err) { errors.push({ name, error: err.message }); console.error(`✗ [ERROR] ${name}: ${err.stack}`); }
}

console.log('==================================================================');
console.log('📚 STUDY VAULT FILES IN THE ACCOUNT (download on another device)');
console.log('==================================================================');

seed();
const app = makeApp();
await app.vaultIdbOpen();
globalThis.firebase = { apps: [{}], firestore: { Blob: FsBlob } };
app.setCloud({ uid: 'u1' }, fakeFs);

const BIG = bytesOf(1600 * 1024, 3);           // 3 parts
const SMALL = bytesOf(2000, 9), SMALL_URL = dataUrlOf(SMALL);
const SMALL_ID = app.vaultFileId(SMALL_URL);
const BIG_ID = 'b1234abcd-1638400';
const idbRec = { label: 'unit2.pdf', url: '', icon: 'book-open', isUpload: true, fileSize: '1.6 MB', fileId: BIG_ID, idb: true, bytes: BIG.length, mime: 'application/pdf' };
const dataRec = { label: 'notes.html', url: SMALL_URL, icon: 'book-open', isUpload: true, fileSize: '2 KB' };

await check('Sweep uploads IndexedDB and data: files: parts first (≤ 700 KB), details last', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(idbRec, dataRec)) }); idbData.clear();
  await app.vaultPutBlob(BIG_ID, new Blob([BIG], { type: 'application/pdf' }));
  app.resetSweep();
  await app.vaultCloudSweep();
  const m = fsDocs.get(META(BIG_ID)), s = fsDocs.get(META(SMALL_ID));
  if (!m || m.parts !== 3 || m.bytes === undefined || m.bytes !== BIG.length || m.mime !== 'application/pdf') return JSON.stringify(m);
  if (!s || s.parts !== 1 || s.name !== 'notes.html') return JSON.stringify(s);
  const sizes = [0, 1, 2].map(i => fsDocs.get(PART(BIG_ID, i)).d.u8.length);
  if (sizes.some(n => n > app.VAULT_CLOUD_PART_BYTES)) return sizes.join();
  const order = fsLog.filter(x => x[1].includes(BIG_ID)).map(x => x[1].endsWith(BIG_ID) ? 'meta' : 'part');
  return order.join() === 'part,part,part,meta' ? true : order.join();
});

await check('Nothing changed: the next sweep makes no read at all', async () => {
  fsReads = 0; fsLog.length = 0;
  await app.vaultCloudSweep();
  return fsReads === 0 && fsLog.length === 0 ? true : `reads=${fsReads} writes=${fsLog.length}`;
});

await check('Files already in the account are not uploaded again', async () => {
  app.resetSweep(); fsLog.length = 0;
  await app.vaultCloudSweep();
  return fsLog.length === 0 ? true : JSON.stringify(fsLog);
});

await check('The cloud copy of the desk is unchanged: still a plain placeholder, no new fields', () => {
  const cloud = app.linksForCloud(getLinks())[0].resources;
  const keys = cloud.map(r => Object.keys(r).sort().join()).join(' / ');
  return cloud.every(r => app.isVaultPlaceholder(r)) && !/inCloud|parts/.test(keys) ? true : keys;
});

await check('Account cap: files past 50 MB stay on the device, one toast', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(dataRec)) });
  fsDocs.set(META('bfull-1'), { bytes: app.VAULT_CLOUD_MAX_BYTES, parts: 1, at: 1 });
  store.cos_custom_links = JSON.stringify([...vault(dataRec), { subject: 'X', code: 'X', resources: [{ label: 'old', url: '', onDevice: true, fileId: 'bfull-1' }] }]);
  app.resetSweep();
  await app.vaultCloudSweep();
  const toast = toasts.find(t => /up to 50 MB/.test(t));
  return !fsDocs.has(META(SMALL_ID)) && toast ? true : `uploaded=${fsDocs.has(META(SMALL_ID))} toasts=${toasts.join('|')}`;
});

await check('Delete: a copy nothing points at AND a device deleted (tombstone) is removed with its parts', async () => {
  seed({ cos_custom_links: JSON.stringify(vault()), cos_tombstones: JSON.stringify([{ id: `DBMS|bgone-9|old.pdf`, deletedAt: Date.now() }]) });
  fsDocs.set(META('bgone-9'), { bytes: 10, parts: 2, at: 1 });
  fsDocs.set(PART('bgone-9', 0), { d: FsBlob.fromUint8Array(bytesOf(5)) });
  fsDocs.set(PART('bgone-9', 1), { d: FsBlob.fromUint8Array(bytesOf(5)) });
  app.resetSweep();
  await app.vaultCloudSweep();
  const left = [...fsDocs.keys()].filter(k => k.includes('bgone-9'));
  return left.length === 0 && fsLog[0][1] === META('bgone-9') ? true : left.join();
});

await check('No tombstone: an unknown copy (a phone that has not synced yet) is kept', async () => {
  seed({ cos_custom_links: JSON.stringify(vault()) });
  fsDocs.set(META('bnew-3'), { bytes: 10, parts: 1, at: 1 });
  app.resetSweep();
  await app.vaultCloudSweep();
  return fsDocs.has(META('bnew-3')) ? true : 'deleted';
});

await check('Still referenced (e.g. renamed, or kept by an undo copy): kept even with a tombstone', async () => {
  seed({ cos_custom_links: JSON.stringify(vault({ label: 'renamed.pdf', url: '', onDevice: true, fileId: 'bkeep-4' })),
         cos_tombstones: JSON.stringify([{ id: 'DBMS|bkeep-4|old.pdf', deletedAt: Date.now() }]) });
  fsDocs.set(META('bkeep-4'), { bytes: 10, parts: 1, at: 1 });
  app.resetSweep();
  await app.vaultCloudSweep();
  return fsDocs.has(META('bkeep-4')) ? true : 'deleted';
});

await check('Signed out or offline: the sweep does nothing', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(dataRec)) });
  app.resetSweep(); navigator.onLine = false;
  await app.vaultCloudSweep();
  navigator.onLine = true; app.setCloud(null, fakeFs);
  await app.vaultCloudSweep();
  app.setCloud({ uid: 'u1' }, fakeFs);
  return fsLog.length === 0 && fsReads === 0 ? true : `writes=${fsLog.length} reads=${fsReads}`;
});

// ── The other device ──
const PH = { label: 'unit2.html', url: '', icon: 'book-open', isUpload: true, fileSize: '1.6 MB', onDevice: true, fileId: BIG_ID };

await check('Placeholder row offers Download (vaultGetCloudFile), not a dead "On another device" label', () => {
  seed({ cos_custom_links: JSON.stringify(vault(PH)) }); idbData.clear(); app.blobIds().clear();
  const html = app.vaultResourceRow(0, 0, PH);
  return /vaultGetCloudFile\(&quot;b1234abcd-1638400&quot;\)/.test(html) && /Download/.test(html) && !/On another device/.test(html) ? true : html;
});

await check('Placeholder with a bad id keeps the old label (no click)', () => {
  const bad = { ...PH, fileId: '"x\');alert(1)//' };
  const html = app.vaultResourceRow(0, 0, bad);
  return /On another device/.test(html) && !/vaultGetCloudFile/.test(html) && !/alert/.test(html) ? true : html;
});

await check('Download: parts are joined byte for byte, kept on this device, then opened', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(PH)) }); idbData.clear(); app.blobIds().clear();
  const chunks = [BIG.subarray(0, 716800), BIG.subarray(716800, 1433600), BIG.subarray(1433600)];
  fsDocs.set(META(BIG_ID), { name: 'unit2.pdf', mime: 'text/html', bytes: BIG.length, parts: 3, at: 1 });
  chunks.forEach((c, i) => fsDocs.set(PART(BIG_ID, i), { d: FsBlob.fromUint8Array(c) }));
  await globalThis.vaultGetCloudFile(BIG_ID);
  await flush();
  const rec = idbData.get(BIG_ID);
  const got = rec ? new Uint8Array(await rec.blob.arrayBuffer()) : null;
  if (!got || got.length !== BIG.length || got.some((b, i) => b !== BIG[i])) return 'stored copy differs';
  if (!app.vaultPlaceholderHere(PH)) return 'not marked as here';
  return opened.length === 1 && opened[0].size === BIG.length ? true : `opened=${opened.length}`;
});

await check('After download the row opens the copy on this device (works offline)', () => {
  const html = app.vaultResourceRow(0, 0, PH);
  return /vaultOpenFile\(&quot;b1234abcd-1638400&quot;\)/.test(html) ? true : html;
});

await check('Not in the account yet: clear message, nothing saved', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(PH)) }); idbData.clear();
  await globalThis.vaultGetCloudFile(BIG_ID);
  return toasts.some(t => /isn’t in your account yet/.test(t)) && !idbData.has(BIG_ID) ? true : toasts.join('|');
});

await check('A missing part or wrong size: nothing saved, says so', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(PH)) }); idbData.clear();
  fsDocs.set(META(BIG_ID), { name: 'x', mime: '', bytes: BIG.length, parts: 2, at: 1 });
  fsDocs.set(PART(BIG_ID, 0), { d: FsBlob.fromUint8Array(BIG.subarray(0, 10)) });
  await globalThis.vaultGetCloudFile(BIG_ID);
  return toasts.some(t => /couldn’t be downloaded completely/.test(t)) && !idbData.has(BIG_ID) && opened.length === 0 ? true : toasts.join('|');
});

await check('Offline or signed out: says why, no read', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(PH)) });
  navigator.onLine = false;
  await globalThis.vaultGetCloudFile(BIG_ID);
  navigator.onLine = true; app.setCloud(null, null);
  await globalThis.vaultGetCloudFile(BIG_ID);
  app.setCloud({ uid: 'u1' }, fakeFs);
  return toasts.some(t => /offline/.test(t)) && toasts.some(t => /Sign in/.test(t)) && fsReads === 0 ? true : toasts.join('|');
});

await check('No new cos_* key is written', () => {
  const keys = Object.keys(store).filter(k => k.startsWith('cos_') && !['cos_custom_links', 'cos_tombstones', 'cos_sync_clock'].includes(k));
  return keys.length === 0 ? true : keys.join();
});

console.log('\n========================================');
console.log(`STUDY VAULT ACCOUNT FILES: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
