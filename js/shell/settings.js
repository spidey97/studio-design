/**
 * DesignStudio — Settings (v3.32.0). Edit › Settings… or Ctrl+, — saved in this browser.
 *   Undo          steps (10–100) and a memory safety limit for huge documents.
 *   3D performance  Auto (recommended) · Quality · Balanced · Performance · Custom — see js/space3d/perf3d.js.
 */
'use strict';

const SETTINGS_KEY = 'designstudio.settings.v1';
const SETTINGS_DEFAULTS = { undoSteps: 100, undoMB: 400, s3: { mode: 'auto', shadows: 'soft', shadowRes: 2048, maxDpr: 2, moveScale: 0.75 } };

const SettingsMixin = {
  bindSettings() {
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (_) { saved = {}; }
    this.settings = { ...SETTINGS_DEFAULTS, ...saved, s3: { ...SETTINGS_DEFAULTS.s3, ...(saved.s3 || {}) } };
    this.settingsSanitize(); this.applySettings();
    const undo = document.querySelector('[data-action="undo"]');
    if (undo) {
      const menu = undo.parentNode, it = document.createElement('div');
      it.className = undo.className; it.dataset.action = 'settings'; it.setAttribute('role', 'menuitem'); it.innerHTML = 'Settings… <span class="dropdown-shortcut">Ctrl+,</span>';
      const sep = document.createElement('div'); sep.className = 'dropdown-sep'; menu.appendChild(sep); menu.appendChild(it);
    }
    if (this.commands) this.commands.settings = { run: () => this.showSettings() };
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === ',') { e.preventDefault(); e.stopImmediatePropagation(); this.showSettings(); } }, true);
  },
  settingsSanitize() {
    const s = this.settings, c = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
    s.undoSteps = Math.round(c(s.undoSteps, 10, 100, 100)); s.undoMB = c(s.undoMB, 100, 4000, 400);
    if (!['auto', 'quality', 'balanced', 'performance', 'custom'].includes(s.s3.mode)) s.s3.mode = 'auto';
    if (!['soft', 'standard', 'low', 'off'].includes(s.s3.shadows)) s.s3.shadows = 'soft';
    s.s3.shadowRes = [512, 1024, 2048, 4096].includes(+s.s3.shadowRes) ? +s.s3.shadowRes : 2048;
    s.s3.maxDpr = [1, 1.5, 2].includes(+s.s3.maxDpr) ? +s.s3.maxDpr : 2;
    s.s3.moveScale = [1, 0.75, 0.5].includes(+s.s3.moveScale) ? +s.s3.moveScale : 0.75;
  },
  saveSettings() { this.settingsSanitize(); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (_) { /* private mode */ } this.applySettings(); },
  applySettings() {
    const M = this.model, s = this.settings;
    if (M) { M.maxHistory = s.undoSteps; M.maxHistoryChars = s.undoMB * 1048576; M.trimHistory?.(); this.updateUndoButtons?.(); }
    this.s3PerfApply?.();
  },
  showSettings() {
    if (document.querySelector('.ds-dialog .st-form')) return;
    const s = this.settings, opt = (v, cur, t) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${t}</option>`;
    const modes = [['auto', 'Auto', 'Recommended. Keeps 3D smooth: lowers resolution while you move or play and simplifies shadows on heavy scenes. Full quality when you stop.'], ['quality', 'Quality', 'Soft 2048 px shadows, full resolution even while moving. Best on fast GPUs.'], ['balanced', 'Balanced', 'Standard shadows, 75% resolution while moving.'], ['performance', 'Performance', 'Simple shadows, 50% resolution while moving. For laptops and big scenes.'], ['custom', 'Custom', 'Choose each option yourself.']];
    const body = `<form class="st-form">
      <section class="st-sec"><h4>Undo</h4>
        <label class="st-row"><span>Undo steps<small>How far Ctrl+Z can go back. Steps share unchanged parts of the document, so 100 steps usually cost little memory.</small></span><span class="st-ctl"><input type="range" min="10" max="100" step="5" name="undoSteps" value="${s.undoSteps}" aria-describedby="st-undo-now"><output name="undoStepsOut">${s.undoSteps}</output></span></label>
        <label class="st-row"><span>Undo memory limit<small>Safety net for huge documents: if history would use more, the oldest steps are dropped (never below 10).</small></span><span class="st-ctl"><select name="undoMB">${[200, 400, 800, 1500].map(v => opt(v, s.undoMB, v >= 1000 ? `${v / 1000} GB` : `${v} MB`)).join('')}</select></span></label>
        <p class="st-live" id="st-undo-now"></p></section>
      <section class="st-sec"><h4>3D performance</h4>
        <div class="st-modes" role="radiogroup" aria-label="3D performance mode">${modes.map(([v, t, d]) => `<label class="st-mode"><input type="radio" name="mode" value="${v}"${s.s3.mode === v ? ' checked' : ''}><b>${t}</b><small>${d}</small></label>`).join('')}</div>
        <div class="st-custom"${s.s3.mode === 'custom' ? '' : ' hidden'}>
          <label class="st-row"><span>Shadows</span><span class="st-ctl"><select name="shadows">${[['soft', 'Soft (best)'], ['standard', 'Standard'], ['low', 'Simple (fastest)'], ['off', 'Off']].map(([v, t]) => opt(v, s.s3.shadows, t)).join('')}</select></span></label>
          <label class="st-row"><span>Shadow resolution</span><span class="st-ctl"><select name="shadowRes">${[512, 1024, 2048, 4096].map(v => opt(v, s.s3.shadowRes, `${v} px`)).join('')}</select></span></label>
          <label class="st-row"><span>Sharpness on high-DPI screens</span><span class="st-ctl"><select name="maxDpr">${[[1, '1× (fastest)'], [1.5, '1.5×'], [2, '2× (sharpest)']].map(([v, t]) => opt(v, s.s3.maxDpr, t)).join('')}</select></span></label>
          <label class="st-row"><span>Resolution while moving<small>Camera orbit, dragging and playback. Full sharpness returns when you stop.</small></span><span class="st-ctl"><select name="moveScale">${[[1, 'Full'], [0.75, '75%'], [0.5, '50%']].map(([v, t]) => opt(v, s.s3.moveScale, t)).join('')}</select></span></label>
        </div>
        <p class="st-live" id="st-3d-now"></p>
        <p class="st-note">Shadows are cached: they're redrawn only when objects or lights change, not when you move the camera. Exports always render at full quality.</p></section>
      <div class="st-foot"><button type="button" data-st="reset">Reset to defaults</button><button type="button" class="btn-primary" data-st="done">Done</button></div></form>`;
    const { el, close } = this.dialog({ title: 'Settings', body, wide: true });
    el.querySelector('.ds-dialog')?.classList.add('st-dialog');
    const f = el.querySelector('.st-form'); f.addEventListener('submit', (e) => e.preventDefault());
    const live = () => {
      const M = this.model, u = el.querySelector('#st-undo-now'), d = el.querySelector('#st-3d-now');
      if (u) u.textContent = `Now: ${Math.max(0, M.history.length - 1)} undo step${M.history.length === 2 ? '' : 's'} using ${((M.historyChars || 0) / 1048576).toFixed(1)} MB.`;
      const st = this.s3PerfStats?.();
      if (d) d.textContent = st ? `3D now: last frame ${st.ms} ms · ${st.scaleNow}% resolution · ${st.shadows === 'off' ? 'shadows off' : `${st.shadows} shadows ${st.shadowRes} px`} · shadow maps redrawn ${st.shadowUpdates} times in ${st.renders} frames · ${st.casters} shadow-casting objects.` : 'Open the 3D section to see live 3D numbers.';
    };
    const read = () => {
      const fd = new FormData(f);
      s.undoSteps = +fd.get('undoSteps'); s.undoMB = +fd.get('undoMB');
      s.s3.mode = fd.get('mode') || 'auto';
      if (s.s3.mode === 'custom') { s.s3.shadows = fd.get('shadows'); s.s3.shadowRes = +fd.get('shadowRes'); s.s3.maxDpr = +fd.get('maxDpr'); s.s3.moveScale = +fd.get('moveScale'); }
      f.undoStepsOut.value = s.undoSteps; f.querySelector('.st-custom').hidden = s.s3.mode !== 'custom';
      this.saveSettings(); live();
    };
    f.addEventListener('input', read); f.addEventListener('change', read);
    el.querySelector('[data-st="done"]').addEventListener('click', close);
    el.querySelector('[data-st="reset"]').addEventListener('click', () => { this.settings = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)); this.saveSettings(); close(); this.showSettings(); Utils.toast('Settings reset to defaults', '↺'); });
    live(); const timer = setInterval(() => { if (!document.body.contains(el)) clearInterval(timer); else live(); }, 1000);
  },
};
Object.assign(StudioApp.prototype, SettingsMixin);
