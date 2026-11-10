/**
 * DesignStudio — shared shell (v3.15.0).
 * 1) One top bar for every section: menus, Edit/Animate, zoom, Grid, Snap, Timeline and Play stay visible in Design,
 *    Media and 3D. In 3D they drive the 3D viewport (camera zoom, grid, snap, dope sheet, playback); anything that only
 *    exists in Design switches to Design first and then runs.
 * 2) Movable dialogs: drag any dialog / popover by its title bar (or top edge) anywhere on screen; double-click the
 *    title bar to re-center. Positions are remembered per dialog for the session.
 */
'use strict';

const MG_ANIM_TOOLS = new Set(['maker', 'video', 'sprite', 'design', 'cut', 'speed', 'reverse', 'timing', 'skip']);

const UiShellMixin = {
  bindUiShell() {
    this.bindSharedTopBar();
    this.bindMovableDialogs();
  },

  // ------------------------------------------------------------------ shared top bar
  bindSharedTopBar() {
    const bar = document.getElementById('top-bar');
    if (!bar) return;
    this.secMode = { media: 'edit', '3d': 'edit' };
    const setSec = this.setSection;
    this.setSection = function (name) { const r = setSec.call(this, name); this.syncModeSwitch(); return r; };
    // Edit ↔ Animate per section (capture: before the Design handler)
    document.querySelectorAll('#mode-switch [data-mode]').forEach(b => b.addEventListener('click', (e) => {
      if (this.section === 'design') return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.setSectionMode(b.dataset.mode === 'animate' ? 'animate' : 'edit');
    }, true));
    const design = new Set(['m-edit', 'm-view', 'm-object']);
    bar.addEventListener('click', (e) => {
      if (this.section === 'design') return;
      const btn = e.target.closest('button'); if (!btn || btn.closest('#section-switch') || btn.id === 'm-file' || btn.id === 'btn-export-modal') return;
      if (btn.closest('.dropdown-menu, .menu-dropdown, [role="menu"]') && !design.has(btn.id)) return; // items inside an open menu
      if (this.section === 'media' && this.media?.mg && this.mgTopBar(btn.id)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (this.section === '3d' && this.s3?.ready && this.t3TopBar3D(btn.id, btn)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      const id = btn.id;
      if (design.has(id) || /^btn-(zoom|toggle|play)/.test(id)) this.setSection('design'); // Design-only menus
    }, true);
    // keep the zoom readout meaningful per section
    const upd = this.updateStatusBar;
    this.updateStatusBar = function (...a) { const r = upd.apply(this, a); this.t3ZoomLabel(); return r; };
    const tick = () => { if (this.section !== 'design') this.t3ZoomLabel(); };
    setInterval(tick, 500);
  },
  t3ZoomLabel() {
    const lbl = document.getElementById('btn-zoom-level'); if (!lbl) return;
    if (this.section === '3d' && this.s3?.ready) { const s3 = this.s3, d = s3.camera.position.distanceTo(s3.orbit.target); s3._d0 = s3._d0 || d || 1; lbl.textContent = `${Math.round((s3._d0 / Math.max(0.001, d)) * 100)}%`; lbl.title = '3D camera zoom — click to frame the selection (F)'; }
    else if (this.section === 'media') { const G = this.media?.mg && this.mgGeom(); lbl.textContent = G?.has ? `${Math.round(G.s * 100)}%` : '—'; lbl.title = 'Media zoom — click to fit'; }
    else { lbl.textContent = `${Math.round(this.model.zoom * 100)}%`; lbl.title = 'Zoom to fit (Shift+1)'; }
    const sb = document.getElementById('btn-toggle-snap'), gb = document.getElementById('btn-toggle-grid'), tb = document.getElementById('btn-toggle-timeline');
    if (this.section === '3d' && this.s3?.ready) {
      gb?.classList.toggle('active', this.s3.grid.visible);
      sb?.classList.toggle('active', !!document.getElementById('s3-snap')?.classList.contains('on'));
      tb?.classList.toggle('active', !!this.t3 && !this.t3.collapsed);
    } else if (this.section === 'media' && this.media?.mg) {
      gb?.classList.toggle('active', this.media.mg.grid); sb?.classList.toggle('active', this.media.mg.snap); tb?.classList.toggle('active', !document.getElementById('md-strip')?.hidden);
    } else [gb, sb, tb].forEach(b => b?.classList.remove('active'));
  },
  syncModeSwitch() {
    const mode = this.section === 'design' ? (this.uiMode === 'animate' ? 'animate' : 'design') : (this.secMode[this.section] === 'animate' ? 'animate' : 'design');
    document.querySelectorAll('#mode-switch [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const tip = { design: ['Edit mode: layout and styling', 'Animate mode: timelines, state machines, inputs'], media: ['Edit mode: every image & video tool', 'Animate mode: frame tools, timing and the frame strip'], '3d': ['Edit mode: model the scene (edits change the base pose)', 'Animate mode: dope sheet open, Auto-key on'] }[this.section] || ["Edit mode", "Animate mode"];
    document.querySelectorAll('#mode-switch [data-mode]').forEach(b => { b.title = b.dataset.mode === 'animate' ? tip[1] : tip[0]; });
  },
  /** Edit / Animate inside Media and 3D. */
  setSectionMode(mode) {
    const sec = this.section; this.secMode[sec] = mode;
    if (sec === 'media' && this.media) {
      const ws = document.getElementById('media-workspace'); ws.classList.toggle('md-animate', mode === 'animate');
      const strip = document.getElementById('md-strip'), bar = document.querySelector('.md-playbar');
      if (mode === 'animate') {
        if (strip) strip.hidden = false; if (bar) bar.hidden = false;
        if (this.mediaHasClip()) this.mediaSelectTool(this.media.frames.length > 1 ? 'timing' : 'maker'); else this.mediaSelectTool('maker');
        Utils.toast('Animate mode — frame tools, timing, speed and the frame strip', '🎬');
      } else {
        const t = MediaUI.tool(this.media.tool);
        if (t && MG_ANIM_TOOLS.has(t.id) && this.mediaHasClip()) this.mediaSelectTool('crop');
        this.mediaPlay?.(false);
        Utils.toast('Edit mode — all image & video tools', '✏️');
      }
      this.mediaLayoutStage?.();
    } else if (sec === '3d' && this.s3?.ready) {
      const s3 = this.s3, ak = document.getElementById('s3-autokey');
      if (mode === 'animate') {
        s3.autoKey = true; ak?.classList.add('on');
        if (this.t3?.collapsed) { this.t3.collapsed = false; this.t3Save(); this.t3Layout(); }
        Utils.toast('Animate mode — Auto-key on: moving objects creates keyframes', '🎬');
      } else {
        s3.autoKey = false; ak?.classList.remove('on'); this.s3Play(false);
        if (this.t3 && !this.t3.collapsed) { this.t3.collapsed = true; this.t3Save(); this.t3Layout(); }
        Utils.toast('Edit mode — Auto-key off, edits change the scene', '✏️');
      }
    }
    this.syncModeSwitch(); this.t3ZoomLabel?.();
  },
  /** Top-bar buttons while in Media; returns true when handled here. */
  mgTopBar(id) {
    const g = this.media.mg;
    switch (id) {
      case 'btn-zoom-in': this.mgZoom(1.25); return true;
      case 'btn-zoom-out': this.mgZoom(0.8); return true;
      case 'btn-zoom-level': this.mgZoom('fit'); return true;
      case 'btn-toggle-grid': g.grid = !g.grid; this.mgSave(); this.mgDraw(); Utils.toast(`Pixel grid ${g.grid ? 'on' : 'off'} (${g.gridSize} px)`, '⌗'); this.t3ZoomLabel(); return true;
      case 'btn-toggle-snap': g.snap = !g.snap; this.mgSave(); Utils.toast(`Snap to guides / grid / edges ${g.snap ? 'on' : 'off'}`, '🧲'); this.t3ZoomLabel(); return true;
      case 'btn-toggle-timeline': this.mgToggleStrip(); return true;
      case 'btn-play-proto': if (this.mediaHasClip?.()) this.mediaPlay(!this.media.playing); else Utils.toast('Open a GIF or video first', 'ℹ️'); return true;
      default: return false;
    }
  },
  /** Top-bar buttons while in 3D; returns true when handled here. */
  t3TopBar3D(id, btn) {
    const s3 = this.s3;
    const dolly = (f) => { const off = s3.camera.position.clone().sub(s3.orbit.target); off.multiplyScalar(f); s3.camera.position.copy(s3.orbit.target).add(off); s3.orbit.update(); s3.dirty = true; this.t3ZoomLabel(); };
    switch (id) {
      case 'btn-zoom-in': dolly(1 / 1.2); return true;
      case 'btn-zoom-out': dolly(1.2); return true;
      case 'btn-zoom-level': this.s3Focus(); setTimeout(() => this.t3ZoomLabel(), 400); return true;
      case 'btn-toggle-grid': { const st = this.s3Scene().settings; st.grid = st.grid === false; this.s3ApplySettings(); this.s3Commit?.('Grid'); Utils.toast(`3D grid ${st.grid ? 'on' : 'off'}`, '⌗'); this.t3ZoomLabel(); return true; }
      case 'btn-toggle-snap': document.getElementById('s3-snap')?.click(); Utils.toast(`3D snap ${document.getElementById('s3-snap')?.classList.contains('on') ? 'on' : 'off'}`, '🧲'); this.t3ZoomLabel(); return true;
      case 'btn-toggle-timeline': if (this.t3) { this.t3.collapsed = !this.t3.collapsed; this.t3Save(); this.t3Layout(); this.t3ZoomLabel(); } return true;
      case 'btn-play-proto': if (s3.preview) this.s3StopPreview(); else this.s3Play(!s3.playing); return true;
      default: return false;
    }
  },

  // ------------------------------------------------------------------ movable dialogs
  bindMovableDialogs() {
    const BOX = '[role="dialog"], .modal-window, .ds-dialog, .dsm-win, .t3-curve, #color-picker-popover, .save-pop, .var-pick, .ai-drawer';
    const HANDLE = '.modal-header, .ds-dialog > h3, .dsm-head, .t3-ch, .ai-head, [data-drag-handle]';
    const NO = 'button, input, select, textarea, a, label, canvas, video, [contenteditable="true"], [role="slider"], .t3-menu, nav, kbd';
    const saved = new Map();
    const keyOf = (box) => box.id || [...box.classList].find(c => !/^(open|show|active)$/.test(c)) || 'dialog';
    const fix = (box) => { // freeze the box at its current place so it can be moved
      const r = box.getBoundingClientRect();
      Object.assign(box.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, right: 'auto', bottom: 'auto', margin: '0', transform: 'none', width: `${r.width}px`, maxWidth: 'none' });
      box.classList.add('ds-moved');
      return r;
    };
    const clampPos = (x, y, w) => [Utils.clamp(x, 60 - w, window.innerWidth - 60), Utils.clamp(y, 0, window.innerHeight - 36)];
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = e.target; if (!(t instanceof Element)) return;
      const box = t.closest(BOX); if (!box || t.closest(NO)) return;
      const r = box.getBoundingClientRect();
      if (r.width > window.innerWidth * 0.96 && r.height > window.innerHeight * 0.9) return; // full-screen players
      const handle = t.closest(HANDLE);
      const onHandle = handle && box.contains(handle) && handle.getBoundingClientRect().top - r.top < 60;
      if (!onHandle && e.clientY - r.top > 34) return; // otherwise only the top edge drags
      if (getComputedStyle(t).cursor === 'text' || window.getSelection()?.toString()) return;
      e.preventDefault();
      const r0 = fix(box), dx = e.clientX - r0.left, dy = e.clientY - r0.top;
      box.classList.add('ds-dragging');
      const mv = (ev) => { const [x, y] = clampPos(ev.clientX - dx, ev.clientY - dy, r0.width); box.style.left = `${x}px`; box.style.top = `${y}px`; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); box.classList.remove('ds-dragging'); saved.set(keyOf(box), { left: box.style.left, top: box.style.top }); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    }, true);
    // double-click the title bar: back to the default position
    document.addEventListener('dblclick', (e) => {
      const t = e.target; if (!(t instanceof Element) || t.closest(NO)) return;
      const box = t.closest('.ds-moved'); if (!box) return;
      const r = box.getBoundingClientRect(); if (e.clientY - r.top > 60) return;
      ['position', 'left', 'top', 'right', 'bottom', 'margin', 'transform', 'width', 'maxWidth'].forEach(p => { box.style[p] = ''; });
      box.classList.remove('ds-moved'); saved.delete(keyOf(box));
    });
    // dialogs that are created again (or re-opened) come back where the user left them
    const place = (box) => {
      const pos = saved.get(keyOf(box)); if (!pos || box.classList.contains('ds-moved')) return;
      requestAnimationFrame(() => { if (!box.isConnected || !box.getClientRects().length) return; const r = fix(box); const [x, y] = clampPos(parseFloat(pos.left), parseFloat(pos.top), r.width); box.style.left = `${x}px`; box.style.top = `${y}px`; });
    };
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'attributes') { const el = m.target; if (el instanceof Element) el.querySelectorAll?.(BOX).forEach(place); continue; }
        for (const n of m.addedNodes) if (n instanceof Element) { if (n.matches(BOX)) place(n); n.querySelectorAll?.(BOX).forEach(place); }
      }
    }).observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'], attributeOldValue: false });
    document.querySelectorAll('.modal-overlay').forEach(o => new MutationObserver(() => o.querySelectorAll(BOX).forEach(place)).observe(o, { attributes: true, attributeFilter: ['class'] }));
  }
};
Object.assign(StudioApp.prototype, UiShellMixin);
