/**
 * DesignStudio — workspace ergonomics (v3.23.0). Fixes the biggest pain points from tests/UX-REPORT.md:
 *  P1  Laptop space — drag the inner edge of the Layers / Properties panels to resize them (double-click resets),
 *      Ctrl+\ (or View › Hide panels, or the status-bar button) hides both side panels for a full-width canvas,
 *      and Animate opens a timeline sized to the screen instead of a fixed 300 px.
 *  P3  AI Studio docks as its own resizable column next to Properties, so you can still edit what it made; on
 *      narrow screens the Layers panel steps aside while AI is open.
 *  P4  Animate explains itself — Animate turns Auto-key on (moving / changing a layer records a keyframe), the
 *      auto-key button is labelled with its state, and an empty timeline shows the 3 steps to make an animation.
 */
'use strict';

const WS_KEY = 'designstudio.workspace.v1';

(function patchWorkspace() {
  const P = StudioApp.prototype, setUiMode = P.setUiMode, renderTL = P.renderTimeline, updBtns = P.updateTimelineButtons;
  P.setUiMode = function (mode) {
    const t = this.model.animationTimeline;
    if (mode === 'animate' && this.uiMode !== 'animate') { this._autoKeyBefore = !!t.isRecording; if (!t.isRecording) { t.isRecording = true; this.model.captureBaseline?.(this.model.allElements()); } }
    const r = setUiMode.call(this, mode);
    if (mode === 'animate') { const h = Math.round(Utils.clamp(window.innerHeight * 0.3, 170, 300)); document.getElementById('center-viewport').style.setProperty('--tl-h', `${h}px`); this.renderer.resize(); this.requestRender(); }
    else if (this._autoKeyBefore !== undefined) { t.isRecording = this._autoKeyBefore; this._autoKeyBefore = undefined; }
    this.updateTimelineButtons?.(); this.wsTimelineHint?.();
    return r;
  };
  P.renderTimeline = function (...a) { const r = renderTL.apply(this, a); this.wsTimelineHint?.(); return r; };
  P.updateTimelineButtons = function (...a) {
    const r = updBtns.apply(this, a);
    const b = document.getElementById('tl-btn-autokey'), on = !!this.model.animationTimeline.isRecording;
    if (b) { b.classList.add('ws-autokey'); b.setAttribute('aria-pressed', String(on)); const lab = b.querySelector('.ws-ak-label') || b.appendChild(Object.assign(document.createElement('span'), { className: 'ws-ak-label' })); lab.textContent = on ? 'Auto-key on' : 'Auto-key off'; b.title = on ? 'Auto-key is on: moving or changing the selected layer records a keyframe at the playhead. Click to turn off.' : 'Auto-key is off: changes edit the design. Click to record changes as keyframes.'; }
    this.wsTimelineHint?.();
    return r;
  };
})();

const WorkspaceMixin = {
  bindWorkspace() {
    let st = {}; try { st = JSON.parse(localStorage.getItem(WS_KEY) || '{}') || {}; } catch (_) { st = {}; }
    this.ws = { left: st.left || null, right: st.right || null, ai: st.ai || 400, hidden: false };
    const L = document.getElementById('left-panel'), R = document.getElementById('right-panel');
    // ---- P1: resizable side panels
    const handle = (panel, side) => {
      if (!panel) return;
      const h = document.createElement('div'); h.className = `ws-resize ws-resize-${side}`; h.title = 'Drag to resize · double-click to reset'; h.setAttribute('role', 'separator'); h.setAttribute('aria-orientation', 'vertical'); h.setAttribute('aria-label', side === 'left' ? 'Resize Layers panel' : 'Resize Properties panel'); h.setAttribute('aria-valuemin', '180'); h.setAttribute('aria-valuemax', '560'); h.setAttribute('aria-valuenow', String(Math.round(panel.getBoundingClientRect().width) || 260)); h.tabIndex = 0;
      panel.appendChild(h);
      const apply = (w) => { if (w) panel.style.setProperty('width', `${w}px`); else panel.style.removeProperty('width'); h.setAttribute('aria-valuenow', String(Math.round(w || panel.getBoundingClientRect().width) || 260)); this.wsRelayout(); };
      if (this.ws[side]) apply(this.ws[side]);
      h.addEventListener('pointerdown', (e) => {
        e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('drag');
        const x0 = e.clientX, w0 = panel.getBoundingClientRect().width;
        const mv = (ev) => { const w = Utils.clamp(Math.round(w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX)), 180, Math.min(560, window.innerWidth * 0.4)); this.ws[side] = w; apply(w); };
        const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.classList.remove('drag'); this.wsSave(); };
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
      });
      h.addEventListener('dblclick', () => { this.ws[side] = null; apply(null); this.wsSave(); });
      h.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); const w = Utils.clamp((this.ws[side] || panel.offsetWidth) + ((e.key === 'ArrowRight') === (side === 'left') ? 16 : -16), 180, 560); this.ws[side] = w; apply(w); this.wsSave(); });
    };
    handle(L, 'left'); handle(R, 'right');
    // ---- P1: hide panels (Ctrl+\), status-bar button, View menu
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); this.wsTogglePanels(); } }, true);
    const sb = document.getElementById('sb-version');
    if (sb) { const b = document.createElement('button'); b.type = 'button'; b.id = 'sb-panels'; b.className = 'sb-btn'; b.title = 'Hide / show side panels (Ctrl+\\)'; b.setAttribute('aria-label', 'Hide side panels'); b.innerHTML = `${Icons.svg('layers', 13)}<span>Panels</span>`; b.addEventListener('click', () => this.wsTogglePanels()); sb.parentNode.insertBefore(b, sb); }
    const viewMenu = document.querySelector('[data-action="toggleTimeline"]')?.parentNode;
    if (viewMenu) { const it = document.createElement('div'); it.className = document.querySelector('[data-action="toggleTimeline"]').className; it.dataset.action = 'hidePanels'; it.setAttribute('role', 'menuitem'); it.innerHTML = 'Hide Side Panels <span class="dropdown-shortcut">Ctrl+\\</span>'; viewMenu.insertBefore(it, document.querySelector('[data-action="toggleTimeline"]').nextSibling); }
    if (this.commands) this.commands.hidePanels = { run: () => this.wsTogglePanels() };
    // ---- P3: dock AI Studio
    const attachAI = (drawer) => {
      if (!drawer || drawer.dataset.wsDock) return; drawer.dataset.wsDock = '1';
      const grip = document.createElement('div'); grip.className = 'ws-ai-grip'; grip.title = 'Drag to resize AI Studio'; drawer.appendChild(grip);
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault(); grip.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = this.ws.ai;
        const mv = (ev) => { this.ws.ai = Utils.clamp(Math.round(w0 + x0 - ev.clientX), 300, Math.min(720, window.innerWidth * 0.45)); this.wsDock(); };
        const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); this.wsSave(); };
        grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
      });
      new MutationObserver(() => this.wsDock()).observe(drawer, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
      this.wsDock();
    };
    attachAI(document.querySelector('.ai-drawer')); // AI Studio is built on first open
    const bodyObs = new MutationObserver(() => { const d = document.querySelector('.ai-drawer'); if (d) { attachAI(d); bodyObs.disconnect(); } });
    if (!document.querySelector('.ai-drawer')) bodyObs.observe(document.body, { childList: true });
    const setSec = this.setSection;
    this.setSection = function (name) { const r = setSec.call(this, name); this.wsDock(); return r; };
    window.addEventListener('resize', () => this.wsDock());
    // ---- P4: empty-timeline guidance
    const tl = document.getElementById('timeline-panel');
    if (tl) { const hint = document.createElement('div'); hint.id = 'ws-tl-hint'; hint.hidden = true; tl.appendChild(hint); }
    this.updateTimelineButtons?.();
    this.wsDock();
  },
  wsSave() { try { localStorage.setItem(WS_KEY, JSON.stringify({ left: this.ws.left, right: this.ws.right, ai: this.ws.ai })); } catch (_) { /* ignore */ } },
  wsRelayout() { this.renderer?.resize(); this.requestRender?.(); this.s3Resize?.(); this.t3Draw?.(); this.mgDraw?.(); },
  wsTogglePanels(force) {
    const hide = force !== undefined ? force : !this.ws.hidden;
    this.ws.hidden = hide;
    document.body.classList.toggle('ws-panels-hidden', hide);
    document.getElementById('sb-panels')?.classList.toggle('active', hide);
    this.wsRelayout();
    Utils.toast(hide ? 'Side panels hidden — Ctrl+\\ brings them back' : 'Side panels shown', 'ℹ️');
  },
  /** AI Studio as a docked column in Design (canvas shrinks, Properties stay); overlay elsewhere. */
  wsDock() {
    const drawer = document.querySelector('.ai-drawer'); if (!drawer) return;
    const open = drawer.classList.contains('open') && !drawer.hidden, design = this.section === 'design';
    const dock = open && design && !this.ws?.hidden, R = document.getElementById('right-panel');
    const w = Math.round(Utils.clamp(this.ws?.ai || 400, 300, Math.min(720, window.innerWidth * 0.45)));
    document.body.classList.toggle('ws-ai-docked', dock);
    document.documentElement.style.setProperty('--ws-ai-w', `${w}px`);
    document.documentElement.style.setProperty('--ws-rp-w', `${dock && R ? R.getBoundingClientRect().width : 0}px`);
    // narrow screens: let the Layers panel step aside while AI is docked
    const squeeze = dock && window.innerWidth < 1560;
    document.body.classList.toggle('ws-ai-squeeze', squeeze);
    if (this._wsDocked !== dock || this._wsSqueeze !== squeeze || this._wsW !== w) { this._wsDocked = dock; this._wsSqueeze = squeeze; this._wsW = w; requestAnimationFrame(() => this.wsRelayout()); }
  },
  /** Empty timeline → how to animate in 3 steps. */
  wsTimelineHint() {
    const h = document.getElementById('ws-tl-hint'); if (!h) return;
    const a = this.model.activeAnimation, any = a && Object.keys(a.tracks || {}).some(k => !String(k).startsWith('o3_') && Object.keys(a.tracks[k] || {}).length);
    const show = this.uiMode === 'animate' && !any && this.section === 'design';
    h.hidden = !show; if (!show) return;
    const sel = this.model.topSelected().length, on = !!this.model.animationTimeline.isRecording;
    h.innerHTML = `<b>Make your first animation</b><ol><li class="${sel ? 'done' : ''}">Select a layer on the canvas</li><li>Drag the red playhead to a later time</li><li>Move, resize or recolour the layer — ${on ? '<span class="ws-on">Auto-key is on</span>, so a keyframe is recorded' : 'turn <b>Auto-key</b> on, or click ◆ next to a property'}</li></ol><span class="ws-tl-tip">Press ▶ to play. Easing, loops and state machines are in this panel.</span>`;
  }
};
Object.assign(StudioApp.prototype, WorkspaceMixin);
