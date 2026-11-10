/**
 * DesignStudio — Arrow presets & styles (v3.13.0).
 * Lines and arrows get a head on either end (triangle, stealth, chevron, dot, open circle, square, diamond,
 * open diamond, bar), dashed / dotted lines, a curve and a head size. Design panel › Arrow shows one-click presets
 * with live previews; with the Arrow tool active (Shift+L), picking a preset sets the style for new arrows.
 */
'use strict';

const ARROW_CAP_LABELS = { none: 'None', triangle: 'Triangle', stealth: 'Stealth', chevron: 'Chevron (open)', circle: 'Dot', circleOpen: 'Open circle', square: 'Square', diamond: 'Diamond', diamondOpen: 'Open diamond', bar: 'Bar' };
const ARROW_PRESETS = [
  ['Arrow', { arrowStart: 'none', arrowEnd: 'triangle' }],
  ['Double', { arrowStart: 'triangle', arrowEnd: 'triangle' }],
  ['Stealth', { arrowStart: 'none', arrowEnd: 'stealth' }],
  ['Chevron', { arrowStart: 'none', arrowEnd: 'chevron' }],
  ['Dot → arrow', { arrowStart: 'circle', arrowEnd: 'triangle' }],
  ['Connector', { arrowStart: 'circle', arrowEnd: 'circle' }],
  ['Open circle', { arrowStart: 'circleOpen', arrowEnd: 'stealth' }],
  ['Dashed flow', { arrowStart: 'none', arrowEnd: 'chevron', lineDash: 'dash' }],
  ['Dotted', { arrowStart: 'none', arrowEnd: 'triangle', lineDash: 'dot' }],
  ['Curved', { arrowStart: 'none', arrowEnd: 'triangle', lineBend: 40 }],
  ['Curved double', { arrowStart: 'stealth', arrowEnd: 'stealth', lineBend: -40 }],
  ['Swoosh', { arrowStart: 'circle', arrowEnd: 'stealth', lineBend: 60, arrowSize: 1.2 }],
  ['Dimension', { arrowStart: 'bar', arrowEnd: 'bar' }],
  ['Aggregation', { arrowStart: 'diamondOpen', arrowEnd: 'chevron' }],
  ['Composition', { arrowStart: 'diamond', arrowEnd: 'none' }],
  ['Bold', { arrowStart: 'none', arrowEnd: 'triangle', arrowSize: 1.8 }]
];
const ARROW_KEYS = ['arrowStart', 'arrowEnd', 'lineDash', 'lineBend', 'arrowSize'];
const ARROW_DEFAULTS_KEY = 'designstudio.arrowDefaults.v1';

const ArrowsMixin = {
  bindArrows() {
    try { this.arrowDefaults = JSON.parse(localStorage.getItem(ARROW_DEFAULTS_KEY) || 'null'); } catch (_) { this.arrowDefaults = null; }
    const design = document.getElementById('panel-tab-design');
    const transformSec = document.getElementById('inp-rotation').closest('.prop-section');
    const sec = document.createElement('div');
    sec.className = 'prop-section'; sec.id = 'sec-arrow';
    sec.innerHTML = `
      <div class="prop-section-header"><span id="arw-title">Arrow</span></div>
      <div class="arw-grid" id="arw-grid" role="listbox" aria-label="Arrow presets">${ARROW_PRESETS.map(([name, p], i) => `<button type="button" class="arw-p" role="option" data-p="${i}" title="${name}" aria-label="${name}">${this.arrowPreviewSVG(p)}<span>${name}</span></button>`).join('')}</div>
      <div class="arw-row"><label class="arw-f"><span>Start</span><select id="arw-start">${Object.entries(ARROW_CAP_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <button type="button" class="prop-icon-btn arw-swap" id="arw-swap" title="Swap start and end" aria-label="Swap start and end">⇄</button>
        <label class="arw-f"><span>End</span><select id="arw-end">${Object.entries(ARROW_CAP_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>
      <div class="arw-row"><span class="arw-lbl">Line</span><div class="arw-seg" role="radiogroup" aria-label="Line style">
        ${[['solid', 'Solid', 'M2 8h28'], ['dash', 'Dashed', 'M2 8h7M13 8h7M24 8h6'], ['dot', 'Dotted', 'M3 8h.01M9 8h.01M15 8h.01M21 8h.01M27 8h.01']].map(([k, l, d]) => `<button type="button" role="radio" data-dash="${k}" title="${l}" aria-label="${l}"><svg width="32" height="16" viewBox="0 0 32 16"><path d="${d}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></button>`).join('')}</div></div>
      <label class="arw-row"><span class="arw-lbl">Curve</span><input type="range" id="arw-bend" min="-100" max="100" step="5" aria-label="Curve"><output id="arw-bend-v">0</output></label>
      <label class="arw-row"><span class="arw-lbl">Head size</span><input type="range" id="arw-size" min="0.5" max="3" step="0.1" aria-label="Head size"><output id="arw-size-v">1×</output></label>
      <p class="muted-text arw-note" id="arw-note"></p>`;
    transformSec.after(sec);
    sec.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => this.arrowApply(ARROW_PRESETS[+b.dataset.p][1], `Arrow: ${ARROW_PRESETS[+b.dataset.p][0]}`, true)));
    sec.querySelector('#arw-start').addEventListener('change', (e) => this.arrowApply({ arrowStart: e.target.value }, 'Arrow start'));
    sec.querySelector('#arw-end').addEventListener('change', (e) => this.arrowApply({ arrowEnd: e.target.value }, 'Arrow end'));
    sec.querySelector('#arw-swap').addEventListener('click', () => {
      const t = this.arrowTargets()[0] || null, cur = t ? Geometry.capsOf(t) : { start: this.arrowDefaults?.arrowStart || 'none', end: this.arrowDefaults?.arrowEnd || 'triangle' };
      this.arrowApply({ arrowStart: cur.end, arrowEnd: cur.start, ...(t?.lineBend ? { lineBend: -t.lineBend } : {}) }, 'Swap arrow ends');
    });
    sec.querySelectorAll('[data-dash]').forEach(b => b.addEventListener('click', () => this.arrowApply({ lineDash: b.dataset.dash }, 'Line style')));
    const live = (id, key, fmt) => {
      const inp = sec.querySelector(id);
      inp.addEventListener('input', () => { sec.querySelector(`${id}-v`).textContent = fmt(inp.value); this.arrowApply({ [key]: +inp.value }, null, false, true); });
      inp.addEventListener('change', () => this.arrowApply({ [key]: +inp.value }, key === 'lineBend' ? 'Curve' : 'Head size'));
    };
    live('#arw-bend', 'lineBend', (v) => `${v}`);
    live('#arw-size', 'arrowSize', (v) => `${(+v).toFixed(1)}×`);
    // keep the section in sync with the selection / tool
    const orig = this.updatePropertiesUI.bind(this);
    this.updatePropertiesUI = (...a) => { const r = orig(...a); this.arrowSyncPanel(); return r; };
    const origTool = this.onToolChanged?.bind(this);
    this.onToolChanged = (tool) => { origTool?.(tool); design.classList.toggle('arrow-tool', tool === 'arrow'); if (tool === 'arrow' && this.activeRightTab !== 'design') document.querySelector('#right-panel .panel-tab-btn[data-tab="design"]')?.click(); this.arrowSyncPanel(); };
    // new arrows use the chosen style
    const origCreate = this.startCreate.bind(this);
    this.startCreate = (tool, p) => { origCreate(tool, p); if (tool === 'arrow' && this.creatingElem && this.arrowDefaults) Object.assign(this.creatingElem, this.arrowDefaults); };
  },
  arrowTargets() { return this.model.topSelected().filter(e => e.type === 'arrow' || e.type === 'line'); },
  /** Apply style props to the selected lines / arrows (or to the defaults for new arrows when the Arrow tool is active). */
  arrowApply(props, label, preset = false, liveOnly = false) {
    const els = this.arrowTargets();
    if (!els.length || this.model.activeTool === 'arrow') {
      const base = { arrowStart: 'none', arrowEnd: 'triangle', lineDash: 'solid', lineBend: 0, arrowSize: 1 };
      this.arrowDefaults = { ...base, ...(preset ? {} : this.arrowDefaults || {}), ...props };
      try { localStorage.setItem(ARROW_DEFAULTS_KEY, JSON.stringify(this.arrowDefaults)); } catch (_) { /* ignore */ }
      if (!els.length) { if (!liveOnly) Utils.toast(`New arrows: ${label?.replace(/^Arrow: /, '') || 'updated'}`, '↗'); this.arrowSyncPanel(); return; }
    }
    for (const el of els) {
      if (preset) Object.assign(el, { arrowStart: 'none', lineDash: 'solid', lineBend: 0, arrowSize: 1 });
      Object.assign(el, props);
      if (el.type === 'line' && (el.arrowEnd ?? 'none') !== 'none') el.type = 'arrow';
    }
    if (liveOnly) { this.requestRender(); return; }
    this._actionLabel = label || 'Arrow style';
    this.commit();
  },
  arrowSyncPanel() {
    const sec = document.getElementById('sec-arrow');
    if (!sec) return;
    const els = this.arrowTargets(), toolMode = this.model.activeTool === 'arrow';
    const all = els.length && els.length === this.model.topSelected().length;
    sec.style.display = all || toolMode ? '' : 'none';
    if (!(all || toolMode)) return;
    const src = all ? els[0] : (this.arrowDefaults || { arrowEnd: 'triangle', type: 'arrow' });
    const caps = Geometry.capsOf({ type: 'arrow', ...src });
    sec.querySelector('#arw-title').textContent = all ? (els.length > 1 ? `Arrow · ${els.length} selected` : 'Arrow') : 'Arrow style for new arrows';
    sec.querySelector('#arw-start').value = caps.start;
    sec.querySelector('#arw-end').value = caps.end;
    sec.querySelectorAll('[data-dash]').forEach(b => { const on = (src.lineDash || 'solid') === b.dataset.dash; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    sec.querySelector('#arw-bend').value = src.lineBend || 0; sec.querySelector('#arw-bend-v').textContent = `${src.lineBend || 0}`;
    sec.querySelector('#arw-size').value = src.arrowSize || 1; sec.querySelector('#arw-size-v').textContent = `${(+(src.arrowSize || 1)).toFixed(1)}×`;
    const cur = { arrowStart: caps.start, arrowEnd: caps.end, lineDash: src.lineDash || 'solid', lineBend: src.lineBend || 0, arrowSize: src.arrowSize || 1 };
    sec.querySelectorAll('[data-p]').forEach(b => {
      const p = { arrowStart: 'none', lineDash: 'solid', lineBend: 0, arrowSize: 1, ...ARROW_PRESETS[+b.dataset.p][1] };
      const on = ARROW_KEYS.every(k => p[k] === cur[k]);
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    sec.querySelector('#arw-note').textContent = toolMode && !all ? 'Drag on the canvas to draw. Shift snaps to 45°.' : 'Tip: select a line to give it heads too.';
  },
  // ------------------------------------------------------------------ v3.13.1 handles
  /** World position of the curve handle (middle of the line / curve). */
  lineBendHandle(el) {
    const cy = -((+el.lineBend || 0) / 100) * el.width * 0.5;
    const c = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    return Utils.rotatePoint(c.x, c.y + cy / 2, c.x, c.y, el.rotation || 0);
  },
  /** The end of a visible, unlocked line / arrow under the pointer (topmost first). */
  lineEndAt(p) {
    const m = this.model, tol = 10 / m.zoom;
    if (!['select', 'scale'].includes(m.activeTool) || this.spaceDown) return null;
    for (let i = m.elements.length - 1; i >= 0; i--) {
      const el = m.elements[i];
      if ((el.type !== 'line' && el.type !== 'arrow') || el.locked || !m.isEffectivelyVisible(el) || el.masterChildId) continue;
      const ends = this.lineEnds(el), k = ends.findIndex(q => Math.hypot(p.x - q.x, p.y - q.y) <= tol);
      if (k >= 0) return { el, idx: k };
    }
    return null;
  },
  grabLineEnd(p, e) {
    const hit = this.lineEndAt(p);
    if (!hit) return false;
    this.model.select([hit.el.id]); this.selectionChanged();
    this.startTransform({ kind: 'end', idx: hit.idx }, p, e);
    return true;
  },
  /** Snap a dragged line end to corners, edge middles and centres of other layers, and to other line ends. */
  snapLineEnd(line, x, y) {
    const m = this.model, z = m.zoom, th = 8 / z;
    const view = { x: -m.panX / z, y: -m.panY / z, w: this.renderer.cssW / z, h: this.renderer.cssH / z };
    let best = null;
    const test = (px, py, kind) => { const d = Math.hypot(px - x, py - y); if (d <= th && (!best || d < best.d)) best = { x: px, y: py, d, kind }; };
    for (const el of m.elements) {
      if (el.id === line.id || !el.visible || el.type === 'group' || !m.isEffectivelyVisible(el)) continue;
      if (el.type === 'line' || el.type === 'arrow') { for (const q of this.lineEnds(el)) test(q.x, q.y, 'end'); continue; }
      const b = Utils.aabb(el);
      if (!Utils.rectsIntersect(b, view)) continue;
      const xs = [b.x, b.x + b.w / 2, b.x + b.w], ys = [b.y, b.y + b.h / 2, b.y + b.h];
      for (const px of xs) for (const py of ys) test(px, py, 'point');
    }
    return best;
  },
  updateBend(el, p, e) {
    const c = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    const l = Utils.rotatePoint(p.x, p.y, c.x, c.y, -(el.rotation || 0));
    const ly = l.y - c.y; // handle sits at half the control height
    let bend = el.width ? -(2 * ly) / (el.width * 0.5) * 100 : 0;
    bend = Math.max(-100, Math.min(100, bend));
    if (e.shiftKey) bend = Math.round(bend / 10) * 10;
    if (Math.abs(bend) < 4) bend = 0; // easy to make straight again
    el.lineBend = Math.round(bend);
    if (el.type === 'line' && el.lineBend) { /* lines can curve too */ }
    this.showTransformTooltip(e.clientX, e.clientY, el.lineBend ? `Curve ${el.lineBend}` : 'Straight');
    this.changed();
  },
  /** Double-click a rectangle / ellipse / polygon / star: turn it into a vector and edit its points (as in Figma). */
  editShapePoints(el) {
    const w = el.width, h = el.height, k = 0.5523;
    let pts;
    if (el.type === 'rect') pts = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    else if (el.type === 'ellipse') {
      const cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2;
      pts = [
        { x: cx + rx, y: cy, cx1: cx + k * rx, cy1: cy - ry, cx2: cx + rx, cy2: cy - k * ry },
        { x: cx, y: cy + ry, cx1: cx + rx, cy1: cy + k * ry, cx2: cx + k * rx, cy2: cy + ry },
        { x: cx - rx, y: cy, cx1: cx - k * rx, cy1: cy + ry, cx2: cx - rx, cy2: cy + k * ry },
        { x: cx, y: cy - ry, cx1: cx - rx, cy1: cy - k * ry, cx2: cx - k * rx, cy2: cy - ry }
      ];
    } else pts = (el.type === 'polygon' ? Geometry.polygonPoints(el) : Geometry.starPoints(el)).map(q => ({ x: q.x + w / 2, y: q.y + h / 2 }));
    const lostRadius = el.type === 'rect' && el.cornerRadius > 0;
    const was = el.type;
    Object.assign(el, { type: 'path', points: pts, closedPath: true, svgPath: null, svgBox: null, cornerRadius: 0 });
    this.model.select([el.id]);
    this.setTool('directSelect');
    this._actionLabel = 'Edit points';
    this.commit(); this.selectionChanged();
    Utils.toast(`Editing points of “${el.name}” — drag the points; Esc when done${lostRadius ? ' (corner radius was flattened)' : ''}`, '✎', { action: { label: 'Undo', run: () => this.run('undo') } });
    void was;
  },
  arrowPreviewSVG(p) {
    const el = { type: 'arrow', width: 40, height: 0, arrowStart: 'none', ...p };
    const L = Geometry.lineSpec(el, 2);
    const dash = L.dash ? ` stroke-dasharray="${L.dash.join(' ')}"` : '';
    return `<svg width="52" height="28" viewBox="-26 -14 52 28" aria-hidden="true"><path d="${L.line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"${dash}/>${L.caps.map(c => `<path d="${c.d}" ${c.mode === 'fill' ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'}/>`).join('')}</svg>`;
  }
};
Object.assign(StudioApp.prototype, ArrowsMixin);
