/**
 * DesignStudio — Media engine (no UI): decoding, frame operations, effects and encoders.
 * Frames are { canvas, delay(ms) }. Audio (optional) is { channels: Float32Array[], sampleRate }.
 * Uses js/vendor/media-libs.js (gifenc, gifuct-js, mp4-muxer, webm-muxer, fflate).
 */
'use strict';

const Media = {
  canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; },
  ctx(c) { return c.getContext('2d', { willReadFrequently: true }); },
  clone(c) { const n = this.canvas(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; },
  fmtBytes(n) { if (n == null) return '—'; if (n < 1024) return `${n} B`; if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1048576).toFixed(2)} MB`; },
  duration(frames) { return frames.reduce((s, f) => s + f.delay, 0); },
  async blobBytes(b) { return new Uint8Array(await b.arrayBuffer()); },
  toBlob(c, type, q) { return new Promise(r => c.toBlob(r, type, q)); },
  supportsEncode(type) { try { return this.canvas(2, 2).toDataURL(type).startsWith(`data:${type}`); } catch (e) { return false; } },
  yieldUI() { return new Promise(r => setTimeout(r, 0)); },

  // =================================================================== Decoding
  async decodeFile(file, opts = {}, progress = () => {}) {
    const name = file.name || 'media';
    const type = (file.type || '').replace('image/apng', 'image/png');
    const buf = await file.arrayBuffer();
    if (/gif$/i.test(type) || /\.gif$/i.test(name)) return { ...(await this.decodeGIF(buf)), source: 'gif' };
    if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(name)) return { ...(await this.decodeVideo(file, opts, progress)), source: 'video' };
    if (type.startsWith('image/') || /\.(png|apng|webp|avif|jpe?g|bmp|svg|jxl)$/i.test(name)) {
      const anim = await this.decodeAnimatedImage(buf, type || this.mimeFromName(name));
      if (anim && anim.frames.length > 1) return { ...anim, source: /png/.test(type) ? 'apng' : /webp/.test(type) ? 'webp' : 'animated' };
      return { ...(await this.decodeStill(file)), source: 'image' };
    }
    throw new Error(`Unsupported file type: ${type || name}`);
  },
  mimeFromName(n) { const e = (n.split('.').pop() || '').toLowerCase(); return { png: 'image/png', apng: 'image/png', webp: 'image/webp', avif: 'image/avif', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', jxl: 'image/jxl' }[e] || ''; },
  async decodeStill(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('This browser cannot decode that image format')); img.src = url; });
      const c = this.canvas(img.naturalWidth || 300, img.naturalHeight || 150);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return { frames: [{ canvas: c, delay: 100 }], width: c.width, height: c.height, loop: 0 };
    } finally { URL.revokeObjectURL(url); }
  },
  /** APNG / animated WebP / AVIF sequences via WebCodecs ImageDecoder (Chromium, Firefox). */
  async decodeAnimatedImage(buf, type) {
    if (!window.ImageDecoder || !type) return null;
    try {
      if (!(await ImageDecoder.isTypeSupported(type))) return null;
      const dec = new ImageDecoder({ data: buf, type });
      await dec.tracks.ready;
      const tr = dec.tracks.selectedTrack;
      if (!tr || tr.frameCount < 2) { dec.close(); return null; }
      const frames = [];
      for (let i = 0; i < tr.frameCount; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const c = this.canvas(image.displayWidth, image.displayHeight);
        c.getContext('2d').drawImage(image, 0, 0);
        frames.push({ canvas: c, delay: Math.max(20, Math.round((image.duration || 100000) / 1000)) });
        image.close();
      }
      const loop = tr.repetitionCount === Infinity ? 0 : Math.round(tr.repetitionCount || 0);
      dec.close();
      return { frames, width: frames[0].canvas.width, height: frames[0].canvas.height, loop };
    } catch (e) { return null; }
  },
  /** GIF with full disposal handling (gifuct-js patches → composited frames). */
  async decodeGIF(buf) {
    const { parseGIF, decompressFrames } = MediaLibs;
    const gif = parseGIF(buf);
    const raw = decompressFrames(gif, true);
    if (!raw.length) throw new Error('GIF has no frames');
    const W = gif.lsd.width, H = gif.lsd.height;
    const work = this.canvas(W, H), wctx = this.ctx(work);
    const patch = this.canvas(W, H), pctx = this.ctx(patch);
    const frames = [];
    let restore = null;
    for (const f of raw) {
      const { dims } = f;
      if (f.disposalType === 3) restore = wctx.getImageData(0, 0, W, H);
      patch.width = dims.width; patch.height = dims.height;
      const id = pctx.createImageData(dims.width, dims.height);
      id.data.set(f.patch);
      pctx.putImageData(id, 0, 0);
      wctx.drawImage(patch, dims.left, dims.top);
      frames.push({ canvas: this.clone(work), delay: Math.max(20, (f.delay || 100)) });
      if (f.disposalType === 2) wctx.clearRect(dims.left, dims.top, dims.width, dims.height);
      else if (f.disposalType === 3 && restore) { wctx.putImageData(restore, 0, 0); restore = null; }
      if (frames.length % 20 === 0) await this.yieldUI();
    }
    const loopExt = gif.frames.find(fr => fr.application && fr.application.blocks);
    return { frames, width: W, height: H, loop: 0, _loopExt: !!loopExt };
  },
  async probeVideo(file) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('This browser cannot play that video format')); });
    if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise(r => { v.ontimeupdate = r; }); v.currentTime = 0; }
    return { video: v, url, duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  },
  /** Sample a video into frames. opts: { start, end, fps, width } */
  async decodeVideo(file, opts = {}, progress = () => {}) {
    const { video: v, url, duration, width, height } = await this.probeVideo(file);
    try {
      const start = Utils.clamp(opts.start ?? 0, 0, duration);
      const end = Utils.clamp(opts.end ?? Math.min(duration, start + 15), start + 0.05, duration);
      const fps = Utils.clamp(opts.fps || 10, 1, 60);
      const w = Math.min(opts.width || Math.min(width, 640), width) || width;
      const h = Math.round((height / width) * w);
      const n = Math.max(1, Math.floor((end - start) * fps));
      const frames = [];
      const delay = Math.round(1000 / fps);
      for (let i = 0; i < n; i++) {
        const t = start + i / fps;
        await new Promise((res) => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); v.currentTime = Math.min(t, duration - 0.001); });
        const c = this.canvas(w, h);
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        frames.push({ canvas: c, delay });
        progress((i + 1) / n);
      }
      let audio = null;
      if (opts.audio !== false) audio = await this.decodeAudio(file, start, end).catch(() => null);
      return { frames, width: w, height: h, loop: 0, audio, videoMeta: { duration, width, height } };
    } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); }
  },
  async decodeAudio(file, start = 0, end = Infinity) {
    const buf = await file.arrayBuffer();
    const ac = new OfflineAudioContext(2, 48000, 48000);
    const ab = await ac.decodeAudioData(buf);
    const s0 = Math.floor(start * ab.sampleRate), s1 = Math.min(ab.length, Math.floor((isFinite(end) ? end : ab.duration) * ab.sampleRate));
    if (s1 - s0 < 100) return null;
    const channels = [];
    for (let ch = 0; ch < ab.numberOfChannels; ch++) channels.push(ab.getChannelData(ch).slice(s0, s1));
    if (channels.every(c => c.every(v => v === 0))) return null;
    return { channels, sampleRate: ab.sampleRate };
  },
  audioDuration(a) { return a ? a.channels[0].length / a.sampleRate : 0; },
  audioSlice(a, t0, t1) { if (!a) return null; const s0 = Math.max(0, Math.floor(t0 * a.sampleRate)), s1 = Math.max(s0, Math.floor(t1 * a.sampleRate)); return { channels: a.channels.map(c => c.slice(s0, s1)), sampleRate: a.sampleRate }; },
  audioReverse(a) { return a ? { channels: a.channels.map(c => c.slice().reverse()), sampleRate: a.sampleRate } : null; },
  audioSpeed(a, factor) {
    if (!a || factor === 1) return a;
    const n = Math.max(1, Math.floor(a.channels[0].length / factor));
    return { channels: a.channels.map(c => { const o = new Float32Array(n); for (let i = 0; i < n; i++) { const p = i * factor, k = Math.floor(p), f = p - k; o[i] = (c[k] || 0) * (1 - f) + (c[k + 1] || 0) * f; } return o; }), sampleRate: a.sampleRate };
  },

  /** Sprite sheet → frames. */
  spriteToFrames(img, cols, rows, count, delay) {
    const fw = Math.floor(img.width / cols), fh = Math.floor(img.height / rows);
    const frames = [];
    for (let i = 0; i < Math.min(count || cols * rows, cols * rows); i++) {
      const c = this.canvas(fw, fh);
      c.getContext('2d').drawImage(img, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh, 0, 0, fw, fh);
      frames.push({ canvas: c, delay });
    }
    return frames;
  },
  /** Images (any sizes) → frames on a common canvas. fit: contain | cover | stretch */
  imagesToFrames(images, { width, height, fit = 'contain', delay = 200, bg = 'transparent' }) {
    return images.map(img => {
      const c = this.canvas(width, height), x = c.getContext('2d');
      if (bg !== 'transparent') { x.fillStyle = bg; x.fillRect(0, 0, width, height); }
      const iw = img.width, ih = img.height;
      let s = fit === 'cover' ? Math.max(width / iw, height / ih) : fit === 'none' ? 1 : Math.min(width / iw, height / ih);
      if (fit === 'stretch') x.drawImage(img, 0, 0, width, height);
      else x.drawImage(img, (width - iw * s) / 2, (height - ih * s) / 2, iw * s, ih * s);
      return { canvas: c, delay };
    });
  },

  // =================================================================== Frame operations
  map(frames, fn) { return frames.map((f, i) => ({ canvas: fn(f.canvas, i), delay: f.delay })); },
  resize(frames, w, h, smooth = true) {
    return this.map(frames, (c) => { const n = this.canvas(w, h), x = n.getContext('2d'); x.imageSmoothingEnabled = smooth; x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height); return n; });
  },
  crop(frames, r) {
    return this.map(frames, (c) => { const n = this.canvas(r.w, r.h); n.getContext('2d').drawImage(c, -r.x, -r.y); return n; });
  },
  rotate(frames, deg, bg = 'transparent', flipH = false, flipV = false) {
    const rad = Utils.degToRad(deg);
    return this.map(frames, (c) => {
      const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
      const w = Math.round(c.width * cos + c.height * sin), h = Math.round(c.width * sin + c.height * cos);
      const n = this.canvas(w, h), x = n.getContext('2d');
      if (bg !== 'transparent') { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
      x.translate(w / 2, h / 2); x.rotate(rad); x.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      x.drawImage(c, -c.width / 2, -c.height / 2);
      return n;
    });
  },
  /** CSS-filter style effects + pixel effects. fx: { brightness, contrast, saturate, hue, blur, grayscale, sepia, invert, posterize, threshold, tint, tintAmount, pixelate, vignette, sharpen, noise } */
  effects(frames, fx) {
    const css = [];
    if (fx.brightness !== 100) css.push(`brightness(${fx.brightness}%)`);
    if (fx.contrast !== 100) css.push(`contrast(${fx.contrast}%)`);
    if (fx.saturate !== 100) css.push(`saturate(${fx.saturate}%)`);
    if (fx.hue) css.push(`hue-rotate(${fx.hue}deg)`);
    if (fx.grayscale) css.push(`grayscale(${fx.grayscale}%)`);
    if (fx.sepia) css.push(`sepia(${fx.sepia}%)`);
    if (fx.invert) css.push(`invert(${fx.invert}%)`);
    if (fx.blur) css.push(`blur(${fx.blur}px)`);
    return this.map(frames, (c) => {
      let n = this.canvas(c.width, c.height);
      const x = this.ctx(n);
      if (fx.pixelate > 1) {
        const s = this.canvas(Math.max(1, c.width / fx.pixelate), Math.max(1, c.height / fx.pixelate));
        s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
        x.imageSmoothingEnabled = false;
        x.filter = css.join(' ') || 'none';
        x.drawImage(s, 0, 0, c.width, c.height);
      } else { x.filter = css.join(' ') || 'none'; x.drawImage(c, 0, 0); }
      x.filter = 'none';
      if (fx.posterize || fx.threshold || (fx.tint && fx.tintAmount) || fx.noise || fx.sharpen) {
        const id = x.getImageData(0, 0, n.width, n.height), d = id.data;
        if (fx.sharpen) this.convolve(id, [0, -1, 0, -1, 5, -1, 0, -1, 0], fx.sharpen / 100);
        const levels = fx.posterize ? Math.max(2, fx.posterize) : 0;
        const t = fx.tint ? Utils.parseColor(fx.tint) : null, ta = (fx.tintAmount || 0) / 100;
        for (let i = 0; i < d.length; i += 4) {
          if (levels) for (let k = 0; k < 3; k++) d[i + k] = Math.round(Math.round((d[i + k] / 255) * (levels - 1)) / (levels - 1) * 255);
          if (fx.threshold) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; const v = l >= fx.threshold ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
          if (t && ta) { d[i] += (t.r - d[i]) * ta; d[i + 1] += (t.g - d[i + 1]) * ta; d[i + 2] += (t.b - d[i + 2]) * ta; }
          if (fx.noise) { const r = (Math.random() - 0.5) * fx.noise * 2.55; d[i] += r; d[i + 1] += r; d[i + 2] += r; }
        }
        x.putImageData(id, 0, 0);
      }
      if (fx.vignette) {
        const g = x.createRadialGradient(n.width / 2, n.height / 2, Math.min(n.width, n.height) * 0.25, n.width / 2, n.height / 2, Math.hypot(n.width, n.height) / 2);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${fx.vignette / 100})`);
        x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, n.width, n.height); x.globalCompositeOperation = 'source-over';
      }
      return n;
    });
  },
  convolve(id, k, amount) {
    const { width: w, height: h, data: d } = id, src = new Uint8ClampedArray(d);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0, i = 0;
        for (let ky = -1; ky <= 1; ky++) for (let kx = -1; kx <= 1; kx++) s += src[((y + ky) * w + (x + kx)) * 4 + c] * k[i++];
        const o = (y * w + x) * 4 + c;
        d[o] = src[o] + (s - src[o]) * amount;
      }
    }
  },
  /** Draw text on frames [from..to]. */
  text(frames, o) {
    return this.map(frames, (c, i) => {
      const n = this.clone(c);
      if (i < o.from || i > o.to) return n;
      const x = n.getContext('2d');
      x.font = `${o.weight || 700} ${o.size}px ${o.font}`;
      x.textAlign = o.align || 'center'; x.textBaseline = 'middle';
      const lines = String(o.text).split('\n');
      lines.forEach((ln, k) => {
        const y = o.y + (k - (lines.length - 1) / 2) * o.size * 1.2;
        if (o.strokeWidth > 0) { x.lineJoin = 'round'; x.lineWidth = o.strokeWidth * 2; x.strokeStyle = o.stroke; x.strokeText(ln, o.x, y); }
        x.fillStyle = o.color; x.fillText(ln, o.x, y);
      });
      return n;
    });
  },
  overlay(frames, img, o) {
    return this.map(frames, (c, i) => {
      const n = this.clone(c);
      if (i < o.from || i > o.to) return n;
      const x = n.getContext('2d');
      x.globalAlpha = o.opacity / 100;
      x.drawImage(img, o.x, o.y, img.width * o.scale / 100, img.height * o.scale / 100);
      return n;
    });
  },
  censor(frames, r, mode, strength, from = 0, to = Infinity) {
    return this.map(frames, (c, i) => {
      const n = this.clone(c);
      if (i < from || i > to) return n;
      const x = n.getContext('2d');
      const rx = Math.max(0, Math.round(r.x)), ry = Math.max(0, Math.round(r.y)), rw = Math.max(1, Math.round(r.w)), rh = Math.max(1, Math.round(r.h));
      x.save(); x.beginPath(); x.rect(rx, ry, rw, rh); x.clip();
      if (mode === 'pixelate') {
        const s = this.canvas(Math.max(1, rw / strength), Math.max(1, rh / strength));
        s.getContext('2d').drawImage(c, rx, ry, rw, rh, 0, 0, s.width, s.height);
        x.imageSmoothingEnabled = false; x.drawImage(s, rx, ry, rw, rh);
      } else if (mode === 'black') { x.fillStyle = '#000'; x.fillRect(rx, ry, rw, rh); }
      else { x.filter = `blur(${strength}px)`; x.drawImage(c, 0, 0); }
      x.restore();
      return n;
    });
  },
  /** Make a colour transparent (with fuzz), or flatten transparency onto a colour. */
  transparency(frames, { mode, color, fuzz }) {
    const t = Utils.parseColor(color) || { r: 255, g: 255, b: 255 };
    return this.map(frames, (c) => {
      const n = this.canvas(c.width, c.height), x = this.ctx(n);
      if (mode === 'flatten') { x.fillStyle = color; x.fillRect(0, 0, n.width, n.height); x.drawImage(c, 0, 0); return n; }
      x.drawImage(c, 0, 0);
      const id = x.getImageData(0, 0, n.width, n.height), d = id.data, lim = (fuzz / 100) * 441;
      for (let i = 0; i < d.length; i += 4) if (Math.hypot(d[i] - t.r, d[i + 1] - t.g, d[i + 2] - t.b) <= lim) d[i + 3] = 0;
      x.putImageData(id, 0, 0);
      return n;
    });
  },

  // =================================================================== Encoders
  /**
   * Lossy pre-pass (approximates gifsicle --lossy): pixels close to the same pixel in the previous frame, or to their
   * left neighbour, are snapped to it. That produces long identical runs → much better LZW compression and, with
   * transparency optimisation, more transparent pixels.
   */
  stabilize(datas, W, lossy) {
    const th = lossy * 0.5;
    let prev = null;
    for (const d of datas) {
      for (let p = 0; p < d.length; p += 4) {
        if (prev && d[p + 3] > 127 && prev[p + 3] > 127 && Math.abs(d[p] - prev[p]) + Math.abs(d[p + 1] - prev[p + 1]) + Math.abs(d[p + 2] - prev[p + 2]) <= th) { d[p] = prev[p]; d[p + 1] = prev[p + 1]; d[p + 2] = prev[p + 2]; continue; }
        if ((p / 4) % W && d[p + 3] > 127 && d[p - 1] > 127 && Math.abs(d[p] - d[p - 4]) + Math.abs(d[p + 1] - d[p - 3]) + Math.abs(d[p + 2] - d[p - 2]) <= th * 0.6) { d[p] = d[p - 4]; d[p + 1] = d[p - 3]; d[p + 2] = d[p - 2]; }
      }
      prev = d;
    }
  },
  /** Nearest-palette-colour lookup with a small cache. */
  makeNearest(palette) {
    const cache = new Map();
    return (r, g, b, a) => {
      const key = a < 128 ? -1 : ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let idx = cache.get(key);
      if (idx !== undefined) return idx;
      let best = 0, bd = Infinity;
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        if (a < 128) { if (p[3] === 0) { best = i; break; } continue; }
        if (p.length > 3 && p[3] === 0) continue;
        const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
        if (d < bd) { bd = d; best = i; }
      }
      cache.set(key, best);
      return best;
    };
  },
  ditherIndex(data, w, h, palette) {
    const nearest = this.makeNearest(palette);
    const buf = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) buf[i] = data[i];
    const out = new Uint8Array(w * h);
    const spread = (x, y, er, eg, eb, f) => {
      if (x < 0 || x >= w || y >= h) return;
      const o = (y * w + x) * 4;
      if (data[o + 3] < 128) return;
      buf[o] += er * f; buf[o + 1] += eg * f; buf[o + 2] += eb * f;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const r = Utils.clamp(buf[o], 0, 255), g = Utils.clamp(buf[o + 1], 0, 255), b = Utils.clamp(buf[o + 2], 0, 255), a = data[o + 3];
      const idx = nearest(r | 0, g | 0, b | 0, a);
      out[y * w + x] = idx;
      if (a < 128) continue;
      const p = palette[idx], er = r - p[0], eg = g - p[1], eb = b - p[2];
      spread(x + 1, y, er, eg, eb, 7 / 16); spread(x - 1, y + 1, er, eg, eb, 3 / 16); spread(x, y + 1, er, eg, eb, 5 / 16); spread(x + 1, y + 1, er, eg, eb, 1 / 16);
    }
    return out;
  },
  /**
   * GIF. opts: { colors, dither, globalPalette, optimizeTransparency, fuzz, lossy, loop }
   * "lossy" posterises low bits before quantising — smaller files, more banding (approximation of gifsicle --lossy).
   */
  async encodeGIF(frames, opts = {}, progress = () => {}) {
    const { GIFEncoder, quantize, applyPalette } = MediaLibs;
    const W = frames[0].canvas.width, H = frames[0].canvas.height;
    const colors = Utils.clamp(opts.colors || 256, 2, 256);
    const shift = opts.lossy ? Math.min(2, Math.floor(opts.lossy / 80)) : 0;
    const prep = (d) => { if (shift) for (let i = 0; i < d.length; i += 4) { d[i] = (d[i] >> shift) << shift; d[i + 1] = (d[i + 1] >> shift) << shift; d[i + 2] = (d[i + 2] >> shift) << shift; } return d; };
    const getData = (c) => { const t = this.canvas(W, H), x = this.ctx(t); x.drawImage(c, 0, 0, W, H); return prep(x.getImageData(0, 0, W, H).data); };
    const hasAlphaIn = (d) => { for (let i = 3; i < d.length; i += 16) if (d[i] < 128) return true; return false; };
    let global = null;
    const datas = frames.map(f => getData(f.canvas));
    if (opts.lossy) this.stabilize(datas, W, opts.lossy);
    const realAlpha = datas.some(hasAlphaIn);
    const optT = !!opts.optimizeTransparency && !realAlpha && frames.length > 1; // only safe for opaque sources
    const anyAlpha = optT || realAlpha;
    const format = anyAlpha ? 'rgba4444' : 'rgb565';
    if (opts.globalPalette !== false) {
      const step = Math.max(1, Math.floor(datas.length / 24));
      const parts = datas.filter((_, i) => i % step === 0);
      const sample = new Uint8ClampedArray(parts.reduce((s, d) => s + d.length, 0));
      let o = 0; for (const d of parts) { sample.set(d, o); o += d.length; }
      global = quantize(sample, anyAlpha ? colors - 1 : colors, { format, oneBitAlpha: true });
      if (anyAlpha && !global.some(p => p[3] === 0)) global.push([0, 0, 0, 0]);
    }
    const gif = GIFEncoder();
    let prev = null;
    const fuzz = ((opts.fuzz || 0) + (opts.lossy ? opts.lossy / 10 : 0)) * 4.41;
    for (let i = 0; i < frames.length; i++) {
      const d = datas[i];
        if (optT && prev) {
        // pixels unchanged since the previous frame become transparent (frame is drawn over the previous one)
        for (let p = 0; p < d.length; p += 4) {
          if (Math.abs(d[p] - prev[p]) + Math.abs(d[p + 1] - prev[p + 1]) + Math.abs(d[p + 2] - prev[p + 2]) <= fuzz) d[p + 3] = 0;
          else { prev[p] = d[p]; prev[p + 1] = d[p + 1]; prev[p + 2] = d[p + 2]; }
        }
      } else prev = d.slice();
      const palette = global || (() => { const p = quantize(d, anyAlpha ? colors - 1 : colors, { format, oneBitAlpha: true }); if (anyAlpha && !p.some(c => c[3] === 0)) p.push([0, 0, 0, 0]); return p; })();
      const index = opts.dither ? this.ditherIndex(d, W, H, palette) : applyPalette(d, palette, format);
      const ti = palette.findIndex(p => p.length > 3 && p[3] === 0);
      gif.writeFrame(index, W, H, {
        palette: (i === 0 || !global) ? palette : undefined, first: i === 0, delay: frames[i].delay,
        transparent: ti >= 0, transparentIndex: Math.max(0, ti), repeat: i === 0 ? (opts.loop ?? 0) : undefined,
        dispose: optT ? 1 : 2
      });
      if (i % 4 === 0) { progress((i + 1) / frames.length); await this.yieldUI(); }
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: 'image/gif' });
  },
  async encodeAPNG(frames, loop = 0, progress = () => {}) {
    const W = frames[0].canvas.width, H = frames[0].canvas.height;
    const pngs = [];
    for (let i = 0; i < frames.length; i++) {
      const c = frames[i].canvas.width === W && frames[i].canvas.height === H ? frames[i].canvas : Media.resize([frames[i]], W, H)[0].canvas;
      pngs.push(await this.blobBytes(await this.toBlob(c, 'image/png')));
      if (i % 4 === 0) { progress((i + 1) / frames.length); await this.yieldUI(); }
    }
    const bytes = StudioApp.prototype.buildAPNG(pngs, frames.map(f => f.delay));
    if (loop) new DataView(bytes.buffer).setUint32(8 + 25 + 8 + 4, loop); // acTL num_plays
    return new Blob([bytes], { type: 'image/apng' });
  },
  /** Animated WebP assembled from per-frame WebP encodes (RIFF / VP8X / ANIM / ANMF). */
  async encodeWebP(frames, quality = 0.8, loop = 0, progress = () => {}) {
    if (!this.supportsEncode('image/webp')) throw new Error('This browser cannot encode WebP (try Chrome, Edge or Firefox)');
    const W = frames[0].canvas.width, H = frames[0].canvas.height;
    const u24 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];
    const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    const chunk = (fourcc, data) => { const pad = data.length & 1; const out = new Uint8Array(8 + data.length + pad); out.set([...fourcc].map(c => c.charCodeAt(0)), 0); out.set(u32(data.length), 4); out.set(data, 8); return out; };
    const parts = [];
    let alpha = false;
    for (let i = 0; i < frames.length; i++) {
      const bytes = await this.blobBytes(await this.toBlob(frames[i].canvas, 'image/webp', quality));
      // collect ALPH / VP8 / VP8L sub-chunks from the single-frame file
      const sub = [];
      let p = 12;
      while (p + 8 <= bytes.length) {
        const id = String.fromCharCode(...bytes.subarray(p, p + 4));
        const len = bytes[p + 4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24);
        if (id === 'ALPH' || id === 'VP8 ' || id === 'VP8L') { sub.push(bytes.subarray(p, p + 8 + len + (len & 1))); if (id !== 'VP8 ') alpha = true; }
        p += 8 + len + (len & 1);
      }
      const frameData = new Uint8Array(sub.reduce((s, x) => s + x.length, 0));
      let o = 0; for (const x of sub) { frameData.set(x, o); o += x.length; }
      const head = new Uint8Array([...u24(0), ...u24(0), ...u24(W - 1), ...u24(H - 1), ...u24(Math.min(0xffffff, frames[i].delay)), 0b10]);
      const body = new Uint8Array(head.length + frameData.length); body.set(head); body.set(frameData, head.length);
      parts.push(chunk('ANMF', body));
      if (i % 4 === 0) { progress((i + 1) / frames.length); await this.yieldUI(); }
    }
    const vp8x = chunk('VP8X', new Uint8Array([0x02 | (alpha ? 0x10 : 0), 0, 0, 0, ...u24(W - 1), ...u24(H - 1)]));
    const anim = chunk('ANIM', new Uint8Array([0, 0, 0, 0, loop & 255, (loop >> 8) & 255]));
    const total = 4 + vp8x.length + anim.length + parts.reduce((s, x) => s + x.length, 0);
    const out = new Uint8Array(8 + total);
    out.set([82, 73, 70, 70, ...u32(total), 87, 69, 66, 80]);
    let o = 12; for (const x of [vp8x, anim, ...parts]) { out.set(x, o); o += x.length; }
    return new Blob([out], { type: 'image/webp' });
  },
  /** MP4 (H.264) / WebM (VP9/VP8) via WebCodecs; audio as Opus/AAC when present. Falls back to MediaRecorder. */
  async encodeVideo(frames, { container = 'mp4', quality = 0.8, bg = '#000000', audio = null } = {}, progress = () => {}) {
    let W = frames[0].canvas.width, H = frames[0].canvas.height;
    W += W & 1; H += H & 1; // codecs need even sizes
    if (!window.VideoEncoder) return this.encodeVideoRecorder(frames, container, bg, progress);
    const bitrate = Math.round(W * H * 30 * (0.04 + quality * 0.2));
    const cands = container === 'mp4' ? ['avc1.640033', 'avc1.4d0033', 'avc1.42003e', 'avc1.42001f'] : ['vp09.00.31.08', 'vp8'];
    let codec = null;
    for (const c of cands) { try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate })).supported) { codec = c; break; } } catch (e) { /* next */ } }
    if (!codec) return this.encodeVideoRecorder(frames, container, bg, progress);
    let audioCfg = null;
    if (audio && window.AudioEncoder) {
      for (const ac of container === 'mp4' ? ['mp4a.40.2', 'opus'] : ['opus']) {
        const cfg = { codec: ac, sampleRate: 48000, numberOfChannels: Math.min(2, audio.channels.length), bitrate: 128000 };
        try { if ((await AudioEncoder.isConfigSupported(cfg)).supported) { audioCfg = cfg; break; } } catch (e) { /* next */ }
      }
    }
    const L = container === 'mp4' ? MediaLibs.Mp4Muxer : MediaLibs.WebMMuxer;
    const muxer = new L.Muxer({
      target: new L.ArrayBufferTarget(),
      video: container === 'mp4' ? { codec: 'avc', width: W, height: H } : { codec: codec.startsWith('vp09') ? 'V_VP9' : 'V_VP8', width: W, height: H },
      audio: audioCfg ? (container === 'mp4' ? { codec: audioCfg.codec === 'opus' ? 'opus' : 'aac', numberOfChannels: audioCfg.numberOfChannels, sampleRate: 48000 } : { codec: 'A_OPUS', numberOfChannels: audioCfg.numberOfChannels, sampleRate: 48000 }) : undefined,
      ...(container === 'mp4' ? { fastStart: 'in-memory', firstTimestampBehavior: 'offset' } : { firstTimestampBehavior: 'offset' })
    });
    let err = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { err = e; } });
    enc.configure({ codec, width: W, height: H, bitrate, framerate: Math.round(1000 / (Media.duration(frames) / frames.length)) || 30 });
    const tmp = this.canvas(W, H), tx = tmp.getContext('2d');
    let t = 0;
    for (let i = 0; i < frames.length; i++) {
      tx.fillStyle = bg; tx.fillRect(0, 0, W, H); tx.drawImage(frames[i].canvas, 0, 0);
      const vf = new VideoFrame(tmp, { timestamp: Math.round(t * 1000), duration: frames[i].delay * 1000 });
      enc.encode(vf, { keyFrame: i % 60 === 0 });
      vf.close();
      t += frames[i].delay;
      while (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 2));
      if (err) throw err;
      if (i % 4 === 0) { progress((i + 1) / frames.length * (audioCfg ? 0.85 : 1)); await this.yieldUI(); }
    }
    await enc.flush(); enc.close();
    if (audioCfg) {
      const total = t / 1000;
      const ae = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { err = e; } });
      ae.configure(audioCfg);
      const sr = audio.sampleRate, nch = audioCfg.numberOfChannels;
      const len = Math.min(audio.channels[0].length, Math.floor(total * sr));
      const step = 4800;
      for (let s = 0; s < len; s += step) {
        const n = Math.min(step, len - s);
        const planar = new Float32Array(n * nch);
        for (let ch = 0; ch < nch; ch++) planar.set(audio.channels[Math.min(ch, audio.channels.length - 1)].subarray(s, s + n), ch * n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: nch, timestamp: Math.round((s / sr) * 1e6), data: planar });
        ae.encode(ad); ad.close();
      }
      await ae.flush(); ae.close();
    }
    if (err) throw err;
    muxer.finalize();
    progress(1);
    return new Blob([muxer.target.buffer], { type: container === 'mp4' ? 'video/mp4' : 'video/webm' });
  },
  async encodeVideoRecorder(frames, container, bg, progress) {
    const c = this.canvas(frames[0].canvas.width, frames[0].canvas.height), x = c.getContext('2d');
    const mime = [container === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('This browser cannot encode video');
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6e6 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    const draw = (i) => { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); x.drawImage(frames[i].canvas, 0, 0); };
    draw(0); rec.start(100);
    for (let i = 0; i < frames.length; i++) { draw(i); progress((i + 1) / frames.length); await new Promise(r => setTimeout(r, frames[i].delay)); }
    rec.stop(); await done;
    return new Blob(chunks, { type: mime.split(';')[0] });
  },
  /** Palette PNG (PNG-8) with optional dithering — the "lossy PNG" compression. */
  async encodePNG8(canvas, colors = 256, dither = true) {
    const { quantize, applyPalette, zlibSync } = MediaLibs;
    const W = canvas.width, H = canvas.height;
    const d = this.ctx(canvas).getImageData(0, 0, W, H).data;
    let hasAlpha = false; for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { hasAlpha = true; break; }
    const palette = quantize(d, colors, { format: hasAlpha ? 'rgba4444' : 'rgb565', oneBitAlpha: false });
    const index = dither && !hasAlpha ? this.ditherIndex(d, W, H, palette) : applyPalette(d, palette, hasAlpha ? 'rgba4444' : 'rgb565');
    const raw = new Uint8Array((W + 1) * H);
    for (let y = 0; y < H; y++) { raw[y * (W + 1)] = 0; raw.set(index.subarray(y * W, (y + 1) * W), y * (W + 1) + 1); }
    const idat = zlibSync(raw, { level: 9 });
    const parts = [];
    const u32 = (v) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    const chunk = (type, data) => { const body = new Uint8Array(4 + data.length); body.set([...type].map(c => c.charCodeAt(0))); body.set(data, 4); parts.push(new Uint8Array(u32(data.length)), body, new Uint8Array(u32(Utils.crc32(body)))); };
    parts.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    chunk('IHDR', new Uint8Array([...u32(W), ...u32(H), 8, 3, 0, 0, 0]));
    chunk('PLTE', new Uint8Array(palette.flatMap(p => [p[0], p[1], p[2]])));
    if (hasAlpha) chunk('tRNS', new Uint8Array(palette.map(p => (p.length > 3 ? p[3] : 255))));
    chunk('IDAT', idat);
    chunk('IEND', new Uint8Array(0));
    return new Blob(parts, { type: 'image/png' });
  },
  async zipFrames(frames, base = 'frame', type = 'image/png') {
    const files = {};
    const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : 'webp';
    for (let i = 0; i < frames.length; i++) {
      files[`${base}_${String(i + 1).padStart(4, '0')}.${ext}`] = [await this.blobBytes(await this.toBlob(frames[i].canvas, type, 0.92)), { level: 0 }];
      if (i % 8 === 0) await this.yieldUI();
    }
    files['frames.json'] = MediaLibs.strToU8(JSON.stringify({ frames: frames.map((f, i) => ({ file: `${base}_${String(i + 1).padStart(4, '0')}.${ext}`, delay: f.delay })) }, null, 2));
    return new Blob([MediaLibs.zipSync(files)], { type: 'application/zip' });
  },
  spriteSheet(frames, cols) {
    const fw = frames[0].canvas.width, fh = frames[0].canvas.height, rows = Math.ceil(frames.length / cols);
    const c = this.canvas(fw * cols, fh * rows), x = c.getContext('2d');
    frames.forEach((f, i) => x.drawImage(f.canvas, (i % cols) * fw, Math.floor(i / cols) * fh));
    return { canvas: c, meta: { frameWidth: fw, frameHeight: fh, columns: cols, rows, frames: frames.map((f, i) => ({ x: (i % cols) * fw, y: Math.floor(i / cols) * fh, delay: f.delay })) } };
  }
};
