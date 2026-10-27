# 🧠 CLARITY DESK — PROJECT MEMORY & ARCHITECTURAL KNOWLEDGE BASE

> **Version:** 3.1 Production-Ready (Post Timetable/Attendance OCR Overhaul, Plum Rebrand, UX Consistency Pass, and Background Push Notifications)
> **Repository Root:** `D:\Clarity Desk`
> **Philosophy:** Offline-first, privacy-first, deterministic academic operating desk for college students.

---

## 1. Executive Summary & Core Principles

Clarity Desk is a progressive web application (PWA) designed to eliminate academic friction for university students. It unites daily timetables, live attendance logs, assignment tracking, study vault links, notice boards, and an intelligent context-aware assistant (**Ask Desk**) without requiring cumbersome third-party servers or mandatory logins.

### Non-Negotiable Core Rules:
1. **Local-First & Offline Resilience**: All student data is stored locally in `localStorage` with automated snapshot backup capabilities. Cloud sync via Firebase Firestore is purely optional.
2. **Deterministic-First Logic**: Normalization, attendance calculations, threshold warnings, and OCR table reconstruction rely on deterministic algorithms first, using LLMs/Vision AI strictly as assistive or structured-extraction fallbacks.
3. **Zero Silent Writes / Auto-Saves**: Parser outputs, AI suggestions, cleanup migrations, and guided actions never mutate stored data autonomously. Every change requires an explicit student review and confirmation modal.
4. **Product Trust & Calm UI**: Transparent status indicators, calm non-alarmist warnings, exact mathematical feedback, and predictable navigation.

---

## 2. Directory Structure & Key Files

```text
D:\Clarity Desk\
├── index.html           # PWA entry point, <head> theme bootstrap, shell, modal templates, mobile & desktop nav
├── app.js               # Core application logic (~12,500 lines), routers, state managers, renderers, OCR pipelines
├── style.css            # Unified design system, CSS variables, 2 production themes, responsive layouts, print sheets
├── data.js              # Fallback reference datasets, default batch timetables, sample notices
├── manifest.json        # PWA web manifest, icons, standalone display mode
├── sw.js                # Service Worker for offline asset caching (cache-busted alongside index.html's ?v= params)
├── favicon.svg / favicon.ico / favicon-*.png / icon-*.png / apple-touch-icon.png / badge-96.png
│                        # App icon set — must stay color-matched to style.css's --raw-brand-1 / --raw-ink-inverse (see §7)
├── 404.html             # Static fallback page — carries its own copy of the <head> theme/icon bootstrap; keep in sync with index.html
├── firestore.rules      # Firestore security rules — default-deny, then strict /users/{uid}/** per-owner access (covers fcmTokens/notifState too, see §10)
├── scripts/push-notifications/  # Background push evaluation job — send-notifications.js, package.json, package-lock.json (see §10)
├── .github/workflows/push-notifications.yml  # Free GitHub Actions cron that runs the job above — no Cloud Functions/Blaze plan (see §10)
├── tests/               # Automated regression + smoke test suites
│   ├── verify_master.mjs                          # 14-scenario core regression suite (Node ESM, no browser needed)
│   ├── verify_gap_fixes.mjs                        # 5-unit Gap Fix Board suite
│   ├── verify_subject_normalization.mjs            # 11 scenarios — canonical subject/OCR-variant merging
│   ├── verify_attendance_scan_row_reconstruction.mjs
│   ├── verify_ocr_scan_improvements.mjs             # Deskew, shadow-flatten, dark-invert, subject-legend & digit-confusion (see §11)
│   ├── verify_bodytext_retry.mjs / verify_ocr_header_robustness.mjs / verify_multiline_split.mjs
│   ├── verify_residue_and_monday_recovery.mjs / verify_subject_code_and_faculty_legend.mjs
│   ├── verify_timetable_recess_count.mjs / verify_timetable_structure.mjs / verify_task_category_cleanup.mjs
│   ├── clarity-visual-verification.spec.ts / pwa-smoke.spec.ts / post-deploy-smoke.spec.ts   # Playwright (see §9)
│   ├── verify_push_notifications.mjs               # Static checks for the background-push feature (see §10)
│   └── release-check.mjs / clear-pwa-cache.mjs / serve.mjs
└── PROJECT_MEMORY.md    # Permanent memory & architecture archive
```

---

## 3. Engineering History & Unit-by-Unit Implementation

### 🔹 Unit 1 — Attendance Baseline Setup & Normalization
- **Problem**: New students could not track ERP attendance without entering an entire semester of historical classes manually.
- **Solution**:
  - Implemented configurable attendance baselines stored in `cos_attendance_baseline`.
  - Added support for manual count entry (`Present` / `Total` or `Present` / `Absent`) and OCR camera scan imports.
  - Baseline-only subjects appear correctly even without weekly timetable slots.
  - Formula: `Total Attended = Baseline Attended + Daily Marked Attended + Live Manual Adjustments`.
  - Configurable target threshold (default `75%`, customizable to `80%` or `85%`).

### 🔹 Unit 2 — Polluted Subject Cleanup, Daily Log Migration & Undo
- **Problem**: Multiple batch variants (e.g. `OS Lab B1`, `OS Lab B2`, `OS-Theory`) created fragmented, noisy subject cards.
- **Solution**:
  - Built an intelligent declutter engine that detects batch suffixes and token variations.
  - Added a safe **Declutter Preview Modal** showing exact merge mapping before any write occurs.
  - Automatically migrates historical daily attendance logs to canonical keys.
  - Created a 7-domain snapshot backup system (`KEY_BACKUP_SNAPSHOTS`) with instant **Undo / Restore** capabilities.

### 🔹 Unit 3 — Ask Desk Phase 1: Data-Aware Read-Only Assistant
- **Problem**: Students needed fast, grounded answers about their day without digging through menus.
- **Solution**:
  - Built an in-desk read-only NLP assistant matching patterns for:
    - Focus of the day & class schedule
    - Safe-to-skip attendance calculations
    - High-priority & overdue tasks
    - Exam countdowns & notice highlights
  - Zero hallucinations: strictly grounded in live `localStorage` data.

### 🔹 Unit 4 — Ask Desk Phase 2: Safe Guided Actions
- **Problem**: Conversational assistants often risk destructive autonomous writes or confusing UX loops.
- **Solution**:
  - Ask Desk provides **Guided Action Buttons** (`Open Setup →`, `Add Task →`, `View Preview →`) that open existing UI flows.
  - Enforces zero direct writes from chat: the assistant routes into the standard modal review flows.
  - Honest missing-data states: guides students to configure baselines or import schedules when data is unavailable.

### 🔹 Ask Desk: Question Understanding (Oct 2026)
- **Still no AI model, on purpose**: Ask Desk answers on the device, so it is instant, offline, and free. A local LLM (WebLLM etc.) was considered and rejected: 1–2 GB download, slow on mid-range phones.
- `understand(query)` in `ClarityAssistant` strips greetings/filler ("hi, can you tell me…"), rewrites slang and typos (bunk/miss → skip, tmrw → tomorrow, attendence → attendance), picks out a **subject** (name, code, initials like DBMS, `SUBJECT_ALIASES`; short codes that are English words such as "IT" only count when typed in capitals) and a **day** (today, tomorrow, weekday names), then runs the `INTENTS` rules. Subject/day turn into `subject_skip`, `day_skip`, `subject_attendance`, `tasks_day`, `day_schedule`, and so on.
- "what about OS?" / "and Friday?" continue the previous subject/day question (`lastAsked`, kept in memory only).
- Unknown questions get "Did you mean" buttons ranked by shared words.
- The Today-page Ask Desk box (`handleAssistantQuestion`) now calls `ClarityAssistant.respond`; its old separate `answer*` rules are gone.
- The chat panel is z-index 1101 and every modal is 200, so an answer button that opens a page or a form closes the panel first (document-level click listener next to the Ctrl+/ shortcut). Buttons that ask another question keep it open.
- Regression table: `tests/verify_ask_desk.mjs` (about 55 real phrasings → intent/subject/day, plus answer checks).
- **Scan AI cooldown**: `AIService._cooldowns` remembers for the session which provider/model just failed (404/403/401 for 30 min, 429/timeout for 5 min, 5xx for 2 min). `_healthyFirst` moves those to the back of the line; nothing is skipped, so every model still gets its turn. `extractStructuredFromImage(…, onStep)` reports which provider it is trying, so the scan screens show it.

### 🔹 Unit 5 — Parser Reliability for Attendance & Timetable Imports
- **Problem**: Camera OCR scans produced digit errors (e.g., `8` read as `B`, `0` read as `O`), noisy teacher tokens, and misaligned grids.
- **Solution**:
  - Preprocessing and token cleanup: alphanumeric balance solver ensures `Present <= Total`.
  - 2D grid reconstructor with coordinate alignment for timetable timetables.
  - Explicit uncertainty highlighting (`⚠️ Needs Review`) for low-confidence cells.
  - Editable review tables prior to saving (zero silent imports).

### 🔹 Final Polish Pass — Product Trust, Empty States & Consistency
- **Problem**: Inconsistent terminology (mixing "Tasks" and "Assignments") and generic empty states.
- **Solution**:
  - Standardized all terminology to **Tasks & Deadlines** (internal page/route key remains `assignments` — see §8).
  - Upgraded empty states across Dashboard, Timetable, Subject Hubs, Tasks, and Vault with actionable next steps.
  - Replaced misleading `0%` attendance representations with honest `Attendance not configured` states.

---

## 4. Gap Fixes (Units 1–5 of Gap Fix Board)

### 1. Theme Flash on Reload
- **Root Cause**: The inline `<head>` bootstrap script contained outdated theme names, causing fallback resets before `app.js` loaded.
- **Fix**: Synchronized `<head>` script and `LEGACY_THEME_MAP` across the production theme set (now consolidated to 2 — see §7).
- **Result**: Zero theme flash on hard refreshes.

### 2. Mobile Access to Subject Hubs
- **Root Cause**: On mobile screens, the desktop sidebar was hidden, leaving no direct 1-tap route to Subject Hubs in bottom navigation.
- **Fix**: Added a dedicated `Subjects` tab to `<nav class="bottom-nav">` with standard book SVG icon and `data-nav="subjects"`.
- **Result**: Immediate 1-tap mobile reachability for course baselines, slots, and quick logs.

### 3. Single Subject Hub Empty-State Add-Link Action
- **Root Cause**: Opening an individual Subject Hub with 0 links forced students to leave the hub and navigate to Study Vault to add materials.
- **Fix**: Added `+ Add Study Link / Note` action inside the hub empty state with `openAddResourceForSubject(subjectName, subjectCode)` prefilling course context.
- **Result**: Single Subject Hub acts as a self-contained course workspace.

### 4. First-Run Setup Checklist & Onboarding Order
- **Root Cause**: Brand-new users landed on an empty dashboard without a unified explanation of recommended setup sequence.
- **Fix**: Added an inline 3-step checklist (`.desk-setup-guide`):
  1. **Set Practical Batch & Profile** (`navigateTo('settings')`)
  2. **Import Timetable Schedule** (`navigateTo('timetable')`)
  3. **Set Attendance Starting Counts** (`showBaselineModal(null, 'manual')`)
- **Result**: Dynamic step tracking that disappears completely once setup is finished (`isFullySetup === true`).
- **Superseded order (onboarding pass, Oct 2026)**: the welcome modal now leads with "Scan your timetable" (`onboardingScanTimetable()` → existing `triggerTimetableImport()`), then "Add classes myself", then "Just look around"; the profile form is no longer on the welcome path. The checklist order is now **timetable → profile (only once a timetable exists) → attendance counts**, because the scan review modal already asks for the lab group and saves it to the profile. With no timetable, Today shows only this card (no Rest Day card, no stat tiles, no second "Add your schedule" button). `checkOnboarding()` also skips the welcome when `hasExistingUserData()` finds any saved data (restored backups without the dismissed flag). Built-in sample notices carry `builtIn: true` in `data.js` and drop off after their date (`getVisibleNotices()`). Locked by `tests/verify_onboarding_returning.mjs`.

### 5. Local/Offline Save Status Clarity
- **Root Cause**: The lone cloud icon in the topbar created ambiguity about whether data was being saved offline.
- **Fix**: Upgraded topbar indicator to a clear status pill: `[🟢 💾 Saved locally]` (collapsing to `[🟢 💾]` on small viewports with full tooltips).
- **Result**: Immediate student trust that data is safely preserved on-device.

---

## 5. Storage Schema & Keys Reference

| Key Constant | Storage Key Name | Description |
| :--- | :--- | :--- |
| `KEY_ATTENDANCE_BASELINE` | `cos_attendance_baseline` | Map of course code $\rightarrow$ baseline counts `{ present, totalCount, absent, lastUpdated }` |
| `KEY_ATTENDANCE` | `cos_attendance_records` | Historical daily log `{ "YYYY-MM-DD": { "CS201_1000": "attended" } }` Step 4 adds the values `od_pending` / `od_accepted` / `od_rejected` / `cancelled` (the v1 math and older app versions ignore them) and extra-class keys ending in `x` (`DataStructures_1530x`). |
| `KEY_ATTENDANCE_TARGET` | `cos_attendance_target` | Numerical target threshold (e.g. `75`, `80`, `85`) |
| `KEY_CUSTOM_TIMETABLE` | `cos_custom_timetable` | Day-indexed schedule map `{ 0: [], 1: [...slots], ... 6: [] }` |
| `KEY_PROFILE` | `cos_profile` | User profile `{ name, roll, batch, semester, branch, examDate }` |
| `KEY_TASKS` | `cos_custom_assignments`| Array of tasks `{ id, title, subject, dueDate, priority, status, taskType }` |
| (task fields, v192) | `cos_custom_tasks` | Optional, additive: `source: 'whatsapp'`, `startTime`/`endTime` ('HH:MM', 24h). Only present on tasks made by the WhatsApp import; `sanitizeTask()` keeps them when valid and never adds them to other tasks. Older app versions drop them on save, which is harmless. See §12. |
| `KEY_CUSTOM_LINKS` | `cos_custom_links` | Subject vault items `{ subject, code, color, resources: [...] }` |
| `KEY_BACKUP_SNAPSHOTS` | `cos_backup_snapshots` | Array of rollback snapshots for instant undo/restore |
| `KEY_THEME` | `cos_theme` | Current theme key (`paper-slate` or `midnight-ink` — legacy names alias into these, see §7) |
| `KEY_NOTIF_PREFS` | (see `loadNotifPrefs`) | Per-category notification preferences — also drives the server-side push job, see §10 |
| `KEY_PUSH_REGISTERED` | `cos_push_registered` | Local flag: has this device registered an FCM token for background push? See §10 |
| `KEY_ATT_TARGET` | `cos_att_target` | Attendance target %; now also synced to Firestore as `attTarget` so the background-push job can read it, see §10 |
| `KEY_ATT_V2_STATE` | `cos_att_v2_state` | Local only, never synced: which attendance math this device shows, `{ mode: 'v2' \| 'v1', decidedAt }`. v2 = ERP-exact numbers derived on every read from the three v1 stores (`buildAttendanceV2FromV1`); no stored v1 data is changed. Missing = a student with data sees the one-time preview; one with none starts on v2. |
| `KEY_ATT_REASSIGN_LOG` | `cos_att_reassign_log` | Local only, never synced: undo log `[{ date, from, to, status, at }]` for unmatched old marks the student moved to a subject (Settings → Attendance). Moving renames the mark's key in `cos_attendance`; refused if that subject already has a mark for the class. |
| `KEY_SYNC_LAST_PUSHED` | `cos_sync_last_pushed` | Local only, never synced: the three attendance maps (attendance, attendanceBaseline, attendanceLive) as last pushed to / received from Firestore. pushLocalDataToCloud diffs against it and sends FieldValue.delete() for removed paths, because set(merge:true) never deletes map keys. Missing = no deletes sent. If attendance is suddenly empty, none of its deletes are sent. For attendanceBaseline and attendanceLive, deletes are skipped only when the map is now empty and the last pushed copy had more than one entry, so clearing the only entry does send its delete. |
| `KEY_ATTENDANCE_V2` | `cos_attendance_v2` | Reserved for the stored v2 attendance (per-session records + ERP snapshots). Not written yet. |
| `KEY_SYLLABUS` | `cos_syllabus` | Syllabus tracker (v196). ARRAY `[{ subjectKey, subjectName, examDate, updatedAt, topics: [{ id, title, status: 'todo'\|'done'\|'revised', importance: 1\|2\|3, marks?, doneAt?, revisedAt? }] }]`. Synced to Firestore as `syllabus` and included in backups. Always cleaned through `sanitizeSyllabus()`. See §13. |
| `KEY_HOLIDAY` | `cos_holiday` | Holiday mode (v203). `{ on: boolean, since: 'YYYY-MM-DD', until: 'YYYY-MM-DD' \| null }`; `until` is the first day classes are back (exclusive). CD-04 rework: `since` may be a future date (a planned break, `isHolidayScheduled()`; it starts by itself); the dialog asks First day off / Last day off and stores `until` = last day + 1, shape unchanged. While active: Today shows `.holiday-banner` with End early (`endHolidayEarly()`), schedule and attendance panels hidden, `body.holiday-mode` warm palette (`applyHolidayVibe()` in `renderPage`); ongoing tasks (no deadline) rest unless the optional task field `keepInHoliday: true` is set (`isTaskPausedForHoliday()`, display only, kept by `sanitizeTask`); Daily Briefing shows `holidayBriefingHTML()` (deadlines up to `until`, overdue too, plus kept tasks). Dated tasks and their reminders are never hidden. Follow-up: the off value may carry `endedOn: 'YYYY-MM-DD'` (set by `setHoliday(false)` only when the break had started; read by `holidayEndedOn()`) for the one-day welcome-back card on Today (dismissed via `cos_notified_history` key `card_holiday_back_<date>`); auto-end no longer toasts. Countdown card/alerts rest during a break unless the exam is within 7 days (`holidayHidesCountdown`). Display-only switch: `isHolidayActive(date)` / `timetableForDisplay()` hide classes on Today, Calendar, Summary, Ask Desk and reminders; `loadTimetable()` is never guarded, so editors, sync, backup and attendance always see the real timetable. Missing or malformed = off (`loadHoliday()`). Auto-off via `checkHolidayExpiry()` on open, a new day, sync and restore. Synced as `holiday` (in the change-detection hash) and included in backups; the push job reads it too (§10). |
| `KEY_EMAIL_LINK_PENDING` | `cos_email_link_pending` | Email-link sign-in. `{ email, sentAt }` for the link this browser asked for. If present when the page opens from a sign-in link, sign-in finishes on its own; if missing (iPhone Safari vs home-screen app, other device), the link is kept in memory and the student chooses: sign in here (retype email) or copy the link to paste in the installed app (Settings → Sign in with email). Cleared on success. Device-only: not synced, not in backups. Locked by `tests/verify_email_link_signin.mjs`. |

---

## 6. How to Run Automated Verification

Deterministic suites are ESM Node.js scripts with no browser dependency — run them from the project root:

```bash
# Run Master Codebase Regression Suite (14 Core Scenarios)
node tests/verify_master.mjs

# Run Gap Fix Board Suite (5 Scenarios)
node tests/verify_gap_fixes.mjs

# Run Subject Normalization Suite (11 Scenarios)
node tests/verify_subject_normalization.mjs

# Run Background Push Notifications Suite (12 Scenarios)
node tests/verify_push_notifications.mjs

# Or all four together:
npm test
```

Browser-based suites (`npm run test:visual`, `npm run test:pwa-smoke`, `npm run test:smoke`, and therefore `npm run release:check`) require Playwright with a matching-OS Chromium build — see §9 for a known limitation running these through a cross-OS bridge.

---

## 7. Visual Identity & Theme System (current, as of the Plum Rebrand)

### 🔹 Design Direction & Folio Monogram
- **Philosophy:** Quiet Cafe Editorial / Academic Stationery — "Quiet Study Desk."
- **Folio Monogram Vector Logo:** Archival 'C' arc with precision desk horizon rule and center focus node. Canonical source is `favicon.svg`; `index.html`'s inline topbar logo re-draws the same path with `stroke="currentColor"` so it always follows the active theme's accent automatically.

### 🔹 Theme System — consolidated to 2 production themes
Earlier iterations shipped up to 6 named themes (Paper Slate, Midnight Ink, Espresso Desk, Sandstone Notes, Nordic Frost/Forest Study, Misty Mint) across several redesigns. **The current production system exposes only 2**: `paper-slate` (light) and `midnight-ink` (dark). All legacy theme names are aliased into one of these two via `LEGACY_THEME_MAP` (in both `app.js` and the `<head>` bootstrap scripts of `index.html`/`404.html`) purely for backward compatibility with old `localStorage` values — there is no user-facing way to pick a legacy theme anymore. The Settings page's theme-swatch preview cards (`renderSettings()`, `.theme-swatch`) hardcode literal swatch colors on purpose (they must show the true color regardless of the currently active theme) and must be kept in sync with the tokens below by hand.

### 🔹 Palette & Token Specifications (current)
- **Clarity Light (`paper-slate`):** Base `#F6F1E8`, Surface `#FFFDFC`, Subtle/Well `#ECE4D7`, Ink `#2A241F`, Secondary `#5E5449`, **Brand/Accent (plum) `#7A2E3D`**, Amber `#B48852`.
- **Clarity Dark (`midnight-ink`):** Base `#171412`, Surface `#221D19`, Subtle/Well `#2B241F`, Bone `#F3ECE3`, Secondary `#C8BEB1`, **Brand/Accent (rose) `#C97E8C`**, Caramel `#D2A56B`.
- **Token chain:** `--raw-brand-1` (the literal hex above) → `--color-action-primary` → `--brand-primary` / `--accent` (the names actually used throughout `style.css` and `app.js`). Text-on-brand uses `--raw-ink-inverse` → `--color-action-primary-text` → `--brand-primary-text` (`#F8F4EE` light / `#171412` dark).
- **⚠️ Rebrand history & the trap to avoid:** The brand accent has changed hue more than once (an earlier "teal geometric CD mark," then a dark forest-green "Pine `#2F4A3D`" era, now plum). Each time, the CSS custom properties were updated but **several other surfaces were not**, and stayed stale for months without anyone noticing because nothing renders them side-by-side with the live app: the entire app-icon set (`favicon.*`, `icon-192*.png`, `icon-512*.png`, `apple-touch-icon.png`), `manifest.json`'s `theme_color`, the static `<meta name="theme-color">` and pre-paint hydration script in `index.html`/`404.html`, the two runtime `theme-color` meta syncs in `app.js` (`initTheme()`/`setTheme()`), and the Settings page's own theme-swatch preview swatches. **Any future accent-color change must grep the whole repo for the outgoing hex value** (icons, `manifest.json`, both meta-theme-color call sites, both swatch blocks in `renderSettings()`) — a CSS-only change is not a complete rebrand. `badge-96.png` is the one exception: it must stay a plain monochrome/transparent PNG (Android re-tints it itself for the notification shade), never recolored to match the brand.
- **Geometry & Control Radii:** Base card/input radius `14px`; button radius `12px`; hairline dividers `--border-rule: #D8CCBD` (Light) / `--border-rule: #3A312A` (Dark).

### 🔹 Accessibility & State Parity
- **Measured WCAG Contrast:** Body Text `13.62:1` (Light) / `15.65:1` (Dark) — Exceeds WCAG AAA.
- **Pre-Paint Theme Hydration:** Synchronous `<head>` script inspects `localStorage` and falls back automatically to system `window.matchMedia('(prefers-color-scheme: dark)')` with no noticeable flash during normal reload and navigation.
- **Multi-Surface Icon Coverage:** `manifest.json` includes `192×192` and `512×512` PNG app icons (`any` + `maskable` purposes) and `apple-touch-icon.png`. Every icon file must be pixel-consistent with the current brand tokens above (see the rebrand-trap note).

---

## 8. Global UI Chrome — Floating Action Button (FAB)

- `index.html` renders a single global "+ Add Task" FAB (`.fab`, `showAddTaskModal()`) inside the persistent app shell — it appears on every page by default and is draggable/repositionable on mobile (`setupFABDrag()`, position saved to `localStorage['fabPosition']`).
- **The Tasks & Deadlines page (`page === 'assignments'`) is the one exception**: that page already has its own always-visible "+ Add Task" header button doing the identical action, so showing the FAB there too produced a visibly redundant triple-CTA (header button + empty-state card's own button + the FAB, sometimes only a few pixels apart). `navigate()` now toggles `fabEl.style.display = 'none'` specifically when routing to `'assignments'`, and restores it (empty string, reverting to the CSS `display: flex`) on every other page. If a future page ever grows its own permanent "Add Task"-equivalent header control, extend this same check rather than special-casing the FAB again elsewhere.
- The FAB's `.content-area` bottom padding (`--fab-safe: 66px` combined with `--nav-h`) only guarantees clearance from the very end of a page's scroll — it does **not** guarantee a fixed-position FAB never visually sits near arbitrary mid-page content on first load, since that depends on viewport height and how much content renders above the fold (e.g. the Dashboard's setup checklist can end up rendering only a couple of pixels above where the FAB sits on some phone heights). This is an inherent trade-off of any fixed-position overlay, not a regression to chase every time it's noticed — only fix it where a control is provably unreachable or two identical actions are stacked, as above.

---

## 9. Known Gaps — Read Before Assuming Something Is Broken

These are real, currently-accepted limitations, not oversights waiting to be silently "fixed":

- **Foreground notifications and background push now coexist.** The original 60-second `setInterval` (`checkScheduledNotifications()`/`checkNoticeNotifications()`) still covers the tab-open case. As of this version, background (app-closed) push is also implemented — see §10 for the full architecture. The one category NOT covered server-side is "new notice" alerts (`checkNoticeNotifications()`/`triggerNoticeNotification()`); that stays foreground-only by design, see §10.
- **The Playwright suites (`test:visual`, `test:pwa-smoke`, `test:smoke`, and therefore `release:check`) cannot run through a cross-OS automation bridge to this Windows machine.** The `node_modules/.bin/playwright` shim's OS-detection falls through to `node.exe` on Linux (a shim-generation quirk, not a Windows-vs-Linux distinction that matters otherwise) — bypass it with `node node_modules/@playwright/test/cli.js test ...` directly. Even with that bypass, this device's bridged Linux side has no Linux Chromium cached under `~/.cache/ms-playwright/`, and downloading one is blocked by the network egress allowlist (`cdn.playwright.dev` is not allow-listed) — that part is a genuine environment restriction, not something fixable from inside a session. These suites run fine natively in a normal Windows terminal on this machine (assuming `npx playwright install` has been run there at least once); they just cannot be executed by an agent working through this particular bridge.
- **CI runs tests on every push to `main` and every pull request** (`.github/workflows/test.yml`: Node 22, `npm ci`, `npm test`, then Chromium + `npm run test:pwa-smoke`). `test:visual` is not in CI (its screenshots are Windows-rendered). `.github/workflows/push-notifications.yml` is a separate scheduled notification job, not a test runner.
- **GitHub Actions run logs cannot be fetched through this bridge.** `gh run view --log` (and `gh api .../logs`) redirect to Azure Blob Storage (`*.blob.core.windows.net`) to actually stream the log text, and that host is not reachable from this device's bridged shell (same class of restriction as the Playwright/`cdn.playwright.dev` block above — confirmed with a plain `curl` returning no connection at all, not an auth error). `gh run list`/`gh run view` (without `--log`) still work fine for status/conclusion/step-level info — only the actual stdout/stderr text of a run is unreachable. To read what a workflow actually printed, check the Actions tab in a real browser instead.

---

---

## 10. Background Push Notifications (Firebase Cloud Messaging + GitHub Actions, no Cloud Functions)

### Why not Firebase Cloud Functions
Cloud Functions requires the Blaze (pay-as-you-go) billing plan — a card on file, even though actual usage here would stay $0 given the free-tier quotas. To avoid requiring the project owner to enable billing at all, the scheduled server-side evaluation job runs as a **free GitHub Actions cron** in this repo instead of a Cloud Function. FCM itself (sending/receiving pushes) is free on any Firebase plan, including Spark — only the *Cloud-Functions-as-the-scheduler* piece needed Blaze, and Actions replaces that piece for $0.

### Architecture
- **Client (`app.js`)**: `registerBackgroundPush()` (Settings → Notifications & Study Alerts → "Enable Background Push") requests browser notification permission via the existing `requestNotificationPermission()` flow, gets an FCM token (`firebase.messaging().getToken({ vapidKey })`), and stores it at `/users/{uid}/fcmTokens/{token}`. Foreground messages are routed through the existing `dispatchNotification()` via `initForegroundPushListener()`'s `onMessage` handler, so foreground and background pushes look identical to the user.
- **VAPID key**: a public Web Push key pair generated once in Firebase Console → Project Settings → Cloud Messaging → Web Push certificates. The public key lives in `firebase-config.js` as `window.CAMPUS_OS_FCM_VAPID_KEY` (safe to expose client-side, same trust level as `apiKey`).
- **Firestore**: `/users/{uid}/fcmTokens/{token}` (registered devices) and `/users/{uid}/notifState/scheduled` (server-side dedupe state, mirrors the client's `cos_notified_history` idea) are both already covered by the existing `match /users/{uid}/{document=**}` rule — **no `firestore.rules` change was needed**.
- **Server-side job (`scripts/push-notifications/send-notifications.js`)**: **schedule removed 2026-10-28, manual (`workflow_dispatch`) only.** Closed-app reminders come from `push-worker/` (Cloudflare). The job's `FIREBASE_SERVICE_ACCOUNT` secret was invalid JSON since at least 2026-10-10 (runs "succeeded" doing nothing), and it reads every user doc + one `notifState` doc per user per run, which every 15 min passes Firestore's free 50K reads/day at ~260 users. Was: run every 15 minutes by `.github/workflows/push-notifications.yml`. For every user doc in `/users`, it mirrors the same 5 rules `checkScheduledNotifications()` runs client-side — task upcoming/overdue, class starting soon, low attendance, daily summary — against that user's already-synced Firestore fields, and sends via `admin.messaging().sendEachForMulticast()` to their registered tokens. Dead tokens (Firebase reports `messaging/registration-token-not-registered`) are pruned automatically. Low-attendance rule: when the user doc has `attSummary` (`{ pct: '69.27', isSafe, attended, held, target, updatedAt }`, written by `pushLocalDataToCloud` only while the device is on the ERP-exact attendance math), the job alerts on that, the same overall % the app shows; otherwise it falls back to counting daily marks. The app never reads `attSummary` back and it is not part of the sync change-detection hash. Holiday mode: when the synced `holiday` covers the IST date (`isHolidayActive()` in the job, same rule as the app), class reminders and the low-attendance alert are skipped.
- **`data.js` reuse, not duplication**: the job needs `TIMETABLE`/`ASSIGNMENTS`, which live in `data.js` as ES module exports (`export const ...`) — but the repo's `package.json` declares `"type": "commonjs"`, so a plain `require()`/`import()` of `data.js` from this CommonJS script would throw. Rather than hand-copy those datasets into `scripts/push-notifications/` (a second copy that could silently drift from `data.js`, the same class of bug documented in §7's rebrand-trap note), the job's `loadDataJs()` reads `data.js`'s source text and executes it in an isolated `vm` context at run time — genuinely reading the same single source of truth the live app imports, every run, with nothing to keep in sync by hand.
- **Timezone**: all date/time comparisons use a hardcoded `Asia/Kolkata` timezone (`scripts/push-notifications/send-notifications.js`'s `TIMEZONE` constant). This whole app targets one specific Indian college's timetable with no per-user timezone field synced anywhere — a single fixed zone is a deliberate simplification, not a general multi-timezone design. If this app is ever used across timezones, this is the first thing that needs revisiting.
- **Service worker (`sw.js`)**: `importScripts` loads `firebase-app-compat.js` + `firebase-messaging-compat.js` (same 10.8.0 version as the rest of the app), `firebase.initializeApp()` uses the same public config as `firebase-config.js`'s default (hardcoded here since a service worker has no `window` to read that file's override logic from, and this static site has no build-time env substitution anyway). `messaging.onBackgroundMessage()` shows the notification manually (data-only messages, full control over icon/badge/tag, consistent with the rest of the app). The **pre-existing** generic `self.addEventListener('push', ...)` handler (previously dead code — nothing ever called `pushManager.subscribe()`) is still there for any future non-FCM push sender, now guarded to skip payloads shaped like an FCM envelope so a real push never produces two notifications.

### Deliberately out of scope for v1
- **"New notice" pushes.** `NOTICES` is static content in `data.js`, baked in at deploy time and identical for every user — there's no per-user Firestore data to key a dedupe check off without duplicating that content server-side too. This category stays foreground-only (`checkNoticeNotifications()`), same as before this feature.
- **Preset `ASSIGNMENTS` with real entries.** The job *does* merge `ASSIGNMENTS` + `assignmentStatuses` the same way the client's `allTasks()` does, for parity — but `ASSIGNMENTS` is empty in the current `data.js`, so in practice every pushed task reminder today comes from `customTasks`. If `ASSIGNMENTS` is ever populated with real preset entries again, this path already works, but hasn't been exercised.
- **Arbitrary scale.** `db.collection('users').get()` reads every user doc every run — fine at this app's actual size (one class), not something to scale up without pagination/collection-group changes.

### One-time setup still required (see also the note in `.github/workflows/push-notifications.yml`)
1. **VAPID key** — Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → generate, paste the public key into `firebase-config.js`'s `CAMPUS_OS_FCM_VAPID_KEY` (already done for the first key at the time this section was written — regenerate and replace there if it's ever rotated).
2. **`FIREBASE_SERVICE_ACCOUNT` GitHub secret** — Firebase Console → Project Settings → Service Accounts → Generate new private key (downloads a JSON file) → paste its full, unmodified contents as a repository secret named `FIREBASE_SERVICE_ACCOUNT` (GitHub repo → Settings → Secrets and variables → Actions). Until this secret exists, the scheduled job runs, logs a friendly "nothing to do" message, and exits 0 — it does not fail loudly, so don't mistake a quiet green Actions run for confirmation that push notifications are actually being evaluated.
3. Deploy hosting as usual (`firebase deploy --only hosting`) so the client-side changes (FCM SDK, VAPID key, service worker) go live. The GitHub Actions workflow itself needs no `firebase deploy` step — it runs directly from the repo.

If a rule inside `checkScheduledNotifications()` in `app.js` ever changes, mirror the change in `evaluateUser()` inside `scripts/push-notifications/send-notifications.js` — the two are hand-kept in sync, there's no shared module between client and job for this logic.

---

---

## 11. Timetable OCR Scan — Preprocessing & Parsing Robustness Pass

Two independent Claude Code sessions each targeted the same real-world scan failure modes (camera skew, uneven lighting/shadows, dark-theme screenshots, single-institution-only subject vocabulary) around the same time — one directly in this session, one as a since-closed draft PR (#33, branch `claude/gifted-feynman-s1s33y`). Rather than merge both wholesale (which would have left two competing deskew/lighting implementations fighting over the same code), the non-overlapping parts of each were combined into one pass:

- **Deskew** — `detectSkewAngle()` / `rotateCanvasByAngle()` (this session's own implementation): scores candidate rotation angles (±12°, 0.5° steps) on a downscaled copy via row-wise ink-density variance, applies the best one to the full-resolution canvas. Full 4-corner perspective correction was deliberately **not** attempted — no image library in this project, and hand-rolling homography in canvas was judged too risky for this pass.
- **Local contrast (shadow/glare handling)** — 48×48px tile-based local-contrast normalization, blended 50/50 with the pre-existing global S-curve (never fully replacing it, so flat/near-blank tiles aren't amplified into noise).
- **Sharpening** — a conservative unsharp-mask pass (3×3 box-blur reference, amount capped at 0.4) to recover edge crispness lost to smartphone camera softness.
- **Dark-theme auto-invert** — `isDarkDominantForInvert(meanGray)` (threshold: mean < 100), ported from PR #33: inverts light-text-on-dark screenshots (e.g. a Notion-exported timetable) before the existing dark-text-on-light-tuned contrast stretch runs.
- **Subject-abbreviation legend parsing** — `parseSubjectAbbreviationLegend()`, ported from PR #33: mirrors `parseFacultyLegend`'s pattern for the "Subject | Abbreviation | Lab | Hall No." table many printed timetables include, so abbreviations outside the hardcoded single-institution `CANONICAL_SUBJECT_MAP` can still resolve from that scan's own legend. Wired through `normalizeSubjectIdentity(..., facultyLegend, subjectLegend)` and threaded through `reconstructTimetable2DGrid` / `parseTimetableFromGrid` / `extractTimetableFromImage`.
- **Digit/letter OCR-confusion correction** — `correctDigitLetterConfusion()`, ported from PR #33: reuses the attendance-pipeline's existing 0/O, 1/I, 5/S, 8/B correction table for the timetable path. Only invoked on a token that already failed both the canonical map and the scan legend, and only kept if the corrected token then resolves — never invents a name.
- **Review-modal provenance marker** — schedule entries carry a `subjectInferred` flag (ported from PR #33, set when a subject resolved via the scan legend or a digit-confusion correction rather than a direct/mapped read), shown as a small "✨ inferred" tag in the timetable preview modal so the user knows to double-check it. Cleared automatically if the user edits the field.
- **Vision-based AI fallback** — `AIService.generateContentFromImage()` (this session's own addition): when the deterministic parser's result is mostly uncertain (`uncertainRatio >= 0.4`), sends the actual photo (not just OCR-derived text) to Gemini via its `inline_data` image-part API, tried before falling back to the pre-existing text-only repair, which itself falls back to the raw deterministic result. Only active when a Gemini key is already configured (`window.CAMPUS_OS_GEMINI_KEY`) — a bigger privacy step than the text-only repair, since the photo leaves the device, so this was raised to the project owner explicitly before being built rather than added silently.
- **Mobile camera hint** — `input.capture = 'environment'` on the timetable-upload file input, defaulting mobile browsers to the rear camera (gallery selection still works).
- **Test portability fix** — every `tests/verify_*.mjs` file previously hardcoded `D:/Clarity Desk/...` (a Windows dev-machine absolute path), so `npm test` could not run on any other checkout. Replaced with `path.dirname(path.dirname(fileURLToPath(import.meta.url)))`-derived paths (ported from PR #33) across all 13 files.
- **New suite**: `tests/verify_ocr_scan_improvements.mjs` (23 scenarios as of §11b below) covers the ported pieces (dark-invert threshold, legend parsing including not misreading the adjacent faculty-legend table, digit-confusion correction, and `subjectLegend` threading end-to-end through `reconstructTimetable2DGrid`) plus §11b's root-cause fixes. Wired into `npm test` and `release:check`. The deskew/local-contrast/sharpen/vision-fallback pieces built directly in this session don't have image-level tests — see the known limitation below.
- **Known limitation**: none of this pass's pixel-level preprocessing (deskew, local contrast, sharpen, dark-invert) has been verified against real photographed JPEGs — this project has no canvas/image-decoding library in its Node test toolchain (browser-only Canvas2D APIs), and the sandbox this work was done in had no working browser/Chromium either. Test before relying on it: a deliberately tilted photo, a poorly-lit one (shadow or glare), and a dark-theme screenshot, on both desktop and mobile.
- **Deliberately out of scope**: full 4-corner perspective/keystone correction; applying any of this pass's preprocessing improvements to the separate attendance-scan OCR pipeline (`preprocessAttendanceImageForOCR`); precaching Tesseract.js so first-time OCR works fully offline (currently CDN-only, unrelated to this pass).

### 11b. Root-Cause Fix — Wrong Day/Time/Cell Placement on Real Grids

A follow-up debugging pass, triggered by a real bug report ("scanner places text in the wrong rows/cells; the final timetable doesn't match the source image"), traced a faithful reconstruction of the MGM University SY-AIDS photo (the "more common" white/photographed style, not the Notion-screenshot style) through `reconstructTimetable2DGrid` and found four distinct, real bugs in the header/cell-mapping logic that #11 above never exercised — none of them about image preprocessing:

1. **Split start/end header rows doubled time columns.** Real timetables commonly print a period's start and end time on two separate physical header lines ("10:00 AM" then "11:00 AM" stacked directly below it) rather than one "10:00 - 11:00" line. `detectDayAndTimeTokens`'s single-timestamp branch treated each line as its own independent column with a synthesized +1h end, so a 6-period timetable produced ~12 bogus, overlapping columns instead of 6. Fixed by `mergeSplitHeaderTimeTokens()`, which collapses a vertically-stacked (Layout A) or horizontally-adjacent (Layout B) pair of single-timestamp tokens back into one real column, using the earlier token's start and the later token's own start (not its synthesized default) as the end. Only ever merges tokens that failed to resolve as a real range on their own (`isRangeMatch === false`); an already-clean single-line range is never touched.
2. **Cross-row word fusion.** `detectDayAndTimeTokens`'s pairText/tripText lookahead joined `words[i]`+`words[i+1]` blindly, regardless of whether they were on the same physical line — on a tightly-packed multi-row header, this could fuse one row's trailing "AM" with the *next* row's leading number into a bogus token. Fixed with a new `wordsOnSameLine()` guard (scaled to each word's own bbox height, not a fixed pixel gap) before any lookahead pairing is attempted.
3. **Cross-column word fusion, same line.** Even after #2, a number that's already independently valid (e.g. "10:00" needs no AM/PM to parse) left its own trailing "AM" dangling — and since it's on the *same* line as the *next* column's number, `wordsOnSameLine` alone didn't stop it from wrongly fusing forward with that next column's leading digits. Fixed by having a token that resolved via the single-timestamp branch immediately try to consume its own trailing bare "am"/"pm" word first, before the outer loop can reach it.
4. **Median-based column-gap threshold skewed by Recess columns.** `xGapThresholdA`/`yGapThresholdB` (the thresholds deciding whether two adjacent OCR clusters are one cell or two) were derived from the *median* detected column width/row height. A real timetable's Recess columns make spacing uneven across one header row — two genuinely-adjacent periods sit close together, but a period separated from its neighbor by a Recess column sits much farther apart — so the median gets pulled up by the wider Recess-adjacent gaps and becomes too generous for the tight, no-recess-between-them pairs, letting two short, centered labels in neighboring narrow columns (e.g. "DEMP" and "DS") wrongly merge into one cell. Fixed by using the **minimum** detected column width/row height instead of the median.

Also, while auditing #1-3: `normalizeTimetableTime()` didn't handle the 12-hour-clock midnight rule ("12:00 AM" should be hour 0, not 12) in either its range or single-timestamp branch — fixed alongside, since the review-modal 12-hour editing below exercises exactly that input shape.

**Review modal now displays/accepts 12-hour AM/PM**, matching the rest of the app's display convention (`formatDisplayTime()`, already used elsewhere, was simply never wired into this specific modal before). The time/end `<input>`s in `renderTimetablePreviewModalContent` show `formatDisplayTime(item.time)` (e.g. "1:45 PM") instead of the raw stored "13:45"; `updatePreviewEntry` parses whatever the user types back through the same `normalizeTimetableTime()` the OCR extraction itself already relies on before writing to `pendingExtractedSchedule`. **The stored shape is unchanged** — `cos_custom_timetable`'s `time`/`end` fields stay 24-hour `"HH:MM"` internally; only this one modal's display/edit layer changed. `confirmSaveExtractedTimetable`'s validation toast was updated to match (`formatDisplayTime(item.time)`).

**Verified against**: a realistically-proportioned synthetic reproduction of the MGM University grid's actual structure (3-row split header, a Recess column, narrow ~150px period columns with short centered subject-code text, a multi-period-merged cell) — not the literal uploaded photo bytes, since this environment has no way to persist a pasted image to disk for a real Tesseract pass (confirmed by exhaustive filesystem/MCP-resource search; see the session transcript). All 4 bugs were found and the fixes verified by tracing this reproduction through the real pipeline code, not by inspection alone. Zero regressions across the full existing deterministic suite after these changes.

---

*This document is the definitive source of truth for the Clarity Desk codebase. All future enhancements should respect the local-first, zero-silent-write, and calm UX foundations established here. Keep §7's rebrand-trap note, §9's known-gaps list, and §10's setup/scope notes current — the whole point of this file is that the next person (or agent) doesn't have to re-discover them from scratch.*

---

## 12. Import from WhatsApp (deadline catcher, v192)

Students paste or pick an exported WhatsApp class-group chat; the app lists the exams, submissions, presentations and lecture changes it finds, the student reviews them, and only ticked rows become tasks.

- **Files**: `deadline-import.js` (pure parser + `.ics` builder, no DOM, lazy-loaded by `import()` so the `new Function` test harnesses that strip `app.js` imports keep working), `deadline-import-worker.js` (module worker used above 3,000 lines), `vendor/jszip.min.js` (JSZip 3.10.1, loaded by a script tag only when a `.zip` is picked). All three are cached on first use by the SW network-first branch (not at install, since the first-load precache change), so WhatsApp/zip import needs one online use before it works offline.
- **UI**: `showWhatsAppImport()` in `app.js` (Tasks header "From WhatsApp", the empty state, and a link at the top of the Add Task modal). Imported tasks are saved through `saveCustomTasks()` with subject General, the original message trimmed to 300 chars in `description`, priority high for exams. Undo removes exactly the imported ids.
- **Privacy (hard rule)**: the raw chat is never stored, uploaded, logged or synced. It lives only in local variables, the paste box, and the worker for the length of one scan. `tests/verify_deadline_import.mjs` checks the parser, worker, import block and SW share handler for storage/network/console calls.
- **Android share target**: `manifest.json` `share_target` POSTs the file to `./share-target`; `sw.js` keeps it in a memory variable (never the Cache API), redirects to `index.html?share=whatsapp#assignments`, and hands it over once on a `wa-share-get` message. If the worker restarted in between, the page just opens the normal first step. iPhone PWAs have no share target.
- **Tests**: `tests/verify_deadline_import.mjs` (in `npm test`), fixtures in `tests/fixtures/deadline-import/` (Android, iPhone, Web copy, 24-hour layouts).
- **Known limits**: Hinglish "kal" is ignored on purpose (yesterday or tomorrow). Task cards do not show `startTime` yet; the time is kept on the task and in the `.ics` export.

## 13. Syllabus tracker (v196)

- **Where**: a Syllabus card in each Subject Hub (`syllabusCardHTML`), a "Syllabus N%" note on the Subject Hubs cards, one line on Today (`syllabusTodayLine`). "+ Add a subject" (Subject Hubs → Manage, and the empty state) creates a syllabus-only subject for students without a timetable; `getSubjectList()` source 5 turns syllabus entries into subjects.
- **Stored as an array on purpose**: cloud sync writes `set(merge:true)`, which deep-merges maps and never removes keys, so a deleted topic in a map would come back. Arrays are replaced whole. `tests/verify_syllabus.mjs` checks the round trip.
- **Subject matching**: `subjectKey = getCanonicalSubjectKey(subjectName)`, so "DBMS" and "Database Management Systems" are the same entry. Deleting a subject card hides its key (existing behaviour) and so hides the syllabus without erasing it; adding the subject again unhides it.
- **No silent writes**: topics only arrive through paste → preview → Save (`parseSyllabusPaste`, `confirmSyllabusPaste`). Every other change is a tap the student makes. Reset progress and Remove syllabus ask first.
- **Weightage**: importance Low/Medium/High (1/2/3) and optional marks. Progress is weighted by marks when every topic has them, otherwise by importance. The paste parser reads "10 marks", "(10m)", "[12 Marks]", "(High)", "(Low)", "★", "imp" at the end of a line.
- **Exam date**: per subject, optional; falls back to the Settings countdown date.
- **Pop-ups** (`showCelebration`): subject done, subject fully revised, whole syllabus done (2+ subjects). Once a day each, seen-markers in `cos_notified_history` with a `card_syllabus_` prefix.
- **Sync conflicts**: two devices editing within the 2.5 s push debounce means last write wins, same as tasks.
- **Ask Desk (v197)**: still on-device rules, no AI. `syllabusIntent()` runs before the general `INTENTS` (so "important topics" isn't notices and "finish DBMS before the exam" isn't the exam date) and steps aside when the question mentions attendance, classes, labs or tasks. New intents: `syllabus_overview`, `subject_syllabus` (follow-ups like "what about OS?" work), `syllabus_revise`, `syllabus_important`, `syllabus_pace`, `syllabus_topic` (fuzzy topic-name lookup; only fires when a topic actually matches). `study_plan` now picks 3 topics with `sylPicks()`: score = (importance + marks/5, capped at 4) × (1 + 10/(days to exam + 1)); not started first, done-but-not-revised ×1.5 in the final 7 days (×0.4 before); max 2 per subject. Subject info, weekly plan, today summary and the focus radar each gain one syllabus line. Buttons call `openSubjectSyllabus()`; nothing in chat ticks a topic. Tests: the syllabus section of `tests/verify_ask_desk.mjs`.
- **Scan a photo or PDF (v198)**: "Scan a photo or PDF" in the Add topics window. Reuses `AIService.extractStructuredFromImage` with the `{"schedule":[...]}` answer shape (rows are topics, like the attendance scan); `AIService` itself is unchanged. `SYL_SCAN_PROMPT` asks for topics only, comma lists split into rows, marks/importance only when printed, and skips objectives, outcomes, hours, credits, assessment and textbooks. `topicsFromSyllabusScan()` cleans rows through `parseSyllabusLine`, keeps valid marks (0–500) and importance words, and drops duplicates. The result only fills the paste preview (with a "Read by AI, check each row" note); nothing is saved until Save. Images over ~2200 px are shrunk to JPEG first; files over 8 MB, non-image/PDF files and offline use are refused with a plain message. PDFs work only with Gemini (the other providers take images). A late answer after the window is closed is ignored. Live check on 2026-10-20 with a made-up DBMS syllabus page: 13/13 topics, marks and ★ read, objectives/textbooks/assessment skipped, 24.5 s on gemini-flash-lite-latest. The live proxy refuses `localhost` (403), so a live run has to open the page at the live origin, as `verify_ocr_test_kit.mjs --proxy` does.

## 14. Growth and safety pass (v218–v225, 2026-10-27)

Read this before touching addresses, storage keys, the vault or sync. Plans and the audit behind it are in `Claude outputs/` (gitignored): `AUDIT.md`, `GROWTH-PLAN.md`, `PLAN-*.md`.

- **One address (v218–219)**: `CANONICAL_ORIGIN = https://claritydesk.web.app`. `addressMoveAction()` runs first in `init()`. On an `OLD_HOSTS` address (campusos-83365.web.app, both firebaseapp.com names, GitHub Pages) it redirects **only** when nothing but `MOVE_SAFE_KEYS` is stored, there is no query string, and it isn't an automated browser. Otherwise it shows the "new address" card (`cos_moved_prompt`, 3-day snooze). **Any new `cos_*` key the app writes on its own during a visit (bookkeeping) must be added to `MOVE_SAFE_KEYS`**, or old-address visitors stop being redirected. The share/canonical tags point at the new address. GitHub Pages is to be turned off around 2026-11-20. Test: `verify_canonical_origin.mjs`.
- **Usage counts (v220–221)**: GoatCounter site `sanghpal` via `sendBeacon` (no third-party script; Cloudflare Web Analytics still counts page views). Only names in `USAGE_EVENTS` and parts matching `/^[a-z0-9_-]{1,24}$/` are sent; there is no ID and no cookie. Live hosts only, never under webdriver. Settings toggle; `cos_usage` holds opt-out, first open, once-flags and an offline queue (max 30). `cos_usage` is never synced or backed up. A new event must be added to `USAGE_EVENTS`. Test: `verify_usage_events.mjs`.
- **"How many classes can you miss?" (v222)**: `bunkCalcAnswer()` wraps `computeNowGuidance()` (no new attendance math). It shows on the Welcome card and in the empty-Today setup card, and is hidden once a timetable exists or in self-study mode. Nothing is saved; the numbers live in memory. Event `bunk_calc_used`. Test: `verify_bunk_calc.mjs`.
- **Study Vault files (v223)**: uploads are `data:` URLs in `cos_custom_links`, max **1 MB** each (`VAULT_FILE_MAX_BYTES`), refused before reading. `saveCustomLinks()` returns false when storage is full; callers must show `VAULT_FULL_MESSAGE` and not "saved". **Files never go to the cloud**: `linksForCloud()` sends placeholders `{url:'', onDevice:true, fileId}`. **Cloud apply must use `mergeCloudLinks()`, never a plain write**, or the first sync deletes students' files. `fileId` = FNV-1a hash of the file, so renames on another device still match. Restore writes the vault last via `saveLinksFittingStorage()`. Real cross-device files would need Firebase Storage (not built). Test: `verify_vault_uploads.mjs`.
- **Study Vault files in IndexedDB (v229)**: file bytes live in IndexedDB (db `cos_vault`, store `files`, key `fileId`, value `{fileId, blob, bytes, mime, createdAt}`; not a localStorage key, so `MOVE_SAFE_KEYS` is unchanged). The entry in `cos_custom_links` becomes `{label, url:'', icon, isUpload, fileSize, fileId, idb:true, bytes, mime}` (`isVaultIdbFile`). Old `data:` URL entries stay valid. `vaultMigrateFiles()` on open moves them one at a time and rewrites an entry only after a byte-for-byte read-back. `vaultPlaceholder()`/`linksForCloud()` give the same cloud placeholder for both shapes (cloud copy unchanged); `mergeCloudLinks()` restores both. Limit 10 MB per file (`VAULT_IDB_MAX_BYTES`); if IndexedDB can't open (`vaultIdbOk === false`) everything is the v223 path with 1 MB. Backups carry IndexedDB files as `data:` URLs (old backup shape), smallest first up to 30 MB (`VAULT_BACKUP_FILE_CAP`); the rest become placeholders after a confirm. Restore puts `data:` files into IndexedDB first (`vaultLinksIntoIdb`), then `saveLinksFittingStorage()` as before. A blob is deleted only when no entry in `cos_custom_links` or `cos_cleanup_backup` points at it (open-time sweep: only if over a day old). Files open via `vaultOpenFile(fileId)` (blob URL download). Test: `verify_vault_idb.mjs`.
- **Slow network (shipped under v229, no bump: sw.js is not a precached app file)**: `sw.js` network-first (page, `.js`, `.css`) waits at most `NETWORK_WAIT_MS` (3 s) when a saved copy exists, then serves it; the network answer still updates the cache (`waitUntil` covers the `cache.put`). With no saved copy it keeps waiting. After one of this site's requests falls back, the next ones use their saved copies at once for `SLOW_NETWORK_MS` (30 s, `slowUntil`, worker memory only), so page → app.js → data.js costs one wait (~3 s), not three (~9 s). Only a fast same-origin `ok` answer ends it; gstatic answers and 404s don't. Tests: `verify_sw_network_timeout.mjs`, `pwa-smoke.spec.ts` test 5 (stalled network, app starts < 5 s).
- **Lighter first load (no cache bump: only sw.js and tooling changed)**: `sw.js` `PRECACHE_ASSETS` now lists the exact URLs the page requests (`app.js?v=N`, `style.css?v=N`, `firebase-config.js?v=N`, the five head icons `?v=N`) once each, so install and page share one download of `app.js` (the HTTP cache serves the second). `deadline-import*.js` and `vendor/jszip.min.js` left the list. `scripts/ship.mjs` now also bumps `?v=` inside `sw.js`, checks it against `CACHE_NAME`, and strips `?v=N` when building its `runtime` file set. Tests: `verify_hosting_files.mjs` (no duplicates, `?v=` matches `CACHE_NAME`).
- **App files from jsDelivr**: some Indian networks reach Firebase Hosting's CDN (Fastly, `199.36.158.100`) at a few KB/s or not at all, while Cloudflare is fast. `index.html`/`404.html` load `style.css` and `app.js` (and through it `data.js`, `deadline-import.js`) from `https://cdn.jsdelivr.net/gh/SanghpalBhakte/Clarity-Desk@<40-char commit>/`, with `onerror` fallbacks to `style.css?v=N` / `app.js?v=N` on this site. `sw.js` precaches the jsDelivr URLs. `firebase-config.js`, the WhatsApp worker and jszip stay on this site (a worker must be same-origin; relative `new Worker()`/script URLs resolve against the page). **`npm run ship` sets the commit**: after Dev Notes it points the three files at HEAD (own `chore:` commit) only if `app.js`/`style.css`/`data.js`/`deadline-import.js` differ from the pinned commit, pushes, then checks jsDelivr serves exactly those files before `firebase deploy` (a failure stops before deploy; re-run ship). Never hand-edit the commit. **The GitHub repo must stay public.** `tests/serve.mjs` rewrites the jsDelivr URLs to local so tests run the working tree; any other local server loads the last deployed app files. Test: `verify_hosting_files.mjs` (one commit everywhere, fallbacks, precache).
- **Load timing view**: open the app as `./?timing` (private tab for a first visit) to get an on-screen breakdown from the browser's own Performance API: page connect/first byte, first paint, `cd-app-ready` (marked at the end of `init()`), and per-server/slowest-file times. `showTimingReport()` saves and sends nothing; it only runs with `?timing`. Built 2026-10-28 because phone first visits took 10–60 s while a Cloudflare/Firebase speed test showed every file under 1 s on the same networks, so a host move was not justified. Test: `verify_timing_view.mjs`.
- **2026-10-28 cleanup**: Hosting `maxVersions` = 20 on both sites (set via the Hosting API; the console doesn't show it). GitHub secret `FIREBASE_SERVICE_ACCOUNT` deleted (the old push job is manual-only and would fail if run). Note: wrangler 4.154 turns `pages project create` run inside a Worker folder into a Worker deploy; run Pages commands from an empty folder.
- **Slow network (v230)**: `sw.js` network-first (page, `.js`, `.css`) waits at most `NETWORK_WAIT_MS` (3 s) when a saved copy exists, then serves it; the network answer still updates the cache. With no saved copy it keeps waiting. Test: `verify_sw_network_timeout.mjs`.
- **In-app browsers (v224)**: `isInAppBrowserUA()` (Instagram, Facebook, Snapchat, LinkedIn, LINE, WhatsApp, `; wv)`). The "You're inside …" card offers an Android Chrome intent link, iPhone steps and Copy link. Google sign-in is blocked there (Google refuses it); email sign-in still works. Test: `verify_inapp_browser.mjs`.
- **Sync failure notice (v225)**: the push ends in `onCloudPushOk`/`onCloudPushError`. A failure (not offline, not permission-denied) shows "Sync failed · Saved here" and one toast per visit until a push works again. Test: `verify_sync_failure.mjs`.
- **Still open**: share timetable with the class (needs a public Firestore store and new rules); WhatsApp link import into Subject Hubs (reuse `deadline-import.js`, review before saving); reminder prompt after the first class is saved; the `-win32`/`-linux` dashboard screenshots need `npm run test:visual:update` on Windows (they changed in v222).
