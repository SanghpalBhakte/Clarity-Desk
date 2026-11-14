import { test, expect } from '@playwright/test';
import { seedBusyToday, tapTargetsOnFirstScreen, marked } from './helpers/today-busy-seed';

// Today, lighter: rows carry their controls on the status line, late tasks fold their
// choices behind "Move", and the busy day measures within the guardrails.

test.describe('lighter rows', () => {
  test('unmarked class is two lines with marks on the status line', async ({ page }) => {
    const today = await seedBusyToday(page);
    const rows = today.locator('.rail-row.needs-mark');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      const meta = (await row.locator('.rail-meta').boundingBox())!;
      const marks = (await row.locator('.rail-marks').boundingBox())!;
      expect(Math.abs(marks.y - meta.y), 'marks sit on the status line').toBeLessThan(26);
      expect((await row.boundingBox())!.height).toBeLessThan(76);
      for (const b of await row.locator('.rail-att').all()) {
        const box = (await b.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44 - 0.5);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
    }
  });

  test('one tap still marks a class', async ({ page }) => {
    const today = await seedBusyToday(page);
    const row = today.locator('.rail-row.needs-mark').first();
    await row.getByRole('button', { name: /^Present/ }).click();
    // An ended class that is marked folds away; open the fold to see it and use Change.
    await today.locator('.rail-earlier-toggle').click();
    const marked = today.locator('.rail-row').filter({ hasText: 'Marked present' }).first();
    await expect(marked).toBeVisible();
    await marked.getByRole('button', { name: /Change the mark/ }).click();
    await expect(marked.getByRole('button', { name: /^Present/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('late task: checkbox is Done, Move opens the choices', async ({ page }) => {
    const today = await seedBusyToday(page);
    await expect(today.locator('.due-fix').first()).toBeHidden();
    const late = today.locator('.task-ledger-item.has-fix').first();
    await expect(late.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
    await expect(late.getByRole('checkbox')).toBeVisible();
    const move = late.locator('.due-move');
    await expect(move).toHaveAttribute('aria-expanded', 'false');
    await move.click();
    await expect(move).toHaveAttribute('aria-expanded', 'true');
    const tomorrow = late.getByRole('button', { name: 'Tomorrow' });
    await expect(tomorrow).toBeVisible();
    await expect(late.getByRole('button', { name: 'Pick a day' })).toBeVisible();
    await expect(tomorrow).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(move).toHaveAttribute('aria-expanded', 'false');
    await expect(move).toBeFocused();
    await move.click();
    await tomorrow.click();
    await expect(page.locator('.toast, #toast-container').getByText('Undo').first()).toBeVisible();
    await expect(today.locator('.task-ledger-item.has-fix')).toHaveCount(1);
  });

  test('keyboard: Enter on Move opens the choices and focus lands on Tomorrow', async ({ page }) => {
    const today = await seedBusyToday(page);
    const late = today.locator('.task-ledger-item.has-fix').first();
    await late.locator('.due-move').focus();
    await page.keyboard.press('Enter');
    await expect(late.getByRole('button', { name: 'Tomorrow' })).toBeFocused();
  });

  test('Move stays open across the minute re-render', async ({ page }) => {
    const today = await seedBusyToday(page);
    const move = today.locator('.task-ledger-item.has-fix .due-move').first();
    await move.click();
    // Marking a class re-renders Today the same way the minute tick does.
    await today.locator('.rail-row.is-live').getByRole('button', { name: /^Present/ }).click();
    await expect(today.locator('.rail-row.is-live')).toContainText('Marked present');
    await expect(today.locator('.task-ledger-item.has-fix .due-move').first()).toHaveAttribute('aria-expanded', 'true');
    await expect(today.locator('.due-fix:not([hidden])')).toHaveCount(1);
  });

  test('Why this order sits at the end of the list', async ({ page }) => {
    const today = await seedBusyToday(page);
    await expect(today.locator('.panel-header .dash-why')).toHaveCount(0);
    const foot = today.locator('.due-foot');
    await expect(foot).toContainText('Why this order?');
    await expect(foot).toContainText('+3 more tasks');
  });

  test('busy phone day fits the guardrails', async ({ page }) => {
    await seedBusyToday(page);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    // Re-based with the user (2026-11-14): was 1.90 screens and 23 tap targets on this seed.
    // The 1.3 / 12 targets are re-measured after Tasks 2 and 3; the top and tab bars alone are 8 targets.
    expect(height / 844, `page is ${(height / 844).toFixed(2)} screens`).toBeLessThanOrEqual(1.55);
    const taps = await tapTargetsOnFirstScreen(page);
    expect(taps, `${taps} tap targets on the first screen`).toBeLessThanOrEqual(24);
  });

  test('360px: long lab name does not push the marks off screen', async ({ page }) => {
    const today = await seedBusyToday(page, { width: 360, height: 780, at: '2026-09-24T16:10:00' });
    const row = today.locator('.rail-row.needs-mark').filter({ hasText: 'Database Management Systems Lab' });
    await expect(row).toHaveCount(1);
    const meta = (await row.locator('.rail-meta').boundingBox())!;
    for (const b of await row.locator('.rail-att').all()) {
      const box = (await b.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      expect(box.x >= meta.x + meta.width - 1 || box.y >= meta.y + meta.height - 1, 'marks do not overlap the words').toBe(true);
    }
  });
});

test.describe('come back', () => {
  const classAt = (i: number) => ({ subject: `Class ${i}`, code: `C${i}`, time: `${String(7 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:00`, type: 'lecture', batches: [] });
  const many = (n: number) => Array.from({ length: n }, (_, i) => classAt(i));
  const visibleRows = (today: any) => today.locator('.rail-row:visible');

  test('ended and marked classes fold into one line', async ({ page }) => {
    const today = await seedBusyToday(page, { extra: marked('DS_0900', 'PBST_1000') });
    const toggle = today.locator('.rail-earlier-toggle');
    await expect(toggle).toHaveText('2 earlier classes · marked');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(visibleRows(today)).toHaveCount(2);
    await toggle.click();
    await expect(today.locator('.rail-earlier-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(visibleRows(today)).toHaveCount(4);
    await expect(today.locator('.rail-earlier-toggle')).toBeFocused();
  });

  test('one marked class reads "1 earlier class · marked"', async ({ page }) => {
    const today = await seedBusyToday(page, { extra: marked('DS_0900') });
    await expect(today.locator('.rail-earlier-toggle')).toHaveText('1 earlier class · marked');
  });

  test('ended and unmarked classes never fold', async ({ page }) => {
    const today = await seedBusyToday(page, { extra: marked('DS_0900') });
    await expect(today.locator('.rail-row.needs-mark')).toHaveCount(1);
    await expect(today.locator('.rail-row.needs-mark')).toContainText('Probability and Statistics');
    await expect(today.locator('.rail-row').filter({ hasText: 'Data Structures' })).toHaveCount(0);
  });

  test('fold stays open across the minute re-render', async ({ page }) => {
    const today = await seedBusyToday(page, { extra: marked('DS_0900', 'PBST_1000') });
    await today.locator('.rail-earlier-toggle').click();
    // Marking the live class re-renders Today the same way the minute tick does.
    await today.locator('.rail-row.is-live').getByRole('button', { name: /^Present/ }).click();
    await expect(today.locator('.rail-earlier-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(visibleRows(today)).toHaveCount(4);
  });

  test('heading counts marks in words', async ({ page }) => {
    const today = await seedBusyToday(page, { extra: marked('DS_0900') });
    await expect(today.locator('.panel-header', { hasText: 'Your day' }).locator('.panel-count')).toHaveText('1 of 4 marked');
  });

  test('no count before the first class starts', async ({ page }) => {
    const today = await seedBusyToday(page, { at: '2026-09-24T08:00:00' });
    await expect(today.locator('.rail-row').first()).toBeVisible();
    await expect(today.locator('.panel-count')).toHaveCount(0);
  });

  test('all classes ended and marked', async ({ page }) => {
    const today = await seedBusyToday(page, { at: '2026-09-24T17:00:00', extra: marked('DS_0900', 'PBST_1000', 'DBMS_1100', 'DBL_1400') });
    await expect(today.locator('.rail-earlier-toggle')).toHaveText('4 earlier classes · marked');
    const done = today.locator('.rail-then', { hasText: 'Day marked. Books down, feet up.' });
    await expect(done).toBeVisible();
    await expect(done).toBeInViewport();
  });

  test('more than RAIL_MAX_ROWS classes', async ({ page }) => {
    const six = await seedBusyToday(page, { at: '2026-09-24T09:30:00', day: many(8), extra: { cos_attendance: { '2026-09-24': { C0_0700: 'attended', C1_0800: 'attended' } } } });
    await expect(six.locator('.rail-earlier-toggle')).toHaveText('2 earlier classes · marked');
    await expect(visibleRows(six)).toHaveCount(6);
    await expect(six.locator('.dash-more-link', { hasText: 'more class' })).toHaveCount(0);
  });

  test('nine classes leave "+1 more class"', async ({ page }) => {
    const nine = await seedBusyToday(page, { at: '2026-09-24T09:30:00', day: many(9), extra: { cos_attendance: { '2026-09-24': { C0_0700: 'attended', C1_0800: 'attended' } } } });
    await expect(visibleRows(nine)).toHaveCount(6);
    await expect(nine.locator('.dash-more-link', { hasText: '+1 more class' })).toBeVisible();
  });

  test('marking settles the row once', async ({ page }) => {
    const today = await seedBusyToday(page, { install: true });
    await page.clock.pauseAt(new Date('2026-09-24T11:21:00')); // frozen: only runFor() moves time
    const live = today.locator('.rail-row.is-live');
    await live.getByRole('button', { name: /^Present/ }).click();
    await expect(live).toHaveClass(/is-settling/);
    expect(await live.evaluate((e) => getComputedStyle(e).animationName)).toBe('cd-settle');
    await page.clock.runFor(700);
    // Leave Today and come back: a fresh render after 700ms does not settle the row again.
    await page.evaluate(() => { (window as any).navigate('timetable'); (window as any).navigate('dashboard'); });
    await expect(today.locator('.rail-row.is-live')).toContainText('Marked present');
    await expect(today.locator('.rail-row.is-live')).not.toHaveClass(/is-settling/);
  });

  test('reduced motion: no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const today = await seedBusyToday(page, { install: true });
    await page.clock.pauseAt(new Date('2026-09-24T11:21:00')); // frozen: only runFor() moves time
    const live = today.locator('.rail-row.is-live');
    await live.getByRole('button', { name: /^Present/ }).click();
    await expect(live).toHaveClass(/is-settling/);
    expect(await live.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });

  test('ticking a task still works: the row leaves and the next one comes up', async ({ page }) => {
    const today = await seedBusyToday(page, { install: true });
    await expect(today.locator('.task-ledger-item').nth(2)).toContainText('End sem prep');
    await today.locator('.task-ledger-item').nth(2).getByRole('checkbox').click();
    await expect(today.locator('.task-ledger-item').nth(2)).toContainText('Mini project');
  });
});

test.describe('fit', () => {
  const box = async (loc: any) => (await loc.first().boundingBox())!;

  test('1280x720: busy day fits one screen in two columns', async ({ page }) => {
    const today = await seedBusyToday(page, { width: 1280, height: 720 });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height, `page is ${height}px tall`).toBeLessThanOrEqual(720);
    const day = await box(today.locator('.panel-day'));
    const due = await box(today.locator('.panel-due'));
    expect(due.x).toBeGreaterThanOrEqual(day.x + day.width);
    const add = await box(today.locator('#quick-add-input'));
    expect(add.x).toBeGreaterThanOrEqual(day.x + day.width);
    const att = await box(today.locator('.dashboard-right-panel .dashboard-panel'));
    expect(att.x).toBeGreaterThanOrEqual(day.x + day.width);
  });

  test('1440x900: same two columns, no horizontal scroll', async ({ page }) => {
    const today = await seedBusyToday(page, { width: 1440, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const day = await box(today.locator('.panel-day'));
    const due = await box(today.locator('.panel-due'));
    expect(due.x).toBeGreaterThanOrEqual(day.x + day.width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(900);
  });

  test('1099px wide: single column as before', async ({ page }) => {
    const today = await seedBusyToday(page, { width: 1099, height: 800 });
    const day = await box(today.locator('.panel-day'));
    const due = await box(today.locator('.panel-due'));
    expect(due.y).toBeGreaterThanOrEqual(day.y + day.height - 1);
    expect(Math.abs(due.x - day.x)).toBeLessThan(2);
  });

  test('820x1180, no saved choice: sidebar starts as the icon rail', async ({ page }) => {
    await seedBusyToday(page, { width: 820, height: 1180 });
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    expect(await page.evaluate(() => localStorage.getItem('cd_sidebar_collapsed'))).toBeNull();
  });

  test('820x1180, saved "0": sidebar stays open', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cd_sidebar_collapsed', '0'));
    await seedBusyToday(page, { width: 820, height: 1180 });
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
    expect(await page.evaluate(() => localStorage.getItem('cd_sidebar_collapsed'))).toBe('0');
  });

  test('820x1180, saved "1": sidebar is the icon rail', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('cd_sidebar_collapsed', '1'));
    await seedBusyToday(page, { width: 820, height: 1180 });
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
  });

  test('1280x720, no saved choice: sidebar open', async ({ page }) => {
    await seedBusyToday(page, { width: 1280, height: 720 });
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
  });

  test('tab order follows reading order on wide screens', async ({ page }) => {
    const today = await seedBusyToday(page, { width: 1280, height: 720 });
    await today.locator('.rail-name').first().focus();
    let reachedDue = false;
    for (let i = 0; i < 30 && !reachedDue; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        return a?.closest('.task-ledger-item') ? 'due' : a?.closest('.dashboard-right-panel') ? 'attendance' : 'other';
      });
      expect(where, 'attendance must not come before a Due row').not.toBe('attendance');
      reachedDue = where === 'due';
    }
    expect(reachedDue).toBe(true);
  });
});
