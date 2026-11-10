/**
 * DesignStudio — browser compatibility layer (v3.19.0).
 * Canvas `filter` (blur, brightness, contrast, saturate, grayscale, sepia, invert, hue-rotate, opacity) is missing in
 * Safari before 18. When it is, this polyfills it for drawImage(): the source is drawn to a scratch canvas, filtered
 * per pixel (3-pass box blur ≈ Gaussian, colour matrix for the rest) and then composited — so blurs, shadows,
 * background blur, Media effects and censor blur render the same in Safari, Firefox and Chromium.
 * Force it for testing with  localStorage['designstudio.forceCanvasFilterPolyfill'] = '1'.
 */
'use strict';
(function canvasFilterPolyfill() {
  const C = window.CanvasRenderingContext2D; if (!C) return;
  let force = false; try { force = localStorage.getItem('designstudio.forceCanvasFilterPolyfill') === '1'; } catch (_) { /* ignore */ }
  const native = 'filter' in C.prototype;
  window.DS_COMPAT = { canvasFilter: native && !force ? 'native' : 'polyfill', canvasLetterSpacing: 'letterSpacing' in C.prototype, pointer: window.PointerEvent ? 'pointer' : 'none' };
  if (native && !force) return;
  const store = new WeakMap(), draw = C.prototype.drawImage;
  Object.defineProperty(C.prototype, 'filter', { configurable: true, get() { return store.get(this) || 'none'; }, set(v) { store.set(this, String(v || 'none')); } });
  const parse = (f) => { const out = []; for (const m of String(f).matchAll(/([a-z-]+)\(([^)]*)\)/g)) { let v = parseFloat(m[2]); if (/%$/.test(m[2].trim())) v /= 100; out.push([m[1], Number.isFinite(v) ? v : 0]); } return out; };
  const boxBlur = (d, w, h, r) => { // separable box blur, 3 passes ≈ Gaussian (sigma ≈ r)
    const rad = Math.max(1, Math.round(r * 0.85)), tmp = new Uint8ClampedArray(d.length);
    const pass = (src, dst, horiz) => {
      const len = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 4 : w * 4, k = 1 / (rad * 2 + 1);
      for (let l = 0; l < lines; l++) {
        const base = horiz ? l * w * 4 : l * 4;
        for (let ch = 0; ch < 4; ch++) {
          let acc = 0;
          for (let i = -rad; i <= rad; i++) acc += src[base + Math.min(len - 1, Math.max(0, i)) * step + ch];
          for (let i = 0; i < len; i++) {
            dst[base + i * step + ch] = acc * k;
            acc += src[base + Math.min(len - 1, i + rad + 1) * step + ch] - src[base + Math.max(0, i - rad) * step + ch];
          }
        }
      }
    };
    for (let n = 0; n < 3; n++) { pass(d, tmp, true); pass(tmp, d, false); }
  };
  const matrix = (fs) => { // 4x5 colour matrix multiplied from the filter list
    let M = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    const mul = (A) => { const R = new Array(20); for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { let v = c === 4 ? A[r * 5 + 4] : 0; for (let k = 0; k < 4; k++) v += A[r * 5 + k] * M[k * 5 + c]; R[r * 5 + c] = v; } M = R; };
    for (const [n, v] of fs) {
      if (n === 'brightness') mul([v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, v, 0, 0, 0, 0, 0, 1, 0]);
      else if (n === 'contrast') { const o = 128 * (1 - v); mul([v, 0, 0, 0, o, 0, v, 0, 0, o, 0, 0, v, 0, o, 0, 0, 0, 1, 0]); }
      else if (n === 'saturate' || n === 'grayscale') { const s = n === 'saturate' ? v : 1 - Math.min(1, v); mul([0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0, 0, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0, 0, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0, 0, 0, 0, 0, 1, 0]); }
      else if (n === 'sepia') { const a = 1 - Math.min(1, v); mul([0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0, 0, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0, 0, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0, 0, 0, 0, 0, 1, 0]); }
      else if (n === 'invert') { const a = Math.min(1, v), b = 1 - 2 * a; mul([b, 0, 0, 0, 255 * a, 0, b, 0, 0, 255 * a, 0, 0, b, 0, 255 * a, 0, 0, 0, 1, 0]); }
      else if (n === 'hue-rotate') { const t = v * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); mul([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0, 0, 0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283, 0, 0, 0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0, 0, 0, 0, 0, 1, 0]); }
      else if (n === 'opacity') mul([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, Math.min(1, v), 0]);
    }
    return M;
  };
  C.prototype.drawImage = function (img, ...a) {
    const f = store.get(this);
    if (!f || f === 'none') return draw.call(this, img, ...a);
    const fs = parse(f); if (!fs.length) return draw.call(this, img, ...a);
    // destination rect in this context's user space
    let sx = 0, sy = 0, sw = img.width || img.videoWidth || img.naturalWidth, sh = img.height || img.videoHeight || img.naturalHeight, dx, dy, dw, dh;
    if (a.length === 2) [dx, dy] = a, dw = sw, dh = sh; else if (a.length === 4) [dx, dy, dw, dh] = a; else [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return;
    const blur = fs.filter(x => x[0] === 'blur').reduce((s, x) => s + x[1], 0), pad = Math.ceil(blur * 3);
    const t = this.getTransform ? this.getTransform() : { a: 1, d: 1 }, scale = Math.max(0.01, Math.hypot(t.a, t.b || 0));
    const W = Math.min(4096, Math.ceil(dw * scale) + pad * 2), H = Math.min(4096, Math.ceil(dh * scale) + pad * 2);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'); draw.call(x, img, sx, sy, sw, sh, pad, pad, W - pad * 2, H - pad * 2);
    const id = x.getImageData(0, 0, W, H), d = id.data;
    if (blur > 0) boxBlur(d, W, H, blur * scale);
    const rest = fs.filter(x => x[0] !== 'blur');
    if (rest.length) { const M = matrix(rest); for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], al = d[i + 3]; d[i] = M[0] * r + M[1] * g + M[2] * b + M[3] * al + M[4]; d[i + 1] = M[5] * r + M[6] * g + M[7] * b + M[8] * al + M[9]; d[i + 2] = M[10] * r + M[11] * g + M[12] * b + M[13] * al + M[14]; d[i + 3] = M[15] * r + M[16] * g + M[17] * b + M[18] * al + M[19]; } }
    x.putImageData(id, 0, 0);
    const pu = pad / scale;
    draw.call(this, cv, 0, 0, W, H, dx - pu, dy - pu, dw + pu * 2, dh + pu * 2);
  };
})();
