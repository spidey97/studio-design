/**
 * DesignStudio — document model: elements, hierarchy, pages, history,
 * components, styles, animation tracks and (de)serialization.
 */
'use strict';

const ANIM_PROPS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'cornerRadius', 'fillColor'];
const ANIM_LABELS = { x: 'Position X', y: 'Position Y', width: 'Width', height: 'Height', rotation: 'Rotation', opacity: 'Opacity', cornerRadius: 'Corner Radius', fillColor: 'Fill Color' };
const CONTAINER_TYPES = new Set(['frame', 'group']);
const SHAPE_TYPES = ['rect', 'ellipse', 'line', 'arrow', 'polygon', 'star', 'text', 'frame'];

const DEFAULT_FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

class StudioElement {
  constructor(type = 'rect', x = 0, y = 0, width = 100, height = 100) {
    this.id = Utils.uid('el');
    this.type = type; // rect | ellipse | line | arrow | polygon | star | text | frame | group | path | image
    this.name = type.charAt(0).toUpperCase() + type.slice(1);
    this.x = x; this.y = y; this.width = width; this.height = height;
    this.rotation = 0;
    this.flipX = false; this.flipY = false;
    this.cornerRadius = 0;
    this.opacity = 1;
    this.blendMode = 'source-over';
    this.visible = true;
    this.locked = false;
    this.constrainProportions = false;

    const isLine = type === 'line' || type === 'arrow' || type === 'path';
    this.fills = (type === 'group' || isLine) ? [] : [{
      type: 'solid', color: type === 'frame' ? '#ffffff' : (type === 'text' ? '#ffffff' : '#0d99ff'),
      opacity: 1, angle: 90, visible: true,
      stops: [{ pos: 0, color: '#0d99ff' }, { pos: 1, color: '#9747ff' }]
    }];
    this.strokes = isLine ? [{ color: '#ffffff', width: 2, align: 'center', visible: true }] : [];
    this.effects = [];
    this.constraints = { horizontal: 'left', vertical: 'top' };

    // Frames
    this.clipContent = true;
    this.isAutoLayout = false;
    this.layoutDirection = 'horizontal';
    this.layoutGap = 12;
    this.layoutPadding = 16;
    this.layoutPaddingTop = 16; this.layoutPaddingRight = 16; this.layoutPaddingBottom = 16; this.layoutPaddingLeft = 16;
    this.layoutAlign = 'top-left';
    this.primarySizing = 'fixed';
    this.counterSizing = 'fixed';
    this.layoutGrids = [];
    this.overflowScroll = 'none';

    // Hierarchy
    this.parentId = null;

    // Components
    this.isComponentMaster = false;
    this.isComponentInstance = false;
    this.masterComponentId = null;
    this.masterChildId = null;
    this.overrides = [];
    this.isComponentSet = false;   // v3.6.0: frame holding variants (main components named "Prop=Value, …")
    this.componentProps = [];      // on a main component / set: [{id, name, type: text|boolean|swap, layer: "path/in/component", def}]
    this.propValues = null;        // on an instance: {propId: value}
    this.description = '';
    // Design system (v3.8.0)
    this.bindings = null;          // {prop: variableId} — 'fills.0', 'strokes.0', 'cornerRadius', 'opacity', 'layoutGap', 'padding', …
    this.styleRefs = null;         // {fill|text|effect: styleId} — linked styles update every user
    this.varModes = null;          // {collectionId: modeId} — e.g. a frame set to Dark

    // Vectors
    this.points = []; // pen/pencil: [{x, y, cx1?, cy1?, cx2?, cy2?}] relative to x/y
    this.closedPath = type !== 'path';
    this.fillRule = 'nonzero'; // nonzero | evenodd
    this.polygonSides = 3;
    this.starPoints = 5;
    this.svgPath = null;   // imported SVG path data
    this.svgMatrix = null; // [a,b,c,d,e,f] applied before svgBox normalisation
    this.svgBox = null;    // {x,y,w,h} source bounds of svgPath

    // Images
    this.assetId = null;
    this.imageDataUrl = null; // legacy (v2 files)

    // Typography
    this.text = type === 'text' ? 'Text' : '';
    this.fontSize = 16;
    this.fontFamily = DEFAULT_FONT;
    this.fontWeight = 400;
    this.textAlign = 'left';
    this.lineHeight = 0; // 0 = auto (1.3em)
    this.letterSpacing = 0;
    this.textAutoResize = 'width'; // width | height | none

    // Prototype
    this.interactions = [];
    // v3.13.0 lines & arrows: heads on either end, dash, curve, head size
    if (type === 'line' || type === 'arrow') Object.assign(this, { arrowStart: 'none', arrowEnd: type === 'arrow' ? 'triangle' : 'none', lineDash: 'solid', lineBend: 0, arrowSize: 1 });
  }

  get isContainer() { return CONTAINER_TYPES.has(this.type); }

  toJSON() {
    const o = {};
    for (const k of Object.keys(this)) if (k !== 'imageElement') o[k] = this[k];
    return o;
  }

  static fromJSON(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = typeof raw.type === 'string' ? raw.type : 'rect';
    const el = new StudioElement(type);
    for (const key of Object.keys(el)) {
      if (!(key in raw) || key === 'type') continue;
      const tmpl = el[key], v = raw[key];
      if (typeof tmpl === 'number') el[key] = Utils.num(v, tmpl);
      else if (typeof tmpl === 'boolean') el[key] = !!v;
      else if (typeof tmpl === 'string') el[key] = v == null ? tmpl : String(v);
      else if (Array.isArray(tmpl)) el[key] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : tmpl;
      else if (tmpl === null) el[key] = (v === null || ['string', 'object', 'number'].includes(typeof v)) ? JSON.parse(JSON.stringify(v ?? null)) : null;
      else if (typeof tmpl === 'object') el[key] = Object.assign({}, tmpl, typeof v === 'object' && v ? v : {});
    }
    if (typeof raw.id === 'string' && raw.id) el.id = raw.id;
    if (typeof raw.lineHeight === 'number' && raw.lineHeight > 0) el.lineHeight = raw.lineHeight;
    StudioElement.sanitize(el);
    return el;
  }

  /** Clamp / repair everything that ends up in canvas, CSS or HTML. */
  static sanitize(el) {
    el.name = String(el.name).slice(0, 200);
    el.fills = (el.fills || []).filter(f => f && typeof f === 'object').map(f => ({
      type: ['solid', 'linear', 'radial'].includes(f.type) ? f.type : 'solid',
      color: Utils.safeColor(f.color, '#cccccc'),
      opacity: Utils.clamp(Utils.num(f.opacity, 1), 0, 1),
      angle: Utils.num(f.angle, 90),
      visible: f.visible !== false,
      stops: (Array.isArray(f.stops) && f.stops.length >= 2 ? f.stops : [{ pos: 0, color: f.color1 || f.color || '#0d99ff' }, { pos: 1, color: f.color2 || '#9747ff' }])
        .map(s => ({ pos: Utils.clamp(Utils.num(s.pos, 0), 0, 1), color: Utils.safeColor(s.color, '#000000') }))
    }));
    el.strokes = (el.strokes || []).filter(s => s && typeof s === 'object').map(s => ({
      color: Utils.safeColor(s.color, '#ffffff'),
      width: Utils.clamp(Utils.num(s.width, 1), 0, 500),
      align: ['inside', 'center', 'outside'].includes(s.align) ? s.align : 'center',
      visible: s.visible !== false
    }));
    el.effects = (el.effects || []).filter(e => e && typeof e === 'object').map(e => ({
      type: ['dropShadow', 'innerShadow', 'layerBlur', 'backgroundBlur'].includes(e.type) ? e.type : 'dropShadow',
      x: Utils.num(e.x, 0), y: Utils.num(e.y, 4), blur: Utils.clamp(Utils.num(e.blur, 8), 0, 500), spread: Utils.num(e.spread, 0),
      color: Utils.safeColor(e.color, 'rgba(0,0,0,0.4)'), visible: e.visible !== false
    }));
    el.layoutGrids = (el.layoutGrids || []).filter(g => g && typeof g === 'object').map(g => ({
      type: ['columns', 'rows', 'grid'].includes(g.type) ? g.type : 'columns',
      count: Utils.clamp(Math.round(Utils.num(g.count, 12)), 1, 48), gutter: Utils.num(g.gutter, 20), margin: Utils.num(g.margin, 20),
      size: Utils.num(g.size, 8), color: Utils.safeColor(g.color, 'rgba(255,0,0,0.1)'), visible: g.visible !== false
    }));
    el.points = (el.points || []).filter(p => p && typeof p === 'object').map(p => {
      const o = { x: Utils.num(p.x), y: Utils.num(p.y) };
      if (p.cx1 !== undefined) Object.assign(o, { cx1: Utils.num(p.cx1), cy1: Utils.num(p.cy1), cx2: Utils.num(p.cx2), cy2: Utils.num(p.cy2) });
      return o;
    });
    el.interactions = (el.interactions || []).filter(i => i && typeof i === 'object').map(i => {
      const one = (v, list, d) => (list.includes(v) ? v : d);
      // v3.6 → v3.7: 'slide' / 'push' were left-moving animations
      let tr = i.transition, dir = i.direction;
      if (tr === 'slide') { tr = 'slideIn'; dir = dir || 'left'; }
      return {
        trigger: one(i.trigger, ['click', 'hover', 'drag', 'delay', 'press', 'key', 'mouseEnter', 'mouseLeave'], 'click'),
        action: one(i.action, ['navigate', 'changeTo', 'back', 'scrollTo', 'url', 'overlay', 'swapOverlay', 'closeOverlay', 'fire', 'set'], 'navigate'),
        inputId: typeof i.inputId === 'string' ? i.inputId : null,
        value: typeof i.value === 'boolean' ? i.value : Utils.num(i.value, 1),
        targetId: typeof i.targetId === 'string' ? i.targetId : null,
        url: typeof i.url === 'string' ? (/^(https?:\/\/|mailto:)/i.test(i.url.trim()) ? i.url.trim().slice(0, 2000) : '') : '',
        newTab: i.newTab !== false,
        transition: one(tr, ['instant', 'dissolve', 'smart', 'moveIn', 'moveOut', 'push', 'slideIn', 'slideOut'], 'dissolve'),
        direction: one(dir, ['left', 'right', 'up', 'down'], 'left'),
        easing: one(i.easing, ['easeOut', 'easeIn', 'easeInOut', 'linear', 'easeInBack', 'easeOutBack', 'gentle', 'quick', 'bouncy', 'slow'], 'easeOut'),
        duration: Utils.clamp(Utils.num(i.duration, 300), 0, 5000),
        delay: Utils.clamp(Utils.num(i.delay, 800), 0, 60000),
        key: typeof i.key === 'string' && i.key ? i.key.slice(0, 20) : 'Enter',
        overlayPos: one(i.overlayPos, ['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'], 'center'),
        closeOutside: i.closeOutside !== false,
        overlayBg: i.overlayBg !== false,
        preserveScroll: !!i.preserveScroll
      };
    });
    if (!Array.isArray(el.overrides)) el.overrides = [];
    el.overrides = el.overrides.filter(o => typeof o === 'string');
    el.componentProps = (Array.isArray(el.componentProps) ? el.componentProps : []).filter(d => d && ['text', 'boolean', 'swap'].includes(d.type)).map(d => { const layers = (Array.isArray(d.layers) ? d.layers : [d.layer]).filter(x => typeof x === 'string' && x).map(String).slice(0, 50); const ids = (Array.isArray(d.ids) ? d.ids : []).map(x => (x ? String(x) : '')).slice(0, layers.length); return { id: String(d.id || Utils.uid('cp')), name: String(d.name || 'Property').slice(0, 60), type: d.type, layers, ids, layer: layers[0] || '', def: ['string', 'boolean'].includes(typeof d.def) ? d.def : (d.type === 'boolean' ? true : '') }; });
    el.propValues = el.propValues && typeof el.propValues === 'object' && !Array.isArray(el.propValues) ? Object.fromEntries(Object.entries(el.propValues).filter(([, v]) => ['string', 'boolean'].includes(typeof v)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 5000) : v])) : null;
    el.description = String(el.description || '').slice(0, 2000);
    const strMap = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v === 'string' && k.length < 40).slice(0, 40)) : null);
    el.bindings = strMap(el.bindings); if (el.bindings && !Object.keys(el.bindings).length) el.bindings = null;
    el.styleRefs = strMap(el.styleRefs); if (el.styleRefs && !Object.keys(el.styleRefs).length) el.styleRefs = null;
    el.varModes = strMap(el.varModes); if (el.varModes && !Object.keys(el.varModes).length) el.varModes = null;
    if (typeof el.svgPath !== 'string') el.svgPath = null;
    if (!(Array.isArray(el.svgMatrix) && el.svgMatrix.length === 6)) el.svgMatrix = null;
    if (!(el.svgBox && typeof el.svgBox === 'object')) el.svgBox = null;
    if (typeof el.imageDataUrl === 'string' && !el.imageDataUrl.startsWith('data:image/')) el.imageDataUrl = null;
    if (!['width', 'height', 'none'].includes(el.textAutoResize)) el.textAutoResize = 'height';
    if (el.fillRule !== 'evenodd') el.fillRule = 'nonzero';
    if (!el.constraints || typeof el.constraints !== 'object') el.constraints = { horizontal: 'left', vertical: 'top' };
    el.opacity = Utils.clamp(el.opacity, 0, 1);
    el.width = Math.max(0, el.width); el.height = Math.max(0, el.height);
    return el;
  }
}

/**
 * v3.32 — deduplicated undo snapshots. A snapshot is split into content-defined chunks at JSON object boundaries
 * ("},{"); identical chunks are stored once and shared by every undo step that contains them (reference-counted).
 * Editing one layer of a 5,000-layer document therefore costs ~one chunk per undo step instead of a full copy.
 */
class SnapChunks {
  constructor() { this.map = new Map(); this.chars = 0; }
  pack(json) {
    const MIN = 2048, MAX = 65536, L = json.length, out = [];
    let i = 0;
    while (i < L) {
      let j = L;
      if (L - i > MIN) {
        let p = json.indexOf('},{', i + MIN);
        j = L;
        while (p !== -1) {
          if (p - i >= MAX) { j = p + 2; break; }
          let h = 0; for (let k = p + 3, e = Math.min(L, p + 27); k < e; k++) h = (h * 31 + json.charCodeAt(k)) | 0;
          if ((h & 7) === 0) { j = p + 2; break; }
          p = json.indexOf('},{', p + 3);
        }
      }
      const part = json.slice(i, j);
      let e = this.map.get(part);
      if (!e) { const flat = JSON.parse(JSON.stringify(part)); e = { s: flat, n: 0 }; this.map.set(flat, e); this.chars += flat.length; } // flat copy: never pin the big source string
      e.n++; out.push(e.s); i = j;
    }
    return out;
  }
  unpack(c) { return c.length === 1 ? c[0] : c.join(''); }
  release(c) { if (!c) return; for (const x of c) { const e = this.map.get(x); if (e && --e.n <= 0) { this.map.delete(x); this.chars -= x.length; } } }
  clear() { this.map.clear(); this.chars = 0; }
}

class StudioModel {
  constructor() {
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 100;                    // v3.32: user setting, 10–100 (Settings › Undo)
    this.maxHistoryChars = 400 * 1048576;     // v3.32: safety limit for undo memory (Settings › Undo); keeps ≥ 10 steps
    this._snaps = new SnapChunks();
    this.listeners = [];
    this.reset();
  }

  reset() {
    this.pages = [{ id: 'page_1', name: 'Page 1', elements: [], bg: '#1a1a2e' }];
    this.currentPageId = 'page_1';
    this.selectedIds = new Set();
    this.hoveredId = null;
    this.assets = {};
    this.variables = StudioModel.defaultVariables();
    this.dsReleases = [];
    this.handovers = []; // v3.35 developer handover commits (frozen copies of committed designs)
    this.styles = {
      colors: [
        { id: 'c_brand', name: 'Brand Primary', color: '#0d99ff' },
        { id: 'c_purple', name: 'Accent Purple', color: '#9747ff' },
        { id: 'c_dark', name: 'Dark Surface', color: '#181820' }
      ],
      texts: [
        { id: 't_h1', name: 'Display Heading', fontFamily: DEFAULT_FONT, fontSize: 32, fontWeight: 700, lineHeight: 40, letterSpacing: 0 },
        { id: 't_body', name: 'Body Regular', fontFamily: DEFAULT_FONT, fontSize: 14, fontWeight: 400, lineHeight: 20, letterSpacing: 0 }
      ],
      effects: [
        { id: 'e_shadow', name: 'Card Elevation', effects: [{ type: 'dropShadow', x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.4)', visible: true }] }
      ]
    };
    this.zoom = 1; this.panX = 140; this.panY = 90;
    this.activeTool = 'select';
    this.showGrid = true;
    this.snapToGuides = true;
    this.showRulers = true;
    this.gridSize = 20;
    this.activeGuides = [];
    // Rive-style: several named animations (timelines); the editor works on the active one
    this.animations = [StudioModel.newAnimation('Timeline 1', { duration: 5 })];
    this.activeAnimationId = this.animations[0].id;
    this.animationTimeline = this.makeTimelineView();
    // Global inputs (Boolean / Number / Trigger) shared by every state machine, prototype and section
    this.inputs = [];
    this.stateMachines = [];
    this.comments = [];        // v3.4.0 review comments (pins), saved with the project
    this.links = [];           // v3.17.0 dynamic links between Design, Media and 3D
    this.triggers = [];        // v3.5.0 event → condition → action triggers (Design, 3D, exports)
    this.animApplied = {};
    this.prototypeSettings = { startingFrameId: null, flowName: 'Flow 1', device: 'iphone', canvasBg: '#0e0e12', showHints: true };
  }

  // ------------------------------------------------------------- Animations / state machines
  static newAnimation(name, opts = {}) {
    return { id: Utils.uid('anim'), name, duration: opts.duration || 2, fps: opts.fps || 60, loop: opts.loop || 'loop', tracks: opts.tracks || {} };
  }
  get activeAnimation() { return this.animations.find(a => a.id === this.activeAnimationId) || this.animations[0]; }
  /** Editor-facing view of the active animation (keeps older code paths working). */
  makeTimelineView() {
    const m = this;
    const view = { currentTime: 0, isPlaying: false, playbackSpeed: 1, isRecording: false, onionSkinning: false };
    Object.defineProperties(view, {
      tracks: { get: () => m.activeAnimation.tracks, set: (v) => { m.activeAnimation.tracks = v; }, enumerable: true },
      duration: { get: () => m.activeAnimation.duration, set: (v) => { m.activeAnimation.duration = v; }, enumerable: true },
      fps: { get: () => m.activeAnimation.fps, set: (v) => { m.activeAnimation.fps = v; }, enumerable: true },
      loop: { get: () => m.activeAnimation.loop, set: (v) => { m.activeAnimation.loop = v; }, enumerable: true },
      isLooping: { get: () => m.activeAnimation.loop !== 'oneShot', set: (v) => { m.activeAnimation.loop = v ? 'loop' : 'oneShot'; }, enumerable: true }
    });
    return view;
  }
  /** Keep only well-formed triggers with known events / actions (files may come from anywhere). */
  /** Starter tokens: a Light/Dark semantic collection (shown in Design system › Variables). */
  static defaultVariables() {
    const L = 'm_light', D = 'm_dark';
    const c = (id, name, l, d) => ({ id, collectionId: 'vc_tokens', name, type: 'color', description: '', values: { [L]: l, [D]: d } });
    const n = (id, name, v) => ({ id, collectionId: 'vc_tokens', name, type: 'number', description: '', values: { [L]: v, [D]: v } });
    return {
      collections: [{ id: 'vc_tokens', name: 'Tokens', modes: [{ id: L, name: 'Light' }, { id: D, name: 'Dark' }], defaultModeId: L }],
      vars: [
        c('v_bg', 'color/background', '#ffffff', '#121218'), c('v_surface', 'color/surface', '#f4f5f7', '#1e1e26'),
        c('v_text', 'color/text', '#111118', '#f2f2f5'), c('v_text2', 'color/text-muted', '#5c5f6a', '#a0a3ad'),
        c('v_primary', 'color/primary', '#0d99ff', '#33a9ff'), c('v_border', 'color/border', '#e1e3e8', '#33333d'),
        n('v_r_sm', 'radius/sm', 4), n('v_r_md', 'radius/md', 8), n('v_r_lg', 'radius/lg', 16),
        n('v_s_sm', 'space/sm', 8), n('v_s_md', 'space/md', 16), n('v_s_lg', 'space/lg', 24)
      ]
    };
  }
  static sanitizeVariables(src) {
    const out = { collections: [], vars: [] };
    const cols = Array.isArray(src?.collections) ? src.collections : [];
    for (const c of cols.slice(0, 50)) {
      if (!c || typeof c !== 'object') continue;
      const modes = (Array.isArray(c.modes) ? c.modes : []).filter(m => m && typeof m.id === 'string').slice(0, 20).map(m => ({ id: m.id, name: String(m.name || 'Mode').slice(0, 60) }));
      if (!modes.length) modes.push({ id: Utils.uid('m'), name: 'Default' });
      out.collections.push({ id: String(c.id || Utils.uid('vc')), name: String(c.name || 'Collection').slice(0, 80), modes, defaultModeId: modes.some(m => m.id === c.defaultModeId) ? c.defaultModeId : modes[0].id });
    }
    const colIds = new Set(out.collections.map(c => c.id));
    for (const v of (Array.isArray(src?.vars) ? src.vars : []).slice(0, 5000)) {
      if (!v || typeof v !== 'object' || !colIds.has(v.collectionId)) continue;
      const type = ['color', 'number', 'string', 'boolean'].includes(v.type) ? v.type : 'string';
      const values = {};
      for (const [k, x] of Object.entries(v.values || {})) {
        if (x && typeof x === 'object' && typeof x.alias === 'string') values[k] = { alias: x.alias };
        else if (type === 'color') values[k] = Utils.parseColor(x) ? String(x) : '#000000';
        else if (type === 'number') values[k] = Utils.num(x, 0);
        else if (type === 'boolean') values[k] = !!x;
        else values[k] = String(x ?? '').slice(0, 2000);
      }
      out.vars.push({ id: String(v.id || Utils.uid('v')), collectionId: v.collectionId, name: String(v.name || 'variable').slice(0, 120), type, description: String(v.description || '').slice(0, 500), values });
    }
    return out;
  }
  static sanitizeTriggers(list) {
    if (!Array.isArray(list)) return [];
    const evOk = (typeof TRIGGER_EVENTS !== 'undefined') ? (k) => k in TRIGGER_EVENTS : () => true;
    const acOk = (typeof TRIGGER_ACTIONS !== 'undefined') ? (k) => k in TRIGGER_ACTIONS : () => true;
    const plain = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)));
    return list.filter(t => t && typeof t === 'object' && t.event && evOk(t.event.type) && ['design', '3d'].includes(t.scope)).map(t => ({
      id: typeof t.id === 'string' ? t.id : Utils.uid('trg'), name: typeof t.name === 'string' ? t.name.slice(0, 120) : '', scope: t.scope,
      target: typeof t.target === 'string' ? t.target : null, owner: typeof t.owner === 'string' ? t.owner : null, enabled: t.enabled !== false, once: !!t.once, cooldown: Math.max(0, Number(t.cooldown) || 0),
      event: plain(t.event),
      conditions: Array.isArray(t.conditions) ? t.conditions.filter(c => c && typeof c.inputId === 'string').map(plain) : [],
      actions: Array.isArray(t.actions) ? t.actions.filter(a => a && acOk(a.type)).map(plain) : []
    }));
  }
  static get COMPONENT_SKIP() { return new Set(['id', 'x', 'y', 'parentId', 'isComponentMaster', 'isComponentInstance', 'isComponentSet', 'masterComponentId', 'masterChildId', 'overrides', 'locked', 'constraints', 'componentProps', 'propValues', 'description', 'varModes']); }
  static newStateMachine(name, firstAnimationId) {
    const entry = { id: Utils.uid('st'), type: 'entry', name: 'Entry', x: 20, y: 20 };
    const any = { id: Utils.uid('st'), type: 'any', name: 'Any State', x: 20, y: 92 };
    const exit = { id: Utils.uid('st'), type: 'exit', name: 'Exit', x: 180, y: 92 };
    const states = [entry, any, exit];
    const transitions = [];
    if (firstAnimationId) {
      const s1 = { id: Utils.uid('st'), type: 'animation', name: 'Idle', animationId: firstAnimationId, x: 180, y: 20, speed: 1 };
      states.push(s1);
      transitions.push({ id: Utils.uid('tr'), from: entry.id, to: s1.id, conditions: [], duration: 0, exitTime: 0 });
    }
    return { id: Utils.uid('sm'), name, layers: [{ id: Utils.uid('ly'), name: 'Layer 1', states, transitions }], listeners: [] };
  }

  // ------------------------------------------------------------- Pages
  get page() { return this.pages.find(p => p.id === this.currentPageId) || this.pages[0]; }
  get elements() { return this.page ? this.page.elements : []; }
  set elements(list) { if (this.page) this.page.elements = list; }
  allElements() { return this.pages.flatMap(p => p.elements); }

  // ------------------------------------------------------------- Tree helpers
  getElementById(id) { return id ? this.elements.find(el => el.id === id) || null : null; }
  findAnywhere(id) {
    for (const p of this.pages) { const el = p.elements.find(e => e.id === id); if (el) return el; }
    return null;
  }
  pageOf(id) { return this.pages.find(p => p.elements.some(e => e.id === id)) || null; }
  parentOf(el) { return el && el.parentId ? this.getElementById(el.parentId) : null; }
  childrenOf(id, list = this.elements) { return list.filter(e => e.parentId === id); }
  roots(list = this.elements) {
    const ids = new Set(list.map(e => e.id));
    return list.filter(e => !e.parentId || !ids.has(e.parentId));
  }
  buildTree(list = this.elements) {
    const ids = new Set(list.map(e => e.id));
    const map = new Map([[null, []]]);
    for (const el of list) {
      const key = el.parentId && ids.has(el.parentId) ? el.parentId : null;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(el);
    }
    return map;
  }
  descendantsOf(id, list = this.elements) {
    const out = [];
    const walk = (pid) => { for (const c of list) if (c.parentId === pid) { out.push(c); walk(c.id); } };
    walk(id);
    return out;
  }
  ancestorsOf(el) {
    const out = [];
    let p = this.parentOf(el);
    while (p && out.length < 64) { out.push(p); p = this.parentOf(p); }
    return out;
  }
  isAncestor(ancestorId, el) { return this.ancestorsOf(el).some(a => a.id === ancestorId); }
  isEffectivelyLocked(el) { return el.locked || this.ancestorsOf(el).some(a => a.locked); }
  isEffectivelyVisible(el) { return el.visible && this.ancestorsOf(el).every(a => a.visible); }
  depthOf(el) { return this.ancestorsOf(el).length; }
  /** Index right after the last descendant of `id` (insert position for a new top child). */
  insertIndexInto(id) {
    if (!id) return this.elements.length;
    const desc = new Set(this.descendantsOf(id).map(e => e.id));
    desc.add(id);
    let idx = -1;
    this.elements.forEach((e, i) => { if (desc.has(e.id)) idx = i; });
    return idx + 1;
  }
  insertElement(el, parentId = null) {
    el.parentId = parentId;
    this.elements.splice(this.insertIndexInto(parentId), 0, el);
    return el;
  }

  // ------------------------------------------------------------- Selection
  getSelectedElements() { return this.elements.filter(el => this.selectedIds.has(el.id)); }
  /** Selected elements without those whose ancestor is also selected. */
  topSelected() {
    const sel = this.getSelectedElements();
    return sel.filter(el => !this.ancestorsOf(el).some(a => this.selectedIds.has(a.id)));
  }
  select(ids) { this.selectedIds = new Set(ids.filter(Boolean)); }
  pruneSelection() {
    const ids = new Set(this.elements.map(e => e.id));
    for (const id of [...this.selectedIds]) if (!ids.has(id)) this.selectedIds.delete(id);
  }

  // ------------------------------------------------------------- History
  snapshot() {
    return JSON.stringify({
      pages: this.pages, currentPageId: this.currentPageId,
      selectedIds: [...this.selectedIds], styles: this.styles,
      // 3D keyframes (o3_ tracks) belong to the 3D section's own history (UX-03)
      animations: this.animations.map(a => ({ ...a, tracks: Object.fromEntries(Object.entries(a.tracks).filter(([k]) => !String(k).startsWith('o3_'))) })),
      activeAnimationId: this.activeAnimationId, inputs: this.inputs, stateMachines: this.stateMachines,
      triggers: (this.triggers || []).filter(t => t.scope !== '3d').map(({ open, ...t }) => t), // 3D triggers: 3D history
      prototypeSettings: this.prototypeSettings,
      variables: this.variables
    });
  }
  resetHistory() { this._snaps = new SnapChunks(); this.history = [this._snaps.pack(this.snapshot())]; this.historyLabels = ['Start']; this.historyIndex = 0; this.historyChars = this._snaps.chars; }
  /** The JSON of undo step i (snapshots are stored as shared chunks). */
  historyAt(i) { const h = this.history[i]; return h == null ? null : (typeof h === 'string' ? h : this._snaps.unpack(h)); }
  recordSnapshot(label = 'Edit') {
    const snap = this.snapshot();
    if (this.historyAt(this.historyIndex) === snap) return false;
    for (const h of this.history.slice(this.historyIndex + 1)) this._snaps.release(h); // drop the redo branch
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.historyLabels = (this.historyLabels || []).slice(0, this.historyIndex + 1);
    this.history.push(this._snaps.pack(snap)); this.historyLabels.push(label);
    this.trimHistory();
    this.historyIndex = this.history.length - 1;
    return true;
  }
  /** Apply the undo limits (steps and memory) — also called when the user changes them in Settings. */
  trimHistory() {
    const max = Math.max(1, Math.min(100, Math.round(this.maxHistory) || 100));
    let trimmed = 0;
    while (this.history.length > max) { this._snaps.release(this.history.shift()); this.historyLabels.shift(); trimmed++; }
    while (this._snaps.chars > this.maxHistoryChars && this.history.length > 10) { this._snaps.release(this.history.shift()); this.historyLabels.shift(); trimmed++; }
    this.historyIndex = Math.min(this.historyIndex, this.history.length - 1);
    if (trimmed && this.historyIndex < 0) this.historyIndex = this.history.length - 1;
    this.historyChars = this._snaps.chars;
    if (trimmed && this._snaps.chars > this.maxHistoryChars * 0.9 && !this._histTrimNoted && typeof DSDiag !== 'undefined') { this._histTrimNoted = true; DSDiag.info('history', `Undo memory limit reached: keeping ${this.history.length} steps (${Math.round(this.maxHistoryChars / 1048576)} MB limit, Settings › Undo)`); }
  }
  /** Name of the step Undo / Redo would revert or re-apply (shown in menus and feedback). */
  undoLabel() { return this.canUndo() ? (this.historyLabels?.[this.historyIndex] || 'Edit') : null; }
  redoLabel() { return this.canRedo() ? (this.historyLabels?.[this.historyIndex + 1] || 'Edit') : null; }
  canUndo() { return this.historyIndex > 0; }
  canRedo() { return this.historyIndex < this.history.length - 1; }
  undo() { if (!this.canUndo()) return false; this.historyIndex--; this.restoreSnapshot(this.historyAt(this.historyIndex)); return true; }
  redo() { if (!this.canRedo()) return false; this.historyIndex++; this.restoreSnapshot(this.historyAt(this.historyIndex)); return true; }
  restoreSnapshot(json) {
    const snap = JSON.parse(json);
    this.pages = snap.pages.map(p => ({ ...p, elements: p.elements.map(e => StudioElement.fromJSON(e)).filter(Boolean) }));
    this.currentPageId = this.pages.some(p => p.id === snap.currentPageId) ? snap.currentPageId : this.pages[0].id;
    this.selectedIds = new Set(snap.selectedIds || []);
    this.pruneSelection();
    if (snap.styles) this.styles = snap.styles;
    if (snap.animations) {
      // keep 3D keyframes and animations made in the 3D section untouched by Design undo (UX-03)
      const o3 = new Map(this.animations.map(a => [a.id, Object.entries(a.tracks).filter(([k]) => String(k).startsWith('o3_'))]));
      const only3D = this.animations.filter(a => !snap.animations.some(b => b.id === a.id) && Object.keys(a.tracks).length && Object.keys(a.tracks).every(k => String(k).startsWith('o3_')));
      this.animations = [...snap.animations, ...only3D];
      for (const a of this.animations) for (const [k, v] of (o3.get(a.id) || [])) a.tracks[k] = v;
      this.activeAnimationId = this.animations.some(a => a.id === snap.activeAnimationId) ? snap.activeAnimationId : this.animations[0].id;
    }
    if (snap.inputs) this.inputs = snap.inputs;
    if (snap.stateMachines) this.stateMachines = snap.stateMachines;
    if (snap.triggers) this.triggers = [...snap.triggers, ...(this.triggers || []).filter(t => t.scope === '3d')];
    if (snap.prototypeSettings) this.prototypeSettings = snap.prototypeSettings;
    if (snap.variables) this.variables = snap.variables;
    this.animApplied = {};
    this.primeComponentCache(); // QA-18
  }
  /** Layers were rebuilt (undo / redo / open): re-learn their synced values so the next edit to an instance
   *  layer is recognised as an override instead of being overwritten by its main component. */
  primeComponentCache() {
    this._syncCache = new WeakMap();
    try { this.applyDesignSystem?.('pre'); this.syncComponents(); this.applyDesignSystem?.('post'); } catch (e) { console.warn('[components] prime', e); }
  }

  // ------------------------------------------------------------- Structure ops
  deleteElements(ids) {
    const kill = new Set();
    for (const id of ids) { kill.add(id); this.descendantsOf(id).forEach(d => kill.add(d.id)); }
    this.elements = this.elements.filter(e => !kill.has(e.id));
    this.triggers = (this.triggers || []).filter(t => !kill.has(t.target));
    for (const id of kill) { for (const a of this.animations) delete a.tracks[id]; this.selectedIds.delete(id); }
    for (const sm of this.stateMachines) sm.listeners = sm.listeners.filter(l => !kill.has(l.targetId));
    if (kill.has(this.prototypeSettings.startingFrameId)) this.prototypeSettings.startingFrameId = null;
    return kill.size;
  }

  /** Re-order selected siblings. mode: front | back | forward | backward */
  reorder(mode) {
    const sel = this.topSelected();
    if (!sel.length) return false;
    const byParent = new Map();
    for (const el of sel) { if (!byParent.has(el.parentId)) byParent.set(el.parentId, []); byParent.get(el.parentId).push(el); }
    let changed = false;
    for (const [pid, moving] of byParent) {
      const list = this.elements;
      const siblings = list.filter(e => pid ? e.parentId === pid : (!e.parentId || !this.getElementById(e.parentId)));
      const movingIds = new Set(moving.map(e => e.id));
      let order = siblings.slice();
      if (mode === 'front') order = order.filter(e => !movingIds.has(e.id)).concat(moving);
      else if (mode === 'back') order = moving.concat(order.filter(e => !movingIds.has(e.id)));
      else if (mode === 'forward') {
        for (let i = order.length - 2; i >= 0; i--) if (movingIds.has(order[i].id) && !movingIds.has(order[i + 1].id)) [order[i], order[i + 1]] = [order[i + 1], order[i]];
      } else if (mode === 'backward') {
        for (let i = 1; i < order.length; i++) if (movingIds.has(order[i].id) && !movingIds.has(order[i - 1].id)) [order[i], order[i - 1]] = [order[i - 1], order[i]];
      }
      // write siblings back into their original slots
      const slots = [];
      list.forEach((e, i) => { if (siblings.includes(e)) slots.push(i); });
      const newList = list.slice();
      slots.forEach((slot, i) => { if (newList[slot] !== order[i]) changed = true; newList[slot] = order[i]; });
      this.elements = newList;
    }
    return changed;
  }

  /** Move element (and its subtree) to a new parent, placed on top of the new siblings. */
  reparent(el, newParentId, beforeId = null) {
    const subtree = [el, ...this.descendantsOf(el.id)];
    const ids = new Set(subtree.map(e => e.id));
    let list = this.elements.filter(e => !ids.has(e.id));
    el.parentId = newParentId;
    this.elements = list;
    let idx;
    if (beforeId) {
      idx = list.findIndex(e => e.id === beforeId);
      if (idx < 0) idx = this.insertIndexInto(newParentId);
    } else idx = this.insertIndexInto(newParentId);
    const ordered = this.elements.slice();
    ordered.splice(idx, 0, ...subtree.sort((a, b) => this.depthIn(subtree, a) - this.depthIn(subtree, b)));
    this.elements = ordered;
  }
  depthIn(list, el) { let d = 0; let p = list.find(e => e.id === el.parentId); while (p && d < 64) { d++; p = list.find(e => e.id === p.parentId); } return d; }

  /** Groups size themselves to their children (deepest first). */
  updateGroupBounds() {
    const groups = this.elements.filter(e => e.type === 'group');
    groups.sort((a, b) => this.depthOf(b) - this.depthOf(a));
    for (const g of groups) {
      const kids = this.childrenOf(g.id);
      if (!kids.length) continue;
      const b = Utils.unionBounds(kids.map(k => Utils.aabb(k)));
      g.x = b.x; g.y = b.y; g.width = b.w; g.height = b.h; g.rotation = 0;
    }
  }
  removeEmptyGroups() {
    let removed = false;
    for (const g of this.elements.filter(e => e.type === 'group')) {
      if (!this.childrenOf(g.id).length) { this.deleteElements([g.id]); removed = true; }
    }
    return removed;
  }

  // ------------------------------------------------------------- Auto layout
  computeAutoLayout() {
    const frames = this.elements.filter(e => e.type === 'frame' && e.isAutoLayout);
    frames.sort((a, b) => this.depthOf(b) - this.depthOf(a)); // inner first so hug sizes propagate
    for (const frame of frames) this.layoutFrame(frame);
  }
  layoutFrame(frame) {
    const kids = this.childrenOf(frame.id).filter(e => e.visible);
    const isH = frame.layoutDirection === 'horizontal';
    const gap = frame.layoutGap || 0;
    const pl = frame.layoutPaddingLeft, pt = frame.layoutPaddingTop, pr = frame.layoutPaddingRight, pb = frame.layoutPaddingBottom;
    const align = frame.layoutAlign || 'top-left';
    const [vAlign, hAlign] = align === 'center' ? ['center', 'center'] : align.split('-');
    const mainSize = kids.reduce((s, k) => s + (isH ? k.width : k.height), 0) + gap * Math.max(0, kids.length - 1);
    const crossMax = kids.reduce((m, k) => Math.max(m, isH ? k.height : k.width), 0);

    if (frame.primarySizing === 'hug') { if (isH) frame.width = Math.max(1, mainSize + pl + pr); else frame.height = Math.max(1, mainSize + pt + pb); }
    if (frame.counterSizing === 'hug') { if (isH) frame.height = Math.max(1, crossMax + pt + pb); else frame.width = Math.max(1, crossMax + pl + pr); }

    const innerW = frame.width - pl - pr, innerH = frame.height - pt - pb;
    const mainAlign = isH ? hAlign : vAlign;
    const free = (isH ? innerW : innerH) - mainSize;
    let offset = mainAlign === 'center' ? free / 2 : (mainAlign === 'right' || mainAlign === 'bottom') ? free : 0;
    for (const k of kids) {
      const dxOld = k.x, dyOld = k.y;
      if (frame.counterSizing === 'fill') { if (isH) k.height = Math.max(1, innerH); else k.width = Math.max(1, innerW); }
      if (isH) {
        k.x = frame.x + pl + offset;
        k.y = frame.y + pt + (vAlign === 'center' ? (innerH - k.height) / 2 : vAlign === 'bottom' ? innerH - k.height : 0);
        offset += k.width + gap;
      } else {
        k.y = frame.y + pt + offset;
        k.x = frame.x + pl + (hAlign === 'center' ? (innerW - k.width) / 2 : hAlign === 'right' ? innerW - k.width : 0);
        offset += k.height + gap;
      }
      k.x = Math.round(k.x * 100) / 100; k.y = Math.round(k.y * 100) / 100;
      const ddx = k.x - dxOld, ddy = k.y - dyOld;
      if (ddx || ddy) for (const d of this.descendantsOf(k.id)) { d.x += ddx; d.y += ddy; }
    }
  }

  // ------------------------------------------------------------- Components
  masters() { return this.allElements().filter(e => e.isComponentMaster); }
  /**
   * Figma-style instance sync (v3.6.0).
   * - Any property you change on an instance (or a layer inside it) becomes an override automatically
   *   (detected against the value the last sync wrote), so it survives later edits of the main component.
   * - Instance layers follow the main component's structure; their geometry is laid out from the main's
   *   constraints when the instance is resized. Visibility, name, text, fills… are overridable.
   * - Component properties (text / boolean / instance swap) and swapped nested instances are applied.
   */
  /** v3.10: component properties follow renamed / moved layers (bound by id, addressed by path) and mirror the main's value as default. */
  propRoot(owner, list) { return owner.isComponentSet ? list.find(e => e.parentId === owner.id && e.isComponentMaster) || null : owner; }
  refreshPropBindings() {
    for (const page of this.pages) for (const owner of page.elements) {
      if (!owner.componentProps?.length || !(owner.isComponentMaster || owner.isComponentSet)) continue;
      const list = page.elements, root = this.propRoot(owner, list); if (!root) continue;
      for (const d of owner.componentProps) {
        if (!Array.isArray(d.layers)) d.layers = d.layer ? [d.layer] : [];
        if (!Array.isArray(d.ids)) d.ids = [];
        d.layers.forEach((path, i) => {
          const byId = d.ids[i] && list.find(e => e.id === d.ids[i]);
          if (byId && this.isInSubtree(byId, root.id, list)) { const np = this.componentPath(root, byId, list); if (np) d.layers[i] = np; }
          else { const byPath = this.componentLayerByPath(root, path, list); d.ids[i] = byPath ? byPath.id : ''; }
        });
        d.layer = d.layers[0] || '';
        const first = d.layers.map(pp => this.componentLayerByPath(root, pp, list)).find(Boolean);
        if (first) d.def = d.type === 'text' ? String(first.text ?? '') : d.type === 'boolean' ? first.visible !== false : (first.masterComponentId || d.def);
      }
    }
  }
  syncComponents() {
    try { this.refreshPropBindings(); } catch (e) { console.warn('[components] bindings', e); }
    const SKIP = StudioModel.COMPONENT_SKIP;
    if (!this._syncCache) this._syncCache = new WeakMap();
    const cache = this._syncCache;
    const json = (v) => JSON.stringify(v);
    const copyProps = (src, dst, { root = false } = {}) => {
      const last = cache.get(dst) || {};
      const next = {};
      for (const k of Object.keys(src)) {
        if (SKIP.has(k) || k === 'imageElement' || k.startsWith('_')) continue;
        if (!root && (k === 'width' || k === 'height')) continue; // child geometry comes from constraints
        if (root && (k === 'width' || k === 'height') && dst.isAutoLayout) {
          const isH = dst.layoutDirection !== 'vertical', main = (k === 'width') === isH;
          if ((main ? dst.primarySizing : dst.counterSizing) === 'hug') continue; // auto layout sizes it, not an override
        }
        if (dst.overrides.includes(k) || this._propOwned?.get(dst)?.has(k)) { next[k] = last[k]; continue; } // QA-19: values a component property controls
        const cur = json(dst[k]);
        if (last[k] !== undefined && cur !== last[k]) { dst.overrides.push(k); next[k] = last[k]; continue; } // edited by the user → override
        const v = src[k], nv = json(v);
        if (cur !== nv) dst[k] = (v && typeof v === 'object') ? JSON.parse(nv) : v;
        next[k] = nv;
      }
      cache.set(dst, next);
    };
    const roots = [];
    for (const page of this.pages) for (const inst of page.elements) if (inst.isComponentInstance && inst.masterComponentId) roots.push([page, inst]);
    // outer instances first; nested ones (inside another instance) after, so swaps of nested instances win
    const depth = (el, list) => { let d = 0, p = el; while (p && p.parentId && d < 64) { p = list.find(e => e.id === p.parentId); d++; } return d; };
    roots.sort((a, b) => depth(a[1], a[0].elements) - depth(b[1], b[0].elements));
    for (const [page, inst] of roots) {
      const master = this.findAnywhere(inst.masterComponentId);
      if (!master || master === inst || this.isInSubtree(master, inst.id, page.elements)) continue;
      const masterPage = this.pageOf(master.id);
      const set = master.parentId ? this.findAnywhere(master.parentId) : null;
      copyProps(set && set.isComponentSet ? Object.assign({}, master, { name: set.name }) : master, inst, { root: true }); // variant instances are named after their set
      this.syncChildren(master, inst, masterPage.elements, page.elements, copyProps);
      this.applyComponentProps(inst, master, page.elements);
    }
  }
  syncChildren(src, dst, srcList, dstList, copyProps) {
    const srcKids = srcList.filter(e => e.parentId === src.id);
    const dstKids = dstList.filter(e => e.parentId === dst.id);
    const keep = new Set();
    const W0 = src.width || 1, H0 = src.height || 1, W1 = dst.width, H1 = dst.height;
    const axis = (mode, pos, size, os, ns) => {
      switch (mode) {
        case 'right': case 'bottom': return [ns - (os - pos), size];
        case 'left-right': case 'top-bottom': return [pos, Math.max(1, size + (ns - os))];
        case 'center': return [pos + (ns - os) / 2, size];
        case 'scale': return [pos * (os ? ns / os : 1), size * (os ? ns / os : 1)];
        default: return [pos, size];
      }
    };
    for (const sk of srcKids) {
      let dk = dstKids.find(d => d.masterChildId === sk.id);
      if (!dk) {
        dk = StudioElement.fromJSON(JSON.parse(JSON.stringify(sk)));
        dk.id = Utils.uid('el'); dk.masterChildId = sk.id; dk.parentId = dst.id;
        dk.isComponentMaster = false; dk.overrides = [];
        const idx = dstList.indexOf(dstKids.length ? dstKids[dstKids.length - 1] : dst);
        dstList.splice(idx + 1, 0, dk);
      }
      keep.add(dk.id);
      const swapped = dk.isComponentInstance && sk.isComponentInstance && dk.masterComponentId !== sk.masterComponentId;
      if (!swapped) copyProps(sk, dk);
      // geometry: main-component offsets, re-laid by constraints when this container differs in size
      const c = sk.constraints || {};
      const [x, w] = axis(c.horizontal, sk.x - src.x, sk.width, W0, W1);
      const [y, h] = axis(c.vertical, sk.y - src.y, sk.height, H0, H1);
      dk.x = dst.x + x; dk.y = dst.y + y;
      if (!(dk.isComponentInstance && dk.overrides.includes('width'))) dk.width = w;
      if (!(dk.isComponentInstance && dk.overrides.includes('height'))) dk.height = h;
      if (dk.type === 'text' && dk.textAutoResize && dk.textAutoResize !== 'none' && (dk.overrides.includes('text') || this._propText?.has(dk)) && typeof TextLayout !== 'undefined') {
        const cx = dk.x + dk.width / 2;
        TextLayout.fit(dk);
        if (c.horizontal === 'center' || sk.textAlign === 'center') dk.x = cx - dk.width / 2;
      }
      if (!swapped) this.syncChildren(sk, dk, srcList, dstList, copyProps);
    }
    for (const dk of dstKids) if (!keep.has(dk.id)) {
      const kill = new Set([dk.id, ...dstList.filter(e => this.isInSubtree(e, dk.id, dstList)).map(e => e.id)]);
      for (let i = dstList.length - 1; i >= 0; i--) if (kill.has(dstList[i].id)) dstList.splice(i, 1);
    }
  }
  /** Layer inside an instance (or main) addressed by its name path from the component root, e.g. "Icon/Glyph". */
  componentLayerByPath(root, path, list) {
    let cur = root;
    for (const part of String(path).split('/').filter(Boolean)) {
      cur = list.find(e => e.parentId === cur.id && e.name === part);
      if (!cur) return null;
    }
    return cur;
  }
  /** The instance's copy of the main-component layer at `path` (follows masterChildId, so renamed layers still match). */
  instanceLayerFor(inst, master, path, list) {
    const mLayer = this.componentLayerByPath(master, path, this.pageOf(master.id)?.elements || list);
    if (!mLayer) return null;
    return this.descendantsOf(inst.id, list).find(d => d.masterChildId === mLayer.id) || null;
  }
  componentPath(root, el, list) {
    const parts = [];
    let cur = el, guard = 0;
    while (cur && cur.id !== root.id && guard++ < 64) { parts.unshift(cur.name); cur = list.find(e => e.id === cur.parentId); }
    return cur ? parts.join('/') : null;
  }
  /** Component properties live on the main component, or on its variant set. */
  componentPropDefs(master) {
    const set = master && master.parentId ? this.findAnywhere(master.parentId) : null;
    return [...((set && set.isComponentSet && set.componentProps) || []), ...((master && master.componentProps) || [])];
  }
  applyComponentProps(inst, master, list) {
    const defs = this.componentPropDefs(master);
    if (!defs.length || !inst.propValues) return;
    for (const d of defs) {
      if (!(d.id in inst.propValues)) continue;
      for (const path of (d.layers?.length ? d.layers : [d.layer])) {
      let v = inst.propValues[d.id];
      const layer = this.instanceLayerFor(inst, master, path, list);
      if (!layer) continue;
      // QA-19: typing into (or hiding) a property-bound layer updates the property instead of being reverted
      const memo = (this._propLast ||= new WeakMap()), last = memo.get(layer) || {};
      if (d.type === 'text' && last.text !== undefined && layer.text !== last.text && layer.text !== String(v)) { v = inst.propValues[d.id] = layer.text; layer.overrides = layer.overrides.filter(o => o !== 'text'); }
      if (d.type === 'boolean' && last.visible !== undefined && layer.visible !== last.visible && layer.visible !== !!v) { v = inst.propValues[d.id] = layer.visible; layer.overrides = layer.overrides.filter(o => o !== 'visible'); }
      if (d.type === 'text' && layer.type === 'text' && layer.text !== String(v)) {
        layer.text = String(v); (this._propText ||= new WeakSet()).add(layer);
        if (typeof TextLayout !== 'undefined' && layer.textAutoResize && layer.textAutoResize !== 'none') TextLayout.fit(layer);
      } else if (d.type === 'boolean') layer.visible = !!v;
      else if (d.type === 'swap' && layer.isComponentInstance && v && layer.masterComponentId !== v && this.findAnywhere(v)?.isComponentMaster) {
        layer.masterComponentId = v; layer.overrides = layer.overrides.filter(o => o !== 'width' && o !== 'height');
      }
      // keep the cache in step so a property value is not mistaken for a manual override
      const c = this._syncCache?.get(layer);
      if (c) { if (d.type === 'text') c.text = JSON.stringify(layer.text); if (d.type === 'boolean') c.visible = JSON.stringify(layer.visible); }
      memo.set(layer, { text: layer.text, visible: layer.visible });
      const own = (this._propOwned ||= new WeakMap()); if (!own.has(layer)) own.set(layer, new Set()); own.get(layer).add(d.type === 'text' ? 'text' : d.type === 'boolean' ? 'visible' : 'masterComponentId');
      }
    }
  }
  isInSubtree(el, rootId, list) {
    let p = list.find(e => e.id === el.parentId), guard = 0;
    while (p && guard++ < 64) { if (p.id === rootId) return true; p = list.find(e => e.id === p.parentId); }
    return false;
  }

  // ------------------------------------------------------------- Animation
  getAnimValue(el, prop) {
    if (prop === 'fillColor') return el.fills[0] ? el.fills[0].color : '#000000';
    return el[prop];
  }
  setAnimValue(el, prop, v) {
    if (prop === 'fillColor') { if (el.fills[0]) el.fills[0].color = v; return; }
    el[prop] = v;
  }
  hasTracks(elId) { return this.animations.some(a => a.tracks[elId] && Object.keys(a.tracks[elId]).length > 0); }
  /** Evaluate a property of an element inside a specific animation (used by the state-machine runtime). */
  evaluateIn(anim, elId, prop, time) {
    const kfs = anim.tracks[elId]?.[prop];
    if (!kfs || !kfs.length) return undefined;
    const sorted = kfs.slice().sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    const last = sorted[sorted.length - 1];
    if (time >= last.time) return last.value;
    for (let i = 0; i < sorted.length - 1; i++) {
      const k1 = sorted[i], k2 = sorted[i + 1];
      if (time >= k1.time && time <= k2.time) {
        const ease = (Array.isArray(k1.bezier) && k1.bezier.length === 4 ? Utils.cubicBezier(...k1.bezier) : (Utils.easings[k1.easing] || Utils.easings.easeInOut))((time - k1.time) / (k2.time - k1.time || 1));
        if (typeof k1.value === 'string') return Utils.mixColor(k1.value, k2.value, Utils.clamp(ease, 0, 1));
        return k1.value + (k2.value - k1.value) * ease;
      }
    }
    return last.value;
  }
  evaluate(elId, prop, time) {
    const kfs = this.animationTimeline.tracks[elId]?.[prop];
    if (!kfs || !kfs.length) return undefined;
    const sorted = kfs.slice().sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    const last = sorted[sorted.length - 1];
    if (time >= last.time) return last.value;
    for (let i = 0; i < sorted.length - 1; i++) {
      const k1 = sorted[i], k2 = sorted[i + 1];
      if (time >= k1.time && time <= k2.time) {
        const span = k2.time - k1.time || 1;
        const ease = (Array.isArray(k1.bezier) && k1.bezier.length === 4 ? Utils.cubicBezier(...k1.bezier) : (Utils.easings[k1.easing] || Utils.easings.easeInOut))((time - k1.time) / span);
        if (typeof k1.value === 'string') return Utils.mixColor(k1.value, k2.value, Utils.clamp(ease, 0, 1));
        return k1.value + (k2.value - k1.value) * ease;
      }
    }
    return last.value;
  }
  setKeyframe(elId, prop, time, value, easing) {
    const tracks = this.animationTimeline.tracks;
    if (!tracks[elId]) tracks[elId] = {};
    if (!tracks[elId][prop]) tracks[elId][prop] = [];
    const list = tracks[elId][prop];
    const t = Math.round(time * 1000) / 1000;
    const existing = list.find(k => Math.abs(k.time - t) < 0.0005);
    if (existing) { existing.value = value; if (easing) existing.easing = easing; }
    else list.push({ time: t, value, easing: easing || 'easeInOut' });
    list.sort((a, b) => a.time - b.time);
  }
  removeTrack(elId, prop) {
    const t = this.animationTimeline.tracks[elId];
    if (!t) return;
    delete t[prop];
    if (!Object.keys(t).length) delete this.animationTimeline.tracks[elId];
  }
  /** Write evaluated values into elements for the given time (across all pages). */
  applyTime(time) {
    const tracks = this.animationTimeline.tracks;
    for (const elId of Object.keys(tracks)) {
      const el = this.findAnywhere(elId);
      if (!el) continue;
      if (!this.animApplied[elId]) this.animApplied[elId] = {};
      for (const prop of Object.keys(tracks[elId])) {
        const v = this.evaluate(elId, prop, time);
        if (v === undefined) continue;
        this.setAnimValue(el, prop, v);
        this.animApplied[elId][prop] = v;
      }
    }
  }
  /** After an edit: turn changed animated values into keyframes (After-Effects stopwatch semantics). */
  syncKeyframesFromEdits(autoKeyIds) {
    const tl = this.animationTimeline;
    let changed = false;
    for (const el of this.allElements()) {
      const applied = this.animApplied[el.id] || {};
      const tracks = tl.tracks[el.id] || {};
      for (const prop of ANIM_PROPS) {
        const cur = this.getAnimValue(el, prop);
        const hasTrack = !!tracks[prop];
        if (hasTrack) {
          if (applied[prop] !== undefined && cur !== applied[prop]) {
            this.setKeyframe(el.id, prop, tl.currentTime, cur);
            (this.animApplied[el.id] ||= {})[prop] = cur; changed = true;
          }
        } else if (autoKeyIds && autoKeyIds.has(el.id) && applied[prop] !== undefined && cur !== applied[prop]) {
          // first keyframe captures the previous value at t=0 when recording starts later
          if (tl.currentTime > 0) this.setKeyframe(el.id, prop, 0, applied[prop]);
          this.setKeyframe(el.id, prop, tl.currentTime, cur);
          (this.animApplied[el.id] ||= {})[prop] = cur; changed = true;
        }
      }
    }
    return changed;
  }
  /** Remember current values so later edits can be detected (used by auto-key). */
  captureBaseline(els) {
    for (const el of els) {
      const a = (this.animApplied[el.id] ||= {});
      for (const prop of ANIM_PROPS) a[prop] = this.getAnimValue(el, prop);
    }
  }

  // ------------------------------------------------------------- Serialization
  serialize(title = 'Untitled') {
    const used = new Set(this.allElements().map(e => e.assetId).filter(Boolean));
    const assets = {};
    for (const id of used) if (this.assets[id]) assets[id] = this.assets[id];
    return {
      format: 'designstudio', version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '3'), title, savedAt: new Date().toISOString(),
      pages: this.pages, currentPageId: this.currentPageId, styles: this.styles, assets,
      animations: this.animations, activeAnimationId: this.activeAnimationId, inputs: this.inputs, stateMachines: this.stateMachines,
      scene3d: this.scene3d || null,
      comments: this.comments || [],
      links: this.links || [],
      triggers: (this.triggers || []).map(({ open, ...t }) => t),
      prototypeSettings: this.prototypeSettings,
      variables: this.variables, dsReleases: this.dsReleases || [], handovers: this.handovers || [],
      view: { zoom: this.zoom, panX: this.panX, panY: this.panY, showGrid: this.showGrid, snapToGuides: this.snapToGuides, showRulers: this.showRulers, showGuides: this.showGuides !== false, lockGuides: !!this.lockGuides }
    };
  }
  /** v3.35.0 developer handover commits. doc = a frozen mini-project (pages/styles/variables/assets) of what was committed. */
  static sanitizeHandovers(list) {
    if (!Array.isArray(list)) return [];
    const st = ['ready', 'progress', 'changes', 'done'];
    return list.filter(h => h && typeof h === 'object' && h.doc && Array.isArray(h.doc.pages)).slice(-60).map((h, i) => ({
      id: typeof h.id === 'string' ? h.id.slice(0, 60) : Utils.uid('ho'), n: Number.isFinite(+h.n) ? +h.n : i + 1,
      title: String(h.title || `Handover ${i + 1}`).slice(0, 120), message: String(h.message || '').slice(0, 4000),
      status: st.includes(h.status) ? h.status : 'ready', createdAt: String(h.createdAt || ''), page: String(h.page || '').slice(0, 120),
      author: String(h.author || '').slice(0, 80),
      screens: (Array.isArray(h.screens) ? h.screens : []).slice(0, 80).map(x => ({ id: String(x.id || ''), name: String(x.name || '').slice(0, 120), w: +x.w || 0, h: +x.h || 0, thumb: typeof x.thumb === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(x.thumb) ? x.thumb : '' })),
      notes: (h.notes && typeof h.notes === 'object') ? Object.fromEntries(Object.entries(h.notes).slice(0, 500).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 2000)])) : {},
      doc: { pages: h.doc.pages, styles: h.doc.styles || null, variables: h.doc.variables || null, assets: (h.doc.assets && typeof h.doc.assets === 'object') ? Object.fromEntries(Object.entries(h.doc.assets).filter(([, v]) => typeof v === 'string' && v.startsWith('data:image/'))) : {} },
    }));
  }
  /** v3.11.0 ruler guides: [{ id, axis: 'x' | 'y', pos, frameId }] */
  static sanitizeGuides(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(g => g && (g.axis === 'x' || g.axis === 'y') && Number.isFinite(+g.pos)).slice(0, 500)
      .map(g => ({ id: typeof g.id === 'string' ? g.id.slice(0, 60) : Utils.uid('guide'), axis: g.axis, pos: +g.pos, frameId: typeof g.frameId === 'string' ? g.frameId : null }));
  }
  load(data) {
    if (!data || typeof data !== 'object') throw new Error('Not a project file');
    let pages;
    if (Array.isArray(data.pages)) pages = data.pages;
    else if (Array.isArray(data)) pages = [{ id: 'page_1', name: 'Page 1', elements: data }];
    else throw new Error('No pages found');
    this.reset();
    this.history = []; this.historyIndex = -1; this._snaps = new SnapChunks(); this.historyChars = 0;
    this.assets = {};
    if (data.assets && typeof data.assets === 'object') {
      for (const [k, v] of Object.entries(data.assets)) if (typeof v === 'string' && v.startsWith('data:image/')) this.assets[k] = v;
    }
    this.pages = pages.filter(p => p && Array.isArray(p.elements)).map((p, i) => ({
      id: typeof p.id === 'string' ? p.id : Utils.uid('page'),
      name: String(p.name || `Page ${i + 1}`).slice(0, 120),
      bg: Utils.safeColor(p.bg, '#1a1a2e'),
      guides: StudioModel.sanitizeGuides(p.guides),
      elements: p.elements.map(e => StudioElement.fromJSON(e)).filter(Boolean)
    }));
    if (!this.pages.length) this.pages = [{ id: 'page_1', name: 'Page 1', elements: [], bg: '#1a1a2e' }];
    // migrate legacy inline images
    for (const el of this.allElements()) {
      if (el.imageDataUrl && !el.assetId) { el.assetId = Utils.uid('img'); this.assets[el.assetId] = el.imageDataUrl; }
      el.imageDataUrl = null;
      if (el.type === 'text' && data.version && String(data.version).startsWith('2')) el.textAutoResize = 'height';
    }
    // legacy: frames used as groups were named "Group"
    this.currentPageId = this.pages.some(p => p.id === data.currentPageId) ? data.currentPageId : this.pages[0].id;
    if (data.styles && typeof data.styles === 'object') {
      const s = data.styles;
      this.styles = {
        colors: (s.colors || []).map(c => ({ id: String(c.id || Utils.uid('c')), name: String(c.name || 'Color'), color: Utils.safeColor(c.color, '#000000'), varId: typeof c.varId === 'string' ? c.varId : null })),
        texts: (s.texts || []).map(t => ({ id: String(t.id || Utils.uid('t')), name: String(t.name || 'Text'), fontFamily: String(t.fontFamily || DEFAULT_FONT), fontSize: Utils.num(t.fontSize, 16), fontWeight: Utils.num(t.fontWeight, 400), lineHeight: Utils.num(t.lineHeight, 0), letterSpacing: Utils.num(t.letterSpacing, 0) })),
        effects: (s.effects || []).map(e => ({ id: String(e.id || Utils.uid('e')), name: String(e.name || 'Effect'), effects: StudioElement.sanitize(Object.assign(new StudioElement('rect'), { effects: e.effects || [] })).effects }))
      };
    }
    const ids = new Set(this.allElements().map(e => e.id));
    const cleanTracks = (src) => {
      const tracks = {};
      for (const [elId, props] of Object.entries(src || {})) {
        if (!props || typeof props !== 'object') continue;
        if (!ids.has(elId) && !String(elId).startsWith('o3_')) continue;
        for (const [prop, kfs] of Object.entries(props)) {
          if (!ANIM_PROPS.includes(prop) && !(typeof ANIM_PROPS_3D !== 'undefined' && ANIM_PROPS_3D.includes(prop)) && !(String(elId).startsWith('o3_') && /^(geo\.[a-z]\w*|morph\.\d+)$/i.test(prop))) continue; // v3.14.0 shape keys
          if (!Array.isArray(kfs)) continue;
          const clean = kfs.filter(k => k && Number.isFinite(+k.time)).map(k => ({
            time: +k.time, easing: Utils.easings[k.easing] ? k.easing : 'easeInOut', ...(Array.isArray(k.bezier) && k.bezier.length === 4 && k.bezier.every(Number.isFinite) ? { bezier: k.bezier.map(Number) } : {}),
            value: typeof k.value === 'string' ? Utils.safeColor(k.value, '#000000') : Utils.num(k.value, 0)
          }));
          if (clean.length) (tracks[elId] ||= {})[prop] = clean;
        }
      }
      return tracks;
    };
    if (Array.isArray(data.animations) && data.animations.length) {
      this.animations = data.animations.map((an, i) => ({
        id: typeof an.id === 'string' ? an.id : Utils.uid('anim'), name: String(an.name || `Timeline ${i + 1}`).slice(0, 80),
        duration: Utils.clamp(Utils.num(an.duration, 2), 0.1, 600), fps: [12, 24, 30, 60].includes(+an.fps) ? +an.fps : 60,
        loop: ['loop', 'oneShot', 'pingPong'].includes(an.loop) ? an.loop : 'loop', tracks: cleanTracks(an.tracks)
      }));
      this.activeAnimationId = this.animations.some(a => a.id === data.activeAnimationId) ? data.activeAnimationId : this.animations[0].id;
    } else {
      const tl = data.timeline || {};
      const an = this.animations[0];
      an.duration = Utils.clamp(Utils.num(tl.duration, 5), 0.5, 120);
      an.fps = [12, 24, 30, 60].includes(+tl.fps) ? +tl.fps : 60;
      an.loop = tl.isLooping === false ? 'oneShot' : 'loop';
      an.tracks = cleanTracks(tl.tracks);
    }
    this.inputs = (Array.isArray(data.inputs) ? data.inputs : []).filter(i => i && typeof i === 'object').map(i => ({
      id: typeof i.id === 'string' ? i.id : Utils.uid('in'), name: String(i.name || 'input').slice(0, 60),
      type: ['boolean', 'number', 'trigger'].includes(i.type) ? i.type : 'boolean',
      value: i.type === 'number' ? Utils.num(i.value, 0) : i.type === 'boolean' ? !!i.value : false
    }));
    const animIds = new Set(this.animations.map(a => a.id)), inputIds = new Set(this.inputs.map(i => i.id));
    this.stateMachines = (Array.isArray(data.stateMachines) ? data.stateMachines : []).filter(sm => sm && Array.isArray(sm.layers)).map(sm => ({
      id: String(sm.id || Utils.uid('sm')), name: String(sm.name || 'State Machine').slice(0, 80),
      layers: sm.layers.map(l => {
        const states = (l.states || []).filter(st => st && ['entry', 'any', 'exit', 'animation'].includes(st.type)).map(st => ({
          id: String(st.id), type: st.type, name: String(st.name || st.type).slice(0, 60), x: Utils.num(st.x, 0), y: Utils.num(st.y, 0),
          animationId: animIds.has(st.animationId) ? st.animationId : null, speed: Utils.num(st.speed, 1)
        }));
        const sIds = new Set(states.map(st => st.id));
        return {
          id: String(l.id || Utils.uid('ly')), name: String(l.name || 'Layer').slice(0, 60), states,
          transitions: (l.transitions || []).filter(t => t && sIds.has(t.from) && sIds.has(t.to)).map(t => ({
            id: String(t.id || Utils.uid('tr')), from: t.from, to: t.to, duration: Utils.clamp(Utils.num(t.duration, 0), 0, 10000), exitTime: Utils.clamp(Utils.num(t.exitTime, 0), 0, 100),
            conditions: (t.conditions || []).filter(c => c && inputIds.has(c.inputId)).map(c => ({ inputId: c.inputId, op: ['==', '!=', '>', '<', '>=', '<='].includes(c.op) ? c.op : '==', value: typeof c.value === 'boolean' ? c.value : Utils.num(c.value, 0) }))
          }))
        };
      }),
      listeners: (sm.listeners || []).filter(li => li && typeof li.targetId === 'string').map(li => ({
        id: String(li.id || Utils.uid('li')), targetId: li.targetId,
        event: ['click', 'pointerDown', 'pointerUp', 'pointerEnter', 'pointerExit'].includes(li.event) ? li.event : 'click',
        actions: (li.actions || []).filter(a => a && inputIds.has(a.inputId)).map(a => ({ type: ['fire', 'set', 'toggle'].includes(a.type) ? a.type : 'fire', inputId: a.inputId, value: typeof a.value === 'boolean' ? a.value : Utils.num(a.value, 0) }))
      }))
    }));
    this.scene3d = data.scene3d && typeof data.scene3d === 'object' ? data.scene3d : null;
    this.links = Array.isArray(data.links) ? data.links.filter(l => l && l.id && l.src && l.target && typeof l.src.kind === 'string' && typeof l.target.kind === 'string') : [];
    this.triggers = StudioModel.sanitizeTriggers(data.triggers);
    this.comments = Array.isArray(data.comments) ? data.comments.filter(c => c && typeof c.text === 'string' && Number.isFinite(c.x) && Number.isFinite(c.y)).map(c => ({ ...c, replies: Array.isArray(c.replies) ? c.replies.filter(r => r && typeof r.text === 'string') : [] })) : [];
    const ps = data.prototypeSettings || {};
    this.prototypeSettings = {
      startingFrameId: typeof ps.startingFrameId === 'string' ? ps.startingFrameId : null,
      flowName: String(ps.flowName || 'Flow 1').slice(0, 80),
      device: ['none', 'iphone', 'ipad', 'desktop', 'custom'].includes(ps.device) ? ps.device : 'iphone',
      canvasBg: Utils.safeColor(ps.canvasBg, '#0e0e12'), showHints: ps.showHints !== false
    };
    this.variables = data.variables ? StudioModel.sanitizeVariables(data.variables) : StudioModel.sanitizeVariables({ collections: [], vars: [] });
    this.dsReleases = Array.isArray(data.dsReleases) ? data.dsReleases.filter(r => r && typeof r.version === 'string').slice(-100).map(r => ({ version: r.version.slice(0, 20), notes: String(r.notes || '').slice(0, 4000), at: String(r.at || ''), snapshot: typeof r.snapshot === 'string' ? r.snapshot : '' })) : [];
    this.handovers = StudioModel.sanitizeHandovers(data.handovers);
    const v = data.view || {};
    this.zoom = Utils.clamp(Utils.num(v.zoom, 1), 0.02, 64);
    this.panX = Utils.num(v.panX, 140); this.panY = Utils.num(v.panY, 90);
    this.showGrid = v.showGrid !== false; this.snapToGuides = v.snapToGuides !== false; this.showRulers = v.showRulers !== false;
    this.showGuides = v.showGuides !== false; this.lockGuides = !!v.lockGuides;
    this.selectedIds = new Set();
    this.primeComponentCache(); // QA-18
    return typeof data.title === 'string' ? data.title : null;
  }
}
