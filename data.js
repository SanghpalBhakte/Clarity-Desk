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
    id: "u248",
    date: "2026-11-09",
    title: "Search engines now list only claritydesk.web.app, not the old address",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The old campusos-83365 address keeps working only so students can move their desk.",
    points: [
      "Release checks now use claritydesk.web.app first."
    ]
  },
  {
    id: "u247",
    date: "2026-11-09",
    title: "Google sign-in now runs through claritydesk.web.app on every address",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "First step of retiring the old campusos-83365 addresses: they are no longer needed for signing in.",
    points: [

    ]
  },
  {
    id: "u246",
    date: "2026-11-09",
    title: "In Safari, closing the example day puts you back on the link you tapped",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "In Safari, closing the example day puts you back on the link you tapped",
    points: [

    ]
  },
  {
    id: "u245",
    date: "2026-11-09",
    title: "Tasks: long subject names no longer overlap, every subject shows under By subject, and the add bar has one clean edge while you type",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tasks: long subject names no longer overlap, every subject shows under By subject, and the add bar has one clean edge while you type",
    points: [

    ]
  },
  {
    id: "u244",
    date: "2026-11-09",
    title: "Google sign-in on claritydesk.web.app keeps working on slow connections",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Google sign-in on claritydesk.web.app keeps working on slow connections",
    points: [

    ]
  },
  {
    id: "u243",
    date: "2026-11-09",
    title: "No timetable yet? Today now has a See an example day link that shows a sample day without saving anything",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "No timetable yet? Today now has a See an example day link that shows a sample day without saving anything",
    points: [

    ]
  },
  {
    id: "u242",
    date: "2026-11-09",
    title: "Long task notes no longer get cut off silently: the notes box now stops at its limit",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Long task notes no longer get cut off silently: the notes box now stops at its limit",
    points: [

    ]
  },
  {
    id: "u241",
    date: "2026-11-09",
    title: "Google sign-in on claritydesk.web.app now stays on the same address, so it works in Safari",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Google sign-in on claritydesk.web.app now stays on the same address, so it works in Safari",
    points: [

    ]
  },
  {
    id: "u240",
    date: "2026-11-09",
    title: "Reminders now have Calm, Balanced and Off presets you can undo",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Reminders now have Calm, Balanced and Off presets you can undo",
    points: [

    ]
  },
  {
    id: "u239",
    date: "2026-11-09",
    title: "The first screen's example row now opens a sample day, and the intro and privacy note are shorter",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The first screen's example row now opens a sample day, and the intro and privacy note are shorter",
    points: [

    ]
  },
  {
    id: "u238",
    date: "2026-11-09",
    title: "The attendance ring marker is thinner and softer",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The attendance ring marker is thinner and softer",
    points: [

    ]
  },
  {
    id: "u237",
    date: "2026-11-09",
    title: "The first screen reads cleaner: clearer setup choices, a calmer example row and tighter spacing",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The first screen reads cleaner: clearer setup choices, a calmer example row and tighter spacing",
    points: [

    ]
  },
  {
    id: "u236",
    date: "2026-11-05",
    title: "Count visits from Reel and LinkedIn links, and tell new students from existing ones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Adds two anonymous usage counts: ref_visit (only for ?ref=reel, linkedin or insta-story, once per device) and first_open (new or existing, once per device).",
    points: [
      "Nothing else is sent."
    ]
  },
  {
    id: "u235",
    date: "2026-11-09",
    title: "The first screen now lets you add something due right away, or keep a photo of a notice open while you fill in the details",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The first screen now lets you add something due right away, or keep a photo of a notice open while you fill in the details",
    points: [

    ]
  },
  {
    id: "u234",
    date: "2026-11-08",
    title: "Press N on a laptop to add a task, and calendar arrows plus Present/Absent are easier to tap",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Press N on a laptop to add a task, and calendar arrows plus Present/Absent are easier to tap",
    points: [

    ]
  },
  {
    id: "u233",
    date: "2026-11-08",
    title: "Easier taps: the Edit class pencil and Weekly Review button are now easier to hit on a phone",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Easier taps: the Edit class pencil and Weekly Review button are now easier to hit on a phone",
    points: [

    ]
  },
  {
    id: "u232",
    date: "2026-11-08",
    title: "Security: other sites can no longer embed Clarity Desk, and the app shares less info when you open links",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Security: other sites can no longer embed Clarity Desk, and the app shares less info when you open links",
    points: [

    ]
  },
  {
    id: "u231",
    date: "2026-11-07",
    title: "Settings: the Danger zone now says what each Clear removes and what stays",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings: the Danger zone now says what each Clear removes and what stays",
    points: [

    ]
  },
  {
    id: "u230",
    date: "2026-11-07",
    title: "Settings: Reminders now say the timing choices start once notifications are on",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings: Reminders now say the timing choices start once notifications are on",
    points: [

    ]
  },
  {
    id: "u229",
    date: "2026-11-07",
    title: "Settings: the reminder dropdowns, time pickers and exam date now have names for screen readers",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings: the reminder dropdowns, time pickers and exam date now have names for screen readers",
    points: [

    ]
  },
  {
    id: "u228",
    date: "2026-11-07",
    title: "Settings: the cloud copy size now sits on its own line so it doesn't wrap on small phones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings: the cloud copy size now sits on its own line so it doesn't wrap on small phones",
    points: [

    ]
  },
  {
    id: "u227",
    date: "2026-11-07",
    title: "Settings now shows how full your cloud copy is, and a failed attendance delete is retried instead of lost",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings now shows how full your cloud copy is, and a failed attendance delete is retried instead of lost",
    points: [

    ]
  },
  {
    id: "u226",
    date: "2026-11-07",
    title: "Fonts now load from Clarity Desk itself, so text looks right on slow campus Wi-Fi and offline",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Fonts now load from Clarity Desk itself, so text looks right on slow campus Wi-Fi and offline",
    points: [

    ]
  },
  {
    id: "u225",
    date: "2026-11-05",
    title: "Holiday mode now follows the newest change across your phones: an older copy from the cloud no longer undoes a break you just started or ended",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Holiday mode now follows the newest change across your phones: an older copy from the cloud no longer undoes a break you just started or ended",
    points: [

    ]
  },
  {
    id: "u224",
    date: "2026-11-05",
    title: "Dropdowns with their own handler no longer close by themselves when the app refreshes in the background",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Dropdowns with their own handler no longer close by themselves when the app refreshes in the background",
    points: [

    ]
  },
  {
    id: "u223",
    date: "2026-11-05",
    title: "Subject Hubs: empty rings are visible, and the duplicate-cards notice is a ruled line instead of a box",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Subject Hubs: empty rings are visible, and the duplicate-cards notice is a ruled line instead of a box",
    points: [

    ]
  },
  {
    id: "u222",
    date: "2026-11-05",
    title: "Laptop sidebar matches the Tasks page: ruled section titles, thin lines between items, and the current page in bold colour",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Laptop sidebar matches the Tasks page: ruled section titles, thin lines between items, and the current page in bold colour",
    points: [

    ]
  },
  {
    id: "u221",
    date: "2026-11-05",
    title: "Tasks: tick boxes are bigger and red on late, due-soon, exam and quiz tasks, sit beside their task on laptops, and the two-week strip shows task names",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tasks: tick boxes are bigger and red on late, due-soon, exam and quiz tasks, sit beside their task on laptops, and the two-week strip shows task names",
    points: [

    ]
  },
  {
    id: "u220",
    date: "2026-11-05",
    title: "Tasks screen is easier to read: bigger section titles on phones, simpler Done and Goals lines, a tighter two-week strip on laptops, and larger dates in Midnight Ink",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tasks screen is easier to read: bigger section titles on phones, simpler Done and Goals lines, a tighter two-week strip on laptops, and larger dates in Midnight Ink",
    points: [

    ]
  },
  {
    id: "u219",
    date: "2026-11-05",
    title: "Late tasks on the Tasks two-week strip now show a ! as well as red, and nothing peeks out above the add-task bar on phones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Late tasks on the Tasks two-week strip now show a ! as well as red, and nothing peeks out above the add-task bar on phones",
    points: [

    ]
  },
  {
    id: "u218",
    date: "2026-11-05",
    title: "On phones, the add-task bar stays fully above the bottom menu, and long task names show on two lines",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "On phones, the add-task bar stays fully above the bottom menu, and long task names show on two lines",
    points: [

    ]
  },
  {
    id: "u217",
    date: "2026-11-05",
    title: "On phones, the Done list is no longer hidden under the add-task bar, and subjects are easier to tap",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "On phones, the Done list is no longer hidden under the add-task bar, and subjects are easier to tap",
    points: [

    ]
  },
  {
    id: "u216",
    date: "2026-11-05",
    title: "New aim: finish your syllabus and tasks by a date. Today shows what's left and how many topics a day it takes",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New aim: finish your syllabus and tasks by a date. Today shows what's left and how many topics a day it takes",
    points: [

    ]
  },
  {
    id: "u215",
    date: "2026-11-05",
    title: "New aim: keep a rhythm on an ongoing goal. Tap the goal, choose \"Did it today\", and Today shows how many times you have done it this week",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New aim: keep a rhythm on an ongoing goal. Tap the goal, choose \"Did it today\", and Today shows how many times you have done it this week",
    points: [

    ]
  },
  {
    id: "u214",
    date: "2026-11-05",
    title: "New aim in Settings: show up to a number of classes each week, and Today counts how many you have attended so far",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New aim in Settings: show up to a number of classes each week, and Today counts how many you have attended so far",
    points: [

    ]
  },
  {
    id: "u213",
    date: "2026-11-05",
    title: "A subject's own attendance line now moves with it when a timetable rescan renames the subject completely",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "A subject's own attendance line now moves with it when a timetable rescan renames the subject completely",
    points: [

    ]
  },
  {
    id: "u212",
    date: "2026-11-05",
    title: "Starting the app is back to just your name, and a subject's own attendance line now stays put when a rescan changes its code or name",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Starting the app is back to just your name, and a subject's own attendance line now stays put when a rescan changes its code or name",
    points: [

    ]
  },
  {
    id: "u211",
    date: "2026-11-05",
    title: "Set your aim in Settings: your attendance line, and a different line for one subject if it needs one, and Today shows \"Aim 75% · on track\"",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Set your aim in Settings: your attendance line, and a different line for one subject if it needs one, and Today shows \"Aim 75% · on track\"",
    points: [

    ]
  },
  {
    id: "u210",
    date: "2026-11-05",
    title: "On a laptop, Tasks shows your next two weeks as a strip, with each deadline on its day and a line marking today",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "On a laptop, Tasks shows your next two weeks as a strip, with each deadline on its day and a line marking today",
    points: [

    ]
  },
  {
    id: "u209",
    date: "2026-11-05",
    title: "Your attendance line is now used everywhere: the weekly view no longer assumes 75%, and Settings no longer says \"most colleges\"",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Your attendance line is now used everywhere: the weekly view no longer assumes 75%, and Settings no longer says \"most colleges\"",
    points: [

    ]
  },
  {
    id: "u208",
    date: "2026-11-05",
    title: "Tasks reads like the Daily Briefing: a headline, Now and This week, and a typing bar to add",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The Tasks page now opens with one line (\"Five to do.",
    points: [
      "One is late.\"), shows what is due now and this week, and folds Later, Goals and finished tasks to one line each so it fits a phone screen. The tick sits on the right; tap a task for Edit, Open its subject page or Delete. Type a task in the bar above the bottom menu and press Enter. On a laptop, each subject's next deadline sits beside the list."
    ]
  },
  {
    id: "u207",
    date: "2026-11-04",
    title: "Pasted notices: number ranges like 3-5 are no longer read as dates",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Pasted notices: number ranges like 3-5 are no longer read as dates",
    points: [

    ]
  },
  {
    id: "u206",
    date: "2026-11-04",
    title: "Pasted notices: more dates found, you choose which to keep",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Pasted notices: more dates found, you choose which to keep",
    points: [

    ]
  },
  {
    id: "u205",
    date: "2026-11-04",
    title: "Paste a notice or circular and check its dates before saving",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tasks › Paste a message or circular now also reads a plain notice or circular, not just WhatsApp chats. You review the dates before anything is saved.",
    points: [

    ]
  },
  {
    id: "u204",
    date: "2026-11-04",
    title: "Laptop sidebar now has a College portal link; unused search styles removed",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Laptop sidebar now has a College portal link; unused search styles removed",
    points: [

    ]
  },
  {
    id: "u203",
    date: "2026-11-04",
    title: "The empty Notices tab is gone; your college portal link now opens from the More menu",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The empty Notices tab is gone; your college portal link now opens from the More menu",
    points: [

    ]
  },
  {
    id: "u202",
    date: "2026-11-04",
    title: "Long-press the app icon to jump straight to Today, Tasks or Timetable",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Long-press the app icon to jump straight to Today, Tasks or Timetable",
    points: [

    ]
  },
  {
    id: "u201",
    date: "2026-11-04",
    title: "Marking a class or ticking a task gives a small buzz and can be undone; the app icon shows how many tasks are due today",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Marking a class or ticking a task gives a small buzz and can be undone; the app icon shows how many tasks are due today",
    points: [

    ]
  },
  {
    id: "u200",
    date: "2026-11-04",
    title: "Settings keeps what you typed even if you close the app right away; clearer words for starting counts and tidying subjects",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings keeps what you typed even if you close the app right away; clearer words for starting counts and tidying subjects",
    points: [

    ]
  },
  {
    id: "u199",
    date: "2026-11-04",
    title: "Settings is now six short sections you can jump between, saves as you go, and keeps the clear buttons in a danger zone at the end",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings is now six short sections you can jump between, saves as you go, and keeps the clear buttons in a danger zone at the end",
    points: [

    ]
  },
  {
    id: "u198",
    date: "2026-11-04",
    title: "The arrow on Ask Desk's suggestion row now works with the keyboard; unused Notices styles removed",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The arrow on Ask Desk's suggestion row now works with the keyboard; unused Notices styles removed",
    points: [

    ]
  },
  {
    id: "u197",
    date: "2026-11-04",
    title: "Ask Desk opens with a short hello and three questions you can tap; the suggestion row shows it scrolls",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Ask Desk opens with a short hello and three questions you can tap; the suggestion row shows it scrolls",
    points: [

    ]
  },
  {
    id: "u196",
    date: "2026-11-04",
    title: "Notices page is calmer when nothing is posted; Dev Notes moved to Settings → About",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Notices page is calmer when nothing is posted; Dev Notes moved to Settings → About",
    points: [

    ]
  },
  {
    id: "u195",
    date: "2026-11-04",
    title: "An empty Tasks page now shows an example and a line to type into: write \"WD assignment by 13 Nov\" and the date and subject fill in",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "An empty Tasks page now shows an example and a line to type into: write \"WD assignment by 13 Nov\" and the date and subject fill in",
    points: [

    ]
  },
  {
    id: "u194",
    date: "2026-11-04",
    title: "Calendar shows your month at a glance: class marks on every day, deadlines, break days and your exam date",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Calendar shows your month at a glance: class marks on every day, deadlines, break days and your exam date",
    points: [

    ]
  },
  {
    id: "u193",
    date: "2026-11-04",
    title: "Present +1 and Missed +1 now count for subjects that also have a lab, like DS; earlier taps count too",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Present +1 and Missed +1 now count for subjects that also have a lab, like DS; earlier taps count too",
    points: [

    ]
  },
  {
    id: "u192",
    date: "2026-11-04",
    title: "Daily Briefing now looks ahead: what tomorrow holds, your whole week at a glance, what's due and which subject to watch",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Daily Briefing now looks ahead: what tomorrow holds, your whole week at a glance, what's due and which subject to watch",
    points: [

    ]
  },
  {
    id: "u191",
    date: "2026-11-04",
    title: "Each subject's page is now its home: your attendance in one sentence, this week's classes, what's due and your study links",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Each subject's page is now its home: your attendance in one sentence, this week's classes, what's due and your study links",
    points: [

    ]
  },
  {
    id: "u190",
    date: "2026-11-04",
    title: "The sample AI-DS timetable is gone from the app; if you were using it, it is now saved as your own timetable",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The sample AI-DS timetable is gone from the app; if you were using it, it is now saved as your own timetable",
    points: [

    ]
  },
  {
    id: "u189",
    date: "2026-11-04",
    title: "Subject Hubs reads at a glance: each subject's code sits in its attendance ring, and empty rows stay quiet",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Subject Hubs reads at a glance: each subject's code sits in its attendance ring, and empty rows stay quiet",
    points: [
      "Each ring now shows the subject's code (DS, DEMP), and the 75% notch shows even before you mark anything.",
      "Before you mark any class, rows no longer repeat \"Attendance not set yet / No data\". One line at the top explains the rings, with a \"Mark today\" link."
    ]
  },
  {
    id: "u188",
    date: "2026-11-04",
    title: "Mark your whole day in one tap: Today shows a day bar after classes, and your attendance bar shows the 75% line",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Mark your whole day in one tap: Today shows a day bar after classes, and your attendance bar shows the 75% line",
    points: [
      "After your last class, Today shows the day as blocks on a time line. Tap a class to mark it (Present, then Absent), or tap \"I was at all 4\".",
      "The attendance bar now has a notch at your target, so you can see how far above or below the line you are. Before you mark anything it shows your target."
    ]
  },
  {
    id: "u187",
    date: "2026-11-04",
    title: "Clearer buttons and names: typing boxes no longer look red, Present/Absent words on laptops",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clearer buttons and names: typing boxes no longer look red, Present/Absent words on laptops",
    points: [
      "A box you are typing in now gets a dark ink edge instead of a red one, so it never looks like an error.",
      "The laptop timetable shows \"Present\" and \"Absent\" next to the icons, like phones do.",
      "\"Full timetable →\" style links are easier to tap.",
      "The sidebar says \"Notices\" and \"Settings\", matching the phone menu, and Study Vault has its own icon."
    ]
  },
  {
    id: "u186",
    date: "2026-11-04",
    title: "Pop-ups open without sliding when your phone is set to reduce motion",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Pop-ups open without sliding when your phone is set to reduce motion",
    points: [

    ]
  },
  {
    id: "u185",
    date: "2026-11-04",
    title: "The bouncing tip next to the + button stays still when your phone is set to reduce motion",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The bouncing tip next to the + button stays still when your phone is set to reduce motion",
    points: [

    ]
  },
  {
    id: "u184",
    date: "2026-11-04",
    title: "Ask Desk's subtitle and suggestion hints are a little bigger and easier to read on phones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Ask Desk's subtitle and suggestion hints are a little bigger and easier to read on phones",
    points: [

    ]
  },
  {
    id: "u183",
    date: "2026-11-04",
    title: "Undo on your very first attendance marks now also takes them off your other devices",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Before, if Undo left this phone with no marks at all, the account kept them and they came back on the next sync.",
    points: [
      "Adds checks for Mark all, attendance Undo and the install card timing."
    ]
  },
  {
    id: "u182",
    date: "2026-11-04",
    title: "Attendance is quicker: Present stands out, Absent is quieter, marks can be undone, and one tap marks all ended classes Present",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Attendance is quicker: Present stands out, Absent is quieter, marks can be undone, and one tap marks all ended classes Present",
    points: [

    ]
  },
  {
    id: "u181",
    date: "2026-11-04",
    title: "Phone search is a magnifier that opens full width, so you can read what you type",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Phone search is a magnifier that opens full width, so you can read what you type",
    points: [

    ]
  },
  {
    id: "u180",
    date: "2026-11-04",
    title: "Today on phones: the Next class card is a compact row, so more of your schedule shows without scrolling",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today on phones: the Next class card is a compact row, so more of your schedule shows without scrolling",
    points: [

    ]
  },
  {
    id: "u179",
    date: "2026-11-04",
    title: "Smaller tap-area overlaps and clipped text fixed: notice descriptions wrap, last tiny labels are readable",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Smaller tap-area overlaps and clipped text fixed: notice descriptions wrap, last tiny labels are readable",
    points: [

    ]
  },
  {
    id: "u178",
    date: "2026-11-04",
    title: "Easier to tap and read: unmarked past classes stay clear, Present/Absent and top-bar buttons are bigger, tiny text is larger",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Easier to tap and read: unmarked past classes stay clear, Present/Absent and top-bar buttons are bigger, tiny text is larger",
    points: [

    ]
  },
  {
    id: "u177",
    date: "2026-11-04",
    title: "Only one banner at a time: the update notice is slimmer, and the install card waits until your third visit",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Only one banner at a time: the update notice is slimmer, and the install card waits until your third visit",
    points: [

    ]
  },
  {
    id: "u176",
    date: "2026-11-04",
    title: "Tidy up: Tomorrow label matches other headings, past classes print clearly",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tidy up: Tomorrow label matches other headings, past classes print clearly",
    points: [

    ]
  },
  {
    id: "u175",
    date: "2026-11-04",
    title: "Small fixes: no grey edge on pages, past classes stay easy to mark, due dates in plain words",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Small fixes: no grey edge on pages, past classes stay easy to mark, due dates in plain words",
    points: [

    ]
  },
  {
    id: "u174",
    date: "2026-11-04",
    title: "Tea-paper flecks are softer and the lamp glow has rounded edges",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tea-paper flecks are softer and the lamp glow has rounded edges",
    points: [

    ]
  },
  {
    id: "u173",
    date: "2026-11-04",
    title: "Every palette keeps Clarity Desk's terracotta for your name and the Now marker, and each one gets its own small touch: stitched lines, a lamp glow or tea-paper flecks",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Every palette keeps Clarity Desk's terracotta for your name and the Now marker, and each one gets its own small touch: stitched lines, a lamp glow or tea-paper flecks",
    points: [

    ]
  },
  {
    id: "u172",
    date: "2026-11-04",
    title: "Light palettes look clearly different: Ai & Kaki in indigo, Tetsu lamp in iron teal and Azuki & Matcha in red bean on tea paper",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Light palettes look clearly different: Ai & Kaki in indigo, Tetsu lamp in iron teal and Azuki & Matcha in red bean on tea paper",
    points: [

    ]
  },
  {
    id: "u171",
    date: "2026-11-04",
    title: "Four new colour palettes in Desk Settings: Rikyū (the current look), Ai & Kaki, Tetsu lamp and Azuki & Matcha, each with a light and dark version",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Four new colour palettes in Desk Settings: Rikyū (the current look), Ai & Kaki, Tetsu lamp and Azuki & Matcha, each with a light and dark version",
    points: [

    ]
  },
  {
    id: "u170",
    date: "2026-11-04",
    title: "Daily Briefing's \"nothing urgent\" line is a plain line now, and the one-time drag tip sits beside the + button instead of over your list",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Daily Briefing's \"nothing urgent\" line is a plain line now, and the one-time drag tip sits beside the + button instead of over your list",
    points: [

    ]
  },
  {
    id: "u169",
    date: "2026-11-04",
    title: "Notice Board is calmer: ERP Portal and Dev Notes are small link lines, so your notices come first",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Notice Board is calmer: ERP Portal and Dev Notes are small link lines, so your notices come first",
    points: [

    ]
  },
  {
    id: "u168",
    date: "2026-11-04",
    title: "Subject Hubs are calmer: each subject is a simple line, and only the ring shows its colour",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Subject Hubs are calmer: each subject is a simple line, and only the ring shows its colour",
    points: [

    ]
  },
  {
    id: "u167",
    date: "2026-11-04",
    title: "Dev Notes: the Today update note no longer mentions a change that didn't ship",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Dev Notes: the Today update note no longer mentions a change that didn't ship",
    points: [

    ]
  },
  {
    id: "u166",
    date: "2026-11-04",
    title: "Today keeps the attendance bar and shows every class in the schedule, with the class happening now highlighted",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today keeps the attendance bar and shows every class in the schedule, with the class happening now highlighted",
    points: [

    ]
  },
  {
    id: "u165",
    date: "2026-11-04",
    title: "Pages no longer stretch across wide screens; Today and the rest sit at a comfortable reading width",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Pages no longer stretch across wide screens; Today and the rest sit at a comfortable reading width",
    points: [

    ]
  },
  {
    id: "u164",
    date: "2026-11-04",
    title: "Calmer pages across the app: lists are simple lines, selected days and tabs are underlined, and the Daily Briefing and Weekly Reflection read as short summaries",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Calmer pages across the app: lists are simple lines, selected days and tabs are underlined, and the Daily Briefing and Weekly Reflection read as short summaries",
    points: [

    ]
  },
  {
    id: "u163",
    date: "2026-11-04",
    title: "Today's numbers now use the app's rounded font instead of a coding font, the second Present/Absent pair is smaller, and small labels are easier to read",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today's numbers now use the app's rounded font instead of a coding font, the second Present/Absent pair is smaller, and small labels are easier to read",
    points: [

    ]
  },
  {
    id: "u162",
    date: "2026-11-03",
    title: "Today is calmer: the class to mark sits with the class you're in, and due dates are plain words",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today is calmer: the class to mark sits with the class you're in, and due dates are plain words",
    points: [

    ]
  },
  {
    id: "u161",
    date: "2026-11-03",
    title: "Light mode now sits on a warm paper background instead of pale green, so pages feel calmer and easier on the eyes",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Light mode now sits on a warm paper background instead of pale green, so pages feel calmer and easier on the eyes",
    points: [

    ]
  },
  {
    id: "u160",
    date: "2026-11-03",
    title: "Vault files already on your phone now reach your other devices without waiting for an edit, and wait while data saver is on",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Vault files already on your phone now reach your other devices without waiting for an edit, and wait while data saver is on",
    points: [

    ]
  },
  {
    id: "u159",
    date: "2026-11-03",
    title: "Vault files added on one device can now be downloaded on your other devices when you're signed in",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Vault files added on one device can now be downloaded on your other devices when you're signed in",
    points: [

    ]
  },
  {
    id: "u158",
    date: "2026-11-03",
    title: "Google sign-in, backups with many Vault files and deleting subjects now work in the installed app",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "These used the browser's own pop-up question, which the installed app cancels on its own, so the button did nothing (and a backup with too many Vault files was never made).",
    points: [
      "They now ask with Clarity Desk's own dialog."
    ]
  },
  {
    id: "u157",
    date: "2026-11-03",
    title: "Task names, subjects and timetable notes always show as plain text, and subjects with an apostrophe open again",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Text from typing, WhatsApp imports, photo scans, backups and other devices is now escaped everywhere it is shown, so it can never be read as page code.",
    points: [
      "Buttons for a subject like \"Women's Studies\" no longer break."
    ]
  },
  {
    id: "u156",
    date: "2026-11-03",
    title: "Faster first load: the sign-in and sync code now loads only for students who use sync",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Signed-out students no longer download the ~150 KB Firebase SDK on every visit.",
    points: [
      "Signed-in phones start it alongside app.js as before; sign-in loads it on demand, and the service worker keeps the saved copy across updates so sync still works offline."
    ]
  },
  {
    id: "u155",
    date: "2026-11-03",
    title: "Vault viewer: make Full screen in-app only, add a separate button to hide the browser bars on desktop and tablets",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Vault viewer: make Full screen in-app only, add a separate button to hide the browser bars on desktop and tablets",
    points: [

    ]
  },
  {
    id: "u154",
    date: "2026-11-03",
    title: "Add a Full screen / Minimise button to the Vault file viewer, open it full screen on phones, and tap images to zoom",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "Add a Full screen / Minimise button to the Vault file viewer, open it full screen on phones, and tap images to zoom",
    points: [

    ]
  },
  {
    id: "u153",
    date: "2026-11-03",
    title: "Open Vault files inside the app so it works on Safari, installed PWAs and phones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Open Vault files inside the app so it works on Safari, installed PWAs and phones",
    points: [

    ]
  },
  {
    id: "u152",
    date: "2026-11-03",
    title: "Open HTML, PDF, image and text files from the Vault in a new tab instead of downloading them",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Open HTML, PDF, image and text files from the Vault in a new tab instead of downloading them",
    points: [

    ]
  },
  {
    id: "u151",
    date: "2026-11-03",
    title: "Fix the drop guard so it works where the page has no drag events",
    category: "Fix",
    tag: "Fix",
    tagColor: "var(--red)",
    summary: "Fix the drop guard so it works where the page has no drag events",
    points: [

    ]
  },
  {
    id: "u150",
    date: "2026-11-03",
    title: "Dropping a file next to the Study Vault no longer makes the browser open it and leave the app",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Dropping a file next to the Study Vault no longer makes the browser open it and leave the app",
    points: [

    ]
  },
  {
    id: "u149",
    date: "2026-11-03",
    title: "You can now drop files or whole folders anywhere on the Study Vault and review them before they are added",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "You can now drop files or whole folders anywhere on the Study Vault and review them before they are added",
    points: [

    ]
  },
  {
    id: "u148",
    date: "2026-11-03",
    title: "You can now drop several files on a subject in the Vault and review them before they are added",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "You can now drop several files on a subject in the Vault and review them before they are added",
    points: [

    ]
  },
  {
    id: "u147",
    date: "2026-11-03",
    title: "You can now drag and drop a file onto the upload box when adding vault material",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "You can now drag and drop a file onto the upload box when adding vault material",
    points: [

    ]
  },
  {
    id: "u146",
    date: "2026-11-03",
    title: "The sync status now shows when your phone last synced, and signing out clears any unanswered sign-in question",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The sync status now shows when your phone last synced, and signing out clears any unanswered sign-in question",
    points: [

    ]
  },
  {
    id: "u145",
    date: "2026-11-03",
    title: "The app keeps working offline after an update that was interrupted by a bad connection, and \"Back online\" no longer mentions cloud sync when you're not signed in",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The app keeps working offline after an update that was interrupted by a bad connection, and \"Back online\" no longer mentions cloud sync when you're not signed in",
    points: [

    ]
  },
  {
    id: "u144",
    date: "2026-11-03",
    title: "Signing in on a phone that already has data can no longer overwrite your account before you choose, even on a slow or lost connection, and Undo now leaves your account as it was",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Signing in on a phone that already has data can no longer overwrite your account before you choose, even on a slow or lost connection, and Undo now leaves your account as it was",
    points: [

    ]
  },
  {
    id: "u143",
    date: "2026-11-03",
    title: "When your phone's storage is full, syncing no longer overwrites your account with older tasks and links, and you get a clear message",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "When your phone's storage is full, syncing no longer overwrites your account with older tasks and links, and you get a clear message",
    points: [

    ]
  },
  {
    id: "u142",
    date: "2026-11-03",
    title: "If a sync replaces or removes your tasks or vault items, you can now undo it from a toast or from Settings",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "If a sync replaces or removes your tasks or vault items, you can now undo it from a toast or from Settings",
    points: [

    ]
  },
  {
    id: "u141",
    date: "2026-11-03",
    title: "The sync badge now says when changes are waiting and sends them as soon as you're back online",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The sync badge now says when changes are waiting and sends them as soon as you're back online",
    points: [

    ]
  },
  {
    id: "u140",
    date: "2026-10-31",
    title: "Calendar: you can now add a task on any date, including past days",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Calendar: you can now add a task on any date, including past days",
    points: [

    ]
  },
  {
    id: "u139",
    date: "2026-10-31",
    title: "Removed the 'Next deadline' task card from Today after classes end",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Removed the 'Next deadline' task card from Today after classes end",
    points: [

    ]
  },
  {
    id: "u138",
    date: "2026-10-31",
    title: "Double-clicking or double-tapping a date in the Calendar now opens a card with that day's tasks and an Add button",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Double-clicking or double-tapping a date in the Calendar now opens a card with that day's tasks and an Add button",
    points: [

    ]
  },
  {
    id: "u137",
    date: "2026-10-31",
    title: "Double-tapping a date in the Calendar now reliably opens Add Task or shows that day's list on phones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Double-tapping a date in the Calendar now reliably opens Add Task or shows that day's list on phones",
    points: [

    ]
  },
  {
    id: "u136",
    date: "2026-10-31",
    title: "Delete, remove and end-holiday buttons now ask inside the app, so they no longer silently do nothing in the installed app",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Delete, remove and end-holiday buttons now ask inside the app, so they no longer silently do nothing in the installed app",
    points: [

    ]
  },
  {
    id: "u135",
    date: "2026-10-31",
    title: "The app now shows the official Clarity Desk logo in the top bar and welcome screen",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The app now shows the official Clarity Desk logo in the top bar and welcome screen",
    points: [

    ]
  },
  {
    id: "u134",
    date: "2026-10-31",
    title: "Clear schedule and Delete class now work in the installed app instead of silently doing nothing",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clear schedule and Delete class now work in the installed app instead of silently doing nothing",
    points: [

    ]
  },
  {
    id: "u133",
    date: "2026-10-31",
    title: "A cleared timetable no longer comes back when you leave and reopen the app",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "A cleared timetable no longer comes back when you leave and reopen the app",
    points: [

    ]
  },
  {
    id: "u132",
    date: "2026-10-31",
    title: "Double-tap a date on the calendar to jump to its list or add something to an empty day",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Double-tap a date on the calendar to jump to its list or add something to an empty day",
    points: [

    ]
  },
  {
    id: "u131",
    date: "2026-10-31",
    title: "Signing in on a phone that already has data now asks before mixing it with your account",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Signing in on a phone that already has data now asks before mixing it with your account",
    points: [

    ]
  },
  {
    id: "u130",
    date: "2026-10-31",
    title: "Syncing between devices no longer risks repeated saves or merged folders",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Syncing between devices no longer risks repeated saves or merged folders",
    points: [

    ]
  },
  {
    id: "u129",
    date: "2026-10-31",
    title: "Your tasks and vault no longer overwrite each other when you use two devices",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Your tasks and vault no longer overwrite each other when you use two devices",
    points: [

    ]
  },
  {
    id: "u128",
    date: "2026-10-31",
    title: "Explain why Google sign-in sometimes shows no account list",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Explain why Google sign-in sometimes shows no account list",
    points: [

    ]
  },
  {
    id: "u127",
    date: "2026-10-30",
    title: "Give the app icon a polished, premium look like native Mac apps",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The home screen, dock, install and browser tab icons now use a smooth squircle with a soft gradient and a thin light edge.",
    points: [
      "The \"C\" and brand colours are the same, and notification icons are unchanged."
    ]
  },
  {
    id: "u126",
    date: "2026-10-30",
    title: "Keep a student's nudge setting if the settings form is missing a field",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Keep a student's nudge setting if the settings form is missing a field",
    points: [

    ]
  },
  {
    id: "u125",
    date: "2026-10-30",
    title: "Add optional gentle nudges for tasks with no deadline",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "Students can turn on a friendly reminder (every day, every 2 days or weekly, at a time they pick) that suggests one ongoing task at a time.",
    points: [
      "Off by default."
    ]
  },
  {
    id: "u124",
    date: "2026-10-29",
    title: "Link icons in the Study Vault now show the whole chain, not half of it",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Link icons in the Study Vault now show the whole chain, not half of it",
    points: [

    ]
  },
  {
    id: "u123",
    date: "2026-10-29",
    title: "Daily Briefing tells you your day in one line, and the Study Vault is easier to use on phones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The briefing now opens with a summary like \"2 classes left, 1 task due, nothing urgent\", shows the next class, hides empty sections and zero counts, and adds a Tomorrow card.",
    points: [
      "In the Study Vault, one Add button replaces three, and subjects open and close from their name so long lists fit on a phone."
    ]
  },
  {
    id: "u122",
    date: "2026-10-29",
    title: "Daily Briefing and Study Vault now open as their own pages",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Each page has its own title, the shared tab bar is gone, and only the page you are on is highlighted in the menu.",
    points: [
      "On phones, tapping Study Vault in More after reading the briefing now opens the vault, not the briefing again."
    ]
  },
  {
    id: "u121",
    date: "2026-10-29",
    title: "The tidy up your desk screen now explains itself in plain words.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The tidy up your desk screen now explains itself in plain words.",
    points: [

    ]
  },
  {
    id: "u120",
    date: "2026-10-29",
    title: "New students now get a quick look around the app and set things up one step at a time.",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New students now get a quick look around the app and set things up one step at a time.",
    points: [

    ]
  },
  {
    id: "u119",
    date: "2026-10-28",
    title: "Scans now warn you when a backup AI read your timetable, and attendance scans highlight any subject whose counts went down since your last save.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Scans now warn you when a backup AI read your timetable, and attendance scans highlight any subject whose counts went down since your last save.",
    points: [

    ]
  },
  {
    id: "u118",
    date: "2026-10-28",
    title: "Attendance scans now double-check with a second AI when a subject's counts don't add up to its total, and keep the answer that adds up better.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Attendance scans now double-check with a second AI when a subject's counts don't add up to its total, and keep the answer that adds up better.",
    points: [

    ]
  },
  {
    id: "u117",
    date: "2026-10-28",
    title: "Timetable scans now show how long they usually take, count the seconds, and can be cancelled. Attendance scans also say how long they usually take.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Timetable scans now show how long they usually take, count the seconds, and can be cancelled. Attendance scans also say how long they usually take.",
    points: [

    ]
  },
  {
    id: "u116",
    date: "2026-10-28",
    title: "Blurry or very small photos now get a quick warning before scanning, so you can retake them for a better timetable, attendance or syllabus scan, or scan them anyway.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Blurry or very small photos now get a quick warning before scanning, so you can retake them for a better timetable, attendance or syllabus scan, or scan them anyway.",
    points: [

    ]
  },
  {
    id: "u115",
    date: "2026-10-28",
    title: "Timetable photo scans finish sooner: the AI starts reading the photo while your phone is still checking it, with the same accuracy as before.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Timetable photo scans finish sooner: the AI starts reading the photo while your phone is still checking it, with the same accuracy as before.",
    points: [

    ]
  },
  {
    id: "u114",
    date: "2026-10-28",
    title: "Red warnings, like overdue tasks and error messages, are easier to read in the light theme with every accent colour.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Red warnings, like overdue tasks and error messages, are easier to read in the light theme with every accent colour.",
    points: [

    ]
  },
  {
    id: "u113",
    date: "2026-10-28",
    title: "Buttons, chat bubbles, toasts and syllabus ticks are easier to read, especially in dark mode, and the light rose and apricot accents are a little deeper so their text stands out.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Buttons, chat bubbles, toasts and syllabus ticks are easier to read, especially in dark mode, and the light rose and apricot accents are a little deeper so their text stands out.",
    points: [

    ]
  },
  {
    id: "u112",
    date: "2026-10-28",
    title: "Clarity Desk opens a little faster again: the timetable photo reader now loads the first time you scan a timetable instead of on every start-up. It still works offline and reads timetables exactly as before.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clarity Desk opens a little faster again: the timetable photo reader now loads the first time you scan a timetable instead of on every start-up. It still works offline and reads timetables exactly as before.",
    points: [

    ]
  },
  {
    id: "u111",
    date: "2026-10-28",
    title: "Clarity Desk opens a little faster: the attendance photo scan and the syllabus scan now load the first time you use them instead of on every start-up. They still work offline and read photos the same way.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clarity Desk opens a little faster: the attendance photo scan and the syllabus scan now load the first time you use them instead of on every start-up. They still work offline and read photos the same way.",
    points: [

    ]
  },
  {
    id: "u110",
    date: "2026-10-28",
    title: "Clarity Desk opens a little faster: Ask Desk now loads the first time you use it instead of on every start-up. It still works offline and gives the same answers.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clarity Desk opens a little faster: Ask Desk now loads the first time you use it instead of on every start-up. It still works offline and gives the same answers.",
    points: [

    ]
  },
  {
    id: "u109",
    date: "2026-10-28",
    title: "Deadline labels now read \"Due today\" and \"Due tomorrow\" in plain sentence case across Today, Tasks and the study plan, and some leftover unused code was tidied away.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Deadline labels now read \"Due today\" and \"Due tomorrow\" in plain sentence case across Today, Tasks and the study plan, and some leftover unused code was tidied away.",
    points: [

    ]
  },
  {
    id: "u108",
    date: "2026-10-28",
    title: "Clarity Desk starts up a little lighter: an old, unused notification system was removed, so the app loads one less script and the offline helper no longer downloads anything extra. Your reminders work exactly as before.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clarity Desk starts up a little lighter: an old, unused notification system was removed, so the app loads one less script and the offline helper no longer downloads anything extra. Your reminders work exactly as before.",
    points: [

    ]
  },
  {
    id: "u107",
    date: "2026-10-28",
    title: "Today is calmer and easier to read. The class card now shows just what matters: the class in progress with time left and a progress line, the next class with its start time, or your next deadline once classes are over. Small labels are quieter, red is only used for overdue work, the dots on your class list sit neatly on the line, and greetings have more variety. With reduced motion turned on, pages no longer fade in.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today is calmer and easier to read. The class card now shows just what matters: the class in progress with time left and a progress line, the next class with its start time, or your next deadline once classes are over. Small labels are quieter, red is only used for overdue work, the dots on your class list sit neatly on the line, and greetings have more variety. With reduced motion turned on, pages no longer fade in.",
    points: [

    ]
  },
  {
    id: "u106",
    date: "2026-10-28",
    title: "The holiday palm now sways smoothly and no longer jumps back when Today refreshes",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The holiday palm now sways smoothly and no longer jumps back when Today refreshes",
    points: [

    ]
  },
  {
    id: "u105",
    date: "2026-10-28",
    title: "Holiday mode feels more like a holiday: a soft sunset on Today, no countdown or notice nudges during the break, and a welcome-back card on your first day back",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Holiday mode feels more like a holiday: a soft sunset on Today, no countdown or notice nudges during the break, and a welcome-back card on your first day back",
    points: [

    ]
  },
  {
    id: "u104",
    date: "2026-10-28",
    title: "Dev Notes are tidier: the version number at the end of each note is gone, and each note still shows its date",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Dev Notes are tidier: the version number at the end of each note is gone, and each note still shows its date",
    points: [

    ]
  },
  {
    id: "u103",
    date: "2026-10-28",
    title: "Holiday mode now has start and end dates, a calm holiday look, an End early button, and a holiday Daily Briefing that still shows every real deadline",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Holiday mode now has start and end dates, a calm holiday look, an End early button, and a holiday Daily Briefing that still shows every real deadline",
    points: [

    ]
  },
  {
    id: "u102",
    date: "2026-10-28",
    title: "Fix: reports now show the right app version, and a report saved offline is kept (with a small screenshot) until it is sent",
    category: "Fix",
    tag: "Fix",
    tagColor: "var(--red)",
    summary: "Fix: reports now show the right app version, and a report saved offline is kept (with a small screenshot) until it is sent",
    points: [

    ]
  },
  {
    id: "u101",
    date: "2026-10-28",
    title: "New: Report a problem now sends your message straight to the developer",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New: Report a problem now sends your message straight to the developer",
    points: [

    ]
  },
  {
    id: "u100",
    date: "2026-10-28",
    title: "New: Report a problem now opens a small form (bug, feedback or idea, with an optional screenshot) that goes straight to the developer",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New: Report a problem now opens a small form (bug, feedback or idea, with an optional screenshot) that goes straight to the developer",
    points: [

    ]
  },
  {
    id: "u99",
    date: "2026-10-28",
    title: "New: the welcome screen now pops in with a small animation and a nudging arrow, and the tour cards slide in as you swipe",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New: the welcome screen now pops in with a small animation and a nudging arrow, and the tour cards slide in as you swipe",
    points: [

    ]
  },
  {
    id: "u98",
    date: "2026-10-28",
    title: "New: simpler welcome screen with Explore and Log in, plus a swipeable tour; welcome no longer gets cut off on short screens",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New: simpler welcome screen with Explore and Log in, plus a swipeable tour; welcome no longer gets cut off on short screens",
    points: [

    ]
  },
  {
    id: "u97",
    date: "2026-10-28",
    title: "New: press and hold a task to select several and delete them, with Undo; finished tasks now fold into a Completed section",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New: press and hold a task to select several and delete them, with Undo; finished tasks now fold into a Completed section",
    points: [

    ]
  },
  {
    id: "u96",
    date: "2026-10-28",
    title: "Fix: changes to your tasks and settings on one device now show up on your other devices",
    category: "Fix",
    tag: "Fix",
    tagColor: "var(--red)",
    summary: "Fix: changes to your tasks and settings on one device now show up on your other devices",
    points: [

    ]
  },
  {
    id: "u95",
    date: "2026-10-28",
    title: "New: open the app as ?timing to see what made it slow to load",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "Opening claritydesk.web.app/?timing shows a small panel with what the visit waited on: when the page arrived, when the screen was first drawn, when the app was ready, and which server and file took longest.",
    points: [
      "It uses the browser's own timing data; nothing is saved or sent. It is for tracking down slow first visits on phones.",
      "Test: verify_timing_view.mjs (only with ?timing, no storage or network calls, text escaped, init marks when the app is ready)."
    ]
  },
  {
    id: "u94",
    date: "2026-10-28",
    title: "The app's screen appears a little sooner on first open",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "style.css no longer imports the fonts itself.",
    points: [
      "The page's <head> already loads them (Spline Sans Mono added there), and the import made the browser download style.css before it could even ask for the fonts.",
      "chore side: the old GitHub \"Background Push Notifications\" job no longer runs every 15 minutes. Reminders come from push-worker (Cloudflare); this job's secret has been invalid since at least 2026-10-10, and it reads every user's whole document per run, which would pass Firestore's free daily reads at about 260 users. It can still be run by hand.",
      "Tests: verify_hosting_files.mjs (no @import in style.css, all five fonts in the <head> link); verify_push_notifications.mjs now checks the job is manual-only."
    ]
  },
  {
    id: "u93",
    date: "2026-10-27",
    title: "The app now loads much faster on networks that reach our host slowly",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Some Indian networks reach Firebase Hosting's CDN at a few KB per second or not at all, while Cloudflare is fast.",
    points: [
      "index.html / 404.html: style.css and app.js from jsDelivr, pinned to the exact deployed git commit, with onerror fallbacks to this site.",
      "sw.js: precaches the jsDelivr copies (offline unchanged).",
      "scripts/ship.mjs: points the pages at HEAD's commit when app files changed (own chore: commit), and after pushing checks jsDelivr serves exactly those files before deploying.",
      "tests/serve.mjs: local tests keep running the working tree.",
      "tests/verify_hosting_files.mjs: one commit everywhere, fallbacks, precache, jsDelivr copies also published here."
    ]
  },
  {
    id: "u92",
    date: "2026-10-27",
    title: "The app starts downloading its data at the same time as the app itself",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "index.html and 404.html now preload app.js and data.js from <head>.",
    points: [
      "Before, data.js was only found once app.js had fully arrived, which cost one extra wait on a slow connection.",
      "Test: verify_hosting_files.mjs checks the preload URLs match the real script URLs (a mismatch would download app.js twice)."
    ]
  },
  {
    id: "u91",
    date: "2026-10-27",
    title: "Make the app's first load lighter: it downloads each file only once",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Trade-off: WhatsApp/zip import needs one online use before it works offline.",
    points: [
      "sw.js: the install step now precaches the exact URLs the page requests (app.js?v=229, style.css?v=229, firebase-config.js?v=229, the five head icons with ?v=229), each once, so the second fetch is served from the browser's HTTP cache instead of the network.",
      "sw.js: deadline-import.js, deadline-import-worker.js and vendor/jszip.min.js are no longer precached; they are cached on first use.",
      "scripts/ship.mjs: the version bump and the ?v= consistency check now cover sw.js too, and the runtime file set strips ?v=N.",
      "tests: published-file check strips ?v=N; new checks for duplicate precache URLs and ?v= matching CACHE_NAME; the import test now expects first-use caching.",
      "PROJECT_MEMORY.md updated."
    ]
  },
  {
    id: "u90",
    date: "2026-10-27",
    title: "On a slow connection the app now starts in about 3 seconds instead of 9",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The 3-second wait from the last update happened three times in a row (page, then app.js, then data.js).",
    points: [
      "Now, once one file has had to come from the saved copy, the next ones use their saved copies straight away for 30 seconds. A fast answer from Clarity Desk itself ends that early; fast answers from Google's Firebase files or a 404 don't.",
      "Also keeps the service worker alive until a late download is saved, so the next open really gets the newer copy.",
      "Tests: verify_sw_network_timeout.mjs (+4 checks), pwa-smoke test 5 (stalled network: app starts in < 5 s; 9.2 s before, 3.2 s now)."
    ]
  },
  {
    id: "u89",
    date: "2026-10-27",
    title: "The installed app now opens in about 3 seconds on a slow connection",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "If the network is very slow, Clarity Desk opens from the copy already saved on your phone instead of waiting, and still picks up the newest version in the background for next time.",
    points: [

    ]
  },
  {
    id: "u88",
    date: "2026-10-27",
    title: "Keep bigger Study Vault files on your phone: up to 10 MB each, without filling the app's storage",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Uploaded notes now live in the browser's own file storage on this device instead of the small shared app storage.",
    points: [
      "Files you already saved move over by themselves, each one checked before the old copy is replaced. Backups still include your files (up to 30 MB, smallest first). Nothing new goes to the cloud."
    ]
  },
  {
    id: "u87",
    date: "2026-10-27",
    title: "Add many files and links to the Study Vault at once, with search and a storage meter",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "Pick or drop several files, or paste links from a WhatsApp message, check the list, and add them in one go.",
    points: [
      "Search your vault by subject, name or type. Each item shows a PDF, VIDEO or DRIVE tag, and a meter shows how full your phone's storage is. Unsafe links can no longer be opened from the vault."
    ]
  },
  {
    id: "u86",
    date: "2026-10-27",
    title: "Get a reminder offer right after you add your first class",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Get a reminder offer right after you add your first class",
    points: [

    ]
  },
  {
    id: "u85",
    date: "2026-10-27",
    title: "Save the study links from your WhatsApp class group straight into Subject Hubs",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "When you import a class group chat, Clarity Desk now also lists the Drive, Docs, Classroom, YouTube and PDF links shared in it.",
    points: [
      "Pick the ones you want, check the subject, and they're added to Subject Hubs. Links you already saved aren't added again, and you can undo. You can also start from the new \"Import links from WhatsApp\" button in the Study Vault."
    ]
  },
  {
    id: "u84",
    date: "2026-10-27",
    title: "Clarity Desk now tells you when your desk couldn't sync to your account",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "If a change can't reach your account (not just being offline), the status shows \"Sync failed · Saved here\" and you get one message saying everything is still on your phone and it will try again.",
    points: [
      "When a later sync works, it goes back to \"Cloud synced\"."
    ]
  },
  {
    id: "u83",
    date: "2026-10-27",
    title: "Opened Clarity Desk from Instagram or Facebook? It now helps you open it in Chrome",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Browsers inside Instagram, Facebook and similar apps can forget your desk when they close, and Google sign-in doesn't work there.",
    points: [
      "Clarity Desk now shows a card with a one-tap \"Open in Chrome\" on Android, simple steps on iPhone, and a Copy link button."
    ]
  },
  {
    id: "u82",
    date: "2026-10-27",
    title: "Study Vault files no longer break your sync, and you're told when a file can't be saved",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Files up to 1 MB can be added to the Study Vault; bigger ones get a message suggesting a Google Drive link instead.",
    points: [
      "If your phone's storage for Clarity Desk is full, the vault now says the file wasn't saved instead of showing \"saved\". Uploaded files stay on the phone that added them, so a big file can no longer stop your tasks and attendance from syncing. Other devices show \"On another device\" for those files."
    ]
  },
  {
    id: "u81",
    date: "2026-10-27",
    title: "See how many classes you can miss before you set anything up",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Type the classes you attended and held from your college portal, on the welcome screen or on Today, and Clarity Desk tells you straight away how many you can miss and still stay at your target, or how many you need to attend in a row to get back to it.",
    points: [
      "Nothing is saved."
    ]
  },
  {
    id: "u80",
    date: "2026-10-27",
    title: "If you only looked around on an old Clarity Desk address, it now takes you straight to the new one",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings the app saves on its own during a visit (attendance mode, date-fix marker, which reminders were already shown) no longer count as a saved desk, so they no longer keep you on the old address.",
    points: [

    ]
  },
  {
    id: "u79",
    date: "2026-10-27",
    title: "Clarity Desk now lives at one address, claritydesk.web.app, and helps you move your desk there",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Opening an old address with nothing saved now goes straight to claritydesk.web.app.",
    points: [
      "If your desk is saved on the old address, you stay there and see a card that helps you move it: sign in, or download a backup and restore it at the new address."
    ]
  },
  {
    id: "u78",
    date: "2026-10-26",
    title: "You can now sign in with an email and password if you prefer",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "In Settings → Sign In with Email, tap \"Sign in with a password\" to sign in or create an account with a password.",
    points: [
      "\"Forgot password?\" emails you a reset link."
    ]
  },
  {
    id: "u77",
    date: "2026-10-26",
    title: "You can now sign in with any email address, not just Google",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Settings has a new \"Sign In with Email\" button.",
    points: [
      "Type your email, tap the link we send you, and your desk syncs across devices. No password needed.",
      "On iPhone, email links open in Safari rather than the home-screen app. So the app has a \"Paste sign-in link\" box, and a link opened in another browser is never used up until you choose where to sign in."
    ]
  },
  {
    id: "u76",
    date: "2026-10-26",
    title: "Clarity Desk now offers to install itself, and shows simple steps for your phone or computer so reminders really arrive",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "When you open the site in a browser, a small card offers to install Clarity Desk: one tap on Android, Windows and Mac Chrome/Edge, short steps on iPhone (Add to Home Screen) and Mac Safari (Add to Dock).",
    points: [
      "\"Not now\" hides it for two weeks. After you turn reminders on, a short guide for your exact device shows the settings that most often hide reminders (battery saver and Autostart on Android, keeping the browser running on Windows, Persistent alerts on Mac, Focus on iPhone), with a \"Send a test\" button. Settings has a \"Make sure they arrive\" button to open it again."
    ]
  },
  {
    id: "u75",
    date: "2026-10-26",
    title: "Tap Study Resources at the top of a subject to jump straight to its links",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Tap Study Resources at the top of a subject to jump straight to its links",
    points: [

    ]
  },
  {
    id: "u74",
    date: "2026-10-26",
    title: "Picking several subject cards to remove no longer unticks them on its own",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Picking several subject cards to remove no longer unticks them on its own",
    points: [

    ]
  },
  {
    id: "u73",
    date: "2026-10-26",
    title: "Reminders on laptops and Android now offer to install Clarity Desk first, so they pop up as Clarity Desk with its logo",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Turning on reminders now shows an \"Install app\" step when the browser can install Clarity Desk.",
    points: [
      "\"Use browser\" still turns them on without installing. The turn-on sheet also says \"this device\" instead of \"this phone\"."
    ]
  },
  {
    id: "u72",
    date: "2026-10-25",
    title: "Adding a dated task from Today's quick-add box now offers closed-app reminders, and turning them on never gets stuck",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Found while testing on an iPhone simulator: the quick \"+ Add a task\" box on Today saved deadlines but never offered to turn reminders on, and if a phone's push service doesn't answer, \"Turn on\" now stops after 20 seconds with a clear message instead of waiting forever.",
    points: [
      "The push key is also fetched as soon as the sheet opens, so on iPhone the sign-up follows the \"Allow\" tap straight away."
    ]
  },
  {
    id: "u71",
    date: "2026-10-25",
    title: "The \"Day Before\" deadline reminder setting now says \"(Morning)\", matching when it actually arrives",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "It comes at your morning summary time (8 AM unless you changed it), the same as \"Same Day (Morning)\".",
    points: [
      "The old \"(09:00)\" label was never right."
    ]
  },
  {
    id: "u70",
    date: "2026-10-25",
    title: "WhatsApp import now shows how many chat messages it skipped, and Settings has a \"Tell me what breaks\" button",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The deadline review now says how many messages had no deadline in them (the \"ok\"s, \"thanks\" and photos), and Settings has a Report a problem button that opens a short form with only the app version and device type filled in.",
    points: [
      "Class reminders from the older Google sign-in push now show 12-hour times too."
    ]
  },
  {
    id: "u69",
    date: "2026-10-25",
    title: "Class and deadline reminders now arrive even when the app is closed",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Turn them on once (no sign-in needed) and class reminders, plus a morning reminder on the day a deadline is due, reach your phone with Clarity Desk closed.",
    points: [
      "Only each reminder's text and time leave your phone, never your chats."
    ]
  },
  {
    id: "u68",
    date: "2026-10-25",
    title: "Clarity Desk now also opens at claritydesk.web.app, an easier address to remember. The old address keeps working. Your data doesn't move on its own: back up in Settings on the old address, then restore it on the new one.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clarity Desk now also opens at claritydesk.web.app, an easier address to remember. The old address keeps working. Your data doesn't move on its own: back up in Settings on the old address, then restore it on the new one.",
    points: [

    ]
  },
  {
    id: "u67",
    date: "2026-10-25",
    title: "Clean up desk no longer merges numbered subjects like \"Open Elective 1\" and \"Open Elective 2\" into one card. They always stay separate, while real typos like \"Open Electiv 1\" are still merged.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Clean up desk no longer merges numbered subjects like \"Open Elective 1\" and \"Open Elective 2\" into one card. They always stay separate, while real typos like \"Open Electiv 1\" are still merged.",
    points: [

    ]
  },
  {
    id: "u66",
    date: "2026-10-25",
    title: "\"Load Sample Template\" now works inside in-app browsers (like the ones that open links from WhatsApp or Instagram). It asks you to confirm in the app's own dialog instead of a browser pop-up that those browsers silently blocked.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "\"Load Sample Template\" now works inside in-app browsers (like the ones that open links from WhatsApp or Instagram). It asks you to confirm in the app's own dialog instead of a browser pop-up that those browsers silently blocked.",
    points: [

    ]
  },
  {
    id: "u65",
    date: "2026-10-25",
    title: "The 75% target mark on each subject's attendance ring is now a softer, thinner line, so it reads as a guide instead of a glitch.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "The 75% target mark on each subject's attendance ring is now a softer, thinner line, so it reads as a guide instead of a glitch.",
    points: [

    ]
  },
  {
    id: "u64",
    date: "2026-10-25",
    title: "Subjects no longer show \"Duplicate subject cards found\" when there is nothing to clean up. The banner and the red dot on Manage now appear only when Clean up desk would actually remove or merge something, and real duplicates like \"Data Structure\" and \"Data Structures\" are now caught.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Subjects no longer show \"Duplicate subject cards found\" when there is nothing to clean up. The banner and the red dot on Manage now appear only when Clean up desk would actually remove or merge something, and real duplicates like \"Data Structure\" and \"Data Structures\" are now caught.",
    points: [

    ]
  },
  {
    id: "u63",
    date: "2026-10-23",
    title: "New holiday mode: turn it on in Settings during a break and your classes are hidden from Today, the Calendar and reminders, with an optional end date. Nothing is deleted and your attendance % stays as it is. Tap \"Resume classes\" any time to bring everything back.",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New holiday mode: turn it on in Settings during a break and your classes are hidden from Today, the Calendar and reminders, with an optional end date. Nothing is deleted and your attendance % stays as it is. Tap \"Resume classes\" any time to bring everything back.",
    points: [

    ]
  },
  {
    id: "u62",
    date: "2026-10-21",
    title: "Calendar is easier to use: tap a day and add a deadline for that date, see what's due in the next 7 days under the month, and swipe left or right to change month. Today has a ring, the day you pick is filled in, past days are greyed, and each day shows up to 3 dots then \"+N\". A calendar left open overnight now comes back on today, and the + button no longer covers \"Set Up Timetable\".",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Calendar is easier to use: tap a day and add a deadline for that date, see what's due in the next 7 days under the month, and swipe left or right to change month. Today has a ring, the day you pick is filled in, past days are greyed, and each day shows up to 3 dots then \"+N\". A calendar left open overnight now comes back on today, and the + button no longer covers \"Set Up Timetable\".",
    points: [

    ]
  },
  {
    id: "u61",
    date: "2026-10-20",
    title: "Today is easier to scan when you have lots of classes and tasks: it shows up to 4 classes (the ones that need you first) and 4 tasks, each with a \"+N more\" link to the full page. The attendance card now has one short line, the \"mark this class\" row is smaller on computers, and the clock is gone from the top bar. Add Task now asks only for subject, title and due date, with type, marks, priority and notes under \"More details\".",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today is easier to scan when you have lots of classes and tasks: it shows up to 4 classes (the ones that need you first) and 4 tasks, each with a \"+N more\" link to the full page. The attendance card now has one short line, the \"mark this class\" row is smaller on computers, and the clock is gone from the top bar. Add Task now asks only for subject, title and due date, with type, marks, priority and notes under \"More details\".",
    points: [

    ]
  },
  {
    id: "u60",
    date: "2026-10-20",
    title: "Today is calmer: before you add a timetable it shows just your greeting, the Get started card and your tasks. The class schedule and attendance cards appear once a timetable exists, and attendance stays hidden if you study on your own. The extra floating Add Task button is gone from Today (use the quick-add box), and the theme name and save status moved from the top bar into Desk Settings.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today is calmer: before you add a timetable it shows just your greeting, the Get started card and your tasks. The class schedule and attendance cards appear once a timetable exists, and attendance stays hidden if you study on your own. The extra floating Add Task button is gone from Today (use the quick-add box), and the theme name and save status moved from the top bar into Desk Settings.",
    points: [

    ]
  },
  {
    id: "u59",
    date: "2026-10-20",
    title: "New Calendar view: see your classes, deadlines and tasks by date in a month grid. Open it from the sidebar, or from More on your phone. Tap a date to see that day's list, and tap anything to open it. It only shows what you already have, so nothing new to set up, and it works offline.",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "New Calendar view: see your classes, deadlines and tasks by date in a month grid. Open it from the sidebar, or from More on your phone. Tap a date to see that day's list, and tap anything to open it. It only shows what you already have, so nothing new to set up, and it works offline.",
    points: [

    ]
  },
  {
    id: "u58",
    date: "2026-10-20",
    title: "Add your syllabus faster: in any subject, tap Add topics, then \"Scan a photo or PDF\". Clarity Desk reads the topics (and any marks or important stars) from your syllabus and shows you the list to check and fix before anything is saved. Pasting still works offline.",
    category: "Feature",
    tag: "Feature",
    tagColor: "var(--accent)",
    summary: "Add your syllabus faster: in any subject, tap Add topics, then \"Scan a photo or PDF\". Clarity Desk reads the topics (and any marks or important stars) from your syllabus and shows you the list to check and fix before anything is saved. Pasting still works offline.",
    points: [

    ]
  },
  {
    id: "u57",
    date: "2026-10-20",
    title: "Ask Desk now knows your syllabus. Ask \"how much syllabus is left\", \"what should I revise\", \"important topics left\", \"am I on track\" or \"have I done normalization\". \"What should I study today\" now picks three topics for you, by weightage and how close each exam is.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Ask Desk now knows your syllabus. Ask \"how much syllabus is left\", \"what should I revise\", \"important topics left\", \"am I on track\" or \"have I done normalization\". \"What should I study today\" now picks three topics for you, by weightage and how close each exam is.",
    points: [

    ]
  },
  {
    id: "u56",
    date: "2026-10-20",
    title: "Track your syllabus: open any subject, paste its topics, and tick each one as done and then revised. Mark topics High, Medium or Low, or add marks, so the progress bar shows how much of the exam you have covered. Set an exam date per subject, see your syllabus progress on Today, and get a small \"well done\" when you finish or fully revise a subject. Studying on your own? Add a subject by name from Subject Hubs.",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Track your syllabus: open any subject, paste its topics, and tick each one as done and then revised. Mark topics High, Medium or Low, or add marks, so the progress bar shows how much of the exam you have covered. Set an exam date per subject, see your syllabus progress on Today, and get a small \"well done\" when you finish or fully revise a subject. Studying on your own? Add a subject by name from Subject Hubs.",
    points: [

    ]
  },
  {
    id: "u55",
    date: "2026-10-20",
    title: "feat: calm celebration card for all tasks done, attendance back on target, and countdown milestones",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "feat: calm celebration card for all tasks done, attendance back on target, and countdown milestones",
    points: [

    ]
  },
  {
    id: "u54",
    date: "2026-10-20",
    title: "Studying on your own? Pick \"I study on my own\" when you start (or in Settings) and Today skips the timetable and attendance setup and focuses on your tasks. The countdown now works for any exam: type GATE, Boards or anything else in Settings, and Today cheers you on as the date gets closer, with a reminder at 30, 14, 7, 3 and 1 days left. The low attendance alert is friendlier, and the tab icon refreshes properly after updates. (v194)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Studying on your own? Pick \"I study on my own\" when you start (or in Settings) and Today skips the timetable and attendance setup and focuses on your tasks. The countdown now works for any exam: type GATE, Boards or anything else in Settings, and Today cheers you on as the date gets closer, with a reminder at 30, 14, 7, 3 and 1 days left. The low attendance alert is friendlier, and the tab icon refreshes properly after updates. (v194)",
    points: [

    ]
  },
  {
    id: "u53",
    date: "2026-10-20",
    title: "Today is less crowded: the class in the big card no longer repeats in the schedule on phones, you can mark a finished class straight from the reminder at the top, attendance shows one clear sentence, and the extra Add button is gone so the + button no longer covers the last item. Adding a task is clearer: Subject lists your subjects plus General, Task Type lists the kind of work (General is now Other) and shows as buttons on phones, and the Due Date box lines up with Task Type. The WhatsApp import now explains how to share a chat straight to Clarity Desk on Android. (v193)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Today is less crowded: the class in the big card no longer repeats in the schedule on phones, you can mark a finished class straight from the reminder at the top, attendance shows one clear sentence, and the extra Add button is gone so the + button no longer covers the last item. Adding a task is clearer: Subject lists your subjects plus General, Task Type lists the kind of work (General is now Other) and shows as buttons on phones, and the Due Date box lines up with Task Type. The WhatsApp import now explains how to share a chat straight to Clarity Desk on Android. (v193)",
    points: [

    ]
  },
  {
    id: "u52",
    date: "2026-10-20",
    title: "Import deadlines from your WhatsApp class group: pick an exported chat or paste messages on the Tasks page, check what was found, and add the ones you want. The chat is read on your phone only and is never saved or uploaded. You can fix a title, date or time first, undo the import, or save the deadlines to your calendar. On Android you can share an exported chat straight to Clarity Desk. (v192)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Import deadlines from your WhatsApp class group: pick an exported chat or paste messages on the Tasks page, check what was found, and add the ones you want. The chat is read on your phone only and is never saved or uploaded. You can fix a title, date or time first, undo the import, or save the deadlines to your calendar. On Android you can share an exported chat straight to Clarity Desk. (v192)",
    points: [

    ]
  },
  {
    id: "u51",
    date: "2026-10-20",
    title: "Scanning a timetable now sets up your subjects for you: only the subjects you scanned show in Subject Hubs, and each one gets its own Study Vault folder. Rows that are really a room, a teacher, a batch or a free period like Library or T&P are marked \"Not a subject\" before you save. After a rescan, old subjects that aren't in the new timetable can be hidden in one tap, and your attendance and vault files stay safe. (v191)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Scanning a timetable now sets up your subjects for you: only the subjects you scanned show in Subject Hubs, and each one gets its own Study Vault folder. Rows that are really a room, a teacher, a batch or a free period like Library or T&P are marked \"Not a subject\" before you save. After a rescan, old subjects that aren't in the new timetable can be hidden in one tap, and your attendance and vault files stay safe. (v191)",
    points: [

    ]
  },
  {
    id: "u50",
    date: "2026-10-19",
    title: "Photo scans are faster and more reliable: the app now starts with the AI model that answers quickest and doesn't wait on an overloaded one, so most scans finish in 10 to 20 seconds. When your phone reads a timetable without the AI, rows it clearly misread are now marked for you to check. (v190)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Photo scans are faster and more reliable: the app now starts with the AI model that answers quickest and doesn't wait on an overloaded one, so most scans finish in 10 to 20 seconds. When your phone reads a timetable without the AI, rows it clearly misread are now marked for you to check. (v190)",
    points: [

    ]
  },
  {
    id: "u49",
    date: "2026-10-19",
    title: "Timetable scans now read times like \"12:10am\" and \"9.00 to 10.55\" correctly, so classes no longer show up at midnight. Attendance scans highlight any subject whose numbers don't match the printed percentage or that appears twice, and lab subjects no longer get mixed up with the theory subject of the same name. (v189)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Timetable scans now read times like \"12:10am\" and \"9.00 to 10.55\" correctly, so classes no longer show up at midnight. Attendance scans highlight any subject whose numbers don't match the printed percentage or that appears twice, and lab subjects no longer get mixed up with the theory subject of the same name. (v189)",
    points: [

    ]
  },
  {
    id: "u48",
    date: "2026-10-18",
    title: "Ask Desk now gives a correct answer when you have no safe skips and says \"next Sunday\" when that's what it means. Today reads better with one class and shows how many classes are left. The + button on the Timetable page now adds a class, the profile button shows a person icon instead of \"?\", the welcome card shows the new logo, and the top bar no longer overflows on mid-size screens. (v188)",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Ask Desk now gives a correct answer when you have no safe skips and says \"next Sunday\" when that's what it means. Today reads better with one class and shows how many classes are left. The + button on the Timetable page now adds a class, the profile button shows a person icon instead of \"?\", the welcome card shows the new logo, and the top bar no longer overflows on mid-size screens. (v188)",
    points: [

    ]
  },
  {
    id: "u47",
    date: "2026-10-15",
    title: "Attendance rings on Subjects now animate only when you open the page, not every few seconds",
    category: "Update",
    tag: "Update",
    tagColor: "var(--blue)",
    summary: "Attendance rings on Subjects now animate only when you open the page, not every few seconds",
    points: [

    ]
  },
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
