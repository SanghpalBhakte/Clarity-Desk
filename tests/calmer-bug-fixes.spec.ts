import { test, expect, type Page } from '@playwright/test';
import { SAMPLE_DESK } from './sample-desk.mjs';

// #455: the small visible bugs from the phone review, on a phone with the
// sample desk. Tuesday 24 Nov 2026: "DS lab record" is 10 days Late, "OS
// quiz" 16 days Late, "Read chapter 4" is a goal. Times are India time, so
// the greeting checks give the same answer on a UTC CI runner.
test.use({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true, timezoneId: 'Asia/Kolkata' });

async function openDesk(page: Page, at = '2026-11-24T15:30:00+05:30', over: Record<string, string> = {}) {
  await page.clock.install({ time: new Date(at) });
  await page.addInitScript(([desk, extra]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries({ ...desk, ...extra })) localStorage.setItem(k, v as string);
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_att_v2_state', JSON.stringify({ mode: 'v2', decidedAt: '2026-09-01T00:00:00Z' }));
  }, [SAMPLE_DESK, over] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigateTo === 'function');
}
const go = (page: Page, where: string) => page.evaluate((w) => (window as any).navigateTo(w), where);

test('Settings tabs sit in the middle of their bar', async ({ page }) => {
  await openDesk(page);
  await go(page, 'settings');
  // Bar and labels measured in one go: the page slides in by 8 px, so separate measurements
  // taken mid-slide disagreed by up to 4 px (a 1-in-5 flake).
  const gaps = await page.evaluate(() => {
    const mid = (el: Element) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
    const nav = document.querySelector('#page-settings .st-nav')!;
    const labels = [...document.querySelectorAll('#page-settings .st-nav-btn .st-nav-short')];
    return ['Profile', 'Classes', 'Reminders'].map((name) => {
      const label = labels.find((l) => l.textContent!.trim() === name)!;
      return Math.abs(mid(label) - mid(nav));
    });
  });
  for (const gap of gaps) expect(gap).toBeLessThan(3);
});

test('Daily Briefing is titled Daily Briefing', async ({ page }) => {
  await openDesk(page);
  await go(page, 'summary');
  await expect(page.locator('#c2-compact-title')).toHaveText('Daily Briefing');
  await expect(page.locator('#c2-lt-title')).toHaveText('Daily Briefing');
});

test('Briefing greeting follows the clock while it stays open', async ({ page }) => {
  await openDesk(page, '2026-11-24T11:50:00+05:30');
  await go(page, 'summary');
  await expect(page.locator('.bf-kicker')).toHaveText('This morning');
  await page.clock.fastForward('20:00');
  await expect(page.locator('.bf-kicker')).toHaveText('This afternoon');
});

test('On a holiday, Late tasks are one line, not break deadlines', async ({ page }) => {
  await openDesk(page, undefined, { cos_holiday: JSON.stringify({ on: true, since: '2026-11-20', until: '2026-12-05', changedAt: 1794100000000 }) });
  await go(page, 'summary');
  const brief = page.locator('#page-resources');
  await expect(brief).toContainText('Deadlines during your break');
  await expect(brief).not.toContainText('DS lab record');
  await expect(brief).not.toContainText('overdue');
  await expect(page.locator('.bf-late')).toHaveText(/2 Late\s*·?\s*Look through/);
});

test('Late tasks are one line, not under Due this week', async ({ page }) => {
  await openDesk(page);
  await go(page, 'summary');
  // The number column (#463): Late is its own row; no late title shows anywhere in it.
  const due = page.locator('.bf-nums');
  await expect(due).not.toContainText('DS lab record');
  await expect(due).not.toContainText('OS quiz');
  await expect(due).not.toContainText('overdue');
  const late = page.locator('.bf-late');
  await expect(late).toHaveText(/^\s*2\s*Late\s*oldest \d+ days?\s*Look through\s*$/);
  await late.getByRole('button', { name: 'Look through' }).click();
  await expect(page.locator('#page-assignments')).toBeVisible();
});

test('"A clear week" only when nothing is Due and nothing is Late', async ({ page }) => {
  const noClasses = JSON.stringify({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });
  await openDesk(page, undefined, { cos_custom_timetable: noClasses });
  await go(page, 'summary');
  await expect(page.locator('.bf-title')).not.toContainText('clear');

  await page.evaluate(() => {
    const tasks = JSON.parse(localStorage.getItem('cos_custom_tasks') || '[]');
    for (const t of tasks) t.status = 'submitted';
    localStorage.setItem('cos_custom_tasks', JSON.stringify(tasks));
  });
  await page.reload();
  await page.waitForFunction(() => typeof (window as any).navigateTo === 'function');
  await go(page, 'summary');
  await expect(page.locator('.bf-title')).toHaveText('A clear week.');
});

test('More sheet lists Settings once and a quiet Sync line', async ({ page }) => {
  await openDesk(page);
  await page.click('#bnav-more');
  const sheet = page.locator('#more-sheet');
  await expect(sheet).toHaveAttribute('aria-hidden', 'false');
  const rows = await sheet.locator('.more-sheet-item strong').allInnerTexts();
  expect(rows.map(r => r.replace(/\s*↗\s*$/, '').trim())).toEqual(['Calendar', 'Study Vault', 'Daily Briefing', 'College portal', 'Settings']);
  await expect(sheet).not.toContainText('Profile and settings');
  await expect(sheet).not.toContainText('Appearance');
  await expect(sheet.locator('#sync-status-btn')).toBeVisible();
  await expect(sheet.locator('#sync-status-btn')).toHaveText(/Sync\s*·?\s*On this phone only/);
  await sheet.locator('[data-nav="settings"]').click();
  await expect(page.locator('#page-settings')).toBeVisible();
});

test('Add topics keeps Preview topics and Cancel in view while typing', async ({ page }) => {
  await openDesk(page);
  await page.evaluate(() => (window as any).showSyllabusPasteModal('Data Structures'));
  await page.locator('#syl-paste-text').click();
  await page.keyboard.type('Stacks\nQueues\nTrees');
  // Android Chrome's keyboard: the page keeps its height, only the visible
  // part shrinks (to about 400px here), so a fixed sheet runs under it.
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => 400 });
    vv.dispatchEvent(new Event('resize'));
  });
  for (const name of ['Preview topics →', 'Cancel']) {
    const box = (await page.locator('#syl-paste-backdrop').getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(400);
  }
});

test('Tasks: a note that repeats the title is hidden, and the date shows once', async ({ page }) => {
  const tasks = JSON.parse(SAMPLE_DESK.cos_custom_tasks);
  tasks.push({ ...tasks[0], id: 't-same', title: 'Submit DS file', description: 'Submit DS file', dueDate: '2026-11-26' });
  tasks.push({ ...tasks[0], id: 't-note', title: 'Viva prep', description: 'Units 1 and 2', dueDate: '2026-11-24' });
  await openDesk(page, undefined, { cos_custom_tasks: JSON.stringify(tasks) });
  await go(page, 'assignments');

  const same = page.locator('#ac-t-same');
  await expect(same.locator('.assignment-title')).toHaveText('Submit DS file');
  await expect(same.locator('.assignment-desc')).toHaveCount(0);
  // One date, in words, in the meta line (#461).
  await expect(same.locator('.tk-due')).toHaveText('Thu');
  await expect(same.locator('.tk-meta')).not.toContainText(/in 2 days|26 Nov/);

  // A real note shows when the row is opened, so a row stays two lines (#461).
  const note = page.locator('#ac-t-note');
  await expect(note.locator('.assignment-desc')).toHaveCount(0);
  await note.locator('.assignment-body').click();
  await expect(note.locator('.assignment-desc')).toHaveText('Units 1 and 2');
  await expect(note.locator('.tk-due')).toHaveText('Today');

  // Late is a status, not a second date: it stays.
  await expect(page.locator('#ac-t-lab .tk-meta')).toContainText('10 days late');
});
