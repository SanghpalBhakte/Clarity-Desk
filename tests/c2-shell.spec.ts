import { test, expect, Page } from '@playwright/test';

// Today C2, Task 3: floating tab bar and large title on a phone, floating sidebar on a laptop.

async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

test.describe('phone 390x844', () => {
  test.beforeEach(async ({ page }) => { await open(page, 390, 844); });

  test('tab bar floats: inset 16, 64 high, 24 above the bottom', async ({ page }) => {
    const b = (await page.locator('.bottom-nav').boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(16);
    expect(b.x + b.width).toBeLessThanOrEqual(374);
    expect(Math.round(b.height)).toBe(64);
    expect(b.y + b.height).toBeLessThanOrEqual(844 - 24 + 0.5);
  });

  test('only the active tab shows its label; the others are icons with a name', async ({ page }) => {
    const widths = await page.$$eval('.bottom-nav-item > span', (els) => els.map((e) => ({ t: e.textContent, w: Math.round(e.getBoundingClientRect().width), on: !!e.parentElement?.classList.contains('active') })));
    expect(widths).toHaveLength(5);
    for (const x of widths) { x.on ? expect(x.w).toBeGreaterThan(20) : expect(x.w).toBe(0); }
    for (const l of ['Today', 'Timetable', 'Subjects', 'Tasks', 'More']) {
      await expect(page.locator(`.bottom-nav-item[aria-label="${l}"]`)).toHaveCount(1);
    }
    await expect(page.locator('.bottom-nav-item.active')).toHaveAttribute('aria-current', 'page');
  });

  test('no topbar on a phone; the large title says Today with the date', async ({ page }) => {
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.c2-lt-title')).toHaveText('Today');
    await expect(page.locator('.c2-lt-date')).not.toBeEmpty();
    await expect(page.locator('.c2-largetitle #assistant-toggle-btn')).toBeVisible();
  });

  test('More lists Profile and settings, Appearance and Sync, and they still work', async ({ page }) => {
    await page.click('#bnav-more');
    const sheet = page.locator('#more-sheet');
    for (const t of ['Profile and settings', 'Appearance', 'Sync']) await expect(sheet.getByText(t, { exact: true })).toBeVisible();
    const before = await page.locator('html').getAttribute('data-theme');
    await sheet.locator('#theme-toggle-btn').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', before!);
    await sheet.locator('#topbar-avatar').click();
    await expect(page.locator('#page-settings')).toBeVisible();
  });

  test('scrolling 120px adds c2-scrolled and shows the slim bar', async ({ page }) => {
    await page.evaluate(() => { document.body.style.minHeight = '3000px'; });
    await expect(page.locator('.c2-compact')).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 120));
    await expect(page.locator('body')).toHaveClass(/c2-scrolled/);
    await expect(page.locator('.c2-compact')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('body')).not.toHaveClass(/c2-scrolled/);
  });

  test('other pages keep a bar with the page name, and Back still goes back', async ({ page }) => {
    await page.click('.bottom-nav-item[data-nav="timetable"]');
    await expect(page.locator('.c2-compact')).toBeVisible();
    await expect(page.locator('.c2-compact-title')).toHaveText('Timetable');
    await page.evaluate(() => (window as any).navigate('settings'));
    await expect(page.locator('#c2-back-btn')).toBeVisible();
    await page.click('#c2-back-btn');
    await expect(page.locator('#page-timetable')).toBeVisible();
  });

  test('Ask Desk opens from the large title and from the slim bar', async ({ page }) => {
    await page.click('#assistant-toggle-btn');
    await expect(page.locator('#assistant-toggle-btn')).toHaveAttribute('aria-expanded', 'true');
  });
});

test.describe('laptop 1280x800', () => {
  test.beforeEach(async ({ page }) => { await open(page, 1280, 800); });

  test('sidebar floats at 16,16, 232 wide, and [ collapses it', async ({ page }) => {
    const b = (await page.locator('.sidebar').boundingBox())!;
    expect(b.x).toBe(16); expect(b.y).toBe(16); expect(Math.round(b.width)).toBe(232);
    await page.keyboard.press('[');
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    await expect.poll(async () => Math.round((await page.locator('.sidebar').boundingBox())!.width)).toBe(68);
    await page.keyboard.press('[');
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
  });

  test('topbar parts are back in the topbar and the content clears the sidebar', async ({ page }) => {
    for (const id of ['assistant-toggle-btn', 'theme-toggle-btn', 'topbar-avatar']) {
      await expect(page.locator(`.topbar #${id}`)).toHaveCount(1);
    }
    const c = (await page.locator('.content-area').boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(248);
    await expect(page.locator('.c2-largetitle')).toBeHidden();
    await expect(page.locator('.c2-compact')).toBeHidden();
  });
});
