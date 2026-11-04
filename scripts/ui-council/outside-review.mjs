// =====================================================================
// UI Council — optional outside reviewers (free tiers only)
// =====================================================================
// Sends council screenshots to non-Claude vision models for a second
// opinion: Gemini (Google AI Studio free key) plays the Jester, Groq and
// OpenRouter ":free" models act as extra reviewers. Each provider is used
// only if its key is in .env.council (gitignored), so the council still
// works with no keys at all.
//
// Use keys made just for this, NOT the AI proxy's keys: Google and Groq
// count free quota per key, and students' timetable scans need that quota.
// Free tiers may use what you send for training; the screenshots hold only
// the sample data from shoot.mjs.
//
//   node scripts/ui-council/outside-review.mjs --brief "<brief>" <png> [<png> ...]
//
// Prints one JSON line per provider: { provider, model, role, score,
// criteria, fixes, edgeCases, error }.
// =====================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TIMEOUT_MS = 90_000;
// Groq and OpenRouter reject large requests; the skill sends the 4 most
// useful shots and this guards the rest.
const MAX_IMAGES = 4;

// Same models the app's scanner uses (see app.js AI_CONFIG); re-check
// them there if a provider starts answering "model not found".
const PROVIDERS = {
  gemini: { key: 'GEMINI_API_KEY', model: 'gemini-flash-latest', role: 'jester' },
  groq: { key: 'GROQ_API_KEY', model: 'qwen/qwen3.8-27b', role: 'reviewer', url: 'https://api.groq.com/openai/v1/chat/completions' },
  openrouter: { key: 'OPENROUTER_API_KEY', model: 'google/gemma-4-31b-it:free', role: 'reviewer', url: 'https://openrouter.ai/api/v1/chat/completions' },
};

function loadKeys() {
  const file = path.join(ROOT, '.env.council');
  const keys = { ...process.env };
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
      if (m) keys[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return keys;
}

function prompt(role, brief) {
  const common = `You are on a design council reviewing screenshots of Clarity Desk, an offline-first study app for Indian engineering college students (timetable, attendance, tasks). Screenshots are named state-theme-size.
Brief for this screen: ${brief}
House style: editorial and distinctive, type-led, few card containers, no generic UI-kit look. Times are 12-hour AM/PM.`;
  const reviewer = `Score 1-10 on: hierarchy (what matters first is seen first), typography, spacing_rhythm, clarity_for_a_student (finds what is due in 3 seconds), consistency_across_themes_and_sizes. Then give the overall score and at most 3 concrete fixes, each naming the element and the change (e.g. "overdue row date: raise to 15px and use the danger colour"). Be strict: 9+ means you would ship it in a top-tier app.`;
  const jester = `You are the Jester: find what breaks or embarrasses this screen. Hunt for long names that clip, crowded rows, unclear empty states, confusing labels, wrong time formats, things a tired student at 11 PM would misread. Also give an overall 1-10 score and at most 3 concrete fixes. Off-beat ideas are welcome, but each fix must be buildable.`;
  return `${common}\n${role === 'jester' ? jester : reviewer}
Reply with JSON only: {"score": n, "criteria": {"name": n}, "fixes": ["..."], "edgeCases": ["..."]}`;
}

async function post(url, headers, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

function parseJson(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON in reply: ${String(text).slice(0, 120)}`);
  return JSON.parse(m[0]);
}

async function ask(id, p, apiKey, brief, images) {
  const text = prompt(p.role, brief) + `\nImages in order: ${images.map((i) => i.name).join(', ')}`;
  if (id === 'gemini') {
    const data = await post(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`, { 'x-goog-api-key': apiKey }, {
      contents: [{ parts: [{ text }, ...images.map((i) => ({ inline_data: { mime_type: 'image/png', data: i.b64 } }))] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
    });
    return parseJson(data.candidates?.[0]?.content?.parts?.map((x) => x.text).join(''));
  }
  const data = await post(p.url, { Authorization: `Bearer ${apiKey}` }, {
    model: p.model,
    temperature: 0.4,
    messages: [{ role: 'user', content: [{ type: 'text', text }, ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:image/png;base64,${i.b64}` } }))] }],
  });
  return parseJson(data.choices?.[0]?.message?.content);
}

async function main() {
  const argv = process.argv.slice(2);
  const bi = argv.indexOf('--brief');
  const brief = bi >= 0 ? argv.splice(bi, 2)[1] : 'Make this screen clear and calm for a student.';
  const images = argv.slice(0, MAX_IMAGES).map((f) => ({ name: path.basename(f), b64: fs.readFileSync(f).toString('base64') }));
  if (!images.length) throw new Error('Pass at least one screenshot path.');

  const keys = loadKeys();
  const active = Object.entries(PROVIDERS).filter(([, p]) => keys[p.key]);
  if (!active.length) {
    console.log(JSON.stringify({ skipped: true, reason: 'No keys in .env.council; council runs Claude-only.' }));
    return;
  }
  const results = await Promise.all(active.map(async ([id, p]) => {
    try {
      return { provider: id, model: p.model, role: p.role, ...(await ask(id, p, keys[p.key], brief, images)) };
    } catch (err) {
      return { provider: id, model: p.model, role: p.role, error: String(err.message || err) };
    }
  }));
  results.forEach((r) => console.log(JSON.stringify(r)));
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
