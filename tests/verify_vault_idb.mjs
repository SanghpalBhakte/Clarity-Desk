// ==================================================================
// Clarity Desk: STUDY VAULT FILES IN INDEXEDDB (Phase 2, slice 1)
// ==================================================================
// Locked down here:
//  - old data: URL files move into IndexedDB only after the copy was read
//    back and matched; a failed or wrong copy leaves the original alone;
//  - the cloud copy (linksForCloud) is exactly the same before and after;
//  - cloud apply (mergeCloudLinks) gives the IndexedDB entry back;
//  - backups carry the files as data: URLs, smallest first, up to 30 MB;
//    restore puts them back into IndexedDB, old backups still restore;
//  - add one / add several store files up to 10 MB; 1 MB when IndexedDB
//    can't be used (then everything works the old way);
//  - a blob is deleted only when nothing points at it;
//  - no new cos_* key and no network call in the new code.
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
const makeApp = () => new Function(`${code}\n return { vaultIdbOpen, vaultMigrateFiles, linksForCloud, mergeCloudLinks, vaultBackupPlan, vaultLinksForBackup, vaultLinksIntoIdb, saveLinksFittingStorage, vaultStorageStats, isVaultIdbFile, isVaultPlaceholder, vaultFileTooBigMessage, vaultResourceRow, vaultDeleteUnusedBlob, vaultFileId, vbState: () => _vb, idbOk: () => vaultIdbOk, blobIds: () => _vaultBlobIds };`)();

const flush = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const bytesOf = (n, seed = 7) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) & 255; return b; };
const dataUrlOf = (b, mime = 'application/pdf') => `data:${mime};base64,` + Buffer.from(b).toString('base64');
const LINK = { label: 'DBMS playlist', url: 'https://youtube.com/playlist?list=x', icon: 'video', isUpload: false, fileSize: '' };
const vault = (...resources) => [{ subject: 'DBMS', code: 'DBMS', resources }];
const getLinks = () => JSON.parse(store.cos_custom_links || 'null');
function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
  QUOTA = Infinity; domCache = {}; toasts.length = 0;
  FAIL.open = FAIL.put = FAIL.corrupt = false;
}
const wipeIdb = () => idbData.clear();

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
console.log('📚 STUDY VAULT FILES IN INDEXEDDB');
console.log('==================================================================');

seed();
const app = makeApp();
await app.vaultIdbOpen();

const B1 = bytesOf(3000), U1 = dataUrlOf(B1);
const FILE1 = { label: 'unit1.pdf', url: U1, icon: 'book-open', isUpload: true, fileSize: '2.9 KB' };

await check('IndexedDB opens: files up to 10 MB are allowed', () => {
  const msg = app.vaultFileTooBigMessage(12 * 1048576);
  return app.idbOk() === true && app.vaultFileTooBigMessage(9 * 1048576) === '' && /up to 10 MB/.test(msg) ? true : `${app.idbOk()} ${msg}`;
});

await check('Migration: a data: URL file moves in after a byte-for-byte check; the cloud copy is unchanged', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK, FILE1)) }); wipeIdb();
  const before = JSON.stringify(app.linksForCloud(getLinks()));
  const moved = await app.vaultMigrateFiles();
  const r = getLinks()[0].resources[1];
  const rec = idbData.get(r.fileId);
  const got = rec ? new Uint8Array(await rec.blob.arrayBuffer()) : null;
  const after = JSON.stringify(app.linksForCloud(getLinks()));
  if (moved !== 1 || !app.isVaultIdbFile(r) || r.bytes !== 3000 || r.mime !== 'application/pdf') return `moved=${moved} ${JSON.stringify(r)}`;
  if (r.fileId !== app.vaultFileId(U1)) return 'fileId changed';
  if (!got || Buffer.compare(Buffer.from(got), Buffer.from(B1)) !== 0) return 'blob differs';
  if (store.cos_custom_links.includes('data:')) return 'data: URL still in localStorage';
  return before === after ? true : `cloud copy changed:\n${before}\n${after}`;
});

await check('Migration: a failed save leaves the original data: URL untouched', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(FILE1)) }); wipeIdb(); FAIL.put = true;
  const moved = await app.vaultMigrateFiles();
  return moved === 0 && getLinks()[0].resources[0].url === U1 ? true : `moved=${moved}`;
});

await check('Migration: a copy that reads back wrong leaves the original untouched', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(FILE1)) }); wipeIdb(); FAIL.corrupt = true;
  const moved = await app.vaultMigrateFiles();
  return moved === 0 && getLinks()[0].resources[0].url === U1 ? true : `moved=${moved}`;
});

await check('Cloud apply: a renamed placeholder gets this device\'s IndexedDB file back', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(FILE1)) }); wipeIdb();
  await app.vaultMigrateFiles();
  const local = getLinks();
  const cloud = app.linksForCloud(local);
  cloud[0].resources[0].label = 'Renamed.pdf';
  const merged = app.mergeCloudLinks(cloud, local)[0].resources[0];
  return app.isVaultIdbFile(merged) && merged.label === 'Renamed.pdf' && merged.fileId === local[0].resources[0].fileId && merged.bytes === 3000
    ? true : JSON.stringify(merged);
});

await check('Backup: IndexedDB files go in as the original data: URL', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK, FILE1)) }); wipeIdb();
  await app.vaultMigrateFiles();
  const links = getLinks();
  const plan = app.vaultBackupPlan(links);
  const out = await app.vaultLinksForBackup(links, plan);
  const r = out[0].resources[1];
  return plan.left.length === 0 && r.url === U1 && !('idb' in r) && out[0].resources[0].url === LINK.url ? true : JSON.stringify(r).slice(0, 200);
});

await check('Backup cap: smallest files first up to 30 MB, the rest are listed and left out', () => {
  const mk = (label, mb) => { app.blobIds().add(`b${label}-1`); return { label, url: '', isUpload: true, fileId: `b${label}-1`, idb: true, bytes: mb * 1048576, mime: '' }; };
  const plan = app.vaultBackupPlan(vault(mk('a', 21), mk('b', 9), mk('c', 1)));
  return plan.include.join() === 'bc-1,bb-1' && plan.left.join() === 'a' && plan.leftBytes === 21 * 1048576 ? true : JSON.stringify(plan);
});

await check('Backup: a file left out becomes a placeholder, never a broken entry', async () => {
  const mk = { label: 'gone.pdf', url: '', isUpload: true, fileId: 'bnone-5', idb: true, bytes: 5, mime: '' };
  const out = await app.vaultLinksForBackup(vault(mk), { include: [] });
  return app.isVaultPlaceholder(out[0].resources[0]) && out[0].resources[0].fileId === 'bnone-5' ? true : JSON.stringify(out);
});

await check('Restore: an old backup (data: URLs) goes into IndexedDB; links are kept', async () => {
  seed(); wipeIdb();
  const links = await app.vaultLinksIntoIdb(vault(LINK, FILE1));
  const res = app.saveLinksFittingStorage(links);
  const r = getLinks()[0].resources;
  return res.ok && r[0].url === LINK.url && app.isVaultIdbFile(r[1]) && idbData.has(r[1].fileId) ? true : JSON.stringify(r);
});

await check('Restore: when IndexedDB is full the file stays a data: URL and the old fitting rules apply', async () => {
  seed(); wipeIdb(); FAIL.put = true;
  const links = await app.vaultLinksIntoIdb(vault(LINK, FILE1));
  QUOTA = 1000;
  const res = app.saveLinksFittingStorage(links);
  const r = getLinks()[0].resources;
  return res.ok && res.dropped.join() === 'unit1.pdf' && r[0].url === LINK.url && app.isVaultPlaceholder(r[1]) ? true : `${JSON.stringify(res)} ${JSON.stringify(r)}`;
});

await check('Add several: a 3 MB file is stored in IndexedDB; a 12 MB one is refused', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) }); wipeIdb();
  globalThis.openVaultBulk(0);
  const big = new File([bytesOf(3 * 1048576, 3)], 'big-notes.pdf', { type: 'application/pdf' });
  const huge = { name: 'huge.pdf', size: 12 * 1048576 };
  globalThis.vbAddFiles([big, huge]);
  await flush();
  const vb = app.vbState();
  if (!vb || vb.rows.length !== 1 || !vb.skipped.some(s => /huge/.test(s))) return `rows=${vb && vb.rows.length} skipped=${vb && vb.skipped}`;
  globalThis.vbSave();
  await flush();
  const r = getLinks()[0].resources[1];
  return r && app.isVaultIdbFile(r) && r.bytes === 3 * 1048576 && idbData.has(r.fileId) && !store.cos_custom_links.includes('data:') ? true : JSON.stringify(r);
});

await check('Add several: the same file again is marked "Already saved"', async () => {
  globalThis.openVaultBulk(0);
  globalThis.vbAddFiles([new File([bytesOf(3 * 1048576, 3)], 'copy.pdf', { type: 'application/pdf' })]);
  await flush();
  const vb = app.vbState();
  return vb.rows.length === 1 && vb.rows[0].dup === true ? true : JSON.stringify(vb.rows.map(r => ({ dup: r.dup, key: r.key })));
});

await check('Add one: a picked file is saved to IndexedDB, not into the URL box', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) }); wipeIdb();
  const f = new File([bytesOf(2 * 1048576, 9)], 'lab.pdf', { type: 'application/pdf' });
  domStub('lrm-label').value = ''; domStub('lrm-url').value = ''; domStub('lrm-icon').value = 'book-open';
  globalThis.handleVaultFileSelect({ target: { files: [f], value: 'x' } });
  if (domStub('lrm-url').value) return 'URL box filled';
  globalThis.saveLinkResource(0, null);
  await flush();
  const r = getLinks()[0].resources[1];
  return r && app.isVaultIdbFile(r) && r.label === 'lab.pdf' && idbData.has(r.fileId) && toasts.some(t => /saved/.test(t)) ? true : `${JSON.stringify(r)} ${toasts}`;
});

await check('Rename an IndexedDB file: it keeps its file', async () => {
  const before = getLinks()[0].resources[1];
  domStub('lrm-label').value = 'Lab manual.pdf'; domStub('lrm-url').value = ''; domStub('lrm-icon').value = 'code';
  globalThis._pendingVaultFile = null;
  globalThis.saveLinkResource(0, 1);
  const r = getLinks()[0].resources[1];
  return app.isVaultIdbFile(r) && r.fileId === before.fileId && r.label === 'Lab manual.pdf' ? true : JSON.stringify(r);
});

await check('Vault list: an IndexedDB file opens from IndexedDB; a missing one says so', () => {
  const r = getLinks()[0].resources[1];
  const ok = app.vaultResourceRow(0, 1, r);
  const missing = app.vaultResourceRow(0, 1, { ...r, fileId: 'bmissing-1' });
  return ok.includes(`vaultOpenFile('${r.fileId}')`) && /Missing on this device/.test(missing) ? true : 'row';
});

await check('Storage meter counts IndexedDB files', () => {
  const st = app.vaultStorageStats(getLinks());
  return st.fileCount === 1 && st.fileBytes === 2 * 1048576 ? true : JSON.stringify(st);
});

await check('Delete: a blob another entry (or the declutter undo copy) uses is kept; an unused one goes', async () => {
  const r = getLinks()[0].resources[1];
  const links = getLinks(); links[0].resources.push({ ...r, label: 'copy' });
  store.cos_custom_links = JSON.stringify(links);
  globalThis.deleteLinkResource(0, 1);
  await flush();
  if (!idbData.has(r.fileId)) return 'shared blob deleted';
  store.cos_cleanup_backup = JSON.stringify({ links: getLinks() });
  globalThis.deleteLinkResource(0, 1);
  await flush();
  if (!idbData.has(r.fileId)) return 'blob in undo copy deleted';
  delete store.cos_cleanup_backup;
  await app.vaultDeleteUnusedBlob(r.fileId);
  return !idbData.has(r.fileId) ? true : 'unused blob kept';
});

await check('Open-time sweep: unused blobs under a day old are kept', async () => {
  idbData.set('byoung-1', { fileId: 'byoung-1', blob: new Blob([new Uint8Array(1)]), createdAt: Date.now() });
  idbData.set('bold-1', { fileId: 'bold-1', blob: new Blob([new Uint8Array(1)]), createdAt: Date.now() - 2 * 86400000 });
  await app.vaultDeleteUnusedBlob('byoung-1', 86400000);
  await app.vaultDeleteUnusedBlob('bold-1', 86400000);
  return idbData.has('byoung-1') && !idbData.has('bold-1') ? true : [...idbData.keys()].join();
});

await check('Only cos_custom_links (and the test\'s own undo copy) are written: no new cos_* key', () => {
  const keys = Object.keys(store).filter(k => k.startsWith('cos_') && k !== 'cos_custom_links');
  return keys.length === 0 ? true : keys.join();
});

await check('New IndexedDB code makes no network or Firebase call', () => {
  const i = appSrc.indexOf('// ── Study Vault files in IndexedDB'), j = appSrc.indexOf('function syncToCloud()', i);
  const block = appSrc.slice(i, j);
  return i > 0 && j > i && !/fetch\(|firebase|firestore|XMLHttpRequest|sendBeacon|syncToCloud/.test(block) ? true : 'network call found';
});

// A fresh app where IndexedDB fails to open: everything works the old way.
seed(); FAIL.open = true;
const old = makeApp();
await old.vaultIdbOpen();
FAIL.open = true;

await check('No IndexedDB: limit stays 1 MB and files are saved as data: URLs, as before', async () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) }); FAIL.open = true;
  if (old.idbOk() !== false || !/up to 1 MB/.test(old.vaultFileTooBigMessage(2 * 1048576))) return `idbOk=${old.idbOk()}`;
  globalThis.openVaultBulk(0);
  globalThis.vbAddFiles([new File([bytesOf(500)], 'small.pdf', { type: 'application/pdf' }), { name: 'two.pdf', size: 2 * 1048576 }]);
  await flush();
  const vb = old.vbState();
  if (vb.rows.length !== 1 || !vb.skipped.some(s => /two\.pdf/.test(s))) return `rows=${vb.rows.length}`;
  globalThis.vbSave();
  const r = getLinks()[0].resources[1];
  return r && /^data:application\/pdf;base64,/.test(r.url) && !old.isVaultIdbFile(r) ? true : JSON.stringify(r).slice(0, 120);
});

console.log('\n========================================');
console.log(`STUDY VAULT INDEXEDDB: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
