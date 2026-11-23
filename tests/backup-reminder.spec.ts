import { test, expect } from '@playwright/test';

// The "Back up now" reminder (#436): one toast on Today for a student who is
// not signed in and has real data; the button makes a Backup; not again.
const seed = ({ signedIn, attChoiceMade }: { signedIn: boolean; attChoiceMade: boolean }) => {
  if (sessionStorage.getItem('__seeded')) return;
  sessionStorage.setItem('__seeded', '1');
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  localStorage.setItem('cos_onboarding_dismissed', 'true');
  localStorage.setItem('cos_first_seen', JSON.stringify(day(10)));
  const att: Record<string, Record<string, string>> = {};
  for (let i = 1; i <= 4; i++) att[day(i)] = { A_0900: 'attended', B_1000: 'attended', C_1100: 'skipped' };
  localStorage.setItem('cos_attendance', JSON.stringify(att));
  if (signedIn) localStorage.setItem('cos_cloud_signed_in', 'true');
  // Already chose attendance numbers, so that one-time window does not open.
  if (attChoiceMade) localStorage.setItem('cos_att_v2_state', JSON.stringify({ mode: 'v2', decidedAt: new Date().toISOString() }));
};

test('shows once on Today, "Back up now" downloads a Backup, and it does not come back', async ({ page }) => {
  await page.addInitScript(seed, { signedIn: false, attChoiceMade: true });
  await page.goto('/');
  const toast = page.locator('.toast-line1', { hasText: 'Everything here is saved only on this phone.' });
  await expect(toast).toBeVisible({ timeout: 10_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await download;
  await page.evaluate(() => (window as any).navigate('settings'));
  await expect(page.locator('#settings-last-backup')).toHaveText(/^Last backup: \d/);

  // Looked at once, not waited on: a waiting check would pass when a toast fades.
  await page.reload();
  await page.waitForTimeout(6500);
  expect(await toast.count()).toBe(0);
});

test('waits while another window is open (here the one-time attendance window)', async ({ page }) => {
  await page.addInitScript(seed, { signedIn: false, attChoiceMade: false });
  await page.goto('/');
  await expect(page.locator('#att-v2-preview-backdrop')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(6500);
  expect(await page.locator('.toast-line1', { hasText: 'Everything here is saved only on this phone.' }).count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('cos_backup_nudge'))).toBeNull();
});

// Sign-in loads after the reminder's moment on a slow phone: the saved
// "signed in last time" flag must hold it back. (Once sign-in loads and says
// signed out, the flag turns false and the reminder may come another day.)
test('no reminder for a student who was signed in, before sign-in has loaded', async ({ page }) => {
  await page.route('https://www.gstatic.com/firebasejs/**', (r) => r.abort());
  await page.addInitScript(seed, { signedIn: true, attChoiceMade: true });
  await page.goto('/');
  await page.waitForTimeout(6500);
  expect(await page.locator('.toast-line1', { hasText: 'Everything here is saved only on this phone.' }).count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('cos_backup_nudge'))).toBeNull();
});
