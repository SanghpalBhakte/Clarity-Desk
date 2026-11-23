// ==================================================================
// Clarity Desk: Study Vault screens (subject cards, add links and files)
// ==================================================================
// Moved out of app.js so first load downloads and parses less. app.js
// imports this file the first time the Vault tab opens (loadVaultUi) and
// precaches it in sw.js, so it works offline exactly as before. What stays
// in app.js is the data side (cloud parts, device files, IndexedDB, backup
// and sync), the safe-output helpers (vaultEsc, vaultSafeUrl,
// vaultIconForUrl), the Briefing tab and renderResources, which shows
// "Loading…" and then calls renderLinksContent from here. The inline
// onclick handlers are stubs in app.js that call in here.
// The code below is the same as it was in app.js; the app.js helpers it
// reads arrive in `deps` (vaultDeps() in app.js).
// Tests: tests/lazy-modules.mjs loads this for the app.js test sandbox.
// ==================================================================

export function createVaultUi(deps) {
  const {
    VAULT_BULK_MAX_ROWS, VAULT_FILE_MAX_BYTES, VAULT_FULL_MESSAGE, VAULT_IMPORT_LABEL_MAX, VAULT_MISSING_MESSAGE, VAULT_NO_ROOM_MESSAGE, appConfirm,
    dismissToast, formatBytes, getCanonicalSubjectKey, getResourceIcon, icons, isVaultDeviceFile, isVaultIdbFile, isVaultPlaceholder, jsArg_cd,
    loadCustomLinks, renderLinks, reportFormErrors, saveCustomLinks, showToast, showUndoToast, vaultBytesId, vaultDeleteUnusedBlob, vaultEsc, vaultFileId,
    vaultFileMaxBytes, vaultFileTooBigMessage, vaultIconForUrl, vaultIdbEntry, vaultIdbMissing, vaultPlaceholderFetchable, vaultPlaceholderHere,
    vaultReadDataUrl, vaultSafeUrl, vaultStoreFile, vaultViewKind, waGuessLinkSubject, waLinkSubjects, waNormUrl, waSavedLinkUrls, wireBackdropClickClose
  } = deps;

  // ── Study Vault: safe output, type badges, search, storage meter ─
  // Labels and addresses are shown as text, never as markup, and only web
  // links (or the vault's own saved files) ever become a clickable href.
  // Nothing here writes anything: it only changes what is drawn.
  let _vaultQuery = '';
  const VAULT_STORAGE_GUESS = 5000000;   // characters one site may keep in a phone browser (estimate)
  const VAULT_FILE_ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.zip,.py,.java,.cpp,.c,.js';

  // "drive.google.com/x" typed without https:// still works.
  function vaultNormalizeUrl(raw) {
    const u = String(raw || '').trim();
    if (!u || /^data:/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return u;
    return 'https://' + u.replace(/^\/+/, '');
  }

  function vaultTypeLabel(r) {
    if (!r) return 'LINK';
    const url = String(r.url || ''), name = String(r.label || '').toLowerCase();
    if (isVaultPlaceholder(r) || isVaultIdbFile(r) || r.isUpload || /^data:/i.test(url)) {
      const ext = (name.match(/\.([a-z0-9]{1,5})$/) || [])[1] || '';
      const mime = String(r.mime || (url.match(/^data:([^;,]+)/i) || [])[1] || '').toLowerCase();
      if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
      if (['doc', 'docx'].includes(ext) || /word/.test(mime)) return 'DOC';
      if (['ppt', 'pptx'].includes(ext) || /presentation|powerpoint/.test(mime)) return 'PPT';
      if (ext === 'txt' || mime === 'text/plain') return 'TXT';
      if (['jpg', 'jpeg', 'png'].includes(ext) || /^image\//.test(mime)) return 'IMG';
      if (ext === 'zip' || /zip/.test(mime)) return 'ZIP';
      if (['py', 'java', 'cpp', 'c', 'js'].includes(ext)) return 'CODE';
      return 'FILE';
    }
    const u = url.toLowerCase();
    if (/youtube\.com|youtu\.be|vimeo/.test(u)) return 'VIDEO';
    if (/drive\.google\.com|dropbox|onedrive/.test(u)) return 'DRIVE';
    if (/github\.com|gitlab|codepen|replit/.test(u)) return 'CODE';
    if (/\.pdf(\?|#|$)/.test(u)) return 'PDF';
    if (/docs\.google\.com|notion\.so/.test(u)) return 'DOC';
    return 'LINK';
  }

  function vaultIconForFile(name) {
    const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || '';
    if (['py', 'js', 'cpp', 'c', 'java', 'html', 'css', 'zip'].includes(ext)) return 'code';
    if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
    return 'book-open';
  }

  // Whole-app storage use (estimate) and what the saved files take of it.
  function vaultStorageStats(links) {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        // eslint-disable-next-line no-restricted-syntax -- size estimate inside a try; keeps the vault block free of storage-helper calls (verify_vault_phase1)
        total += k.length + String(localStorage.getItem(k) || '').length;
      }
    } catch (_) {}
    let fileBytes = 0, fileCount = 0;
    (Array.isArray(links) ? links : []).forEach(s => (s && Array.isArray(s.resources) ? s.resources : []).forEach(r => {
      if (isVaultDeviceFile(r)) { fileCount++; fileBytes += Math.round(r.url.length * 0.75); }
      else if (isVaultIdbFile(r)) { fileCount++; fileBytes += Number(r.bytes) || 0; }
    }));
    return {
      total, fileBytes, fileCount,
      free: Math.max(0, VAULT_STORAGE_GUESS - total),
      pct: Math.min(100, Math.round(total / VAULT_STORAGE_GUESS * 100))
    };
  }

  // Asks the browser not to clear the vault when the phone runs low on space.
  // No prompt on most browsers; a refusal changes nothing.
  function vaultAskPersist() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}
  }

  function vaultMeterHtml(links) {
    const st = vaultStorageStats(links);
    if (!st.fileCount && st.pct < 60) return '';
    const warn = st.pct >= 80;
    return `
      <div class="vault-meter ${warn ? 'is-warn' : ''}" data-testid="vault-meter">
        <div class="vault-meter-bar" role="progressbar" aria-label="Phone storage used (estimate)" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.pct}"><span style="width:${st.pct}%"></span></div>
        <div class="vault-meter-text">Phone storage about ${st.pct}% full${st.fileCount ? ` · ${st.fileCount} saved file${st.fileCount !== 1 ? 's' : ''} use ${formatBytes(st.fileBytes)}` : ''}.${warn ? ' Running low: keep big notes as Drive links.' : ''}</div>
      </div>`;
  }

  function vaultResourceMatches(s, r, tokens) {
    if (!tokens.length) return true;
    const hay = `${s.subject || ''} ${s.code || ''} ${r.label || ''} ${vaultTypeLabel(r)}`.toLowerCase();
    return tokens.every(t => hay.includes(t));
  }

  function vaultRowMenu(label, items) {
    return `
              <details class="vault-row-menu">
                <summary aria-label="${label}" title="More"><span aria-hidden="true">⋯</span></summary>
                <div class="vault-row-menu-list" onclick="this.parentNode.open = false">
                  ${items.map(([text, fn, danger]) => `<button type="button" class="${danger ? 'is-danger' : ''}" onclick="${fn}">${text}</button>`).join('')}
                </div>
              </details>`;
  }

  function vaultResourceRow(si, ri, r) {
    const label = vaultEsc(r.label);
    const badge = `<span class="vault-type">${vaultTypeLabel(r)}</span>`;
    // Edit and Delete sit behind one button, so a slip of the thumb cannot delete.
    const actions = vaultRowMenu(`More for ${label}`, [
      ['Edit', `editLinkResource(${si},${ri})`],
      ['Delete', `deleteLinkResource(${si},${ri})`, true],
    ]);
    if (vaultPlaceholderFetchable(r)) {
      const here = vaultPlaceholderHere(r);
      return `
            <div class="resource-item-row">
              <a class="resource-link" href="#" onclick="${here ? 'vaultOpenFile' : 'vaultGetCloudFile'}(${jsArg_cd(r.fileId)});return false" title="${here ? 'Click to open ' + label : 'Added on another device. Click to download it here.'}">
                <span class="r-icon">${getResourceIcon(r.icon || 'book-open')}</span>
                <span class="resource-label" title="${label}">${label}</span>${badge}
                ${r.fileSize ? `<span class="type-badge" style="font-size:var(--text-2xs);padding:1px 5px;background:var(--surface-2);color:var(--text-muted);margin-left:4px">${vaultEsc(r.fileSize)}</span>` : ''}
                ${here ? `<span style="font-size:var(--text-sm);margin-left:auto;color:var(--accent)">📥</span>` : `<span class="vault-on-device">Download 📥</span>`}
              </a>${actions}
            </div>`;
    }
    if (isVaultPlaceholder(r)) return `
            <div class="resource-item-row">
              <div class="resource-link is-on-device" title="This file was added on another device. Open it there.">
                <span class="r-icon">${getResourceIcon(r.icon || 'book-open')}</span>
                <span class="resource-label" title="${label}">${label}</span>${badge}
                <span class="vault-on-device">On another device</span>
              </div>${actions}
            </div>`;
    if (isVaultIdbFile(r)) return vaultIdbMissing(r) ? `
            <div class="resource-item-row">
              <div class="resource-link is-on-device" title="${vaultEsc(VAULT_MISSING_MESSAGE)}">
                <span class="r-icon">${getResourceIcon(r.icon || 'book-open')}</span>
                <span class="resource-label" title="${label}">${label}</span>${badge}
                <span class="vault-on-device">Missing on this device</span>
              </div>${actions}
            </div>` : `
            <div class="resource-item-row">
              <a class="resource-link" href="#" onclick="vaultOpenFile(${jsArg_cd(r.fileId)});return false" title="Click to open ${label}">
                <span class="r-icon">${getResourceIcon(r.icon || 'book-open')}</span>
                <span class="resource-label" title="${label}">${label}</span>${badge}
                ${r.fileSize ? `<span class="type-badge" style="font-size:var(--text-2xs);padding:1px 5px;background:var(--surface-2);color:var(--text-muted);margin-left:4px">${vaultEsc(r.fileSize)}</span>` : ''}
                <span style="font-size:var(--text-sm);margin-left:auto;color:var(--accent)">📥</span>
              </a>${actions}
            </div>`;
    const href = vaultSafeUrl(r.url);
    if (!href) return `
            <div class="resource-item-row">
              <div class="resource-link is-on-device" title="This address can’t be opened from the vault. Edit it to use a web link.">
                <span class="r-icon">${getResourceIcon(r.icon || 'book-open')}</span>
                <span class="resource-label" title="${label}">${label}</span>${badge}
                <span class="vault-on-device">Link blocked</span>
              </div>${actions}
            </div>`;
    const isUploaded = r.isUpload || /^data:/i.test(href);
    return `
            <div class="resource-item-row">
              <a class="resource-link" href="${vaultEsc(href)}" ${isUploaded ? `download="${label}"${vaultViewKind(r.label) ? ' onclick="return vaultOpenDataUrl(this)"' : ''}` : 'target="_blank" rel="noopener"'} title="${isUploaded ? 'Click to open ' + label : vaultEsc(href)}">
                <span class="r-icon">${getResourceIcon(r.icon || 'book-open')}</span>
                <span class="resource-label" title="${label}">${label}</span>${badge}
                ${r.fileSize ? `<span class="type-badge" style="font-size:var(--text-2xs);padding:1px 5px;background:var(--surface-2);color:var(--text-muted);margin-left:4px">${vaultEsc(r.fileSize)}</span>` : ''}
                ${isUploaded ? `<span style="font-size:var(--text-sm);margin-left:auto;color:var(--accent)">📥</span>` : `<span style="font-size:var(--text-sm);margin-left:auto;color:var(--text-muted)">↗</span>`}
              </a>${actions}
            </div>`;
  }

  function renderLinksContent(container) {
    const links = loadCustomLinks();

    if (!links || links.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px 20px;color:var(--text-muted)">
          <div style="margin-bottom:12px;color:var(--accent)">${icons.book()}</div>
          <div style="font-weight:700;font-size:var(--text-lg);color:var(--text-primary);margin-bottom:6px">Your Study Vault is empty</div>
          <div style="font-size:var(--text-base);margin-bottom:20px;max-width:380px;margin-left:auto;margin-right:auto">Save notes, PDFs and drive links for each subject, then open them in one tap.</div>
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button class="btn-primary" onclick="addLinkSubject()" style="font-size:var(--text-base)">+ New subject</button>
            <button class="btn-secondary" onclick="openVaultBulk(null)" style="font-size:var(--text-base)">Add files or links</button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      ${vaultMeterHtml(links)}
      <div class="vault-search">
        <input type="search" id="vault-search" class="form-input" value="${vaultEsc(_vaultQuery)}" placeholder="Search notes, subjects, PDFs…" aria-label="Search the Study Vault" autocomplete="off" oninput="vaultSearch(this.value)" />
      </div>
      <p id="vault-count" class="vault-sr" aria-live="polite"></p>
      <div id="vault-grid"></div>`;
    renderVaultGrid();
  }

  const _vaultOpenSubjects = new Set();
  function vaultToggleSubject(si) {
    const s = loadCustomLinks()[si];
    if (!s) return;
    const key = String(s.subject || si);
    _vaultOpenSubjects.has(key) ? _vaultOpenSubjects.delete(key) : _vaultOpenSubjects.add(key);
    renderVaultGrid();
  }

  // One "Add" button instead of three: the same three actions, in one place.
  function openVaultAddMenu() {
    document.getElementById('vault-add-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'vault-add-backdrop';
    const item = (fn, icon, title, sub) => `
          <button type="button" class="more-sheet-item" onclick="${fn}">
            ${icon}<span><strong>${title}</strong><small>${sub}</small></span>
          </button>`;
    backdrop.innerHTML = `
      <div class="modal" style="max-width:420px;width:94vw" role="dialog" aria-modal="true" aria-labelledby="va-title" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span class="modal-title" id="va-title">Add to Study Vault</span>
          <button class="modal-close" aria-label="Close" onclick="closeVaultAddMenu()">${icons.x()}</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:2px;padding-top:4px" onclick="if (event.target.closest('.more-sheet-item')) closeVaultAddMenu()">
          ${item('openVaultBulk(null)', icons.filetext(), 'Files or links', 'PDFs, notes, drive folders')}
          <button type="button" class="more-sheet-item" onclick="showWhatsAppImport(null, { tab: 'links' })">
            ${icons.link()}<span><strong>Import links from WhatsApp</strong><small>Paste a chat, keep the links</small></span>
          </button>
          ${item('addLinkSubject()', icons.book(), 'New subject', "A place for one subject's material")}
        </div>
      </div>`;
    wireBackdropClickClose(backdrop);
    document.body.appendChild(backdrop);
  }

  function closeVaultAddMenu() {
    document.getElementById('vault-add-backdrop')?.remove();
  }

  function vaultSearch(value) {
    _vaultQuery = String(value || '').slice(0, 80);
    renderVaultGrid();
  }

  function renderVaultGrid() {
    const grid = document.getElementById('vault-grid');
    if (!grid) return;
    vaultWireCardDrop(grid);
    const links = loadCustomLinks();
    const tokens = _vaultQuery.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0, files = 0;

    const html = links.map((s, si) => {
      const all = (Array.isArray(s.resources) ? s.resources : []).map((r, ri) => ({ r, ri }));
      const hits = tokens.length ? all.filter(x => vaultResourceMatches(s, x.r, tokens)) : all;
      const subjectHit = tokens.length && tokens.every(t => `${s.subject || ''} ${s.code || ''}`.toLowerCase().includes(t));
      if (tokens.length && !hits.length && !subjectHit) return '';
      shown++; files += hits.length;
      // Closed by default so many subjects fit on a phone; a search, or a
      // single subject, shows everything. Open/closed lives in memory only.
      const open = tokens.length > 0 || links.length === 1 || _vaultOpenSubjects.has(String(s.subject || si));
      return `
      <div class="link-subject-card${open ? '' : ' is-collapsed'}" id="link-card-${si}">
        <div class="link-subject-header">
          <button type="button" class="link-subject-toggle" onclick="vaultToggleSubject(${si})" aria-expanded="${open}" aria-controls="link-card-${si}">
            <span class="link-subject-title" title="${vaultEsc(s.subject)}">${vaultEsc(s.subject)}</span>
            <span class="link-subject-count">${all.length} item${all.length !== 1 ? 's' : ''}</span>
          </button>
          <span class="link-code">${vaultEsc(s.code)}</span>
          <div class="link-subject-actions">${vaultRowMenu(`More for ${vaultEsc(s.subject)}`, [
            ['Rename subject', `editLinkSubject(${si})`],
            ['Delete subject', `deleteLinkSubject(${si})`, true],
          ])}
          </div>
        </div>

        <div class="link-resources">
          ${hits.length === 0 ? `
            <div style="font-size:var(--text-sm);color:var(--text-muted);padding:8px 0">Nothing here yet.</div>
          ` : hits.map(x => vaultResourceRow(si, x.ri, x.r)).join('')}
        </div>

        <div class="vault-card-actions">
          <button class="btn-add-resource" onclick="addLinkResource(${si})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add a file or link
          </button>
          <button class="btn-add-resource" onclick="openVaultBulk(${si})">Add several</button>
        </div>
      </div>`;
    }).join('');

    grid.innerHTML = shown
      ? `<div class="links-grid">${html}</div>`
      : `<div class="card vault-no-results">Nothing matches “${vaultEsc(_vaultQuery)}”. Try a subject name, or a type like pdf or video.</div>`;
    const count = document.getElementById('vault-count');
    if (count) count.textContent = tokens.length ? `${files} item${files !== 1 ? 's' : ''} found` : '';
  }

  // ── Study Vault: add several files and links at once ─────────
  // Files from a drop. Folders are walked (max 100 files, 4 levels deep,
  // dot-files skipped); each file keeps its folder path in `vaultCtx` so the
  // subject guess can use the folder name. The dropped items are read
  // before the first await because the browser empties them after the event.
  function vaultDroppedFiles(dt) {
    const plain = Array.from((dt && dt.files) || []);
    const entries = Array.from((dt && dt.items) || [])
      .map(i => (i.kind === 'file' && i.webkitGetAsEntry) ? i.webkitGetAsEntry() : null);
    if (!entries.some(en => en && en.isDirectory)) return Promise.resolve(plain);
    const out = [];
    const readAll = r => new Promise(res => {
      const acc = [];
      const next = () => r.readEntries(b => { if (!b.length) res(acc); else { acc.push(...b); next(); } }, () => res(acc));
      next();
    });
    const walk = async (en, path, depth) => {
      if (!en || out.length >= 100 || en.name.startsWith('.')) return;
      if (en.isFile) {
        await new Promise(res => en.file(f => { f.vaultCtx = path + f.name; out.push(f); res(); }, res));
      } else if (en.isDirectory && depth < 4) {
        for (const child of await readAll(en.createReader())) await walk(child, path + en.name + ' ', depth + 1);
      }
    };
    return (async () => {
      for (const en of entries) await walk(en, '', 0);
      return out.length ? out : plain;
    })();
  }

  // Drop files on the Study Vault: on a subject card they go to that subject,
  // anywhere else on the page each file gets a guessed subject. Both open the
  // bulk dialog, which reviews before anything is saved.
  let _vaultGuardWired = false;
  // A file dropped outside any drop area would make the browser open it and
  // leave the app. While the Vault is on screen, stop that (zones that handle
  // the drop have already cancelled it, so they are untouched).
  function vaultWireDropGuard() {
    if (_vaultGuardWired || typeof window.addEventListener !== 'function') return;
    _vaultGuardWired = true;
    const guard = e => {
      if (e.defaultPrevented || !e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      const grid = document.getElementById('vault-grid');
      if (grid && grid.offsetParent) e.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
  }

  function vaultWireCardDrop(grid) {
    vaultWireDropGuard();
    const page = grid && grid.closest ? grid.closest('.section-page') : null;
    if (!page || page._dropWired) return;
    page._dropWired = true;
    const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const cardOf = e => e.target && e.target.closest ? e.target.closest('.link-subject-card') : null;
    let hot = null;
    const clear = () => { if (hot) hot.classList.remove('is-drag'); hot = null; };
    page.addEventListener('dragover', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const t = cardOf(e) || document.getElementById('vault-grid');
      if (hot !== t) { clear(); hot = t; if (t) t.classList.add('is-drag'); }
    });
    page.addEventListener('dragleave', e => { if (!page.contains(e.relatedTarget)) clear(); });
    page.addEventListener('drop', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      clear();
      const c = cardOf(e);
      const si = c ? Number(String(c.id).replace('link-card-', '')) : null;
      vaultDroppedFiles(e.dataTransfer).then(dropped => {
        if (!dropped.length) return;
        openVaultBulk(si === null || isNaN(si) ? null : si);
        vbAddFiles(dropped);
      });
    });
  }

  // Everything is shown in a list first. Nothing is saved until "Add".
  // One save, so one sync, however many items are added.
  let _vb = null;

  // Links in pasted text (a WhatsApp message, a list): one row per address.
  function vaultExtractLinks(text) {
    const out = [], seen = new Set();
    String(text || '').split(/\r?\n/).forEach(line => {
      const raws = line.match(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi) || [];
      if (!raws.length) return;
      const rest = line.replace(/(?:https?:\/\/|www\.)[^\s<>"'`]+/gi, ' ')
        .replace(/^\[[^\]]{3,40}\]\s*[^:]{1,40}:\s*/, '')
        .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?\s*-\s*[^:]{1,40}:\s*/i, '')
        .replace(/\s+/g, ' ')
        .replace(/^[\s\-–—•*:>]+|[\s\-–—•*:]+$/g, '');
      let n = 0;
      raws.forEach(raw => {
        let url = raw.replace(/[.,;:!?)\]}>]+$/, '');
        if (/^www\./i.test(url)) url = 'https://' + url;
        if (!vaultSafeUrl(url)) return;
        let host;
        try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return; }
        const k = waNormUrl(url);
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ url, title: (n === 0 && rest.length >= 3 ? rest : `${host} link`).slice(0, 120), context: rest });
        n++;
      });
    });
    return out;
  }

  function openVaultBulk(si) {
    document.getElementById('vault-bulk-backdrop')?.remove();
    const links = loadCustomLinks();
    const fixed = (si !== null && si !== undefined && links[si]) ? String(links[si].subject || '') : '';
    const files = new Set();
    links.forEach(s => (s && Array.isArray(s.resources) ? s.resources : []).forEach(r => {
      if (isVaultDeviceFile(r)) files.add(r.fileId || vaultFileId(r.url));
      else if ((isVaultPlaceholder(r) || isVaultIdbFile(r)) && r.fileId) files.add(r.fileId);
    }));
    _vb = { fixed, subjects: waLinkSubjects(), rows: [], skipped: [], over: 0, nextId: 1, knownFiles: files, knownUrls: waSavedLinkUrls() };

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'vault-bulk-backdrop';
    backdrop.innerHTML = `
      <div class="modal vault-bulk" style="max-width:560px;width:94vw" role="dialog" aria-modal="true" aria-labelledby="vb-title" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span class="modal-title" id="vb-title">Add several to Study Vault${fixed ? ` · ${vaultEsc(fixed)}` : ''}</span>
          <button class="modal-close" aria-label="Close" onclick="closeVaultBulk()">${icons.x()}</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div id="vb-drop" class="vault-drop">
            <div>Drop files here, or</div>
            <button type="button" class="btn-secondary" onclick="document.getElementById('vb-file').click()">Choose files</button>
            <input type="file" id="vb-file" multiple hidden accept="${VAULT_FILE_ACCEPT}" onchange="vbPickFiles(this)" aria-label="Choose files to add" />
            <div class="vault-hint">PDF, Word, slides, images, code. Up to ${vaultFileMaxBytes() / 1048576} MB each. For bigger notes, paste a Drive link below.</div>
          </div>
          <div>
            <label class="form-label" for="vb-paste">Or paste links</label>
            <textarea id="vb-paste" class="form-input" rows="3" placeholder="One link per line, or paste a whole WhatsApp message"></textarea>
            <button type="button" class="btn-secondary" style="margin-top:8px" onclick="vbReadPaste()">Find links</button>
          </div>
          <div id="vb-review" aria-live="polite"></div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeVaultBulk()">Cancel</button>
          <button class="btn-primary" id="vb-save" onclick="vbSave()" disabled>Add</button>
        </div>
      </div>`;
    wireBackdropClickClose(backdrop);
    document.body.appendChild(backdrop);
    const zone = document.getElementById('vb-drop');
    if (zone && zone.addEventListener) {
      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drag'));
      zone.addEventListener('drop', e => {
        e.preventDefault(); zone.classList.remove('is-drag');
        if (e.dataTransfer && e.dataTransfer.files) vbAddFiles(e.dataTransfer.files);
      });
    }
    vbRender();
  }

  function closeVaultBulk() {
    document.getElementById('vault-bulk-backdrop')?.remove();
    _vb = null;
  }

  function vbPickFiles(input) {
    const files = Array.from((input && input.files) || []);
    if (input) input.value = '';
    vbAddFiles(files);
  }

  function vbAddFiles(fileList) {
    const vb = _vb;
    if (!vb) return;
    const files = Array.from(fileList || []);
    if (files.length > 30) vb.over += files.length - 30;
    const jobs = [];
    const max = vaultFileMaxBytes();
    const ok = files.slice(0, 30).filter(f => {
      if (f.size > max) { vb.skipped.push(`${f.name} (${(f.size / 1048576).toFixed(1)} MB)`); return false; }
      return true;
    });
    if (deps.vaultIdbOk === true) {
      // Only a fingerprint now (one file at a time); the bytes are saved on Add.
      vbRender();
      (async () => {
        const done = [];
        for (const f of ok) {
          try { done.push({ f, key: vaultBytesId(new Uint8Array(await f.arrayBuffer())) }); }
          catch (_) { vb.skipped.push(`${f.name} (couldn’t be read)`); }
        }
        if (_vb !== vb) return;
        done.forEach(({ f, key }) => vbAddRow({ kind: 'file', label: f.name, url: '', key, file: f, icon: vaultIconForFile(f.name), size: f.size, context: f.vaultCtx || f.name }));
        vbRender();
      })();
      return;
    }
    ok.forEach(f => {
      jobs.push(new Promise(resolve => {
        const rd = new FileReader();
        rd.onload = () => resolve({ f, url: String(rd.result || '') });
        rd.onerror = () => { vb.skipped.push(`${f.name} (couldn’t be read)`); resolve(null); };
        rd.readAsDataURL(f);
      }));
    });
    vbRender();
    Promise.all(jobs).then(done => {
      if (_vb !== vb) return;
      done.filter(Boolean).forEach(({ f, url }) => vbAddRow({ kind: 'file', label: f.name, url, icon: vaultIconForFile(f.name), size: f.size, context: f.vaultCtx || f.name }));
      vbRender();
    });
  }

  function vbReadPaste() {
    const ta = document.getElementById('vb-paste');
    if (!_vb || !ta) return;
    const found = vaultExtractLinks(ta.value);
    if (!found.length) { showToast('No links found in that text.', 'info'); return; }
    found.forEach(l => vbAddRow({ kind: 'link', label: l.title, url: l.url, icon: vaultIconForUrl(l.url) || 'link', context: l.context }));
    ta.value = '';
    vbRender();
  }

  function vbAddRow(spec) {
    const vb = _vb;
    if (!vb) return;
    const isFile = spec.kind === 'file';
    const key = spec.key || (isFile ? vaultFileId(spec.url) : waNormUrl(spec.url));
    if (vb.rows.some(r => r.kind === spec.kind && r.key === key)) return;
    if (vb.rows.length >= VAULT_BULK_MAX_ROWS) { vb.over++; return; }
    const dup = isFile ? vb.knownFiles.has(key) : vb.knownUrls.has(key);
    vb.rows.push({
      id: vb.nextId++, kind: spec.kind, key, dup, sel: !dup,
      label: String(spec.label || '').slice(0, VAULT_IMPORT_LABEL_MAX), url: spec.url, file: spec.file || null, icon: spec.icon || 'link', size: spec.size || 0,
      subject: vb.fixed || waGuessLinkSubject(spec.context, vb.subjects)
    });
  }

  function vbToggle(id, on) {
    const row = _vb && _vb.rows.find(r => r.id === id);
    if (row && !row.dup) { row.sel = !!on; vbUpdateButton(); }
  }
  function vbTitle(id, value) {
    const row = _vb && _vb.rows.find(r => r.id === id);
    if (row) row.label = String(value || '').slice(0, VAULT_IMPORT_LABEL_MAX);
  }
  function vbSubject(id, value) {
    const row = _vb && _vb.rows.find(r => r.id === id);
    if (row && String(value || '').trim()) row.subject = String(value).trim().slice(0, 60);
  }

  function vbUpdateButton() {
    const btn = document.getElementById('vb-save');
    if (!btn || !_vb) return;
    const n = _vb.rows.filter(r => r.sel && !r.dup).length;
    btn.textContent = n ? `Add ${n} item${n !== 1 ? 's' : ''}` : 'Add';
    btn.disabled = !n;
  }

  function vbRender() {
    const box = document.getElementById('vb-review');
    if (!box || !_vb) return;
    const vb = _vb;
    const names = [...new Set([...vb.subjects.map(s => s.name), 'General'])];
    const rows = vb.rows.map(r => {
      const opts = [...new Set([...names, r.subject])].map(n => `<option value="${vaultEsc(n)}" ${n === r.subject ? 'selected' : ''}>${vaultEsc(n)}</option>`).join('');
      let meta;
      if (r.kind === 'file') meta = formatBytes(r.size);
      else { try { meta = new URL(r.url).hostname.replace(/^www\./, ''); } catch (_) { meta = ''; } }
      const type = vaultTypeLabel(r.kind === 'file' ? { label: r.label, url: r.url, isUpload: true } : { url: r.url });
      return `
        <div class="vault-bulk-row ${r.dup ? 'is-dup' : ''}">
          <input type="checkbox" ${r.sel ? 'checked' : ''} ${r.dup ? 'disabled' : ''} aria-label="Add ${vaultEsc(r.label)}" onchange="vbToggle(${r.id}, this.checked)" />
          <div class="vault-bulk-main">
            <div class="vault-bulk-line"><span class="vault-type">${type}</span>${r.dup ? '<span class="vault-on-device">Already saved</span>' : ''}<span class="vault-hint">${vaultEsc(meta)}</span></div>
            <input class="form-input" value="${vaultEsc(r.label)}" aria-label="Name for ${vaultEsc(r.label)}" oninput="vbTitle(${r.id}, this.value)" />
            ${vb.fixed || r.dup ? '' : `<select class="form-select" aria-label="Subject for ${vaultEsc(r.label)}" onchange="vbSubject(${r.id}, this.value)">${opts}</select>`}
          </div>
        </div>`;
    }).join('');
    const need = vb.rows.filter(r => r.kind === 'file' && r.sel && !r.dup).reduce((n, r) => n + r.url.length, 0);
    const free = vaultStorageStats(loadCustomLinks()).free;
    const notes = [];
    if (vb.skipped.length) notes.push(`Too big or unreadable, not added: ${vb.skipped.map(vaultEsc).join(', ')}. Add big notes as a Drive link instead.`);
    if (vb.over) notes.push(`Only the first ${VAULT_BULK_MAX_ROWS} items fit in one go. Add these, then add the rest.`);
    if (need > free * 0.9) notes.push(`These files may not fit in this phone’s storage (about ${formatBytes(Math.round(free * 0.75))} left). Untick some, or add them as Drive links.`);
    box.innerHTML = `${notes.map(n => `<p class="vault-bulk-note">${n}</p>`).join('')}${rows ? `<div class="vault-bulk-list">${rows}</div>` : ''}`;
    vbUpdateButton();
  }

  function vbSave() {
    const vb = _vb;
    if (!vb) return;
    const chosen = vb.rows.filter(r => r.sel && !r.dup);
    if (!chosen.length) return;
    if (chosen.some(r => r.file && !r.stored)) { vbStoreFiles(vb, chosen); return; }
    const links = loadCustomLinks();
    const added = [];
    const created = new Set();
    for (const r of chosen) {
      const subject = (r.subject || 'General').trim() || 'General';
      const key = getCanonicalSubjectKey(subject);
      let entry = links.find(s => s && getCanonicalSubjectKey(s.subject || '') === key);
      if (!entry) {
        const known = vb.subjects.find(s => s.key === key);
        entry = { subject, code: (known && known.code) || subject.slice(0, 4).toUpperCase(), color: '#394B63', resources: [] };
        links.push(entry);
        created.add(key);
      }
      if (!Array.isArray(entry.resources)) entry.resources = [];
      let fallback = r.label;
      if (r.kind === 'link') { try { fallback = new URL(r.url).hostname.replace(/^www\./, '') + ' link'; } catch (_) {} }
      const item = {
        label: (r.label || '').trim() || fallback || 'Untitled',
        url: r.url,
        icon: r.icon,
        isUpload: r.kind === 'file',
        fileSize: r.kind === 'file' ? formatBytes(r.size) : ''
      };
      entry.resources.push(r.stored ? vaultIdbEntry(item, r.stored) : item);
      added.push({ key, url: r.url, fileId: r.stored ? r.stored.fileId : '' });
    }
    if (!saveCustomLinks(links)) {
      // Not saved: keep the list open so nothing is lost.
      showToast(VAULT_FULL_MESSAGE, 'error');
      return;
    }
    if (chosen.some(r => r.kind === 'file')) vaultAskPersist();
    closeVaultBulk();
    const n = added.length;
    renderLinks();
    showUndoToast(`${n} item${n !== 1 ? 's' : ''} added to the vault`, () => {
      const cur = loadCustomLinks();
      for (const a of added) {
        const entry = cur.find(s => s && getCanonicalSubjectKey(s.subject || '') === a.key);
        if (!entry || !Array.isArray(entry.resources)) continue;
        const i = entry.resources.findIndex(x => x && (a.fileId ? isVaultIdbFile(x) && x.fileId === a.fileId : x.url === a.url));
        if (i >= 0) entry.resources.splice(i, 1);
      }
      const kept = cur.filter(s => !(s && created.has(getCanonicalSubjectKey(s.subject || '')) && (!s.resources || !s.resources.length)));
      saveCustomLinks(kept);
      renderLinks();
      showToast('Removed again', 'info');
    });
  }

  // Saves the picked files into IndexedDB first, then runs vbSave() again to
  // add them all in one save. A file that can't be stored keeps the list open.
  async function vbStoreFiles(vb, chosen) {
    if (vb.saving) return;
    vb.saving = true;
    const btn = document.getElementById('vb-save');
    if (btn) btn.disabled = true;
    const failed = [];
    for (const r of chosen) {
      if (!r.file || r.stored) continue;
      const stored = await vaultStoreFile(r.file);
      if (stored) { r.stored = stored; continue; }
      // Small files can still go in the old way.
      const url = r.file.size <= VAULT_FILE_MAX_BYTES ? await vaultReadDataUrl(r.file) : '';
      if (url) { r.url = url; r.file = null; } else failed.push(r.label);
    }
    vb.saving = false;
    if (_vb !== vb) return;
    if (failed.length) { vbUpdateButton(); showToast(`${VAULT_NO_ROOM_MESSAGE} (${failed.join(', ')})`, 'error'); return; }
    window.vbSave();
  }

  function addLinkSubject() {
    showLinkSubjectModal(null, null);
  }

  function openAddResourceForSubject(subjectName, subjectCode = '') {
    const links = loadCustomLinks();
    const cleanName = (subjectName || '').trim();
    const cleanCode = (subjectCode || '').trim();
    const matchedIdx = links.findIndex(l => 
      (l.subject || '').toLowerCase() === cleanName.toLowerCase() || 
      (cleanCode && (l.code || '').toLowerCase() === cleanCode.toLowerCase())
    );

    if (matchedIdx !== -1) {
      showLinkResourceModal(matchedIdx, null, null);
    } else {
      showLinkSubjectModal(null, {
        subject: cleanName,
        code: cleanCode || (cleanName ? cleanName.slice(0, 4).toUpperCase() : '')
      });
    }
  }

  function editLinkSubject(si) {
    const links = loadCustomLinks();
    showLinkSubjectModal(si, links[si]);
  }

  function deleteLinkSubject(si) {
    appConfirm('Delete this subject and all its materials?', 'Delete', () => {
      const links = loadCustomLinks();
      links.splice(si, 1);
      saveCustomLinks(links);
      showToast('Subject removed from the vault', 'note', { where: true });
      renderLinks();
    });
  }

  function addLinkResource(si) {
    showLinkResourceModal(si, null, null);
  }

  function editLinkResource(si, ri) {
    const links = loadCustomLinks();
    showLinkResourceModal(si, ri, links[si].resources[ri]);
  }

  function deleteLinkResource(si, ri) {
    appConfirm('Delete this resource?', 'Delete', () => {
      const links = loadCustomLinks();
      const [gone] = links[si].resources.splice(ri, 1);
      saveCustomLinks(links);
      if (isVaultIdbFile(gone)) vaultDeleteUnusedBlob(gone.fileId);
      showToast('Removed from the vault', 'note', { where: true });
      renderLinks();
    });
  }

  function showLinkSubjectModal(si, existing) {
    document.getElementById('link-subject-modal-backdrop')?.remove();
    const isNew = si === null;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'link-subject-modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:400px;width:92vw">
        <div class="modal-header">
          <span class="modal-title">${isNew ? 'Create Subject Vault' : 'Edit Subject Vault'}</span>
          <button class="modal-close" onclick="document.getElementById('link-subject-modal-backdrop')?.remove()" aria-label="Close">${icons.x()}</button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label class="form-label">Subject Name <span style="color:var(--red)">*</span></label>
            <input id="lsm-name" class="form-input" value="${vaultEsc(existing?.subject)}" placeholder="e.g. Data Structures &amp; Algorithms" />
          </div>
          <div>
            <label class="form-label">Short Code</label>
            <input id="lsm-code" class="form-input" value="${vaultEsc(existing?.code)}" placeholder="e.g. DSA" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="document.getElementById('link-subject-modal-backdrop')?.remove()">Cancel</button>
          <button class="btn-primary" onclick="saveLinkSubject(${si === null ? 'null' : si})">Save Vault</button>
        </div>
      </div>
    `;
    wireBackdropClickClose(backdrop);
    document.body.appendChild(backdrop);
  }

  function saveLinkSubject(si) {
    const nameEl = document.getElementById('lsm-name');
    const name  = nameEl?.value?.trim();
    const code  = document.getElementById('lsm-code')?.value?.trim();
    if (!name) {
      reportFormErrors([{ input: nameEl, msg: 'Type the subject name, like Physics' }]);
      return;
    }
    const links = loadCustomLinks();
    if (si === null) {
      links.push({ subject: name, code: code || name.slice(0,4).toUpperCase(), color: '#394B63', resources: [] });
    } else {
      links[si] = { ...links[si], subject: name, code: code || links[si].code };
    }
    if (!saveCustomLinks(links)) { showToast(VAULT_FULL_MESSAGE, 'error'); return; }
    document.getElementById('link-subject-modal-backdrop')?.remove();
    showToast('saved to the vault', 'done', { item: name, where: true, key: `done:vault:${si === null ? links.length - 1 : si}` });
    renderLinks();
  }

  function handleVaultFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Files are kept as text inside this phone's ~5 MB app storage (about
    // 1.37x their size), so only small ones fit. Bigger notes belong in
    // Drive as a link. Checked before the file is read at all.
    const tooBig = vaultFileTooBigMessage(file.size);
    dismissToast('fail:vault-file');
    if (tooBig) {
      e.target.value = '';
      showToast(tooBig, 'error', { key: 'fail:vault-file' });
      if (typeof setResourceInputMode === 'function') setResourceInputMode('url');
      return;
    }
    if (deps.vaultIdbOk === true) {
      // Kept as the File itself; its bytes go to IndexedDB on Save.
      window._pendingVaultFile = file;
      const urlEl = document.getElementById('lrm-url');
      const labelEl = document.getElementById('lrm-label');
      const fileLabel = document.getElementById('lrm-file-label');
      const iconEl = document.getElementById('lrm-icon');
      if (urlEl) urlEl.value = '';
      if (labelEl && !labelEl.value) labelEl.value = file.name;
      if (fileLabel) fileLabel.innerHTML = `✓ <strong>${vaultEsc(file.name)}</strong> (${formatBytes(file.size)})`;
      if (iconEl) iconEl.value = vaultIconForFile(file.name);
      window._uploadedFileMeta = { isUpload: true, fileName: file.name, fileSize: formatBytes(file.size) };
      showToast('attached', 'done', { item: file.name, detail: 'Save to keep it in the vault' });
      return;
    }
    const reader = new FileReader();
    reader.onload = function(evt) {
      const dataUrl = evt.target.result;
      const urlEl = document.getElementById('lrm-url');
      const labelEl = document.getElementById('lrm-label');
      const fileLabel = document.getElementById('lrm-file-label');
      const iconEl = document.getElementById('lrm-icon');

      if (urlEl) urlEl.value = dataUrl;
      if (labelEl && !labelEl.value) labelEl.value = file.name;
      if (fileLabel) fileLabel.innerHTML = `✓ <strong>${vaultEsc(file.name)}</strong> (${formatBytes(file.size)})`;

      // Auto-detect icon
      const ext = file.name.split('.').pop().toLowerCase();
      if (['pdf', 'doc', 'docx', 'txt', 'ppt', 'pptx'].includes(ext) && iconEl) iconEl.value = 'book-open';
      else if (['py', 'js', 'cpp', 'c', 'java', 'html', 'css', 'zip'].includes(ext) && iconEl) iconEl.value = 'code';
      else if (['mp4', 'mov', 'avi', 'mkv'].includes(ext) && iconEl) iconEl.value = 'video';
      
      window._uploadedFileMeta = {
        isUpload: true,
        fileName: file.name,
        fileSize: formatBytes(file.size)
      };
      showToast('attached', 'done', { item: file.name, detail: 'Save to keep it in the vault' });
    };
    reader.readAsDataURL(file);
  }

  // Single add with IndexedDB: store the file, read it back, then save the
  // vault entry. The modal stays open if anything fails.
  async function vaultSaveFileResource(si, ri, file, label, icon) {
    if (vaultSaveFileResource.busy) return;
    vaultSaveFileResource.busy = true;
    try {
      const stored = await vaultStoreFile(file);
      if (!stored) {
        // Small files can still go in the old way.
        const url = file.size <= VAULT_FILE_MAX_BYTES ? await vaultReadDataUrl(file) : '';
        if (!url) { showToast(VAULT_NO_ROOM_MESSAGE, 'error'); return; }
        window._pendingVaultFile = null;
        const urlEl = document.getElementById('lrm-url');
        if (urlEl) urlEl.value = url;
        window.saveLinkResource(si, ri);
        return;
      }
      const links = loadCustomLinks();
      if (!links[si]) return;
      if (!Array.isArray(links[si].resources)) links[si].resources = [];
      const item = vaultIdbEntry({ label, icon }, stored);
      if (ri === null) links[si].resources.push(item); else links[si].resources[ri] = item;
      if (!saveCustomLinks(links)) { showToast(VAULT_FULL_MESSAGE, 'error'); return; }
      window._pendingVaultFile = null;
      vaultAskPersist();
      document.getElementById('link-resource-modal-backdrop')?.remove();
      showToast('saved to the vault', 'done', { item: label, where: true, key: `done:vault:${si}:${ri === null ? links[si].resources.length - 1 : ri}` });
      renderLinks();
    } finally { vaultSaveFileResource.busy = false; }
  }

  function setResourceInputMode(mode) {
    const fileSec = document.getElementById('lrm-file-section');
    const urlSec = document.getElementById('lrm-url-section');
    const fileBtn = document.getElementById('lrm-mode-file-btn');
    const urlBtn = document.getElementById('lrm-mode-url-btn');

    if (mode === 'file') {
      if (fileSec) fileSec.style.display = 'block';
      if (urlSec) urlSec.style.display = 'none';
      if (fileBtn) { fileBtn.className = 'btn btn-sm btn-primary'; }
      if (urlBtn) { urlBtn.className = 'btn btn-sm btn-secondary'; }
    } else {
      if (fileSec) fileSec.style.display = 'none';
      if (urlSec) urlSec.style.display = 'block';
      if (fileBtn) { fileBtn.className = 'btn btn-sm btn-secondary'; }
      if (urlBtn) { urlBtn.className = 'btn btn-sm btn-primary'; }
    }
  }

  function autoDetectVaultIcon(url) {
    const iconEl = document.getElementById('lrm-icon');
    if (!iconEl || !url) return;
    // Nobody picks the icon now, so an unknown address gets the plain link
    // icon (as Add several does) instead of keeping an old one.
    iconEl.value = vaultIconForUrl(url) || 'link';
  }

  function showLinkResourceModal(si, ri, existing) {
    document.getElementById('link-resource-modal-backdrop')?.remove();
    const isNew = ri === null;
    const isUpload = existing?.isUpload || isVaultIdbFile(existing) || (existing?.url && existing.url.startsWith('data:'));
    window._uploadedFileMeta = isUpload ? { isUpload: true, fileSize: existing.fileSize } : null;
    window._pendingVaultFile = null;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'link-resource-modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:440px;width:92vw" onclick="event.stopPropagation()">
        <div class="modal-header">
          <span class="modal-title">${isNew ? 'Add Vault Material' : 'Edit Vault Material'}</span>
          <button class="modal-close" onclick="document.getElementById('link-resource-modal-backdrop')?.remove()" aria-label="Close">${icons.x()}</button>
        </div>

        <div style="display:flex;gap:6px;margin-bottom:14px;background:var(--surface-2);padding:4px;border-radius:var(--radius-sm)">
          <button type="button" class="btn btn-sm ${!isUpload ? 'btn-primary' : 'btn-secondary'}" id="lrm-mode-url-btn" onclick="setResourceInputMode('url')" style="flex:1;padding:6px;font-size:var(--text-sm)">${icons.link()} Web / Cloud Link</button>
          <button type="button" class="btn btn-sm ${isUpload ? 'btn-primary' : 'btn-secondary'}" id="lrm-mode-file-btn" onclick="setResourceInputMode('file')" style="flex:1;padding:6px;font-size:var(--text-sm)">${icons.filetext()} Upload Document</button>
        </div>

        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div id="lrm-file-section" style="display:${isUpload ? 'block' : 'none'}">
            <label class="form-label">Attach File / Note (PDF, Doc, Image, Code)</label>
            <input type="file" id="lrm-file-input" style="display:none" onchange="handleVaultFileSelect(event)" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.zip,.py,.java,.cpp,.c,.js">
            <div class="card" id="lrm-drop" onclick="document.getElementById('lrm-file-input').click()" style="text-align:center;padding:20px;border:2px dashed var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--surface-2)">
              <div style="font-size:var(--text-2xl);margin-bottom:6px">📥</div>
              <div id="lrm-file-label" style="font-size:var(--text-base);font-weight:600;color:var(--text-primary)">
                ${existing?.label && isUpload ? `✓ <strong>${vaultEsc(existing.label)}</strong> (${vaultEsc(existing.fileSize || 'Attached File')})` : 'Click to select note, PDF, slide, or code file'}
              </div>
              <div style="font-size:var(--text-sm);color:var(--text-muted);margin-top:2px">Or drag and drop a file here. Saved persistently to your local Study Vault</div>
            </div>
          </div>

          <div>
            <label class="form-label">Material Name / Title <span style="color:var(--red)">*</span></label>
            <input id="lrm-label" class="form-input" value="${vaultEsc(existing?.label)}" placeholder="e.g. Unit 2 Summary Notes or Lab Manual PDF" />
          </div>

          <div id="lrm-url-section" style="display:${!isUpload ? 'block' : 'none'}">
            <label class="form-label">URL / Cloud Folder <span style="color:var(--red)">*</span></label>
            <input id="lrm-url" class="form-input" type="text" inputmode="url" value="${vaultEsc(existing?.url)}" placeholder="https://drive.google.com/... or GitHub link" oninput="autoDetectVaultIcon(this.value)" />
          </div>

          <!-- The icon is picked from the link or file type; nobody has to choose it. -->
          <input id="lrm-icon" type="hidden" value="${vaultEsc(existing?.icon || 'book-open')}" />
        </div>

        <div class="modal-footer" style="margin-top:16px">
          <button class="btn-secondary" onclick="document.getElementById('link-resource-modal-backdrop')?.remove()">Cancel</button>
          <button class="btn-primary" onclick="saveLinkResource(${si},${ri === null ? 'null' : ri})">Save Material</button>
        </div>
      </div>
    `;
    wireBackdropClickClose(backdrop);
    document.body.appendChild(backdrop);
    const drop = document.getElementById('lrm-drop');
    if (drop) {
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
      drop.addEventListener('drop', e => {
        e.preventDefault(); drop.classList.remove('is-drag');
        vaultDroppedFiles(e.dataTransfer).then(files => {
          if (!files.length) return;
          if (files.length > 1 && isNew && si !== null && si !== undefined) {
            // Several files: the bulk dialog already reviews, skips duplicates and caps size.
            document.getElementById('link-resource-modal-backdrop')?.remove();
            openVaultBulk(si);
            vbAddFiles(files);
            return;
          }
          if (files.length > 1) showToast('One file per material when editing. Using the first one.', 'info');
          handleVaultFileSelect({ target: { files: [files[0]], value: '' } });
        });
      });
    }
  }

  function saveLinkResource(si, ri) {
    const labelEl = document.getElementById('lrm-label');
    const urlEl   = document.getElementById('lrm-url');
    const label = labelEl?.value?.trim();
    const url   = vaultNormalizeUrl(urlEl?.value);
    const icon  = document.getElementById('lrm-icon')?.value || 'book-open';
    const meta  = window._uploadedFileMeta || {};

    [labelEl, urlEl].forEach(el => el?.classList.remove('error', 'shake'));

    const links = loadCustomLinks();
    // A file saved on another device: only its name and icon can change here.
    const existing = ri !== null ? links[si]?.resources?.[ri] : null;
    const pending = !url && deps.vaultIdbOk === true ? window._pendingVaultFile : null;
    const keepPlaceholder = !url && !pending && (isVaultPlaceholder(existing) || isVaultIdbFile(existing));
    if (pending && label) { vaultSaveFileResource(si, ri, pending, label, icon); return; }

    if (!label || (!url && !keepPlaceholder)) {
      const msg = 'Add a name and a file or link';
      reportFormErrors([!label ? { input: labelEl, msg } : { input: urlEl, msg }]);
      return;
    }
    if (url && !vaultSafeUrl(url)) {
      reportFormErrors([{ input: urlEl, msg: 'Links need to start with http:// or https://', isValid: (v) => !!vaultSafeUrl(vaultNormalizeUrl(v)) }]);
      return;
    }
    const item = keepPlaceholder ? { ...existing, label, icon } : {
      label,
      url,
      icon,
      isUpload: !!meta.isUpload || url.startsWith('data:'),
      fileSize: meta.fileSize || (url.startsWith('data:') ? formatBytes(url.length * 0.75) : '')
    };

    if (ri === null) {
      links[si].resources.push(item);
    } else {
      links[si].resources[ri] = item;
    }
    if (!saveCustomLinks(links)) {
      // Not saved: keep the modal open so nothing typed is lost.
      showToast(VAULT_FULL_MESSAGE, 'error');
      return;
    }
    if (item.url && item.url.startsWith('data:')) vaultAskPersist();
    document.getElementById('link-resource-modal-backdrop')?.remove();
    showToast('saved to the vault', 'done', { item: label, where: true, key: `done:vault:${si}:${ri === null ? links[si].resources.length - 1 : ri}` });
    renderLinks();
  }

  return {
    vaultToggleSubject,
    openVaultAddMenu,
    closeVaultAddMenu,
    vaultSearch,
    openVaultBulk,
    closeVaultBulk,
    vbPickFiles,
    vbAddFiles,
    vbReadPaste,
    vbToggle,
    vbTitle,
    vbSubject,
    vbSave,
    addLinkSubject,
    openAddResourceForSubject,
    editLinkSubject,
    deleteLinkSubject,
    addLinkResource,
    editLinkResource,
    deleteLinkResource,
    saveLinkSubject,
    handleVaultFileSelect,
    setResourceInputMode,
    autoDetectVaultIcon,
    saveLinkResource,
    renderLinksContent,
    renderVaultGrid,
    vaultNormalizeUrl,
    vaultTypeLabel,
    vaultStorageStats,
    vaultExtractLinks,
    vaultResourceRow,
    getBulkState() { return _vb; }
  };
}
