# Clarity Desk — Architecture (CD-01, 2026-10-28)

Offline-first PWA for students. Vanilla JS, no build step, no framework. `localStorage` is the source of truth; Firebase is optional.
Deeper history and bug-fix intent: `PROJECT_MEMORY.md`. Known issues: `docs/AUDIT.md`.

## Files
- `index.html` (481 lines): shell, nav, modal templates, theme bootstrap in `<head>`. Loads Firebase compat SDK 10.8.0 (app, auth, firestore) synchronously, then `firebase-config.js?v=N`, then `app.js` as a module.
- `app.js` (17.8k lines, 0.86 MB raw): everything else. No modules; one global scope. `data.js` (fallback timetables/notices), `desk-assistant.js` (lazy, Ask Desk answers; precached by `sw.js` so it works offline), `scanners.js` (lazy, attendance photo scan and syllabus scan; precached the same way), `timetable-ocr.js` (lazy, the timetable photo parsers; precached the same way), `deadline-import.js` (lazy), `welcome-tour.js` (lazy, the Explore tour), `vendor/jszip.min.js` (lazy).
- `style.css` (6.7k lines): themes via CSS variables, responsive rules.
- `sw.js`, `manifest.json`: PWA. `404.html` carries its own copy of the head bootstrap (keep in sync).
- `ai-proxy/` (Cloudflare Worker): Gemini/Groq/Workers-AI proxy; origin allow-list, per-user/per-IP rate limits, optional Firebase ID token.
- `workers/feedback/` (Cloudflare Worker, deployed by hand, not by `ship`): relays the Settings "Tell me what breaks" form to a private Telegram chat. Secrets `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`; origin allow-list, 1.2 MB body cap, 5/min per-IP limit, one retry on a Telegram hiccup. `POST /telegram` is Telegram's webhook (secret header, `TELEGRAM_WEBHOOK_SECRET`): it replies to anyone who messages the bot. `brand-bot.sh` sets the bot's name, logo, description and webhook. Client side is `FEEDBACK_URL` + `openFeedbackForm` / `submitFeedback` in `app.js`; while `FEEDBACK_URL` is empty (or sending fails) the old prefilled GitHub issue link (`bugReportUrl`) is used.
- `push-worker/` (Cloudflare Worker + D1): closed-app reminders via Web Push. Tables `devices`, `reminders`; anonymous device id, no account data.
- `scripts/ship.mjs`: bump cache version, `npm test`, commit, Dev Notes, push, `firebase deploy`, live smoke test. Run in batches (when the owner says ship; urgent fixes at once): merging a PR to `main` publishes nothing. Dev Notes carry no version label; the cache number stays internal and `devNoteText()` hides the old "(vN)" on display.
- `tests/`: ~55 Node `verify_*.mjs` (run by `npm test`; they read `app.js` source and eval parts of it under a mocked browser, no real browser), Playwright specs (visual, PWA smoke, mobile, post-deploy smoke), `release-check.mjs`.
- `.github/workflows`: `test.yml` (npm test + photo check + pwa-smoke on push/PR), `live-check.yml`, `ai-models.yml` (daily: `scripts/check-ai-models.mjs` checks the AIService model IDs are still offered; needs `GEMINI_API_KEY`/`GROQ_API_KEY` repo secrets).

## Boot and load
- Firebase Hosting serves two sites from `.` (targets `app` = claritydesk, plus campusos). `index.html` points at `app.js`/`style.css`/`data.js` on jsDelivr pinned to a commit hash, with local `?v=N` fallback on error.
- `ship.mjs` rewrites the `?v=N`, the pinned commit and `CACHE_NAME` (`clarity-desk-vN`) together.
- Service worker: precaches shell + app files. Network-first with a 3 s timeout for navigation/JS/CSS (then cached copy; after one slow answer, 30 s of cache-first); stale-while-revalidate for other assets; skips Firebase/Google API and Groq traffic. Handles the `share-target` POST (WhatsApp deadline import).

## State and storage (all `cos_*` keys, constants at `app.js:8-56`)
- Profile/tasks: `cos_profile`, `cos_custom_tasks`, `cos_assignments` (task status map), `cos_custom_timetable`, `cos_timetable_choice`, `cos_user_batch`, `cos_hidden_subjects`.
- Attendance: `cos_attendance` (daily marks), `cos_attendance_baseline`, `cos_attendance_live`, `cos_attendance_v2` + `cos_att_v2_state`, `cos_att_target`, `cos_att_reassign_log`, `cos_att_datefix_*`.
- Content: `cos_custom_links` (Study Vault records), `cos_syllabus`, `cos_holiday`, `cos_notice_channels`.
- Holiday mode (`cos_holiday` `{on, since, until}`, `until` exclusive; `since` may be future = planned): display-only. `isHolidayActive(date)` hides classes, class reminders and attendance; `isTaskPausedForHoliday(task)` hides ongoing tasks without the optional `keepInHoliday` flag; dated tasks always show. Today banner + Daily Briefing holiday view; `body.holiday-mode` styling (sunset masthead). During a break Today also hides the countdown (unless the exam is within 7 days), the syllabus line, Weekly Review and non-important or built-in notices. Ending a break that had started stores an optional `endedOn` in the off value; Today shows a one-day welcome-back card (dismissal in `cos_notified_history`). Helpers live in the "Holiday mode" block of `app.js`.
- Feedback: `cos_feedback_queue` (local only, not synced or backed up): up to 5 offline reports with a small screenshot copy each. Kept until sent (on `online` and ~4 s after start); dropped only after 5 server refusals or 14 days. Offline never counts as a try.
- Settings: `cos_theme`, `cos_accent`, `cos_notif_prefs`, `cos_usage`, install/push/moved prompt flags.
- Backups: `cos_cleanup_backup`, `cos_att_datefix_backup` (snapshot + undo for cleanup/migrations).
- Vault files: IndexedDB `cos_vault` (db version 1), links keep a `fileId`; small files may be data URLs in the record.
- Helpers: `safeGetStorage(key, fallback)` for reads; in-memory `state` object holds tasks etc.

## Rendering and navigation
- Hash routing. `PAGES` (`app.js:7941`): dashboard (Today), timetable, subjects, assignments (Tasks & Deadlines), calendar, notices, resources/links/summary (Vault), settings, review. `navigate()` at 7949, `hashchange` at 22071.
- `renderPage(page)` (8174) switches to per-page `renderX()` that rebuilds the page with `innerHTML` strings (84 uses; 427 inline `onclick=` handlers). It de-dupes calls within 50 ms and saves/restores typed drafts around re-renders.
- Escaping is by hand: `escHtml_cd` (21728) and local `esc` helpers.

## Cloud sync (optional, Firestore)
- One document per user: `users/{uid}` (merge-set), plus old `users/{uid}/fcmTokens/{token}` documents from the removed FCM path (nothing reads or writes them now; left in place, no destructive cleanup). Rules: default deny; `/users/{uid}/**` owner only.
- Push: `pushLocalDataToCloud` (~5735) writes profile, tasks, timetable, vault links (`linksForCloud`: uploaded files stay on device, placeholders only), statuses, attendance(+baseline/live), syllabus, theme, accent, prefs, channels, target, attendance summary, holiday, `updatedAt`. Deletes tracked via `computeSyncDeletePaths` against `cos_sync_last_pushed`.
- Pull: `subscribeToCloud` (~5540): cache read first, then `onSnapshot`; both skip when `calculatePayloadHash` equals the last seen payload, else `applyCloudDataToLocalState` and re-render.
- Auth: Google (popup, redirect fallback), email link, email+password. In Settings, and from the Welcome screen's Log in. No login wall.
- Welcome (`showOnboardingModal`): Explore / Log in only. Explore `import()`s `welcome-tour.js` (scroll-snap cards built from existing classes, last card: sign in or continue without account). Scan / add classes / study alone / bunk calculator are on the empty-Today setup card (`setupScanTimetable`, `setupAddClasses`, `setupSelfStudy`), same `welcome_choice` events.

## AI and OCR
- On-device first: Tesseract.js from jsDelivr (lazy), deterministic grid reconstruction and normalisation, then AI vision via `AIService` (`app.js:492`) through the proxy. `AIService._cooldowns` skips recently failed providers.
- Parser/OCR/AI output goes to editable review screens before any write.
- Before any timetable, attendance or syllabus photo is read, `confirmScanPhotoQuality` (`app.js`) checks it on the device (too small, or too little detail = blurry/washed out; thresholds measured on the test kits, checked by `npm run test:photo-check` in CI). A flagged photo gets "Choose another photo" (reopens the picker) or "Scan this photo anyway"; PDFs and photos that pass go straight through.
- Attendance photo scan and syllabus scan live in `scanners.js` (`createScanners(deps)`). `app.js` keeps the file pickers (so `input.click()` stays inside the tap), imports the module on first scan or when the scan tab opens (`loadScanners()`), and routes the window handlers through `callScanner()`, which shows a toast if the file can't load. `AIService` stays in `app.js`.
- Timetable photo reading lives in `timetable-ocr.js` (`createTimetableOcr(deps)`): deskew, preprocessing, the 2D grid / line / text-stream parsers, `extractTimetableFromImage` and the Vision AI grid prompt and row clean-up. The vision call starts right after the first Tesseract pass (its image and prompt only need that pass) and runs alongside the on-device retries (Stages A-D); it is awaited only if the on-device result fails the confidence gate, otherwise its answer is ignored. `app.js` keeps a same-named async `extractTimetableFromImage` that loads it (`loadTimetableOcr()`, started when the picker opens) and turns a failed load into the error screen, where Retry works. `AIService`, the Tesseract loader, subject normalization, the legend parsers and `groupWordsIntoLines` / `mapRawOcrWordsForDetection` / `correctDigitLetterConfusion` stay in `app.js` because other code uses them.
- Ask Desk (`ClarityAssistant`, in `desk-assistant.js`): rule-based intents on local data, no model. `app.js` imports it on first use (`loadClarityAssistant()`) and passes its helpers in via `clarityAssistantDeps()`; tests load it with `tests/lazy-modules.mjs`. Guided buttons open existing flows; no direct writes from chat.

## Reminders
- Foreground: timers in `app.js` (one `setInterval` at ~22102) plus local Notification API.
- Closed app: device registers with `push-worker`; reminders are sent from D1 by a Cloudflare cron. The old Firebase (FCM) push path (client, `sw.js` handler, GitHub job) was removed on 2026-10-28; `sw.js` loads no third-party scripts.

## Quality gates
`npm test` (logic) · `test:pwa-smoke` (SW/manifest/offline) · `test:visual` (UI; screenshots are platform-specific) · `release:check` · `ship` / `ship:check`.
