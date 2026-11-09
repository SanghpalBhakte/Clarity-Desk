import { test, expect, Page } from '@playwright/test';

// Tasks page with long subject names: nothing overlaps, the row meta stays on
// one line, a task with a subject but no code is still listed under By
// subject, and the add bar shows no square ring inside its rounded edge.

const LONG = 'Artificial Intelligence and Machine Learning Laboratory Practicals';
const TASKS = [
  { id: 'c-1', subject: LONG, code: LONG, title: 'Lab record', taskType: 'lab', dueDate: '2026-12-02', priority: 'high', status: 'pending' },
  { id: 'c-2', subject: 'Engineering Mathematics III (Probability and Statistics)', code: '', title: 'Unit test prep', taskType: 'exam', dueDate: '2026-12-03', priority: 'low', status: 'pending' },
  { id: 'c-3', subject: 'DS', code: 'DS', title: 'Short one', taskType: 'assignment', dueDate: '2026-12-01', priority: 'medium', status: 'pending' },
];

async function open(page: Page) {
  await page.addInitScript((t) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_custom_tasks', JSON.stringify(t));
  }, TASKS);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigateTo === 'function');
  await page.evaluate(() => (window as any).navigateTo('assignments'));
  await expect(page.locator('.tk-subj-pick').first()).toBeAttached();
}

const overlaps = (a: any, b: any) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('long subject names never overlap and every subject is listed', async ({ page }) => {
  await open(page);
  const names = await page.locator('.tk-subj-pick .tk-subj-name').allTextContents();
  expect(names).toContain('Engineering Mathematics III (Probability and Statistics)');
  for (const pick of await page.locator('.tk-subj-pick:visible').all()) {
    const next = pick.locator('.tk-subj-next');
    if (!(await next.count()) || !(await next.isVisible())) continue;
    expect(overlaps(await pick.locator('.tk-subj-name').boundingBox(), await next.boundingBox())).toBeFalsy();
  }
  for (const meta of await page.locator('#page-assignments .tk-meta').all()) {
    const lines = await meta.evaluate((m) => new Set([...m.children].map((c) => Math.round(c.getBoundingClientRect().top))).size);
    expect(lines).toBe(1);
  }
});

test('typing in the add bar shows no square ring inside the rounded bar', async ({ page }) => {
  await open(page);
  const q = page.locator('.tk-add input[name="q"]');
  await q.focus();
  await page.keyboard.type('CN quiz');
  expect(await q.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('none');
  const ring = await q.evaluate((e) => getComputedStyle(e.closest('form')!).boxShadow);
  expect(ring).not.toBe('none');
});
