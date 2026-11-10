/**
 * DesignStudio — shared utilities (math, color, escaping, files, easing).
 * Loaded first; everything else depends on `Utils`.
 */
'use strict';

const Utils = {
  uid: (prefix = 'el') => `${prefix}_${Math.random().toString(36).slice(2, 11)}_${Date.now().toString(36)}`,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  degToRad: (deg) => (deg * Math.PI) / 180,
  radToDeg: (rad) => (rad * 180) / Math.PI,
  round: (v, p = 2) => { const f = 10 ** p; return Math.round(v * f) / f; },
  num: (v, fallback = 0) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : fallback; },

  rotatePoint: (x, y, cx, cy, angleDeg) => {
    const rad = Utils.degToRad(angleDeg);
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = x - cx, dy = y - cy;
    return { x: cos * dx - sin * dy + cx, y: sin * dx + cos * dy + cy };
  },

  /** Point in world space -> element-local space (origin = element center, unrotated). */
  toLocal: (px, py, el) => {
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    const p = Utils.rotatePoint(px, py, cx, cy, -(el.rotation || 0));
    return { x: p.x - cx, y: p.y - cy };
  },

  pointInRotatedRect: (px, py, rx, ry, rw, rh, rotDeg, pad = 0) => {
    const cx = rx + rw / 2, cy = ry + rh / 2;
    const p = rotDeg ? Utils.rotatePoint(px, py, cx, cy, -rotDeg) : { x: px, y: py };
    return p.x >= rx - pad && p.x <= rx + rw + pad && p.y >= ry - pad && p.y <= ry + rh + pad;
  },

  /** Axis-aligned bounds of a (possibly rotated) element. */
  aabb: (el) => {
    if (!el.rotation) return { x: el.x, y: el.y, w: el.width, h: el.height };
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    const pts = [[el.x, el.y], [el.x + el.width, el.y], [el.x + el.width, el.y + el.height], [el.x, el.y + el.height]]
      .map(([x, y]) => Utils.rotatePoint(x, y, cx, cy, el.rotation));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  },

  unionBounds: (list) => {
    if (!list.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const b of list) {
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  },

  rectsIntersect: (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y,

  debounce: (fn, ms) => {
    let t = null;
    const d = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
    d.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
    d.pending = () => t !== null;
    return d;
  },

  // ---------------------------------------------------------------- Escaping
  escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  escapeXml: (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])),
  slug: (s, fallback = 'layer') => {
    const out = String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return /^[a-z]/.test(out) ? out : (out ? `${fallback}-${out}` : fallback);
  },
  pascal: (s, fallback = 'Component') => {
    const out = String(s ?? '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1)).join('');
    return /^[A-Z]/.test(out) ? out : fallback + out;
  },

  // ---------------------------------------------------------------- Toasts
  toast: (msg, icon = 'ℹ️') => {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = 'toast';
    const i = document.createElement('span'); i.textContent = icon;
    const m = document.createElement('span'); m.textContent = msg;
    t.append(i, m);
    cont.appendChild(t);
    while (cont.children.length > 4) cont.firstChild.remove();
    setTimeout(() => {
      t.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      t.style.opacity = '0';
      t.style.transform = 'translateY(6px)';
      setTimeout(() => t.remove(), 260);
    }, 2600);
  },

  // ---------------------------------------------------------------- Colors
  /** Accepts #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(). Returns {r,g,b,a} or null. */
  parseColor: (str) => {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      const n = parseInt(h.slice(0, 6), 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)$/i.exec(s);
    if (m) {
      let a = m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { r: Utils.clamp(+m[1], 0, 255), g: Utils.clamp(+m[2], 0, 255), b: Utils.clamp(+m[3], 0, 255), a: Utils.clamp(a, 0, 1) };
    }
    return null;
  },
  /** Only lets well-formed colors through (protects style attributes / exports). */
  safeColor: (str, fallback = '#000000') => (Utils.parseColor(str) ? String(str).trim() : fallback),
  hexToRgb: (hex) => Utils.parseColor(hex) || { r: 0, g: 0, b: 0, a: 1 },
  rgbToHex: (r, g, b) => {
    const h = (n) => Utils.clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  },
  toHex: (str) => { const c = Utils.parseColor(str) || { r: 0, g: 0, b: 0 }; return Utils.rgbToHex(c.r, c.g, c.b); },
  alphaOf: (str) => (Utils.parseColor(str) || { a: 1 }).a,
  rgba: (str, alphaMul = 1) => {
    const c = Utils.parseColor(str) || { r: 0, g: 0, b: 0, a: 1 };
    const a = Utils.round(Utils.clamp(c.a * alphaMul, 0, 1), 3);
    return a >= 1 ? Utils.rgbToHex(c.r, c.g, c.b) : `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
  },
  mixColor: (c1, c2, t) => {
    const a = Utils.parseColor(c1) || { r: 0, g: 0, b: 0, a: 1 }, b = Utils.parseColor(c2) || a;
    return Utils.rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  },
  rgbToHsl: (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },
  hslToRgb: (h, s, l) => {
    h = (((h % 360) + 360) % 360) / 360; s = Utils.clamp(s, 0, 100) / 100; l = Utils.clamp(l, 0, 100) / 100;
    if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255) };
  },
  rgbToHsv: (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  },
  hsvToRgb: (h, s, v) => {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
  },

  // ---------------------------------------------------------------- Files
  download: (data, filename, type = 'application/octet-stream') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },
  safeFilename: (s, fallback = 'design') => (String(s || '').replace(/[\\/:*?"<>|]+/g, '').trim() || fallback),
  copyText: async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    }
  },

  crc32: (() => {
    let table = null;
    return (bytes) => {
      if (!table) {
        table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
      }
      let crc = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    };
  })(),

  // ---------------------------------------------------------------- Easing
  easings: {
    linear: (t) => t,
    easeIn: (t) => t * t * t,
    easeOut: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    easeInBack: (t) => { const s = 1.70158; return t * t * ((s + 1) * t - s); },
    easeOutBack: (t) => { const s = 1.70158, t1 = t - 1; return t1 * t1 * ((s + 1) * t1 + s) + 1; },
    spring: (t) => 1 - Math.cos(t * Math.PI * 4.5) * Math.exp(-t * 6),
    hold: (t) => (t >= 1 ? 1 : 0),
    easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    easeOutExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    easeInOutBack: (t) => { const c = 1.70158 * 1.525; return t < 0.5 ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2; },
    bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
    elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1)
  },
  /** v3.14.0: CSS-style cubic-bezier(x1, y1, x2, y2) easing function (custom curves on keyframes). */
  cubicBezier: (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
      if (t < 0 || t > 1) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return sy(Math.min(1, Math.max(0, t)));
    };
  },
  /** Easing of a keyframe segment: custom bezier when the key has one, otherwise the named easing. */
  keyEase: (k) => (Array.isArray(k?.bezier) && k.bezier.length === 4 ? Utils.cubicBezier(...k.bezier) : (Utils.easings[k?.easing] || Utils.easings.easeInOut)),
  /** cubic-bezier equivalents (for CSS + Lottie export). */
  easingBezier: {
    linear: [0, 0, 1, 1], easeIn: [0.32, 0, 0.67, 0], easeOut: [0.33, 1, 0.68, 1], easeInOut: [0.65, 0, 0.35, 1],
    easeInBack: [0.36, 0, 0.66, -0.56], easeOutBack: [0.34, 1.56, 0.64, 1], spring: [0.34, 1.56, 0.64, 1], hold: [0, 0, 1, 1],
    easeInOutSine: [0.37, 0, 0.63, 1], easeOutExpo: [0.16, 1, 0.3, 1], easeInOutBack: [0.68, -0.6, 0.32, 1.6], bounce: [0.34, 1.56, 0.64, 1], elastic: [0.34, 1.56, 0.64, 1]
  },
  easingLabels: {
    linear: 'Linear', easeIn: 'Ease In', easeOut: 'Ease Out', easeInOut: 'Ease In-Out',
    easeInBack: 'Back In', easeOutBack: 'Back Out', spring: 'Spring', hold: 'Hold',
    easeInOutSine: 'Sine In-Out', easeOutExpo: 'Expo Out', easeInOutBack: 'Back In-Out', bounce: 'Bounce', elastic: 'Elastic'
  }
};

/** Shared text layout so canvas rendering, editing and exports agree on line breaks. */
const TextLayout = {
  _ctx: null,
  ctx() {
    if (!this._ctx) this._ctx = document.createElement('canvas').getContext('2d');
    return this._ctx;
  },
  font(el) {
    return `${el.fontWeight || 400} ${el.fontSize || 16}px ${el.fontFamily || 'sans-serif'}`;
  },
  lineHeight(el) {
    return el.lineHeight > 0 ? el.lineHeight : Math.round((el.fontSize || 16) * 1.3);
  },
  measure(el, text) {
    const ctx = this.ctx();
    ctx.font = this.font(el);
    const w = ctx.measureText(text).width;
    // CSS & canvas both add letter-spacing after every character (including the last)
    return w + [...text].length * (el.letterSpacing || 0);
  },
  _metrics: new Map(),
  /** Distance from a line box's top to the alphabetic baseline — same rule CSS uses (half-leading). */
  baselineOffset(el) {
    const font = this.font(el);
    let m = this._metrics.get(font);
    if (!m) {
      const ctx = this.ctx();
      ctx.font = font;
      const t = ctx.measureText('Hg');
      const asc = t.fontBoundingBoxAscent ?? (el.fontSize || 16) * 0.8;
      const desc = t.fontBoundingBoxDescent ?? (el.fontSize || 16) * 0.2;
      m = { asc, desc };
      this._metrics.set(font, m);
    }
    return (this.lineHeight(el) - (m.asc + m.desc)) / 2 + m.asc;
  },
  /** Returns wrapped lines. Wrapping happens only when the box has a fixed width. */
  lines(el) {
    const raw = String(el.text ?? '').split('\n');
    if (el.textAutoResize === 'width') return raw;
    const maxW = Math.max(1, el.width);
    const out = [];
    for (const para of raw) {
      if (!para) { out.push(''); continue; }
      const words = para.split(/(\s+)/);
      let line = '';
      for (const w of words) {
        const test = line + w;
        if (line && this.measure(el, test.trimEnd()) > maxW) {
          out.push(line.trimEnd());
          line = w.trimStart();
          // hard-break very long words
          while (line && this.measure(el, line) > maxW && line.length > 1) {
            let i = line.length - 1;
            while (i > 1 && this.measure(el, line.slice(0, i)) > maxW) i--;
            out.push(line.slice(0, i)); line = line.slice(i);
          }
        } else line = test;
      }
      out.push(line.trimEnd());
    }
    return out;
  },
  /** Resizes a text element to fit its content according to its auto-resize mode. */
  fit(el) {
    if (el.type !== 'text') return;
    const lines = this.lines(el);
    const lh = this.lineHeight(el);
    if (el.textAutoResize === 'width') {
      el.width = Math.max(4, Math.ceil(Math.max(0, ...lines.map(l => this.measure(el, l)))) + 2);
      el.height = Math.max(lh, lines.length * lh);
    } else if (el.textAutoResize === 'height') {
      el.height = Math.max(lh, lines.length * lh);
    }
  }
};

/** Tiny promise-based key/value store on IndexedDB (large quota) with a localStorage fallback. */
const Store = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((resolve) => {
      try {
        const req = indexedDB.open('designstudio', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return this._db;
  },
  async get(key) {
    const db = await this.open();
    if (db) {
      try {
        const v = await new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        if (v != null) return v;
      } catch (e) { /* fall through */ }
    }
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  async set(key, value) {
    const db = await this.open();
    if (db) {
      try {
        await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(value, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
        return true;
      } catch (e) { /* fall through */ }
    }
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  },
  async has(key) { return (await this.get(key)) != null; }
};
