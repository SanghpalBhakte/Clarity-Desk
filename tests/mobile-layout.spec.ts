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
  });
}
