// ==================================================================
// Clarity Desk: WhatsApp deadline import (pure parser, no DOM)
// ==================================================================
// Reads an exported or copied WhatsApp chat and finds exams, submissions,
// presentations and lecture changes. Everything runs on the device: the
// raw chat is never stored, uploaded or logged. Only the rows the student
// ticks in the review list become tasks (see app.js, WhatsApp import).
//
// Ported from the standalone prototype parser; the matching logic is the
// same, only split into named helpers. Tests: tests/verify_deadline_import.mjs
// ==================================================================

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 864e5;

// System lines and media placeholders carry no deadlines.
const SKIP = /(<media omitted>|this message was deleted|messages and calls are end-to-end encrypted|created group|added you|joined using this group|left$|changed the (?:subject|group)|image omitted|document omitted|null$)/i;

// Order matters: the first kind whose pattern matches wins.
const KINDS = [
  ['exam', /\b(?:exams?|tests?|unit test|ut[- ]?\d|viva|quiz|internals?|mid[- ]?sem|end[- ]?sem|practical exam|oral)\b/i],
  ['pres', /\b(?:presentations?|ppts?|seminars?|ca[- ]?\d\b.*\b(?:present|talk))/i],
  ['lec', /\b(?:extra (?:lecture|lec|class|practical|lab)s?|(?:lecture|lec|class|lab|practical)s? (?:is |are |will be )?(?:shifted|cancell?ed|rescheduled|postponed|preponed)|no (?:lecture|lec|class)s?|holiday|timetable|time table|guest lecture|workshop|session)\b/i],
  ['sub', /\b(?:submit|submission|submitted|deadline|due|last date|assignments?|journals?|write[- ]?ups?|records?|reports?|practical file|lab file|upload)\b/i],
  ['oth', /\b(?:ca[- ]?\d|fees?|form|registration|meeting|compulsory|mandatory)\b/i],
];

// ── Message header ────────────────────────────────────────────
// Every WhatsApp layout:
//   Android export:   20/10/26, 9:15 pm - Name: msg
//   iPhone export:    [20/10/26, 9:15:32 PM] Name: msg
//   Web/Desktop copy: [9:15 pm, 20/10/2026] Name: msg
//   24-hour:          20/10/2026 21:15 - Name: msg
// \s also covers the narrow no-break space (U+202F) before am/pm.
const H_DATE = '(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{2,4})';
const H_TIME = '(\\d{1,2})[:.](\\d{2})(?:[:.]\\d{2})?\\s*([ap]\\.?\\s?m\\.?)?';
const PREFIX = new RegExp(`^[\\u200e\\u200f\\s]*\\[?\\s*(?:${H_DATE},?\\s+${H_TIME}|${H_TIME},?\\s+${H_DATE})\\s*\\]?\\s*(?:[-\\u2013:]\\s*)?([\\s\\S]*)$`, 'i');

function parseHeader(line) {
  const m = line.match(PREFIX);
  if (!m) return null;
  let a, b, y, h, mi, ap;
  if (m[1] !== undefined) [a, b, y, h, mi, ap] = [m[1], m[2], m[3], m[4], m[5], m[6]];
  else [h, mi, ap, a, b, y] = [m[7], m[8], m[9], m[10], m[11], m[12]];
  const rest = m[13] || '';
  const nm = rest.match(/^([^:\n]{1,60}?):\s?([\s\S]*)$/);
  return {
    a: +a, b: +b, y: +y, h: +h, mi: +mi, ap,
    who: nm ? nm[1].replace(/[\u200e\u200f~]/g, '').trim() : '',
    text: nm ? nm[2] : rest,
    system: !nm,
  };
}

// Splits a chat into messages. Lines without a header belong to the
// message above them. DD/MM unless the headers prove MM/DD.
export function splitMessages(raw) {
  const lines = String(raw || '').replace(/\r/g, '').split('\n');
  const heads = lines.map(parseHeader);
  const found = heads.filter(Boolean);
  const monthFirst = found.some(h => h.b > 12) && !found.some(h => h.a > 12);
  const msgs = [];
  let cur = null;
  lines.forEach((line, i) => {
    const h = heads[i];
    if (h) {
      let y = h.y; if (y < 100) y += 2000;
      let H = h.h;
      if (h.ap) {
        const pm = /p/i.test(h.ap);
        if (pm && H < 12) H += 12;
        if (!pm && H === 12) H = 0;
      }
      const sent = monthFirst ? new Date(y, h.a - 1, h.b, H, h.mi) : new Date(y, h.b - 1, h.a, H, h.mi);
      cur = { sent, who: h.who, text: h.system ? '' : h.text };
      msgs.push(cur);
    } else if (cur) {
      cur.text += '\n' + line;
    } else if (line.trim()) {
      cur = { sent: null, who: '', text: line };
      msgs.push(cur);
    }
  });
  return { msgs, dayFirst: !monthFirst, recognised: found.length };
}

function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function atMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// ── Times ─────────────────────────────────────────────────────
// Times are found and blanked out first, so "10 to 12" or "10-12" can
// never be read as a date.
const AP = '(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)';
const HHMM = '(\\d{1,2})(?:[:.](\\d{2}))?';
const RANGE = new RegExp(`\\b${HHMM}\\s*${AP}?\\s*(?:-|\\u2013|to|till|until|se)\\s*${HHMM}\\s*${AP}?(?:\\s*(?:hrs|hours|o'?clock|baje))?`, 'gi');
const SINGLE = new RegExp(`\\b${HHMM}\\s*${AP}|\\b(?:at|by|before|till|until|@)\\s*(\\d{1,2})[:.](\\d{2})\\b|\\b(\\d{1,2})\\s*(?:o'?clock|baje)`, 'gi');
const OTHER_DATE_WORD = new RegExp(`\\b(?:${MONTHS.join('|')})|\\d{1,2}\\/\\d{1,2}|\\b(?:${DAYS.join('|')})|tomorrow|tmrw|today`);

// College hours: a bare 1 to 6 means afternoon, 7 to 12 stays as is.
function hourGuess(h, ap, college = true) {
  if (ap) {
    const pm = /p/i.test(ap);
    if (pm && h < 12) return h + 12;
    if (!pm && h === 12) return 0;
    return h;
  }
  if (h > 12) return h;
  if (college && h >= 1 && h <= 6) return h + 12;
  return h;
}

// Returns { start: [h, m] | null, end: [h, m] | null, masked } where
// masked is the lower-cased text with every time span blanked out.
export function findTimes(text) {
  const t = String(text).toLowerCase();
  const spans = [];
  let start = null, end = null, m;
  const hasOtherDate = OTHER_DATE_WORD.test(t);
  RANGE.lastIndex = 0;
  while ((m = RANGE.exec(t))) {
    const [all, h1, m1, ap1, h2, m2, ap2] = m;
    const a = +h1, b = +h2;
    if (a > 24 || b > 24) continue;
    const ctxBefore = t.slice(Math.max(0, m.index - 12), m.index);
    const sepWord = /\b(to|till|until|se)\b/.test(all);
    const shortSpan = a <= 12 && b <= 12 && a < b && b - a <= 4;
    const timey = ap1 || ap2 || m1 || m2 || sepWord || (shortSpan && hasOtherDate)
      || /(from|between|time|timing|at|@|slot|lecture|lec|class|lab)\s*$/.test(ctxBefore)
      || /hrs|hours|clock|baje/.test(all);
    // "21-10" style with a valid month is a date unless the context says time
    if (!timey) continue;
    spans.push([m.index, m.index + all.length]);
    if (start === null) {
      let e = hourGuess(b, ap2);
      let s = hourGuess(a, ap1 || (ap2 && a <= b ? ap2 : null));
      if (!ap1 && !ap2 && a > b && a <= 12 && s < 12) e = b + 12 <= 23 ? b + 12 : b; // "11 to 1" is 11 am to 1 pm
      if (s > e && !ap1) s = a; // "10-12 pm": start is morning
      start = [s, +(m1 || 0)];
      end = [e, +(m2 || 0)];
    }
  }
  SINGLE.lastIndex = 0;
  while ((m = SINGLE.exec(t))) {
    const idx = m.index;
    if (spans.some(([a, b]) => idx >= a && idx < b)) continue;
    spans.push([idx, idx + m[0].length]);
    if (start === null) {
      if (m[1] !== undefined) start = [hourGuess(+m[1], m[3]), +(m[2] || 0)];
      else if (m[4] !== undefined) start = [+m[4], +m[5]];
      else if (m[6] !== undefined) start = [hourGuess(+m[6], null), 0];
    }
  }
  let masked = t;
  for (const [a, b] of spans) masked = masked.slice(0, a) + ' '.repeat(b - a) + masked.slice(b);
  return { start, end, masked };
}

// ── Dates ─────────────────────────────────────────────────────
const MON = MONTHS.join('|');
const RE_NUMERIC = /\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/g;                                           // 21/10, 21-10-2026
const RE_DAY_MONTH = new RegExp(`\\b(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MON})[a-z]*\\.?(?:,?\\s*(\\d{4}))?`, 'g'); // 21st Oct
const RE_MONTH_DAY = new RegExp(`\\b(${MON})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`, 'g');      // Oct 21st
const RE_ORDINAL = /\b(?:on|by|till|before|dated?)\s+(\d{1,2})(?:st|nd|rd|th)\b/g;                                  // on 21st
const RE_WEEKDAY = new RegExp(`\\b(${DAYS.join('|')})(?:day|nesday|rsday|urday|sday)?\\b`);
// Relative to the day the message was sent, not to today.
const RELATIVE = [
  [/\bday after (?:tomorrow|tmrw|tmr)\b/, 2],
  [/\b(?:tomorrow|tmrw|tmr|tomm?orow|2mrw|tmw)\b/, 1],
  [/\b(?:today|tonight|by eod|aaj)\b/, 0],
];

// Every date-looking piece is a candidate; the best-scored one wins.
export function findDate(masked, base, dayFirst = true) {
  const cands = [];
  let m;
  const year = (y) => { if (!y) return null; y = +y; return y < 100 ? y + 2000 : y; };
  const make = (y, mo, d, score, idx, explicitYear) => {
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return;
    const dt = new Date(y ?? base.getFullYear(), mo, d);
    if (dt.getDate() !== d) return;
    if (!explicitYear && dt < addDays(atMidnight(base), -45)) dt.setFullYear(dt.getFullYear() + 1);
    cands.push({ date: dt, score, idx });
  };

  RE_NUMERIC.lastIndex = 0;
  while ((m = RE_NUMERIC.exec(masked))) {
    const a = +m[1], b = +m[2];
    const [dd, mm] = dayFirst ? [a, b] : [b, a];
    make(year(m[3]), mm - 1, dd, m[3] ? 5 : 3, m.index, !!m[3]);
  }
  RE_DAY_MONTH.lastIndex = 0;
  while ((m = RE_DAY_MONTH.exec(masked))) make(year(m[3]), MONTHS.indexOf(m[2]), +m[1], 6, m.index, !!m[3]);
  RE_MONTH_DAY.lastIndex = 0;
  while ((m = RE_MONTH_DAY.exec(masked))) make(year(m[3]), MONTHS.indexOf(m[1]), +m[2], 6, m.index, !!m[3]);
  RE_ORDINAL.lastIndex = 0;
  while ((m = RE_ORDINAL.exec(masked))) {
    const d = +m[1];
    let dt = new Date(base.getFullYear(), base.getMonth(), d);
    if (dt < atMidnight(base)) dt = new Date(base.getFullYear(), base.getMonth() + 1, d);
    cands.push({ date: dt, score: 3, idx: m.index });
  }
  for (const [re, n] of RELATIVE) {
    if ((m = masked.match(re))) { cands.push({ date: addDays(atMidnight(base), n), score: 4, idx: m.index }); break; }
  }
  const wm = masked.match(RE_WEEKDAY);
  const wd = wm ? DAYS.indexOf(wm[1]) : -1;
  if (wd >= 0) {
    let diff = (wd - base.getDay() + 7) % 7;
    if (diff === 0 && !/\btoday\b/.test(masked)) diff = 7;
    cands.push({ date: addDays(atMidnight(base), diff), score: 2, idx: wm.index, fromWeekday: true });
  }
  if (!cands.length) return null;

  const b0 = atMidnight(base);
  for (const c of cands) {
    if (wd >= 0 && !c.fromWeekday && c.date.getDay() === wd) c.score += 6; // "Wednesday 21st" must agree
    const days = (c.date - b0) / DAY_MS;
    if (days < -1) c.score -= 5;   // notices are about the future
    if (days > 150) c.score -= 3;  // probably not a date at all
  }
  cands.sort((x, y) => y.score - x.score || x.idx - y.idx);
  return new Date(cands[0].date);
}

// ── Titles ────────────────────────────────────────────────────
const GREETING = /^(?:dear\s+(?:all|students|everyone|class)|hello(?:\s+(?:all|everyone|students))?|hi(?:\s+all)?|good\s+(?:morning|afternoon|evening)(?:\s+(?:all|everyone|students))?|attention(?:\s+(?:all|students))?|important|imp|notice|reminder|update|note|all students)\b[\s,:!.\-*]*/i;

export function shortTitle(text) {
  let s = String(text).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(GREETING, '').replace(/^[*_~\s]+/, '');
  const cut = s.search(/[.!?\n](\s|$)/);
  if (cut > 20) s = s.slice(0, cut);
  return s.length > 80 ? s.slice(0, 77).replace(/\s\S*$/, '') + '…' : s;
}

// ── Study links ───────────────────────────────────────────────
// Drive, Docs, Classroom, YouTube, PDFs and other links shared in the
// chat, for the Subject Hubs review list. Same privacy rule as deadlines:
// nothing here is stored; only the links the student ticks are saved.
const URL_RE = /https?:\/\/[^\s<>"'‎‏]+/gi;
// Not study material: group invites, chat links, status, maps, short pay links.
const LINK_SKIP = /^(?:chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com|whatsapp\.com|maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.|paytm\.|phon\.pe|gpay\.)/i;

export function cleanUrl(raw) {
  let u = String(raw || '').replace(/[)\].,!?;:*_~]+$/, '');
  try {
    const x = new URL(u);
    [...x.searchParams.keys()].forEach(k => { if (/^utm_|^fbclid$|^si$/i.test(k)) x.searchParams.delete(k); });
    u = x.toString();
  } catch (_) { return ''; }
  return u;
}

export function linkKind(url) {
  const u = url.toLowerCase();
  if (/drive\.google\.com\/(?:drive\/)?folders|drive\.google\.com\/file|drive\.google\.com\/open|dropbox\.com|onedrive|1drv\.ms|sharepoint\.com/.test(u)) return 'drive';
  if (/docs\.google\.com|notion\.so|forms\.gle/.test(u)) return 'doc';
  if (/classroom\.google\.com/.test(u)) return 'classroom';
  if (/youtube\.com|youtu\.be|vimeo\.com/.test(u)) return 'video';
  if (/\.pdf(?:$|[?#])/.test(u)) return 'pdf';
  if (/github\.com|gitlab\.com|replit\.com|codepen\.io/.test(u)) return 'code';
  return 'other';
}

function linkDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

function linksFromMessages(msgs) {
  const byUrl = new Map();
  for (const msg of msgs) {
    const text = String(msg.text || '');
    const found = text.match(URL_RE);
    if (!found) continue;
    const context = text.replace(URL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    for (const raw of found) {
      const url = cleanUrl(raw);
      if (!url) continue;
      const host = url.replace(/^https?:\/\//i, '');
      if (LINK_SKIP.test(host)) continue;
      const domain = linkDomain(url);
      const title = shortTitle(context) || domain;
      byUrl.set(url, { url, kind: linkKind(url), domain, title, context, who: msg.who, sent: msg.sent });
    }
  }
  const links = [...byUrl.values()].sort((a, b) => (b.sent || 0) - (a.sent || 0));
  links.forEach((l, i) => { l.id = `wl-${i}`; });
  return links;
}

export function extractLinks(raw) {
  return linksFromMessages(splitMessages(raw).msgs);
}

// ── Main entry ────────────────────────────────────────────────
// Returns { items, stats }. items: DeadlineCandidate[] sorted by date:
//   { id, kind: 'exam'|'sub'|'pres'|'lec'|'oth', date: Date, end: Date|null,
//     hasTime, title, text, who, sent: Date|null }
// stats: { messages, recognised, ignored, first, last } for the review header.
// ignored: messages with no deadline in them ("ok", "thanks", media...).
export function scanChat(raw, now = new Date()) {
  const { msgs, dayFirst, recognised } = splitMessages(raw);
  const out = [];
  for (const msg of msgs) {
    const text = msg.text.trim();
    if (!text || SKIP.test(text)) continue;
    const kind = (KINDS.find(([, re]) => re.test(text)) || [])[0];
    if (!kind) continue;
    const base = msg.sent || now;
    const { start, end, masked } = findTimes(text);
    const date = findDate(masked, base, dayFirst);
    if (!date) continue;
    let endDate = null;
    if (start) {
      date.setHours(start[0], start[1], 0, 0);
      if (end) {
        endDate = new Date(date);
        endDate.setHours(end[0], end[1], 0, 0);
        if (endDate <= date) endDate = null;
      }
    }
    out.push({
      kind, date, end: endDate, hasTime: !!start,
      text: text.replace(/https?:\/\/\S+/g, '[link]').replace(/\s+/g, ' '),
      title: shortTitle(text), who: msg.who, sent: msg.sent,
    });
  }
  // Teachers repeat reminders: keep the latest message per day + kind + similar title.
  const seen = new Map();
  for (const d of out) seen.set(`${d.kind}|${d.date.toDateString()}|${d.title.slice(0, 20).toLowerCase()}`, d);
  const items = [...seen.values()].sort((a, b) => a.date - b.date);
  items.forEach((d, i) => { d.id = `wa-${d.date.getTime()}-${i}`; });
  const sentDates = msgs.map(m => m.sent).filter(Boolean);
  return {
    items,
    links: linksFromMessages(msgs),
    stats: { messages: msgs.length, recognised, ignored: msgs.length - out.length, first: sentDates[0] || null, last: sentDates[sentDates.length - 1] || null },
  };
}

export function extractDeadlines(raw, now = new Date()) {
  return scanChat(raw, now).items;
}

// ── Task mapping ──────────────────────────────────────────────
// Maps a reviewed candidate to the fields saveCustomTasks()/sanitizeTask()
// keep. startTime/endTime are 'HH:MM' and only set when the message had a time.
const KIND_TO_TASK_TYPE = { exam: 'exam', sub: 'assignment', pres: 'project', lec: 'general', oth: 'general' };
const pad2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export function candidateToTaskFields(c) {
  const fields = {
    title: String(c.title || '').slice(0, 150),
    taskType: KIND_TO_TASK_TYPE[c.kind] || 'general',
    dueDate: ymd(c.date),
    description: String(c.text || '').slice(0, 300),
    source: 'whatsapp',
  };
  if (c.hasTime) {
    fields.startTime = hhmm(c.date);
    if (c.end) fields.endTime = hhmm(c.end);
  }
  return fields;
}

// ── Calendar export (.ics) ────────────────────────────────────
// India has no DST, so a fixed +05:30 VTIMEZONE is exact.
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function icsFold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let cur = '', curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (curLen + len > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; curLen = 0; }
    cur += ch; curLen += len;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}
const icsLocal = (d) => `${ymd(d).replace(/-/g, '')}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;

export function buildIcs(candidates, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clarity Desk//WhatsApp import//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE', 'TZID:Asia/Kolkata',
    'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0530', 'TZOFFSETTO:+0530', 'TZNAME:IST', 'END:STANDARD',
    'END:VTIMEZONE',
  ];
  candidates.forEach((c, i) => {
    lines.push('BEGIN:VEVENT', `UID:${c.id || `wa-${i}`}-${stamp}@clarity-desk`, `DTSTAMP:${stamp}`);
    if (c.hasTime) {
      const end = c.end || new Date(c.date.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART;TZID=Asia/Kolkata:${icsLocal(c.date)}`, `DTEND;TZID=Asia/Kolkata:${icsLocal(end)}`);
    } else {
      const next = addDays(atMidnight(c.date), 1);
      lines.push(`DTSTART;VALUE=DATE:${ymd(c.date).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ymd(next).replace(/-/g, '')}`);
    }
    lines.push(`SUMMARY:${icsEscape(c.title)}`);
    if (c.text) lines.push(`DESCRIPTION:${icsEscape(String(c.text).slice(0, 300))}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
