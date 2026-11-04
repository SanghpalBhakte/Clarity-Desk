import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: NOTICES TAB RETIRED
// ==================================================================
// The Notices page could never show anything, so it is gone:
//  - old links (#notices, navigateTo('notices')) open Today;
//  - no "Notices" item is left in the sidebar or the More sheet;
//  - the college portal link lives on as a More sheet row: it opens the
//    saved link, or Settings → Profile when none is saved.
// Run: npm run test:pwa-smoke
// ==================================================================

async function openApp(page: Page, hash = '', channels?: object) {
  await page.addInitScript((ch) => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
    if (ch) localStorage.setItem('cos_notice_channels', JSON.stringify(ch));
  }, channels ?? null);
  await page.goto('/' + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

const activePage = (page: Page) => page.evaluate(() => (window as any).state.currentPage);

test('#notices on a fresh load opens Today', async ({ page }) => {
  await openApp(page, '#notices');
  await expect.poll(() => activePage(page)).toBe('dashboard');
  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
  await expect(page.locator('#page-notices')).toHaveCount(0);
});

test('navigateTo("notices") and a later #notices hash change open Today', async ({ page }) => {
  await openApp(page, '#settings');
  await expect.poll(() => activePage(page)).toBe('settings');
  await page.evaluate(() => (window as any).navigateTo('notices'));
  await expect.poll(() => activePage(page)).toBe('dashboard');
  await page.evaluate(() => (window as any).navigateTo('settings'));
  await page.evaluate(() => { location.hash = '#notices'; });
  await expect.poll(() => activePage(page)).toBe('dashboard');
});

test('no Notices item in the sidebar or the More sheet', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('[data-nav="notices"], #sidebar-notices')).toHaveCount(0);
  await expect(page.locator('.sidebar, #more-sheet').getByText(/^\s*Notices\s*$/)).toHaveCount(0);
  await expect(page.locator('#global-search')).toHaveCount(0);
});

test.describe('College portal row (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('opens the saved link in a new tab', async ({ page, context }) => {
    await openApp(page, '', { whatsappTitle: 'ERP', whatsappUrl: 'https://erp.example.edu/' });
    await page.locator('#bnav-more').click();
    const row = page.getByTestId('college-portal-row');
    await expect(row).toContainText('College portal');
    await context.route('https://erp.example.edu/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
    const [popup] = await Promise.all([context.waitForEvent('page'), row.click()]);
    expect(popup.url()).toBe('https://erp.example.edu/');
  });

  test('with no saved link it opens Settings at Profile', async ({ page }) => {
    await openApp(page);
    await page.locator('#bnav-more').click();
    await page.getByTestId('college-portal-row').click();
    await expect.poll(() => activePage(page)).toBe('settings');
    await expect(page.locator('#st-profile')).toBeVisible();
    await expect(page.locator('#nc-wa-url')).toBeAttached();
  });
});
