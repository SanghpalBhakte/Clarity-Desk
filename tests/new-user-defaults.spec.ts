import { test, expect } from '@playwright/test';

// A new student starts on Auto (follows the phone's light or dark) with Old Campus (accent "rose").
// A saved light or dark choice always wins, so existing students see no change.

const look = (page: any) => page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.accent, localStorage.getItem('cos_theme'), localStorage.getItem('cos_accent')]);
const ready = async (page: any) => { await page.goto('/'); await page.waitForFunction(() => typeof (window as any).navigate === 'function'); };

test('new student on a dark phone: dark via Auto + Old Campus', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await ready(page);
  expect(await look(page)).toEqual(['midnight-ink', 'rose', 'auto', 'rose']);
  await ctx.close();
});

test('new student on a light phone: light via Auto', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await ready(page);
  expect(await look(page)).toEqual(['paper-slate', 'rose', 'auto', 'rose']);
  await ctx.close();
});

test('Auto follows the phone when it flips, and a saved choice does not', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await ready(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('midnight-ink');
  await page.evaluate(() => (window as any).setTheme('paper-slate'));
  // setTheme paints inside a view transition, so the saved value lands a moment later
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cos_theme'))).toBe('paper-slate');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('cos_theme')])).toEqual(['paper-slate', 'paper-slate']);
  await ctx.close();
});

test('saved choices win: Midnight Ink + Highlighter stay as they were', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('cos_theme', 'midnight-ink'); localStorage.setItem('cos_accent', 'terracotta'); });
  await ready(page);
  expect(await look(page)).toEqual(['midnight-ink', 'terracotta', 'midnight-ink', 'terracotta']);
});

test('old or odd saved settings: legacy maps to a mode, garbage becomes Auto, unknown accent becomes Old Campus', async ({ browser }) => {
  const run = async (theme: string, accent: string | null) => {
    const ctx = await browser.newContext({ colorScheme: 'light' });
    const page = await ctx.newPage();
    await page.addInitScript(([t, a]) => { localStorage.setItem('cos_theme', t as string); if (a) localStorage.setItem('cos_accent', a as string); }, [theme, accent]);
    await ready(page);
    const r = await look(page);
    await ctx.close();
    return r;
  };
  expect(await run('quiet-dark', null)).toEqual(['midnight-ink', 'rose', 'midnight-ink', 'rose']);
  expect(await run('banana', 'nope')).toEqual(['paper-slate', 'rose', 'auto', 'rose']);
  expect(await run('paper-slate', 'lavender')).toEqual(['paper-slate', 'lavender', 'paper-slate', 'lavender']);
});
