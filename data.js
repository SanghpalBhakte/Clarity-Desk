// ============================================================
// Clarity Desk — Personal Data
// Official SY-AIDS Timetable (W.E.F 30/07/2026) — SF-31
// ============================================================

// Default profile — overridden by Settings (localStorage)
export const STUDENT = {
  name:    "",
  branch:  "",
  year:    "",
  college: "",
  rollNo:  "",
};

// ── Timetable ─────────────────────────────────────────────────
export const EMPTY_TIMETABLE = {
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: []
};

// Official SY-AIDS Timetable (W.E.F 30/07/2026) — Lecture Hall SF-31
// Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
export const TIMETABLE = {
  1: [ // Monday
    { time: "10:00", end: "11:00", subject: "DEMP",                          code: "DEMP", room: "SF-31",        teacher: "Prof. VAK",        type: "lecture" },
    { time: "11:00", end: "12:00", subject: "Data Structure (DS)",          code: "DS",   room: "SF-31",        teacher: "Prof. VJM",        type: "lecture" },
    { time: "12:00", end: "12:45", subject: "Recess",                        code: "REC",  room: "—",           teacher: "—",                type: "off", isBreak: true },
    { time: "12:45", end: "14:45", subject: "Open Elective 1 (OE-1)",        code: "OE-1", room: "SF-31",        teacher: "Faculty",          type: "lecture" },
    { time: "14:45", end: "15:00", subject: "Recess",                        code: "REC",  room: "—",           teacher: "—",                type: "off", isBreak: true },
    { time: "15:00", end: "17:00", subject: "Multi Disciplinary Minor (MDM)",code: "MDM",  room: "SF-31",        teacher: "Faculty",          type: "lecture" },
  ],
  2: [ // Tuesday
    { time: "10:00", end: "12:00", subject: "DS-AI-A2 (VJM) + WEB DEV.-AI-C2 (MKP)", code: "LAB", room: "FF-28 / FF-40", teacher: "Prof. VJM / MKP", type: "lab" },
    { time: "12:00", end: "12:45", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "12:45", end: "14:45", subject: "Open Elective 2 (OE-2)",           code: "OE-2", room: "SF-31",        teacher: "Faculty",          type: "lecture" },
    { time: "14:45", end: "15:00", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "15:00", end: "17:00", subject: "DEMP-AI-D2 (VAK)",                 code: "DEMP", room: "DMP Lab (FF-38)", teacher: "Prof. VAK",      type: "lab" },
  ],
  3: [ // Wednesday
    { time: "10:00", end: "12:00", subject: "Community Engagement (AI-C2, D2)", code: "CE",   room: "SF-31",        teacher: "Prof. SDJ",        type: "lab" },
    { time: "12:00", end: "12:45", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "12:45", end: "13:45", subject: "Data Structure (DS)",             code: "DS",   room: "SF-31",        teacher: "Prof. VJM",        type: "lecture" },
    { time: "13:45", end: "14:45", subject: "DEMP",                             code: "DEMP", room: "SF-31",        teacher: "Prof. VAK",        type: "lecture" },
    { time: "14:45", end: "15:00", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "15:00", end: "17:00", subject: "DEMP-AI-A2 (VAK) + DS-AI-B2 (VJM) + WEB DEV.-AI-D2 (MKP)", code: "LAB", room: "FF-38 / FF-28 / FF-40", teacher: "Prof. VAK / VJM / MKP", type: "lab" },
  ],
  4: [ // Thursday
    { time: "10:00", end: "12:00", subject: "DEMP-AI-B2 (VAK) + DS-AI-C2 (VJM) + WEB DEV.-AI-A2 (MKP)", code: "LAB", room: "FF-38 / FF-28 / FF-40", teacher: "Prof. VAK / VJM / MKP", type: "lab" },
    { time: "12:00", end: "12:45", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "12:45", end: "14:45", subject: "Probability & Statistics (PBST)",  code: "PBST", room: "SF-31",        teacher: "Prof. SDJ",        type: "lecture" },
    { time: "14:45", end: "15:00", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
  ],
  5: [ // Friday
    { time: "10:00", end: "12:00", subject: "DEMP-AI-C2 (VAK) + WEB DEV.-AI-B2 (MKP) + DS-D2 (VJM)", code: "LAB", room: "FF-38 / FF-40 / FF-28", teacher: "Prof. VAK / MKP / VJM", type: "lab" },
    { time: "12:00", end: "12:45", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "12:45", end: "14:45", subject: "Business Management & Financial Account (BMFA)", code: "BMFA", room: "SF-31", teacher: "Faculty",          type: "lecture" },
    { time: "14:45", end: "15:00", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "15:00", end: "17:00", subject: "Community Engagement (AI-A2, B2, C2, D2)", code: "CE", room: "SF-31", teacher: "Prof. SDJ",        type: "lab" },
  ],
  6: [ // Saturday
    { time: "10:00", end: "12:00", subject: "Constitution of India (COI)",      code: "COI",  room: "SF-31",        teacher: "Adv. Vrushali Joshi", type: "lecture" },
    { time: "12:00", end: "12:45", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
    { time: "12:45", end: "14:45", subject: "Community Engagement (AI-A2, B2)", code: "CE",   room: "SF-31",        teacher: "Prof. SDJ",        type: "lab" },
    { time: "14:45", end: "15:00", subject: "Recess",                           code: "REC",  room: "—",            teacher: "—",                type: "off", isBreak: true },
  ],
  0: [], // Sunday
};

// ── Assignments ───────────────────────────────────────────────
export const ASSIGNMENTS = [];

// ── Notices ───────────────────────────────────────────────────
export const NOTICES = [
  {
    id: "n1",
    title: "End-Semester Exam: Set Your Exam Date",
    category: "Exam",
    date: "2026-07-20",
    builtIn: true, // sample notice: hidden once its date has passed, see getVisibleNotices()
    content: "Go to Settings and enter your end-semester exam date. A live countdown will appear on your dashboard.",
    important: true,
    // Stops nagging once the student has actually done this -- see
    // getVisibleNotices() in app.js.
    hideWhen: "examDateSet",
  },
  {
    id: "n2",
    title: "Timetable Updated, Effective 30/07/2026 (SY-AIDS)",
    category: "Academic",
    date: "2026-07-28",
    builtIn: true, // sample notice: hidden once its date has passed, see getVisibleNotices()
    content: "Your official SY-AIDS timetable effective 30/07/2026 (Lecture Hall SF-31) has been updated with DEMP, DS, WEB DEV, PBST, MDM, COI, BMFA, OE-1, OE-2, and Community Engagement modules.",
    important: false,
    // Only relevant to a student still on the default timetable -- once
    // they've customized their own, this specific batch announcement no
    // longer applies to them. See getVisibleNotices() in app.js.
    hideWhen: "timetableCustomized",
  },
];

// ── Quick Links ───────────────────────────────────────────────
export const QUICK_LINKS = [
  {
    subject: "Data Structures",
    code: "DS",
    color: "#394B63",
    resources: [
      { label: "GFG DSA Sheet",         url: "https://www.geeksforgeeks.org/dsa-sheet-by-love-babbar/", icon: "list" },
      { label: "Striver's SDE Sheet",   url: "https://takeuforward.org/interviews/strivers-sde-sheet-top-coding-interview-problems/", icon: "code" },
      { label: "Visualgo",              url: "https://visualgo.net/en", icon: "eye" },
    ],
  },
  {
    subject: "Digital Electronics and Microprocessors",
    code: "DEMP",
    color: "#5A6F8F",
    resources: [
      { label: "NPTEL Digital Circuits", url: "https://nptel.ac.in/courses/108105132", icon: "video" },
      { label: "8085 Microprocessor Notes", url: "https://www.geeksforgeeks.org/microprocessor-tutorial/", icon: "book-open" },
      { label: "Circuit Simulator",     url: "https://www.falstad.com/circuit/", icon: "cpu" },
    ],
  },
  {
    subject: "Web Development",
    code: "WD",
    color: "#4E7A5D",
    resources: [
      { label: "MDN Web Docs",          url: "https://developer.mozilla.org/", icon: "book-open" },
      { label: "W3Schools HTML/CSS/JS", url: "https://www.w3schools.com/", icon: "code" },
      { label: "Frontend Mentor",       url: "https://www.frontendmentor.io/", icon: "graduation-cap" },
    ],
  },
  {
    subject: "Probability and Statistics",
    code: "PBST",
    color: "#B48852",
    resources: [
      { label: "StatQuest (YouTube)",   url: "https://www.youtube.com/@statquest", icon: "video" },
      { label: "Seeing Theory",         url: "https://seeing-theory.brown.edu/", icon: "eye" },
      { label: "Khan Academy Stats",    url: "https://www.khanacademy.org/math/statistics-probability", icon: "graduation-cap" },
    ],
  },
  {
    subject: "Multi Disciplinary Minor",
    code: "MDM",
    color: "#A34B43",
    resources: [
      { label: "NPTEL DBMS",            url: "https://nptel.ac.in/courses/106105175", icon: "video" },
      { label: "SQLZoo Practice",       url: "https://sqlzoo.net/", icon: "database" },
      { label: "MongoDB University",    url: "https://learn.mongodb.com/", icon: "database" },
    ],
  },
  {
    subject: "Constitution of India",
    code: "COI",
    color: "#6B5E52",
    resources: [
      { label: "India Code - Constitution", url: "https://www.indiacode.nic.in/constitution", icon: "book-open" },
      { label: "Constitution Notes",        url: "https://www.clearias.com/constitution-of-india/", icon: "list" },
    ],
  },
  {
    subject: "Business Management and Financial Accounting",
    code: "BMFA",
    color: "#7E9C8D",
    resources: [
      { label: "Investopedia Basics",   url: "https://www.investopedia.com/financial-accounting-4689738", icon: "book-open" },
      { label: "AccountingCoach",       url: "https://www.accountingcoach.com/", icon: "graduation-cap" },
    ],
  },
  {
    subject: "Open Electives (OE-1 / OE-2)",
    code: "OE",
    color: "#90A3BE",
    resources: [
      { label: "NPTEL Online Courses",  url: "https://nptel.ac.in/", icon: "video" },
      { label: "SWAYAM Portal",         url: "https://swayam.gov.in/", icon: "graduation-cap" },
    ],
  },
  {
    subject: "Community Engagement",
    code: "CE",
    color: "#5E5449",
    resources: [
      { label: "Community Service Guidelines", url: "https://nss.gov.in/", icon: "book-open" },
    ],
  },
];

// ── Dev Notes ────────────────────────────────────────────────
// Regenerated by `npm run devnotes` (scripts/generate-devnotes.mjs), which
// appends real entries from git commit history so this never goes stale.
// Entries below this comment were hand-authored before that script existed;
// new ones are inserted above them.
export const DEV_UPDATES = [
  {
    id: "u46",
    date: "2026-10-15",
    title: "Declutter now removes subjects that aren't in your timetable, and merges short-name duplicates like \"Prob & Stats\"",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Declutter now removes subjects that aren't in your timetable, and merges short-name duplicates like \"Prob & Stats\"",
    points: [

    ]
  },
  {
    id: "u45",
    date: "2026-10-15",
    title: "Calmer Today: each thing shows once, so the page is shorter and easier to read",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Calmer Today: each thing shows once, so the page is shorter and easier to read",
    points: [
      "Removed the row of number tiles at the top. Classes, tasks and attendance each already have their own section below, so the tiles only repeated them.",
      "Present / Absent now appear once: on the big card for the class that's on now, and in the schedule only for classes that have ended. The class on now says \"Now\" in the schedule. Upcoming classes have no buttons yet.",
      "Removed the \"0 of 0 completed\" bar from Tasks and the second Ask Desk box (the Ask Desk button at the top still opens it).",
      "Weekly Review shows on Saturday and Sunday. It's always under Attendance > Guidance.",
      "Your exam countdown stays as a small line under the greeting.",
      "Phones: study shortcuts moved off Today (they're in Study Vault under More).",
      "\"Clarity Desk\" in the header is one colour now."
    ]
  },
  {
    id: "u44",
    date: "2026-10-15",
    title: "New Clarity Desk logo, and notification icons that show properly on Android",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New Clarity Desk logo, and notification icons that show properly on Android",
    points: [
      "New mark: an open C around one dot, the one thing to do right now. Used for the tab icon, home-screen icon, iPhone icon, the app header and the link preview image.",
      "The small notification icon in the Android status bar is now one clean white shape with room around it. The old \"CD\" letters were too detailed at that size and showed up as a smudge."
    ]
  },
  {
    id: "u43",
    date: "2026-10-15",
    title: "The timetable review screen explains plainly when the AI couldn't check your photo, and no longer says \"All fields structured\" above that warning",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The timetable review screen explains plainly when the AI couldn't check your photo, and no longer says \"All fields structured\" above that warning",
    points: [

    ]
  },
  {
    id: "u42",
    date: "2026-10-15",
    title: "Ask Desk understands everyday questions: \"can I bunk OS tomorrow?\", subject attendance, other days, exams, follow-ups; its buttons now open forms in front of the chat; scans try AI models that just failed last",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Ask Desk understands everyday questions: \"can I bunk OS tomorrow?\", subject attendance, other days, exams, follow-ups; its buttons now open forms in front of the chat; scans try AI models that just failed last",
    points: [

    ]
  },
  {
    id: "u41",
    date: "2026-10-15",
    title: "Calmer navigation: phone tabs cut to five with a More sheet, desktop sidebar folds to icons",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Calmer navigation: phone tabs cut to five with a More sheet, desktop sidebar folds to icons",
    points: [
      "Phone: bottom bar is now Today, Timetable, Subjects, Tasks, More. Notices, Study Vault, Daily Briefing and Settings sit in a More sheet; More lights up when you are on one of them.",
      "Desktop: sidebar folds into an icon rail (button at the bottom, or press [ ). Labels show on hover. Your choice is remembered on this device.",
      "Ask Desk opens with three starter prompts; the rest are behind \"More ideas\".",
      "Phone header drops the \"Saved locally\" badge (status is still in Settings).",
      "Motion is transform/opacity only and switches off with reduced motion."
    ]
  },
  {
    id: "u40",
    date: "2026-10-15",
    title: "Picking your exam date or briefing time in Settings no longer closes by itself when your desk syncs",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Picking your exam date or briefing time in Settings no longer closes by itself when your desk syncs",
    points: [

    ]
  },
  {
    id: "u39",
    date: "2026-10-15",
    title: "Picking your exam date or briefing time in Settings no longer closes by itself when your desk syncs",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "A cloud sync arriving while a date, time or dropdown picker was open rebuilt the page under it, closing the picker and putting the old value back.",
    points: [
      "Page refreshes now wait until you leave the field, and unsaved Settings changes are kept through a refresh."
    ]
  },
  {
    id: "u38",
    date: "2026-10-15",
    title: "Clearing an attendance mark now stays cleared on all your signed-in devices",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "A mark you cleared used to come back after the next sync.",
    points: [
      "A mark you cleared used to come back after the next sync.",
      "Deleted +1 taps and baselines came back the same way.",
      "Now each delete is sent to your cloud copy too."
    ]
  },
  {
    id: "u37",
    date: "2026-10-14",
    title: "Mark a class as OD or \"didn't happen\", add extra classes, and sort out old marks with no subject",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "More ways to record what really happened in class.",
    points: [
      "Tap ⋯ on a class in Attendance to mark it OD (waiting for the teacher) or Didn't happen.",
      "When the teacher decides, tap Accepted or Rejected on the OD. Until then it counts as absent, like on the ERP.",
      "A class that didn't happen isn't counted at all, the same as on the ERP.",
      "Add an extra or make-up class from the subject page with + Add extra class.",
      "Old marks the app couldn't match to a subject are listed in Settings, under Attendance, where you can pick the right subject."
    ]
  },
  {
    id: "u36",
    date: "2026-10-14",
    title: "See how many classes you can still miss this semester, and whether you're safe for the monthly defaulter list",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Plan ahead for the end of the semester and the monthly check.",
    points: [
      "Each subject shows how many more classes you can miss this semester and still finish at your target.",
      "When you scan your ERP, fill in Total sessions so this can be worked out.",
      "A lab that's falling behind now turns its subject card red too.",
      "The dashboard shows whether you're on track for this month's defaulter list.",
      "Low-attendance notifications now use the same percentage you see in the app."
    ]
  },
  {
    id: "u35",
    date: "2026-10-14",
    title: "Attendance now matches your college ERP exactly",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Your percentages are now worked out the same way as on the college ERP.",
    points: [
      "Percentages show two decimals, like the ERP, and 74.50% now counts as below 75%.",
      "Labs have their own percentage, shown on the matching subject.",
      "Classes you marked before an ERP scan are no longer counted twice.",
      "Your overall percentage includes every subject, labs too.",
      "The first time you open the app you'll see what changed, and you can keep the old numbers if you prefer. You can switch any time in Settings.",
      "Re-saving your timetable no longer clears classes you already marked today.",
      "The weekly review uses your own attendance target."
    ]
  },
  {
    id: "u34",
    date: "2026-10-14",
    title: "New here? Clarity Desk now starts by scanning your timetable, shows one setup card instead of three prompts, and hides old sample notices",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "\"Just look around\" are the other choices. Profile is asked later.",
    points: [
      "Welcome: \"Scan your timetable\" opens the camera; \"Add classes myself\" and",
      "Today with no timetable: one setup card, no Rest Day card, no row of",
      "Scan review names the lab groups it found and asks you to pick yours.",
      "Built-in sample notices hide after their date; empty board says so.",
      "Returning students with any saved data never see the welcome again.",
      "Header: clearer screen-reader labels for the save pill, logo and avatar.",
      "New test: tests/verify_onboarding_returning.mjs (in npm test)."
    ]
  },
  {
    id: "u33",
    date: "2026-10-14",
    title: "Fixed an error the app logged in the browser console on every load",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "never deploy again.",
    points: [
      "firebase.json: firebase-config.local.js added to hosting.ignore so it can",
      "index.html, 404.html: the optional local key file is requested only on",
      "tests/verify_hosting_files.mjs: the file is no longer a runtime file; it",
      "firebase-config.local.example.js: header comment no longer says the file"
    ]
  },
  {
    id: "u32",
    date: "2026-10-14",
    title: "Offline mode now works even when your network blocks Google servers, and the app opens offline after just one visit",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "an unreachable gstatic no longer fails the whole service worker.",
    points: [
      "sw.js: Firebase Messaging importScripts moved inside the existing try, so",
      "sw.js: offline fallbacks are awaited in turn (caches.match returns a",
      "Cache version v178 -> v179 (sw.js, index.html, 404.html)."
    ]
  },
  {
    id: "u31",
    date: "2026-10-13",
    title: "Date pickers no longer reset while open; Review fits on phones; attendance labels match everywhere (v177)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Date pickers no longer reset while open; Review fits on phones; attendance labels match everywhere (v177)",
    points: [
      "Date pickers no longer reset while open; Review fits on phones; attendance labels match everywhere (v177)"
    ]
  },
  {
    id: "u30",
    date: "2026-10-13",
    title: "The date picker on Add task and Reschedule no longer flips or resets while open (v176)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The date picker on Add task and Reschedule no longer flips or resets while open (v176)",
    points: [
      "The date picker on Add task and Reschedule no longer flips or resets while open (v176)"
    ]
  },
  {
    id: "u29",
    date: "2026-10-13",
    title: "Reschedule on Review no longer loses its date box, and Cancel now works (v175)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Reschedule on Review no longer loses its date box, and Cancel now works (v175)",
    points: [
      "Reschedule on Review no longer loses its date box, and Cancel now works (v175)"
    ]
  },
  {
    id: "u28",
    date: "2026-10-13",
    title: "The due-date prompt when adding a task no longer vanishes after a few seconds \\ (v174)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The due-date prompt when adding a task no longer vanishes after a few seconds \\ (v174)",
    points: [
      "The due-date prompt when adding a task no longer vanishes after a few seconds \\ (v174)"
    ]
  },
  {
    id: "u27",
    date: "2026-10-13",
    title: "Typing a task no longer disappears when the app updates in the background (v173)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Typing a task no longer disappears when the app updates in the background (v173)",
    points: [
      "Typing a task no longer disappears when the app updates in the background (v173)"
    ]
  },
  {
    id: "u26",
    date: "2026-10-13",
    title: "Fixed the Add task bar on Today: tasks now save, show right away, ask for a date if none is typed, and Enter works on phone keyboards (v172)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Fixed the Add task bar on Today: tasks now save, show right away, ask for a date if none is typed, and Enter works on phone keyboards (v172)",
    points: [
      "Fixed the Add task bar on Today: tasks now save, show right away, ask for a date if none is typed, and Enter works on phone keyboards (v172)"
    ]
  },
  {
    id: "u25",
    date: "2026-10-13",
    title: "Fixed the Add task bar on Today: tasks now save, show right away, ask for a date if none is typed, and Enter works on phone keyboards (v172)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Fixed the Add task bar on Today: tasks now save, show right away, ask for a date if none is typed, and Enter works on phone keyboards (v172)",
    points: [
      "Fixed the Add task bar on Today: tasks now save, show right away, ask for a date if none is typed, and Enter works on phone keyboards (v172)"
    ]
  },
  {
    id: "u24",
    date: "2026-10-11",
    title: "Today now suggests your next step (mark a finished class, a due task, or the subject to catch up on), with a Not now button, plus small check and ring animations (v171)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today now suggests your next step (mark a finished class, a due task, or the subject to catch up on), with a Not now button, plus small check and ring animations (v171)",
    points: [
      "Today now suggests your next step (mark a finished class, a due task, or the subject to catch up on), with a Not now button, plus small check and ring animations (v171)"
    ]
  },
  {
    id: "u23",
    date: "2026-10-08",
    title: "Redesigned Tasks, Subjects, Timetable and Today: clearer deadlines, risk-first attendance, one Manage menu, bigger Present/Absent buttons (v170)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Redesigned Tasks, Subjects, Timetable and Today: clearer deadlines, risk-first attendance, one Manage menu, bigger Present/Absent buttons (v170)",
    points: [
      "Redesigned Tasks, Subjects, Timetable and Today: clearer deadlines, risk-first attendance, one Manage menu, bigger Present/Absent buttons (v170)"
    ]
  },
  {
    id: "u22",
    date: "2026-09-30",
    title: "Today shows a live countdown to your next class, puts it first on phones, and the Add Task button gets out of the way (v169)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today shows a live countdown to your next class, puts it first on phones, and the Add Task button gets out of the way (v169)",
    points: [
      "Today shows a live countdown to your next class, puts it first on phones, and the Add Task button gets out of the way (v169)"
    ]
  },
  {
    id: "u21",
    date: "2026-09-29",
    title: "Today fits phones and opens at the top, attendance syncs between devices, new status-bar icon (v168)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today fits phones and opens at the top, attendance syncs between devices, new status-bar icon (v168)",
    points: [
      "Today fits phones and opens at the top, attendance syncs between devices, new status-bar icon (v168)"
    ]
  },
  {
    id: "u20",
    date: "2026-09-27",
    title: "Attendance Now Matches the ERP",
    category: "Fix",
    tag: "Fix",
    tagColor: "var(--red)",
    summary: "Each subject's percentage now works the way the college ERP does, and marks always land on the right day.",
    points: [
      "Sessions marked \"Not Entered\" on the ERP no longer pull a subject's percentage down: 6 present, 1 absent and 1 not entered now shows 85.71%, the same as the ERP.",
      "Tuesday's timetable no longer shows the Present/Absent you marked on Monday. Marks saved under the wrong day are moved back automatically.",
      "Today and the timetable switch to the new day at midnight, even if the app stays open.",
      "New tasks added just after midnight default to the right \"tomorrow\"."
    ]
  },
  {
    id: "u19",
    date: "2026-09-27",
    title: "Fits Small Phones Properly",
    category: "Improvement",
    tag: "Improvement",
    tagColor: "var(--green)",
    summary: "Every page now fits the screen on phones as narrow as 320px, and nothing important hides off the edge.",
    points: [
      "Attendance pop-ups keep their Save button on screen.",
      "Present and Absent buttons on the timetable are full-size and labelled.",
      "The top-bar clock, greeting and bottom navigation no longer overflow or overlap on small screens.",
      "The phone's status bar matches the app's theme when installed."
    ]
  },
  {
    id: "u18",
    date: "2026-09-25",
    title: "Easier-to-Read Look",
    category: "Design",
    tag: "Design",
    tagColor: "var(--yellow)",
    summary: "A readable light theme, plainer wording and one consistent set of icons across the app.",
    points: [
      "Light theme text now has proper contrast.",
      "Pick light or dark mode separately from your accent colour: Terracotta, Rose, Lavender or Apricot.",
      "Buttons use one consistent icon set instead of emoji.",
      "The dashboard greeting varies instead of repeating the same line.",
      "Links to Clarity Desk show a proper preview card when shared."
    ]
  },
  {
    id: "u17",
    date: "2026-09-24",
    title: "Smarter, Steadier Scans",
    category: "Improvement",
    tag: "Improvement",
    tagColor: "var(--green)",
    summary: "Timetable and attendance screenshots are now read by AI vision first, with free backups when one service is busy.",
    points: [
      "Scans go through Clarity Desk's own secure server, so no API keys ship inside the app.",
      "Four free AI services back each other up: if one is busy or out of free quota, the next takes over.",
      "Classes no longer get duplicated across days or merged cells, and subject names that only nearly match are flagged for you to check.",
      "Attendance scans cross-check each row against the ERP's Total Count column."
    ]
  },
  {
    id: "u16",
    date: "2026-09-22",
    title: "Backups Now Include Timetable and Attendance",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "Export and Import under Data & Backup now carry your timetable and attendance history too.",
    points: [
      "Every backup file includes your timetable and attendance.",
      "Importing a backup on a new phone restores them along with the rest of your desk."
    ]
  },
  {
    id: "u15",
    date: "2026-09-19",
    title: "One-Tap Updates and a Tidier Desk",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "A banner now tells you when a new version is ready, and cleaning up bad subjects takes fewer steps.",
    points: [
      "Tap the update banner to get the newest version; no reinstalling needed.",
      "Declutter Desk also removes garbled quick links and leftover attendance for deleted subjects.",
      "Remove bad subject cards from Subject Hubs one at a time or several at once.",
      "Subject Hub cards show an attendance ring, and new accounts start with a clean desk."
    ]
  },
  {
    id: "u14",
    date: "2026-09-14",
    title: "Live Clock, ERP Link and Better Accessibility",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "A live clock on every page, quick access to the college ERP portal, and a notice board that shows only what matters.",
    points: [
      "A live day and time clock shows on every page.",
      "Quick access to the college ERP portal.",
      "Setup notices hide themselves once setup is done, and the notice board keeps just two cards.",
      "Keyboard navigation, pop-up focus and screen-reader announcements work properly, and low-contrast text was fixed."
    ]
  },
  {
    id: 'u13',
    date: '2026-09-13',
    title: 'Notices No Longer Always Show "Today"',
    category: 'Fix',
    tag: 'Fix',
    tagColor: 'var(--red)',
    summary: 'Notice dates were computed the moment the page loaded, so every notice looked freshly posted on every visit. They now carry the date they were actually authored.',
    points: [
      'Replaced the live-computed date with the real authored date for each notice.',
      'Notices now age normally instead of resetting to "today" after every deploy or refresh.'
    ]
  },
  {
    id: 'u12',
    date: '2026-09-13',
    title: 'Dashboard Cards No Longer Pop In and Out',
    category: 'Fix',
    tag: 'Fix',
    tagColor: 'var(--red)',
    summary: 'Dashboard cards were flashing and re-rendering during normal use -- on page load, refresh, and theme switches -- traced to three separate bugs and fixed.',
    points: [
      'A duplicated click handler was firing every nav tap twice, rebuilding the page twice each time.',
      'Added a permanent render de-duplication guard so a page can never be rebuilt twice in the same instant, whatever triggers it.',
      'Found and removed a cross-device sync loop where two signed-in devices kept "correcting" each other\'s theme, forcing repeated silent re-renders.'
    ]
  },
  {
    id: 'u11',
    date: '2026-09-13',
    title: 'Polished the Theme-Switch Circular Wipe',
    category: 'Improvement',
    tag: 'Improvement',
    tagColor: 'var(--green)',
    summary: 'The dark/light mode transition had a brief flash of the old theme; it now plays as one clean, uninterrupted circular reveal from the toggle you tapped.',
    points: [
      'Removed a compositor race that flashed the old theme before the wipe animation began.',
      'Kept the original clip-path circular reveal after a scale-based experiment made the whole page feel like it was zooming in instead of being revealed.'
    ]
  },
  {
    id: 'u10',
    date: '2026-09-13',
    title: 'Redesigned the "No Classes Today" Card',
    category: 'Design',
    tag: 'Design',
    tagColor: 'var(--yellow)',
    summary: 'The rest-day card used a layered "stacked paper" effect that read as duplicated, overlapping cards rather than intentional depth -- simplified to one clean card.',
    points: [
      'Removed the layered pseudo-element stack and tilt-on-hover effect.',
      'Kept a subtle lift and shadow on hover so the card still feels alive without looking glitchy.'
    ]
  },
  {
    id: 'u9',
    date: '2026-09-13',
    title: 'Sharper App Icons and Logo',
    category: 'Fix',
    tag: 'Fix',
    tagColor: 'var(--red)',
    summary: 'App icons looked blurry because the icon generator was upscaling a small 32px source image; the lamp doodle logo was also redrawn bolder so it holds up at real icon sizes.',
    points: [
      'Regenerated all PWA icon sizes from a proper high-resolution source.',
      'Redrawn the lamp doodle logo with bolder strokes that stay legible when shrunk down.'
    ]
  },
  {
    id: 'u8',
    date: '2026-09-11',
    title: 'Fixed Illegible Text on Dark Themes',
    category: 'Fix',
    tag: 'Fix',
    tagColor: 'var(--red)',
    summary: 'Editorial headings and Ask Desk chat bubbles were hard to read against dark theme backgrounds -- both fixed with proper contrast.',
    points: [
      'Corrected heavy, blurred editorial headings on dark themes.',
      'Fixed low-contrast Ask Desk chat bubble text on dark themes.'
    ]
  },
  {
    id: 'u7',
    date: '2026-09-10',
    title: 'Consolidated the Type Scale',
    category: 'Improvement',
    tag: 'Improvement',
    tagColor: 'var(--green)',
    summary: 'Simplified the app\'s text sizes down to 9 canonical steps for more consistent, predictable typography throughout.',
    points: [
      'Replaced a sprawl of one-off font sizes with a single 9-step scale.',
      'Fixed a real font-loading bug uncovered while consolidating the scale.'
    ]
  },

  {
    id: 'u1',
    date: '2026-08-08',
    title: 'Study Vault & File Attachment Engine',
    category: 'Study Vault',
    tag: 'Feature',
    tagColor: 'var(--accent)',
    summary: 'Direct note, syllabus PDF, and lab manual uploads with offline storage and 1-click downloads.',
    points: [
      'Upload PDFs, lecture slides, lab manuals, and code files directly from your device.',
      'Auto-extracted file sizes and instant downloads saved offline to your browser storage.',
      'Renamed Study Links to Study Vault for a calmer, student-first course workspace.'
    ]
  },
  {
    id: 'u2',
    date: '2026-08-08',
    title: 'Smart Attendance Streaks & Safe Bunk Calculator',
    category: 'Attendance',
    tag: 'Improvement',
    tagColor: 'var(--green)',
    summary: 'Natural college terminology with active streak counter and safe bunk guidance.',
    points: [
      'Replaced rigid buttons with authentic student actions (Attended ✓ / Bunked ✕).',
      'Active streak counter (🔥) with milestone celebration feedback.',
      'Real-time safe bunk status calculating how many classes you can afford to miss.'
    ]
  },
  {
    id: 'u3',
    date: '2026-08-08',
    title: 'Custom Notice Channels & WhatsApp Integration',
    category: 'Notices',
    tag: 'Integration',
    tagColor: '#25D366',
    summary: 'Quick-access linked cards for official updates, class WhatsApp groups, and circulars.',
    points: [
      'Soft linked cards for your Official Class Group and WhatsApp channels.',
      '1-tap WhatsApp forward button formats notices for immediate class group sharing.',
      'Copy Notice action for easy pasting into student chats and channels.'
    ]
  },
  {
    id: 'u4',
    date: '2026-08-07',
    title: 'Expanded Desktop Layout & Breathability',
    category: 'Dashboard',
    tag: 'Design',
    tagColor: 'var(--yellow)',
    summary: 'Wider desktop container and balanced 2-column grid for comfortable scanning.',
    points: [
      'Expanded desktop width to 1160px and 1240px for laptops and large displays.',
      'Disciplined 2-column grid balancing today\'s classes with tasks and vitals.',
      'Maintains compact, touch-friendly navigation on mobile devices.'
    ]
  },
  {
    id: 'u5',
    date: '2026-08-07',
    title: 'Zero-Flash Palette Persistence',
    category: 'Theme',
    tag: 'Reliability',
    summary: 'Synchronous pre-render script ensures instant theme restoration without dark/light flash.',
    points: [
      'Synchronous head script applies data-theme before the DOM paints.',
      'Local user selection heals cloud document states across multi-device sync.',
      'Seamless support across Paper, Cloud, Stone, Quiet Dark, and Café Night palettes.'
    ]
  },
  {
    id: 'u6',
    date: '2026-08-06',
    title: 'Natural IST Greetings & Course Shortcuts',
    category: 'Navigation',
    tag: 'Polish',
    summary: 'Human greeting transitions and direct deep-linking into subject course materials.',
    points: [
      'Night greeting now extends smoothly until 5:00 AM to match student study schedules.',
      'Subject shortcut chips route directly into the specific subject course screen.'
    ]
  }
];
