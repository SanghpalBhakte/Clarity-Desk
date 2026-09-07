# 🧠 CLARITY DESK — PROJECT MEMORY & ARCHITECTURAL KNOWLEDGE BASE

> **Version:** 3.0 Production-Ready (Post Timetable/Attendance OCR Overhaul, Plum Rebrand, and UX Consistency Pass)
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
├── tests/               # Automated regression + smoke test suites
│   ├── verify_master.mjs                          # 14-scenario core regression suite (Node ESM, no browser needed)
│   ├── verify_gap_fixes.mjs                        # 5-unit Gap Fix Board suite
│   ├── verify_subject_normalization.mjs            # 11 scenarios — canonical subject/OCR-variant merging
│   ├── verify_attendance_scan_row_reconstruction.mjs
│   ├── verify_bodytext_retry.mjs / verify_ocr_header_robustness.mjs / verify_multiline_split.mjs
│   ├── verify_residue_and_monday_recovery.mjs / verify_subject_code_and_faculty_legend.mjs
│   ├── verify_timetable_recess_count.mjs / verify_timetable_structure.mjs / verify_task_category_cleanup.mjs
│   ├── clarity-visual-verification.spec.ts / pwa-smoke.spec.ts / post-deploy-smoke.spec.ts   # Playwright (see §9)
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

### 5. Local/Offline Save Status Clarity
- **Root Cause**: The lone cloud icon in the topbar created ambiguity about whether data was being saved offline.
- **Fix**: Upgraded topbar indicator to a clear status pill: `[🟢 💾 Saved locally]` (collapsing to `[🟢 💾]` on small viewports with full tooltips).
- **Result**: Immediate student trust that data is safely preserved on-device.

---

## 5. Storage Schema & Keys Reference

| Key Constant | Storage Key Name | Description |
| :--- | :--- | :--- |
| `KEY_ATTENDANCE_BASELINE` | `cos_attendance_baseline` | Map of course code $\rightarrow$ baseline counts `{ present, totalCount, absent, lastUpdated }` |
| `KEY_ATTENDANCE` | `cos_attendance_records` | Historical daily log `{ "YYYY-MM-DD": { "CS201_1000": "attended" } }` |
| `KEY_ATTENDANCE_TARGET` | `cos_attendance_target` | Numerical target threshold (e.g. `75`, `80`, `85`) |
| `KEY_CUSTOM_TIMETABLE` | `cos_custom_timetable` | Day-indexed schedule map `{ 0: [], 1: [...slots], ... 6: [] }` |
| `KEY_PROFILE` | `cos_profile` | User profile `{ name, roll, batch, semester, branch, examDate }` |
| `KEY_TASKS` | `cos_custom_assignments`| Array of tasks `{ id, title, subject, dueDate, priority, status, taskType }` |
| `KEY_CUSTOM_LINKS` | `cos_custom_links` | Subject vault items `{ subject, code, color, resources: [...] }` |
| `KEY_BACKUP_SNAPSHOTS` | `cos_backup_snapshots` | Array of rollback snapshots for instant undo/restore |
| `KEY_THEME` | `cos_theme` | Current theme key (`paper-slate` or `midnight-ink` — legacy names alias into these, see §7) |
| `KEY_NOTIF_PREFS` | (see `loadNotifPrefs`) | Per-category notification preferences — foreground-only, see §9 |

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

# Or all three together:
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

- **Notifications are foreground-only.** `Notification.requestPermission()` plus a 60-second `setInterval` (`checkScheduledNotifications()`/`checkNoticeNotifications()`) only fire while the Clarity Desk tab is open. `sw.js` has a fully-built `push` event handler ready to show a system notification, but nothing in the app ever calls `pushManager.subscribe()` — there is no VAPID key and no backend that could send a push in the first place. Building true background push requires Firebase Cloud Messaging (or an equivalent), a stored per-device subscription/token, and a server-side trigger (e.g. a scheduled Cloud Function) — a deliberate feature addition with real infrastructure and cost implications, not a bug fix.
- **The Playwright suites (`test:visual`, `test:pwa-smoke`, `test:smoke`, and therefore `release:check`) cannot run through a cross-OS automation bridge to this Windows machine.** The `node_modules/.bin/playwright` shim's OS-detection falls through to `node.exe` on Linux (a shim-generation quirk, not a Windows-vs-Linux distinction that matters otherwise) — bypass it with `node node_modules/@playwright/test/cli.js test ...` directly. Even with that bypass, this device's bridged Linux side has no Linux Chromium cached under `~/.cache/ms-playwright/`, and downloading one is blocked by the network egress allowlist (`cdn.playwright.dev` is not allow-listed) — that part is a genuine environment restriction, not something fixable from inside a session. These suites run fine natively in a normal Windows terminal on this machine (assuming `npx playwright install` has been run there at least once); they just cannot be executed by an agent working through this particular bridge.
- **There is no CI.** No `.github/workflows` exist, so nothing runs any test tier automatically on push or PR — the deterministic `npm test` suite (30 scenarios) run manually before each merge is the only gate today.

---

*This document is the definitive source of truth for the Clarity Desk codebase. All future enhancements should respect the local-first, zero-silent-write, and calm UX foundations established here. Keep §7's rebrand-trap note and §9's known-gaps list current — the whole point of this file is that the next person (or agent) doesn't have to re-discover them from scratch.*
