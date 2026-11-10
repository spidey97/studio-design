/**
 * DesignStudio — right panel (Design / Prototype / Inspect) and color picker.
 */
'use strict';

const PanelsMixin = {
  // ===================================================================== Binding
  bindPanels() {
    const $ = (id) => document.getElementById(id);
    this.injectPanelSections();

    // Tabs
    const tabs = document.querySelectorAll('#right-panel .panel-tab-btn');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      for (const name of ['design', 'prototype', 'inspect']) $(`panel-tab-${name}`).style.display = tab.dataset.tab === name ? 'block' : 'none';
      this.activeRightTab = tab.dataset.tab;
      this.updatePropertiesUI();
    }));
    this.activeRightTab = 'design';

    // Transform inputs
    const tmap = { 'inp-pos-x': 'x', 'inp-pos-y': 'y', 'inp-dim-w': 'w', 'inp-dim-h': 'h', 'inp-rotation': 'rotation', 'inp-corner-radius': 'radius' };
    for (const [id, key] of Object.entries(tmap)) {
      const inp = $(id);
      inp.addEventListener('input', () => { if (inp.value === '' || inp.value === '-') return; this.applyTransformInput(key, parseFloat(inp.value)); });
      inp.addEventListener('change', () => this.commit());
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    }
    this.bindScrubbers(document.getElementById('right-panel'));

    $('btn-lock-aspect').addEventListener('click', () => {
      const sel = this.model.topSelected();
      if (!sel.length) return;
      const v = !sel[0].constrainProportions;
      sel.forEach(el => { el.constrainProportions = v; });
      this.commit();
    });

    // Alignment & distribution
    const align = { 'act-align-left': 'left', 'act-align-center-h': 'hcenter', 'act-align-right': 'right', 'act-align-top': 'top', 'act-align-center-v': 'vcenter', 'act-align-bottom': 'bottom' };
    for (const [id, mode] of Object.entries(align)) $(id).addEventListener('click', () => this.alignSelection(mode));
    $('act-dist-h').addEventListener('click', () => this.distributeSelection('h'));
    $('act-dist-v').addEventListener('click', () => this.distributeSelection('v'));

    // Auto layout
    $('btn-toggle-autolayout').addEventListener('click', () => {
      const sel = this.model.topSelected();
      if (sel.length === 1 && sel[0].type === 'frame' && sel[0].isAutoLayout) { sel[0].isAutoLayout = false; this.commit(); }
      else this.run('autoLayout');
    });
    const frameSel = () => { const s = this.model.topSelected(); return s.length === 1 && s[0].type === 'frame' ? s[0] : null; };
    $('al-dir-h').addEventListener('click', () => { const f = frameSel(); if (f) { f.layoutDirection = 'horizontal'; this.commit(); } });
    $('al-dir-v').addEventListener('click', () => { const f = frameSel(); if (f) { f.layoutDirection = 'vertical'; this.commit(); } });
    $('al-gap').addEventListener('input', () => { const f = frameSel(); if (f) { f.layoutGap = Math.max(0, Utils.num($('al-gap').value)); this.changed(); } });
    $('al-padding').addEventListener('input', () => {
      const f = frameSel(); if (!f) return;
      const v = Math.max(0, Utils.num($('al-padding').value));
      f.layoutPadding = f.layoutPaddingTop = f.layoutPaddingRight = f.layoutPaddingBottom = f.layoutPaddingLeft = v;
      this.changed();
    });
    ['al-gap', 'al-padding'].forEach(id => $(id).addEventListener('change', () => this.commit()));
    $('al-align-matrix').addEventListener('click', (e) => {
      const cell = e.target.closest('.align-matrix-cell'); const f = frameSel();
      if (!cell || !f) return;
      f.layoutAlign = cell.dataset.pos === 'center' ? 'center-center' : cell.dataset.pos;
      this.commit();
    });
    $('al-primary-sizing').addEventListener('change', (e) => { const f = frameSel(); if (f) { f.primarySizing = e.target.value; this.commit(); } });
    $('al-counter-sizing').addEventListener('change', (e) => { const f = frameSel(); if (f) { f.counterSizing = e.target.value; this.commit(); } });

    // Constraints
    $('sel-constraint-h').addEventListener('change', (e) => { this.model.topSelected().forEach(el => { el.constraints.horizontal = e.target.value; }); this.commit(); });
    $('sel-constraint-v').addEventListener('change', (e) => { this.model.topSelected().forEach(el => { el.constraints.vertical = e.target.value; }); this.commit(); });
    document.querySelectorAll('.constraint-pin').forEach(pin => pin.addEventListener('click', () => {
      const sel = this.model.topSelected(); if (!sel.length) return;
      const axis = pin.dataset.axis === 'h' ? 'horizontal' : 'vertical';
      const [a, b] = axis === 'horizontal' ? ['left', 'right'] : ['top', 'bottom'];
      const both = `${a}-${b}`;
      for (const el of sel) {
        const cur = el.constraints[axis], v = pin.dataset.val, other = v === a ? b : a;
        if (cur === both) el.constraints[axis] = other;
        else if (cur === other) el.constraints[axis] = both;
        else el.constraints[axis] = v;
      }
      this.commit();
    }));

    // Layout grids
    $('btn-add-layout-grid').addEventListener('click', () => {
      const f = frameSel(); if (!f) return;
      f.layoutGrids.push({ type: 'columns', count: 12, gutter: 20, margin: 24, size: 8, color: 'rgba(242,72,34,0.1)', visible: true });
      this.commit();
    });

    // Fill / stroke / effect add
    $('btn-add-fill').addEventListener('click', () => {
      const sel = this.model.topSelected(); if (!sel.length) return;
      sel.forEach(el => el.fills.push({ type: 'solid', color: el.fills.length ? '#ffffff' : '#d9d9d9', opacity: 1, angle: 90, visible: true, stops: [{ pos: 0, color: '#0d99ff' }, { pos: 1, color: '#9747ff' }] }));
      sel.forEach(el => this.markOverride(el, 'fills'));
      this.commit();
    });
    $('btn-add-stroke').addEventListener('click', () => {
      const sel = this.model.topSelected(); if (!sel.length) return;
      sel.forEach(el => { el.strokes.push({ color: '#ffffff', width: 1, align: Geometry.isOpen(el) ? 'center' : 'inside', visible: true }); this.markOverride(el, 'strokes'); });
      this.commit();
    });
    $('btn-add-effect').addEventListener('click', () => {
      const sel = this.model.topSelected(); if (!sel.length) return;
      sel.forEach(el => { el.effects.push({ type: 'dropShadow', x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.25)', visible: true }); this.markOverride(el, 'effects'); });
      this.commit();
    });

    // Blend + opacity
    $('layer-blend-mode').addEventListener('change', (e) => { this.model.topSelected().forEach(el => { el.blendMode = e.target.value; this.markOverride(el, 'blendMode'); }); this.commit(); });
    const setOpacity = (v, live) => {
      const val = Utils.clamp(Utils.num(v, 100), 0, 100) / 100;
      this.model.topSelected().forEach(el => { el.opacity = val; this.markOverride(el, 'opacity'); });
      $('layer-opacity-slider').value = Math.round(val * 100);
      if (document.activeElement !== $('layer-opacity-val')) $('layer-opacity-val').value = Math.round(val * 100);
      if (live) this.changed(); else this.commit();
    };
    $('layer-opacity-slider').addEventListener('input', (e) => setOpacity(e.target.value, true));
    $('layer-opacity-slider').addEventListener('change', () => this.commit());
    $('layer-opacity-val').addEventListener('input', (e) => { if (e.target.value !== '') setOpacity(e.target.value, true); });
    $('layer-opacity-val').addEventListener('change', () => this.commit());

    // Typography
    const texts = () => this.model.topSelected().filter(el => el.type === 'text');
    const setText = (prop, val, live) => {
      texts().forEach(el => { el[prop] = val; this.markOverride(el, prop); TextLayout.fit(el); });
      if (live) this.changed(); else this.commit();
    };
    $('text-font-family').addEventListener('change', (e) => setText('fontFamily', e.target.value));
    $('text-font-weight').addEventListener('change', (e) => setText('fontWeight', Number(e.target.value)));
    $('text-font-size').addEventListener('input', (e) => { if (e.target.value) setText('fontSize', Math.max(1, Utils.num(e.target.value, 16)), true); });
    $('text-line-height').addEventListener('input', (e) => setText('lineHeight', Math.max(0, Utils.num(e.target.value, 0)), true));
    $('text-letter-spacing').addEventListener('input', (e) => setText('letterSpacing', Utils.num(e.target.value, 0), true));
    ['text-font-size', 'text-line-height', 'text-letter-spacing'].forEach(id => $(id).addEventListener('change', () => this.commit()));
    $('text-line-height').placeholder = 'Auto';
    [['btn-align-txt-left', 'left'], ['btn-align-txt-center', 'center'], ['btn-align-txt-right', 'right']].forEach(([id, v]) => $(id).addEventListener('click', () => setText('textAlign', v)));
    document.getElementById('text-resize-group').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      setText('textAutoResize', b.dataset.mode);
    });

    // Shape + frame extras
    $('inp-shape-count').addEventListener('input', (e) => {
      const v = Utils.clamp(Math.round(Utils.num(e.target.value, 5)), 3, 60);
      this.model.topSelected().forEach(el => { if (el.type === 'polygon') el.polygonSides = v; if (el.type === 'star') el.starPoints = v; });
      this.changed();
    });
    $('inp-shape-count').addEventListener('change', () => this.commit());
    $('chk-clip-content').addEventListener('change', (e) => { this.model.topSelected().filter(el => el.type === 'frame').forEach(el => { el.clipContent = e.target.checked; }); this.commit(); });

    // Components
    $('btn-create-instance').addEventListener('click', () => { const el = this.model.topSelected()[0]; if (el?.isComponentMaster) this.createInstance(el.id); });
    $('btn-detach-instance').addEventListener('click', () => this.run('detachComp'));
    $('btn-goto-master').addEventListener('click', () => {
      const el = this.model.topSelected()[0];
      if (!el?.masterComponentId) return;
      const page = this.model.pageOf(el.masterComponentId);
      if (!page) { Utils.toast('Main component was deleted', '⚠️'); return; }
      if (page.id !== this.model.currentPageId) this.switchPage(page.id);
      this.model.select([el.masterComponentId]);
      this.zoomSelection();
      this.selectionChanged();
    });
    $('btn-reset-overrides').addEventListener('click', () => {
      const el = this.model.topSelected()[0];
      if (!el?.isComponentInstance) return;
      el.overrides = [];
      this.model.descendantsOf(el.id).forEach(d => { d.overrides = []; });
      this.commit();
      Utils.toast('Overrides reset');
    });

    // Page background
    $('page-bg-swatch').addEventListener('click', (e) => {
      const page = this.model.page;
      this.openColorPicker(e.currentTarget, page.bg, 1, (hex) => { page.bg = hex; this.requestRender(); this.updatePropertiesUI(); }, { showAlpha: false });
    });
    $('page-bg-hex').addEventListener('change', (e) => { if (Utils.parseColor(e.target.value)) { this.model.page.bg = Utils.toHex(e.target.value); this.commit(); } });

    // Prototype settings
    $('btn-add-interaction').addEventListener('click', () => {
      const el = this.model.topSelected()[0];
      if (!el) { Utils.toast('Select a layer first', 'ℹ️'); return; }
      const frames = this.model.roots().filter(f => f.type === 'frame' && f.id !== this.rootOf(el).id);
      el.interactions.push({ trigger: 'click', action: frames.length ? 'navigate' : 'back', targetId: frames[0]?.id || null, url: '', transition: 'dissolve', duration: 300, delay: 800 });
      this.markOverride(el, 'interactions');
      this.commit();
      Utils.toast('Interaction added — press Play to try it');
    });
    $('proto-starting-frame').addEventListener('change', (e) => {
      const el = this.model.topSelected()[0];
      if (!el) return;
      const root = this.rootOf(el);
      this.model.prototypeSettings.startingFrameId = e.target.checked ? root.id : null;
      this.commit();
    });
    $('proto-flow-name').addEventListener('change', (e) => { this.model.prototypeSettings.flowName = e.target.value.slice(0, 80); this.commit(); });
    $('proto-device-select').addEventListener('change', (e) => { this.model.prototypeSettings.device = e.target.value; this.commit(); });
    $('proto-bg-color').addEventListener('input', (e) => { this.model.prototypeSettings.canvasBg = e.target.value; });
    $('proto-bg-color').addEventListener('change', () => this.commit());
    document.querySelectorAll('input[name="proto-overflow"]').forEach(r => r.addEventListener('change', () => {
      const el = this.model.topSelected()[0];
      if (!el) return;
      const f = el.type === 'frame' ? el : this.rootOf(el);
      f.overflowScroll = r.value;
      this.commit();
    }));

    // Inspect copy buttons
    ['css', 'react', 'swift', 'kotlin', 'flutter'].forEach(lang => {
      $(`btn-copy-${lang}`).addEventListener('click', async () => {
        const ok = await Utils.copyText($(`inspect-${lang}-code`).textContent);
        Utils.toast(ok ? `${lang === 'css' ? 'CSS' : lang[0].toUpperCase() + lang.slice(1)} copied` : 'Clipboard unavailable', ok ? '📋' : '⚠️');
      });
    });
    $('inspect-props-table').addEventListener('click', async (e) => {
      const td = e.target.closest('.copyable-cell'); if (!td) return;
      const ok = await Utils.copyText(td.textContent);
      if (ok) Utils.toast(`Copied “${td.textContent.slice(0, 40)}”`, '📋');
    });
  },

  /** Adds controls the original markup was missing (empty state, text resize, shape, frame). */
  injectPanelSections() {
    const design = document.getElementById('panel-tab-design');
    const empty = document.createElement('div');
    empty.className = 'prop-section';
    empty.id = 'sec-empty';
    empty.innerHTML = `
      <div class="empty-hint">Select a layer to edit its properties.<small>Draw with R, O, F or T · Drop images or SVGs onto the canvas.</small></div>
      <div class="prop-section-header"><span>Page</span></div>
      <div class="prop-row"><span class="prop-label">Background</span><div class="color-swatch-btn" id="page-bg-swatch" role="button" tabindex="0" aria-label="Page background color"></div><input type="text" class="hex-input" id="page-bg-hex" spellcheck="false" aria-label="Page background hex" /></div>
      <div class="prop-row"><span class="prop-label">Contents</span><span id="page-layer-count" class="muted-text"></span></div>`;
    design.insertBefore(empty, design.firstChild);

    const transformSec = document.getElementById('inp-rotation').closest('.prop-section');
    const extra = document.createElement('div');
    extra.innerHTML = `
      <div class="prop-row" id="row-shape-count"><div class="prop-input-group"><span data-scrub="count" id="lbl-shape-count">Sides</span><input type="number" id="inp-shape-count" min="3" max="60" value="5" /></div></div>
      <div class="prop-row" id="row-clip-content"><label class="check-label"><input type="checkbox" id="chk-clip-content" /> Clip content</label></div>`;
    while (extra.firstElementChild) transformSec.appendChild(extra.firstElementChild);

    const txt = document.getElementById('sec-text-props');
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-label">Resize</span><div class="prop-btn-group" id="text-resize-group">
      <button class="prop-icon-btn" data-mode="width" title="Auto width">↔ Auto W</button>
      <button class="prop-icon-btn" data-mode="height" title="Auto height (fixed width)">↕ Auto H</button>
      <button class="prop-icon-btn" data-mode="none" title="Fixed size">▢ Fixed</button></div>`;
    txt.appendChild(row);

    const comp = document.getElementById('sec-component-props');
    const crow = document.createElement('div');
    crow.className = 'prop-row';
    crow.innerHTML = '<button class="menu-btn" id="btn-goto-master">Go to main component</button><button class="menu-btn" id="btn-reset-overrides">Reset overrides</button>';
    comp.appendChild(crow);
    const info = document.createElement('div');
    info.className = 'muted-text'; info.id = 'component-info';
    comp.appendChild(info);
  },

  bindScrubbers(root) {
    root.querySelectorAll('.prop-input-group > span[data-scrub]').forEach(label => {
      const input = label.parentElement.querySelector('input');
      if (!input) return;
      label.classList.add('scrub-label');
      label.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        label.setPointerCapture(e.pointerId);
        const startX = e.clientX, startV = Utils.num(input.value, 0);
        const step = Utils.num(input.step, 1) || 1;
        let moved = false;
        const move = (ev) => {
          const d = Math.round((ev.clientX - startX) / 2) * (ev.shiftKey ? 10 : 1) * step;
          if (d) moved = true;
          let v = startV + d;
          if (input.min !== '') v = Math.max(Number(input.min), v);
          if (input.max !== '') v = Math.min(Number(input.max), v);
          input.value = Utils.round(v, 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const up = () => {
          label.removeEventListener('pointermove', move);
          label.removeEventListener('pointerup', up);
          if (moved) input.dispatchEvent(new Event('change', { bubbles: true })); else { input.focus(); input.select(); }
        };
        label.addEventListener('pointermove', move);
        label.addEventListener('pointerup', up);
      });
    });
  },

  markOverride(el, prop) {
    if ((el.isComponentInstance || el.masterChildId) && !el.overrides.includes(prop)) el.overrides.push(prop);
  },
  rootOf(el) { const a = this.model.ancestorsOf(el); return a.length ? a[a.length - 1] : el; },

  // ===================================================================== Transform apply
  applyTransformInput(key, val) {
    if (!Number.isFinite(val)) return;
    const sel = this.movable();
    if (!sel.length) return;
    if (sel.length === 1) {
      const el = sel[0];
      if (key === 'x') this.translateSubtree(el, val - el.x, 0, new Map());
      else if (key === 'y') this.translateSubtree(el, 0, val - el.y, new Map());
      else if (key === 'w' || key === 'h') {
        if (el.type === 'line' || el.type === 'arrow') { if (key === 'w') { const [a] = this.lineEnds(el); const ang = Utils.degToRad(el.rotation); this.setLine(el, a.x, a.y, a.x + Math.cos(ang) * Math.max(1, val), a.y + Math.sin(ang) * Math.max(1, val)); } }
        else {
          const v = Math.max(1, val);
          let w = key === 'w' ? v : el.width, h = key === 'h' ? v : el.height;
          if (el.constrainProportions && el.width && el.height) { if (key === 'w') h = (v * el.height) / el.width; else w = (v * el.width) / el.height; }
          this.startStates = this.captureStates([el]);
          this.resizeElement(el, this.startStates.get(el.id), { x: el.x, y: el.y, w, h }, 'direct');
          this.startStates.clear();
          if (el.type === 'text') { el.textAutoResize = key === 'h' ? 'none' : (el.textAutoResize === 'none' ? 'none' : 'height'); TextLayout.fit(el); }
          if (el.type === 'frame' && el.isAutoLayout) { if (key === 'w') el[el.layoutDirection === 'horizontal' ? 'primarySizing' : 'counterSizing'] = 'fixed'; else el[el.layoutDirection === 'horizontal' ? 'counterSizing' : 'primarySizing'] = 'fixed'; }
        }
      } else if (key === 'rotation') this.rotateSubtree(el, val - el.rotation, { x: el.x + el.width / 2, y: el.y + el.height / 2 }, new Map());
      else if (key === 'radius') { el.cornerRadius = Math.max(0, val); this.markOverride(el, 'cornerRadius'); }
      if (['w', 'h'].includes(key)) { this.markOverride(el, 'width'); this.markOverride(el, 'height'); }
    } else {
      const box = this.selectionBox();
      if (key === 'x') sel.forEach(el => this.translateSubtree(el, val - box.x, 0, new Map()));
      else if (key === 'y') sel.forEach(el => this.translateSubtree(el, 0, val - box.y, new Map()));
      else if (key === 'w' || key === 'h') {
        const nb = { x: box.x, y: box.y, w: key === 'w' ? Math.max(1, val) : box.w, h: key === 'h' ? Math.max(1, val) : box.h };
        const sx = nb.w / box.w, sy = nb.h / box.h;
        this.startStates = this.captureStates(sel);
        for (const el of sel) {
          const st = this.startStates.get(el.id);
          this.resizeElement(el, st, { x: nb.x + (st.x - box.x) * sx, y: nb.y + (st.y - box.y) * sy, w: st.width * sx, h: st.height * sy }, 'proportional');
        }
        this.startStates.clear();
      } else if (key === 'rotation') sel.forEach(el => this.rotateSubtree(el, val - el.rotation, { x: el.x + el.width / 2, y: el.y + el.height / 2 }, new Map()));
      else if (key === 'radius') sel.forEach(el => { el.cornerRadius = Math.max(0, val); });
    }
    this.changed();
  },

  alignSelection(mode) {
    const m = this.model;
    const sel = this.movable();
    if (!sel.length) return;
    let ref;
    if (sel.length === 1) {
      const parent = m.parentOf(sel[0]);
      if (!parent) { Utils.toast('Select 2+ layers, or a layer inside a frame, to align', 'ℹ️'); return; }
      ref = Utils.aabb(parent);
    } else ref = Utils.unionBounds(sel.map(e => Utils.aabb(e)));
    for (const el of sel) {
      const b = Utils.aabb(el);
      let dx = 0, dy = 0;
      if (mode === 'left') dx = ref.x - b.x;
      if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (mode === 'top') dy = ref.y - b.y;
      if (mode === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      this.translateSubtree(el, Math.round(dx * 100) / 100, Math.round(dy * 100) / 100, new Map());
    }
    this.commit();
  },
  distributeSelection(axis) {
    const sel = this.movable();
    if (sel.length < 3) { Utils.toast('Select 3 or more layers to distribute', 'ℹ️'); return; }
    const items = sel.map(el => ({ el, b: Utils.aabb(el) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y));
    const first = items[0].b, last = items[items.length - 1].b;
    const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y;
    const total = items.reduce((s, it) => s + (axis === 'h' ? it.b.w : it.b.h), 0);
    const gap = (span - total) / (items.length - 1);
    let pos = axis === 'h' ? first.x : first.y;
    for (const it of items) {
      const cur = axis === 'h' ? it.b.x : it.b.y;
      const d = Math.round((pos - cur) * 100) / 100;
      this.translateSubtree(it.el, axis === 'h' ? d : 0, axis === 'v' ? d : 0, new Map());
      pos += (axis === 'h' ? it.b.w : it.b.h) + gap;
    }
    this.commit();
  },

  // ===================================================================== Rendering the panel
  setInputValue(id, value, mixed = false) {
    const inp = document.getElementById(id);
    if (!inp || document.activeElement === inp) return;
    inp.value = mixed ? '' : value;
    inp.placeholder = mixed ? 'Mixed' : (id === 'text-line-height' ? 'Auto' : '');
  },
  show(id, visible) { const el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; },

  updateTransformInputs() {
    const sel = this.model.topSelected();
    if (!sel.length) return;
    const r = (n) => Utils.round(n, 2);
    if (sel.length === 1) {
      const el = sel[0];
      this.setInputValue('inp-pos-x', r(el.x)); this.setInputValue('inp-pos-y', r(el.y));
      this.setInputValue('inp-dim-w', r(el.width)); this.setInputValue('inp-dim-h', r(el.height));
      this.setInputValue('inp-rotation', r(el.rotation)); this.setInputValue('inp-corner-radius', r(el.cornerRadius || 0));
    } else {
      const b = this.selectionBox();
      this.setInputValue('inp-pos-x', r(b.x)); this.setInputValue('inp-pos-y', r(b.y));
      this.setInputValue('inp-dim-w', r(b.w)); this.setInputValue('inp-dim-h', r(b.h));
      const rot = sel.every(e => e.rotation === sel[0].rotation), rad = sel.every(e => e.cornerRadius === sel[0].cornerRadius);
      this.setInputValue('inp-rotation', r(sel[0].rotation), !rot); this.setInputValue('inp-corner-radius', r(sel[0].cornerRadius || 0), !rad);
    }
    this.updateStatusBar();
  },

  updatePropertiesUI() {
    const m = this.model;
    const sel = m.topSelected();
    const design = document.getElementById('panel-tab-design');
    design.classList.toggle('no-selection', sel.length === 0);
    const first = sel[0];

    // Empty state
    const page = m.page;
    const sw = document.getElementById('page-bg-swatch');
    sw.style.background = page.bg;
    this.setInputValue('page-bg-hex', page.bg.toUpperCase());
    document.getElementById('page-layer-count').textContent = `${m.elements.length} layers · ${m.roots().filter(e => e.type === 'frame').length} frames`;

    if (this.activeRightTab === 'prototype') this.populatePrototypeTab(first);
    if (this.activeRightTab === 'inspect') this.populateInspect(first);
    if (!first) return;

    this.updateTransformInputs();
    document.getElementById('btn-lock-aspect').classList.toggle('active', !!first.constrainProportions);
    const shapeCount = sel.length === 1 && (first.type === 'polygon' || first.type === 'star');
    this.show('row-shape-count', shapeCount);
    if (shapeCount) {
      document.getElementById('lbl-shape-count').textContent = first.type === 'star' ? 'Points' : 'Sides';
      this.setInputValue('inp-shape-count', first.type === 'star' ? first.starPoints : first.polygonSides);
    }
    const frames = sel.filter(e => e.type === 'frame');
    this.show('row-clip-content', frames.length > 0);
    document.getElementById('chk-clip-content').checked = frames.length > 0 && frames.every(f => f.clipContent !== false);
    this.show('inp-corner-radius', true);

    // Auto layout
    const single = sel.length === 1 ? first : null;
    const alFrame = single && single.type === 'frame' ? single : null;
    const alOn = !!(alFrame && alFrame.isAutoLayout);
    document.getElementById('btn-toggle-autolayout').textContent = alOn ? '−' : '+';
    document.getElementById('btn-toggle-autolayout').title = alOn ? 'Remove auto layout' : 'Add auto layout (Shift+A)';
    const alc = document.getElementById('autolayout-controls');
    alc.style.display = alOn ? 'flex' : 'none';
    if (alOn) {
      document.getElementById('al-dir-h').classList.toggle('active', alFrame.layoutDirection === 'horizontal');
      document.getElementById('al-dir-v').classList.toggle('active', alFrame.layoutDirection === 'vertical');
      this.setInputValue('al-gap', alFrame.layoutGap);
      const pads = [alFrame.layoutPaddingTop, alFrame.layoutPaddingRight, alFrame.layoutPaddingBottom, alFrame.layoutPaddingLeft];
      this.setInputValue('al-padding', pads[0], !pads.every(p => p === pads[0]));
      const pos = alFrame.layoutAlign === 'center-center' || alFrame.layoutAlign === 'center' ? 'center' : alFrame.layoutAlign;
      document.querySelectorAll('#al-align-matrix .align-matrix-cell').forEach(c => c.classList.toggle('active', c.dataset.pos === pos));
      document.getElementById('al-primary-sizing').value = alFrame.primarySizing;
      document.getElementById('al-counter-sizing').value = alFrame.counterSizing;
    }

    // Constraints (inside non-auto-layout frames)
    const parent = single ? m.parentOf(single) : null;
    const showCons = !!(parent && parent.type === 'frame' && !parent.isAutoLayout);
    this.show('sec-constraints', showCons);
    if (showCons) {
      document.getElementById('sel-constraint-h').value = single.constraints.horizontal;
      document.getElementById('sel-constraint-v').value = single.constraints.vertical;
      const h = single.constraints.horizontal, v = single.constraints.vertical;
      document.querySelector('.constraint-pin.pin-left').classList.toggle('active', h === 'left' || h === 'left-right');
      document.querySelector('.constraint-pin.pin-right').classList.toggle('active', h === 'right' || h === 'left-right');
      document.querySelector('.constraint-pin.pin-top').classList.toggle('active', v === 'top' || v === 'top-bottom');
      document.querySelector('.constraint-pin.pin-bottom').classList.toggle('active', v === 'bottom' || v === 'top-bottom');
    }

    // Layout grids
    this.show('sec-layout-grid', !!alFrame);
    if (alFrame) this.renderLayoutGrids(alFrame);

    // Paint lists
    this.renderFillsList(first, sel);
    this.renderStrokesList(first, sel);
    this.renderEffectsList(first, sel);

    // Blend & opacity
    document.getElementById('layer-blend-mode').value = first.blendMode || 'source-over';
    const op = Math.round(first.opacity * 100);
    document.getElementById('layer-opacity-slider').value = op;
    this.setInputValue('layer-opacity-val', op, !sel.every(e => e.opacity === first.opacity));

    // Typography
    const texts = sel.filter(e => e.type === 'text');
    this.show('sec-text-props', texts.length > 0);
    if (texts.length) {
      const t = texts[0];
      const fam = document.getElementById('text-font-family');
      if (![...fam.options].some(o => o.value === t.fontFamily)) {
        const o = document.createElement('option'); o.value = t.fontFamily; o.textContent = t.fontFamily.split(',')[0].replace(/["']/g, ''); fam.appendChild(o);
      }
      fam.value = t.fontFamily;
      const wSel = document.getElementById('text-font-weight');
      if (![...wSel.options].some(o => Number(o.value) === t.fontWeight)) { const o = document.createElement('option'); o.value = t.fontWeight; o.textContent = String(t.fontWeight); wSel.appendChild(o); }
      wSel.value = String(t.fontWeight);
      this.setInputValue('text-font-size', Utils.round(t.fontSize, 2), !texts.every(x => x.fontSize === t.fontSize));
      this.setInputValue('text-line-height', t.lineHeight ? Utils.round(t.lineHeight, 2) : '');
      this.setInputValue('text-letter-spacing', Utils.round(t.letterSpacing || 0, 2));
      [['btn-align-txt-left', 'left'], ['btn-align-txt-center', 'center'], ['btn-align-txt-right', 'right']].forEach(([id, v]) => document.getElementById(id).classList.toggle('active', t.textAlign === v));
      document.querySelectorAll('#text-resize-group button').forEach(b => b.classList.toggle('active', b.dataset.mode === t.textAutoResize));
    }

    // Components
    const isComp = single && (single.isComponentMaster || single.isComponentInstance);
    this.show('sec-component-props', !!isComp);
    if (isComp) {
      this.show('btn-create-instance', single.isComponentMaster);
      this.show('btn-detach-instance', single.isComponentInstance);
      this.show('btn-goto-master', single.isComponentInstance);
      this.show('btn-reset-overrides', single.isComponentInstance && (single.overrides.length > 0 || m.descendantsOf(single.id).some(d => d.overrides.length)));
      const info = document.getElementById('component-info');
      if (single.isComponentMaster) {
        const count = m.allElements().filter(e => e.masterComponentId === single.id).length;
        info.textContent = `Main component · ${count} instance${count === 1 ? '' : 's'} — edits here update every instance.`;
      } else {
        const master = m.findAnywhere(single.masterComponentId);
        info.textContent = master ? `Instance of “${master.name}”${single.overrides.length ? ` · overrides: ${single.overrides.join(', ')}` : ''}` : 'Main component no longer exists.';
      }
    }
  },

  // ===================================================================== Paint lists
  swatchStyle(fill) {
    if (fill.type === 'solid') return Utils.rgba(fill.color, fill.opacity ?? 1);
    return Exporters.cssColorOf(fill);
  },
  /** A list keeps its DOM while the user types in it — but only for the same selection (QA-13: after a new
   *  selection a still-focused field from the previous layer must not keep editing that layer). */
  listBusy(list) {
    const key = [...this.model.selectedIds].join('|') + '#' + this.model.currentPageId;
    const a = document.activeElement;
    const focused = list.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range', 'color'].includes(a.type))); // QA-21: dropdowns / toggles re-render at once
    if (list._for !== key) { list._for = key; if (focused) document.activeElement.blur(); return false; }
    return focused;
  },

  renderFillsList(el, sel) {
    const list = document.getElementById('fill-layers-list');
    if (this.listBusy(list)) return;
    list.innerHTML = '';
    const each = (idx, fn) => { for (const s of sel) { if (s.fills[idx]) fn(s.fills[idx], s); this.markOverride(s, 'fills'); } };
    if (sel.length > 1 && !sel.every(s => JSON.stringify(s.fills) === JSON.stringify(el.fills))) {
      const note = document.createElement('div'); note.className = 'muted-text'; note.textContent = 'Mixed fills — edits apply to every selected layer.'; list.appendChild(note);
    }
    el.fills.forEach((fill, idx) => {
      const row = document.createElement('div');
      row.className = 'paint-block';
      row.innerHTML = `
        <div class="layer-prop-row">
          <div class="color-swatch-btn" role="button" tabindex="0" aria-label="Edit fill color"></div>
          <select class="sel-fill-type" aria-label="Fill type"><option value="solid">Solid</option><option value="linear">Linear</option><option value="radial">Radial</option></select>
          <input type="text" class="hex-input" spellcheck="false" aria-label="Fill hex" />
          <input type="number" class="pct-input" min="0" max="100" aria-label="Fill opacity" />%
          <button class="prop-icon-btn btn-eye" title="Toggle visibility" aria-label="Toggle fill visibility"></button>
          <button class="prop-icon-btn btn-del" title="Remove fill" aria-label="Remove fill">✕</button>
        </div>`;
      const swatch = row.querySelector('.color-swatch-btn');
      swatch.style.background = this.swatchStyle(fill);
      const typeSel = row.querySelector('.sel-fill-type'); typeSel.value = fill.type;
      const hex = row.querySelector('.hex-input');
      hex.value = fill.type === 'solid' ? Utils.toHex(fill.color).toUpperCase() : (fill.type === 'linear' ? `${Math.round(fill.angle)}°` : 'Radial');
      hex.disabled = fill.type !== 'solid';
      const pct = row.querySelector('.pct-input'); pct.value = Math.round((fill.opacity ?? 1) * 100);
      const eye = row.querySelector('.btn-eye'); eye.textContent = fill.visible === false ? '◌' : '👁';
      const openPicker = () => {
        if (fill.type !== 'solid') return;
        this.openColorPicker(swatch, fill.color, fill.opacity ?? 1, (h, a) => {
          each(idx, f => { f.color = h; f.opacity = a; });
          swatch.style.background = Utils.rgba(h, a); hex.value = h.toUpperCase(); pct.value = Math.round(a * 100);
          this.requestRender();
        });
      };
      swatch.addEventListener('click', openPicker);
      swatch.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
      typeSel.addEventListener('change', () => {
        if (list.contains(document.activeElement) && document.activeElement !== typeSel) document.activeElement.blur(); list._for = null; // QA-21: rebuild the row for the new type
        each(idx, f => { f.type = typeSel.value; if (!f.stops || f.stops.length < 2) f.stops = [{ pos: 0, color: f.color }, { pos: 1, color: '#9747ff' }]; if (f.type !== 'solid' && f.stops[0].color === '#0d99ff' && f.stops[1].color === '#9747ff') { f.stops[0].color = f.color; } });
        this.commit();
      });
      hex.addEventListener('change', () => {
        const v = hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`;
        if (Utils.parseColor(v)) { each(idx, f => { f.color = Utils.toHex(v); }); this.commit(); } else hex.value = Utils.toHex(fill.color).toUpperCase();
      });
      pct.addEventListener('input', () => { if (pct.value === '') return; each(idx, f => { f.opacity = Utils.clamp(Utils.num(pct.value, 100), 0, 100) / 100; }); this.requestRender(); });
      pct.addEventListener('change', () => this.commit());
      eye.addEventListener('click', () => { each(idx, f => { f.visible = f.visible === false; }); this.commit(); });
      row.querySelector('.btn-del').addEventListener('click', () => { for (const s of sel) { s.fills.splice(idx, 1); this.markOverride(s, 'fills'); } this.commit(); });
      if (fill.type !== 'solid') row.appendChild(this.gradientEditor(fill, idx, sel));
      list.appendChild(row);
    });
  },

  gradientEditor(fill, idx, sel) {
    const wrap = document.createElement('div');
    wrap.className = 'gradient-editor';
    const bar = document.createElement('div');
    bar.className = 'gradient-bar';
    bar.style.background = `linear-gradient(90deg, ${fill.stops.map(s => `${Utils.rgba(s.color)} ${s.pos * 100}%`).join(', ')})`;
    bar.title = 'Click to add a color stop';
    wrap.appendChild(bar);
    const each = (fn) => { for (const s of sel) if (s.fills[idx]) fn(s.fills[idx]); };
    fill.stops.forEach((stop, si) => {
      const h = document.createElement('div');
      h.className = 'gradient-stop';
      h.style.left = `${stop.pos * 100}%`;
      h.style.background = Utils.rgba(stop.color);
      h.title = 'Drag to move · click to edit · double-click to remove';
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        h.setPointerCapture(e.pointerId);
        const r = bar.getBoundingClientRect();
        let dragged = false;
        const move = (ev) => {
          dragged = true;
          const pos = Utils.clamp((ev.clientX - r.left) / r.width, 0, 1);
          each(f => { if (f.stops[si]) f.stops[si].pos = Utils.round(pos, 3); });
          h.style.left = `${pos * 100}%`;
          bar.style.background = `linear-gradient(90deg, ${fill.stops.slice().sort((a, b) => a.pos - b.pos).map(s => `${Utils.rgba(s.color)} ${s.pos * 100}%`).join(', ')})`;
          this.requestRender();
        };
        const up = () => {
          h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up);
          if (dragged) { each(f => f.stops.sort((a, b) => a.pos - b.pos)); this.commit(); }
          else this.openColorPicker(h, stop.color, Utils.alphaOf(stop.color), (hex, a) => { each(f => { if (f.stops[si]) f.stops[si].color = a < 1 ? Utils.rgba(hex, a) : hex; }); h.style.background = Utils.rgba(hex, a); this.requestRender(); });
        };
        h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
      });
      h.addEventListener('dblclick', () => { if (fill.stops.length > 2) { each(f => f.stops.splice(si, 1)); this.commit(); } });
      bar.appendChild(h);
    });
    bar.addEventListener('pointerdown', (e) => {
      if (e.target !== bar) return;
      const r = bar.getBoundingClientRect();
      const pos = Utils.round(Utils.clamp((e.clientX - r.left) / r.width, 0, 1), 3);
      const color = (() => {
        const st = fill.stops.slice().sort((a, b) => a.pos - b.pos);
        for (let i = 0; i < st.length - 1; i++) if (pos >= st[i].pos && pos <= st[i + 1].pos) return Utils.mixColor(st[i].color, st[i + 1].color, (pos - st[i].pos) / ((st[i + 1].pos - st[i].pos) || 1));
        return st[0].color;
      })();
      each(f => { f.stops.push({ pos, color }); f.stops.sort((a, b) => a.pos - b.pos); });
      this.commit();
    });
    if (fill.type === 'linear') {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.innerHTML = '<div class="prop-input-group"><span data-scrub="angle">∠</span><input type="number" class="grad-angle" step="1" aria-label="Gradient angle" /></div><button class="prop-icon-btn grad-reverse" title="Reverse gradient">⇄</button>';
      const inp = row.querySelector('.grad-angle');
      inp.value = Math.round(fill.angle ?? 90);
      inp.addEventListener('input', () => { each(f => { f.angle = Utils.num(inp.value, 90); }); this.requestRender(); });
      inp.addEventListener('change', () => this.commit());
      row.querySelector('.grad-reverse').addEventListener('click', () => { each(f => { f.stops = f.stops.map(s => ({ ...s, pos: Utils.round(1 - s.pos, 3) })).sort((a, b) => a.pos - b.pos); }); this.commit(); });
      wrap.appendChild(row);
      this.bindScrubbers(row);
    }
    return wrap;
  },

  renderStrokesList(el, sel) {
    const list = document.getElementById('stroke-layers-list');
    if (this.listBusy(list)) return;
    list.innerHTML = '';
    const each = (idx, fn) => { for (const s of sel) { if (s.strokes[idx]) fn(s.strokes[idx]); this.markOverride(s, 'strokes'); } };
    el.strokes.forEach((st, idx) => {
      const row = document.createElement('div');
      row.className = 'layer-prop-row';
      row.innerHTML = `
        <div class="color-swatch-btn" role="button" tabindex="0" aria-label="Edit stroke color"></div>
        <input type="text" class="hex-input" spellcheck="false" aria-label="Stroke hex" />
        <input type="number" class="w-input" min="0" step="0.5" aria-label="Stroke width" title="Stroke width" />
        <select class="sel-align" aria-label="Stroke position"><option value="inside">Inside</option><option value="center">Center</option><option value="outside">Outside</option></select>
        <button class="prop-icon-btn btn-eye" aria-label="Toggle stroke visibility"></button>
        <button class="prop-icon-btn btn-del" aria-label="Remove stroke">✕</button>`;
      const swatch = row.querySelector('.color-swatch-btn'); swatch.style.background = Utils.rgba(st.color);
      const hex = row.querySelector('.hex-input'); hex.value = Utils.toHex(st.color).toUpperCase();
      const w = row.querySelector('.w-input'); w.value = st.width;
      const al = row.querySelector('.sel-align'); al.value = st.align || 'center'; al.disabled = Geometry.isOpen(el);
      const eye = row.querySelector('.btn-eye'); eye.textContent = st.visible === false ? '◌' : '👁';
      const pick = () => this.openColorPicker(swatch, st.color, Utils.alphaOf(st.color), (h, a) => { each(idx, s => { s.color = a < 1 ? Utils.rgba(h, a) : h; }); swatch.style.background = Utils.rgba(h, a); hex.value = h.toUpperCase(); this.requestRender(); });
      swatch.addEventListener('click', pick);
      swatch.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      hex.addEventListener('change', () => { const v = hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`; if (Utils.parseColor(v)) { each(idx, s => { s.color = Utils.toHex(v); }); this.commit(); } });
      w.addEventListener('input', () => { if (w.value === '') return; each(idx, s => { s.width = Math.max(0, Utils.num(w.value, 1)); }); this.requestRender(); });
      w.addEventListener('change', () => this.commit());
      al.addEventListener('change', () => { each(idx, s => { s.align = al.value; }); this.commit(); });
      eye.addEventListener('click', () => { each(idx, s => { s.visible = s.visible === false; }); this.commit(); });
      row.querySelector('.btn-del').addEventListener('click', () => { sel.forEach(s => { s.strokes.splice(idx, 1); this.markOverride(s, 'strokes'); }); this.commit(); });
      list.appendChild(row);
    });
  },

  renderEffectsList(el, sel) {
    const list = document.getElementById('effects-layers-list');
    if (this.listBusy(list)) return;
    list.innerHTML = '';
    const each = (idx, fn) => { for (const s of sel) { if (s.effects[idx]) fn(s.effects[idx]); this.markOverride(s, 'effects'); } };
    el.effects.forEach((eff, idx) => {
      const card = document.createElement('div');
      card.className = 'effect-card';
      const isShadow = eff.type.endsWith('Shadow');
      card.innerHTML = `
        <div class="effect-card-header">
          <select class="sel-eff-type" aria-label="Effect type"><option value="dropShadow">Drop shadow</option><option value="innerShadow">Inner shadow</option><option value="layerBlur">Layer blur</option><option value="backgroundBlur">Background blur</option></select>
          <span class="effect-actions">${isShadow ? '<span class="color-swatch-btn eff-color" role="button" tabindex="0" aria-label="Shadow color"></span>' : ''}<button class="prop-icon-btn btn-eye" aria-label="Toggle effect"></button><button class="prop-icon-btn btn-del-eff" aria-label="Remove effect">✕</button></span>
        </div>
        <div class="effect-params-grid">
          ${isShadow ? '<div class="prop-input-group"><span data-scrub="x">X</span><input type="number" data-k="x"/></div><div class="prop-input-group"><span data-scrub="y">Y</span><input type="number" data-k="y"/></div>' : ''}
          <div class="prop-input-group"><span data-scrub="blur">Blur</span><input type="number" min="0" data-k="blur"/></div>
          ${isShadow ? '<div class="prop-input-group"><span data-scrub="spread">Spread</span><input type="number" data-k="spread"/></div>' : ''}
        </div>`;
      const typeSel = card.querySelector('.sel-eff-type'); typeSel.value = eff.type;
      typeSel.addEventListener('change', () => { each(idx, e => { e.type = typeSel.value; }); this.commit(); });
      card.querySelectorAll('input[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        inp.value = Utils.round(eff[k] || 0, 2);
        inp.addEventListener('input', () => { if (inp.value === '') return; each(idx, e => { e[k] = k === 'blur' ? Math.max(0, Utils.num(inp.value)) : Utils.num(inp.value); }); this.requestRender(); });
        inp.addEventListener('change', () => this.commit());
      });
      const sw = card.querySelector('.eff-color');
      if (sw) {
        sw.style.background = Utils.rgba(eff.color);
        sw.addEventListener('click', () => this.openColorPicker(sw, eff.color, Utils.alphaOf(eff.color), (h, a) => { each(idx, e => { e.color = Utils.rgba(h, a); }); sw.style.background = Utils.rgba(h, a); this.requestRender(); }));
      }
      const eye = card.querySelector('.btn-eye'); eye.textContent = eff.visible === false ? '◌' : '👁';
      eye.addEventListener('click', () => { each(idx, e => { e.visible = e.visible === false; }); this.commit(); });
      card.querySelector('.btn-del-eff').addEventListener('click', () => { sel.forEach(s => { s.effects.splice(idx, 1); this.markOverride(s, 'effects'); }); this.commit(); });
      this.bindScrubbers(card);
      list.appendChild(card);
    });
  },

  renderLayoutGrids(frame) {
    const list = document.getElementById('layout-grids-list');
    if (this.listBusy(list)) return;
    list.innerHTML = '';
    frame.layoutGrids.forEach((g, idx) => {
      const row = document.createElement('div');
      row.className = 'layer-prop-row grid-row';
      row.innerHTML = `
        <span class="color-swatch-btn" role="button" tabindex="0" aria-label="Grid color"></span>
        <select class="sel-grid-type" aria-label="Grid type"><option value="columns">Columns</option><option value="rows">Rows</option><option value="grid">Grid</option></select>
        ${g.type === 'grid' ? '<input type="number" data-k="size" min="1" title="Size" aria-label="Grid size"/>' : '<input type="number" data-k="count" min="1" max="48" title="Count" aria-label="Count"/><input type="number" data-k="gutter" min="0" title="Gutter" aria-label="Gutter"/><input type="number" data-k="margin" min="0" title="Margin" aria-label="Margin"/>'}
        <button class="prop-icon-btn btn-eye" aria-label="Toggle grid"></button>
        <button class="prop-icon-btn btn-del" aria-label="Remove grid">✕</button>`;
      const sw = row.querySelector('.color-swatch-btn'); sw.style.background = Utils.rgba(g.color);
      sw.addEventListener('click', () => this.openColorPicker(sw, g.color, Utils.alphaOf(g.color), (h, a) => { g.color = Utils.rgba(h, a); sw.style.background = g.color; this.requestRender(); }));
      const t = row.querySelector('.sel-grid-type'); t.value = g.type;
      t.addEventListener('change', () => { g.type = t.value; this.commit(); });
      row.querySelectorAll('input[data-k]').forEach(inp => {
        inp.value = g[inp.dataset.k];
        inp.addEventListener('input', () => { if (inp.value === '') return; g[inp.dataset.k] = Math.max(inp.dataset.k === 'count' ? 1 : 0, Utils.num(inp.value)); this.requestRender(); });
        inp.addEventListener('change', () => this.commit());
      });
      const eye = row.querySelector('.btn-eye'); eye.textContent = g.visible === false ? '◌' : '👁';
      eye.addEventListener('click', () => { g.visible = g.visible === false; this.commit(); });
      row.querySelector('.btn-del').addEventListener('click', () => { frame.layoutGrids.splice(idx, 1); this.commit(); });
      list.appendChild(row);
    });
  },

  // ===================================================================== Prototype tab
  populatePrototypeTab(el) {
    const m = this.model;
    const cont = document.getElementById('proto-interactions-list');
    const ps = m.prototypeSettings;
    document.getElementById('proto-flow-name').value = ps.flowName;
    document.getElementById('proto-device-select').value = ps.device;
    document.getElementById('proto-bg-color').value = Utils.toHex(ps.canvasBg);
    document.getElementById('btn-add-interaction').disabled = !el;
    const start = document.getElementById('proto-starting-frame');
    const root = el ? this.rootOf(el) : null;
    start.disabled = !(root && root.type === 'frame');
    start.checked = !!(root && ps.startingFrameId === root.id);
    const frameForOverflow = el ? (el.type === 'frame' ? el : root) : null;
    document.querySelectorAll('input[name="proto-overflow"]').forEach(r => { r.disabled = !(frameForOverflow && frameForOverflow.type === 'frame'); r.checked = frameForOverflow ? r.value === (frameForOverflow.overflowScroll || 'none') : r.value === 'none'; });
    if (this.listBusy(cont)) return;
    cont.innerHTML = '';
    if (!el) { cont.innerHTML = '<div class="muted-text">Select a layer, then add an interaction to link it to another frame.</div>'; return; }
    const frames = m.roots().filter(f => f.type === 'frame');
    el.interactions.forEach((inter, idx) => {
      const card = document.createElement('div');
      card.className = 'interaction-card';
      card.innerHTML = `
        <div class="interaction-card-header"><span>Interaction ${idx + 1}</span><button class="prop-icon-btn btn-del-inter" aria-label="Remove interaction">✕</button></div>
        <div class="prop-row"><span class="prop-label">Trigger</span><select data-k="trigger"><option value="click">On click</option><option value="hover">While hovering</option><option value="drag">On drag</option><option value="delay">After delay</option></select></div>
        <div class="prop-row row-delay"><span class="prop-label">Delay</span><input type="number" data-k="delay" min="0" step="100" /> ms</div>
        <div class="prop-row"><span class="prop-label">Action</span><select data-k="action"><option value="navigate">Navigate to</option><option value="overlay">Open overlay</option><option value="back">Back</option><option value="url">Open URL</option><option value="fire">Fire trigger (global)</option><option value="set">Set input (global)</option></select></div>
        <div class="prop-row row-input"><span class="prop-label">Input</span><select data-k="inputId"></select></div>
        <div class="prop-row row-value"><span class="prop-label">Value</span><input type="text" data-k="value" /></div>
        <div class="prop-row row-target"><span class="prop-label">Destination</span><select data-k="targetId"></select></div>
        <div class="prop-row row-url"><span class="prop-label">URL</span><input type="text" data-k="url" placeholder="https://…" spellcheck="false" /></div>
        <div class="prop-row row-trans"><span class="prop-label">Animation</span><select data-k="transition"><option value="instant">Instant</option><option value="dissolve">Dissolve</option><option value="slide">Slide in</option><option value="push">Push</option></select></div>
        <div class="prop-row row-trans"><span class="prop-label">Duration</span><input type="number" data-k="duration" min="0" step="50" /> ms</div>`;
      const target = card.querySelector('[data-k="targetId"]');
      for (const f of frames) {
        const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; target.appendChild(o);
      }
      if (!frames.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'No frames on this page'; target.appendChild(o); }
      const inSel = card.querySelector('[data-k="inputId"]');
      for (const def of m.inputs.filter(i => inter.action !== 'fire' || i.type === 'trigger')) { const o = document.createElement('option'); o.value = def.id; o.textContent = `${def.name} (${def.type})`; inSel.appendChild(o); }
      if (!inSel.options.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'No inputs — add them in Animate mode'; inSel.appendChild(o); }
      card.querySelectorAll('[data-k]').forEach(inp => {
        const k = inp.dataset.k;
        inp.value = inter[k] ?? '';
        inp.addEventListener('change', () => {
          let v = inp.value;
          if (k === 'duration' || k === 'delay') v = Math.max(0, Utils.num(v));
          if (k === 'url') v = /^https?:\/\//i.test(v.trim()) ? v.trim() : (v.trim() ? `https://${v.trim()}` : '');
          if (k === 'value') v = v === 'true' ? true : v === 'false' ? false : Utils.num(v, 1);
          if (k === 'action' && (v === 'fire' || v === 'set') && !inter.inputId) inter.inputId = (m.inputs.find(i => v !== 'fire' || i.type === 'trigger') || {}).id || null;
          inter[k] = v;
          this.markOverride(el, 'interactions');
          this.commit();
        });
      });
      const vis = () => {
        card.querySelector('.row-delay').style.display = inter.trigger === 'delay' ? '' : 'none';
        card.querySelector('.row-target').style.display = inter.action === 'navigate' || inter.action === 'overlay' ? '' : 'none';
        card.querySelector('.row-input').style.display = inter.action === 'fire' || inter.action === 'set' ? '' : 'none';
        card.querySelector('.row-value').style.display = inter.action === 'set' ? '' : 'none';
        card.querySelector('.row-url').style.display = inter.action === 'url' ? '' : 'none';
        card.querySelectorAll('.row-trans').forEach(r => { r.style.display = ['url', 'fire', 'set'].includes(inter.action) ? 'none' : ''; });
      };
      vis();
      card.querySelector('.btn-del-inter').addEventListener('click', () => { el.interactions.splice(idx, 1); this.commit(); });
      cont.appendChild(card);
    });
  },

  // ===================================================================== Inspect tab
  populateInspect(el) {
    const $ = (id) => document.getElementById(id);
    const tbody = document.querySelector('#inspect-props-table tbody');
    if (!el) {
      $('inspect-css-code').textContent = '/* Select a layer */';
      ['react', 'swift', 'kotlin', 'flutter'].forEach(k => { $(`inspect-${k}-code`).textContent = '// Select a layer'; });
      tbody.innerHTML = '<tr><td colspan="2">No selection</td></tr>';
      return;
    }
    const out = Exporters.inspect(this.model, el);
    $('inspect-css-code').textContent = out.css;
    $('inspect-react-code').textContent = out.react;
    $('inspect-swift-code').textContent = out.swift;
    $('inspect-kotlin-code').textContent = out.kotlin;
    $('inspect-flutter-code').textContent = out.flutter;
    tbody.innerHTML = '';
    for (const [k, v] of out.table) {
      const tr = document.createElement('tr');
      const a = document.createElement('td'); a.textContent = k;
      const b = document.createElement('td'); b.className = 'copyable-cell'; b.textContent = v; b.title = 'Click to copy';
      tr.append(a, b); tbody.appendChild(tr);
    }
  },

  // ===================================================================== Color picker
  bindColorPicker() {
    const $ = (id) => document.getElementById(id);
    const pop = $('color-picker-popover');
    this.picker = { h: 205, s: 1, v: 1, a: 1, cb: null, changed: false };
    const drag = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        const upd = (ev) => { const r = el.getBoundingClientRect(); fn(Utils.clamp((ev.clientX - r.left) / r.width, 0, 1), Utils.clamp((ev.clientY - r.top) / r.height, 0, 1)); this.pickerRender(); this.pickerEmit(); };
        upd(e);
        const up = () => { el.removeEventListener('pointermove', upd); el.removeEventListener('pointerup', up); };
        el.addEventListener('pointermove', upd); el.addEventListener('pointerup', up);
      });
    };
    drag($('color-sb-area'), (x, y) => { this.picker.s = x; this.picker.v = 1 - y; });
    drag($('hue-slider'), (x) => { this.picker.h = x * 360; });
    drag($('alpha-slider'), (x) => { this.picker.a = Utils.round(x, 2); });
    $('color-hex-val').addEventListener('change', (e) => {
      const v = e.target.value.trim().startsWith('#') ? e.target.value.trim() : `#${e.target.value.trim()}`;
      const c = Utils.parseColor(v);
      if (c) { Object.assign(this.picker, Utils.rgbToHsv(c.r, c.g, c.b)); if (c.a < 1) this.picker.a = c.a; this.pickerRender(); this.pickerEmit(); }
    });
    ['r', 'g', 'b'].forEach(ch => $(`color-rgb-${ch}`).addEventListener('change', () => {
      const r = Utils.clamp(Utils.num($('color-rgb-r').value), 0, 255), g = Utils.clamp(Utils.num($('color-rgb-g').value), 0, 255), b = Utils.clamp(Utils.num($('color-rgb-b').value), 0, 255);
      Object.assign(this.picker, Utils.rgbToHsv(r, g, b)); this.pickerRender(); this.pickerEmit();
    }));
    ['h', 's', 'l'].forEach(ch => $(`color-hsl-${ch}`).addEventListener('change', () => {
      const c = Utils.hslToRgb(Utils.num($('color-hsl-h').value), Utils.num($('color-hsl-s').value), Utils.num($('color-hsl-l').value));
      Object.assign(this.picker, Utils.rgbToHsv(c.r, c.g, c.b)); this.pickerRender(); this.pickerEmit();
    }));
    $('color-alpha-val').addEventListener('change', (e) => { this.picker.a = Utils.clamp(Utils.num(e.target.value, 100), 0, 100) / 100; this.pickerRender(); this.pickerEmit(); });
    $('color-format-select').addEventListener('change', (e) => {
      $('color-inputs-hex').style.display = e.target.value === 'hex' ? 'flex' : 'none';
      $('color-inputs-rgb').style.display = e.target.value === 'rgb' ? 'flex' : 'none';
      $('color-inputs-hsl').style.display = e.target.value === 'hsl' ? 'flex' : 'none';
    });
    $('btn-picker-eyedropper').addEventListener('click', async () => {
      const apply = (hex) => { const c = Utils.parseColor(hex); Object.assign(this.picker, Utils.rgbToHsv(c.r, c.g, c.b)); this.pickerRender(); this.pickerEmit(); };
      if (window.EyeDropper) {
        try { const res = await new window.EyeDropper().open(); apply(res.sRGBHex); } catch (e) { /* cancelled */ }
        return;
      }
      const keep = this.picker.cb;
      pop.style.display = 'none';
      this.toolBeforeEyedropper = this.model.activeTool;
      this.eyedropperCallback = (hex) => { pop.style.display = 'flex'; this.picker.cb = keep; apply(hex); };
      this.setTool('eyedropper');
      Utils.toast('Click anywhere on the canvas to sample a color', '💉');
    });
    const swatchClick = (e) => {
      const sw = e.target.closest('.mini-swatch'); if (!sw) return;
      const c = Utils.parseColor(sw.dataset.color);
      if (!c) return;
      Object.assign(this.picker, Utils.rgbToHsv(c.r, c.g, c.b));
      this.pickerRender(); this.pickerEmit();
    };
    $('picker-recent-colors').addEventListener('click', swatchClick);
    $('picker-doc-colors').addEventListener('click', swatchClick);
    window.addEventListener('pointerdown', (e) => {
      if (pop.style.display === 'flex' && !pop.contains(e.target) && !e.target.closest('.color-swatch-btn, .gradient-stop')) this.closeColorPicker();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pop.style.display === 'flex') { this.closeColorPicker(); e.stopPropagation(); } }, true);
  },
  openColorPicker(anchor, color, alpha, cb, { showAlpha = true, onClose = null } = {}) {
    if (this.picker.cb) this.closeColorPicker();
    const pop = document.getElementById('color-picker-popover');
    const c = Utils.parseColor(color) || { r: 13, g: 153, b: 255, a: 1 };
    Object.assign(this.picker, Utils.rgbToHsv(c.r, c.g, c.b), { a: alpha ?? c.a, cb, changed: false, showAlpha, onClose });
    this.picker.original = Utils.rgba(Utils.rgbToHex(c.r, c.g, c.b), this.picker.a);
    document.getElementById('picker-old-swatch').style.background = this.picker.original;
    document.getElementById('alpha-slider').style.display = showAlpha ? '' : 'none';
    document.getElementById('color-alpha-val').style.display = showAlpha ? '' : 'none';
    pop.style.display = 'flex';
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = r.left - pw - 12;
    if (left < 8) left = Math.min(window.innerWidth - pw - 8, r.right + 12);
    pop.style.left = `${left}px`;
    pop.style.top = `${Utils.clamp(r.top - 40, 8, window.innerHeight - ph - 8)}px`;
    this.renderSwatchRows();
    this.pickerRender();
  },
  closeColorPicker() {
    const pop = document.getElementById('color-picker-popover');
    if (!pop || pop.style.display !== 'flex') return;
    pop.style.display = 'none';
    const p = this.picker;
    const oc = p.onClose; p.onClose = null;
    if (oc) setTimeout(oc, 0);
    if (p.changed) {
      const hex = Utils.rgbToHex(...Object.values(Utils.hsvToRgb(p.h, p.s, p.v)));
      this.recentColors = [hex, ...(this.recentColors || []).filter(c => c !== hex)].slice(0, 12);
      p.changed = false;
      p.cb = null;
      this.commit();
    } else p.cb = null;
  },
  pickerRender() {
    const p = this.picker, $ = (id) => document.getElementById(id);
    const { r, g, b } = Utils.hsvToRgb(p.h, p.s, p.v);
    const hex = Utils.rgbToHex(r, g, b);
    $('color-sb-area').style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${p.h}, 100%, 50%))`;
    $('color-sb-handle').style.left = `${p.s * 100}%`; $('color-sb-handle').style.top = `${(1 - p.v) * 100}%`;
    $('hue-handle').style.left = `${(p.h / 360) * 100}%`;
    $('alpha-handle').style.left = `${p.a * 100}%`;
    $('alpha-slider').style.backgroundImage = `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))`;
    const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    set('color-hex-val', hex.toUpperCase());
    set('color-rgb-r', r); set('color-rgb-g', g); set('color-rgb-b', b);
    const hsl = Utils.rgbToHsl(r, g, b);
    set('color-hsl-h', hsl.h); set('color-hsl-s', hsl.s); set('color-hsl-l', hsl.l);
    set('color-alpha-val', Math.round(p.a * 100));
    $('picker-new-swatch').style.background = Utils.rgba(hex, p.a);
  },
  pickerEmit() {
    const p = this.picker;
    if (!p.cb) return;
    const { r, g, b } = Utils.hsvToRgb(p.h, p.s, p.v);
    p.changed = true;
    p.cb(Utils.rgbToHex(r, g, b), p.showAlpha === false ? 1 : p.a);
  },
  renderSwatchRows() {
    const fill = (id, colors) => {
      const cont = document.getElementById(id);
      cont.innerHTML = '';
      for (const c of colors) {
        const sw = document.createElement('div');
        sw.className = 'mini-swatch'; sw.style.background = c; sw.dataset.color = c; sw.title = c.toUpperCase();
        cont.appendChild(sw);
      }
    };
    this.recentColors = this.recentColors || ['#0d99ff', '#9747ff', '#14ae5c', '#f24822', '#ffcd29', '#ffffff', '#181820'];
    fill('picker-recent-colors', this.recentColors);
    const doc = new Set();
    for (const el of this.model.elements) {
      for (const f of el.fills) if (f.type === 'solid') doc.add(Utils.toHex(f.color));
      for (const s of el.strokes) doc.add(Utils.toHex(s.color));
      if (doc.size >= 18) break;
    }
    for (const c of this.model.styles.colors) doc.add(Utils.toHex(c.color));
    fill('picker-doc-colors', [...doc].slice(0, 18));
  }
};
Object.assign(StudioApp.prototype, PanelsMixin);
