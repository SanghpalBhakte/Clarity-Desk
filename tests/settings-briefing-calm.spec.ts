import { test, expect, Page } from '@playwright/test';
import { MESSY_DESK, MESSY_FLAGS, MESSY_AT } from './messy-desk.mjs';

// Settings and the Daily Briefing on the messy desk (#463): short labels, no "01" numbers,
// no course codes; the Briefing is a number column with Late as its own single row.

test.use({ viewport: { width: 393, height: 852 }, timezoneId: 'Asia/Kolkata' });

async function open(page: Page, where: string) {
  await page.clock.install({ time: new Date(MESSY_AT) });
  await page.addInitScript((d) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v as string);
  }, { ...MESSY_DESK, ...MESSY_FLAGS });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await page.evaluate((w) => (window as any).navigate(w), where);
}

test('Settings: short labels, no section numbers, no course codes', async ({ page }) => {
  await open(page, 'settings');
  const st = page.locator('#page-settings');
  for (const [id, label] of [['s-name', 'Name'], ['s-roll', 'Roll no.'], ['s-college', 'College'], ['s-branch', 'Branch'], ['s-year', 'Year'], ['s-batch', 'Batch']]) {
    await expect(st.locator(`label[for="${id}"]`)).toHaveText(label);
  }
  await expect(st.locator('.st-num')).toHaveCount(0);
  await expect(st).not.toContainText(/\b0[1-6]\b/);
  for (const code of ['MGM51OEL115', 'CS301', 'EC303', 'CS305L']) await expect(st).not.toContainText(code);
  // The fields still save as before.
  await st.locator('#s-college').fill('New College');
  await st.locator('#s-college').blur();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cos_profile') || '{}').college)).toBe('New College');
});

test('Briefing: one number and one line per fact; Late is one row', async ({ page }) => {
  await open(page, 'summary');
  const nums = page.locator('.bf-nums .bf-num');
  await expect(nums.first().locator('.bf-n')).toHaveText(/^\d+%$/);
  await expect(nums.first()).toContainText('Overall');
  const late = page.locator('.bf-nums .bf-late');
  await expect(late).toHaveCount(1);
  await expect(late).toHaveText(/^\s*\d+\s*Late\s*oldest \d+ days\s*Look through\s*$/);
  for (const row of await nums.all()) {
    const lines = await row.locator('.bf-num-main').evaluate((m) => new Set([...m.children].map((c) => Math.round(c.getBoundingClientRect().top))).size);
    expect(lines).toBeLessThanOrEqual(2);
  }
  await expect(page.locator('#page-resources')).not.toContainText('MGM51OEL115');
  await expect(page.locator('#page-resources')).not.toContainText(/\b2026\b/);
});
