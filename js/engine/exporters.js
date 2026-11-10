/**
 * DesignStudio — exporters & importers (SVG, HTML/CSS/React/Vue/Svelte, tokens,
 * dev-handoff snippets, Lottie, CSS keyframes, Figma REST-shaped JSON, SVG import).
 */
'use strict';

const BLEND_CSS = { 'source-over': 'normal' };
const Exporters = {
  f: (n) => Utils.round(n, 2),
  px: (n) => `${Utils.round(n, 2)}px`,

  // ======================================================================= SVG
  svgDocument(model, roots, { bg = null, bounds = null, anim = null, animOp = null, style = '' } = {}) {
    const b = bounds || Utils.unionBounds(roots.map(r => Utils.aabb(r))) || { x: 0, y: 0, w: 100, h: 100 };
    const ctx = { defs: [], tree: model.buildTree(), model, n: 0, pfx: this.idPrefix(), anim, animOp };
    const body = roots.map(r => this.svgNode(r, ctx, '  ')).join('');
    const f = this.f;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(b.w)}" height="${f(b.h)}" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}" fill="none">\n`;
    if (style) out += `  <style>\n${style}  </style>\n`;
    if (ctx.defs.length) out += `  <defs>\n${ctx.defs.join('')}  </defs>\n`;
    if (bg && bg !== 'transparent') out += `  <rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="${Utils.toHex(bg)}"/>\n`;
    return out + body + '</svg>\n';
  },
  idPrefix() { this._docN = (this._docN || 0) + 1; return `ds${this._docN.toString(36)}${Math.random().toString(36).slice(2, 5)}`; },
  /** Extra room an element's stroke / arrow head needs outside its box. */
  svgPad(el) {
    const sw = Math.max(0, ...el.strokes.filter(s => s.visible !== false).map(s => (s.align === 'outside' ? s.width : s.align === 'inside' && !Geometry.isOpen(el) ? 0 : s.width / 2)));
    const lineish = el.type === 'arrow' || el.type === 'line';
    return Math.ceil(sw + (lineish ? Math.max(8, ...el.strokes.map(s => s.width * 4)) * (+el.arrowSize || 1) * 0.8 + Math.abs(+el.lineBend || 0) / 100 * el.width * 0.5 : 0));
  },

  /** Stand-alone SVG for one element, drawn in its own local box (used inside HTML exports). */
  svgForElement(model, el) {
    const clone = StudioElement.fromJSON(JSON.parse(JSON.stringify(el)));
    clone.x = 0; clone.y = 0; clone.rotation = 0; clone.flipX = false; clone.flipY = false; clone.opacity = 1; clone.parentId = null; clone.blendMode = 'source-over';
    clone.effects = clone.effects.filter(e => e.type !== 'layerBlur');
    const ctx = { defs: [], tree: new Map(), model, n: 0, pfx: this.idPrefix() };
    const pad = this.svgPad(el);
    const body = this.svgNode(clone, ctx, '');
    const f = this.f;
    const w = clone.width + pad * 2, h = clone.height + pad * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${f(-pad)} ${f(-pad)} ${f(w)} ${f(h)}" overflow="visible" fill="none" style="display:block">` +
      (ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>` : '') + body.replace(/\n\s*/g, '') + '</svg>';
  },

  svgPaint(fill, ctx, el) {
    if (fill.type === 'solid') return Utils.toHex(fill.color);
    const id = `${ctx.pfx}g${++ctx.n}`;
    const f = this.f;
    const stops = fill.stops.map(s => `<stop offset="${Utils.round(s.pos, 3)}" stop-color="${Utils.toHex(s.color)}"${Utils.alphaOf(s.color) < 1 ? ` stop-opacity="${Utils.round(Utils.alphaOf(s.color), 3)}"` : ''}/>`).join('');
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    if (fill.type === 'linear') {
      // same gradient line as CSS linear-gradient(<angle>) and the canvas renderer
      const rad = Utils.degToRad((fill.angle ?? 90) - 90);
      const half = (Math.abs(el.width * Math.cos(rad)) + Math.abs(el.height * Math.sin(rad))) / 2;
      const dx = Math.cos(rad) * half, dy = Math.sin(rad) * half;
      ctx.defs.push(`    <linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(cx - dx)}" y1="${f(cy - dy)}" x2="${f(cx + dx)}" y2="${f(cy + dy)}">${stops}</linearGradient>\n`);
    } else {
      const r = Math.max(0.01, el.width / 2), sy = el.height / Math.max(0.01, el.width);
      ctx.defs.push(`    <radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" gradientTransform="translate(${f(cx)} ${f(cy)}) scale(1 ${Utils.round(sy, 5)}) translate(${f(-cx)} ${f(-cy)})">${stops}</radialGradient>\n`);
    }
    return `url(#${id})`;
  },

  svgGeometry(el) {
    const f = this.f, x = el.x, y = el.y, w = el.width, h = el.height, cx = x + w / 2, cy = y + h / 2;
    switch (el.type) {
      case 'rect': case 'frame': case 'image': case 'text': {
        const r = Math.min(el.cornerRadius || 0, w / 2, h / 2);
        return { tag: 'rect', attrs: `x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${r ? ` rx="${f(r)}"` : ''}` };
      }
      case 'ellipse': return { tag: 'ellipse', attrs: `cx="${f(cx)}" cy="${f(cy)}" rx="${f(w / 2)}" ry="${f(h / 2)}"` };
      case 'line': case 'arrow': { const L = Geometry.lineSpec(el, el.strokes?.[0]?.width || 2); return { tag: 'path', attrs: `d="${L.line}" transform="translate(${f(cx)} ${f(cy)})"${L.dash ? ` stroke-dasharray="${L.dash.map(v => f(v)).join(' ')}"` : ''}${L.round ? ' stroke-linecap="round"' : ''}` }; }
      case 'polygon': case 'star': {
        const pts = (el.type === 'polygon' ? Geometry.polygonPoints(el) : Geometry.starPoints(el)).map(p => `${f(cx + p.x)},${f(cy + p.y)}`).join(' ');
        return { tag: 'polygon', attrs: `points="${pts}"` };
      }
      case 'path': {
        if (el.svgPath && el.svgBox) {
          const b = el.svgBox, sx = b.w ? w / b.w : 1, sy = b.h ? h / b.h : 1;
          const m = el.svgMatrix ? ` matrix(${el.svgMatrix.map(v => Utils.round(v, 5)).join(' ')})` : '';
          return { tag: 'path', attrs: `d="${Utils.escapeXml(el.svgPath)}" transform="translate(${f(x)} ${f(y)}) scale(${Utils.round(sx, 5)} ${Utils.round(sy, 5)}) translate(${f(-b.x)} ${f(-b.y)})${m}"` };
        }
        return { tag: 'path', attrs: `d="${Geometry.pointsToD(el)}" transform="translate(${f(x)} ${f(y)})"` };
      }
      default: return { tag: 'rect', attrs: `x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"` };
    }
  },

  svgNode(el, ctx, ind) {
    if (!el.visible) return '';
    const f = this.f, cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    const tf = [];
    if (el.rotation) tf.push(`rotate(${f(el.rotation)} ${f(cx)} ${f(cy)})`);
    if (el.flipX || el.flipY) tf.push(`translate(${f(cx)} ${f(cy)}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1}) translate(${f(-cx)} ${f(-cy)})`);
    const tfAttr = tf.length ? ` transform="${tf.join(' ')}"` : '';
    // outer group: identity + opacity/blend (children are authored in world space, so they must not inherit the transform)
    const gAttrs = [`id="${Utils.escapeXml(Utils.slug(el.name))}-${el.id.slice(3, 8)}"`];
    if (ctx.animOp?.has(el.id)) gAttrs.push(`class="${ctx.animOp.get(el.id)}"`);
    if (el.opacity < 1) gAttrs.push(`opacity="${Utils.round(el.opacity, 3)}"`);
    if (el.blendMode && el.blendMode !== 'source-over') gAttrs.push(`style="mix-blend-mode:${el.blendMode}"`);
    const effects = el.effects.filter(e => e.visible !== false);
    const shadows = effects.filter(e => e.type === 'dropShadow');
    const inner = effects.filter(e => e.type === 'innerShadow');
    const blur = effects.find(e => e.type === 'layerBlur');
    let filterAttr = '';
    if (shadows.length || blur || inner.length) {
      const id = `${ctx.pfx}fx${++ctx.n}`;
      let fx = `    <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">`;
      shadows.forEach((s, i) => {
        fx += `<feDropShadow in="SourceGraphic" dx="${f(s.x)}" dy="${f(s.y)}" stdDeviation="${f(s.blur / 2)}" flood-color="${Utils.toHex(s.color)}" flood-opacity="${Utils.round(Utils.alphaOf(s.color), 3)}" result="s${i}"/>`;
      });
      if (shadows.length > 1) fx += `<feMerge>${shadows.map((_, i) => `<feMergeNode in="s${i}"/>`).join('')}</feMerge>`;
      let last = shadows.length ? (shadows.length > 1 ? 'merged' : `s${shadows.length - 1}`) : 'SourceGraphic';
      if (shadows.length > 1) fx = fx.replace(/<\/feMerge>$/, '</feMerge>').replace('<feMerge>', '<feMerge result="merged">');
      inner.forEach((s, i) => {
        fx += `<feOffset in="SourceAlpha" dx="${f(s.x)}" dy="${f(s.y)}" result="io${i}"/><feGaussianBlur in="io${i}" stdDeviation="${f(s.blur / 2)}" result="ib${i}"/>` +
          `<feComposite in="SourceAlpha" in2="ib${i}" operator="out" result="ic${i}"/><feFlood flood-color="${Utils.toHex(s.color)}" flood-opacity="${Utils.round(Utils.alphaOf(s.color), 3)}"/>` +
          `<feComposite in2="ic${i}" operator="in" result="ish${i}"/><feComposite in="ish${i}" in2="${last}" operator="over" result="iv${i}"/>`;
        last = `iv${i}`;
      });
      if (blur) fx += `<feGaussianBlur in="${last}" stdDeviation="${f(blur.blur / 2)}"/>`;
      fx += '</filter>\n';
      ctx.defs.push(fx);
      filterAttr = ` filter="url(#${id})"`;
    }
    const geo = this.svgGeometry(el);
    const fills = el.fills.filter(fl => fl.visible !== false);
    const strokes = el.strokes.filter(s => s.visible !== false && s.width > 0);
    const si = ind + '    ';
    let self = '';
    if (el.type === 'text') {
      self += this.svgText(el, fills, strokes, si, ctx);
    } else if (el.type === 'image') {
      const src = (el.assetId && ctx.model.assets[el.assetId]) || el.imageDataUrl;
      const clipId = `${ctx.pfx}ic${++ctx.n}`;
      ctx.defs.push(`    <clipPath id="${clipId}"><${geo.tag} ${geo.attrs}/></clipPath>\n`);
      if (src) self += `${si}<image href="${Utils.escapeXml(src)}" x="${f(el.x)}" y="${f(el.y)}" width="${f(el.width)}" height="${f(el.height)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>\n`;
    } else if (el.type !== 'group' && geo.tag !== 'line') {
      for (const fl of fills) {
        const a = (fl.opacity ?? 1) * (fl.type === 'solid' ? Utils.alphaOf(fl.color) : 1);
        self += `${si}<${geo.tag} ${geo.attrs} fill="${this.svgPaint(fl, ctx, el)}"${a < 1 ? ` fill-opacity="${Utils.round(a, 3)}"` : ''}${el.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>\n`;
      }
    }
    if (el.type !== 'text' && el.type !== 'group') {
      const open = Geometry.isOpen(el);
      for (const s of strokes) {
        const align = open ? 'center' : s.align || 'center';
        const join = open || el.type === 'path' ? 'round' : 'miter';
        let wrap = '';
        if (align === 'inside') {
          const cid = `${ctx.pfx}si${++ctx.n}`;
          ctx.defs.push(`    <clipPath id="${cid}"><${geo.tag} ${geo.attrs}${el.fillRule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath>\n`);
          wrap = ` clip-path="url(#${cid})"`;
        } else if (align === 'outside') {
          const mid = `${ctx.pfx}so${++ctx.n}`, big = Math.max(el.width, el.height) + s.width * 4 + 10;
          ctx.defs.push(`    <mask id="${mid}" maskUnits="userSpaceOnUse" x="${f(el.x - big)}" y="${f(el.y - big)}" width="${f(el.width + big * 2)}" height="${f(el.height + big * 2)}"><rect x="${f(el.x - big)}" y="${f(el.y - big)}" width="${f(el.width + big * 2)}" height="${f(el.height + big * 2)}" fill="#fff"/><${geo.tag} ${geo.attrs} fill="#000"/></mask>\n`);
          wrap = ` mask="url(#${mid})"`;
        }
        const w = align === 'center' ? s.width : s.width * 2;
        self += `${si}<${geo.tag} ${geo.attrs} fill="none" stroke="${Utils.toHex(s.color)}" stroke-width="${f(w)}"${Utils.alphaOf(s.color) < 1 ? ` stroke-opacity="${Utils.round(Utils.alphaOf(s.color), 3)}"` : ''} stroke-linecap="${open ? 'round' : 'butt'}" stroke-linejoin="${join}"${wrap}/>\n`;
        if (el.type === 'arrow' || el.type === 'line') {
          const L = Geometry.lineSpec(el, s.width), tr = `translate(${f(el.x + el.width / 2)} ${f(el.y + el.height / 2)})`, col = Utils.toHex(s.color);
          for (const c of L.caps) self += `${si}<path d="${c.d}" transform="${tr}" ${c.mode === 'fill' ? `fill="${col}"` : `fill="none" stroke="${col}" stroke-width="${f(s.width)}" stroke-linejoin="round" stroke-linecap="round"`}/>\n`;
        }
      }
    }
    let out = `${ind}<g ${gAttrs.join(' ')}>\n`;
    if (self) {
      const inner = `${ind}  <g${tfAttr}${filterAttr}>\n${self}${ind}  </g>\n`;
      const ac = ctx.anim?.get(el.id); // v3.13.1 animated SVG: a wrapper the CSS animation moves (children stay independent, like the canvas)
      out += ac ? `${ind}  <g class="${ac}">\n${inner}${ind}  </g>\n` : inner;
    }
    const kids = ctx.tree.get(el.id) || [];
    if (kids.length) {
      let clip = '';
      if (el.type === 'frame' && el.clipContent !== false) {
        const clipId = `${ctx.pfx}cl${++ctx.n}`;
        ctx.defs.push(`    <clipPath id="${clipId}"><${geo.tag} ${geo.attrs}${tfAttr}/></clipPath>\n`);
        clip = ` clip-path="url(#${clipId})"`;
      }
      out += `${ind}  <g${clip}>\n${kids.map(k => this.svgNode(k, ctx, ind + '    ')).join('')}${ind}  </g>\n`;
    }
    return out + `${ind}</g>\n`;
  },

  svgText(el, fills, strokes, ind, ctx) {
    const f = this.f;
    const lines = TextLayout.lines(el);
    const lh = TextLayout.lineHeight(el);
    const anchor = el.textAlign === 'center' ? 'middle' : el.textAlign === 'right' ? 'end' : 'start';
    const ax = el.textAlign === 'center' ? el.x + el.width / 2 : el.textAlign === 'right' ? el.x + el.width : el.x;
    const fill = fills[0];
    const paint = fill ? this.svgPaint(fill, ctx, el) : 'none';
    const base = TextLayout.baselineOffset(el);
    const stroke = strokes[0] ? ` stroke="${Utils.toHex(strokes[0].color)}" stroke-width="${f(strokes[0].width)}"` : '';
    const spans = lines.map((l, i) => `<tspan x="${f(ax)}" y="${f(el.y + lh * i + base)}">${Utils.escapeXml(l) || ' '}</tspan>`).join('');
    return `${ind}<text font-family="${Utils.escapeXml(el.fontFamily)}" font-size="${f(el.fontSize)}" font-weight="${el.fontWeight}"${el.letterSpacing ? ` letter-spacing="${f(el.letterSpacing)}"` : ''} text-anchor="${anchor}" fill="${paint}"${fill && fill.opacity < 1 ? ` fill-opacity="${Utils.round(fill.opacity, 3)}"` : ''}${stroke} xml:space="preserve">${spans}</text>\n`;
  },

  // ======================================================================= CSS / HTML code
  isSvgType(el) { return ['line', 'arrow', 'polygon', 'star', 'path'].includes(el.type); },

  cssColorOf(fill) {
    if (!fill) return 'transparent';
    if (fill.type === 'solid') return Utils.rgba(fill.color, fill.opacity ?? 1);
    const stops = fill.stops.map(s => `${Utils.rgba(s.color, fill.opacity ?? 1)} ${Utils.round(s.pos * 100, 1)}%`).join(', ');
    return fill.type === 'linear' ? `linear-gradient(${Utils.round(fill.angle ?? 90, 1)}deg, ${stops})` : `radial-gradient(ellipse closest-side at center, ${stops})`;
  },

  /** Element box + rotation expressed in its parent's local (unrotated, unflipped) frame. */
  localBox(el, parent) {
    const flipX = el.flipX, flipY = el.flipY;
    if (!parent || (!parent.rotation && !parent.flipX && !parent.flipY)) {
      return { x: el.x - (parent ? parent.x : 0), y: el.y - (parent ? parent.y : 0), rotation: el.rotation || 0, flipX, flipY };
    }
    const pc = { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 };
    let c = Utils.rotatePoint(el.x + el.width / 2, el.y + el.height / 2, pc.x, pc.y, -(parent.rotation || 0));
    if (parent.flipX) c.x = 2 * pc.x - c.x;
    if (parent.flipY) c.y = 2 * pc.y - c.y;
    const oneFlip = !!parent.flipX !== !!parent.flipY;
    let rotation = oneFlip ? (parent.rotation || 0) - (el.rotation || 0) : (el.rotation || 0) - (parent.rotation || 0) - (parent.flipX && parent.flipY ? 180 : 0);
    rotation = ((rotation + 180) % 360 + 360) % 360 - 180;
    return { x: c.x - el.width / 2 - parent.x, y: c.y - el.height / 2 - parent.y, rotation, flipX: parent.flipX ? !flipX : flipX, flipY: parent.flipY ? !flipY : flipY };
  },

  /** Ordered CSS declarations for an element relative to its (in-scope) parent. */
  cssDecls(el, parent, { root = false } = {}) {
    const d = [], px = this.px;
    const inFlex = parent && parent.type === 'frame' && parent.isAutoLayout;
    if (root) d.push(['position', 'relative'], ['width', px(el.width)], ['height', px(el.height)]);
    else if (inFlex) d.push(['position', 'relative'], ['flex-shrink', '0'], ['width', px(el.width)], ['height', px(el.height)]);
    else {
      const lb = this.localBox(el, parent);
      const pad = this.isSvgType(el) ? this.svgPad(el) : 0;
      d.push(['position', 'absolute'], ['left', px(lb.x - pad)], ['top', px(lb.y - pad)], ['width', px(el.width + pad * 2)], ['height', px(el.height + pad * 2)]);
      d._local = lb;
    }
    if (inFlex && this.isSvgType(el)) { const pad = this.svgPad(el); d.push(['width', px(el.width + pad * 2)], ['height', px(el.height + pad * 2)], ['margin', `${px(-pad)}`]); }
    if (el.type === 'frame' && el.isAutoLayout) {
      const [v, h] = el.layoutAlign === 'center' ? ['center', 'center'] : el.layoutAlign.split('-');
      const map = { top: 'flex-start', left: 'flex-start', center: 'center', bottom: 'flex-end', right: 'flex-end' };
      const isH = el.layoutDirection === 'horizontal';
      d.push(['display', 'flex'], ['flex-direction', isH ? 'row' : 'column'], ['gap', px(el.layoutGap)],
        ['padding', `${px(el.layoutPaddingTop)} ${px(el.layoutPaddingRight)} ${px(el.layoutPaddingBottom)} ${px(el.layoutPaddingLeft)}`],
        ['justify-content', map[isH ? h : v]], ['align-items', el.counterSizing === 'fill' ? 'stretch' : map[isH ? v : h]], ['box-sizing', 'border-box']);
    }
    if (el.type === 'frame' && el.clipContent !== false) d.push(['overflow', 'hidden']);
    const fills = el.fills.filter(f => f.visible !== false);
    if (el.type === 'text') {
      d.push(['margin', '0'], ['color', fills[0] ? Utils.rgba(fills[0].type === 'solid' ? fills[0].color : fills[0].stops[0].color, fills[0].opacity) : 'inherit'],
        ['font-family', el.fontFamily], ['font-size', px(el.fontSize)], ['font-weight', String(el.fontWeight)],
        ['line-height', px(TextLayout.lineHeight(el))], ['text-align', el.textAlign || 'left'],
        ['white-space', el.textAutoResize === 'width' ? 'pre' : 'pre-wrap']);
      if (el.letterSpacing) d.push(['letter-spacing', px(el.letterSpacing)]);
    } else if (!this.isSvgType(el) && el.type !== 'image' && el.type !== 'group' && fills.length) {
      const layers = fills.slice().reverse().map(f => this.cssColorOf(f));
      if (layers.length === 1 && fills[0].type === 'solid') d.push(['background-color', layers[0]]);
      else d.push(['background', layers.map(l => (l.includes('gradient') ? l : `linear-gradient(${l}, ${l})`)).join(', ')]);
    }
    if (el.type === 'ellipse') d.push(['border-radius', '50%']);
    else if (el.cornerRadius && !this.isSvgType(el)) d.push(['border-radius', px(el.cornerRadius)]);
    const shadows = [];
    const stroke = el.strokes.find(s => s.visible !== false && s.width > 0);
    if (stroke && !this.isSvgType(el) && el.type !== 'text') {
      if (stroke.align === 'inside') shadows.push(`inset 0 0 0 ${px(stroke.width)} ${Utils.rgba(stroke.color)}`);
      else d.push(['outline', `${px(stroke.width)} solid ${Utils.rgba(stroke.color)}`], ['outline-offset', stroke.align === 'center' ? px(-stroke.width / 2) : '0px']);
    }
    if (el.type === 'text' && stroke) d.push(['-webkit-text-stroke', `${px(stroke.width)} ${Utils.rgba(stroke.color)}`]);
    for (const e of el.effects.filter(e => e.visible !== false)) {
      if (e.type === 'dropShadow' || e.type === 'innerShadow') {
        if (el.type === 'text') d.push(['text-shadow', `${px(e.x)} ${px(e.y)} ${px(e.blur)} ${Utils.rgba(e.color)}`]);
        else shadows.push(`${e.type === 'innerShadow' ? 'inset ' : ''}${px(e.x)} ${px(e.y)} ${px(e.blur)} ${px(e.spread || 0)} ${Utils.rgba(e.color)}`);
      }
      if (e.type === 'layerBlur') d.push(['filter', `blur(${px(e.blur / 2)})`]);
      if (e.type === 'backgroundBlur') d.push(['backdrop-filter', `blur(${px(e.blur / 2)})`]);
    }
    if (shadows.length) d.push(['box-shadow', shadows.join(', ')]);
    if (el.opacity < 1) d.push(['opacity', String(Utils.round(el.opacity, 3))]);
    if (el.blendMode && el.blendMode !== 'source-over') d.push(['mix-blend-mode', el.blendMode]);
    const lb = d._local || { rotation: el.rotation || 0, flipX: el.flipX, flipY: el.flipY };
    const tf = [];
    if (lb.rotation) tf.push(`rotate(${Utils.round(lb.rotation, 2)}deg)`);
    if (lb.flipX || lb.flipY) tf.push(`scale(${lb.flipX ? -1 : 1}, ${lb.flipY ? -1 : 1})`);
    if (tf.length) d.push(['transform', tf.join(' ')]);
    if (el.type === 'image') d.push(['object-fit', 'cover'], ['display', 'block']);
    if (el.type !== 'text' && el.type !== 'image') d.push(['box-sizing', 'border-box']);
    // de-dupe (later wins)
    const seen = new Map();
    for (const [k, v] of d) seen.set(k, v);
    return [...seen.entries()];
  },

  tailwindFrom(decls) {
    const arb = (v) => String(v).replace(/\s+/g, '_');
    const out = [];
    for (const [k, v] of decls) {
      const map = {
        position: () => (['absolute', 'relative'].includes(v) ? v : `[position:${v}]`),
        left: () => `left-[${arb(v)}]`, top: () => `top-[${arb(v)}]`, width: () => `w-[${arb(v)}]`, height: () => `h-[${arb(v)}]`,
        display: () => (v === 'flex' ? 'flex' : v === 'block' ? 'block' : `[display:${v}]`),
        'flex-direction': () => (v === 'column' ? 'flex-col' : 'flex-row'), 'flex-shrink': () => 'shrink-0',
        gap: () => `gap-[${arb(v)}]`, padding: () => `p-[${arb(v)}]`, overflow: () => 'overflow-hidden',
        'justify-content': () => ({ 'flex-start': 'justify-start', center: 'justify-center', 'flex-end': 'justify-end' }[v] || `[justify-content:${v}]`),
        'align-items': () => ({ 'flex-start': 'items-start', center: 'items-center', 'flex-end': 'items-end', stretch: 'items-stretch' }[v] || `[align-items:${v}]`),
        'background-color': () => `bg-[${arb(v)}]`, 'border-radius': () => (v === '50%' ? 'rounded-full' : `rounded-[${arb(v)}]`),
        opacity: () => `opacity-[${v}]`, color: () => `text-[${arb(v)}]`, 'font-size': () => `text-[${v}]`, 'font-weight': () => `font-[${v}]`,
        'line-height': () => `leading-[${v}]`, 'letter-spacing': () => `tracking-[${v}]`, 'text-align': () => `text-${v}`,
        margin: () => 'm-0', 'box-sizing': () => (v === 'border-box' ? 'box-border' : 'box-content'), 'object-fit': () => 'object-cover',
        'white-space': () => (v === 'pre' ? 'whitespace-pre' : 'whitespace-pre-wrap')
      };
      out.push(map[k] ? map[k]() : `[${k}:${arb(v)}]`);
    }
    return out.join(' ');
  },

  /** Build class names for every element under the scope roots. */
  classNames(model, roots, mode = 'plain') {
    const used = new Map(), names = new Map();
    const tree = model.buildTree();
    const block = Utils.slug(roots.length === 1 ? roots[0].name : 'design', 'design');
    const visit = (el, isRoot) => {
      let base = mode === 'bem' ? (isRoot ? block : `${block}__${Utils.slug(el.name)}`) : Utils.slug(el.name);
      const n = (used.get(base) || 0) + 1; used.set(base, n);
      names.set(el.id, n > 1 ? `${base}-${n}` : base);
      for (const k of tree.get(el.id) || []) visit(k, false);
    };
    roots.forEach(r => visit(r, roots.length === 1));
    return names;
  },

  /**
   * Production code. opts: { type: full-webpage|css-only|svg-raw|tokens, framework: plain|react|vue|svelte, cssMode: plain|bem|tailwind, title }
   */
  code(model, roots, opts) {
    if (opts.type === 'svg-raw') return this.svgDocument(model, roots);
    if (opts.type === 'tokens') return this.tokens(model);
    if (!roots.length) return '/* Nothing to export — add some layers first. */';
    const tree = model.buildTree();
    const tailwind = opts.cssMode === 'tailwind';
    const names = this.classNames(model, roots, opts.cssMode === 'bem' ? 'bem' : 'plain');
    const multi = roots.length > 1;
    const bounds = Utils.unionBounds(roots.map(r => Utils.aabb(r)));
    const wrapper = multi ? Object.assign(new StudioElement('group', bounds.x, bounds.y, bounds.w, bounds.h), { name: 'design', fills: [] }) : null;
    const css = [];
    const jsx = opts.framework === 'react';
    const attrClass = jsx ? 'className' : 'class';
    if (wrapper) css.push(`.design {\n  position: relative;\n  width: ${this.px(bounds.w)};\n  height: ${this.px(bounds.h)};\n}`);

    const nodeMarkup = (el, parent, ind) => {
      if (!el.visible) return '';
      const decls = this.cssDecls(el, parent, { root: !parent });
      const cls = tailwind ? this.tailwindFrom(decls) : names.get(el.id);
      if (!tailwind) css.push(`.${cls} {\n${decls.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`);
      const a = `${attrClass}="${Utils.escapeHtml(cls)}"`;
      if (el.type === 'text') {
        const content = jsx ? `{${JSON.stringify(el.text)}}` : Utils.escapeHtml(el.text);
        return `${ind}<p ${a}>${content}</p>\n`;
      }
      if (el.type === 'image') {
        const src = (el.assetId && model.assets[el.assetId]) || el.imageDataUrl || '';
        return `${ind}<img ${a} src="${Utils.escapeHtml(src)}" alt="${Utils.escapeHtml(el.name)}"${jsx ? ' />' : ' />'}\n`;
      }
      if (this.isSvgType(el)) {
        let svg = this.svgForElement(model, el);
        if (jsx) svg = this.svgToJsx(svg);
        return `${ind}<div ${a}>${svg}</div>\n`;
      }
      const kids = tree.get(el.id) || [];
      if (!kids.length) return `${ind}<div ${a}${jsx ? ' />' : '></div>'}\n`;
      return `${ind}<div ${a}>\n${kids.map(k => nodeMarkup(k, el, ind + '  ')).join('')}${ind}</div>\n`;
    };

    let markup = '';
    if (wrapper) markup = `<div ${attrClass}="${tailwind ? `relative w-[${this.px(bounds.w)}] h-[${this.px(bounds.h)}]` : 'design'}">\n${roots.map(r => nodeMarkup(r, wrapper, '  ')).join('')}</div>\n`;
    else markup = nodeMarkup(roots[0], null, '');
    const cssText = css.join('\n\n') + '\n';
    const title = opts.title || 'Design';
    const comp = Utils.pascal(roots.length === 1 ? roots[0].name : title);

    if (opts.type === 'css-only') return tailwind ? '/* Tailwind mode uses utility classes — choose "HTML + CSS Webpage" to see them. */\n' : cssText;
    const indent = (s, n) => s.split('\n').map(l => (l ? ' '.repeat(n) + l : l)).join('\n');
    if (opts.framework === 'react') {
      return `// ${comp}.jsx\n${tailwind ? '' : `import './${comp}.css';\n`}\nexport default function ${comp}() {\n  return (\n${indent(markup.trimEnd(), 4)}\n  );\n}\n` +
        (tailwind ? '' : `\n/* ===== ${comp}.css ===== */\n${cssText}`);
    }
    if (opts.framework === 'vue') {
      return `<!-- ${comp}.vue -->\n<template>\n${indent(markup.trimEnd(), 2)}\n</template>\n\n<script setup>\n// ${comp}\n</script>\n` + (tailwind ? '' : `\n<style scoped>\n${cssText}</style>\n`);
    }
    if (opts.framework === 'svelte') {
      return `<!-- ${comp}.svelte -->\n${markup}` + (tailwind ? '' : `\n<style>\n${cssText}</style>\n`);
    }
    const head = tailwind ? '  <script src="https://cdn.tailwindcss.com"></script>\n' : `  <style>\n    * { box-sizing: border-box; }\n    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f4f6; font-family: ${DEFAULT_FONT}; }\n${indent(cssText, 4)}  </style>\n`;
    return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${Utils.escapeHtml(title)}</title>\n${head}</head>\n<body>\n${indent(markup.trimEnd(), 2)}\n</body>\n</html>\n`;
  },

  svgToJsx(svg) {
    const camel = (n) => n.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return svg
      .replace(/\sstyle="([^"]*)"/g, (m, css) => ` style={{${css.split(';').filter(x => x.includes(':')).map(x => { const [k, ...v] = x.split(':'); return `${camel(k.trim())}: ${JSON.stringify(v.join(':').trim())}`; }).join(', ')}}}`)
      .replace(/\s([a-z]+(?:-[a-z]+)+)=/g, (m, name) => ` ${camel(name)}=`)
      .replace(/xml:space="preserve"/g, '').replace(/\sclass=/g, ' className=');
  },

  tokens(model) {
    const out = { color: {}, typography: {}, shadow: {}, spacing: {} };
    for (const c of model.styles.colors) out.color[Utils.slug(c.name)] = { $type: 'color', $value: Utils.rgba(c.color) };
    for (const t of model.styles.texts) out.typography[Utils.slug(t.name)] = { $type: 'typography', $value: { fontFamily: t.fontFamily, fontSize: `${t.fontSize}px`, fontWeight: t.fontWeight, lineHeight: t.lineHeight ? `${t.lineHeight}px` : 1.3, letterSpacing: `${t.letterSpacing || 0}px` } };
    for (const e of model.styles.effects) out.shadow[Utils.slug(e.name)] = { $type: 'shadow', $value: e.effects.filter(x => x.type.endsWith('Shadow')).map(x => ({ color: Utils.rgba(x.color), offsetX: `${x.x}px`, offsetY: `${x.y}px`, blur: `${x.blur}px`, spread: `${x.spread || 0}px`, inset: x.type === 'innerShadow' })) };
    const gaps = new Set();
    for (const el of model.allElements()) if (el.isAutoLayout) { gaps.add(el.layoutGap); gaps.add(el.layoutPaddingTop); }
    [...gaps].filter(g => g > 0).sort((a, b) => a - b).forEach(g => { out.spacing[`space-${g}`] = { $type: 'dimension', $value: `${g}px` }; });
    return JSON.stringify(out, null, 2);
  },

  // ======================================================================= Inspect snippets
  inspect(model, el) {
    const parent = model.parentOf(el);
    const decls = this.cssDecls(el, parent || { x: 0, y: 0, type: 'page' }, {});
    const cls = Utils.slug(el.name);
    const css = `.${cls} {\n${decls.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
    const camel = (k) => k.replace(/^-webkit-/, 'Webkit-').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const jsVal = (v) => (/^-?\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : JSON.stringify(v));
    const tag = el.type === 'text' ? 'p' : el.type === 'image' ? 'img' : 'div';
    const styleObj = decls.map(([k, v]) => `    ${camel(k)}: ${jsVal(v)},`).join('\n');
    const react = el.type === 'image'
      ? `<img\n  className="${cls}"\n  alt=${JSON.stringify(el.name)}\n  style={{\n${styleObj}\n  }}\n/>`
      : `<${tag}\n  className="${cls}"\n  style={{\n${styleObj}\n  }}\n>${el.type === 'text' ? `\n  {${JSON.stringify(el.text)}}\n` : ''}</${tag}>`;

    const fill = el.fills.find(f => f.visible !== false);
    const fillColor = fill ? (fill.type === 'solid' ? fill.color : fill.stops[0].color) : null;
    const fillAlpha = fill ? (fill.opacity ?? 1) * Utils.alphaOf(fillColor) : 1;
    const c = Utils.parseColor(fillColor || '#000000');
    const stroke = el.strokes.find(s => s.visible !== false && s.width > 0);
    const shadow = el.effects.find(e => e.visible !== false && e.type === 'dropShadow');
    const r2 = (n) => Utils.round(n, 3);
    const uic = (col, a = 1) => { const k = Utils.parseColor(col) || { r: 0, g: 0, b: 0, a: 1 }; return `UIColor(red: ${r2(k.r / 255)}, green: ${r2(k.g / 255)}, blue: ${r2(k.b / 255)}, alpha: ${r2(k.a * a)})`; };
    const argb = (col, a = 1) => { const k = Utils.parseColor(col) || { r: 0, g: 0, b: 0, a: 1 }; return '0x' + [Math.round(k.a * a * 255), k.r, k.g, k.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(); };
    const v = Utils.slug(el.name).replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
    const rx = el.x - (parent ? parent.x : 0), ry = el.y - (parent ? parent.y : 0);
    const f = this.f;

    let swift;
    if (el.type === 'text') {
      swift = `let ${v} = UILabel(frame: CGRect(x: ${f(rx)}, y: ${f(ry)}, width: ${f(el.width)}, height: ${f(el.height)}))\n${v}.text = ${JSON.stringify(el.text)}\n${v}.numberOfLines = 0\n${v}.font = UIFont.systemFont(ofSize: ${f(el.fontSize)}, weight: ${this.swiftWeight(el.fontWeight)})\n${v}.textColor = ${uic(fillColor || '#000', fillAlpha)}\n${v}.textAlignment = .${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : 'left'}`;
    } else {
      swift = `let ${v} = UIView(frame: CGRect(x: ${f(rx)}, y: ${f(ry)}, width: ${f(el.width)}, height: ${f(el.height)}))`;
      if (fillColor) swift += `\n${v}.backgroundColor = ${uic(fillColor, fillAlpha)}`;
      if (el.type === 'ellipse') swift += `\n${v}.layer.cornerRadius = ${f(Math.min(el.width, el.height) / 2)}`;
      else if (el.cornerRadius) swift += `\n${v}.layer.cornerRadius = ${f(el.cornerRadius)}`;
      if (stroke) swift += `\n${v}.layer.borderWidth = ${f(stroke.width)}\n${v}.layer.borderColor = ${uic(stroke.color)}.cgColor`;
      if (shadow) swift += `\n${v}.layer.shadowColor = ${uic(shadow.color, 1)}.cgColor\n${v}.layer.shadowOpacity = ${r2(Utils.alphaOf(shadow.color))}\n${v}.layer.shadowOffset = CGSize(width: ${f(shadow.x)}, height: ${f(shadow.y)})\n${v}.layer.shadowRadius = ${f(shadow.blur / 2)}`;
      if (el.type === 'frame' && el.clipContent !== false) swift += `\n${v}.clipsToBounds = true`;
    }
    if (el.opacity < 1) swift += `\n${v}.alpha = ${r2(el.opacity)}`;
    if (el.rotation) swift += `\n${v}.transform = CGAffineTransform(rotationAngle: ${r2(Utils.degToRad(el.rotation))})`;

    let kotlin;
    const shape = el.type === 'ellipse' ? 'CircleShape' : `RoundedCornerShape(${f(el.cornerRadius || 0)}.dp)`;
    if (el.type === 'text') {
      kotlin = `Text(\n    text = ${JSON.stringify(el.text)},\n    modifier = Modifier\n        .offset(x = ${f(rx)}.dp, y = ${f(ry)}.dp)\n        .width(${f(el.width)}.dp),\n    color = Color(${argb(fillColor || '#000', fillAlpha)}),\n    fontSize = ${f(el.fontSize)}.sp,\n    fontWeight = FontWeight(${el.fontWeight}),\n    textAlign = TextAlign.${el.textAlign === 'center' ? 'Center' : el.textAlign === 'right' ? 'End' : 'Start'}${el.lineHeight ? `,\n    lineHeight = ${f(el.lineHeight)}.sp` : ''}${el.letterSpacing ? `,\n    letterSpacing = ${f(el.letterSpacing)}.sp` : ''}\n)`;
    } else {
      kotlin = `Box(\n    modifier = Modifier\n        .offset(x = ${f(rx)}.dp, y = ${f(ry)}.dp)\n        .size(width = ${f(el.width)}.dp, height = ${f(el.height)}.dp)`;
      if (el.rotation) kotlin += `\n        .rotate(${f(el.rotation)}f)`;
      if (shadow) kotlin += `\n        .shadow(elevation = ${f(shadow.blur / 2)}.dp, shape = ${shape})`;
      if (el.opacity < 1) kotlin += `\n        .alpha(${r2(el.opacity)}f)`;
      if (fillColor) kotlin += `\n        .background(Color(${argb(fillColor, fillAlpha)}), ${shape})`;
      if (stroke) kotlin += `\n        .border(${f(stroke.width)}.dp, Color(${argb(stroke.color)}), ${shape})`;
      if (el.type === 'frame' && el.clipContent !== false) kotlin += `\n        .clip(${shape})`;
      kotlin += '\n)';
    }

    let flutter;
    if (el.type === 'text') {
      flutter = `Positioned(\n  left: ${f(rx)},\n  top: ${f(ry)},\n  width: ${f(el.width)},\n  child: Text(\n    ${JSON.stringify(el.text)},\n    textAlign: TextAlign.${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : 'left'},\n    style: TextStyle(\n      color: Color(${argb(fillColor || '#000', fillAlpha)}),\n      fontSize: ${f(el.fontSize)},\n      fontWeight: FontWeight.w${Utils.clamp(Math.round(el.fontWeight / 100) * 100, 100, 900)},${el.lineHeight ? `\n      height: ${r2(el.lineHeight / el.fontSize)},` : ''}${el.letterSpacing ? `\n      letterSpacing: ${f(el.letterSpacing)},` : ''}\n    ),\n  ),\n)`;
    } else {
      const deco = [];
      if (fill && fill.type === 'linear') deco.push(`gradient: LinearGradient(colors: [${fill.stops.map(s => `Color(${argb(s.color)})`).join(', ')}], stops: [${fill.stops.map(s => r2(s.pos)).join(', ')}])`);
      else if (fill && fill.type === 'radial') deco.push(`gradient: RadialGradient(colors: [${fill.stops.map(s => `Color(${argb(s.color)})`).join(', ')}])`);
      else if (fillColor) deco.push(`color: Color(${argb(fillColor, fillAlpha)})`);
      if (el.type === 'ellipse') deco.push('shape: BoxShape.circle');
      else if (el.cornerRadius) deco.push(`borderRadius: BorderRadius.circular(${f(el.cornerRadius)})`);
      if (stroke) deco.push(`border: Border.all(color: Color(${argb(stroke.color)}), width: ${f(stroke.width)})`);
      const sh = el.effects.filter(e => e.visible !== false && e.type === 'dropShadow');
      if (sh.length) deco.push(`boxShadow: [\n${sh.map(s => `        BoxShadow(color: Color(${argb(s.color)}), offset: Offset(${f(s.x)}, ${f(s.y)}), blurRadius: ${f(s.blur)}, spreadRadius: ${f(s.spread || 0)}),`).join('\n')}\n      ]`);
      flutter = `Positioned(\n  left: ${f(rx)},\n  top: ${f(ry)},\n  child: ${el.opacity < 1 ? `Opacity(\n    opacity: ${r2(el.opacity)},\n    child: ` : ''}Container(\n    width: ${f(el.width)},\n    height: ${f(el.height)},\n    decoration: BoxDecoration(\n${deco.map(x => `      ${x},`).join('\n')}\n    ),\n  )${el.opacity < 1 ? ',\n  )' : ''},\n)`;
    }

    const table = [
      ['Name', el.name], ['Type', el.type],
      ['Position (X, Y)', `${f(rx)}px, ${f(ry)}px${parent ? ` (in ${parent.name})` : ''}`],
      ['Size (W × H)', `${f(el.width)}px × ${f(el.height)}px`],
      ['Rotation', `${f(el.rotation)}°`],
      ['Fill', fill ? this.cssColorOf(fill) : 'None'],
      ['Stroke', stroke ? `${f(stroke.width)}px ${Utils.rgba(stroke.color)} (${stroke.align})` : 'None'],
      ['Corner Radius', el.type === 'ellipse' ? '50%' : `${f(el.cornerRadius || 0)}px`],
      ['Opacity', `${Math.round(el.opacity * 100)}%`],
      ['Blend Mode', BLEND_CSS[el.blendMode] || el.blendMode]
    ];
    if (el.type === 'text') table.push(['Font', `${el.fontFamily.split(',')[0]} ${el.fontWeight} / ${el.fontSize}px`], ['Line Height', el.lineHeight ? `${el.lineHeight}px` : 'Auto'], ['Letter Spacing', `${el.letterSpacing || 0}px`]);
    for (const e of el.effects.filter(e => e.visible !== false)) table.push([e.type.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), e.type.endsWith('Blur') ? `${f(e.blur)}px` : `${f(e.x)}, ${f(e.y)}, blur ${f(e.blur)}, ${Utils.rgba(e.color)}`]);
    return { css, react, swift, kotlin, flutter, table };
  },
  swiftWeight(w) { return ({ 100: '.ultraLight', 200: '.thin', 300: '.light', 400: '.regular', 500: '.medium', 600: '.semibold', 700: '.bold', 800: '.heavy', 900: '.black' })[Utils.clamp(Math.round(w / 100) * 100, 100, 900)]; },

  // ======================================================================= Motion exports
  /** Tracks that actually change value (flat tracks are ignored by motion exports). */
  liveTracks(model, elId) {
    const out = {};
    for (const [p, kfs] of Object.entries(model.animationTimeline.tracks[elId] || {})) {
      if (kfs.length > 1 && kfs.some(k => k.value !== kfs[0].value)) out[p] = kfs;
    }
    return out;
  },
  animatedIn(model, roots) {
    const ids = new Set();
    for (const r of roots) { ids.add(r.id); model.descendantsOf(r.id).forEach(d => ids.add(d.id)); }
    return Object.keys(model.animationTimeline.tracks).filter(id => ids.has(id) && Object.keys(this.liveTracks(model, id)).length).map(id => model.getElementById(id)).filter(Boolean);
  },

  /** v3.13.1: Animated SVG — the static SVG plus CSS @keyframes from the active timeline (position, rotation, size, opacity, fill).
   *  Plays in browsers, <img> tags and most design tools; no JavaScript. */
  animatedSVG(model, roots, { bg = null } = {}) {
    const tl = model.animationTimeline, els = this.animatedIn(model, roots);
    if (!els.length) return { svg: this.svgDocument(model, roots, { bg }), count: 0 };
    const anim = new Map(els.map((el, i) => [el.id, `dsa${i + 1}`]));
    const animOp = new Map(els.filter(el => this.liveTracks(model, el.id).opacity).map(el => [el.id, `${anim.get(el.id)}o`]));
    const dur = Math.max(0.01, tl.duration), f = this.f;
    const loop = tl.loop === 'pingPong' ? 'infinite alternate' : tl.loop === 'oneShot' ? '1 forwards' : 'infinite';
    let css = `    /* DesignStudio animated SVG — “${String(model.activeAnimation?.name || 'Timeline').replace(/\*\//g, '')}”, ${dur}s, ${tl.loop || 'loop'} */\n`;
    for (const el of els) {
      const cls = anim.get(el.id), tracks = this.liveTracks(model, el.id);
      const times = [...new Set(Object.values(tracks).flat().map(k => Utils.clamp(k.time, 0, dur)))].sort((a, b) => a - b);
      if (times[0] > 0) times.unshift(0);
      if (times[times.length - 1] < dur) times.push(dur);
      const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
      let kf = `    @keyframes ${cls} {\n`, fk = `    @keyframes ${cls}f {\n`, ok = `    @keyframes ${cls}o {\n`;
      for (const t of times) {
        const val = (p) => { const v = model.evaluate(el.id, p, t); return v === undefined ? model.getAnimValue(el, p) : v; };
        const tf = [];
        const dx = val('x') + val('width') / 2 - cx, dy = val('y') + val('height') / 2 - cy;
        if (tracks.x || tracks.y || tracks.width || tracks.height) tf.push(`translate(${f(dx)}px, ${f(dy)}px)`);
        if (tracks.rotation) tf.push(`rotate(${Utils.round(val('rotation') - (el.rotation || 0), 2)}deg)`);
        if (tracks.width || tracks.height) tf.push(`scale(${Utils.round(el.width ? val('width') / el.width : 1, 4)}, ${Utils.round(el.height ? val('height') / el.height : 1, 4)})`);
        const k = Object.values(tracks).map(list => list.find(x => Math.abs(x.time - t) < 0.0005)).find(Boolean);
        const bz = Utils.easingBezier[k?.easing || 'easeInOut'] || Utils.easingBezier.easeInOut;
        const timing = k?.easing === 'hold' ? 'steps(1, end)' : `cubic-bezier(${bz.join(', ')})`;
        const decl = [];
        if (tf.length) decl.push(`transform: ${tf.join(' ')}`);
        const pct = `${Utils.round((t / dur) * 100, 3)}%`;
        if (decl.length) kf += `      ${pct} { ${decl.join('; ')}; animation-timing-function: ${timing}; }\n`;
        if (tracks.fillColor) fk += `      ${pct} { fill: ${Utils.toHex(val('fillColor'))}; animation-timing-function: ${timing}; }\n`;
        if (tracks.opacity) ok += `      ${pct} { opacity: ${Utils.round(Utils.clamp(val('opacity'), 0, 1), 3)}; animation-timing-function: ${timing}; }\n`;
      }
      const hasMain = Object.keys(tracks).some(p => p !== 'fillColor' && p !== 'opacity');
      css += hasMain ? `${kf}    }\n    .${cls} { transform-box: view-box; transform-origin: ${f(cx)}px ${f(cy)}px; animation: ${cls} ${dur}s linear ${loop}; }\n` : '';
      if (tracks.fillColor) css += `${fk}    }\n    .${cls} [fill]:not([fill="none"]) { animation: ${cls}f ${dur}s linear ${loop}; }\n`;
      if (tracks.opacity) css += `${ok}    }\n    .${cls}o { animation: ${cls}o ${dur}s linear ${loop}; }\n`;
    }
    css += '    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }\n';
    return { svg: this.svgDocument(model, roots, { bg, anim, animOp, style: css }), count: els.length };
  },

  cssKeyframes(model, roots) {
    const tl = model.animationTimeline;
    const els = this.animatedIn(model, roots);
    if (!els.length) return '/* No animated layers in this scope.\n   Select a layer, open the Timeline and add keyframes (+ ◆) first. */\n';
    const names = this.classNames(model, roots, 'plain');
    const dur = tl.duration;
    let css = `/* DesignStudio motion export — ${els.length} animated layer(s), ${dur}s ${tl.isLooping ? 'loop' : 'once'}.\n   Class names match "Production Code" export (CSS mode: Clean Standard CSS). */\n\n`;
    for (const el of els) {
      const tracks = this.liveTracks(model, el.id);
      const parent = model.parentOf(el);
            const times = [...new Set(Object.values(tracks).flat().map(k => k.time))].sort((a, b) => a - b);
      if (times[0] > 0) times.unshift(0);
      if (times[times.length - 1] < dur) times.push(dur);
      const cls = names.get(el.id) || Utils.slug(el.name);
      css += `@keyframes ds-${cls} {\n`;
      const lb0 = this.localBox(el, parent);
      const pr = parent ? parent.rotation || 0 : 0;
      for (const t of times) {
        const val = (p) => { const v = model.evaluate(el.id, p, t); return v === undefined ? model.getAnimValue(el, p) : v; };
        const decl = [];
        // offsets are relative to the element's exported (current) position, expressed in the parent's frame
        let dx = val('x') + val('width') / 2 - (el.x + el.width / 2), dy = val('y') + val('height') / 2 - (el.y + el.height / 2);
        if (pr) { const v = Utils.rotatePoint(dx, dy, 0, 0, -pr); dx = v.x; dy = v.y; }
        if (tracks.width) decl.push(`width: ${this.px(val('width'))}`);
        if (tracks.height) decl.push(`height: ${this.px(val('height'))}`);
        if (tracks.width || tracks.height) { dx -= (val('width') - el.width) / 2; dy -= (val('height') - el.height) / 2; }
        const rot = lb0.rotation + (val('rotation') - (el.rotation || 0));
        const tf = [];
        if (tracks.x || tracks.y || tracks.width || tracks.height) tf.push(`translate(${this.px(dx)}, ${this.px(dy)})`);
        if (rot || tracks.rotation) tf.push(`rotate(${Utils.round(rot, 2)}deg)`);
        if (lb0.flipX || lb0.flipY) tf.push(`scale(${lb0.flipX ? -1 : 1}, ${lb0.flipY ? -1 : 1})`);
        if (tf.length) decl.push(`transform: ${tf.join(' ')}`);
        if (tracks.opacity) decl.push(`opacity: ${Utils.round(val('opacity'), 3)}`);
        if (tracks.cornerRadius) decl.push(`border-radius: ${this.px(val('cornerRadius'))}`);
        if (tracks.fillColor) decl.push(`${el.type === 'text' ? 'color' : 'background-color'}: ${Utils.toHex(val('fillColor'))}`);
        const kf = Object.values(tracks).map(list => list.find(k => Math.abs(k.time - t) < 0.0005)).find(Boolean);
        const bz = Utils.easingBezier[kf?.easing || 'easeInOut'];
        if (kf?.easing === 'hold') decl.push('animation-timing-function: steps(1, end)');
        else decl.push(`animation-timing-function: cubic-bezier(${bz.join(', ')})`);
        css += `  ${Utils.round((Utils.clamp(t, 0, dur) / dur) * 100, 2)}% { ${decl.join('; ')}; }\n`;
      }
      css += `}\n.${cls} {\n  animation: ds-${cls} ${dur}s linear ${tl.isLooping ? 'infinite' : '1 forwards'};\n}\n\n`;
    }
    return css;
  },

  lottie(model, roots, { fps = 30, duration = 5, title = 'DesignStudio Animation', rasterize = null } = {}) {
    const b = Utils.unionBounds(roots.map(r => Utils.aabb(r))) || { x: 0, y: 0, w: 100, h: 100 };
    const op = Math.max(1, Math.round(duration * fps));
    const tl = model.animationTimeline;
    const tree = model.buildTree();
    const flat = [];
    const inherited = new Map();
    const walk = (el, op = 1) => { if (!el.visible) return; inherited.set(el.id, op); flat.push(el); (tree.get(el.id) || []).forEach(k => walk(k, op * el.opacity)); };
    roots.forEach(walk);
    const skipped = new Set(), counts = {}, assets = [];
    const skip = (what) => { skipped.add(what); counts[what] = (counts[what] || 0) + 1; };
    const ease = (name) => { const z = Utils.easingBezier[name] || Utils.easingBezier.easeInOut; return { o: { x: [z[0]], y: [z[1]] }, i: { x: [z[2]], y: [z[3]] } }; };
    const rgb = (c) => { const k = Utils.parseColor(c) || { r: 0, g: 0, b: 0 }; return [Utils.round(k.r / 255, 4), Utils.round(k.g / 255, 4), Utils.round(k.b / 255, 4), 1]; };
    const prop = (el, names, fn) => {
      const tracks = this.liveTracks(model, el.id);
      const keyed = names.filter(n => tracks[n]);
      if (!keyed.length) return { a: 0, k: fn((p) => model.getAnimValue(el, p)) };
      const times = [...new Set(keyed.flatMap(n => tracks[n].map(k => k.time)))].sort((a, c) => a - c);
      const k = times.map((t, i) => {
        const val = (p) => { const v = model.evaluate(el.id, p, t); return v === undefined ? model.getAnimValue(el, p) : v; };
        const kf = keyed.map(n => tracks[n].find(x => Math.abs(x.time - t) < 0.0005)).find(Boolean);
        const s = fn(val);
        const entry = { t: Math.round(t * fps), s: Array.isArray(s) ? s : [s] };
        if (i < times.length - 1) { if (kf?.easing === 'hold') entry.h = 1; else Object.assign(entry, ease(kf?.easing)); }
        return entry;
      });
      return { a: 1, k };
    };
    const layers = [];
    let ind = 0;
    for (const el of flat) {
      if (el.type === 'group') continue;
      const unsupported = el.type === 'text' || el.type === 'image' || (el.type === 'path' && el.svgPath);
      const hasFx = (el.effects || []).some(e => e.visible !== false), container = (tree.get(el.id) || []).length > 0;
      if ((unsupported || (hasFx && !container)) && rasterize) { // v3.23.0: keep the look as an embedded image layer
        const img = rasterize(el);
        if (img) {
          const id = `image_${assets.length}`; assets.push({ id, w: img.w, h: img.h, u: '', p: img.url, e: 1 });
          layers.push({ ddd: 0, ind: ++ind, ty: 2, nm: el.name, refId: id, sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0,
            ks: {
              o: prop(el, ['opacity'], v => Math.round(v('opacity') * (inherited.get(el.id) ?? 1) * 100)),
              r: prop(el, ['rotation'], v => Utils.round(v('rotation'), 2)),
              p: prop(el, ['x', 'y', 'width', 'height'], v => [Utils.round(v('x') + v('width') / 2 - b.x, 2), Utils.round(v('y') + v('height') / 2 - b.y, 2), 0]),
              a: { a: 0, k: [Utils.round(img.ax, 2), Utils.round(img.ay, 2), 0] },
              s: prop(el, ['width', 'height'], v => [Utils.round((el.flipX ? -100 : 100) / img.scale * (v('width') / Math.max(0.01, el.width)), 3), Utils.round((el.flipY ? -100 : 100) / img.scale * (v('height') / Math.max(0.01, el.height)), 3), 100])
            } });
          continue;
        }
      }
      if (unsupported) { skip(el.type === 'path' ? 'imported SVG paths' : el.type + ' layers'); continue; }
      const shapes = [];
      const size = prop(el, ['width', 'height'], v => [Utils.round(v('width'), 2), Utils.round(v('height'), 2)]);
      if (el.type === 'rect' || el.type === 'frame') shapes.push({ ty: 'rc', d: 1, nm: 'Rect', p: { a: 0, k: [0, 0] }, s: size, r: prop(el, ['cornerRadius'], v => v('cornerRadius') || 0) });
      else if (el.type === 'ellipse') shapes.push({ ty: 'el', d: 1, nm: 'Ellipse', p: { a: 0, k: [0, 0] }, s: size });
      else if (el.type === 'polygon' || el.type === 'star') {
        const r = Math.min(el.width, el.height) / 2;
        shapes.push({ ty: 'sr', sy: el.type === 'star' ? 1 : 2, d: 1, nm: 'Polystar', pt: { a: 0, k: el.type === 'star' ? el.starPoints : el.polygonSides }, p: { a: 0, k: [0, 0] }, r: { a: 0, k: 0 }, or: { a: 0, k: r }, os: { a: 0, k: 0 }, ...(el.type === 'star' ? { ir: { a: 0, k: r * 0.45 }, is: { a: 0, k: 0 } } : {}) });
      } else {
        let v, ii, oo, closed = false;
        if (el.type === 'path') {
          const pts = el.points, ox = el.width / 2, oy = el.height / 2;
          v = pts.map(p => [Utils.round(p.x - ox, 2), Utils.round(p.y - oy, 2)]);
          ii = pts.map(p => (p.cx2 !== undefined ? [Utils.round(p.cx2 - p.x, 2), Utils.round(p.cy2 - p.y, 2)] : [0, 0]));
          oo = pts.map((p, i) => { const n = pts[(i + 1) % pts.length]; return n && n.cx1 !== undefined && (i < pts.length - 1 || el.closedPath) ? [Utils.round(n.cx1 - p.x, 2), Utils.round(n.cy1 - p.y, 2)] : [0, 0]; });
          closed = el.closedPath;
        } else { v = [[-el.width / 2, 0], [el.width / 2, 0]]; ii = [[0, 0], [0, 0]]; oo = [[0, 0], [0, 0]]; }
        shapes.push({ ty: 'sh', nm: 'Path', ks: { a: 0, k: { i: ii, o: oo, v, c: closed } } });
      }
      const fill = el.fills.find(f => f.visible !== false);
      if (fill && !Geometry.isOpen(el) && fill.type !== 'solid') {
        const rad = Utils.degToRad((fill.angle ?? 90) - 90);
        const half = (Math.abs(el.width * Math.cos(rad)) + Math.abs(el.height * Math.sin(rad))) / 2;
        const k = fill.stops.flatMap(st => { const c = rgb(st.color); return [Utils.round(st.pos, 3), c[0], c[1], c[2]]; });
        shapes.push({ ty: 'gf', nm: 'Gradient', o: { a: 0, k: Math.round((fill.opacity ?? 1) * 100) }, r: el.fillRule === 'evenodd' ? 2 : 1, t: fill.type === 'linear' ? 1 : 2,
          g: { p: fill.stops.length, k: { a: 0, k } },
          s: { a: 0, k: fill.type === 'linear' ? [Utils.round(-Math.cos(rad) * half, 2), Utils.round(-Math.sin(rad) * half, 2)] : [0, 0] },
          e: { a: 0, k: fill.type === 'linear' ? [Utils.round(Math.cos(rad) * half, 2), Utils.round(Math.sin(rad) * half, 2)] : [Utils.round(el.width / 2, 2), 0] } });
      } else if (fill && !Geometry.isOpen(el)) shapes.push({ ty: 'fl', nm: 'Fill', c: prop(el, ['fillColor'], v => rgb(v('fillColor'))), o: { a: 0, k: Math.round((fill.opacity ?? 1) * 100) }, r: el.fillRule === 'evenodd' ? 2 : 1 });
      if (hasFx) skip('shadows/blurs');
      const st = el.strokes.find(s => s.visible !== false && s.width > 0);
      if (st) shapes.push({ ty: 'st', nm: 'Stroke', c: { a: 0, k: rgb(st.color) }, o: { a: 0, k: 100 }, w: { a: 0, k: st.width }, lc: 2, lj: 2 });
      shapes.push({ ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } });
      layers.push({
        ddd: 0, ind: ++ind, ty: 4, nm: el.name, sr: 1, ao: 0, ip: 0, op, st: 0, bm: 0,
        ks: {
          o: prop(el, ['opacity'], v => Math.round(v('opacity') * (inherited.get(el.id) ?? 1) * 100)),
          r: prop(el, ['rotation'], v => Utils.round(v('rotation'), 2)),
          p: prop(el, ['x', 'y', 'width', 'height'], v => [Utils.round(v('x') + v('width') / 2 - b.x, 2), Utils.round(v('y') + v('height') / 2 - b.y, 2), 0]),
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [el.flipX ? -100 : 100, el.flipY ? -100 : 100, 100] }
        },
        shapes: [{ ty: 'gr', nm: el.name, it: shapes }]
      });
    }
    const doc = { v: '5.7.4', fr: fps, ip: 0, op, w: Math.round(b.w), h: Math.round(b.h), nm: title, ddd: 0, assets, layers: layers.reverse() };
    return { json: JSON.stringify(doc, null, 2), skipped: [...skipped], counts, images: assets.length };
  },

  // ======================================================================= Figma REST-shaped JSON
  figma(model, title) {
    const typeMap = { rect: 'RECTANGLE', ellipse: 'ELLIPSE', line: 'LINE', arrow: 'LINE', polygon: 'REGULAR_POLYGON', star: 'STAR', text: 'TEXT', frame: 'FRAME', group: 'GROUP', path: 'VECTOR', image: 'RECTANGLE' };
    const col = (c, a = 1) => { const k = Utils.parseColor(c) || { r: 0, g: 0, b: 0, a: 1 }; return { r: Utils.round(k.r / 255, 4), g: Utils.round(k.g / 255, 4), b: Utils.round(k.b / 255, 4), a: Utils.round(k.a * a, 4) }; };
    let n = 0;
    const node = (el, list) => {
      const o = {
        id: `${2 + Math.floor(n / 1000)}:${n++ % 1000}`, name: el.name, type: el.isComponentMaster ? 'COMPONENT' : el.isComponentInstance ? 'INSTANCE' : typeMap[el.type] || 'RECTANGLE',
        visible: el.visible, locked: el.locked, opacity: el.opacity, rotation: el.rotation, blendMode: (BLEND_CSS[el.blendMode] || el.blendMode).toUpperCase().replace(/-/g, '_'),
        absoluteBoundingBox: { x: el.x, y: el.y, width: el.width, height: el.height },
        fills: el.fills.map(f => f.type === 'solid'
          ? { type: 'SOLID', visible: f.visible !== false, opacity: f.opacity, color: col(f.color) }
          : { type: f.type === 'linear' ? 'GRADIENT_LINEAR' : 'GRADIENT_RADIAL', visible: f.visible !== false, opacity: f.opacity, gradientStops: f.stops.map(s => ({ position: s.pos, color: col(s.color) })) }),
        strokes: el.strokes.map(s => ({ type: 'SOLID', visible: s.visible !== false, color: col(s.color) })),
        strokeWeight: el.strokes[0]?.width || 0, strokeAlign: (el.strokes[0]?.align || 'center').toUpperCase(),
        effects: el.effects.map(e => ({ type: e.type.replace(/([A-Z])/g, '_$1').toUpperCase(), visible: e.visible !== false, radius: e.blur, offset: { x: e.x, y: e.y }, spread: e.spread || 0, color: col(e.color) })),
        cornerRadius: el.cornerRadius || 0,
        constraints: { horizontal: el.constraints.horizontal.toUpperCase().replace('-', '_'), vertical: el.constraints.vertical.toUpperCase().replace('-', '_') }
      };
      if (el.type === 'text') Object.assign(o, { characters: el.text, style: { fontFamily: el.fontFamily.split(',')[0].replace(/["']/g, '').trim(), fontWeight: el.fontWeight, fontSize: el.fontSize, textAlignHorizontal: el.textAlign.toUpperCase(), letterSpacing: el.letterSpacing, lineHeightPx: TextLayout.lineHeight(el) } });
      if (el.type === 'frame' && el.isAutoLayout) Object.assign(o, { layoutMode: el.layoutDirection === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL', itemSpacing: el.layoutGap, paddingLeft: el.layoutPaddingLeft, paddingRight: el.layoutPaddingRight, paddingTop: el.layoutPaddingTop, paddingBottom: el.layoutPaddingBottom, primaryAxisSizingMode: el.primarySizing === 'hug' ? 'AUTO' : 'FIXED', counterAxisSizingMode: el.counterSizing === 'hug' ? 'AUTO' : 'FIXED' });
      if (el.type === 'frame') o.clipsContent = el.clipContent !== false;
      if (el.type === 'path' && !el.svgPath) o.vectorPaths = [{ windingRule: 'NONZERO', data: Geometry.pointsToD(el) }];
      if (el.type === 'path' && el.svgPath) o.vectorPaths = [{ windingRule: 'NONZERO', data: el.svgPath }];
      const kids = list.filter(k => k.parentId === el.id);
      if (kids.length) o.children = kids.map(k => node(k, list));
      return o;
    };
    return JSON.stringify({
      name: title, schemaVersion: 0, version: '1', lastModified: new Date().toISOString(),
      note: 'Figma REST API–shaped document (for plugins/importers). Figma cannot open JSON files directly.',
      document: {
        id: '0:0', name: 'Document', type: 'DOCUMENT',
        children: model.pages.map((p, i) => {
          const c = Utils.parseColor(p.bg) || { r: 26, g: 26, b: 46 };
          return { id: `1:${i}`, name: p.name, type: 'CANVAS', backgroundColor: { r: c.r / 255, g: c.g / 255, b: c.b / 255, a: 1 }, children: model.roots(p.elements).map(r => node(r, p.elements)) };
        })
      }
    }, null, 2);
  },

  // ======================================================================= SVG import
  importSVG(text, name = 'Imported SVG') {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid SVG markup');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('No <svg> root element');
    const skipped = { externalImages: 0, unsupported: new Set(), capped: false };
    // 1. neutralise anything active or remote before the markup touches the live DOM
    svg.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, animate, animateTransform, animateMotion, set').forEach(n => { skipped.unsupported.add(n.nodeName); n.remove(); });
    for (const n of [svg, ...svg.querySelectorAll('*')]) {
      for (const at of [...n.attributes]) {
        const v = at.value.trim().toLowerCase();
        if (/^on/i.test(at.name)) { n.removeAttribute(at.name); continue; }
        if ((at.name === 'href' || at.name === 'xlink:href') && !v.startsWith('#') && !v.startsWith('data:image/')) {
          if (n.nodeName.toLowerCase() === 'image') skipped.externalImages++;
          n.removeAttribute(at.name);
        }
        if (/url\(\s*['"]?\s*(?!#)/i.test(at.value) && at.name !== 'href') n.setAttribute(at.name, at.value.replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, 'none'));
      }
    }
    svg.querySelectorAll('style').forEach(st => { st.textContent = st.textContent.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?\s*(?!#)[^)]*\)/gi, 'none'); });
    // 2. expand <use> references (one level per pass, guarded against cycles)
    for (let pass = 0; pass < 4; pass++) {
      const uses = [...svg.querySelectorAll('use')];
      if (!uses.length) break;
      for (const u of uses) {
        const ref = (u.getAttribute('href') || u.getAttribute('xlink:href') || '').slice(1);
        const target = ref && svg.querySelector(`#${CSS.escape(ref)}`);
        if (!target || target.contains(u)) { u.remove(); continue; }
        const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (const at of [...u.attributes]) if (!['href', 'xlink:href', 'x', 'y', 'width', 'height', 'transform'].includes(at.name)) g.setAttribute(at.name, at.value);
        const tx = parseFloat(u.getAttribute('x')) || 0, ty = parseFloat(u.getAttribute('y')) || 0;
        g.setAttribute('transform', `${u.getAttribute('transform') || ''} translate(${tx} ${ty})`.trim());
        let clone = target.cloneNode(true);
        clone.removeAttribute('id');
        if (clone.nodeName.toLowerCase() === 'symbol') {
          const inner = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
          for (const at of [...clone.attributes]) inner.setAttribute(at.name, at.value);
          if (u.getAttribute('width')) inner.setAttribute('width', u.getAttribute('width'));
          if (u.getAttribute('height')) inner.setAttribute('height', u.getAttribute('height'));
          while (clone.firstChild) inner.appendChild(clone.firstChild);
          clone = inner;
        }
        g.appendChild(clone);
        u.replaceWith(g);
      }
    }
    // 3. measure inside an isolated shadow root (its <style> cannot restyle the app)
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:4000px;height:4000px;opacity:0;pointer-events:none;contain:strict;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const live = document.importNode(svg, true);
    if (!live.getAttribute('width') && !live.getAttribute('viewBox')) live.setAttribute('width', '1000');
    shadow.appendChild(live);
    document.body.appendChild(host);
    const out = [];
    const SKIP = new Set(['defs', 'clippath', 'mask', 'symbol', 'pattern', 'marker', 'lineargradient', 'radialgradient', 'filter', 'style', 'title', 'desc', 'metadata']);
    const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image']);
    try {
      const rootCTM = live.getScreenCTM();
      if (!rootCTM) throw new Error('SVG could not be measured');
      const inv = rootCTM.inverse();
      let count = 0;
      const visit = (node, parentGroup) => {
        const tag = node.nodeName.toLowerCase();
        if (SKIP.has(tag)) return;
        const cs = getComputedStyle(node);
        if (cs.display === 'none') return;
        if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') {
          const kids = [...node.children];
          if (!kids.length) return;
          const op = Number.isFinite(parseFloat(cs.opacity)) ? parseFloat(cs.opacity) : 1;
          // only materialise groups that carry meaning (opacity / name / several children)
          let group = parentGroup;
          if (node !== live && (op < 1 || node.getAttribute('id') || kids.length > 1)) {
            group = new StudioElement('group', 0, 0, 1, 1);
            group.fills = [];
            group.opacity = op;
            group.name = node.getAttribute('id') || node.getAttribute('inkscape:label') || `Group ${out.filter(e => e.type === 'group').length + 1}`;
            group.parentId = parentGroup ? parentGroup.id : null;
            out.push(group);
          } else if (op < 1 && parentGroup) parentGroup.opacity *= op;
          kids.forEach(k => visit(k, group));
          return;
        }
        if (!SHAPES.has(tag)) { if (node.children.length) [...node.children].forEach(k => visit(k, parentGroup)); else if (tag !== 'tspan') skipped.unsupported.add(tag); return; }
        if (cs.visibility === 'hidden') return;
        if (++count > 5000) { skipped.capped = true; return; }
        const el = this.importShape(node, tag, cs, inv, live, skipped);
        if (!el) return;
        el.parentId = parentGroup ? parentGroup.id : null;
        el.name = node.getAttribute('id') || node.getAttribute('inkscape:label') || el.name || `${tag[0].toUpperCase()}${tag.slice(1)} ${out.length + 1}`;
        StudioElement.sanitize(el);
        out.push(el);
      };
      [...live.children].forEach(k => visit(k, null));
    } finally {
      host.remove();
    }
    // drop empty groups, size the rest to their content
    const kidsOf = (id) => out.filter(e => e.parentId === id);
    for (let changed = true; changed;) {
      changed = false;
      for (const g of out.filter(e => e.type === 'group')) if (!kidsOf(g.id).length) { out.splice(out.indexOf(g), 1); changed = true; }
    }
    const depth = (e) => { let d = 0, p = out.find(x => x.id === e.parentId); while (p) { d++; p = out.find(x => x.id === p.parentId); } return d; };
    for (const g of out.filter(e => e.type === 'group').sort((x, y) => depth(y) - depth(x))) {
      const bb = Utils.unionBounds(kidsOf(g.id).map(k => Utils.aabb(k)));
      Object.assign(g, { x: bb.x, y: bb.y, width: bb.w, height: bb.h });
    }
    if (!out.some(e => e.type !== 'group')) throw new Error('No drawable shapes found in SVG');
    return { elements: out, name, skipped: { externalImages: skipped.externalImages, unsupported: [...skipped.unsupported], capped: skipped.capped } };
  },

  importShape(node, tag, cs, inv, live, skipped) {
    const ctm = node.getScreenCTM();
    if (!ctm) return null;
    const m = inv.multiply(ctm);
    let bb;
    try { bb = node.getBBox(); } catch (e) { return null; }
    const corners = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x + bb.width, bb.y + bb.height], [bb.x, bb.y + bb.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const resolvePaint = (v) => {
      if (!v || v === 'none') return null;
      const ref = /url\(["']?#([^"')]+)/.exec(v);
      if (ref) {
        const g = live.querySelector(`#${CSS.escape(ref[1])}`);
        if (!g) return null;
        const stops = [...g.querySelectorAll('stop')].map(st => ({ pos: Utils.clamp(parseFloat(st.getAttribute('offset')) / (String(st.getAttribute('offset')).includes('%') ? 100 : 1) || 0, 0, 1), color: getComputedStyle(st).stopColor }));
        if (stops.length < 2) return stops[0] ? { solid: stops[0].color } : null;
        const isLinear = g.nodeName.toLowerCase() === 'lineargradient';
        let angle = 90;
        if (isLinear) {
          const n = (a, d) => { const v2 = g.getAttribute(a); return v2 == null ? d : parseFloat(v2) / (v2.includes('%') ? 100 : 1); };
          angle = Utils.round(Utils.radToDeg(Math.atan2(n('y2', 0) - n('y1', 0), n('x2', 1) - n('x1', 0))) + 90, 1);
        }
        return { gradient: { type: isLinear ? 'linear' : 'radial', angle, stops: stops.map(s2 => ({ pos: s2.pos, color: Utils.toHex(s2.color) })) } };
      }
      return Utils.parseColor(v) ? { solid: v } : null;
    };
    const fillP = resolvePaint(cs.fill), strokeP = resolvePaint(cs.stroke);
    const axisAligned = Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
    let el;
    if (tag === 'text') {
      el = new StudioElement('text', box.x, box.y, Math.max(4, box.w), Math.max(4, box.h));
      // tspans on different rows become separate lines
      const spans = [...node.querySelectorAll('tspan')];
      const rows = new Map();
      if (spans.length) for (const sp of spans) { const y = sp.getAttribute('y') ?? sp.getAttribute('dy') ?? '0'; const key = sp.getAttribute('y') != null ? y : `same`; rows.set(key, (rows.get(key) || '') + sp.textContent); }
      el.text = (rows.size > 1 ? [...rows.values()].join('\n') : node.textContent).replace(/[ \t]+/g, ' ').trim() || 'Text';
      el.fontSize = Math.max(1, parseFloat(cs.fontSize) * scale);
      el.fontWeight = parseInt(cs.fontWeight, 10) || 400;
      el.fontFamily = cs.fontFamily || DEFAULT_FONT;
      el.letterSpacing = (parseFloat(cs.letterSpacing) || 0) * scale;
      el.textAutoResize = 'width';
      const anchor = cs.textAnchor;
      el.textAlign = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
      const c = fillP?.solid || fillP?.gradient?.stops[0].color;
      el.fills = c ? [{ type: 'solid', color: Utils.toHex(c), opacity: Utils.alphaOf(c), visible: true, angle: 90, stops: [] }] : [];
      TextLayout.fit(el);
      if (el.textAlign === 'center') el.x = box.x + box.w / 2 - el.width / 2;
      if (el.textAlign === 'right') el.x = box.x + box.w - el.width;
      if (!axisAligned) el.rotation = Utils.round(Utils.radToDeg(Math.atan2(m.b, m.a)), 2);
      return el;
    }
    if (tag === 'image') {
      const href = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
      if (!href.startsWith('data:image/')) return null;
      el = new StudioElement('image', box.x, box.y, box.w, box.h);
      el.fills = []; el._dataUrl = href;
      return el;
    }
    if (axisAligned && (tag === 'rect' || tag === 'circle' || tag === 'ellipse')) {
      el = new StudioElement(tag === 'rect' ? 'rect' : 'ellipse', box.x, box.y, box.w, box.h);
      if (tag === 'rect') el.cornerRadius = (parseFloat(node.getAttribute('rx')) || parseFloat(node.getAttribute('ry')) || 0) * Math.abs(m.a);
    } else {
      let d = '';
      const n = (at) => parseFloat(node.getAttribute(at)) || 0;
      if (tag === 'path') d = node.getAttribute('d') || '';
      else if (tag === 'rect') d = `M${n('x')} ${n('y')}h${n('width')}v${n('height')}h${-n('width')}Z`;
      else if (tag === 'circle' || tag === 'ellipse') {
        const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
        d = `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
      } else if (tag === 'line') d = `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
      else {
        const pts = (node.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`;
        if (tag === 'polygon') d += 'Z';
      }
      if (!d) return null;
      el = new StudioElement('path', box.x, box.y, Math.max(1, box.w), Math.max(1, box.h));
      el.svgPath = d; el.svgMatrix = [m.a, m.b, m.c, m.d, m.e, m.f]; el.svgBox = { ...box, w: Math.max(1e-3, box.w), h: Math.max(1e-3, box.h) };
      el.closedPath = !(tag === 'line' || tag === 'polyline');
    }
    el.fillRule = cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero';
    const fo = parseFloat(cs.fillOpacity);
    const fOp = Number.isFinite(fo) ? fo : 1;
    if (fillP && tag !== 'line') {
      el.fills = fillP.gradient
        ? [{ type: fillP.gradient.type, color: fillP.gradient.stops[0].color, opacity: fOp, angle: fillP.gradient.angle, visible: true, stops: fillP.gradient.stops }]
        : [{ type: 'solid', color: Utils.toHex(fillP.solid), opacity: Utils.alphaOf(fillP.solid) * fOp, visible: true, angle: 90, stops: [] }];
    } else el.fills = [];
    const so = parseFloat(cs.strokeOpacity);
    const sc = strokeP?.solid || strokeP?.gradient?.stops[0].color;
    el.strokes = sc && parseFloat(cs.strokeWidth) !== 0 ? [{ color: (Number.isFinite(so) && so < 1) || Utils.alphaOf(sc) < 1 ? Utils.rgba(sc, Number.isFinite(so) ? so : 1) : Utils.toHex(sc), width: Math.max(0.25, (parseFloat(cs.strokeWidth) || 1) * scale), align: 'center', visible: true }] : [];
    const op = parseFloat(cs.opacity);
    if (Number.isFinite(op)) el.opacity = op;
    if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') el.blendMode = cs.mixBlendMode;
    return el;
  }
};
