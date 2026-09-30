import { test, expect, Page } from '@playwright/test';

// ==================================================================
// Clarity Desk: MOBILE LAYOUT (phone widths)
// ==================================================================
// Regressions found on a real 360px phone (v165):
//  - on every page except Today the topbar was 370px wide, so phones laid
//    the whole app out wider than the screen and zoomed it out;
//  - the attendance pop-ups ("Set your current attendance" and the scan
//    review) pushed their Save button below the visible screen;
//  - timetable cards squeezed the class name beside Present/Absent.
// Run: npm run test:mobile
// ==================================================================

const WIDTHS = [320, 360, 412];
const PAGES = ['dashboard', 'timetable', 'subjects', 'assignments', 'notices', 'links', 'settings'];
const SCAN_ROWS = [
  { subject: 'Art of Public Speaking', code: 'MGM51OEL115', present: 6, absent: 1, leave: 0, notEntered: 1, totalSessions: 30 },
  { subject: 'Business Management and Financial Accounting', code: 'AID21HSL205', present: 3, absent: 4, leave: 0, notEntered: 0, totalSessions: 60 },
  { subject: 'Community Engagement', code: 'AID21CEP206', present: 13, absent: 5, leave: 0, notEntered: 1, totalSessions: 30 },
  { subject: 'Constitution of India', code: 'MGM56VEL102', present: 10, absent: 4, leave: 0, notEntered: 0, totalSessions: 60 },
  { subject: 'Data Structures', code: 'AID21PCL202', present: 13, absent: 12, leave: 0, notEntered: 0, totalSessions: 60 },
  { subject: 'Probability and Statistics', code: 'AID21PCL203', present: 14, absent: 6, leave: 0, notEntered: 0, totalSessions: 60 }
];

async function openApp(page: Page) {
  await page.clock.setFixedTime(new Date('2026-09-24T10:20:00'));   // a Thursday with classes
  await page.addInitScript(() => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_timetable_choice', 'aids');
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      if (el.closest('#cd-assistant-panel')) return false;            // off-canvas panel, slides in
      const r = el.getBoundingClientRect();
      if (!r.width || r.right <= vw + 0.5 || getComputedStyle(el).position === 'fixed') return false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return false;   // inside a scroller
      }
      return true;
    }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ')[0]} → ${Math.round(el.getBoundingClientRect().right)}px`);
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, wide };
  });
}

async function inViewport(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return `missing: ${sel}`;
    const r = el.getBoundingClientRect();
    const ok = r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0;
    return ok ? true : `${sel} at ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)} in ${innerWidth}x${innerHeight}`;
  }, selector);
}

for (const width of WIDTHS) {
  test.describe(`${width}px phone`, () => {
    test.use({ viewport: { width, height: 640 } });

    test('no page is wider than the screen', async ({ page }) => {
      await openApp(page);
      for (const p of PAGES) {
        await page.evaluate((name) => (window as any).navigate(name), p);
        await page.waitForTimeout(250);
        const o = await horizontalOverflow(page);
        expect(o.scrollWidth, `${p}: page is ${o.scrollWidth}px on a ${o.clientWidth}px screen (${o.wide.join(', ')})`).toBeLessThanOrEqual(o.clientWidth);
        expect(o.wide, `${p}: elements past the right edge`).toEqual([]);
      }
    });

    test('attendance pop-ups keep their Save button on screen', async ({ page }) => {
      await openApp(page);
      await page.evaluate((rows) => (window as any).showAttendanceScanReviewModal(rows), SCAN_ROWS);
      expect(await inViewport(page, '#ab-review-modal-backdrop .review-footer .btn-primary')).toBe(true);
      await page.evaluate(() => (window as any).saveAllReviewedBaselines());
      await page.evaluate(() => document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove()));

      await page.evaluate(() => (window as any).showBaselineModal());
      expect(await inViewport(page, '#baseline-modal-backdrop .baseline-actions .btn-primary')).toBe(true);
      // still reachable after scrolling the form to its end
      await page.evaluate(() => { const m = document.querySelector('#baseline-modal-backdrop .modal') as HTMLElement; m.scrollTop = m.scrollHeight; });
      expect(await inViewport(page, '#baseline-modal-backdrop .baseline-actions .btn-primary')).toBe(true);
      expect(await inViewport(page, '#ab-present')).toBe(true);   // form scrolled, not clipped
    });

    test('timetable Present / Absent buttons are full-size and the class name is readable', async ({ page }) => {
      await openApp(page);
      await page.evaluate(() => (window as any).navigate('timetable'));
      const card = page.locator('.tt-entry:has(.tt-att)').first();
      await expect(card).toBeVisible();
      const present = card.locator('.tt-att .btn').first();
      await expect(present).toContainText('Present');
      const box = (await present.boundingBox())!;
      expect(box.height, 'Present button height').toBeGreaterThanOrEqual(40);
      const subjectWidth = await card.locator('.tt-subject').evaluate((el) => el.getBoundingClientRect().width);
      expect(subjectWidth, 'class name width').toBeGreaterThan(width * 0.5);
    });

    // v168: the 145px time column pushed Today's Missed button off the
    // screen, where the page's overflow clip hid it from the check above.
    test("Today's schedule keeps Present / Missed fully on screen", async ({ page }) => {
      await openApp(page);
      const slots = page.locator('#page-dashboard .schedule-slot');
      expect(await slots.count(), 'schedule rows on Today').toBeGreaterThan(0);
      const offscreen = await page.evaluate(() => [...document.querySelectorAll('#page-dashboard .schedule-slot button')]
        .map((b) => b.getBoundingClientRect()).filter((r) => r.left < 0 || r.right > innerWidth + 0.5)
        .map((r) => `${Math.round(r.left)}–${Math.round(r.right)}`));
      expect(offscreen, `buttons past the ${width}px screen edge`).toEqual([]);
    });
  });
}

// v168: Today opened at the previous page's scroll offset (greeting and stat
// tiles already scrolled away on a phone), and every in-place re-render
// replayed the greeting's settle-in animation, so the top of the page looked
// like it kept reloading.
test.describe('Today on a phone', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('opens at the top, and a Present tap does not replay the greeting animation', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => (window as any).navigate('settings'));
    await page.evaluate(() => window.scrollTo(0, 1500));
    expect(await page.evaluate(() => window.scrollY), 'settings scrolled').toBeGreaterThan(0);
    await page.evaluate(() => (window as any).navigate('dashboard'));
    expect(await page.evaluate(() => window.scrollY), 'Today scroll offset').toBe(0);
    expect(await inViewport(page, '#page-dashboard .desk-greeting')).toBe(true);

    const masthead = page.locator('#page-dashboard .desk-masthead');
    await expect(masthead, 'arriving on Today plays the settle-in').not.toHaveClass(/is-settled/);
    await page.locator('#page-dashboard .schedule-slot button', { hasText: 'Present' }).first().click();
    await expect(masthead, 'in-place re-render keeps the greeting still').toHaveClass(/is-settled/);
    await page.evaluate(() => (window as any).navigate('timetable'));
    await page.evaluate(() => (window as any).navigate('dashboard'));
    await expect(masthead, 'coming back plays it again').not.toHaveClass(/is-settled/);
  });
});

// v169: Next Up / In Session card shows how long until the class starts or
// ends. These run in a real browser with a controllable clock.
const COUNTDOWN_TT = {
  0: [], 1: [], 2: [
    { subject: 'Data Structures Lab', code: 'DSL', time: '10:00', end: '12:00', room: 'FF-28', teacher: 'Prof. VJM', type: 'lab' },
    { subject: 'Open Elective 2', code: 'OE2', time: '12:45', end: '14:45', room: 'SF-31', teacher: 'Faculty', type: 'lecture' }
  ], 3: [], 4: [], 5: [], 6: []
};

async function openAppAt(page: Page, iso: string) {                 // 2026-09-29 is a Tuesday
  await page.clock.install({ time: new Date(iso) });
  await page.addInitScript((tt) => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    localStorage.setItem('cos_custom_timetable', JSON.stringify(tt));
  }, COUNTDOWN_TT);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  await page.evaluate(() => (window as any).navigate('dashboard'));
}

for (const width of WIDTHS) {
  test.describe(`${width}px phone: class countdown`, () => {
    test.use({ viewport: { width, height: 640 } });

    for (const [label, iso, count, caption] of [
      ['Next Up', '2026-09-29T08:40:00', '1h 20m', 'until it starts'],
      ['In Session', '2026-09-29T10:25:00', '1h 35m', 'left in class']
    ]) {
      test(`${label} card shows the countdown and stays inside the screen`, async ({ page }) => {
        await openAppAt(page, iso);
        const card = page.locator('#page-dashboard .chrono-beacon');
        await expect(card.locator('[data-beacon-count]')).toHaveText(count);
        await expect(card.locator('.chrono-beacon-count-label')).toHaveText(caption);
        const bad = await page.evaluate(() => {
          const c = document.querySelector('#page-dashboard .chrono-beacon') as HTMLElement;
          const cr = c.getBoundingClientRect();
          const out = [...c.querySelectorAll('button, .chrono-beacon-count, .chrono-beacon-badge, .chrono-beacon-time')]
            .map((e) => ({ n: e.className || e.tagName, r: e.getBoundingClientRect() }))
            .filter(({ r }) => r.left < cr.left - 0.5 || r.right > cr.right + 0.5 || r.right > innerWidth + 0.5)
            .map(({ n, r }) => `${n} ${Math.round(r.left)}–${Math.round(r.right)}`);
          const badge = c.querySelector('.chrono-beacon-badge')!.getBoundingClientRect();
          if (badge.height > 30) out.push(`badge wraps (${Math.round(badge.height)}px tall)`);
          return out;
        });
        expect(bad, `card contents outside the card / screen at ${width}px`).toEqual([]);
        for (const b of await card.locator('button').all()) {
          expect((await b.boundingBox())!.height, 'card button height').toBeGreaterThanOrEqual(30);
        }
      });
    }
  });
}

test.describe('class countdown ticks', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('counts down in place, then switches Next Up to In Session at the start minute', async ({ page }) => {
    await openAppAt(page, '2026-09-29T09:58:00');
    await page.clock.pauseAt(new Date('2026-09-29T09:58:30'));
    const count = page.locator('#page-dashboard [data-beacon-count]');
    const masthead = page.locator('#page-dashboard .desk-masthead');
    await expect(count).toHaveText('2 min');
    await expect(page.locator('#page-dashboard .chrono-beacon')).toHaveAttribute('data-beacon', 'next');
    await page.evaluate(() => { (document.querySelector('#page-dashboard .desk-masthead') as any).__probe = true; });

    await page.clock.runFor(31_000);                                   // 09:59:01 -> one minute tick has run
    await expect(count).toHaveText('1 min');
    expect(await page.evaluate(() => !!(document.querySelector('#page-dashboard .desk-masthead') as any).__probe),
      'a minute tick must edit the number in place, not rebuild Today').toBe(true);

    await page.clock.runFor(60_000);                                   // 10:00:01 -> class has started
    const card = page.locator('#page-dashboard .chrono-beacon');
    await expect(card).toHaveAttribute('data-beacon', 'live');
    await expect(count).toHaveText('2h 00m');
    await expect(card.locator('.chrono-beacon-count-label')).toHaveText('left in class');
    await expect(card.locator('.chrono-beacon-then')).toContainText('Open Elective 2');
    expect(await page.evaluate(() => !!(document.querySelector('#page-dashboard .desk-masthead') as any).__probe),
      'Today is rebuilt once when the class starts').toBe(false);
    await expect(masthead, 'the rebuild must not replay the greeting animation').toHaveClass(/is-settled/);
    await expect(page.locator('#topbar-clock-text'), 'topbar clock flips with the countdown').toContainText('10:00 AM');
  });
});
