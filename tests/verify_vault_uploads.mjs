// ==================================================================
// Clarity Desk: STUDY VAULT UPLOADS (size limit, full storage, sync)
// ==================================================================
// Locked down here:
//  - files over 1 MB are refused before they are read;
//  - when this phone's storage is full the vault says "Not saved", keeps
//    the modal open, and does not sync;
//  - the cloud copy never carries file contents (placeholders instead),
//    while links sync unchanged;
//  - a sync coming back NEVER deletes a file this device has, even after
//    another device renamed it; old cloud records with files still apply;
//  - another device shows "On another device", and can rename it;
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
let readerCreated = 0;
globalThis.FileReader = class { constructor() { readerCreated++; } readAsDataURL() {} };

const code = appSrc.replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?/g, `
  const STUDENT = { name: '', batch: '', roll: '' };
  const TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const EMPTY_TIMETABLE = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
  const ASSIGNMENTS = []; const QUICK_LINKS = []; const DEV_UPDATES = []; const NOTICES = [];
`);
const app = new Function(`${code}\n return { saveCustomLinks, linksForCloud, mergeCloudLinks, saveLinksFittingStorage, vaultFileTooBigMessage, applyCloudDataToLocalState, isVaultPlaceholder, vaultFileId, VAULT_FILE_MAX_BYTES };`)();

const dataUrl = (n, ch = 'A') => 'data:application/pdf;base64,' + ch.repeat(n);
const FILE = { label: 'Unit 3 notes.pdf', url: dataUrl(400), icon: 'book-open', isUpload: true, fileSize: '300 B' };
const LINK = { label: 'DBMS playlist', url: 'https://youtube.com/playlist?list=x', icon: 'video', isUpload: false, fileSize: '' };
const vault = (...resources) => [{ subject: 'DBMS', resources }];
const getLinks = () => JSON.parse(store.cos_custom_links || 'null');
// Same data regardless of key order.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x);

function seed(extra = {}) {
  for (const k of Object.keys(store)) delete store[k];
  Object.assign(store, extra);
  QUOTA = Infinity; domCache = {}; toasts.length = 0; timers.length = 0; readerCreated = 0;
}

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
console.log('📎 STUDY VAULT UPLOADS');
console.log('==================================================================');

check('Limit is 1 MB: exactly 1 MB is fine, one byte more is refused with a Drive hint', () => {
  const ok = app.vaultFileTooBigMessage(app.VAULT_FILE_MAX_BYTES), big = app.vaultFileTooBigMessage(app.VAULT_FILE_MAX_BYTES + 1);
  return app.VAULT_FILE_MAX_BYTES === 1048576 && ok === '' && /1 MB/.test(big) && /Google Drive/.test(big) ? true : `ok="${ok}" big="${big}"`;
});

check('A 4 MB file is refused before it is read at all', () => {
  seed();
  const input = { files: [{ name: 'big.pdf', size: 4 * 1048576 }], value: 'big.pdf' };
  globalThis.handleVaultFileSelect({ target: input });
  return readerCreated === 0 && input.value === '' && toasts.some(t => /4\.0 MB/.test(t)) ? true : `reader=${readerCreated} toasts=${toasts}`;
});

check('Full storage: saveCustomLinks says false and does not sync', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) });
  QUOTA = used() + 50;
  const before = store.cos_custom_links;
  const ok = app.saveCustomLinks(vault(LINK, FILE));
  return ok === false && timers.length === 0 && store.cos_custom_links === before ? true : `ok=${ok} timers=${timers.length}`;
});

check('Room left: saveCustomLinks says true, saves, and syncs only after the write worked', () => {
  seed();
  const ok = app.saveCustomLinks(vault(LINK, FILE));
  const i = appSrc.indexOf('function saveCustomLinks('), b = appSrc.slice(i, appSrc.indexOf('\n}\n', i));
  const order = b.indexOf('return false') < b.indexOf('syncToCloud()') && b.indexOf('return false') > 0;
  return ok === true && getLinks()[0].resources.length === 2 && order ? true : `ok=${ok} order=${order}`;
});

check('Saving a file into full storage shows "Not saved" and keeps the modal open', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK)) });
  QUOTA = used() + 50;
  domStub('lrm-label').value = 'Unit 3 notes.pdf'; domStub('lrm-url').value = FILE.url; domStub('lrm-icon').value = 'book-open';
  globalThis._uploadedFileMeta = { isUpload: true, fileSize: '300 B' };
  globalThis.saveLinkResource(0, null);
  const modal = domCache['link-resource-modal-backdrop'];
  return toasts.some(t => /Not saved/.test(t)) && !toasts.some(t => /saved ✓/.test(t)) && !(modal && modal.removed) && getLinks()[0].resources.length === 1
    ? true : `toasts=${toasts} modalRemoved=${modal && modal.removed}`;
});

check('Cloud copy: no file contents, links unchanged, the local list untouched', () => {
  const local = vault(LINK, FILE);
  const before = JSON.stringify(local);
  const cloud = app.linksForCloud(local);
  const r = cloud[0].resources;
  const noData = !JSON.stringify(cloud).includes('data:');
  return noData && JSON.stringify(r[0]) === JSON.stringify(LINK) && r[1].url === '' && r[1].onDevice === true && r[1].fileId === app.vaultFileId(FILE.url) && r[1].label === FILE.label && JSON.stringify(local) === before
    ? true : JSON.stringify(cloud);
});

check('Round trip on the same phone: sync back changes nothing', () => {
  const local = vault(LINK, FILE);
  const back = app.mergeCloudLinks(app.linksForCloud(local), local);
  return canon(back) === canon(local) ? true : canon(back);
});

check('Sync NEVER deletes a file this phone has, even after another device renamed it', () => {
  const local = vault(LINK, FILE);
  const cloud = app.linksForCloud(local);
  cloud[0].resources[1] = { ...cloud[0].resources[1], label: 'Unit 3 (final).pdf', icon: 'code' };
  const back = app.mergeCloudLinks(cloud, local);
  const r = back[0].resources[1];
  return r.url === FILE.url && r.label === 'Unit 3 (final).pdf' && r.icon === 'code' && !('onDevice' in r) && !('fileId' in r) ? true : JSON.stringify(r);
});

check('Through the real cloud apply: local file kept', () => {
  seed({ cos_custom_links: JSON.stringify(vault(LINK, FILE)) });
  app.applyCloudDataToLocalState({ customLinks: app.linksForCloud(vault(LINK, FILE)) });
  const r = getLinks()[0].resources[1];
  return r && r.url === FILE.url ? true : JSON.stringify(getLinks());
});

check('Another phone without the file keeps a placeholder', () => {
  const back = app.mergeCloudLinks(app.linksForCloud(vault(LINK, FILE)), vault(LINK));
  return app.isVaultPlaceholder(back[0].resources[1]) && back[0].resources[0].url === LINK.url ? true : JSON.stringify(back);
});

check('Old cloud records that still hold a file apply as before', () => {
  const back = app.mergeCloudLinks(vault(LINK, FILE), vault(LINK));
  return back[0].resources[1].url === FILE.url ? true : JSON.stringify(back);
});

check('A file deleted on another device goes away here too', () => {
  const cloud = app.linksForCloud(vault(LINK));
  const back = app.mergeCloudLinks(cloud, vault(LINK, FILE));
  return back[0].resources.length === 1 && back[0].resources[0].url === LINK.url ? true : JSON.stringify(back);
});

check('Two different files with the same name each find their own content', () => {
  const A = { ...FILE, url: dataUrl(400, 'A') }, B = { ...FILE, url: dataUrl(400, 'B') };
  const back = app.mergeCloudLinks(app.linksForCloud(vault(A, B)), vault(A, B));
  return back[0].resources[0].url === A.url && back[0].resources[1].url === B.url ? true : 'files swapped';
});

check('Renaming a "saved on another device" item keeps it a placeholder', () => {
  const ph = app.linksForCloud(vault(FILE))[0].resources[0];
  seed({ cos_custom_links: JSON.stringify(vault(ph)) });
  domStub('lrm-label').value = 'Renamed.pdf'; domStub('lrm-url').value = ''; domStub('lrm-icon').value = 'code';
  globalThis._uploadedFileMeta = null;
  globalThis.saveLinkResource(0, 0);
  const r = getLinks()[0].resources[0];
  return app.isVaultPlaceholder(r) && r.label === 'Renamed.pdf' && r.fileId === ph.fileId && toasts.some(t => /saved/.test(t)) ? true : `${JSON.stringify(r)} toasts=${toasts}`;
});

check('Restore with files too big for the phone: biggest become placeholders, every link kept', () => {
  seed();
  const small = { ...FILE, label: 'small.pdf', url: dataUrl(100, 'S') }, big = { ...FILE, label: 'big.pdf', url: dataUrl(3000, 'B') };
  QUOTA = 1200;
  const res = app.saveLinksFittingStorage(vault(LINK, small, big));
  const r = getLinks()[0].resources;
  return res.ok && res.dropped.join() === 'big.pdf' && r[0].url === LINK.url && r[1].url === small.url && app.isVaultPlaceholder(r[2])
    ? true : `${JSON.stringify(res)} ${JSON.stringify(r)}`;
});

check('Restore writes the vault after everything else, and the push sends placeholders', () => {
  const body = (name) => { const i = appSrc.indexOf(`function ${name}(`); return appSrc.slice(i, appSrc.indexOf('\n}\n', i)); };
  const imp = body('importData');
  const vaultAt = imp.indexOf('saveLinksFittingStorage(data.customLinks)'), attAt = imp.indexOf('safeSetStorage(KEY_ATTENDANCE, data.attendance)');
  const push = body('pushLocalDataToCloud');
  if (imp.includes('safeSetStorage(KEY_CUSTOM_LINKS, data.customLinks)')) return 'restore still writes the vault directly';
  if (!(vaultAt > attAt && attAt > 0)) return `vault at ${vaultAt}, attendance at ${attAt}`;
  return push.includes('linksForCloud(safeGetStorage(KEY_CUSTOM_LINKS') ? true : 'push does not use linksForCloud';
});

check('Backups still include the files', () => {
  const i = appSrc.indexOf('function exportData('), b = appSrc.slice(i, appSrc.indexOf('\n}\n', i));
  return b.includes('customLinks:        safeGetStorage(KEY_CUSTOM_LINKS, null)') ? true : 'export changed';
});

console.log('\n========================================');
console.log(`STUDY VAULT UPLOADS: ${passed}/${total} passed`);
console.log('========================================');
if (errors.length) process.exit(1);
