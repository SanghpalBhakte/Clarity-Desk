import { Page } from '@playwright/test';

// One busy Thursday for the "lighter Today" specs: 4 classes (one with a very long
// lab name), 2 late tasks and 4 upcoming ones. 2026-09-24 is a Thursday.
const cls = (subject: string, code: string, time: string, end: string, type = 'lecture') => ({ subject, code, time, end, type, batches: [] });
export const BUSY_DAY = [
  cls('Data Structures', 'DS', '09:00', '10:00'),
  cls('Probability and Statistics', 'PBST', '10:00', '11:00'),
  cls('Database Management Systems', 'DBMS', '11:00', '12:00'),
  cls('Database Management Systems Laboratory (Combined Batch A+B)', 'DBL', '14:00', '16:00', 'lab'),
];
const every = (d: unknown[]) => ({ 0: d, 1: d, 2: d, 3: d, 4: d, 5: d, 6: d });
const task = (id: string, title: string, dueDate: string, subject: string) => ({ id, subject, title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending' });
export const BUSY_TASKS = [
  task('l1', 'Lab record', '2026-09-21', 'Data Structures'),
  task('l2', 'OS quiz', '2026-09-22', 'Operating Systems'),
  task('u1', 'End sem prep', '2026-09-26', 'Digital Electronics'),
  task('u2', 'Mini project', '2026-09-27', 'Database Management Systems'),
  task('u3', 'Maths sheet', '2026-09-28', 'Mathematics'),
  task('u4', 'Report draft', '2026-09-30', 'Probability and Statistics'),
];

export async function seedBusyToday(
  page: Page,
  { width = 390, height = 844, at = '2026-09-24T11:20:00', extra = {}, day = BUSY_DAY, tasks = BUSY_TASKS }: { width?: number; height?: number; at?: string; extra?: Record<string, unknown>; day?: unknown[]; tasks?: unknown[] } = {},
) {
  await page.setViewportSize({ width, height });
  await page.clock.setFixedTime(new Date(at));
  await page.addInitScript((seed) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
  }, { cos_profile: { name: 'Riya' }, cos_custom_timetable: every(day), cos_notified_history: { onb_tt_day: '2026-09-20' }, cos_custom_tasks: tasks, ...extra });
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as any).navigate === 'function');
  return page.locator('#page-dashboard');
}

// Visible buttons, links and fields inside Today, the top bar and the tab bar whose box
// touches the first screen (scroll 0).
export async function tapTargetsOnFirstScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    const sel = 'button, a[href], input, select, [role="button"]';
    const roots = ['#page-dashboard', '.topbar', '.bottom-nav'].flatMap((s) => [...document.querySelectorAll(s)]);
    const seen = new Set<Element>();
    for (const r of roots) for (const el of r.querySelectorAll(sel)) seen.add(el);
    let n = 0;
    for (const el of seen) {
      const cs = getComputedStyle(el as HTMLElement);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLInputElement).type === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) continue;
      if (b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth) n++;
    }
    return n;
  });
}
