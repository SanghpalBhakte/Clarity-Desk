import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: OFFLINE BASELINE (offline-first sync plan, Task 1)
// ==================================================================
// Locks in today's behaviour before the sync changes: with the network
// off, every non-AI page renders and a task added offline survives a
// reload. Run: npx playwright test tests/offline-sync.spec.ts
// ==================================================================

const PAGES = ['dashboard', 'timetable', 'subjects', 'assignments', 'calendar', 'notices', 'resources', 'links', 'summary', 'settings', 'review'];

async function openAppOnline(page: Page) {
  await page.addInitScript(() => {
    // Seed once only, so a reload keeps whatever the app saved.
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  // Wait until the service worker is active and has precached the shell.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const w = reg.active;
    if (w && w.state !== 'activated') {
      await new Promise<void>((resolve) => {
        w.addEventListener('statechange', () => { if (w.state === 'activated') resolve(); });
      });
    }
  });
  // Reload once so the page is SW-controlled and everything it needs is cached.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function' && !!navigator.serviceWorker.controller);
}

async function quickAdd(page: Page, title: string) {
  await page.evaluate((t) => {
    const w = window as any;
    w.navigate('dashboard');
    const input = [...document.querySelectorAll('#quick-add-input')].find((el: any) => el.offsetParent !== null) as HTMLInputElement | undefined
      || document.getElementById('quick-add-input') as HTMLInputElement;
    input.value = t;
    w.handleQuickAdd();
    if (w._qaFinalize) w._qaFinalize();   // no date in the text: save without a due date
  }, title);
}

const storedTitles = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]') as any[]).map((t) => t.title));

test.describe('Clarity Desk offline baseline', () => {
  test('adds a task while offline and keeps it after reload', async ({ context, page }) => {
    await openAppOnline(page);
    await context.setOffline(true);
    try {
      await quickAdd(page, 'Offline baseline task');
      expect(await storedTitles(page)).toContain('Offline baseline task');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).navigate === 'function');
      expect(await storedTitles(page)).toContain('Offline baseline task');
      await page.evaluate(() => (window as any).navigate('assignments'));
      await expect(page.locator('#page-assignments')).toContainText('Offline baseline task');
    } finally {
      await context.setOffline(false);
    }
  });

  test('every non-AI page renders offline', async ({ context, page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await openAppOnline(page);
    await context.setOffline(true);
    const empty: string[] = [];
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof (window as any).navigate === 'function');
      for (const p of PAGES) {
        const len = await page.evaluate(async (name) => {
          (window as any).navigate(name);
          await new Promise((r) => setTimeout(r, 150));
          const el = document.querySelector('.section-page.active') as HTMLElement | null;
          return el ? (el.innerText || '').trim().length : 0;
        }, p);
        if (len === 0) empty.push(p);
      }
    } finally {
      await context.setOffline(false);
    }
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(empty, `pages that rendered empty offline: ${empty.join(', ')}`).toEqual([]);
  });

  test('edits made offline are still there after coming back online', async ({ context, page }) => {
    await openAppOnline(page);
    await context.setOffline(true);
    await quickAdd(page, 'Edit made offline');
    expect(await storedTitles(page)).toContain('Edit made offline');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(500);
    expect(await storedTitles(page)).toContain('Edit made offline');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof (window as any).navigate === 'function');
    expect(await storedTitles(page)).toContain('Edit made offline');
  });
});
