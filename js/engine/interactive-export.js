/**
 * DesignStudio — "Interactive HTML" export (Rive-runtime equivalent).
 * Produces one self-contained HTML file: renderer + state-machine runtime + the scoped document.
 * Developers drive it with window.DesignStudioPlayer.fire('tap'), .set('isOn', true), .get('level').
 */
'use strict';

const InteractiveExport = {
  /** Serialise an object literal of functions / data back into JS source. */
  serializeValue(v, depth = 0) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'function') return v.toString();
    if (v instanceof Map) return 'new Map()';
    if (v instanceof Set) return `new Set(${JSON.stringify([...v])})`;
    if (Array.isArray(v)) return `[${v.map(x => this.serializeValue(x, depth + 1)).join(', ')}]`;
    if (typeof v === 'object') {
      if (depth > 6) return '{}';
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return 'null'; // DOM objects, canvas contexts, caches
      const parts = [];
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'function') {
          const src = val.toString();
          const isMethod = !/^(async\s+)?function\b/.test(src) && !/^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(src);
          parts.push(isMethod ? src : `${JSON.stringify(k)}: ${src}`);
        } else parts.push(`${JSON.stringify(k)}: ${k.startsWith('_') && !(val instanceof Map) ? 'null' : this.serializeValue(val, depth + 1)}`);
      }
      return `{\n${parts.join(',\n')}\n}`;
    }
    return JSON.stringify(v);
  },
  runtimeSource() {
    const objs = [['Utils', Utils], ['TextLayout', TextLayout], ['Geometry', Geometry]];
    return [
      '"use strict";',
      ...objs.map(([n, o]) => `const ${n} = ${this.serializeValue(o)};`),
      `const ANIM_PROPS = ${JSON.stringify(ANIM_PROPS)};`,
      `const CONTAINER_TYPES = new Set(${JSON.stringify([...CONTAINER_TYPES])});`,
      `const SHAPE_TYPES = ${JSON.stringify(SHAPE_TYPES)};`,
      `const DEFAULT_FONT = ${JSON.stringify(DEFAULT_FONT)};`,
      `const APP_VERSION = ${JSON.stringify(APP_VERSION)};`,
      StudioElement.toString(), SnapChunks.toString(), StudioModel.toString(), StudioRenderer.toString(), InputBus.toString(), StateMachineRuntime.toString(),
      ...InteractiveExport.triggerRuntime()
    ].join('\n');
  },
  /** TriggerEngine + the tiny catalogue facts it needs (shared by the 2D and 3D players). */
  triggerRuntime() {
    const ev = Object.fromEntries(Object.entries(TRIGGER_EVENTS).map(([k, d]) => [k, { target: d.target || false }]));
    return [`const TRIGGER_EVENTS = ${JSON.stringify(ev)};`, `const TRIGGER_COLOR_PROPS = ${JSON.stringify(TRIGGER_COLOR_PROPS)};`, TriggerEngine.toString()];
  },
  /** Document restricted to the export scope (current page, chosen roots + their subtrees). */
  scopedData(model, roots, title) {
    const data = JSON.parse(JSON.stringify(model.serialize(title)));
    const keep = new Set();
    for (const r of roots) { keep.add(r.id); model.descendantsOf(r.id).forEach(d => keep.add(d.id)); }
    const page = data.pages.find(p => p.id === model.currentPageId);
    page.elements = page.elements.filter(e => keep.has(e.id));
    for (const e of page.elements) if (!keep.has(e.parentId)) e.parentId = null;
    data.pages = [page];
    data.currentPageId = page.id;
    const used = new Set(page.elements.map(e => e.assetId).filter(Boolean));
    for (const k of Object.keys(data.assets)) if (!used.has(k)) delete data.assets[k];
    data.rootIds = roots.map(r => r.id);
    delete data.view;
    return data;
  },
  html(model, roots, { title = 'Interactive', bg = null, controls = true } = {}) {
    const data = this.scopedData(model, roots, title);
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const b = Utils.unionBounds(roots.map(r => Utils.aabb(r)));
    const boot = `
(function () {
  const data = JSON.parse(document.getElementById('ds-data').textContent);
  const model = new StudioModel();
  model.load(data);
  const bounds = ${JSON.stringify(b)};
  const canvas = document.getElementById('ds-canvas');
  const ctx = canvas.getContext('2d');
  let dirty = true;
  const renderer = Object.create(StudioRenderer.prototype);
  renderer.model = model; renderer.images = new Map(); renderer.app = { requestRender() { dirty = true; }, refreshAssetsLater() {} };
  const roots = data.rootIds.map(id => model.getElementById(id)).filter(Boolean);
  const bus = new InputBus(model.inputs);
  const apply = (id, p, v) => { const el = model.findAnywhere(id); if (el) { model.setAnimValue(el, p, v); dirty = true; } };
  const runtimes = model.stateMachines.map(sm => new StateMachineRuntime(model, sm, bus, apply));
  const evHandlers = new Map();
  const emit = (name) => { (evHandlers.get(name) || []).concat(evHandlers.get('*') || []).forEach(fn => { try { fn(name); } catch (e) { console.error(e); } }); try { parent.postMessage({ source: 'designstudio', event: name }, '*'); } catch (e) { /* no parent */ } };
  const engine = (model.triggers || []).some(t => t.scope === 'design' && t.enabled !== false) ? new TriggerEngine(model.triggers, model, bus, {
    apply: (id, p, v) => { const el = model.findAnywhere(id); if (!el) return; if (p === 'visible') el.visible = !!v; else model.setAnimValue(el, p, v); dirty = true; },
    get: (id, p) => { const el = model.findAnywhere(id); return el ? (p === 'visible' ? el.visible : model.getAnimValue(el, p)) : undefined; },
    evaluateIn: (a, id, p, t) => model.evaluateIn(a, id, p, t),
    openUrl: (u) => { const s = String(u || '').trim(), l = s.toLowerCase(); if (l.startsWith('https://') || l.startsWith('http://') || l.startsWith('mailto:')) window.open(s, '_blank', 'noopener,noreferrer'); }, emit
  }, 'design') : null;
  const fallback = runtimes.length || engine ? null : model.activeAnimation;
  function resize() {
    const dpr = window.devicePixelRatio || 1, box = canvas.parentElement.getBoundingClientRect();
    const s = Math.min(box.width / bounds.w, box.height / bounds.h);
    canvas.style.width = (bounds.w * s) + 'px'; canvas.style.height = (bounds.h * s) + 'px';
    canvas.width = Math.round(bounds.w * s * dpr); canvas.height = Math.round(bounds.h * s * dpr);
    canvas._scale = s * dpr; dirty = true;
  }
  window.addEventListener('resize', resize); resize();
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ${bg ? `ctx.fillStyle = ${JSON.stringify(bg)}; ctx.fillRect(0, 0, canvas.width, canvas.height);` : ''}
    ctx.scale(canvas._scale, canvas._scale); ctx.translate(-bounds.x, -bounds.y);
    const tree = model.buildTree();
    for (const r of roots) renderer.drawNode(ctx, r, { tree });
  }
  let last = null, clock = 0;
  function frame(ts) {
    const raw = last == null ? 0 : (ts - last) / 1000, dt = Math.min(0.1, raw); last = ts;
    if (runtimes.length) { runtimes.forEach(rt => rt.advance(dt)); dirty = true; }
    if (engine) { engine.tick(Math.min(1, raw)); dirty = true; }
    else if (fallback && Object.keys(fallback.tracks).length) {
      clock += dt; const d = fallback.duration;
      const t = fallback.loop === 'oneShot' ? Math.min(clock, d) : fallback.loop === 'pingPong' ? ((m) => m <= d ? m : 2 * d - m)(clock % (2 * d)) : clock % d;
      model.applyTime(t); dirty = true;
    }
    if (dirty) { draw(); dirty = false; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // hit testing (rotated boxes, frame clipping)
  const local = (p, el) => { const cx = el.x + el.width / 2, cy = el.y + el.height / 2, r = -(el.rotation || 0) * Math.PI / 180; const dx = p.x - cx, dy = p.y - cy; return { x: Math.cos(r) * dx - Math.sin(r) * dy, y: Math.sin(r) * dx + Math.cos(r) * dy }; };
  const inside = (p, el) => { const l = local(p, el); return Math.abs(l.x) <= Math.max(el.width, 6) / 2 && Math.abs(l.y) <= Math.max(el.height, 6) / 2; };
  function hit(p) {
    const tree = model.buildTree();
    const visit = (el) => {
      if (!el.visible) return null;
      const kids = tree.get(el.id) || [];
      if (!(el.type === 'frame' && el.clipContent !== false) || inside(p, el)) for (let i = kids.length - 1; i >= 0; i--) { const r = visit(kids[i]); if (r) return r; }
      if (el.type === 'group') return null;
      return inside(p, el) ? el : null;
    };
    for (let i = roots.length - 1; i >= 0; i--) { const r = visit(roots[i]); if (r) return [r.id, ...model.ancestorsOf(r).map(a => a.id)]; }
    return [];
  }
  const toWorld = (e) => { const r = canvas.getBoundingClientRect(), s = r.width / bounds.w; return { x: bounds.x + (e.clientX - r.left) / s, y: bounds.y + (e.clientY - r.top) / s }; };
  const listened = new Set([...runtimes.flatMap(rt => rt.hasListenerTargets()), ...(engine ? engine.listens() : [])]);
  let down = [], hover = new Set();
  canvas.addEventListener('pointerdown', (e) => { const w = toWorld(e); down = hit(w); runtimes.forEach(rt => rt.pointer('pointerDown', down)); if (engine) engine.pointerDown(down, w.x, w.y); });
  canvas.addEventListener('pointerup', (e) => { const w = toWorld(e), ids = hit(w); const c = ids.filter(i => down.includes(i)); runtimes.forEach(rt => { rt.pointer('pointerUp', ids); if (c.length) rt.pointer('click', c); }); if (engine) engine.pointerUp(ids, w.x, w.y); });
  if (engine) {
    window.addEventListener('pointermove', (e) => { const w = toWorld(e); engine.pointerMove(hit(w), w.x, w.y, e.clientX / innerWidth, e.clientY / innerHeight); });
    window.addEventListener('keydown', (e) => engine.key('down', e.key));
    window.addEventListener('keyup', (e) => engine.key('up', e.key));
    let sp = 0;
    window.addEventListener('wheel', (e) => { sp = Math.max(0, Math.min(100, sp + e.deltaY * 0.05)); engine.scroll(sp); }, { passive: true });
    engine.start(roots.filter(r => r.type === 'frame').map(r => r.id));
  }
  canvas.addEventListener('pointermove', (e) => {
    const ids = hit(toWorld(e)), now = new Set(ids);
    const ent = ids.filter(i => !hover.has(i)), ex = [...hover].filter(i => !now.has(i));
    runtimes.forEach(rt => { if (ent.length) rt.pointer('pointerEnter', ent); if (ex.length) rt.pointer('pointerExit', ex); });
    canvas.style.cursor = ids.some(i => listened.has(i)) ? 'pointer' : 'default'; hover = now;
  });
  canvas.addEventListener('pointerleave', () => { const ex = [...hover]; if (ex.length) runtimes.forEach(rt => rt.pointer('pointerExit', ex)); hover = new Set(); });
  // Public API (like Rive's state machine inputs)
  const api = {
    version: APP_VERSION,
    inputs: () => model.inputs.map(i => ({ name: i.name, type: i.type, value: bus.get(i.id) })),
    fire(name) { const d = bus.byName(name); if (d) bus.fire(d.id); },
    set(name, v) { const d = bus.byName(name); if (d) bus.set(d.id, v); },
    get(name) { const d = bus.byName(name); return d ? bus.get(d.id) : undefined; },
    onInput(fn) { return bus.onChange((id, v) => { const d = model.inputs.find(i => i.id === id); fn(d && d.name, v); }); },
    states: () => runtimes.map(rt => rt.layers.map(L => L.state && L.state.name)),
    on(name, fn) { if (!evHandlers.has(name)) evHandlers.set(name, []); evHandlers.get(name).push(fn); return () => evHandlers.set(name, evHandlers.get(name).filter(f => f !== fn)); }
  };
  window.DesignStudioPlayer = api;
  // Optional input controls for testing
  const panel = document.getElementById('ds-controls');
  if (panel && model.inputs.length) {
    for (const def of model.inputs) {
      const row = document.createElement('label');
      row.className = 'ds-ctl';
      const name = document.createElement('span'); name.textContent = def.name;
      let ctl;
      if (def.type === 'trigger') { ctl = document.createElement('button'); ctl.textContent = 'Fire'; ctl.onclick = (e) => { e.preventDefault(); bus.fire(def.id); }; }
      else if (def.type === 'boolean') { ctl = document.createElement('input'); ctl.type = 'checkbox'; ctl.checked = !!bus.get(def.id); ctl.onchange = () => bus.set(def.id, ctl.checked); bus.onChange((id, v) => { if (id === def.id) ctl.checked = !!v; }); }
      else { ctl = document.createElement('input'); ctl.type = 'number'; ctl.step = 'any'; ctl.value = bus.get(def.id); ctl.oninput = () => bus.set(def.id, ctl.value); bus.onChange((id, v) => { if (id === def.id && document.activeElement !== ctl) ctl.value = v; }); }
      row.append(name, ctl); panel.appendChild(row);
    }
  } else if (panel) panel.remove();
})();`;
    const runtime = this.runtimeSource().replace(/<\/script/gi, '<\\/script');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="DesignStudio ${APP_VERSION}">
<title>${Utils.escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: ${Utils.safeColor(model.page.bg, '#1a1a2e')}; font-family: ${DEFAULT_FONT}; }
  #ds-stage { position: absolute; inset: 0 0 ${controls ? '52px' : '0'} 0; display: flex; align-items: center; justify-content: center; }
  #ds-canvas { display: block; touch-action: none; }
  #ds-controls { position: fixed; left: 0; right: 0; bottom: 0; height: 52px; display: flex; gap: 14px; align-items: center; padding: 0 16px; background: rgba(0,0,0,.55); color: #fff; font-size: 12px; overflow-x: auto; }
  .ds-ctl { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
  .ds-ctl input[type=number] { width: 64px; }
  .ds-ctl button { cursor: pointer; }
</style>
</head>
<body>
<div id="ds-stage"><canvas id="ds-canvas" aria-label="${Utils.escapeHtml(title)}"></canvas></div>
${controls ? '<div id="ds-controls" aria-label="State machine inputs"></div>' : ''}
<script type="application/json" id="ds-data">${json}</script>
<script>
${runtime}
${boot}
</script>
</body>
</html>
`;
  }
};
