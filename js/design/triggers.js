/**
 * DesignStudio — Triggers (v3.5.0).
 * One event → condition → action system for every section (Design / prototypes, Animate, 3D) and every
 * exported player. A trigger = { id, name, scope: 'design' | '3d', target (layer / 3D object id or null),
 * event {type, …params}, conditions [{inputId, op, value}], actions [{type, delay, …params}], once, cooldown, enabled }.
 * TriggerEngine has no DOM dependencies (it is embedded verbatim in exports); hosts feed it pointer, key,
 * scroll and time, and give it apply/get/navigate/camera/emit callbacks.
 */
'use strict';

/** Event catalogue: label, group, whether it needs a target, scopes, parameters (for the editor). */
const TRIGGER_EVENTS = {
  click:       { label: 'Click / tap', group: 'Pointer', target: true },
  doubleClick: { label: 'Double click', group: 'Pointer', target: true },
  pointerDown: { label: 'Press', group: 'Pointer', target: true },
  pointerUp:   { label: 'Release', group: 'Pointer', target: true },
  hoverEnter:  { label: 'Hover in', group: 'Pointer', target: true },
  hoverExit:   { label: 'Hover out', group: 'Pointer', target: true },
  longPress:   { label: 'Long press', group: 'Pointer', target: true, params: [{ k: 'ms', label: 'Hold (ms)', type: 'number', def: 500 }] },
  drag:        { label: 'Drag', group: 'Pointer', target: true, params: [
    { k: 'axis', label: 'Axis', type: 'select', options: [['x', 'Horizontal'], ['y', 'Vertical'], ['any', 'Any']], def: 'x' },
    { k: 'inputId', label: 'Scrub number input', type: 'input', inputType: 'number', optional: true },
    { k: 'distance', label: 'Full range (px)', type: 'number', def: 200 },
    { k: 'min', label: 'Input min', type: 'number', def: 0 }, { k: 'max', label: 'Input max', type: 'number', def: 100 }] },
  swipe:       { label: 'Swipe', group: 'Pointer', target: true, params: [{ k: 'dir', label: 'Direction', type: 'select', options: [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']], def: 'left' }] },
  start:       { label: 'Start / screen opens', group: 'Time', target: 'optional' },
  afterDelay:  { label: 'After delay', group: 'Time', target: 'optional', params: [{ k: 'ms', label: 'Delay (ms)', type: 'number', def: 1000 }] },
  every:       { label: 'Every (repeat)', group: 'Time', target: 'optional', params: [{ k: 'ms', label: 'Interval (ms)', type: 'number', def: 2000 }, { k: 'times', label: 'Times (0 = forever)', type: 'number', def: 0 }] },
  keyDown:     { label: 'Key down', group: 'Keyboard', params: [{ k: 'key', label: 'Key', type: 'key', def: 'Space' }] },
  keyUp:       { label: 'Key up', group: 'Keyboard', params: [{ k: 'key', label: 'Key', type: 'key', def: 'Space' }] },
  mouseMove:   { label: 'Cursor moves (map to inputs)', group: 'Pointer', params: [
    { k: 'inputX', label: 'X → number input (0–100)', type: 'input', inputType: 'number', optional: true },
    { k: 'inputY', label: 'Y → number input (0–100)', type: 'input', inputType: 'number', optional: true }] },
  scroll:      { label: 'Scroll', group: 'Page', params: [
    { k: 'inputId', label: 'Progress → number input (0–100)', type: 'input', inputType: 'number', optional: true },
    { k: 'at', label: 'Also run actions at % (blank = never)', type: 'number', optional: true }] },
  inputChange: { label: 'Input changes', group: 'Data', params: [
    { k: 'inputId', label: 'Input', type: 'input' },
    { k: 'op', label: 'When', type: 'select', options: [['any', 'any change'], ['==', 'becomes ='], ['!=', 'becomes ≠'], ['>', 'becomes >'], ['<', 'becomes <'], ['>=', 'becomes ≥'], ['<=', 'becomes ≤']], def: 'any' },
    { k: 'value', label: 'Value', type: 'value', show: (e) => e.op && e.op !== 'any' }] },
  animationEnd: { label: 'Animation ends', group: 'Data', params: [{ k: 'animationId', label: 'Animation', type: 'animation' }] }
};

/** Action catalogue. `scopes` limits where an action is offered. */
const TRIGGER_ACTIONS = {
  playAnimation: { label: 'Play animation', group: 'Animation', params: [
    { k: 'animationId', label: 'Animation', type: 'animation' },
    { k: 'mode', label: 'How', type: 'select', options: [['play', 'Play'], ['restart', 'Restart'], ['reverse', 'Play reversed'], ['toggle', 'Play / pause'], ['pause', 'Pause'], ['stop', 'Stop & reset'], ['seek', 'Seek (scrub)']], def: 'play' },
    { k: 'loop', label: 'Loop', type: 'select', options: [['default', 'As animation'], ['once', 'Once'], ['loop', 'Loop'], ['pingPong', 'Ping-pong']], def: 'default', show: (a) => !['pause', 'stop', 'seek'].includes(a.mode) },
    { k: 'speed', label: 'Speed ×', type: 'number', def: 1, show: (a) => !['pause', 'stop', 'seek'].includes(a.mode) },
    ...valueSourceParams('Time %', (a) => a.mode === 'seek', 0, 100)] },
  setProperty: { label: 'Change property', group: 'Layer', params: [
    { k: 'targetId', label: 'Layer / object', type: 'target' },
    { k: 'prop', label: 'Property', type: 'prop' },
    ...valueSourceParams('Value', () => true),
    { k: 'relative', label: 'Offset from original value', type: 'check', def: false },
    { k: 'duration', label: 'Animate over (ms)', type: 'number', def: 300 },
    { k: 'easing', label: 'Easing', type: 'easing', def: 'easeOut' }] },
  toggleVisible: { label: 'Show / hide', group: 'Layer', params: [
    { k: 'targetId', label: 'Layer / object', type: 'target' },
    { k: 'to', label: 'Make', type: 'select', options: [['toggle', 'Toggle'], ['show', 'Visible'], ['hide', 'Hidden']], def: 'toggle' }] },
  fireInput: { label: 'Fire trigger input', group: 'Inputs', params: [{ k: 'inputId', label: 'Input', type: 'input', inputType: 'trigger' }] },
  setInput: { label: 'Set input', group: 'Inputs', params: [{ k: 'inputId', label: 'Input', type: 'input', inputType: 'value' }, { k: 'value', label: 'Value', type: 'value' }] },
  toggleInput: { label: 'Toggle boolean', group: 'Inputs', params: [{ k: 'inputId', label: 'Input', type: 'input', inputType: 'boolean' }] },
  stepInput: { label: 'Increase / decrease number', group: 'Inputs', params: [
    { k: 'inputId', label: 'Input', type: 'input', inputType: 'number' }, { k: 'by', label: 'By', type: 'number', def: 1 },
    { k: 'min', label: 'Min', type: 'number', def: 0 }, { k: 'max', label: 'Max', type: 'number', def: 10 }, { k: 'wrap', label: 'Wrap around', type: 'check', def: false }] },
  navigate: { label: 'Go to frame', group: 'Navigation', scopes: ['design'], params: [
    { k: 'frameId', label: 'Frame', type: 'frame' },
    { k: 'transition', label: 'Transition', type: 'select', options: [['instant', 'Instant'], ['dissolve', 'Dissolve'], ['smart', 'Smart animate'], ['moveIn', 'Move in'], ['push', 'Push'], ['slideIn', 'Slide in']], def: 'dissolve' },
    { k: 'direction', label: 'Direction', type: 'select', options: [['left', '← Left'], ['right', '→ Right'], ['up', '↑ Up'], ['down', '↓ Down']], def: 'left', show: (a) => ['moveIn', 'push', 'slideIn'].includes(a.transition) },
    { k: 'duration', label: 'Duration (ms)', type: 'number', def: 300 }] },
  back: { label: 'Go back', group: 'Navigation', scopes: ['design'] },
  openOverlay: { label: 'Open overlay', group: 'Navigation', scopes: ['design'], params: [{ k: 'frameId', label: 'Frame', type: 'frame' }] },
  closeOverlay: { label: 'Close overlay', group: 'Navigation', scopes: ['design'] },
  scrollTo: { label: 'Scroll to layer', group: 'Navigation', scopes: ['design'], params: [{ k: 'targetId', label: 'Layer', type: 'target' }] },
  cameraFocus: { label: 'Move camera to object', group: 'Camera', scopes: ['3d'], params: [{ k: 'targetId', label: 'Object', type: 'target' }, { k: 'duration', label: 'Duration (ms)', type: 'number', def: 800 }] },
  cameraReset: { label: 'Reset camera', group: 'Camera', scopes: ['3d'], params: [{ k: 'duration', label: 'Duration (ms)', type: 'number', def: 800 }] },
  openUrl: { label: 'Open link', group: 'Other', params: [{ k: 'url', label: 'URL (https://…)', type: 'text', def: 'https://' }] },
  emit: { label: 'Send event to page code', group: 'Other', params: [{ k: 'name', label: 'Event name', type: 'text', def: 'myEvent' }] }
};
function valueSourceParams(label, show, outMin = 0, outMax = 100) {
  return [
    { k: 'from', label: `${label} from`, type: 'select', options: [['fixed', 'Fixed value'], ['input', 'Number input']], def: 'fixed', show },
    { k: 'value', label, type: 'value', show: (a) => show(a) && (a.from || 'fixed') === 'fixed' },
    { k: 'sourceInput', label: 'Input', type: 'input', inputType: 'number', show: (a) => show(a) && a.from === 'input' },
    { k: 'inMin', label: 'Input min', type: 'number', def: 0, show: (a) => show(a) && a.from === 'input' },
    { k: 'inMax', label: 'Input max', type: 'number', def: 100, show: (a) => show(a) && a.from === 'input' },
    { k: 'outMin', label: 'Maps to min', type: 'number', def: outMin, show: (a) => show(a) && a.from === 'input' },
    { k: 'outMax', label: 'Maps to max', type: 'number', def: outMax, show: (a) => show(a) && a.from === 'input' }
  ];
}
const TRIGGER_PROPS = {
  design: [['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height'], ['rotation', 'Rotation°'], ['opacity', 'Opacity (0–1)'], ['cornerRadius', 'Corner radius'], ['fillColor', 'Fill colour']],
  '3d': [['px', 'Position X'], ['py', 'Position Y'], ['pz', 'Position Z'], ['rx', 'Rotation X°'], ['ry', 'Rotation Y°'], ['rz', 'Rotation Z°'], ['sx', 'Scale X'], ['sy', 'Scale Y'], ['sz', 'Scale Z'], ['opacity', 'Opacity (0–1)'], ['color', 'Colour'], ['emissive', 'Glow colour'], ['intensity', 'Light intensity'], ['metalness', 'Metalness'], ['roughness', 'Roughness']]
};
const TRIGGER_COLOR_PROPS = ['fillColor', 'color', 'emissive'];

/** Runtime. host = { apply(id, prop, v), get(id, prop), evaluateIn(anim, id, prop, t), navigate?, back?, openOverlay?, closeOverlay?, scrollTo?, openUrl?, camera?(action), emit?(name), notice?(msg) } */
class TriggerEngine {
  constructor(triggers, data, bus, host, scope) {
    this.defs = (triggers || []).filter(t => t.enabled !== false && t.scope === scope);
    this.anims = data.animations || [];
    this.inputs = data.inputs || [];
    this.bus = bus; this.host = host; this.scope = scope;
    this.clock = 0; this.timers = []; this.tweens = []; this.players = new Map();
    this.originals = new Map(); this.firedAt = new Map(); this.firedOnce = new Set(); this.condWas = new Map();
    this.hover = new Set(); this.down = null; this.lastClick = null; this.drag = null; this.screenId = null;
    this.unsub = bus ? bus.onChange((id, v) => this.onInput(id, v)) : null;
    for (const t of this.defs) if (t.event.type === 'inputChange') this.condWas.set(t.id, this.condPass(t.event));
  }
  dispose() { if (this.unsub) this.unsub(); this.timers = []; this.tweens = []; this.players.clear(); }
  /** Targets with pointer events (for a pointer cursor). */
  listens() { return new Set(this.defs.filter(t => TRIGGER_EVENTS[t.event.type]?.target && t.target).map(t => t.target)); }
  inputDef(id) { return this.inputs.find(i => i.id === id); }

  // ------------------------------------------------------------- lifecycle & time
  /** A screen (prototype frame) or scene became active; screen-scoped time triggers restart. */
  start(screen = null, { global = true } = {}) {
    const ids = Array.isArray(screen) ? screen : [screen];
    this.screenId = ids[0] || null;
    this.timers = this.timers.filter(tm => !tm.screen);
    for (const t of this.defs) {
      const ty = t.event.type;
      if (!['start', 'afterDelay', 'every'].includes(ty)) continue;
      const onScreen = t.target ? ids.includes(t.target) : global;
      if (!onScreen) continue;
      const screen = !!t.target;
      if (ty === 'start') this.run(t);
      else if (ty === 'afterDelay') this.at(Math.max(0, +t.event.ms || 0), () => this.run(t), screen);
      else if (ty === 'every') {
        const ms = Math.max(50, +t.event.ms || 1000), times = Math.max(0, Math.round(+t.event.times || 0));
        let n = 0;
        const tick = () => { this.run(t); n++; if (!times || n < times) this.at(ms, tick, screen); };
        this.at(ms, tick, screen);
      }
    }
  }
  at(ms, fn, screen = false) { this.timers.push({ due: (this.timerBase ?? this.clock) + ms / 1000, fn, screen }); } // QA-07: repeats are scheduled from their due time (no drift)
  /** Wall-clock seconds for gesture timing (double click, swipe, long press) — independent of frame rate. */
  now() { return typeof performance !== 'undefined' ? performance.now() / 1000 : this.clock; }
  tick(dt) {
    this.clock += dt;
    for (let guard = 0; this.timers.length && guard < 200; guard++) {
      const due = this.timers.filter(tm => tm.due <= this.clock);
      if (!due.length) break;
      this.timers = this.timers.filter(tm => tm.due > this.clock);
      due.sort((a, b) => a.due - b.due).forEach(tm => { this.timerBase = tm.due; tm.fn(); this.timerBase = null; });
    }
    // long press
    if (this.down && !this.down.longDone && !this.down.moved) {
      for (const t of this.defs) if (t.event.type === 'longPress' && this.down.ids.includes(t.target) && (this.now() - this.down.t) * 1000 >= (+t.event.ms || 500)) { this.down.longDone = true; this.run(t); }
    }
    // tweens
    if (this.tweens.length) {
      const keep = [];
      for (const tw of this.tweens) {
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        const k = (Utils.easings[tw.easing] || Utils.easings.easeOut)(tw.t);
        this.write(tw.id, tw.prop, typeof tw.from === 'number' ? tw.from + (tw.to - tw.from) * k : Utils.mixColor(tw.from, tw.to, Math.max(0, Math.min(1, k))));
        if (tw.t < 1) keep.push(tw);
      }
      this.tweens = keep;
    }
    // animation players
    for (const [id, pl] of this.players) {
      if (!pl.playing) continue;
      const a = pl.anim, d = Math.max(0.0001, a.duration);
      pl.t += dt * pl.speed * pl.dir;
      let ended = false;
      if (pl.loop === 'loop') pl.t = ((pl.t % d) + d) % d;
      else if (pl.loop === 'pingPong') { if (pl.t > d) { pl.t = 2 * d - pl.t; pl.dir = -1; } else if (pl.t < 0) { pl.t = -pl.t; pl.dir = 1; } }
      else if ((pl.dir > 0 && pl.t >= d) || (pl.dir < 0 && pl.t <= 0)) { pl.t = Math.max(0, Math.min(d, pl.t)); pl.playing = false; ended = true; } // QA-01: once-mode no longer ends on its first frame
      this.pose(a, pl.t);
      if (ended) this.dispatch('animationEnd', null, { animationId: id });
    }
  }

  // ------------------------------------------------------------- inputs from the host
  pointerDown(ids, x, y) {
    this.down = { ids, x, y, t: this.now(), moved: false, longDone: false };
    this.dispatch('pointerDown', ids);
    const drags = this.defs.filter(t => t.event.type === 'drag' && ids.includes(t.target));
    this.drag = drags.length ? { list: drags, x, y, started: false, base: new Map(drags.map(t => [t.id, t.event.inputId ? Number(this.bus.get(t.event.inputId)) || 0 : 0])) } : null;
  }
  pointerMove(ids, x, y, nx, ny) {
    // hover enter / exit
    const now = new Set(ids);
    const entered = ids.filter(i => !this.hover.has(i)), exited = [...this.hover].filter(i => !now.has(i));
    if (entered.length) this.dispatch('hoverEnter', entered);
    if (exited.length) this.dispatch('hoverExit', exited);
    this.hover = now;
    if (this.down && Math.hypot(x - this.down.x, y - this.down.y) > 8) this.down.moved = true;
    // drag scrubbing
    if (this.drag) {
      const dx = x - this.drag.x, dy = y - this.drag.y;
      for (const t of this.drag.list) {
        const e = t.event, along = e.axis === 'y' ? dy : e.axis === 'any' ? Math.hypot(dx, dy) * Math.sign(dx + dy || 1) : dx;
        if (!this.drag.started && Math.abs(along) > 8) { this.drag.started = true; this.run(t); }
        if (e.inputId) {
          const min = +e.min || 0, max = e.max === undefined || e.max === '' ? 100 : +e.max, span = max - min;
          const v = Math.max(Math.min(min, max), Math.min(Math.max(min, max), this.drag.base.get(t.id) + (along / Math.max(1, +e.distance || 200)) * span));
          this.bus.set(e.inputId, Math.round(v * 100) / 100);
        }
      }
    }
    // cursor mapping
    if (nx !== undefined) for (const t of this.defs) if (t.event.type === 'mouseMove') {
      if (t.event.inputX) this.bus.set(t.event.inputX, Math.round(Math.max(0, Math.min(1, nx)) * 1000) / 10);
      if (t.event.inputY) this.bus.set(t.event.inputY, Math.round(Math.max(0, Math.min(1, ny)) * 1000) / 10);
    }
  }
  pointerUp(ids, x, y) {
    const d = this.down;
    this.dispatch('pointerUp', ids);
    if (d && !d.longDone && !d.moved) {
      // long press released before a frame noticed it (slow devices): fire it now instead of a click
      const held = (this.now() - d.t) * 1000, lp = this.defs.filter(t => t.event.type === 'longPress' && d.ids.includes(t.target) && held >= (+t.event.ms || 500));
      if (lp.length) { d.longDone = true; lp.forEach(t => this.run(t)); }
    }
    if (d) {
      const same = ids.filter(i => d.ids.includes(i));
      if (same.length && !d.moved && !d.longDone) {
        this.dispatch('click', same);
        // QA-02: a double click needs both clicks on the same (deepest) layer; a shared parent frame doesn't count
        if (this.lastClick && this.now() - this.lastClick.t < 0.35 && this.lastClick.ids[0] === same[0]) { this.dispatch('doubleClick', same); this.lastClick = null; }
        else this.lastClick = { ids: same, t: this.now() };
      }
      const dx = x - d.x, dy = y - d.y, dist = Math.hypot(dx, dy);
      if (dist > 40 && this.now() - d.t < 0.7) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this.dispatch('swipe', d.ids, { dir });
      }
    }
    this.down = null; this.drag = null;
  }
  pointerLeave() { if (this.hover.size) this.dispatch('hoverExit', [...this.hover]); this.hover = new Set(); }
  key(type, key) { this.dispatch(type === 'up' ? 'keyUp' : 'keyDown', null, { key }); }
  /** progress 0–100 */
  scroll(progress) {
    for (const t of this.defs) if (t.event.type === 'scroll') {
      if (t.event.inputId) this.bus.set(t.event.inputId, Math.round(progress * 10) / 10);
      const at = t.event.at;
      if (at !== undefined && at !== '' && at !== null) {
        const reached = progress >= +at, was = this.condWas.get(t.id) || false;
        if (reached && !was) this.run(t);
        this.condWas.set(t.id, reached);
      }
    }
  }
  onInput(id) {
    for (const t of this.defs) {
      if (t.event.type !== 'inputChange' || t.event.inputId !== id) continue;
      if (!t.event.op || t.event.op === 'any') { this.run(t); continue; }
      const now = this.condPass(t.event), was = this.condWas.get(t.id);
      this.condWas.set(t.id, now);
      if (now && !was) this.run(t);
    }
  }

  // ------------------------------------------------------------- matching & running
  dispatch(type, ids, info = {}) {
    for (const t of this.defs) {
      if (t.event.type !== type) continue;
      if (ids && TRIGGER_EVENTS[type]?.target && !ids.includes(t.target)) continue;
      if (type === 'keyDown' || type === 'keyUp') { if (!TriggerEngine.keyMatch(t.event.key, info.key)) continue; }
      if (type === 'swipe' && (t.event.dir || 'left') !== info.dir) continue;
      if (type === 'animationEnd' && t.event.animationId && t.event.animationId !== info.animationId) continue;
      this.run(t);
    }
  }
  static keyMatch(want, got) {
    if (!want || want === 'Any') return true;
    const norm = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k);
    return norm(want) === norm(got || '');
  }
  condPass(c) {
    const def = this.inputDef(c.inputId);
    if (!def || !this.bus) return false;
    const v = this.bus.get(c.inputId), w = def.type === 'boolean' ? (c.value === true || c.value === 'true') : Number(c.value);
    return { '==': v === w, '!=': v !== w, '>': v > w, '<': v < w, '>=': v >= w, '<=': v <= w }[c.op || '=='] ?? false;
  }
  run(t) {
    if (t.once && this.firedOnce.has(t.id)) return;
    if (t.cooldown && this.firedAt.has(t.id) && (this.clock - this.firedAt.get(t.id)) * 1000 < +t.cooldown) return;
    for (const c of t.conditions || []) if (!this.condPass(c)) return;
    this.firedAt.set(t.id, this.clock); this.firedOnce.add(t.id);
    let wait = 0;
    for (const a of t.actions || []) {
      wait += Math.max(0, +a.delay || 0);
      if (wait > 0) this.at(wait, () => this.exec(a)); else this.exec(a);
    }
    if (this.host.fired) this.host.fired(t);
  }
  sourceValue(a, fallback) {
    if (a.from !== 'input' || !a.sourceInput) return fallback;
    const v = Number(this.bus ? this.bus.get(a.sourceInput) : 0) || 0;
    const inMin = +a.inMin || 0, inMax = a.inMax === undefined || a.inMax === '' ? 100 : +a.inMax;
    const outMin = +a.outMin || 0, outMax = a.outMax === undefined || a.outMax === '' ? 100 : +a.outMax;
    const k = Math.max(0, Math.min(1, (v - inMin) / ((inMax - inMin) || 1)));
    return outMin + (outMax - outMin) * k;
  }
  exec(a) {
    const H = this.host, bus = this.bus;
    switch (a.type) {
      case 'fireInput': if (bus && a.inputId) bus.fire(a.inputId); return;
      case 'setInput': if (bus && a.inputId) bus.set(a.inputId, a.value === 'true' ? true : a.value === 'false' ? false : a.value); return;
      case 'toggleInput': if (bus && a.inputId) bus.toggle(a.inputId); return;
      case 'stepInput': {
        if (!bus || !a.inputId) return;
        const min = +a.min || 0, max = a.max === undefined || a.max === '' ? 10 : +a.max;
        let v = (Number(bus.get(a.inputId)) || 0) + (+a.by || 1);
        if (a.wrap) { if (v > max) v = min; if (v < min) v = max; } else v = Math.max(min, Math.min(max, v));
        bus.set(a.inputId, v); return;
      }
      case 'playAnimation': return this.animate(a);
      case 'setProperty': {
        if (!a.targetId || !a.prop) return;
        const cur = this.read(a.targetId, a.prop);
        let to = this.sourceValue(a, a.value);
        const isColor = TRIGGER_COLOR_PROPS.includes(a.prop);
        if (!isColor) { to = Number(to); if (!Number.isFinite(to)) return; if (a.relative) to = (Number(this.base(a.targetId, a.prop)) || 0) + to; } // offset from the original value (hover lift, parallax)
        else if (!to) return;
        this.tweens = this.tweens.filter(tw => !(tw.id === a.targetId && tw.prop === a.prop));
        const dur = Math.max(0, +a.duration || 0) / 1000;
        if (!dur || cur === undefined) { this.write(a.targetId, a.prop, to); return; }
        this.tweens.push({ id: a.targetId, prop: a.prop, from: isColor ? String(cur) : Number(cur) || 0, to, t: 0, dur, easing: a.easing || 'easeOut' });
        return;
      }
      case 'toggleVisible': {
        if (!a.targetId) return;
        const cur = this.read(a.targetId, 'visible') !== false;
        this.write(a.targetId, 'visible', a.to === 'show' ? true : a.to === 'hide' ? false : !cur);
        return;
      }
      case 'navigate': return H.navigate ? H.navigate(a.frameId, a.transition, +a.duration || 0, a.direction) : this.notice('Go to frame works in the prototype player');
      case 'back': return H.back ? H.back() : this.notice('Go back works in the prototype player');
      case 'openOverlay': return H.openOverlay ? H.openOverlay(a.frameId) : this.notice('Overlays work in the prototype player');
      case 'closeOverlay': return H.closeOverlay && H.closeOverlay();
      case 'scrollTo': return H.scrollTo && H.scrollTo(a.targetId);
      case 'cameraFocus': case 'cameraReset': return H.camera && H.camera(a);
      case 'openUrl': if (/^https?:\/\//i.test(a.url || '')) { if (H.openUrl) H.openUrl(a.url); } return;
      case 'emit': if (H.emit) H.emit(a.name || 'event'); return;
      default:
    }
  }
  notice(msg) { if (this.host.notice && !this.noticed) { this.noticed = true; this.host.notice(msg); } }
  animate(a) {
    const anim = this.anims.find(x => x.id === a.animationId);
    if (!anim) return;
    let pl = this.players.get(anim.id);
    const loop = !a.loop || a.loop === 'default' ? (anim.loop === 'oneShot' ? 'once' : anim.loop || 'loop') : a.loop;
    if (!pl) { pl = { anim, t: 0, dir: 1, speed: 1, loop, playing: false }; this.players.set(anim.id, pl); }
    pl.loop = loop; pl.speed = Math.max(0.05, +a.speed || 1);
    const mode = a.mode || 'play';
    if (mode === 'pause') { pl.playing = false; return; }
    if (mode === 'stop') { pl.playing = false; pl.t = 0; pl.dir = 1; this.pose(anim, 0); return; }
    if (mode === 'seek') { pl.playing = false; pl.t = (this.sourceValue(a, a.value) / 100) * anim.duration; pl.t = Math.max(0, Math.min(anim.duration, pl.t)); this.pose(anim, pl.t); return; }
    if (mode === 'toggle') { if (pl.playing) { pl.playing = false; return; } }
    if (mode === 'restart') { pl.t = 0; pl.dir = 1; }
    if (mode === 'reverse') { pl.dir = -1; if (pl.t <= 0) pl.t = anim.duration; }
    else if (mode !== 'toggle' || !pl.playing) { if (mode === 'play' && pl.loop === 'once' && pl.t >= anim.duration) pl.t = 0; pl.dir = mode === 'reverse' ? -1 : 1; }
    pl.playing = true;
    if (mode === 'restart' || (mode === 'play' && pl.t === 0 && pl.dir === 1)) this.pose(anim, pl.t); // v3.11.1: first frame shows the start pose, not the end state
  }
  pose(anim, t) { for (const [id, props] of Object.entries(anim.tracks)) for (const p of Object.keys(props)) { const v = this.host.evaluateIn(anim, id, p, t); if (v !== undefined) this.write(id, p, v); } }

  // ------------------------------------------------------------- values (originals kept for restore)
  read(id, prop) { return this.host.get(id, prop); }
  base(id, prop) { const k = `${id}|${prop}`; return this.originals.has(k) ? this.originals.get(k) : this.read(id, prop); }
  write(id, prop, v) {
    const k = `${id}|${prop}`;
    if (!this.originals.has(k)) this.originals.set(k, this.read(id, prop));
    this.host.apply(id, prop, v);
  }
  /** Put every touched property back (when a preview stops). */
  restore() { for (const [k, v] of this.originals) { const i = k.lastIndexOf('|'); if (v !== undefined) this.host.apply(k.slice(0, i), k.slice(i + 1), v); } this.originals.clear(); }
}

// =============================================================================== Editor (Design & 3D)
const TriggersMixin = {
  triggerList() { if (!Array.isArray(this.model.triggers)) this.model.triggers = []; return this.model.triggers; },
  newTrigger(scope, target, event = 'click', actions = []) {
    const evDef = TRIGGER_EVENTS[event] || {};
    const ev = { type: event };
    for (const p of evDef.params || []) if (p.def !== undefined) ev[p.k] = p.def;
    return { id: Utils.uid('trg'), name: '', scope, target: evDef.target ? target : (evDef.target === 'optional' ? target : null), owner: target || null, enabled: true, once: false, cooldown: 0, event: ev, conditions: [], actions };
  },
  newAction(type, scope, target) {
    const def = TRIGGER_ACTIONS[type] || {};
    const a = { type, delay: 0 };
    for (const p of def.params || []) if (p.def !== undefined) a[p.k] = p.def;
    if (def.params?.some(p => p.k === 'targetId')) a.targetId = target || null;
    if (type === 'setProperty') { a.prop = scope === '3d' ? 'py' : 'opacity'; a.value = scope === '3d' ? 1 : 0.5; }
    if (def.params?.some(p => p.type === 'animation')) {
      // QA-10: prefer an animation that moves this layer, then any animation with keyframes, then the active one
      const an = this.model.animations, has = (x) => Object.keys(x.tracks || {}).length;
      const pick = (target && an.find(x => x.tracks?.[target])) || (has(this.model.activeAnimation || {}) ? this.model.activeAnimation : an.find(has)) || this.model.activeAnimation;
      a.animationId = pick?.id || this.model.activeAnimationId;
      if (!pick || !has(pick)) setTimeout(() => Utils.toast('This animation has no keyframes yet — add some in Animate mode, or pick another animation in the trigger', 'ℹ️', { duration: 5000 }), 0);
    }
    if (def.params?.some(p => p.type === 'frame')) a.frameId = this.model.roots().find(f => f.type === 'frame')?.id || null;
    const inp = def.params?.find(p => p.k === 'inputId' && p.type === 'input');
    if (inp) a.inputId = this.pickInput(inp.inputType)?.id || null;
    return a;
  },
  pickInput(kind) { return this.model.inputs.find(i => !kind || kind === 'value' ? i.type !== 'trigger' : i.type === kind); },
  targetName(scope, id) {
    if (!id) return scope === '3d' ? 'the scene' : 'the page';
    if (scope === '3d') return this.model.scene3d?.objects.find(o => o.id === id)?.name || 'missing object';
    return this.model.findAnywhere(id)?.name || 'missing layer';
  },
  targetOptions(scope) {
    if (scope === '3d') return (this.model.scene3d?.objects || []).map(o => [o.id, o.name]);
    return this.model.elements.map(e => [e.id, `${'  '.repeat(this.model.ancestorsOf(e).length)}${e.name}`]);
  },
  triggerChanged(label = 'Edit trigger') {
    this._actionLabel = label;
    if (this.section === '3d' && this.s3Commit) this.s3Commit(label);
    else this.commit();
  },
  /** Plain-language summary ("When Click on Button → Play animation Hover"). */
  triggerSummary(t) {
    const ev = TRIGGER_EVENTS[t.event.type];
    const on = ev?.target && t.target ? ` on ${this.targetName(t.scope, t.target)}` : t.event.type === 'keyDown' || t.event.type === 'keyUp' ? ` “${t.event.key || 'Any'}”` : '';
    const m = this.model, anim = (id) => m.animations.find(a => a.id === id)?.name || 'animation', inp = (id) => m.inputs.find(i => i.id === id)?.name || 'input';
    const propName = (sc, p) => (TRIGGER_PROPS[sc] || []).find(([k]) => k === p)?.[1] || p;
    const acts = (t.actions || []).map(a => {
      switch (a.type) {
        case 'setProperty': return `${propName(t.scope, a.prop)} ${a.from === 'input' ? `← ${inp(a.sourceInput)}` : `${a.relative ? (Number(a.value) >= 0 ? '+' : '') : '→ '}${a.value}`}${a.targetId && a.targetId !== t.target ? ` (${this.targetName(t.scope, a.targetId)})` : ''}`;
        case 'playAnimation': return `${{ seek: 'Scrub', pause: 'Pause', stop: 'Stop', reverse: 'Reverse', toggle: 'Play/pause', restart: 'Restart' }[a.mode] || 'Play'} “${anim(a.animationId)}”`;
        case 'navigate': return `Go to “${this.targetName('design', a.frameId)}”`;
        case 'openOverlay': return `Overlay “${this.targetName('design', a.frameId)}”`;
        case 'fireInput': return `Fire ${inp(a.inputId)}`;
        case 'setInput': return `${inp(a.inputId)} = ${a.value}`;
        case 'toggleInput': return `Toggle ${inp(a.inputId)}`;
        case 'stepInput': return `${inp(a.inputId)} ${Number(a.by) >= 0 ? '+' : ''}${a.by}`;
        case 'toggleVisible': return `${a.to === 'show' ? 'Show' : a.to === 'hide' ? 'Hide' : 'Show/hide'} ${this.targetName(t.scope, a.targetId)}`;
        case 'cameraFocus': return `Camera → ${this.targetName('3d', a.targetId)}`;
        case 'emit': return `Event “${a.name}”`;
        default: return TRIGGER_ACTIONS[a.type]?.label || a.type;
      }
    });
    if (t.event.type === 'mouseMove' || t.event.type === 'scroll' || t.event.type === 'drag') { const mp = [t.event.inputId, t.event.inputX, t.event.inputY].filter(Boolean).map(inp); if (mp.length) acts.unshift(`→ ${mp.join(', ')}`); }
    return `When ${ev?.label || t.event.type}${on}${t.conditions?.length ? ` (if ${t.conditions.length} condition${t.conditions.length > 1 ? 's' : ''})` : ''} → ${acts.join(', ') || 'nothing yet'}`;
  },

  /** Render the trigger list for one target (or the scope's global triggers when target is null). */
  renderTriggerEditor(box, { scope, target = null, compact = false }) {
    if (!box) return;
    const list = this.triggerList().filter(t => t.scope === scope && (target ? (t.target === target || t.owner === target) : !t.target || !TRIGGER_EVENTS[t.event.type]?.target)); // QA-08: a trigger stays on the layer it was made on
    const whereName = this.targetName(scope, target);
    box.innerHTML = `<div class="trg-head"><b>⚡ Triggers</b><span>${target ? Utils.escapeHtml(whereName) : `Global · ${scope === '3d' ? 'scene' : 'page'}`}</span></div>
      ${list.length ? '' : `<p class="trg-empty">${target ? `Make “${Utils.escapeHtml(whereName)}” react: pick a recipe or add a trigger.` : 'Global triggers react to keys, time, scrolling, the cursor and input changes.'}</p>`}
      <div class="trg-list"></div>
      <div class="trg-add"><select class="trg-recipe" aria-label="Add a recipe"><option value="">＋ Recipe…</option>${this.triggerRecipes(scope, target).map((r, i) => `<option value="${i}">${Utils.escapeHtml(r.label)}</option>`).join('')}</select><button type="button" class="btn-primary trg-new">＋ Trigger</button></div>
      <button type="button" class="trg-all link-btn">All triggers (${this.triggerList().length})…</button>`;
    const host = box.querySelector('.trg-list');
    list.forEach(t => host.appendChild(this.triggerCard(t, scope, compact)));
    box.querySelector('.trg-new').addEventListener('click', () => {
      const t = this.newTrigger(scope, target, target ? 'click' : 'keyDown', [this.newAction(target ? (scope === '3d' ? 'setProperty' : 'setProperty') : 'fireInput', scope, target)]);
      t.open = true;
      this.triggerList().push(t);
      this.triggerChanged('Add trigger');
    });
    box.querySelector('.trg-recipe').addEventListener('change', (e) => {
      const r = this.triggerRecipes(scope, target)[+e.target.value];
      e.target.value = '';
      if (!r) return;
      const made = r.make();
      if (made === false) return;
      this.triggerChanged(`Recipe: ${r.label}`);
      Utils.toast(`Added “${r.label}” — try it in ${scope === '3d' ? '3D ▶ Preview' : 'Play (prototype) or Animate ▶ Preview'}`, '⚡');
    });
    box.querySelector('.trg-all').addEventListener('click', () => this.allTriggersDialog());
  },
  triggerCard(t, scope, compact) {
    const card = document.createElement('div');
    card.className = `trg-card${t.enabled === false ? ' off' : ''}${t.open ? ' open' : ''}`;
    const opt = (v, l, s) => `<option value="${Utils.escapeHtml(v ?? '')}"${s ? ' selected' : ''}>${Utils.escapeHtml(l)}</option>`;
    const evGroups = {};
    for (const [k, d] of Object.entries(TRIGGER_EVENTS)) (evGroups[d.group] ||= []).push([k, d]);
    const acGroups = {};
    for (const [k, d] of Object.entries(TRIGGER_ACTIONS)) if (!d.scopes || d.scopes.includes(scope)) (acGroups[d.group] ||= []).push([k, d]);
    const evDef = TRIGGER_EVENTS[t.event.type] || {};
    card.innerHTML = `<div class="trg-top"><button type="button" class="trg-fold" aria-expanded="${!!t.open}" aria-label="Edit trigger">${t.open ? '▾' : '▸'}</button>
        <span class="trg-sum" title="${Utils.escapeHtml(this.triggerSummary(t))}">${Utils.escapeHtml(t.name || this.triggerSummary(t))}</span>
        <label class="trg-switch" title="Enabled"><input type="checkbox" data-f="enabled"${t.enabled !== false ? ' checked' : ''} aria-label="Enabled"></label>
        <button type="button" class="tree-action-icon" data-f="dup" aria-label="Duplicate trigger" title="Duplicate">⧉</button><button type="button" class="tree-action-icon" data-f="del" aria-label="Delete trigger" title="Delete">✕</button></div>
      <div class="trg-body">
        <div class="trg-row"><span class="trg-k">When</span><select data-f="event">${Object.entries(evGroups).map(([g, l]) => `<optgroup label="${g}">${l.map(([k, d]) => opt(k, d.label, k === t.event.type)).join('')}</optgroup>`).join('')}</select></div>
        ${evDef.target ? `<div class="trg-row"><span class="trg-k">on</span><select data-f="target">${this.targetOptions(scope).map(([v, l]) => opt(v, l, v === t.target)).join('')}</select></div>` : ''}
        ${evDef.target === 'optional' ? `<div class="trg-row"><span class="trg-k">${scope === 'design' ? 'screen' : 'on'}</span><select data-f="target">${opt('', scope === 'design' ? 'Any screen (prototype start)' : 'Scene start', !t.target)}${(scope === 'design' ? this.model.roots().filter(f => f.type === 'frame').map(f => [f.id, f.name]) : []).map(([v, l]) => opt(v, `When “${l}” opens`, v === t.target)).join('')}</select></div>` : ''}
        <div class="trg-params" data-scope="event"></div>
        <div class="trg-sub">If <button type="button" class="link-btn" data-f="addCond">＋ condition</button></div>
        <div class="trg-conds"></div>
        <div class="trg-sub">Then</div>
        <div class="trg-actions"></div>
        <div class="trg-addact"><select data-f="addAction" aria-label="Add action"><option value="">＋ Add action…</option>${Object.entries(acGroups).map(([g, l]) => `<optgroup label="${g}">${l.map(([k, d]) => opt(k, d.label)).join('')}</optgroup>`).join('')}</select></div>
        <div class="trg-opts"><label>Name <input type="text" data-f="name" value="${Utils.escapeHtml(t.name || '')}" placeholder="optional"></label><label><input type="checkbox" data-f="once"${t.once ? ' checked' : ''}> Only once</label><label>Cooldown <input type="number" data-f="cooldown" min="0" step="50" value="${+t.cooldown || 0}"> ms</label></div>
      </div>`;
    const commit = (label) => this.triggerChanged(label);
    card.querySelector('.trg-fold').addEventListener('click', () => { t.open = !t.open; card.classList.toggle('open', !!t.open); card.querySelector('.trg-fold').textContent = t.open ? '▾' : '▸'; card.querySelector('.trg-fold').setAttribute('aria-expanded', String(!!t.open)); });
    card.querySelector('.trg-sum').addEventListener('click', () => card.querySelector('.trg-fold').click());
    card.querySelector('[data-f="enabled"]').addEventListener('change', (e) => { t.enabled = e.target.checked; commit(t.enabled ? 'Enable trigger' : 'Disable trigger'); });
    card.querySelector('[data-f="dup"]').addEventListener('click', () => { const c = JSON.parse(JSON.stringify(t)); c.id = Utils.uid('trg'); this.triggerList().push(c); commit('Duplicate trigger'); });
    card.querySelector('[data-f="del"]').addEventListener('click', () => {
      const all = this.triggerList(), i = all.indexOf(t); all.splice(i, 1); commit('Delete trigger');
      Utils.toast('Trigger deleted', '🗑', { action: { label: 'Undo', run: () => { this.triggerList().splice(i, 0, t); commit('Restore trigger'); } } });
    });
    card.querySelector('[data-f="event"]').addEventListener('change', (e) => {
      const fresh = this.newTrigger(scope, t.target, e.target.value);
      if (t.target && !t.owner) t.owner = t.target;
      t.event = fresh.event;
      const kind = TRIGGER_EVENTS[t.event.type].target;
      if (!kind) t.target = null;
      else if (kind === 'optional') {
        // QA-09: time events fire when a screen opens — retarget a layer to its top-level frame
        const el = scope === 'design' && t.target ? this.model.findAnywhere(t.target) : null;
        const root = el ? this.rootOf(el) : null;
        t.target = scope === 'design' && root && root.type === 'frame' && !root.parentId ? root.id : null;
      }
      if (kind === true && !t.target) t.target = t.owner && this.targetOptions(scope).some(o => o[0] === t.owner) ? t.owner : this.targetOptions(scope)[0]?.[0] || null;
      if (TRIGGER_EVENTS[t.event.type].target === true && !t.target) t.target = this.targetOptions(scope)[0]?.[0] || null;
      t.open = true; commit('Change trigger event');
    });
    card.querySelector('[data-f="target"]')?.addEventListener('change', (e) => { t.target = e.target.value || null; commit('Change trigger target'); });
    this.renderParamFields(card.querySelector('.trg-params'), TRIGGER_EVENTS[t.event.type]?.params || [], t.event, scope, () => commit('Edit trigger'));
    // conditions
    const cb = card.querySelector('.trg-conds');
    (t.conditions || []).forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'trg-cond';
      const def = this.model.inputs.find(x => x.id === c.inputId);
      row.innerHTML = `<select data-c="inputId" aria-label="Input">${this.model.inputs.filter(x => x.type !== 'trigger').map(x => opt(x.id, x.name, x.id === c.inputId)).join('')}</select><select data-c="op" aria-label="Operator">${['==', '!=', '>', '<', '>=', '<='].map(o => opt(o, o, o === (c.op || '=='))).join('')}</select>${def?.type === 'boolean' ? `<select data-c="value" aria-label="Value">${opt('true', 'true', c.value === true || c.value === 'true')}${opt('false', 'false', c.value === false || c.value === 'false')}</select>` : `<input type="number" step="any" data-c="value" value="${Number(c.value) || 0}" aria-label="Value">`}<button type="button" class="tree-action-icon" data-c="del" aria-label="Remove condition">✕</button>`;
      row.querySelectorAll('[data-c]').forEach(f => f.addEventListener(f.tagName === 'BUTTON' ? 'click' : 'change', () => {
        if (f.dataset.c === 'del') t.conditions.splice(i, 1);
        else c[f.dataset.c] = f.dataset.c === 'value' ? (f.tagName === 'SELECT' ? f.value === 'true' : Number(f.value)) : f.value;
        commit('Edit condition');
      }));
      cb.appendChild(row);
    });
    card.querySelector('[data-f="addCond"]').addEventListener('click', () => {
      let inp = this.model.inputs.find(x => x.type !== 'trigger');
      if (!inp) { inp = { id: Utils.uid('in'), name: 'isOn', type: 'boolean', value: false }; this.model.inputs.push(inp); Utils.toast('Created boolean input “isOn” for the condition', 'ℹ️'); }
      (t.conditions ||= []).push({ inputId: inp.id, op: '==', value: inp.type === 'boolean' ? true : 1 });
      t.open = true; commit('Add condition');
    });
    // actions
    const ab = card.querySelector('.trg-actions');
    (t.actions || []).forEach((a, i) => {
      const row = document.createElement('div'); row.className = 'trg-act';
      row.innerHTML = `<div class="trg-act-top"><span class="trg-n">${i + 1}</span><b>${Utils.escapeHtml(TRIGGER_ACTIONS[a.type]?.label || a.type)}</b><label class="trg-delay" title="Wait before this step">after <input type="number" min="0" step="50" data-a="delay" value="${+a.delay || 0}" aria-label="Delay in ms"> ms</label>
        <button type="button" class="tree-action-icon" data-a="up" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" class="tree-action-icon" data-a="del" aria-label="Remove action">✕</button></div><div class="trg-params"></div>`;
      row.querySelector('[data-a="delay"]').addEventListener('change', (e) => { a.delay = Math.max(0, +e.target.value || 0); commit('Edit action'); });
      row.querySelector('[data-a="del"]').addEventListener('click', () => { t.actions.splice(i, 1); commit('Remove action'); });
      row.querySelector('[data-a="up"]').addEventListener('click', () => { if (i) { [t.actions[i - 1], t.actions[i]] = [t.actions[i], t.actions[i - 1]]; commit('Reorder actions'); } });
      this.renderParamFields(row.querySelector('.trg-params'), TRIGGER_ACTIONS[a.type]?.params || [], a, scope, () => commit('Edit action'));
      ab.appendChild(row);
    });
    card.querySelector('[data-f="addAction"]').addEventListener('change', (e) => {
      if (!e.target.value) return;
      (t.actions ||= []).push(this.newAction(e.target.value, scope, t.target));
      t.open = true; commit('Add action');
    });
    card.querySelector('[data-f="name"]').addEventListener('change', (e) => { t.name = e.target.value.trim(); commit('Rename trigger'); });
    card.querySelector('[data-f="once"]').addEventListener('change', (e) => { t.once = e.target.checked; commit('Edit trigger'); });
    card.querySelector('[data-f="cooldown"]').addEventListener('change', (e) => { t.cooldown = Math.max(0, +e.target.value || 0); commit('Edit trigger'); });
    return card;
  },
  renderParamFields(box, params, obj, scope, commit) {
    const opt = (v, l, s) => `<option value="${Utils.escapeHtml(v ?? '')}"${s ? ' selected' : ''}>${Utils.escapeHtml(l)}</option>`;
    const m = this.model;
    const rows = params.filter(p => !p.show || p.show(obj)).map(p => {
      const v = obj[p.k];
      let input;
      switch (p.type) {
        case 'select': input = `<select data-tp="${p.k}">${p.options.map(([k, l]) => opt(k, l, String(k) === String(v ?? p.def))).join('')}</select>`; break;
        case 'check': input = `<input type="checkbox" data-tp="${p.k}"${v ? ' checked' : ''}>`; break;
        case 'number': input = `<input type="number" step="any" data-tp="${p.k}" value="${v ?? ''}"${p.optional ? ' placeholder="—"' : ''}>`; break;
        case 'text': input = `<input type="text" data-tp="${p.k}" value="${Utils.escapeHtml(v ?? '')}">`; break;
        case 'key': input = `<input type="text" data-tp="${p.k}" class="trg-key" value="${Utils.escapeHtml(v || 'Any')}" readonly title="Click, then press a key (Backspace = any key)">`; break;
        case 'input': {
          const ok = m.inputs.filter(i => !p.inputType || p.inputType === 'value' ? i.type !== 'trigger' : i.type === p.inputType);
          input = `<select data-tp="${p.k}" data-kind="${p.inputType || ''}">${p.optional ? opt('', '— none —', !v) : ''}${ok.map(i => opt(i.id, `${i.name} (${i.type})`, i.id === v)).join('')}${opt('__new', `＋ New ${p.inputType && p.inputType !== 'value' ? p.inputType : 'number'} input…`)}</select>`;
          break;
        }
        case 'value': {
          const inp = m.inputs.find(i => i.id === (obj.inputId));
          const prop = obj.prop;
          if (TRIGGER_COLOR_PROPS.includes(prop)) input = `<input type="color" data-tp="${p.k}" value="${Utils.toHex(v || '#0d99ff')}">`;
          else if (inp?.type === 'boolean' && obj.type !== 'setProperty') input = `<select data-tp="${p.k}">${opt('true', 'true', v === true || v === 'true')}${opt('false', 'false', v === false || v === 'false')}</select>`;
          else input = `<input type="number" step="any" data-tp="${p.k}" value="${v ?? 0}">`;
          break;
        }
        case 'animation': input = `<select data-tp="${p.k}">${m.animations.map(a => opt(a.id, a.name, a.id === v)).join('')}</select>`; break;
        case 'frame': input = `<select data-tp="${p.k}">${m.roots().filter(f => f.type === 'frame').map(f => opt(f.id, f.name, f.id === v)).join('')}</select>`; break;
        case 'target': input = `<select data-tp="${p.k}">${this.targetOptions(scope).map(([k, l]) => opt(k, l, k === v)).join('')}</select>`; break;
        case 'prop': input = `<select data-tp="${p.k}">${TRIGGER_PROPS[scope].map(([k, l]) => opt(k, l, k === v)).join('')}</select>`; break;
        case 'easing': input = `<select data-tp="${p.k}">${Object.keys(Utils.easings).map(k => opt(k, Utils.easingLabels?.[k] || k, k === (v || p.def))).join('')}</select>`; break;
        default: input = '';
      }
      return `<label class="trg-field${p.type === 'check' ? ' chk' : ''}"><span>${p.label}</span>${input}</label>`;
    });
    box.innerHTML = rows.join('');
    box.querySelectorAll('[data-tp]').forEach(f => {
      const k = f.dataset.tp, p = params.find(x => x.k === k);
      if (p.type === 'key') {
        f.addEventListener('keydown', (e) => { e.preventDefault(); e.stopPropagation(); obj[k] = e.key === 'Backspace' ? 'Any' : e.key === ' ' ? 'Space' : e.key; f.value = obj[k]; commit(); });
        return;
      }
      f.addEventListener('change', () => {
        let val = f.type === 'checkbox' ? f.checked : f.type === 'number' ? (f.value === '' ? '' : Number(f.value)) : f.value;
        if (p.type === 'input' && val === '__new') {
          const kind = f.dataset.kind && f.dataset.kind !== 'value' ? f.dataset.kind : 'number';
          const base = { trigger: 'tap', boolean: 'isOn', number: 'amount' }[kind];
          let name = base, n = 2; while (m.inputs.some(i => i.name === name)) name = `${base}${n++}`;
          const inp = { id: Utils.uid('in'), name, type: kind, value: kind === 'boolean' ? false : 0 };
          m.inputs.push(inp); val = inp.id;
          Utils.toast(`Created ${kind} input “${name}” (rename it in Design › Animate)`, 'ℹ️');
        }
        if (p.type === 'value' && f.tagName === 'SELECT') val = f.value === 'true';
        obj[k] = val;
        if (k === 'prop') obj.value = TRIGGER_COLOR_PROPS.includes(val) ? '#0d99ff' : (val === 'opacity' ? 1 : 0);
        commit();
      });
    });
  },

  /** One-click patterns that cover the common cases. */
  triggerRecipes(scope, target) {
    const m = this.model, list = this.triggerList();
    const T = (ev, acts, extra = {}) => Object.assign(this.newTrigger(scope, target, ev, acts), extra);
    const A = (type, p = {}) => Object.assign(this.newAction(type, scope, target), p);
    const ensureInput = (name, type, value) => { let i = m.inputs.find(x => x.name === name); if (!i) { i = { id: Utils.uid('in'), name, type, value }; m.inputs.push(i); } return i; };
    const yProp = scope === '3d' ? 'py' : 'y', sc = scope === '3d' ? 'sx' : null;
    const r = [];
    if (target) {
      r.push({ label: 'Hover: lift', make: () => { list.push(T('hoverEnter', [A('setProperty', { prop: yProp, value: scope === '3d' ? 0.25 : -8, relative: true, duration: 180 })]), T('hoverExit', [A('setProperty', { prop: yProp, value: 0, relative: true, duration: 220 })])); } });
      r.push({ label: 'Hover: fade to 60 %', make: () => { list.push(T('hoverEnter', [A('setProperty', { prop: 'opacity', value: 0.6, duration: 150 })]), T('hoverExit', [A('setProperty', { prop: 'opacity', value: 1, duration: 150 })])); } });
      if (sc) r.push({ label: 'Click: pop (scale bounce)', make: () => { list.push(T('click', [A('setProperty', { prop: 'sx', value: 1.2, duration: 120 }), A('setProperty', { prop: 'sy', value: 1.2, duration: 120 }), A('setProperty', { prop: 'sz', value: 1.2, duration: 120 }), A('setProperty', { prop: 'sx', value: 1, duration: 260, delay: 120, easing: 'easeOutBack' }), A('setProperty', { prop: 'sy', value: 1, duration: 260, easing: 'easeOutBack' }), A('setProperty', { prop: 'sz', value: 1, duration: 260, easing: 'easeOutBack' })])); } });
      else r.push({ label: 'Click: press feedback', make: () => { list.push(T('pointerDown', [A('setProperty', { prop: 'opacity', value: 0.75, duration: 60 })]), T('pointerUp', [A('setProperty', { prop: 'opacity', value: 1, duration: 140 })])); } });
      r.push({ label: 'Click: play an animation', make: () => { list.push(T('click', [A('playAnimation', { mode: 'restart' })])); } });
      r.push({ label: 'Click: toggle on / off (boolean input)', make: () => { const i = ensureInput(`${Utils.slug(this.targetName(scope, target), 'item').replace(/-/g, '_')}_on`, 'boolean', false); list.push(T('click', [A('toggleInput', { inputId: i.id })])); } });
      r.push({ label: 'Click: count up (number input)', make: () => { const i = ensureInput('count', 'number', 0); list.push(T('click', [A('stepInput', { inputId: i.id, by: 1, min: 0, max: 99 })])); } });
      r.push({ label: 'Drag: scrub an animation', make: () => { const i = ensureInput('scrub', 'number', 0); list.push(T('drag', [], { event: { type: 'drag', axis: 'x', inputId: i.id, distance: 240, min: 0, max: 100 } }), Object.assign(this.newTrigger(scope, null, 'inputChange', [A('playAnimation', { mode: 'seek', from: 'input', sourceInput: i.id, inMin: 0, inMax: 100, outMin: 0, outMax: 100 })]), { event: { type: 'inputChange', inputId: i.id, op: 'any' } })); } });
      r.push({ label: 'Long press: show / hide', make: () => { list.push(T('longPress', [A('toggleVisible', { to: 'toggle' })])); } });
      r.push({ label: 'Follow the cursor (parallax)', make: () => {
        const ix = ensureInput('pointerX', 'number', 50), iy = ensureInput('pointerY', 'number', 50);
        if (!list.some(t => t.scope === scope && t.event.type === 'mouseMove')) list.push(Object.assign(this.newTrigger(scope, null, 'mouseMove', []), { event: { type: 'mouseMove', inputX: ix.id, inputY: iy.id } }));
        const [px, py, amp] = scope === '3d' ? ['px', 'py', 0.4] : ['x', 'y', 24];
        list.push(Object.assign(this.newTrigger(scope, null, 'inputChange', [A('setProperty', { targetId: target, prop: px, from: 'input', sourceInput: ix.id, inMin: 0, inMax: 100, outMin: -amp, outMax: amp, relative: true, duration: 0 })]), { event: { type: 'inputChange', inputId: ix.id, op: 'any' } }));
        list.push(Object.assign(this.newTrigger(scope, null, 'inputChange', [A('setProperty', { targetId: target, prop: py, from: 'input', sourceInput: iy.id, inMin: 0, inMax: 100, outMin: scope === '3d' ? amp : -amp, outMax: scope === '3d' ? -amp : amp, relative: true, duration: 0 })]), { event: { type: 'inputChange', inputId: iy.id, op: 'any' } }));
      } });
      if (scope === '3d') r.push({ label: 'Click: fly camera to this object', make: () => { list.push(T('click', [A('cameraFocus', { targetId: target })])); } });
      if (scope === 'design') r.push({ label: 'Click: go to next frame', make: () => { const frames = m.roots().filter(f => f.type === 'frame'); const cur = this.rootOf(m.findAnywhere(target)); const next = frames[(frames.indexOf(cur) + 1) % frames.length]; list.push(T('click', [A('navigate', { frameId: next?.id || null, transition: 'push' })])); } });
    } else {
      r.push({ label: 'Space bar: play / pause animation', make: () => { list.push(Object.assign(this.newTrigger(scope, null, 'keyDown', [A('playAnimation', { mode: 'toggle' })]), { event: { type: 'keyDown', key: 'Space' } })); } });
      r.push({ label: 'Arrow keys: step a number input', make: () => { const i = ensureInput('step', 'number', 0); list.push(Object.assign(this.newTrigger(scope, null, 'keyDown', [A('stepInput', { inputId: i.id, by: 1, min: 0, max: 10 })]), { event: { type: 'keyDown', key: 'ArrowRight' } }), Object.assign(this.newTrigger(scope, null, 'keyDown', [A('stepInput', { inputId: i.id, by: -1, min: 0, max: 10 })]), { event: { type: 'keyDown', key: 'ArrowLeft' } })); } });
      r.push({ label: 'Autoplay animation on start', make: () => { list.push(this.newTrigger(scope, null, 'start', [A('playAnimation', { mode: 'restart' })])); } });
      r.push({ label: 'Loop: fire an input every 3 s', make: () => { const i = ensureInput('tick', 'trigger', false); list.push(Object.assign(this.newTrigger(scope, null, 'every', [A('fireInput', { inputId: i.id })]), { event: { type: 'every', ms: 3000, times: 0 } })); } });
      r.push({ label: 'Scroll-linked animation (scrub by scroll)', make: () => { const i = ensureInput('scroll', 'number', 0); list.push(Object.assign(this.newTrigger(scope, null, 'scroll', []), { event: { type: 'scroll', inputId: i.id } }), Object.assign(this.newTrigger(scope, null, 'inputChange', [A('playAnimation', { mode: 'seek', from: 'input', sourceInput: i.id, inMin: 0, inMax: 100, outMin: 0, outMax: 100 })]), { event: { type: 'inputChange', inputId: i.id, op: 'any' } })); } });
      r.push({ label: 'Cursor → pointerX / pointerY inputs', make: () => { const ix = ensureInput('pointerX', 'number', 50), iy = ensureInput('pointerY', 'number', 50); list.push(Object.assign(this.newTrigger(scope, null, 'mouseMove', []), { event: { type: 'mouseMove', inputX: ix.id, inputY: iy.id } })); } });
      if (scope === '3d') r.push({ label: 'Key R: reset camera', make: () => { list.push(Object.assign(this.newTrigger(scope, null, 'keyDown', [A('cameraReset')]), { event: { type: 'keyDown', key: 'R' } })); } });
      if (scope === 'design') r.push({ label: 'Escape key: go back', make: () => { list.push(Object.assign(this.newTrigger(scope, null, 'keyDown', [A('back')]), { event: { type: 'keyDown', key: 'Escape' } })); } });
    }
    return r;
  },

  /** Overview of every trigger in the project, grouped by section. */
  allTriggersDialog() {
    const all = this.triggerList();
    const group = (scope, title) => {
      const l = all.filter(t => t.scope === scope);
      return `<h4 class="trg-dlg-h">${title} <small>${l.length}</small></h4>${l.map(t => `<div class="trg-dlg-row${t.enabled === false ? ' off' : ''}" data-id="${t.id}"><label><input type="checkbox" data-x="en"${t.enabled !== false ? ' checked' : ''} aria-label="Enabled"></label><span>${Utils.escapeHtml(t.name ? `${t.name} — ` : '')}${Utils.escapeHtml(this.triggerSummary(t))}</span><button type="button" class="btn-ghost" data-x="go">Edit</button></div>`).join('') || '<p class="muted-text">None yet.</p>'}`;
    };
    const d = this.dialog({
      title: `All triggers (${all.length})`, wide: true,
      body: `<p class="muted-text">Triggers run in Play (prototype), Animate ▶ Preview, 3D ▶ Preview and in exported players. Inputs are shared by every section.</p>${group('design', 'Design & prototype')}${group('3d', '3D scene')}`,
      actions: [{ label: 'Close', primary: true }]
    });
    d.el.querySelectorAll('.trg-dlg-row').forEach(row => {
      const t = all.find(x => x.id === row.dataset.id);
      row.querySelector('[data-x="en"]').addEventListener('change', (e) => { t.enabled = e.target.checked; row.classList.toggle('off', !t.enabled); this.triggerChanged(t.enabled ? 'Enable trigger' : 'Disable trigger'); });
      row.querySelector('[data-x="go"]').addEventListener('click', () => { d.close(); this.revealTrigger(t); });
    });
  },
  revealTrigger(t) {
    t.open = true;
    if (t.scope === '3d') { this.setSection('3d'); setTimeout(() => this.s3Select?.(t.target && TRIGGER_EVENTS[t.event.type]?.target ? t.target : null), 50); return; }
    this.setSection('design');
    if (t.target && TRIGGER_EVENTS[t.event.type]?.target && this.model.getElementById(t.target)) { this.model.select([t.target]); this.selectionChanged(); } else { this.model.select([]); this.selectionChanged(); }
    document.querySelector('.panel-tab-btn[data-tab="prototype"]')?.click();
  },

  // ------------------------------------------------------------- wiring into the Design editor
  bindTriggers() {
    const proto = document.getElementById('panel-tab-prototype');
    if (proto) {
      const box = document.createElement('div');
      box.id = 'design-triggers'; box.className = 'trg-box';
      proto.insertBefore(box, proto.firstChild);
      const head = proto.querySelector('div[style*="font-weight:600"]');
      if (head) head.textContent = 'Classic links (prototype only)';
    }
    const orig = this.populatePrototypeTab.bind(this);
    this.populatePrototypeTab = (el) => { orig(el); this.renderTriggerEditor(document.getElementById('design-triggers'), { scope: 'design', target: el ? el.id : null }); };
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); this.allTriggersDialog(); }
    });
    this.commands.allTriggers = { run: () => this.allTriggersDialog() };
    const view = document.getElementById('dropdown-view');
    if (view) {
      const it = document.createElement('div');
      it.className = 'dropdown-item'; it.dataset.action = 'allTriggers'; it.setAttribute('role', 'menuitem'); it.tabIndex = -1;
      it.innerHTML = 'All Triggers… <span class="dropdown-shortcut">Ctrl+Alt+T</span>';
      view.insertBefore(it, view.firstChild);
    }
    // Key triggers: while a preview / prototype runs, keys go to the running engine instead of editor shortcuts
    const route = (type) => (e) => {
      const engine = this.proto ? this.protoEngine : this.section === '3d' ? this.s3?.preview?.engine : this.previewing ? this.trgEngine : null;
      if (!engine || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (e.key === 'Escape' && type === 'down') return; // Esc still stops the preview
      engine.key(type, e.key);
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', route('down'), true);
    window.addEventListener('keyup', route('up'), true);
  },
  /** Design-side engine host (Animate preview / prototype). */
  designTriggerHost(extra = {}) {
    const m = this.model;
    return Object.assign({
      apply: (id, p, v) => { const el = m.findAnywhere(id); if (!el) return; if (p === 'visible') el.visible = !!v; else m.setAnimValue(el, p, v); },
      get: (id, p) => { const el = m.findAnywhere(id); return el ? (p === 'visible' ? el.visible : m.getAnimValue(el, p)) : undefined; },
      evaluateIn: (a, id, p, t) => m.evaluateIn(a, id, p, t),
      openUrl: (u) => { const s = String(u || '').trim(), l = s.toLowerCase(); if (l.startsWith('https://') || l.startsWith('http://') || l.startsWith('mailto:')) window.open(s, '_blank', 'noopener,noreferrer'); },
      emit: (name) => Utils.toast(`Event “${name}” sent to page code`, '📣', { duration: 1500 }),
      notice: (msg) => Utils.toast(msg, 'ℹ️')
    }, extra);
  }
};
Object.assign(StudioApp.prototype, TriggersMixin);
