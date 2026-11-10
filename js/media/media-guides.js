/**
 * DesignStudio — Media rulers, guides, grid, zoom & snap (v3.16.0).
 * Rulers on the media stage measure source pixels. Drag from the top ruler for a horizontal guide, from the left
 * ruler for a vertical one; drag a guide to move it (snaps to grid, edges and centre), drag it back onto a ruler or
 * right-click it to remove. Grid overlays the frame; Snap makes crop / region drawing snap to guides, grid and edges.
 * Zoom: top-bar − / + (10 %–1600 %), click the % to fit. Guides are kept per session in media.guides.
 */
'use strict';

const MG_RULER = 20, MG_HIT = 5, MG_COLOR = '#f2357a';

(function patchMedia() {
  const P = StudioApp.prototype, bind = P.bindMedia, layout = P.mediaLayoutStage, ptr = P.mediaStagePointer, play = P.mediaPlay;
  P.bindMedia = function () { bind.call(this); this.bindMediaGuides(); };
  P.mediaLayoutStage = function () {
    const m = this.media, st = document.getElementById('md-stage');
    if (typeof m.zoom === 'number' && st?.width) {
      const box = document.getElementById('md-stage-box');
      box.style.width = `${Math.round(st.width * m.zoom)}px`; box.style.height = `${Math.round(st.height * m.zoom)}px`;
      box.classList.toggle('px', m.zoom >= 2);
    } else layout.call(this);
    this.mgDraw?.();
  };
  /** Snap the region being drawn to guides / grid / edges (in source px). */
  P.mediaStagePointer = function (e, phase) {
    const m = this.media;
    if (m?.mg?.snap && MediaUI.tool(m.tool).stage === 'rect' && phase !== 'down' && m.drag) {
      const ov = e.currentTarget, r = ov.getBoundingClientRect(), k = ov.width / r.width;
      const sx = this.mgSnap('x', (e.clientX - r.left) * k), sy = this.mgSnap('y', (e.clientY - r.top) * k);
      const fake = { currentTarget: ov, pointerId: e.pointerId, clientX: r.left + sx / k, clientY: r.top + sy / k, shiftKey: e.shiftKey, altKey: e.altKey };
      return ptr.call(this, fake, phase);
    }
    return ptr.call(this, e, phase);
  };
  P.mediaPlay = function (on) { const r = play.call(this, on); this.t3ZoomLabel?.(); return r; };
})();

const MediaGuidesMixin = {
  bindMediaGuides() {
    const wrap = document.getElementById('md-stage-wrap');
    if (!wrap || document.getElementById('md-vp')) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('designstudio.mg.v1') || '{}') || {}; } catch (_) { /* ignore */ }
    const m = this.media;
    m.mg = { rulers: saved.rulers !== false, grid: !!saved.grid, snap: saved.snap !== false, gridSize: saved.gridSize || 16, guides: [], sel: null };
    // viewport: corner + rulers + overlay around the existing stage wrap
    const vp = document.createElement('div');
    vp.id = 'md-vp'; vp.className = 'md-vp';
    wrap.parentNode.insertBefore(vp, wrap);
    vp.innerHTML = `<button type="button" class="mg-corner" id="mg-corner" title="Rulers & guides options" aria-label="Rulers and guides options">⌗</button><canvas class="mg-ruler mg-rx" id="mg-rx" title="Drag down to add a horizontal guide"></canvas><canvas class="mg-ruler mg-ry" id="mg-ry" title="Drag right to add a vertical guide"></canvas><canvas class="mg-ov" id="mg-ov" aria-hidden="true"></canvas>`;
    vp.appendChild(wrap);
    const rx = document.getElementById('mg-rx'), ry = document.getElementById('mg-ry');
    rx.addEventListener('pointerdown', (e) => this.mgStartDrag(e, { axis: 'y', pos: 0, id: Utils.uid('mg') }, true));
    ry.addEventListener('pointerdown', (e) => this.mgStartDrag(e, { axis: 'x', pos: 0, id: Utils.uid('mg') }, true));
    document.getElementById('mg-corner').addEventListener('click', (e) => this.mgMenu(e.currentTarget));
    // move / delete existing guides (capture: before the stage tools)
    vp.addEventListener('pointerdown', (e) => { const g = this.mgHit(e); if (!g || e.target.closest('.mg-ruler, .mg-corner')) return; e.preventDefault(); e.stopPropagation(); if (e.button === 2) { this.mgRemove(g); return; } this.mgStartDrag(e, g, false); }, true);
    vp.addEventListener('contextmenu', (e) => { if (this.mgHit(e)) e.preventDefault(); }, true);
    vp.addEventListener('pointermove', (e) => { if (this.mgDragging) return; const g = this.mgHit(e); vp.style.cursor = g ? (g.axis === 'x' ? 'col-resize' : 'row-resize') : ''; vp.classList.toggle('mg-hover', !!g); });
    wrap.addEventListener('scroll', () => this.mgDraw());
    new ResizeObserver(() => this.mgDraw()).observe(vp);
    new ResizeObserver(() => this.mgDraw()).observe(document.getElementById('md-stage-box'));
    // Delete selected guide
    window.addEventListener('keydown', (e) => {
      if (this.section !== 'media' || !m.mg.sel || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { const g = m.mg.guides.find(x => x.id === m.mg.sel); if (g) { this.mgRemove(g); e.preventDefault(); e.stopPropagation(); } }
      else if (e.key === 'Escape') { m.mg.sel = null; this.mgDraw(); }
    }, true);
    this.mgApply();
  },
  mgSave() { const g = this.media.mg; try { localStorage.setItem('designstudio.mg.v1', JSON.stringify({ rulers: g.rulers, grid: g.grid, snap: g.snap, gridSize: g.gridSize })); } catch (_) { /* ignore */ } },
  mgApply() { const vp = document.getElementById('md-vp'); if (!vp) return; vp.classList.toggle('mg-on', this.media.mg.rulers); this.mgDraw(); this.t3ZoomLabel?.(); },
  /** Stage geometry in viewport coordinates: origin (screen px of source 0,0) and scale (screen px per source px). */
  mgGeom() {
    const vp = document.getElementById('md-vp'), box = document.getElementById('md-stage-box'), st = document.getElementById('md-stage');
    if (!vp) return null;
    const v = vp.getBoundingClientRect(), has = !box.hidden && st.width > 0, b = has ? box.getBoundingClientRect() : null;
    return { vp, v, has, ox: has ? b.left - v.left : 0, oy: has ? b.top - v.top : 0, s: has ? b.width / st.width : 1, w: st.width, h: st.height };
  },
  mgHit(e) {
    const m = this.media; if (!m?.mg || !m.mg.guides.length) return null;
    const G = this.mgGeom(); if (!G?.has) return null;
    const x = e.clientX - G.v.left, y = e.clientY - G.v.top;
    let best = null, bd = MG_HIT;
    for (const g of m.mg.guides) { const d = g.axis === 'x' ? Math.abs(G.ox + g.pos * G.s - x) : Math.abs(G.oy + g.pos * G.s - y); if (d <= bd) { bd = d; best = g; } }
    return best;
  },
  /** Snap a source-px coordinate to guides, grid, edges and centre (within ~6 screen px). */
  mgSnap(axis, v, ignore) {
    const m = this.media, G = this.mgGeom(); if (!G) return v;
    const tol = 6 / G.s, size = axis === 'x' ? G.w : G.h, cands = [0, size / 2, size];
    for (const g of m.mg.guides) if (g.axis === axis && g !== ignore) cands.push(g.pos);
    if (m.mg.grid) cands.push(Math.round(v / m.mg.gridSize) * m.mg.gridSize);
    let best = v, bd = tol;
    for (const c of cands) { const d = Math.abs(c - v); if (d <= bd) { bd = d; best = c; } }
    return best;
  },
  mgStartDrag(e, g, isNew) {
    if (e.button !== 0) return;
    const m = this.media, G0 = this.mgGeom();
    if (!G0?.has) { Utils.toast('Open media first — rulers measure the frame in pixels', 'ℹ️'); return; }
    e.preventDefault();
    if (!m.mg.rulers) { m.mg.rulers = true; this.mgApply(); }
    if (isNew) m.mg.guides.push(g);
    m.mg.sel = g.id; this.mgDragging = g;
    const tag = document.createElement('div'); tag.className = 'mg-tag'; document.body.appendChild(tag);
    const mv = (ev) => {
      const G = this.mgGeom(), raw = g.axis === 'x' ? (ev.clientX - G.v.left - G.ox) / G.s : (ev.clientY - G.v.top - G.oy) / G.s;
      g.pos = Math.round(m.mg.snap && !ev.altKey ? this.mgSnap(g.axis, raw, g) : raw);
      g.off = g.axis === 'x' ? ev.clientX - G.v.left < MG_RULER && m.mg.rulers : ev.clientY - G.v.top < MG_RULER && m.mg.rulers;
      tag.textContent = g.off ? 'Remove' : `${g.axis === 'x' ? 'X' : 'Y'} ${g.pos} px`;
      tag.style.left = `${ev.clientX + 12}px`; tag.style.top = `${ev.clientY + 12}px`;
      this.mgDraw();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); tag.remove(); this.mgDragging = null;
      if (g.off || (isNew && g.pos === 0 && !g.moved)) { m.mg.guides = m.mg.guides.filter(x => x !== g); m.mg.sel = null; }
      delete g.off; this.mgDraw();
    };
    window.addEventListener('pointermove', (ev) => { g.moved = true; }, { once: true });
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    mv(e);
  },
  mgRemove(g) { const m = this.media; m.mg.guides = m.mg.guides.filter(x => x !== g); if (m.mg.sel === g.id) m.mg.sel = null; this.mgDraw(); Utils.toast('Guide removed', '✕'); },
  mgAddCenter() { const G = this.mgGeom(); if (!G?.has) return; this.media.mg.guides.push({ id: Utils.uid('mg'), axis: 'x', pos: Math.round(G.w / 2) }, { id: Utils.uid('mg'), axis: 'y', pos: Math.round(G.h / 2) }); this.mgDraw(); },
  mgMenu(anchor) {
    const g = this.media.mg, set = (k) => () => { g[k] = !g[k]; this.mgSave(); this.mgApply(); };
    this.t3Popup(anchor, [
      { head: 'Media view' },
      { label: 'Rulers', check: g.rulers, run: set('rulers') }, { label: 'Pixel grid', check: g.grid, run: set('grid') }, { label: 'Snap to guides / grid / edges', check: g.snap, run: set('snap') },
      { label: `Grid size: ${g.gridSize} px…`, run: async () => { const v = await this.promptText('Grid size', 'Pixels', String(g.gridSize)); const n = Math.round(Number(v)); if (n >= 2 && n <= 1024) { g.gridSize = n; this.mgSave(); this.mgDraw(); } } },
      '-', { label: 'Add centre guides', run: () => this.mgAddCenter() }, { label: 'Clear guides', disabled: !g.guides.length, run: () => { g.guides = []; g.sel = null; this.mgDraw(); } }
    ]);
  },
  // ------------------------------------------------------------------ top bar hooks
  mgZoom(f) {
    const m = this.media, G = this.mgGeom();
    const cur = typeof m.zoom === 'number' ? m.zoom : G?.has ? G.s : 1;
    if (f === 'fit') m.zoom = 'fit'; else m.zoom = Utils.clamp(Math.round(cur * f * 100) / 100, 0.1, 16);
    document.getElementById('md-stage-wrap').classList.toggle('actual', m.zoom !== 'fit');
    document.getElementById('md-zoom').textContent = m.zoom === 'fit' ? 'Fit' : `${Math.round(m.zoom * 100)}%`;
    this.mediaLayoutStage(); this.t3ZoomLabel?.();
  },
  mgToggleStrip() { const vis = document.querySelector('.md-playbar'), strip = document.getElementById('md-strip'); const hide = !strip.hidden; strip.hidden = hide; if (vis) vis.hidden = hide; this.mediaLayoutStage(); this.t3ZoomLabel?.(); },

  // ------------------------------------------------------------------ drawing
  mgDraw() {
    const m = this.media; if (!m?.mg) return;
    const G = this.mgGeom(); if (!G) return;
    const dpr = window.devicePixelRatio || 1, css = getComputedStyle(document.documentElement), col = (v, d) => css.getPropertyValue(v).trim() || d;
    const size = (cv, w, h) => { if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } cv.style.width = `${w}px`; cv.style.height = `${h}px`; const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); return c; };
    const W = G.v.width, H = G.v.height, ov = document.getElementById('mg-ov'), c = size(ov, W, H);
    // grid inside the frame
    if (G.has && m.mg.grid) {
      let step = m.mg.gridSize; while (step * G.s < 6) step *= 2;
      c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = 1; c.beginPath();
      for (let x = step; x < G.w; x += step) { const sx = Math.round(G.ox + x * G.s) + 0.5; c.moveTo(sx, G.oy); c.lineTo(sx, G.oy + G.h * G.s); }
      for (let y = step; y < G.h; y += step) { const sy = Math.round(G.oy + y * G.s) + 0.5; c.moveTo(G.ox, sy); c.lineTo(G.ox + G.w * G.s, sy); }
      c.stroke();
    }
    // guides
    if (G.has) for (const g of m.mg.guides) {
      c.strokeStyle = g.off ? 'rgba(242,53,122,.35)' : MG_COLOR; c.lineWidth = g.id === m.mg.sel ? 2 : 1; c.beginPath();
      if (g.axis === 'x') { const x = Math.round(G.ox + g.pos * G.s) + 0.5; c.moveTo(x, 0); c.lineTo(x, H); } else { const y = Math.round(G.oy + g.pos * G.s) + 0.5; c.moveTo(0, y); c.lineTo(W, y); }
      c.stroke();
    }
    if (!m.mg.rulers) return;
    // rulers
    const bg = col('--bg-header', '#2d2d30'), line = col('--border-color', '#3a3a3e'), sub = col('--text-sub', '#949494');
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    const major = steps.find(s => s * G.s >= 50) || 5000, minor = steps.filter(s => s < major && s * G.s >= 6).pop() || major;
    const ruler = (cv, horiz) => {
      const len = horiz ? W : H, ctx = size(cv, horiz ? W : MG_RULER, horiz ? MG_RULER : H);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, horiz ? len : MG_RULER, horiz ? MG_RULER : len);
      ctx.strokeStyle = line; ctx.beginPath(); if (horiz) { ctx.moveTo(0, MG_RULER - 0.5); ctx.lineTo(len, MG_RULER - 0.5); } else { ctx.moveTo(MG_RULER - 0.5, 0); ctx.lineTo(MG_RULER - 0.5, len); } ctx.stroke();
      if (!G.has) return;
      const o = horiz ? G.ox : G.oy, ext = horiz ? G.w : G.h;
      ctx.fillStyle = 'rgba(13,153,255,.18)'; if (horiz) ctx.fillRect(o, 0, ext * G.s, MG_RULER); else ctx.fillRect(0, o, MG_RULER, ext * G.s);
      ctx.font = '9px Inter, -apple-system, sans-serif'; ctx.fillStyle = sub; ctx.textBaseline = 'top';
      const v0 = Math.floor(-o / G.s / minor) * minor, v1 = (len - o) / G.s;
      for (let v = v0; v <= v1; v += minor) {
        const p = Math.round(o + v * G.s) + 0.5, isM = v % major === 0;
        ctx.strokeStyle = isM ? sub : line; ctx.beginPath();
        if (horiz) { ctx.moveTo(p, isM ? 8 : 14); ctx.lineTo(p, MG_RULER); } else { ctx.moveTo(isM ? 8 : 14, p); ctx.lineTo(MG_RULER, p); }
        ctx.stroke();
        if (isM) { if (horiz) ctx.fillText(String(v), p + 2, 1); else { ctx.save(); ctx.translate(1, p - 2); ctx.rotate(-Math.PI / 2); ctx.fillText(String(v), 0, 0); ctx.restore(); } }
      }
      for (const g of m.mg.guides) if ((g.axis === 'x') === horiz) { const p = o + g.pos * G.s; ctx.fillStyle = MG_COLOR; if (horiz) ctx.fillRect(p - 1, 12, 2, 8); else ctx.fillRect(12, p - 1, 8, 2); }
    };
    ruler(document.getElementById('mg-rx'), true);
    ruler(document.getElementById('mg-ry'), false);
  }
};
Object.assign(StudioApp.prototype, MediaGuidesMixin);
