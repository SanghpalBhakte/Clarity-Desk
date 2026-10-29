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

  test('laptop: the count skips no numbers when a stop is missing', async ({ page }) => {
    await freshWelcome(page, 1280, 800);
    await page.addStyleTag({ content: '#sidebar-subjects { display: none !important; }' });
    await startTour(page, null);
    const counts: string[] = [];
    for (let i = 0; i < 4; i++) {
      counts.push((await page.locator('.tour-count').textContent()) || '');
      await page.locator('.tour-bubble').getByRole('button', { name: 'Next' }).click();
    }
    expect(counts).toEqual(['1 of 4', '2 of 4', '3 of 4', '4 of 4']);
  });

  test('laptop: the spotlight finds its item again after the page redraws it', async ({ page }) => {
    await freshWelcome(page, 1280, 800);
    await startTour(page, null);
    await checkStop(page);
    await page.evaluate(() => {
      const old = document.querySelector('#sidebar-dashboard') as HTMLElement;
      const fresh = old.cloneNode(true) as HTMLElement;
      fresh.style.marginTop = '48px';
      old.replaceWith(fresh);
    });
    await checkStop(page);
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

  test('320 phone with a 40 letter name: tour title and greeting stay on screen', async ({ page }) => {
    await freshWelcome(page, 320, 640);
    const long = 'Aadhyaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await startTour(page, long);
    await checkStop(page);
    const fits = (sel: string) => page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement;
      const r = el.getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth + 1 && r.right <= innerWidth + 1;
    }, sel);
    expect(await fits('.tour-title')).toBe(true);
    await page.keyboard.press('Escape');
    expect(await fits('.desk-greeting')).toBe(true);
  });

  test('Tab stays inside the tour bubble, and focus comes back after', async ({ page }) => {
    await freshWelcome(page, 390, 844);
    await startTour(page, null);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement?.closest('.tour-bubble'))).toBe(true);
    }
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.tour-bubble'))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.activeElement !== null && document.activeElement.isConnected)).toBe(true);
  });

  test('a crafted lab group name runs no code when tapped', async ({ page }) => {
    const evil = "x');window.__pwn=1;('";
    await page.addInitScript((evil) => {
      if (sessionStorage.getItem('s')) return;
      const lab = (b: string) => ({ subject: 'DS Lab', code: 'DSL', time: '23:00', end: '23:50', type: 'lab', batches: [b] });
      const t: any = {}; for (let i = 0; i < 7; i++) t[i] = [lab(evil), lab('B"2')];
      localStorage.setItem('cos_onboarding_dismissed', 'true');
      localStorage.setItem('cos_custom_timetable', JSON.stringify(t));
      sessionStorage.setItem('s', '1');
    }, evil);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('.setup-ask-actions button', { hasText: 'x' }).first().click();
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cos_profile') || '{}').batch)).toBe(evil);
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
