// npm run board:compare — the real app (messy desk) next to the approved board (#458), same state,
// for Today, Tasks, Subjects, Settings and Daily Briefing at 393 and 1280. Writes one image per
// screen and width to test-results/board-side-by-side/ (app left, board right). UI PRs attach them.
// Uses the local preview (tests/serve.mjs on 4173; started here if it isn't running). Options:
//   THEME=rose|terracotta|lavender|apricot   MODE=light|dark   (default rose, light)
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { MESSY_DESK, MESSY_FLAGS, MESSY_AT } from './messy-desk.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-results', 'board-side-by-side');
const BASE = 'http://127.0.0.1:4173';
const THEME = process.env.THEME || 'rose';
const MODE = process.env.MODE === 'dark' ? 'dark' : 'light';
// App page name, and the screen's place on the board (its order of sections).
const SCREENS = [['today', 'dashboard'], ['tasks', 'assignments'], ['subjects', 'subjects'], ['settings', 'settings'], ['briefing', 'summary']];
const WIDTHS = [393, 1280];

async function up() { try { return (await fetch(BASE + '/__root')).ok; } catch { return false; } }
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [path.join(ROOT, 'tests', 'serve.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  // The board: switch to the same Theme, mode and big-screen width, then shoot each frame.
  const boardShots = {};
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'docs', 'board', 'index.html')).href);
    for (const [k, v] of [['t', THEME], ['m', MODE], ['big', '1280'], ['dev', 'iphone'], ['data', 'real']]) {
      const b = page.locator(`.seg[data-k="${k}"] button[data-v="${v}"]`);
      if (await b.count()) await b.first().click();
    }
    // The board's sticky switch bar would sit over the frames in the shots.
    await page.addStyleTag({ content: '#ctl { display: none !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const blocks = page.locator('#screens section.blk');
    for (let i = 0; i < SCREENS.length; i++) {
      const frame = w < 800 ? blocks.nth(i).locator('.pc .frame') : blocks.nth(i).locator('.frame.big');
      boardShots[`${SCREENS[i][0]}-${w}`] = await frame.screenshot();
    }
    await ctx.close();
  }

  // The app: the messy desk at the same time, Theme and mode.
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 800 ? 852 : 800 }, isMobile: w < 800, hasTouch: w < 800, timezoneId: 'Asia/Kolkata' });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(MESSY_AT) });
    await page.addInitScript((d) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
    }, { ...MESSY_DESK, ...MESSY_FLAGS, cos_accent: THEME, cos_theme: MODE === 'dark' ? 'midnight-ink' : 'paper-slate' });
    await page.goto(BASE + '/');
    await page.waitForFunction(() => typeof window.navigate === 'function');
    await page.waitForTimeout(800);
    for (const [name, nav] of SCREENS) {
      await page.evaluate((x) => window.navigate(x), nav);
      await page.waitForTimeout(500);
      // Phones: the whole page, as the board draws it; big screens: the first screen, as the board does.
      const app = await page.screenshot({ fullPage: w < 800 });
      // Side by side on one page, both at their own size, labelled.
      const pair = await browser.newPage({ viewport: { width: 400, height: 400 } });
      const img = (b) => `data:image/png;base64,${b.toString('base64')}`;
      await pair.setContent(`<body style="margin:0;background:#ddd;font:600 16px system-ui"><div style="display:flex;gap:24px;align-items:flex-start;padding:16px;width:max-content">
        <figure style="margin:0"><figcaption>App · ${w}</figcaption><img src="${img(app)}"></figure>
        <figure style="margin:0"><figcaption>Board · ${w < 800 ? 393 : 1280}</figcaption><img src="${img(boardShots[`${name}-${w}`])}"></figure></div></body>`);
      const file = path.join(OUT, `${name}-${w}.png`);
      await pair.locator('body > div').screenshot({ path: file });
      await pair.close();
      console.log('wrote', path.relative(ROOT, file));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
