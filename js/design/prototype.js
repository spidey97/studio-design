/**
 * DesignStudio — interactive prototype player (navigation, overlays, transitions,
 * hover / drag / delay triggers, scrolling frames, device frames).
 */
'use strict';

const PROTO_DEVICES = { iphone: { w: 393, h: 852, r: 48 }, ipad: { w: 768, h: 1024, r: 28 }, desktop: { w: 1440, h: 900, r: 10 } };

const PrototypeMixin = {
  bindPrototype() {
    const $ = (id) => document.getElementById(id);
    $('btn-play-proto').addEventListener('click', () => this.openPrototype());
    $('btn-proto-close').addEventListener('click', () => this.closePrototype());
    $('btn-proto-restart').addEventListener('click', () => { if (this.proto) { this.proto.history = []; this.closeProtoOverlay(); this.showProtoScreen(this.proto.start, 'instant'); } });
    $('btn-proto-toggle-hints').addEventListener('click', () => {
      const w = $('proto-frame-wrapper');
      w.classList.toggle('show-hints');
      $('btn-proto-toggle-hints').classList.toggle('active', w.classList.contains('show-hints'));
    });
    $('proto-modal-device').addEventListener('change', () => { if (this.proto) this.showProtoScreen(this.proto.current, 'instant', 0, true); });
    window.addEventListener('resize', () => { if (this.proto) this.fitProtoDevice(); });
    // the static canvas/hotspot layer from the markup are replaced by generated screens
    $('proto-canvas').remove();
    $('proto-hotspot-layer').remove();
  },

  openPrototype() {
    this.finishTextEdit();
    const m = this.model, ps = m.prototypeSettings;
    const frames = m.roots().filter(f => f.type === 'frame' && f.visible);
    let start = m.getElementById(ps.startingFrameId);
    if (!start || start.parentId) {
      const sel = m.topSelected()[0];
      const root = sel ? this.rootOf(sel) : null;
      start = root && root.type === 'frame' ? root : frames[0];
    }
    if (!start) {
      const roots = m.roots().filter(e => e.visible);
      if (!roots.length) { Utils.toast('Nothing to preview yet — draw a frame (F) first', 'ℹ️'); return; }
      const b = this.renderer.boundsOf(roots);
      start = Object.assign(new StudioElement('frame', b.x, b.y, b.w, b.h), { id: '__page__', name: m.page.name, fills: [], clipContent: false });
      this.protoVirtual = start;
    } else this.protoVirtual = null;
    const modal = document.getElementById('prototype-modal');
    modal.style.display = 'flex';
    modal.style.background = ps.canvasBg;
    document.getElementById('proto-modal-device').value = ps.device === 'custom' ? 'none' : ps.device;
    this.proto = { start, current: null, history: [], timers: [], overlay: null, temp: new Map(), changed: [] };
    // Global inputs + state machines run live inside the prototype
    this.protoRuntimes = [];
    this.protoEngine = null;
    const designTriggers = (m.triggers || []).some(t => t.scope === 'design' && t.enabled !== false);
    if (m.stateMachines.length || designTriggers || m.inputs.length) {
      this.captureSetupPose();
      this.protoBus = new InputBus(JSON.parse(JSON.stringify(m.inputs)));
      this.protoRuntimes = m.stateMachines.map(sm => new StateMachineRuntime(m, sm, this.protoBus, this.makeApply()));
      if (designTriggers) this.protoEngine = new TriggerEngine(m.triggers, m, this.protoBus, this.designTriggerHost({
        navigate: (frameId, transition, duration, direction) => this.runInteraction({ action: 'navigate', targetId: frameId, transition: ({ slide: 'slideIn' })[transition] || transition, duration, direction: direction || 'left', easing: 'easeOut' }),
        back: () => this.runInteraction({ action: 'back', transition: 'dissolve', duration: 250 }),
        openOverlay: (frameId) => this.runInteraction({ action: 'overlay', targetId: frameId, transition: 'dissolve', duration: 250 }),
        closeOverlay: () => this.closeProtoOverlay(),
        scrollTo: (id) => this.protoScrollTo(id)
      }), 'design');
      if (this.protoEngine) { const host = this.protoEngine.host, ap = host.apply; host.apply = (...a) => { this._protoDirty = true; return ap(...a); }; }
      let last = null;
      const tick = (ts) => {
        if (!this.proto) return;
        const raw = last == null ? 0 : (ts - last) / 1000, dt = Math.min(0.1, raw); last = ts;
        this.protoRuntimes.forEach(rt => rt.advance(dt));
        this.protoEngine?.tick(Math.min(1, raw)); // QA-05: real-time trigger clock
        // v3.11.1: redraw only when a trigger / animation / state machine changed something
        if (this._protoDirty || this.protoRuntimes.length) document.querySelectorAll('#proto-frame-wrapper .proto-screen').forEach(sc => sc._redraw && sc._redraw());
        this._protoDirty = false;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    this.showProtoScreen(start, 'instant');
    const hasLinks = m.elements.some(e => e.interactions.length) || (m.triggers || []).some(t => t.scope === 'design');
    if (!hasLinks) Utils.toast('Tip: add interactions in the Prototype tab to link frames together', '💡');
  },
  closePrototype() {
    document.getElementById('prototype-modal').style.display = 'none';
    if (this.proto) this.proto.timers.forEach(clearTimeout);
    this.proto = null;
    if (this.protoEngine) { this.protoEngine.restore(); this.protoEngine.dispose(); this.protoEngine = null; }
    if (this.protoRuntimes && (this.protoRuntimes.length || this.protoBus)) {
      this.protoRuntimes.forEach(rt => rt.dispose());
      this.restoreSetupPose();
      this.model.applyTime(this.model.animationTimeline.currentTime);
      this.requestRender();
    }
    this.protoRuntimes = [];
    document.getElementById('proto-frame-wrapper').innerHTML = '';
  },
  /** Scroll the visible screen so a layer comes into view (Scroll-to action). */
  protoScrollTo(id) {
    const el = this.model.getElementById(id);
    const screen = [...document.querySelectorAll('#proto-frame-wrapper .proto-screen:not(.proto-overlay-screen)')].pop();
    if (!el || !screen || !screen._contentBox) return;
    const b = Utils.aabb(el), cb = screen._contentBox, s = screen._scale || 1;
    screen.scrollTo({ top: Math.max(0, (b.y - cb.y) * s - 16), left: Math.max(0, (b.x - cb.x) * s - 16), behavior: 'smooth' });
  },
  protoFrameById(id) {
    if (this.protoVirtual && id === this.protoVirtual.id) return this.protoVirtual;
    const el = this.model.getElementById(id);
    return el ? this.rootOf(el) : null;
  },

  protoViewport(frame) {
    const dev = PROTO_DEVICES[document.getElementById('proto-modal-device').value];
    if (!dev) return { w: frame.width, h: frame.height, s: 1, device: null };
    return { w: dev.w, h: dev.h, s: dev.w / Math.max(1, frame.width), device: dev };
  },
  fitProtoDevice() {
    const wrap = document.getElementById('proto-frame-wrapper');
    const area = document.getElementById('proto-viewport-wrap');
    const vw = parseFloat(wrap.dataset.vw) || 1, vh = parseFloat(wrap.dataset.vh) || 1;
    const border = wrap.classList.contains('no-frame') ? 0 : 24;
    const fit = Math.min(1, (area.clientWidth - 40) / (vw + border), (area.clientHeight - 40) / (vh + border));
    wrap.style.zoom = String(Math.max(0.1, fit));
  },

  /** Render a frame (with scrollable overflow) into a DOM "screen". */
  buildProtoScreen(frame, vp) {
    const m = this.model;
    const tree = m.buildTree();
    const kids = m.descendantsOf(frame.id === '__page__' ? null : frame.id);
    const contentBox = { x: frame.x, y: frame.y, w: frame.width, h: frame.height };
    const ov = frame.overflowScroll || 'none';
    if (frame.id !== '__page__' && ov !== 'none' && kids.length) {
      const b = Utils.unionBounds(kids.filter(k => k.visible).map(k => Utils.aabb(k)));
      if (b) {
        if (ov === 'vertical' || ov === 'both') contentBox.h = Math.max(frame.height, b.y + b.h - frame.y);
        if (ov === 'horizontal' || ov === 'both') contentBox.w = Math.max(frame.width, b.x + b.w - frame.x);
      }
    }
    const s = vp.s, dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(contentBox.w * s * dpr));
    canvas.height = Math.max(1, Math.round(contentBox.h * s * dpr));
    canvas.style.width = `${contentBox.w * s}px`; canvas.style.height = `${contentBox.h * s}px`;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      const tr = m.buildTree();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(s * dpr, s * dpr);
      ctx.translate(-contentBox.x, -contentBox.y);
      if (frame.id === '__page__') {
        ctx.fillStyle = m.page.bg; ctx.fillRect(contentBox.x, contentBox.y, contentBox.w, contentBox.h);
        for (const r of tr.get(null) || []) this.renderer.drawNode(ctx, r, { tree: tr });
      } else {
        const live = m.getElementById(frame.id) || frame;
        const stretched = Object.assign(Object.create(Object.getPrototypeOf(live)), live, { width: contentBox.w, height: contentBox.h, rotation: 0 });
        this.renderer.drawNode(ctx, stretched, { tree: tr });
      }
    };
    draw();
    void tree;
    const screen = document.createElement('div');
    screen.className = 'proto-screen';
    screen.style.width = `${vp.w}px`; screen.style.height = `${vp.h}px`;
    screen.style.overflowX = ov === 'horizontal' || ov === 'both' ? 'auto' : 'hidden';
    screen.style.overflowY = ov === 'vertical' || ov === 'both' || (vp.device && contentBox.h * s > vp.h) ? 'auto' : 'hidden';
    const content = document.createElement('div');
    content.className = 'proto-content';
    content.style.width = `${contentBox.w * s}px`; content.style.height = `${contentBox.h * s}px`;
    content.appendChild(canvas);
    // hotspots — v3.11.0 (DS-3.11.0-05): kept per layer and re-synced in place, so a hotspot under the pointer
    // survives a “Change to” (press → release → click still lands on the same element).
    const syncHotspots = () => {
      const live = frame.id === '__page__' ? m.elements : [frame, ...m.descendantsOf(frame.id)];
      const keep = new Set();
      let prev = null;
      for (const el of live) {
        if (!(this.protoInteractionsOf ? this.protoInteractionsOf(el) : el.interactions).length || !m.isEffectivelyVisible(el)) continue;
        keep.add(el.id);
        const b = Utils.aabb(el);
        let h = content.querySelector(`:scope > .proto-hotspot[data-id="${el.id}"]`);
        if (!h) { h = document.createElement('div'); h.className = 'proto-hotspot'; h.dataset.id = el.id; }
        const anchor = prev || canvas;
        if (h.previousElementSibling !== anchor) anchor.after(h); // stacking follows layer order (only moved when it changed)
        h.title = el.name;
        Object.assign(h.style, { left: `${(b.x - contentBox.x) * s}px`, top: `${(b.y - contentBox.y) * s}px`, width: `${b.w * s}px`, height: `${b.h * s}px`, cursor: '' });
        h._ac?.abort(); h._ac = new AbortController();
        this.bindHotspot(h, el, h._ac.signal);
        prev = h;
      }
      content.querySelectorAll(':scope > .proto-hotspot').forEach(h => { if (!keep.has(h.dataset.id)) { h._ac?.abort(); h.remove(); } });
    };
    syncHotspots();
    screen._syncHotspots = syncHotspots; screen._frame = frame;
    // State-machine listeners (global inputs) — pointer events map back to design-space hit tests
    if ((this.protoRuntimes && this.protoRuntimes.length) || this.protoEngine) {
      const E = this.protoEngine;
      const toWorld = (ev) => { const r = content.getBoundingClientRect(); const z = r.width / Math.max(1, contentBox.w * s); return { x: contentBox.x + (ev.clientX - r.left) / z / s, y: contentBox.y + (ev.clientY - r.top) / z / s }; };
      const hitIds = (ev) => { const d = this.hitTestDeep(toWorld(ev)); return d ? [d.id, ...m.ancestorsOf(d).map(a => a.id)] : []; };
      let down = [], hover = new Set();
      content.addEventListener('pointerdown', (ev) => { down = hitIds(ev); this.protoRuntimes.forEach(rt => rt.pointer('pointerDown', down)); if (E) { const w = toWorld(ev); E.pointerDown(down, w.x, w.y); } });
      content.addEventListener('pointerup', (ev) => { const ids = hitIds(ev); this.protoRuntimes.forEach(rt => { rt.pointer('pointerUp', ids); const c = ids.filter(i => down.includes(i)); if (c.length) rt.pointer('click', c); }); if (E) { const w = toWorld(ev); E.pointerUp(ids, w.x, w.y); } });
      content.addEventListener('pointerleave', () => E?.pointerLeave());
      content.addEventListener('pointermove', (ev) => {
        const ids = hitIds(ev), now = new Set(ids);
        if (E) { const w = toWorld(ev), r = screen.getBoundingClientRect(); E.pointerMove(ids, w.x, w.y, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height); }
        const ent = ids.filter(i => !hover.has(i)), ex = [...hover].filter(i => !now.has(i));
        this.protoRuntimes.forEach(rt => { if (ent.length) rt.pointer('pointerEnter', ent); if (ex.length) rt.pointer('pointerExit', ex); });
        const listened = new Set([...this.protoRuntimes.flatMap(rt => rt.hasListenerTargets()), ...(E ? E.listens() : [])]);
        content.style.cursor = ids.some(i => listened.has(i)) ? 'pointer' : '';
        hover = now;
      });
    }
    content.addEventListener('click', (e) => { if (!e.target.closest('.proto-hotspot') && !(this.protoRuntimes && this.protoRuntimes.length) && !this.protoEngine) this.flashProtoHints(); });
    // scroll progress (0–100) feeds Scroll triggers
    screen.addEventListener('scroll', () => {
      if (!this.protoEngine) return;
      const maxY = screen.scrollHeight - screen.clientHeight, maxX = screen.scrollWidth - screen.clientWidth;
      const p = maxY > 1 ? screen.scrollTop / maxY : maxX > 1 ? screen.scrollLeft / maxX : 0;
      this.protoEngine.scroll(p * 100);
    }, { passive: true });
    // v3.11.1: click-and-drag scrolls a scrollable screen (Figma style); a drag never counts as a click
    screen.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || (screen.scrollHeight <= screen.clientHeight + 1 && screen.scrollWidth <= screen.clientWidth + 1)) return;
      const sx = e.clientX, sy = e.clientY, st = screen.scrollTop, sl = screen.scrollLeft;
      let dragging = false;
      const move = (ev) => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        dragging = true; screen.style.cursor = 'grabbing';
        screen.scrollTop = st - (ev.clientY - sy); screen.scrollLeft = sl - (ev.clientX - sx);
      };
      const up = () => {
        window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true);
        screen.style.cursor = '';
        if (dragging) window.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
      };
      window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true);
    }, true); // capture: works even when the drag starts on a button
    screen._contentBox = contentBox; screen._scale = s;
    screen.appendChild(content);
    screen._redraw = draw;
    return screen;
  },
  bindHotspot(h, el) {
    for (const inter of el.interactions) {
      if (inter.trigger === 'click') h.addEventListener('click', (e) => { e.stopPropagation(); this.runInteraction(inter); });
      else if (inter.trigger === 'hover') {
        h.addEventListener('mouseenter', () => { this.hoverOrigin = this.proto.current; this.runInteraction(inter); });
        h.addEventListener('mouseleave', () => { if (this.proto && this.hoverOrigin) { const o = this.hoverOrigin; this.hoverOrigin = null; if (inter.action === 'overlay') this.closeProtoOverlay(); else this.showProtoScreen(o, 'dissolve', 150); } });
      } else if (inter.trigger === 'drag') {
        h.addEventListener('pointerdown', (e) => {
          const sx = e.clientX, sy = e.clientY;
          const move = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) { cleanup(); this.runInteraction(inter); } };
          const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', cleanup); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', cleanup);
        });
      }
    }
  },
  flashProtoHints() {
    const w = document.getElementById('proto-frame-wrapper');
    w.classList.remove('flash-hints'); void w.offsetWidth; w.classList.add('flash-hints');
  },

  showProtoScreen(frame, transition = 'instant', duration = 300, keepHistory = false) {
    if (!this.proto || !frame) return;
    const P = this.proto;
    P.timers.forEach(clearTimeout); P.timers = [];
    const wrap = document.getElementById('proto-frame-wrapper');
    const vp = this.protoViewport(frame);
    wrap.classList.toggle('no-frame', !vp.device);
    wrap.style.width = `${vp.w}px`; wrap.style.height = `${vp.h}px`;
    wrap.style.borderRadius = vp.device ? `${vp.device.r}px` : '0';
    wrap.style.background = this.model.prototypeSettings.canvasBg;
    wrap.dataset.vw = vp.w; wrap.dataset.vh = vp.h;
    this.fitProtoDevice();
    const screen = this.buildProtoScreen(frame, vp);
    const old = [...wrap.querySelectorAll('.proto-screen:not(.proto-overlay-screen)')];
    wrap.insertBefore(screen, wrap.querySelector('.proto-overlay-dim'));
    const ms = transition === 'instant' ? 0 : duration;
    if (ms > 0 && old.length) {
      screen.style.transition = `transform ${ms}ms cubic-bezier(0.4,0,0.2,1), opacity ${ms}ms ease`;
      if (transition === 'dissolve') screen.style.opacity = '0';
      if (transition === 'slide' || transition === 'push') screen.style.transform = 'translateX(100%)';
      old.forEach(o => { o.style.transition = `transform ${ms}ms cubic-bezier(0.4,0,0.2,1)`; });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        screen.style.opacity = '1'; screen.style.transform = 'translateX(0)';
        if (transition === 'push') old.forEach(o => { o.style.transform = 'translateX(-100%)'; });
      }));
      P.timers.push(setTimeout(() => old.forEach(o => o.remove()), ms + 30));
    } else old.forEach(o => o.remove());
    if (!keepHistory) P.current = frame;
    document.getElementById('proto-flow-title').textContent = `${this.model.prototypeSettings.flowName} · ${frame.name}`;
    // delay triggers
    const els = frame.id === '__page__' ? this.model.elements : [frame, ...this.model.descendantsOf(frame.id)];
    for (const el of els) for (const inter of el.interactions) {
      if (inter.trigger === 'delay') P.timers.push(setTimeout(() => this.runInteraction(inter), inter.delay || 800));
    }
    // triggers: global ones start once with the prototype, screen ones each time this frame opens
    if (this.protoEngine && !keepHistory) { this.protoEngine.start(frame.id, { global: !P.triggersStarted }); P.triggersStarted = true; }
  },
  runInteraction(inter) {
    const P = this.proto;
    if (!P) return;
    if (inter.action === 'fire' || inter.action === 'set') {
      if (!this.protoBus || !inter.inputId) { Utils.toast('This interaction targets an input, but no state machine uses it yet', 'ℹ️'); return; }
      if (inter.action === 'fire') this.protoBus.fire(inter.inputId); else this.protoBus.set(inter.inputId, inter.value);
      return;
    }
    if (inter.action === 'url') {
      if (/^https?:\/\//i.test(inter.url || '')) window.open(inter.url, '_blank', 'noopener,noreferrer');
      else Utils.toast('This interaction has no valid URL', '⚠️');
      return;
    }
    if (inter.action === 'back') {
      if (P.overlay) { this.closeProtoOverlay(); return; }
      const prev = P.history.pop();
      if (prev) { this.showProtoScreen(prev, inter.transition === 'instant' ? 'instant' : 'dissolve', inter.duration); P.current = prev; }
      return;
    }
    const target = this.protoFrameById(inter.targetId);
    if (!target) { Utils.toast('Destination frame not found', '⚠️'); return; }
    if (inter.action === 'overlay') { this.openProtoOverlay(target, inter); return; }
    if (P.overlay) this.closeProtoOverlay();
    P.history.push(P.current);
    this.showProtoScreen(target, inter.transition, inter.duration);
  },
  openProtoOverlay(frame, inter) {
    const P = this.proto;
    this.closeProtoOverlay();
    const wrap = document.getElementById('proto-frame-wrapper');
    const base = this.protoViewport(P.current);
    const s = base.s;
    const dim = document.createElement('div');
    dim.className = 'proto-overlay-dim';
    const screen = this.buildProtoScreen(frame, { w: frame.width * s, h: frame.height * s, s, device: null });
    screen.classList.add('proto-overlay-screen');
    dim.appendChild(screen);
    dim.addEventListener('click', (e) => { if (e.target === dim) this.closeProtoOverlay(); });
    wrap.appendChild(dim);
    const ms = inter.transition === 'instant' ? 0 : inter.duration;
    if (ms) {
      dim.style.opacity = '0'; screen.style.transform = inter.transition === 'dissolve' ? 'scale(0.96)' : 'translateY(40px)';
      dim.style.transition = `opacity ${ms}ms ease`; screen.style.transition = `transform ${ms}ms cubic-bezier(0.4,0,0.2,1)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { dim.style.opacity = '1'; screen.style.transform = 'none'; }));
    }
    P.overlay = dim;
  },
  closeProtoOverlay() {
    if (this.proto && this.proto.overlay) { this.proto.overlay.remove(); this.proto.overlay = null; }
  }
};
Object.assign(StudioApp.prototype, PrototypeMixin);
