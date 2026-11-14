import { test, expect } from '@playwright/test';

// A new student starts on the light desk with Azuki & Matcha (accent "rose"), even if the phone is set to dark.
// A saved choice always wins, so existing students see no change.

const look = (page: any) => page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.accent, localStorage.getItem('cos_theme'), localStorage.getItem('cos_accent')]);

test('new student on a dark phone: light + Azuki & Matcha', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  expect(await look(page)).toEqual(['paper-slate', 'rose', 'paper-slate', 'rose']);
  await ctx.close();
});

test('saved choices win: Midnight Ink + Register stay as they were', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('cos_theme', 'midnight-ink'); localStorage.setItem('cos_accent', 'terracotta'); });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  expect(await look(page)).toEqual(['midnight-ink', 'terracotta', 'midnight-ink', 'terracotta']);
});
