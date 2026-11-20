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

test('morning: the next class says how long it is until it starts, and "Can I skip this?" sits under it', async ({ page }) => {
  const today = await open(page, '2026-09-24T07:06:00');
  const next = today.locator('.c2-row:not(.t).next');
  await expect(next).toHaveCount(1);
  await expect(next).toContainText('Data Structures');
  await expect(next).toContainText('In 1h 54m');
  await expect(next.getByRole('button', { name: 'Can I skip this?' })).toBeVisible();
  await expect(today.locator('.c2-row:not(.t)')).toHaveCount(3);
  await expect(today.locator('.c2-rows')).toContainText('9:00 AM');
  await expect(today.locator('.c2-nowmark')).toHaveCount(1);
  await expect(today.locator('.desk-dnum')).toHaveText('24');
});

test('after a class: Present from its sheet, the choice is in words, and Undo takes it back', async ({ page }) => {
  const today = await open(page, '2026-09-24T12:40:00', {}, { install: true });
  const ds = today.locator('.c2-row:not(.t)', { hasText: 'Data Structures' });
  await expect(ds).toContainText('Not marked');
  await expect(today.getByRole('button', { name: 'I was at all 2, mark them present' })).toBeVisible();
  await ds.locator('.c2-face').click();
  const present = page.locator('.c2-sheet').getByRole('button', { name: /^Present/ });
  expect((await present.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await present.click();
  await page.clock.runFor(300);
  // An ended class that is marked folds into "1 earlier class, marked" (on purpose); open it to see the row.
  await today.locator('.c2-fold-btn').click();
  await expect(ds).toContainText('Present');
  await expect(today.getByRole('button', { name: /^I was at all/ })).toHaveCount(0);
  // The sheet is how a mark is changed: the current one is ticked.
  await ds.locator('.c2-face').click();
  await expect(page.locator('.c2-sheet .c2-opt', { hasText: /^Present/ }).locator('.chk')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.locator('.toast', { hasText: 'Present' }).getByRole('button', { name: 'Undo' }).click();
  await page.clock.runFor(300);
  await expect(ds).toContainText('Not marked');
});

test('in class: the one card says "In class now" with the time left, and no row says Next', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:36:00');
  const now = today.locator('.c2-now');
  await expect(now).toContainText('In class now');
  await expect(now).toContainText('24 min left');
  await expect(today.locator('.c2-row:not(.t).next')).toHaveCount(0);
});

test('day over and all marked: the rail says so and points at the next class', async ({ page }) => {
  const today = await open(page, '2026-09-24T18:00:00', {}, { install: true });
  await today.getByRole('button', { name: 'Mark all present' }).click();
  await page.clock.runFor(300);
  await expect(today.locator('.rail-then', { hasText: 'Day marked' })).toBeVisible();
  await expect(today.locator('.rail-then', { hasText: 'Next class:' })).toContainText('Tomorrow');
});

test('no timetable: no day, the Your day section rests and the timetable ask shows', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:00:00', { cos_custom_timetable: every([]) });
  await expect(today.locator('.c2-day')).toHaveCount(0);
  await expect(today.getByRole('heading', { name: 'Your day' })).toBeHidden();
  await expect(today.getByRole('button', { name: /Add timetable/ })).toBeVisible();
});

test('self-study: no day and no Your day section', async ({ page }) => {
  const today = await open(page, '2026-09-24T09:00:00', { cos_custom_timetable: every([]), cos_profile: { name: 'Riya', studyMode: 'self' } });
  await expect(today.locator('.c2-day')).toHaveCount(0);
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
  await expect(today.locator('.c2-row:not(.t)')).toHaveCount(6);
  await expect(today.getByRole('button', { name: '+2 more classes →' })).toBeVisible();
});

test('classes at the same time say so', async ({ page }) => {
  const pair = [cls('DS Lab (A1)', 'DSL', '10:00', '12:00', 'lab'), cls('CN Lab (A2)', 'CNL', '10:00', '12:00', 'lab')];
  const today = await open(page, '2026-09-24T07:00:00', { cos_custom_timetable: every(pair) });
  await expect(today.locator('.c2-row:not(.t)', { hasText: 'Same time' })).toHaveCount(2);
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
    const first = today.locator('.c2-row:not(.t)').first();
    const box = (await first.boundingBox())!;
    expect(box.y + box.height, 'first class above the tab bar').toBeLessThan(812 - 64);
    const wide = await page.evaluate(() => [...document.querySelectorAll('#page-dashboard .c2-row:not(.t) *, #page-dashboard .c2-strip *')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && (r.left < 0 || r.right > innerWidth + 0.5)).length);
    expect(wide, 'day content past the screen edge').toBe(0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1), 'no sideways scroll').toBe(true);
    // Rows carry the whole name: nothing is shortened with an ellipsis character.
    await expect(first.locator('.c2-nm b')).not.toContainText('…');
  });
}

test('200% zoom (a 375px phone is 188 CSS px wide): no sideways scroll, rows and the mark-all link stay on screen and full size', async ({ page }) => {
  await page.setViewportSize({ width: 188, height: 406 });
  const today = await open(page, '2026-09-24T12:40:00');
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1), 'no sideways scroll').toBe(true);
  for (const b of await today.locator('.c2-face:visible, .c2-all:visible').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(188.5);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
});

test('a recently late task sorts out in its own Due row; no "General" filler', async ({ page }) => {
  const today = await open(page, '2026-09-24T07:00:00', { cos_custom_tasks: [task('late-1', 'OS quiz', '2026-09-22'), task('soon-1', 'CN worksheet', '2026-09-26', 'CN')] });
  const row = today.locator('.task-ledger-item', { hasText: 'OS quiz' });
  // The tick is Done; Tomorrow / Pick a day sit in the Move sheet behind the name (the old Done button is gone on purpose).
  await expect(row.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
  await expect(row.getByRole('checkbox')).toBeVisible();
  await row.locator('.c2-tname').click();
  for (const name of ['Tomorrow', 'Pick a day']) {
    const b = page.locator('#c2-sheet').getByRole('button', { name, exact: true });
    await expect(b).toBeVisible();
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press('Escape');
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
  await expect(today.locator('.c2-nm small').filter({ hasText: 'Lecture' })).toHaveCount(0);
  await expect(today.locator('.c2-row:not(.t)', { hasText: 'Operating Systems Lab' }).locator('.c2-nm')).toContainText('Lab');
});

const dsStatus = (page: Page) => page.evaluate(() => {
  const a = JSON.parse(localStorage.getItem('cos_attendance') || '{}')['2026-09-24'] || {};
  return Object.values(a)[0];
});

test("a class that did not happen: the sheet offers Didn't happen and OD, the mark is in words and Undo takes it back", async ({ page }) => {
  const today = await open(page, '2026-09-24T12:40:00', {}, { install: true });
  const ds = today.locator('.c2-row:not(.t)', { hasText: 'Data Structures' });
  await ds.locator('.c2-face').click();
  const didnt = page.locator('.c2-sheet').getByRole('button', { name: /^Didn't happen/ });
  expect((await didnt.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await didnt.click();
  await page.clock.runFor(300);
  expect(await dsStatus(page)).toBe('cancelled');
  await today.locator('.c2-fold-btn').click();
  await expect(ds).toContainText("Didn't happen");
  await page.locator('.toast', { hasText: "Didn't happen" }).getByRole('button', { name: 'Undo' }).click();
  await page.clock.runFor(300);
  await expect(ds).toContainText('Not marked');
});

test('OD from the sheet is stored as waiting for teacher and is not counted as unmarked', async ({ page }) => {
  const today = await open(page, '2026-09-24T12:40:00', {}, { install: true });
  const ds = today.locator('.c2-row:not(.t)', { hasText: 'Data Structures' });
  await ds.locator('.c2-face').click();
  await page.locator('.c2-sheet').getByRole('button', { name: /^On duty \(OD\)/ }).click();
  await page.clock.runFor(300);
  expect(await dsStatus(page)).toBe('od_pending');
  await today.locator('.c2-fold-btn').click();
  await expect(ds).toContainText('On duty, waiting');
  await expect(today.getByRole('button', { name: /^I was at all/ })).toHaveCount(0);
});

test('Change on a "Didn\'t happen" class shows it ticked in the sheet', async ({ page }) => {
  const today = await open(page, '2026-09-24T12:40:00', { cos_attendance: { '2026-09-24': {} } });
  await today.locator('.c2-row:not(.t)', { hasText: 'Data Structures' }).locator('.c2-face').click();
  await page.locator('.c2-sheet').getByRole('button', { name: /^Didn't happen/ }).click();
  await expect.poll(() => dsStatus(page)).toBe('cancelled');
  await page.reload();
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await today.locator('.c2-fold-btn').click();
  await today.locator('.c2-row:not(.t)', { hasText: 'Data Structures' }).locator('.c2-face').click();
  await expect(page.locator('.c2-sheet .c2-opt', { hasText: /^Didn't happen/ }).locator('.chk')).toHaveCount(1);
});

test('360x812 with the sheet open on a long name: no sideways scroll, every choice on screen and 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 812 });
  const long = [cls('Design and Analysis of Algorithms (Theory and Tutorial)', 'DAA', '09:00', '10:00')];
  const today = await open(page, '2026-09-24T12:40:00', { cos_custom_timetable: every(long) });
  await today.locator('.c2-row:not(.t)').first().locator('.c2-face').click();
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= innerWidth + 1), 'no sideways scroll').toBe(true);
  for (const b of await page.locator('.c2-sheet .c2-opt').all()) {
    const r = (await b.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(360.5);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
});
