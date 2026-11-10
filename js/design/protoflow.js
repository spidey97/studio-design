/**
 * DesignStudio — Prototype flows, Figma-style (v3.7.0).
 * Canvas wiring: in the Prototype tab, drag the ⊕ node of a layer onto a frame to connect it; connections are
 * drawn as arrows; click one to edit it in the floating Interaction panel (Trigger · Action · Destination ·
 * Animation · Overlay · State). Player: every trigger and action below works, with directional animations,
 * easing, Smart animate, overlay positions and “Change to” for component variants.
 */
'use strict';

const PROTO_TRIGGERS = [
  ['click', 'On click', '👆'], ['drag', 'On drag', '✋'], ['hover', 'While hovering', '🖱'], ['press', 'While pressing', '⏺'],
  ['key', 'Key / gamepad', '⌨'], ['mouseEnter', 'Mouse enter', '↘'], ['mouseLeave', 'Mouse leave', '↗'], ['delay', 'After delay', '⏱']
];
const PROTO_ACTIONS = [
  ['navigate', 'Navigate to', '→'], ['changeTo', 'Change to', '◇'], ['back', 'Back', '←'], ['scrollTo', 'Scroll to', '↧'], ['url', 'Open link', '🔗'],
  ['overlay', 'Open overlay', '▣'], ['swapOverlay', 'Swap overlay', '⇄'], ['closeOverlay', 'Close overlay', '✕'], ['fire', 'Fire input (global)', '⚡'], ['set', 'Set input (global)', '⚙']
];
const PROTO_ANIMS = [['instant', 'Instant'], ['dissolve', 'Dissolve'], ['smart', 'Smart animate'], ['moveIn', 'Move in'], ['moveOut', 'Move out'], ['push', 'Push'], ['slideIn', 'Slide in'], ['slideOut', 'Slide out']];
const PROTO_EASINGS = {
  easeOut: ['Ease out', 'cubic-bezier(0, 0, 0.58, 1)'], easeIn: ['Ease in', 'cubic-bezier(0.42, 0, 1, 1)'], easeInOut: ['Ease in and out', 'cubic-bezier(0.42, 0, 0.58, 1)'],
  linear: ['Linear', 'linear'], easeInBack: ['Ease in back', 'cubic-bezier(0.3, -0.05, 0.7, -0.5)'], easeOutBack: ['Ease out back', 'cubic-bezier(0.45, 1.45, 0.8, 1)'],
  gentle: ['Gentle', 'cubic-bezier(0.25, 0.1, 0.25, 1)'], quick: ['Quick', 'cubic-bezier(0.2, 0, 0, 1)'], bouncy: ['Bouncy', 'cubic-bezier(0.34, 1.56, 0.64, 1)'], slow: ['Slow', 'cubic-bezier(0.6, 0, 0.4, 1)']
};
const PROTO_TARGETED = new Set(['navigate', 'changeTo', 'scrollTo', 'overlay', 'swapOverlay']);
const PROTO_OVERLAY_POS = [['center', 'Center'], ['top', 'Top center'], ['bottom', 'Bottom center'], ['left', 'Left'], ['right', 'Right'], ['topLeft', 'Top left'], ['topRight', 'Top right'], ['bottomLeft', 'Bottom left'], ['bottomRight', 'Bottom right']];

/** Default interaction (Figma defaults: On click → Navigate to → Instant). */
function protoInteraction(over = {}) {
  return Object.assign({ trigger: 'click', action: 'navigate', targetId: null, url: '', newTab: true, transition: 'instant', direction: 'left', easing: 'easeOut', duration: 300, delay: 800, key: 'Enter', overlayPos: 'center', closeOutside: true, overlayBg: true, preserveScroll: false, inputId: null, value: 1 }, over);
}

const ProtoFlowMixin = {
  // =================================================================== PLAYER
  /** Hotspots for one element: every trigger type. */
  /** QA-23: while an instance is in a temporary state (While hovering / While pressing → Change to), the
   *  variant it came from keeps its interactions too — e.g. Default's “While pressing → Pressed” still works
   *  while the button shows its Hover variant. */
  protoInteractionsOf(el) {
    const P = this.proto, list = el.interactions.slice();
    if (!P?.temp || !el.isComponentInstance) return list;
    const active = [...P.temp].filter(([, T]) => T.kind === 'changeTo' && T.inst === el).map(([inter]) => inter);
    const same = (a, b2) => a.trigger === b2.trigger && a.action === b2.action && a.targetId === b2.targetId;
    for (const [, T] of P.temp) {
      if (T.kind !== 'changeTo' || T.inst !== el) continue;
      const from = this.model.findAnywhere(T.from);
      for (const it of from?.interactions || []) if (!active.some(a => same(a, it)) && !list.some(x => same(x, it))) list.push(it); // never re-run an active state
    }
    return list;
  },
  bindHotspot(h, el, signal) {
    const o = signal ? { signal } : undefined;
    for (const inter of this.protoInteractionsOf(el)) {
      const t = inter.trigger;
      if (t === 'click') h.addEventListener('click', (e) => { e.stopPropagation(); this.runInteraction(inter, el); }, o);
      else if (t === 'mouseEnter') h.addEventListener('mouseenter', () => this.runInteraction(inter, el), o);
      else if (t === 'mouseLeave') h.addEventListener('mouseleave', () => this.runInteraction(inter, el), o);
      else if (t === 'hover' || t === 'press') {
        // The hotspot may vanish when the screen changes, so the revert watches the pointer globally
        h.addEventListener(t === 'hover' ? 'mouseenter' : 'pointerdown', (e) => {
          if (t === 'press') e.stopPropagation();
          if (this.proto?.temp?.has(inter) && this.proto.temp.get(inter).inst === (el.isComponentInstance ? el : this.proto.temp.get(inter).inst)) return;
          const r = h.getBoundingClientRect();
          this.runInteraction(inter, el, { temporary: true });
          const off = (ev) => {
            const rr = h.isConnected ? h.getBoundingClientRect() : r; // the hotspot follows the variant's size
            const out = ev.type === 'pointerup' || ev.type === 'blur' || ev.clientX < rr.left || ev.clientX > rr.right || ev.clientY < rr.top || ev.clientY > rr.bottom;
            if (!out && this.proto) return;
            ['pointermove', 'pointerup', 'blur'].forEach(n => window.removeEventListener(n, off, true));
            this.revertTemporary(inter);
          };
          ['pointermove', t === 'press' ? 'pointerup' : '', 'blur'].filter(Boolean).forEach(n => window.addEventListener(n, off, true));
        }, o);
      } else if (t === 'drag') {
        h.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const sx = e.clientX, sy = e.clientY;
          const move = (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12) { cleanup(); this.runInteraction(inter, el, { dir: Math.abs(ev.clientX - sx) > Math.abs(ev.clientY - sy) ? (ev.clientX < sx ? 'left' : 'right') : (ev.clientY < sy ? 'up' : 'down') }); } };
          const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', cleanup); };
          window.addEventListener('pointermove', move); window.addEventListener('pointerup', cleanup);
        }, o);
      }
      if (['click', 'press', 'drag', 'hover'].includes(t)) h.style.cursor = 'pointer';
    }
  },
  /** Undo what a “While hovering / While pressing” interaction did when the pointer leaves / releases. */
  revertTemporary(inter) {
    const P = this.proto, T = P?.temp?.get(inter);
    if (!T) return;
    P.temp.delete(inter);
    if (T.kind === 'overlay') this.closeProtoOverlay();
    else if (T.kind === 'changeTo') {
      // DS-3.11.0-06: states can end out of order (leave while still pressing). If a later state was built on
      // top of this one, hand it our starting variant instead of switching now.
      const later = [...P.temp.values()].find(o => o.kind === 'changeTo' && o.inst === T.inst && o.from === T.to);
      if (later) { later.from = T.from; return; }
      if (T.inst.masterComponentId !== T.to) return;
      T.inst.masterComponentId = T.from; this.model.syncComponents(); this.refreshProtoScreens(inter, T.inst);
    }
    else if (T.kind === 'navigate' && P.current === T.to) { P.history.pop(); this.showProtoScreen(T.from, inter.transition === 'instant' ? 'instant' : 'dissolve', Math.min(200, inter.duration || 200), false, inter); }
  },
  runInteraction(inter, el = null, opts = {}) {
    const P = this.proto;
    if (!P) return;
    const a = inter.action;
    if (a === 'fire' || a === 'set') {
      if (!this.protoBus || !inter.inputId) { Utils.toast('This interaction targets an input that no longer exists', 'ℹ️'); return; }
      if (a === 'fire') this.protoBus.fire(inter.inputId); else this.protoBus.set(inter.inputId, inter.value);
      return;
    }
    if (a === 'url') {
      if (/^https?:\/\//i.test(inter.url || '')) window.open(inter.url, inter.newTab === false ? '_self' : '_blank', 'noopener,noreferrer');
      else Utils.toast('This interaction has no valid link (it must start with https://)', '⚠️');
      return;
    }
    if (a === 'back') {
      if (P.overlay) { this.closeProtoOverlay(true, inter); return; }
      const prev = P.history.pop();
      if (prev) this.showProtoScreen(prev.frame, inter.transition, inter.duration, true, this.reverseAnim(prev.inter || inter), prev.scroll);
      return;
    }
    if (a === 'closeOverlay') { this.closeProtoOverlay(true, inter); return; }
    if (a === 'scrollTo') { this.protoScrollTo(inter.targetId); return; }
    if (a === 'changeTo') {
      const inst = el && (el.isComponentInstance ? el : this.model.ancestorsOf(el).reverse().find(x => x.isComponentInstance));
      const target = this.model.findAnywhere(inter.targetId);
      if (!inst || !target?.isComponentMaster) { Utils.toast('“Change to” works on component instances — pick a variant as destination', 'ℹ️'); return; }
      const from = inst.masterComponentId;
      if (from === target.id) return;
      P.changed.push({ inst, from }); // reverted when the prototype closes
      if (opts.temporary) P.temp.set(inter, { kind: 'changeTo', inst, from, to: target.id });
      const snap = this.protoSnapshot(inst);
      inst.masterComponentId = target.id;
      this.model.syncComponents();
      this.refreshProtoScreens(inter, inst, snap);
      return;
    }
    const target = this.protoFrameById(inter.targetId);
    if (!target) { Utils.toast('Destination frame not found — it may have been deleted', '⚠️'); return; }
    if (a === 'overlay' || a === 'swapOverlay') {
      if (a === 'swapOverlay' && !P.overlay) { Utils.toast('Swap overlay needs an open overlay', 'ℹ️'); return; }
      this.openProtoOverlay(target, inter);
      if (opts.temporary) P.temp.set(inter, { kind: 'overlay' });
      return;
    }
    // navigate
    if (P.overlay) this.closeProtoOverlay(false);
    const from = P.current;
    const scroll = this.protoCurrentScroll();
    P.history.push({ frame: from, inter, scroll });
    const anim = opts.dir && inter.trigger === 'drag' && ['moveIn', 'push', 'slideIn', 'moveOut', 'slideOut'].includes(inter.transition) ? { ...inter, direction: opts.dir } : inter;
    this.showProtoScreen(target, anim.transition, anim.duration, false, anim, inter.preserveScroll ? scroll : null);
    if (opts.temporary) P.temp.set(inter, { kind: 'navigate', from, to: target });
  },
  reverseAnim(inter) {
    const opp = { left: 'right', right: 'left', up: 'down', down: 'up' };
    const t = { moveIn: 'moveOut', moveOut: 'moveIn', slideIn: 'slideOut', slideOut: 'slideIn' }[inter.transition] || inter.transition;
    return { ...inter, transition: t, direction: opp[inter.direction] || 'right' };
  },
  protoCurrentScroll() {
    const s = [...document.querySelectorAll('#proto-frame-wrapper > .proto-screen')].pop();
    return s ? { top: s.scrollTop, left: s.scrollLeft } : null;
  },
  /** Geometry/paint of an instance subtree, used to animate a “Change to” in place. */
  protoSnapshot(inst) {
    if (!inst) return null;
    const snap = new Map();
    for (const el of [inst, ...this.model.descendantsOf(inst.id)]) snap.set(el, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation || 0, opacity: el.opacity ?? 1, cornerRadius: el.cornerRadius || 0, fill: el.fills?.[0]?.color, visible: el.visible });
    return snap;
  },
  /** DS-3.11.0-05: redraw after a component “Change to” IN PLACE — the screen, its scroll and the hotspot under the
   *  pointer stay; only the instance animates (Smart animate / Dissolve tween its layers, other transitions are instant). */
  refreshProtoScreens(inter, inst = null, snap = null) {
    const P = this.proto;
    if (!P) return;
    const screens = [...document.querySelectorAll('#proto-frame-wrapper .proto-screen:not(.leaving)')].filter(sc => sc._redraw);
    if (!screens.length) { this.showProtoScreen(P.current, 'instant', 0, true, null, this.protoCurrentScroll()); return; }
    screens.forEach(sc => { sc._syncHotspots?.(); sc._redraw(); });
    const ms = inter && inter.transition !== 'instant' ? Math.max(0, Math.min(1200, +inter.duration || 0)) : 0;
    if (!ms || !snap || !inst) return;
    const ease = Utils.easings[{ easeOut: 'easeOut', easeIn: 'easeIn', easeInOut: 'easeInOut', linear: 'linear', easeInBack: 'easeInBack', easeOutBack: 'easeOutBack', bouncy: 'easeOutBack' }[inter.easing] || 'easeOut'] || Utils.easings.easeOut;
    const lerp = (x, y, k) => x + (y - x) * k;
    const smart = inter.transition === 'smart';
    const targets = [inst, ...this.model.descendantsOf(inst.id)];
    const token = {}; P.changeAnim = token;
    const t0 = performance.now();
    const step = () => {
      if (!this.proto || P.changeAnim !== token) return;
      const k = Math.min(1, (performance.now() - t0) / ms), e = ease(k);
      const saved = [];
      for (const el of targets) {
        const a = snap.get(el);
        saved.push([el, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation, opacity: el.opacity, cornerRadius: el.cornerRadius, fill: el.fills?.[0]?.color }]);
        if (!a) { el.opacity = (el.opacity ?? 1) * e; continue; } // new in this variant → fade in
        if (smart) {
          el.x = lerp(a.x, el.x, e); el.y = lerp(a.y, el.y, e); el.width = lerp(a.width, el.width, e); el.height = lerp(a.height, el.height, e);
          el.rotation = lerp(a.rotation, el.rotation || 0, e); el.cornerRadius = lerp(a.cornerRadius, el.cornerRadius || 0, e);
        }
        el.opacity = lerp(a.visible === false ? 0 : a.opacity, el.opacity ?? 1, e);
        if (a.fill && el.fills?.[0]?.color && /^#/.test(a.fill) && /^#/.test(el.fills[0].color)) el.fills[0].color = Utils.mixColor(a.fill, el.fills[0].color, e);
      }
      screens.forEach(sc => sc.isConnected && sc._redraw());
      for (const [el, v] of saved) { const { fill, ...rest } = v; Object.assign(el, rest); if (fill !== undefined && el.fills?.[0]) el.fills[0].color = fill; }
      if (k < 1) requestAnimationFrame(step); else screens.forEach(sc => sc.isConnected && sc._redraw());
    };
    requestAnimationFrame(step);
  },

  /** Show a screen with Figma's animations. keepHistory = don't touch P.current history (back / refresh). */
  showProtoScreen(frame, transition = 'instant', duration = 300, keepHistory = false, inter = null, scroll = null) {
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
    // finish any running transition instantly (fast clicking never leaves stacked screens behind)
    wrap.querySelectorAll(':scope > .proto-screen.leaving').forEach(o => o.remove());
    const screen = this.buildProtoScreen(frame, vp);
    const old = [...wrap.querySelectorAll(':scope > .proto-screen')];
    wrap.insertBefore(screen, wrap.querySelector('.proto-overlay-dim'));
    if (scroll) { screen.scrollTop = scroll.top; screen.scrollLeft = scroll.left; }
    const ms = transition === 'instant' || !old.length ? 0 : Math.max(0, +duration || 0);
    const fromFrame = P.current;
    if (!keepHistory || P.current !== frame) P.current = frame;
    if (ms) this.animateScreens(old, screen, transition, ms, inter || {}, fromFrame, frame);
    else old.forEach(o => o.remove());
    document.getElementById('proto-flow-title').textContent = `${this.model.prototypeSettings.flowName} · ${frame.name}`;
    // After-delay interactions of this screen
    const els = frame.id === '__page__' ? this.model.elements : [frame, ...this.model.descendantsOf(frame.id)];
    for (const el of els) for (const it of el.interactions) if (it.trigger === 'delay') P.timers.push(setTimeout(() => { if (this.proto && P.current === frame) this.runInteraction(it, el); }, it.delay || 800));
    if (this.protoEngine && !keepHistory) { this.protoEngine.start(frame.id, { global: !P.triggersStarted }); P.triggersStarted = true; screen._redraw?.(); } // v3.11.1: paint the start pose before the first frame
  },
  animateScreens(old, screen, transition, ms, inter, fromFrame, toFrame) {
    const ease = (PROTO_EASINGS[inter.easing] || PROTO_EASINGS.easeOut)[1];
    const dir = inter.direction || 'left';
    // incoming starts on the opposite side of the movement direction
    const inStart = { left: 'translate(100%,0)', right: 'translate(-100%,0)', up: 'translate(0,100%)', down: 'translate(0,-100%)' }[dir];
    const outEnd = { left: 'translate(-100%,0)', right: 'translate(100%,0)', up: 'translate(0,-100%)', down: 'translate(0,100%)' }[dir];
    const part = (t, f) => t.replace(/100%/g, `${f}%`);
    const tr = `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}`;
    old.forEach(o => { o.classList.add('leaving'); o.style.transition = tr; });
    screen.style.transition = tr;
    let set1 = () => {};
    switch (transition) {
      case 'dissolve': screen.style.opacity = '0'; set1 = () => { screen.style.opacity = '1'; }; break;
      case 'moveIn': screen.style.transform = inStart; set1 = () => { screen.style.transform = 'none'; }; break;
      case 'moveOut': screen.style.zIndex = '0'; old.forEach(o => { o.style.zIndex = '1'; }); set1 = () => old.forEach(o => { o.style.transform = outEnd; }); break;
      case 'push': screen.style.transform = inStart; set1 = () => { screen.style.transform = 'none'; old.forEach(o => { o.style.transform = outEnd; }); }; break;
      case 'slideIn': screen.style.transform = inStart; set1 = () => { screen.style.transform = 'none'; old.forEach(o => { o.style.transform = part(outEnd, 30); o.style.opacity = '0.6'; }); }; break;
      case 'slideOut': screen.style.zIndex = '0'; old.forEach(o => { o.style.zIndex = '1'; }); screen.style.transform = part(inStart, 30); set1 = () => { screen.style.transform = 'none'; old.forEach(o => { o.style.transform = outEnd; }); }; break;
      case 'smart': this.smartAnimate(old, screen, ms, inter, fromFrame, toFrame); break;
      default: screen.style.opacity = '0'; set1 = () => { screen.style.opacity = '1'; };
    }
    requestAnimationFrame(() => requestAnimationFrame(set1));
    const P = this.proto;
    P.timers.push(setTimeout(() => { old.forEach(o => o.remove()); screen.style.transition = ''; screen.style.transform = ''; screen.style.zIndex = ''; }, ms + 40));
  },
  /** Smart animate: layers with the same name path in both frames tween position, size, rotation, opacity, radius and fill. */
  smartAnimate(old, screen, ms, inter, fromFrame, toFrame) {
    const m = this.model;
    if (!fromFrame || !toFrame || fromFrame.id === '__page__' || toFrame.id === '__page__') { screen.style.opacity = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { screen.style.opacity = '1'; })); return; }
    const pathMap = (frame) => {
      const map = new Map();
      for (const d of m.descendantsOf(frame.id)) { const p = m.componentPath(frame, d, m.elements); if (p && !map.has(p)) map.set(p, d); }
      return map;
    };
    const A = pathMap(fromFrame), B = pathMap(toFrame);
    const pairs = [], fades = [];
    for (const [p, b] of B) {
      const a = A.get(p);
      if (a) pairs.push({ a, b, rel: { x: a.x - fromFrame.x, y: a.y - fromFrame.y }, to: { x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation, opacity: b.opacity, cornerRadius: b.cornerRadius, fill: b.fills[0]?.color } });
      else fades.push({ b, opacity: b.opacity });
    }
    const ease = Utils.easings[{ easeOut: 'easeOut', easeIn: 'easeIn', easeInOut: 'easeInOut', linear: 'linear', easeInBack: 'easeInBack', easeOutBack: 'easeOutBack', bouncy: 'easeOutBack' }[inter.easing] || 'easeInOut'] || Utils.easings.easeInOut;
    old.forEach(o => { o.style.transition = `opacity ${Math.round(ms * 0.5)}ms ease`; o.style.opacity = '0'; });
    const lerp = (x, y, k) => x + (y - x) * k;
    const t0 = performance.now();
    const step = () => {
      if (!this.proto || !screen.isConnected) return;
      const k = Math.min(1, (performance.now() - t0) / ms), e = ease(k);
      const saved = [];
      for (const pr of pairs) {
        const b = pr.b, fa = pr.a;
        saved.push([b, { x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation, opacity: b.opacity, cornerRadius: b.cornerRadius, fill: b.fills[0]?.color }]);
        b.x = lerp(toFrame.x + pr.rel.x, pr.to.x, e); b.y = lerp(toFrame.y + pr.rel.y, pr.to.y, e);
        b.width = lerp(fa.width, pr.to.width, e); b.height = lerp(fa.height, pr.to.height, e);
        b.rotation = lerp(fa.rotation || 0, pr.to.rotation || 0, e); b.opacity = lerp(fa.opacity ?? 1, pr.to.opacity ?? 1, e);
        b.cornerRadius = lerp(fa.cornerRadius || 0, pr.to.cornerRadius || 0, e);
        if (b.fills[0] && fa.fills[0] && pr.to.fill) b.fills[0].color = Utils.mixColor(fa.fills[0].color, pr.to.fill, e);
      }
      for (const f of fades) { saved.push([f.b, { opacity: f.b.opacity }]); f.b.opacity = f.opacity * e; }
      screen._redraw && screen._redraw();
      for (const [el, v] of saved) { const { fill, ...rest } = v; Object.assign(el, rest); if (fill !== undefined && el.fills[0]) el.fills[0].color = fill; }
      if (k < 1) requestAnimationFrame(step); else screen._redraw && screen._redraw();
    };
    step();
  },
  openProtoOverlay(frame, inter) {
    const P = this.proto;
    const swapping = !!P.overlay && inter.action === 'swapOverlay';
    this.closeProtoOverlay(false);
    const wrap = document.getElementById('proto-frame-wrapper');
    const base = this.protoViewport(P.current);
    const s = base.s;
    const dim = document.createElement('div');
    dim.className = `proto-overlay-dim pos-${inter.overlayPos || 'center'}${inter.overlayBg === false ? ' no-bg' : ''}`;
    const screen = this.buildProtoScreen(frame, { w: frame.width * s, h: frame.height * s, s, device: null });
    screen.classList.add('proto-overlay-screen');
    dim.appendChild(screen);
    dim.addEventListener('click', (e) => { if (e.target === dim && inter.closeOutside !== false) this.closeProtoOverlay(true, inter); });
    wrap.appendChild(dim);
    const ms = inter.transition === 'instant' || swapping ? 0 : (inter.duration || 0);
    if (ms) {
      const ease = (PROTO_EASINGS[inter.easing] || PROTO_EASINGS.easeOut)[1];
      const start = { moveIn: { left: 'translateX(60px)', right: 'translateX(-60px)', up: 'translateY(60px)', down: 'translateY(-60px)' }[inter.direction || 'up'] }[inter.transition] || (inter.transition === 'dissolve' ? 'scale(0.97)' : 'translateY(40px)');
      dim.style.opacity = '0'; screen.style.transform = start;
      dim.style.transition = `opacity ${ms}ms ${ease}`; screen.style.transition = `transform ${ms}ms ${ease}`;
      requestAnimationFrame(() => requestAnimationFrame(() => { dim.style.opacity = '1'; screen.style.transform = 'none'; }));
    }
    P.overlay = dim; P.overlayFrame = frame;
    // After-delay interactions inside the overlay
    for (const el of [frame, ...this.model.descendantsOf(frame.id)]) for (const it of el.interactions) if (it.trigger === 'delay') P.timers.push(setTimeout(() => { if (this.proto && P.overlayFrame === frame) this.runInteraction(it, el); }, it.delay || 800));
  },
  closeProtoOverlay(animate = false, inter = null) {
    const P = this.proto;
    if (!P || !P.overlay) return;
    const dim = P.overlay;
    P.overlay = null; P.overlayFrame = null;
    const ms = animate && inter && inter.transition !== 'instant' ? Math.min(250, inter.duration || 200) : 0;
    if (!ms) { dim.remove(); return; }
    dim.style.transition = `opacity ${ms}ms ease`; dim.style.opacity = '0';
    setTimeout(() => dim.remove(), ms + 20);
  },
  /** Key / gamepad trigger: interactions on the visible screen (and overlay) whose key matches. */
  protoKey(e) {
    const P = this.proto;
    if (!P) return false;
    const frames = [P.overlayFrame, P.current].filter(Boolean);
    const norm = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
    for (const fr of frames) {
      const els = fr.id === '__page__' ? this.model.elements : [fr, ...this.model.descendantsOf(fr.id)];
      for (const el of els) for (const it of el.interactions) if (it.trigger === 'key' && norm(it.key || '') === norm(e.key)) { e.preventDefault(); this.runInteraction(it, el); return true; }
    }
    return false;
  },

  // =================================================================== CANVAS WIRING (Prototype tab)
  wiringOn() { return this.section === 'design' && this.activeRightTab === 'prototype' && !this.previewing; },
  bindProtoFlow() {
    const origOpen = this.openPrototype.bind(this), origClose = this.closePrototype.bind(this);
    this.openPrototype = (...a) => { this.selectConnection(null); return origOpen(...a); };
    this.closePrototype = (...a) => {
      const P = this.proto;
      if (P?.changed?.length) { for (const c of P.changed.reverse()) c.inst.masterComponentId = c.from; this.model.syncComponents(); }
      const r0 = origClose(...a); this.requestRender(); return r0;
    };
    // renderer hook: draw connections on top of the design
    const r = this.renderer, origOv = r.drawOverlays.bind(r);
    r.drawOverlays = (ctx, tree) => { origOv(ctx, tree); if (this.wiringOn()) this.drawWiring(ctx); };
    // pointer: our handles first
    const origDown = this.onPointerDown.bind(this);
    this.onPointerDown = (e) => { if (this.wiringOn() && e.target === this.canvas && e.button === 0 && this.wiringPointerDown(e)) return; origDown(e); };
    // keyboard
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('prototype-modal').style.display === 'flex') { if (this.protoKey(e)) { e.stopImmediatePropagation(); } return; }
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (!this.wiringOn() || !this.selConn) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); this.deleteConnection(this.selConn); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.selectConnection(null); }
    }, true);
    const addBtn = document.getElementById('btn-add-interaction'), nb = addBtn.cloneNode(true);
    addBtn.replaceWith(nb); nb.addEventListener('click', () => this.addInteractionToSelection());
    // Interactions first (the everyday tool), advanced ⚡ triggers below
    const pt = document.getElementById('panel-tab-prototype'), head = pt?.querySelector('div[style*="font-weight:600"]'), trg = document.getElementById('design-triggers');
    if (head) head.textContent = 'Interactions';
    if (trg && nb.parentElement) nb.after(trg), trg.style.marginTop = '16px';
    // the Prototype tab list opens the popover too; tab switch redraws the canvas
    document.querySelectorAll('#right-panel .panel-tab-btn').forEach(t => t.addEventListener('click', () => { if (t.dataset.tab !== 'prototype') this.selectConnection(null); this.requestRender(); }));
    // popover follows pan / zoom
    let last = '';
    const loop = () => {
      const m = this.model, k = `${m.zoom}|${m.panX}|${m.panY}`;
      if (k !== last) { last = k; this.placeInteractionPopover(); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const origSel = this.selectionChanged.bind(this);
    this.selectionChanged = (...a) => { const r2 = origSel(...a); if (this.selConn && !this.model.selectedIds.has(this.selConn.elId)) this.selectConnection(null); return r2; };
  },
  /** All drawable connections on this page: [{elId, index, el, inter, target}] */
  connections() {
    const m = this.model, out = [];
    for (const el of m.elements) {
      if (!el.interactions?.length || !m.isEffectivelyVisible(el)) continue;
      el.interactions.forEach((it, index) => {
        let target = null;
        if (PROTO_TARGETED.has(it.action) && it.targetId) target = m.getElementById(it.targetId);
        out.push({ elId: el.id, index, el, inter: it, target });
      });
    }
    return out;
  },
  connGeometry(c) {
    const s = Utils.aabb(c.el);
    const t = c.target ? Utils.aabb(c.target) : null;
    if (!t) return { p0: { x: s.x + s.w, y: s.y + s.h / 2 }, stub: true };
    let p0, p3, horiz = true;
    if (t.x >= s.x + s.w) { p0 = { x: s.x + s.w, y: s.y + s.h / 2 }; p3 = { x: t.x, y: t.y + Math.min(t.h / 2, 40) }; }
    else if (t.x + t.w <= s.x) { p0 = { x: s.x, y: s.y + s.h / 2 }; p3 = { x: t.x + t.w, y: t.y + Math.min(t.h / 2, 40) }; }
    else { horiz = false; const below = t.y > s.y; p0 = { x: s.x + s.w / 2, y: below ? s.y + s.h : s.y }; p3 = { x: t.x + t.w / 2, y: below ? t.y : t.y + t.h }; }
    const d = horiz ? Math.max(40, Math.abs(p3.x - p0.x) / 2) : Math.max(40, Math.abs(p3.y - p0.y) / 2);
    const sx = horiz ? Math.sign(p3.x - p0.x) || 1 : 0, sy = horiz ? 0 : Math.sign(p3.y - p0.y) || 1;
    return { p0, p1: { x: p0.x + d * sx, y: p0.y + d * sy }, p2: { x: p3.x - d * sx, y: p3.y - d * sy }, p3, horiz, sx, sy };
  },
  bez(g, t) {
    const u = 1 - t;
    return { x: u * u * u * g.p0.x + 3 * u * u * t * g.p1.x + 3 * u * t * t * g.p2.x + t * t * t * g.p3.x, y: u * u * u * g.p0.y + 3 * u * u * t * g.p1.y + 3 * u * t * t * g.p2.y + t * t * t * g.p3.y };
  },
  drawWiring(ctx) {
    const m = this.model, z = m.zoom, sel = m.topSelected();
    const blue = '#3A8BFF', amber = '#FFC21A';
    const selIds = new Set(sel.map(e => e.id));
    // starting point badge
    const start = m.getElementById(m.prototypeSettings.startingFrameId) || m.roots().find(f => f.type === 'frame');
    if (start && !start.parentId) {
      const label = `▶ ${m.prototypeSettings.flowName || 'Flow 1'}`;
      ctx.save(); ctx.font = `600 ${11 / z}px Inter, sans-serif`;
      const w = ctx.measureText(label).width + 14 / z, h = 18 / z, x = start.x - w - 6 / z, y = start.y;
      ctx.fillStyle = blue; this.roundRect(ctx, x, y, w, h, 4 / z); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 7 / z, y + h / 2);
      ctx.restore();
      this._flowBadge = { x, y, w, h };
    } else this._flowBadge = null;
    for (const c of this.connections()) {
      const g = this.connGeometry(c);
      const active = selIds.has(c.elId) || (this.selConn && this.selConn.elId === c.elId && this.selConn.index === c.index);
      const isSel = this.selConn && this.selConn.elId === c.elId && this.selConn.index === c.index;
      ctx.save();
      ctx.strokeStyle = blue; ctx.fillStyle = blue;
      ctx.globalAlpha = active || !sel.length ? 1 : 0.35;
      ctx.lineWidth = (isSel ? 2.5 : 1.5) / z;
      if (g.stub) {
        // no destination (Back, Open link, Close overlay…): a short stub with its label
        const lab = (PROTO_ACTIONS.find(a => a[0] === c.inter.action) || [null, c.inter.action])[1];
        ctx.beginPath(); ctx.moveTo(g.p0.x, g.p0.y); ctx.lineTo(g.p0.x + 28 / z, g.p0.y); ctx.stroke();
        ctx.font = `${10 / z}px Inter, sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText(lab, g.p0.x + 32 / z, g.p0.y);
      } else {
        ctx.beginPath(); ctx.moveTo(g.p0.x, g.p0.y); ctx.bezierCurveTo(g.p1.x, g.p1.y, g.p2.x, g.p2.y, g.p3.x, g.p3.y); ctx.stroke();
        // arrow head
        const tip = g.p3, back = this.bez(g, 0.97), ang = Math.atan2(tip.y - back.y, tip.x - back.x), L = 9 / z;
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - L * Math.cos(ang - 0.45), tip.y - L * Math.sin(ang - 0.45));
        ctx.lineTo(tip.x - L * Math.cos(ang + 0.45), tip.y - L * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
        if (isSel) { ctx.beginPath(); ctx.arc(tip.x, tip.y, 5 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); }
      }
      // origin dot
      ctx.beginPath(); ctx.arc(g.p0.x, g.p0.y, 3.5 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = blue; ctx.stroke();
      ctx.restore();
    }
    // trigger-system navigations (⚡) shown dashed amber, read-only
    for (const t of m.triggers || []) {
      if (t.scope !== 'design' || !t.target || t.enabled === false) continue;
      const el = m.getElementById(t.target);
      for (const a of t.actions || []) if ((a.type === 'navigate' || a.type === 'openOverlay') && a.frameId && el) {
        const tg = m.getElementById(a.frameId); if (!tg) continue;
        const g = this.connGeometry({ el, target: tg });
        ctx.save(); ctx.strokeStyle = amber; ctx.setLineDash([5 / z, 4 / z]); ctx.lineWidth = 1.2 / z; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(g.p0.x, g.p0.y); ctx.bezierCurveTo(g.p1.x, g.p1.y, g.p2.x, g.p2.y, g.p3.x, g.p3.y); ctx.stroke(); ctx.restore();
      }
    }
    // ⊕ node on the single selected layer
    const one = sel.length === 1 ? sel[0] : null;
    if (one && !this.wireDrag) {
      const b = Utils.aabb(one), n = { x: b.x + b.w, y: b.y + b.h / 2 };
      this._node = { x: n.x, y: n.y, el: one };
      ctx.save();
      ctx.beginPath(); ctx.arc(n.x, n.y, 7 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5 / z; ctx.strokeStyle = blue; ctx.stroke();
      ctx.strokeStyle = blue; ctx.lineWidth = 1.6 / z; ctx.beginPath(); ctx.moveTo(n.x - 3.5 / z, n.y); ctx.lineTo(n.x + 3.5 / z, n.y); ctx.moveTo(n.x, n.y - 3.5 / z); ctx.lineTo(n.x, n.y + 3.5 / z); ctx.stroke();
      ctx.restore();
    } else if (!this.wireDrag) this._node = null;
    // live noodle while dragging
    if (this.wireDrag) {
      const W = this.wireDrag;
      if (W.hoverFrame) { const hb = Utils.aabb(W.hoverFrame); ctx.save(); ctx.strokeStyle = blue; ctx.lineWidth = 2 / z; ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.restore(); }
      const p0 = W.from, p3 = W.to, d = Math.max(30, Math.abs(p3.x - p0.x) / 2), sx = Math.sign(p3.x - p0.x) || 1;
      ctx.save(); ctx.strokeStyle = blue; ctx.lineWidth = 2 / z;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.bezierCurveTo(p0.x + d * sx, p0.y, p3.x - d * sx, p3.y, p3.x, p3.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(p0.x, p0.y, 4 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(p3.x, p3.y, 4 / z, 0, Math.PI * 2); ctx.fillStyle = blue; ctx.fill();
      ctx.restore();
    }
  },
  roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); },
  /** Frame (top-level) a connection can point at, under a world point. */
  wireTargetAt(p, sourceEl) {
    const m = this.model, srcRoot = sourceEl ? this.rootOf(sourceEl) : null;
    const frames = m.roots().filter(f => f.type === 'frame' && f.visible && !f.isComponentSet);
    // variants inside sets are valid targets for “Change to”
    const variants = m.elements.filter(e => e.isComponentMaster && this.componentSetOf?.(e));
    for (const v of variants.reverse()) { const b = Utils.aabb(v); if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return v; }
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i], b = Utils.aabb(f);
      if (f === srcRoot) continue;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return f;
    }
    return null;
  },
  wiringPointerDown(e) {
    const m = this.model, p = this.pointer(e), z = m.zoom, near = (a, r) => a && Math.hypot(p.x - a.x, p.y - a.y) <= r / z;
    // starting-point badge → play
    const fb = this._flowBadge;
    if (fb && p.x >= fb.x && p.x <= fb.x + fb.w && p.y >= fb.y && p.y <= fb.y + fb.h) { this.openPrototype(); return true; }
    // ⊕ node: start a new connection
    if (this._node && near(this._node, 10)) { this.startWireDrag(e, this._node.el, null); return true; }
    // selected connection's end handle: retarget
    if (this.selConn) {
      const c = this.connections().find(x => x.elId === this.selConn.elId && x.index === this.selConn.index);
      const g = c && this.connGeometry(c);
      if (g && !g.stub && near(g.p3, 9)) { this.startWireDrag(e, c.el, c.index); return true; }
    }
    // click on a connection line → select it and open the panel
    let best = null, bd = 6 / z;
    for (const c of this.connections()) {
      const g = this.connGeometry(c);
      if (g.stub) { if (p.x >= g.p0.x - 2 / z && p.x <= g.p0.x + 80 / z && Math.abs(p.y - g.p0.y) <= 7 / z) { best = c; bd = 0; } continue; }
      for (let i = 0; i <= 24; i++) { const q = this.bez(g, i / 24), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = c; } }
    }
    if (best) { m.select([best.elId]); this.selectionChanged(); this.selectConnection({ elId: best.elId, index: best.index }); return true; }
    if (this.selConn) this.selectConnection(null);
    return false;
  },
  startWireDrag(e, el, index) {
    const m = this.model, b = Utils.aabb(el);
    this.wireDrag = { el, index, from: { x: b.x + b.w, y: b.y + b.h / 2 }, to: this.pointer(e), hoverFrame: null };
    this.closeInteractionPopover();
    const move = (ev) => {
      const p = this.pointer(ev);
      this.wireDrag.to = p; this.wireDrag.hoverFrame = this.wireTargetAt(p, el);
      if (this.wireDrag.hoverFrame) { const hb = Utils.aabb(this.wireDrag.hoverFrame); this.wireDrag.to = { x: hb.x, y: Math.min(hb.y + hb.h / 2, hb.y + 40) }; }
      this.requestRender();
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const W = this.wireDrag; this.wireDrag = null;
      const target = W.hoverFrame;
      if (!target) { this.requestRender(); if (index != null) this.selectConnection({ elId: el.id, index }); return; }
      const isVariant = target.isComponentMaster && this.componentSetOf?.(target);
      if (index == null) {
        const inst = el.isComponentInstance ? el : null;
        el.interactions.push(protoInteraction({ action: isVariant && inst ? 'changeTo' : 'navigate', targetId: target.id, transition: isVariant ? 'smart' : 'instant' }));
        this._actionLabel = 'Add interaction';
      } else {
        el.interactions[index].targetId = target.id;
        if (!PROTO_TARGETED.has(el.interactions[index].action)) el.interactions[index].action = 'navigate';
        this._actionLabel = 'Change destination';
      }
      this.markOverride?.(el, 'interactions');
      this.commit();
      this.selectConnection({ elId: el.id, index: index ?? el.interactions.length - 1 });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    this.requestRender();
  },
  deleteConnection(c) {
    const el = this.model.getElementById(c.elId);
    if (!el) return;
    const removed = el.interactions.splice(c.index, 1)[0];
    this.selectConnection(null);
    this._actionLabel = 'Delete interaction';
    this.commit();
    Utils.toast('Interaction deleted', '🗑', { action: { label: 'Undo', run: () => { el.interactions.splice(c.index, 0, removed); this.commit(); } } });
  },
  selectConnection(c) {
    this.selConn = c;
    if (this.activeRightTab === 'prototype') this.populatePrototypeTab(this.model.topSelected()[0] || null);
    if (c) this.openInteractionPopover(); else this.closeInteractionPopover();
    this.requestRender();
  },

  // =================================================================== Prototype tab (right panel)
  /** Compact Figma-style rows; each opens the floating Interaction panel. */
  populatePrototypeTab(el) {
    const m = this.model, ps = m.prototypeSettings, $ = (id) => document.getElementById(id);
    $('proto-flow-name').value = ps.flowName;
    $('proto-device-select').value = ps.device;
    $('proto-bg-color').value = Utils.toHex(ps.canvasBg);
    $('btn-add-interaction').disabled = !el;
    const start = $('proto-starting-frame'), root = el ? this.rootOf(el) : null;
    start.disabled = !(root && root.type === 'frame');
    start.checked = !!(root && ps.startingFrameId === root.id);
    const ff = el ? (el.type === 'frame' ? el : root) : null;
    document.querySelectorAll('input[name="proto-overflow"]').forEach(r => { r.disabled = !(ff && ff.type === 'frame'); r.checked = ff ? r.value === (ff.overflowScroll || 'none') : r.value === 'none'; });
    const cont = $('proto-interactions-list');
    if (!el) { cont.innerHTML = '<div class="muted-text">Select a layer, then drag its <b>⊕</b> handle on the canvas onto a frame — or use <b>Add interaction</b>.</div>'; return; }
    const name = (id) => Utils.escapeHtml(m.getElementById(id)?.name || m.findAnywhere(id)?.name || 'None');
    cont.innerHTML = el.interactions.map((it, i) => {
      const tr = PROTO_TRIGGERS.find(x => x[0] === it.trigger) || PROTO_TRIGGERS[0], ac = PROTO_ACTIONS.find(x => x[0] === it.action) || PROTO_ACTIONS[0];
      const dest = PROTO_TARGETED.has(it.action) ? ` ${it.targetId ? name(it.targetId) : '<i>pick a destination</i>'}` : it.action === 'url' ? ` ${Utils.escapeHtml((it.url || '').replace(/^https?:\/\//, '').slice(0, 24))}` : '';
      const anim = ['url', 'fire', 'set', 'scrollTo', 'closeOverlay'].includes(it.action) ? '' : (PROTO_ANIMS.find(x => x[0] === it.transition) || [null, ''])[1];
      const on = this.selConn && this.selConn.elId === el.id && this.selConn.index === i;
      const warn = PROTO_TARGETED.has(it.action) && !it.targetId;
      return `<div class="ix-item${on ? ' on' : ''}${warn ? ' warn' : ''}" role="button" tabindex="0" data-i="${i}" aria-label="Edit interaction ${i + 1}"><span class="ix-item-ic">${tr[2]}</span><span class="ix-item-tx"><b>${tr[1]}${it.trigger === 'key' ? ` ${Utils.escapeHtml(it.key)}` : it.trigger === 'delay' ? ` ${it.delay}ms` : ''}</b><small>${ac[1]}${dest}${anim ? ` · ${anim}` : ''}</small></span><button type="button" class="prop-icon-btn" data-del="${i}" aria-label="Remove interaction">✕</button></div>`;
    }).join('') || '<div class="muted-text">No interactions. Drag the <b>⊕</b> handle on the canvas onto a frame, or use <b>Add interaction</b>.</div>';
    cont.querySelectorAll('.ix-item').forEach(r => {
      const open = () => this.selectConnection({ elId: el.id, index: +r.dataset.i });
      r.addEventListener('click', (e) => { if (!e.target.closest('[data-del]')) open(); });
      r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    cont.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => this.deleteConnection({ elId: el.id, index: +b.dataset.del })));
  },
  addInteractionToSelection() {
    const el = this.model.topSelected()[0];
    if (!el) { Utils.toast('Select a layer first', 'ℹ️'); return; }
    if (this.activeRightTab !== 'prototype') document.querySelector('#right-panel .panel-tab-btn[data-tab="prototype"]')?.click();
    const frames = this.model.roots().filter(f => f.type === 'frame' && !f.isComponentSet && f.id !== this.rootOf(el).id);
    el.interactions.push(protoInteraction({ action: frames.length ? 'navigate' : 'back', targetId: frames[0]?.id || null }));
    this.markOverride(el, 'interactions');
    this._actionLabel = 'Add interaction';
    this.commit();
    this.selectConnection({ elId: el.id, index: el.interactions.length - 1 });
  },

  // =================================================================== Interaction popover
  closeInteractionPopover() { document.getElementById('ix-pop')?.remove(); },
  openInteractionPopover() {
    const c = this.selConn, m = this.model;
    const el = c && m.getElementById(c.elId), it = el?.interactions[c.index];
    if (!it) { this.closeInteractionPopover(); return; }
    let pop = document.getElementById('ix-pop');
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'ix-pop'; pop.className = 'ix-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Interaction');
      document.getElementById('canvas-wrap').appendChild(pop);
      ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'dblclick'].forEach(ev => pop.addEventListener(ev, (e) => e.stopPropagation()));
    }
    const opt = (v, l, s) => `<option value="${Utils.escapeHtml(v ?? '')}"${s ? ' selected' : ''}>${Utils.escapeHtml(l)}</option>`;
    const frames = m.roots().filter(f => f.type === 'frame' && !f.isComponentSet);
    const variants = m.masters().filter(x => this.componentSetOf?.(x));
    const destOptions = it.action === 'changeTo' ? (variants.length ? variants : m.masters()).map(v => opt(v.id, this.masterLabel ? this.masterLabel(v) : v.name, v.id === it.targetId)).join('')
      : it.action === 'scrollTo' ? m.descendantsOf(this.rootOf(el).id).map(d => opt(d.id, d.name, d.id === it.targetId)).join('')
        : frames.map(f => opt(f.id, f.name, f.id === it.targetId)).join('');
    const many = el.interactions.length > 1;
    const dirBtns = ['left', 'right', 'up', 'down'].map(d => `<button type="button" class="ix-dir${(it.direction || 'left') === d ? ' on' : ''}" data-dir="${d}" aria-label="Direction ${d}" title="${d}">${{ left: '←', right: '→', up: '↑', down: '↓' }[d]}</button>`).join('');
    const directional = ['moveIn', 'moveOut', 'push', 'slideIn', 'slideOut'].includes(it.transition);
    const isOverlay = it.action === 'overlay' || it.action === 'swapOverlay';
    const animated = it.transition !== 'instant' && !['url', 'fire', 'set', 'scrollTo'].includes(it.action);
    pop.innerHTML = `<div class="ix-head"><b>Interaction</b>${many ? `<span class="ix-tabs">${el.interactions.map((_, i) => `<button type="button" class="ix-tab${i === c.index ? ' on' : ''}" data-tab="${i}">${i + 1}</button>`).join('')}</span>` : ''}<span class="ix-sp"></span><button type="button" class="ix-icon" data-x="add" title="Add interaction" aria-label="Add interaction">＋</button><button type="button" class="ix-icon" data-x="del" title="Delete interaction (Del)" aria-label="Delete interaction">🗑</button><button type="button" class="ix-icon" data-x="close" title="Close (Esc)" aria-label="Close">✕</button></div>
      <div class="ix-sec"><label class="ix-row"><span>Trigger</span><select data-k="trigger">${PROTO_TRIGGERS.map(([v, l, i]) => opt(v, `${i}  ${l}`, v === it.trigger)).join('')}</select></label>
        ${it.trigger === 'delay' ? `<label class="ix-row"><span>Delay</span><span class="ix-unit"><input type="number" min="0" step="50" data-k="delay" value="${it.delay}"> ms</span></label>` : ''}
        ${it.trigger === 'key' ? `<label class="ix-row"><span>Key</span><input type="text" readonly class="ix-key" data-k="key" value="${Utils.escapeHtml(it.key || 'Enter')}" title="Click, then press a key"></label>` : ''}</div>
      <div class="ix-sec"><label class="ix-row"><span>Action</span><select data-k="action">${PROTO_ACTIONS.map(([v, l, i]) => opt(v, `${i}  ${l}`, v === it.action)).join('')}</select></label>
        ${PROTO_TARGETED.has(it.action) ? `<label class="ix-row"><span>${it.action === 'changeTo' ? 'Variant' : it.action === 'scrollTo' ? 'Layer' : 'Destination'}</span><select data-k="targetId">${it.targetId ? '' : opt('', 'None — pick one')}${destOptions}</select></label>` : ''}
        ${it.action === 'url' ? `<label class="ix-row"><span>Link</span><input type="url" data-k="url" value="${Utils.escapeHtml(it.url || 'https://')}"></label><label class="ix-check"><input type="checkbox" data-k="newTab"${it.newTab !== false ? ' checked' : ''}> Open in new tab</label>` : ''}
        ${it.action === 'fire' || it.action === 'set' ? `<label class="ix-row"><span>Input</span><select data-k="inputId">${m.inputs.filter(i => it.action !== 'fire' || i.type === 'trigger').map(i => opt(i.id, `${i.name} (${i.type})`, i.id === it.inputId)).join('') || opt('', 'No inputs yet (Design › Animate)')}</select></label>${it.action === 'set' ? `<label class="ix-row"><span>Value</span><input type="text" data-k="value" value="${Utils.escapeHtml(String(it.value))}"></label>` : ''}` : ''}</div>
      ${['url', 'fire', 'set', 'scrollTo', 'closeOverlay'].includes(it.action) ? '' : `<div class="ix-sec"><label class="ix-row"><span>Animation</span><select data-k="transition">${PROTO_ANIMS.filter(([v]) => !isOverlay || ['instant', 'dissolve', 'moveIn'].includes(v)).map(([v, l]) => opt(v, l, v === it.transition)).join('')}</select></label>
        ${directional || (isOverlay && it.transition === 'moveIn') ? `<div class="ix-row"><span>Direction</span><span class="ix-dirs">${dirBtns}</span></div>` : ''}
        ${animated ? `<label class="ix-row"><span>Easing</span><select data-k="easing">${Object.entries(PROTO_EASINGS).map(([v, [l]]) => opt(v, l, v === it.easing)).join('')}</select></label><label class="ix-row"><span>Duration</span><span class="ix-unit"><input type="number" min="0" max="5000" step="50" data-k="duration" value="${it.duration}"> ms</span></label><div class="ix-curve" title="Easing preview"><span style="transition-timing-function:${(PROTO_EASINGS[it.easing] || PROTO_EASINGS.easeOut)[1]}"></span></div>` : ''}</div>`}
      ${isOverlay ? `<div class="ix-sec"><label class="ix-row"><span>Position</span><select data-k="overlayPos">${PROTO_OVERLAY_POS.map(([v, l]) => opt(v, l, v === (it.overlayPos || 'center'))).join('')}</select></label><label class="ix-check"><input type="checkbox" data-k="closeOutside"${it.closeOutside !== false ? ' checked' : ''}> Close when clicking outside</label><label class="ix-check"><input type="checkbox" data-k="overlayBg"${it.overlayBg !== false ? ' checked' : ''}> Add background behind overlay</label></div>` : ''}
      <details class="ix-sec ix-state"${it.preserveScroll ? ' open' : ''}><summary>State</summary><label class="ix-check"><input type="checkbox" data-k="preserveScroll"${it.preserveScroll ? ' checked' : ''}> Preserve scroll position</label></details>
      <div class="ix-foot">${Utils.escapeHtml(el.name)} · ${PROTO_TRIGGERS.find(x => x[0] === it.trigger)?.[1]} → ${PROTO_ACTIONS.find(x => x[0] === it.action)?.[1]}${it.targetId && m.getElementById(it.targetId) ? ` “${Utils.escapeHtml(m.getElementById(it.targetId).name)}”` : ''}</div>`;
    const commit = (label = 'Edit interaction') => { this.markOverride?.(el, 'interactions'); this._actionLabel = label; this.commit(); this.openInteractionPopover(); this.requestRender(); };
    pop.querySelectorAll('[data-k]').forEach(f => {
      const k = f.dataset.k;
      if (k === 'key') { f.addEventListener('keydown', (e) => { e.preventDefault(); e.stopPropagation(); it.key = e.key === ' ' ? 'Space' : e.key; commit(); }); return; }
      f.addEventListener('change', () => {
        let v = f.type === 'checkbox' ? f.checked : f.type === 'number' ? Math.max(0, Number(f.value) || 0) : f.value;
        if (k === 'value') v = v === 'true' ? true : v === 'false' ? false : (Number.isFinite(Number(v)) ? Number(v) : 1);
        it[k] = v;
        if (k === 'action') {
          if (v === 'changeTo') it.transition = 'smart';
          if (PROTO_TARGETED.has(v) && it.targetId && !(v === 'changeTo' ? m.getElementById(it.targetId)?.isComponentMaster : v === 'scrollTo' ? true : m.getElementById(it.targetId)?.type === 'frame')) it.targetId = null;
          if ((v === 'fire' || v === 'set') && !it.inputId) it.inputId = (m.inputs.find(i => v !== 'fire' || i.type === 'trigger') || {}).id || null;
          if ((v === 'overlay' || v === 'swapOverlay') && !['instant', 'dissolve', 'moveIn'].includes(it.transition)) it.transition = 'dissolve';
        }
        commit();
      });
    });
    pop.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => { it.direction = b.dataset.dir; commit(); }));
    pop.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { this.selConn = { elId: el.id, index: +b.dataset.tab }; this.openInteractionPopover(); this.requestRender(); }));
    pop.querySelector('[data-x="close"]').addEventListener('click', () => this.selectConnection(null));
    pop.querySelector('[data-x="del"]').addEventListener('click', () => this.deleteConnection(this.selConn));
    pop.querySelector('[data-x="add"]').addEventListener('click', () => {
      el.interactions.push(protoInteraction({ action: 'back' }));
      this.selConn = { elId: el.id, index: el.interactions.length - 1 };
      commit('Add interaction');
    });
    const curve = pop.querySelector('.ix-curve span');
    if (curve) requestAnimationFrame(() => { curve.style.transitionDuration = `${Math.min(1500, it.duration || 300)}ms`; curve.classList.add('go'); });
    this.placeInteractionPopover();
  },
  placeInteractionPopover() {
    const pop = document.getElementById('ix-pop'), c = this.selConn;
    if (!pop || !c) return;
    const m = this.model, el = m.getElementById(c.elId);
    const conn = el && this.connections().find(x => x.elId === c.elId && x.index === c.index);
    if (!conn) { this.closeInteractionPopover(); return; }
    const g = this.connGeometry(conn);
    const anchor = g.stub ? g.p0 : this.bez(g, 0.5);
    const s = this.renderer.worldToScreen(anchor.x, anchor.y);
    const wrap = document.getElementById('canvas-wrap');
    const W = pop.offsetWidth || 260, H = pop.offsetHeight || 320;
    let x = s.x + 16, y = s.y + 16;
    if (x + W > wrap.clientWidth - 8) x = s.x - W - 16;
    x = Utils.clamp(x, 8, Math.max(8, wrap.clientWidth - W - 8));
    y = Utils.clamp(y, 8, Math.max(8, wrap.clientHeight - H - 8));
    pop.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
};
Object.assign(StudioApp.prototype, ProtoFlowMixin);
