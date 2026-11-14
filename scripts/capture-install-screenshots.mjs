// Captures the two install-sheet screenshots from the real app (busy Thursday, light theme).
// Start the local server first (node tests/serve.mjs), then: node scripts/capture-install-screenshots.mjs
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const cls = (subject, code, time, end, type = 'lecture') => ({ subject, code, time, end, type, batches: [] });
const DAY = [
  cls('Data Structures', 'DS', '09:00', '10:00'),
  cls('Probability and Statistics', 'PBST', '10:00', '11:00'),
  cls('Database Management Systems', 'DBMS', '11:00', '12:00'),
  cls('Database Management Systems Laboratory (Combined Batch A+B)', 'DBL', '14:00', '16:00', 'lab'),
];
const task = (id, title, dueDate, subject) => ({ id, subject, title, taskType: 'assignment', dueDate, priority: 'medium', status: 'pending' });
const TASKS = [
  task('l1', 'Lab record', '2026-09-21', 'Data Structures'),
  task('l2', 'OS quiz', '2026-09-22', 'Operating Systems'),
  task('u1', 'End sem prep', '2026-09-26', 'Digital Electronics'),
  task('u2', 'Mini project', '2026-09-27', 'Database Management Systems'),
];
const every = (d) => ({ 0: d, 1: d, 2: d, 3: d, 4: d, 5: d, 6: d });
const seed = {
  cos_profile: { name: 'Riya' },
  cos_custom_timetable: every(DAY),
  cos_notified_history: { onb_tt_day: '2026-09-20' },
  cos_custom_tasks: TASKS,
  cos_attendance_baseline: { DS: { subjectName: 'Data Structures', subjectCode: 'DS', present: 20, absent: 4, leave: 0, notEntered: 0 } },
};

const browser = await chromium.launch();
for (const [file, width, height, scale] of [['screenshot-phone.png', 360, 640, 3], ['screenshot-wide.png', 1280, 720, 1.5]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-09-24T11:20:00'));
  await page.addInitScript((s) => {
    localStorage.setItem('cos_onboarding_dismissed', 'true');
    localStorage.setItem('cos_onboarding_done', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  await page.goto(BASE);
  await page.waitForFunction(() => typeof window.navigate === 'function');
  await page.locator('#page-dashboard .rail-row').first().waitFor();
  await page.screenshot({ path: path.join(ROOT, file) });
  await ctx.close();
}
await browser.close();
console.log('saved screenshot-phone.png (1080x1920) and screenshot-wide.png (1920x1080)');
