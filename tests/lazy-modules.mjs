// ==================================================================
// Clarity Desk: lazy-loaded modules for tests that run app.js as one script
// ==================================================================
// app.js imports desk-assistant.js the first time Ask Desk is used and
// scanners.js the first time a photo scan is used, and timetable-ocr.js the
// first time a timetable photo is scanned, whatsapp-import.js the first
// time the import screen opens, syllabus-ui.js the first time a syllabus
// screen is used, and vault-ui.js the first time the Vault tab opens. Tests that evaluate
// app.js's source directly (new Function) append these so the code exists,
// exactly as it does after that first use, built from the same deps app.js
// passes (clarityAssistantDeps, scannerDeps, timetableOcrDeps).
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function withDeskAssistant(appCode) {
  const mod = fs.readFileSync(`${ROOT}/desk-assistant.js`, 'utf8').replace(/^export function /m, 'function ');
  return `${appCode}\n${mod}\nClarityAssistant = createClarityAssistant(clarityAssistantDeps());\n`;
}

// Also defines every scanners.js function by name (parseAttendanceFromText,
// runSyllabusScan, ...) so tests reach them as before.
export function withScanners(appCode) {
  const mod = fs.readFileSync(`${ROOT}/scanners.js`, 'utf8').replace(/^export function /m, 'function ');
  const names = mod.slice(mod.lastIndexOf('return {') + 8, mod.lastIndexOf('};')).split(',').map(s => s.trim()).filter(Boolean);
  return `${appCode}\n${mod}\nScanners = createScanners(scannerDeps());\nconst { ${names.join(', ')} } = Scanners;\n`;
}

// Defines every timetable-ocr.js function by name (reconstructTimetable2DGrid,
// preprocessImageForOCR, ...) except extractTimetableFromImage, which app.js
// keeps as a wrapper; with TimetableOcr set, that wrapper uses this copy.
export function withTimetableOcr(appCode) {
  const mod = fs.readFileSync(`${ROOT}/timetable-ocr.js`, 'utf8').replace(/^export function /m, 'function ');
  const names = mod.slice(mod.lastIndexOf('return {') + 8, mod.lastIndexOf('};')).split(',').map(s => s.trim()).filter(n => n && n !== 'extractTimetableFromImage');
  return `${appCode}\n${mod}\nTimetableOcr = createTimetableOcr(timetableOcrDeps());\nconst { ${names.join(', ')} } = TimetableOcr;\n`;
}

// Defines every whatsapp-import.js handler by name (waSaveLinks, waToggle, ...)
// except showWhatsAppImport, which app.js keeps as a stub that calls in here.
export function withWhatsApp(appCode) {
  const mod = fs.readFileSync(`${ROOT}/whatsapp-import.js`, 'utf8').replace(/^export function /m, 'function ');
  const names = mod.slice(mod.lastIndexOf('return {') + 8, mod.lastIndexOf('};')).split(',').map(s => s.replace(/\/\/.*$/gm, '').trim()).filter(n => n && n !== 'showWhatsAppImport' && !n.startsWith('setReviewState'));
  return `${appCode}\n${mod}\nWhatsApp = createWhatsAppImport(whatsAppDeps());\nconst { ${names.join(', ')} } = WhatsApp;\n`;
}

// Defines every syllabus-ui.js function by name (parseSyllabusPaste,
// cycleSyllabusTopic, ...). app.js's scanner deps read parseSyllabusLine and
// the paste draft from SyllabusUi, so this goes under withScanners.
export function withSyllabusUi(appCode) {
  const mod = fs.readFileSync(`${ROOT}/syllabus-ui.js`, 'utf8').replace(/^export function /m, 'function ');
  const names = mod.slice(mod.lastIndexOf('return {') + 8, mod.lastIndexOf('};')).split(',').map(s => s.replace(/\/\/.*$/gm, '').trim()).filter(n => n && !n.startsWith('getPasteDraft'));
  return `${appCode}\n${mod}\nSyllabusUi = createSyllabusUi(syllabusDeps());\nconst { ${names.join(', ')} } = SyllabusUi;\n`;
}

// Defines every vault-ui.js function by name (renderLinksContent,
// vaultExtractLinks, saveLinkResource, ...) and getBulkState, the draft of
// "add several" (tests read it as `_vb` did when it lived in app.js).
export function withVaultUi(appCode) {
  const mod = fs.readFileSync(`${ROOT}/vault-ui.js`, 'utf8').replace(/^export function /m, 'function ');
  const names = mod.slice(mod.lastIndexOf('return {') + 8, mod.lastIndexOf('};')).split(',').map(s => s.replace(/\/\/.*$/gm, '').trim()).filter(n => n && !n.startsWith('getBulkState'));
  return `${appCode}\n${mod}\nVaultUi = createVaultUi(vaultDeps());\nconst { ${names.join(', ')} } = VaultUi;\n`;
}

export const withLazyModules = (appCode) => withVaultUi(withWhatsApp(withTimetableOcr(withScanners(withSyllabusUi(withDeskAssistant(appCode))))));
