// First-run tour. Loaded only when a student taps Show me around (import() in
// app.js; precached by sw.js so it works offline). It dims the real page and
// lights up one real tab (phone) or sidebar item (laptop) at a time, with a
// short bubble. Nothing here reads or writes stored data; the name comes in
// from app.js and is set with textContent.

const STOPS = [
  { targets: ['.bottom-nav-item[data-nav="dashboard"]', '#sidebar-dashboard'],
    title: (n) => (n ? `Okay ${n}, this is Today` : 'This is Today'),
    text: "Your next class and anything due soon. Open the app and it's right here." },
  { targets: ['.bottom-nav-item[data-nav="timetable"]', '#sidebar-timetable'],
    title: () => 'Your timetable',
    text: 'Your whole week of classes. Tap a class to say if you went.' },
  { targets: ['.bottom-nav-item[data-nav="subjects"]', '#sidebar-subjects'],
    title: () => 'Subjects',
    text: 'Every subject gets its own page for notes, links and files.' },
  { targets: ['.bottom-nav-item[data-nav="assignments"]', '#sidebar-assignments'],
    title: () => 'Tasks',
    text: 'Homework, assignments, exams. Just type "lab report Friday" and it\'s saved.' },
  { targets: ['#bnav-more', '#sidebar-notices'],
    title: () => 'Everything else',
    text: (onSidebar) => (onSidebar
      ? 'Notices, calendar, study vault and settings are all in this sidebar.'
      : 'Notices, calendar, settings and backups live in here.') },
  { targets: ['.desk-setup-guide'], last: true,
    title: (n) => (n ? `That's the tour, ${n}!` : "That's the tour!"),
    text: 'Last thing. Add your timetable and Today fills up with your real classes.' }
];
const COUNTED = STOPS.filter(s => !s.last).length;
const PAD = 6;
const EDGE = 12;

const visible = (sel) => [...document.querySelectorAll(sel)].find(el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');

export function startTour({ name = '', track = () => {}, onDone = () => {} } = {}) {
  document.getElementById('tour-root')?.remove();
  const before = document.activeElement;
  const root = document.createElement('div');
  root.id = 'tour-root';
  root.innerHTML = `
    <div class="tour-block"></div>
    <div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div class="tour-count"></div>
      <div class="tour-title" id="tour-title"></div>
      <div class="tour-text" id="tour-text"></div>
      <div class="tour-actions">
        <button type="button" class="tour-skip"></button>
        <button type="button" class="btn btn-sm btn-primary tour-next"></button>
      </div>
    </div>`;
  document.body.appendChild(root);
  const spot = root.querySelector('.tour-spot');
  const bubble = root.querySelector('.tour-bubble');
  const els = {
    count: root.querySelector('.tour-count'), title: root.querySelector('.tour-title'), text: root.querySelector('.tour-text'),
    skip: root.querySelector('.tour-skip'), next: root.querySelector('.tour-next')
  };

  let i = -1, target = null, frame = 0, last = '';

  const place = () => {
    if (!target || !target.isConnected) return;
    const r = target.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height},${innerWidth},${innerHeight}`;
    if (key !== last) {
      last = key;
      Object.assign(spot.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
      const bw = bubble.offsetWidth, bh = bubble.offsetHeight, vw = innerWidth, vh = innerHeight;
      let left, top;
      if (r.width < vw / 3 && r.right + PAD + 16 + bw <= vw - EDGE && r.height < vh / 3 && r.left < vw / 3) {
        left = r.right + PAD + 16; top = r.top + r.height / 2 - bh / 2; // beside the sidebar
      } else {
        left = r.left + r.width / 2 - bw / 2;
        top = r.top - PAD - 14 - bh >= EDGE ? r.top - PAD - 14 - bh : r.bottom + PAD + 14;
      }
      bubble.style.left = `${Math.min(Math.max(EDGE, left), vw - bw - EDGE)}px`;
      bubble.style.top = `${Math.min(Math.max(EDGE, top), vh - bh - EDGE)}px`;
    }
    frame = requestAnimationFrame(place);
  };

  const end = (how) => {
    cancelAnimationFrame(frame);
    document.removeEventListener('keydown', onKey, true);
    root.remove();
    // Hand focus back to where it was, or to the page, never to nothing.
    const back = before && before.isConnected && before !== document.body ? before : document.querySelector('.setup-first-btn, main, #app');
    if (back) { if (!back.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(back.tagName)) back.setAttribute('tabindex', '-1'); back.focus(); }
    track(how === 'skip' ? 'tour_skipped' : 'tour_done');
    onDone(how);
  };

  const show = (to, dir = 1) => {
    for (let j = to; j >= 0 && j < STOPS.length; j += dir) {
      const stop = STOPS[j];
      const sel = stop.targets.find(visible);
      if (!sel) continue;
      i = j; target = visible(sel); last = '';
      if (stop.last) target.scrollIntoView({ block: 'center' });
      spot.dataset.target = sel;
      els.count.textContent = stop.last ? '' : `${j + 1} of ${COUNTED}`;
      els.title.textContent = stop.title(name);
      els.text.textContent = typeof stop.text === 'function' ? stop.text(sel.startsWith('#sidebar')) : stop.text;
      els.skip.textContent = stop.last ? 'Later' : 'Skip tour';
      els.next.textContent = stop.last ? "Let's do it" : 'Next';
      track('tour_step', String(j + 1));
      cancelAnimationFrame(frame); place();
      els.next.focus();
      return true;
    }
    return false;
  };

  const next = () => {
    if (STOPS[i] && STOPS[i].last) { end('done'); window.showAddTimetableChoice && window.showAddTimetableChoice(); return; }
    if (!show(i + 1)) end('done');
  };
  const onKey = (e) => {
    if (e.key === 'Tab') {
      // aria-modal: keep focus on the bubble's two buttons.
      e.preventDefault();
      (document.activeElement === els.next ? els.skip : els.next).focus();
    } else if (e.key === 'Escape') { e.preventDefault(); end('skip'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1, -1); }
  };

  els.next.addEventListener('click', next);
  els.skip.addEventListener('click', () => end(STOPS[i] && STOPS[i].last ? 'done' : 'skip'));
  document.addEventListener('keydown', onKey, true);
  if (!show(0)) end('done');
}
