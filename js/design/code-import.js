/**
 * DesignStudio — Import code as design layers (v3.37.0, DS-3.37.0-04). File › Import… › Code, or drop code files.
 *
 *  Offline   HTML + CSS · React (JSX/TSX) · Vue (.vue) · Svelte (.svelte) · Tailwind utility classes
 *            The code is turned into plain HTML/CSS, laid out by the browser in a hidden, script-free shadow root,
 *            then every visible box, text run, image and inline SVG becomes an editable layer in one new frame.
 *  AI        SwiftUI (.swift) · Flutter (.dart) · Jetpack Compose (.kt) · Android XML layouts: sent to the connected
 *            AI model, which builds the screen with the normal AI operations (needs an AI connection).
 *  Safety    Scripts never run: <script>, event handlers, iframes, forms and external URLs are stripped, and the
 *            app's CSP blocks the rest. Images the code links to can be dropped in the same import (matched by name).
 */
'use strict';

const CI_EXT = { html: /\.html?$/i, css: /\.css$/i, jsx: /\.(jsx|tsx)$/i, script: /\.(m?js|ts)$/i, vue: /\.vue$/i, svelte: /\.svelte$/i, mobile: /\.(swift|dart|kt|kts)$/i, xml: /\.xml$/i };
const CI_LIMIT = { bytes: 2 * 1048576, layers: 2500 };

/* ---------------------------------------------------------------- Tailwind (v3 palette + common utilities) */
const TW_PAL = (() => {
  const raw = {
    slate: 'f8fafc f1f5f9 e2e8f0 cbd5e1 94a3b8 64748b 475569 334155 1e293b 0f172a 020617', gray: 'f9fafb f3f4f6 e5e7eb d1d5db 9ca3af 6b7280 4b5563 374151 1f2937 111827 030712',
    zinc: 'fafafa f4f4f5 e4e4e7 d4d4d8 a1a1aa 71717a 52525b 3f3f46 27272a 18181b 09090b', neutral: 'fafafa f5f5f5 e5e5e5 d4d4d4 a3a3a3 737373 525252 404040 262626 171717 0a0a0a',
    stone: 'fafaf9 f5f5f4 e7e5e4 d6d3d1 a8a29e 78716c 57534e 44403c 292524 1c1917 0c0a09', red: 'fef2f2 fee2e2 fecaca fca5a5 f87171 ef4444 dc2626 b91c1c 991b1b 7f1d1d 450a0a',
    orange: 'fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407', amber: 'fffbeb fef3c7 fde68a fcd34d fbbf24 f59e0b d97706 b45309 92400e 78350f 451a03',
    yellow: 'fefce8 fef9c3 fef08a fde047 facc15 eab308 ca8a04 a16207 854d0e 713f12 422006', lime: 'f7fee7 ecfccb d9f99d bef264 a3e635 84cc16 65a30d 4d7c0f 3f6212 365314 1a2e05',
    green: 'f0fdf4 dcfce7 bbf7d0 86efac 4ade80 22c55e 16a34a 15803d 166534 14532d 052e16', emerald: 'ecfdf5 d1fae5 a7f3d0 6ee7b7 34d399 10b981 059669 047857 065f46 064e3b 022c22',
    teal: 'f0fdfa ccfbf1 99f6e4 5eead4 2dd4bf 14b8a6 0d9488 0f766e 115e59 134e4a 042f2e', cyan: 'ecfeff cffafe a5f3fc 67e8f9 22d3ee 06b6d4 0891b2 0e7490 155e75 164e63 083344',
    sky: 'f0f9ff e0f2fe bae6fd 7dd3fc 38bdf8 0ea5e9 0284c7 0369a1 075985 0c4a6e 082f49', blue: 'eff6ff dbeafe bfdbfe 93c5fd 60a5fa 3b82f6 2563eb 1d4ed8 1e40af 1e3a8a 172554',
    indigo: 'eef2ff e0e7ff c7d2fe a5b4fc 818cf8 6366f1 4f46e5 4338ca 3730a3 312e81 1e1b4b', violet: 'f5f3ff ede9fe ddd6fe c4b5fd a78bfa 8b5cf6 7c3aed 6d28d9 5b21b6 4c1d95 2e1065',
    purple: 'faf5ff f3e8ff e9d5ff d8b4fe c084fc a855f7 9333ea 7e22ce 6b21a8 581c87 3b0764', fuchsia: 'fdf4ff fae8ff f5d0fe f0abfc e879f9 d946ef c026d3 a21caf 86198f 701a75 4a044e',
    pink: 'fdf2f8 fce7f3 fbcfe8 f9a8d4 f472b6 ec4899 db2777 be185d 9d174d 831843 500724', rose: 'fff1f2 ffe4e6 fecdd3 fda4af fb7185 f43f5e e11d48 be123c 9f1239 881337 4c0519'
  };
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950], out = { white: '#ffffff', black: '#000000', transparent: 'transparent', current: 'currentColor' };
  for (const [k, v] of Object.entries(raw)) v.split(' ').forEach((h, i) => { out[`${k}-${steps[i]}`] = '#' + h; });
  return out;
})();
const TW_BP = { sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536 };
const TW_TEXT = { xs: [12, 16], sm: [14, 20], base: [16, 24], lg: [18, 28], xl: [20, 28], '2xl': [24, 32], '3xl': [30, 36], '4xl': [36, 40], '5xl': [48, 48], '6xl': [60, 60], '7xl': [72, 72], '8xl': [96, 96], '9xl': [128, 128] };
const TW_W = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const TW_R = { none: '0', sm: '2px', '': '4px', md: '6px', lg: '8px', xl: '12px', '2xl': '16px', '3xl': '24px', full: '9999px' };
const TW_SH = { sm: '0 1px 2px 0 rgb(0 0 0/.05)', '': '0 1px 3px 0 rgb(0 0 0/.1),0 1px 2px -1px rgb(0 0 0/.1)', md: '0 4px 6px -1px rgb(0 0 0/.1),0 2px 4px -2px rgb(0 0 0/.1)', lg: '0 10px 15px -3px rgb(0 0 0/.1),0 4px 6px -4px rgb(0 0 0/.1)', xl: '0 20px 25px -5px rgb(0 0 0/.1),0 8px 10px -6px rgb(0 0 0/.1)', '2xl': '0 25px 50px -12px rgb(0 0 0/.25)', none: 'none', inner: 'inset 0 2px 4px 0 rgb(0 0 0/.05)' };
const TW_MAXW = { xs: 320, sm: 384, md: 448, lg: 512, xl: 576, '2xl': 672, '3xl': 768, '4xl': 896, '5xl': 1024, '6xl': 1152, '7xl': 1280, prose: '65ch', full: '100%', screen: '100vw', none: 'none' };
const TW_LEAD = { none: 1, tight: 1.25, snug: 1.375, normal: 1.5, relaxed: 1.625, loose: 2 };
const TW_TRACK = { tighter: '-0.05em', tight: '-0.025em', normal: '0', wide: '0.025em', wider: '0.05em', widest: '0.1em' };
const TW_GRAD = { t: 'to top', tr: 'to top right', r: 'to right', br: 'to bottom right', b: 'to bottom', bl: 'to bottom left', l: 'to left', tl: 'to top left' };

/** One Tailwind class (without variant prefix) → CSS declarations, or '' if unknown. */
function twDecl(c) {
  let neg = false; if (c.startsWith('-')) { neg = true; c = c.slice(1); }
  const arb = (v) => v.replace(/_/g, ' ');
  const sp = (v) => {
    if (v == null) return null;
    if (/^\[.+\]$/.test(v)) return arb(v.slice(1, -1));
    if (v === 'px') return '1px'; if (v === 'auto') return 'auto'; if (v === 'full') return '100%'; if (v === 'screen') return '100vw';
    if (/^\d+\/\d+$/.test(v)) { const [a, b] = v.split('/').map(Number); return `${(a / b * 100).toFixed(4)}%`; }
    if (/^\d+(\.\d+)?$/.test(v)) return `${(neg ? -1 : 1) * Number(v) * 4}px`;
    return null;
  };
  const col = (v) => {
    if (!v) return null; let [name, alpha] = v.split('/');
    let hex = /^\[.+\]$/.test(name) ? arb(name.slice(1, -1)) : TW_PAL[name];
    if (!hex) return null;
    if (alpha && /^#[0-9a-f]{6}$/i.test(hex)) { const a = /^\[/.test(alpha) ? parseFloat(alpha.slice(1)) : Number(alpha) / 100; const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
    return hex;
  };
  const m = (re) => c.match(re);
  let r;
  const simple = { block: 'display:block', 'inline-block': 'display:inline-block', inline: 'display:inline', flex: 'display:flex', 'inline-flex': 'display:inline-flex', grid: 'display:grid', hidden: 'display:none', contents: 'display:contents',
    'flex-row': 'flex-direction:row', 'flex-col': 'flex-direction:column', 'flex-row-reverse': 'flex-direction:row-reverse', 'flex-col-reverse': 'flex-direction:column-reverse', 'flex-wrap': 'flex-wrap:wrap', 'flex-nowrap': 'flex-wrap:nowrap',
    'flex-1': 'flex:1 1 0%', 'flex-auto': 'flex:1 1 auto', 'flex-none': 'flex:none', grow: 'flex-grow:1', 'grow-0': 'flex-grow:0', shrink: 'flex-shrink:1', 'shrink-0': 'flex-shrink:0',
    relative: 'position:relative', absolute: 'position:absolute', fixed: 'position:absolute', sticky: 'position:relative', static: 'position:static',
    'overflow-hidden': 'overflow:hidden', 'overflow-auto': 'overflow:hidden', 'overflow-scroll': 'overflow:hidden', 'overflow-x-auto': 'overflow:hidden', 'overflow-y-auto': 'overflow:hidden',
    'text-left': 'text-align:left', 'text-center': 'text-align:center', 'text-right': 'text-align:right', 'text-justify': 'text-align:justify',
    uppercase: 'text-transform:uppercase', lowercase: 'text-transform:lowercase', capitalize: 'text-transform:capitalize', italic: 'font-style:italic', underline: 'text-decoration:underline', 'line-through': 'text-decoration:line-through', 'no-underline': 'text-decoration:none',
    truncate: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', 'whitespace-nowrap': 'white-space:nowrap', 'break-words': 'overflow-wrap:break-word',
    'font-sans': 'font-family:Inter,ui-sans-serif,system-ui,sans-serif', 'font-serif': 'font-family:ui-serif,Georgia,serif', 'font-mono': 'font-family:ui-monospace,Menlo,monospace',
    'object-cover': 'object-fit:cover', 'object-contain': 'object-fit:contain', 'aspect-square': 'aspect-ratio:1/1', 'aspect-video': 'aspect-ratio:16/9',
    'mx-auto': 'margin-left:auto;margin-right:auto', 'inset-0': 'top:0;right:0;bottom:0;left:0', border: 'border-width:1px;border-style:solid', 'border-0': 'border-width:0',
    'border-t': 'border-top-width:1px;border-top-style:solid', 'border-b': 'border-bottom-width:1px;border-bottom-style:solid', 'border-l': 'border-left-width:1px;border-left-style:solid', 'border-r': 'border-right-width:1px;border-right-style:solid',
    'border-dashed': 'border-style:dashed', 'border-solid': 'border-style:solid', 'items-start': 'align-items:flex-start', 'items-center': 'align-items:center', 'items-end': 'align-items:flex-end', 'items-stretch': 'align-items:stretch', 'items-baseline': 'align-items:baseline',
    'justify-start': 'justify-content:flex-start', 'justify-center': 'justify-content:center', 'justify-end': 'justify-content:flex-end', 'justify-between': 'justify-content:space-between', 'justify-around': 'justify-content:space-around', 'justify-evenly': 'justify-content:space-evenly',
    'self-start': 'align-self:flex-start', 'self-center': 'align-self:center', 'self-end': 'align-self:flex-end', 'self-stretch': 'align-self:stretch', 'place-items-center': 'place-items:center', 'content-center': 'align-content:center',
    'w-screen': 'width:100vw', 'h-screen': 'height:100vh', 'min-h-screen': 'min-height:100vh', 'w-fit': 'width:fit-content', 'h-fit': 'height:fit-content', 'w-max': 'width:max-content', 'w-min': 'width:min-content'
  };
  if (simple[c]) return simple[c];
  if ((r = m(/^text-(xs|sm|base|lg|[2-9]?xl)$/))) return `font-size:${TW_TEXT[r[1]][0]}px;line-height:${TW_TEXT[r[1]][1]}px`;
  if ((r = m(/^text-\[(\d+(?:\.\d+)?(?:px|rem|em))\]$/))) return `font-size:${r[1]}`;
  if ((r = m(/^font-(\w+)$/)) && TW_W[r[1]]) return `font-weight:${TW_W[r[1]]}`;
  if ((r = m(/^leading-(.+)$/))) return TW_LEAD[r[1]] ? `line-height:${TW_LEAD[r[1]]}` : sp(r[1]) ? `line-height:${sp(r[1])}` : '';
  if ((r = m(/^tracking-(.+)$/)) && TW_TRACK[r[1]]) return `letter-spacing:${TW_TRACK[r[1]]}`;
  if ((r = m(/^text-(.+)$/)) && col(r[1])) return `color:${col(r[1])}`;
  if ((r = m(/^bg-gradient-to-(\w+)$/)) && TW_GRAD[r[1]]) return `background-image:linear-gradient(${TW_GRAD[r[1]]},var(--tw-from,transparent),var(--tw-via,var(--tw-to,transparent)),var(--tw-to,transparent))`;
  if ((r = m(/^bg-(.+)$/)) && col(r[1])) return `background-color:${col(r[1])}`;
  if ((r = m(/^from-(.+)$/)) && col(r[1])) return `--tw-from:${col(r[1])}`;
  if ((r = m(/^via-(.+)$/)) && col(r[1])) return `--tw-via:${col(r[1])}`;
  if ((r = m(/^to-(.+)$/)) && col(r[1])) return `--tw-to:${col(r[1])}`;
  if ((r = m(/^border-([trbl])?-?(\d+)$/))) { const side = { t: 'top', r: 'right', b: 'bottom', l: 'left' }[r[1]]; return side ? `border-${side}-width:${r[2]}px;border-${side}-style:solid` : `border-width:${r[2]}px;border-style:solid`; }
  if ((r = m(/^border-(?:[trbl]-)?(.+)$/)) && col(r[1])) return `border-color:${col(r[1])}`;
  if ((r = m(/^ring(?:-(\d+))?$/))) return `box-shadow:0 0 0 ${r[1] ?? 3}px var(--tw-ring,rgba(59,130,246,.5))`;
  if ((r = m(/^ring-(.+)$/)) && col(r[1])) return `--tw-ring:${col(r[1])}`;
  if ((r = m(/^rounded(?:-([trbl]{1,2}))?(?:-(none|sm|md|lg|xl|2xl|3xl|full))?$/))) { const v = TW_R[r[2] || '']; const s = r[1]; if (!s) return `border-radius:${v}`; const map = { t: ['top-left', 'top-right'], b: ['bottom-left', 'bottom-right'], l: ['top-left', 'bottom-left'], r: ['top-right', 'bottom-right'], tl: ['top-left'], tr: ['top-right'], bl: ['bottom-left'], br: ['bottom-right'] }; return (map[s] || []).map(k => `border-${k}-radius:${v}`).join(';'); }
  if ((r = m(/^rounded-\[(.+)\]$/))) return `border-radius:${arb(r[1])}`;
  if ((r = m(/^shadow(?:-(sm|md|lg|xl|2xl|none|inner))?$/))) return `box-shadow:${TW_SH[r[1] || '']}`;
  if ((r = m(/^opacity-(\d+)$/))) return `opacity:${Number(r[1]) / 100}`;
  if ((r = m(/^z-(\d+)$/))) return `z-index:${r[1]}`;
  if ((r = m(/^grid-cols-(\d+)$/))) return `grid-template-columns:repeat(${r[1]},minmax(0,1fr))`;
  if ((r = m(/^grid-rows-(\d+)$/))) return `grid-template-rows:repeat(${r[1]},minmax(0,1fr))`;
  if ((r = m(/^col-span-(\d+|full)$/))) return r[1] === 'full' ? 'grid-column:1/-1' : `grid-column:span ${r[1]}/span ${r[1]}`;
  if ((r = m(/^gap-([xy])-(.+)$/)) && sp(r[2])) return `${r[1] === 'x' ? 'column' : 'row'}-gap:${sp(r[2])}`;
  if ((r = m(/^gap-(.+)$/)) && sp(r[1])) return `gap:${sp(r[1])}`;
  if ((r = m(/^max-w-(.+)$/))) { const v = TW_MAXW[r[1]] ?? sp(r[1]); return v != null ? `max-width:${typeof v === 'number' ? v + 'px' : v}` : ''; }
  if ((r = m(/^(min-w|min-h|max-h|w|h|size)-(.+)$/)) && sp(r[2])) { const v = sp(r[2]); return r[1] === 'size' ? `width:${v};height:${v}` : `${{ w: 'width', h: 'height', 'min-w': 'min-width', 'min-h': 'min-height', 'max-h': 'max-height' }[r[1]]}:${v}`; }
  if ((r = m(/^(top|right|bottom|left|inset-x|inset-y|inset)-(.+)$/)) && sp(r[2])) { const v = sp(r[2]); return r[1] === 'inset' ? `top:${v};right:${v};bottom:${v};left:${v}` : r[1] === 'inset-x' ? `left:${v};right:${v}` : r[1] === 'inset-y' ? `top:${v};bottom:${v}` : `${r[1]}:${v}`; }
  if ((r = m(/^([pm])([xytrbl]?)-(.+)$/)) && sp(r[3])) {
    const v = sp(r[3]), p = r[1] === 'p' ? 'padding' : 'margin', s = r[2];
    const sides = { '': ['top', 'right', 'bottom', 'left'], x: ['left', 'right'], y: ['top', 'bottom'], t: ['top'], r: ['right'], b: ['bottom'], l: ['left'] }[s];
    return sides.map(k => `${p}-${k}:${v}`).join(';');
  }
  return '';
}
/** Tailwind classes used in the markup → a stylesheet (responsive variants resolved for the render width). */
function twSheet(classes, width) {
  const base = [], resp = [];
  for (const full of classes) {
    const parts = full.split(':'), util = parts.pop();
    if (parts.some(p => !TW_BP[p])) continue; // hover:, focus:, dark: … are interaction states: skipped
    const bp = parts.length ? Math.max(...parts.map(p => TW_BP[p])) : 0;
    if (bp > width) continue;
    let d = twDecl(util);
    if (!d) { if ((/^space-([xy])-(.+)$/).test(util)) { const [, ax, v] = util.match(/^space-([xy])-(.+)$/); const px = /^\d/.test(v) ? Number(v) * 4 + 'px' : v === 'px' ? '1px' : null; if (px) (bp ? resp : base).push([bp, `.${CSS.escape(full)}>*+*{margin-${ax === 'x' ? 'left' : 'top'}:${px}}`]); } continue; }
    (bp ? resp : base).push([bp, `.${CSS.escape(full)}{${d}}`]);
  }
  resp.sort((a, b) => a[0] - b[0]);
  return '*,::before,::after{box-sizing:border-box;border:0 solid #e5e7eb;margin:0;padding:0}img,svg{display:block;max-width:100%}h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}ul,ol{list-style:none}a{color:inherit;text-decoration:inherit}button{background:transparent;font:inherit;color:inherit}\n'
    + base.concat(resp).map(x => x[1]).join('\n');
}

/* ---------------------------------------------------------------- source → HTML/CSS */
const CodeFront = {
  /** Read a balanced {…} starting at s[i] === '{'. Returns end index (exclusive). Strings/template literals aware. */
  braceEnd(s, i) {
    let d = 0, q = null;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return k + 1; }
    }
    return s.length;
  },
  /** Find the end of the JSX element starting at s[i] === '<'. */
  jsxEnd(s, i) {
    let depth = 0, k = i;
    while (k < s.length) {
      if (s[k] === '{') { k = this.braceEnd(s, k); continue; }
      if (s[k] === '<') {
        if (s[k + 1] === '/') { const e = s.indexOf('>', k); depth--; k = e + 1; if (depth <= 0) return k; continue; }
        // open tag: walk to its '>' honouring {…} and quotes
        let j = k + 1, q = null;
        for (; j < s.length; j++) { const ch = s[j]; if (q) { if (ch === q) q = null; continue; } if (ch === '"' || ch === "'") { q = ch; continue; } if (ch === '{') { j = this.braceEnd(s, j) - 1; continue; } if (ch === '>') break; }
        const selfClose = s[j - 1] === '/';
        if (!selfClose) depth++;
        k = j + 1;
        if (selfClose && depth === 0) return k;
        continue;
      }
      k++;
    }
    return s.length;
  },
  /** The largest JSX tree that a component returns. */
  jsxRoot(src) {
    src = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    let best = '';
    const re = /(?:return\s*\(?|=>\s*\(?)\s*(<[A-Za-z>])/g; let mm;
    while ((mm = re.exec(src))) { const i = mm.index + mm[0].length - mm[1].length; const e = this.jsxEnd(src, i); const t = src.slice(i, e); if (t.length > best.length) best = t; }
    return best;
  },
  styleObj(expr) {
    const body = expr.trim().replace(/^\{|\}$/g, ''); const out = [];
    for (const part of body.split(/,(?![^(]*\))/)) {
      const mm = part.match(/^\s*['"]?([\w-]+)['"]?\s*:\s*(.+?)\s*$/); if (!mm) continue;
      let [, k, v] = mm; v = v.replace(/^['"`]|['"`]$/g, '');
      if (!/^[-#\w.%(), ]+$/.test(v)) continue;
      const prop = k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      if (/^-?\d+(\.\d+)?$/.test(v) && !/^(opacity|z-index|font-weight|flex|flex-grow|flex-shrink|line-height|order)$/.test(prop)) v += 'px';
      out.push(`${prop}:${v}`);
    }
    return out.join(';');
  },
  /** Strings inside an expression (for className={clsx('a', x && 'b')} or template literals). */
  exprStrings(expr) { const out = []; expr.replace(/(['"`])((?:(?!\1)[^\\$]|\\.)*?)\1/g, (_, q, s) => { out.push(s); return ''; }); return out.join(' ').replace(/\$\{[^}]*\}/g, ' ').trim(); },
  /** A {expression} child: text, or the first JSX it would render (lists render one item). */
  exprChild(expr) {
    const inner = expr.slice(1, -1).trim();
    if (!inner) return '';
    const lt = inner.search(/<[A-Za-z>]/);
    if (lt >= 0) { const e = this.jsxEnd(inner, lt); return this.jsxToHtml(inner.slice(lt, e)); }
    const str = inner.match(/^(['"`])([\s\S]*)\1$/); if (str) return Utils.escapeHtml(str[2].replace(/\$\{[^}]*\}/g, ''));
    if (/^[\w.$?[\]'"]+$/.test(inner)) return Utils.escapeHtml(inner.split(/[.?]/).filter(Boolean).pop().replace(/[[\]'"]/g, ''));
    return '';
  },
  jsxAttrs(raw, tag) {
    const out = []; let k = 0;
    while (k < raw.length) {
      const mm = raw.slice(k).match(/^\s*([\w:.-]+)(\s*=\s*)?/); if (!mm || !mm[1]) { k++; continue; }
      const name = mm[1]; k += mm[0].length; let val = null;
      if (mm[2]) {
        if (raw[k] === '"' || raw[k] === "'") { const q = raw[k], e = raw.indexOf(q, k + 1); val = raw.slice(k + 1, e); k = e + 1; }
        else if (raw[k] === '{') { const e = this.braceEnd(raw, k); const expr = raw.slice(k + 1, e - 1); k = e;
          if (name === 'style') { const s = this.styleObj(expr); if (s) out.push(`style="${Utils.escapeHtml(s)}"`); continue; }
          val = /^(className|class|src|href|alt|placeholder|title|type|value|aria-label)$/.test(name) ? this.exprStrings(expr) : null;
          if (name === 'src' && !val) val = '';
        }
      } else val = '';
      if (val == null || /^on[A-Z]/.test(name) || name === 'key' || name === 'ref' || /^(dangerouslySetInnerHTML|children)$/.test(name)) continue;
      const html = name === 'className' ? 'class' : name === 'htmlFor' ? 'for' : name.replace(/^xlink:/, '');
      out.push(`${html}="${Utils.escapeHtml(val)}"`);
    }
    return out.join(' ');
  },
  /** JSX → static HTML. Components become <div data-c="Name">, fragments become display:contents. */
  jsxToHtml(s) {
    let out = '', k = 0;
    while (k < s.length) {
      const ch = s[k];
      if (ch === '{') { const e = this.braceEnd(s, k); out += this.exprChild(s.slice(k, e)); k = e; continue; }
      if (ch === '<') {
        if (s[k + 1] === '/') { const e = s.indexOf('>', k); const name = s.slice(k + 2, e).trim(); out += name === '' ? '</ds-frag>' : /^[A-Z]|\./.test(name) ? '</div>' : `</${name}>`; k = e + 1; continue; }
        let j = k + 1, q = null;
        for (; j < s.length; j++) { const c2 = s[j]; if (q) { if (c2 === q) q = null; continue; } if (c2 === '"' || c2 === "'") { q = c2; continue; } if (c2 === '{') { j = this.braceEnd(s, j) - 1; continue; } if (c2 === '>') break; }
        let inner = s.slice(k + 1, j); const selfClose = inner.endsWith('/'); if (selfClose) inner = inner.slice(0, -1);
        const name = (inner.match(/^[\w.:-]*/) || [''])[0], attrs = this.jsxAttrs(inner.slice(name.length), name);
        if (name === '') out += '<ds-frag style="display:contents">';
        else if (/^[A-Z]|\./.test(name)) out += `<div data-c="${Utils.escapeHtml(name)}"${attrs ? ' ' + attrs : ''}>${selfClose ? '<i class="ds-ic"></i></div>' : ''}`;
        else out += `<${name}${attrs ? ' ' + attrs : ''}>${selfClose && !/^(img|br|hr|input|meta|link|source|path|circle|rect|line|polyline|polygon|ellipse|stop|use)$/.test(name) ? `</${name}>` : ''}`;
        k = j + 1; continue;
      }
      out += ch; k++;
    }
    return out;
  },
  vueToHtml(src) {
    const t = src.match(/<template[^>]*>([\s\S]*)<\/template>/i); let html = t ? t[1] : '';
    html = html.replace(/\s(v-[\w:-]+|@[\w.-]+|#[\w-]+)(=("[^"]*"|'[^']*'))?/g, '')
      .replace(/\s:([\w-]+)=("([^"]*)"|'([^']*)')/g, (_, n, __, a, b) => { const v = this.exprStrings(a ?? b ?? ''); return v && /^(class|src|href|alt|placeholder|title)$/.test(n) ? ` data-v${n}="${Utils.escapeHtml(v)}"` : ''; })
      .replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_, e) => Utils.escapeHtml(/^(['"`]).*\1$/.test(e) ? e.slice(1, -1) : e.split(/[.?]/).pop()));
    html = html.replace(/<([\w-]+)([^>]*?)\sdata-vclass="([^"]*)"/g, (_, tg, a, v) => /\sclass="/.test(a) ? `<${tg}${a.replace(/\sclass="([^"]*)"/, ` class="$1 ${v}"`)}` : `<${tg}${a} class="${v}"`).replace(/\sdata-v(src|href|alt|placeholder|title)=/g, ' $1=');
    html = html.replace(/<([A-Z][\w]*|[\w]+-[\w-]+)(\s[^>]*)?\/>/g, '<div data-c="$1"$2></div>').replace(/<([A-Z][\w]*)(\s[^>]*)?>/g, '<div data-c="$1"$2>').replace(/<\/([A-Z][\w]*)>/g, '</div>');
    return html;
  },
  svelteToHtml(src) {
    let html = src.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    html = html.replace(/\{[#:/@](if|else|each|await|then|catch|key|html|const|debug|snippet|render)[^}]*\}/g, '')
      .replace(/\s(on|bind|class|use|transition|in|out|animate):[\w|-]+(=\{[^}]*\}|="[^"]*")?/g, '')
      .replace(/\s([\w-]+)=\{([^}]*)\}/g, (_, n, e) => { const v = this.exprStrings(e); return v && /^(class|src|href|alt|placeholder|title)$/.test(n) ? ` ${n}="${Utils.escapeHtml(v)}"` : ''; })
      .replace(/\{([^}]*)\}/g, (_, e) => Utils.escapeHtml(/^(['"`]).*\1$/.test(e.trim()) ? e.trim().slice(1, -1) : e.trim().split(/[.?]/).pop()));
    return html.replace(/<([A-Z][\w]*)(\s[^>]*)?\/>/g, '<div data-c="$1"$2></div>').replace(/<([A-Z][\w]*)(\s[^>]*)?>/g, '<div data-c="$1"$2>').replace(/<\/([A-Z][\w]*)>/g, '</div>');
  },
  styles(src) { const out = []; src.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, c) => { out.push(c); return ''; }); return out.join('\n'); }
};

const CodeImportMixin = {
  /** Which files are code this importer handles: 'web' (offline) or 'ai' (mobile). */
  codeKindOf(f, text) {
    const n = f.name || '';
    if (CI_EXT.html.test(n) || CI_EXT.css.test(n) || CI_EXT.jsx.test(n) || CI_EXT.vue.test(n) || CI_EXT.svelte.test(n)) return 'web';
    if (CI_EXT.script.test(n)) return text != null && /(return|=>)\s*\(?\s*<[A-Za-z>]/.test(text) ? 'web' : null;
    if (CI_EXT.mobile.test(n)) return 'ai';
    if (CI_EXT.xml.test(n)) return text != null && /xmlns:android=|<(LinearLayout|ConstraintLayout|FrameLayout|RelativeLayout|TextView)\b/.test(text) ? 'ai' : null;
    return null;
  },

  /** Import web code files (plus any images dropped with them) as one new frame of editable layers. */
  async importCodeFiles(files, images = []) {
    const texts = [];
    for (const f of files) { if (f.size > CI_LIMIT.bytes) { Utils.toast(`${f.name} is larger than 2 MB: skipped`, '⚠️'); continue; } texts.push({ name: f.name, text: await f.text() }); }
    if (!texts.length) return null;
    let html = '', css = '', mode = 'page', label = texts.find(t => !CI_EXT.css.test(t.name))?.name || texts[0].name;
    for (const { name, text } of texts) {
      if (CI_EXT.css.test(name)) css += '\n' + text;
      else if (CI_EXT.html.test(name)) { html += text; }
      else if (CI_EXT.vue.test(name)) { html += CodeFront.vueToHtml(text); css += '\n' + CodeFront.styles(text); mode = 'component'; }
      else if (CI_EXT.svelte.test(name)) { html += CodeFront.svelteToHtml(text); css += '\n' + CodeFront.styles(text); mode = 'component'; }
      else { const root = CodeFront.jsxRoot(text); if (!root) { Utils.toast(`No JSX found in ${name}`, '⚠️'); continue; } html += CodeFront.jsxToHtml(root); mode = 'component'; }
    }
    if (!html.trim()) { if (css.trim()) Utils.toast('A stylesheet needs its HTML: import the .css together with the .html file', 'ℹ️'); return null; }
    const el = await this.codeToLayers({ html, css, mode, name: label.replace(/\.[^.]+$/, ''), images });
    return el;
  },

  /** Lay out sanitized HTML/CSS off-screen and convert what the browser drew into layers. */
  async codeToLayers({ html, css = '', mode = 'page', name = 'Imported code', images = [], width = 1440 }) {
    const doc = new DOMParser().parseFromString(/<html[\s>]/i.test(html) ? html : `<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
    doc.querySelectorAll('style').forEach(s => { css += '\n' + s.textContent; s.remove(); });
    doc.querySelectorAll('script, iframe, object, embed, link, meta, base, form > input[type=hidden], noscript, template, frame, frameset, portal').forEach(n => n.remove());
    const blobs = new Map(); for (const f of images) blobs.set(f.name.toLowerCase(), URL.createObjectURL(f));
    doc.querySelectorAll('*').forEach(n => {
      for (const a of [...n.attributes]) {
        const v = a.value.trim();
        if (/^on/i.test(a.name) || /^\s*javascript:/i.test(v) || a.name === 'srcdoc' || a.name === 'formaction' || a.name === 'action') { n.removeAttribute(a.name); continue; }
        if (/^(src|href|xlink:href|poster|srcset)$/i.test(a.name) && !/^(data:|blob:|#)/i.test(v)) {
          const hit = blobs.get(v.split(/[?#]/)[0].split('/').pop().toLowerCase());
          if (hit && /src/i.test(a.name)) n.setAttribute(a.name, hit); else if (/src/i.test(a.name)) { n.setAttribute('data-ds-src', v); n.removeAttribute(a.name); } else if (a.name !== 'href') n.removeAttribute(a.name);
        }
      }
    });
    doc.querySelectorAll('img:not([src])').forEach(n => n.setAttribute('data-ds-src', ''));
    css = css.replace(/@import[^;]+;/g, '').replace(/url\(\s*(['"]?)(?!data:|blob:)[^)]*\1\s*\)/g, 'none');
    // Tailwind: generate the classes the markup uses (anything hand-written CSS already defines still wins: it comes later)
    const classes = new Set(); doc.querySelectorAll('[class]').forEach(n => n.classList.forEach(c => classes.add(c)));
    const twCount = [...classes].filter(c => twDecl(c.split(':').pop())).length;
    const tw = twCount >= 3 && twCount >= classes.size * 0.3 ? twSheet(classes, width) : '';
    const sheet = (tw + '\n' + css).replace(/(^|[\s,}>+~(])(html|body)(?=[\s,{.:#[>+~)]|$)/g, (_, p, t) => p + (t === 'html' ? ':host' : '.ds-body')).replace(/:root\b/g, ':host');
    const bodyAttrs = doc.body ? [...doc.body.attributes].filter(a => a.name === 'class' || a.name === 'style').map(a => `${a.name}="${Utils.escapeHtml(a.value)}"`).join(' ') : '';
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:-30000px;top:0;width:${width}px;opacity:0;pointer-events:none;contain:layout style`;
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>:host{all:initial;display:block;width:${width}px;font:16px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#111827;background:#fff}.ds-body{display:flow-root;min-height:${mode === 'page' ? 'auto' : '0'}}.ds-ic{display:inline-block;width:20px;height:20px;max-width:100%;max-height:100%;border-radius:4px;background:currentColor;opacity:.35;vertical-align:middle}[data-c]>.ds-ic:only-child{width:100%;height:100%;min-width:20px;min-height:20px}:where([data-ds-src]){background:#e5e7eb;min-width:24px;min-height:24px}:where(img[data-ds-src]){display:inline-block;width:100%;aspect-ratio:4/3}</style><style>${sheet}</style><div class="ds-body" ${bodyAttrs}>${doc.body ? doc.body.innerHTML : ''}</div>`;
    try {
      await Promise.all([...root.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; setTimeout(r, 3000); })));
      await document.fonts?.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return await this.ciBuild(root, host, { name, mode, width });
    } finally { host.remove(); setTimeout(() => blobs.forEach(u => URL.revokeObjectURL(u)), 60000); }
  },

  async ciBuild(root, host, { name, mode, width }) {
    const M = this.model, H = host.getBoundingClientRect(), body = root.querySelector('.ds-body');
    // Bounds: a page is the full width; a component is cropped to what it draws
    let bx = 0, by = 0, bw = width, bh = Math.max(1, body.scrollHeight);
    if (mode === 'component') {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      body.querySelectorAll('*').forEach(n => { const r = n.getBoundingClientRect(); if (r.width && r.height) { x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top); x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom); } });
      if (x2 > x1) { bx = x1 - H.left; by = y1 - H.top; bw = x2 - x1; bh = y2 - y1; }
    }
    const roots = M.roots(), ox = Math.round(roots.length ? Math.max(...roots.map(r => r.x + r.width)) + 120 : 0), oy = Math.round(roots.length ? Math.min(...roots.map(r => r.y)) : 0);
    const P = (r) => ({ x: Math.round(ox + r.left - H.left - bx), y: Math.round(oy + r.top - H.top - by), w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    const frame = new StudioElement('frame', ox, oy, Math.max(1, Math.round(bw)), Math.max(1, Math.round(bh)));
    frame.name = name || 'Imported code';
    const bodyBg = this.ciPaint(getComputedStyle(body)) || (mode === 'page' ? this.ciPaint(getComputedStyle(host)) : null);
    frame.fills = bodyBg ? [bodyBg] : (mode === 'component' ? [] : [{ type: 'solid', color: '#ffffff', opacity: 1, angle: 90, visible: true, stops: [] }]);
    frame.clipContent = mode === 'page';
    M.insertElement(frame, null);
    let count = 0; const warn = { capped: false, missing: 0 };
    const add = (el, parent) => { if (count >= CI_LIMIT.layers) { warn.capped = true; return false; } M.insertElement(el, parent.id); count++; return true; };

    const walk = (node, parent) => {
      for (const ch of node.childNodes) {
        if (count >= CI_LIMIT.layers) { warn.capped = true; return; }
        if (ch.nodeType === 3) { if (ch.textContent.trim()) this.ciText(ch, node, parent, P, add); continue; }
        if (ch.nodeType !== 1) continue;
        const cs = getComputedStyle(ch);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
        const tag = ch.tagName.toLowerCase();
        const r = ch.getBoundingClientRect();
        if (tag === 'svg') { if (r.width && r.height) this.ciSvg(ch, cs, parent, P(r), add); continue; }
        if (tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'picture') { if (r.width && r.height) this.ciImage(ch, parent, P(r), add, warn); continue; }
        if (tag === 'br') continue;
        if (cs.display === 'contents') { walk(ch, parent); continue; }
        const boxed = this.ciHasBox(cs, tag);
        const inlineOnly = this.ciInlineOnly(ch);
        let target = parent;
        if (boxed && r.width >= 1 && r.height >= 1) {
          const p = P(r), hasKids = [...ch.childNodes].some(n => (n.nodeType === 1) || (n.nodeType === 3 && n.textContent.trim()));
          const el = new StudioElement(hasKids ? 'frame' : 'rect', p.x, p.y, p.w, p.h);
          el.name = this.ciName(ch, tag);
          const line = this.ciStyleBox(el, cs, p, hasKids);
          if (hasKids) el.clipContent = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
          if (!add(el, parent)) return;
          if (line) { line.name = 'Divider'; add(line, el); }
          target = el;
          if (/^(input|textarea|select)$/.test(tag)) { const v = ch.value || ch.getAttribute('placeholder') || (tag === 'select' ? ch.options?.[ch.selectedIndex]?.text : '') || ''; if (v) this.ciTextBox(v, cs, el, { x: p.x + parseFloat(cs.paddingLeft || 0) + parseFloat(cs.borderLeftWidth || 0), y: p.y, w: Math.max(1, p.w - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)), h: p.h }, add, !ch.value && !!ch.getAttribute('placeholder')); continue; }
          if (tag === 'hr') continue;
        }
        if (inlineOnly && ch.textContent.trim()) { this.ciTextBlock(ch, cs, target, P, add); continue; }
        walk(ch, target);
      }
    };
    walk(body, frame);
    if (mode === 'component' && !frame.fills.length) {
      const kids = M.childrenOf(frame.id);
      if (kids.length === 1 && kids[0].type === 'frame' && Math.abs(kids[0].width - frame.width) < 2 && Math.abs(kids[0].height - frame.height) < 2) {
        const only = kids[0]; only.parentId = null;
        if (/^(Div|Section|Article|Main)$/.test(only.name)) only.name = frame.name;
        M.deleteElements([frame.id]);
        return this.ciFinish(only, name, count, warn);
      }
    }
    return this.ciFinish(frame, name, count + 1, warn);
  },
  ciFinish(frame, name, count, warn) {
    const M = this.model;
    if (!frame.fills.length && !M.childrenOf(frame.id).length) { M.deleteElements([frame.id]); Utils.toast('That code didn’t draw anything visible', '⚠️'); return null; }
    this._actionLabel = 'Import code';
    M.select([frame.id]); this.commit?.(); this.selectionChanged?.(); this.refreshUI?.();
    this.hideWelcome?.();
    setTimeout(() => this.run?.('zoomSelection'), 30);
    Utils.toast(`Imported ${name}: ${count} layers${warn.capped ? ` (stopped at ${CI_LIMIT.layers})` : ''}${warn.missing ? `. ${warn.missing} linked image${warn.missing === 1 ? '' : 's'} not included: import the image files with the code to place them` : ''}`, '🧩');
    return frame;
  },

  ciHasBox(cs, tag) {
    if (/^(input|textarea|select|button|hr)$/.test(tag)) return true;
    const bg = cs.backgroundColor, img = cs.backgroundImage;
    if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return true;
    if (img && /gradient/.test(img)) return true;
    if (['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(cs[`border${s}Color`]))) return true;
    if (cs.boxShadow && cs.boxShadow !== 'none') return true;
    return false;
  },
  ciInlineOnly(n) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) continue; if (c.nodeType !== 1) continue;
      const t = c.tagName.toLowerCase(); if (t === 'br') continue;
      if (t === 'svg' || t === 'img') return false;
      const cs = getComputedStyle(c); if (!/^inline$/.test(cs.display)) return false;
      if (this.ciHasBox(cs, t)) return false;
      if (['marginLeft', 'marginRight', 'paddingLeft', 'paddingRight'].some(k => parseFloat(cs[k]) > 0)) return false;
      if (!this.ciInlineOnly(c)) return false;
    }
    return true;
  },
  ciName(n, tag) {
    const c = n.getAttribute('data-c') || (n.classList?.contains('ds-ic') ? n.parentElement?.getAttribute('data-c') : null); if (c) return c;
    const aria = n.getAttribute('aria-label'); if (aria) return aria.slice(0, 40);
    const id = n.id; if (id) return id;
    const cls = (n.getAttribute('class') || '').split(/\s+/).find(x => x && !twDecl(x.split(':').pop())); if (cls) return cls;
    return { button: 'Button', a: 'Link', input: 'Input', textarea: 'Text area', select: 'Select', nav: 'Nav', header: 'Header', footer: 'Footer', section: 'Section', article: 'Card', aside: 'Aside', main: 'Main', li: 'List item', ul: 'List', hr: 'Divider', form: 'Form', table: 'Table' }[tag] || tag[0].toUpperCase() + tag.slice(1);
  },
  ciColor(c) { const p = Utils.parseColor(c); if (!p) return null; return { color: Utils.toHex(c), opacity: p.a ?? 1 }; },
  ciPaint(cs) {
    const img = cs.backgroundImage;
    if (img && img.startsWith('linear-gradient')) {
      const inner = img.slice(img.indexOf('(') + 1, img.lastIndexOf(')'));
      const parts = inner.split(/,(?![^(]*\))/).map(s => s.trim());
      let angle = 180; const dirs = { 'to top': 0, 'to top right': 45, 'to right': 90, 'to bottom right': 135, 'to bottom': 180, 'to bottom left': 225, 'to left': 270, 'to top left': 315 };
      if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift()); else if (dirs[parts[0]] != null) angle = dirs[parts.shift()];
      const stops = parts.map((p, i) => { const col = p.match(/^(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)/i)?.[0]; const pos = p.match(/(-?\d+(?:\.\d+)?)%\s*$/); return col && Utils.parseColor(col) ? { pos: pos ? Utils.clamp(Number(pos[1]) / 100, 0, 1) : (parts.length > 1 ? i / (parts.length - 1) : 0), color: Utils.toHex(col), opacity: Utils.parseColor(col).a ?? 1 } : null; }).filter(Boolean);
      if (stops.length >= 2) return { type: 'linear', color: stops[0].color, opacity: 1, angle, visible: true, stops: stops.map(s => ({ pos: s.pos, color: s.color })) };
    }
    const bg = cs.backgroundColor; if (!bg || /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return null;
    const c = this.ciColor(bg); if (!c) return null;
    return { type: 'solid', color: c.color, opacity: c.opacity, angle: 90, visible: true, stops: [] };
  },
  /** Fill, border, radius, opacity and shadows. A one-sided border on a container comes back as a divider layer. */
  ciStyleBox(el, cs, p, container = false) {
    let line = null;
    const fill = this.ciPaint(cs); el.fills = fill ? [fill] : [];
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs[`border${s}Width`]) || 0);
    const max = Math.max(...bw);
    if (max > 0) {
      const side = bw.findIndex(w => w === max), sides = ['Top', 'Right', 'Bottom', 'Left'][side];
      const c = this.ciColor(cs[`border${sides}Color`]);
      if (c && bw.every(w => w === max)) el.strokes = [{ color: c.color, width: max, align: 'inside', visible: true, opacity: c.opacity }];
      else if (c && container && bw.filter(Boolean).length === 1) {
        el.strokes = []; const t = Math.max(1, Math.round(max));
        line = new StudioElement('rect', bw[1] ? p.x + p.w - t : p.x, bw[2] ? p.y + p.h - t : p.y, bw[0] || bw[2] ? p.w : t, bw[0] || bw[2] ? t : p.h);
        line.fills = [{ type: 'solid', color: c.color, opacity: c.opacity, angle: 90, visible: true, stops: [] }];
      }
      else if (c) { el.strokes = []; if (!el.fills.length && bw.filter(Boolean).length === 1) { el.fills = [{ type: 'solid', color: c.color, opacity: c.opacity, angle: 90, visible: true, stops: [] }]; if (bw[0] || bw[2]) { el.height = Math.max(1, Math.round(max)); if (bw[2]) el.y = p.y + p.h - el.height; } else { el.width = Math.max(1, Math.round(max)); if (bw[1]) el.x = p.x + p.w - el.width; } } }
    }
    const rad = cs.borderTopLeftRadius; let r = parseFloat(rad) || 0; if (/%$/.test(rad)) r = Math.min(p.w, p.h) * r / 100;
    el.cornerRadius = Math.round(Math.min(r, Math.min(p.w, p.h) / 2));
    if (Number(cs.opacity) < 1) el.opacity = Number(cs.opacity);
    const sh = cs.boxShadow;
    if (sh && sh !== 'none') {
      el.effects = sh.split(/,(?![^(]*\))/).slice(0, 4).map(s => { const col = s.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0] || 'rgba(0,0,0,0.2)'; const n = s.replace(col, '').match(/-?\d+(\.\d+)?px/g)?.map(parseFloat) || [0, 0, 0, 0]; return { type: /inset/.test(s) ? 'innerShadow' : 'dropShadow', x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0, color: col, visible: true }; }).filter(e => Utils.parseColor(e.color) && (Utils.parseColor(e.color).a ?? 1) > 0);
    }
    return line;
  },
  ciFont(el, cs) {
    el.fontSize = Math.max(1, Math.round(parseFloat(cs.fontSize) * 10) / 10);
    el.fontWeight = Utils.clamp(Math.round((parseInt(cs.fontWeight, 10) || 400) / 100) * 100, 100, 900);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    el.fontFamily = /^(system-ui|-apple-system|ui-sans-serif|sans-serif|BlinkMacSystemFont|Segoe UI|Helvetica|Arial|Inter)$/i.test(fam) ? DEFAULT_FONT : `${fam}, ${DEFAULT_FONT}`;
    el.textAlign = /center/.test(cs.textAlign) ? 'center' : /right|end/.test(cs.textAlign) ? 'right' : 'left';
    const lh = parseFloat(cs.lineHeight); el.lineHeight = Number.isFinite(lh) ? Math.round(lh * 10) / 10 : 0;
    const ls = parseFloat(cs.letterSpacing); el.letterSpacing = Number.isFinite(ls) ? Math.round(ls * 100) / 100 : 0;
    const c = this.ciColor(cs.color) || { color: '#111827', opacity: 1 };
    el.fills = [{ type: 'solid', color: c.color, opacity: c.opacity, angle: 90, visible: true, stops: [] }];
  },
  ciTransform(t, cs) { return cs.textTransform === 'uppercase' ? t.toUpperCase() : cs.textTransform === 'lowercase' ? t.toLowerCase() : cs.textTransform === 'capitalize' ? t.replace(/\b\w/g, c => c.toUpperCase()) : t; },
  ciTextBox(text, cs, parent, p, add, placeholder = false) {
    const el = new StudioElement('text', p.x, p.y, p.w, p.h);
    this.ciFont(el, cs);
    if (placeholder) el.fills[0].opacity = Math.min(el.fills[0].opacity, 0.5);
    el.text = this.ciTransform(String(text).slice(0, 5000), cs);
    el.name = el.text.replace(/\s+/g, ' ').trim().slice(0, 30) || 'Text';
    const lh = el.lineHeight || el.fontSize * 1.3;
    el.textAutoResize = 'height';
    if (p.h <= lh * 1.6) { el.textAutoResize = 'width'; el.y = Math.round(p.y + (p.h - lh) / 2); }
    TextLayout.fit?.(el);
    if (el.textAutoResize === 'width' && el.textAlign !== 'left') { const dw = p.w - el.width; el.x = Math.round(p.x + (el.textAlign === 'center' ? dw / 2 : dw)); }
    return add(el, parent);
  },
  /** An element holding only text and inline tags (span, a, strong …) → one text layer at the text's own bounds. */
  ciTextBlock(n, cs, parent, P, add) {
    const range = document.createRange(); range.selectNodeContents(n);
    const r = range.getBoundingClientRect(); if (!r.width || !r.height) return;
    const p = P(r), text = (n.innerText ?? n.textContent).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) return;
    const multi = r.height > (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3) * 1.6;
    const el = new StudioElement('text', p.x, p.y, p.w + 2, p.h);
    this.ciFont(el, cs);
    el.text = this.ciTransform(text, cs).slice(0, 5000); el.name = el.text.replace(/\s+/g, ' ').slice(0, 30);
    el.textAutoResize = multi ? 'height' : 'width';
    TextLayout.fit?.(el);
    if (!multi && el.textAlign !== 'left') { const dw = p.w - el.width; el.x = Math.round(p.x + (el.textAlign === 'center' ? dw / 2 : dw)); }
    add(el, parent);
  },
  /** A bare text node between block elements. */
  ciText(tn, owner, parent, P, add) {
    const range = document.createRange(); range.selectNodeContents(tn); const r = range.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(owner), p = P(r), el = new StudioElement('text', p.x, p.y, p.w + 2, p.h);
    this.ciFont(el, cs);
    el.text = this.ciTransform(tn.textContent.replace(/\s+/g, ' ').trim(), cs); el.name = el.text.slice(0, 30);
    el.textAutoResize = r.height > (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3) * 1.6 ? 'height' : 'width';
    TextLayout.fit?.(el);
    add(el, parent);
  },
  ciSvg(svg, cs, parent, p, add) {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', p.w); clone.setAttribute('height', p.h);
    const color = Utils.toHex(cs.color) || '#111827';
    let s = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, color);
    if (!/fill=|stroke=/.test(s.slice(0, s.indexOf('>')))) s = s.replace('<svg', `<svg fill="${/none/.test(cs.fill) ? 'none' : color}"`);
    const el = new StudioElement('image', p.x, p.y, p.w, p.h); el.fills = []; el.name = svg.getAttribute('aria-label') || (svg.closest('[data-c]')?.getAttribute('data-c')) || 'Icon';
    el.assetId = Utils.uid('img'); this.model.assets[el.assetId] = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(s)));
    add(el, parent);
  },
  ciImage(n, parent, p, add, warn) {
    const src = n.currentSrc || n.src || '';
    if (n.tagName === 'IMG' && /^(data:image\/|blob:)/.test(src) && n.naturalWidth) {
      try {
        const c = document.createElement('canvas'), k = Math.min(1, 2400 / Math.max(n.naturalWidth, n.naturalHeight));
        c.width = Math.round(n.naturalWidth * k); c.height = Math.round(n.naturalHeight * k); c.getContext('2d').drawImage(n, 0, 0, c.width, c.height);
        const el = new StudioElement('image', p.x, p.y, p.w, p.h); el.fills = []; el.name = n.getAttribute('alt') || 'Image';
        el.assetId = Utils.uid('img'); this.model.assets[el.assetId] = /^data:image\/svg/.test(src) ? src : c.toDataURL('image/webp', 0.9);
        const cs = getComputedStyle(n); el.cornerRadius = Math.round(parseFloat(cs.borderTopLeftRadius) || 0);
        return add(el, parent);
      } catch (_) { /* fall through to placeholder */ }
    }
    warn.missing++;
    const el = new StudioElement('rect', p.x, p.y, p.w, p.h);
    el.name = `Image: ${n.getAttribute('alt') || (n.getAttribute('data-ds-src') || '').split('/').pop() || 'missing'}`.slice(0, 60);
    el.fills = [{ type: 'solid', color: '#e5e7eb', opacity: 1, angle: 90, visible: true, stops: [] }];
    el.cornerRadius = Math.round(parseFloat(getComputedStyle(n).borderTopLeftRadius) || 0);
    return add(el, parent);
  },

  /** SwiftUI / Flutter / Compose / Android XML: ask the connected AI model to build the screen. */
  async importCodeWithAI(f) {
    const text = await f.text();
    const lang = /\.swift$/i.test(f.name) ? 'SwiftUI' : /\.dart$/i.test(f.name) ? 'Flutter' : /\.kts?$/i.test(f.name) ? 'Jetpack Compose' : 'Android XML layout';
    if (!this.aiLLMs?.().length) {
      this.dialog({ title: `Import ${lang} code`, body: `<p><b>${Utils.escapeHtml(f.name)}</b> is ${lang} code. DesignStudio can't render ${lang} offline, so it asks your AI model to rebuild the screen as editable layers.</p><p>Connect a model first in <b>AI Studio › Connections</b>, then import the file again.</p>`, actions: [{ label: 'Cancel' }, { label: 'Open AI connections', primary: true, run: () => this.toggleAI?.(true, 'conn') }] });
      return false;
    }
    const code = text.length > 40000 ? text.slice(0, 40000) + '\n// … (truncated)' : text;
    this.toggleAI?.(true, 'play');
    await new Promise(r => setTimeout(r, 60));
    this.aiSend?.(`Import this ${lang} code from ${f.name} as a new screen made of editable layers. Recreate the layout faithfully: one frame sized for the target device (390×844 for phone code unless the code says otherwise), the real text, colours, font sizes and weights, corner radii, spacing, and auto layout where the code stacks views (VStack/HStack, Column/Row, LinearLayout). Use rectangles for images and icons, named after them.\n\n\`\`\`${lang.split(' ')[0].toLowerCase()}\n${code}\n\`\`\``);
    return true;
  }
};
Object.assign(StudioApp.prototype, CodeImportMixin);
