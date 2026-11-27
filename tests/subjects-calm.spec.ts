import { test, expect } from '@playwright/test';
import { MESSY_DESK, MESSY_FLAGS, MESSY_AT } from './messy-desk.mjs';

// Subjects on the messy desk (#462): At risk then Safe, each row the % first and one status,
// "At risk" said once per row, and a tap opens the subject's full detail.

test.use({ viewport: { width: 393, height: 852 }, timezoneId: 'Asia/Kolkata' });

test('Subjects: At risk then Safe, one status per row, tap opens the full detail', async ({ page }) => {
  await page.clock.install({ time: new Date(MESSY_AT) });
  await page.addInitScript((d) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v as string);
  }, { ...MESSY_DESK, ...MESSY_FLAGS });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await page.evaluate(() => (window as any).navigate('subjects'));
  const sj = page.locator('#page-subjects');

  await expect(sj.locator('.sj-group-h')).toHaveText(['At risk', 'Safe']);
  await expect(sj.locator('.sj-sum')).toHaveText(/^\d+% overall · \d+ at risk$/);
  const risk = sj.locator('.sj-group').first().locator('.sj-row');
  for (const row of await risk.all()) {
    await expect(row.locator('.sj-pct')).toHaveText(/^\d+%$/);
    await expect(row.locator('small')).toHaveText(/^(Lab a|A)t risk · need \d+$/);
    expect((await row.innerText()).match(/at risk/gi)?.length, 'said once').toBe(1);
  }
  for (const row of await sj.locator('.sj-group').nth(1).locator('.sj-row').all()) {
    await expect(row.locator('small')).toHaveText(/^Safe · (can miss \d+|on the line)$/);
  }
  await expect(sj).not.toContainText('MGM51OEL115');

  // The rounded-down row figure never hides the exact one: the subject's page shows it.
  const first = risk.first();
  const full = await first.locator('.sj-title').evaluate((b) => (b as HTMLElement).dataset.full || b.textContent || '');
  await first.click();
  await expect(sj).toContainText(full.trim());
  await expect(sj).toContainText(/\d+\.\d{2}%/);
});
