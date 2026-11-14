import { test, expect, Page } from '@playwright/test';

// Today, calmer on a phone: the outcome checks from the spec. Measures what a
// returning student needs at a glance (next class, first task, one attendance
// message, quiet title, no sideways scroll) on three phone widths.

const cls = (subject: string, code: string, time: string, end: string) => ({ subject, code, time, end, type: 'lecture', batches: [] });
const DAY = [cls('LAB DEMP-AI-B2 (VAK) + Data Structures Lab + Web Development Lab Section', 'CS301', '10:00', '12:00'), cls('Probability and Statistics', 'PBST', '12:45', '14:45')];
const every = (d: unknown[]) => ({ 0: d, 1: d, 2: d, 3: d, 4: d, 5: d, 6: d });
const task = (id: string, title: string, dueDate: string, subject: string) => ({ id, subject, title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending' });
// 2026-09-24 is a Thursday; 09:10 on the 24th picks the "Chai first?" greeting.
const AT = '2026-09-24T09:10:00';
const UPCOMING = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-30', '2026-10-02'].map((d, i) => task('u' + i, 'End sem', d, 'Digital Electronics and Microprocessors'));
const LATE = ['2026-09-21', '2026-09-22', '2026-09-23'].map((d, i) => task('o' + i, 'Lab record', d, 'Data Structures'));

async function open(page: Page, w: number, tasks: unknown[], name = 'Maximilian Wellington') {
  await page.setViewportSize({ width: w, height: 812 });
  await page.clock.setFixedTime(new Date(AT));
  await page.addInitScript((seed) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
  }, { cos_profile: { name }, cos_custom_timetable: every(DAY), cos_notified_history: { onb_tt_day: '2026-09-20' }, cos_custom_tasks: tasks });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  return page.locator('#page-dashboard');
}

for (const w of [320, 360, 412]) {
  test.describe(`${w}px`, () => {
    test('a busy day: no sideways scroll, next class and first task on the first screen, every late task shows', async ({ page }) => {
      const today = await open(page, w, [...LATE, ...UPCOMING]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(today.locator('.desk-greeting')).toBeVisible();
      const lines = await today.locator('.desk-greeting').evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
      expect(lines).toBeLessThanOrEqual(2);
      for (const sel of ['.rail-row', '.task-ledger-item']) {
        const box = await today.locator(sel).first().boundingBox();
        expect(box && box.y + box.height, sel + ' on the first screen').toBeLessThan(812);
      }
      // Every late task shows (never hidden by the cap); the rest says exactly how many.
      await expect(today.locator('.task-ledger-item')).toHaveCount(3);
      await expect(today.locator('.dash-more-link', { hasText: 'more task' })).toContainText('+5 more tasks');
      // The long class title is shortened on screen; the full name stays in the title and for screen readers.
      const name = today.locator('.rail-name').first();
      expect(((await name.evaluate((e) => e.firstChild?.textContent)) || '').length).toBeLessThan(40);
      await expect(name).toHaveAttribute('title', /Web Development Lab Section/);
      await expect(name.locator('.sr-only')).toHaveText(/Web Development Lab Section/);
      // Quick add stays in flow and reachable.
      await expect(today.locator('#quick-add-input')).toBeAttached();
    });

    test('reading order: title, class rail, then tasks; attendance says itself at most once', async ({ page }) => {
      const today = await open(page, w, [...LATE, ...UPCOMING]);
      const order = await page.evaluate(() => {
        const q = (s: string) => document.querySelector('#page-dashboard ' + s)!;
        const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return before(q('.desk-greeting'), q('.day-rail')) && before(q('.day-rail'), q('.task-ledger-item'));
      });
      expect(order).toBe(true);
      const text = await today.innerText();
      expect((text.match(/below your|under your/g) || []).length).toBeLessThanOrEqual(1);
    });

    test('the quip shows on a calm day and never above late work', async ({ page }) => {
      const calm = await open(page, w, UPCOMING);
      await expect(calm.locator('.desk-quip')).toHaveText('Chai first?');
      await expect(calm.locator('.desk-greeting')).not.toContainText('Chai');
      // Plain task rows are two lines: a long subject is cut, never a third line.
      await expect(calm.locator('.task-ledger-item')).toHaveCount(3);
      for (const h of await calm.locator('.task-ledger-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThan(90);
    });
  });
}

test('late work: no quip above it', async ({ page }) => {
  const today = await open(page, 360, LATE);
  await expect(today.locator('.desk-quip')).toHaveCount(0);
});
