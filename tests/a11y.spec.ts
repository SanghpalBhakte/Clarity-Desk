import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Every main page, light and dark, must have no serious or critical WCAG 2.1
// AA problems (axe-core): text too faint to read, buttons whose spoken name
// doesn't match what's on them, missing labels. Uses the sample timetable so
// the busy states (classes, calendar chips, attendance buttons) are checked.
const PAGES = ['dashboard', 'timetable', 'assignments', 'subjects', 'calendar', 'resources', 'summary', 'settings'];

for (const theme of ['light', 'dark']) {
  test(`no serious accessibility problems (${theme})`, async ({ page }) => {
    // A Thursday mid-morning with classes, so Today shows its mark buttons and
    // day bar on every run, not only on days the real clock lands on a class.
    await page.clock.setFixedTime(new Date('2026-09-24T10:20:00'));
    await page.addInitScript((t) => {
      localStorage.setItem('cos_onboarding_dismissed', 'true');
      localStorage.setItem('cos_onboarding_done', '1');
      localStorage.setItem('cos_timetable_choice', 'aids');
      localStorage.setItem('cos_theme', t);
    }, theme);
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).navigate === 'function');
    const found: string[] = [];
    for (const p of PAGES) {
      await page.evaluate((x) => (window as any).navigate(x), p);
      await page.waitForTimeout(400);   // page fade-in, so contrast is read at full opacity
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('.section-page.active')
        .analyze();
      for (const v of r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        found.push(`${p}: ${v.id} (${v.nodes.length}) ${v.nodes[0].target.join(' ')}: ${v.nodes[0].any[0]?.message ?? v.help}`);
      }
    }
    expect(found, found.join('\n')).toEqual([]);
  });
}
