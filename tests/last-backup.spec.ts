import { test, expect } from '@playwright/test';

// Settings → Backup shows when this phone last made a Backup file (#434).
test('"Last backup" starts at never, shows the day after a Backup, and survives a reload', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cos_onboarding_dismissed', 'true'));
  await page.goto('/');
  await page.evaluate(() => (window as any).navigate('settings'));
  const line = page.locator('#settings-last-backup');
  await expect(line).toHaveText('Last backup: never');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export Desk Backup/ }).click();
  const file = await download;
  await expect(line).toHaveText(/^Last backup: \d{1,2} \w{3} \d{4}$/);
  const backup = JSON.parse(await (await import('fs')).promises.readFile((await file.path())!, 'utf8'));
  expect(JSON.stringify(backup)).not.toContain('cos_last_backup');
  expect(Object.keys(backup)).not.toContain('lastBackup');

  await page.reload();
  await page.evaluate(() => (window as any).navigate('settings'));
  await expect(line).toHaveText(/^Last backup: \d{1,2} \w{3} \d{4}$/);
});
