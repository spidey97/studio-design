/**
 * DesignStudio v3.10.0 — Auto-save to the project file + save status.
 *
 * Every edit is already kept in this browser (localStorage + IndexedDB). This adds:
 *  - a save-status pill next to the project title (Saving… / Saved · 2 min ago / Unsaved / Failed),
 *  - auto-save straight into the project file once it has been saved or opened with Save/Open (Chromium File System Access),
 *  - the file link survives a reload (one click re-grants permission), a popover with Save now / Save as / Download copy / toggle,
 *  - quiet by default: toasts only for state changes (first auto-save to a file, failures, recovery).
 */
const AUTOFILE_PREF = 'designstudio.autosaveFile';
const FILEHANDLE_KEY = 'designstudio.fileHandle';

const AutosaveMixin = {
  bindAutosave() {
    const S = this.saveState = { status: 'idle', at: 0, file: '', writing: false, queued: null, failMsg: '' };
    let pref = null; try { pref = localStorage.getItem(AUTOFILE_PREF); } catch (e) { /* private mode */ }
    S.autoFile = pref !== '0';

    // --- pill
    const title = document.getElementById('project-title');
    const pill = document.createElement('button');
    pill.id = 'save-status'; pill.type = 'button'; pill.className = 'save-pill';
    pill.setAttribute('aria-live', 'polite'); pill.setAttribute('aria-haspopup', 'dialog');
    title?.insertAdjacentElement('afterend', pill);
    this.savePill = pill;
    pill.addEventListener('click', (e) => { e.stopPropagation(); if (S.status === 'permission') this.resumeFileAutosave(); else this.toggleSavePopover(); });

    // --- every edit flips to "Saving…" until the debounced autosave lands
    const orig = this.scheduleAutosave;
    const wrapped = (...a) => { orig(...a); if (this.unsaved && S.status !== 'error' && S.status !== 'permission') this.setSaveStatus('saving'); };
    wrapped.flush = orig.flush; wrapped.pending = orig.pending;
    this.scheduleAutosave = wrapped;

    setInterval(() => this.renderSavePill(), 30000);
    window.addEventListener('online', () => { if (S.status === 'error') this.autosaveNow(); });

    // --- relink the file this session was saved to (needs one click to re-grant write permission)
    this.loadFileHandle().then(async (rec) => {
      if (!rec?.handle || this.fileHandle || (rec.title && rec.title !== this.title)) { this.setSaveStatus(this.saveState.at ? this.saveState.status : 'local', true); return; }
      this.fileHandle = rec.handle; S.file = rec.handle.name;
      const p = await this.filePermission(false);
      this.setSaveStatus(p === 'granted' ? 'file' : (S.autoFile ? 'permission' : 'local'), true);
    });
    this.renderSavePill();
  },

  autoFileOn() { return !!this.saveState?.autoFile && !!window.showSaveFilePicker; },

  // ------------------------------------------------------------ hooks called from app.js
  onAutosaved(ok, json) {
    const S = this.saveState; if (!S) return;
    if (!ok && !this.fileHandle) { S.failMsg = 'Browser storage is full or blocked.'; return this.setSaveStatus('error'); }
    if (this.fileHandle && this.autoFileOn() && this.unsaved) return this.writeFile(json);
    if (!this.fileHandle) { this.unsaved = false; S.at = Date.now(); this.setSaveStatus('local'); }
    else if (!this.unsaved) { this.setSaveStatus('file'); }
    else this.setSaveStatus(this.autoFileOn() ? 'permission' : 'local-dirty');
  },
  onFileSaved(handle, saveAs, downloadName) {
    const S = this.saveState;
    if (!handle) { Utils.toast(`Downloaded ${downloadName}`, '💾'); S.at = Date.now(); this.setSaveStatus('local'); return; }
    const first = S.file !== handle.name || saveAs;
    S.file = handle.name; S.at = Date.now(); S.failMsg = '';
    this.rememberFileHandle();
    this.setSaveStatus('file');
    Utils.toast(first && this.autoFileOn() ? `Saved ${handle.name} — auto-save to this file is on` : `Saved ${handle.name}`, '💾');
  },

  // ------------------------------------------------------------ writing the file
  async filePermission(ask) {
    const h = this.fileHandle; if (!h?.queryPermission) return h ? 'granted' : 'none';
    try {
      let p = await h.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
      return p;
    } catch (e) { return 'denied'; }
  },
  async writeFile(json) {
    const S = this.saveState;
    if (S.writing) { S.queued = json; return; }     // one write at a time; keep only the newest pending copy
    const perm = await this.filePermission(false);
    if (perm !== 'granted') { this.setSaveStatus('permission'); return; }
    S.writing = true; this.setSaveStatus('saving');
    const startedDirtyAt = this.model.historyIndex;
    try {
      const w = await this.fileHandle.createWritable();
      await w.write(json); await w.close();
      S.at = Date.now(); S.failMsg = '';
      if (this.model.historyIndex === startedDirtyAt && !this.scheduleAutosave.pending()) this.unsaved = false;
      const wasError = S.status === 'error' || S.recovering;
      S.recovering = false;
      this.setSaveStatus(this.unsaved ? 'saving' : 'file');
      if (wasError) Utils.toast(`Auto-save is working again — ${S.file}`, '✅');
    } catch (e) {
      S.failMsg = e?.name === 'NotFoundError' ? 'The file was moved or deleted.' : e?.name === 'NotAllowedError' ? 'Permission to write the file was removed.' : 'The file could not be written (is it open elsewhere or read-only?).';
      if (S.status !== 'error') Utils.toast(`Couldn’t auto-save ${S.file}. ${S.failMsg} Your work is still kept in this browser.`, '⚠️');
      S.recovering = true;
      this.setSaveStatus('error');
    } finally {
      S.writing = false;
      if (S.queued) { const q = S.queued; S.queued = null; this.writeFile(q); }
    }
  },
  async resumeFileAutosave() {
    const p = await this.filePermission(true);
    if (p === 'granted') { this.setSaveStatus('saving'); this.unsaved = true; this.autosaveNow(); }
    else { Utils.toast('Auto-save to the file stays paused — your work is still kept in this browser', 'ℹ️'); this.setSaveStatus('local-dirty'); }
  },
  rememberFileHandle() {
    const S = this.saveState; if (S) S.file = this.fileHandle?.name || '';
    Store.open().then(db => {
      if (!db) return;
      try { const tx = db.transaction('kv', 'readwrite'); const os = tx.objectStore('kv'); if (this.fileHandle) os.put({ handle: this.fileHandle, title: this.title }, FILEHANDLE_KEY); else os.delete(FILEHANDLE_KEY); } catch (e) { /* handles not cloneable in this browser */ }
    });
    if (S && !this.fileHandle) this.setSaveStatus('local');
  },
  async loadFileHandle() {
    const db = await Store.open(); if (!db) return null;
    try { return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(FILEHANDLE_KEY); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; }
  },

  // ------------------------------------------------------------ status UI
  setSaveStatus(st, quiet) { if (!this.saveState) return; this.saveState.status = st; this.renderSavePill(); if (!quiet) this.renderSavePopover(); },
  savedAgo() {
    const at = this.saveState.at; if (!at) return '';
    const s = Math.round((Date.now() - at) / 1000);
    return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },
  renderSavePill() {
    const S = this.saveState, pill = this.savePill; if (!S || !pill) return;
    const ago = this.savedAgo();
    const v = {
      idle: ['', 'Saved in this browser', 'Your work is kept in this browser automatically.'],
      saving: ['saving', 'Saving…', 'Saving your latest change'],
      local: ['ok', `Saved${ago ? ' · ' + ago : ''}`, `Auto-saved in this browser${ago ? ' ' + ago : ''}. Save to a file (Ctrl+S) and every change will save to that file too.`],
      'local-dirty': ['warn', 'Not saved to file', `Kept in this browser only — changes since the last file save are not in ${S.file || 'the file'}. Click to save.`],
      file: ['ok', `Saved${ago ? ' · ' + ago : ''}`, `Saved to ${S.file}${ago ? ' ' + ago : ''} · auto-save ${this.autoFileOn() ? 'on' : 'off'}`],
      permission: ['warn', 'Resume auto-save', `Click to let DesignStudio keep saving to ${S.file}. Your work is safe in this browser meanwhile.`],
      error: ['err', 'Not saved — retry', `${S.failMsg || 'Saving failed.'} Click for options. Your work is still kept in this browser.`]
    }[S.status] || ['', '', ''];
    pill.className = `save-pill ${v[0]}`;
    pill.innerHTML = `<span class="save-dot" aria-hidden="true"></span><span class="save-txt">${Utils.escapeHtml(v[1])}</span>`;
    pill.title = v[2];
    pill.setAttribute('aria-label', `Save status: ${v[1]}. ${v[2]}`);
  },
  toggleSavePopover(force) {
    let pop = document.getElementById('save-pop');
    if (pop && force !== true) { pop.remove(); return; }
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'save-pop'; pop.className = 'save-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Saving');
      document.body.appendChild(pop);
      const close = (e) => { if (!pop.contains(e.target) && e.target !== this.savePill && !this.savePill.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); } };
      const esc = (e) => { if (e.key === 'Escape') { pop.remove(); this.savePill.focus(); document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', esc, true); } };
      document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', esc, true);
    }
    const r = this.savePill.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - 300))}px`; pop.style.top = `${r.bottom + 6}px`;
    this.renderSavePopover();
    pop.querySelector('button')?.focus();
  },
  renderSavePopover() {
    const pop = document.getElementById('save-pop'), S = this.saveState; if (!pop) return;
    const fs = !!window.showSaveFilePicker, ago = this.savedAgo();
    const where = this.fileHandle ? `<b>${Utils.escapeHtml(S.file)}</b>` : '<b>This browser only</b>';
    pop.innerHTML = `
      <div class="save-pop-row"><span class="save-pop-k">Saving to</span>${where}</div>
      <div class="save-pop-row"><span class="save-pop-k">Last saved</span>${ago || '—'}</div>
      ${S.status === 'error' ? `<p class="save-pop-err">${Utils.escapeHtml(S.failMsg)}</p>` : ''}
      ${!this.fileHandle ? `<p class="save-pop-tip">${fs ? 'Save once to a file — after that every change is written to it automatically.' : 'This browser can’t write files directly. Use Download copy to keep a file.'}</p>` : ''}
      ${fs ? `<label class="save-pop-check"><input type="checkbox" data-s="auto"${S.autoFile ? ' checked' : ''}> Auto-save to file</label>` : ''}
      <div class="save-pop-actions">
        ${S.status === 'permission' ? '<button class="btn-primary" data-s="resume">Resume auto-save</button>' : `<button class="btn-primary" data-s="save">${this.fileHandle ? 'Save now' : (fs ? 'Save to file…' : 'Download')}</button>`}
        ${fs ? '<button class="menu-btn" data-s="saveAs">Save as…</button>' : ''}
        <button class="menu-btn" data-s="dl">Download copy</button>
      </div>`;
    const on = (k, fn) => pop.querySelector(`[data-s="${k}"]`)?.addEventListener(k === 'auto' ? 'change' : 'click', fn);
    on('save', () => { pop.remove(); this.run('save'); });
    on('saveAs', () => { pop.remove(); this.run('saveAs'); });
    on('resume', () => { pop.remove(); this.resumeFileAutosave(); });
    on('dl', () => { pop.remove(); const json = JSON.stringify(this.model.serialize(this.title), null, 1); const name = `${Utils.safeFilename(this.title)}.designstudio.json`; Utils.download(json, name, 'application/json'); Utils.toast(`Downloaded ${name}`, '💾'); });
    on('auto', (e) => {
      S.autoFile = e.target.checked; try { localStorage.setItem(AUTOFILE_PREF, S.autoFile ? '1' : '0'); } catch (_) { /* ignore */ }
      Utils.toast(S.autoFile ? 'Auto-save to file is on' : 'Auto-save to file is off — changes stay in this browser until you press Ctrl+S', S.autoFile ? '✅' : 'ℹ️');
      if (S.autoFile && this.fileHandle && this.unsaved) this.autosaveNow();
      else if (!S.autoFile && this.fileHandle && this.unsaved) this.setSaveStatus('local-dirty');
      else this.renderSavePill();
    });
  }
};
Object.assign(StudioApp.prototype, AutosaveMixin);
