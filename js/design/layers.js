/**
 * DesignStudio — left panel: nested layers tree (drag & drop, rename, search),
 * pages, and assets (components + color / text / effect styles).
 */
'use strict';

const LAYER_ICONS = { frame: '#', group: '▣', text: 'T', ellipse: '○', rect: '▭', line: '╱', arrow: '→', polygon: '△', star: '☆', path: '✎', image: '🖼' };

const LayersMixin = {
  bindLayers() {
    const $ = (id) => document.getElementById(id);
    const leftTabs = document.querySelectorAll('#left-panel .panel-tab-btn');
    leftTabs.forEach(t => t.addEventListener('click', () => {
      leftTabs.forEach(b => b.classList.toggle('active', b === t));
      for (const name of ['layers', 'assets', 'pages']) $(`panel-tab-${name}`).style.display = t.dataset.tab === name ? 'flex' : 'none';
      if (t.dataset.tab === 'assets') this.renderAssets();
    }));
    $('layer-search-input').addEventListener('input', () => this.updateLayersTree());
    $('assets-search-input').addEventListener('input', () => this.renderAssets());
    $('btn-add-page').addEventListener('click', () => this.addPage());
    $('btn-assets-create-comp').addEventListener('click', () => {
      if (!this.model.selectedIds.size) { Utils.toast('Select layers to turn into a component', 'ℹ️'); return; }
      this.run('createComp');
    });
    $('btn-add-color-style').addEventListener('click', () => this.addStyle('colors'));
    $('btn-add-text-style').addEventListener('click', () => this.addStyle('texts'));
    $('btn-add-effect-style').addEventListener('click', () => this.addStyle('effects'));
    this.refreshAssetsLater = Utils.debounce(() => { if ($('panel-tab-assets').style.display !== 'none') this.renderAssets(); }, 250);

    const tree = $('layers-tree');
    tree.addEventListener('pointerleave', () => { this.model.hoveredId = null; this.requestRender(); });
    tree.addEventListener('dragover', (e) => this.onLayerDragOver(e));
    tree.addEventListener('drop', (e) => this.onLayerDrop(e));
    tree.addEventListener('dragleave', (e) => { if (!tree.contains(e.relatedTarget)) this.clearDropIndicators(); });
  },

  // ===================================================================== Layers tree
  updateLayersTree() {
    const m = this.model;
    const list = document.getElementById('layers-tree');
    if (list.querySelector('.tree-rename')) return;
    const q = document.getElementById('layer-search-input').value.trim().toLowerCase();
    const tree = m.buildTree();
    const match = new Set();
    if (q) {
      for (const el of m.elements) if (el.name.toLowerCase().includes(q) || el.type.includes(q)) { match.add(el.id); m.ancestorsOf(el).forEach(a => match.add(a.id)); }
    }
    // expand ancestors of selected
    for (const el of m.getSelectedElements()) m.ancestorsOf(el).forEach(a => this.collapsed.delete(a.id));
    // Fast path: structure unchanged → only refresh selection state (keeps rows stable for dblclick/drag)
    const sig = q + '|' + [...this.collapsed].join(',') + '|' + m.elements.map(e => `${e.id}:${e.parentId}:${e.name}:${e.visible}:${e.locked}:${e.isComponentMaster}:${e.isComponentInstance}:${e.isAutoLayout}:${m.hasTracks(e.id)}`).join(';');
    if (sig === this.layersSig && list.children.length) {
      list.querySelectorAll('.tree-item').forEach(li => {
        const on = m.selectedIds.has(li.dataset.id);
        li.classList.toggle('selected', on);
        li.setAttribute('aria-selected', String(on));
      });
      const s0 = list.querySelector('.tree-item.selected');
      if (s0 && !this.isMouseDown) { const lr = list.getBoundingClientRect(), r = s0.getBoundingClientRect(); if (r.top < lr.top || r.bottom > lr.bottom) s0.scrollIntoView({ block: 'nearest' }); }
      document.getElementById('sb-elem-count').textContent = `${m.elements.length} layers · ${m.page.name}`;
      return;
    }
    this.layersSig = sig;
    const frag = document.createDocumentFragment();
    const rows = [];
    const visit = (el, depth) => {
      if (q && !match.has(el.id)) return;
      const kids = (tree.get(el.id) || []).slice().reverse();
      const li = document.createElement('li');
      const selected = m.selectedIds.has(el.id);
      li.className = 'tree-item' + (selected ? ' selected' : '') + (el.type === 'frame' ? ' frame-item' : '') +
        (el.isComponentMaster || el.isComponentSet ? ' component-item' : '') + (el.isComponentInstance ? ' component-instance' : '') +
        (!el.visible ? ' is-hidden' : '') + (el.locked ? ' is-locked' : '');
      li.dataset.id = el.id;
      li.draggable = true;
      li.style.paddingLeft = `${6 + depth * 14}px`;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-selected', String(selected));
      if (kids.length) li.setAttribute('aria-expanded', String(!this.collapsed.has(el.id)));
      const exp = document.createElement('span');
      exp.className = 'tree-expander';
      exp.textContent = kids.length ? (this.collapsed.has(el.id) && !q ? '▸' : '▾') : '';
      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.textContent = el.isComponentSet ? '❖' : el.isComponentMaster ? '◆' : el.isComponentInstance ? '◇' : (el.type === 'frame' && el.isAutoLayout ? '☰' : LAYER_ICONS[el.type] || '▪');
      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = el.name;
      if (m.hasTracks(el.id)) { const dot = document.createElement('span'); dot.className = 'tree-anim-dot'; dot.title = 'Animated'; name.appendChild(dot); }
      const acts = document.createElement('div');
      acts.className = 'tree-actions';
      const vis = document.createElement('button');
      vis.className = 'tree-action-icon btn-vis'; vis.title = el.visible ? 'Hide (Ctrl+Shift+H)' : 'Show'; vis.textContent = el.visible ? '👁' : '◌';
      vis.setAttribute('aria-label', el.visible ? `Hide ${el.name}` : `Show ${el.name}`);
      const lock = document.createElement('button');
      lock.className = 'tree-action-icon btn-lock'; lock.title = el.locked ? 'Unlock' : 'Lock (Ctrl+Shift+L)'; lock.textContent = el.locked ? '🔒' : '🔓';
      lock.setAttribute('aria-label', el.locked ? `Unlock ${el.name}` : `Lock ${el.name}`);
      acts.append(vis, lock);
      li.append(exp, icon, name, acts);
      exp.addEventListener('click', (e) => { e.stopPropagation(); if (this.collapsed.has(el.id)) this.collapsed.delete(el.id); else this.collapsed.add(el.id); this.updateLayersTree(); });
      // rows survive undo/redo (which recreates element objects), so always resolve by id
      const live = () => this.model.getElementById(el.id);
      vis.addEventListener('click', (e) => { e.stopPropagation(); const x = live(); if (!x) return; x.visible = !x.visible; this.commit(); });
      lock.addEventListener('click', (e) => { e.stopPropagation(); const x = live(); if (!x) return; x.locked = !x.locked; this.commit(); });
      li.addEventListener('click', (e) => {
        if (e.shiftKey && this.lastLayerClick) {
          const ids = rows.map(r => r.id);
          const a = ids.indexOf(this.lastLayerClick), b = ids.indexOf(el.id);
          if (a >= 0 && b >= 0) { const [s, t] = a < b ? [a, b] : [b, a]; m.select([...m.selectedIds, ...ids.slice(s, t + 1)]); }
        } else if (e.ctrlKey || e.metaKey) {
          if (m.selectedIds.has(el.id)) m.selectedIds.delete(el.id); else m.selectedIds.add(el.id);
        } else m.select([el.id]);
        this.lastLayerClick = el.id;
        this.selectionChanged();
      });
      li.addEventListener('dblclick', (e) => { e.stopPropagation(); const x = live(); if (x) this.renameLayer(li, x); });
      li.addEventListener('pointerenter', () => { m.hoveredId = el.id; this.requestRender(); });
      li.addEventListener('dragstart', (e) => {
        if (!m.selectedIds.has(el.id)) { m.select([el.id]); this.selectionChanged(); }
        this.dragLayerIds = m.topSelected().map(x => x.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', el.id);
      });
      li.addEventListener('dragend', () => { this.dragLayerIds = null; this.clearDropIndicators(); });
      frag.appendChild(li);
      rows.push(el);
      if (kids.length && (!this.collapsed.has(el.id) || q)) kids.forEach(k => visit(k, depth + 1));
    };
    (tree.get(null) || []).slice().reverse().forEach(r => visit(r, 0));
    list.innerHTML = '';
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'tree-empty';
      empty.textContent = q ? 'No layers match your search' : 'No layers yet — draw something or drop a file here';
      list.appendChild(empty);
    }
    list.appendChild(frag);
    const firstSel = list.querySelector('.tree-item.selected');
    if (firstSel && !this.isMouseDown) {
      const lr = list.getBoundingClientRect(), r = firstSel.getBoundingClientRect();
      if (r.top < lr.top || r.bottom > lr.bottom) firstSel.scrollIntoView({ block: 'nearest' });
    }
  },
  renameLayer(li, el) {
    const nameEl = li.querySelector('.tree-name');
    const inp = document.createElement('input');
    inp.className = 'tree-rename';
    inp.value = el.name;
    nameEl.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return; done = true;
      const v = inp.value.trim();
      inp.remove();
      this.layersSig = null;
      if (save && v && v !== el.name) { el.name = v.slice(0, 200); this.markOverride(el, 'name'); this.commit(); } else this.updateLayersTree();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => finish(true));
  },
  clearDropIndicators() {
    document.querySelectorAll('#layers-tree .drop-before, #layers-tree .drop-after, #layers-tree .drop-inside').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-inside'));
  },
  layerDropPosition(e) {
    const li = e.target.closest('.tree-item');
    if (!li) return null;
    const target = this.model.getElementById(li.dataset.id);
    if (!target) return null;
    const r = li.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    let where = y < 0.3 ? 'before' : y > 0.7 ? 'after' : (target.isContainer ? 'inside' : (y < 0.5 ? 'before' : 'after'));
    return { li, target, where };
  },
  onLayerDragOver(e) {
    if (!this.dragLayerIds) return;
    const pos = this.layerDropPosition(e);
    this.clearDropIndicators();
    if (!pos) return;
    const m = this.model;
    if (this.dragLayerIds.includes(pos.target.id) || this.dragLayerIds.some(id => m.isAncestor(id, pos.target))) return;
    e.preventDefault();
    pos.li.classList.add(`drop-${pos.where}`);
  },
  onLayerDrop(e) {
    if (!this.dragLayerIds) return;
    e.preventDefault();
    const pos = this.layerDropPosition(e);
    this.clearDropIndicators();
    const ids = this.dragLayerIds;
    this.dragLayerIds = null;
    if (!pos) return;
    const m = this.model;
    if (ids.includes(pos.target.id) || ids.some(id => m.isAncestor(id, pos.target))) return;
    const moving = ids.map(id => m.getElementById(id)).filter(Boolean);
    // Tree rows are top-first; array order is bottom-first. "before" in the list = above = later in array.
    if (pos.where === 'inside') {
      for (const el of moving) m.reparent(el, pos.target.id);
    } else {
      const parentId = pos.target.parentId;
      for (const el of moving.slice().reverse()) {
        m.reparent(el, parentId, pos.where === 'after' ? pos.target.id : null);
        if (pos.where === 'before') {
          // place directly above the target among siblings
          const list = m.elements.filter(x => x !== el);
          const subtree = [el, ...m.descendantsOf(el.id)];
          const rest = list.filter(x => !subtree.includes(x));
          const tIdx = rest.indexOf(pos.target);
          const lastDesc = [pos.target, ...m.descendantsOf(pos.target.id)].reduce((mx, d) => Math.max(mx, rest.indexOf(d)), tIdx);
          rest.splice(lastDesc + 1, 0, ...subtree);
          m.elements = rest;
        }
      }
    }
    const parent = m.getElementById(moving[0].parentId);
    if (parent && parent.isAutoLayout) m.layoutFrame(parent);
    this.commit();
  },

  // ===================================================================== Pages
  addPage() {
    const m = this.model;
    const id = Utils.uid('page');
    m.pages.push({ id, name: `Page ${m.pages.length + 1}`, elements: [], bg: m.page.bg });
    this.switchPage(id);
    this.commit();
    Utils.toast('New page created');
  },
  switchPage(id) {
    const m = this.model;
    if (id === m.currentPageId) return;
    this.finishTextEdit();
    if (this.penActivePath) this.finishPen();
    m.page.view = { zoom: m.zoom, panX: m.panX, panY: m.panY };
    m.currentPageId = id;
    m.select([]);
    const v = m.page.view;
    if (v) { m.zoom = v.zoom; m.panX = v.panX; m.panY = v.panY; } else this.zoomFit(false);
    this.refreshUI();
    this.requestRender();
  },
  renderPagesList() {
    const m = this.model;
    const list = document.getElementById('pages-list');
    if (list.querySelector('.tree-rename')) return;
    list.innerHTML = '';
    m.pages.forEach(p => {
      const li = document.createElement('li');
      li.className = 'tree-item' + (p.id === m.currentPageId ? ' selected' : '');
      const name = document.createElement('span');
      name.className = 'tree-name'; name.textContent = p.name;
      const count = document.createElement('span');
      count.className = 'muted-text'; count.textContent = String(p.elements.length);
      const acts = document.createElement('div');
      acts.className = 'tree-actions';
      const del = document.createElement('button');
      del.className = 'tree-action-icon'; del.textContent = '✕'; del.title = 'Delete page'; del.setAttribute('aria-label', `Delete ${p.name}`);
      del.disabled = m.pages.length < 2;
      acts.appendChild(del);
      li.append(name, count, acts);
      li.addEventListener('click', () => this.switchPage(p.id));
      li.addEventListener('dblclick', () => {
        const inp = document.createElement('input');
        inp.className = 'tree-rename'; inp.value = p.name;
        name.replaceWith(inp); inp.focus(); inp.select();
        let done = false;
        const fin = (save) => { if (done) return; done = true; if (save && inp.value.trim()) p.name = inp.value.trim().slice(0, 120); inp.remove(); this.commit(); };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); e.stopPropagation(); });
        inp.addEventListener('blur', () => fin(true));
      });
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (m.pages.length < 2) return;
        const ok = await this.confirm(`Delete “${p.name}”?`, `${p.elements.length} layers on this page will be removed. You can undo this.`, 'Delete page');
        if (!ok) return;
        const idx = m.pages.indexOf(p);
        m.pages.splice(idx, 1);
        if (m.currentPageId === p.id) { m.currentPageId = m.pages[Math.max(0, idx - 1)].id; m.select([]); }
        this.commit();
      });
      list.appendChild(li);
    });
  },

  // ===================================================================== Assets & styles
  renderAssets() {
    const m = this.model;
    const q = document.getElementById('assets-search-input').value.trim().toLowerCase();
    const ok = (name) => !q || name.toLowerCase().includes(q);
    const grid = document.getElementById('assets-components-grid');
    grid.innerHTML = '';
    const masters = m.masters().filter(c => ok(c.name));
    if (!masters.length) grid.innerHTML = `<div class="muted-text assets-empty">${q ? 'No matching components' : 'No components yet. Select layers and press Ctrl+Alt+K.'}</div>`;
    for (const comp of masters) {
      const card = document.createElement('button');
      card.className = 'asset-card';
      card.title = `Click to place an instance of ${comp.name}`;
      const prev = document.createElement('div');
      prev.className = 'asset-preview';
      try {
        const page = m.pageOf(comp.id);
        const saved = m.currentPageId;
        m.currentPageId = page.id;
        const thumb = this.renderer.renderToCanvas({ roots: [comp], scale: Math.min(2, 140 / Math.max(comp.width, comp.height, 1)), maxSize: 280 });
        m.currentPageId = saved;
        thumb.className = 'asset-thumb';
        prev.appendChild(thumb);
      } catch (e) { prev.textContent = '◆'; }
      const name = document.createElement('span');
      name.className = 'asset-name'; name.textContent = comp.name;
      card.append(prev, name);
      card.addEventListener('click', () => this.createInstance(comp.id, this.viewCenter(comp)));
      grid.appendChild(card);
    }

    const styleRow = (kind, s, swatchCss, meta) => {
      const row = document.createElement('div');
      row.className = 'style-item';
      row.title = 'Click to apply to the selection';
      row.innerHTML = '<div class="style-info"><span class="style-swatch"></span><span class="style-name"></span></div><span class="style-actions"><span class="style-count"></span><button class="tree-action-icon style-del" aria-label="Delete style">✕</button></span>';
      row.querySelector('.style-swatch').style.background = swatchCss;
      if (kind === 'texts') { row.querySelector('.style-swatch').textContent = 'Ag'; row.querySelector('.style-swatch').classList.add('text-swatch'); }
      row.querySelector('.style-name').textContent = s.name;
      row.querySelector('.style-count').textContent = meta;
      row.addEventListener('click', (e) => { if (!e.target.closest('.style-del')) this.applyStyle(kind, s); });
      row.querySelector('.style-del').addEventListener('click', (e) => {
        e.stopPropagation();
        m.styles[kind] = m.styles[kind].filter(x => x.id !== s.id);
        this.commit(); this.renderAssets();
      });
      return row;
    };
    const fillList = (id, kind, items, toRow) => {
      const c = document.getElementById(id);
      c.innerHTML = '';
      const shown = items.filter(s => ok(s.name));
      if (!shown.length) c.innerHTML = `<div class="muted-text">${q ? 'No matches' : 'None yet — select a layer and press +'}</div>`;
      shown.forEach(s => c.appendChild(toRow(s)));
    };
    fillList('color-styles-list', 'colors', m.styles.colors, s => styleRow('colors', s, s.color, Utils.toHex(s.color).toUpperCase()));
    fillList('text-styles-list', 'texts', m.styles.texts, s => styleRow('texts', s, 'transparent', `${s.fontSize}/${s.lineHeight || 'auto'} · ${s.fontWeight}`));
    fillList('effect-styles-list', 'effects', m.styles.effects, s => styleRow('effects', s, '#2a2a33', `${s.effects.length} effect${s.effects.length === 1 ? '' : 's'}`));
  },
  addStyle(kind) {
    const m = this.model;
    const el = m.topSelected()[0];
    if (!el) { Utils.toast('Select a layer to create a style from it', 'ℹ️'); return; }
    if (kind === 'colors') {
      const f = el.fills.find(x => x.type === 'solid');
      if (!f) { Utils.toast('The selected layer has no solid fill', '⚠️'); return; }
      m.styles.colors.push({ id: Utils.uid('c'), name: `${el.name} Color`, color: Utils.rgba(f.color, f.opacity) });
    } else if (kind === 'texts') {
      if (el.type !== 'text') { Utils.toast('Select a text layer to create a text style', '⚠️'); return; }
      m.styles.texts.push({ id: Utils.uid('t'), name: `${el.name} Text`, fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight, lineHeight: el.lineHeight, letterSpacing: el.letterSpacing });
    } else {
      if (!el.effects.length) { Utils.toast('The selected layer has no effects', '⚠️'); return; }
      m.styles.effects.push({ id: Utils.uid('e'), name: `${el.name} Effect`, effects: JSON.parse(JSON.stringify(el.effects)) });
    }
    this.commit();
    this.renderAssets();
    Utils.toast('Style created', '🎨');
  },
};
Object.assign(StudioApp.prototype, LayersMixin);
