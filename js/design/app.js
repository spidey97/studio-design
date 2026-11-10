/**
 * DesignStudio — application controller: tools, canvas interaction, selection,
 * transforms, commands, keyboard, clipboard, files & autosave.
 * UI panels, layers, timeline, prototype and export live in mixin files.
 */
'use strict';

const AUTOSAVE_KEY = 'designstudio.autosave.v3';
const PREVIOUS_KEY = 'designstudio.previous.v3';
const CLIPBOARD_KEY = 'designstudio.clipboard.v3';
const CLIP_MARKER = 'designstudio/clipboard';

const TOOL_HINTS = {
  select: 'V · Click to select, drag to move · Shift+click multi-select · Ctrl+click deep select · Alt+drag duplicates',
  directSelect: 'A · Selects deepest layer · Drag vector anchors to reshape paths',
  scale: 'K · Drag a handle to scale everything proportionally (strokes, text, effects)',
  hand: 'H · Drag to pan (or hold Space)',
  zoom: 'Z · Click to zoom in · Alt+click to zoom out',
  frame: 'F · Drag to draw a frame · Click for 100×100',
  rect: 'R · Drag to draw · Shift = square · Alt = from center',
  ellipse: 'O · Drag to draw · Shift = circle · Alt = from center',
  line: 'L · Drag to draw · Shift snaps to 45°',
  arrow: 'Shift+L · Drag to draw · Shift snaps to 45°',
  polygon: 'Drag to draw a polygon',
  star: 'Drag to draw a star',
  pen: 'P · Click = corner, drag = curve · Click first point to close · Enter/Esc to finish',
  pencil: 'Shift+P · Draw freehand',
  text: 'T · Click for auto-width text · Drag for a fixed-width box',
  eyedropper: 'I · Click to sample a color onto the selected fill',
  measure: 'M · Drag to measure distance · Hold Alt with a selection to see spacing'
};
const HANDLE_SIGNS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="white" stroke-width="3.5"/><path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="black" stroke-width="1.6"/><path d="M2 5l3 5 4-4z" fill="black" stroke="white"/></svg>')}") 12 12, crosshair`;

class StudioApp {
  constructor() {
    this.model = new StudioModel();
    this.canvas = document.getElementById('main-canvas');
    this.wrap = document.getElementById('canvas-wrap');
    this.titleInput = document.getElementById('project-title');
    this.renderer = new StudioRenderer(this.canvas, this.model, this);
    this.rulers = new StudioRulers(document.getElementById('ruler-x'), document.getElementById('ruler-y'), this.model);

    this.mode = 'none';
    this.isMouseDown = false;
    this.startStates = new Map();
    this.marquee = null; this.measure = null; this.distanceLines = [];
    this.penActivePath = null; this.penPreview = null; this.pencilPoints = null;
    this.dropTargetId = null; this.editingTextId = null; this.activeAnchor = null;
    this.spaceDown = false; this.altDown = false; this.shiftDown = false;
    this.collapsed = new Set();
    this.unsaved = false; this.autosaveFailed = false; this.fileHandle = null;
    this.needsRender = true;
    this.fpsFrames = 0; this.fpsLast = performance.now();

    this.scheduleAutosave = Utils.debounce(() => this.autosaveNow(), 700);
    this.nudgeCommit = Utils.debounce(() => this.commit(), 450);
    this.init();
  }

  // ===================================================================== Setup
  init() {
    this.bindToolButtons();
    this.bindCanvasPointer();
    this.bindKeyboard();
    this.bindClipboard();
    this.bindMenus();
    this.bindContextMenu();
    this.bindTopBar();
    this.bindImportAndDrop();
    this.bindWelcome();
    this.bindMinimap();
    this.bindPanels();       // panels.js
    this.bindColorPicker();  // panels.js
    this.bindLayers();       // layers.js
    this.bindTimeline();     // timeline.js
    this.bindAnimate();      // animate.js
    this.bindSections();     // sections.js
    this.bindPrototype();    // prototype.js
    this.bindExport();       // export-ui.js
    this.bindPolish?.();     // polish.js (v3.4.0 UX fixes)
    this.bindTriggers?.();   // triggers.js (v3.5.0)
    this.bindComponents?.(); // components.js (v3.6.0)
    this.bindProtoFlow?.(); // protoflow.js (v3.7.0)
    this.bindDesignSystem?.(); // designsystem.js (v3.8.0)
    this.bindAIStudio?.(); // ai-core.js + ai-ui.js (v3.9.0)
    this.bindAutosave?.(); // autosave.js (v3.10.0)
    this.bindA11y310?.(); // polish.js (v3.10.0 QC)
    this.bindGuides?.(); // guides.js (v3.11.0)
    this.bindFrames?.(); // frames.js (v3.11.0)
    this.bindMcpHost?.(); // mcp-host.js (v3.12.0)
    this.bindArrows?.(); // arrows.js (v3.13.0)
    this.bindUiShell?.(); // ui-shell.js (v3.15.0)
    this.bindCommentsSections?.(); // comments-sections.js (v3.16.2)
    this.bindLinks?.(); // links.js (v3.17.0)
    this.bindTouch?.(); // touch.js (v3.19.0)
    this.bindBrand?.(); // brand.js (v3.21.0)
    this.bindWorkspace?.(); // workspace.js (v3.23.0)
    this.bindDiagnostics?.(); // diagnostics.js (v3.31.0)
    this.bindSettings?.(); // settings.js (v3.32.0)
    this.bindPlugins?.(); // plugins.js (v3.33.0)
    this.bindStandalone?.(); // standalone.js (v3.33.0)
    this.bindGitHub?.(); // ai/github.js (v3.34.0)
    this.bindHandover?.(); // shell/handover.js (v3.35.0)

    window.addEventListener('beforeunload', (e) => {
      this.finishTextEdit();
      this.scheduleAutosave.flush();
      if (this.scheduleAutosave.pending()) this.autosaveNow();
      if (this.autosaveFailed && this.unsaved) { e.preventDefault(); e.returnValue = ''; }
    });

    const restored = this.restoreAutosave();
    if (!restored) {
      this.loadInitialDemo();
      this.showWelcome();
    }
    this.model.resetHistory();
    this.model.captureBaseline(this.model.allElements());
    this.applyViewState();
    this.refreshUI();
    this.setTool('select');
    this.restoreFromIndexedDB();

    const loop = (ts) => {
      this.tickTimeline(ts); // timeline.js
      this.tickPreview(ts);  // animate.js
      this.tick3D?.(ts);     // space3d.js
      if (this.needsRender) {
        this.needsRender = false;
        this.renderer.render();
        this.rulers.selRange = this.selectionBox() && Utils.aabb(Object.assign({ rotation: 0 }, this.boxToEl(this.selectionBox())));
        this.rulers.render();
        this.renderMinimap();
        this.fpsFrames++;
      }
      if (ts - this.fpsLast > 1000) {
        const fps = Math.round((this.fpsFrames * 1000) / (ts - this.fpsLast));
        document.getElementById('sb-fps').textContent = fps > 2 ? `${fps} FPS` : 'Idle';
        this.fpsFrames = 0; this.fpsLast = ts;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  requestRender() { this.needsRender = true; }
  get title() { return this.titleInput.value.trim() || 'Untitled'; }
  boxToEl(b) { return { x: b.x, y: b.y, width: b.w, height: b.h, rotation: b.rotation || 0 }; }

  loadInitialDemo() {
    const m = this.model;
    const frame = Object.assign(new StudioElement('frame', 120, 80, 840, 520), { name: 'Hero Artboard', cornerRadius: 16 });
    frame.fills[0].color = '#161626';
    const title = Object.assign(new StudioElement('text', 180, 150, 360, 84), { name: 'Heading Title', text: 'Design the future\nwith DesignStudio', fontSize: 34, fontWeight: 700, lineHeight: 42, textAutoResize: 'height' });
    const sub = Object.assign(new StudioElement('text', 180, 252, 330, 44), { name: 'Subtitle', text: 'Vector UI design, timeline animation, prototyping and developer handoff in one place.', fontSize: 14, lineHeight: 22, textAutoResize: 'height' });
    sub.fills[0].color = '#9999bb';
    const btn = Object.assign(new StudioElement('frame', 180, 324, 170, 48), { name: 'CTA Button', cornerRadius: 8, isAutoLayout: true, layoutAlign: 'center', layoutPaddingLeft: 24, layoutPaddingRight: 24, layoutPaddingTop: 14, layoutPaddingBottom: 14, primarySizing: 'hug', counterSizing: 'hug' });
    btn.fills[0].color = '#0d99ff';
    const btnText = Object.assign(new StudioElement('text', 0, 0, 100, 20), { name: 'Button Label', text: 'Get started free', fontSize: 14, fontWeight: 600, textAutoResize: 'width' });
    const card = Object.assign(new StudioElement('rect', 580, 140, 320, 400), { name: 'Interactive Card', cornerRadius: 14 });
    card.fills[0].color = '#222238';
    card.strokes = [{ color: '#383854', width: 1.5, align: 'inside', visible: true }];
    card.effects = [{ type: 'dropShadow', x: 0, y: 12, blur: 28, spread: 0, color: 'rgba(0,0,0,0.5)', visible: true }];
    const cardBadge = Object.assign(new StudioElement('ellipse', 612, 172, 56, 56), { name: 'Avatar' });
    cardBadge.fills[0] = { type: 'linear', color: '#0d99ff', opacity: 1, angle: 135, visible: true, stops: [{ pos: 0, color: '#0d99ff' }, { pos: 1, color: '#9747ff' }] };
    const cardTitle = Object.assign(new StudioElement('text', 612, 248, 250, 30), { name: 'Card Title', text: 'Motion-ready components', fontSize: 18, fontWeight: 600, textAutoResize: 'height' });
    const cardBody = Object.assign(new StudioElement('text', 612, 284, 256, 66), { name: 'Card Body', text: 'Animate any layer on the timeline and export to Lottie, CSS keyframes or video.', fontSize: 13, lineHeight: 20, textAutoResize: 'height' });
    cardBody.fills[0].color = '#8f8fae';
    m.elements.push(frame);
    for (const el of [title, sub, btn, card]) m.insertElement(el, frame.id);
    m.insertElement(btnText, btn.id);
    for (const el of [cardBadge, cardTitle, cardBody]) m.insertElement(el, frame.id);
    for (const el of m.elements) TextLayout.fit(el);
    m.computeAutoLayout();
    this.titleInput.value = 'Untitled Studio Project';
    this.zoomFit(false);
    this.pristineDemo = true;
  }
  /** Welcome-screen choices replace the untouched demo instead of piling on top of it. */
  discardPristineDemo() {
    if (!this.pristineDemo) return;
    this.pristineDemo = false;
    this.model.reset();
    this.model.resetHistory();
  }
  /** Top-left position for new content: to the right of everything already on the page. */
  freeSpot() {
    const roots = this.model.roots();
    if (!roots.length) return { x: 0, y: 0 };
    const b = this.renderer.boundsOf(roots);
    return { x: Math.round(b.x + b.w + 160), y: Math.round(b.y) };
  }

  // ===================================================================== Commit / refresh
  /** Finalise an edit: layout, groups, components, keyframes, history, autosave, UI. */
  commit({ silent = false } = {}) {
    const m = this.model;
    m.computeAutoLayout();
    m.updateGroupBounds();
    m.applyDesignSystem?.('pre');
    m.syncComponents();
    m.applyDesignSystem?.('post');
    m.computeAutoLayout();
    const autoKey = m.animationTimeline.isRecording ? new Set(m.topSelected().map(e => e.id)) : null;
    m.syncKeyframesFromEdits(autoKey);
    m.captureBaseline(m.allElements());
    if (this._batchDepth) { if (!silent) this.refreshUI(); this.requestRender(); return; } // v3.12.0: inside one AI change → a single undo step
    if (m.recordSnapshot(this._actionLabel || 'Edit')) { this.unsaved = true; this.pristineDemo = false; this.scheduleAutosave(); }
    this._actionLabel = null;
    if (!silent) this.refreshUI();
    this.requestRender();
  }
  /** Live (mid-drag) update: no history, light UI. */
  changed() {
    this.model.computeAutoLayout();
    this.model.updateGroupBounds();
    this.updateTransformInputs();
    this.requestRender();
  }
  refreshUI() {
    this.updateLayersTree();
    this.updatePropertiesUI();
    this.renderPagesList();
    this.refreshAssetsLater();
    this.renderTimeline();
    this.updateStatusBar();
    this.updateTopBarState();
  }
  selectionChanged() {
    this.model.pruneSelection();
    this.model.captureBaseline(this.model.getSelectedElements());
    this.updateLayersTree();
    this.updatePropertiesUI();
    this.renderTimeline();
    this.updateStatusBar();
    this.requestRender();
  }
  updateStatusBar() {
    const m = this.model;
    const sel = m.topSelected();
    const info = document.getElementById('sb-selection-info');
    if (!sel.length) info.textContent = 'No selection';
    else if (sel.length === 1) info.textContent = `${sel[0].name} (${Math.round(sel[0].width)} × ${Math.round(sel[0].height)})`;
    else info.textContent = `${sel.length} layers selected`;
    document.getElementById('sb-elem-count').textContent = `${m.elements.length} layers · ${m.page.name}`;
    document.getElementById('sb-grid-snap').textContent = `Grid: ${m.showGrid ? 'On' : 'Off'} | Snap: ${m.snapToGuides ? 'On' : 'Off'}`;
    document.getElementById('sb-zoom').textContent = `${Math.round(m.zoom * 100)}%`;
    document.getElementById('btn-zoom-level').textContent = `${Math.round(m.zoom * 100)}%`;
  }
  updateTopBarState() {
    const m = this.model;
    document.getElementById('btn-toggle-grid').classList.toggle('active', m.showGrid);
    document.getElementById('btn-toggle-snap').classList.toggle('active', m.snapToGuides);
    document.getElementById('btn-toggle-timeline').classList.toggle('active', this.timelineOpen());
  }
  applyViewState() {
    const m = this.model;
    const vp = document.getElementById('center-viewport');
    vp.classList.toggle('no-rulers', !m.showRulers);
    this.renderer.resize();
    this.updateStatusBar();
    this.updateTopBarState();
  }

  // ===================================================================== Tools
  bindToolButtons() {
    document.querySelectorAll('.tool-btn').forEach(btn => btn.addEventListener('click', () => this.setTool(btn.dataset.tool)));
  }
  setTool(tool) {
    if (this.penActivePath && tool !== 'pen') this.finishPen();
    if (tool !== 'measure') this.measure = null;
    this.model.activeTool = tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    document.getElementById('sb-hint').textContent = TOOL_HINTS[tool] || '';
    this.onToolChanged?.(tool); // frames.js (v3.11.0)
    this.updateCursor();
    this.requestRender();
  }
  updateCursor(override) {
    if (override) { this.canvas.style.cursor = override; return; }
    const t = this.model.activeTool;
    const map = { select: 'default', directSelect: 'default', scale: 'default', hand: 'grab', zoom: 'zoom-in', text: 'text', eyedropper: 'crosshair' };
    this.canvas.style.cursor = this.spaceDown ? 'grab' : (map[t] || 'crosshair');
  }

  // ===================================================================== Geometry helpers
  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy, ...this.renderer.screenToWorld(sx, sy) };
  }
  selectionBox() {
    const sel = this.model.topSelected();
    if (!sel.length) return null;
    if (sel.length === 1) { const e = sel[0]; return { x: e.x, y: e.y, w: e.width, h: e.height, rotation: e.rotation || 0 }; }
    const b = Utils.unionBounds(sel.map(e => Utils.aabb(e)));
    return { ...b, rotation: 0 };
  }
  isLineSel() { const s = this.model.topSelected(); return s.length === 1 && (s[0].type === 'line' || s[0].type === 'arrow'); }
  handlePositions(box) {
    if (this.isLineSel()) return [{ x: box.x, y: box.y + box.h / 2 }, { x: box.x + box.w, y: box.y + box.h / 2 }];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    return HANDLE_SIGNS.map(([hx, hy]) => ({ x: cx + (hx * box.w) / 2, y: cy + (hy * box.h) / 2 }));
  }
  hitHandle(p) {
    const box = this.selectionBox();
    if (!box || this.model.activeTool === 'directSelect') return null;
    const z = this.model.zoom;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const lp = Utils.rotatePoint(p.x, p.y, cx, cy, -box.rotation);
    const k = this._coarse ? 2.2 : 1; // v3.19.0: bigger handles for touch
    const hs = (6 * k) / z;
    if (this.isLineSel()) { // v3.13.1: 10-px round end handles and a curve handle in the middle
      const el = this.model.topSelected()[0], ends = this.lineEnds(el);
      const i = ends.findIndex(q => Math.hypot(p.x - q.x, p.y - q.y) <= (10 * k) / z);
      if (i >= 0) return { kind: 'end', idx: i };
      const b = this.lineBendHandle(el);
      if (Math.hypot(p.x - b.x, p.y - b.y) <= (7 * k) / z) return { kind: 'bend', idx: 0 };
      return null;
    }
    const hp = this.handlePositions({ ...box, rotation: 0 });
    for (let i = 0; i < hp.length; i++) {
      if (Math.abs(lp.x - hp[i].x) <= hs && Math.abs(lp.y - hp[i].y) <= hs) return { kind: this.isLineSel() ? 'end' : 'resize', idx: i };
    }
    if (this.model.activeTool === 'select' && !this.isLineSel()) {
      for (let i of [0, 2, 4, 6]) {
        const d = Math.hypot(lp.x - hp[i].x, lp.y - hp[i].y);
        const inside = lp.x > box.x && lp.x < box.x + box.w && lp.y > box.y && lp.y < box.y + box.h;
        if (d > hs && d < 20 / z && !inside) return { kind: 'rotate', idx: i };
      }
    }
    return null;
  }
  cursorForHandle(h, rotation) {
    if (!h) return null;
    if (h.kind === 'rotate') return ROTATE_CURSOR;
    if (h.kind === 'end') return 'crosshair';
    if (h.kind === 'bend') return 'move';
    const [hx, hy] = HANDLE_SIGNS[h.idx];
    const ang = ((Utils.radToDeg(Math.atan2(hy, hx)) + rotation) % 180 + 180) % 180;
    const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
    return cursors[Math.round(ang / 45) % 4];
  }

  /** Hit testing --------------------------------------------------------- */
  hitSelf(el, p) {
    const z = this.model.zoom;
    const l = Utils.toLocal(p.x, p.y, el);
    if (el.flipX) l.x = -l.x;
    if (el.flipY) l.y = -l.y;
    if (['text', 'image', 'frame', 'rect'].includes(el.type)) return Math.abs(l.x) <= el.width / 2 + 1 / z && Math.abs(l.y) <= el.height / 2 + 1 / z;
    const ctx = TextLayout.ctx();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const path = Geometry.path(el);
    ctx.lineWidth = Math.max(8 / z, ...(el.strokes || []).map(s => s.width + 4 / z));
    if (Geometry.isOpen(el)) return ctx.isPointInStroke(path, l.x, l.y);
    const fills = el.fills.filter(f => f.visible !== false);
    if (fills.length && ctx.isPointInPath(path, l.x, l.y, el.fillRule)) return true;
    return ctx.isPointInStroke(path, l.x, l.y) || (!fills.length && ctx.isPointInPath(path, l.x, l.y, el.fillRule));
  }
  hitTestDeep(p, tree = this.model.buildTree()) {
    const m = this.model;
    const visit = (el) => {
      if (!el.visible || el.locked) return null;
      const kids = tree.get(el.id) || [];
      if (kids.length) {
        const clip = el.type === 'frame' && el.clipContent !== false;
        if (!clip || Utils.pointInRotatedRect(p.x, p.y, el.x, el.y, el.width, el.height, el.rotation)) {
          for (let i = kids.length - 1; i >= 0; i--) { const r = visit(kids[i]); if (r) return r; }
        }
      }
      if (el.type === 'group') return null;
      return this.hitSelf(el, p) ? el : null;
    };
    const roots = tree.get(null) || [];
    for (let i = roots.length - 1; i >= 0; i--) { const r = visit(roots[i]); if (r) return r; }
    void m;
    return null;
  }
  hitFrameLabel(p) {
    const m = this.model, z = m.zoom;
    const ctx = TextLayout.ctx();
    ctx.font = `${11 / z}px Inter, -apple-system, sans-serif`;
    const roots = m.roots().filter(e => e.type === 'frame' && e.visible && !e.locked);
    for (let i = roots.length - 1; i >= 0; i--) {
      const f = roots[i];
      const w = ctx.measureText((f.isComponentMaster ? '◆ ' : '') + f.name).width;
      if (p.x >= f.x && p.x <= f.x + Math.max(w, 20 / z) && p.y >= f.y - 18 / z && p.y <= f.y) return f;
    }
    return null;
  }
  /** Figma-style: children of top-level frames select directly; groups select as a whole. */
  resolveTarget(deep, e) {
    if (!deep) return null;
    if (e && (e.ctrlKey || e.metaKey) || this.model.activeTool === 'directSelect') return deep;
    const m = this.model;
    const path = [...m.ancestorsOf(deep).reverse(), deep];
    for (const sel of m.getSelectedElements()) {
      const idx = path.findIndex(x => x.id === sel.parentId);
      if (sel.parentId && idx >= 0 && idx < path.length - 1) return path[idx + 1];
    }
    const root = path[0];
    if (root.type === 'frame' && path.length > 1) return path[1];
    if (root.type === 'frame' && path.length === 1 && m.childrenOf(root.id).length) return null;
    return root;
  }
  frameAt(p, excludeIds = new Set()) {
    const m = this.model;
    const tree = m.buildTree();
    let found = null;
    const visit = (el) => {
      if (!el.visible || excludeIds.has(el.id)) return;
      if (el.type === 'frame' && !el.locked && Utils.pointInRotatedRect(p.x, p.y, el.x, el.y, el.width, el.height, el.rotation)) {
        if (!(el.isComponentInstance)) found = el;
        for (const k of tree.get(el.id) || []) visit(k);
      } else if (el.type === 'group') for (const k of tree.get(el.id) || []) visit(k);
    };
    for (const r of tree.get(null) || []) visit(r);
    return found;
  }

  // ===================================================================== Pointer
  bindCanvasPointer() {
    const wrap = this.wrap;
    wrap.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    wrap.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    wrap.addEventListener('pointerleave', () => { if (!this.isMouseDown) { this.model.hoveredId = null; this.requestRender(); } });
    wrap.addEventListener('wheel', (e) => {
      if (e.target !== this.canvas) return;
      e.preventDefault();
      const m = this.model;
      if (e.ctrlKey || e.metaKey) {
        const p = this.pointer(e);
        this.zoomAt(m.zoom * Math.exp(-e.deltaY * 0.0022), p.sx, p.sy);
      } else {
        m.panX -= e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        m.panY -= e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        this.requestRender();
        this.scheduleViewSave();
      }
    }, { passive: false });
  }
  scheduleViewSave() { this.scheduleAutosave(); }

  onPointerDown(e) {
    if (e.target !== this.canvas) return;
    if (this.handlePreviewPointer(e, 'down')) return;
    this.closeMenus();
    this.closeColorPicker?.();
    if (this.editingTextId) this.finishTextEdit();
    const m = this.model, p = this.pointer(e), tool = m.activeTool;
    this.isMouseDown = true;
    this.downPoint = p; this.lastPoint = p; this.moved = false;
    this.measure = tool === 'measure' ? this.measure : null;
    if (e.button === 2) { this.isMouseDown = false; return; }
    try { this.wrap.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }

    if (e.button === 1 || this.spaceDown || tool === 'hand') {
      this.mode = 'pan'; this.updateCursor('grabbing'); return;
    }
    if (e.button !== 0) { this.isMouseDown = false; return; }

    if (tool === 'zoom') { this.zoomAt(m.zoom * (e.altKey ? 0.5 : 2), p.sx, p.sy); this.isMouseDown = false; return; }
    if (tool === 'eyedropper') { this.sampleColor(p); this.isMouseDown = false; return; }
    if (tool === 'pen') { this.penDown(p); return; }
    if (tool === 'pencil') { this.mode = 'pencil'; this.pencilPoints = [{ x: p.x, y: p.y }]; return; }
    if (tool === 'measure') { this.mode = 'measure'; this.measure = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, label: '' }; return; }
    if (tool === 'text') {
      const deep = this.hitTestDeep(p);
      if (deep && deep.type === 'text') { m.select([deep.id]); this.selectionChanged(); this.startTextEdit(deep); this.isMouseDown = false; return; }
    }
    if (SHAPE_TYPES.includes(tool)) { this.startCreate(tool, p); return; }

    // ---- select / scale / directSelect
    const handle = this.hitHandle(p);
    if (handle) { this.startTransform(handle, p, e); return; }
    if (['select', 'scale'].includes(tool) && !e.shiftKey && this.grabLineEnd?.(p, e)) return; // v3.13.1
    if (this.guidePointerDown?.(p, e)) return; // guides.js (v3.11.0)

    if (tool === 'directSelect') {
      const sel = m.topSelected();
      if (sel.length === 1 && sel[0].type === 'path' && !sel[0].svgPath) {
        const idx = this.hitAnchor(sel[0], p);
        if (idx >= 0) { this.mode = 'anchor'; this.activeAnchor = idx; this.anchorStart = JSON.parse(JSON.stringify(sel[0].points)); this.startStates = this.captureStates([sel[0]]); return; }
      }
    }

    let target = this.hitFrameLabel(p);
    const deep = target ? null : this.hitTestDeep(p);
    if (!target) target = this.resolveTarget(deep, e);
    // QA-14: a selected frame can be dragged (or Alt-dragged) from anywhere inside it, as in Figma
    if (!target && deep && !e.shiftKey) { const selFrame = m.getSelectedElements().find(sf => sf.id === deep.id || m.isAncestor(sf.id, deep)); if (selFrame) target = selFrame; }
    if (target) {
      const insideSelected = deep && m.getSelectedElements().some(s => s.id === deep.id || m.isAncestor(s.id, deep));
      if (e.shiftKey) {
        if (m.selectedIds.has(target.id)) { m.selectedIds.delete(target.id); this.selectionChanged(); this.mode = 'none'; return; }
        m.selectedIds.add(target.id);
      } else if (!m.selectedIds.has(target.id) && !insideSelected) {
        m.select([target.id]);
      }
      this.clickTarget = target;
      this.selectionChanged();
      this.mode = 'move-pending';
      this.altDuplicate = e.altKey;
      return;
    }
    // empty canvas → marquee
    if (!e.shiftKey && m.selectedIds.size) { m.select([]); this.selectionChanged(); }
    const rootFrame = deep && deep.type === 'frame' && !deep.parentId ? deep : null;
    this.marqueeContext = rootFrame ? rootFrame.id : null;
    this.marqueeBase = new Set(m.selectedIds);
    this.mode = 'marquee';
    this.marquee = { x: p.x, y: p.y, w: 0, h: 0 };
  }

  onPointerMove(e) {
    const m = this.model;
    if (this.previewing && !this.isMouseDown) { this.handlePreviewPointer(e, 'move'); return; }
    const r = this.canvas.getBoundingClientRect();
    const p = this.pointer(e);
    this.shiftDown = e.shiftKey;
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      document.getElementById('sb-coords').textContent = `X: ${Math.round(p.x)}  Y: ${Math.round(p.y)}`;
    }
    if (!this.isMouseDown) {
      if (e.target !== this.canvas) return;
      if (this.guideHover?.(p)) return; // guides.js (v3.11.0)
      this.updateHover(p, e);
      if (this.penActivePath) { this.penPreview = { x: p.x, y: p.y }; this.requestRender(); }
      return;
    }
    const dxS = p.sx - this.downPoint.sx, dyS = p.sy - this.downPoint.sy;
    if (Math.hypot(dxS, dyS) > 3) this.moved = true;

    switch (this.mode) {
      case 'pan':
        m.panX += p.sx - this.lastPoint.sx; m.panY += p.sy - this.lastPoint.sy;
        this.requestRender();
        break;
      case 'create': this.updateCreate(p, e); break;
      case 'move-pending':
        if (!this.moved) break;
        this.beginMove();
        this.mode = 'move';
        // fallthrough
      case 'move': this.updateMove(p, e); break;
      case 'resize': case 'end': case 'bend': this.updateResize(p, e); break;
      case 'rotate': this.updateRotate(p, e); break;
      case 'marquee': this.updateMarquee(p, e); break;
      case 'pen-drag': this.updatePenDrag(p); break;
      case 'anchor': this.updateAnchor(p); break;
      case 'measure': {
        const mm = this.measure;
        mm.x2 = p.x; mm.y2 = p.y;
        const dx = mm.x2 - mm.x1, dy = mm.y2 - mm.y1;
        mm.label = `${Math.round(Math.hypot(dx, dy))}  (Δx ${Math.round(dx)}, Δy ${Math.round(dy)})`;
        this.requestRender();
        break;
      }
      case 'pencil': {
        const last = this.pencilPoints[this.pencilPoints.length - 1];
        if (Math.hypot(p.x - last.x, p.y - last.y) > 1.5 / m.zoom) { this.pencilPoints.push({ x: p.x, y: p.y }); this.requestRender(); }
        break;
      }
      default: break;
    }
    this.lastPoint = p;
  }

  onPointerUp(e) {
    try { if (this.wrap.hasPointerCapture(e.pointerId)) this.wrap.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (this.previewing && e.target === this.canvas) { this.handlePreviewPointer(e, 'up'); return; }
    if (!this.isMouseDown) return;
    this.isMouseDown = false;
    const m = this.model;
    const mode = this.mode;
    this.mode = 'none';
    m.activeGuides = [];
    this.hideTransformTooltip();
    this._actionLabel = { create: `Draw ${m.activeTool || 'shape'}`, move: 'Move', resize: 'Resize', end: 'Edit line', bend: 'Curve line', rotate: 'Rotate', anchor: 'Edit points', pencil: 'Draw' }[mode] || this._actionLabel;
    switch (mode) {
      case 'pan': this.updateCursor(); this.scheduleViewSave(); break;
      case 'create': this.finishCreate(); break;
      case 'move-pending': {
        // plain click on an element inside a multi-selection selects just that one
        if (!e.shiftKey && this.clickTarget && m.selectedIds.size > 1) { m.select([this.clickTarget.id]); this.selectionChanged(); }
        break;
      }
      case 'move': this.finishMove(); break;
      case 'resize': case 'end': case 'bend': case 'rotate': case 'anchor':
        this.endSnap = null; this.hideTransformTooltip?.();
        if (mode === 'anchor') { this.normalizePathInPlace(m.topSelected()[0]); }
        this.startStates.clear();
        this.commit();
        break;
      case 'marquee': this.marquee = null; this.selectionChanged(); break;
      case 'pencil': this.finishPencil(); break;
      case 'pen-drag': this.requestRender(); break;
      default: break;
    }
    this.dropTargetId = null;
    this.requestRender();
  }

  onDoubleClick(e) {
    if (e.target !== this.canvas && e.target !== this.wrap) return;
    if (this.previewing) return;
    const m = this.model, p = this.pointer(e);
    if (this.penActivePath) { this.finishPen(); return; }
    if (m.activeTool !== 'select' && m.activeTool !== 'directSelect' && m.activeTool !== 'scale') return;
    const deep = this.hitTestDeep(p);
    if (!deep) return;
    if (deep.type === 'text' && (m.selectedIds.has(deep.id) || this.resolveTarget(deep, e)?.id === deep.id || m.getSelectedElements().some(s => m.isAncestor(s.id, deep)))) {
      m.select([deep.id]); this.selectionChanged(); this.startTextEdit(deep, true); return;
    }
    const sel = m.topSelected();
    if (sel.length === 1 && sel[0].isContainer && m.isAncestor(sel[0].id, deep)) {
      const path = [...m.ancestorsOf(deep).reverse(), deep];
      const idx = path.findIndex(x => x.id === sel[0].id);
      m.select([path[idx + 1].id]); this.selectionChanged(); return;
    }
    if (deep.type === 'path' && !deep.svgPath) { m.select([deep.id]); this.setTool('directSelect'); this.selectionChanged(); }
    else if (['rect', 'ellipse', 'polygon', 'star'].includes(deep.type) && !deep.isComponentInstance && !deep.masterChildId && (m.selectedIds.has(deep.id) || this.resolveTarget(deep, e)?.id === deep.id)) this.editShapePoints?.(deep); // v3.13.1
  }

  updateHover(p, e) {
    const m = this.model, tool = m.activeTool;
    let hov = null, cursor = null;
    if (['select', 'scale', 'directSelect'].includes(tool) && !this.spaceDown) {
      const h = this.hitHandle(p);
      if (h) cursor = this.cursorForHandle(h, this.selectionBox().rotation);
      const label = this.hitFrameLabel(p);
      hov = label || this.resolveTarget(this.hitTestDeep(p), e);
    }
    this.updateCursor(cursor || (this.lineEndAt?.(p) ? 'crosshair' : null)); // v3.13.1: ends of any line / arrow are grabbable
    const id = hov ? hov.id : null;
    if (id !== m.hoveredId) { m.hoveredId = id; this.requestRender(); }
    // Alt spacing overlay
    if (this.altDown && tool === 'select') this.computeDistanceLines(hov);
    else if (this.distanceLines.length) { this.distanceLines = []; this.requestRender(); }
  }

  /** Dark text on light backgrounds, light text on dark ones (first visible solid fill up the parent chain, else the page). */
  contrastTextColor(parent) {
    let bg = null;
    for (let p = parent; p && !bg; p = p.parentId ? this.model.getElementById(p.parentId) : null) {
      const f = (p.fills || []).filter(x => x.visible !== false && x.type === 'solid' && (x.opacity ?? 1) > 0.5).pop();
      if (f) bg = f.color;
    }
    const c = Utils.parseColor(bg || this.model.page?.bg || '#1a1a2e') || { r: 26, g: 26, b: 46 };
    const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    return lum > 0.55 ? '#111118' : '#ffffff';
  }
  // ===================================================================== Create
  startCreate(tool, p) {
    const m = this.model;
    const parent = this.frameAt(p);
    const el = new StudioElement(tool, p.x, p.y, 1, 1);
    if (tool === 'frame') { el.name = `Frame ${m.elements.filter(x => x.type === 'frame').length + 1}`; }
    if (tool === 'text') { el.text = ''; el.textAutoResize = 'width'; el.fontSize = 16; el.height = TextLayout.lineHeight(el); if (el.fills?.[0]) el.fills[0].color = this.contrastTextColor(parent); } // v3.22: never white-on-white
    if (tool === 'line' || tool === 'arrow') el.height = 0;
    m.insertElement(el, parent && !(parent.isAutoLayout && tool === 'frame' && false) ? parent.id : null);
    m.select([el.id]);
    this.creatingElem = el;
    this.mode = 'create';
    this.updateLayersTree();
    this.requestRender();
  }
  updateCreate(p, e) {
    const el = this.creatingElem, s = this.downPoint;
    if (!el) return;
    if (el.type === 'line' || el.type === 'arrow') {
      let dx = p.x - s.x, dy = p.y - s.y;
      if (e.shiftKey) { const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); dx = Math.cos(a) * len; dy = Math.sin(a) * len; }
      this.setLine(el, s.x, s.y, s.x + dx, s.y + dy);
    } else {
      let w = p.x - s.x, h = p.y - s.y;
      if (e.shiftKey) { const d = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * d; h = Math.sign(h || 1) * d; }
      if (e.altKey) { el.x = s.x - Math.abs(w); el.y = s.y - Math.abs(h); el.width = Math.abs(w) * 2; el.height = Math.abs(h) * 2; }
      else { el.x = w >= 0 ? s.x : s.x + w; el.y = h >= 0 ? s.y : s.y + h; el.width = Math.abs(w); el.height = Math.abs(h); }
      el.x = Math.round(el.x); el.y = Math.round(el.y); el.width = Math.max(1, Math.round(el.width)); el.height = Math.max(1, Math.round(el.height));
      if (el.type === 'text') el.textAutoResize = 'height';
    }
    this.showTransformTooltip(e.clientX, e.clientY, `${Math.round(el.width)} × ${Math.round(el.height)}`);
    this.changed();
  }
  setLine(el, x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    el.width = Math.max(1, len); el.height = 0;
    el.x = (x1 + x2) / 2 - el.width / 2; el.y = (y1 + y2) / 2;
    el.rotation = Utils.round(Utils.radToDeg(Math.atan2(y2 - y1, x2 - x1)), 3);
  }
  lineEnds(el) {
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    return [Utils.rotatePoint(el.x, cy, cx, cy, el.rotation), Utils.rotatePoint(el.x + el.width, cy, cx, cy, el.rotation)];
  }
  finishCreate() {
    const el = this.creatingElem;
    this.creatingElem = null;
    if (!el) return;
    if (!this.moved) {
      if (el.type === 'text') { el.textAutoResize = 'width'; }
      else if (el.type === 'line' || el.type === 'arrow') this.setLine(el, el.x, el.y, el.x + 100, el.y);
      else { el.width = 100; el.height = 100; el.x = Math.round(this.downPoint.x - 50); el.y = Math.round(this.downPoint.y - 50); }
    }
    if (el.type === 'text') {
      this.setTool('select');
      this.changed();
      this.startTextEdit(el, false, true);
      return;
    }
    this.setTool('select');
    this.commit();
  }

  // ===================================================================== Move
  captureStates(roots) {
    const map = new Map();
    const keys = ['x', 'y', 'width', 'height', 'rotation', 'points', 'fontSize', 'cornerRadius', 'strokes', 'effects', 'letterSpacing', 'lineHeight', 'textAutoResize', 'flipX', 'flipY'];
    for (const r of roots) {
      for (const el of [r, ...this.model.descendantsOf(r.id)]) {
        const o = {};
        for (const k of keys) o[k] = typeof el[k] === 'object' ? JSON.parse(JSON.stringify(el[k])) : el[k];
        map.set(el.id, o);
      }
    }
    return map;
  }
  movable() { return this.model.topSelected().filter(el => !this.model.isEffectivelyLocked(el)); }
  beginMove() {
    const m = this.model;
    if (this.altDuplicate) this.duplicateSelection(0, false);
    const sel = this.movable();
    this.startStates = this.captureStates(sel);
    this.moveStartBox = this.selectionBox();
    this.movingIds = new Set([...this.startStates.keys()]);
    void m;
  }
  translateSubtree(el, dx, dy, fromStates = this.startStates) {
    for (const node of [el, ...this.model.descendantsOf(el.id)]) {
      const st = fromStates.get(node.id);
      if (st) { node.x = st.x + dx; node.y = st.y + dy; } else { node.x += dx; node.y += dy; }
    }
  }
  updateMove(p, e) {
    const m = this.model;
    let dx = p.x - this.downPoint.x, dy = p.y - this.downPoint.y;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const snapped = this.snapMove(dx, dy);
    dx = Math.round(snapped.dx * 100) / 100; dy = Math.round(snapped.dy * 100) / 100;
    if (Math.abs(this.moveStartBox.x + dx - Math.round(this.moveStartBox.x + dx)) < 0.01) dx = Math.round(this.moveStartBox.x + dx) - this.moveStartBox.x;
    for (const el of this.movable()) this.translateSubtree(el, dx, dy);
    // drop target (reparent preview)
    const sel = this.movable();
    if (sel.length && !sel.some(s => m.parentOf(s)?.type === 'group')) {
      const b = this.selectionBox();
      const center = { x: p.x, y: p.y };
      const target = this.frameAt(center, this.movingIds);
      this.dropTargetId = target && target.id !== sel[0].parentId ? target.id : null;
    }
    const b = this.selectionBox();
    this.showTransformTooltip(e.clientX, e.clientY, `X ${Math.round(b.x)}  Y ${Math.round(b.y)}`);
    this.changed();
  }
  snapMove(dx, dy) {
    const m = this.model;
    m.activeGuides = [];
    if (!m.snapToGuides || !this.moveStartBox) return { dx, dy };
    const z = m.zoom, th = 6 / z;
    const sb = this.moveStartBox;
    const box = { x: sb.x + dx, y: sb.y + dy, w: sb.w, h: sb.h };
    const others = m.elements.filter(el => !this.movingIds.has(el.id) && el.visible && el.type !== 'group' && m.isEffectivelyVisible(el));
    const view = { x: -m.panX / z, y: -m.panY / z, w: this.renderer.cssW / z, h: this.renderer.cssH / z };
    const cands = others.map(o => Utils.aabb(o)).filter(b => Utils.rectsIntersect(b, view)).slice(0, 400);
    const xs = [box.x, box.x + box.w / 2, box.x + box.w], ys = [box.y, box.y + box.h / 2, box.y + box.h];
    let bestX = null, bestY = null;
    for (const c of cands) {
      for (const t of [c.x, c.x + c.w / 2, c.x + c.w]) for (const s of xs) { const d = t - s; if (Math.abs(d) < th && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, t, c }; }
      for (const t of [c.y, c.y + c.h / 2, c.y + c.h]) for (const s of ys) { const d = t - s; if (Math.abs(d) < th && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, t, c }; }
    }
    // v3.11.0: ruler guides win ties over layer edges
    for (const l of this.visibleGuideLines?.() || []) {
      if (l.from !== null && (box.y + box.h < l.from - th || box.y > l.to + th) && l.axis === 'x') continue;
      if (l.from !== null && (box.x + box.w < l.from - th || box.x > l.to + th) && l.axis === 'y') continue;
      if (l.axis === 'x') for (const s of xs) { const d = l.abs - s; if (Math.abs(d) < th && (!bestX || Math.abs(d) <= Math.abs(bestX.d))) bestX = { d, t: l.abs }; }
      else for (const s of ys) { const d = l.abs - s; if (Math.abs(d) < th && (!bestY || Math.abs(d) <= Math.abs(bestY.d))) bestY = { d, t: l.abs }; }
    }
    if (!bestX && m.showGrid) { const g = m.gridSize, t = Math.round(box.x / g) * g; if (Math.abs(t - box.x) < th) bestX = { d: t - box.x, t: null }; }
    if (!bestY && m.showGrid) { const g = m.gridSize, t = Math.round(box.y / g) * g; if (Math.abs(t - box.y) < th) bestY = { d: t - box.y, t: null }; }
    if (bestX) { dx += bestX.d; if (bestX.c) m.activeGuides.push({ type: 'v', pos: bestX.t, start: Math.min(box.y, bestX.c.y), end: Math.max(box.y + box.h, bestX.c.y + bestX.c.h) }); }
    if (bestY) { dy += bestY.d; if (bestY.c) m.activeGuides.push({ type: 'h', pos: bestY.t, start: Math.min(box.x + (bestX ? bestX.d : 0), bestY.c.x), end: Math.max(box.x + box.w + (bestX ? bestX.d : 0), bestY.c.x + bestY.c.w) }); }
    return { dx, dy };
  }
  finishMove() {
    const m = this.model;
    const sel = this.movable();
    if (this.dropTargetId !== undefined) {
      for (const el of sel) {
        if (m.parentOf(el)?.type === 'group') continue;
        const target = this.dropTargetId ? m.getElementById(this.dropTargetId) : null;
        let newParent = target ? target.id : el.parentId;
        if (!target && el.parentId) {
          const parent = m.parentOf(el);
          const b = Utils.aabb(el), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
          if (parent && parent.type === 'frame' && !Utils.pointInRotatedRect(cx, cy, parent.x, parent.y, parent.width, parent.height, parent.rotation)) {
            const outer = this.frameAt({ x: cx, y: cy }, new Set([...this.movingIds, parent.id, ...m.descendantsOf(parent.id).map(d => d.id)]));
            newParent = outer ? outer.id : null;
          }
        }
        if (newParent !== el.parentId) m.reparent(el, newParent);
      }
    }
    for (const el of sel) { const par = m.parentOf(el); if (par && par.isAutoLayout) this.reorderAutoLayout(par); }
    this.startStates.clear();
    this.movingIds = null;
    this.commit();
  }
  reorderAutoLayout(frame) {
    const m = this.model;
    const isH = frame.layoutDirection === 'horizontal';
    const kids = m.childrenOf(frame.id);
    const sorted = kids.slice().sort((a, b) => (isH ? a.x + a.width / 2 - (b.x + b.width / 2) : a.y + a.height / 2 - (b.y + b.height / 2)));
    const list = m.elements.slice();
    const slots = [];
    list.forEach((e, i) => { if (e.parentId === frame.id) slots.push(i); });
    slots.forEach((slot, i) => { list[slot] = sorted[i]; });
    m.elements = list;
  }

  // ===================================================================== Resize / rotate
  startTransform(handle, p, e) {
    const sel = this.movable();
    if (!sel.length) return;
    this.mode = handle.kind;
    this.activeHandle = handle;
    this.startStates = this.captureStates(sel);
    this.transformStartBox = this.selectionBox();
    this.rotateStartAngle = Math.atan2(p.y - (this.transformStartBox.y + this.transformStartBox.h / 2), p.x - (this.transformStartBox.x + this.transformStartBox.w / 2));
    if (handle.kind === 'end') this.lineStartEnds = this.lineEnds(sel[0]);
    void e;
  }
  updateResize(p, e) {
    const m = this.model;
    const sel = this.movable();
    if (!sel.length) return;
    if (this.mode === 'bend') { this.updateBend(sel[0], p, e); return; }
    if (this.mode === 'end') {
      const el = sel[0];
      const [a, b] = this.lineStartEnds;
      const fixed = this.activeHandle.idx === 0 ? b : a;
      let x = p.x, y = p.y;
      this.endSnap = null;
      if (!e.shiftKey && !e.altKey && m.snapToGuides) { const sp = this.snapLineEnd(el, x, y); if (sp) { x = sp.x; y = sp.y; this.endSnap = sp; } }
      if (e.shiftKey) { const ang = Math.round(Math.atan2(y - fixed.y, x - fixed.x) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(x - fixed.x, y - fixed.y); x = fixed.x + Math.cos(ang) * len; y = fixed.y + Math.sin(ang) * len; }
      if (this.activeHandle.idx === 0) this.setLine(el, x, y, b.x, b.y); else this.setLine(el, a.x, a.y, x, y);
      this.showTransformTooltip(e.clientX, e.clientY, `${Math.round(Math.hypot(x - fixed.x, y - fixed.y))} px · ${Math.round(((Utils.radToDeg(Math.atan2(y - fixed.y, x - fixed.x)) * -1) + 360) % 360)}°${this.endSnap ? ' · snapped' : ''}`);
      this.changed();
      return;
    }
    const sb = this.transformStartBox;
    const [hx, hy] = HANDLE_SIGNS[this.activeHandle.idx];
    if (!sb.rotation && !e.altKey && this.snapPointToGuides) p = this.snapPointToGuides(p, hx, hy); // v3.11.0 guides
    const scaleTool = m.activeTool === 'scale';
    const single = sel.length === 1 ? sel[0] : null;
    const keepAspect = e.shiftKey || scaleTool || (single && single.constrainProportions) || (sel.length > 1 && hx && hy && e.shiftKey);
    const c0 = { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 };
    const lp = Utils.rotatePoint(p.x, p.y, c0.x, c0.y, -sb.rotation);
    const lx = lp.x - c0.x, ly = lp.y - c0.y;
    const fx = (-hx * sb.w) / 2, fy = (-hy * sb.h) / 2;
    let nw = sb.w, nh = sb.h;
    if (e.altKey) { if (hx) nw = Math.abs(lx) * 2; if (hy) nh = Math.abs(ly) * 2; }
    else { if (hx) nw = (lx - fx) * hx; if (hy) nh = (ly - fy) * hy; }
    nw = Math.max(1, nw); nh = Math.max(1, nh);
    if (keepAspect && sb.w > 0 && sb.h > 0) {
      const ratio = sb.w / sb.h;
      if (hx && hy) { if (nw / sb.w > nh / sb.h) nh = nw / ratio; else nw = nh * ratio; }
      else if (hx) nh = nw / ratio; else nw = nh * ratio;
    }
    nw = Math.round(nw); nh = Math.round(nh);
    const ncx = e.altKey ? 0 : (hx ? fx + (hx * nw) / 2 : 0);
    const ncy = e.altKey ? 0 : (hy ? fy + (hy * nh) / 2 : 0);
    const wc = Utils.rotatePoint(c0.x + ncx, c0.y + ncy, c0.x, c0.y, sb.rotation);
    const nb = { x: wc.x - nw / 2, y: wc.y - nh / 2, w: nw, h: nh };
    if (single) {
      this.resizeElement(single, this.startStates.get(single.id), nb, scaleTool ? 'scale' : 'direct');
      if (single.type === 'text' && !scaleTool) {
        if (hx) single.textAutoResize = hy ? 'none' : 'height';
        else if (hy) single.textAutoResize = 'none';
        TextLayout.fit(single);
      }
    } else {
      const sx = nw / sb.w, sy = nh / sb.h;
      for (const el of sel) {
        const st = this.startStates.get(el.id);
        const kb = { x: nb.x + (st.x - sb.x) * sx, y: nb.y + (st.y - sb.y) * sy, w: st.width * sx, h: st.height * sy };
        this.resizeElement(el, st, kb, scaleTool ? 'scale' : 'proportional');
      }
    }
    this.showTransformTooltip(e.clientX, e.clientY, `${nw} × ${nh}`);
    this.changed();
  }
  /** Resize from a start state and propagate to children (constraints / proportional / scale). */
  resizeElement(el, st, nb, mode) {
    if (!st) st = { x: el.x, y: el.y, width: el.width, height: el.height, points: el.points, fontSize: el.fontSize, cornerRadius: el.cornerRadius, strokes: el.strokes, effects: el.effects, letterSpacing: el.letterSpacing, lineHeight: el.lineHeight };
    const sx = st.width ? nb.w / st.width : 1, sy = st.height ? nb.h / st.height : 1;
    el.x = nb.x; el.y = nb.y; el.width = Math.max(el.type === 'line' || el.type === 'arrow' ? 0 : 0.5, nb.w); el.height = Math.max(el.type === 'line' || el.type === 'arrow' ? 0 : 0.5, nb.h);
    if (el.type === 'path' && !el.svgPath && st.points) {
      el.points = st.points.map(pt => {
        const o = { x: pt.x * sx, y: pt.y * sy };
        if (pt.cx1 !== undefined) Object.assign(o, { cx1: pt.cx1 * sx, cy1: pt.cy1 * sy, cx2: pt.cx2 * sx, cy2: pt.cy2 * sy });
        return o;
      });
    }
    if (mode === 'scale') {
      const s = Math.sqrt(Math.abs(sx * sy));
      el.cornerRadius = st.cornerRadius * s;
      el.strokes = st.strokes.map(x => ({ ...x, width: x.width * s }));
      el.effects = st.effects.map(x => ({ ...x, x: x.x * s, y: x.y * s, blur: x.blur * s, spread: (x.spread || 0) * s }));
      if (el.type === 'text') { el.fontSize = st.fontSize * s; el.letterSpacing = st.letterSpacing * s; if (st.lineHeight) el.lineHeight = st.lineHeight * s; }
    } else if (mode === 'proportional' && el.type === 'text') {
      if (el.textAutoResize === 'width') el.textAutoResize = 'height';
    }
    const kids = this.model.childrenOf(el.id);
    for (const k of kids) {
      const ks = this.startStates.get(k.id) || { x: k.x, y: k.y, width: k.width, height: k.height, points: k.points, fontSize: k.fontSize, cornerRadius: k.cornerRadius, strokes: k.strokes, effects: k.effects, letterSpacing: k.letterSpacing, lineHeight: k.lineHeight };
      let kb, kmode;
      if (mode === 'scale' || mode === 'proportional' || el.type === 'group') {
        kb = { x: nb.x + (ks.x - st.x) * sx, y: nb.y + (ks.y - st.y) * sy, w: ks.width * sx, h: ks.height * sy };
        kmode = mode === 'scale' ? 'scale' : 'proportional';
      } else if (el.type === 'frame' && !el.isAutoLayout) {
        kb = this.constraintBox(k.constraints, ks, st, nb);
        kmode = 'constraint';
      } else {
        kb = { x: ks.x + (nb.x - st.x), y: ks.y + (nb.y - st.y), w: ks.width, h: ks.height };
        kmode = 'move';
      }
      this.resizeElement(k, ks, kb, kmode);
    }
  }
  constraintBox(c, ks, ob, nb) {
    const axis = (mode, pos, size, o0, os, n0, ns) => {
      switch (mode) {
        case 'right': case 'bottom': return [n0 + ns - (o0 + os - pos), size];
        case 'left-right': case 'top-bottom': return [n0 + (pos - o0), Math.max(1, size + (ns - os))];
        case 'center': return [n0 + (pos - o0) + (ns - os) / 2, size];
        case 'scale': return [n0 + (pos - o0) * (os ? ns / os : 1), size * (os ? ns / os : 1)];
        default: return [n0 + (pos - o0), size];
      }
    };
    const [x, w] = axis(c.horizontal, ks.x, ks.width, ob.x, ob.width, nb.x, nb.w);
    const [y, h] = axis(c.vertical, ks.y, ks.height, ob.y, ob.height, nb.y, nb.h);
    return { x, y, w, h };
  }
  updateRotate(p, e) {
    const sb = this.transformStartBox;
    const c = { x: sb.x + sb.w / 2, y: sb.y + sb.h / 2 };
    let delta = Utils.radToDeg(Math.atan2(p.y - c.y, p.x - c.x) - this.rotateStartAngle);
    const sel = this.movable();
    if (e.shiftKey) {
      const base = sel.length === 1 ? this.startStates.get(sel[0].id).rotation : 0;
      delta = Math.round((base + delta) / 15) * 15 - base;
    }
    for (const el of sel) this.rotateSubtree(el, delta, c);
    const r = sel.length === 1 ? sel[0].rotation : delta;
    this.showTransformTooltip(e.clientX, e.clientY, `${Math.round(r)}°`);
    this.changed();
  }
  rotateSubtree(el, delta, pivot, states = this.startStates) {
    for (const node of [el, ...this.model.descendantsOf(el.id)]) {
      const st = states.get(node.id) || node;
      if (node.type === 'group') continue;
      const c = Utils.rotatePoint(st.x + st.width / 2, st.y + st.height / 2, pivot.x, pivot.y, delta);
      node.x = c.x - st.width / 2; node.y = c.y - st.height / 2;
      let r = (st.rotation || 0) + delta;
      r = ((r + 180) % 360 + 360) % 360 - 180;
      node.rotation = Utils.round(r, 2);
    }
  }

  // ===================================================================== Marquee
  updateMarquee(p, e) {
    const m = this.model, s = this.downPoint;
    this.marquee = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    const cands = this.marqueeContext ? m.childrenOf(this.marqueeContext) : m.roots();
    const hit = cands.filter(el => el.visible && !el.locked && Utils.rectsIntersect(Utils.aabb(el), this.marquee));
    const ids = new Set(e.shiftKey ? this.marqueeBase : []);
    for (const el of hit) ids.add(el.id);
    m.selectedIds = ids;
    this.updateLayersTree();
    this.requestRender();
  }
  containsRect(a, b) { return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h; }

  // ===================================================================== Pen / pencil / anchors
  penDown(p) {
    const m = this.model;
    if (!this.penActivePath) {
      const parent = this.frameAt(p);
      const el = new StudioElement('path', p.x, p.y, 1, 1);
      el.name = `Vector ${m.elements.filter(x => x.type === 'path').length + 1}`;
      el.points = [{ x: 0, y: 0 }];
      el.closedPath = false;
      m.insertElement(el, parent ? parent.id : null);
      m.select([el.id]);
      this.penActivePath = el;
      this.penDragIndex = 0;
      this.mode = 'pen-drag';
      this.updateLayersTree();
      this.requestRender();
      return;
    }
    const el = this.penActivePath;
    const rx = p.x - el.x, ry = p.y - el.y;
    const first = el.points[0];
    if (el.points.length >= 2 && Math.hypot(rx - first.x, ry - first.y) < 8 / m.zoom) {
      const last = el.points[el.points.length - 1];
      if (last.ox !== undefined || first.ox !== undefined) {
        first.cx1 = last.ox !== undefined ? last.ox : last.x; first.cy1 = last.oy !== undefined ? last.oy : last.y;
        first.cx2 = first.ix !== undefined ? first.ix : first.x; first.cy2 = first.iy !== undefined ? first.iy : first.y;
      }
      el.closedPath = true;
      if (!el.fills.length) el.fills = [{ type: 'solid', color: '#0d99ff', opacity: 0.25, angle: 90, visible: true, stops: [{ pos: 0, color: '#0d99ff' }, { pos: 1, color: '#9747ff' }] }];
      this.isMouseDown = false;
      this.finishPen();
      return;
    }
    const prev = el.points[el.points.length - 1];
    const pt = { x: rx, y: ry };
    if (prev.ox !== undefined) { pt.cx1 = prev.ox; pt.cy1 = prev.oy; pt.cx2 = rx; pt.cy2 = ry; }
    el.points.push(pt);
    this.penDragIndex = el.points.length - 1;
    this.mode = 'pen-drag';
    this.requestRender();
  }
  updatePenDrag(p) {
    const el = this.penActivePath;
    if (!el || !this.moved) return;
    const pt = el.points[this.penDragIndex];
    const ox = p.x - el.x, oy = p.y - el.y;
    pt.ox = ox; pt.oy = oy;
    const ix = 2 * pt.x - ox, iy = 2 * pt.y - oy;
    pt.ix = ix; pt.iy = iy;
    if (this.penDragIndex > 0) {
      const prev = el.points[this.penDragIndex - 1];
      pt.cx1 = prev.ox !== undefined ? prev.ox : prev.x; pt.cy1 = prev.oy !== undefined ? prev.oy : prev.y;
      pt.cx2 = ix; pt.cy2 = iy;
    }
    this.requestRender();
  }
  finishPen() {
    const el = this.penActivePath;
    this.penActivePath = null; this.penPreview = null;
    if (!el) return;
    if (el.points.length < 2) { this.model.deleteElements([el.id]); this.selectionChanged(); this.requestRender(); return; }
    for (const p of el.points) { delete p.ox; delete p.oy; delete p.ix; delete p.iy; }
    Geometry.normalizePath(el);
    this.model.select([el.id]);
    if (this.model.activeTool === 'pen') this.setTool('select');
    this.commit();
  }
  finishPencil() {
    const pts = this.pencilPoints || [];
    this.pencilPoints = null;
    if (pts.length < 2) { this.requestRender(); return; }
    const simple = this.simplify(pts, 1.2 / this.model.zoom);
    const m = this.model;
    const el = new StudioElement('path', 0, 0, 1, 1);
    el.name = `Sketch ${m.elements.filter(x => x.type === 'path').length + 1}`;
    el.closedPath = false;
    el.points = [{ x: simple[0].x, y: simple[0].y }];
    for (let i = 1; i < simple.length; i++) {
      const p0 = simple[Math.max(0, i - 2)], p1 = simple[i - 1], p2 = simple[i], p3 = simple[Math.min(simple.length - 1, i + 1)];
      el.points.push({ x: p2.x, y: p2.y, cx1: p1.x + (p2.x - p0.x) / 6, cy1: p1.y + (p2.y - p0.y) / 6, cx2: p2.x - (p3.x - p1.x) / 6, cy2: p2.y - (p3.y - p1.y) / 6 });
    }
    Geometry.normalizePath(el);
    const parent = this.frameAt(pts[0]);
    m.insertElement(el, parent ? parent.id : null);
    m.select([el.id]);
    this.commit();
  }
  simplify(points, eps) {
    if (points.length < 3) return points;
    const dist = (p, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      const t = len ? Utils.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    };
    let maxD = 0, idx = 0;
    for (let i = 1; i < points.length - 1; i++) { const d = dist(points[i], points[0], points[points.length - 1]); if (d > maxD) { maxD = d; idx = i; } }
    if (maxD > eps) return [...this.simplify(points.slice(0, idx + 1), eps).slice(0, -1), ...this.simplify(points.slice(idx), eps)];
    return [points[0], points[points.length - 1]];
  }
  hitAnchor(el, p) {
    const l = Utils.toLocal(p.x, p.y, el);
    const lx = l.x + el.width / 2, ly = l.y + el.height / 2;
    const tol = 10 / this.model.zoom; // v3.13.1: easier to grab
    return el.points.findIndex(pt => Math.abs(pt.x - lx) <= tol && Math.abs(pt.y - ly) <= tol);
  }
  updateAnchor(p) {
    const el = this.model.topSelected()[0];
    if (!el) return;
    const l = Utils.toLocal(p.x, p.y, el);
    const lx = l.x + el.width / 2, ly = l.y + el.height / 2;
    const st = this.anchorStart[this.activeAnchor];
    const pt = el.points[this.activeAnchor];
    const dx = lx - st.x, dy = ly - st.y;
    pt.x = st.x + dx; pt.y = st.y + dy;
    if (st.cx2 !== undefined) { pt.cx2 = st.cx2 + dx; pt.cy2 = st.cy2 + dy; }
    const next = el.points[this.activeAnchor + 1] || (el.closedPath ? el.points[0] : null);
    const nst = next && this.anchorStart[(this.activeAnchor + 1) % el.points.length];
    if (next && nst && nst.cx1 !== undefined) { next.cx1 = nst.cx1 + dx; next.cy1 = nst.cy1 + dy; }
    this.requestRender();
  }
  normalizePathInPlace(el) {
    if (!el || el.type !== 'path' || el.svgPath || !el.points.length) return;
    const worldOf = (pt) => { const c = { x: el.x + el.width / 2, y: el.y + el.height / 2 }; return Utils.rotatePoint(el.x + pt.x, el.y + pt.y, c.x, c.y, el.rotation); };
    const before = worldOf(el.points[0]);
    Geometry.normalizePath(el);
    const after = worldOf(el.points[0]);
    el.x += before.x - after.x; el.y += before.y - after.y;
    this.activeAnchor = null;
  }

  // ===================================================================== Text editing
  startTextEdit(el, selectAll = false, isNew = false) {
    const ed = document.getElementById('text-inline-editor');
    this.editingTextId = el.id;
    this.editingIsNew = isNew;
    ed.value = el.text;
    const position = () => {
      const z = this.model.zoom;
      const s = this.renderer.worldToScreen(el.x, el.y);
      const lh = TextLayout.lineHeight(el);
      const fill = el.fills.find(f => f.visible !== false);
      Object.assign(ed.style, {
        display: 'block', left: `${s.x}px`, top: `${s.y}px`,
        width: `${Math.max(el.textAutoResize === 'width' ? 40 : 10, (el.width + 2) * z)}px`, height: `${Math.max(lh, el.height) * z}px`,
        font: `${el.fontWeight} ${el.fontSize * z}px ${el.fontFamily}`, lineHeight: `${lh * z}px`,
        letterSpacing: `${(el.letterSpacing || 0) * z}px`, textAlign: el.textAlign,
        color: fill ? Utils.rgba(fill.type === 'solid' ? fill.color : fill.stops[0].color) : '#fff',
        transform: el.rotation ? `rotate(${el.rotation}deg)` : 'none', transformOrigin: 'center center',
        whiteSpace: el.textAutoResize === 'width' ? 'pre' : 'pre-wrap', caretColor: '#3A8BFF'
      });
    };
    position();
    ed.oninput = () => { el.text = ed.value; TextLayout.fit(el); position(); this.changed(); };
    ed.onkeydown = (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ed.blur(); }
      e.stopPropagation();
    };
    ed.onblur = () => this.finishTextEdit();
    this.positionTextEditor = position;
    // focus now (keys typed right after the click must not trigger tool shortcuts), and again after layout
    const caret = () => { if (this.editingTextId !== el.id) return; ed.focus({ preventScroll: true }); if (selectAll) ed.select(); else ed.setSelectionRange(ed.value.length, ed.value.length); };
    caret();
    requestAnimationFrame(() => { if (document.activeElement !== ed) caret(); });
    this.requestRender();
  }
  finishTextEdit() {
    if (!this.editingTextId) return;
    const ed = document.getElementById('text-inline-editor');
    const el = this.model.getElementById(this.editingTextId);
    this.editingTextId = null;
    this.positionTextEditor = null;
    ed.onblur = null; ed.oninput = null;
    ed.style.display = 'none';
    if (el) {
      el.text = ed.value;
      if (!el.text.trim()) { this.model.deleteElements([el.id]); }
      else { if (el.isComponentInstance && !el.overrides.includes('text')) el.overrides.push('text'); TextLayout.fit(el); if (this.editingIsNew) el.name = el.text.split('\n')[0].slice(0, 40); }
    }
    this.commit();
  }

  // ===================================================================== Misc canvas helpers
  showTransformTooltip(cx, cy, text) {
    const tip = document.getElementById('transform-tooltip');
    const r = this.wrap.getBoundingClientRect();
    tip.style.left = `${cx - r.left + 14}px`; tip.style.top = `${cy - r.top + 16}px`;
    tip.textContent = text; tip.style.display = 'block';
  }
  hideTransformTooltip() { document.getElementById('transform-tooltip').style.display = 'none'; }

  sampleColor(p) {
    const dpr = window.devicePixelRatio || 1;
    const px = this.renderer.ctx.getImageData(Math.round(p.sx * dpr), Math.round(p.sy * dpr), 1, 1).data;
    const hex = Utils.rgbToHex(px[0], px[1], px[2]);
    if (this.eyedropperCallback) { const cb = this.eyedropperCallback; this.eyedropperCallback = null; cb(hex); this.setTool(this.toolBeforeEyedropper || 'select'); return; }
    const sel = this.model.getSelectedElements();
    for (const el of sel) { if (el.fills[0]) el.fills[0].color = hex; else el.fills.push({ type: 'solid', color: hex, opacity: 1, angle: 90, visible: true, stops: [{ pos: 0, color: hex }, { pos: 1, color: '#000000' }] }); }
    Utils.toast(sel.length ? `Applied ${hex.toUpperCase()} to selection` : `Sampled ${hex.toUpperCase()} (select a layer to apply it)`, '🎨');
    if (sel.length) this.commit();
    this.setTool('select');
  }

  computeDistanceLines(hov) {
    const m = this.model;
    const sel = m.topSelected();
    this.distanceLines = [];
    if (!sel.length) { this.requestRender(); return; }
    const s = Utils.unionBounds(sel.map(e => Utils.aabb(e)));
    let target = hov && !m.selectedIds.has(hov.id) ? hov : m.parentOf(sel[0]);
    if (!target) { this.requestRender(); return; }
    const t = Utils.aabb(target);
    const L = this.distanceLines, r = (n) => Math.round(n);
    const cy = s.y + s.h / 2, cx = s.x + s.w / 2;
    if (this.containsRect(t, s)) {
      L.push({ x1: t.x, y1: cy, x2: s.x, y2: cy, label: String(r(s.x - t.x)) });
      L.push({ x1: s.x + s.w, y1: cy, x2: t.x + t.w, y2: cy, label: String(r(t.x + t.w - s.x - s.w)) });
      L.push({ x1: cx, y1: t.y, x2: cx, y2: s.y, label: String(r(s.y - t.y)) });
      L.push({ x1: cx, y1: s.y + s.h, x2: cx, y2: t.y + t.h, label: String(r(t.y + t.h - s.y - s.h)) });
    } else {
      if (t.x >= s.x + s.w) L.push({ x1: s.x + s.w, y1: cy, x2: t.x, y2: cy, label: String(r(t.x - s.x - s.w)) });
      else if (t.x + t.w <= s.x) L.push({ x1: t.x + t.w, y1: cy, x2: s.x, y2: cy, label: String(r(s.x - t.x - t.w)) });
      if (t.y >= s.y + s.h) L.push({ x1: cx, y1: s.y + s.h, x2: cx, y2: t.y, label: String(r(t.y - s.y - s.h)) });
      else if (t.y + t.h <= s.y) L.push({ x1: cx, y1: t.y + t.h, x2: cx, y2: s.y, label: String(r(s.y - t.y - t.h)) });
    }
    this.requestRender();
  }

  // ===================================================================== Zoom
  zoomAt(z, sx = this.renderer.cssW / 2, sy = this.renderer.cssH / 2) {
    const m = this.model;
    const nz = Utils.clamp(z, 0.02, 64);
    m.panX = sx - (sx - m.panX) * (nz / m.zoom);
    m.panY = sy - (sy - m.panY) * (nz / m.zoom);
    m.zoom = nz;
    this.updateStatusBar();
    this.positionTextEditor?.();
    this.requestRender();
    this.scheduleViewSave();
  }
  zoomToBounds(b, pad = 60, maxZoom = 1) {
    const m = this.model;
    const W = this.renderer.cssW, H = this.renderer.cssH;
    if (!b || W < 10) { m.zoom = 1; m.panX = 80; m.panY = 80; return; }
    const z = Utils.clamp(Math.min((W - pad * 2) / Math.max(1, b.w), (H - pad * 2) / Math.max(1, b.h), maxZoom), 0.02, 64);
    m.zoom = z;
    m.panX = W / 2 - (b.x + b.w / 2) * z;
    m.panY = H / 2 - (b.y + b.h / 2) * z;
    this.updateStatusBar();
    this.requestRender();
  }
  zoomFit(save = true) {
    const roots = this.model.roots().filter(e => e.visible);
    this.zoomToBounds(roots.length ? this.renderer.boundsOf(roots) : null, 60, 1);
    if (save) this.scheduleViewSave();
  }
  zoomSelection() {
    const sel = this.model.topSelected();
    if (!sel.length) return this.zoomFit();
    this.zoomToBounds(this.renderer.boundsOf(sel), 80, 4);
    this.scheduleViewSave();
  }

  // ===================================================================== Commands
  get commands() {
    if (this._commands) return this._commands;
    const m = this.model;
    const hasSel = () => m.selectedIds.size > 0;
    const sel = () => m.topSelected();
    const c = {
      new: { run: () => this.newProject() },
      open: { run: () => this.openProject() },
      save: { run: () => this.saveProject(false) },
      saveAs: { run: () => this.saveProject(true) },
      export: { run: () => this.openExportModal() },
      openExport: { run: () => this.openExportModal() },
      reset: { run: () => this.clearCanvas(), enabled: () => m.elements.length > 0 },
      undo: { run: () => this.undo(), enabled: () => m.canUndo() },
      redo: { run: () => this.redo(), enabled: () => m.canRedo() },
      cut: { run: () => this.cut(), enabled: hasSel },
      copy: { run: () => this.copy(), enabled: hasSel },
      paste: { run: () => this.pasteInternal(), enabled: () => !!this.readInternalClipboard() },
      duplicate: { run: () => this.duplicateSelection(), enabled: hasSel },
      delete: { run: () => this.deleteSelection(), enabled: hasSel },
      selectAll: { run: () => this.selectAll() },
      zoomIn: { run: () => this.zoomAt(m.zoom * 1.25) },
      zoomOut: { run: () => this.zoomAt(m.zoom / 1.25) },
      zoomReset: { run: () => this.zoomAt(1) },
      zoomFit: { run: () => this.zoomFit() },
      zoomSelection: { run: () => this.zoomSelection() },
      toggleRulers: { run: () => { m.showRulers = !m.showRulers; this.applyViewState(); this.scheduleViewSave(); } },
      toggleGrid: { run: () => { m.showGrid = !m.showGrid; this.applyViewState(); this.requestRender(); this.scheduleViewSave(); } },
      toggleSnap: { run: () => { m.snapToGuides = !m.snapToGuides; this.applyViewState(); this.scheduleViewSave(); Utils.toast(`Smart snapping ${m.snapToGuides ? 'on' : 'off'}`); } },
      group: { run: () => this.groupSelection('group'), enabled: hasSel },
      frame: { run: () => this.groupSelection('frame'), enabled: hasSel },
      ungroup: { run: () => this.ungroupSelection(), enabled: () => sel().some(e => e.isContainer) },
      autoLayout: { run: () => this.toggleAutoLayout(), enabled: hasSel },
      createComp: { run: () => this.createComponent(), enabled: hasSel },
      detachComp: { run: () => this.detachInstance(), enabled: () => sel().some(e => e.isComponentInstance) },
      front: { run: () => this.reorder('front'), enabled: hasSel },
      forward: { run: () => this.reorder('forward'), enabled: hasSel },
      backward: { run: () => this.reorder('backward'), enabled: hasSel },
      back: { run: () => this.reorder('back'), enabled: hasSel },
      flipH: { run: () => this.flipSelection('x'), enabled: hasSel },
      flipV: { run: () => this.flipSelection('y'), enabled: hasSel },
      toggleLock: { run: () => this.toggleProp('locked'), enabled: hasSel },
      toggleVis: { run: () => this.toggleProp('visible'), enabled: hasSel },
      copyCSS: { run: () => this.copyAsCSS(), enabled: hasSel },
      copySVG: { run: () => this.copyAsSVG(), enabled: hasSel },
      toggleTimeline: { run: () => this.toggleTimeline() },
      playProto: { run: () => this.openPrototype() },
      about: { run: () => this.showAbout() },
      animateMode: { run: () => this.setUiMode(this.uiMode === 'animate' ? 'design' : 'animate') }
    };
    this._commands = c;
    return c;
  }
  run(action) {
    const cmd = this.commands[action];
    if (!cmd) { console.warn('Unknown command', action); return; }
    if (cmd.enabled && !cmd.enabled()) return;
    this._actionLabel = (typeof ACTION_LABELS !== 'undefined' && ACTION_LABELS[action]) || this._actionLabel;
    cmd.run();
  }
  undo() {
    this.finishTextEdit();
    const label = this.model.undoLabel();
    if (!this.model.undo()) return;
    this.afterHistoryJump('Undo');
    this.historyFeedback?.('Undo', label, 'Design');
  }
  redo() {
    this.finishTextEdit();
    const label = this.model.redoLabel();
    if (!this.model.redo()) return;
    this.afterHistoryJump('Redo');
    this.historyFeedback?.('Redo', label, 'Design');
  }
  afterHistoryJump() {
    const m = this.model;
    m.applyTime(m.animationTimeline.currentTime);
    m.captureBaseline(m.allElements());
    this.unsaved = true;
    this.scheduleAutosave();
    this.refreshUI();
    this.requestRender();
  }

  selectAll() {
    const m = this.model;
    const first = m.getSelectedElements()[0];
    const scope = first && first.parentId ? m.childrenOf(first.parentId) : m.roots();
    m.select(scope.filter(e => e.visible && !e.locked).map(e => e.id));
    this.selectionChanged();
  }
  deleteSelection() {
    const m = this.model;
    const ids = m.topSelected().filter(e => !m.isEffectivelyLocked(e)).map(e => e.id);
    if (!ids.length) return;
    m.deleteElements(ids);
    m.removeEmptyGroups();
    m.select([]);
    this.commit();
  }
  /** Clone subtrees with fresh ids; returns new roots (already inserted after their originals). */
  cloneSubtrees(roots, offset = 0, insert = true) {
    const m = this.model;
    const created = [];
    for (const root of roots) {
      const nodes = [root, ...m.descendantsOf(root.id)];
      const idMap = new Map(nodes.map(n => [n.id, Utils.uid('el')]));
      const copies = nodes.map(n => {
        const c = StudioElement.fromJSON(JSON.parse(JSON.stringify(n)));
        c.id = idMap.get(n.id);
        c.parentId = n === root ? root.parentId : idMap.get(n.parentId) || null;
        c.x += offset; c.y += offset;
        if (n.isComponentMaster) { c.isComponentMaster = false; c.isComponentInstance = n === root; c.masterComponentId = n === root ? n.id : null; c.masterChildId = n === root ? null : n.id; if (n === root) { c.componentProps = []; c.propValues = null; c.description = ''; } }
        else if (root.isComponentMaster && n !== root) c.masterChildId = n.id;
        for (const anim of m.animations) {
          if (!anim.tracks[n.id]) continue;
          anim.tracks[c.id] = JSON.parse(JSON.stringify(anim.tracks[n.id]));
          for (const p of ['x', 'y']) if (anim.tracks[c.id][p]) anim.tracks[c.id][p].forEach(k => { k.value += offset; });
        }
        return c;
      });
      if (insert) {
        const list = m.elements;
        const ids = new Set(nodes.map(n => n.id));
        let last = -1;
        list.forEach((e, i) => { if (ids.has(e.id)) last = i; });
        list.splice(last + 1, 0, ...copies);
      }
      if (root.name && !/ copy$/i.test(root.name) && offset) copies[0].name = root.name;
      created.push(copies[0]);
    }
    return created;
  }
  duplicateSelection(offset = 20, commit = true) {
    const m = this.model;
    const sel = m.topSelected();
    if (!sel.length) return;
    // QA-16: duplicating variants inside a variant set adds new variants to the set (Figma)
    if (commit && this.componentSetOf && sel.every(e => e.isComponentMaster && this.componentSetOf(e))) {
      const made = sel.map(v => this.addVariant(this.componentSetOf(v), v)).filter(Boolean);
      return made;
    }
    const copies = this.cloneSubtrees(sel, offset);
    m.select(copies.map(c => c.id));
    if (commit) { this.commit(); Utils.toast(`Duplicated ${copies.length} layer${copies.length > 1 ? 's' : ''}`); }
  }
  groupSelection(kind) {
    const m = this.model;
    const sel = m.topSelected();
    if (!sel.length) return;
    const parentId = sel.every(e => e.parentId === sel[0].parentId) ? sel[0].parentId : null;
    const b = Utils.unionBounds(sel.map(e => Utils.aabb(e)));
    const g = new StudioElement(kind, b.x, b.y, b.w, b.h);
    g.name = kind === 'group' ? `Group ${m.elements.filter(e => e.type === 'group').length + 1}` : `Frame ${m.elements.filter(e => e.type === 'frame').length + 1}`;
    if (kind === 'frame') { g.fills = []; g.clipContent = false; }
    g.parentId = parentId;
    const firstIdx = Math.min(...sel.map(e => m.elements.indexOf(e)));
    m.elements.splice(firstIdx, 0, g);
    for (const el of sel) el.parentId = g.id;
    m.select([g.id]);
    this.commit();
    Utils.toast(kind === 'group' ? 'Grouped selection' : 'Framed selection');
  }
  ungroupSelection() {
    const m = this.model;
    const conts = m.topSelected().filter(e => e.isContainer);
    if (!conts.length) return;
    const freed = [];
    for (const c of conts) {
      const kids = m.childrenOf(c.id);
      for (const k of kids) { k.parentId = c.parentId; freed.push(k.id); }
      m.elements = m.elements.filter(e => e.id !== c.id);
      for (const anim of m.animations) delete anim.tracks[c.id];
    }
    m.select(freed);
    this.commit();
    Utils.toast('Ungrouped');
  }
  toggleAutoLayout() {
    const m = this.model;
    const sel = m.topSelected();
    if (!sel.length) return;
    if (sel.length === 1 && sel[0].type === 'frame') {
      const f = sel[0];
      f.isAutoLayout = !f.isAutoLayout;
      if (f.isAutoLayout) this.inferAutoLayout(f, m.childrenOf(f.id));
      this.commit();
      Utils.toast(`Auto layout ${f.isAutoLayout ? 'on' : 'off'}`);
      return;
    }
    const kids = sel;
    const b = Utils.unionBounds(kids.map(e => Utils.aabb(e)));
    const f = new StudioElement('frame', b.x, b.y, b.w, b.h);
    f.name = 'Auto Layout';
    f.fills = [];
    f.parentId = kids.every(k => k.parentId === kids[0].parentId) ? kids[0].parentId : null;
    m.elements.splice(Math.min(...kids.map(k => m.elements.indexOf(k))), 0, f);
    for (const k of kids) k.parentId = f.id;
    f.isAutoLayout = true;
    this.inferAutoLayout(f, kids);
    f.layoutPaddingTop = f.layoutPaddingRight = f.layoutPaddingBottom = f.layoutPaddingLeft = 0;
    f.primarySizing = 'hug'; f.counterSizing = 'hug';
    m.select([f.id]);
    this.commit();
    Utils.toast('Wrapped selection in auto layout');
  }
  inferAutoLayout(f, kids) {
    if (!kids.length) return;
    const xs = kids.map(k => k.x), ys = kids.map(k => k.y);
    const spreadX = Math.max(...xs) - Math.min(...xs), spreadY = Math.max(...ys) - Math.min(...ys);
    f.layoutDirection = spreadX >= spreadY ? 'horizontal' : 'vertical';
    const isH = f.layoutDirection === 'horizontal';
    const sorted = kids.slice().sort((a, b) => (isH ? a.x - b.x : a.y - b.y));
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(isH ? sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width) : sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height));
    f.layoutGap = gaps.length ? Math.max(0, Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)) : 12;
    // keep visual order
    const m = this.model;
    const list = m.elements.slice();
    const slots = [];
    list.forEach((e, i) => { if (e.parentId === f.id) slots.push(i); });
    slots.forEach((s, i) => { list[s] = sorted[i]; });
    m.elements = list;
  }
  createComponent() {
    const m = this.model;
    let sel = m.topSelected();
    if (!sel.length) return;
    if (sel.length > 1) { this.groupSelection('frame'); sel = m.topSelected(); }
    const el = sel[0];
    if (el.isComponentInstance) { Utils.toast('Detach the instance first to turn it into a new component', '⚠️'); return; }
    el.isComponentMaster = true;
    this.commit();
    Utils.toast(`Created component “${el.name}”`, '◆');
  }
  createInstance(masterId, at = null) {
    const m = this.model;
    const master = m.findAnywhere(masterId);
    if (!master) return;
    const masterPage = m.pageOf(master.id);
    const nodes = [master, ...m.descendantsOf(master.id, masterPage.elements)];
    const idMap = new Map(nodes.map(n => [n.id, Utils.uid('el')]));
    const pos = at || (masterPage.id === m.currentPageId ? { x: master.x + master.width + 40, y: master.y } : this.viewCenter(master));
    const dx = pos.x - master.x, dy = pos.y - master.y;
    const copies = nodes.map(n => {
      const c = StudioElement.fromJSON(JSON.parse(JSON.stringify(n)));
      c.id = idMap.get(n.id);
      c.parentId = n === master ? null : idMap.get(n.parentId);
      c.isComponentMaster = false;
      c.x += dx; c.y += dy;
      if (n === master) { c.isComponentInstance = true; c.masterComponentId = master.id; c.name = master.name; }
      else c.masterChildId = n.id;
      c.overrides = [];
      c.componentProps = []; c.propValues = null; if (n === master) c.description = '';
      return c;
    });
    m.elements.push(...copies);
    m.select([copies[0].id]);
    this.commit();
    Utils.toast(`Instance of “${master.name}” created`, '◇');
  }
  viewCenter(el) {
    const c = this.renderer.screenToWorld(this.renderer.cssW / 2, this.renderer.cssH / 2);
    return { x: Math.round(c.x - (el ? el.width / 2 : 0)), y: Math.round(c.y - (el ? el.height / 2 : 0)) };
  }
  detachInstance() {
    const m = this.model;
    const insts = m.topSelected().filter(e => e.isComponentInstance);
    for (const el of insts) {
      el.isComponentInstance = false; el.masterComponentId = null; el.overrides = [];
      for (const d of m.descendantsOf(el.id)) { d.masterChildId = null; d.overrides = []; }
    }
    this.commit();
    Utils.toast('Instance detached', '🔓');
  }
  reorder(mode) { if (this.model.reorder(mode)) this.commit(); }
  flipSelection(axis) {
    const m = this.model;
    const box = this.selectionBox();
    if (!box) return;
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    for (const root of m.topSelected()) {
      for (const el of [root, ...m.descendantsOf(root.id)]) {
        if (axis === 'x') { el.x = 2 * c.x - (el.x + el.width); el.flipX = !el.flipX; }
        else { el.y = 2 * c.y - (el.y + el.height); el.flipY = !el.flipY; }
        if (el.rotation) el.rotation = -el.rotation;
        if (el.type === 'group') { el.flipX = false; el.flipY = false; }
      }
    }
    this.commit();
  }
  toggleProp(prop) {
    const m = this.model;
    const sel = m.topSelected();
    if (!sel.length) return;
    const val = !sel[0][prop];
    for (const el of sel) el[prop] = val;
    this.commit();
    Utils.toast(prop === 'locked' ? (val ? 'Locked' : 'Unlocked') : (val ? 'Shown' : 'Hidden'));
  }
  async copyAsCSS() {
    const el = this.model.topSelected()[0];
    if (!el) return;
    const ok = await Utils.copyText(Exporters.inspect(this.model, el).css);
    Utils.toast(ok ? 'CSS copied' : 'Clipboard unavailable', ok ? '📋' : '⚠️');
  }
  async copyAsSVG() {
    const sel = this.model.topSelected();
    if (!sel.length) return;
    const ok = await Utils.copyText(Exporters.svgDocument(this.model, sel));
    Utils.toast(ok ? 'SVG copied' : 'Clipboard unavailable', ok ? '📋' : '⚠️');
  }
  clearCanvas() {
    this.confirm('Clear this page?', 'All layers on this page will be removed. You can undo this.', 'Clear page').then(ok => {
      if (!ok) return;
      this.model.deleteElements(this.model.elements.map(e => e.id));
      this.model.select([]);
      this.commit();
    });
  }

  // ===================================================================== Clipboard
  bindClipboard() {
    const editable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    document.addEventListener('copy', (e) => {
      if (editable(document.activeElement) || !this.model.selectedIds.size) return;
      const data = this.copy();
      e.clipboardData.setData('text/plain', data);
      e.preventDefault();
    });
    document.addEventListener('cut', (e) => {
      if (editable(document.activeElement) || !this.model.selectedIds.size) return;
      const data = this.copy();
      e.clipboardData.setData('text/plain', data);
      e.preventDefault();
      this.deleteSelection();
    });
    document.addEventListener('paste', (e) => {
      if (editable(document.activeElement)) return;
      if (this.section === 'media') { this.mediaPaste?.(e); return; }
      if (this.section && this.section !== 'design') return;
      const dt = e.clipboardData;
      if (!dt) return;
      e.preventDefault();
      for (const item of dt.items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) { this.importImageFile(item.getAsFile()); return; }
      }
      const text = dt.getData('text/plain');
      if (text && text.includes(CLIP_MARKER)) { this.pasteData(text, this.shiftDown); return; }
      if (text && /^\s*(<\?xml|<svg)/i.test(text)) { this.importSVGText(text, 'Pasted SVG'); return; }
      if (text && text.trim()) {
        const el = new StudioElement('text', 0, 0, 10, 10);
        el.text = text.slice(0, 5000); el.name = text.trim().split('\n')[0].slice(0, 40); el.textAutoResize = text.length > 60 ? 'height' : 'width';
        if (el.textAutoResize === 'height') el.width = 320;
        TextLayout.fit(el);
        Object.assign(el, this.viewCenter(el));
        if (el.fills?.[0]) el.fills[0].color = this.contrastTextColor(this.frameAt({ x: el.x + el.width / 2, y: el.y + el.height / 2 }));
        this.model.insertElement(el, null);
        this.model.select([el.id]);
        this.commit();
        return;
      }
      this.pasteInternal();
    });
  }
  copy() {
    const m = this.model;
    const roots = m.topSelected();
    const nodes = roots.flatMap(r => [r, ...m.descendantsOf(r.id)]);
    const assets = {};
    for (const n of nodes) if (n.assetId && m.assets[n.assetId]) assets[n.assetId] = m.assets[n.assetId];
    const data = JSON.stringify({ marker: CLIP_MARKER, roots: roots.map(r => r.id), elements: nodes, assets });
    this.clipboard = data;
    try { localStorage.setItem(CLIPBOARD_KEY, data); } catch (e) { /* quota */ }
    Utils.copyText(data).catch(() => {});
    Utils.toast(`Copied ${roots.length} layer${roots.length > 1 ? 's' : ''}`, '📋');
    return data;
  }
  cut() { this.copy(); this.deleteSelection(); }
  readInternalClipboard() {
    if (this.clipboard) return this.clipboard;
    try { return localStorage.getItem(CLIPBOARD_KEY); } catch (e) { return null; }
  }
  pasteInternal() { const d = this.readInternalClipboard(); if (d) this.pasteData(d, false); }
  pasteData(json, inPlace) {
    const m = this.model;
    let data;
    try { data = Utils.safeParseJSON(json, 100 * 1024 * 1024); } catch (e) { return; }
    if (!data || data.marker !== CLIP_MARKER || !Array.isArray(data.elements)) return;
    for (const [k, v] of Object.entries(data.assets || {})) if (typeof v === 'string' && v.startsWith('data:image/')) m.assets[k] = v;
    const els = data.elements.map(e => StudioElement.fromJSON(e)).filter(Boolean);
    const idMap = new Map(els.map(e => [e.id, Utils.uid('el')]));
    const rootIds = new Set(data.roots || []);
    const sel = m.topSelected();
    const targetFrame = sel.length === 1 && sel[0].type === 'frame' && !rootIds.has(sel[0].id) ? sel[0] : null;
    const exists = els.some(e => rootIds.has(e.id) && m.getElementById(e.id));
    const off = inPlace ? 0 : exists && !targetFrame ? 20 : 0;
    const roots = [];
    const origOf = new Map();
    for (const e of els) {
      const isRoot = rootIds.has(e.id);
      origOf.set(idMap.get(e.id), e.id);
      e.id = idMap.get(e.id);
      if (isRoot) {
        e.parentId = targetFrame ? targetFrame.id : (m.getElementById(e.parentId) && exists ? e.parentId : null);
        roots.push(e);
      } else e.parentId = idMap.get(e.parentId) || null;
      if (e.masterComponentId && !m.findAnywhere(e.masterComponentId)) { e.isComponentInstance = false; e.masterComponentId = null; }
      e.isComponentMaster = false;
      // QA-15: pasting a main component pastes an instance of it (Figma)
      const origId = [...idMap].find(([, v]) => v === e.id)?.[0];
      if (isRoot && origId && data.elements.find(x => x.id === origId)?.isComponentMaster && m.findAnywhere(origId)?.isComponentMaster) {
        e.isComponentInstance = true; e.masterComponentId = origId; e.overrides = []; e.componentProps = []; e.propValues = null; e.description = '';
        e._pasteMasterOf = origId;
      }
      e.x += off; e.y += off;
    }
    if (targetFrame && roots.length) {
      const b = Utils.unionBounds(roots.map(r => Utils.aabb(r)));
      if (!Utils.rectsIntersect(b, { x: targetFrame.x, y: targetFrame.y, w: targetFrame.width, h: targetFrame.height })) {
        const dx = targetFrame.x + targetFrame.width / 2 - (b.x + b.w / 2), dy = targetFrame.y + targetFrame.height / 2 - (b.y + b.h / 2);
        for (const e of els) { e.x += dx; e.y += dy; }
      }
    }
    for (const r of roots) {
      if (r._pasteMasterOf) { for (const d of els) if (d !== r && this.isUnder(d, r, els)) d.masterChildId = origOf.get(d.id); delete r._pasteMasterOf; }
      const subtree = [r, ...els.filter(e => e !== r && this.isUnder(e, r, els))];
      m.elements.splice(m.insertIndexInto(r.parentId), 0, ...subtree);
    }
    m.select(roots.map(r => r.id));
    this.commit();
    Utils.toast(`Pasted ${roots.length} layer${roots.length > 1 ? 's' : ''}`, '📋');
  }
  isUnder(el, root, list) {
    let p = list.find(x => x.id === el.parentId), guard = 0;
    while (p && guard++ < 64) { if (p === root) return true; p = list.find(x => x.id === p.parentId); }
    return false;
  }

  // ===================================================================== Keyboard
  bindKeyboard() {
    const editable = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    window.addEventListener('keydown', (e) => {
      this.shiftDown = e.shiftKey;
      if (e.key === 'Alt') { this.altDown = true; if (this.model.activeTool === 'select') { this.computeDistanceLines(this.model.getElementById(this.model.hoveredId)); } e.preventDefault(); }
      if (editable(e.target)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      // a text layer is being edited but focus slipped: route typed characters into it instead of tool shortcuts
      if (this.editingTextId && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ed = document.getElementById('text-inline-editor');
        ed.focus(); ed.setRangeText(e.key, ed.selectionStart, ed.selectionEnd, 'end'); ed.dispatchEvent(new Event('input'));
        e.preventDefault(); return;
      }
      if (document.getElementById('prototype-modal').style.display === 'flex') { if (e.key === 'Escape') this.closePrototype(); return; }
      if (document.getElementById('export-modal').classList.contains('open')) { if (e.key === 'Escape') this.closeExportModal(); return; }
      if (document.querySelector('.ds-dialog-overlay')) return;
      if (this.section !== 'design') { if ((e.ctrlKey || e.metaKey) && ['s', 'o'].includes(e.key.toLowerCase())) { e.preventDefault(); this.run(e.key.toLowerCase() === 's' ? (e.shiftKey ? 'saveAs' : 'save') : 'open'); } return; }
      if (this.previewing) { if (e.key === 'Escape') { e.preventDefault(); this.stopPreview(); } return; }
      if (this.handleTimelineKey?.(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const m = this.model;
      const go = (action) => { e.preventDefault(); this.run(action); };

      if (mod) {
        if (k === 'z') return go(e.shiftKey ? 'redo' : 'undo');
        if (k === 'y') return go('redo');
        if (k === 's') return go(e.shiftKey ? 'saveAs' : 'save');
        if (k === 'o') return go('open');
        if (k === 'e') return go('export');
        if (k === 'd') return go('duplicate');
        if (k === 'g') return go(e.altKey ? 'frame' : e.shiftKey ? 'ungroup' : 'group');
        if (k === 'k' && e.altKey) return go('createComp');
        if (k === 'b' && e.altKey) return go('detachComp');
        if (k === 'n' && e.altKey) return go('new');
        if (k === 'a') return go('selectAll');
        if (k === ']' || e.code === 'BracketRight') return go(e.shiftKey ? 'front' : 'forward');
        if (k === '[' || e.code === 'BracketLeft') return go(e.shiftKey ? 'back' : 'backward');
        if (k === '=' || k === '+') return go('zoomIn');
        if (k === '-' || k === '_') return go('zoomOut');
        if (k === '0') return go('zoomReset');
        if (k === '1') return go('zoomFit');
        if (k === '2') return go('zoomSelection');
        if (k === "'") return go('toggleGrid');
        if (k === 'h' && e.shiftKey) return go('toggleVis');
        if (k === 'l' && e.shiftKey) return go('toggleLock');
        if (k === 'p' && e.altKey) return go('playProto');
        return; // let native copy / cut / paste fire their events
      }
      if (e.altKey) return;

      if (k === ' ') { if (!this.spaceDown) { this.spaceDown = true; this.updateCursor(); } e.preventDefault(); return; }
      if (k === 'Escape') {
        e.preventDefault();
        if (this.mode === 'create' && this.creatingElem) { m.deleteElements([this.creatingElem.id]); this.creatingElem = null; this.mode = 'none'; this.isMouseDown = false; this.selectionChanged(); return; }
        if (this.penActivePath) return this.finishPen();
        if (this.measure) { this.measure = null; this.requestRender(); return; }
        if (m.activeTool !== 'select') return this.setTool('select');
        const first = m.topSelected()[0];
        if (first && first.parentId) { m.select([first.parentId]); this.selectionChanged(); return; }
        if (m.selectedIds.size) { m.select([]); this.selectionChanged(); }
        return;
      }
      if (k === 'Enter') {
        e.preventDefault();
        if (this.penActivePath) return this.finishPen();
        const sel = m.topSelected();
        if (sel.length === 1 && sel[0].type === 'text') return this.startTextEdit(sel[0], true);
        if (sel.length === 1 && sel[0].isContainer) { const kids = m.childrenOf(sel[0].id); if (kids.length) { m.select(kids.map(x => x.id)); this.selectionChanged(); } }
        return;
      }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (this.penActivePath) return this.finishPen(); return this.deleteSelection(); }
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        const sel = this.movable();
        if (!sel.length) return;
        for (const el of sel) this.translateSubtree(el, dx, dy, new Map());
        this.changed();
        this.nudgeCommit();
        return;
      }
      if (e.shiftKey) {
        const shiftMap = { a: 'autoLayout', h: 'flipH', v: 'flipV', r: 'toggleRulers', '!': 'zoomFit', '@': 'zoomSelection', ')': 'zoomReset' };
        if (e.code === 'Digit1') return go('zoomFit');
        if (e.code === 'Digit2') return go('zoomSelection');
        if (e.code === 'Digit0') return go('zoomReset');
        if (shiftMap[k]) return go(shiftMap[k]);
        if (k === 'l') { e.preventDefault(); return this.setTool('arrow'); }
        if (k === 'p') { e.preventDefault(); return this.setTool('pencil'); }
        return;
      }
      const tools = { v: 'select', a: 'directSelect', k: 'scale', h: 'hand', z: 'zoom', f: 'frame', r: 'rect', o: 'ellipse', l: 'line', p: 'pen', t: 'text', i: 'eyedropper', m: 'measure' };
      if (tools[k]) { e.preventDefault(); return this.setTool(tools[k]); }
      if (/^[0-9]$/.test(k)) {
        const sel = m.topSelected();
        if (!sel.length) return;
        const v = k === '0' ? 1 : Number(k) / 10;
        for (const el of sel) el.opacity = v;
        this.commit();
        Utils.toast(`Opacity ${Math.round(v * 100)}%`);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.shiftDown = e.shiftKey;
      if (e.key === ' ') { this.spaceDown = false; this.updateCursor(); }
      if (e.key === 'Alt') { this.altDown = false; this.distanceLines = []; this.requestRender(); }
    });
    window.addEventListener('blur', () => { this.spaceDown = false; this.altDown = false; this.distanceLines = []; });
  }

  // ===================================================================== Menus
  bindMenus() {
    ['file', 'edit', 'view', 'object', 'plugins'].forEach(name => {
      const btn = document.getElementById(`m-${name}`), drop = document.getElementById(`dropdown-${name}`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = drop.classList.contains('open');
        this.closeMenus();
        if (!open) { this.updateMenuState(drop); drop.classList.add('open'); }
      });
      btn.addEventListener('mouseenter', () => {
        if (document.querySelector('.top-dropdown.open') && !drop.classList.contains('open')) { this.closeMenus(); this.updateMenuState(drop); drop.classList.add('open'); }
      });
      drop.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (!item || item.classList.contains('disabled')) { e.stopPropagation(); return; }
        this.closeMenus();
        this.run(item.dataset.action);
      });
    });
    window.addEventListener('click', () => this.closeMenus());
  }
  updateMenuState(container) {
    container.querySelectorAll('[data-action]').forEach(item => {
      const cmd = this.commands[item.dataset.action];
      item.classList.toggle('disabled', !!(cmd && cmd.enabled && !cmd.enabled()));
      if (item.dataset.action === 'toggleGrid') item.classList.toggle('checked', this.model.showGrid);
      if (item.dataset.action === 'toggleSnap') item.classList.toggle('checked', this.model.snapToGuides);
      if (item.dataset.action === 'toggleRulers') item.classList.toggle('checked', this.model.showRulers);
      if (item.dataset.action === 'toggleGuides') item.classList.toggle('checked', this.model.showGuides !== false);
      if (item.dataset.action === 'lockGuides') item.classList.toggle('checked', !!this.model.lockGuides);
    });
  }
  closeMenus() {
    document.querySelectorAll('.top-dropdown.open').forEach(d => d.classList.remove('open'));
    const ctx = document.getElementById('ctx-menu');
    if (ctx) ctx.style.display = 'none';
  }
  bindContextMenu() {
    const menu = document.getElementById('ctx-menu');
    this.wrap.addEventListener('contextmenu', (e) => {
      if (e.target !== this.canvas && e.target !== this.wrap) return;
      e.preventDefault();
      const m = this.model, p = this.pointer(e);
      const target = this.hitFrameLabel(p) || this.resolveTarget(this.hitTestDeep(p), e);
      if (target && !m.selectedIds.has(target.id)) { m.select([target.id]); this.selectionChanged(); }
      this.closeMenus();
      this.updateMenuState(menu);
      menu.style.display = 'block';
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.style.left = `${Math.min(e.clientX, window.innerWidth - mw - 6)}px`;
      menu.style.top = `${Math.min(e.clientY, window.innerHeight - mh - 6)}px`;
    });
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.ctx-item');
      if (!item || item.classList.contains('disabled')) { e.stopPropagation(); return; }
      menu.style.display = 'none';
      this.run(item.dataset.action);
    });
    window.addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) menu.style.display = 'none'; });
  }
  bindTopBar() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => this.run('zoomIn'));
    document.getElementById('btn-zoom-out').addEventListener('click', () => this.run('zoomOut'));
    document.getElementById('btn-zoom-level').addEventListener('click', () => this.run('zoomFit'));
    document.getElementById('btn-zoom-level').title = 'Zoom to fit (Shift+1)';
    document.getElementById('btn-toggle-grid').addEventListener('click', () => this.run('toggleGrid'));
    document.getElementById('btn-toggle-snap').addEventListener('click', () => this.run('toggleSnap'));
    this.titleInput.addEventListener('change', () => { this.unsaved = true; this.scheduleAutosave(); document.title = `${this.title} — DesignStudio`; });
    this.titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.titleInput.blur(); });
  }

  /** Small promise-based confirm dialog (no native dialogs). */
  confirm(title, message, okLabel = 'OK') {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'ds-dialog-overlay';
      const box = document.createElement('div');
      box.className = 'ds-dialog';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      const h = document.createElement('h3'); h.textContent = title;
      const p = document.createElement('p'); p.textContent = message;
      const row = document.createElement('div'); row.className = 'ds-dialog-actions';
      const cancel = document.createElement('button'); cancel.className = 'menu-btn'; cancel.textContent = 'Cancel';
      const ok = document.createElement('button'); ok.className = 'btn-primary'; ok.textContent = okLabel;
      row.append(cancel, ok); box.append(h, p, row); ov.append(box); document.body.append(ov);
      const done = (v) => { ov.remove(); document.removeEventListener('keydown', onKey, true); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.stopPropagation(); done(true); } };
      document.addEventListener('keydown', onKey, true);
      cancel.onclick = () => done(false); ok.onclick = () => done(true);
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) done(false); });
      ok.focus();
    });
  }

  // ===================================================================== Files & persistence
  autosaveNow() {
    const json = JSON.stringify(this.model.serialize(this.title));
    // 1) fast synchronous copy that survives closing the tab (only when it fits the ~5 MB localStorage quota)
    let local = false;
    try {
      if (json.length < 4000000) { localStorage.setItem(AUTOSAVE_KEY, json); local = true; }
      else localStorage.removeItem(AUTOSAVE_KEY);
    } catch (e) { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) { /* ignore */ } }
    // 2) full copy in IndexedDB (hundreds of MB available)
    Store.set(AUTOSAVE_KEY, json).then(ok => {
      this.onAutosaved?.(ok || local, json);
      if (ok || local) {
        if (this.autosaveFailed) Utils.toast('Autosave is working again', '✅');
        this.autosaveFailed = false;
      } else {
        if (!this.autosaveFailed && !this.fileHandle) Utils.toast('Autosave failed (browser storage unavailable). Use File › Save to keep your work.', '⚠️');
        this.autosaveFailed = true;
      }
    });
  }
  applyRestored(data) {
    const title = this.model.load(data);
    this.titleInput.value = title || 'Untitled Studio Project';
    document.title = `${this.title} — DesignStudio`;
    this.model.applyTime(0);
    this.restoredSavedAt = data.savedAt || '';
    if (this._booted) { this.refreshUI?.(); this.requestRender?.(); } // later restores (IndexedDB, scripts) refresh the panels
  }
  restoreAutosave() {
    let raw = null;
    try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      this.applyRestored(Utils.safeParseJSON(raw));
      setTimeout(() => Utils.toast('Restored your last session', '💾'), 300);
      return true;
    } catch (e) {
      console.warn('Autosave restore failed', e);
      return false;
    }
  }
  /** IndexedDB may hold a newer / larger autosave than localStorage (e.g. projects with big images). */
  async restoreFromIndexedDB() {
    const raw = await Store.get(AUTOSAVE_KEY);
    if (!raw || this.model.historyIndex > 0) return;
    try {
      const data = Utils.safeParseJSON(raw);
      if (!data.savedAt || (this.restoredSavedAt && data.savedAt <= this.restoredSavedAt)) return;
      this.applyRestored(data);
      this.pristineDemo = false;
      this.hideWelcome();
      this.model.resetHistory();
      this.model.captureBaseline(this.model.allElements());
      this.applyViewState();
      this.refreshUI();
      this.requestRender();
      Utils.toast('Restored your last session', '💾');
    } catch (e) { console.warn('IndexedDB restore failed', e); }
  }
  backupPrevious() {
    try { Store.set(PREVIOUS_KEY, JSON.stringify(this.model.serialize(this.title))); } catch (e) { /* ignore */ }
  }
  loadProjectData(data, sourceName = '') {
    const m = this.model;
    this.backupPrevious();
    const title = m.load(data);
    this.titleInput.value = title || sourceName.replace(/\.(designstudio\.)?json$/i, '') || 'Untitled Studio Project';
    document.title = `${this.title} — DesignStudio`;
    m.applyTime(0);
    m.animationTimeline.currentTime = 0;
    m.resetHistory();
    m.captureBaseline(m.allElements());
    this.hideWelcome();
    this.applyViewState();
    if (!data.view) this.zoomFit(false);
    this.unsaved = false;
    this.autosaveNow();
    this.refreshUI();
    this.requestRender();
  }
  async saveProject(saveAs) {
    this.finishTextEdit();
    const json = JSON.stringify(this.model.serialize(this.title), null, 1);
    const name = `${Utils.safeFilename(this.title)}.designstudio.json`;
    if (window.showSaveFilePicker) {
      try {
        if (!this.fileHandle || saveAs) {
          this.fileHandle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'DesignStudio project', accept: { 'application/json': ['.json'] } }] });
        }
        const w = await this.fileHandle.createWritable();
        await w.write(json); await w.close();
        this.unsaved = false;
        if (this.onFileSaved) this.onFileSaved(this.fileHandle, saveAs); else Utils.toast(`Saved ${this.fileHandle.name}`, '💾');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        this.fileHandle = null; // fall back to download
      }
    }
    Utils.download(json, name, 'application/json');
    this.unsaved = false;
    if (this.onFileSaved) this.onFileSaved(null, saveAs, name); else Utils.toast(`Downloaded ${name}`, '💾');
  }
  async openProject() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'DesignStudio / SVG / images', accept: { 'application/json': ['.json'], 'image/svg+xml': ['.svg'], 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'] } }] });
        const file = await handle.getFile();
        this._openingHandle = /\.json$/i.test(file.name) ? handle : null;
        this.handleImportFile(file);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    document.getElementById('file-importer').click();
  }
  async newProject() {
    const m = this.model;
    if (m.allElements().length) {
      const ok = await this.confirm('Start a new project?', 'Your current project is kept as “Recent project” on the welcome screen. Save it to a file if you want a permanent copy.', 'New project');
      if (!ok) return;
      this.backupPrevious();
    }
    this.finishTextEdit();
    m.reset();
    m.resetHistory();
    this.fileHandle = null; this.rememberFileHandle?.();
    this.titleInput.value = 'Untitled Studio Project';
    document.title = 'DesignStudio';
    this.applyViewState();
    this.zoomFit(false);
    this.unsaved = false;
    this.autosaveNow();
    this.refreshUI();
    this.showWelcome();
  }

  bindImportAndDrop() {
    const overlay = document.getElementById('drop-overlay');
    const fileInp = document.getElementById('file-importer');
    let depth = 0;
    this.wrap.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { depth++; overlay.classList.add('active'); } });
    this.wrap.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    this.wrap.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('active'); });
    this.wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0; overlay.classList.remove('active');
      const p = this.pointer(e);
      [...(e.dataTransfer?.files || [])].forEach((f, i) => this.handleImportFile(f, { x: p.x + i * 24, y: p.y + i * 24 }));
    });
    fileInp.addEventListener('change', () => {
      [...fileInp.files].forEach(f => this.handleImportFile(f));
      fileInp.value = '';
    });
  }
  handleImportFile(file, at = null) {
    if (!file) return;
    const name = file.name || '';
    const reader = new FileReader();
    if (/\.json$/i.test(name) || file.type === 'application/json') {
      reader.onload = () => {
        try {
          const data = Utils.safeParseJSON(reader.result);
          if (data && data.document && data.document.type === 'DOCUMENT') throw new Error('This is a Figma-format export; DesignStudio opens its own .designstudio.json files.');
          this.loadProjectData(data, name);
          this.fileHandle = this._openingHandle || null; this._openingHandle = null;
          this.rememberFileHandle?.();
          Utils.toast(this.fileHandle && this.autoFileOn?.() ? `Opened ${name} — changes save to this file automatically` : `Opened ${name}`, '📂');
        } catch (err) { Utils.toast(`Could not open ${name}: ${err.message}`, '❌'); }
      };
      reader.readAsText(file);
    } else if (/\.svg$/i.test(name) || file.type === 'image/svg+xml') {
      reader.onload = () => this.importSVGText(reader.result, name.replace(/\.svg$/i, '') || 'SVG', at);
      reader.readAsText(file);
    } else if (file.type.startsWith('image/')) {
      this.importImageFile(file, at);
    } else {
      Utils.toast(`Unsupported file: ${name}`, '⚠️');
    }
  }
  importImageFile(file, at = null) {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) { Utils.toast('Image is larger than 40 MB — please resize it first', '⚠️'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result;
      const img = new Image();
      img.onload = () => {
        const m = this.model;
        // keep project files / autosave lean: cap stored resolution at 2400px and re-encode big files
        let stored = url, resized = false;
        const MAXPX = 2400, big = Math.max(img.naturalWidth, img.naturalHeight);
        if (big > MAXPX || file.size > 1.5 * 1024 * 1024) {
          const k = Math.min(1, MAXPX / big);
          const c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const type = /jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/webp';
          const enc = c.toDataURL(type, 0.9);
          if (enc.length < url.length) { stored = enc; resized = k < 1; }
        }
        const max = 600, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const el = new StudioElement('image', 0, 0, Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
        el.fills = [];
        el.name = (file.name || 'Image').replace(/\.[a-z0-9]+$/i, '') || 'Image';
        el.assetId = Utils.uid('img');
        m.assets[el.assetId] = stored;
        if (resized) setTimeout(() => Utils.toast(`Large image stored at ${MAXPX}px max for performance`, 'ℹ️'), 50);
        const pos = at ? { x: Math.round(at.x - el.width / 2), y: Math.round(at.y - el.height / 2) } : this.viewCenter(el);
        el.x = pos.x; el.y = pos.y;
        const parent = this.frameAt({ x: el.x + el.width / 2, y: el.y + el.height / 2 });
        m.insertElement(el, parent ? parent.id : null);
        m.select([el.id]);
        this.hideWelcome();
        this.commit();
        Utils.toast('Image placed on canvas', '🖼️');
      };
      img.onerror = () => Utils.toast('Could not read that image', '❌');
      img.src = url;
    };
    reader.readAsDataURL(file);
  }
  importSVGText(text, name, at = null) {
    const m = this.model;
    try {
      const { elements, skipped } = Exporters.importSVG(text, name);
      const b = Utils.unionBounds(elements.map(e => Utils.aabb(e)));
      const g = new StudioElement('group', b.x, b.y, b.w, b.h);
      g.name = name || 'SVG';
      const target = at ? { x: at.x - b.w / 2, y: at.y - b.h / 2 } : this.viewCenter({ width: b.w, height: b.h });
      const dx = target.x - b.x, dy = target.y - b.y;
      for (const el of elements) {
        el.x += dx; el.y += dy;
        if (el._dataUrl) { el.assetId = Utils.uid('img'); m.assets[el.assetId] = el._dataUrl; delete el._dataUrl; }
        if (!el.parentId) el.parentId = g.id;
      }
      g.x += dx; g.y += dy;
      const parent = this.frameAt({ x: g.x + g.width / 2, y: g.y + g.height / 2 });
      m.insertElement(g, parent ? parent.id : null);
      m.elements.splice(m.elements.indexOf(g) + 1, 0, ...elements);
      m.select([g.id]);
      this.hideWelcome();
      this.commit();
      const shapes = elements.filter(e => e.type !== 'group').length;
      Utils.toast(`Imported ${shapes} vector layer${shapes === 1 ? '' : 's'}`, '✨');
      const notes = [];
      if (skipped.externalImages) notes.push(`${skipped.externalImages} linked image${skipped.externalImages > 1 ? 's' : ''} (only embedded images can be imported)`);
      if (skipped.unsupported.length) notes.push(`unsupported: ${skipped.unsupported.join(', ')}`);
      if (skipped.capped) notes.push('file truncated at 5,000 shapes');
      if (notes.length) setTimeout(() => Utils.toast(`Skipped ${notes.join('; ')}`, '⚠️'), 60);
    } catch (e) {
      Utils.toast(`SVG import failed: ${e.message}`, '❌');
    }
  }

  // ===================================================================== Welcome
  bindWelcome() {
    const startWith = (w, h, name, radius = 0) => {
      this.discardPristineDemo();
      const m = this.model;
      const f = new StudioElement('frame', 0, 0, w, h);
      f.name = name; f.cornerRadius = radius;
      const c = this.freeSpot();
      f.x = c.x; f.y = c.y;
      m.insertElement(f, null);
      m.select([f.id]);
      this.hideWelcome();
      this.zoomToBounds({ x: f.x, y: f.y, w, h }, 60, 1);
      this.commit();
    };
    document.getElementById('btn-dismiss-welcome').addEventListener('click', () => this.hideWelcome());
    document.getElementById('wc-desktop').addEventListener('click', () => startWith(1440, 900, 'Desktop'));
    document.getElementById('wc-mobile').addEventListener('click', () => startWith(393, 852, 'iPhone 14 Pro', 0));
    document.getElementById('wc-tablet').addEventListener('click', () => startWith(768, 1024, 'iPad'));
    document.getElementById('wc-import').addEventListener('click', () => this.openProject());
    document.getElementById('wc-recent').addEventListener('click', async () => {
      const raw = await Store.get(PREVIOUS_KEY);
      if (!raw) { Utils.toast('No recent project yet', 'ℹ️'); return; }
      try { this.loadProjectData(Utils.safeParseJSON(raw)); Utils.toast('Recent project restored', '🕒'); } catch (e) { Utils.toast('Recent project could not be restored', '❌'); }
    });
    document.getElementById('wc-template').addEventListener('click', () => { this.discardPristineDemo(); this.createDesignSystemKit(); this.hideWelcome(); });
  }
  showWelcome() {
    const ws = document.getElementById('welcome-screen');
    document.getElementById('wc-recent').classList.add('disabled');
    Store.has(PREVIOUS_KEY).then(has => document.getElementById('wc-recent').classList.toggle('disabled', !has));
    ws.style.display = 'block';
  }
  hideWelcome() { document.getElementById('welcome-screen').style.display = 'none'; }

  createDesignSystemKit() {
    const m = this.model;
    const origin = this.freeSpot();
    const ox = origin.x, oy = origin.y;
    const make = (type, x, y, w, h, props = {}) => Object.assign(new StudioElement(type, ox + x, oy + y, w, h), props);
    const solid = (c) => [{ type: 'solid', color: c, opacity: 1, angle: 90, visible: true, stops: [{ pos: 0, color: c }, { pos: 1, color: c }] }];
    const mobile = make('frame', 0, 0, 393, 852, { name: 'Mobile App Screen', cornerRadius: 44, fills: solid('#121218') });
    const island = make('rect', 133, 14, 126, 36, { name: 'Dynamic Island', cornerRadius: 18, fills: solid('#000000') });
    const title = make('text', 28, 84, 300, 32, { name: 'Screen Title', text: 'Analytics Overview', fontSize: 24, fontWeight: 700, textAutoResize: 'width' });
    const cards = make('frame', 24, 136, 345, 110, { name: 'Metric Cards', fills: [], isAutoLayout: true, layoutGap: 16, layoutPaddingTop: 0, layoutPaddingRight: 0, layoutPaddingBottom: 0, layoutPaddingLeft: 0, counterSizing: 'fill' });
    const card = (name, value, label, color) => {
      const c = make('frame', 0, 0, 164, 110, { name, cornerRadius: 16, fills: solid('#1e1e2c'), strokes: [{ color: '#2e2e44', width: 1, align: 'inside', visible: true }], effects: [{ type: 'dropShadow', x: 0, y: 8, blur: 20, spread: 0, color: 'rgba(0,0,0,0.4)', visible: true }], isAutoLayout: true, layoutDirection: 'vertical', layoutGap: 6, layoutPaddingTop: 18, layoutPaddingLeft: 16, layoutPaddingRight: 16, layoutPaddingBottom: 18 });
      const v = make('text', 0, 0, 120, 30, { name: `${name} Value`, text: value, fontSize: 22, fontWeight: 700, textAutoResize: 'width', fills: solid(color) });
      const l = make('text', 0, 0, 120, 18, { name: `${name} Label`, text: label, fontSize: 11, fontWeight: 500, textAutoResize: 'width', fills: solid('#888899') });
      return [c, v, l];
    };
    const [c1, v1, l1] = card('Revenue Card', '$48,290', 'Monthly recurring', '#14ae5c');
    const [c2, v2, l2] = card('Growth Card', '+34.8%', 'User acquisition', '#0d99ff');
    const btn = make('frame', 24, 270, 345, 52, { name: 'Primary Button', cornerRadius: 12, isAutoLayout: true, layoutAlign: 'center', fills: [{ type: 'linear', angle: 90, color: '#0d99ff', opacity: 1, visible: true, stops: [{ pos: 0, color: '#0d99ff' }, { pos: 1, color: '#9747ff' }] }], effects: [{ type: 'dropShadow', x: 0, y: 6, blur: 16, spread: 0, color: 'rgba(13,153,255,0.4)', visible: true }] });
    const btnT = make('text', 0, 0, 200, 20, { name: 'Button Label', text: 'Download report', fontSize: 14, fontWeight: 600, textAutoResize: 'width' });
    const desktop = make('frame', 460, 0, 800, 520, { name: 'Desktop Analytics Portal', cornerRadius: 16, fills: solid('#161622'), strokes: [{ color: '#2b2b3a', width: 1, align: 'inside', visible: true }] });
    const side = make('rect', 460, 0, 200, 520, { name: 'Navigation Sidebar', fills: solid('#101018') });
    const brand = make('text', 484, 28, 150, 22, { name: 'Portal Brand', text: 'DesignStudio Pro', fontSize: 15, fontWeight: 700, textAutoResize: 'width', fills: solid('#0d99ff') });
    const navs = ['Overview', 'Reports', 'Customers', 'Settings'].map((t, i) => make('text', 484, 84 + i * 36, 150, 20, { name: `Nav ${t}`, text: t, fontSize: 13, textAutoResize: 'width', fills: solid(i === 0 ? '#ffffff' : '#8a8aa0') }));
    const heading = make('text', 692, 32, 400, 30, { name: 'Dashboard Heading', text: 'Good morning 👋', fontSize: 22, fontWeight: 700, textAutoResize: 'width' });
    m.insertElement(mobile, null);
    for (const el of [island, title, cards, btn]) m.insertElement(el, mobile.id);
    m.insertElement(c1, cards.id); m.insertElement(v1, c1.id); m.insertElement(l1, c1.id);
    m.insertElement(c2, cards.id); m.insertElement(v2, c2.id); m.insertElement(l2, c2.id);
    m.insertElement(btnT, btn.id);
    btn.isComponentMaster = true; btn.name = 'Primary Button';
    m.insertElement(desktop, null);
    for (const el of [side, brand, ...navs, heading]) m.insertElement(el, desktop.id);
    for (const el of m.elements) TextLayout.fit(el);
    m.styles.colors.push({ id: Utils.uid('c'), name: 'Success Green', color: '#14ae5c' });
    m.select([]);
    this.commit();
    this.zoomFit();
    Utils.toast('Design system kit added (Primary Button is a component)', '🎨');
  }

  // ===================================================================== Minimap
  bindMinimap() {
    const cont = document.getElementById('minimap-container');
    const go = (e) => {
      if (!this.minimapXform) return;
      const r = cont.getBoundingClientRect();
      const { s, ox, oy } = this.minimapXform;
      const wx = (e.clientX - r.left - ox) / s, wy = (e.clientY - r.top - oy) / s;
      const m = this.model;
      m.panX = this.renderer.cssW / 2 - wx * m.zoom;
      m.panY = this.renderer.cssH / 2 - wy * m.zoom;
      this.requestRender();
    };
    let drag = false;
    cont.addEventListener('pointerdown', (e) => { drag = true; cont.setPointerCapture(e.pointerId); go(e); e.stopPropagation(); });
    cont.addEventListener('pointermove', (e) => { if (drag) go(e); });
    cont.addEventListener('pointerup', () => { drag = false; this.scheduleViewSave(); });
  }
  renderMinimap() {
    const c = document.getElementById('minimap-canvas');
    if (!c) return;
    const W = 180, H = 110, dpr = window.devicePixelRatio || 1;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#14141c'; ctx.fillRect(0, 0, W, H);
    const m = this.model;
    const roots = m.roots().filter(e => e.visible);
    const z = m.zoom;
    const view = { x: -m.panX / z, y: -m.panY / z, w: this.renderer.cssW / z, h: this.renderer.cssH / z };
    const content = roots.length ? this.renderer.boundsOf(roots) : view;
    const all = Utils.unionBounds([content, view]);
    const s = Math.min((W - 12) / all.w, (H - 12) / all.h);
    const ox = (W - all.w * s) / 2 - all.x * s, oy = (H - all.h * s) / 2 - all.y * s;
    this.minimapXform = { s, ox, oy };
    const tree = m.buildTree();
    const drawRects = (list, depth) => {
      for (const el of list) {
        if (!el.visible) continue;
        const f = el.fills.find(x => x.visible !== false);
        ctx.fillStyle = f ? Utils.rgba(f.type === 'solid' ? f.color : f.stops[0].color, f.opacity) : 'rgba(255,255,255,0.08)';
        const b = Utils.aabb(el);
        ctx.fillRect(ox + b.x * s, oy + b.y * s, Math.max(1, b.w * s), Math.max(1, b.h * s));
        if (depth < 2) drawRects(tree.get(el.id) || [], depth + 1);
      }
    };
    drawRects(roots, 0);
    const vp = document.getElementById('minimap-viewport');
    Object.assign(vp.style, { left: `${ox + view.x * s}px`, top: `${oy + view.y * s}px`, width: `${view.w * s}px`, height: `${view.h * s}px` });
  }
}

// Boot once every mixin file has loaded.
window.addEventListener('DOMContentLoaded', () => {
  try {
    window.studioApp = new StudioApp();
    window.studioApp._booted = true;
  } catch (err) {
    console.error(err);
    const box = document.createElement('div');
    box.className = 'ds-fatal';
    box.textContent = `DesignStudio failed to start: ${err.message}`;
    document.body.appendChild(box);
  }
});
