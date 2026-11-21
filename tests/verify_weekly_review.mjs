// Weekly review dismissal: only this week's key is kept (older ones used to
// pile up, one a week), and a dismissed week reads back as dismissed.
import { loadApp } from './app-loader.mjs';

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`✓ ${name}`); }
  else { failed++; console.log(`✗ [FAIL] ${name} ${detail}`); }
}

const app = loadApp(['getWeekId', 'isWeeklyReviewDismissed'], {
  store: { cos_weekly_review_dismissed_2026_W40: 'true', 'cos_weekly_review_dismissed_2026-W41': 'true', cos_theme: 'midnight-ink' }
});
app.eval('renderPage = () => {}');
const week = `cos_weekly_review_dismissed_${app.getWeekId()}`;

check('not dismissed before the button', app.isWeeklyReviewDismissed() === false);
app.eval('dismissWeeklyReview()');
check('dismissed this week after the button', app.isWeeklyReviewDismissed() === true);
check('saved as the same raw value as before', app.store[week] === 'true', app.store[week]);
const left = Object.keys(app.store).filter((k) => k.startsWith('cos_weekly_review_dismissed_'));
check('older weeks\' keys are removed, this week\'s stays', left.length === 1 && left[0] === week, JSON.stringify(left));
check('other keys are left alone', app.store.cos_theme === 'midnight-ink');

console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
if (failed) process.exit(1);
