/**
 * DesignStudio — Components, Figma-style (v3.6.0).
 * Variants (component sets), component properties (text / boolean / instance swap), instance swap,
 * override list with reset / push to main, protected instance structure, drag instances from Assets.
 * Core syncing (auto overrides, constraints inside resized instances) lives in StudioModel.syncComponents.
 */
'use strict';

const ComponentsMixin = {
  // ------------------------------------------------------------------ helpers
  componentSetOf(master) { const p = master?.parentId && this.model.findAnywhere(master.parentId); return p && p.isComponentSet ? p : null; },
  /** "Size=Large, State=Hover" → {Size: 'Large', State: 'Hover'} */
  parseVariantName(name) {
    const out = {};
    for (const part of String(name).split(',')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
    return out;
  },
  variantName(props) { return Object.entries(props).map(([k, v]) => `${k}=${v}`).join(', '); },
  variantsOf(set) { return this.model.childrenOf(set.id).filter(e => e.isComponentMaster); },
  /** {Prop: [values…]} across a set, in first-seen order. */
  variantAxes(set) {
    const axes = {};
    for (const v of this.variantsOf(set)) for (const [k, val] of Object.entries(this.parseVariantName(v.name))) { (axes[k] ||= []); if (!axes[k].includes(val)) axes[k].push(val); }
    return axes;
  },
  allMasters() { return this.model.masters(); },
  masterLabel(mst) { const set = this.componentSetOf(mst); return set ? `${set.name} / ${mst.name}` : mst.name; },

  // ------------------------------------------------------------------ variants
  /** Select main components → wrap them in a variant set (like Figma “Combine as variants”). */
  combineAsVariants() {
    const m = this.model;
    let sel = m.topSelected();
    if (sel.some(e => !e.isComponentMaster)) {
      if (sel.length === 1 && !sel[0].isComponentMaster && !sel[0].isComponentInstance) { this.createComponent(); sel = m.topSelected(); }
      else { Utils.toast('Select main components (◆) to combine them as variants', 'ℹ️'); return; }
    }
    const parent = sel[0].parentId;
    if (sel.some(e => e.parentId !== parent)) { Utils.toast('Variants must share the same parent', '⚠️'); return; }
    if (sel.some(e => this.componentSetOf(e))) { Utils.toast('One of these is already in a variant set — use “Add variant” there', 'ℹ️'); return; }
    const b = Utils.unionBounds(sel.map(e => Utils.aabb(e)));
    const pad = 20;
    const set = new StudioElement('frame', b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
    const base = sel[0].name.split(/[,=]/)[0].trim() || 'Component';
    set.name = sel.length > 1 && sel.every(e => e.name.includes('=')) ? base : base;
    set.isComponentSet = true; set.fills = []; set.clipContent = false;
    set.strokes = []; // the editor draws the dashed purple outline
    set.cornerRadius = 6;
    m.insertElement(set, parent || null);
    sel.forEach((e, i) => {
      e.parentId = set.id;
      if (!e.name.includes('=')) e.name = `Property 1=${i === 0 ? 'Default' : `Variant${i + 1}`}`;
    });
    // keep children right after the set in the stacking order
    const list = m.elements, ids = new Set(sel.map(e => e.id));
    const kids = list.filter(e => ids.has(e.id)); m.elements = list.filter(e => !ids.has(e.id));
    m.elements.splice(m.elements.indexOf(set) + 1, 0, ...kids);
    m.select([set.id]);
    this._actionLabel = 'Combine as variants';
    this.commit();
    Utils.toast(`Created variant set “${set.name}” with ${sel.length} variant${sel.length > 1 ? 's' : ''} — rename variants as Property=Value`, '❖');
  },
  addVariant(set, fromVariant = null) {
    const m = this.model;
    const vars = this.variantsOf(set);
    const src = fromVariant || vars[vars.length - 1];
    if (!src) return;
    const nodes = [src, ...m.descendantsOf(src.id)];
    const idMap = new Map(nodes.map(n => [n.id, Utils.uid('el')]));
    const b = Utils.unionBounds(vars.map(v => Utils.aabb(v)));
    const dx = (b.x + b.w + 20) - src.x, dy = 0;
    const copies = nodes.map(n => {
      const c = StudioElement.fromJSON(JSON.parse(JSON.stringify(n)));
      c.id = idMap.get(n.id); c.parentId = n === src ? set.id : idMap.get(n.parentId);
      c.x += dx; c.y += dy;
      c.isComponentMaster = n === src; c.isComponentInstance = n === src ? false : c.isComponentInstance;
      c.masterChildId = n === src ? null : c.masterChildId; c.overrides = n === src ? [] : c.overrides;
      return c;
    });
    const axes = this.variantAxes(set), props = this.parseVariantName(src.name);
    const first = Object.keys(axes)[0] || 'Property 1';
    let n = axes[first]?.length + 1 || 2, val = `Variant${n}`;
    while (vars.some(v => this.parseVariantName(v.name)[first] === val)) val = `Variant${++n}`;
    copies[0].name = this.variantName({ ...props, [first]: val });
    const last = Math.max(m.elements.indexOf(set), ...m.descendantsOf(set.id).map(d => m.elements.indexOf(d)));
    m.elements.splice(last + 1, 0, ...copies);
    set.width = Math.max(set.width, copies[0].x + copies[0].width + 20 - set.x);
    m.select([copies[0].id]);
    this._actionLabel = 'Add variant';
    this.commit();
  },
  /** Instance → the variant matching `props` (falls back to the closest match). */
  switchVariant(inst, axis, value) {
    const master = this.model.findAnywhere(inst.masterComponentId), set = this.componentSetOf(master);
    if (!set) return;
    const want = { ...this.parseVariantName(master.name), [axis]: value };
    const score = (v) => { const p = this.parseVariantName(v.name); return Object.entries(want).reduce((s, [k, val]) => s + (p[k] === val ? (k === axis ? 100 : 1) : 0), 0); };
    const best = this.variantsOf(set).sort((a, b) => score(b) - score(a))[0];
    if (best && best.id !== master.id) this.swapInstance(inst, best.id, `Variant: ${axis}=${value}`);
  },

  // ------------------------------------------------------------------ instance swap (keeps overrides by layer path)
  swapInstance(inst, newMasterId, label = 'Swap instance') {
    const m = this.model, list = m.elements;
    const newMaster = m.findAnywhere(newMasterId);
    if (!newMaster || !newMaster.isComponentMaster || newMaster.id === inst.masterComponentId) return;
    if (m.isInSubtree(inst, newMaster.id, m.pageOf(newMaster.id).elements) || newMaster.id === inst.id) { Utils.toast('A component cannot contain an instance of itself', '⚠️'); return; }
    // remember overrides by path
    const saved = new Map();
    for (const d of m.descendantsOf(inst.id)) {
      const path = m.componentPath(inst, d, list);
      if (path && d.overrides.length) saved.set(path, Object.fromEntries(d.overrides.map(k => [k, JSON.parse(JSON.stringify(d[k]))])));
    }
    const rootOv = Object.fromEntries(inst.overrides.filter(k => !['width', 'height', 'name'].includes(k)).map(k => [k, JSON.parse(JSON.stringify(inst[k]))]));
    const keepSize = inst.overrides.includes('width') || inst.overrides.includes('height') ? { w: inst.width, h: inst.height } : null;
    // drop old content, point at the new main, let the sync rebuild it
    const kill = new Set(m.descendantsOf(inst.id).map(d => d.id));
    m.elements = list.filter(e => !kill.has(e.id));
    const oldMaster = m.findAnywhere(inst.masterComponentId);
    if (inst.name === oldMaster?.name || this.componentSetOf(oldMaster)) inst.name = this.componentSetOf(newMaster)?.name || newMaster.name;
    inst.masterComponentId = newMaster.id;
    inst.overrides = [];
    m._syncCache?.delete(inst);
    inst.width = newMaster.width; inst.height = newMaster.height;
    m.syncComponents();
    // re-apply what still has a home
    for (const [k, v] of Object.entries(rootOv)) { inst[k] = v; inst.overrides.push(k); }
    if (keepSize) { inst.width = keepSize.w; inst.height = keepSize.h; inst.overrides.push('width', 'height'); }
    for (const [path, ov] of saved) {
      const d = m.componentLayerByPath(inst, path, m.elements);
      if (!d) continue;
      for (const [k, v] of Object.entries(ov)) { d[k] = v; if (!d.overrides.includes(k)) d.overrides.push(k); }
    }
    this._actionLabel = label;
    this.commit();
  },

  // ------------------------------------------------------------------ overrides
  instanceOverrides(inst) {
    const m = this.model, out = [];
    if (inst.overrides.length) out.push({ el: inst, path: '(instance)', props: [...inst.overrides] });
    for (const d of m.descendantsOf(inst.id)) if (d.overrides.length) out.push({ el: d, path: m.componentPath(inst, d, m.elements) || d.name, props: [...d.overrides] });
    if (inst.propValues && Object.keys(inst.propValues).length) out.push({ el: inst, path: '(properties)', props: Object.keys(inst.propValues).map(id => m.componentPropDefs(m.findAnywhere(inst.masterComponentId)).find(d => d.id === id)?.name || 'property') });
    return out;
  },
  resetOverrides(inst, el = null, prop = null) {
    const m = this.model;
    const targets = el ? [el] : [inst, ...m.descendantsOf(inst.id)];
    for (const t of targets) {
      t.overrides = prop ? t.overrides.filter(k => k !== prop) : [];
      m._syncCache?.delete(t);
    }
    if (!el && !prop) inst.propValues = null;
    this._actionLabel = 'Reset overrides';
    this.commit();
  },
  /** Push this instance's overrides into the main component (Figma: “Push changes to main component”). */
  pushOverridesToMain(inst) {
    const m = this.model, master = m.findAnywhere(inst.masterComponentId);
    if (!master) return;
    const mp = m.pageOf(master.id).elements;
    const apply = (src, dst) => { for (const k of src.overrides) if (!['width', 'height', 'name'].includes(k) || src === inst) { if (src === inst && (k === 'width' || k === 'height')) continue; dst[k] = JSON.parse(JSON.stringify(src[k])); } };
    apply(inst, master);
    for (const d of m.descendantsOf(inst.id)) {
      if (!d.overrides.length) continue;
      const target = d.masterChildId ? mp.find(e => e.id === d.masterChildId) : null;
      if (target) apply(d, target);
    }
    inst.overrides = inst.overrides.filter(k => k === 'width' || k === 'height'); // the instance keeps its own size
    m.descendantsOf(inst.id).forEach(d => { d.overrides = []; m._syncCache?.delete(d); }); m._syncCache?.delete(inst);
    this._actionLabel = 'Push changes to main component';
    this.commit();
    Utils.toast(`Pushed changes to “${master.name}” — every instance updated`, '◆');
  },

  // ------------------------------------------------------------------ component properties
  /** Owner (main / variant set) + variant root of a layer that sits inside a main component (not inside a nested instance). */
  propHostOf(el) {
    const m = this.model; if (!el || el.isComponentMaster || el.isComponentSet) return null;
    let p = m.elements.find(e => e.id === el.parentId), guard = 0;
    while (p && guard++ < 64) {
      if (p.isComponentInstance) return null;
      if (p.isComponentMaster) { const set = this.componentSetOf(p); return { owner: set || p, root: p }; }
      p = m.elements.find(e => e.id === p.parentId);
    }
    return null;
  },
  propKindsOf(el) { return [...(el.type === 'text' ? ['text'] : []), 'boolean', ...(el.isComponentInstance ? ['swap'] : [])]; },
  propLabel(t) { return { text: 'Text', boolean: 'Boolean', swap: 'Instance swap' }[t]; },
  /** Figma-style: create a property, optionally bound to a layer; the panel then focuses its name. */
  addComponentProp(owner, type, layer = null, root = null) {
    const m = this.model;
    root = root || (owner.isComponentSet ? this.variantsOf(owner)[0] : owner);
    if (!root) return null;
    const pathOf = (x) => m.componentPath(root, x, m.elements);
    if (!layer && type !== 'boolean') {
      const bound = new Set(owner.componentProps.filter(d => d.type === type).flatMap(d => d.layers || []));
      const cands = m.descendantsOf(root.id).filter(d => (type === 'text' ? d.type === 'text' : d.isComponentInstance) && !m.ancestorsOf(d).some(a => a.isComponentInstance && a.id !== d.id && this.model.isInSubtree(a, root.id, m.elements)));
      if (!cands.length) { Utils.toast(type === 'text' ? 'Add a text layer to the component first' : 'Nest an instance inside the component first', 'ℹ️'); return null; }
      layer = cands.find(c => !bound.has(pathOf(c))) || null;
    }
    const used = new Set(owner.componentProps.map(d => d.name));
    let name = layer ? (type === 'boolean' ? `Show ${layer.name}` : layer.name || this.propLabel(type)) : (type === 'boolean' ? 'Show item' : this.propLabel(type));
    for (let n = 2, base = name; used.has(name); n++) name = `${base} ${n}`;
    const path = layer ? pathOf(layer) : '';
    const d = { id: Utils.uid('cp'), name, type, layers: path ? [path] : [], ids: path ? [layer.id] : [], layer: path,
      def: type === 'boolean' ? (layer ? layer.visible !== false : true) : type === 'text' ? String(layer?.text ?? '') : (layer?.masterComponentId || '') };
    owner.componentProps.push(d);
    this._focusProp = d.id;
    this._actionLabel = `Create ${this.propLabel(type).toLowerCase()} property`;
    this.commit();
    return d;
  },
  bindPropLayer(owner, d, layer, root) {
    const path = this.model.componentPath(root, layer, this.model.elements); if (!path) return;
    // a layer value can only be driven by one property of a kind
    owner.componentProps.forEach(o => { if (o !== d && o.type === d.type) { const k = o.layers.indexOf(path); if (k >= 0) { o.layers.splice(k, 1); o.ids.splice(k, 1); } } });
    if (!d.layers.includes(path)) { d.layers.push(path); d.ids.push(layer.id); }
    this._actionLabel = `Apply property “${d.name}”`; this.commit();
  },
  unbindPropLayer(owner, d, path) {
    const k = d.layers.indexOf(path); if (k < 0) return;
    d.layers.splice(k, 1); d.ids.splice(k, 1);
    this._actionLabel = `Detach property “${d.name}”`; this.commit();
  },
  /** Default value = the main component's own value: write it to every bound layer (all variants of a set). */
  setPropDefault(owner, d, val) {
    const m = this.model, roots = owner.isComponentSet ? this.variantsOf(owner) : [owner];
    for (const r of roots) for (const path of d.layers) {
      const L = m.componentLayerByPath(r, path, m.elements); if (!L) continue;
      if (d.type === 'text' && L.type === 'text') { L.text = String(val); if (typeof TextLayout !== 'undefined' && L.textAutoResize && L.textAutoResize !== 'none') TextLayout.fit(L); }
      else if (d.type === 'boolean') L.visible = !!val;
      else if (d.type === 'swap' && L.isComponentInstance && m.findAnywhere(val)?.isComponentMaster) L.masterComponentId = val;
    }
    d.def = val;
    this._actionLabel = `Default of “${d.name}”`; this.commit();
  },
  renameVariantAxis(set, from, to) {
    to = String(to || '').replace(/[=,]/g, '').trim(); if (!to || to === from) return;
    const axes = this.variantAxes(set); if (axes[to]) { Utils.toast(`A variant property “${to}” already exists`, 'ℹ️'); this.renderComponentPanel(); return; }
    for (const v of this.variantsOf(set)) { const p = this.parseVariantName(v.name); v.name = this.variantName(Object.fromEntries(Object.entries(p).map(([k, x]) => [k === from ? to : k, x]))); }
    this._actionLabel = 'Rename variant property'; this.commit();
  },
  addVariantAxis(set) {
    const axes = this.variantAxes(set); let n = 1, name = 'Property 1'; while (axes[name]) name = `Property ${++n}`;
    for (const v of this.variantsOf(set)) v.name = this.variantName({ ...this.parseVariantName(v.name), [name]: 'Default' });
    this._focusAxis = name; this._actionLabel = 'Add variant property'; this.commit();
  },

  // ------------------------------------------------------------------ inspector UI
  bindComponents() {
    const sec = document.getElementById('sec-component-props');
    if (sec) {
      const box = document.createElement('div');
      box.id = 'component-panel'; box.className = 'cmp-panel';
      sec.appendChild(box);
      const lp = document.createElement('div');
      lp.className = 'prop-section'; lp.id = 'sec-layer-cprops'; lp.style.display = 'none';
      lp.innerHTML = '<div class="prop-section-header"><span style="color:var(--purple);">Component properties</span></div><div class="cmp-panel"></div>';
      (document.querySelector('#panel-tab-design > .prop-section') || sec).after(lp); // near the top, like Figma's inline property controls
    }
    const origProps = this.updatePropertiesUI.bind(this);
    this.updatePropertiesUI = (...a) => { const r = origProps(...a); this.renderComponentPanel(); return r; };
    Object.assign(this.commands, {
      combineVariants: { run: () => this.combineAsVariants(), enabled: () => this.model.topSelected().length > 0 },
      goToMain: { run: () => document.getElementById('btn-goto-master')?.click() }
    });
    const obj = document.getElementById('dropdown-object');
    const comp = obj?.querySelector('[data-action="createComp"]');
    if (comp) {
      const it = document.createElement('div');
      it.className = 'dropdown-item'; it.dataset.action = 'combineVariants'; it.setAttribute('role', 'menuitem'); it.tabIndex = -1;
      it.innerHTML = 'Combine as Variants <span class="dropdown-shortcut">Ctrl+Alt+Shift+K</span>';
      comp.insertAdjacentElement('afterend', it);
    }
    document.addEventListener('keydown', (e) => {
      if (this.section !== 'design') return;
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); this.combineAsVariants(); }
    }, true);
    // instance layers: structure follows the main component — delete hides instead
    const origDel = this.deleteSelection.bind(this);
    this.deleteSelection = () => {
      const m = this.model, sel = m.topSelected();
      const inside = sel.filter(e => e.masterChildId && m.ancestorsOf(e).some(a => a.isComponentInstance));
      if (inside.length) {
        inside.forEach(e => { e.visible = false; });
        this._actionLabel = 'Hide layer in instance';
        this.commit();
        Utils.toast('Layers inside an instance can’t be deleted — hidden instead (Reset overrides brings them back)', '👁');
        if (inside.length === sel.length) return;
        m.select(sel.filter(e => !inside.includes(e)).map(e => e.id));
      }
      origDel();
    };
    this.bindAssetDrag();
  },
  renderComponentPanel() {
    const box = document.getElementById('component-panel');
    if (!box) return;
    const m = this.model, sel = m.topSelected(), el = sel.length === 1 ? sel[0] : null;
    const sec = document.getElementById('sec-component-props');
    const show = el && (el.isComponentMaster || el.isComponentInstance || el.isComponentSet);
    if (sec && el?.isComponentSet) sec.style.display = '';
    this.renderLayerPropSection(el);
    if (!show) { box.innerHTML = ''; return; }
    const opt = (v, l, s) => `<option value="${Utils.escapeHtml(v ?? '')}"${s ? ' selected' : ''}>${Utils.escapeHtml(l)}</option>`;
    let html = '';
    if (el.isComponentSet) {
      const axes = this.variantAxes(el);
      html += `<div class="cmp-title">❖ Variant set · ${this.variantsOf(el).length} variants</div>
        ${Object.entries(axes).map(([k, vals]) => `<div class="cmp-axis"><b>${Utils.escapeHtml(k)}</b><span>${vals.map(Utils.escapeHtml).join(' · ')}</span></div>`).join('')}
        <div class="cmp-row"><button class="menu-btn" data-c="addVariant">＋ Add variant</button></div>
        <p class="cmp-tip">Name variants “Property=Value, Other=Value”. Instances get a dropdown per property.</p>`;
      html += this.propsEditorHtml(el);
    } else if (el.isComponentMaster) {
      const set = this.componentSetOf(el);
      html += `<div class="cmp-title">◆ Main component${set ? ` · variant of ${Utils.escapeHtml(set.name)}` : ''}</div>
        <label class="cmp-field">Description<textarea data-c="desc" rows="2" placeholder="What is it for? Shown in Assets">${Utils.escapeHtml(el.description)}</textarea></label>
        <div class="cmp-row">${set ? '<button class="menu-btn" data-c="addVariantFrom">＋ Variant from this</button><button class="menu-btn" data-c="selectSet">Select set</button>' : '<button class="menu-btn" data-c="combine">❖ Make variant set</button>'}</div>
        <div class="cmp-meta">${this.countInstances(el)} instance${this.countInstances(el) === 1 ? '' : 's'} in this file</div>`;
      if (!set) html += this.propsEditorHtml(el);
    } else if (el.isComponentInstance) {
      const master = m.findAnywhere(el.masterComponentId), set = this.componentSetOf(master);
      if (!master) html += '<div class="cmp-title warn">◇ Instance — main component missing</div><p class="cmp-tip">Its main component was deleted. Restore it from this instance (other instances relink too), or detach to edit freely.</p><div class="cmp-row"><button class="menu-btn" data-c="restore">Restore main component</button></div>';
      else {
        html += `<div class="cmp-title">◇ ${Utils.escapeHtml(set ? set.name : master.name)}</div>`;
        if (set) {
          const axes = this.variantAxes(set), cur = this.parseVariantName(master.name);
          html += Object.entries(axes).map(([k, vals]) => `<label class="cmp-field">${Utils.escapeHtml(k)}<select data-axis="${Utils.escapeHtml(k)}">${vals.map(v => opt(v, v, cur[k] === v)).join('')}</select></label>`).join('');
        }
        const defs = m.componentPropDefs(master);
        for (const d of defs) {
          const v = el.propValues && d.id in el.propValues ? el.propValues[d.id] : d.def;
          if (d.type === 'text') html += `<label class="cmp-field">${Utils.escapeHtml(d.name)}<input type="text" data-prop="${d.id}" value="${Utils.escapeHtml(v ?? '')}"></label>`;
          else if (d.type === 'boolean') html += `<label class="cmp-check"><input type="checkbox" data-prop="${d.id}"${v !== false ? ' checked' : ''}> ${Utils.escapeHtml(d.name)}</label>`;
          else html += `<label class="cmp-field">${Utils.escapeHtml(d.name)}<select data-prop="${d.id}">${this.allMasters().filter(x => x.id !== master.id).map(x => opt(x.id, this.masterLabel(x), x.id === v)).join('')}</select></label>`;
        }
        html += `<label class="cmp-field">Swap instance<select data-c="swap">${this.allMasters().filter(x => !m.isInSubtree(el, x.id, m.elements) && x.id !== el.id).map(x => opt(x.id, this.masterLabel(x), x.id === master.id)).join('')}</select></label>`;
        const ov = this.instanceOverrides(el);
        const n = ov.reduce((s, o) => s + o.props.length, 0);
        html += `<div class="cmp-ov"><div class="cmp-ov-head"><b>${n ? `${n} override${n > 1 ? 's' : ''}` : 'No overrides'}</b>${n ? '<button class="link-btn" data-c="reset">Reset all</button><button class="link-btn" data-c="push">Push to main</button>' : ''}</div>
          ${ov.map((o, i) => `<div class="cmp-ov-row"><span title="${Utils.escapeHtml(o.path)}">${Utils.escapeHtml(o.path)}</span><span class="cmp-ov-props">${o.props.map(p => `<button class="cmp-chip" data-ov="${i}" data-p="${Utils.escapeHtml(p)}" title="Reset ${Utils.escapeHtml(p)}">${Utils.escapeHtml(p)} ✕</button>`).join('')}</span></div>`).join('')}</div>`;
      }
    }
    box.innerHTML = html;
    const commit = (label) => { this._actionLabel = label; this.commit(); };
    box.querySelector('[data-c="addVariant"]')?.addEventListener('click', () => this.addVariant(el));
    box.querySelector('[data-c="addVariantFrom"]')?.addEventListener('click', () => this.addVariant(this.componentSetOf(el), el));
    box.querySelector('[data-c="selectSet"]')?.addEventListener('click', () => { m.select([this.componentSetOf(el).id]); this.selectionChanged(); });
    box.querySelector('[data-c="combine"]')?.addEventListener('click', () => this.combineAsVariants());
    box.querySelector('[data-c="desc"]')?.addEventListener('change', (e) => { el.description = e.target.value; commit('Edit description'); });
    box.querySelectorAll('[data-axis]').forEach(s => s.addEventListener('change', () => this.switchVariant(el, s.dataset.axis, s.value)));
    box.querySelectorAll('[data-prop]').forEach(f => f.addEventListener(f.type === 'text' ? 'change' : 'change', () => {
      el.propValues = { ...(el.propValues || {}), [f.dataset.prop]: f.type === 'checkbox' ? f.checked : f.value };
      const d = m.componentPropDefs(m.findAnywhere(el.masterComponentId)).find(x => x.id === f.dataset.prop);
      // a property value replaces any manual override on that layer property
      for (const path of (d?.layers || [])) { const layer = m.instanceLayerFor(el, m.findAnywhere(el.masterComponentId), path, m.elements); if (layer) layer.overrides = layer.overrides.filter(k => k !== (d.type === 'text' ? 'text' : d.type === 'boolean' ? 'visible' : 'masterComponentId')); }
      commit(`Set ${d?.name || 'property'}`);
    }));
    box.querySelector('[data-c="swap"]')?.addEventListener('change', (e) => this.swapInstance(el, e.target.value));
    box.querySelector('[data-c="reset"]')?.addEventListener('click', () => this.resetOverrides(el));
    box.querySelector('[data-c="push"]')?.addEventListener('click', () => this.pushOverridesToMain(el));
    box.querySelector('[data-c="restore"]')?.addEventListener('click', () => this.restoreMainComponent(el));
    box.querySelectorAll('[data-ov]').forEach(c => c.addEventListener('click', () => {
      const o = this.instanceOverrides(el)[+c.dataset.ov];
      if (o.path === '(properties)') { el.propValues = null; commit('Reset properties'); return; }
      this.resetOverrides(el, o.el, c.dataset.p);
    }));
    this.bindPropsEditor(box, el);
  },
  /** QA-17: rebuild a deleted main component from one of its instances, next to it, and relink every orphan. */
  restoreMainComponent(inst) {
    const m = this.model, lostId = inst.masterComponentId;
    const nodes = [inst, ...m.descendantsOf(inst.id)];
    const copies = this.cloneSubtrees([inst], 0, true);
    const main = copies[0], mainNodes = [main, ...m.descendantsOf(main.id)];
    main.isComponentInstance = false; main.masterComponentId = null; main.isComponentMaster = true; main.overrides = [];
    main.name = inst.name; main.x = inst.x + inst.width + 60; main.parentId = null;
    const dx = main.x - inst.x; mainNodes.slice(1).forEach(d => { d.x += dx; d.masterChildId = null; d.overrides = []; });
    // map old layer ids (the lost main's children) → new ones, by the instance's masterChildId links
    const map = new Map(); nodes.slice(1).forEach((n, i) => { if (n.masterChildId) map.set(n.masterChildId, mainNodes[i + 1]?.id); map.set(n.id, mainNodes[i + 1]?.id); });
    for (const page of m.pages) for (const e of page.elements) {
      if (e.isComponentInstance && e.masterComponentId === lostId) e.masterComponentId = main.id;
      if (e.masterChildId && map.has(e.masterChildId) && m.ancestorsOf(e, page.elements).some(a => a.masterComponentId === main.id)) e.masterChildId = map.get(e.masterChildId);
    }
    nodes.slice(1).forEach((n, i) => { n.masterChildId = mainNodes[i + 1]?.id || n.masterChildId; });
    m.select([main.id]);
    this._actionLabel = 'Restore main component';
    this.commit();
    Utils.toast(`Restored main component “${main.name}”`, '◆');
  },
  countInstances(master) { return this.model.allElements().filter(e => e.isComponentInstance && e.masterComponentId === master.id).length; },
  propsEditorHtml(owner) {
    const m = this.model, root = owner.isComponentSet ? this.variantsOf(owner)[0] : owner;
    const esc = Utils.escapeHtml, opt = (v, l, sel) => `<option value="${esc(v ?? '')}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
    const layers = root ? m.descendantsOf(root.id) : [];
    const pathOf = (d) => m.componentPath(root, d, m.elements);
    const badge = { text: 'T', boolean: '◐', swap: '⇄', variant: '❖' };
    const axes = owner.isComponentSet ? Object.entries(this.variantAxes(owner)) : [];
    const rows = axes.map(([k, vals]) => `<div class="cmp-prop cmp-prop-axis" data-axis-row="${esc(k)}"><div class="cmp-prop-head"><span class="cmp-badge variant" title="Variant property">❖</span><input type="text" data-ax="name" value="${esc(k)}" aria-label="Variant property name"><span class="cmp-prop-def cmp-muted">${vals.map(esc).join(' · ')}</span></div></div>`).join('')
      + owner.componentProps.map((d, i) => {
        const cands = layers.filter(x => (d.type === 'text' ? x.type === 'text' : d.type === 'swap' ? x.isComponentInstance : true) && !d.layers.includes(pathOf(x)));
        const missing = (pp, k) => !d.ids[k] && !m.componentLayerByPath(root, pp, m.elements);
        const def = d.type === 'text' ? `<input type="text" data-pf="def" value="${esc(d.def ?? '')}" aria-label="Default text" placeholder="Default text">`
          : d.type === 'boolean' ? `<label class="cmp-switch" title="Default value"><input type="checkbox" data-pf="def"${d.def !== false ? ' checked' : ''}><span>${d.def !== false ? 'True' : 'False'}</span></label>`
          : `<select data-pf="def" aria-label="Default instance">${this.allMasters().filter(x => x.id !== root?.id).map(x => opt(x.id, this.masterLabel(x), x.id === d.def)).join('')}</select>`;
        return `<div class="cmp-prop" data-i="${i}">
          <div class="cmp-prop-head"><span class="cmp-badge ${d.type}" title="${this.propLabel(d.type)} property">${badge[d.type]}</span><input type="text" data-pf="name" value="${esc(d.name)}" aria-label="Property name"><button class="tree-action-icon" data-pf="del" aria-label="Delete property ${esc(d.name)}" title="Delete property">✕</button></div>
          <div class="cmp-prop-body"><span class="cmp-k">Default</span>${def}</div>
          <div class="cmp-prop-body"><span class="cmp-k">Applied to</span><span class="cmp-links">${d.layers.map((pp, k) => `<button class="cmp-chip${missing(pp, k) ? ' warn' : ''}" data-unlink="${esc(pp)}" title="${missing(pp, k) ? 'Layer not found — ' : ''}Detach from ${esc(pp)}">${esc(pp.split('/').pop())} ✕</button>`).join('') || '<span class="cmp-muted">No layer yet</span>'}
            ${cands.length ? `<select data-pf="link" aria-label="Apply to another layer"><option value="">＋ Layer…</option>${cands.map(x => opt(pathOf(x), pathOf(x), false)).join('')}</select>` : ''}</span></div>
        </div>`;
      }).join('');
    return `<div class="cmp-props"><div class="cmp-ov-head"><b>Properties</b><span class="cmp-add-wrap"><button class="prop-icon-btn" data-c="addProp" aria-haspopup="menu" aria-expanded="false" title="Create component property" aria-label="Create component property">＋</button>
      <div class="cmp-add-menu" role="menu" hidden>${owner.isComponentSet ? '<button role="menuitem" data-np="variant">❖ Variant</button>' : ''}<button role="menuitem" data-np="boolean">◐ Boolean</button><button role="menuitem" data-np="swap">⇄ Instance swap</button><button role="menuitem" data-np="text">T Text</button></div></span></div>
      ${rows || '<p class="cmp-tip">Properties let instances change text, show/hide layers or swap nested instances from one place. Click ＋, or select a layer inside this component and use “Create property”.</p>'}</div>`;
  },
  bindPropsEditor(box, owner) {
    if (!owner.isComponentMaster && !owner.isComponentSet) return;
    const m = this.model, root = owner.isComponentSet ? this.variantsOf(owner)[0] : owner;
    const btn = box.querySelector('[data-c="addProp"]'), menu = box.querySelector('.cmp-add-menu');
    btn?.addEventListener('click', (e) => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) { menu.querySelector('button')?.focus(); const off = (ev) => { if (!menu.contains(ev.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); } });
    menu?.addEventListener('keydown', (e) => { if (e.key === 'Escape') { menu.hidden = true; btn.focus(); } });
    box.querySelectorAll('[data-np]').forEach(b => b.addEventListener('click', () => { menu.hidden = true; b.dataset.np === 'variant' ? this.addVariantAxis(owner) : this.addComponentProp(owner, b.dataset.np); }));
    box.querySelectorAll('[data-axis-row]').forEach(row => row.querySelector('[data-ax="name"]').addEventListener('change', (e) => this.renameVariantAxis(owner, row.dataset.axisRow, e.target.value)));
    box.querySelectorAll('.cmp-prop[data-i]').forEach(row => {
      const d = owner.componentProps[+row.dataset.i];
      row.querySelector('[data-pf="name"]').addEventListener('change', (e) => { const v = e.target.value.trim(); if (!v) { e.target.value = d.name; return; } d.name = v; this._actionLabel = 'Rename property'; this.commit(); });
      row.querySelector('[data-pf="del"]').addEventListener('click', () => { owner.componentProps = owner.componentProps.filter(x => x !== d); this._actionLabel = 'Delete property'; this.commit(); Utils.toast(`Deleted property “${d.name}” — instances keep their layers`, '🗑'); });
      const def = row.querySelector('[data-pf="def"]');
      def?.addEventListener('change', () => this.setPropDefault(owner, d, def.type === 'checkbox' ? def.checked : def.value));
      row.querySelector('[data-pf="link"]')?.addEventListener('change', (e) => { const L = m.componentLayerByPath(root, e.target.value, m.elements); if (L) this.bindPropLayer(owner, d, L, root); });
      row.querySelectorAll('[data-unlink]').forEach(c => c.addEventListener('click', () => this.unbindPropLayer(owner, d, c.dataset.unlink)));
    });
    this.focusNewProp(box);
  },
  focusNewProp(box) {
    const id = this._focusProp, ax = this._focusAxis; this._focusProp = this._focusAxis = null;
    let inp = null;
    if (id) { const owner = [this.model.topSelected()[0]].find(Boolean); const host = owner && (owner.componentProps ? owner : null); const i = host?.componentProps?.findIndex(d => d.id === id); inp = i >= 0 ? box.querySelector(`.cmp-prop[data-i="${i}"] [data-pf="name"]`) : box.querySelector(`[data-bound="${id}"]`); }
    if (ax) inp = box.querySelector(`[data-axis-row="${CSS.escape(ax)}"] [data-ax="name"]`);
    if (inp) { inp.focus(); inp.select?.(); inp.closest('.cmp-prop, .cmp-lp-row')?.classList.add('flash'); }
  },
  /** Layer inside a main component → apply / create / detach properties for its text, visibility, nested instance. */
  renderLayerPropSection(el) {
    const sec = document.getElementById('sec-layer-cprops'); if (!sec) return;
    const host = this.model.topSelected().length === 1 ? this.propHostOf(el) : null;
    sec.style.display = host ? '' : 'none';
    const box = sec.querySelector('.cmp-panel'); if (!host) { box.innerHTML = ''; return; }
    const m = this.model, { owner, root } = host, esc = Utils.escapeHtml, path = m.componentPath(root, el, m.elements);
    const what = { text: 'Text content', boolean: 'Visibility', swap: 'Nested instance' };
    box.innerHTML = `<div class="cmp-meta">Inside ◆ ${esc(owner.name)}</div>` + this.propKindsOf(el).map(k => {
      const d = owner.componentProps.find(x => x.type === k && x.layers.includes(path));
      const others = owner.componentProps.filter(x => x.type === k && x !== d);
      return `<div class="cmp-lp-row" data-kind="${k}"><span class="cmp-badge ${k}">${{ text: 'T', boolean: '◐', swap: '⇄' }[k]}</span><span class="cmp-lp-k">${what[k]}</span>${d
        ? `<input type="text" class="cmp-bound" data-bound="${d.id}" value="${esc(d.name)}" aria-label="${what[k]} property name" title="Rename property"><button class="tree-action-icon" data-detach="${d.id}" title="Detach property" aria-label="Detach property ${esc(d.name)}">⊘</button>`
        : `<button class="menu-btn cmp-create" data-create="${k}" title="Create a ${this.propLabel(k).toLowerCase()} property from this layer">◇ Create property</button>${others.length ? `<select data-apply="${k}" aria-label="Apply existing property"><option value="">Apply…</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}`}</div>`;
    }).join('');
    box.querySelectorAll('[data-create]').forEach(b => b.addEventListener('click', () => this.addComponentProp(owner, b.dataset.create, el, root)));
    box.querySelectorAll('[data-apply]').forEach(s => s.addEventListener('change', () => { const d = owner.componentProps.find(x => x.id === s.value); if (d) this.bindPropLayer(owner, d, el, root); }));
    box.querySelectorAll('[data-detach]').forEach(b => b.addEventListener('click', () => { const d = owner.componentProps.find(x => x.id === b.dataset.detach); if (d) this.unbindPropLayer(owner, d, path); }));
    box.querySelectorAll('[data-bound]').forEach(inp => inp.addEventListener('change', () => { const d = owner.componentProps.find(x => x.id === inp.dataset.bound); const v = inp.value.trim(); if (d && v) { d.name = v; this._actionLabel = 'Rename property'; this.commit(); } else if (d) inp.value = d.name; }));
    this.focusNewProp(box);
  },

  // ------------------------------------------------------------------ Assets: drag a component onto the canvas
  bindAssetDrag() {
    const grid = document.getElementById('assets-components-grid');
    if (!grid) return;
    new MutationObserver(() => {
      grid.querySelectorAll('.asset-card:not([draggable])').forEach((card, i) => {
        const master = this.allMasters().filter(c => { const q = document.getElementById('assets-search-input').value.trim().toLowerCase(); return !q || c.name.toLowerCase().includes(q); })[i];
        if (!master) return;
        card.draggable = true; card.dataset.master = master.id;
        const set = this.componentSetOf(master);
        if (set) card.querySelector('.asset-name').textContent = `${set.name} · ${master.name}`;
        if (master.description) card.title = `${master.description}\n\nClick or drag onto the canvas to place an instance`;
        else card.title = 'Click or drag onto the canvas to place an instance';
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/ds-component', master.id); e.dataTransfer.effectAllowed = 'copy'; });
      });
    }).observe(grid, { childList: true });
    const wrap = document.getElementById('canvas-wrap');
    wrap.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('text/ds-component')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    wrap.addEventListener('drop', (e) => {
      const id = e.dataTransfer?.getData('text/ds-component');
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      const r = wrap.getBoundingClientRect(), w = this.renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      const master = this.model.findAnywhere(id);
      if (!master) return;
      this.createInstance(id, { x: Math.round(w.x - master.width / 2), y: Math.round(w.y - master.height / 2) });
      // drop into a frame under the cursor, like Figma
      const inst = this.model.topSelected()[0], frame = this.frameAt(w, new Set([inst.id]));
      if (frame && !frame.isComponentInstance && !this.model.ancestorsOf(frame).some(a => a.isComponentInstance)) { inst.parentId = frame.id; this.commit(); }
    }, true);
  }
};
Object.assign(StudioApp.prototype, ComponentsMixin);
