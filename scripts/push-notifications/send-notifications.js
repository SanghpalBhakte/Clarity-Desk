#!/usr/bin/env node
"use strict";

// Clarity Desk — Background Push Notification Job
// ------------------------------------------------
// Run on a schedule by .github/workflows/push-notifications.yml (free
// GitHub Actions cron — no Firebase Cloud Functions / Blaze plan involved).
//
// For every signed-in, cloud-synced user this mirrors the same five rules
// app.js's checkScheduledNotifications() already runs client-side (task
// upcoming/overdue, class starting soon, low attendance, daily summary),
// using each user's already-synced Firestore document, and sends a push via
// Firebase Cloud Messaging to any devices they've registered. If a rule ever
// changes in app.js, mirror the change here too — see PROJECT_MEMORY.md.
//
// Deliberately excluded (v1 scope): the "new notice" push category. NOTICES
// is static content baked into data.js at deploy time (identical for every
// user, not per-user Firestore data), so there's nothing per-user to key a
// dedupe/read off here without duplicating that content server-side.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const admin = require("firebase-admin");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
// All of this app's real content (the SY-AIDS timetable, room codes, etc.)
// is for one specific Indian college with no per-user timezone field synced
// to Firestore, so a single fixed timezone for every user is a deliberate,
// documented simplification — not a general multi-timezone design.
const TIMEZONE = "Asia/Kolkata";

// ---- Load TIMETABLE / ASSIGNMENTS straight from the app's own data.js ----
// data.js is the single source of truth the live app itself imports as an ES
// module (`import { TIMETABLE, ... } from './data.js'` in app.js). The
// repo's package.json declares "type":"commonjs" for the browser build, so
// this plain CommonJS script can't require()/import() data.js directly.
// Executing its (trusted, first-party) source in an isolated VM context is
// the least-duplication way to read the same constants at run time without
// maintaining a second copy that can silently drift out of sync.
function loadDataJs() {
  const filePath = path.join(REPO_ROOT, "data.js");
  const src = fs
    .readFileSync(filePath, "utf8")
    .replace(/export\s+const\s+/g, "const ");
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  new vm.Script(src + "\nmodule.exports = { TIMETABLE, ASSIGNMENTS };", {
    filename: filePath,
  }).runInContext(sandbox);
  return sandbox.module.exports;
}

const { ASSIGNMENTS } = loadDataJs();

// ---- Firebase Admin init ----
function initAdmin() {
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) {
    console.log(
      "FIREBASE_SERVICE_ACCOUNT secret is not set yet — nothing to do. " +
        "See PROJECT_MEMORY.md for setup steps."
    );
    return null;
  }
  let creds;
  try {
    creds = JSON.parse(svcJson);
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON:", err.message);
    return null;
  }
  admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin;
}

// ---- Time helpers — all evaluated in TIMEZONE, matching how the client
// evaluates them in the user's own browser (new Date() there is implicitly
// local-time) ----
function nowParts() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = {};
  for (const p of fmt.formatToParts(new Date())) parts[p.type] = p.value;
  const hh = parts.hour === "24" ? "00" : parts.hour;
  const weekdayIdx = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    parts.weekday
  ];
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${hh}:${parts.minute}`,
    minutes: parseInt(hh, 10) * 60 + parseInt(parts.minute, 10),
    dayOfWeek: weekdayIdx,
  };
}

function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split("T")[0];
}

function dueDaysLeft(dateStr, todayStr) {
  if (!dateStr) return null;
  const [y1, m1, d1] = todayStr.split("-").map(Number);
  const [y2, m2, d2] = dateStr.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function timeToMinutes(t) {
  if (!t || typeof t !== "string") return 0;
  const parts = t.split(":").map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]))
    return 0;
  return parts[0] * 60 + parts[1];
}

function isBreakEntry(c) {
  if (!c || typeof c !== "object") return true;
  if (c.isBreak === true) return true;
  const type = (c.type || "").toLowerCase();
  const subject = (c.subject || "").toLowerCase();
  const code = (c.code || "").toLowerCase();
  if (type === "off" || type === "break" || type === "recess") return true;
  if (subject === "recess" || subject === "break" || subject.includes("lunch"))
    return true;
  if (code === "rec" || code === "break") return true;
  return false;
}

function sanitizeTaskLite(t) {
  if (!t || typeof t !== "object") return null;
  if (!t.id || !t.title) return null;
  return t;
}

// ---- Per-user rule evaluation ----
// Keep in sync with app.js's checkScheduledNotifications() if those rules
// ever change (see PROJECT_MEMORY.md's section on this feature).
function evaluateUser(data, notifiedKeys, time) {
  const notifications = [];
  const prefs = Object.assign(
    {
      taskUpcoming: "day_before",
      taskOverdue: "same_day",
      classReminders: "15_min",
      attendanceAlerts: "instant",
      dailySummaryTime: "08:00",
    },
    data.notificationPrefs || {}
  );

  const today = time.dateStr;
  const tomorrow = addDaysStr(today, 1);

  const customTasks = Array.isArray(data.customTasks)
    ? data.customTasks.map(sanitizeTaskLite).filter(Boolean)
    : [];
  const assignmentStatuses = data.assignmentStatuses || {};
  const presetTasks = ASSIGNMENTS.map((a) =>
    Object.assign({}, a, { status: assignmentStatuses[a.id] ?? a.status })
  );
  const tasks = [...presetTasks, ...customTasks].filter(
    (t) => t.status === "pending"
  );

  const push = (key, title, body, url) => {
    if (notifiedKeys[key]) return;
    notifications.push({ key, title, body, url });
  };

  // 1) Upcoming tasks
  if (prefs.taskUpcoming === "day_before") {
    tasks
      .filter((t) => !t.noDeadline && t.dueDate === tomorrow)
      .forEach((t) => {
        push(
          `upcoming_daybefore_${t.id}_${today}`,
          `Upcoming Task: ${t.title}`,
          `${t.subject || "Task"} · Due tomorrow! Keep going.`,
          "./#assignments"
        );
      });
  } else if (prefs.taskUpcoming === "same_day") {
    tasks
      .filter((t) => !t.noDeadline && t.dueDate === today)
      .forEach((t) => {
        push(
          `upcoming_sameday_${t.id}_${today}`,
          `Task Due Today: ${t.title}`,
          `${t.subject || "Task"} · Due today!`,
          "./#assignments"
        );
      });
  }

  // 2) Overdue tasks
  if (prefs.taskOverdue !== "off") {
    tasks
      .filter((t) => {
        if (t.noDeadline || (t.taskType === "mission" && !t.dueDate) || !t.dueDate)
          return false;
        return t.dueDate < today;
      })
      .forEach((t) => {
        const days = Math.abs(dueDaysLeft(t.dueDate, today) || 1);
        push(
          `overdue_${t.id}_${today}`,
          `Task Overdue: ${t.title}`,
          `${t.subject || "Task"} is ${days} day${days > 1 ? "s" : ""} overdue.`,
          "./#assignments"
        );
      });
  }

  // 3) Class reminders — only for users with real synced timetable data
  // (loadOfficialAidsTimetable() in app.js snapshots the full schedule into
  // customTimetable at the moment it's loaded, so this is the reliable
  // synced field to read; see PROJECT_MEMORY.md).
  if (
    prefs.classReminders !== "off" &&
    data.customTimetable &&
    typeof data.customTimetable === "object"
  ) {
    const dayClasses = (
      data.customTimetable[String(time.dayOfWeek)] ||
      data.customTimetable[time.dayOfWeek] ||
      []
    ).filter((c) => !isBreakEntry(c));
    const leadWindow =
      prefs.classReminders === "1_hour"
        ? 60
        : prefs.classReminders === "30_min"
        ? 30
        : 15;
    dayClasses.forEach((c) => {
      const startMin = timeToMinutes(c.time || "10:00");
      const diff = startMin - time.minutes;
      if (diff > 0 && diff <= leadWindow) {
        push(
          `class_rem_${c.code || c.subject}_${c.time}_${today}`,
          `Class Starting Soon: ${c.subject}`,
          `Starts at ${c.time} in ${c.room || "class"} with ${c.teacher || "faculty"}`,
          "./#timetable"
        );
      }
    });
  }

  // 4) Low-attendance warning
  if (
    prefs.attendanceAlerts !== "off" &&
    data.attendance &&
    typeof data.attendance === "object"
  ) {
    let attended = 0;
    let skipped = 0;
    Object.values(data.attendance).forEach((dayObj) => {
      if (dayObj && typeof dayObj === "object") {
        Object.values(dayObj).forEach((st) => {
          if (st === "attended") attended++;
          else if (st === "skipped") skipped++;
        });
      }
    });
    const marked = attended + skipped;
    const pct = marked > 0 ? Math.round((attended / marked) * 100) : null;
    const target =
      typeof data.attTarget === "number" &&
      data.attTarget >= 50 &&
      data.attTarget <= 100
        ? data.attTarget
        : 75;
    if (pct !== null && pct < target) {
      push(
        `att_warning_${today}`,
        `Attendance Alert: ${pct}%`,
        `Your attendance is currently ${pct}% (below ${target}% target). Tap to review.`,
        "./#review"
      );
    }
  }

  // 5) Daily summary
  if (
    prefs.dailySummaryTime &&
    prefs.dailySummaryTime !== "off" &&
    time.hhmm >= prefs.dailySummaryTime
  ) {
    const pendingCount = tasks.length;
    const dueToday = tasks.filter((t) => t.dueDate === today).length;
    push(
      `daily_summary_${today}`,
      "Clarity Desk — Daily Summary",
      `You have ${pendingCount} pending task${
        pendingCount !== 1 ? "s" : ""
      } (${dueToday} due today).`,
      "./#dashboard"
    );
  }

  return notifications;
}

async function main() {
  const fb = initAdmin();
  if (!fb) return;

  const db = fb.firestore();
  const messaging = fb.messaging();
  const time = nowParts();

  const usersSnap = await db.collection("users").get();
  let evaluated = 0;
  let sent = 0;
  let errors = 0;

  for (const doc of usersSnap.docs) {
    evaluated++;
    const uid = doc.id;
    const data = doc.data() || {};

    const stateRef = db
      .collection("users")
      .doc(uid)
      .collection("notifState")
      .doc("scheduled");
    let notifiedKeys = {};
    try {
      const stateSnap = await stateRef.get();
      notifiedKeys = (stateSnap.exists && stateSnap.data().keys) || {};
    } catch (err) {
      console.warn(`[${uid}] could not read notifState:`, err.message);
    }

    let toSend;
    try {
      toSend = evaluateUser(data, notifiedKeys, time);
    } catch (err) {
      errors++;
      console.warn(`[${uid}] evaluation error:`, err.message);
      continue;
    }
    if (!toSend.length) continue;

    let tokensSnap;
    try {
      tokensSnap = await db
        .collection("users")
        .doc(uid)
        .collection("fcmTokens")
        .get();
    } catch (err) {
      console.warn(`[${uid}] could not read fcmTokens:`, err.message);
      continue;
    }
    const tokens = tokensSnap.docs.map((d) => d.id);
    if (!tokens.length) continue; // no registered device — nothing to send, nothing to write

    for (const n of toSend) {
      let resp;
      try {
        resp = await messaging.sendEachForMulticast({
          tokens,
          data: { title: n.title, body: n.body, tag: n.key, url: n.url },
          webpush: { fcmOptions: { link: n.url } },
        });
      } catch (err) {
        errors++;
        console.warn(`[${uid}] send error for ${n.key}:`, err.message);
        continue;
      }
      sent++;
      notifiedKeys[n.key] = true;

      const deadTokens = [];
      resp.responses.forEach((r, i) => {
        if (
          !r.success &&
          r.error &&
          r.error.code === "messaging/registration-token-not-registered"
        ) {
          deadTokens.push(tokens[i]);
        }
      });
      if (deadTokens.length) {
        const batch = db.batch();
        deadTokens.forEach((t) =>
          batch.delete(
            db.collection("users").doc(uid).collection("fcmTokens").doc(t)
          )
        );
        await batch
          .commit()
          .catch((err) =>
            console.warn(`[${uid}] token cleanup error:`, err.message)
          );
      }
    }

    const keys = Object.keys(notifiedKeys);
    const pruned =
      keys.length > 150
        ? Object.fromEntries(keys.slice(-100).map((k) => [k, true]))
        : notifiedKeys;
    await stateRef
      .set({ keys: pruned, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
      .catch((err) =>
        console.warn(`[${uid}] notifState write error:`, err.message)
      );
  }

  console.log(
    `Evaluated ${evaluated} user(s); sent ${sent} notification(s); ${errors} error(s).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
