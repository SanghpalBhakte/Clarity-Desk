// Welcome tour. Loaded only when a student taps Explore (import() in app.js),
// so it is not part of first paint. Static previews built from the app's own
// CSS classes with sample text; nothing here reads or writes stored data.

const SLIDES = [
  {
    title: 'Your timetable, always at hand',
    text: 'See the class on now, the room, and what is next. Mark attendance in one tap.',
    preview: `
      <div class="chrono-beacon is-live">
        <div class="chrono-beacon-main">
          <span class="chrono-beacon-badge">Now</span>
          <div class="chrono-beacon-title">Data Structures</div>
          <div class="chrono-beacon-meta"><span>10:00 AM – 11:00 AM · Room 204</span></div>
        </div>
      </div>
      <div class="chrono-beacon-then">Next: <strong>Maths</strong> at 11:15 AM</div>`
  },
  {
    title: 'Tasks and deadlines',
    text: 'Everything due, sorted by how soon. Overdue work stands out.',
    preview: `
      <div class="card card-sm assignment-card priority-high"><div style="flex:1;min-width:0"><div class="assignment-title">Lab record</div><div style="font-size:var(--text-sm);color:var(--text-muted)">Due tomorrow</div></div></div>
      <div class="card card-sm assignment-card priority-medium"><div style="flex:1;min-width:0"><div class="assignment-title">Maths assignment 3</div><div style="font-size:var(--text-sm);color:var(--text-muted)">Due in 4 days</div></div></div>`
  },
  {
    title: 'A daily briefing',
    text: 'Open Today for classes, pending tasks and attendance in one calm view.',
    preview: `
      <div class="card" style="padding:14px 16px;border-left:3px solid var(--accent-warm)">
        <div style="font-weight:700;color:var(--text-primary)">Good morning</div>
        <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-top:4px;line-height:1.5">4 classes today · 2 tasks pending · attendance 82%</div>
      </div>`
  },
  {
    title: 'Study vault',
    text: 'Keep notes, links and files for each subject in one place.',
    preview: `
      <div class="resource-link"><span class="vault-type">PDF</span><span style="flex:1;min-width:0">Unit 2 notes</span></div>
      <div class="resource-link"><span class="vault-type">LINK</span><span style="flex:1;min-width:0">Previous year papers</span></div>`
  },
  {
    title: 'Import deadlines from chats',
    text: 'Paste a class WhatsApp export. You review every deadline before it is saved.',
    preview: `
      <div class="wa-tabs"><span class="wa-tab active" style="text-align:center;display:grid;place-items:center">Deadlines</span><span class="wa-tab" style="text-align:center;display:grid;place-items:center">Links</span></div>
      <div class="card card-sm assignment-card"><div style="flex:1;min-width:0"><div class="assignment-title">Submit mini project</div><div style="font-size:var(--text-sm);color:var(--text-muted)">Found in chat · Friday</div></div></div>`
  }
];

export function mountTour(host, { onSignIn, onContinue }) {
  const slides = SLIDES.map(s => `
    <section class="ob-slide" aria-roledescription="slide">
      <div class="ob-preview" aria-hidden="true">${s.preview}</div>
      <h3>${s.title}</h3>
      <p>${s.text}</p>
    </section>`).join('') + `
    <section class="ob-slide" aria-roledescription="slide">
      <h3 style="margin-top:0">Sign in to sync across your devices</h3>
      <p>Your tasks, timetable and attendance follow you to your phone and laptop. Or keep everything on this device only.</p>
      <div class="ob-actions">
        <button type="button" class="btn-primary" data-ob="signin">Sign in</button>
        <button type="button" class="btn-secondary" data-ob="local">Continue without account</button>
      </div>
    </section>`;
  const count = SLIDES.length + 1;
  host.innerHTML = `
    <div class="ob-tour-track" role="group" aria-label="Clarity Desk tour" tabindex="0">${slides}</div>
    <div class="ob-dots">${Array.from({ length: count }, (_, i) =>
      `<button type="button" class="ob-dot" data-i="${i}" aria-label="Card ${i + 1} of ${count}"></button>`).join('')}</div>`;

  const track = host.querySelector('.ob-tour-track');
  const dots = [...host.querySelectorAll('.ob-dot')];
  const current = () => Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
  const sync = () => { const c = current(); dots.forEach((d, i) => d.setAttribute('aria-current', i === c ? 'true' : 'false')); };
  const go = (i) => track.scrollTo({ left: i * track.clientWidth });
  sync();
  track.addEventListener('scroll', sync, { passive: true });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(Math.min(count - 1, current() + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(Math.max(0, current() - 1)); }
  });
  host.addEventListener('click', (e) => {
    const dot = e.target.closest('.ob-dot');
    if (dot) return go(Number(dot.dataset.i));
    const act = e.target.closest('[data-ob]');
    if (!act) return;
    if (act.dataset.ob === 'signin') onSignIn();
    else onContinue();
  });
}
