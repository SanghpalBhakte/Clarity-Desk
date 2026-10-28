// ==================================================================
// Clarity Desk: lazy-loaded modules for tests that run app.js as one script
// ==================================================================
// app.js imports desk-assistant.js the first time Ask Desk is used. Tests
// that evaluate app.js's source directly (new Function) append this so
// ClarityAssistant exists, exactly as it does after that first use, built
// from the same deps app.js passes (clarityAssistantDeps).
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function withDeskAssistant(appCode) {
  const mod = fs.readFileSync(`${ROOT}/desk-assistant.js`, 'utf8').replace(/^export function /m, 'function ');
  return `${appCode}\n${mod}\nClarityAssistant = createClarityAssistant(clarityAssistantDeps());\n`;
}
