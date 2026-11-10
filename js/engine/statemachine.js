/**
 * DesignStudio — Rive-style state machine runtime.
 * Global inputs live on an InputBus shared by every running state machine (Design, Prototype, 3D,
 * exported players). No DOM dependencies: this file is embedded verbatim in Interactive HTML exports.
 */
'use strict';

class InputBus {
  constructor(inputs = []) {
    this.defs = inputs;
    this.values = new Map(inputs.map(i => [i.id, i.type === 'trigger' ? false : i.value]));
    this.runtimes = new Set();
    this.listeners = new Set();
  }
  byName(name) { return this.defs.find(i => i.name === name || i.id === name); }
  get(id) { return this.values.get(id); }
  set(id, value) {
    const def = this.defs.find(i => i.id === id);
    if (!def) return;
    if (def.type === 'trigger') return this.fire(id);
    const v = def.type === 'number' ? Number(value) || 0 : !!value;
    this.values.set(id, v);
    this.emit(id, v);
  }
  toggle(id) { this.set(id, !this.get(id)); }
  fire(id) {
    for (const rt of this.runtimes) rt.pendingTriggers.add(id);
    this.emit(id, true);
  }
  emit(id, v) { for (const fn of this.listeners) fn(id, v); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

class StateMachineRuntime {
  /**
   * @param model   StudioModel (animations, elements)
   * @param sm      state machine definition
   * @param bus     InputBus (global inputs)
   * @param apply   (elId, prop, value) => void   — writes animated values (design elements, 3D objects …)
   */
  constructor(model, sm, bus, apply) {
    this.model = model; this.sm = sm; this.bus = bus; this.apply = apply;
    this.pendingTriggers = new Set();
    this.layers = sm.layers.map(layer => ({ layer, state: layer.states.find(s => s.type === 'entry'), time: 0, prev: null, mixT: 0, mixDur: 0, done: false }));
    bus.runtimes.add(this);
    for (const L of this.layers) this.step(L, true);
    this.changed = true;
  }
  dispose() { this.bus.runtimes.delete(this); }
  anim(id) { return this.model.animations.find(a => a.id === id); }
  localTime(anim, t) {
    const d = Math.max(0.0001, anim.duration);
    if (anim.loop === 'oneShot') return Math.min(t, d);
    if (anim.loop === 'pingPong') { const m = t % (2 * d); return m <= d ? m : 2 * d - m; }
    return t % d;
  }
  conditionsPass(tr) {
    for (const c of tr.conditions) {
      const def = this.bus.defs.find(i => i.id === c.inputId);
      if (!def) return false;
      if (def.type === 'trigger') { if (!this.pendingTriggers.has(c.inputId)) return false; continue; }
      const v = this.bus.get(c.inputId), w = def.type === 'boolean' ? !!c.value : Number(c.value);
      const ok = { '==': v === w, '!=': v !== w, '>': v > w, '<': v < w, '>=': v >= w, '<=': v <= w }[c.op || '=='];
      if (!ok) return false;
    }
    return true;
  }
  /** Take at most a few transitions this frame (entry chains resolve immediately). */
  step(L, initial = false) {
    for (let guard = 0; guard < 4 && !L.done; guard++) {
      const layer = L.layer;
      const any = layer.states.find(s => s.type === 'any');
      const cands = layer.transitions.filter(t => t.from === L.state.id || (any && t.from === any.id && t.to !== L.state.id && L.state.type === 'animation'));
      let taken = null;
      for (const tr of cands) {
        if (tr.exitTime > 0 && L.state.type === 'animation') {
          const a = this.anim(L.state.animationId);
          if (a && L.time < (tr.exitTime / 100) * a.duration) continue;
        }
        if (this.conditionsPass(tr)) { taken = tr; break; }
      }
      if (!taken) return;
      for (const c of taken.conditions) this.pendingTriggers.delete(c.inputId);
      const to = layer.states.find(s => s.id === taken.to);
      if (!to) return;
      if (L.state.type === 'animation' && taken.duration > 0 && !initial) { L.prev = { state: L.state, time: L.time }; L.mixT = 0; L.mixDur = taken.duration; }
      else L.prev = null;
      L.state = to; L.time = 0;
      if (to.type === 'exit') L.done = true;
      this.changed = true;
      if (to.type === 'animation') return;
    }
  }
  advance(dt) {
    for (const L of this.layers) {
      if (L.done) continue;
      L.time += dt * (L.state.speed || 1);
      if (L.prev) { L.prev.time += dt * (L.prev.state.speed || 1); L.mixT += dt * 1000; if (L.mixT >= L.mixDur) L.prev = null; }
      this.step(L);
    }
    this.pendingTriggers.clear();
    this.write();
  }
  /** Evaluate every playing animation (with mixing) and push values out. */
  write() {
    const out = new Map();
    const put = (elId, prop, v) => { if (!out.has(elId)) out.set(elId, {}); out.get(elId)[prop] = v; };
    const sample = (state, time) => {
      const res = new Map();
      if (!state || state.type !== 'animation') return res;
      const a = this.anim(state.animationId);
      if (!a) return res;
      const lt = this.localTime(a, time);
      for (const [elId, props] of Object.entries(a.tracks)) {
        const o = {};
        for (const prop of Object.keys(props)) o[prop] = this.model.evaluateIn(a, elId, prop, lt);
        res.set(elId, o);
      }
      return res;
    };
    for (const L of this.layers) {
      const cur = sample(L.state, L.time);
      if (L.prev) {
        const prev = sample(L.prev.state, L.prev.time);
        const f = Math.min(1, L.mixT / Math.max(1, L.mixDur));
        for (const [elId, props] of prev) for (const [p, v] of Object.entries(props)) {
          const c = cur.get(elId)?.[p];
          if (c === undefined) put(elId, p, v);
          else if (typeof v === 'number') put(elId, p, v + (c - v) * f);
          else put(elId, p, Utils.mixColor(v, c, f));
        }
        for (const [elId, props] of cur) for (const [p, v] of Object.entries(props)) if (prev.get(elId)?.[p] === undefined) put(elId, p, v);
      } else for (const [elId, props] of cur) for (const [p, v] of Object.entries(props)) put(elId, p, v);
    }
    for (const [elId, props] of out) for (const [p, v] of Object.entries(props)) this.apply(elId, p, v);
  }
  /** Pointer listeners: `hitIds` is the hit element plus its ancestors. */
  pointer(event, hitIds) {
    let handled = false;
    for (const li of this.sm.listeners) {
      if (li.event !== event || !hitIds.includes(li.targetId)) continue;
      handled = true;
      for (const a of li.actions) {
        if (a.type === 'fire') this.bus.fire(a.inputId);
        else if (a.type === 'toggle') this.bus.toggle(a.inputId);
        else this.bus.set(a.inputId, a.value);
      }
    }
    return handled;
  }
  currentStateIds() { return this.layers.map(L => L.state && L.state.id); }
  hasListenerTargets() { return this.sm.listeners.map(l => l.targetId); }
}
