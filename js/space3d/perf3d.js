/**
 * DesignStudio — 3D performance (v3.32.0). Settings › 3D performance.
 *
 *  Cached shadows   shadow maps are redrawn only when a shadow-casting object or light moves or changes — orbiting the
 *                   camera no longer re-renders every shadow map (the biggest cost with many objects).
 *  Moving at a lower resolution   while you orbit, drag the gizmo or play, the view renders at a lower resolution and
 *                   snaps back to full sharpness ~150 ms after you stop.
 *  Auto mode        measures frame time while moving and steps the moving resolution 100 → 75 → 60 → 50 % (and back up
 *                   when there is headroom); on very heavy scenes it switches soft shadows to standard ones.
 *  Presets          Auto · Quality · Balanced · Performance · Custom (shadows, shadow resolution, screen sharpness,
 *                   resolution while moving). Exports (images, GIF, video, web viewer) always render at full quality.
 */
'use strict';

const S3_PRESETS = {
  auto:        { shadows: 'auto', shadowRes: 2048, maxDpr: 2, moveScale: 'auto' },
  quality:     { shadows: 'soft', shadowRes: 2048, maxDpr: 2, moveScale: 1 },
  balanced:    { shadows: 'standard', shadowRes: 1024, maxDpr: 1.5, moveScale: 0.75 },
  performance: { shadows: 'low', shadowRes: 512, maxDpr: 1, moveScale: 0.5 },
};
const S3_AUTO_STEPS = [1, 0.75, 0.6, 0.5];

(function patchPerf3D() {
  const P = StudioApp.prototype;
  const boot = P.s3Boot, rebuild = P.s3Rebuild, rebuildObj = P.s3RebuildObject, applyS = P.s3ApplySettings, clean = P.s3RenderClean, resize = P.s3Resize;
  P.s3Boot = async function (...a) { const r = await boot.apply(this, a); this.s3PerfInstall(); return r; };
  P.s3Rebuild = async function (...a) { const r = await rebuild.apply(this, a); this.s3PerfApply(); return r; };
  if (rebuildObj) P.s3RebuildObject = async function (...a) { const r = await rebuildObj.apply(this, a); if (this.s3?.perf) { this.s3PerfApply(true); } return r; };
  if (applyS) P.s3ApplySettings = function (...a) { const r = applyS.apply(this, a); this.s3PerfApply(); return r; };
  if (resize) P.s3Resize = function (...a) { const r = resize.apply(this, a); this.s3ApplyDpr?.(); return r; };
  if (clean) P.s3RenderClean = function (...a) { const pf = this.s3?.perf; if (pf) { pf.bypass = true; pf.forceShadow = true; } try { return clean.apply(this, a); } finally { if (pf) pf.bypass = false; } };
})();

const Perf3DMixin = {
  s3PerfCfg() {
    const s = this.settings?.s3 || { mode: 'auto' };
    return s.mode === 'custom' ? { shadows: s.shadows || 'soft', shadowRes: +s.shadowRes || 2048, maxDpr: +s.maxDpr || 2, moveScale: +s.moveScale || 1 } : (S3_PRESETS[s.mode] || S3_PRESETS.auto);
  },
  s3PerfInstall() {
    const s3 = this.s3; if (!s3?.ready || s3.perf) return;
    const R = s3.renderer;
    const pf = s3.perf = { level: 0, ema: 0, changedAt: 0, orbiting: false, lastMove: 0, scale: 1, hash: NaN, forceShadow: true, shadowUpdates: 0, renders: 0, ms: 0, lastAt: 0, autoShadow: null, restSlow: 0, restFast: 0, bypass: false };
    R.shadowMap.autoUpdate = false; R.shadowMap.needsUpdate = true;
    s3.orbit.addEventListener('start', () => { pf.orbiting = true; pf.lastMove = performance.now(); });
    s3.orbit.addEventListener('end', () => { pf.orbiting = false; pf.lastMove = performance.now(); });
    s3.orbit.addEventListener('change', () => { pf.lastMove = performance.now(); });
    const render0 = R.render.bind(R);
    R.render = (scene, cam) => {
      if (pf.bypass) { R.shadowMap.needsUpdate = true; return render0(scene, cam); } // exports: full quality, fresh shadows
      const now = performance.now(), cfg = this.s3PerfCfg();
      if (R.shadowMap.enabled) {
        const h = this.s3ShadowHash(scene);
        if (pf.forceShadow || h !== pf.hash || s3.playing || s3.preview) { R.shadowMap.needsUpdate = true; pf.hash = h; pf.forceShadow = false; pf.shadowUpdates++; }
      }
      const moving = pf.orbiting || s3.dragging || s3.playing || !!s3.preview || now - pf.lastMove < 120;
      const target = moving ? (cfg.moveScale === 'auto' ? S3_AUTO_STEPS[pf.level] : Math.min(1, cfg.moveScale)) : 1;
      if (target !== pf.scale) { pf.scale = target; this.s3ApplyDpr(); }
      const t0 = performance.now(); render0(scene, cam); const ms = performance.now() - t0;
      // GPU work is queued, so render() returns fast: the real cost shows up as the gap between consecutive moving frames
      const frame = pf.prevMoving && moving && pf.lastAt && now - pf.lastAt < 10000 ? now - pf.lastAt : ms; pf.lastAt = now; pf.prevMoving = moving; pf.ms = ms; pf.renders++;
      if (moving) {
        pf.ema = pf.ema ? pf.ema * 0.8 + Math.max(ms, frame) * 0.2 : Math.max(ms, frame);
        if (cfg.moveScale === 'auto') {
          if (pf.ema > 22 && pf.level < S3_AUTO_STEPS.length - 1 && now - pf.changedAt > 400) { pf.level++; pf.changedAt = now; }
          else if (pf.ema < 11 && pf.level > 0 && now - pf.changedAt > 2500) { pf.level--; pf.changedAt = now; }
        }
        clearTimeout(pf.restT); pf.restT = setTimeout(() => { if (pf.scale !== 1) s3.dirty = true; }, 160); // one sharp frame once you stop
      } else if (cfg.shadows === 'auto') this.s3AutoShadow(ms);
    };
    this.s3PerfApply();
  },
  /** Cheap fingerprint of everything a shadow map depends on (caster + light transforms, visibility, intensity). */
  s3ShadowHash(scene) {
    let h = 0, n = 0; scene.updateMatrixWorld();
    scene.traverseVisible((o) => {
      if (!o.castShadow || !(o.isMesh || o.isLight || o.isPoints)) return;
      const e = o.matrixWorld.elements; n++;
      h += n * (e[0] + 2 * e[1] + 3 * e[2] + 5 * e[4] + 7 * e[5] + 11 * e[6] + 13 * e[8] + 17 * e[9] + 19 * e[10] + 23 * e[12] + 29 * e[13] + 31 * e[14]);
      if (o.isLight) h += n * 37 * (o.intensity || 0) + (o.shadow?.mapSize.x || 0);
    });
    return h + n * 1e6;
  },
  s3AutoShadow(ms) {
    const pf = this.s3.perf;
    if (ms > 45) { pf.restSlow++; pf.restFast = 0; } else if (ms < 15) { pf.restFast++; pf.restSlow = 0; }
    if (pf.restSlow >= 3 && pf.autoShadow !== 'standard') { pf.autoShadow = 'standard'; pf.restSlow = 0; window.DSDiag?.info('3d', `Heavy 3D scene (${Math.round(ms)} ms per frame): switched to standard shadows for speed (Settings › 3D performance)`); this.s3PerfApply(); }
    else if (pf.restFast >= 6 && pf.autoShadow === 'standard') { pf.autoShadow = null; pf.restFast = 0; this.s3PerfApply(); }
  },
  s3ApplyDpr() {
    const s3 = this.s3; if (!s3?.ready) return;
    const cfg = this.s3PerfCfg(), base = Math.min(cfg.maxDpr || 2, window.devicePixelRatio || 1), want = base * (s3.perf?.scale || 1);
    if (Math.abs(s3.renderer.getPixelRatio() - want) > 0.001) { s3.renderer.setPixelRatio(want); s3.dirty = true; }
  },
  /** Apply shadows + resolution from the current settings. objectOnly: an object was rebuilt (just refresh its shadows). */
  s3PerfApply(objectOnly) {
    const s3 = this.s3; if (!s3?.ready || !s3.perf) return;
    const T = s3.L.THREE, R = s3.renderer, cfg = this.s3PerfCfg(), pf = s3.perf;
    const mode = cfg.shadows === 'auto' ? (pf.autoShadow || 'soft') : cfg.shadows;
    const res = cfg.shadows === 'auto' ? (mode === 'standard' ? 1024 : 2048) : cfg.shadowRes;
    const type = { soft: T.PCFSoftShadowMap, standard: T.PCFShadowMap, low: T.BasicShadowMap }[mode];
    const on = mode !== 'off', typeChanged = (on && R.shadowMap.type !== type) || R.shadowMap.enabled !== on;
    R.shadowMap.enabled = on; if (on) R.shadowMap.type = type;
    s3.scene.traverse((o) => {
      if (o.isLight && o.shadow && o.castShadow && o.shadow.mapSize.x !== res) { o.shadow.mapSize.set(res, res); o.shadow.map?.dispose(); o.shadow.map = null; }
      if (typeChanged && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
    });
    pf.forceShadow = true; pf.mode = mode; pf.res = res;
    if (!objectOnly) this.s3ApplyDpr();
    s3.dirty = true;
  },
  s3PerfStats() {
    const s3 = this.s3, pf = s3?.perf; if (!pf) return null;
    let casters = 0, lights = 0; s3.scene.traverse(o => { if (o.castShadow && o.isMesh) casters++; if (o.isLight && o.castShadow) lights++; });
    return { ms: Math.round(pf.ms * 10) / 10, movingScale: Math.round((S3_AUTO_STEPS[pf.level] ?? 1) * 100), scaleNow: Math.round(pf.scale * 100), shadows: pf.mode, shadowRes: pf.res, shadowUpdates: pf.shadowUpdates, renders: pf.renders, casters, lights, dpr: s3.renderer.getPixelRatio() };
  },
};
Object.assign(StudioApp.prototype, Perf3DMixin);
