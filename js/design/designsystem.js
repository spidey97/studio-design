/**
 * DesignStudio — Design system (v3.8.0).
 * Engine: variables (collections × modes, aliases) bound to layer properties, linked styles, per-frame modes.
 * UI: ⬡ bind buttons in the Design panel, variable picker, “Variable modes” section, and the Design System manager
 * (Variables · Styles · Components · Health · Tokens · Releases).
 */
'use strict';

/** Bindable properties: key → {type, label}. 'fills.N' / 'strokes.N' are added dynamically. */
const DS_PROPS = {
  cornerRadius: { type: 'number', label: 'Corner radius' }, opacity: { type: 'number', label: 'Opacity %' },
  width: { type: 'number', label: 'Width' }, height: { type: 'number', label: 'Height' },
  layoutGap: { type: 'number', label: 'Gap' }, padding: { type: 'number', label: 'Padding' },
  strokeWidth: { type: 'number', label: 'Stroke width' },
  fontSize: { type: 'number', label: 'Font size' }, lineHeight: { type: 'number', label: 'Line height' }, letterSpacing: { type: 'number', label: 'Letter spacing' },
  text: { type: 'string', label: 'Text' }, visible: { type: 'boolean', label: 'Visible' }
};
const dsPropInfo = (prop) => DS_PROPS[prop] || (/^(fills|strokes)\.\d+$/.test(prop) ? { type: 'color', label: prop.startsWith('fills') ? 'Fill' : 'Stroke' } : null);
const DS_TYPE_ICON = { color: '●', number: '#', string: 'T', boolean: '◩' };

// =========================================================================== ENGINE (model)
Object.assign(StudioModel.prototype, {
  dsVars() { if (!this.variables) this.variables = StudioModel.defaultVariables(); return this.variables; },
  varById(id) { return this.dsVars().vars.find(v => v.id === id) || null; },
  collectionById(id) { return this.dsVars().collections.find(c => c.id === id) || null; },
  /** Mode chosen for each collection at this layer: nearest ancestor (or itself) with varModes wins. */
  modeContext(el, list) {
    const ctx = {};
    const chain = el ? [el, ...this.ancestorsOf(el, list)] : [];
    for (const a of chain) if (a.varModes) for (const [c, m] of Object.entries(a.varModes)) if (!(c in ctx)) ctx[c] = m;
    return ctx;
  },
  /** Value of a variable in a mode context, following aliases (cycles stop after 12 hops). */
  resolveVar(id, ctx = {}, depth = 0) {
    const v = this.varById(id);
    if (!v || depth > 12) return undefined;
    const col = this.collectionById(v.collectionId);
    if (!col) return undefined;
    const mode = col.modes.some(m => m.id === ctx[col.id]) ? ctx[col.id] : col.defaultModeId;
    let val = v.values[mode];
    if (val === undefined) val = v.values[col.defaultModeId];
    if (val && typeof val === 'object' && val.alias) return this.resolveVar(val.alias, ctx, depth + 1);
    return val;
  },
  aliasLoops(id, seen = new Set()) {
    if (seen.has(id)) return true;
    seen.add(id);
    const v = this.varById(id);
    if (!v) return false;
    return Object.values(v.values).some(x => x && x.alias && this.aliasLoops(x.alias, new Set(seen)));
  },
  dsRead(el, prop) {
    if (prop.startsWith('fills.') || prop.startsWith('strokes.')) {
      const [k, i] = prop.split('.'), p = el[k][+i];
      return p ? `${p.color}|${k === 'fills' ? (p.opacity ?? 1) : ''}|${p.type || 'solid'}` : null;
    }
    if (prop === 'padding') return [el.layoutPaddingTop, el.layoutPaddingRight, el.layoutPaddingBottom, el.layoutPaddingLeft].join(',');
    if (prop === 'strokeWidth') return el.strokes[0]?.width ?? null;
    if (prop === 'opacity') return Math.round(el.opacity * 1000) / 1000;
    return el[prop];
  },
  dsWrite(el, prop, val) {
    if (val === undefined || val === null) return;
    if (prop.startsWith('fills.') || prop.startsWith('strokes.')) {
      const c = Utils.parseColor(val); if (!c) return;
      const [k, i] = prop.split('.'), idx = +i, hex = Utils.rgbToHex(c.r, c.g, c.b);
      if (k === 'fills') {
        if (!el.fills[idx]) el.fills[idx] = { type: 'solid', color: hex, opacity: c.a, angle: 90, visible: true, stops: [{ pos: 0, color: hex }, { pos: 1, color: '#000000' }] };
        const f = el.fills[idx]; f.type = 'solid'; f.color = hex; f.opacity = c.a;
      } else {
        if (!el.strokes[idx]) el.strokes[idx] = { color: hex, width: 1, align: 'inside', visible: true };
        el.strokes[idx].color = c.a < 1 ? Utils.rgba(hex, c.a) : hex;
      }
      return;
    }
    const n = Number(val);
    switch (prop) {
      case 'padding': if (Number.isFinite(n)) { el.layoutPadding = el.layoutPaddingTop = el.layoutPaddingRight = el.layoutPaddingBottom = el.layoutPaddingLeft = Math.max(0, n); } return;
      case 'strokeWidth': if (Number.isFinite(n) && el.strokes[0]) el.strokes[0].width = Math.max(0, n); return;
      case 'opacity': if (Number.isFinite(n)) el.opacity = Utils.clamp(n > 1 ? n / 100 : n, 0, 1); return;
      case 'visible': el.visible = !!val; return;
      case 'text': if (el.type === 'text') { el.text = String(val); if (el.textAutoResize && el.textAutoResize !== 'none') TextLayout.fit(el); } return;
      case 'width': case 'height': if (Number.isFinite(n)) el[prop] = Math.max(1, n); return;
      case 'fontSize': case 'lineHeight': case 'letterSpacing':
        if (Number.isFinite(n) && el.type === 'text') { el[prop] = prop === 'fontSize' ? Math.max(1, n) : n; if (el.textAutoResize && el.textAutoResize !== 'none') TextLayout.fit(el); }
        return;
      default: if (Number.isFinite(n)) el[prop] = Math.max(0, n);
    }
  },
  styleById(kind, id) { return (this.styles[kind] || []).find(s => s.id === id) || null; },
  styleColor(s, ctx) { return s.varId ? (this.resolveVar(s.varId, ctx) ?? s.color) : s.color; },
  /** Writes variable / style values into bound layers. 'pre' also detaches bindings the user overwrote by hand. */
  applyDesignSystem(phase) {
    if (!this._dsLast) this._dsLast = new WeakMap();
    const last = this._dsLast, J = (v) => JSON.stringify(v);
    const cache = this._syncCache;
    for (const page of this.pages) {
      const list = page.elements;
      for (const el of list) {
        if (!el.bindings && !el.styleRefs) continue;
        const inInstance = !!(el.masterChildId || el.isComponentInstance);
        if (phase === 'post' && !inInstance) continue;
        const ctx = this.modeContext(el, list);
        const rec = last.get(el) || {};
        const animated = this.hasTracks?.(el.id);
        const check = (key, cur) => phase === 'pre' && !animated && rec[key] !== undefined && J(cur) !== rec[key];
        if (el.bindings) {
          for (const [prop, id] of Object.entries(el.bindings)) {
            if (!dsPropInfo(prop)) { delete el.bindings[prop]; continue; }
            if (rec['@' + prop] !== id) { delete rec[prop]; rec['@' + prop] = id; } // QA-22: a new / changed binding starts fresh
            if (check(prop, this.dsRead(el, prop))) { delete el.bindings[prop]; delete rec[prop]; delete rec['@' + prop]; continue; } // edited by hand → detached
            if (phase === 'pre' && inInstance) continue; // instance layers are written after the component sync
            const val = this.resolveVar(id, ctx);
            if (val === undefined) continue; // broken binding: Health tab offers the fix
            this.dsWrite(el, prop, val);
            rec[prop] = J(this.dsRead(el, prop));
          }
          if (!Object.keys(el.bindings).length) el.bindings = null;
        }
        if (el.styleRefs) {
          for (const [kind, id] of Object.entries(el.styleRefs)) {
            const key = `style:${kind}`;
            if (rec['@' + key] !== id) { delete rec[key]; rec['@' + key] = id; }
            const read = () => kind === 'fill' ? this.dsRead(el, 'fills.0') : kind === 'text' ? [el.fontFamily, el.fontSize, el.fontWeight, el.lineHeight, el.letterSpacing].join('|') : J(el.effects);
            if (check(key, read())) { delete el.styleRefs[kind]; delete rec[key]; continue; }
            if (phase === 'pre' && inInstance) continue;
            const s = this.styleById(kind === 'fill' ? 'colors' : kind === 'text' ? 'texts' : 'effects', id);
            if (!s) continue;
            if (kind === 'fill') this.dsWrite(el, 'fills.0', this.styleColor(s, ctx));
            else if (kind === 'text' && el.type === 'text') {
              Object.assign(el, { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing || 0 });
              if (el.textAutoResize && el.textAutoResize !== 'none') TextLayout.fit(el);
            } else if (kind === 'effect') el.effects = JSON.parse(J(s.effects));
            rec[key] = J(read());
          }
          if (!Object.keys(el.styleRefs).length) el.styleRefs = null;
        }
        last.set(el, rec);
        // instance layers: the values we just wrote are not user overrides
        if (phase === 'post' && cache) {
          const c = cache.get(el);
          if (c) for (const k of ['fills', 'strokes', 'cornerRadius', 'opacity', 'layoutGap', 'layoutPadding', 'layoutPaddingTop', 'layoutPaddingRight', 'layoutPaddingBottom', 'layoutPaddingLeft', 'fontSize', 'lineHeight', 'letterSpacing', 'fontFamily', 'fontWeight', 'text', 'visible', 'effects']) if (k in c) c[k] = J(el[k]);
        }
      }
    }
  },
  /** varId → number of layers / aliases / styles that use it. */
  varUsage() {
    const u = new Map();
    const add = (id) => u.set(id, (u.get(id) || 0) + 1);
    for (const el of this.allElements()) if (el.bindings) Object.values(el.bindings).forEach(add);
    for (const v of this.dsVars().vars) for (const x of Object.values(v.values)) if (x && x.alias) add(x.alias);
    for (const s of this.styles.colors) if (s.varId) add(s.varId);
    return u;
  },
  styleUsage() {
    const u = new Map();
    for (const el of this.allElements()) if (el.styleRefs) for (const id of Object.values(el.styleRefs)) u.set(id, (u.get(id) || 0) + 1);
    return u;
  },
  /** Display value of a variable (for lists / pickers). */
  varDisplay(v, ctx = {}) {
    const val = this.resolveVar(v.id, ctx);
    if (val === undefined) return '⚠ unresolved';
    if (v.type === 'boolean') return val ? 'true' : 'false';
    if (v.type === 'color') return Utils.toHex(val).toUpperCase() + (Utils.alphaOf(val) < 1 ? ` ${Math.round(Utils.alphaOf(val) * 100)}%` : '');
    return String(val);
  },
  /** Removes a variable; layers keep their current values (bindings are dropped), aliases are flattened. */
  deleteVariable(id) {
    const D = this.dsVars(), v = this.varById(id);
    if (!v) return;
    for (const o of D.vars) for (const [k, x] of Object.entries(o.values)) if (x && x.alias === id) o.values[k] = this.resolveVar(id, { [v.collectionId]: k }) ?? (v.type === 'color' ? '#000000' : v.type === 'number' ? 0 : v.type === 'boolean' ? false : '');
    for (const el of this.allElements()) if (el.bindings) { for (const [p, b] of Object.entries(el.bindings)) if (b === id) delete el.bindings[p]; if (!Object.keys(el.bindings).length) el.bindings = null; }
    for (const s of this.styles.colors) if (s.varId === id) { s.color = this.resolveVar(id) ?? s.color; s.varId = null; }
    D.vars = D.vars.filter(x => x.id !== id);
  },
  /** Design-system state used by Releases (diffs). */
  dsState() {
    const comps = {};
    for (const m of this.allElements().filter(e => e.isComponentMaster || e.isComponentSet)) {
      const kids = this.descendantsOf ? this.findAnywhereDescendants(m) : [];
      comps[m.id] = { name: m.name, hash: Utils.hash(JSON.stringify([m, kids].map(x => JSON.parse(JSON.stringify(x, (k, v) => (k === 'x' || k === 'y' || k === 'id' || k === 'parentId' ? undefined : v)))))) };
    }
    return { variables: this.dsVars(), styles: this.styles, components: comps };
  },
  findAnywhereDescendants(root) {
    const page = this.pageOf(root.id); if (!page) return [];
    const out = [], walk = (id) => { for (const e of page.elements) if (e.parentId === id) { out.push(e); walk(e.id); } };
    walk(root.id); return out;
  }
});
if (!Utils.hash) Utils.hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// =========================================================================== UI
/** v3.13.0: one-click design system presets (Design system › Tokens & code). */
const DS_PRESETS = [
 {
  "name": "Kova Fintech",
  "note": "Dark-first, violet + lime, rounded",
  "brand": "#6C4DFF",
  "swatch": [
   "#090A12",
   "#6C4DFF",
   "#D4FF4F",
   "#38D6FF"
  ],
  "opts": {
   "neutral": "#5c6080",
   "families": {
    "accent": "#B7E62E",
    "info": "#38D6FF",
    "success": "#22C55E",
    "danger": "#EF4444"
   },
   "radius": {
    "radius/sm": 8,
    "radius/md": 12,
    "radius/lg": 24
   },
   "effects": {
    "Shadow / Card": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 20,
      "blur": 40,
      "spread": 0,
      "color": "rgba(0,0,0,0.40)",
      "visible": true
     }
    ],
    "Glow / Lime": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 10,
      "blur": 30,
      "spread": 0,
      "color": "rgba(212,255,79,0.35)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "Material-style",
  "note": "Tonal palette, 12\u201328 px corners, Roboto",
  "brand": "#6750A4",
  "swatch": [
   "#FFFBFE",
   "#6750A4",
   "#625B71",
   "#7D5260"
  ],
  "opts": {
   "neutral": "#79747E",
   "families": {
    "tertiary": "#7D5260",
    "success": "#386A20",
    "danger": "#B3261E"
   },
   "radius": {
    "radius/sm": 8,
    "radius/md": 12,
    "radius/lg": 28
   },
   "font": "Roboto, Inter, sans-serif",
   "texts": [
    [
     "Display",
     45,
     400,
     52
    ],
    [
     "Headline",
     32,
     400,
     40
    ],
    [
     "Title",
     22,
     500,
     28
    ],
    [
     "Body",
     16,
     400,
     24
    ],
    [
     "Label",
     14,
     500,
     20
    ],
    [
     "Caption",
     12,
     400,
     16
    ]
   ],
   "effects": {
    "Elevation 1": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 1,
      "blur": 3,
      "spread": 0,
      "color": "rgba(0,0,0,0.15)",
      "visible": true
     },
     {
      "type": "dropShadow",
      "x": 0,
      "y": 1,
      "blur": 2,
      "spread": 0,
      "color": "rgba(0,0,0,0.30)",
      "visible": true
     }
    ],
    "Elevation 3": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 4,
      "blur": 8,
      "spread": 0,
      "color": "rgba(0,0,0,0.15)",
      "visible": true
     },
     {
      "type": "dropShadow",
      "x": 0,
      "y": 1,
      "blur": 3,
      "spread": 0,
      "color": "rgba(0,0,0,0.30)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "iOS-style",
  "note": "System blue, grouped surfaces, SF type scale",
  "brand": "#007AFF",
  "swatch": [
   "#F2F2F7",
   "#007AFF",
   "#34C759",
   "#FF3B30"
  ],
  "opts": {
   "neutral": "#8E8E93",
   "families": {
    "success": "#34C759",
    "warning": "#FF9500",
    "danger": "#FF3B30"
   },
   "radius": {
    "radius/sm": 6,
    "radius/md": 10,
    "radius/lg": 16
   },
   "font": "-apple-system, \"SF Pro Text\", Inter, sans-serif",
   "texts": [
    [
     "Large Title",
     34,
     700,
     41
    ],
    [
     "Title",
     22,
     700,
     28
    ],
    [
     "Headline",
     17,
     600,
     22
    ],
    [
     "Body",
     17,
     400,
     22
    ],
    [
     "Callout",
     16,
     400,
     21
    ],
    [
     "Footnote",
     13,
     400,
     18
    ],
    [
     "Caption",
     12,
     400,
     16
    ]
   ],
   "effects": {
    "Shadow / Sheet": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 8,
      "blur": 24,
      "spread": 0,
      "color": "rgba(0,0,0,0.12)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "SaaS Clean",
  "note": "Indigo + slate, 8-pt grid, crisp shadows",
  "brand": "#4F46E5",
  "swatch": [
   "#F8FAFC",
   "#4F46E5",
   "#0F172A",
   "#10B981"
  ],
  "opts": {
   "neutral": "#64748B",
   "families": {
    "success": "#10B981",
    "warning": "#F59E0B",
    "danger": "#EF4444"
   },
   "radius": {
    "radius/sm": 4,
    "radius/md": 8,
    "radius/lg": 12
   },
   "effects": {
    "Shadow / sm": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 1,
      "blur": 2,
      "spread": 0,
      "color": "rgba(15,23,42,0.06)",
      "visible": true
     }
    ],
    "Shadow / md": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 4,
      "blur": 12,
      "spread": 0,
      "color": "rgba(15,23,42,0.08)",
      "visible": true
     }
    ],
    "Shadow / lg": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 12,
      "blur": 32,
      "spread": 0,
      "color": "rgba(15,23,42,0.12)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "Mono Minimal",
  "note": "Black & white, sharp corners, editorial",
  "brand": "#111111",
  "swatch": [
   "#FFFFFF",
   "#111111",
   "#8A8A8A",
   "#E5E5E5"
  ],
  "opts": {
   "neutral": "#737373",
   "radius": {
    "radius/sm": 0,
    "radius/md": 2,
    "radius/lg": 4
   },
   "font": "\"Helvetica Neue\", Arial, sans-serif",
   "texts": [
    [
     "Display",
     56,
     700,
     60
    ],
    [
     "Heading",
     28,
     700,
     34
    ],
    [
     "Body",
     16,
     400,
     26
    ],
    [
     "Label",
     13,
     600,
     18
    ],
    [
     "Caption",
     11,
     500,
     14
    ]
   ],
   "effects": {
    "Shadow / Hairline": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 0,
      "blur": 0,
      "spread": 0,
      "color": "rgba(0,0,0,0.12)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "Warm Commerce",
  "note": "Coral + cream, friendly, pill buttons",
  "brand": "#F05A3C",
  "swatch": [
   "#FFF8F1",
   "#F05A3C",
   "#2A1E17",
   "#F2B544"
  ],
  "opts": {
   "neutral": "#8a7a6e",
   "families": {
    "accent": "#F2B544",
    "success": "#2E9E6A",
    "danger": "#D93636"
   },
   "radius": {
    "radius/sm": 10,
    "radius/md": 16,
    "radius/lg": 28
   },
   "font": "\"Nunito\", Inter, sans-serif",
   "effects": {
    "Shadow / Soft": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 10,
      "blur": 30,
      "spread": 0,
      "color": "rgba(42,30,23,0.12)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "Health Calm",
  "note": "Teal + mint, soft, high legibility",
  "brand": "#0F9D8F",
  "swatch": [
   "#F4FBF9",
   "#0F9D8F",
   "#1F3B4D",
   "#8ED1C6"
  ],
  "opts": {
   "neutral": "#5f7a80",
   "families": {
    "info": "#3B82F6",
    "success": "#16A34A",
    "warning": "#D97706",
    "danger": "#DC2626"
   },
   "radius": {
    "radius/sm": 6,
    "radius/md": 12,
    "radius/lg": 20
   },
   "texts": [
    [
     "Display",
     36,
     700,
     44
    ],
    [
     "Heading",
     22,
     600,
     30
    ],
    [
     "Body",
     17,
     400,
     26
    ],
    [
     "Label",
     15,
     600,
     22
    ],
    [
     "Caption",
     13,
     400,
     18
    ]
   ],
   "effects": {
    "Shadow / Card": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 6,
      "blur": 20,
      "spread": 0,
      "color": "rgba(31,59,77,0.10)",
      "visible": true
     }
    ]
   }
  }
 },
 {
  "name": "Neon Gaming",
  "note": "Dark, magenta + cyan, bold type",
  "brand": "#E11D8F",
  "swatch": [
   "#0B0614",
   "#E11D8F",
   "#22D3EE",
   "#A3E635"
  ],
  "opts": {
   "neutral": "#6b6488",
   "families": {
    "accent": "#22D3EE",
    "success": "#A3E635",
    "danger": "#F43F5E"
   },
   "radius": {
    "radius/sm": 4,
    "radius/md": 6,
    "radius/lg": 12
   },
   "texts": [
    [
     "Display",
     48,
     800,
     52
    ],
    [
     "Heading",
     26,
     700,
     32
    ],
    [
     "Body",
     16,
     400,
     24
    ],
    [
     "Label",
     14,
     700,
     20
    ],
    [
     "Caption",
     12,
     500,
     16
    ]
   ],
   "effects": {
    "Glow / Magenta": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 0,
      "blur": 24,
      "spread": 0,
      "color": "rgba(225,29,143,0.55)",
      "visible": true
     }
    ],
    "Glow / Cyan": [
     {
      "type": "dropShadow",
      "x": 0,
      "y": 0,
      "blur": 24,
      "spread": 0,
      "color": "rgba(34,211,238,0.45)",
      "visible": true
     }
    ]
   }
  }
 }
];

const DesignSystemMixin = {
  bindDesignSystem() {
    // menu + shortcut
    this.commands.designSystem = { run: () => this.openDesignSystem() };
    const view = document.getElementById('dropdown-view');
    if (view) {
      const it = document.createElement('div');
      it.className = 'dropdown-item'; it.dataset.action = 'designSystem'; it.setAttribute('role', 'menuitem'); it.tabIndex = -1;
      it.innerHTML = 'Design System… <span class="dropdown-shortcut">Ctrl+Alt+D</span>';
      view.insertBefore(it, view.firstChild);
    }
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); e.stopImmediatePropagation(); this.openDesignSystem(); }
    }, true);
    // Assets panel: entry point + variables summary
    const assets = document.querySelector('#panel-tab-assets .assets-container');
    if (assets) {
      const bar = document.createElement('div');
      bar.className = 'dsm-entry';
      bar.innerHTML = '<button type="button" class="btn-primary dsm-open">⬡ Design system</button><span class="dsm-entry-sub"></span>';
      assets.insertBefore(bar, assets.firstChild);
      bar.querySelector('.dsm-open').addEventListener('click', () => this.openDesignSystem());
    }
    // Panel decorations after every properties refresh
    const origUpd = this.updatePropertiesUI.bind(this);
    this.updatePropertiesUI = (...a) => { const r = origUpd(...a); try { this.decorateBindings(); } catch (err) { console.warn('[ds] decorate', err); } return r; };
    const origAssets = this.renderAssets.bind(this);
    this.renderAssets = (...a) => { const r = origAssets(...a); this.decorateAssets(); return r; };
    // Inspect: show which tokens a layer uses (developers copy var() names)
    const origInspect = this.populateInspect.bind(this);
    this.populateInspect = (el) => {
      const r = origInspect(el);
      const code = document.getElementById('inspect-css-code');
      if (el && code && (el.bindings || el.styleRefs)) {
        const m = this.model, cssProp = { 'fills.0': el.type === 'text' ? 'color' : 'background', 'strokes.0': 'border-color', cornerRadius: 'border-radius', opacity: 'opacity', layoutGap: 'gap', padding: 'padding', width: 'width', height: 'height', fontSize: 'font-size', lineHeight: 'line-height', letterSpacing: 'letter-spacing' };
        const lines = Object.entries(el.bindings || {}).map(([p, id]) => { const v = m.varById(id); return v ? `  ${cssProp[p] || p}: var(--${Utils.slug(v.name.replace(/\//g, '-'))});` : null; }).filter(Boolean);
        const st = Object.entries(el.styleRefs || {}).map(([k, id]) => { const s2 = m.styleById(k === 'fill' ? 'colors' : k === 'text' ? 'texts' : 'effects', id); return s2 ? `  /* ${k} style: ${s2.name} */` : null; }).filter(Boolean);
        code.textContent = `/* Design tokens */\n.${Utils.slug(el.name)} {\n${[...lines, ...st].join('\n')}\n}\n\n${code.textContent}`;
      }
      return r;
    };
    // Modes section in the Design tab
    const comp = document.getElementById('sec-component-props');
    if (comp) {
      const sec = document.createElement('div');
      sec.className = 'prop-section'; sec.id = 'sec-var-modes'; sec.style.display = 'none';
      sec.innerHTML = '<div class="prop-section-header"><span>Variable modes</span><button type="button" class="prop-icon-btn" data-dsm="variables" title="Manage variables" aria-label="Manage variables">⬡</button></div><div id="var-modes-rows"></div>';
      comp.after(sec);
      sec.querySelector('[data-dsm]').addEventListener('click', () => this.openDesignSystem('variables'));
    }
  },

  // ------------------------------------------------------------------ Design panel decorations
  dsTargets() {
    return [
      ['inp-corner-radius', 'cornerRadius'], ['layer-opacity-val', 'opacity'], ['inp-dim-w', 'width'], ['inp-dim-h', 'height'],
      ['al-gap', 'layoutGap'], ['al-padding', 'padding'], ['text-font-size', 'fontSize'], ['text-line-height', 'lineHeight'], ['text-letter-spacing', 'letterSpacing']
    ];
  },
  decorateBindings() {
    const m = this.model, sel = m.topSelected();
    document.querySelectorAll('.var-chip').forEach(c => c.remove());
    const bound = (prop) => { const ids = sel.map(e => e.bindings?.[prop] || null); return ids.length && ids.every(x => x && x === ids[0]) ? ids[0] : null; };
    const decorate = (input, prop) => {
      if (!input || !sel.length) return;
      let btn = input.parentElement.querySelector(`:scope > .var-bind-btn[data-prop="${prop}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'var-bind-btn'; btn.dataset.prop = prop; btn.textContent = '⬡';
        btn.title = `Apply variable to ${dsPropInfo(prop).label}`; btn.setAttribute('aria-label', btn.title);
        input.after(btn);
        btn.addEventListener('click', (e) => { e.stopPropagation(); this.openVarPicker(btn, btn.dataset.prop); });
      }
      const id = bound(prop), v = id && m.varById(id);
      btn.classList.toggle('on', !!id);
      if (id) {
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = `var-chip${v ? '' : ' broken'}`;
        const val = v && m.resolveVar(id, m.modeContext(sel[0], m.elements));
        chip.innerHTML = `${v && v.type === 'color' ? `<i style="background:${Utils.rgba(val)}"></i>` : `<b>${DS_TYPE_ICON[v?.type] || '!'}</b>`}<span>${Utils.escapeHtml(v ? v.name.split('/').pop() : 'Missing variable')}</span><em role="button" aria-label="Detach variable" title="Detach (keep value)">✕</em>`;
        chip.title = v ? `${v.name} = ${m.varDisplay(v, m.modeContext(sel[0], m.elements))} — click to change` : 'This variable was deleted — click to pick another';
        const host = input.parentElement;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        Object.assign(chip.style, { left: `${input.offsetLeft}px`, top: `${input.offsetTop}px`, width: `${Math.max(56, input.offsetWidth)}px`, height: `${input.offsetHeight}px` });
        host.appendChild(chip);
        chip.addEventListener('click', (e) => { e.stopPropagation(); if (e.target.tagName === 'EM') this.unbindVar(prop); else this.openVarPicker(chip, prop); });
      }
    };
    for (const [id, prop] of this.dsTargets()) decorate(document.getElementById(id), prop);
    // QA-20: colour variables only apply to solid fills — on a gradient the button would flatten it
    document.querySelectorAll('#fill-layers-list .paint-block').forEach((row, i) => {
      const solid = sel.every(e => !e.fills[i] || e.fills[i].type === 'solid');
      if (solid) decorate(row.querySelector('.hex-input'), `fills.${i}`);
      else row.querySelectorAll('.var-bind-btn').forEach(x => x.remove());
    });
    document.querySelectorAll('#stroke-layers-list .paint-block, #stroke-layers-list .stroke-block').forEach((row, i) => decorate(row.querySelector('.hex-input'), `strokes.${i}`));
    // text content binding: button on the typography header
    const th = document.querySelector('#sec-text-props .prop-section-header');
    if (th && !th.querySelector('.var-bind-btn')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'var-bind-btn'; b.dataset.prop = 'text'; b.textContent = '⬡T';
      b.title = 'Apply a string variable to the text content'; b.setAttribute('aria-label', b.title);
      th.appendChild(b); b.addEventListener('click', (e) => { e.stopPropagation(); this.openVarPicker(b, 'text'); });
    }
    th?.querySelector('.var-bind-btn')?.classList.toggle('on', !!bound('text'));
    // text / fill style links: show the linked style name above the lists
    this.renderStyleLinks(sel);
    this.renderVarModes(sel);
  },
  renderStyleLinks(sel) {
    const m = this.model;
    document.querySelectorAll('.style-link-chip').forEach(c => c.remove());
    const one = sel.length === 1 ? sel[0] : null;
    if (!one?.styleRefs) return;
    const place = (kind, anchorSel, label) => {
      const id = one.styleRefs[kind]; if (!id) return;
      const s = m.styleById(kind === 'fill' ? 'colors' : kind === 'text' ? 'texts' : 'effects', id);
      const anchor = document.querySelector(anchorSel); if (!anchor) return;
      const chip = document.createElement('div');
      chip.className = 'style-link-chip';
      chip.innerHTML = `<span>🔗 ${label}: <b>${Utils.escapeHtml(s ? s.name : 'missing style')}</b></span><button type="button" data-a="edit">Edit</button><button type="button" data-a="detach" title="Detach style (keeps the look)">Detach</button>`;
      anchor.before(chip);
      chip.querySelector('[data-a="edit"]').addEventListener('click', () => this.openDesignSystem('styles'));
      chip.querySelector('[data-a="detach"]').addEventListener('click', () => { delete one.styleRefs[kind]; this._actionLabel = 'Detach style'; this.commit(); });
    };
    place('fill', '#fill-layers-list', 'Color style');
    place('text', '#sec-text-props .prop-section-header + *', 'Text style');
    place('effect', '#effect-layers-list', 'Effect style');
  },
  renderVarModes(sel) {
    const m = this.model, sec = document.getElementById('sec-var-modes');
    if (!sec) return;
    const one = sel.length === 1 ? sel[0] : null;
    const cols = m.dsVars().collections.filter(c => c.modes.length > 1);
    const show = !!(one && cols.length && (one.type === 'frame' || one.isComponentInstance || one.type === 'group' || !one.parentId));
    sec.style.display = show ? '' : 'none';
    if (!show) return;
    const parentCtx = one.parentId ? m.modeContext(m.parentOf(one), m.elements) : {};
    const rows = document.getElementById('var-modes-rows');
    rows.innerHTML = cols.map(c => {
      const inh = c.modes.find(x => x.id === parentCtx[c.id]) || c.modes.find(x => x.id === c.defaultModeId);
      const cur = one.varModes?.[c.id] || '';
      return `<label class="prop-row"><span class="prop-label">${Utils.escapeHtml(c.name)}</span><select data-col="${c.id}" aria-label="${Utils.escapeHtml(c.name)} mode"><option value="">Auto (${Utils.escapeHtml(inh.name)})</option>${c.modes.map(x => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${Utils.escapeHtml(x.name)}</option>`).join('')}</select></label>`;
    }).join('');
    rows.querySelectorAll('select').forEach(s => s.addEventListener('change', () => {
      one.varModes = Object.assign({}, one.varModes || {});
      if (s.value) one.varModes[s.dataset.col] = s.value; else delete one.varModes[s.dataset.col];
      if (!Object.keys(one.varModes).length) one.varModes = null;
      this._actionLabel = 'Change variable mode';
      this.commit();
    }));
  },
  unbindVar(prop) {
    for (const el of this.model.topSelected()) if (el.bindings?.[prop]) { delete el.bindings[prop]; if (!Object.keys(el.bindings).length) el.bindings = null; this.markOverride(el, 'bindings'); }
    this._actionLabel = 'Detach variable';
    this.commit();
  },
  bindVar(prop, varId) {
    const m = this.model;
    for (const el of m.topSelected()) {
      if (prop.startsWith('strokes.') && !el.strokes[+prop.split('.')[1]]) continue;
      el.bindings = Object.assign({}, el.bindings || {}, { [prop]: varId });
      this.markOverride(el, 'bindings');
    }
    this._actionLabel = 'Apply variable';
    this.commit();
  },
  /** Popover listing variables of the right type; can create one from the current value. */
  openVarPicker(anchor, prop) {
    const m = this.model, info = dsPropInfo(prop), sel = m.topSelected();
    if (!info || !sel.length) return;
    document.getElementById('var-pick')?.remove();
    const pop = document.createElement('div');
    pop.id = 'var-pick'; pop.className = 'var-pick'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', `Variables for ${info.label}`);
    const ctx = m.modeContext(sel[0], m.elements);
    const cur = sel[0].bindings?.[prop];
    const types = info.type === 'string' ? ['string', 'number'] : [info.type];
    const draw = (q = '') => {
      const items = m.dsVars().vars.filter(v => types.includes(v.type) && (!q || v.name.toLowerCase().includes(q)));
      const byCol = {};
      for (const v of items) (byCol[v.collectionId] = byCol[v.collectionId] || []).push(v);
      pop.querySelector('.vp-list').innerHTML = Object.entries(byCol).map(([cid, vs]) => `<div class="vp-col">${Utils.escapeHtml(m.collectionById(cid)?.name || '')}</div>${vs.map(v => {
        const val = m.resolveVar(v.id, ctx);
        return `<button type="button" class="vp-item${v.id === cur ? ' on' : ''}" data-id="${v.id}">${v.type === 'color' ? `<i style="background:${Utils.rgba(val ?? '#000')}"></i>` : `<b>${DS_TYPE_ICON[v.type]}</b>`}<span>${Utils.escapeHtml(v.name)}</span><small>${Utils.escapeHtml(m.varDisplay(v, ctx))}</small></button>`;
      }).join('')}`).join('') || `<div class="muted-text vp-empty">No ${info.type} variables${q ? ' match' : ' yet'}.</div>`;
      pop.querySelectorAll('.vp-item').forEach(b => b.addEventListener('click', () => { pop.remove(); this.bindVar(prop, b.dataset.id); }));
    };
    const curVal = m.dsRead(sel[0], prop);
    pop.innerHTML = `<div class="vp-head"><b>${Utils.escapeHtml(info.label)}</b><input type="search" placeholder="Search variables" aria-label="Search variables"></div><div class="vp-list"></div>
      <div class="vp-foot"><button type="button" data-a="create">＋ Create variable from this value</button>${cur ? '<button type="button" data-a="detach">Detach</button>' : ''}<button type="button" data-a="manage">Manage…</button></div>`;
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, r.right - 280))}px`;
    pop.style.top = `${Math.min(window.innerHeight - 380, r.bottom + 6)}px`;
    draw();
    const q = pop.querySelector('input');
    q.addEventListener('input', () => draw(q.value.trim().toLowerCase()));
    setTimeout(() => q.focus(), 0);
    pop.querySelector('[data-a="manage"]').addEventListener('click', () => { pop.remove(); this.openDesignSystem('variables'); });
    pop.querySelector('[data-a="detach"]')?.addEventListener('click', () => { pop.remove(); this.unbindVar(prop); });
    pop.querySelector('[data-a="create"]').addEventListener('click', async () => {
      const suggested = info.type === 'color' ? 'color/new' : info.type === 'number' ? `${prop === 'cornerRadius' ? 'radius' : prop === 'layoutGap' || prop === 'padding' ? 'space' : 'size'}/new` : 'text/new';
      const name = await this.promptText('New variable', 'Name (use / for groups)', suggested);
      if (!name) return;
      pop.remove();
      const col = m.dsVars().collections[0] || this.addCollection('Tokens');
      let value = curVal;
      if (info.type === 'color') { const p = String(curVal).split('|'); value = Utils.rgba(p[0], Number(p[1] || 1)); if (Utils.alphaOf(value) >= 1) value = Utils.toHex(p[0]); }
      if (prop === 'opacity') value = Math.round(sel[0].opacity * 100);
      if (prop === 'padding') value = sel[0].layoutPaddingTop;
      const v = { id: Utils.uid('v'), collectionId: col.id, name: name.slice(0, 120), type: info.type === 'string' ? 'string' : info.type, description: '', values: {} };
      col.modes.forEach(md => { v.values[md.id] = value; });
      m.dsVars().vars.push(v);
      this.bindVar(prop, v.id);
      Utils.toast(`Variable “${v.name}” created and applied`, '⬡');
    });
    const close = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    document.addEventListener('pointerdown', close, true);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); pop.remove(); anchor.focus?.(); } e.stopPropagation(); });
  },
  promptText(title, label, value = '') {
    return new Promise((res) => {
      let done = false;
      const d = this.dialog({
        title, body: `<label class="dsm-field"><span>${Utils.escapeHtml(label)}</span><input type="text" class="dsm-prompt" value="${Utils.escapeHtml(value)}"></label>`,
        actions: [{ label: 'Cancel', run: () => { done = true; res(null); } }, { label: 'OK', primary: true, run: () => { done = true; res(inp.value.trim() || null); } }]
      });
      const inp = d.el.querySelector('.dsm-prompt');
      setTimeout(() => inp.select(), 20);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; const v = inp.value.trim() || null; d.close(); res(v); } });
      const obs = new MutationObserver(() => { if (!d.el.isConnected) { obs.disconnect(); if (!done) res(null); } });
      obs.observe(document.body, { childList: true });
    });
  },
  /** Assets: applying a style links it (updates when the style changes); entry subtitle. */
  applyStyle(kind, s) {
    const m = this.model, sel = m.topSelected();
    if (!sel.length) { Utils.toast('Select layers to apply this style', 'ℹ️'); return; }
    const key = kind === 'colors' ? 'fill' : kind === 'texts' ? 'text' : 'effect';
    let n = 0;
    for (const el of sel) {
      if (key === 'text' && el.type !== 'text') continue;
      el.styleRefs = Object.assign({}, el.styleRefs || {}, { [key]: s.id });
      if (key === 'fill' && el.bindings?.['fills.0']) delete el.bindings['fills.0'];
      this.markOverride(el, key === 'fill' ? 'fills' : key === 'text' ? 'fontSize' : 'effects');
      n++;
    }
    if (!n) { Utils.toast('Text styles apply to text layers', 'ℹ️'); return; }
    this._actionLabel = 'Apply style';
    this.commit();
    Utils.toast(`Linked “${s.name}” — editing the style updates these layers`, '🔗');
  },
  decorateAssets() {
    const m = this.model, sub = document.querySelector('.dsm-entry-sub');
    if (sub) { const D = m.dsVars(); sub.textContent = `${D.vars.length} variables · ${m.styles.colors.length + m.styles.texts.length + m.styles.effects.length} styles · ${m.masters().length} components`; }
    const used = m.styleUsage();
    const lists = { 'color-styles-list': 'colors', 'text-styles-list': 'texts', 'effect-styles-list': 'effects' };
    for (const [id, kind] of Object.entries(lists)) {
      document.querySelectorAll(`#${id} .style-item`).forEach((row, i) => {
        const s = m.styles[kind].filter(x => { const q = (document.getElementById('assets-search-input')?.value || '').toLowerCase(); return !q || x.name.toLowerCase().includes(q); })[i];
        if (!s) return;
        row.title = 'Click to link this style to the selection';
        const c = row.querySelector('.style-count');
        if (c && used.get(s.id)) c.textContent += ` · 🔗${used.get(s.id)}`;
        if (s.varId && kind === 'colors') { const v = m.varById(s.varId); if (v) row.querySelector('.style-swatch').style.background = Utils.rgba(m.resolveVar(v.id) ?? s.color); }
      });
    }
  },

  // ------------------------------------------------------------------ Manager
  addCollection(name) {
    const D = this.model.dsVars(), mid = Utils.uid('m');
    const c = { id: Utils.uid('vc'), name, modes: [{ id: mid, name: 'Default' }], defaultModeId: mid };
    D.collections.push(c);
    return c;
  },
  openDesignSystem(tab) {
    let ov = document.getElementById('dsm');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'dsm'; ov.className = 'dsm-overlay';
      ov.innerHTML = `<div class="dsm-win" role="dialog" aria-modal="true" aria-labelledby="dsm-title">
        <header class="dsm-head"><b id="dsm-title">⬡ Design system</b><span class="dsm-sum"></span><span class="dsm-sp"></span><input type="search" class="dsm-search" placeholder="Search" aria-label="Search the design system"><button type="button" class="dsm-x" aria-label="Close (Esc)" title="Close (Esc)">✕</button></header>
        <div class="dsm-main"><nav class="dsm-nav" role="tablist" aria-label="Design system sections">
          ${[['variables', '⬡', 'Variables'], ['styles', '🎨', 'Styles'], ['components', '◇', 'Components'], ['health', '✚', 'Health'], ['tokens', '⇄', 'Tokens & code'], ['releases', '🏷', 'Releases']].map(([k, i, l]) => `<button type="button" role="tab" data-tab="${k}"><span>${i}</span>${l}<em class="dsm-badge" data-badge="${k}"></em></button>`).join('')}
        </nav><section class="dsm-body" role="tabpanel"></section></div></div>`;
      document.body.appendChild(ov);
      ov.querySelector('.dsm-x').addEventListener('click', () => this.closeDesignSystem());
      ov.addEventListener('pointerdown', (e) => { if (e.target === ov) this.closeDesignSystem(); });
      document.addEventListener('keydown', (e) => {
        if (ov.style.display !== 'flex' || ov.contains(e.target) || e.key !== 'Escape') return;
        if (document.querySelector('.ds-dialog-overlay, #var-pick') || document.getElementById('color-picker-popover')?.style.display === 'flex') return;
        e.preventDefault(); e.stopImmediatePropagation(); this.closeDesignSystem();
      }, true);
      ov.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('var-pick') && !document.querySelector('.ds-dialog-overlay') && document.getElementById('color-picker-popover')?.style.display !== 'flex') { e.preventDefault(); this.closeDesignSystem(); }
        if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase()) && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) { e.preventDefault(); this.run(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo'); this.renderDSM(); }
        e.stopPropagation();
      });
      ov.querySelectorAll('.dsm-nav [data-tab]').forEach(b => b.addEventListener('click', () => { this.dsm.tab = b.dataset.tab; this.renderDSM(); }));
      ov.querySelector('.dsm-search').addEventListener('input', Utils.debounce(() => { this.dsm.q = ov.querySelector('.dsm-search').value.trim().toLowerCase(); this.renderDSM(); }, 120));
      this.dsm = { tab: 'variables', col: null, q: '', collapsed: new Set() };
    }
    if (tab) this.dsm.tab = tab;
    ov.style.display = 'flex';
    this.dsmPrevFocus = document.activeElement;
    this.renderDSM();
    setTimeout(() => ov.querySelector(`.dsm-nav [data-tab="${this.dsm.tab}"]`)?.focus(), 20);
  },
  closeDesignSystem() {
    const ov = document.getElementById('dsm');
    if (ov) ov.style.display = 'none';
    this.refreshUI?.(); this.renderAssets?.();
    this.dsmPrevFocus?.focus?.();
  },
  /** Commit a design-system edit and redraw the manager, keeping focus. */
  dsCommit(label) {
    this._actionLabel = label;
    this.commit();
    this.renderDSM();
  },
  renderDSM() {
    const ov = document.getElementById('dsm');
    if (!ov || ov.style.display === 'none') return;
    const fk = document.activeElement?.dataset?.fk;
    const body = ov.querySelector('.dsm-body'), scroll = body.querySelector('.dsm-scroll')?.scrollTop || 0;
    ov.querySelectorAll('.dsm-nav [data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === this.dsm.tab); b.setAttribute('aria-selected', b.dataset.tab === this.dsm.tab); });
    const m = this.model, D = m.dsVars();
    ov.querySelector('.dsm-sum').textContent = `${D.collections.length} collection${D.collections.length === 1 ? '' : 's'} · ${D.vars.length} variables · ${m.styles.colors.length + m.styles.texts.length + m.styles.effects.length} styles · ${m.masters().length} components`;
    const issues = this.dsAudit();
    const badge = ov.querySelector('[data-badge="health"]');
    const serious = issues.filter(i => i.level !== 'info').length;
    badge.textContent = serious || ''; badge.classList.toggle('warn', serious > 0);
    const chg = this.dsChanges().length;
    ov.querySelector('[data-badge="releases"]').textContent = (m.dsReleases || []).length && chg ? chg : '';
    body.innerHTML = '';
    ({ variables: this.dsmVariables, styles: this.dsmStyles, components: this.dsmComponents, health: this.dsmHealth, tokens: this.dsmTokens, releases: this.dsmReleases })[this.dsm.tab].call(this, body, issues);
    const sc = body.querySelector('.dsm-scroll'); if (sc) sc.scrollTop = scroll;
    if (fk) body.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus();
  },

  // ---------- Variables tab
  dsmVariables(body) {
    const m = this.model, D = m.dsVars(), S = this.dsm;
    if (!D.collections.some(c => c.id === S.col)) S.col = D.collections[0]?.id || null;
    const col = m.collectionById(S.col);
    const usage = m.varUsage();
    body.innerHTML = `<div class="dsm-split"><aside class="dsm-cols"><div class="dsm-sub">Collections</div>
      ${D.collections.map(c => `<button type="button" class="dsm-col${c.id === S.col ? ' on' : ''}" data-col="${c.id}" data-fk="col-${c.id}">${Utils.escapeHtml(c.name)}<small>${D.vars.filter(v => v.collectionId === c.id).length}</small></button>`).join('')}
      <button type="button" class="dsm-add" data-a="add-col" data-fk="add-col">＋ Collection</button>
      ${col ? `<div class="dsm-col-tools"><button type="button" data-a="ren-col">Rename</button><button type="button" data-a="del-col" class="danger">Delete</button></div>` : ''}
      <div class="dsm-hint">Collections hold related tokens (e.g. Primitives, Semantic). Modes are columns (Light / Dark, brands, densities). Select a frame and pick its mode in the Design panel.</div></aside>
      <div class="dsm-pane">${col ? `<div class="dsm-tool"><span class="dsm-addvar"><button type="button" class="btn-primary" data-a="add-var" data-fk="add-var">＋ Variable</button><select data-a="add-type" aria-label="Variable type"><option value="color">Color</option><option value="number">Number</option><option value="string">String</option><option value="boolean">Boolean</option></select></span><button type="button" data-a="add-mode">＋ Mode</button><span class="dsm-sp"></span><span class="muted-text">Tip: name with “/” to group (color/brand/500). Click ⤳ to alias another variable.</span></div>
        <div class="dsm-scroll"><table class="dsm-table"><thead><tr><th>Name</th>${col.modes.map(md => `<th><span class="dsm-mode" data-mode="${md.id}" tabindex="0" title="Double-click to rename">${Utils.escapeHtml(md.name)}${md.id === col.defaultModeId ? ' <small>default</small>' : ''}</span>${col.modes.length > 1 ? `<button type="button" class="dsm-mini" data-a="mode-menu" data-mode="${md.id}" aria-label="Mode options">⋯</button>` : ''}</th>`).join('')}<th class="dsm-used">Used</th><th></th></tr></thead><tbody></tbody></table></div>` : '<div class="dsm-empty">Create a collection to start adding variables.</div>'}</div></div>`;
    const tb = body.querySelector('tbody');
    if (col && tb) {
      const vars = D.vars.filter(v => v.collectionId === col.id && (!S.q || v.name.toLowerCase().includes(S.q)));
      if (!vars.length) tb.innerHTML = `<tr><td colspan="${col.modes.length + 3}" class="dsm-empty">${S.q ? 'No variables match.' : 'No variables yet — press ＋ Variable.'}</td></tr>`;
      let lastGroup = null;
      const sorted = vars.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const v of sorted) {
        const group = v.name.includes('/') ? v.name.slice(0, v.name.lastIndexOf('/')) : '';
        if (group !== lastGroup) {
          lastGroup = group;
          if (group) { const tr = document.createElement('tr'); tr.className = 'dsm-group'; tr.innerHTML = `<td colspan="${col.modes.length + 3}"><button type="button" data-group="${Utils.escapeHtml(group)}" aria-expanded="${!S.collapsed.has(group)}">${S.collapsed.has(group) ? '▸' : '▾'} ${Utils.escapeHtml(group)}</button></td>`; tb.appendChild(tr); }
        }
        if (group && S.collapsed.has(group)) continue;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="dsm-name"><b class="dsm-ti">${DS_TYPE_ICON[v.type]}</b><input type="text" data-k="name" data-fk="n-${v.id}" value="${Utils.escapeHtml(v.name)}" aria-label="Variable name" title="${Utils.escapeHtml(v.description || v.name)}"></td>
          ${col.modes.map(md => `<td>${this.dsmValueCell(v, md.id)}</td>`).join('')}
          <td class="dsm-used">${usage.get(v.id) ? `<button type="button" class="dsm-link" data-a="select-users" title="Select layers using it">${usage.get(v.id)}</button>` : '<span class="muted-text">0</span>'}</td>
          <td class="dsm-row-act"><button type="button" class="dsm-mini" data-a="dup" title="Duplicate" aria-label="Duplicate variable">⧉</button><button type="button" class="dsm-mini danger" data-a="del" title="Delete" aria-label="Delete variable">🗑</button></td>`;
        tr.dataset.id = v.id;
        tb.appendChild(tr);
      }
      tb.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => { const g = b.dataset.group; S.collapsed.has(g) ? S.collapsed.delete(g) : S.collapsed.add(g); this.renderDSM(); }));
      tb.querySelectorAll('tr[data-id]').forEach(tr => this.dsmBindVarRow(tr, m.varById(tr.dataset.id), col));
    }
    body.querySelectorAll('[data-col]').forEach(b => b.addEventListener('click', () => { S.col = b.dataset.col; this.renderDSM(); }));
    const act = (a, fn) => body.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
    act('add-col', async () => { const n = await this.promptText('New collection', 'Name', 'Primitives'); if (!n) return; S.col = this.addCollection(n).id; this.dsCommit('Add collection'); });
    act('ren-col', async () => { const n = await this.promptText('Rename collection', 'Name', col.name); if (!n) return; col.name = n; this.dsCommit('Rename collection'); });
    act('del-col', () => {
      const n = D.vars.filter(v => v.collectionId === col.id).length;
      this.dialog({ title: `Delete “${col.name}”?`, body: `<p>${n} variable${n === 1 ? '' : 's'} will be removed. Layers using them keep their current values.</p>`, actions: [{ label: 'Cancel' }, { label: 'Delete', primary: true, run: () => { D.vars.filter(v => v.collectionId === col.id).forEach(v => m.deleteVariable(v.id)); D.collections = D.collections.filter(c => c.id !== col.id); S.col = null; this.dsCommit('Delete collection'); } }] });
    });
    act('add-var', () => {
      const type = body.querySelector('[data-a="add-type"]').value;
      const base = { color: 'color/new', number: 'size/new', string: 'text/new', boolean: 'flag/new' }[type];
      let name = base, i = 2; while (D.vars.some(v => v.collectionId === col.id && v.name === name)) name = `${base}-${i++}`;
      const def = { color: '#0d99ff', number: 0, string: '', boolean: true }[type];
      const v = { id: Utils.uid('v'), collectionId: col.id, name, type, description: '', values: Object.fromEntries(col.modes.map(md => [md.id, def])) };
      D.vars.push(v);
      this.dsCommit('Add variable');
      const inp = body.ownerDocument.querySelector(`[data-fk="n-${v.id}"]`); if (inp) { inp.focus(); inp.select(); }
    });
    act('add-mode', async () => {
      const n = await this.promptText('New mode', 'Mode name', col.modes.length === 1 ? 'Dark' : `Mode ${col.modes.length + 1}`); if (!n) return;
      const md = { id: Utils.uid('m'), name: n };
      for (const v of D.vars.filter(x => x.collectionId === col.id)) v.values[md.id] = JSON.parse(JSON.stringify(v.values[col.defaultModeId] ?? null));
      col.modes.push(md);
      this.dsCommit('Add mode');
    });
    body.querySelectorAll('.dsm-mode').forEach(s => {
      const rename = async () => { const md = col.modes.find(x => x.id === s.dataset.mode); const n = await this.promptText('Rename mode', 'Name', md.name); if (n) { md.name = n; this.dsCommit('Rename mode'); } };
      s.addEventListener('dblclick', rename);
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'F2') rename(); });
    });
    body.querySelectorAll('[data-a="mode-menu"]').forEach(b => b.addEventListener('click', () => {
      const md = col.modes.find(x => x.id === b.dataset.mode);
      this.dialog({
        title: `Mode “${md.name}”`, body: '<p class="muted-text">Default mode is used wherever no mode is chosen.</p>',
        actions: [{ label: 'Cancel' }, { label: 'Make default', run: () => { col.defaultModeId = md.id; this.dsCommit('Default mode'); } },
          { label: 'Delete mode', primary: true, run: () => { col.modes = col.modes.filter(x => x.id !== md.id); if (col.defaultModeId === md.id) col.defaultModeId = col.modes[0].id; for (const v of D.vars) delete v.values[md.id]; for (const el of m.allElements()) if (el.varModes?.[col.id] === md.id) delete el.varModes[col.id]; this.dsCommit('Delete mode'); } }]
      });
    }));
  },
  dsmValueCell(v, modeId) {
    const m = this.model, raw = v.values[modeId], fk = `${v.id}-${modeId}`;
    if (raw && typeof raw === 'object' && raw.alias) {
      const t = m.varById(raw.alias);
      const val = m.resolveVar(v.id, { [v.collectionId]: modeId });
      return `<span class="dsm-alias${t ? '' : ' broken'}">${v.type === 'color' ? `<i style="background:${Utils.rgba(val ?? '#000')}"></i>` : ''}<button type="button" data-a="alias" data-mode="${modeId}" data-fk="a-${fk}" title="Change alias">⤳ ${Utils.escapeHtml(t ? t.name : 'missing')}</button><button type="button" class="dsm-mini" data-a="unalias" data-mode="${modeId}" title="Use a fixed value" aria-label="Remove alias">✕</button></span>`;
    }
    const alias = `<button type="button" class="dsm-mini" data-a="alias" data-mode="${modeId}" title="Alias another variable" aria-label="Alias another variable">⤳</button>`;
    switch (v.type) {
      case 'color': return `<span class="dsm-val"><button type="button" class="dsm-sw" data-a="color" data-mode="${modeId}" data-fk="c-${fk}" style="background:${Utils.rgba(raw ?? '#000')}" aria-label="Pick color"></button><input type="text" data-mode="${modeId}" data-fk="v-${fk}" value="${Utils.escapeHtml(Utils.toHex(raw ?? '#000').toUpperCase() + (Utils.alphaOf(raw) < 1 ? Math.round(Utils.alphaOf(raw) * 255).toString(16).padStart(2, '0').toUpperCase() : ''))}" aria-label="Value" spellcheck="false">${alias}</span>`;
      case 'number': return `<span class="dsm-val"><input type="number" step="any" data-mode="${modeId}" data-fk="v-${fk}" value="${Utils.escapeHtml(raw ?? 0)}" aria-label="Value">${alias}</span>`;
      case 'boolean': return `<span class="dsm-val"><label class="dsm-bool"><input type="checkbox" data-mode="${modeId}" data-fk="v-${fk}"${raw ? ' checked' : ''}> ${raw ? 'true' : 'false'}</label>${alias}</span>`;
      default: return `<span class="dsm-val"><input type="text" data-mode="${modeId}" data-fk="v-${fk}" value="${Utils.escapeHtml(raw ?? '')}" aria-label="Value">${alias}</span>`;
    }
  },
  dsmBindVarRow(tr, v, col) {
    const m = this.model, D = m.dsVars();
    tr.querySelector('[data-k="name"]').addEventListener('change', (e) => {
      const n = e.target.value.trim().replace(/\s*\/\s*/g, '/');
      if (!n) { e.target.value = v.name; return; }
      if (D.vars.some(x => x !== v && x.collectionId === v.collectionId && x.name === n)) { Utils.toast('A variable with that name already exists in this collection', '⚠️'); e.target.value = v.name; return; }
      v.name = n; this.dsCommit('Rename variable');
    });
    tr.querySelectorAll('.dsm-val input').forEach(inp => inp.addEventListener('change', () => {
      const md = inp.dataset.mode;
      if (v.type === 'color') { let t = inp.value.trim(); if (/^[0-9a-f]{3,8}$/i.test(t)) t = `#${t}`; if (!Utils.parseColor(t)) { Utils.toast('Not a color — use #RRGGBB, #RRGGBBAA or rgba()', '⚠️'); inp.value = Utils.toHex(v.values[md]); return; } v.values[md] = t; }
      else if (v.type === 'number') v.values[md] = Utils.num(inp.value, 0);
      else if (v.type === 'boolean') v.values[md] = inp.checked;
      else v.values[md] = inp.value;
      this.dsCommit('Edit variable');
    }));
    tr.querySelectorAll('[data-a="color"]').forEach(b => b.addEventListener('click', () => {
      const md = b.dataset.mode, c = v.values[md];
      this.openColorPicker(b, Utils.toHex(c), Utils.alphaOf(c), (h, a) => { v.values[md] = a < 1 ? Utils.rgba(h, a) : h; b.style.background = Utils.rgba(h, a); this.model.applyDesignSystem('pre'); this.requestRender(); }, { onClose: () => this.renderDSM() });
    }));
    tr.querySelectorAll('[data-a="alias"]').forEach(b => b.addEventListener('click', () => this.dsmAliasPicker(b, v, b.dataset.mode)));
    tr.querySelectorAll('[data-a="unalias"]').forEach(b => b.addEventListener('click', () => { const md = b.dataset.mode; v.values[md] = m.resolveVar(v.id, { [v.collectionId]: md }) ?? ({ color: '#000000', number: 0, string: '', boolean: false })[v.type]; this.dsCommit('Remove alias'); }));
    tr.querySelector('[data-a="dup"]').addEventListener('click', () => { const c = JSON.parse(JSON.stringify(v)); c.id = Utils.uid('v'); c.name = `${v.name}-copy`; D.vars.push(c); this.dsCommit('Duplicate variable'); });
    tr.querySelector('[data-a="del"]').addEventListener('click', () => {
      const n = m.varUsage().get(v.id) || 0;
      const go = () => { m.deleteVariable(v.id); this.dsCommit('Delete variable'); };
      if (!n) { go(); Utils.toast(`Deleted “${v.name}”`, '🗑', { action: { label: 'Undo', run: () => { this.run('undo'); this.renderDSM(); } } }); return; }
      this.dialog({ title: `Delete “${v.name}”?`, body: `<p>It is used ${n} time${n === 1 ? '' : 's'}. Layers keep their current look; aliases become fixed values.</p>`, actions: [{ label: 'Cancel' }, { label: 'Delete', primary: true, run: go }] });
    });
    tr.querySelector('[data-a="select-users"]')?.addEventListener('click', () => {
      const ids = m.elements.filter(e => e.bindings && Object.values(e.bindings).includes(v.id)).map(e => e.id);
      if (!ids.length) { Utils.toast('Used by aliases, styles or layers on other pages', 'ℹ️'); return; }
      this.closeDesignSystem(); m.select(ids); this.zoomSelection?.(); this.selectionChanged();
    });
  },
  dsmAliasPicker(anchor, v, modeId) {
    const m = this.model;
    const opts = m.dsVars().vars.filter(x => x.type === v.type && x.id !== v.id && !this.dsWouldLoop(v.id, x.id));
    document.getElementById('var-pick')?.remove();
    const pop = document.createElement('div');
    pop.id = 'var-pick'; pop.className = 'var-pick';
    pop.innerHTML = `<div class="vp-head"><b>Alias for ${Utils.escapeHtml(v.name)}</b><input type="search" placeholder="Search" aria-label="Search variables"></div><div class="vp-list"></div>`;
    document.body.appendChild(pop);
    const draw = (q = '') => {
      pop.querySelector('.vp-list').innerHTML = opts.filter(x => !q || x.name.toLowerCase().includes(q)).map(x => `<button type="button" class="vp-item" data-id="${x.id}">${x.type === 'color' ? `<i style="background:${Utils.rgba(m.resolveVar(x.id) ?? '#000')}"></i>` : `<b>${DS_TYPE_ICON[x.type]}</b>`}<span>${Utils.escapeHtml(x.name)}</span><small>${Utils.escapeHtml(m.collectionById(x.collectionId)?.name || '')}</small></button>`).join('') || '<div class="muted-text vp-empty">No other variables of this type.</div>';
      pop.querySelectorAll('.vp-item').forEach(b => b.addEventListener('click', () => { v.values[modeId] = { alias: b.dataset.id }; pop.remove(); this.dsCommit('Alias variable'); }));
    };
    draw();
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 300, r.left))}px`; pop.style.top = `${Math.min(window.innerHeight - 380, r.bottom + 4)}px`;
    const q = pop.querySelector('input'); q.addEventListener('input', () => draw(q.value.trim().toLowerCase())); setTimeout(() => q.focus(), 0);
    const close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    document.addEventListener('pointerdown', close, true);
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); pop.remove(); } e.stopPropagation(); });
  },
  dsWouldLoop(fromId, toId) {
    const m = this.model, seen = new Set([fromId]);
    const walk = (id) => { if (seen.has(id)) return true; seen.add(id); const x = m.varById(id); return !!x && Object.values(x.values).some(y => y && y.alias && walk(y.alias)); };
    return walk(toId);
  },

  // ---------- Styles tab
  dsmStyles(body) {
    const m = this.model, used = m.styleUsage(), q = this.dsm.q;
    const ok = (s) => !q || s.name.toLowerCase().includes(q);
    const colorVars = m.dsVars().vars.filter(v => v.type === 'color');
    const fonts = [...(document.getElementById('text-font-family')?.options || [])].map(o => [o.value, o.textContent]);
    const sec = (kind, title, rows) => `<div class="dsm-sec"><div class="dsm-sec-h"><b>${title}</b><button type="button" data-new="${kind}">＋ New</button>${kind !== 'colors' ? '' : '<span class="muted-text">Link a color style to a variable so it follows modes.</span>'}</div>${rows || '<div class="dsm-empty">None yet.</div>'}</div>`;
    const users = (s) => used.get(s.id) ? `<button type="button" class="dsm-link" data-users="${s.id}">${used.get(s.id)} layer${used.get(s.id) === 1 ? '' : 's'}</button>` : '<span class="muted-text">unused</span>';
    body.innerHTML = `<div class="dsm-scroll dsm-pad">
      ${sec('colors', 'Color styles', m.styles.colors.filter(ok).map(s => `<div class="dsm-style" data-kind="colors" data-id="${s.id}"><button type="button" class="dsm-sw" data-a="color" style="background:${Utils.rgba(m.styleColor(s, {}))}" aria-label="Pick color"${s.varId ? ' disabled' : ''}></button><input type="text" data-k="name" data-fk="sn-${s.id}" value="${Utils.escapeHtml(s.name)}" aria-label="Style name"><select data-k="varId" aria-label="Linked variable"><option value="">Fixed color ${Utils.escapeHtml(Utils.toHex(s.color).toUpperCase())}</option>${colorVars.map(v => `<option value="${v.id}"${v.id === s.varId ? ' selected' : ''}>⬡ ${Utils.escapeHtml(v.name)}</option>`).join('')}</select>${users(s)}<button type="button" class="dsm-mini danger" data-a="del" aria-label="Delete style">🗑</button></div>`).join(''))}
      ${sec('texts', 'Text styles', m.styles.texts.filter(ok).map(s => `<div class="dsm-style" data-kind="texts" data-id="${s.id}"><span class="dsm-ag" style="font-family:${Utils.escapeHtml(s.fontFamily)};font-weight:${s.fontWeight}">Ag</span><input type="text" data-k="name" data-fk="sn-${s.id}" value="${Utils.escapeHtml(s.name)}" aria-label="Style name">
        <label>Font<select data-k="fontFamily">${fonts.map(f => `<option value="${Utils.escapeHtml(f[0])}"${f[0] === s.fontFamily ? ' selected' : ''}>${Utils.escapeHtml(f[1])}</option>`).join('')}${fonts.some(f => f[0] === s.fontFamily) ? '' : `<option selected value="${Utils.escapeHtml(s.fontFamily)}">${Utils.escapeHtml(s.fontFamily.split(',')[0].replace(/["']/g, ''))}</option>`}</select></label><label>Size<input type="number" data-k="fontSize" value="${s.fontSize}" min="1"></label><label>Weight<select data-k="fontWeight">${[100, 200, 300, 400, 500, 600, 700, 800, 900].map(w => `<option${w === s.fontWeight ? ' selected' : ''}>${w}</option>`).join('')}</select></label><label>Line<input type="number" data-k="lineHeight" value="${s.lineHeight || 0}" min="0" title="0 = auto"></label><label>Track<input type="number" data-k="letterSpacing" value="${s.letterSpacing || 0}" step="0.1"></label>${users(s)}<button type="button" class="dsm-mini danger" data-a="del" aria-label="Delete style">🗑</button></div>`).join(''))}
      ${sec('effects', 'Effect styles', m.styles.effects.filter(ok).map(s => `<div class="dsm-style" data-kind="effects" data-id="${s.id}"><span class="dsm-fx" style="box-shadow:${s.effects.filter(e => e.type === 'dropShadow').map(e => `${e.x}px ${e.y}px ${e.blur}px ${Utils.rgba(e.color)}`).join(',') || 'none'}"></span><input type="text" data-k="name" data-fk="sn-${s.id}" value="${Utils.escapeHtml(s.name)}" aria-label="Style name"><span class="muted-text">${s.effects.length} effect${s.effects.length === 1 ? '' : 's'}</span><button type="button" data-a="from-sel" title="Replace with the selected layer’s effects">Use selection’s effects</button>${users(s)}<button type="button" class="dsm-mini danger" data-a="del" aria-label="Delete style">🗑</button></div>`).join(''))}
      <p class="dsm-hint">Styles applied from Assets are <b>linked</b>: edit them here and every layer using them updates. Editing a layer’s value by hand detaches it.</p></div>`;
    body.querySelectorAll('.dsm-style').forEach(row => {
      const kind = row.dataset.kind, s = m.styles[kind].find(x => x.id === row.dataset.id);
      row.querySelectorAll('[data-k]').forEach(f => f.addEventListener('change', () => {
        const k = f.dataset.k;
        if (k === 'name') { if (!f.value.trim()) { f.value = s.name; return; } s.name = f.value.trim(); }
        else if (k === 'varId') { s.varId = f.value || null; if (s.varId) s.color = m.resolveVar(s.varId) ?? s.color; }
        else if (k === 'fontFamily') s.fontFamily = f.value;
        else s[k] = Utils.num(f.value, s[k]);
        this.dsCommit('Edit style');
      }));
      row.querySelector('[data-a="color"]')?.addEventListener('click', (e) => this.openColorPicker(e.currentTarget, Utils.toHex(s.color), Utils.alphaOf(s.color), (h, a) => { s.color = a < 1 ? Utils.rgba(h, a) : h; e.currentTarget.style.background = Utils.rgba(h, a); m.applyDesignSystem('pre'); this.requestRender(); }, { onClose: () => this.renderDSM() }));
      row.querySelector('[data-a="from-sel"]')?.addEventListener('click', () => { const el = m.topSelected()[0]; if (!el?.effects.length) { Utils.toast('Select a layer with effects first', 'ℹ️'); return; } s.effects = JSON.parse(JSON.stringify(el.effects)); this.dsCommit('Edit style'); });
      row.querySelector('[data-a="del"]').addEventListener('click', () => {
        m.styles[kind] = m.styles[kind].filter(x => x.id !== s.id);
        for (const el of m.allElements()) if (el.styleRefs) { for (const [k2, id] of Object.entries(el.styleRefs)) if (id === s.id) delete el.styleRefs[k2]; if (!Object.keys(el.styleRefs).length) el.styleRefs = null; }
        this.dsCommit('Delete style');
      });
      row.querySelector('[data-users]')?.addEventListener('click', () => { const ids = m.elements.filter(e => e.styleRefs && Object.values(e.styleRefs).includes(s.id)).map(e => e.id); this.closeDesignSystem(); m.select(ids); this.zoomSelection?.(); this.selectionChanged(); });
    });
    body.querySelectorAll('[data-new]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.new, el = m.topSelected()[0];
      if (k === 'colors') m.styles.colors.push({ id: Utils.uid('c'), name: 'New color', color: el?.fills.find(f => f.type === 'solid')?.color || '#0d99ff', varId: null });
      else if (k === 'texts') m.styles.texts.push({ id: Utils.uid('t'), name: 'New text', fontFamily: el?.type === 'text' ? el.fontFamily : DEFAULT_FONT, fontSize: el?.type === 'text' ? el.fontSize : 16, fontWeight: el?.type === 'text' ? el.fontWeight : 400, lineHeight: el?.type === 'text' ? el.lineHeight : 24, letterSpacing: 0 });
      else m.styles.effects.push({ id: Utils.uid('e'), name: 'New effect', effects: el?.effects.length ? JSON.parse(JSON.stringify(el.effects)) : [{ type: 'dropShadow', x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.25)', visible: true }] });
      this.dsCommit('New style');
      const rows = body.ownerDocument.querySelectorAll(`.dsm-style[data-kind="${k}"] [data-k="name"]`); const last = rows[rows.length - 1]; last?.focus(); last?.select();
    }));
  },

  // ---------- Components tab
  dsmComponents(body) {
    const m = this.model, q = this.dsm.q, all = m.allElements();
    const masters = m.masters().filter(c => !this.componentSetOf?.(c));
    const sets = all.filter(e => e.isComponentSet);
    const items = [...sets, ...masters].filter(c => !q || c.name.toLowerCase().includes(q));
    const countInst = (ids) => all.filter(e => e.isComponentInstance && ids.includes(e.masterComponentId)).length;
    body.innerHTML = `<div class="dsm-tool"><button type="button" class="btn-primary" data-a="create">◇ Create component from selection</button><span class="dsm-sp"></span><span class="muted-text">${masters.length + sets.length} components · ${all.filter(e => e.isComponentInstance).length} instances</span></div>
      <div class="dsm-scroll"><div class="dsm-comp-grid">${items.map(c => {
        const variants = c.isComponentSet ? all.filter(e => e.parentId === c.id && e.isComponentMaster) : [];
        const ids = c.isComponentSet ? variants.map(v => v.id) : [c.id];
        return `<div class="dsm-comp" data-id="${c.id}"><div class="dsm-thumb" data-thumb="${c.id}"></div><input type="text" data-k="name" data-fk="cn-${c.id}" value="${Utils.escapeHtml(c.name)}" aria-label="Component name"><textarea data-k="description" rows="2" placeholder="Description — when to use it" aria-label="Description">${Utils.escapeHtml(c.description || '')}</textarea>
          <div class="dsm-meta">${c.isComponentSet ? `❖ ${variants.length} variants · ` : ''}${countInst(ids)} instances${(c.componentProps || []).length ? ` · ${c.componentProps.length} props` : ''}</div>
          <div class="dsm-comp-act"><button type="button" data-a="goto">Go to</button><button type="button" data-a="inst">Select instances</button><button type="button" data-a="new">＋ Instance</button></div></div>`;
      }).join('') || `<div class="dsm-empty">${q ? 'No components match.' : 'No components yet. Select a layer and press “Create component from selection” (Ctrl+Alt+K).'}</div>`}</div></div>`;
    body.querySelectorAll('[data-thumb]').forEach(t => {
      const c = m.findAnywhere(t.dataset.thumb);
      try { const page = m.pageOf(c.id), saved = m.currentPageId; m.currentPageId = page.id; const cv = this.renderer.renderToCanvas({ roots: [c], scale: Math.min(2, 160 / Math.max(c.width, c.height, 1)), maxSize: 320 }); m.currentPageId = saved; t.appendChild(cv); } catch (e) { t.textContent = '◇'; }
    });
    body.querySelector('[data-a="create"]').addEventListener('click', () => { if (!m.topSelected().length) { Utils.toast('Select layers on the canvas first', 'ℹ️'); return; } this.run('createComp'); this.renderDSM(); });
    body.querySelectorAll('.dsm-comp').forEach(card => {
      const c = m.findAnywhere(card.dataset.id);
      card.querySelectorAll('[data-k]').forEach(f => f.addEventListener('change', () => { if (f.dataset.k === 'name' && !f.value.trim()) { f.value = c.name; return; } c[f.dataset.k] = f.dataset.k === 'name' ? f.value.trim() : f.value.slice(0, 2000); this.dsCommit('Edit component'); }));
      const goto = () => { const page = m.pageOf(c.id); this.closeDesignSystem(); if (page && page.id !== m.currentPageId) this.switchPage(page.id); m.select([c.id]); this.zoomSelection?.(); this.selectionChanged(); };
      card.querySelector('[data-a="goto"]').addEventListener('click', goto);
      card.querySelector('[data-a="inst"]').addEventListener('click', () => {
        const ids = c.isComponentSet ? m.allElements().filter(e => e.parentId === c.id).map(e => e.id) : [c.id];
        const inst = m.elements.filter(e => e.isComponentInstance && ids.includes(e.masterComponentId)).map(e => e.id);
        if (!inst.length) { Utils.toast('No instances on this page', 'ℹ️'); return; }
        this.closeDesignSystem(); m.select(inst); this.zoomSelection?.(); this.selectionChanged();
      });
      card.querySelector('[data-a="new"]').addEventListener('click', () => { const target = c.isComponentSet ? m.allElements().find(e => e.parentId === c.id && e.isComponentMaster) : c; if (!target) return; this.closeDesignSystem(); this.createInstance(target.id, this.viewCenter(target)); });
    });
  },

  // ---------- Health tab
  /** Audit: problems with a one-click fix where possible. */
  dsAudit() {
    const m = this.model, D = m.dsVars(), out = [];
    const all = m.allElements(), varIds = new Set(D.vars.map(v => v.id));
    // broken bindings / styles
    const brokenB = all.filter(e => e.bindings && Object.values(e.bindings).some(id => !varIds.has(id)));
    if (brokenB.length) out.push({ level: 'error', title: `${brokenB.length} layer${brokenB.length === 1 ? '' : 's'} use a deleted variable`, detail: 'They keep their last value but no longer follow the system.', fix: 'Detach', run: () => brokenB.forEach(e => { for (const [p, id] of Object.entries(e.bindings)) if (!varIds.has(id)) delete e.bindings[p]; if (!Object.keys(e.bindings).length) e.bindings = null; }) });
    const styleIds = new Set([...m.styles.colors, ...m.styles.texts, ...m.styles.effects].map(s => s.id));
    const brokenS = all.filter(e => e.styleRefs && Object.values(e.styleRefs).some(id => !styleIds.has(id)));
    if (brokenS.length) out.push({ level: 'error', title: `${brokenS.length} layer${brokenS.length === 1 ? '' : 's'} link to a deleted style`, fix: 'Detach', run: () => brokenS.forEach(e => { for (const [k, id] of Object.entries(e.styleRefs)) if (!styleIds.has(id)) delete e.styleRefs[k]; if (!Object.keys(e.styleRefs).length) e.styleRefs = null; }) });
    // aliases
    for (const v of D.vars) for (const [md, x] of Object.entries(v.values)) {
      if (!(x && x.alias)) continue;
      const t = m.varById(x.alias);
      if (!t || t.type !== v.type || m.aliasLoops(v.id)) out.push({ level: 'error', title: `“${v.name}” has a broken alias`, detail: !t ? 'Its target was deleted.' : t.type !== v.type ? `It points at a ${t.type} variable.` : 'Aliases loop back to themselves.', fix: 'Use fixed value', run: () => { v.values[md] = ({ color: '#000000', number: 0, string: '', boolean: false })[v.type]; } });
    }
    // missing mode values
    for (const c of D.collections) for (const v of D.vars.filter(x => x.collectionId === c.id)) {
      const miss = c.modes.filter(md => v.values[md.id] === undefined);
      if (miss.length) out.push({ level: 'warn', title: `“${v.name}” has no value for ${miss.map(x => x.name).join(', ')}`, fix: 'Copy default value', run: () => miss.forEach(md => { v.values[md.id] = JSON.parse(JSON.stringify(v.values[c.defaultModeId] ?? null)); }) });
    }
    // duplicate names
    const seen = new Map();
    for (const v of D.vars) { const k = `${v.collectionId}|${v.name}`; if (seen.has(k)) out.push({ level: 'warn', title: `Duplicate variable name “${v.name}”`, fix: 'Rename', run: () => { v.name = `${v.name}-2`; } }); seen.set(k, v); }
    // hardcoded colors matching a color variable (default modes)
    const colorMap = new Map();
    for (const v of D.vars.filter(x => x.type === 'color')) { const val = m.resolveVar(v.id); if (val !== undefined) { const k = Utils.toHex(val) + Math.round(Utils.alphaOf(val) * 100); colorMap.set(k, [...(colorMap.get(k) || []), v]); } }
    // several tokens can share a value: prefer the one whose name fits the layer's role (text vs. surface)
    const pick = (list, e) => { const isText = e.type === 'text'; const score = (v) => { const n = v.name.toLowerCase(); return (isText ? /(text|on-|foreground|fg)/.test(n) : /(background|surface|bg|primary|fill|border)/.test(n) && !/(text|on-)/.test(n)) * 2 + (D.collections[0] && v.collectionId !== D.collections.find(c => /primitive/i.test(c.name))?.id ? 1 : 0); }; return list.slice().sort((a, b) => score(b) - score(a))[0]; };
    const matches = [];
    let total = 0, bound = 0;
    for (const page of m.pages) for (const e of page.elements) {
      if (e.masterChildId || e.isComponentSet) continue;
      e.fills.forEach((f, i) => {
        if (f.type !== 'solid' || f.visible === false) return;
        total++;
        if (e.bindings?.[`fills.${i}`] || (i === 0 && e.styleRefs?.fill)) { bound++; return; }
        const list = colorMap.get(Utils.toHex(f.color) + Math.round((f.opacity ?? 1) * 100));
        if (list) matches.push({ e, prop: `fills.${i}`, v: pick(list, e) });
      });
    }
    if (matches.length) out.push({ level: 'warn', title: `${matches.length} fill${matches.length === 1 ? '' : 's'} hard-code a token color`, detail: `e.g. ${matches.slice(0, 3).map(x => `“${x.e.name}” → ${x.v.name}`).join(', ')}`, fix: 'Bind to variables', run: () => matches.forEach(x => { x.e.bindings = Object.assign({}, x.e.bindings || {}, { [x.prop]: x.v.id }); }) });
    // text layers matching a text style
    const tMatches = [];
    for (const e of all) if (e.type === 'text' && !e.masterChildId && !e.styleRefs?.text) { const s = m.styles.texts.find(t => t.fontSize === e.fontSize && t.fontWeight === e.fontWeight && (t.lineHeight || 0) === (e.lineHeight || 0) && t.fontFamily === e.fontFamily); if (s) tMatches.push({ e, s }); }
    if (tMatches.length) out.push({ level: 'warn', title: `${tMatches.length} text layer${tMatches.length === 1 ? '' : 's'} match a text style but aren’t linked`, fix: 'Link styles', run: () => tMatches.forEach(x => { x.e.styleRefs = Object.assign({}, x.e.styleRefs || {}, { text: x.s.id }); }) });
    // orphan instances
    const orphans = all.filter(e => e.isComponentInstance && !m.findAnywhere(e.masterComponentId));
    if (orphans.length) out.push({ level: 'error', title: `${orphans.length} instance${orphans.length === 1 ? '' : 's'} lost their main component`, fix: 'Detach', run: () => orphans.forEach(e => { e.isComponentInstance = false; e.masterComponentId = null; }) });
    // unused
    const usage = m.varUsage(), unused = D.vars.filter(v => !usage.get(v.id));
    if (unused.length) out.push({ level: 'info', title: `${unused.length} unused variable${unused.length === 1 ? '' : 's'}`, detail: unused.slice(0, 6).map(v => v.name).join(', ') + (unused.length > 6 ? '…' : ''), fix: 'Delete unused', confirm: true, run: () => unused.forEach(v => m.deleteVariable(v.id)) });
    const noDesc = m.masters().filter(c => !this.componentSetOf?.(c) && !c.description);
    if (noDesc.length) out.push({ level: 'info', title: `${noDesc.length} component${noDesc.length === 1 ? '' : 's'} without a description`, detail: 'Descriptions show in Assets and help teammates pick the right one.', fix: 'Open Components', run: () => { this.dsm.tab = 'components'; }, noCommit: true });
    out.coverage = total ? Math.round(bound / total * 100) : 100;
    return out;
  },
  dsmHealth(body, issues) {
    const lvl = { error: ['⛔', 'Error'], warn: ['⚠️', 'Warning'], info: ['ℹ️', 'Info'] };
    const fixable = issues.filter(i => i.run && i.level !== 'info');
    body.innerHTML = `<div class="dsm-scroll dsm-pad"><div class="dsm-score"><div class="dsm-ring" style="--p:${issues.coverage}"><b>${issues.coverage}%</b></div><div><b>Token coverage</b><p class="muted-text">Share of solid fills that use a variable or color style. Raise it with “Bind to variables”.</p></div>${fixable.length ? `<button type="button" class="btn-primary" data-a="fix-all">Fix all (${fixable.length})</button>` : ''}</div>
      ${issues.length ? issues.map((it, i) => `<div class="dsm-issue ${it.level}"><span class="dsm-ic" aria-label="${lvl[it.level][1]}">${lvl[it.level][0]}</span><div><b>${Utils.escapeHtml(it.title)}</b>${it.detail ? `<p>${Utils.escapeHtml(it.detail)}</p>` : ''}</div>${it.run ? `<button type="button" data-fix="${i}">${Utils.escapeHtml(it.fix)}</button>` : ''}</div>`).join('') : '<div class="dsm-ok">✅ No problems found. Your design system is healthy.</div>'}</div>`;
    body.querySelectorAll('[data-fix]').forEach(b => b.addEventListener('click', () => {
      const it = issues[+b.dataset.fix];
      const go = () => { it.run(); if (it.noCommit) this.renderDSM(); else this.dsCommit('Fix design system'); };
      if (it.confirm) this.dialog({ title: it.title, body: '<p>This can be undone with Ctrl+Z.</p>', actions: [{ label: 'Cancel' }, { label: it.fix, primary: true, run: go }] }); else go();
    }));
    body.querySelector('[data-a="fix-all"]')?.addEventListener('click', () => { fixable.forEach(i => i.run()); this.dsCommit('Fix design system'); Utils.toast(`Fixed ${fixable.length} issue${fixable.length === 1 ? '' : 's'}`, '✅'); });
  },

  // ---------- Tokens tab
  dsTokensJSON() {
    const m = this.model, D = m.dsVars(), out = {};
    const put = (root, path, val) => { const parts = path.split('/').map(p => p.trim()).filter(Boolean); let o = root; parts.slice(0, -1).forEach(p => { o = o[p] = o[p] && typeof o[p] === 'object' && !('$value' in o[p]) ? o[p] : {}; }); o[parts[parts.length - 1] || 'token'] = val; };
    for (const c of D.collections) {
      const root = out[c.name] = {};
      for (const v of D.vars.filter(x => x.collectionId === c.id)) {
        const fmt = (x) => (x && x.alias ? `{${(m.collectionById(m.varById(x.alias)?.collectionId)?.name || c.name)}.${(m.varById(x.alias)?.name || 'missing').split('/').join('.')}}` : v.type === 'color' ? (Utils.alphaOf(x) < 1 ? Utils.rgba(x) : Utils.toHex(x)) : x);
        const modes = Object.fromEntries(c.modes.map(md => [md.name, fmt(v.values[md.id])]));
        put(root, v.name, { $type: v.type === 'boolean' ? 'boolean' : v.type === 'string' ? 'string' : v.type === 'color' ? 'color' : 'number', $value: fmt(v.values[c.defaultModeId]), ...(v.description ? { $description: v.description } : {}), ...(c.modes.length > 1 ? { $extensions: { 'com.designstudio.modes': modes } } : {}) });
      }
    }
    return out;
  },
  dsCSS() {
    const m = this.model, D = m.dsVars();
    const name = (v) => `--${Utils.slug(v.name.replace(/\//g, '-'), 'token')}`;
    const fmt = (v, md) => { const raw = v.values[md]; if (raw && raw.alias) { const t = m.varById(raw.alias); return t ? `var(${name(t)})` : 'initial'; } return v.type === 'color' ? Utils.rgba(raw) : v.type === 'number' ? (/(opacity|weight|z|ratio)/i.test(v.name) ? raw : `${raw}px`) : v.type === 'boolean' ? (raw ? 1 : 0) : JSON.stringify(String(raw)); };
    let css = '/* Generated by DesignStudio — design tokens */\n:root {\n';
    for (const c of D.collections) for (const v of D.vars.filter(x => x.collectionId === c.id)) css += `  ${name(v)}: ${fmt(v, c.defaultModeId)};\n`;
    css += '}\n';
    for (const c of D.collections) for (const md of c.modes.filter(x => x.id !== c.defaultModeId)) {
      css += `\n[data-${Utils.slug(c.name)}="${Utils.slug(md.name)}"] {\n`;
      for (const v of D.vars.filter(x => x.collectionId === c.id)) css += `  ${name(v)}: ${fmt(v, md.id)};\n`;
      css += '}\n';
    }
    for (const s of m.styles.texts) css += `\n.text-${Utils.slug(s.name)} { font-family: ${s.fontFamily}; font-size: ${s.fontSize}px; font-weight: ${s.fontWeight}; line-height: ${s.lineHeight ? `${s.lineHeight}px` : 'normal'}; letter-spacing: ${s.letterSpacing || 0}px; }`;
    return css + '\n';
  },
  dsTailwind() {
    const m = this.model, D = m.dsVars(), theme = { colors: {}, spacing: {}, borderRadius: {}, fontSize: {} };
    for (const v of D.vars) {
      const val = m.resolveVar(v.id), key = v.name.split('/').slice(1).join('-') || v.name;
      if (v.type === 'color') theme.colors[key] = `var(--${Utils.slug(v.name.replace(/\//g, '-'))}, ${Utils.toHex(val)})`;
      else if (v.type === 'number') { const bucket = /radius/i.test(v.name) ? 'borderRadius' : /(space|gap|pad|size)/i.test(v.name) ? 'spacing' : /font|text/i.test(v.name) ? 'fontSize' : null; if (bucket) theme[bucket][key] = `${val}px`; }
    }
    return `// tailwind.config.js — generated by DesignStudio\nmodule.exports = {\n  theme: { extend: ${JSON.stringify(theme, null, 2).replace(/\n/g, '\n  ')} }\n};\n`;
  },
  /** Import W3C design tokens (nested $type/$value) or a flat {name: value} map. Returns count. */
  dsImportTokens(json, colName) {
    const m = this.model, D = m.dsVars();
    const data = typeof json === 'string' ? Utils.safeParseJSON(json, 20 * 1024 * 1024) : Utils.deepSanitize(json);
    let n = 0;
    const tops = Object.entries(data).every(([, v]) => v && typeof v === 'object' && !('$value' in v)) && Object.keys(data).length <= 12 ? Object.entries(data) : [[colName || 'Imported', data]];
    const pending = [];
    for (const [cname, tree] of tops) {
      let col = D.collections.find(c => c.name === cname);
      const modeNames = new Set();
      const walk = (o, path) => { for (const [k, v] of Object.entries(o)) { if (k.startsWith('$')) continue; if (v && typeof v === 'object' && '$value' in v) { Object.keys(v.$extensions?.['com.designstudio.modes'] || {}).forEach(x => modeNames.add(x)); pending.push({ cname, path: [...path, k].join('/'), tok: v }); } else if (v && typeof v === 'object') walk(v, [...path, k]); else pending.push({ cname, path: [...path, k].join('/'), tok: { $value: v } }); } };
      walk(tree, []);
      if (!col) { col = this.addCollection(cname); if (modeNames.size) { col.modes = [...modeNames].map(x => ({ id: Utils.uid('m'), name: x })); col.defaultModeId = col.modes[0].id; } }
      else for (const mn of modeNames) if (!col.modes.some(x => x.name === mn)) col.modes.push({ id: Utils.uid('m'), name: mn });
    }
    const typeOf = (tok) => { const t = tok.$type; const val = tok.$value; if (t === 'color' || (typeof val === 'string' && Utils.parseColor(val) && !/^\{/.test(val))) return 'color'; if (t === 'number' || t === 'dimension' || typeof val === 'number' || /^-?\d+(\.\d+)?(px|rem)?$/.test(String(val))) return 'number'; if (t === 'boolean' || typeof val === 'boolean') return 'boolean'; return 'string'; };
    const parseVal = (type, val) => (type === 'number' ? Utils.num(String(val).replace(/(px|rem)$/, ''), 0) * (/rem$/.test(String(val)) ? 16 : 1) : type === 'boolean' ? !!val : type === 'color' ? String(val) : String(val));
    const made = [];
    for (const p of pending) {
      const col = D.collections.find(c => c.name === p.cname);
      const type = typeOf(p.tok);
      let v = D.vars.find(x => x.collectionId === col.id && x.name === p.path);
      if (!v) { v = { id: Utils.uid('v'), collectionId: col.id, name: p.path, type, description: String(p.tok.$description || ''), values: {} }; D.vars.push(v); }
      const modes = p.tok.$extensions?.['com.designstudio.modes'];
      for (const md of col.modes) { const raw = modes && md.name in modes ? modes[md.name] : p.tok.$value; v.values[md.id] = raw; }
      made.push(v); n++;
    }
    // resolve {Collection.path.to.token} references into aliases
    const find = (ref) => { const parts = ref.replace(/[{}]/g, '').split('.'); for (let i = 1; i <= parts.length; i++) { const cn = parts.slice(0, i).join('.'), nm = parts.slice(i).join('/'); const c = D.collections.find(x => x.name === cn); const hit = c && D.vars.find(x => x.collectionId === c.id && x.name === nm); if (hit) return hit; } return D.vars.find(x => x.name === parts.join('/')) || null; };
    for (const v of made) for (const [md, raw] of Object.entries(v.values)) {
      if (typeof raw === 'string' && /^\{.+\}$/.test(raw.trim())) { const t = find(raw.trim()); if (t && t.id !== v.id) { v.type = t.type; v.values[md] = { alias: t.id }; } else v.values[md] = ({ color: '#000000', number: 0, string: raw, boolean: false })[v.type]; }
      else v.values[md] = parseVal(v.type, raw);
    }
    return n;
  },
  dsmTokens(body) {
    body.innerHTML = `<div class="dsm-scroll dsm-pad"><div class="dsm-cards">
      <div class="dsm-card"><b>Export</b><p class="muted-text">Hand your system to developers or other tools.</p>
        <div class="dsm-btns"><button type="button" data-x="json">Design tokens (.json)</button><button type="button" data-x="css">CSS variables (.css)</button><button type="button" data-x="tw">Tailwind config (.js)</button></div>
        <div class="dsm-btns"><button type="button" data-copy="json">Copy JSON</button><button type="button" data-copy="css">Copy CSS</button></div></div>
      <div class="dsm-card"><b>Import tokens</b><p class="muted-text">W3C design-token JSON (Tokens Studio, Style Dictionary) or a flat {"name": value} map. Existing names are updated; references {a.b} become aliases.</p>
        <textarea class="dsm-import" rows="6" placeholder='{ "color": { "brand": { "$type": "color", "$value": "#7c3aed" } } }' aria-label="Token JSON"></textarea>
        <div class="dsm-btns"><button type="button" class="btn-primary" data-a="import">Import</button><label class="dsm-file">Choose file…<input type="file" accept=".json,application/json" hidden></label></div></div>
      <div class="dsm-card dsm-presets"><b>Presets</b><p class="muted-text">Start from a ready-made system: colors with Light/Dark modes, spacing, radius, type scale, shadows and a Button set. Existing tokens with the same names are updated.</p>
        <div class="dsp-grid">${DS_PRESETS.map((p, i) => `<button type="button" class="dsp" data-preset="${i}" aria-label="Apply preset ${Utils.escapeHtml(p.name)}"><span class="dsp-sw">${p.swatch.map(c => `<i style="background:${c}"></i>`).join('')}</span><b>${Utils.escapeHtml(p.name)}</b><small>${Utils.escapeHtml(p.note)}</small></button>`).join('')}</div></div>
      <div class="dsm-card"><b>Generate a starter system</b><p class="muted-text">Brand palette (50–900), neutrals, Light/Dark semantic tokens, spacing, radius, text styles and a Button component set bound to the tokens.</p>
        <label class="dsm-field"><span>Brand color</span><input type="color" class="dsm-brand" value="#7c3aed"></label>
        <div class="dsm-btns"><button type="button" class="btn-primary" data-a="gen">Generate</button></div></div>
    </div><div class="dsm-sub">Preview — CSS</div><pre class="dsm-code">${Utils.escapeHtml(this.dsCSS())}</pre></div>`;
    const json = () => JSON.stringify(this.dsTokensJSON(), null, 2);
    const name = Utils.safeFilename(this.titleInput?.value || 'design', 'design');
    body.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.x;
      if (k === 'json') Utils.download(json(), `${name}.tokens.json`, 'application/json');
      if (k === 'css') Utils.download(this.dsCSS(), `${name}.tokens.css`, 'text/css');
      if (k === 'tw') Utils.download(this.dsTailwind(), 'tailwind.config.js', 'text/javascript');
    }));
    body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => { const ok = await Utils.copyText(b.dataset.copy === 'json' ? json() : this.dsCSS()); Utils.toast(ok ? 'Copied' : 'Clipboard unavailable', ok ? '📋' : '⚠️'); }));
    const ta = body.querySelector('.dsm-import');
    const doImport = (text) => {
      try { const n = this.dsImportTokens(text); this.dsm.tab = 'variables'; this.dsCommit('Import tokens'); Utils.toast(`Imported ${n} token${n === 1 ? '' : 's'}`, '⇄'); }
      catch (e) { Utils.toast(`Couldn’t read that JSON: ${e.message}`, '⚠️'); }
    };
    body.querySelector('[data-a="import"]').addEventListener('click', () => { if (ta.value.trim()) doImport(ta.value); else ta.focus(); });
    body.querySelector('.dsm-file input').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) doImport(await f.text()); });
    body.querySelector('[data-a="gen"]').addEventListener('click', () => { this.dsGenerateStarter(body.querySelector('.dsm-brand').value); });
    body.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { const p = DS_PRESETS[+b.dataset.preset]; this.dsGenerateStarter(p.brand, { ...p.opts, preset: p.name }); }));
  },
  /** Starter system: primitives + semantic Light/Dark + spacing/radius + text styles + Button set. */
  dsGenerateStarter(brand = '#7c3aed', opts = {}) {
    const m = this.model, D = m.dsVars();
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
    const scale = (hex) => Object.fromEntries(steps.map(s => [s, s < 500 ? Utils.toHex(Utils.mixColor(hex, '#ffffff', (500 - s) / 520)) : s === 500 ? Utils.toHex(hex) : Utils.toHex(Utils.mixColor(hex, '#000000', (s - 500) / 560))]));
    let prim = D.collections.find(c => c.name === 'Primitives') || this.addCollection('Primitives');
    let sem = D.collections.find(c => c.name === 'Semantic');
    if (!sem) { sem = this.addCollection('Semantic'); const l = sem.modes[0]; l.name = 'Light'; sem.modes.push({ id: Utils.uid('m'), name: 'Dark' }); }
    const L = sem.modes[0].id, Dk = (sem.modes[1] || sem.modes[0]).id;
    const upsert = (col, name, type, values) => { let v = D.vars.find(x => x.collectionId === col.id && x.name === name); if (!v) { v = { id: Utils.uid('v'), collectionId: col.id, name, type, description: '', values: {} }; D.vars.push(v); } col.modes.forEach(md => { v.values[md.id] = values[md.id] ?? values.all; }); return v; };
    const P = {};
    for (const [fam, hex] of [['brand', brand], ['neutral', opts.neutral || '#6b6f7b'], ...Object.entries(opts.families || {})]) for (const [s, c] of Object.entries(scale(hex))) P[`${fam}/${s}`] = upsert(prim, `${fam}/${s}`, 'color', { all: c });
    P.white = upsert(prim, 'base/white', 'color', { all: '#ffffff' }); P.black = upsert(prim, 'base/black', 'color', { all: '#0b0b10' });
    const A = (v) => ({ alias: v.id });
    const sv = {
      'color/background': [P.white, P.black], 'color/surface': [P['neutral/50'], P['neutral/900']], 'color/text': [P['neutral/900'], P['neutral/50']],
      'color/text-muted': [P['neutral/600'], P['neutral/300']], 'color/border': [P['neutral/200'], P['neutral/700']],
      'color/primary': [P['brand/500'], P['brand/400']], 'color/primary-hover': [P['brand/600'], P['brand/300']], 'color/on-primary': [P.white, P.black],
      'color/secondary': [P['brand/50'], P['brand/900']], 'color/on-secondary': [P['brand/700'], P['brand/100']],
      ...Object.fromEntries(Object.keys(opts.families || {}).map(f => [`color/${f}`, [P[`${f}/600`], P[`${f}/400`]]]))
    };
    if (opts.dark) for (const [n, pair] of Object.entries(opts.dark)) if (sv[n]) sv[n] = [sv[n][0], P[pair] || sv[n][1]];
    const S = {};
    for (const [n, [l, d]] of Object.entries(sv)) S[n] = upsert(sem, n, 'color', { [L]: A(l), [Dk]: A(d) });
    for (const [n, v] of [...Object.entries(opts.space || { 'space/xs': 4, 'space/sm': 8, 'space/md': 16, 'space/lg': 24, 'space/xl': 32 }), ...Object.entries(opts.radius || { 'radius/sm': 4, 'radius/md': 8, 'radius/lg': 16 }), ['radius/full', 999]]) S[n] = upsert(sem, n, 'number', { all: v });
    // text styles
    const ts = opts.texts || [['Display', 40, 700, 48], ['Heading', 24, 600, 32], ['Body', 16, 400, 24], ['Label', 14, 600, 20], ['Caption', 12, 400, 16]];
    const T = {};
    for (const [n, size, w, lh] of ts) { let s = m.styles.texts.find(x => x.name === n); if (!s) { s = { id: Utils.uid('t'), name: n, fontFamily: opts.font || DEFAULT_FONT, fontSize: size, fontWeight: w, lineHeight: lh, letterSpacing: 0 }; m.styles.texts.push(s); } else if (opts.preset) Object.assign(s, { fontFamily: opts.font || s.fontFamily, fontSize: size, fontWeight: w, lineHeight: lh }); T[n] = s; }
    for (const [n, effects] of Object.entries(opts.effects || {})) { const e = m.styles.effects.find(x => x.name === n); if (e) e.effects = effects; else m.styles.effects.push({ id: Utils.uid('e'), name: n, effects }); }
    // Button component set (Primary / Secondary) bound to tokens
    let made = false;
    if (!m.allElements().some(e => e.isComponentSet && e.name === 'Button')) {
      const c = this.viewCenter ? this.viewCenter({ width: 320, height: 60 }) : { x: 0, y: 0 };
      const btns = [];
      [['Variant=Primary', 'color/primary', 'color/on-primary'], ['Variant=Secondary', 'color/secondary', 'color/on-secondary']].forEach(([name, bg, fg], i) => {
        const f = new StudioElement('frame', c.x + i * 170, c.y, 140, 44);
        Object.assign(f, { name, isAutoLayout: true, layoutDirection: 'horizontal', primarySizing: 'hug', counterSizing: 'hug', layoutAlign: 'center-center', clipContent: false });
        f.bindings = { 'fills.0': S[bg].id, cornerRadius: S['radius/md'].id, padding: S['space/md'].id, layoutGap: S['space/sm'].id };
        m.insertElement(f, null);
        const t = new StudioElement('text', f.x + 16, f.y + 12, 80, 20);
        Object.assign(t, { name: 'Label', text: 'Button', textAutoResize: 'width' });
        t.bindings = { 'fills.0': S[fg].id }; t.styleRefs = { text: T.Label.id };
        m.insertElement(t, f.id);
        btns.push(f);
      });
      m.applyDesignSystem('pre'); m.computeAutoLayout();
      for (const b of btns) { m.select([b.id]); this.createComponent?.(); }
      m.select(btns.map(b => b.id));
      this.combineAsVariants?.();
      const set = m.allElements().find(e => e.isComponentSet && btns.some(b => b.parentId === e.id));
      if (set) { set.name = 'Button'; set.description = 'Primary for the main action on a screen, Secondary for the rest.'; }
      made = true;
    }
    this.dsm.tab = 'variables'; this.dsm.col = sem.id;
    this.dsCommit(opts.preset ? `Design system preset: ${opts.preset}` : 'Generate design system');
    Utils.toast(`${opts.preset ? `“${opts.preset}” applied` : 'Starter system ready'}: ${Object.keys(P).length} primitives, ${Object.keys(S).length} semantic tokens, ${ts.length} text styles${made ? ', Button component' : ''}`, '⬡');
  },

  // ---------- Releases tab
  dsChanges() {
    const m = this.model, rel = (m.dsReleases || []).at(-1);
    const prev = rel?.snapshot ? JSON.parse(rel.snapshot) : { variables: { collections: [], vars: [] }, styles: { colors: [], texts: [], effects: [] }, components: {} };
    const cur = m.dsState(), out = [];
    const cmp = (kind, a, b, label) => {
      const A = new Map(a.map(x => [x.id, x])), B = new Map(b.map(x => [x.id, x]));
      for (const [id, x] of B) if (!A.has(id)) out.push({ t: 'added', kind, name: label(x) }); else if (JSON.stringify(A.get(id)) !== JSON.stringify(x)) out.push({ t: 'changed', kind, name: label(x) });
      for (const [id, x] of A) if (!B.has(id)) out.push({ t: 'removed', kind, name: label(x) });
    };
    cmp('Collection', prev.variables.collections, cur.variables.collections, x => x.name);
    cmp('Variable', prev.variables.vars, cur.variables.vars, x => x.name);
    cmp('Color style', prev.styles.colors, cur.styles.colors, x => x.name);
    cmp('Text style', prev.styles.texts, cur.styles.texts, x => x.name);
    cmp('Effect style', prev.styles.effects, cur.styles.effects, x => x.name);
    cmp('Component', Object.entries(prev.components).map(([id, v]) => ({ id, ...v })), Object.entries(cur.components).map(([id, v]) => ({ id, ...v })), x => x.name);
    return out;
  },
  dsmReleases(body) {
    const m = this.model, rels = m.dsReleases || [], ch = this.dsChanges();
    const last = rels.at(-1)?.version || '0.0.0';
    const [a, b, c] = last.split('.').map(n => parseInt(n, 10) || 0);
    const breaking = ch.some(x => x.t === 'removed');
    const next = breaking ? `${a + 1}.0.0` : ch.some(x => x.t === 'added') ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
    const icon = { added: '＋', changed: '✎', removed: '−' };
    body.innerHTML = `<div class="dsm-scroll dsm-pad"><div class="dsm-cards"><div class="dsm-card wide"><b>Changes since ${rels.length ? `v${Utils.escapeHtml(last)}` : 'the start'}</b>
      ${ch.length ? `<ul class="dsm-changes">${ch.slice(0, 200).map(x => `<li class="${x.t}"><span>${icon[x.t]}</span>${x.kind} <b>${Utils.escapeHtml(x.name)}</b> <em>${x.t}</em></li>`).join('')}</ul>` : '<p class="muted-text">No changes — everything is released.</p>'}
      ${ch.length ? `<div class="dsm-release-form"><label class="dsm-field"><span>Version</span><input type="text" class="dsm-ver" value="${next}"></label>${breaking ? '<span class="dsm-warn">Removals → major version</span>' : ''}<label class="dsm-field grow"><span>Release notes</span><textarea class="dsm-notes" rows="3" placeholder="What changed and why — teammates see this">${Utils.escapeHtml(ch.slice(0, 8).map(x => `${x.t[0].toUpperCase() + x.t.slice(1)} ${x.kind.toLowerCase()} ${x.name}`).join('\n'))}</textarea></label><button type="button" class="btn-primary" data-a="publish">Publish release</button></div>` : ''}</div></div>
      <div class="dsm-sub">History</div>${rels.length ? rels.slice().reverse().map((r, i) => `<div class="dsm-rel"><b>v${Utils.escapeHtml(r.version)}</b><span class="muted-text">${Utils.escapeHtml(new Date(r.at).toLocaleString())}</span><p>${Utils.escapeHtml(r.notes).replace(/\n/g, '<br>')}</p>${i ? `<button type="button" data-restore="${rels.length - 1 - i}" title="Restore variables and styles from this release">Restore tokens</button>` : ''}</div>`).join('') : '<p class="muted-text">No releases yet. Publishing records a version you can compare against and restore.</p>'}</div>`;
    body.querySelector('[data-a="publish"]')?.addEventListener('click', () => {
      const ver = body.querySelector('.dsm-ver').value.trim().replace(/^v/i, '');
      if (!/^\d+\.\d+\.\d+$/.test(ver)) { Utils.toast('Use a version like 1.2.0', '⚠️'); return; }
      if (rels.some(r => r.version === ver)) { Utils.toast('That version already exists', '⚠️'); return; }
      m.dsReleases = [...rels, { version: ver, notes: body.querySelector('.dsm-notes').value.trim(), at: new Date().toISOString(), snapshot: JSON.stringify(m.dsState()) }];
      this.dsCommit(`Publish design system v${ver}`);
      Utils.toast(`Design system v${ver} published`, '🏷');
    });
    body.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', () => {
      const r = rels[+btn.dataset.restore], snap = JSON.parse(r.snapshot);
      this.dialog({ title: `Restore tokens from v${r.version}?`, body: '<p>Variables and styles go back to that release. Components and layers are not changed. Undo with Ctrl+Z.</p>', actions: [{ label: 'Cancel' }, { label: 'Restore', primary: true, run: () => { m.variables = StudioModel.sanitizeVariables(snap.variables); m.styles = JSON.parse(JSON.stringify(snap.styles)); this.dsCommit(`Restore tokens v${r.version}`); } }] });
    }));
  }
};
Object.assign(StudioApp.prototype, DesignSystemMixin);
