/**
 * DesignStudio — export modal: image (PNG/JPEG/WebP/SVG), animation (video, CSS,
 * Lottie, sprite sheet, APNG), production code, and project files.
 */
'use strict';

const ExportMixin = {
  bindExport() {
    const $ = (id) => document.getElementById(id);
    this.exportTab = 'image';
    // Scope applies to image, animation and code exports — lift it out of the image tab
    const bar = document.createElement('div');
    bar.id = 'exp-scope-bar';
    bar.appendChild($('exp-img-scope').closest('.prop-row'));
    bar.appendChild($('exp-frame-select-row'));
    const tabsEl = document.querySelector('#export-modal .modal-body .panel-tabs');
    tabsEl.after(bar);
    $('btn-export-modal').addEventListener('click', () => this.openExportModal());
    $('btn-close-export').addEventListener('click', () => this.closeExportModal());
    $('btn-cancel-export').addEventListener('click', () => this.closeExportModal());
    $('export-modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'export-modal') this.closeExportModal(); });
    document.querySelectorAll('#export-modal .panel-tab-btn').forEach(t => t.addEventListener('click', () => this.setExportTab(t.dataset.expTab)));

    const thumb = Utils.debounce(() => this.updateExportThumbPreview(), 120);
    $('exp-img-format').addEventListener('change', () => { this.syncExportControls(); thumb(); });
    $('exp-img-scale').addEventListener('change', thumb);
    $('exp-img-quality').addEventListener('input', (e) => { $('exp-quality-val').textContent = `${e.target.value}%`; });
    $('exp-img-bg').addEventListener('change', () => { this.syncExportControls(); thumb(); });
    $('exp-img-custom-bg').addEventListener('input', thumb);
    $('exp-img-scope').addEventListener('change', () => { this.syncExportControls(); thumb(); this.refreshExportCodeOutput(); this.refreshAnimationPreview(); });
    $('exp-img-frame-choice').addEventListener('change', () => { thumb(); this.refreshExportCodeOutput(); this.refreshAnimationPreview(); });
    $('btn-refresh-exp-thumb').addEventListener('click', () => this.updateExportThumbPreview());

    ['exp-anim-type', 'exp-anim-fps', 'exp-anim-duration'].forEach(id => $(id).addEventListener('change', () => { this.updateLottieWarn(); this.refreshAnimationPreview(); }));
    { const w = document.createElement('div'); w.id = 'exp-lottie-warn'; w.className = 'exp-lottie-warn'; w.hidden = true; w.setAttribute('role', 'status');
      w.innerHTML = `${Icons.svg('warning', 16)}<div><p class="lw-msg"></p><label class="lw-opt check-label"><input type="checkbox" id="exp-lottie-raster" checked> Include them as embedded images (keeps the look; text is not editable in Lottie)</label></div>`;
      $('exp-anim-type').closest('.prop-row').after(w); w.querySelector('#exp-lottie-raster').addEventListener('change', () => this.refreshAnimationPreview()); }
    ['exp-code-type', 'exp-code-framework', 'exp-code-css-mode'].forEach(id => $(id).addEventListener('change', () => this.refreshExportCodeOutput()));
    $('btn-copy-exp-code').addEventListener('click', async () => {
      const ok = await Utils.copyText($('exp-code-output-area').value);
      Utils.toast(ok ? 'Code copied to clipboard' : 'Clipboard unavailable', ok ? '📋' : '⚠️');
    });

    $('btn-download-studio-json').addEventListener('click', () => this.saveProject(false));
    $('btn-export-figma-json').textContent = 'Export Figma REST-format JSON';
    $('btn-export-figma-json').title = 'Figma API–shaped JSON for plugins and import tools (Figma cannot open JSON files directly)';
    $('btn-export-figma-json').addEventListener('click', () => {
      Utils.download(Exporters.figma(this.model, this.title), `${Utils.safeFilename(this.title)}.figma.json`, 'application/json');
      Utils.toast('Exported Figma REST-format JSON', '📦');
    });
    $('btn-modal-import-json').addEventListener('click', () => { this.closeExportModal(); this.openProject(); });
    $('btn-confirm-export').addEventListener('click', () => this.confirmExport());

    const fmt = $('exp-anim-type');
    const video = fmt.querySelector('option[value="video"]');
    if (video) video.textContent = 'Video recording (MP4 / WebM)';
    const inter = document.createElement('option');
    inter.value = 'interactive'; inter.textContent = 'Interactive HTML (state machine runtime)';
    fmt.insertBefore(inter, fmt.firstChild);
    const asvg = document.createElement('option'); // v3.13.1
    asvg.value = 'svg'; asvg.textContent = 'Animated SVG (plays in browsers, no code)';
    fmt.querySelector('option[value="css"]')?.before(asvg);
    const apng = fmt.querySelector('option[value="apng"]');
    if (apng) apng.textContent = 'Animated PNG (APNG)';
  },

  openExportModal() {
    this.finishTextEdit();
    const m = this.model;
    const $ = (id) => document.getElementById(id);
    const frames = m.roots().filter(f => f.type === 'frame' && f.visible);
    const fc = $('exp-img-frame-choice');
    fc.innerHTML = '';
    for (const f of frames) { const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; fc.appendChild(o); }
    const scope = $('exp-img-scope');
    scope.querySelector('option[value="selected"]').disabled = !m.selectedIds.size;
    scope.querySelector('option[value="frame"]').disabled = !frames.length;
    scope.value = m.selectedIds.size ? 'selected' : frames.length ? 'frame' : 'all';
    const sel = m.topSelected()[0];
    if (sel && frames.length) { const r = this.rootOf(sel); if (r.type === 'frame') fc.value = r.id; }
    $('exp-anim-fps').value = String([12, 24, 30, 60].includes(m.animationTimeline.fps) ? m.animationTimeline.fps : 30);
    $('exp-anim-duration').value = m.animationTimeline.duration;
    $('export-modal').classList.add('open');
    this.syncExportControls();
    this.setExportTab(this.exportTab);
  },
  closeExportModal() { document.getElementById('export-modal').classList.remove('open'); },
  setExportTab(tab) {
    this.exportTab = tab;
    document.querySelectorAll('#export-modal .panel-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.expTab === tab));
    document.querySelectorAll('.exp-tab-content').forEach(c => { c.style.display = c.id === `exp-tab-${tab}` ? 'block' : 'none'; });
    const btn = document.getElementById('btn-confirm-export');
    btn.style.display = tab === 'project' ? 'none' : '';
    document.getElementById('exp-scope-bar').style.display = tab === 'project' ? 'none' : 'flex';
    btn.textContent = { image: 'Download image', animation: 'Export animation', code: 'Download code' }[tab] || 'Download';
    if (tab === 'image') this.updateExportThumbPreview();
    if (tab === 'animation') { this.updateLottieWarn(); this.refreshAnimationPreview(); }
    if (tab === 'code') this.refreshExportCodeOutput();
  },
  syncExportControls() {
    const $ = (id) => document.getElementById(id);
    const fmt = $('exp-img-format').value;
    $('exp-quality-row').style.display = fmt === 'jpeg' || fmt === 'webp' ? 'flex' : 'none';
    $('exp-img-custom-bg').style.display = $('exp-img-bg').value === 'custom' ? 'inline-block' : 'none';
    $('exp-frame-select-row').style.display = $('exp-img-scope').value === 'frame' ? 'flex' : 'none';
    $('exp-img-scale').disabled = fmt === 'svg';
  },
  exportScopeRoots() {
    const m = this.model;
    const scope = document.getElementById('exp-img-scope').value;
    if (scope === 'selected' && m.selectedIds.size) return m.topSelected();
    if (scope === 'frame') { const f = m.getElementById(document.getElementById('exp-img-frame-choice').value); if (f) return [f]; }
    return m.roots().filter(e => e.visible);
  },
  exportBg() {
    const v = document.getElementById('exp-img-bg').value;
    if (v === 'custom') return document.getElementById('exp-img-custom-bg').value;
    return v;
  },
  exportName(roots) { return Utils.safeFilename(roots.length === 1 ? roots[0].name : this.title); },

  updateExportThumbPreview() {
    const img = document.getElementById('exp-image-preview-thumb');
    const roots = this.exportScopeRoots();
    if (!roots.length) { img.removeAttribute('src'); img.alt = 'Nothing to export'; return; }
    const b = this.renderer.boundsOf(roots);
    const c = this.renderer.renderToCanvas({ roots, scale: Math.min(2, 360 / Math.max(b.w, b.h, 1)), bg: this.exportBg() === 'transparent' ? null : this.exportBg(), maxSize: 720 });
    img.src = c.toDataURL('image/png');
    img.alt = `Preview of ${this.exportName(roots)}`;
    img.title = `${Math.round(b.w)} × ${Math.round(b.h)} px at 1x`;
  },

  async confirmExport() {
    if (this.exportTab === 'image') return this.exportImage();
    if (this.exportTab === 'animation') return this.exportAnimation();
    if (this.exportTab === 'code') {
      const type = document.getElementById('exp-code-type').value, fw = document.getElementById('exp-code-framework').value;
      const ext = type === 'svg-raw' ? 'svg' : type === 'tokens' ? 'tokens.json' : type === 'css-only' ? 'css' : { react: 'jsx', vue: 'vue', svelte: 'svelte' }[fw] || 'html';
      Utils.download(document.getElementById('exp-code-output-area').value, `${this.exportName(this.exportScopeRoots())}.${ext}`, 'text/plain');
      Utils.toast(`Downloaded .${ext}`, '⬇️');
    }
  },
  async exportImage() {
    const roots = this.exportScopeRoots();
    if (!roots.length) { Utils.toast('Nothing to export', '⚠️'); return; }
    const fmt = document.getElementById('exp-img-format').value;
    const scale = Number(document.getElementById('exp-img-scale').value) || 1;
    let bg = this.exportBg();
    const name = this.exportName(roots);
    if (fmt === 'svg') {
      Utils.download(Exporters.svgDocument(this.model, roots, { bg: bg === 'transparent' ? null : bg }), `${name}.svg`, 'image/svg+xml');
      Utils.toast('Exported SVG', '⬇️');
      return;
    }
    if (fmt === 'jpeg' && bg === 'transparent') bg = '#ffffff';
    const canvas = this.renderer.renderToCanvas({ roots, scale, bg: bg === 'transparent' ? null : bg });
    const b = this.renderer.boundsOf(roots);
    const actual = Utils.round(canvas.width / Math.max(1, b.w), 2);
    const q = Number(document.getElementById('exp-img-quality').value) / 100;
    const blob = await new Promise(r => canvas.toBlob(r, `image/${fmt}`, q));
    if (!blob) { Utils.toast('Export failed — the image may be too large', '❌'); return; }
    Utils.download(blob, `${name}${actual !== 1 ? `@${actual}x` : ''}.${fmt === 'jpeg' ? 'jpg' : fmt}`);
    Utils.toast(actual < scale - 0.01 ? `Exported at ${actual}x (capped at 8192px) · ${canvas.width}×${canvas.height}px` : `Exported ${fmt.toUpperCase()} · ${canvas.width}×${canvas.height}px`, actual < scale - 0.01 ? '⚠️' : '⬇️');
  },

  refreshExportCodeOutput() {
    const $ = (id) => document.getElementById(id);
    const area = $('exp-code-output-area');
    if (!area) return;
    const type = $('exp-code-type').value;
    $('exp-code-framework').disabled = type === 'svg-raw' || type === 'tokens' || type === 'css-only';
    $('exp-code-css-mode').disabled = type === 'svg-raw' || type === 'tokens';
    try {
      area.value = Exporters.code(this.model, this.exportScopeRoots(), { type, framework: $('exp-code-framework').value, cssMode: $('exp-code-css-mode').value, title: this.title });
    } catch (e) {
      console.error(e);
      area.value = `/* Code generation failed: ${e.message} */`;
    }
  },

  // ------------------------------------------------------------------ Animation
  /** v3.23.0 — Lottie has no text or effects: say so before export and offer to keep them as embedded images. */
  lottieRasterOn() { const c = document.getElementById('exp-lottie-raster'); return c ? c.checked : true; },
  lottieRaster(el) {
    try {
      const c = StudioElement.fromJSON(JSON.parse(JSON.stringify(el.toJSON ? el.toJSON() : el)));
      Object.assign(c, { rotation: 0, opacity: 1, flipX: false, flipY: false });
      const b = this.renderer.boundsOf([c]); if (!b || !b.w || !b.h) return null;
      const scale = 2, cv = this.renderer.renderToCanvas({ roots: [c], bounds: b, scale, bg: null, maxSize: 4096 });
      const s = cv.width / b.w;
      return { url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, scale: s, ax: (c.x + c.width / 2 - b.x) * s, ay: (c.y + c.height / 2 - b.y) * s };
    } catch (e) { console.warn('Lottie raster failed', e); return null; }
  },
  updateLottieWarn() {
    const box = document.getElementById('exp-lottie-warn'); if (!box) return;
    const type = document.getElementById('exp-anim-type').value;
    if (type !== 'lottie') { box.hidden = true; return; }
    const roots = this.exportScopeRoots(), r = Exporters.lottie(this.model, roots, { fps: 12, duration: 0.1 });
    const stub = Exporters.lottie(this.model, roots, { fps: 12, duration: 0.1, rasterize: () => ({ url: '', w: 1, h: 1, scale: 1, ax: 0, ay: 0 }) });
    const fmt = (c) => Object.entries(c || {}).map(([k, n]) => `${k} (${n})`).join(', ');
    const list = Object.keys(r.counts || {}), left = fmt(stub.counts);
    box.hidden = false;
    box.classList.toggle('ok', !list.length);
    box.querySelector('.lw-msg').textContent = list.length ? `Lottie only supports vector shapes. Not native: ${fmt(r.counts)}.${left ? ` Even as images, ${left} on frames / groups can’t be kept — flatten those frames or use video / APNG.` : ''}` : 'Everything in this scope is supported by Lottie.';
    box.querySelector('.lw-opt').hidden = !list.length;
  },
  animSettings() {
    return {
      type: document.getElementById('exp-anim-type').value,
      fps: Number(document.getElementById('exp-anim-fps').value) || 30,
      duration: Utils.clamp(Utils.num(document.getElementById('exp-anim-duration').value, this.model.animationTimeline.duration), 0.5, 60)
    };
  },
  refreshAnimationPreview() {
    const out = document.getElementById('exp-anim-code-output');
    if (!out) return;
    const { type, fps, duration } = this.animSettings();
    const roots = this.exportScopeRoots();
    const animated = Exporters.animatedIn(this.model, roots);
    const scopeNote = `Scope: ${roots.length === 1 ? roots[0].name : `${roots.length} layers`} · ${animated.length} animated layer(s)`;
    if (type === 'interactive') {
      const m = this.model;
      out.value = `${scopeNote}\n\nOne self-contained HTML file that renders the scope and runs ${m.stateMachines.length ? `${m.stateMachines.length} state machine(s) with ${m.inputs.length} input(s) and ${m.stateMachines.reduce((s, x) => s + x.listeners.length, 0)} listener(s)` : `the “${m.activeAnimation.name}” animation (no state machine yet)`}.\n\nDeveloper API:\n  DesignStudioPlayer.inputs()\n  DesignStudioPlayer.fire('name')\n  DesignStudioPlayer.set('name', value)\n  DesignStudioPlayer.get('name')\n  DesignStudioPlayer.onInput((name, value) => …)`;
      return;
    }
    if (type === 'svg') { const bg = this.exportBg(); const { svg, count } = Exporters.animatedSVG(this.model, roots, { bg: bg === 'transparent' ? null : bg }); out.value = `${scopeNote}\n\nOne .svg file: ${count} animated layer(s) driven by CSS keyframes from the timeline. Plays in browsers, <img> tags, websites and most tools, with no JavaScript. Moves, rotation, size, opacity and fill color are kept; respects “reduce motion”.\n\n${svg.length > 6000 ? svg.slice(0, 6000) + '\n…' : svg}`; }
    else if (type === 'css') out.value = Exporters.cssKeyframes(this.model, roots);
    else if (type === 'lottie') {
      const r = Exporters.lottie(this.model, roots, { fps, duration, title: this.title, rasterize: this.lottieRasterOn() ? (el) => this.lottieRaster(el) : null });
      out.value = (r.images ? `// ${r.images} layer(s) (text / effects) embedded as images to keep their look.\n` : '') + (r.skipped.length ? `// Not included: ${r.skipped.join(', ')}.\n` : '') + r.json.slice(0, 20000);
    } else if (type === 'video') out.value = `${scopeNote}\n\nRecords ${duration}s at ${fps} fps in real time from an off-screen render of the scope.\nFormat: MP4 where the browser supports it, otherwise WebM.`;
    else if (type === 'spritesheet') { const n = Math.min(64, Math.max(2, Math.round(duration * fps))); out.value = `${scopeNote}\n\nRenders ${n} frames into a ${Math.ceil(Math.sqrt(n))}-column PNG grid (frame size scaled to ≤ 320 px). A JSON frame map is downloaded alongside.`; }
    else if (type === 'apng') { const n = Math.min(150, Math.max(2, Math.round(duration * Math.min(fps, 24)))); out.value = `${scopeNote}\n\nRenders ${n} frames into a looping Animated PNG (≤ 24 fps, ≤ 480 px; identical frames are merged). Plays in all modern browsers.`; }
    if (!animated.length && type !== 'css') out.value += '\n\n⚠ Nothing in this scope is animated yet — open the Timeline and add keyframes.';
  },
  async withTimes(fn) {
    const m = this.model, tl = m.animationTimeline;
    const saved = tl.currentTime, wasPlaying = tl.isPlaying;
    tl.isPlaying = false;
    try { return await fn((t) => m.applyTime(t)); } finally {
      m.applyTime(saved); tl.currentTime = saved; tl.isPlaying = wasPlaying;
      m.captureBaseline(m.allElements());
      this.requestRender();
    }
  },
  async exportAnimation() {
    const { type, fps, duration } = this.animSettings();
    const roots = this.exportScopeRoots();
    if (!roots.length) { Utils.toast('Nothing to export', '⚠️'); return; }
    const name = this.exportName(roots);
    if (type === 'interactive') {
      const bg = this.exportBg();
      Utils.download(InteractiveExport.html(this.model, roots, { title: name, bg: bg === 'transparent' ? null : bg }), `${name}.interactive.html`, 'text/html');
      Utils.toast('Exported interactive HTML player', '⬇️');
      return;
    }
    if (type === 'svg') { const bg = this.exportBg(); const { svg, count } = Exporters.animatedSVG(this.model, roots, { bg: bg === 'transparent' ? null : bg }); Utils.download(svg, `${name}.animated.svg`, 'image/svg+xml'); Utils.toast(count ? `Exported animated SVG (${count} animated layer${count === 1 ? '' : 's'})` : 'Exported SVG — nothing in this scope is animated yet', '⬇️'); return; }
    if (type === 'css') { Utils.download(Exporters.cssKeyframes(this.model, roots), `${name}.animation.css`, 'text/css'); Utils.toast('Exported CSS keyframes', '⬇️'); return; }
    if (type === 'lottie') {
      const { json, skipped, images } = Exporters.lottie(this.model, roots, { fps, duration, title: this.title, rasterize: this.lottieRasterOn() ? (el) => this.lottieRaster(el) : null });
      Utils.download(json, `${name}.lottie.json`, 'application/json');
      Utils.toast(skipped.length ? `Exported Lottie — not included: ${skipped.join(', ')}` : images ? `Exported Lottie (${images} text / effect layer${images === 1 ? '' : 's'} as images)` : 'Exported Lottie JSON', skipped.length ? '⚠️' : '⬇️');
      return;
    }
    const btn = document.getElementById('btn-confirm-export');
    btn.disabled = true;
    const label = btn.textContent;
    try {
      const b = this.renderer.boundsOf(roots);
      if (type === 'video') await this.recordVideo(roots, b, fps, duration, name, btn);
      else if (type === 'spritesheet') await this.exportSpriteSheet(roots, b, fps, duration, name);
      else if (type === 'apng') await this.exportAPNG(roots, b, fps, duration, name, btn);
    } catch (e) {
      console.error(e);
      Utils.toast(`Animation export failed: ${e.message}`, '❌');
    } finally { btn.disabled = false; btn.textContent = label; }
  },
  async recordVideo(roots, b, fps, duration, name, btn) {
    const canvas = document.createElement('canvas');
    const s = Math.min(2, 1920 / Math.max(b.w, b.h));
    if (!canvas.captureStream || !window.MediaRecorder) throw new Error('This browser cannot record canvas video');
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mime = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    const bg = this.exportBg() === 'transparent' ? this.model.page.bg : this.exportBg();
    this.renderer.renderToCanvas({ roots, bounds: b, scale: s, bg, canvas });
    const stream = canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    await this.withTimes(async (apply) => {
      apply(0);
      this.renderer.renderToCanvas({ roots, bounds: b, scale: s, bg, canvas });
      const started = new Promise(r => { rec.onstart = r; });
      rec.start(250);
      await started;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const frame = () => {
          const t = (performance.now() - t0) / 1000;
          apply(Math.min(t, duration));
          this.renderer.renderToCanvas({ roots, bounds: b, scale: s, bg, canvas });
          btn.textContent = `Recording… ${Math.min(100, Math.round((t / duration) * 100))}%`;
          if (t >= duration) setTimeout(resolve, 40); else requestAnimationFrame(frame); // hold the last frame briefly
        };
        frame();
      });
      rec.stop();
      await done;
    });
    const ext = (rec.mimeType || mime).includes('mp4') ? 'mp4' : 'webm';
    Utils.download(new Blob(chunks, { type: rec.mimeType || 'video/webm' }), `${name}.${ext}`);
    Utils.toast(`Exported ${ext.toUpperCase()} video`, '🎥');
  },
  async exportSpriteSheet(roots, b, fps, duration, name) {
    const n = Math.min(64, Math.max(2, Math.round(duration * fps)));
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const s = Math.min(1, 320 / Math.max(b.w, b.h));
    const fw = Math.max(1, Math.round(b.w * s)), fh = Math.max(1, Math.round(b.h * s));
    const sheet = document.createElement('canvas');
    sheet.width = cols * fw; sheet.height = rows * fh;
    const ctx = sheet.getContext('2d');
    const bg = this.exportBg();
    const frames = [];
    await this.withTimes(async (apply) => {
      const tmp = document.createElement('canvas');
      for (let i = 0; i < n; i++) {
        const t = (i / n) * duration; // loop-friendly: last frame is one step before the first repeats
        apply(t);
        this.renderer.renderToCanvas({ roots, bounds: b, scale: s, bg: bg === 'transparent' ? null : bg, canvas: tmp });
        const x = (i % cols) * fw, y = Math.floor(i / cols) * fh;
        ctx.drawImage(tmp, x, y);
        frames.push({ frame: i, time: Utils.round(t, 3), x, y, w: fw, h: fh });
      }
    });
    const blob = await new Promise(r => sheet.toBlob(r, 'image/png'));
    Utils.download(blob, `${name}.sprites.png`);
    Utils.download(JSON.stringify({ image: `${name}.sprites.png`, frameWidth: fw, frameHeight: fh, columns: cols, rows, fps: Utils.round(n / duration, 3), frames }, null, 2), `${name}.sprites.json`, 'application/json');
    Utils.toast(`Exported ${n}-frame sprite sheet`, '⬇️');
  },
  async exportAPNG(roots, b, fps, duration, name, btn) {
    const rate = Math.min(fps, 24);
    const n = Math.min(150, Math.max(2, Math.round(duration * rate)));
    const s = Math.min(1, 480 / Math.max(b.w, b.h));
    const bg = this.exportBg();
    const pngs = [];
    await this.withTimes(async (apply) => {
      const c = document.createElement('canvas');
      for (let i = 0; i < n; i++) {
        apply((i / n) * duration);
        this.renderer.renderToCanvas({ roots, bounds: b, scale: s, bg: bg === 'transparent' ? null : bg, canvas: c });
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        pngs.push(new Uint8Array(await blob.arrayBuffer()));
        if (i % 5 === 0) btn.textContent = `Encoding… ${Math.round((i / n) * 100)}%`;
      }
    });
    const frameMs = Math.round(1000 * duration / n);
    const uniq = [], delays = [];
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    for (const png of pngs) {
      if (uniq.length && same(uniq[uniq.length - 1], png)) delays[delays.length - 1] += frameMs;
      else { uniq.push(png); delays.push(frameMs); }
    }
    const apng = this.buildAPNG(uniq, delays);
    Utils.download(new Blob([apng], { type: 'image/apng' }), `${name}.png`);
    Utils.toast(`Exported animated PNG (${uniq.length} unique frames)`, '⬇️');
  },
  buildAPNG(pngs, delays) {
    const readChunks = (buf) => {
      const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const out = [];
      let p = 8;
      while (p < buf.length) {
        const len = dv.getUint32(p); const type = String.fromCharCode(...buf.subarray(p + 4, p + 8));
        out.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
        p += 12 + len;
      }
      return out;
    };
    const parts = [];
    const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v); return b; };
    const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v); return b; };
    const chunk = (type, ...datas) => {
      const len = datas.reduce((s, d) => s + d.length, 0);
      const body = new Uint8Array(4 + len);
      body.set([...type].map(ch => ch.charCodeAt(0)), 0);
      let o = 4; for (const d of datas) { body.set(d, o); o += d.length; }
      parts.push(u32(len), body, u32(Utils.crc32(body)));
    };
    parts.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
    const first = readChunks(pngs[0]);
    const ihdr = first.find(c => c.type === 'IHDR').data;
    const w = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(0), h = new DataView(ihdr.buffer, ihdr.byteOffset).getUint32(4);
    chunk('IHDR', ihdr);
    chunk('acTL', u32(pngs.length), u32(0));
    let seq = 0;
    pngs.forEach((png, i) => {
      const cs = i === 0 ? first : readChunks(png);
      chunk('fcTL', u32(seq++), u32(w), u32(h), u32(0), u32(0), u16(Math.min(65535, Array.isArray(delays) ? delays[i] : delays)), u16(1000), new Uint8Array([0, 0]));
      for (const c of cs.filter(c => c.type === 'IDAT')) {
        if (i === 0) chunk('IDAT', c.data);
        else chunk('fdAT', u32(seq++), c.data);
      }
    });
    chunk('IEND');
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
};
Object.assign(StudioApp.prototype, ExportMixin);
