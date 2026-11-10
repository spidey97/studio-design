/**
 * DesignStudio — malicious-file hardening (v3.20.0).
 * Every file / paste / project / autosave / bridge payload passes through these guards:
 *  • safe JSON: size cap and a reviver that drops __proto__ / constructor / prototype keys (prototype pollution)
 *  • deep sanitize of loaded projects: depth / size caps, prototype keys stripped, 3D assets validated
 *  • image URLs: only inline data:image/… (no remote tracking pixels, no javascript:) for layers and 3D textures
 *  • decompression-bomb limits for images, GIFs, animated images and canvases (pixel budget, max side)
 *  • 3D models: glTF / GLB may not reference external files (no network fetches from a model)
 *  • links in prototypes / triggers: http(s) and mailto only
 */
'use strict';

const DS_LIMITS = {
  projectBytes: 200 * 1024 * 1024, // .designstudio.json
  svgBytes: 30 * 1024 * 1024,
  imageBytes: 40 * 1024 * 1024,
  mediaBytes: 500 * 1024 * 1024,   // video
  mediaImageBytes: 200 * 1024 * 1024,
  modelBytes: 30 * 1024 * 1024,
  maxSide: 16384,                  // px, any canvas / decoded image
  maxPixels: 100e6,                // one image / frame
  maxClipPixels: 400e6,            // all frames of an animation together
  maxDepth: 64                     // nesting of imported JSON
};
const DS_BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** A refused file is the user's situation, not an app bug: name it so callers show a message without logging an error. */
function dsLimit(msg) { const e = new Error(msg); e.name = 'LimitError'; return e; }

Object.assign(Utils, {
  /** JSON.parse with a size cap and prototype-pollution keys removed. Throws a readable error. */
  safeParseJSON(text, maxBytes = DS_LIMITS.projectBytes) {
    if (typeof text !== 'string') throw new Error('Not a text file');
    if (text.length > maxBytes) throw dsLimit(`File is too large (${Math.round(text.length / 1048576)} MB, limit ${Math.round(maxBytes / 1048576)} MB)`);
    return JSON.parse(text, (k, v) => (DS_BAD_KEYS.has(k) ? undefined : v));
  },
  /** Deep copy without prototype keys, functions or absurd nesting (for objects that did not come from safeParseJSON). */
  deepSanitize(v, depth = 0) {
    if (depth > DS_LIMITS.maxDepth) return null;
    if (v === null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' ? undefined : v;
    if (Array.isArray(v)) return v.map(x => Utils.deepSanitize(x, depth + 1));
    if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return v; // typed arrays, Maps… (internal only)
    const out = {};
    for (const k of Object.keys(v)) { if (DS_BAD_KEYS.has(k)) continue; const s = Utils.deepSanitize(v[k], depth + 1); if (s !== undefined) out[k] = s; }
    return out;
  },
  /** Inline images only: data:image/<raster or svg>[;base64], or a blob: URL created by this page. */
  safeImageURL(v) {
    return typeof v === 'string' && (/^data:image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml)(;[a-z0-9=.+-]+)*,/i.test(v) || /^blob:/i.test(v)) ? v : null;
  },
  /** Links users can follow from prototypes / triggers / exports. */
  safeLinkURL(v) {
    if (typeof v !== 'string') return '';
    const s = v.trim().slice(0, 2000);
    return /^(https?:\/\/|mailto:)/i.test(s) && !/[\u0000-\u001f]/.test(s) ? s : '';
  },
  /** Throws when a decoded image / canvas would be a decompression bomb. */
  assertPixels(w, h, frames = 1, what = 'Image') {
    w = Math.round(w) || 0; h = Math.round(h) || 0;
    if (w > DS_LIMITS.maxSide || h > DS_LIMITS.maxSide) throw dsLimit(`${what} is ${w}×${h} px — the limit is ${DS_LIMITS.maxSide} px per side`);
    if (w * h > DS_LIMITS.maxPixels) throw dsLimit(`${what} has ${Math.round(w * h / 1e6)} megapixels — the limit is ${DS_LIMITS.maxPixels / 1e6} MP`);
    if (w * h * frames > DS_LIMITS.maxClipPixels) throw dsLimit(`${what} is too large to edit (${frames} frames × ${w}×${h} px) — trim or resize it first`);
  },
  assertSize(file, limit, what = 'File') {
    if (file && file.size > limit) throw dsLimit(`${what} is ${Math.round(file.size / 1048576)} MB — the limit is ${Math.round(limit / 1048576)} MB`);
  }
});

/** Clean the 3D part of a project: object defs as plain data, assets limited to inline models / images. */
function dsSanitizeScene3D(sc) {
  if (!sc || typeof sc !== 'object' || Array.isArray(sc)) return null;
  const out = Utils.deepSanitize(sc);
  out.objects = Array.isArray(out.objects) ? out.objects.filter(o => o && typeof o === 'object' && typeof o.id === 'string' && typeof o.type === 'string').slice(0, 5000) : [];
  const assets = {};
  for (const [k, a] of Object.entries(out.assets || {})) {
    if (typeof a === 'string') { if (Utils.safeImageURL(a) && !/^blob:/i.test(a)) assets[k] = a; continue; }       // textures
    if (a && typeof a === 'object' && ['glb', 'gltf', 'obj', 'stl'].includes(a.format) && typeof a.data === 'string' && /^[A-Za-z0-9+/=\s]*$/.test(a.data.slice(0, 2048))) assets[k] = { name: String(a.name || '').slice(0, 200), format: a.format, data: a.data, ...(a.fit === false ? { fit: false } : {}) };
  }
  out.assets = assets;
  for (const o of out.objects) if (o.mat && o.mat.map && !assets[o.mat.map]) delete o.mat.map;
  if (Array.isArray(out.guides)) out.guides = out.guides.filter(g => g && ['x', 'y', 'z'].includes(g.axis) && Number.isFinite(g.pos)).slice(0, 200);
  return out;
}

(function patchSecurity() {
  // project load: one choke point for open / autosave / recent / paste-in project / AI / MCP
  const MP = StudioModel.prototype, load = MP.load;
  MP.load = function (data) {
    const d = Utils.deepSanitize(data) || {};
    if (d.assets && typeof d.assets === 'object') for (const k of Object.keys(d.assets)) if (!Utils.safeImageURL(d.assets[k]) || /^blob:/i.test(d.assets[k])) delete d.assets[k];
    d.scene3d = dsSanitizeScene3D(d.scene3d);
    if (Array.isArray(d.links)) d.links = d.links.filter(l => l && typeof l.id === 'string' && l.src && l.target && typeof l.target.assetId === 'string' && !DS_BAD_KEYS.has(l.target.assetId)).slice(0, 500);
    return load.call(this, d);
  };
  // 3D: external references in models are refused in Scene3DCore.checkGLTF (also inside exported viewers)
  // Design images: pixel bombs + size
  const A = StudioApp.prototype, importImage = A.importImageFile, importSVG = A.importSVGText, handle = A.handleImportFile;
  A.importImageFile = function (file, at) {
    try { Utils.assertSize(file, DS_LIMITS.imageBytes, 'Image'); } catch (e) { Utils.toast(e.message, '⚠️'); return; }
    if (file.type ? !/^image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml)$/i.test(file.type) : !/\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name || '')) { Utils.toast(`Unsupported image type: ${file.type || file.name}`, '⚠️'); return; }
    // probe dimensions before the app decodes it into canvases
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); try { Utils.assertPixels(img.naturalWidth, img.naturalHeight); importImage.call(this, file, at); } catch (e) { Utils.toast(e.message, '⚠️'); } };
    img.onerror = () => { URL.revokeObjectURL(url); Utils.toast('Could not read that image', '❌'); };
    img.src = url;
  };
  A.importSVGText = function (text, name, at) {
    if (typeof text !== 'string' || text.length > DS_LIMITS.svgBytes) { Utils.toast(`SVG is too large (limit ${DS_LIMITS.svgBytes / 1048576} MB)`, '⚠️'); return; }
    if (/<!ENTITY/i.test(text)) { Utils.toast('SVG with XML entity declarations is not allowed (possible entity-expansion attack)', '⚠️'); return; }
    return importSVG.call(this, text, name, at);
  };
  A.handleImportFile = function (file, at) {
    if (!file) return;
    if ((/\.json$/i.test(file.name || '') || file.type === 'application/json') && file.size > DS_LIMITS.projectBytes) { Utils.toast(`Project file is too large (limit ${DS_LIMITS.projectBytes / 1048576} MB)`, '⚠️'); return; }
    return handle.call(this, file, at);
  };
  // Media: file size + pixel budget for every decoder
  const M = Media, decodeFile = M.decodeFile, still = M.decodeStill, gif = M.decodeGIF, anim = M.decodeAnimatedImage;
  M.decodeFile = async function (file, opts, progress) {
    const isVideo = (file.type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(file.name || '');
    Utils.assertSize(file, isVideo ? DS_LIMITS.mediaBytes : DS_LIMITS.mediaImageBytes, isVideo ? 'Video' : 'File');
    return decodeFile.call(this, file, opts, progress);
  };
  M.decodeStill = async function (file) {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('This browser cannot decode that image format')); img.src = url; }); Utils.assertPixels(img.naturalWidth, img.naturalHeight); } finally { URL.revokeObjectURL(url); }
    return still.call(this, file);
  };
  M.decodeGIF = async function (buf) {
    const b = new Uint8Array(buf);
    if (b.length < 13 || String.fromCharCode(b[0], b[1], b[2]) !== 'GIF') throw new Error('Not a GIF file');
    const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8);
    let frames = 1; try { frames = MediaLibs.parseGIF(buf).frames.filter(f => f.image).length || 1; } catch (_) { /* the decoder reports the error */ }
    Utils.assertPixels(w, h, frames, 'GIF');
    return gif.call(this, buf);
  };
  M.decodeAnimatedImage = async function (buf, type) {
    if (!window.ImageDecoder || !type) return anim.call(this, buf, type);
    try {
      if (!(await ImageDecoder.isTypeSupported(type))) return null;
      const dec = new ImageDecoder({ data: buf, type }); await dec.tracks.ready;
      const tr = dec.tracks.selectedTrack;
      if (tr && tr.frameCount > 1) { const { image } = await dec.decode({ frameIndex: 0 }); const w = image.displayWidth, h = image.displayHeight; image.close(); dec.close(); Utils.assertPixels(w, h, tr.frameCount, 'Animation'); }
      else dec.close();
    } catch (e) { if (/limit|too large/i.test(e.message)) throw e; }
    return anim.call(this, buf, type);
  };
  // Media "load image" for frame tools
  if (A.mediaLoadImage) {
    const mli = A.mediaLoadImage;
    A.mediaLoadImage = async function (f) { Utils.assertSize(f, DS_LIMITS.mediaImageBytes, f.name || 'Image'); const r = await mli.call(this, f); Utils.assertPixels(r.width || r.naturalWidth, r.height || r.naturalHeight); return r; };
  }
})();
