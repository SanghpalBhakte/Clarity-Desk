import { test, expect, Page } from '@playwright/test';

// Today's day rail (Register, step 2): the day's classes on one time column,
// every state said in words, marking in place, and the thin-data states
// (no timetable, self-study, no classes, day over, many classes, overlaps).
// Measured on narrow phones and at 200% zoom too.

const cls = (subject: string, code: string, time: string, end: string, type = 'lecture') => ({ subject, code, time, end, type, batches: [] });
const DAY = [cls('Data Structures', 'DS', '09:00', '10:00'), cls('Database Management Systems', 'DBMS', '11:00', '12:00'), cls('Operating Systems Lab', 'OS', '14:00', '16:00', 'lab')];
const every = (d: unknown[]) => ({ 0: d, 1: d, 2: d, 3: d, 4: d, 5: d, 6: d });
const task = (id: string, title: string, dueDate: string, subject = 'General') => ({ id, subject, title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending' });

// 2026-09-24 is a Thursday.
async function open(page: Page, at: string, extra: Record<string, unknown> = {}, opts: { install?: boolean } = {}) {
  if (opts.install) await page.clock.install({ time: new Date(at) });
  else await page.clock.setFixedTime(new Date(at));
  await page.addInitScript((extra) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, { cos_profile: { name: 'Riya' }, cos_custom_timetable: every(DAY), cos_notified_history: { onb_tt_day: '2026-09-20' }, cos_custom_tasks: [], ...extra });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  return page.locator('#page-dashboard');
}

test('morning: the now line comes first, the next class says "Next" and counts down', async ({ page }) => {
  const today = await open(page, '2026-09-24T07:06:00');
  const rail = today.locator('.day-rail');
  await expect(rail.locator('> li').first()).toHaveClass(/rail-now/);
  // The now line says "Now" in words (not colour alone) and is read out with its time.
  await expect(rail.locator('.rail-now')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(rail.locator('.rail-now')).toHaveText(/7:06 AM\s*Now/);
  const next = rail.locator('.rail-row.is-next');
  await expect(next).toHaveCount(1);
  await expect(next).toContainText('Data Structures');
  await expect(next.locator('.rail-meta')).toContainText('Next');
  await expect(next).toContainText('1h 54m');
  await expect(next).toContainText('until it starts');
  await expect(rail.locator('.rail-row')).toHaveCount(3);
  await expect(rail).toContainText('9:00 AM');
  await expect(today.locator('.desk-dnum')).toHaveText('24');
});

test('after a class: Present / Absent on the rail, the choice is announced and in words, and Undo takes it back', async ({ page }) => {
  const today = await open(page, '2026-09-24T12:40:00', {}, { install: true });
  const ds = today.locator('.rail-row', { hasText: 'Data Structures' });
  await expect(ds.locator('.rail-meta')).toContainText('Ended · not marked');
  await expect(today.getByRole('button', { name: 'I was at all 2, mark them present' })).toBeVisible();
  const present = ds.getByRole('button', { name: /^Present/ });
  expect((await present.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await present.click();
  await page.clock.runFor(300);
  await expect(ds.locator('.rail-meta')).toContainText('Marked present');
  await expect(ds.getByRole('button', { name: /^Present/ })).toBeHidden();
  await expect(today.getByRole('button', { name: /^I was at all/ })).toHaveCount(0);
  // Once marked the buttons fold away; "Change" brings them back with the mark selected.
  const change = ds.getByRole('button', { name: 'Change the mark for Data Structures' });
  expect((await change.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await change.click();
  await expect(ds.getByRole('button', { name: /^Present/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(ds.getByRole('button', { name: /^Present/ })).toBeFocused();
  await page.locator('.toast', { hasText: 'Present' }).getByRole('button', { name: 'Undo' }).click();
  await page.clock.runFor(300);
  await expect(ds.locator('.rail-meta')).toContainText('Ended · not marked');
  await expect(ds.getByRole('button', { name: /^Present/ })).toHaveAttribute('aria-pressed', 'false');
});

test('in class: the row says "In class" with the time left, and no now line competes with it', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:36:00');
  const live = today.locator('.rail-row.is-live');
  await expect(live).toContainText('In class · 24 min left');
  await expect(today.locator('.rail-now')).toHaveCount(0);
  await expect(today.locator('.rail-row.is-next')).toHaveCount(0);
});

test('day over and all marked: the rail says so and points at the next class', async ({ page }) => {
  const today = await open(page, '2026-09-24T18:00:00', {}, { install: true });
  await today.getByRole('button', { name: 'I was at all 3, mark them present' }).click();
  await page.clock.runFor(300);
  await expect(today.locator('.rail-then', { hasText: 'Day marked' })).toBeVisible();
  await expect(today.locator('.rail-then', { hasText: 'Next class:' })).toContainText('Tomorrow');
});

test('no timetable: no rail, the Your day section rests and the timetable ask shows', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:00:00', { cos_custom_timetable: every([]) });
  await expect(today.locator('.day-rail')).toHaveCount(0);
  await expect(today.getByRole('heading', { name: 'Your day' })).toBeHidden();
  await expect(today.getByText('Have a timetable?')).toBeVisible();
});

test('self-study: no rail and no Your day section', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:00:00', { cos_custom_timetable: every([]), cos_profile: { name: 'Riya', studyMode: 'self' } });
  await expect(today.locator('.day-rail')).toHaveCount(0);
  await expect(today.getByRole('heading', { name: 'Your day' })).toBeHidden();
});

test('no classes today: says so and names the next one', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:00:00', { cos_custom_timetable: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: DAY, 6: [] } });
  await expect(today.locator('.rail-empty')).toContainText('No classes today.');
  await expect(today.locator('.rail-empty')).toContainText('Next class: Tomorrow at 9:00 AM · Data Structures');
});

test('eight classes: six rows and "+2 more classes"', async ({ page }) => {
  const eight = ['08', '09', '10', '11', '12', '13', '14', '15'].map((h, i) => cls(`Subject ${i + 1}`, `S${i + 1}`, `${h}:00`, `${h}:50`));
  const today = await open(page, '2026-09-24T07:00:00', { cos_custom_timetable: every(eight) });
  await expect(today.locator('.rail-row')).toHaveCount(6);
  await expect(today.getByRole('button', { name: '+2 more classes →' })).toBeVisible();
});

test('classes at the same time say so', async ({ page }) => {
  const pair = [cls('DS Lab (A1)', 'DSL', '10:00', '12:00', 'lab'), cls('CN Lab (A2)', 'CNL', '10:00', '12:00', 'lab')];
  const today = await open(page, '2026-09-24T07:00:00', { cos_custom_timetable: every(pair) });
  await expect(today.locator('.rail-meta', { hasText: 'same time' })).toHaveCount(2);
});

for (const width of [320, 375]) {
  test(`${width}x812 with a long name and long class titles: the first class is on the first screen, nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    const long = [cls('Design and Analysis of Algorithms (Theory and Tutorial)', 'DAA', '09:00', '10:00'), cls('Database Management Systems Laboratory', 'DBMSL', '11:00', '13:00', 'lab')];
    const today = await open(page, '2026-09-24T07:00:00', {
      cos_custom_timetable: every(long),
      cos_profile: { name: 'Venkatalakshmi Subramaniam' },
      cos_custom_tasks: [task('late-1', 'OS quiz', '2026-09-22')],
    });
    const first = today.locator('.rail-row').first();
    const box = (await first.boundingBox())!;
    expect(box.y + box.height, 'first class above the tab bar').toBeLessThan(812 - 64);
    const wide = await page.evaluate(() => [...document.querySelectorAll('#page-dashboard .rail-row *')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && (r.left < 0 || r.right > innerWidth + 0.5)).length);
    expect(wide, 'rail content past the screen edge').toBe(0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1), 'no sideways scroll').toBe(true);
  });
}

test('200% zoom (a 375px phone is 188 CSS px wide): no sideways scroll, marks stay on screen and full size', async ({ page }) => {
  await page.setViewportSize({ width: 188, height: 406 });
  const today = await open(page, '2026-09-24T12:40:00');
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1), 'no sideways scroll').toBe(true);
  for (const b of await today.locator('.rail-att').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(188.5);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
});

test('a recently late task sorts out in its own Due row; no "General" filler', async ({ page }) => {
  const today = await open(page, '2026-09-24T07:00:00', { cos_custom_tasks: [task('late-1', 'OS quiz', '2026-09-22'), task('soon-1', 'CN worksheet', '2026-09-26', 'CN')] });
  const row = today.locator('.task-ledger-item', { hasText: 'OS quiz' });
  // The checkbox is Done; Tomorrow / Pick a day fold behind Move (the old Done button is gone on purpose).
  await expect(row.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
  const done = row.getByRole('checkbox');
  await expect(done).toBeVisible();
  const move = row.locator('.due-move');
  expect((await move.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await move.click();
  for (const name of ['Tomorrow', 'Pick a day']) {
    const b = row.getByRole('button', { name, exact: true });
    await expect(b).toBeVisible();
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(row).not.toContainText('General');
  await expect(today.locator('.task-ledger-item', { hasText: 'CN worksheet' })).toContainText('CN');
  await expect(today.locator('.today-focus')).toHaveCount(0);
});

test('a subject under the line is one plain sentence, not a card, and can be put aside', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  const today = await open(page, '2026-09-24T07:00:00', {
    cos_attendance_baseline: { DBMS: { subjectName: 'Database Management Systems', subjectCode: 'DBMS', present: 17, absent: 6, leave: 0, notEntered: 0 } },
    cos_att_v2_state: { mode: 'v2', decidedAt: '2026-09-01T00:00:00Z' },
  });
  const line = today.locator('.today-risk-line');
  await expect(line).toHaveText(/^Database Management Systems is at [\d.]+%, under your 75%\. Go to the next (class|\d+ in a row) to get back\.$/);
  const box = await today.locator('.today-risk').evaluate((e) => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).boxShadow);
  expect(box).toBe('rgba(0, 0, 0, 0)|none');
  expect(await line.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'the sentence is not cut off').toBe(true);
  await today.getByRole('button', { name: 'Not now' }).click();
  await expect(today.locator('.today-risk')).toHaveCount(0);
});

test('day over: the next-class sentence reads as one line of text', async ({ page }) => {
  const today = await open(page, '2026-09-24T18:00:00');
  await expect(today.locator('.rail-then', { hasText: 'Next class:' })).toHaveText('Next class: Tomorrow at 9:00 AM · Data Structures');
});

test('attendance from portal counts only says where the number comes from', async ({ page }) => {
  const today = await open(page, '2026-09-24T07:00:00', {
    cos_attendance_baseline: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 4, leave: 0, notEntered: 0 } },
  });
  await expect(today.locator('.att-stale-note')).toHaveText('From your portal counts. Mark classes from today to keep it current.');
  await expect(today.locator('.att-gauge')).toHaveAttribute('aria-hidden', 'true');
});

test('a plain lecture has no "Lecture" filler; a lab still says Lab', async ({ page }) => {
  const today = await open(page, '2026-09-24T07:06:00');
  await expect(today.locator('.day-rail .rail-meta').filter({ hasText: 'Lecture' })).toHaveCount(0);
  await expect(today.locator('.rail-row', { hasText: 'Operating Systems Lab' }).locator('.rail-meta')).toContainText('Lab');
});
