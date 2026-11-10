/**
 * DesignStudio — geometry + canvas rendering (editor canvas, exports, prototype).
 */
'use strict';

const Geometry = {
  polygonPoints(el) {
    const n = Math.max(3, Math.round(el.polygonSides || 3));
    const rx = el.width / 2, ry = el.height / 2;
    return Array.from({ length: n }, (_, i) => {
      const a = (i * 2 * Math.PI) / n - Math.PI / 2;
      return { x: Math.cos(a) * rx, y: Math.sin(a) * ry };
    });
  },
  starPoints(el) {
    const n = Math.max(3, Math.round(el.starPoints || 5));
    const rx = el.width / 2, ry = el.height / 2, inner = 0.45;
    return Array.from({ length: n * 2 }, (_, i) => {
      const r = i % 2 === 0 ? 1 : inner;
      const a = (i * Math.PI) / n - Math.PI / 2;
      return { x: Math.cos(a) * rx * r, y: Math.sin(a) * ry * r };
    });
  },
  /** Path2D in element-local coordinates (origin at element center, unrotated). */
  path(el) {
    const w = el.width, h = el.height, x = -w / 2, y = -h / 2;
    const p = new Path2D();
    switch (el.type) {
      case 'rect': case 'frame': case 'image': case 'text': case 'group': {
        const r = Math.max(0, Math.min(el.cornerRadius || 0, Math.abs(w) / 2, Math.abs(h) / 2));
        if (r > 0 && p.roundRect) p.roundRect(x, y, w, h, r); else p.rect(x, y, w, h);
        break;
      }
      case 'ellipse':
        p.ellipse(0, 0, Math.max(0.5, Math.abs(w / 2)), Math.max(0.5, Math.abs(h / 2)), 0, 0, Math.PI * 2);
        break;
      case 'line': case 'arrow':
        p.addPath(new Path2D(this.lineSpec(el, el.strokes?.[0]?.width || 2).line));
        break;
      case 'polygon': case 'star': {
        const pts = el.type === 'polygon' ? this.polygonPoints(el) : this.starPoints(el);
        pts.forEach((pt, i) => (i ? p.lineTo(pt.x, pt.y) : p.moveTo(pt.x, pt.y)));
        p.closePath();
        break;
      }
      case 'path': {
        if (el.svgPath && el.svgBox) {
          const b = el.svgBox, sx = b.w ? w / b.w : 1, sy = b.h ? h / b.h : 1;
          let m = new DOMMatrix().translate(x, y).scale(sx, sy).translate(-b.x, -b.y);
          if (el.svgMatrix) m = m.multiply(new DOMMatrix(el.svgMatrix));
          try { p.addPath(new Path2D(el.svgPath), m); } catch (e) { p.rect(x, y, w, h); }
        } else if (el.points.length) {
          const pts = el.points;
          p.moveTo(x + pts[0].x, y + pts[0].y);
          for (let i = 1; i < pts.length; i++) this.segment(p, pts[i - 1], pts[i], x, y);
          if (el.closedPath && pts.length > 2) { this.segment(p, pts[pts.length - 1], pts[0], x, y); p.closePath(); }
        }
        break;
      }
      default: p.rect(x, y, w, h);
    }
    return p;
  },
  segment(p, a, b, ox, oy) {
    const c1x = a.ox2 !== undefined ? a.ox2 : (b.cx1 !== undefined ? b.cx1 : undefined);
    if (b.cx1 !== undefined) p.bezierCurveTo(ox + b.cx1, oy + b.cy1, ox + b.cx2, oy + b.cy2, ox + b.x, oy + b.y);
    else p.lineTo(ox + b.x, oy + b.y);
    return c1x;
  },
  /** v3.13.0 lines & arrows: caps on both ends, curve (lineBend −100…100), dash. Local coords (origin = centre).
   *  Returns { line: svg path d, caps: [{ d, mode: 'fill' | 'stroke' }], dash: [] | null, round }. */
  ARROW_CAPS: ['none', 'triangle', 'stealth', 'chevron', 'circle', 'circleOpen', 'square', 'diamond', 'diamondOpen', 'bar'],
  capsOf(el) {
    const end = el.arrowEnd ?? (el.type === 'arrow' ? 'triangle' : 'none');
    return { start: el.arrowStart || 'none', end };
  },
  lineSpec(el, sw = 2) {
    const w = el.width, x0 = -w / 2, x1 = w / 2, n = (v) => Math.round(v * 100) / 100;
    const bend = Math.max(-100, Math.min(100, +el.lineBend || 0));
    const cy = -(bend / 100) * w * 0.5;                       // quadratic control point (0, cy)
    const s = Math.max(8, sw * 4) * Math.max(0.3, Math.min(4, +el.arrowSize || 1));
    const { start, end } = this.capsOf(el);
    const angE = Math.atan2(-cy, x1), angS = Math.atan2(-cy, x0); // outward tangent at each end
    const inset = { triangle: s * 0.8, stealth: s * 0.75, circleOpen: s * 0.8, diamond: s * 1.0, diamondOpen: s * 1.1 };
    const iS = inset[start] || 0, iE = inset[end] || 0;
    const p0 = { x: x0 - Math.cos(angS) * iS, y: -Math.sin(angS) * iS }, p1 = { x: x1 - Math.cos(angE) * iE, y: -Math.sin(angE) * iE };
    const line = bend ? `M${n(p0.x)} ${n(p0.y)} Q0 ${n(cy)} ${n(p1.x)} ${n(p1.y)}` : `M${n(p0.x)} 0 L${n(p1.x)} 0`;
    const place = (type, ox, oy, ang) => {
      const c = Math.cos(ang), si = Math.sin(ang);
      const P = (px, py) => `${n(ox + px * c - py * si)} ${n(oy + px * si + py * c)}`; // cap drawn pointing +x with its tip at (0,0)
      const r = s * 0.4;
      const circle = (cx) => `M${P(cx + r, 0)} A${n(r)} ${n(r)} 0 1 1 ${P(cx - r, 0)} A${n(r)} ${n(r)} 0 1 1 ${P(cx + r, 0)} Z`;
      switch (type) {
        case 'triangle': return { d: `M${P(0, 0)} L${P(-s, -s * 0.6)} L${P(-s, s * 0.6)} Z`, mode: 'fill' };
        case 'stealth': return { d: `M${P(0, 0)} L${P(-s * 1.15, -s * 0.7)} L${P(-s * 0.75, 0)} L${P(-s * 1.15, s * 0.7)} Z`, mode: 'fill' };
        case 'chevron': return { d: `M${P(-s * 0.9, -s * 0.6)} L${P(0, 0)} L${P(-s * 0.9, s * 0.6)}`, mode: 'stroke' };
        case 'circle': return { d: circle(0), mode: 'fill' };
        case 'circleOpen': return { d: circle(-r), mode: 'stroke' };
        case 'square': return { d: `M${P(-r, -r)} L${P(r, -r)} L${P(r, r)} L${P(-r, r)} Z`, mode: 'fill' };
        case 'diamond': return { d: `M${P(0, 0)} L${P(-s * 0.55, -s * 0.42)} L${P(-s * 1.1, 0)} L${P(-s * 0.55, s * 0.42)} Z`, mode: 'fill' };
        case 'diamondOpen': return { d: `M${P(0, 0)} L${P(-s * 0.6, -s * 0.45)} L${P(-s * 1.2, 0)} L${P(-s * 0.6, s * 0.45)} Z`, mode: 'stroke' };
        case 'bar': return { d: `M${P(0, -s * 0.6)} L${P(0, s * 0.6)}`, mode: 'stroke' };
        default: return null;
      }
    };
    const caps = [place(start, x0, 0, angS), place(end, x1, 0, angE)].filter(Boolean);
    const style = el.lineDash || 'solid';
    const dash = style === 'dash' ? [sw * 3, sw * 2] : style === 'dot' ? [0.001, sw * 2.2] : null;
    return { line, caps, dash, round: style === 'dot' || style === 'solid' };
  },
  isOpen(el) { return el.type === 'line' || el.type === 'arrow' || (el.type === 'path' && !el.closedPath && !el.svgPath); },
  /** Re-fit a pen/pencil path's bounding box to its points (keeps the shape in place). */
  normalizePath(el) {
    if (el.type !== 'path' || el.svgPath || !el.points.length) return;
    const xs = [], ys = [];
    for (const p of el.points) {
      xs.push(p.x); ys.push(p.y);
      if (p.cx1 !== undefined) { xs.push(p.cx1, p.cx2); ys.push(p.cy1, p.cy2); }
    }
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(1, Math.max(...xs) - minX), h = Math.max(1, Math.max(...ys) - minY);
    for (const p of el.points) {
      p.x -= minX; p.y -= minY;
      if (p.cx1 !== undefined) { p.cx1 -= minX; p.cx2 -= minX; p.cy1 -= minY; p.cy2 -= minY; }
    }
    el.x += minX; el.y += minY; el.width = w; el.height = h;
  },
  /** SVG path data for pen/pencil paths (element-local, top-left origin). */
  pointsToD(el) {
    const pts = el.points;
    if (!pts.length) return '';
    const f = (n) => Utils.round(n, 2);
    let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
    const seg = (b) => (b.cx1 !== undefined ? ` C${f(b.cx1)} ${f(b.cy1)} ${f(b.cx2)} ${f(b.cy2)} ${f(b.x)} ${f(b.y)}` : ` L${f(b.x)} ${f(b.y)}`);
    for (let i = 1; i < pts.length; i++) d += seg(pts[i]);
    if (el.closedPath && pts.length > 2) d += seg(pts[0]) + ' Z';
    return d;
  }
};

class StudioRenderer {
  constructor(canvas, model, app) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.model = model;
    this.app = app;
    this.dirty = true;
    this.images = new Map();
    this.cssW = 1; this.cssH = 1;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.cssW = Math.max(1, rect.width); this.cssH = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.dirty = true;
    if (this.app) this.app.requestRender();
  }

  screenToWorld(sx, sy) { return { x: (sx - this.model.panX) / this.model.zoom, y: (sy - this.model.panY) / this.model.zoom }; }
  worldToScreen(wx, wy) { return { x: wx * this.model.zoom + this.model.panX, y: wy * this.model.zoom + this.model.panY }; }

  getImage(el) {
    const src = (el.assetId && this.model.assets[el.assetId]) || el.imageDataUrl;
    if (!src) return null;
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => { this.dirty = true; if (this.app) { this.app.requestRender(); this.app.refreshAssetsLater?.(); } };
      img.src = src;
      this.images.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // ------------------------------------------------------------------ Main render
  render() {
    const dpr = window.devicePixelRatio || 1;
    const ctx = this.ctx, m = this.model;
    const w = this.cssW, h = this.cssH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.fillStyle = m.page?.bg || '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(m.panX, m.panY);
    ctx.scale(m.zoom, m.zoom);
    if (m.showGrid && m.zoom >= 0.2) this.drawGrid(ctx, w, h);

    const tree = m.buildTree();
    const opts = { tree, skip: this.app?.editingTextId ? new Set([this.app.editingTextId]) : null };
    for (const el of tree.get(null) || []) this.drawNode(ctx, el, opts);

    this.drawOverlays(ctx, tree);
    ctx.restore();
    this.dirty = false;
  }

  drawGrid(ctx, screenW, screenH) {
    const m = this.model;
    let gs = m.gridSize;
    while (gs * m.zoom < 8) gs *= 2;
    const sx = -m.panX / m.zoom, sy = -m.panY / m.zoom;
    const ex = sx + screenW / m.zoom, ey = sy + screenH / m.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1 / m.zoom;
    ctx.beginPath();
    for (let x = Math.floor(sx / gs) * gs; x <= ex; x += gs) { ctx.moveTo(x, sy); ctx.lineTo(x, ey); }
    for (let y = Math.floor(sy / gs) * gs; y <= ey; y += gs) { ctx.moveTo(sx, y); ctx.lineTo(ex, y); }
    ctx.stroke();
    if (m.zoom >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 0.5 / m.zoom;
      ctx.beginPath();
      for (let x = Math.floor(sx); x <= ex; x++) { ctx.moveTo(x, sy); ctx.lineTo(x, ey); }
      for (let y = Math.floor(sy); y <= ey; y++) { ctx.moveTo(sx, y); ctx.lineTo(ex, y); }
      ctx.stroke();
    }
  }

  /** v3.11.1: an element with Layer blur is rendered once (blurred, on a smaller canvas) and reused while its look and
   *  size don't change — moving it (animation, parallax) only re-places the cached image. */
  drawBlurredSprite(ctx, el) {
    const fx = el.effects || [];
    const blur = fx.find(e => e.type === 'layerBlur' && e.visible !== false && e.blur > 0);
    if (!blur || el.type === 'image' || el.type === 'text' || el.width <= 0 || el.height <= 0) return false;
    const s = this.pxScale(ctx);
    const sb = Math.round(s * 4) / 4 || 0.25; // scale bucket (zooming re-renders at most every 25 %)
    const sigma = blur.blur / 2, m = Math.ceil(sigma * 3);
    const look = { t: el.type, w: Math.round(el.width), h: Math.round(el.height), f: el.fills, st: el.strokes, r: el.cornerRadius, p: el.svgPath || el.points, ps: el.polygonSides, sp: el.starPoints, fx: fx.filter(e => e.visible !== false), cp: el.closedPath, fr: el.fillRule, sb };
    const key = JSON.stringify(look);
    this._sprites ||= new Map();
    let spr = this._sprites.get(key);
    if (!spr) {
      const down = Math.max(1, Math.min(8, (sigma * sb) / 10));
      const W = Math.max(1, Math.ceil((el.width + m * 2) * sb / down)), H = Math.max(1, Math.ceil((el.height + m * 2) * sb / down));
      if (W * H > 4096 * 4096) return false;
      const a = document.createElement('canvas'); a.width = W; a.height = H;
      const actx = a.getContext('2d');
      actx.setTransform(sb / down, 0, 0, sb / down, (el.width / 2 + m) * sb / down, (el.height / 2 + m) * sb / down);
      const clone = Object.assign(Object.create(Object.getPrototypeOf(el)), el, { x: -el.width / 2, y: -el.height / 2, rotation: 0, flipX: false, flipY: false, blendMode: 'source-over', effects: fx.filter(e => e !== blur) });
      this._spriteRender = true;
      try { this.drawSelf(actx, clone); } finally { this._spriteRender = false; }
      spr = document.createElement('canvas'); spr.width = W; spr.height = H;
      const sctx = spr.getContext('2d');
      sctx.filter = `blur(${(sigma * sb) / down}px)`;
      sctx.drawImage(a, 0, 0);
      spr._m = m;
      this._sprites.set(key, spr);
      if (this._sprites.size > 48) this._sprites.delete(this._sprites.keys().next().value);
    }
    ctx.save();
    this.applyTransform(ctx, el);
    if (el.blendMode && el.blendMode !== 'source-over') ctx.globalCompositeOperation = el.blendMode;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low'; // blurred content: bilinear is visually identical and far cheaper
    ctx.drawImage(spr, -el.width / 2 - spr._m, -el.height / 2 - spr._m, el.width + spr._m * 2, el.height + spr._m * 2);
    ctx.restore();
    return true;
  }

  applyTransform(ctx, el) {
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
    if (el.rotation) ctx.rotate(Utils.degToRad(el.rotation));
    if (el.flipX || el.flipY) ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
  }

  /** Draw element + its subtree. Group/frame opacity applies to children. */
  drawNode(ctx, el, opts) {
    if (!el.visible) return;
    const kidsOf = opts.tree.get(el.id);
    if (el.opacity < 1 && kidsOf && kidsOf.length && !opts.inLayer) {
      // Container opacity applies to the composited subtree (overlapping children must not darken)
      const cv = ctx.canvas;
      // v3.11.1: pooled layers (one per nesting depth) instead of a new full-size canvas every frame
      const depth = (opts.layerDepth || 0);
      this._layerPool ||= [];
      const layer = this._layerPool[depth] ||= document.createElement('canvas');
      if (layer.width !== cv.width || layer.height !== cv.height) { layer.width = cv.width; layer.height = cv.height; }
      const lctx = layer.getContext('2d');
      lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over'; lctx.filter = 'none';
      lctx.clearRect(0, 0, layer.width, layer.height);
      lctx.setTransform(ctx.getTransform());
      opts = { ...opts, layerDepth: depth + 1 };
      this.drawNode(lctx, el, { ...opts, inLayer: el.id, opacityOverride: 1 });
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha *= Utils.clamp(el.opacity, 0, 1);
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha *= opts.inLayer === el.id ? 1 : Utils.clamp(el.opacity, 0, 1);
    if (opts.inLayer === el.id) opts = { ...opts, inLayer: null };
    if (!(opts.skip && opts.skip.has(el.id))) this.drawSelf(ctx, el);
    const kids = opts.tree.get(el.id);
    if (kids && kids.length) {
      if (el.type === 'frame' && el.clipContent !== false && !opts.noClip) {
        const mtx = ctx.getTransform();
        this.applyTransform(ctx, el);
        ctx.clip(Geometry.path(el));
        ctx.setTransform(mtx);
      }
      for (const k of kids) this.drawNode(ctx, k, opts);
    }
    ctx.restore();
  }

  pxScale(ctx) { const t = ctx.getTransform(); return Math.hypot(t.a, t.b) || 1; }

  drawSelf(ctx, el) {
    if (el.type === 'group') return;
    if (!this._spriteRender && this.drawBlurredSprite(ctx, el)) return; // v3.11.1 cached layer blur
    ctx.save();
    this.applyTransform(ctx, el);
    if (el.blendMode && el.blendMode !== 'source-over') ctx.globalCompositeOperation = el.blendMode;
    const path = Geometry.path(el);
    const s = this.pxScale(ctx);
    const effects = (el.effects || []).filter(e => e.visible !== false);
    const blur = effects.find(e => e.type === 'layerBlur');
    if (blur && blur.blur > 0) ctx.filter = `blur(${(blur.blur / 2) * s}px)`;
    const open = Geometry.isOpen(el);
    const fills = (el.fills || []).filter(f => f.visible !== false);
    const strokes = (el.strokes || []).filter(st => st.visible !== false && st.width > 0);

    // Background blur: blur what's already painted beneath, clipped to the shape
    const bgBlur = effects.find(e => e.type === 'backgroundBlur');
    if (bgBlur && bgBlur.blur > 0 && !open) {
      // v3.11.1: blur only the region under the shape (was: the whole canvas, every frame)
      const sigma = (bgBlur.blur / 2) * s;
      const M = ctx.getTransform(), cv = ctx.canvas;
      const pts = [[-el.width / 2, -el.height / 2], [el.width / 2, -el.height / 2], [el.width / 2, el.height / 2], [-el.width / 2, el.height / 2]].map(([px, py]) => M.transformPoint(new DOMPoint(px, py)));
      const pad = Math.ceil(sigma * 3);
      const x0 = Math.max(0, Math.floor(Math.min(...pts.map(q => q.x))) - pad), y0 = Math.max(0, Math.floor(Math.min(...pts.map(q => q.y))) - pad);
      const x1 = Math.min(cv.width, Math.ceil(Math.max(...pts.map(q => q.x))) + pad), y1 = Math.min(cv.height, Math.ceil(Math.max(...pts.map(q => q.y))) + pad);
      if (x1 > x0 && y1 > y0) {
        const tmp = this._bgScratch ||= document.createElement('canvas');
        const down = Math.max(1, Math.min(4, Math.floor(sigma / 8))); // big blurs work on a smaller copy
        const bw = Math.ceil((x1 - x0) / down), bh = Math.ceil((y1 - y0) / down);
        if (tmp.width < bw || tmp.height < bh) { tmp.width = Math.max(tmp.width, bw); tmp.height = Math.max(tmp.height, bh); }
        const t = tmp.getContext('2d');
        t.setTransform(1, 0, 0, 1, 0, 0); t.filter = 'none'; t.clearRect(0, 0, bw, bh);
        t.filter = `blur(${sigma / down}px)`;
        try {
          t.drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, bw, bh);
          ctx.save();
          ctx.clip(path, el.fillRule);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.imageSmoothingQuality = 'low';
          ctx.drawImage(tmp, 0, 0, bw, bh, x0, y0, x1 - x0, y1 - y0);
          ctx.restore();
        } catch (e) { /* tainted canvas */ }
      }
    }

    // Drop shadows (one pass each so multiple shadows stack)
    for (const sh of effects.filter(e => e.type === 'dropShadow')) {
      ctx.save();
      const off = this.shadowOffset(ctx, sh);
      ctx.shadowColor = Utils.rgba(sh.color);
      ctx.shadowBlur = sh.blur * s;
      ctx.shadowOffsetX = off.x; ctx.shadowOffsetY = off.y;
      if (el.type === 'text') { ctx.fillStyle = '#000'; this.drawText(ctx, el, sh.color); }
      else if (fills.length && !open) {
        ctx.fillStyle = Utils.rgba(fills[0].type === 'solid' ? fills[0].color : fills[0].stops[0].color, 1);
        if (sh.spread) { ctx.lineWidth = sh.spread * 2; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(path); }
        ctx.fill(path, el.fillRule);
      } else if (strokes.length) { ctx.strokeStyle = strokes[0].color; ctx.lineWidth = strokes[0].width; ctx.stroke(path); }
      ctx.restore();
    }

    // Fills
    if (el.type !== 'text') {
      for (const fill of fills) {
        ctx.save();
        ctx.globalAlpha *= fill.opacity ?? 1;
        if (fill.type === 'radial' && el.width > 0 && el.height > 0) {
          // radial gradients are fitted to the bounding box (ellipse), like Figma / SVG / CSS "ellipse closest-side"
          const sy = el.height / el.width;
          const p2 = new Path2D(); p2.addPath(path, new DOMMatrix().scale(1, 1 / sy));
          ctx.scale(1, sy);
          ctx.fillStyle = this.fillStyle(ctx, fill, el);
          ctx.fill(p2, el.fillRule);
        } else {
          ctx.fillStyle = this.fillStyle(ctx, fill, el);
          ctx.fill(path, el.fillRule);
        }
        ctx.restore();
      }
    }

    // Images (object-fit: cover inside the shape)
    if (el.type === 'image') {
      const img = this.getImage(el);
      ctx.save();
      ctx.clip(path);
      if (img) {
        const ir = img.naturalWidth / img.naturalHeight, er = el.width / Math.max(1, el.height);
        let dw = el.width, dh = el.height;
        if (ir > er) dw = dh * ir; else dh = dw / ir;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      } else {
        ctx.fillStyle = '#2a2a33'; ctx.fill(path);
      }
      ctx.restore();
    }

    // Inner shadows
    for (const sh of effects.filter(e => e.type === 'innerShadow')) {
      if (open) continue;
      ctx.save();
      ctx.clip(path);
      const off = this.shadowOffset(ctx, sh);
      ctx.shadowColor = Utils.rgba(sh.color);
      ctx.shadowBlur = sh.blur * s;
      ctx.shadowOffsetX = off.x; ctx.shadowOffsetY = off.y;
      const ring = new Path2D();
      const big = Math.max(el.width, el.height) * 2 + sh.blur * 4 + 200;
      ring.rect(-big, -big, big * 2, big * 2);
      ring.addPath(path);
      ctx.fillStyle = '#000';
      ctx.fill(ring, 'evenodd');
      ctx.restore();
    }

    // Text
    if (el.type === 'text') {
      for (const fill of fills) {
        ctx.save();
        ctx.globalAlpha *= fill.opacity ?? 1;
        ctx.fillStyle = this.fillStyle(ctx, fill, el);
        this.drawText(ctx, el);
        ctx.restore();
      }
    }

    // Strokes
    for (const st of strokes) {
      ctx.save();
      ctx.strokeStyle = Utils.rgba(st.color);
      ctx.lineJoin = open || el.type === 'path' ? 'round' : 'miter'; ctx.lineCap = open ? 'round' : 'butt';
      if (el.type === 'text') {
        ctx.lineWidth = st.width; this.drawText(ctx, el, null, true);
      } else if (el.type === 'line' || el.type === 'arrow') {
        const L = Geometry.lineSpec(el, st.width);
        ctx.lineWidth = st.width;
        if (L.dash) ctx.setLineDash(L.dash);
        ctx.stroke(new Path2D(L.line));
        ctx.setLineDash([]); ctx.lineJoin = 'round';
        ctx.fillStyle = Utils.rgba(st.color);
        for (const c of L.caps) { const cp = new Path2D(c.d); if (c.mode === 'fill') ctx.fill(cp); else ctx.stroke(cp); }
      } else if (open || st.align === 'center') {
        ctx.lineWidth = st.width; ctx.stroke(path);
      } else if (st.align === 'inside') {
        ctx.clip(path); ctx.lineWidth = st.width * 2; ctx.stroke(path);
      } else {
        const outside = new Path2D();
        const big = Math.max(el.width, el.height) * 2 + st.width * 4 + 100;
        outside.rect(-big, -big, big * 2, big * 2); outside.addPath(path);
        ctx.clip(outside, 'evenodd'); ctx.lineWidth = st.width * 2; ctx.stroke(path);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  shadowOffset(ctx, sh) {
    // shadow offsets are in device pixels and ignore the transform: map through the matrix (minus translation)
    const t = ctx.getTransform();
    return { x: t.a * sh.x + t.c * sh.y, y: t.b * sh.x + t.d * sh.y };
  }

  fillStyle(ctx, fill, el) {
    const w = el.width, h = el.height;
    if (fill.type === 'linear') {
      const rad = Utils.degToRad((fill.angle ?? 90) - 90);
      const half = (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))) / 2;
      const dx = Math.cos(rad) * half, dy = Math.sin(rad) * half;
      const g = ctx.createLinearGradient(-dx, -dy, dx, dy);
      for (const s of fill.stops) g.addColorStop(Utils.clamp(s.pos, 0, 1), Utils.rgba(s.color));
      return g;
    }
    if (fill.type === 'radial') {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, w) / 2);
      for (const s of fill.stops) g.addColorStop(Utils.clamp(s.pos, 0, 1), Utils.rgba(s.color));
      return g;
    }
    return Utils.rgba(fill.color);
  }

  drawText(ctx, el, colorOverride = null, stroke = false) {
    const lines = TextLayout.lines(el);
    const lh = TextLayout.lineHeight(el);
    ctx.font = TextLayout.font(el);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = el.textAlign || 'left';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${el.letterSpacing || 0}px`;
    if (colorOverride) ctx.fillStyle = Utils.rgba(colorOverride);
    const x0 = -el.width / 2;
    const ax = el.textAlign === 'center' ? 0 : el.textAlign === 'right' ? el.width / 2 : x0;
    let y = -el.height / 2 + TextLayout.baselineOffset(el);
    const manualLS = !('letterSpacing' in ctx) && el.letterSpacing; // Firefox / older Safari: no canvas letter-spacing
    for (const line of lines) {
      if (manualLS) {
        const w = TextLayout.measure(el, line), al = ctx.textAlign;
        let x = al === 'center' ? ax - w / 2 : al === 'right' ? ax - w : ax;
        ctx.textAlign = 'left';
        for (const ch of line) { if (stroke) ctx.strokeText(ch, x, y); else ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + el.letterSpacing; }
        ctx.textAlign = al;
      } else if (stroke) ctx.strokeText(line, ax, y); else ctx.fillText(line, ax, y);
      y += lh;
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  // ------------------------------------------------------------------ Editor overlays
  drawOverlays(ctx, tree) {
    const m = this.model, app = this.app, z = m.zoom;
    if (!app) return;
    const accent = '#3A8BFF', purple = '#8972F3'; // v3.30 brand blue / violet
    app.drawUserGuides?.(ctx); // guides.js (v3.11.0)

    // Layout grids (editor only)
    for (const el of m.elements) {
      if (el.type === 'frame' && el.layoutGrids?.length && m.isEffectivelyVisible(el)) this.drawLayoutGrids(ctx, el);
    }

    // Onion skins
    const tl = m.animationTimeline;
    if (tl.onionSkinning) {
      const step = Math.max(0.1, tl.duration / 20);
      for (const elId of Object.keys(tl.tracks)) {
        const el = m.getElementById(elId);
        if (!el) continue;
        [[-2, 0.18], [-1, 0.32], [1, 0.32], [2, 0.18]].forEach(([k, a]) => {
          const t = tl.currentTime + k * step;
          if (t < 0 || t > tl.duration) return;
          const g = {};
          for (const p of ['x', 'y', 'width', 'height', 'rotation']) { const v = m.evaluate(elId, p, t); g[p] = v === undefined ? el[p] : v; }
          ctx.save();
          ctx.globalAlpha = a;
          ctx.strokeStyle = k < 0 ? '#f24822' : '#14ae5c';
          ctx.lineWidth = 1.5 / z;
          this.strokeBox(ctx, g);
          ctx.restore();
        });
      }
    }

    // Frame name labels (root frames)
    ctx.save();
    ctx.font = `${11 / z}px Inter, -apple-system, sans-serif`;
    ctx.textBaseline = 'bottom';
    for (const el of tree.get(null) || []) {
      if (el.type !== 'frame' || !el.visible) continue;
      const sel = m.selectedIds.has(el.id);
      ctx.fillStyle = el.isComponentMaster || el.isComponentSet ? purple : sel ? accent : '#a0a0b0';
      ctx.fillText((el.isComponentSet ? '❖ ' : el.isComponentMaster ? '◆ ' : '') + el.name, el.x, el.y - 4 / z);
    }
    // variant names above each variant of a set (like Figma)
    for (const set of (tree.get(null) || []).filter(e => e.isComponentSet && e.visible)) {
      for (const v of tree.get(set.id) || []) if (v.isComponentMaster && v.visible) { ctx.fillStyle = purple; ctx.fillText('◆ ' + v.name, v.x, v.y - 4 / z); }
      // dashed purple outline marks the set
      ctx.save(); ctx.setLineDash([5 / z, 4 / z]); ctx.strokeStyle = purple; ctx.lineWidth = 1 / z; ctx.strokeRect(set.x, set.y, set.width, set.height); ctx.restore();
    }
    ctx.restore();

    // Hover outline
    const hov = m.hoveredId && !m.selectedIds.has(m.hoveredId) ? m.getElementById(m.hoveredId) : null;
    if (hov && !app.isMouseDown) {
      ctx.save(); ctx.strokeStyle = hov.isComponentMaster || hov.isComponentInstance ? purple : accent; ctx.lineWidth = 1.5 / z;
      this.strokeBox(ctx, hov); ctx.restore();
    }

    // Selection
    const sel = m.topSelected();
    if (sel.length) {
      ctx.save();
      for (const el of sel) {
        const comp = el.isComponentMaster || el.isComponentInstance;
        ctx.strokeStyle = comp ? purple : accent; ctx.lineWidth = 1 / z;
        this.strokeBox(ctx, el);
      }
      const box = app.selectionBox();
      if (box && !app.editingTextId) {
        const comp = sel.length === 1 && (sel[0].isComponentMaster || sel[0].isComponentInstance);
        const color = comp ? purple : accent;
        ctx.save();
        if (box.rotation) {
          ctx.translate(box.x + box.w / 2, box.y + box.h / 2); ctx.rotate(Utils.degToRad(box.rotation)); ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
        }
        ctx.strokeStyle = color; ctx.lineWidth = 1.5 / z;
        const lineSel = app.isLineSel();
        if (!lineSel) ctx.strokeRect(box.x, box.y, box.w, box.h);
        const showHandles = !(sel.length === 1 && (sel[0].type === 'line' || sel[0].type === 'arrow')) || true;
        if (app.isLineSel() && m.activeTool !== 'directSelect') { // v3.13.1: round end handles + curve handle
          const el = sel[0], ends = app.handlePositions(box); // the overlay is drawn in the line's own (rotated) frame
          const bh = { x: box.x + box.w / 2, y: box.y + box.h / 2 - ((+el.lineBend || 0) / 100) * el.width * 0.25 };
          ctx.lineWidth = 1.5 / z;
          for (const q of ends) { ctx.beginPath(); ctx.arc(q.x, q.y, 5.5 / z, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.stroke(); }
          const d = 4.5 / z; ctx.beginPath(); ctx.moveTo(bh.x, bh.y - d); ctx.lineTo(bh.x + d, bh.y); ctx.lineTo(bh.x, bh.y + d); ctx.lineTo(bh.x - d, bh.y); ctx.closePath();
          ctx.fillStyle = el.lineBend ? color : '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.stroke();
        } else if (showHandles && m.activeTool !== 'directSelect') {
          const hs = 7 / z;
          ctx.fillStyle = '#fff'; ctx.lineWidth = 1.2 / z;
          for (const p of app.handlePositions(box)) {
            ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
            ctx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
          }
        }
        // size pill (lines show their length while dragging instead)
        if (!lineSel) {
        const label = `${Math.round(box.w)} × ${Math.round(box.h)}`;
        ctx.font = `600 ${10 / z}px Inter, -apple-system, sans-serif`;
        const tw = ctx.measureText(label).width + 10 / z, th = 16 / z;
        const px = box.x + box.w / 2 - tw / 2, py = box.y + box.h + 6 / z;
        ctx.fillStyle = color;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(px, py, tw, th, 3 / z); ctx.fill(); } else ctx.fillRect(px, py, tw, th);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, px + tw / 2, py + th / 2);
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // Vector anchors (pen / direct select)
    const pathEl = app.penActivePath || (m.activeTool === 'directSelect' && sel.length === 1 && sel[0].type === 'path' && !sel[0].svgPath ? sel[0] : null);
    if (pathEl) this.drawAnchors(ctx, pathEl);
    if (app.penPreview && app.penActivePath) {
      const pts = app.penActivePath.points, last = pts[pts.length - 1];
      ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 1 / z; ctx.setLineDash([4 / z, 3 / z]);
      ctx.beginPath(); ctx.moveTo(app.penActivePath.x + last.x, app.penActivePath.y + last.y); ctx.lineTo(app.penPreview.x, app.penPreview.y); ctx.stroke();
      ctx.restore();
    }
    if (app.pencilPoints && app.pencilPoints.length > 1) {
      ctx.save(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath(); app.pencilPoints.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      ctx.restore();
    }

    if (app.endSnap) { ctx.save(); ctx.strokeStyle = '#f24822'; ctx.lineWidth = 1.5 / z; ctx.beginPath(); ctx.arc(app.endSnap.x, app.endSnap.y, 7 / z, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    // Smart guides
    if (m.activeGuides.length) {
      ctx.save();
      ctx.strokeStyle = '#f24822'; ctx.fillStyle = '#f24822'; ctx.lineWidth = 1 / z;
      ctx.font = `${10 / z}px Inter, monospace`;
      for (const g of m.activeGuides) {
        ctx.beginPath();
        if (g.type === 'v') { ctx.moveTo(g.pos, g.start); ctx.lineTo(g.pos, g.end); } else { ctx.moveTo(g.start, g.pos); ctx.lineTo(g.end, g.pos); }
        ctx.stroke();
      }
      ctx.restore();
    }

    // Distance / measure overlays
    const lines = [...(app.distanceLines || []), ...(app.measure ? [app.measure] : [])];
    if (lines.length) {
      ctx.save();
      ctx.strokeStyle = '#f24822'; ctx.lineWidth = 1 / z;
      ctx.font = `600 ${10 / z}px Inter, monospace`;
      for (const l of lines) {
        ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
        if (l.label) {
          const tw = ctx.measureText(l.label).width + 8 / z, th = 15 / z;
          const cx = (l.x1 + l.x2) / 2, cy = (l.y1 + l.y2) / 2;
          ctx.fillStyle = '#f24822'; ctx.fillRect(cx - tw / 2, cy - th / 2, tw, th);
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(l.label, cx, cy);
        }
      }
      ctx.restore();
    }

    // Marquee
    if (app.marquee) {
      const r = app.marquee;
      ctx.save();
      ctx.fillStyle = 'rgba(13,153,255,0.08)'; ctx.strokeStyle = accent; ctx.lineWidth = 1 / z;
      ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.restore();
    }

    // Drop target highlight while dragging into frames
    if (app.dropTargetId) {
      const t = m.getElementById(app.dropTargetId);
      if (t) { ctx.save(); ctx.strokeStyle = accent; ctx.lineWidth = 2 / z; ctx.setLineDash([6 / z, 4 / z]); this.strokeBox(ctx, t); ctx.restore(); }
    }
  }

  strokeBox(ctx, el) {
    ctx.save();
    ctx.translate(el.x + el.width / 2, el.y + el.height / 2);
    if (el.rotation) ctx.rotate(Utils.degToRad(el.rotation));
    ctx.strokeRect(-el.width / 2, -el.height / 2, el.width, el.height);
    ctx.restore();
  }

  drawAnchors(ctx, el) {
    const z = this.model.zoom;
    ctx.save();
    this.applyTransform(ctx, el);
    const ox = -el.width / 2, oy = -el.height / 2;
    ctx.lineWidth = 1 / z;
    el.points.forEach((p, i) => {
      if (p.cx1 !== undefined) {
        ctx.strokeStyle = 'rgba(13,153,255,0.7)';
        ctx.beginPath(); ctx.moveTo(ox + p.cx2, oy + p.cy2); ctx.lineTo(ox + p.x, oy + p.y); ctx.stroke();
        ctx.fillStyle = '#3A8BFF';
        ctx.beginPath(); ctx.arc(ox + p.cx2, oy + p.cy2, 3 / z, 0, Math.PI * 2); ctx.fill();
      }
      const s = 9 / z;
      const selected = this.app.activeAnchor === i;
      ctx.fillStyle = selected ? '#3A8BFF' : '#fff';
      ctx.strokeStyle = '#3A8BFF';
      ctx.fillRect(ox + p.x - s / 2, oy + p.y - s / 2, s, s);
      ctx.strokeRect(ox + p.x - s / 2, oy + p.y - s / 2, s, s);
    });
    ctx.restore();
  }

  drawLayoutGrids(ctx, frame) {
    ctx.save();
    ctx.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
    if (frame.rotation) ctx.rotate(Utils.degToRad(frame.rotation));
    ctx.translate(-frame.width / 2, -frame.height / 2);
    ctx.beginPath(); ctx.rect(0, 0, frame.width, frame.height); ctx.clip();
    for (const g of frame.layoutGrids) {
      if (g.visible === false) continue;
      ctx.fillStyle = Utils.rgba(g.color || 'rgba(255,0,0,0.1)');
      if (g.type === 'grid') {
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1 / this.model.zoom;
        ctx.beginPath();
        for (let x = 0; x <= frame.width; x += g.size || 8) { ctx.moveTo(x, 0); ctx.lineTo(x, frame.height); }
        for (let y = 0; y <= frame.height; y += g.size || 8) { ctx.moveTo(0, y); ctx.lineTo(frame.width, y); }
        ctx.stroke();
        continue;
      }
      const isCol = g.type === 'columns';
      const total = isCol ? frame.width : frame.height;
      const count = Math.max(1, g.count), gutter = g.gutter || 0, margin = g.margin || 0;
      const size = Math.max(1, (total - margin * 2 - gutter * (count - 1)) / count);
      for (let i = 0; i < count; i++) {
        const o = margin + i * (size + gutter);
        if (isCol) ctx.fillRect(o, 0, size, frame.height); else ctx.fillRect(0, o, frame.width, size);
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ Offscreen rendering
  /** Bounds (world) of a set of root elements. */
  boundsOf(roots) { return Utils.unionBounds(roots.map(r => Utils.aabb(r))); }

  renderToCanvas({ roots, bounds, scale = 1, bg = null, canvas = null, maxSize = 8192 }) {
    const b = bounds || this.boundsOf(roots) || { x: 0, y: 0, w: 1, h: 1 };
    let s = scale;
    const longest = Math.max(b.w, b.h) * s;
    if (longest > maxSize) s = maxSize / Math.max(b.w, b.h);
    const c = canvas || document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.w * s)); c.height = Math.max(1, Math.round(b.h * s));
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (bg && bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.scale(s, s);
    ctx.translate(-b.x, -b.y);
    const tree = this.model.buildTree();
    for (const r of roots) this.drawNode(ctx, r, { tree });
    return c;
  }
}

class StudioRulers {
  constructor(rulerXCanvas, rulerYCanvas, model) {
    this.rx = rulerXCanvas; this.ry = rulerYCanvas; this.model = model;
    this.selRange = null;
  }
  get visible() { return this.model.showRulers; }
  niceStep(zoom) {
    const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    return steps.find(s => s * zoom >= 50) || 10000;
  }
  render() {
    if (!this.visible) return;
    const dpr = window.devicePixelRatio || 1, m = this.model;
    const wrap = document.getElementById('canvas-wrap');
    const wx = Math.max(1, wrap.clientWidth), hy = Math.max(1, wrap.clientHeight);
    if (this.rx.style.width !== `${wx}px`) this.rx.style.width = `${wx}px`;
    if (this.ry.style.height !== `${hy}px`) this.ry.style.height = `${hy}px`;
    if (this.rx.width !== Math.round(wx * dpr)) { this.rx.width = Math.round(wx * dpr); this.rx.height = 20 * dpr; }
    if (this.ry.height !== Math.round(hy * dpr)) { this.ry.height = Math.round(hy * dpr); this.ry.width = 20 * dpr; }
    const step = this.niceStep(m.zoom);
    const offX = 20; // ruler-x starts after corner
    const cx = this.rx.getContext('2d'), cy = this.ry.getContext('2d');
    const draw = (ctx, len, isX) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#2d2d30'; ctx.fillRect(0, 0, isX ? len : 20, isX ? 20 : len);
      const pan = isX ? m.panX : m.panY;
      if (this.selRange) {
        const [a, b] = isX ? [this.selRange.x, this.selRange.x + this.selRange.w] : [this.selRange.y, this.selRange.y + this.selRange.h];
        ctx.fillStyle = 'rgba(13,153,255,0.25)';
        const s1 = a * m.zoom + pan, s2 = b * m.zoom + pan;
        if (isX) ctx.fillRect(s1, 0, s2 - s1, 20); else ctx.fillRect(0, s1, 20, s2 - s1);
      }
      ctx.strokeStyle = '#5a5a60'; ctx.fillStyle = '#9a9aa0';
      ctx.font = '9px Inter, -apple-system, sans-serif';
      ctx.lineWidth = 1;
      const startWorld = Math.floor((-pan) / m.zoom / step) * step;
      for (let wv = startWorld; ; wv += step) {
        const sp = wv * m.zoom + pan;
        if (sp > len) break;
        ctx.beginPath();
        if (isX) { ctx.moveTo(Math.round(sp) + 0.5, 12); ctx.lineTo(Math.round(sp) + 0.5, 20); }
        else { ctx.moveTo(12, Math.round(sp) + 0.5); ctx.lineTo(20, Math.round(sp) + 0.5); }
        ctx.stroke();
        if (isX) ctx.fillText(String(wv), sp + 3, 10);
        else { ctx.save(); ctx.translate(10, sp - 3); ctx.rotate(-Math.PI / 2); ctx.fillText(String(wv), 0, 0); ctx.restore(); }
        // minor ticks
        for (let k = 1; k < 5; k++) {
          const mp = sp + (step * m.zoom * k) / 5;
          ctx.beginPath();
          if (isX) { ctx.moveTo(Math.round(mp) + 0.5, 16); ctx.lineTo(Math.round(mp) + 0.5, 20); }
          else { ctx.moveTo(16, Math.round(mp) + 0.5); ctx.lineTo(20, Math.round(mp) + 0.5); }
          ctx.stroke();
        }
      }
      // v3.11.0: selection start / end values (Figma style) and ruler guide marks
      const pill = (sp, text, bg, fg) => {
        ctx.font = '600 9px Inter, -apple-system, sans-serif';
        const tw = ctx.measureText(text).width + 6;
        ctx.save();
        if (!isX) { ctx.translate(10, sp); ctx.rotate(-Math.PI / 2); ctx.translate(-sp, -10); }
        ctx.fillStyle = bg; ctx.fillRect(Math.round(sp - tw / 2), 3, Math.round(tw), 13);
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.fillText(text, sp, 13); ctx.restore();
      };
      if (this.selRange) {
        const [a, b] = isX ? [this.selRange.x, this.selRange.x + this.selRange.w] : [this.selRange.y, this.selRange.y + this.selRange.h];
        const s1 = a * m.zoom + pan, s2 = b * m.zoom + pan;
        pill(s1, String(Math.round(a)), '#2F72D6', '#ffffff');
        if (s2 - s1 > 30) pill(s2, String(Math.round(b)), '#2F72D6', '#ffffff');
      }
      for (const g of (this.app?.rulerGuideMarks?.() || [])) {
        if ((g.axis === 'x') !== isX) continue; // vertical guides → top ruler, horizontal → left ruler
        const sp = g.abs * m.zoom + pan;
        if (sp < -20 || sp > len + 20) continue;
        ctx.fillStyle = '#f2357a';
        if (isX) ctx.fillRect(Math.round(sp) - 1, 12, 2, 8); else ctx.fillRect(12, Math.round(sp) - 1, 8, 2);
        if (g.hot) pill(sp, g.label, '#f2357a', '#ffffff');
      }
    };
    // rulers are offset by the 20px corner relative to the canvas origin
    const saveX = m.panX, saveY = m.panY;
    draw(cx, wx, true);
    draw(cy, hy, false);
    m.panX = saveX; m.panY = saveY;
    void offX;
  }
}
