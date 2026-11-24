import { test, expect, Browser } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
// @ts-ignore -- plain .mjs fixture shared with node tests
import { MESSY_DESK, MESSY_FLAGS, MESSY_AT } from './messy-desk.mjs';

// Clutter checks (docs/POLISH.md): the real app with the messy desk, at phone and big-screen widths, in every Theme.
// One load per width + Theme + Light/Dark visits all five screens and collects every rule; then one test per
// screen and rule reports what broke and where. A screen whose calm pass has not landed yet is listed in PENDING
// with its ticket: its tests are expected to fail, and start failing "the other way" the day they pass, so the
// ticket that fixes them has to switch them on.

const SCREENS = { today: 'dashboard', tasks: 'assignments', subjects: 'subjects', settings: 'settings', briefing: 'summary' } as const;
type Screen = keyof typeof SCREENS;
const RULES = ['no-sideways-scroll', 'title-one-line', 'rows-two-lines', 'no-clipped-text', 'one-card', 'one-see-more', 'no-course-codes', 'no-current-year', 'only-lexend', 'font-sizes', 'accent-only-now'] as const;
type Rule = typeof RULES[number];

const WIDTHS = [360, 393, 412, 1280, 1920];
const THEMES = ['terracotta', 'rose', 'lavender', 'apricot'];
// Light everywhere; Dark at one phone and one laptop width (Dark changes colours, not layout).
const RUNS = [
  ...THEMES.flatMap((t) => WIDTHS.map((w) => ({ t, w, m: 'paper-slate' }))),
  ...THEMES.flatMap((t) => [393, 1280].map((w) => ({ t, w, m: 'midnight-ink' }))),
];

// Font sizes a screen may use (px): phone 34 title, 20 smart line, 16 rows, 14 second lines, 12 strip; laptop 38 and 22.
const SIZES = [12, 14, 16, 20, 34, 38, 22];

// Not calm yet: [screen][rule] -> the ticket that makes it pass. Remove an entry when its ticket lands.
const PENDING: Partial<Record<Screen, Partial<Record<Rule, string>>>> = {
  today: { 'title-one-line': '#460', 'rows-two-lines': '#460', 'no-clipped-text': '#460', 'font-sizes': '#460' },
  tasks: { 'no-clipped-text': '#461', 'font-sizes': '#461' },
  subjects: { 'font-sizes': '#462' },
  settings: { 'no-clipped-text': '#463', 'no-course-codes': '#463', 'font-sizes': '#463' },
  briefing: { 'font-sizes': '#463' },
};

type Hit = { rule: Rule; where: string };
const found: Record<string, Hit[]> = {};
for (const s of Object.keys(SCREENS)) found[s] = [];

// Runs in the page: every rule for the screen that is open now.
function collect(args: { sizes: number[]; year: string }): { rule: string; what: string }[] {
  const out: { rule: string; what: string }[] = [];
  const page = document.querySelector('.section-page.active') as HTMLElement | null;
  if (!page) return [{ rule: 'no-sideways-scroll', what: 'no active page' }];
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (let e: Element | null = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false; }
    return true;
  };
  const name = (el: Element) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ` "${(el.textContent || '').trim().slice(0, 40)}"`;
  const texts: HTMLElement[] = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n.textContent || '').trim()) continue;
    const el = n.parentElement as HTMLElement;
    if (el && !texts.includes(el) && !el.closest('script,style,svg,[aria-hidden="true"] .sr-only') && vis(el)) texts.push(el);
  }

  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ rule: 'no-sideways-scroll', what: `page is ${document.documentElement.scrollWidth}px wide` });

  for (const t of document.querySelectorAll('.c2-lt-title, .c2-dtitle')) {
    if (!vis(t)) continue;
    const lh = parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.2;
    if (t.getBoundingClientRect().height > lh * 1.5) out.push({ rule: 'title-one-line', what: name(t) });
  }

  // Lines in a row: distinct heights at which its text sits (side-by-side columns count once).
  for (const li of page.querySelectorAll('li, .c2-row, .task-ledger-item')) {
    if (!vis(li) || li.querySelector('li')) continue;
    const tops: number[] = [];
    const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!(n.textContent || '').trim() || !vis(n.parentElement!)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.height > 4 && !tops.some((y) => Math.abs(y - r.top) < 6)) tops.push(r.top);
    }
    if (tops.length > 2) out.push({ rule: 'rows-two-lines', what: `${tops.length} lines: ${name(li)}` });
  }

  for (const el of texts) {
    const cs = getComputedStyle(el);
    const cut = (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    if (cut && !el.closest('.c2-tname, .task-ledger-item, [data-task-id]')) out.push({ rule: 'no-clipped-text', what: name(el) });
  }

  if (page.id === 'page-dashboard') {
    const cards = [...page.querySelectorAll('.card, .c2-now')].filter((c) => vis(c) && !c.parentElement!.closest('.card, .c2-now'));
    if (cards.length > 1) out.push({ rule: 'one-card', what: `${cards.length} cards: ${cards.map(name).join(', ')}` });
  }

  const moreRe = /^(\+\s?\d+\s+more|see (all|more)|show (all|more)|view all|all \d+|\d+ more)\b/i;
  for (const sec of page.querySelectorAll('section, .panel')) {
    if (!vis(sec) || sec.querySelector('section, .panel')) continue;
    const mores = [...sec.querySelectorAll('button, a')].filter((b) => vis(b) && moreRe.test((b.textContent || '').trim()));
    if (mores.length > 1) out.push({ rule: 'one-see-more', what: `${mores.length} in ${name(sec)}` });
  }

  const code = /\b[A-Z]{2,}\d{2,}[A-Z0-9]*\b/;
  const year = new RegExp(`\\b${args.year}\\b`);
  for (const el of texts) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    if (code.test(own)) out.push({ rule: 'no-course-codes', what: `${own.match(code)![0]} in ${name(el)}` });
    if (year.test(own)) out.push({ rule: 'no-current-year', what: name(el) });
    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (fam !== 'Lexend') out.push({ rule: 'only-lexend', what: `${fam}: ${name(el)}` });
    const px = Math.round(parseFloat(cs.fontSize));
    if (!args.sizes.includes(px)) out.push({ rule: 'font-sizes', what: `${px}px: ${name(el)}` });
  }

  // The accent (and its soft wash) only on "now": the live strip block, the now card, the now mark.
  const root = getComputedStyle(document.documentElement);
  const probe = document.createElement('i'); document.body.appendChild(probe);
  const rgb = (v: string) => { probe.style.color = v; return getComputedStyle(probe).color; };
  const acc = [rgb(root.getPropertyValue('--c2-acc').trim()), rgb(root.getPropertyValue('--c2-acc-soft').trim())];
  probe.remove();
  for (const el of page.querySelectorAll('*')) {
    if (!vis(el) || el.closest('.c2-blk.live, .c2-now, .c2-nowmark, .palette-swatch, .theme-swatch')) continue;
    const cs = getComputedStyle(el);
    if (acc.includes(cs.backgroundColor) || (acc.includes(cs.color) && (el.textContent || '').trim())) out.push({ rule: 'accent-only-now', what: name(el) });
  }

  // One entry per rule + element is enough to read.
  const seen = new Set<string>();
  return out.filter((h) => { const k = h.rule + h.what; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function visit(browser: Browser, baseURL: string | undefined, run: { t: string; w: number; m: string }) {
  const h = run.w > 800 ? (run.w > 1500 ? 1080 : 800) : 852;
  const ctx = await browser.newContext({ baseURL, viewport: { width: run.w, height: h }, isMobile: run.w < 800, hasTouch: run.w < 800, timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(MESSY_AT) });
  await page.addInitScript((d) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v as string);
  }, { ...MESSY_DESK, ...MESSY_FLAGS, cos_accent: run.t, cos_theme: run.m });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await page.waitForTimeout(800);
  for (const [screen, nav] of Object.entries(SCREENS)) {
    await page.evaluate((x) => (window as any).navigate(x), nav);
    await page.waitForTimeout(450);   // page fade-in
    const hits = await page.evaluate(collect, { sizes: SIZES, year: MESSY_AT.slice(0, 4) });
    for (const x of hits) found[screen].push({ rule: x.rule as Rule, where: `${run.w}px ${run.t} ${run.m === 'midnight-ink' ? 'dark' : 'light'}: ${x.what}` });
  }
  await ctx.close();
}

// A failing test restarts the worker, which would run beforeAll again; the results are kept for this run
// (keyed by the runner's process) so the screens load once.
const CACHE = path.join(os.tmpdir(), `cd-polish-${process.ppid}.json`);

test.describe('polish: the messy desk stays calm', () => {
  test.beforeAll(async ({ browser }, info) => {
    // Each run sets its own width and touch, so one project is enough.
    test.skip(info.project.name !== 'chromium-desktop', 'runs once, in chromium-desktop');
    if (fs.existsSync(CACHE)) { Object.assign(found, JSON.parse(fs.readFileSync(CACHE, 'utf8'))); return; }
    test.setTimeout(RUNS.length * 30_000);
    for (const run of RUNS) await visit(browser, info.project.use.baseURL, run);
    fs.writeFileSync(CACHE, JSON.stringify(found));
  });

  for (const screen of Object.keys(SCREENS) as Screen[]) {
    for (const rule of RULES) {
      test(`${screen}: ${rule}`, async () => {
        const pending = PENDING[screen]?.[rule];
        if (pending) test.fail(true, `not calm yet; ${pending} makes it pass`);
        const hits = found[screen].filter((h) => h.rule === rule).map((h) => h.where);
        expect(hits, `${hits.length} problem(s):\n${[...new Set(hits)].slice(0, 25).join('\n')}`).toEqual([]);
      });
    }
  }
});
