import { test, expect, Page } from '@playwright/test';

// First-run tour over the real app: welcome → name → 5 stops on the real
// tabs (phone) or sidebar (laptop) → the timetable card. Also offline.

async function freshWelcome(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('#onboarding-backdrop')).toBeVisible();
}

async function startTour(page: Page, name: string | null) {
  await page.getByRole('button', { name: 'Show me around' }).click();
  if (name) {
    await page.locator('#ob-name').fill(name);
    await page.locator('#ob-name').press('Enter');
  } else {
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await expect(page.locator('.tour-bubble')).toBeVisible();
}

// The lit box sits on the stop's real element, and the bubble is fully on screen.
async function checkStop(page: Page) {
  const measure = () => page.evaluate(() => {
    const spot = document.querySelector('.tour-spot') as HTMLElement;
    const bub = document.querySelector('.tour-bubble') as HTMLElement;
    const target = [...document.querySelectorAll(spot.dataset.target || '')].find(e => (e as HTMLElement).offsetParent !== null) as HTMLElement;
    const s = spot.getBoundingClientRect(), t = target.getBoundingClientRect(), b = bub.getBoundingClientRect();
    return {
      gap: Math.max(Math.abs(s.left - t.left), Math.abs(s.top - t.top), Math.abs(s.right - t.right), Math.abs(s.bottom - t.bottom)),
      inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight,
      text: bub.textContent || ''
    };
  });
  // The spotlight glides between stops (0.25s); wait for it to settle.
  await expect.poll(async () => (await measure()).gap, { timeout: 2000 }).toBeLessThanOrEqual(8);
  const r = await measure();
  expect(r.gap, 'spotlight should sit on its target').toBeLessThanOrEqual(8);
  expect(r.inside, 'bubble should be fully on screen').toBe(true);
  expect(r.text).not.toMatch(/[–—]|\s-\s|seamless|effortless|unlock|journey/i);
  return r.text;
}

test.describe('First-run tour', () => {
  test('phone 390: uses the name, walks the tabs, ends on Add your timetable', async ({ page }) => {
    await freshWelcome(page, 390, 844);
    await startTour(page, 'Riya');
    expect(await checkStop(page)).toContain('Okay Riya, this is Today');
    const titles = ['Your timetable', 'Subjects', 'Tasks', 'Everything else'];
    for (const [i, t] of titles.entries()) {
      if (i === 1) await page.keyboard.press('ArrowRight');
      else await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
      expect(await checkStop(page)).toContain(t);
    }
    await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
    expect(await checkStop(page)).toContain("That's the tour, Riya!");
    await page.getByRole('button', { name: "Let's do it" }).click();
    await expect(page.locator('.tour-bubble')).toHaveCount(0);
    await expect(page.locator('#add-tt-choice-backdrop')).toBeVisible();
  });

  test('phone 320 without a name: every bubble stays on screen', async ({ page }) => {
    await freshWelcome(page, 320, 640);
    await startTour(page, null);
    expect(await checkStop(page)).toContain('This is Today');
    for (let i = 0; i < 5; i++) {
      await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
      await checkStop(page);
    }
    expect(await page.locator('.tour-bubble').textContent()).toContain("That's the tour!");
  });

  test('laptop 1280: points at the sidebar, follows it when collapsed', async ({ page }) => {
    await freshWelcome(page, 1280, 800);
    await startTour(page, 'Riya');
    await checkStop(page);
    expect(await page.locator('.tour-spot').getAttribute('data-target')).toBe('#sidebar-dashboard');
    await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
    expect(await page.locator('.tour-spot').getAttribute('data-target')).toBe('#sidebar-timetable');
    await page.evaluate(() => (window as any).toggleSidebar());
    await page.waitForTimeout(400);
    await checkStop(page);
    for (let i = 0; i < 3; i++) await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
    expect(await checkStop(page)).toContain('Notices, calendar, study vault and settings are all in this sidebar.');
  });

  test('Escape closes the tour and the welcome never comes back', async ({ page }) => {
    await freshWelcome(page, 390, 844);
    await startTour(page, null);
    await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour-bubble')).toHaveCount(0);
    await expect(page.locator('.tour-spot')).toHaveCount(0);
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.locator('#onboarding-backdrop')).toHaveCount(0);
    await expect(page.locator('.setup-first-btn')).toBeVisible();
  });

  test('works offline after one online visit', async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator('#onboarding-backdrop')).toBeVisible();
      await startTour(page, 'Riya');
      expect(await checkStop(page)).toContain('Okay Riya, this is Today');
    } finally {
      await context.setOffline(false);
    }
  });
});
