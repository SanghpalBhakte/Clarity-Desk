// ==================================================================
// Clarity Desk: are the free AI models the scanners use still offered?
// ==================================================================
// Reads the model IDs from AIService in app.js and checks each against the
// provider's own model list. Listing models uses no AI quota. Providers
// retire free models without notice, and a retired ID fails silently in
// the app (the scan just falls through to the next provider), so this runs
// daily in CI (.github/workflows/ai-models.yml); a failed run emails the
// repo owner.
//
//   GEMINI_API_KEY=... GROQ_API_KEY=... node scripts/check-ai-models.mjs
//
// A provider whose key isn't set is skipped with a warning. OpenRouter's
// list is public, so it is always checked. Workers AI models are not
// checked (that needs a Cloudflare API token).
// ==================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const aiService = app.slice(app.indexOf('const AIService = {'));

// Value of one AIService property: a quoted string or an array of them.
function modelIds(name) {
  const m = aiService.match(new RegExp(`\\n  ${name}: (\\[[^\\]]*\\]|'[^']*')`));
  if (!m) throw new Error(`AIService.${name} not found in app.js`);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

async function listJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

const providers = [
  {
    name: 'Gemini',
    key: process.env.GEMINI_API_KEY,
    models: [...modelIds('MODEL'), ...modelIds('FALLBACK_MODELS')],
    async list(key) {
      const ids = new Set();
      let pageToken = '';
      do {
        const data = await listJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`, { 'x-goog-api-key': key });
        (data.models || []).forEach(m => ids.add(String(m.name).replace(/^models\//, '')));
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return ids;
    }
  },
  {
    name: 'Groq',
    key: process.env.GROQ_API_KEY,
    models: [...new Set([...modelIds('GROQ_MODEL'), ...modelIds('GROQ_VISION_MODEL')])],
    async list(key) {
      const data = await listJson('https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${key}` });
      return new Set((data.data || []).map(m => m.id));
    }
  },
  {
    name: 'OpenRouter',
    key: 'public',
    models: modelIds('OPENROUTER_VISION_MODELS'),
    async list() {
      const data = await listJson('https://openrouter.ai/api/v1/models');
      return new Set((data.data || []).map(m => m.id));
    }
  }
];

let missing = 0;
let errors = 0;
for (const p of providers) {
  if (!p.key) {
    console.warn(`- ${p.name}: skipped (no API key set)`);
    continue;
  }
  let offered;
  try {
    offered = await p.list(p.key);
  } catch (err) {
    console.error(`✗ ${p.name}: could not list models (${err.message})`);
    errors++;
    continue;
  }
  for (const id of p.models) {
    if (offered.has(id)) {
      console.log(`✓ ${p.name}: ${id}`);
    } else {
      console.error(`✗ ${p.name}: ${id} is no longer offered -- update AIService in app.js`);
      missing++;
    }
  }
}

console.log(`\nAI MODELS: ${missing} missing, ${errors} provider list error(s)`);
if (missing || errors) process.exit(1);
