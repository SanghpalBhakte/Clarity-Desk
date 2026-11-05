// =====================================================================
// UI Council — screenshots + measured checks for one screen
// =====================================================================
// Seeds sample data, freezes the clock, and saves screenshots of one
// screen in both themes at phone and laptop size. Alongside them it
// writes checks.json: text whose contrast is below WCAG AA and phone tap
// targets smaller than 44 px, measured in the page, so the council argues
// about design, not about numbers it guessed.
//
//   npm run ui:shots -- --screen tasks --out <dir>
//     Serves the LOCAL files (tests/serve.mjs) on its own port (4179, so
//     a stale 4173 server can't answer instead) and drives Chromium.
//
//   npm run ui:shots -- --screen tasks --out <dir> --mcp
//     For when Chromium can't start here (the Claude Code Bash sandbox):
//     writes <dir>/mcp-job.js for the Playwright MCP tool
//     (browser_run_code_unsafe with `filename`). Start the server first:
//     PORT=4179 node tests/serve.mjs. The tool returns only the failed
//     checks (clean views as one "ok" line); save that as <dir>/checks.json.
//
//   --crop <selector>   shoot only that element (e.g. .tk-strip) instead of the
//                       page: fewer pixels for a reviewer to read.
//   Direct runs are cached in test-results/ui-council-cache/<hash>/, keyed on
//   index.html, app.js, style.css, data.js, this script, the screen and --crop.
//   Same hash = files copied back, no browser. --fresh skips the cache.
//   (--mcp runs inside the browser tool, which has no file access: no cache.)
//
// Each view gets a fresh browser context, so nothing touches real storage.
// =====================================================================

import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = {};
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith('--')) args[a.slice(2)] = all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true;
});
const SCREEN = args.screen || 'tasks';
const OUT = path.resolve(args.out || path.join(ROOT, 'test-results', 'ui-council', SCREEN));
const PORT = args.port || '4179';
const BASE = `http://127.0.0.1:${PORT}`;

// Same instant and profile the visual tests use, so shots match them.
const FIXED_NOW = '2026-02-10T09:15:00';
const PROFILE = { name: 'Sanghpal Bhakte', rollNo: '202501128002', college: 'JNEC', branch: 'AI & Data Science', year: '2nd Year', batch: 'A2' };
const THEMES = ['paper-slate', 'midnight-ink'];
// Phone at 2x so small type stays legible to reviewers; laptop at 1x to
// keep the image (and the reviewers' reading cost) small.
const SIZES = { mobile: { width: 390, height: 844, scale: 2 }, desktop: { width: 1440, height: 980, scale: 1 } };

// A busy week with the awkward cases a real student hits: overdue work,
// a long subject name, a long title, no deadline, done items.
const BUSY_TASKS = [
  { id: 'u-1', title: 'DBMS assignment 3 (ER diagrams)', subject: 'Database Management Systems', code: 'DBMS', taskType: 'assignment', dueDate: '2026-02-09', priority: 'high', status: 'pending' },
  { id: 'u-2', title: 'Lab journal sign-off', subject: 'Data Structures Lab', code: 'DSL', taskType: 'assignment', dueDate: '2026-02-10', startTime: '13:30', priority: 'medium', status: 'pending' },
  { id: 'u-3', title: 'Revise trees and graphs before the unit test on Thursday morning', subject: 'Data Structures', code: 'DS', taskType: 'study', dueDate: '2026-02-11', priority: 'medium', status: 'pending' },
  { id: 'u-4', title: 'Unit test 1', subject: 'Probability, Statistics and Queuing Theory', code: 'PSQT', taskType: 'exam', dueDate: '2026-02-12', priority: 'high', status: 'pending' },
  { id: 'u-5', title: 'Mini project synopsis', subject: 'General', code: 'GEN', taskType: 'project', dueDate: '2026-02-14', priority: 'low', status: 'pending' },
  { id: 'u-6', title: 'Read chapter 4', subject: 'Computer Networks', code: 'CN', taskType: 'study', noDeadline: true, priority: 'low', status: 'pending' },
  { id: 'u-7', title: 'OS worksheet', subject: 'Operating Systems', code: 'OS', taskType: 'assignment', dueDate: '2026-02-08', priority: 'medium', status: 'submitted' },
];

const SCREENS = {
  tasks: { page: 'assignments', states: { busy: BUSY_TASKS, empty: [] } },
  today: { page: 'dashboard', states: { busy: BUSY_TASKS, empty: [] } },
  calendar: { page: 'calendar', states: { busy: BUSY_TASKS } },
};

// Self-contained on purpose: it is also serialised into mcp-job.js, so it
// may only use its arguments (no imports, no outer variables).
async function runShots(browser, cfg) {
  function measure({ pageId, isMobile }) {
    const root = document.getElementById(`page-${pageId}`) || document.body;
    const lum = ([r, g, b]) => {
      const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const rgba = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none') return null; // gradient/image: can't measure, skip
        const c = rgba(cs.backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.5)) return c;
      }
      return rgba(getComputedStyle(document.body).backgroundColor);
    };
    const visible = (el) => {
      // checkVisibility() also catches content inside a closed <details>.
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.1;
    };
    const label = (el) => (el.innerText || el.getAttribute('aria-label') || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 60);

    const contrast = [];
    let measured = 0;
    let skipped = 0;
    const seen = new Set();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!el || !t.textContent.trim() || !visible(el) || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      const fg = rgba(cs.color);
      const bg = bgOf(el);
      if (!bg) { skipped++; continue; }
      measured++;
      const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      if (ratio < need) contrast.push({ text: label(el), ratio: Math.round(ratio * 100) / 100, need, fontSize: size });
    }

    // A positioned ::before/::after with negative insets widens the real
    // hit area (the task checkbox uses inset: -10px), so count it.
    const hitBox = (el) => {
      const r = el.getBoundingClientRect();
      let w = r.width;
      let h = r.height;
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === 'none' || ps.position !== 'absolute') continue;
        const grow = (side) => Math.max(0, -(parseFloat(ps[side]) || 0));
        w = Math.max(w, r.width + grow('left') + grow('right'));
        h = Math.max(h, r.height + grow('top') + grow('bottom'));
      }
      return { w: Math.round(w), h: Math.round(h) };
    };

    // Only the screen's own controls: the app's nav/dock are judged elsewhere.
    // tapTargets: below WCAG 2.5.8 AA (24 x 24), a measured fail.
    // tapComfort: under 44 px both ways, advice only (a narrow but 44-tall
    // chip in a spaced row is fine for a thumb).
    const tapTargets = [];
    const tapComfort = [];
    if (isMobile) {
      const els = [...root.querySelectorAll('button, a[href], [role="button"], input, select, [onclick]')].filter(visible);
      const rects = els.map((el) => el.getBoundingClientRect());
      // WCAG spacing exception: an undersized target still passes when a
      // 24 px square centred on it overlaps no other target.
      const spaced = (i) => {
        const r = rects[i];
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const sq = { l: cx - 12, r: cx + 12, t: cy - 12, b: cy + 12 };
        return rects.every((o, j) => j === i || els[j].contains(els[i]) || els[i].contains(els[j]) ||
          o.right <= sq.l || o.left >= sq.r || o.bottom <= sq.t || o.top >= sq.b);
      };
      els.forEach((el, i) => {
        const { w, h } = hitBox(el);
        const item = { text: label(el), width: w, height: h };
        if ((w < 24 || h < 24) && !spaced(i)) tapTargets.push(item);
        else if (w < 44 && h < 44) tapComfort.push(item);
      });
    }
    return { contrast, measured, skipped, tapTargets, tapComfort };
  }

  const checks = {};
  for (const [state, tasks] of Object.entries(cfg.states)) {
    for (const theme of cfg.themes) {
      for (const [size, vp] of Object.entries(cfg.sizes)) {
        // The empty state is checked once; it rarely differs by theme/size.
        if (state === 'empty' && (theme !== 'paper-slate' || size !== 'mobile')) continue;
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date(cfg.now));
        await page.addInitScript(({ profile, tasks, theme }) => {
          localStorage.setItem('cos_onboarding_dismissed', 'true');
          localStorage.setItem('cos_onboarding_done', '1');
          localStorage.setItem('cos_profile', JSON.stringify(profile));
          localStorage.setItem('cos_custom_tasks', JSON.stringify(tasks));
          localStorage.setItem('cos_theme', theme);
        }, { profile: cfg.profile, tasks, theme });
        await page.goto(cfg.base + '/', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.navigateTo === 'function');
        await page.evaluate((p) => window.navigateTo(p), cfg.page);
        await page.waitForTimeout(600);
        const name = `${state}-${theme}-${size}`;
        checks[name] = await page.evaluate(measure, { pageId: cfg.page, isMobile: size === 'mobile' });
        if (cfg.crop) {
          await page.locator(cfg.crop).first().screenshot({ path: `${cfg.out}/${name}.png` });
        } else if (size === 'mobile') {
          // A full-page capture draws the fixed nav and sticky add bar at
          // their scroll-0 spots over a taller page, which looks broken when
          // it isn't. Phone shots are what a student sees instead: the
          // screen as it opens and, when it scrolls, the end of the list.
          await page.screenshot({ path: `${cfg.out}/${name}.png` });
          const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 4);
          if (scrolls) {
            await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
            await page.waitForTimeout(200);
            await page.screenshot({ path: `${cfg.out}/${name}-end.png` });
          }
        } else {
          await page.screenshot({ path: `${cfg.out}/${name}.png`, fullPage: true });
        }
        await context.close();
      }
    }
  }
  return checks;
}

function waitForServer(url, ms = 15000) {
  const end = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => fetch(url).then(() => resolve(), () => (Date.now() > end ? reject(new Error(`No server at ${url}`)) : setTimeout(tick, 200)));
    tick();
  });
}

function summarise(checks) {
  for (const [name, c] of Object.entries(checks)) {
    console.log(`  ${name}: ${c.contrast.length} contrast fails (of ${c.measured} measured, ${c.skipped} skipped), ${c.tapTargets.length} small tap targets`);
  }
}

async function main() {
  const screen = SCREENS[SCREEN];
  if (!screen) throw new Error(`Unknown screen "${SCREEN}". Known: ${Object.keys(SCREENS).join(', ')}`);
  fs.mkdirSync(OUT, { recursive: true });
  const cfg = { base: BASE, out: OUT, page: screen.page, states: screen.states, themes: THEMES, sizes: SIZES, now: FIXED_NOW, profile: PROFILE, crop: typeof args.crop === 'string' ? args.crop : null };

  if (args.mcp) {
    const job = path.join(OUT, 'mcp-job.js');
    // The MCP tool echoes the job back into the conversation, so the job is
    // a tiny loader: the code and config sit beside it and are fetched from
    // the 4179 server. It returns only failures; a clean view is one line.
    const rel = path.relative(ROOT, OUT).split(path.sep).join('/');
    fs.writeFileSync(path.join(OUT, 'run-shots.js'), `(${runShots.toString()})`);
    fs.writeFileSync(path.join(OUT, 'cfg.json'), JSON.stringify(cfg));
    fs.writeFileSync(job, `async (page) => { const get = (f) => fetch('${BASE}/${rel}/' + f).then((r) => r.text());
const c = await eval(await get('run-shots.js'))(page.context().browser(), JSON.parse(await get('cfg.json')));
return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.contrast.length || v.tapTargets.length ? v : 'ok: ' + v.measured + ' measured, ' + v.skipped + ' skipped, ' + v.tapComfort.length + ' under 44px'])); }\n`);
    console.log(job);
    return;
  }

  // Same inputs as last time: reuse the saved shots, skip the browser.
  const hash = crypto.createHash('sha1');
  for (const f of ['index.html', 'app.js', 'style.css', 'data.js', 'scripts/ui-council/shoot.mjs']) hash.update(fs.readFileSync(path.join(ROOT, f)));
  hash.update(JSON.stringify({ screen: SCREEN, cfg: { ...cfg, base: null, out: null } }));
  const cacheDir = path.join(ROOT, 'test-results', 'ui-council-cache', hash.digest('hex').slice(0, 16));
  if (!args.fresh && fs.existsSync(path.join(cacheDir, 'checks.json'))) {
    for (const f of fs.readdirSync(cacheDir)) fs.copyFileSync(path.join(cacheDir, f), path.join(OUT, f));
    const cached = JSON.parse(fs.readFileSync(path.join(OUT, 'checks.json'), 'utf8'));
    console.log(`Cache hit (${path.basename(cacheDir)}): ${Object.keys(cached).length} screenshots + checks.json copied to ${OUT}, no browser started`);
    summarise(cached);
    return;
  }

  const startedAt = Date.now();
  const { chromium } = await import('@playwright/test');
  const server = spawn(process.execPath, [path.join(ROOT, 'tests', 'serve.mjs')], { env: { ...process.env, PORT }, stdio: 'ignore' });
  let checks;
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch();
    try {
      checks = await runShots(browser, cfg);
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(checks, null, 2));
  fs.mkdirSync(cacheDir, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (/\.(png|json)$/.test(f) && fs.statSync(path.join(OUT, f)).mtimeMs >= startedAt) fs.copyFileSync(path.join(OUT, f), path.join(cacheDir, f));
  console.log(`Saved ${Object.keys(checks).length} screenshots + checks.json to ${OUT}`);
  summarise(checks);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
