/**
 * DesignStudio — Ruler guides, Figma-style (v3.11.0).
 * Drag from the top ruler for a horizontal guide, from the left ruler for a vertical one. A guide dropped over a
 * top-level frame belongs to that frame (moves with it, spans only that frame); otherwise it spans the page.
 * Hover a guide to drag it, click to select (Delete removes), drag it back onto a ruler to remove it.
 * Layers snap to guides while moving and resizing. View › Guides (Ctrl+;) · Lock guides (Ctrl+Alt+;).
 * Data: page.guides = [{ id, axis: 'x' | 'y', pos, frameId }] — axis 'x' = vertical line at x; pos is relative
 * to the frame when frameId is set. Saved with the page and part of undo history.
 */
'use strict';

const GUIDE_COLOR = '#f2357a';
const GUIDE_HIT_PX = 4;

const GuidesMixin = {
  bindGuides() {
    const m = this.model;
    if (m.showGuides === undefined) m.showGuides = true;
    if (m.lockGuides === undefined) m.lockGuides = false;
    this.rulers.app = this;
    Object.assign(this.commands, {
      toggleGuides: { run: () => { m.showGuides = !m.showGuides; this.selectedGuideId = null; this.requestRender(); this.scheduleViewSave(); Utils.toast(`Guides ${m.showGuides ? 'shown' : 'hidden'}`); } },
      lockGuides: { run: () => { m.lockGuides = !m.lockGuides; this.selectedGuideId = null; this.requestRender(); this.scheduleViewSave(); Utils.toast(`Guides ${m.lockGuides ? 'locked' : 'unlocked'}`); } },
      clearGuides: { run: () => this.clearGuides(), enabled: () => this.pageGuides().length > 0 }
    });
    // Rulers → new guide
    const ruler = (canvas, axis) => {
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || this.previewing) return;
        e.preventDefault();
        if (!m.showGuides) { m.showGuides = true; this.scheduleViewSave(); }
        if (m.lockGuides) { Utils.toast('Guides are locked — View › Lock Guides to unlock', '🔒'); return; }
        this.startGuideDrag({ id: Utils.uid('guide'), axis, pos: 0, frameId: null }, true, e);
      });
      canvas.style.cursor = axis === 'y' ? 'row-resize' : 'col-resize';
      canvas.title = axis === 'y' ? 'Drag down to add a horizontal guide' : 'Drag right to add a vertical guide';
    };
    ruler(document.getElementById('ruler-x'), 'y');
    ruler(document.getElementById('ruler-y'), 'x');
    // Keyboard (capture: runs before the editor's shortcuts)
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.getElementById('prototype-modal')?.style.display === 'flex') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === ';' || e.code === 'Semicolon')) { e.preventDefault(); e.stopPropagation(); this.run(e.altKey ? 'lockGuides' : 'toggleGuides'); return; }
      if (this.selectedGuideId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault(); e.stopPropagation();
        this.deleteGuide(this.selectedGuideId);
      } else if (this.selectedGuideId && e.key === 'Escape') { this.selectedGuideId = null; this.requestRender(); }
    }, true);
  },

  // ------------------------------------------------------------------ data
  pageGuides() {
    const pg = this.model.page;
    if (!Array.isArray(pg.guides)) pg.guides = [];
    return pg.guides;
  },
  guideFrame(g) { return g.frameId ? this.model.getElementById(g.frameId) : null; },
  /** Absolute line of a guide: { g, axis, abs, from, to } (from/to = extent on the other axis, null = endless). */
  guideLine(g) {
    if (!g.frameId) return { g, axis: g.axis, abs: g.pos, from: null, to: null };
    const f = this.guideFrame(g);
    if (!f || !f.visible || f.parentId) return null; // frame deleted / hidden / nested now
    return g.axis === 'x'
      ? { g, axis: 'x', abs: f.x + g.pos, from: f.y, to: f.y + f.height }
      : { g, axis: 'y', abs: f.y + g.pos, from: f.x, to: f.x + f.width };
  },
  visibleGuideLines() {
    if (!this.model.showGuides) return [];
    const out = [];
    for (const g of this.pageGuides()) { if (this.guideDrag?.g === g && this.guideDrag.remove) continue; const l = this.guideLine(g); if (l) out.push(l); }
    if (this.guideDrag?.isNew && !this.guideDrag.remove && this.guideDrag.started) out.push({ g: this.guideDrag.g, axis: this.guideDrag.g.axis, abs: this.guideDrag.g.pos, from: null, to: null });
    return out;
  },
  guideAt(p) {
    const m = this.model;
    if (!m.showGuides || m.lockGuides) return null;
    const th = GUIDE_HIT_PX / m.zoom;
    let best = null;
    for (const l of this.visibleGuideLines()) {
      const d = Math.abs((l.axis === 'x' ? p.x : p.y) - l.abs);
      const along = l.axis === 'x' ? p.y : p.x;
      if (d > th || (l.from !== null && (along < l.from - th || along > l.to + th))) continue;
      if (!best || d < best.d) best = { l, d };
    }
    return best ? best.l : null;
  },
  clearGuides() {
    const pg = this.model.page;
    if (!pg.guides?.length) return;
    pg.guides = []; this.selectedGuideId = null;
    this._actionLabel = 'Clear guides'; this.commit();
    Utils.toast('Guides cleared on this page', '🧹');
  },
  deleteGuide(id) {
    const pg = this.model.page;
    const i = (pg.guides || []).findIndex(g => g.id === id);
    if (i < 0) return;
    pg.guides.splice(i, 1); this.selectedGuideId = null;
    this._actionLabel = 'Delete guide'; this.commit();
  },

  // ------------------------------------------------------------------ editor hooks
  /** Canvas pointerdown (select tools). Returns true when a guide took the event. */
  guidePointerDown(p, e) {
    if (e.shiftKey || e.altKey) return false;
    const l = this.guideAt(p);
    if (!l) { if (this.selectedGuideId) { this.selectedGuideId = null; this.requestRender(); } return false; }
    const g = this.pageGuides().find(x => x.id === l.g.id);
    if (!g) return false;
    this.isMouseDown = false; this.mode = 'none';
    this.startGuideDrag(g, false, e);
    return true;
  },
  /** Canvas hover (no button). Returns true when over a guide (cursor + highlight handled here). */
  guideHover(p) {
    const tool = this.model.activeTool;
    const l = ['select', 'directSelect', 'scale'].includes(tool) && !this.spaceDown && !this.hitHandle(p) ? this.guideAt(p) : null;
    const id = l ? l.g.id : null;
    if (id !== this.hoverGuideId) { this.hoverGuideId = id; this.requestRender(); }
    if (!l) return false;
    this.updateCursor(l.axis === 'x' ? 'col-resize' : 'row-resize');
    if (this.model.hoveredId) { this.model.hoveredId = null; this.requestRender(); }
    return true;
  },
  /** Snap a pointer used to resize (unrotated) to guides; hx/hy = which edges move. */
  snapPointToGuides(p, hx, hy) {
    const m = this.model;
    if (!m.snapToGuides) return p;
    const th = 6 / m.zoom;
    const q = { ...p };
    for (const l of this.visibleGuideLines()) {
      if (hx && l.axis === 'x' && Math.abs(p.x - l.abs) < th) q.x = l.abs;
      if (hy && l.axis === 'y' && Math.abs(p.y - l.abs) < th) q.y = l.abs;
    }
    return q;
  },

  // ------------------------------------------------------------------ dragging
  startGuideDrag(g, isNew, e0) {
    const m = this.model;
    const D = this.guideDrag = { g, isNew, remove: false, started: !isNew, orig: { pos: g.pos, frameId: g.frameId }, x0: e0.clientX, y0: e0.clientY, moved: false };
    this.selectedGuideId = isNew ? null : g.id;
    if (!isNew) { g.pos = this.guideLine(g)?.abs ?? g.pos; g.frameId = null; } // drag in absolute coordinates
    const rect = () => this.canvas.getBoundingClientRect();
    const move = (ev) => {
      if (Math.hypot(ev.clientX - D.x0, ev.clientY - D.y0) > 2) D.moved = true;
      const r = rect();
      const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
      const w = this.renderer.screenToWorld(sx, sy);
      D.started = true;
      // back over (or past) the ruler it belongs to → remove
      D.remove = g.axis === 'y' ? ev.clientY < r.top : ev.clientX < r.left;
      let v = g.axis === 'y' ? w.y : w.x;
      // snap to selection / frame edges and centres (6 px on screen), else to whole pixels
      const th = 6 / m.zoom;
      let best = null;
      const cands = [];
      const sb = this.selectionBox();
      if (sb) { const b = Utils.aabb(Object.assign({ rotation: 0 }, this.boxToEl(sb))); cands.push(...(g.axis === 'y' ? [b.y, b.y + b.h / 2, b.y + b.h] : [b.x, b.x + b.w / 2, b.x + b.w])); }
      for (const f of m.roots()) if (f.type === 'frame' && f.visible) cands.push(...(g.axis === 'y' ? [f.y, f.y + f.height / 2, f.y + f.height] : [f.x, f.x + f.width / 2, f.x + f.width]));
      if (!ev.shiftKey) for (const c of cands) { const d = Math.abs(c - v); if (d < th && (!best || d < best.d)) best = { d, c }; }
      v = best ? best.c : (ev.shiftKey ? Math.round(v / 10) * 10 : Math.round(v));
      g.pos = v;
      D.hoverFrame = this.guideFrameAt(w);
      const label = `${g.axis === 'y' ? 'Y' : 'X'} ${Utils.round(D.hoverFrame ? v - (g.axis === 'y' ? D.hoverFrame.y : D.hoverFrame.x) : v, 2)}`;
      D.remove ? this.hideTransformTooltip?.() : this.showTransformTooltip(ev.clientX, ev.clientY, label);
      this.canvas.style.cursor = D.remove ? 'not-allowed' : (g.axis === 'x' ? 'col-resize' : 'row-resize');
      this.requestRender();
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('blur', up, true);
      this.hideTransformTooltip?.();
      const list = this.pageGuides();
      const r = rect();
      const insideCanvas = ev.type !== 'blur' && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (isNew && (!D.started || !insideCanvas || D.remove)) { this.guideDrag = null; this.updateCursor(); this.requestRender(); return; }
      if (!isNew && !D.moved) { Object.assign(g, D.orig); this.guideDrag = null; this.requestRender(); return; } // plain click = select
      if (D.remove) {
        this.guideDrag = null;
        const i = list.indexOf(g); if (i >= 0) list.splice(i, 1);
        this.selectedGuideId = null;
        this._actionLabel = 'Delete guide'; this.commit(); this.updateCursor();
        return;
      }
      // attach to the top-level frame under the pointer (Figma: guides live on frames or on the canvas)
      const f = D.hoverFrame;
      g.frameId = f ? f.id : null;
      if (f) g.pos = Utils.round(g.pos - (g.axis === 'x' ? f.x : f.y), 2);
      if (isNew) list.push(g);
      this.guideDrag = null;
      this.selectedGuideId = g.id;
      this._actionLabel = isNew ? 'Add guide' : 'Move guide';
      this.commit(); this.updateCursor();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('blur', up, true);
    this.requestRender();
  },
  guideFrameAt(w) {
    const roots = this.model.roots().filter(f => f.type === 'frame' && f.visible && !f.isComponentSet);
    for (let i = roots.length - 1; i >= 0; i--) { const f = roots[i]; if (w.x >= f.x && w.x <= f.x + f.width && w.y >= f.y && w.y <= f.y + f.height) return f; }
    return null;
  },

  // ------------------------------------------------------------------ drawing
  /** Called by the renderer inside the world transform; draws crisp 1px lines in screen space. */
  drawUserGuides(ctx) {
    const lines = this.visibleGuideLines();
    if (!lines.length) return;
    const m = this.model, z = m.zoom, dpr = window.devicePixelRatio || 1;
    const W = this.renderer.cssW, H = this.renderer.cssH;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const l of lines) {
      const hot = l.g.id === this.hoverGuideId || l.g.id === this.selectedGuideId || this.guideDrag?.g === l.g;
      ctx.strokeStyle = GUIDE_COLOR; ctx.globalAlpha = m.lockGuides ? 0.55 : 1;
      ctx.lineWidth = hot ? 2 : 1;
      const s = Math.round((l.axis === 'x' ? l.abs * z + m.panX : l.abs * z + m.panY)) + (hot ? 0 : 0.5);
      const a = l.from === null ? 0 : (l.axis === 'x' ? l.from * z + m.panY : l.from * z + m.panX);
      const b = l.to === null ? (l.axis === 'x' ? H : W) : (l.axis === 'x' ? l.to * z + m.panY : l.to * z + m.panX);
      ctx.beginPath();
      if (l.axis === 'x') { ctx.moveTo(s, a); ctx.lineTo(s, b); } else { ctx.moveTo(a, s); ctx.lineTo(b, s); }
      ctx.stroke();
    }
    ctx.restore();
  },
  /** Marks for the rulers: [{ axis, abs, hot, label }] */
  rulerGuideMarks() {
    const lines = this.visibleGuideLines();
    return lines.map(l => {
      const hot = l.g.id === this.hoverGuideId || l.g.id === this.selectedGuideId || this.guideDrag?.g === l.g;
      const f = l.g.frameId ? this.guideFrame(l.g) : (this.guideDrag?.g === l.g ? this.guideDrag.hoverFrame : null);
      const rel = f ? l.abs - (l.axis === 'x' ? f.x : f.y) : l.abs;
      return { axis: l.axis, abs: l.abs, hot, label: String(Utils.round(rel, 2)) };
    });
  }
};
Object.assign(StudioApp.prototype, GuidesMixin);
