/**
 * DesignStudio — Media section (v3.2.0).
 * ezgif-style toolset (create · edit · optimize · convert) on top of the Media engine (media-core.js).
 * Model: one working "clip" = { frames:[{canvas, delay}], loop, audio }. Edit tools transform the clip (undoable);
 * output tools render a file and show size vs. the source so compression can be judged before downloading.
 */
'use strict';

const MEDIA_SESSION_KEY = 'designstudio.media-session';
const MD_RANGE = [
  { k: 'from', label: 'From frame', type: 'number', min: 1, def: () => 1 },
  { k: 'to', label: 'To frame', type: 'number', min: 1, def: (m) => m.frames.length }
];
const MD_LOOP = { k: 'loop', label: 'Loop count (0 = forever)', type: 'number', min: 0, max: 65535, def: (m) => m.loop || 0 };
const MD_FONTS = [['Inter, system-ui, sans-serif', 'Sans'], ['Impact, Haettenschweiler, sans-serif', 'Impact (meme)'], ['Georgia, serif', 'Serif'], ['"Courier New", monospace', 'Mono'], ['"Comic Sans MS", cursive', 'Comic']];
const MD_FX_PRESETS = {
  none: { brightness: 100, contrast: 100, saturate: 100, hue: 0, grayscale: 0, sepia: 0, invert: 0, blur: 0, pixelate: 1, posterize: 0, threshold: 0, noise: 0, sharpen: 0, vignette: 0, tintAmount: 0 },
  grayscale: { grayscale: 100 }, sepia: { sepia: 80, contrast: 110 }, vintage: { sepia: 40, contrast: 90, saturate: 80, vignette: 45, noise: 8 },
  noir: { grayscale: 100, contrast: 150, vignette: 60 }, vivid: { saturate: 160, contrast: 115 }, invert: { invert: 100 }, comic: { posterize: 5, saturate: 140, sharpen: 60 }
};

/** Output formats: label, mime, extension, animated?, fields. */
const MD_FORMATS = {
  gif: { label: 'Animated GIF', ext: 'gif', anim: true, fields: [
    { k: 'colors', label: 'Colours', type: 'select', options: [[256, '256'], [128, '128'], [64, '64'], [32, '32'], [16, '16'], [8, '8'], [4, '4'], [2, '2']], def: () => 256 },
    { k: 'lossy', label: 'Lossy compression', type: 'range', min: 0, max: 200, step: 10, def: () => 0, hint: '0 = off · 30–80 typical · higher = smaller & noisier' },
    { k: 'dither', label: 'Dithering (smoother gradients, larger file)', type: 'check', def: () => false },
    { k: 'optimizeTransparency', label: 'Optimize transparency (unchanged pixels → transparent)', type: 'check', def: () => true },
    { k: 'fuzz', label: 'Fuzz % (treat near-identical pixels as unchanged)', type: 'range', min: 0, max: 20, step: 1, def: () => 2, show: (o) => o.optimizeTransparency },
    { k: 'globalPalette', label: 'Single global palette (smaller, steadier colours)', type: 'check', def: () => true },
    MD_LOOP] },
  apng: { label: 'Animated PNG (APNG)', ext: 'png', anim: true, fields: [MD_LOOP] },
  webp: { label: 'Animated WebP', ext: 'webp', anim: true, fields: [
    { k: 'quality', label: 'Quality', type: 'range', min: 1, max: 100, step: 1, def: () => 80 }, MD_LOOP] },
  mp4: { label: 'MP4 video (H.264)', ext: 'mp4', anim: true, video: true, fields: [] },
  webm: { label: 'WebM video (VP9)', ext: 'webm', anim: true, video: true, fields: [] },
  zip: { label: 'Frames as ZIP', ext: 'zip', anim: true, fields: [
    { k: 'img', label: 'Frame format', type: 'select', options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']], def: () => 'image/png' }] },
  sheet: { label: 'Sprite sheet (PNG + JSON)', ext: 'png', anim: true, fields: [
    { k: 'cols', label: 'Columns', type: 'number', min: 1, max: 64, def: (m) => Math.ceil(Math.sqrt(m.frames.length)) }] },
  png: { label: 'PNG (lossless)', ext: 'png', still: true, fields: [] },
  png8: { label: 'PNG-8 (lossy palette PNG)', ext: 'png', still: true, fields: [
    { k: 'colors', label: 'Colours', type: 'select', options: [[256, '256'], [128, '128'], [64, '64'], [32, '32'], [16, '16']], def: () => 256 },
    { k: 'dither', label: 'Dithering', type: 'check', def: () => true }] },
  jpeg: { label: 'JPEG', ext: 'jpg', still: true, fields: [] },
  webpstill: { label: 'WebP (still)', ext: 'webp', still: true, fields: [] },
  avif: { label: 'AVIF', ext: 'avif', still: true, fields: [] },
  datauri: { label: 'Base64 data URI', ext: 'txt', still: true, fields: [
    { k: 'img', label: 'Encode as', type: 'select', options: [['image/png', 'PNG'], ['image/webp', 'WebP'], ['image/jpeg', 'JPEG']], def: () => 'image/png' }] }
};
const MD_VIDEO_FIELDS = [
  { k: 'quality', label: 'Quality', type: 'range', min: 5, max: 100, step: 5, def: () => 70 },
  { k: 'scale', label: 'Scale %', type: 'range', min: 10, max: 100, step: 5, def: () => 100 },
  { k: 'bg', label: 'Background (video has no transparency)', type: 'color', def: () => '#000000' },
  { k: 'audio', label: 'Include audio track', type: 'check', def: (m) => !!m.audio, show: (o, m) => !!m.audio }
];
const MD_STILL_Q = { k: 'quality', label: 'Quality', type: 'range', min: 1, max: 100, step: 1, def: () => 80 };
const MD_FRAME_PICK = { k: 'frame', label: 'Frame', type: 'number', min: 1, def: (m) => m.cur + 1, hint: 'Still formats export one frame' };

const MEDIA_TOOLS = [
  { group: 'Create', tools: [
    { id: 'open', icon: '📂', name: 'Open media', kind: 'create', desc: 'GIF, APNG, animated WebP/AVIF, MP4/WebM/MOV video or any still image. Drop or paste files anywhere here.', action: 'Choose file…', accept: 'image/*,video/*,.gif,.apng,.webp,.avif,.mp4,.webm,.mov,.m4v,.mkv' },
    { id: 'maker', icon: '🧩', name: 'Animation maker', kind: 'create', desc: 'Combine images into one animation. Files are ordered by name — reorder in the frame strip afterwards.', action: 'Choose images…', accept: 'image/*', multiple: true, fields: [
      { k: 'delay', label: 'Delay per frame (ms)', type: 'number', min: 20, max: 60000, def: () => 200 },
      { k: 'size', label: 'Canvas size', type: 'select', options: [['first', 'Same as first image'], ['largest', 'Largest image'], ['custom', 'Custom']], def: () => 'first' },
      { k: 'width', label: 'Width', type: 'number', min: 1, max: 4096, def: () => 480, show: (o) => o.size === 'custom' },
      { k: 'height', label: 'Height', type: 'number', min: 1, max: 4096, def: () => 480, show: (o) => o.size === 'custom' },
      { k: 'fit', label: 'Fit', type: 'select', options: [['contain', 'Contain (letterbox)'], ['cover', 'Cover (crop)'], ['stretch', 'Stretch'], ['none', 'Original size, centred']], def: () => 'contain' },
      { k: 'transparent', label: 'Transparent background', type: 'check', def: () => true },
      { k: 'bg', label: 'Background', type: 'color', def: () => '#ffffff', show: (o) => !o.transparent }] },
    { id: 'video', icon: '🎬', name: 'Video to animation', kind: 'create', desc: 'Pick a clip, then the range, frame rate and size. Audio is kept for MP4/WebM export.', action: 'Choose video…', accept: 'video/*,.mp4,.webm,.mov,.m4v,.mkv,.ogv', fields: [
      { k: 'start', label: 'Start (s)', type: 'number', min: 0, step: 0.1, def: () => 0 },
      { k: 'end', label: 'End (s)', type: 'number', min: 0, step: 0.1, def: (m, a) => Utils.round(Math.min(a.pendingVideo?.duration || 5, 5), 2) },
      { k: 'setStart', label: 'Start ← video playhead', type: 'button', run: (a) => a.mediaVideoMark('start') },
      { k: 'setEnd', label: 'End ← video playhead', type: 'button', run: (a) => a.mediaVideoMark('end') },
      { k: 'fps', label: 'Frame rate', type: 'select', options: [[5, '5 fps'], [8, '8 fps'], [10, '10 fps'], [12, '12 fps'], [15, '15 fps'], [20, '20 fps'], [25, '25 fps'], [30, '30 fps']], def: () => 10 },
      { k: 'width', label: 'Width (px)', type: 'number', min: 16, max: 1920, def: (m, a) => Math.min(480, a.pendingVideo?.width || 480) },
      { k: 'audio', label: 'Keep audio', type: 'check', def: () => true }] },
    { id: 'sprite', icon: '🔲', name: 'Sprite sheet cutter', kind: 'create', desc: 'Slice a sprite-sheet grid into animation frames.', action: 'Choose sprite sheet…', accept: 'image/*', fields: [
      { k: 'cols', label: 'Columns', type: 'number', min: 1, max: 100, def: () => 4 },
      { k: 'rows', label: 'Rows', type: 'number', min: 1, max: 100, def: () => 4 },
      { k: 'count', label: 'Frame count (0 = all cells)', type: 'number', min: 0, def: () => 0 },
      { k: 'delay', label: 'Delay (ms)', type: 'number', min: 20, def: () => 100 }] },
    { id: 'design', icon: '✏️', name: 'From Design animation', kind: 'create', desc: 'Render a timeline from the Design section into frames (selected layers, or all visible layers).', action: 'Render frames', fields: [
      { k: 'anim', label: 'Animation', type: 'select', options: (m, a) => a.model.animations.map(x => [x.id, x.name]), def: (m, a) => a.model.activeAnimationId },
      { k: 'fps', label: 'Frame rate', type: 'select', options: [[10, '10'], [12, '12'], [15, '15'], [20, '20'], [24, '24'], [30, '30']], def: () => 15 },
      { k: 'max', label: 'Max size (px)', type: 'number', min: 16, max: 2048, def: () => 480 },
      { k: 'transparent', label: 'Transparent background', type: 'check', def: () => false },
      { k: 'bg', label: 'Background', type: 'color', def: (m, a) => a.model.page?.bg || '#ffffff', show: (o) => !o.transparent }] }
  ] },
  { group: 'Edit', needs: true, tools: [
    { id: 'resize', icon: '↔️', name: 'Resize', kind: 'op', fields: [
      { k: 'w', label: 'Width', type: 'number', min: 1, max: 8192, def: (m) => m.width },
      { k: 'h', label: 'Height', type: 'number', min: 1, max: 8192, def: (m) => m.height },
      { k: 'lock', label: 'Keep aspect ratio', type: 'check', def: () => true },
      { k: 'pct', label: 'Quick scale', type: 'select', options: [['', '—'], [25, '25%'], [50, '50%'], [75, '75%'], [150, '150%'], [200, '200%']], def: () => '' },
      { k: 'smooth', label: 'Smooth (off = pixel art)', type: 'check', def: () => true }],
      link(o, k, m) {
        if (k === 'pct' && o.pct) { o.w = Math.max(1, Math.round(m.width * o.pct / 100)); o.h = Math.max(1, Math.round(m.height * o.pct / 100)); o.pct = ''; }
        if (o.lock && k === 'w') o.h = Math.max(1, Math.round(o.w * m.height / m.width));
        if (o.lock && k === 'h') o.w = Math.max(1, Math.round(o.h * m.width / m.height));
      },
      apply: (f, o) => ({ frames: Media.resize(f, o.w, o.h, o.smooth) }) },
    { id: 'crop', icon: '✂️', name: 'Crop', kind: 'op', stage: 'rect', overlayOnly: true, desc: 'Drag on the preview to select the area.', fields: [
      { k: 'aspect', label: 'Aspect', type: 'select', options: [['free', 'Free'], ['1', '1:1'], ['1.3333', '4:3'], ['1.7778', '16:9'], ['0.5625', '9:16'], ['0.8', '4:5']], def: () => 'free' },
      { k: 'x', label: 'X', type: 'number', min: 0, def: () => 0 }, { k: 'y', label: 'Y', type: 'number', min: 0, def: () => 0 },
      { k: 'w', label: 'Width', type: 'number', min: 1, def: (m) => m.width }, { k: 'h', label: 'Height', type: 'number', min: 1, def: (m) => m.height },
      { k: 'trim', label: 'Auto-trim transparent / flat borders', type: 'button', run: (a) => a.mediaAutoTrim() }],
      link(o, k, m) {
        const r = parseFloat(o.aspect);
        if (r && k !== 'h') o.h = Math.max(1, Math.round(o.w / r));
        if (r && k === 'h') o.w = Math.max(1, Math.round(o.h * r));
        o.x = Utils.clamp(o.x, 0, m.width - 1); o.y = Utils.clamp(o.y, 0, m.height - 1);
        o.w = Utils.clamp(o.w, 1, m.width - o.x); o.h = Utils.clamp(o.h, 1, m.height - o.y);
      },
      apply: (f, o) => ({ frames: Media.crop(f, o) }) },
    { id: 'rotate', icon: '🔄', name: 'Rotate & flip', kind: 'op', fields: [
      { k: 'angle', label: 'Rotate', type: 'select', options: [[0, 'None'], [90, '90° clockwise'], [180, '180°'], [270, '90° counter-clockwise'], ['custom', 'Custom…']], def: () => 0 },
      { k: 'deg', label: 'Degrees', type: 'number', min: -360, max: 360, def: () => 15, show: (o) => o.angle === 'custom' },
      { k: 'flipH', label: 'Flip horizontal', type: 'check', def: () => false },
      { k: 'flipV', label: 'Flip vertical', type: 'check', def: () => false },
      { k: 'transparent', label: 'Transparent corners', type: 'check', def: () => true, show: (o) => o.angle === 'custom' },
      { k: 'bg', label: 'Corner colour', type: 'color', def: () => '#ffffff', show: (o) => o.angle === 'custom' && !o.transparent }],
      apply: (f, o) => ({ frames: Media.rotate(f, o.angle === 'custom' ? +o.deg : +o.angle, o.angle === 'custom' && !o.transparent ? o.bg : 'transparent', o.flipH, o.flipV) }) },
    { id: 'cut', icon: '🗂', name: 'Cut / trim frames', kind: 'op', structural: true, fields: [
      { k: 'mode', label: 'Mode', type: 'select', options: [['keep', 'Keep only this range'], ['remove', 'Remove this range']], def: () => 'keep' }, ...MD_RANGE],
      summary: (o, m) => { const r = MediaUI.range(o, m); const n = o.mode === 'keep' ? r.to - r.from + 1 : m.frames.length - (r.to - r.from + 1); return `${m.frames.length} → ${n} frames`; },
      apply(f, o, m) {
        const r = MediaUI.range(o, m);
        const t = (i) => f.slice(0, i).reduce((s, x) => s + x.delay, 0) / 1000;
        if (o.mode === 'keep') return { frames: f.slice(r.from, r.to + 1), audio: Media.audioSlice(m.audio, t(r.from), t(r.to + 1)) };
        const keep = f.filter((_, i) => i < r.from || i > r.to);
        if (!keep.length) throw Object.assign(new Error('That would remove every frame'), { name: 'LimitError' });
        const a = m.audio ? MediaUI.audioJoin(Media.audioSlice(m.audio, 0, t(r.from)), Media.audioSlice(m.audio, t(r.to + 1), Infinity)) : null;
        return { frames: keep, audio: a };
      } },
    { id: 'speed', icon: '⏩', name: 'Speed', kind: 'op', structural: true, fields: [
      { k: 'pct', label: 'Speed %', type: 'range', min: 10, max: 500, step: 5, def: () => 100, hint: '200% = twice as fast' },
      { k: 'drop', label: 'Drop frames when delays get below 20 ms (browsers slow those down)', type: 'check', def: () => true }],
      summary: (o, m) => { const d = Media.duration(m.frames); return `Duration ${(d / 1000).toFixed(2)} s → ${(d / o.pct * 100 / 1000).toFixed(2)} s`; },
      apply(f, o, m) {
        const k = o.pct / 100;
        let frames = f.map(x => ({ canvas: x.canvas, delay: x.delay / k }));
        if (o.drop && frames.some(x => x.delay < 20)) {
          const out = []; let acc = 0;
          for (const x of frames) { acc += x.delay; if (acc >= 20) { out.push({ canvas: x.canvas, delay: acc }); acc = 0; } }
          if (acc && out.length) out[out.length - 1].delay += acc;
          frames = out.length ? out : [frames[0]];
        }
        frames.forEach(x => { x.delay = Math.max(10, Math.round(x.delay)); });
        return { frames, audio: Media.audioSpeed(m.audio, k) };
      } },
    { id: 'reverse', icon: '⏪', name: 'Reverse / ping-pong', kind: 'op', structural: true, fields: [
      { k: 'mode', label: 'Mode', type: 'select', options: [['reverse', 'Reverse'], ['pingpong', 'Ping-pong (forward then back)'], ['boomerang', 'Ping-pong without repeated end frames']], def: () => 'reverse' }],
      summary: (o, m) => `${m.frames.length} → ${o.mode === 'reverse' ? m.frames.length : o.mode === 'pingpong' ? m.frames.length * 2 : Math.max(1, m.frames.length * 2 - 2)} frames`,
      apply(f, o, m) {
        const rev = f.slice().reverse();
        if (o.mode === 'reverse') return { frames: rev, audio: Media.audioReverse(m.audio) };
        return { frames: o.mode === 'pingpong' ? [...f, ...rev] : [...f, ...rev.slice(1, -1)], audio: m.audio ? MediaUI.audioJoin(m.audio, Media.audioReverse(m.audio)) : null };
      } },
    { id: 'timing', icon: '⏱', name: 'Frame delays & loop', kind: 'op', structural: true, desc: 'Per-frame delays can also be edited under each thumbnail.', fields: [
      { k: 'delay', label: 'Set every delay to (ms, 0 = keep)', type: 'number', min: 0, max: 60000, def: () => 0 },
      { k: 'last', label: 'Extra pause on last frame (ms)', type: 'number', min: 0, max: 60000, def: () => 0 },
      MD_LOOP],
      summary: (o, m) => `Loop: ${+o.loop ? `${o.loop}×` : 'forever'} · total ${((o.delay ? o.delay * m.frames.length : Media.duration(m.frames)) / 1000 + o.last / 1000).toFixed(2)} s`,
      apply: (f, o) => ({ frames: f.map((x, i) => ({ canvas: x.canvas, delay: (+o.delay || x.delay) + (i === f.length - 1 ? +o.last : 0) })), loop: +o.loop }) },
    { id: 'skip', icon: '⏭', name: 'Frame skip (reduce frames)', kind: 'op', structural: true, fields: [
      { k: 'n', label: 'Keep every Nth frame', type: 'number', min: 2, max: 20, def: () => 2 },
      { k: 'merge', label: 'Merge delays (keep the same speed)', type: 'check', def: () => true }],
      summary: (o, m) => `${m.frames.length} → ${Math.ceil(m.frames.length / Math.max(2, o.n))} frames`,
      apply(f, o) {
        const n = Math.max(2, Math.round(o.n)), out = [];
        f.forEach((x, i) => { if (i % n === 0) out.push({ canvas: x.canvas, delay: x.delay }); else if (o.merge) out[out.length - 1].delay += x.delay; });
        return { frames: out };
      } },
    { id: 'text', icon: '🔤', name: 'Add text', kind: 'op', stage: 'point', desc: 'Click the preview to position the text.', fields: [
      { k: 'text', label: 'Text', type: 'textarea', def: () => 'Your caption' },
      { k: 'font', label: 'Font', type: 'select', options: MD_FONTS, def: () => MD_FONTS[1][0] },
      { k: 'size', label: 'Size', type: 'number', min: 6, max: 400, def: (m) => Math.max(12, Math.round(m.height / 9)) },
      { k: 'color', label: 'Fill', type: 'color', def: () => '#ffffff' },
      { k: 'stroke', label: 'Outline', type: 'color', def: () => '#000000' },
      { k: 'strokeWidth', label: 'Outline width', type: 'number', min: 0, max: 40, def: () => 2 },
      { k: 'x', label: 'X', type: 'number', def: (m) => Math.round(m.width / 2) },
      { k: 'y', label: 'Y', type: 'number', def: (m) => Math.round(m.height * 0.85) }, ...MD_RANGE],
      apply: (f, o, m) => ({ frames: Media.text(f, { ...o, ...MediaUI.range(o, m, true) }) }) },
    { id: 'overlay', icon: '🖼', name: 'Overlay image', kind: 'op', stage: 'point', desc: 'Watermark or sticker. Click the preview to place it (top-left corner).', fields: [
      { k: 'img', label: 'Image', type: 'file', accept: 'image/*' },
      { k: 'scale', label: 'Scale %', type: 'range', min: 5, max: 300, step: 5, def: () => 100 },
      { k: 'opacity', label: 'Opacity %', type: 'range', min: 5, max: 100, step: 5, def: () => 100 },
      { k: 'x', label: 'X', type: 'number', def: () => 10 }, { k: 'y', label: 'Y', type: 'number', def: () => 10 }, ...MD_RANGE],
      apply(f, o, m) { if (!o.img) throw Object.assign(new Error('Choose an overlay image first (Overlay image › Choose…)'), { name: 'LimitError' }); return { frames: Media.overlay(f, o.img, { ...o, ...MediaUI.range(o, m, true) }) }; } },
    { id: 'censor', icon: '🙈', name: 'Censor / blur area', kind: 'op', stage: 'rect', desc: 'Drag on the preview to pick the area.', fields: [
      { k: 'mode', label: 'Style', type: 'select', options: [['blur', 'Blur'], ['pixelate', 'Pixelate'], ['black', 'Black box']], def: () => 'pixelate' },
      { k: 'strength', label: 'Strength', type: 'range', min: 2, max: 40, step: 1, def: () => 12, show: (o) => o.mode !== 'black' },
      { k: 'x', label: 'X', type: 'number', min: 0, def: (m) => Math.round(m.width / 4) }, { k: 'y', label: 'Y', type: 'number', min: 0, def: (m) => Math.round(m.height / 4) },
      { k: 'w', label: 'Width', type: 'number', min: 1, def: (m) => Math.round(m.width / 2) }, { k: 'h', label: 'Height', type: 'number', min: 1, def: (m) => Math.round(m.height / 2) }, ...MD_RANGE],
      apply(f, o, m) { const r = MediaUI.range(o, m, true); return { frames: Media.censor(f, o, o.mode, +o.strength, r.from, r.to) }; } },
    { id: 'effects', icon: '🎨', name: 'Effects & filters', kind: 'op', fields: [
      { k: 'preset', label: 'Preset', type: 'select', options: Object.keys(MD_FX_PRESETS).map(k => [k, k[0].toUpperCase() + k.slice(1)]), def: () => 'none' },
      ...[['brightness', 0, 200, 100], ['contrast', 0, 200, 100], ['saturate', 0, 300, 100], ['hue', -180, 180, 0], ['grayscale', 0, 100, 0], ['sepia', 0, 100, 0], ['invert', 0, 100, 0], ['blur', 0, 20, 0], ['pixelate', 1, 40, 1], ['posterize', 0, 16, 0], ['threshold', 0, 255, 0], ['sharpen', 0, 100, 0], ['noise', 0, 100, 0], ['vignette', 0, 100, 0], ['tintAmount', 0, 100, 0]]
        .map(([k, min, max, d]) => ({ k, label: k === 'tintAmount' ? 'Tint %' : k[0].toUpperCase() + k.slice(1), type: 'range', min, max, step: 1, def: () => d })),
      { k: 'tint', label: 'Tint colour', type: 'color', def: () => '#ff8800', show: (o) => o.tintAmount > 0 }],
      link(o, k) { if (k === 'preset') Object.assign(o, MD_FX_PRESETS.none, MD_FX_PRESETS[o.preset]); },
      apply: (f, o) => ({ frames: Media.effects(f, o) }) },
    { id: 'transparency', icon: '🫥', name: 'Transparency', kind: 'op', stage: 'color', desc: 'Click the preview to pick the colour.', fields: [
      { k: 'mode', label: 'Mode', type: 'select', options: [['remove', 'Make a colour transparent'], ['flatten', 'Fill transparency with a colour']], def: () => 'remove' },
      { k: 'color', label: 'Colour', type: 'color', def: () => '#ffffff' },
      { k: 'fuzz', label: 'Fuzz %', type: 'range', min: 0, max: 60, step: 1, def: () => 10, show: (o) => o.mode === 'remove' }],
      apply: (f, o) => ({ frames: Media.transparency(f, o) }) }
  ] },
  { group: 'Optimize', needs: true, tools: [
    { id: 'optgif', icon: '🗜', name: 'GIF optimizer', kind: 'out', fmt: 'gif', desc: 'Lossy compression, colour reduction and transparency optimisation. Compare size against the source below.' },
    { id: 'compress', icon: '📉', name: 'Image compressor', kind: 'out', fmtSelect: ['png8', 'jpeg', 'webpstill', 'avif', 'png'], desc: 'Compress the current frame as a still image.' },
    { id: 'optvideo', icon: '📼', name: 'Video compressor', kind: 'out', fmtSelect: ['mp4', 'webm'], desc: 'Re-encode as MP4/WebM with a lower bitrate and/or size.' }
  ] },
  { group: 'Convert & export', needs: true, tools: [
    { id: 'x-gif', icon: 'GIF', name: 'Animated GIF', kind: 'out', fmt: 'gif' },
    { id: 'x-apng', icon: 'PNG', name: 'Animated PNG', kind: 'out', fmt: 'apng' },
    { id: 'x-webp', icon: 'WBP', name: 'Animated WebP', kind: 'out', fmt: 'webp' },
    { id: 'x-mp4', icon: 'MP4', name: 'MP4 video', kind: 'out', fmt: 'mp4' },
    { id: 'x-webm', icon: 'WBM', name: 'WebM video', kind: 'out', fmt: 'webm' },
    { id: 'x-zip', icon: 'ZIP', name: 'Split to frames (ZIP)', kind: 'out', fmt: 'zip' },
    { id: 'x-sheet', icon: '▦', name: 'Sprite sheet', kind: 'out', fmt: 'sheet' },
    { id: 'x-still', icon: 'IMG', name: 'Still image', kind: 'out', fmtSelect: ['png', 'jpeg', 'webpstill', 'avif', 'png8'] },
    { id: 'x-uri', icon: '64', name: 'Data URI (base64)', kind: 'out', fmt: 'datauri' }
  ] }
];

/** Small static helpers shared by tool definitions. */
const MediaUI = {
  tool(id) { for (const g of MEDIA_TOOLS) for (const t of g.tools) if (t.id === id) return t; return null; },
  /** 1-based UI range → 0-based inclusive range; `local` shifts it for single-frame previews. */
  range(o, m, local = false) {
    const n = m.frames.length;
    let from = Utils.clamp(Math.round(o.from || 1), 1, n) - 1, to = Utils.clamp(Math.round(o.to || n), 1, n) - 1;
    if (to < from) [from, to] = [to, from];
    if (local && m.offset != null) { from -= m.offset; to -= m.offset; }
    return { from, to };
  },
  audioJoin(a, b) {
    if (!a) return b; if (!b) return a;
    return { sampleRate: a.sampleRate, channels: a.channels.map((c, i) => { const d = b.channels[Math.min(i, b.channels.length - 1)], o = new Float32Array(c.length + d.length); o.set(c); o.set(d, c.length); return o; }) };
  },
  fields(tool) {
    if (tool.kind !== 'out') return tool.fields || [];
    const fmt = tool.fmt;
    const pick = tool.fmtSelect ? [{ k: 'fmt', label: 'Format', type: 'select', options: tool.fmtSelect.filter(f => f !== 'avif' || Media.supportsEncode('image/avif')).map(f => [f, MD_FORMATS[f].label]), def: () => tool.fmtSelect[0] }] : [];
    const per = (f) => [...(MD_FORMATS[f].fields || []), ...(MD_FORMATS[f].video ? MD_VIDEO_FIELDS : []), ...(['jpeg', 'webpstill', 'avif'].includes(f) ? [MD_STILL_Q] : []), ...(MD_FORMATS[f].still ? [MD_FRAME_PICK] : [])];
    if (fmt) return per(fmt);
    // union of all selectable formats' fields, each shown only for its own format
    const seen = new Set(), out = [...pick];
    for (const f of tool.fmtSelect) for (const fd of per(f)) {
      const key = `${fd.k}`;
      if (seen.has(key)) { const prev = out.find(x => x.k === key); prev._fmts.push(f); continue; }
      seen.add(key);
      const copy = { ...fd, _fmts: [f] };
      const inner = fd.show;
      copy.show = (o, m) => copy._fmts.includes(o.fmt) && (!inner || inner(o, m));
      out.push(copy);
    }
    return out;
  }
};

const MediaMixin = {
  bindMedia() {
    const ws = document.getElementById('media-workspace');
    ws.innerHTML = `
      <aside class="md-side" aria-label="Media tools">${MEDIA_TOOLS.map(g => `
        <div class="md-group" data-needs="${g.needs ? 1 : 0}"><div class="md-group-title">${g.group}</div>
        ${g.tools.map(t => `<button class="md-tool" data-tool="${t.id}" title="${Utils.escapeHtml(t.desc || t.name)}"><span class="md-ico">${t.icon}</span><span>${t.name}</span></button>`).join('')}</div>`).join('')}
      </aside>
      <section class="md-center">
        <div class="md-toolbar">
          <span id="md-title" class="md-title">No media</span>
          <span id="md-save-state" class="md-save-state" role="status"></span>
          <span class="md-spacer"></span>
          <button id="md-undo" class="btn-ghost" title="Undo (Ctrl+Z)" disabled>↶ Undo</button>
          <button id="md-redo" class="btn-ghost" title="Redo (Ctrl+Shift+Z)" disabled>↷ Redo</button>
          <button id="md-revert" class="btn-ghost" title="Back to the file as opened" disabled>Revert</button>
          <button id="md-zoom" class="btn-ghost" title="Toggle fit / 100%">Fit</button>
          <button id="md-to-design" class="btn-ghost" title="Place the current frame on the Design canvas" disabled>Send frame to Design</button>
        </div>
        <div id="md-stage-wrap" class="md-stage-wrap">
          <div id="md-drop" class="md-drop"><div class="md-drop-ico">⬆</div><b>Drop a GIF, video or images here</b><span>or paste, or pick a Create tool on the left</span><button id="md-drop-open" class="btn-primary">Open media…</button><small>Everything runs locally in your browser — nothing is uploaded. Your session is kept in this browser.</small><div id="md-restore" class="md-restore" hidden></div></div>
          <div id="md-stage-box" class="md-stage-box" hidden><canvas id="md-stage"></canvas><canvas id="md-overlay"></canvas></div>
          <video id="md-video" class="md-video" controls muted playsinline hidden></video>
          <div id="md-preview-tag" class="md-preview-tag" hidden>Preview</div>
        </div>
        <div class="md-playbar">
          <button id="md-prev" class="btn-ghost" title="Previous frame (←)">⏮</button>
          <button id="md-play" class="btn-ghost" title="Play / pause (Space)">▶</button>
          <button id="md-next" class="btn-ghost" title="Next frame (→)">⏭</button>
          <span id="md-pos" class="md-pos">—</span>
          <span class="md-spacer"></span>
          <button id="md-f-add" class="btn-ghost" title="Append images as frames">+ Frames</button>
          <button id="md-f-dup" class="btn-ghost" title="Duplicate frame">Duplicate</button>
          <button id="md-f-left" class="btn-ghost" title="Move frame left">◀</button>
          <button id="md-f-right" class="btn-ghost" title="Move frame right">▶</button>
          <button id="md-f-del" class="btn-ghost" title="Delete frame (Del)">Delete</button>
        </div>
        <div id="md-strip" class="md-strip" role="listbox" aria-label="Frames"></div>
      </section>
      <aside class="md-panel">
        <div class="md-card"><div class="md-tool-head"><span id="md-tool-ico" class="md-ico"></span><h3 id="md-tool-name"></h3></div><p id="md-tool-desc" class="md-desc"></p>
          <div id="md-fields" class="md-fields"></div>
          <div id="md-summary" class="md-summary" hidden></div>
          <div id="md-progress" class="md-progress" hidden><div><i></i></div><button id="md-cancel" class="btn-ghost">Cancel</button></div>
          <div class="md-actions"><button id="md-reset" class="btn-ghost">Reset options</button><button id="md-run" class="btn-primary">Apply</button></div>
        </div>
        <div id="md-result" class="md-card md-result" hidden></div>
        <div class="md-card"><div class="md-card-title">Source</div><dl id="md-info" class="md-info"><dt>—</dt><dd>Nothing loaded</dd></dl></div>
      </aside>
      <input type="file" id="md-file" hidden>`;
    const $ = (id) => document.getElementById(id);
    this.media = { frames: [], cur: 0, history: [], future: [], tool: 'open', opts: {}, zoom: 'fit', playing: false, width: 0, height: 0, loop: 0, audio: null };
    ws.querySelectorAll('.md-tool').forEach(b => b.addEventListener('click', () => this.mediaSelectTool(b.dataset.tool)));
    $('md-drop-open').addEventListener('click', () => this.mediaPick(MediaUI.tool('open')));
    $('md-run').addEventListener('click', () => this.mediaRun());
    $('md-reset').addEventListener('click', () => { this.media.opts[this.media.tool] = null; this.mediaRenderTool(); });
    $('md-cancel').addEventListener('click', () => { this.media.cancel = true; });
    $('md-undo').addEventListener('click', () => this.mediaUndo());
    $('md-redo').addEventListener('click', () => this.mediaRedo());
    $('md-revert').addEventListener('click', () => { if (this.media.original) { this.mediaPush('Revert to original'); this.mediaSetClip(this.media.original, false); Utils.toast('Reverted to the original', '↩️'); } });
    $('md-zoom').addEventListener('click', () => { this.media.zoom = this.media.zoom === 'fit' ? '1' : 'fit'; $('md-zoom').textContent = this.media.zoom === 'fit' ? 'Fit' : '100%'; $('md-stage-wrap').classList.toggle('actual', this.media.zoom !== 'fit'); this.mediaLayoutStage(); });
    window.addEventListener('resize', () => { if (this.section === 'media') this.mediaLayoutStage(); });
    $('md-to-design').addEventListener('click', () => this.mediaSendToDesign());
    $('md-play').addEventListener('click', () => this.mediaPlay(!this.media.playing));
    $('md-prev').addEventListener('click', () => this.mediaGo(this.media.cur - 1));
    $('md-next').addEventListener('click', () => this.mediaGo(this.media.cur + 1));
    $('md-f-add').addEventListener('click', () => this.mediaPick({ id: 'append', accept: 'image/*', multiple: true }));
    $('md-f-dup').addEventListener('click', () => this.mediaFrameOp('dup'));
    $('md-f-del').addEventListener('click', () => this.mediaFrameOp('del'));
    $('md-f-left').addEventListener('click', () => this.mediaFrameOp('left'));
    $('md-f-right').addEventListener('click', () => this.mediaFrameOp('right'));
    $('md-file').addEventListener('change', (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) this.mediaFiles(files, this.media.pickFor); });
    // drop / paste
    const wrap = ws;
    wrap.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); ws.classList.add('dragging'); } });
    wrap.addEventListener('dragleave', (e) => { if (!ws.contains(e.relatedTarget)) ws.classList.remove('dragging'); });
    wrap.addEventListener('drop', (e) => {
      ws.classList.remove('dragging');
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      if (e.target.closest?.('#md-strip') && this.media.frames.length) this.mediaFiles(files, { id: 'append' });
      else this.mediaFiles(files, files.length > 1 ? MediaUI.tool('maker') : MediaUI.tool('open'));
    });
    // stage interaction (rect / point / colour pick)
    const ov = $('md-overlay');
    ov.addEventListener('pointerdown', (e) => this.mediaStagePointer(e, 'down'));
    ov.addEventListener('pointermove', (e) => this.mediaStagePointer(e, 'move'));
    ov.addEventListener('pointerup', (e) => this.mediaStagePointer(e, 'up'));
    document.addEventListener('keydown', (e) => this.mediaKey(e));
    // never lose Media work silently: flush the pending save, warn if it can't be saved (UX-15)
    window.addEventListener('beforeunload', (e) => {
      const m = this.media;
      if (!m?.frames.length) return;
      if (m.dirty) { clearTimeout(this._mdSaveT); this.mediaPersist(); }
      if (m.persistFailed || m.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    $('md-video').addEventListener('timeupdate', () => { const v = $('md-video'); $('md-pos').textContent = `Video ${v.currentTime.toFixed(2)} s / ${(v.duration || 0).toFixed(2)} s`; });
    this.mediaSelectTool('open');
  },

  enterMedia() {
    if (!this.media) this.bindMedia();
    this.mediaRenderAll();
    this.mediaOfferRestore();
  },

  // ------------------------------------------------------------------ state
  mediaHasClip() { return !!(this.media && this.media.frames.length); },
  mediaClip() { const m = this.media; return { frames: m.frames, loop: m.loop, audio: m.audio }; },
  mediaSetClip(c, resetCur = true) {
    const m = this.media;
    m.frames = c.frames; m.loop = c.loop || 0; m.audio = c.audio ?? null;
    m.width = m.frames[0]?.canvas.width || 0; m.height = m.frames[0]?.canvas.height || 0;
    if (resetCur) m.cur = 0;
    m.cur = Utils.clamp(m.cur, 0, Math.max(0, m.frames.length - 1));
    m.opts = { ...m.opts }; // keep chosen options, but size-dependent defaults are refreshed below
    for (const k of ['resize', 'crop', 'censor', 'text', 'cut', 'overlay', 'x-sheet']) m.opts[k] = null;
    this.mediaRenderAll();
    this.mediaMarkDirty();
  },

  // ------------------------------------------------------------------ session persistence (UX-15)
  /** Every clip change is saved to browser storage shortly after, so a reload or closed tab loses nothing. */
  mediaMarkDirty() {
    const m = this.media;
    if (!m || !m.frames.length) return;
    m.dirty = true;
    clearTimeout(this._mdSaveT);
    this._mdSaveT = setTimeout(() => this.mediaPersist(), 1200);
  },
  async mediaPersist() {
    const m = this.media, token = (this._mdSaveToken = (this._mdSaveToken || 0) + 1);
    if (!m.frames.length) return;
    try {
      if (!(await Store.open())) throw new Error('IndexedDB unavailable');
      const frames = [];
      for (let i = 0; i < m.frames.length; i++) {
        frames.push({ blob: await Media.toBlob(m.frames[i].canvas, 'image/png'), delay: m.frames[i].delay });
        if (token !== this._mdSaveToken) return; // a newer change will save instead
        if (i % 10 === 9) await Media.yieldUI();
      }
      const audio = m.audio && Media.audioDuration(m.audio) <= 120 ? m.audio : null;
      const ok = await Store.set(MEDIA_SESSION_KEY, { v: 1, name: m.name, srcFormat: m.srcFormat, srcSize: m.srcSize, loop: m.loop, frames, audio, savedAt: Date.now(), tool: m.tool });
      if (token !== this._mdSaveToken) return;
      if (ok === false) throw new Error('storage refused');
      m.dirty = false;
      if (m.persistFailed) { m.persistFailed = false; Utils.toast('Media session is being saved again', '✅'); }
      this.mediaRenderSaveState();
    } catch (e) {
      console.warn('Media session save failed', e);
      if (!m.persistFailed) Utils.toast('Could not save the Media session in this browser (storage full?). Export your result before closing the tab.', '⚠️', { duration: 8000 });
      m.persistFailed = true;
      this.mediaRenderSaveState();
    }
  },
  mediaRenderSaveState() {
    const el = document.getElementById('md-save-state'), m = this.media;
    if (!el) return;
    el.textContent = !m.frames.length ? '' : m.persistFailed ? 'Not saved' : m.dirty ? 'Saving…' : 'Saved in this browser';
    el.classList.toggle('warn', !!m.persistFailed);
  },
  async mediaOfferRestore() {
    const m = this.media;
    if (m.frames.length || m.restoreOffered) return;
    m.restoreOffered = true;
    const s = await Store.get(MEDIA_SESSION_KEY).catch(() => null);
    if (!s || !s.frames?.length || m.frames.length) return;
    const box = document.getElementById('md-restore');
    box.hidden = false;
    box.innerHTML = `<b>Continue where you left off?</b><span>${Utils.escapeHtml(s.name || 'Media')} · ${s.frames.length} frame${s.frames.length > 1 ? 's' : ''} · saved ${new Date(s.savedAt).toLocaleString()}</span><div class="md-actions"><button class="btn-ghost" data-rs="discard">Discard</button><button class="btn-primary" data-rs="restore">Restore</button></div>`;
    box.querySelector('[data-rs="discard"]').addEventListener('click', () => { box.hidden = true; Store.set(MEDIA_SESSION_KEY, null); });
    box.querySelector('[data-rs="restore"]').addEventListener('click', () => this.mediaBusy(async () => {
      const frames = [];
      for (const f of s.frames) {
        const bmp = await createImageBitmap(f.blob);
        const c = Media.canvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close?.();
        frames.push({ canvas: c, delay: f.delay });
      }
      box.hidden = true;
      this.mediaLoad({ frames, width: frames[0].canvas.width, height: frames[0].canvas.height, loop: s.loop || 0, audio: s.audio || null, source: s.srcFormat }, { name: s.name, size: s.srcSize, format: s.srcFormat });
      if (s.tool && MediaUI.tool(s.tool)) this.mediaSelectTool(s.tool);
    }));
  },
  /** label = the step this snapshot can undo (shown in the Undo tooltip and feedback, UX-03). */
  mediaPush(label = 'Edit') {
    const m = this.media;
    m.history.push({ ...this.mediaClip(), label });
    if (m.history.length > 8) m.history.shift(); // clips hold full-size canvases — keep memory bounded
    m.future = [];
  },
  mediaUndo() { const m = this.media; if (!m.history.length) return; const prev = m.history.pop(); m.future.push({ ...this.mediaClip(), label: prev.label }); this.mediaSetClip(prev, false); this.historyFeedback?.('Undo', prev.label, 'Media'); },
  mediaRedo() { const m = this.media; if (!m.future.length) return; const next = m.future.pop(); m.history.push({ ...this.mediaClip(), label: next.label }); this.mediaSetClip(next, false); this.historyFeedback?.('Redo', next.label, 'Media'); },
  mediaLoad(dec, meta) {
    const m = this.media;
    this.mediaPlay(false);
    m.history = []; m.future = [];
    m.name = meta.name || 'media'; m.srcType = meta.type || dec.source || ''; m.srcSize = meta.size ?? null; m.srcFormat = meta.format || dec.source || '';
    m.original = { frames: dec.frames, loop: dec.loop || 0, audio: dec.audio || null };
    m.result = null;
    this.mediaHideVideo();
    this.mediaSetClip(m.original);
    if (m.tool === 'open' || MediaUI.tool(m.tool)?.kind === 'create') this.mediaSelectTool(dec.frames.length > 1 ? 'optgif' : 'compress');
    const est = dec.frames.length * dec.width * dec.height * 4;
    Utils.toast(`Loaded ${m.name} — ${dec.frames.length} frame${dec.frames.length > 1 ? 's' : ''}, ${dec.width}×${dec.height}${dec.audio ? ', with audio' : ''}`, '🎞');
    if (est > 600 * 1048576) setTimeout(() => Utils.toast('Very large clip — consider Resize or Frame skip first to keep the browser responsive', '⚠️'), 400);
  },

  // ------------------------------------------------------------------ tools & options
  mediaSelectTool(id) {
    const m = this.media;
    const t = MediaUI.tool(id);
    if (!t) return;
    if (t.kind !== 'create' && !this.mediaHasClip()) { Utils.toast('Open or create some media first', 'ℹ️'); return; }
    m.tool = id; m.drag = null;
    if (id !== 'video') this.mediaHideVideo();
    document.querySelectorAll('#media-workspace .md-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
    this.mediaRenderTool();
  },
  mediaOpts(t = MediaUI.tool(this.media.tool)) {
    const m = this.media;
    if (!m.opts[t.id]) {
      const o = {};
      for (const f of MediaUI.fields(t)) if (f.def) o[f.k] = f.def(m, this);
      if (t.id === 'effects') Object.assign(o, MD_FX_PRESETS.none);
      m.opts[t.id] = o;
    }
    return m.opts[t.id];
  },
  mediaRenderTool() {
    const m = this.media, t = MediaUI.tool(m.tool), o = this.mediaOpts(t);
    const $ = (id) => document.getElementById(id);
    $('md-tool-ico').innerHTML = Icons.MEDIA[t.id] ? Icons.svg(Icons.MEDIA[t.id], 18) : Utils.escapeHtml(t.icon || ''); $('md-tool-name').textContent = t.name;
    const fmtDesc = t.fmt && !t.desc ? `Convert the clip to ${MD_FORMATS[t.fmt].label}.` : '';
    $('md-tool-desc').textContent = t.desc || fmtDesc;
    const fields = MediaUI.fields(t);
    const opt = (f) => (typeof f.options === 'function' ? f.options(m, this) : f.options);
    $('md-fields').innerHTML = fields.map(f => {
      const id = `mdf-${f.k}`, v = o[f.k];
      let input;
      if (f.type === 'select') input = `<select id="${id}" data-k="${f.k}">${opt(f).map(([val, lab]) => `<option value="${Utils.escapeHtml(val)}"${String(val) === String(v) ? ' selected' : ''}>${Utils.escapeHtml(lab)}</option>`).join('')}</select>`;
      else if (f.type === 'check') return `<label class="md-field md-check" data-row="${f.k}"><input type="checkbox" id="${id}" data-k="${f.k}"${v ? ' checked' : ''}><span>${f.label}</span></label>`;
      else if (f.type === 'button') return `<div class="md-field" data-row="${f.k}"><button type="button" class="btn-ghost md-fbtn" data-btn="${f.k}">${f.label}</button></div>`;
      else if (f.type === 'range') input = `<div class="md-range"><input type="range" id="${id}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${v}"><output>${v}</output></div>`;
      else if (f.type === 'textarea') input = `<textarea id="${id}" data-k="${f.k}" rows="2">${Utils.escapeHtml(v)}</textarea>`;
      else if (f.type === 'file') input = `<input type="file" id="${id}" data-k="${f.k}" accept="${f.accept || '*'}"><small class="md-hint">${o[f.k] ? `Loaded ${o[f.k].width}×${o[f.k].height}` : ''}</small>`;
      else if (f.type === 'color') input = `<input type="color" id="${id}" data-k="${f.k}" value="${Utils.toHex(v)}">`;
      else input = `<input type="${f.type === 'number' ? 'number' : 'text'}" id="${id}" data-k="${f.k}" value="${Utils.escapeHtml(v)}"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''}${f.step ? ` step="${f.step}"` : ''}>`;
      return `<div class="md-field" data-row="${f.k}"><label for="${id}">${f.label}</label>${input}${f.hint ? `<small class="md-hint">${f.hint}</small>` : ''}</div>`;
    }).join('');
    const box = $('md-fields');
    box.querySelectorAll('[data-k]').forEach(inp => {
      const f = fields.find(x => x.k === inp.dataset.k);
      const ev = f.type === 'range' || f.type === 'text' || f.type === 'textarea' || f.type === 'number' ? 'input' : 'change';
      inp.addEventListener(ev, async () => {
        let v;
        if (f.type === 'check') v = inp.checked;
        else if (f.type === 'file') { v = inp.files[0] ? await this.mediaLoadImage(inp.files[0]).catch(() => null) : null; inp.nextElementSibling.textContent = v ? `Loaded ${v.width}×${v.height}` : 'Could not read that image'; }
        else if (f.type === 'number' || f.type === 'range') { v = inp.value === '' ? o[f.k] : Utils.num(inp.value, o[f.k]); if (f.type === 'range') inp.nextElementSibling.textContent = v; }
        else if (f.type === 'select') { const raw = inp.value; v = /^-?\d+(\.\d+)?$/.test(raw) && f.k !== 'fmt' && f.k !== 'aspect' ? +raw : raw; }
        else v = inp.value;
        o[f.k] = v;
        if (t.link) { t.link(o, f.k, m); this.mediaSyncFields(f.k); }
        this.mediaUpdateVisibility();
        this.mediaSchedulePreview();
      });
    });
    box.querySelectorAll('[data-btn]').forEach(b => b.addEventListener('click', () => fields.find(x => x.k === b.dataset.btn).run(this)));
    $('md-run').textContent = t.kind === 'create' ? (t.id === 'video' && m.pendingVideo ? 'Convert to frames' : t.action) : t.kind === 'out' ? 'Render & compare' : 'Apply';
    $('md-reset').hidden = !fields.length;
    this.mediaUpdateVisibility();
    this.mediaSchedulePreview(0);
  },
  /** Push option values (changed by a link() rule) back into the inputs, except the one being edited. */
  mediaSyncFields(skip) {
    const o = this.mediaOpts();
    document.querySelectorAll('#md-fields [data-k]').forEach(inp => {
      const k = inp.dataset.k;
      if (k === skip || inp.type === 'file') return;
      if (inp.type === 'checkbox') inp.checked = !!o[k];
      else if (inp.type === 'color') inp.value = Utils.toHex(o[k]);
      else { inp.value = o[k]; if (inp.type === 'range') inp.nextElementSibling.textContent = o[k]; }
    });
  },
  mediaUpdateVisibility() {
    const m = this.media, t = MediaUI.tool(m.tool), o = this.mediaOpts(t);
    for (const f of MediaUI.fields(t)) { const row = document.querySelector(`#md-fields [data-row="${f.k}"]`); if (row) row.hidden = !!(f.show && !f.show(o, m)); }
    if (t.id === 'video') document.querySelectorAll('#md-fields [data-row]').forEach(r => { if (!m.pendingVideo) r.hidden = true; });
    const sum = document.getElementById('md-summary');
    sum.hidden = !(t.summary && this.mediaHasClip());
    if (t.summary && this.mediaHasClip()) sum.textContent = t.summary(o, m);
  },

  // ------------------------------------------------------------------ preview
  mediaSchedulePreview(ms = 90) {
    clearTimeout(this._mdPrevT);
    this._mdPrevT = setTimeout(() => this.mediaDrawStage(), ms);
  },
  /** Draw the current frame; for visual edit tools, draw it *with* the pending operation applied. */
  mediaDrawStage() {
    const m = this.media;
    if (!this.mediaHasClip()) return;
    const $ = (id) => document.getElementById(id);
    const f = m.frames[m.cur];
    let show = f.canvas, previewing = false;
    const t = MediaUI.tool(m.tool);
    if (t.kind === 'op' && !t.structural && !t.overlayOnly && !m.playing) {
      try {
        const r = t.apply([f], this.mediaOpts(t), { ...m, offset: m.cur });
        show = r.frames[0].canvas; previewing = true;
      } catch (e) { /* option not ready yet (e.g. no overlay image) */ }
    }
    const st = $('md-stage'), ov = $('md-overlay');
    if (st.width !== show.width || st.height !== show.height) { st.width = show.width; st.height = show.height; }
    const x = st.getContext('2d'); x.clearRect(0, 0, st.width, st.height); x.drawImage(show, 0, 0);
    ov.width = st.width; ov.height = st.height;
    this.mediaLayoutStage();
    $('md-preview-tag').hidden = !previewing;
    this.mediaDrawOverlay();
    $('md-pos').textContent = `Frame ${m.cur + 1} / ${m.frames.length} · ${f.delay} ms · ${(Media.duration(m.frames) / 1000).toFixed(2)} s`;
    document.querySelectorAll('#md-strip .md-thumb').forEach((el, i) => { el.classList.toggle('current', i === m.cur); el.setAttribute('aria-selected', String(i === m.cur)); });
  },
  /** Size the stage box: fit inside the viewport (up to 4× for tiny clips) or 1:1. */
  mediaLayoutStage() {
    const st = document.getElementById('md-stage'), box = document.getElementById('md-stage-box'), wrap = document.getElementById('md-stage-wrap');
    if (!st.width) return;
    const aw = Math.max(40, wrap.clientWidth - 32), ah = Math.max(40, wrap.clientHeight - 32);
    const s = this.media.zoom === 'fit' ? Math.min(4, aw / st.width, ah / st.height) : 1;
    box.style.width = `${Math.round(st.width * s)}px`; box.style.height = `${Math.round(st.height * s)}px`;
    box.classList.toggle('px', s >= 2);
  },
  mediaDrawOverlay() {
    const m = this.media, t = MediaUI.tool(m.tool), ov = document.getElementById('md-overlay');
    const x = ov.getContext('2d'); x.clearRect(0, 0, ov.width, ov.height);
    ov.style.cursor = t.stage === 'rect' ? 'crosshair' : t.stage ? 'copy' : 'default';
    ov.style.pointerEvents = t.stage ? 'auto' : 'none';
    if (t.stage !== 'rect') return;
    const o = this.mediaOpts(t), lw = ov.width / Math.max(1, ov.getBoundingClientRect().width); // 1 screen px
    if (t.id === 'crop') { x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, 0, ov.width, ov.height); x.clearRect(o.x, o.y, o.w, o.h); }
    x.strokeStyle = '#3A8BFF'; x.lineWidth = lw * 1.5; x.setLineDash([lw * 5, lw * 4]); x.strokeRect(o.x, o.y, o.w, o.h);
  },
  mediaStagePointer(e, phase) {
    const m = this.media, t = MediaUI.tool(m.tool);
    if (!t.stage || !this.mediaHasClip()) return;
    const ov = e.currentTarget, r = ov.getBoundingClientRect();
    const px = Math.round((e.clientX - r.left) * ov.width / r.width), py = Math.round((e.clientY - r.top) * ov.height / r.height);
    const o = this.mediaOpts(t);
    if (t.stage === 'point' && phase === 'down') { o.x = px; o.y = py; }
    else if (t.stage === 'color' && phase === 'down') {
      const d = m.frames[m.cur].canvas.getContext('2d').getImageData(Utils.clamp(px, 0, m.width - 1), Utils.clamp(py, 0, m.height - 1), 1, 1).data;
      o.color = Utils.rgbToHex(d[0], d[1], d[2]);
    } else if (t.stage === 'rect') {
      if (phase === 'down') { ov.setPointerCapture(e.pointerId); m.drag = { x: px, y: py }; return; }
      if (!m.drag) return;
      const x0 = Utils.clamp(Math.min(m.drag.x, px), 0, m.width), y0 = Utils.clamp(Math.min(m.drag.y, py), 0, m.height);
      let w = Math.max(1, Math.abs(px - m.drag.x)), h = Math.max(1, Math.abs(py - m.drag.y));
      Object.assign(o, { x: x0, y: y0, w, h });
      if (t.link) t.link(o, 'w', m);
      if (phase === 'up') m.drag = null;
    } else return;
    this.mediaSyncFields();
    this.mediaSchedulePreview(phase === 'move' ? 16 : 0);
  },

  // ------------------------------------------------------------------ run
  async mediaRun() {
    const m = this.media, t = MediaUI.tool(m.tool), o = this.mediaOpts(t);
    if (m.busy) return;
    if (t.kind === 'create') {
      if (t.id === 'design') return this.mediaBusy(() => this.mediaFromDesign(o));
      if (t.id === 'video' && m.pendingVideo) return this.mediaBusy(() => this.mediaConvertVideo(o));
      return this.mediaPick(t);
    }
    if (!this.mediaHasClip()) return;
    if (t.kind === 'op') {
      await this.mediaBusy(async () => {
        const r = await t.apply(m.frames, o, { ...m, offset: null });
        this.mediaPush(t.name);
        this.mediaSetClip({ frames: r.frames, loop: r.loop ?? m.loop, audio: r.audio !== undefined ? r.audio : m.audio }, t.structural);
        Utils.toast(`${t.name} applied`, '✅');
      });
      return;
    }
    await this.mediaBusy(() => this.mediaRender(t, o));
  },
  async mediaBusy(fn) {
    const m = this.media, $ = (id) => document.getElementById(id);
    m.busy = true; m.cancel = false;
    this.mediaPlay(false);
    $('md-run').disabled = true; $('md-progress').hidden = false;
    $('md-progress').querySelector('i').style.width = '0%';
    try { await fn(); } catch (e) {
      if (e.message !== 'Cancelled') { if (e.name !== 'LimitError') console.error(e); Utils.toast(e.message || String(e), '❌'); } else Utils.toast('Cancelled', 'ℹ️');
    } finally { m.busy = false; $('md-run').disabled = false; $('md-progress').hidden = true; }
  },
  mediaProgress() {
    const bar = document.querySelector('#md-progress i');
    return (p) => { if (this.media.cancel) throw new Error('Cancelled'); bar.style.width = `${Math.round(Utils.clamp(p, 0, 1) * 100)}%`; };
  },
  async mediaRender(t, o) {
    const m = this.media, fmt = t.fmt || o.fmt, F = MD_FORMATS[fmt], prog = this.mediaProgress();
    const base = Utils.safeFilename((m.name || 'media').replace(/\.[a-z0-9]+$/i, ''), 'media');
    const frame = m.frames[Utils.clamp(Math.round(o.frame || m.cur + 1), 1, m.frames.length) - 1]?.canvas;
    let blob, extra = null, text = null;
    const t0 = performance.now();
    if (fmt === 'gif') blob = await Media.encodeGIF(m.frames, o, prog);
    else if (fmt === 'apng') blob = await Media.encodeAPNG(m.frames, +o.loop, prog);
    else if (fmt === 'webp') blob = await Media.encodeWebP(m.frames, o.quality / 100, +o.loop, prog);
    else if (F.video) {
      let frames = m.frames;
      if (o.scale < 100) frames = Media.resize(frames, Math.max(2, Math.round(m.width * o.scale / 100)), Math.max(2, Math.round(m.height * o.scale / 100)));
      blob = await Media.encodeVideo(frames, { container: fmt, quality: o.quality / 100, bg: o.bg, audio: o.audio ? m.audio : null }, prog);
    } else if (fmt === 'zip') blob = await Media.zipFrames(m.frames, base, o.img);
    else if (fmt === 'sheet') {
      const s = Media.spriteSheet(m.frames, Math.max(1, Math.round(o.cols)));
      blob = await Media.toBlob(s.canvas, 'image/png');
      extra = { blob: new Blob([JSON.stringify({ image: `${base}.sheet.png`, ...s.meta }, null, 2)], { type: 'application/json' }), name: `${base}.sheet.json`, label: 'JSON frame map' };
    } else if (fmt === 'png') blob = await Media.toBlob(frame, 'image/png');
    else if (fmt === 'png8') blob = await Media.encodePNG8(frame, +o.colors, o.dither);
    else if (fmt === 'jpeg' || fmt === 'webpstill' || fmt === 'avif') {
      const mime = { jpeg: 'image/jpeg', webpstill: 'image/webp', avif: 'image/avif' }[fmt];
      let c = frame;
      if (fmt === 'jpeg') { c = Media.canvas(frame.width, frame.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(frame, 0, 0); }
      blob = await Media.toBlob(c, mime, o.quality / 100);
      if (!blob || blob.type !== mime) throw Object.assign(new Error(`This browser cannot encode ${F.label}`), { name: 'LimitError' });
    } else if (fmt === 'datauri') {
      const b = await Media.toBlob(frame, o.img, 0.9);
      text = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
      blob = new Blob([text], { type: 'text/plain' });
    }
    prog(1);
    const suffix = fmt === 'sheet' ? '.sheet' : fmt === 'png8' ? '.png8' : t.id === 'optgif' ? '.optimized' : '';
    if (m.result?.url) URL.revokeObjectURL(m.result.url);
    m.result = { blob, fmt, name: `${base}${suffix}.${F.ext}`, url: URL.createObjectURL(blob), extra, text, ms: Math.round(performance.now() - t0), w: F.still ? frame.width : (F.video && o.scale < 100 ? Math.round(m.width * o.scale / 100) : m.width), h: F.still ? frame.height : (F.video && o.scale < 100 ? Math.round(m.height * o.scale / 100) : m.height) };
    this.mediaRenderResult();
  },
  mediaRenderResult() {
    const m = this.media, r = m.result, box = document.getElementById('md-result');
    if (!r) { box.hidden = true; return; }
    const F = MD_FORMATS[r.fmt];
    const delta = m.srcSize ? (r.blob.size / m.srcSize - 1) * 100 : null;
    const preview = r.text ? `<textarea class="md-uri" readonly rows="4">${Utils.escapeHtml(r.text.slice(0, 20000))}${r.text.length > 20000 ? '…' : ''}</textarea>`
      : F.video ? `<video src="${r.url}" controls loop muted playsinline></video>`
        : r.fmt === 'zip' ? '<div class="md-zip">🗜 ZIP archive</div>' : `<img src="${r.url}" alt="Output preview">`;
    box.hidden = false;
    box.innerHTML = `<div class="md-card-title">Output · ${F.label}</div><div class="md-out-preview">${preview}</div>
      <dl class="md-info"><dt>Size</dt><dd><b>${Media.fmtBytes(r.blob.size)}</b>${delta != null ? ` <span class="md-delta ${delta <= 0 ? 'down' : 'up'}">${delta <= 0 ? '−' : '+'}${Math.abs(delta).toFixed(1)}% vs source</span>` : ''}</dd>
      <dt>Dimensions</dt><dd>${r.w}×${r.h}</dd>${F.anim ? `<dt>Frames</dt><dd>${m.frames.length} · ${(Media.duration(m.frames) / 1000).toFixed(2)} s</dd>` : ''}<dt>Encoded in</dt><dd>${r.ms} ms</dd></dl>
      <div class="md-actions"><button class="btn-primary" data-r="dl">Download</button>${r.extra ? `<button class="btn-ghost" data-r="extra">${r.extra.label}</button>` : ''}${r.text ? '<button class="btn-ghost" data-r="copy">Copy</button>' : ''}${['gif', 'apng', 'webp', 'mp4', 'webm', 'png', 'png8', 'jpeg', 'webpstill', 'avif'].includes(r.fmt) ? '<button class="btn-ghost" data-r="use" title="Continue editing from this output">Use as source</button>' : ''}</div>`;
    box.querySelector('[data-r="dl"]').addEventListener('click', () => Utils.download(r.blob, r.name, r.blob.type));
    box.querySelector('[data-r="extra"]')?.addEventListener('click', () => Utils.download(r.extra.blob, r.extra.name, 'application/json'));
    box.querySelector('[data-r="copy"]')?.addEventListener('click', async () => Utils.toast(await Utils.copyText(r.text) ? 'Data URI copied' : 'Clipboard unavailable', '📋'));
    box.querySelector('[data-r="use"]')?.addEventListener('click', () => this.mediaFiles([new File([r.blob], r.name, { type: r.blob.type })], MediaUI.tool('open')));
  },

  // ------------------------------------------------------------------ inputs
  mediaPick(t) {
    this.media.pickFor = t;
    const inp = document.getElementById('md-file');
    inp.accept = t.accept || '*'; inp.multiple = !!t.multiple;
    inp.click();
  },
  mediaLoadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { const c = Media.canvas(img.naturalWidth, img.naturalHeight); c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url); res(c); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`Could not read ${file.name}`)); };
      img.src = url;
    });
  },
  async mediaFiles(files, t) {
    const m = this.media;
    if (!t) t = MediaUI.tool('open');
    if (t.id === 'append') {
      return this.mediaBusy(async () => {
        const imgs = []; for (const f of files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) imgs.push(await this.mediaLoadImage(f));
        const add = Media.imagesToFrames(imgs, { width: m.width, height: m.height, delay: m.frames[m.cur]?.delay || 100 });
        this.mediaPush('Add frames');
        const frames = m.frames.slice(); frames.splice(m.cur + 1, 0, ...add);
        this.mediaSetClip({ frames, loop: m.loop, audio: m.audio }, false);
        Utils.toast(`Added ${add.length} frame${add.length > 1 ? 's' : ''}`, '➕');
      });
    }
    if (t.id === 'maker') {
      return this.mediaBusy(async () => {
        const o = this.mediaOpts(t), prog = this.mediaProgress();
        const sorted = files.filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!sorted.length) throw Object.assign(new Error('Choose image files'), { name: 'LimitError' });
        const imgs = [];
        for (let i = 0; i < sorted.length; i++) { imgs.push(await this.mediaLoadImage(sorted[i])); prog((i + 1) / sorted.length); }
        let W = imgs[0].width, H = imgs[0].height;
        if (o.size === 'largest') { W = Math.max(...imgs.map(i => i.width)); H = Math.max(...imgs.map(i => i.height)); }
        if (o.size === 'custom') { W = o.width; H = o.height; }
        const frames = Media.imagesToFrames(imgs, { width: W, height: H, fit: o.fit, delay: o.delay, bg: o.transparent ? 'transparent' : o.bg });
        this.mediaLoad({ frames, width: W, height: H, loop: 0, source: 'images' }, { name: `animation (${imgs.length} images)`, format: 'images' });
      });
    }
    const file = files[0];
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(file.name);
    if (isVideo) return this.mediaPrepareVideo(file);
    if (t.id === 'sprite') {
      return this.mediaBusy(async () => {
        const o = this.mediaOpts(t), img = await this.mediaLoadImage(file);
        const frames = Media.spriteToFrames(img, Math.max(1, o.cols), Math.max(1, o.rows), o.count, o.delay);
        this.mediaLoad({ frames, width: frames[0].canvas.width, height: frames[0].canvas.height, loop: 0, source: 'sprite' }, { name: file.name, size: file.size, format: 'sprite sheet' });
      });
    }
    if (files.length > 1 && t.id === 'open') return this.mediaFiles(files, MediaUI.tool('maker'));
    return this.mediaBusy(async () => {
      const dec = await Media.decodeFile(file, {}, this.mediaProgress());
      this.mediaLoad(dec, { name: file.name, size: file.size, type: file.type, format: dec.source });
    });
  },
  async mediaPrepareVideo(file) {
    const m = this.media;
    await this.mediaBusy(async () => {
      const p = await Media.probeVideo(file);
      p.video.removeAttribute('src'); p.video.load(); URL.revokeObjectURL(p.url);
      if (m.pendingVideo?.url) URL.revokeObjectURL(m.pendingVideo.url);
      m.pendingVideo = { file, duration: p.duration, width: p.width, height: p.height, url: URL.createObjectURL(file) };
      const v = document.getElementById('md-video');
      v.src = m.pendingVideo.url; v.hidden = false;
      document.getElementById('md-drop').hidden = true; document.getElementById('md-stage-box').hidden = true;
      m.opts.video = null;
      this.mediaSelectTool('video');
      Utils.toast(`${file.name}: ${p.width}×${p.height}, ${p.duration.toFixed(1)} s — choose a range and press Convert`, '🎬');
    });
  },
  mediaVideoMark(which) {
    const v = document.getElementById('md-video'), o = this.mediaOpts(MediaUI.tool('video'));
    if (!this.media.pendingVideo) return;
    o[which] = Utils.round(v.currentTime, 2);
    if (o.end <= o.start) { if (which === 'start') o.end = Utils.round(Math.min(this.media.pendingVideo.duration, o.start + 3), 2); else o.start = Math.max(0, Utils.round(o.end - 3, 2)); }
    this.mediaSyncFields();
  },
  mediaHideVideo() {
    const v = document.getElementById('md-video');
    if (!v || v.hidden) return;
    v.pause(); v.hidden = true;
    this.mediaRenderAll();
  },
  async mediaConvertVideo(o) {
    const m = this.media, pv = m.pendingVideo;
    const span = Math.max(0.1, Math.min(pv.duration, o.end) - o.start);
    const n = Math.round(span * o.fps);
    if (n > 600) throw Object.assign(new Error(`That is ${n} frames — shorten the range or lower the frame rate (max 600)`), { name: 'LimitError' });
    const dec = await Media.decodeVideo(pv.file, { start: +o.start, end: +o.end, fps: +o.fps, width: +o.width, audio: o.audio }, this.mediaProgress());
    URL.revokeObjectURL(pv.url);
    m.pendingVideo = null;
    document.getElementById('md-video').removeAttribute('src');
    this.mediaLoad(dec, { name: pv.file.name, size: pv.file.size, type: pv.file.type, format: 'video' });
  },
  async mediaFromDesign(o) {
    const m = this.model;
    const roots = m.selectedIds.size ? m.topSelected() : m.roots().filter(e => e.visible);
    if (!roots.length) throw Object.assign(new Error('The Design canvas is empty'), { name: 'LimitError' });
    const prevAnim = m.activeAnimationId;
    if (o.anim && m.animations.some(a => a.id === o.anim)) m.activeAnimationId = o.anim;
    const anim = m.activeAnimation;
    try {
      const b = this.renderer.boundsOf(roots);
      const s = Math.min(4, o.max / Math.max(b.w, b.h));
      const n = Utils.clamp(Math.round(anim.duration * o.fps), 1, 600);
      const delay = Math.round(1000 / o.fps);
      const frames = [], prog = this.mediaProgress();
      await this.withTimes(async (apply) => {
        for (let i = 0; i < n; i++) {
          apply((i / n) * anim.duration);
          const c = Media.canvas(Math.max(1, Math.round(b.w * s)), Math.max(1, Math.round(b.h * s)));
          this.renderer.renderToCanvas({ roots, bounds: b, scale: s, bg: o.transparent ? null : o.bg, canvas: c });
          frames.push({ canvas: c, delay });
          prog((i + 1) / n);
          if (i % 6 === 0) await Media.yieldUI();
        }
      });
      this.mediaLoad({ frames, width: frames[0].canvas.width, height: frames[0].canvas.height, loop: anim.loop === 'oneShot' ? 1 : 0, source: 'design' }, { name: `${this.title || 'Design'} – ${anim.name}`, format: 'design' });
      if (!m.hasTracks()) Utils.toast('Nothing is animated yet — this is a still. Add keyframes in Design › Animate.', 'ℹ️');
    } finally { m.activeAnimationId = prevAnim; }
  },
  mediaAutoTrim() {
    const m = this.media, o = this.mediaOpts(MediaUI.tool('crop'));
    if (!this.mediaHasClip()) return;
    const W = m.width, H = m.height;
    const ref = m.frames[0].canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const step = Math.max(1, Math.floor(m.frames.length / 30));
    for (let fi = 0; fi < m.frames.length; fi += step) {
      const d = m.frames[fi].canvas.getContext('2d').getImageData(0, 0, W, H).data;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const same = ref[3] < 16 ? d[i + 3] < 16 : Math.abs(d[i] - ref[0]) + Math.abs(d[i + 1] - ref[1]) + Math.abs(d[i + 2] - ref[2]) + Math.abs(d[i + 3] - ref[3]) < 24;
        if (!same) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (x1 < 0) { Utils.toast('Nothing to trim — every pixel matches the corner colour', 'ℹ️'); return; }
    Object.assign(o, { aspect: 'free', x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    this.mediaSyncFields(); this.mediaSchedulePreview(0);
    Utils.toast(`Trim box ${o.w}×${o.h} — press Apply to crop`, '✂️');
  },

  // ------------------------------------------------------------------ frames & playback
  mediaGo(i) {
    const m = this.media;
    if (!this.mediaHasClip()) return;
    m.cur = (i + m.frames.length) % m.frames.length;
    this.mediaDrawStage();
    document.querySelector(`#md-strip .md-thumb[data-i="${m.cur}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  mediaPlay(on) {
    const m = this.media;
    if (!m) return;
    m.playing = on && this.mediaHasClip() && m.frames.length > 1;
    document.getElementById('md-play').textContent = m.playing ? '⏸' : '▶';
    clearTimeout(this._mdPlayT);
    if (!m.playing) { this.mediaSchedulePreview(0); return; }
    const step = () => {
      if (!m.playing) return;
      this.mediaGo(m.cur + 1);
      this._mdPlayT = setTimeout(step, Math.max(20, m.frames[m.cur].delay));
    };
    this._mdPlayT = setTimeout(step, Math.max(20, m.frames[m.cur].delay));
  },
  mediaFrameOp(op) {
    const m = this.media;
    if (!this.mediaHasClip()) return;
    const frames = m.frames.slice(), i = m.cur;
    if (op === 'del') { if (frames.length < 2) { Utils.toast('A clip needs at least one frame', 'ℹ️'); return; } frames.splice(i, 1); }
    else if (op === 'dup') frames.splice(i + 1, 0, { canvas: Media.clone(frames[i].canvas), delay: frames[i].delay });
    else if (op === 'left' || op === 'right') { const j = op === 'left' ? i - 1 : i + 1; if (j < 0 || j >= frames.length) return; [frames[i], frames[j]] = [frames[j], frames[i]]; m.cur = j; }
    this.mediaPush({ del: 'Delete frame', dup: 'Duplicate frame', left: 'Move frame', right: 'Move frame' }[op]);
    if (op === 'dup') m.cur = i + 1;
    this.mediaSetClip({ frames, loop: m.loop, audio: op === 'del' || op === 'dup' ? null : m.audio }, false);
  },
  mediaRenderStrip() {
    const m = this.media, strip = document.getElementById('md-strip');
    strip.innerHTML = '';
    if (!this.mediaHasClip()) return;
    const H = 56;
    const many = m.frames.length > 400;
    m.frames.forEach((f, i) => {
      const d = document.createElement('div');
      d.className = 'md-thumb'; d.dataset.i = i; d.draggable = true; d.setAttribute('role', 'option');
      const c = document.createElement('canvas');
      const s = H / f.canvas.height;
      c.width = Math.max(1, Math.round(f.canvas.width * s)); c.height = H;
      if (!many || i % Math.ceil(m.frames.length / 400) === 0) c.getContext('2d').drawImage(f.canvas, 0, 0, c.width, c.height);
      d.innerHTML = `<span class="md-tn">${i + 1}</span>`;
      d.prepend(c);
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 10; inp.max = 60000; inp.value = f.delay; inp.title = 'Delay (ms)'; inp.setAttribute('aria-label', `Frame ${i + 1} delay in ms`);
      inp.addEventListener('change', () => { const v = Utils.clamp(Math.round(Utils.num(inp.value, f.delay)), 10, 60000); this.mediaPush('Frame delay'); m.frames = m.frames.map((x, k) => (k === i ? { canvas: x.canvas, delay: v } : x)); inp.value = v; this.mediaDrawStage(); this.mediaRenderInfo(); this.mediaMarkDirty(); });
      inp.addEventListener('click', (e) => e.stopPropagation());
      d.appendChild(inp);
      d.addEventListener('click', () => this.mediaGo(i));
      d.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/md-frame', String(i)); e.dataTransfer.effectAllowed = 'move'; });
      d.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/md-frame')) { e.preventDefault(); d.classList.add('drop'); } });
      d.addEventListener('dragleave', () => d.classList.remove('drop'));
      d.addEventListener('drop', (e) => {
        const from = +e.dataTransfer.getData('text/md-frame');
        d.classList.remove('drop');
        if (!e.dataTransfer.types.includes('text/md-frame')) return;
        e.preventDefault(); e.stopPropagation();
        if (from === i) return;
        const frames = m.frames.slice(); const [x] = frames.splice(from, 1); frames.splice(i, 0, x);
        this.mediaPush('Reorder frames'); m.cur = i;
        this.mediaSetClip({ frames, loop: m.loop, audio: null }, false);
      });
      strip.appendChild(d);
    });
  },
  mediaRenderInfo() {
    const m = this.media, el = document.getElementById('md-info');
    if (!this.mediaHasClip()) { el.innerHTML = '<dt>—</dt><dd>Nothing loaded</dd>'; return; }
    const rows = [['File', Utils.escapeHtml(m.name)], ['Format', Utils.escapeHtml(m.srcFormat || '—')], ['File size', m.srcSize ? Media.fmtBytes(m.srcSize) : 'not a file'],
      ['Dimensions', `${m.width}×${m.height}`], ['Frames', String(m.frames.length)], ['Duration', `${(Media.duration(m.frames) / 1000).toFixed(2)} s`],
      ['Loop', m.loop ? `${m.loop}×` : 'forever'], ['Audio', m.audio ? `${Media.audioDuration(m.audio).toFixed(2)} s` : 'none']];
    el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  },
  mediaRenderAll() {
    const m = this.media, $ = (id) => document.getElementById(id);
    if (!m) return;
    const has = this.mediaHasClip(), videoOpen = !$('md-video').hidden;
    $('md-drop').hidden = has || videoOpen;
    $('md-stage-box').hidden = !has || videoOpen;
    $('md-title').textContent = videoOpen ? `${m.pendingVideo?.file.name || 'Video'} — choose a range` : has ? `${m.name} · ${m.width}×${m.height} · ${m.frames.length} frame${m.frames.length > 1 ? 's' : ''}` : 'No media';
    $('md-undo').disabled = !m.history.length; $('md-redo').disabled = !m.future.length;
    $('md-undo').title = m.history.length ? `Undo ${m.history.at(-1).label} (Ctrl+Z)` : 'Nothing to undo';
    $('md-redo').title = m.future.length ? `Redo ${m.future.at(-1).label} (Ctrl+Shift+Z)` : 'Nothing to redo';
    $('md-revert').disabled = !m.original || !m.history.length;
    $('md-to-design').disabled = !has;
    document.querySelectorAll('#media-workspace .md-group[data-needs="1"]').forEach(g => g.classList.toggle('disabled', !has));
    document.querySelectorAll('#media-workspace .md-playbar button').forEach(b => { b.disabled = !has || videoOpen; });
    this.mediaRenderStrip();
    this.mediaRenderInfo();
    this.mediaRenderSaveState();
    this.mediaRenderResult();
    if (MediaUI.tool(m.tool)) this.mediaUpdateVisibility();
    if (has && !videoOpen) this.mediaDrawStage();
  },
  async mediaSendToDesign() {
    const m = this.media;
    if (!this.mediaHasClip()) return;
    const blob = await Media.toBlob(m.frames[m.cur].canvas, 'image/png');
    const name = `${(m.name || 'frame').replace(/\.[a-z0-9]+$/i, '')} – frame ${m.cur + 1}.png`;
    this.setSection('design');
    this.importImageFile(new File([blob], name, { type: 'image/png' }));
  },
  mediaPaste(e) {
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    this.mediaFiles(files, this.mediaHasClip() && files.every(f => f.type.startsWith('image/') && f.type !== 'image/gif') ? { id: 'append' } : MediaUI.tool('open'));
  },
  mediaKey(e) {
    if (this.section !== 'media' || !this.media) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (document.querySelector('.modal-overlay.open, .modal.open')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) this.mediaRedo(); else this.mediaUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.mediaRedo(); return; }
    if (mod) return;
    if (e.key === ' ') { e.preventDefault(); this.mediaPlay(!this.media.playing); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.mediaGo(this.media.cur - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.mediaGo(this.media.cur + 1); }
    else if (e.key === 'Delete') { e.preventDefault(); this.mediaFrameOp('del'); }
    else if (e.key === 'Enter' && !this.media.busy) { e.preventDefault(); this.mediaRun(); }
  }
};
Object.assign(StudioApp.prototype, MediaMixin);
