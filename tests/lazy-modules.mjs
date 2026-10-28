// ==================================================================
// Clarity Desk: lazy-loaded modules for tests that run app.js as one script
// ==================================================================
// app.js imports desk-assistant.js the first time Ask Desk is used and
// scanners.js the first time a photo scan is used. Tests that evaluate
// app.js's source directly (new Function) append these so the code exists,
// exactly as it does after that first use, built from the same deps app.js
// passes (clarityAssistantDeps, scannerDeps).
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

export const withLazyModules = (appCode) => withScanners(withDeskAssistant(appCode));
