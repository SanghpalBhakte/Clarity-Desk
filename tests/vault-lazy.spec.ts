import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: STUDY VAULT SCREENS LOAD FROM vault-ui.js
// ==================================================================
// The Vault tab shows "Loading…" and then draws its screens from a lazy
// file. Search, add a link and open the add menu work from there, the
// Briefing tab never waits for it, and all of it works with no network once
// the app has been opened (the file is precached).
// Run: npx playwright test tests/vault-lazy.spec.ts
// ==================================================================

const VAULT = [{ subject: 'Physics', code: 'PHY', color: '#394B63', resources: [] }];

async function open(page: Page, hash = '#links') {
  await page.addInitScript((v) => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
    if (!localStorage.getItem('cos_custom_links')) localStorage.setItem('cos_custom_links', JSON.stringify(v));
  }, VAULT);
  await page.goto('/' + hash, { waitUntil: 'domcontentloaded' });
}

const links = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('cos_custom_links') || '[]'));

async function addLinkAndSearch(page: Page) {
  await page.waitForSelector('#link-card-0');
  await page.evaluate(() => (window as any).openVaultAddMenu());
  await expect(page.locator('#vault-add-backdrop')).toBeVisible();
  await page.evaluate(() => (window as any).closeVaultAddMenu());
  await page.evaluate(() => (window as any).addLinkResource(0));
  await page.locator('#lrm-label').fill('Optics notes');
  await page.locator('#lrm-url').fill('https://example.com/optics');
  await page.evaluate(() => (window as any).saveLinkResource(0, null));
  await expect.poll(async () => (await links(page))[0].resources.length).toBe(1);
  await page.evaluate(() => (window as any).vaultSearch('zzz-no-match'));
  await expect(page.locator('#vault-grid')).not.toContainText('Optics notes');
  await page.evaluate(() => (window as any).vaultSearch('optics'));
  await expect(page.locator('#vault-grid')).toContainText('Optics notes');
}

test('the Vault tab loads its screens, then add, save and search work', async ({ page }) => {
  await open(page);
  await addLinkAndSearch(page);
});

test('the Vault tab shows "Loading…" until its file arrives', async ({ page }) => {
  // Hold the file back so "Loading…" is on screen long enough to see.
  let release: () => void = () => {};
  const held = new Promise<void>(r => { release = r; });
  await page.route('**/vault-ui.js', async route => { await held; await route.continue(); });
  await open(page, '#links');
  await expect(page.locator('#resources-subtab-content')).toContainText('Loading…');
  release();
  await page.waitForSelector('#link-card-0');
});

test('the Briefing tab draws at once, even while the Vault file is held back', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>(r => { release = r; });
  await page.route('**/vault-ui.js', async route => { await held; await route.continue(); });
  await open(page, '#summary');
  await expect(page.locator('#page-resources .page-title')).toHaveText('Daily Briefing');
  release();
});

test('the same works with no network (vault-ui.js is precached)', async ({ context, page }) => {
  await open(page);
  await page.waitForSelector('#link-card-0');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await addLinkAndSearch(page);
  } finally {
    await context.setOffline(false);
  }
});

test('a student with saved Vault items gets the file at idle, before opening the tab', async ({ page }) => {
  let asked = false;
  await page.route('**/vault-ui.js', async route => { asked = true; await route.continue(); });
  await open(page, '#today');
  await expect.poll(() => asked, { timeout: 8000 }).toBe(true);
});

test('a student with an empty Vault does not fetch the file on other tabs', async ({ page }) => {
  let asked = false;
  await page.route('**/vault-ui.js', async route => { asked = true; await route.continue(); });
  await page.addInitScript(() => { localStorage.setItem('cos_custom_links', '[]'); });
  await open(page, '#today');
  await page.waitForTimeout(6000);
  expect(asked).toBe(false);
});
