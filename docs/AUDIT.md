# Clarity Desk — Audit (CD-01, 2026-10-28, read-only)

Tags: [Certain] seen in code, [Likely] strong inference, [Unverified] not measured.
Earlier UX/funnel audit (2026-10-27): `Claude outputs/AUDIT.md`. Not repeated here.

## 1. Notes review
`docs/notes/` does not exist, so no phone notes were reviewed. Copy them in and re-run step 2 of CD-01.
Closest existing material, checked against current code:

| Source | Issue | Still valid? | One-line fix or workaround |
|---|---|---|---|
| `Claude outputs/AUDIT.md` #7 | `showOnboardingStep2` never called | Fixed (29 Oct 2026) | Removed with the old step 2 profile form in the onboarding redesign |
| `Claude outputs/AUDIT.md` #6 | ~18 `alert()` / 15 `confirm()` dialogs | Likely (app.js grew since) | Route through existing toast/modal |
| memory: slow-load follow-ups | app.js 1.1 MB raw | Yes | Lazy-load OCR and Ask Desk, like `deadline-import.js` |
| memory: slow-load follow-ups | Unused FCM token write | Fixed 2026-10-28 | Removed with the SW handler, messaging script and GitHub job |
| memory: slow-load follow-ups | GitHub Pages copy and campusos site | Yes, scheduled | Turn off per the existing tasks |

## 2. Top 10 problems, ranked by impact

| # | Problem | Evidence | Fix direction | Protected area? |
|---|---|---|---|---|
| 1 | **Cross-device task edits can be ignored.** The sync change check compares `customTasks?.length` only, so an edit/rename/completion that keeps the count is treated as "no change" and never applied or rendered. [Likely] | `calculatePayloadHash`, `app.js:5512-5517` | Hash the tasks' ids + updated stamps (or the whole sanitized list) | Yes (sync) |
| 2 | **Whole account in one Firestore document.** Tasks, timetable, attendance, vault links, syllabus all go in `users/{uid}`. Firestore caps a document at 1 MiB, and every change re-sends and re-reads the full document. A heavy user will start failing writes. [Likely] | `pushLocalDataToCloud`, `app.js:5724-5750` | Measure payload size; warn early; later split large domains into subdocs (needs migration) | Yes (`cos_*`, backup) |
| 3 | **`app.js` is 22.5k lines / 1.1 MB in one global scope.** Slow parse on low-end phones, every edit risks side effects, duplicate helper names are easy (`escHtml` at 21472, `escHtml_cd` at 21728). | file size, `app.js` | Lazy-load OCR and Ask Desk first (own files, same globals) | Yes (OCR) |
| 4 | **Full re-render on every change.** 84 `innerHTML` rebuilds; a 50 ms de-dupe and draft capture exist to hide flicker rather than avoid it. | `renderPage`, `app.js:8174` | Skip render when the visible data did not change; patch hot lists only | Navigation |
| 5 | **HTML built from strings plus 427 inline `onclick=`.** Safe only while every interpolation is hand-escaped; one missed `esc()` on user text (task title, vault label, imported WhatsApp text, synced cloud data) is stored XSS. [Unverified: no full audit of each template] | `app.js` | Audit templates that take user/cloud/imported text; one shared escaper | No |
| 6 | **Sync echo handling is fragile.** Dedupe relies on a hash that omits syllabus, notice channels, notification prefs and attendance target, so changes to those on another device may not be applied until something else changes. [Likely] | `app.js:5512-5530` vs payload at 5726-5745 | Include every synced field in the hash | Yes (sync) |
| 7 | **Two live hosts plus GitHub Pages, one AI/push allow-list.** The Pages copy cannot use AI or push; data lives per origin. | `ai-proxy/wrangler.toml`, memory notes | Execute the scheduled retirements | Offline-first |
| 8 | **Dead/legacy code paths.** FCM path and `push-notifications.yml` removed 2026-10-28; `KEY_GEMINI_KEY` declared but unused in `app.js`. | `app.js:25` | Remove after confirming no readers | Push |
| 9 | **App files depend on a third-party CDN.** `index.html` loads `app.js` from jsDelivr pinned to a commit and only falls back to the local copy on error; a slow (not failed) jsDelivr is covered only by the SW's 3 s wait. [Unverified in the field] | `sw.js:86-150`, `index.html:463` | Keep; check with `?timing` if first loads get slow again | SW |
| 10 | **Test suite is source-text and eval based.** `npm test` is ~55 serial Node scripts that mock the browser; no UI logic is exercised outside Playwright smoke/visual. A refactor of #3 or #4 would be hard to trust without more browser coverage. | `package.json`, `tests/verify_master.mjs` | Add 2-3 Playwright flows (add task, mark attendance, sync reload) before splitting `app.js` | No |

## 3. Not found (checked)
- Firestore rules: default deny, owner-only under `/users/{uid}/**`. No gap found for the current collections.
- AI proxy: origin allow-list, per-user and per-IP rate limits, model allow-list. Looks sound.
- Push worker D1 holds no names/emails.
- Not measured: real bundle size per feature, Firestore read counts in production, Lighthouse.

## 4. Status
All open. Next (CD-08): start with #1 (small, high impact), then #6 in the same change since both touch the hash.
