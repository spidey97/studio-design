/**
 * DesignStudio — adjust linked 3D layers inside Design (v3.17.1).
 * Select a layer linked from 3D and the Design panel gets a “3D object” card: a live preview you can drag to orbit
 * (Shift+drag turns the object itself, wheel zooms), view presets, rotation / scale / colour / metal / rough for a
 * linked object, transparent background, pose at time and resolution. Double-click the layer on the canvas to adjust
 * it in place (same gestures, Esc / Enter / click outside to finish). Edits go to the real 3D scene (undoable in 3D)
 * and the layer re-renders live; the 3D engine boots in the background, no need to open the 3D tab.
 */
'use strict';

(function patchProps() {
  const P = StudioApp.prototype, upd = P.updatePropertiesUI;
  P.updatePropertiesUI = function (...a) { const r = upd.apply(this, a); this.l3Panel?.(); return r; };
})();

const L3_VIEWS = [['Front', 0, 0], ['¾', -35, 22], ['Side', -90, 0], ['Back', 180, 0], ['Top', 0, 89], ['Low', -25, -18]];

const Link3DEditMixin = {
  /** Start the 3D engine without leaving Design. */
  async l3Boot() {
    try {
      if (!this.s3) this.bind3D();
      if (!this.s3.ready) await this.s3Boot();
      if (this.s3.sceneRef !== this.model.scene3d) { await this.s3Rebuild(); this.s3ResetPose?.(); this.s3SetTime?.(this.s3.time || 0); }
      return !!this.s3.ready;
    } catch (e) { console.error(e); Utils.toast(`3D engine could not start: ${e.message}`, '❌'); return false; }
  },
  l3LinkOf(el) { return el && (this.model.links || []).find(l => l.src.kind === '3d' && l.target.kind === 'design' && l.target.elId === el.id); },

  // ------------------------------------------------------------------ camera helpers
  /** Orbit the link's camera by dx / dy pixels (yaw around world Y, pitch around the camera's right axis). */
  l3Orbit(l, dx, dy) {
    const T = this.s3.L.THREE, src = l.src, cam = src.cam;
    const q = new T.Quaternion().fromArray(cam.quat), pos = new T.Vector3().fromArray(cam.pos);
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(q);
    const pivot = cam.target ? new T.Vector3().fromArray(cam.target) : pos.clone().addScaledVector(fwd, 8);
    const off = pos.clone().sub(pivot), sph = new T.Spherical().setFromVector3(off.lengthSq() ? off : new T.Vector3(0, 0, 8));
    sph.theta -= dx * 0.01; sph.phi = Utils.clamp(sph.phi - dy * 0.01, 0.02, Math.PI - 0.02);
    off.setFromSpherical(sph);
    this.l3SetCam(l, pivot.clone().add(off), pivot);
  },
  l3SetCam(l, pos, pivot) {
    const T = this.s3.L.THREE, c = new T.PerspectiveCamera(l.src.cam.fov || 40, 1, 0.05, 500);
    c.position.copy(pos); c.lookAt(pivot);
    Object.assign(l.src.cam, { pos: c.position.toArray().map(v => Utils.round(v, 4)), quat: c.quaternion.toArray().map(v => Utils.round(v, 6)), target: pivot.toArray().map(v => Utils.round(v, 4)) });
  },
  l3View(l, yawDeg, pitchDeg) {
    const T = this.s3.L.THREE, cam = l.src.cam, pos = new T.Vector3().fromArray(cam.pos);
    const pivot = cam.target ? new T.Vector3().fromArray(cam.target) : new T.Vector3();
    const d = Math.max(0.5, pos.distanceTo(pivot)), y = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    this.l3SetCam(l, pivot.clone().add(new T.Vector3(Math.sin(y) * Math.cos(p) * d, Math.sin(p) * d, Math.cos(y) * Math.cos(p) * d)), pivot);
  },
  l3Zoom(l, f) {
    if (l.src.objId) { l.src.zoom = Utils.clamp((l.src.zoom || 1) * f, 0.25, 6); return; }
    const T = this.s3.L.THREE, cam = l.src.cam, pos = new T.Vector3().fromArray(cam.pos);
    const pivot = cam.target ? new T.Vector3().fromArray(cam.target) : pos.clone().add(new T.Vector3(0, 0, -8).applyQuaternion(new T.Quaternion().fromArray(cam.quat)));
    const off = pos.sub(pivot).multiplyScalar(f); if (off.length() < 0.2) return;
    this.l3SetCam(l, pivot.clone().add(off), pivot);
  },

  // ------------------------------------------------------------------ live rendering
  /** Quick render into the layer (and preview) while dragging; full resolution on `final`. */
  l3Live(l, final = false) {
    if (!this.s3?.ready) return;
    if (final) { clearTimeout(this._l3T); this._l3Pending = false; this.lkApply(l).then(() => { this.l3Preview(l); this.lkRenderPanel?.(); }); return; }
    this.l3Preview(l);
    if (this._l3Pending) return;
    this._l3Pending = true;
    this._l3T = setTimeout(() => {
      this._l3Pending = false;
      const a = l.src.aspect || 1, px = 560, c = this.lkRender3D(l.src, Math.round(a >= 1 ? px : px * a), Math.round(a >= 1 ? px / a : px));
      if (!c) return;
      const m = this.model, old = m.assets[l.target.assetId];
      let url; try { url = c.toDataURL('image/webp', 0.85); } catch (_) { url = c.toDataURL('image/png'); }
      m.assets[l.target.assetId] = url; if (old && old !== url) this.renderer.images?.delete(old);
      this.requestRender();
    }, 70);
  },
  l3Preview(l) {
    const cv = document.getElementById('l3-prev'); if (!cv || !this.s3?.ready) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(40, cv.clientWidth), h = Math.max(40, cv.clientHeight);
    const c = this.lkRender3D(l.src, Math.round(w * dpr), Math.round(h * dpr)); if (!c) return;
    if (cv.width !== c.width || cv.height !== c.height) { cv.width = c.width; cv.height = c.height; }
    const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(c, 0, 0);
  },
  /** Pointer gestures shared by the preview and the in-place overlay. */
  l3Gestures(el, l) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.s3?.ready) return;
      e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      let lx = e.clientX, ly = e.clientY, moved = false;
      const def = l.src.objId && this.def3(l.src.objId), r0 = def ? { rx: def.rx || 0, ry: def.ry || 0 } : null, x0 = e.clientX, y0 = e.clientY;
      const mv = (ev) => {
        const dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; moved = true;
        if (ev.shiftKey && def) { // turn the object itself
          this.s3Edit(def, 'ry', Utils.round(r0.ry + (ev.clientX - x0) * 0.6, 1), 'live');
          this.s3Edit(def, 'rx', Utils.round(Utils.clamp(r0.rx + (ev.clientY - y0) * 0.6, -180, 180), 1), 'live');
          this.l3SyncFields(l);
        } else this.l3Orbit(l, dx, dy);
        this.l3Live(l);
      };
      const up = () => {
        el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up);
        if (!moved) return;
        if (def && r0 && (def.rx !== r0.rx || def.ry !== r0.ry)) { this.s3Edit(def, 'ry', def.ry, 'commit'); } // undo step in 3D (also refreshes)
        this.unsaved = true; this.scheduleAutosave?.(); this.l3Live(l, true);
      };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
    el.addEventListener('wheel', (e) => { if (!this.s3?.ready) return; e.preventDefault(); e.stopPropagation(); this.l3Zoom(l, e.deltaY > 0 ? 1.1 : 1 / 1.1); this.l3Live(l); clearTimeout(this._l3W); this._l3W = setTimeout(() => this.l3Live(l, true), 350); }, { passive: false });
  },

  // ------------------------------------------------------------------ Design panel card
  l3Panel() {
    const design = document.getElementById('panel-tab-design'); if (!design) return;
    let sec = document.getElementById('sec-3dlink');
    const sel = this.model.topSelected(), l = sel.length === 1 ? this.l3LinkOf(sel[0]) : null;
    if (!l) { if (sec) sec.hidden = true; this._l3Cur = null; return; }
    if (!sec) { sec = document.createElement('div'); sec.className = 'prop-section l3-sec'; sec.id = 'sec-3dlink'; const empty = document.getElementById('sec-empty'); design.insertBefore(sec, empty ? empty.nextSibling : design.firstChild); }
    sec.hidden = false;
    if (this._l3Cur === l.id && sec.childElementCount) { this.l3SyncFields(l); return; }
    this._l3Cur = l.id;
    const def = l.src.objId && (this.model.scene3d?.objects || []).find(o => o.id === l.src.objId);
    const a = l.src.aspect || 1, anim = this.model.activeAnimation, has3dAnim = Object.keys(anim?.tracks || {}).some(k => k.startsWith('o3_'));
    const num = (k, lab, step = 1) => `<label class="l3-f"><span>${lab}</span><input type="number" data-p="${k}" step="${step}"></label>`;
    sec.innerHTML = `<div class="prop-section-header"><span>🧊 ${def ? Utils.escapeHtml(def.name) : '3D scene view'} · linked</span><button type="button" class="prop-icon-btn" data-a="open" title="Open in the 3D tab">↗</button></div>
      <div class="l3-prev-wrap" style="aspect-ratio:${Utils.round(a, 3)}"><canvas id="l3-prev" aria-label="3D preview — drag to orbit, Shift+drag to turn the object, wheel to zoom"></canvas><div class="l3-load" id="l3-load">Starting 3D…</div></div>
      <p class="l3-hint">Drag: orbit${def ? ' · Shift+drag: turn object' : ''} · Wheel: zoom · Double-click the layer to adjust on canvas</p>
      <div class="l3-views">${L3_VIEWS.map(([n], i) => `<button type="button" data-v="${i}">${n}</button>`).join('')}</div>
      ${def ? `<div class="l3-grid">${num('rx', 'Rot X')}${num('ry', 'Rot Y')}${num('rz', 'Rot Z')}${num('s', 'Scale', 0.05)}</div>
        ${def.mat ? `<div class="l3-grid l3-mat"><label class="l3-f"><span>Colour</span><input type="color" data-p="color"></label><label class="l3-f"><span>Metal</span><input type="range" min="0" max="1" step="0.01" data-p="metalness"></label><label class="l3-f"><span>Rough</span><input type="range" min="0" max="1" step="0.01" data-p="roughness"></label></div>` : ''}` : ''}
      ${has3dAnim ? `<label class="l3-f l3-time"><span>Pose at</span><input type="range" min="0" max="${anim.duration}" step="${1 / (anim.fps || 30)}" data-p="time"><b id="l3-tv"></b></label>` : ''}
      <div class="l3-row"><label class="check-label"><input type="checkbox" data-p="transparent"> Transparent</label><select data-p="res" aria-label="Render size" title="Render size"><option value="800">Draft 800px</option><option value="1600">HD 1600px</option><option value="2400">Sharp 2400px</option></select></div>
      <div class="l3-row"><button type="button" class="btn-ghost" data-a="update">↻ Update</button><button type="button" class="btn-ghost" data-a="adjust">✥ Adjust on canvas</button><button type="button" class="btn-ghost danger" data-a="unlink">Unlink</button></div>`;
    const prev = sec.querySelector('#l3-prev');
    this.l3Gestures(prev, l);
    sec.querySelector('[data-a="open"]').addEventListener('click', () => this.lkGoSource(l));
    sec.querySelector('[data-a="update"]').addEventListener('click', async () => { if (await this.l3Boot()) this.l3Live(l, true); });
    sec.querySelector('[data-a="adjust"]').addEventListener('click', () => this.l3Adjust(l));
    sec.querySelector('[data-a="unlink"]').addEventListener('click', () => { this.lkRemove(l); this._l3Cur = null; this.l3Panel(); });
    sec.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { if (!this.s3?.ready) return; const [, y, p] = L3_VIEWS[+b.dataset.v]; this.l3View(l, y, p); this.l3Live(l, true); }));
    sec.querySelectorAll('[data-p]').forEach(inp => {
      const k = inp.dataset.p;
      const apply = (final) => {
        if (!this.s3?.ready) return;
        const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'color' || inp.tagName === 'SELECT' ? inp.value : Number(inp.value);
        if (k === 'transparent') { l.src.transparent = v; return this.l3Live(l, true); }
        if (k === 'res') { l.src.res = +v; return this.l3Live(l, true); }
        if (k === 'time') { this.s3SetTime(v); document.getElementById('l3-tv').textContent = `${v.toFixed(2)}s`; return this.l3Live(l, final); }
        const d = this.def3(l.src.objId); if (!d || (typeof v === 'number' && !Number.isFinite(v))) return;
        if (k === 's') ['sx', 'sy', 'sz'].forEach(p => this.s3Edit(d, p, v, final ? 'commit' : 'live'));
        else this.s3Edit(d, k, v, final ? 'commit' : 'live');
        this.l3Live(l, final);
      };
      inp.addEventListener('input', () => apply(false));
      inp.addEventListener('change', () => apply(true));
    });
    this.l3SyncFields(l);
    this.l3Boot().then(ok => { const ld = document.getElementById('l3-load'); if (ld) ld.hidden = ok; if (ok && this._l3Cur === l.id) { this.l3SyncFields(l); this.l3Preview(l); } });
  },
  l3SyncFields(l) {
    const sec = document.getElementById('sec-3dlink'); if (!sec) return;
    const def = l.src.objId && (this.model.scene3d?.objects || []).find(o => o.id === l.src.objId);
    sec.querySelectorAll('[data-p]').forEach(inp => {
      if (document.activeElement === inp) return;
      const k = inp.dataset.p;
      if (k === 'transparent') inp.checked = l.src.transparent !== false;
      else if (k === 'res') inp.value = String(l.src.res || 1600);
      else if (k === 'time') { inp.value = this.s3?.time || 0; const tv = document.getElementById('l3-tv'); if (tv) tv.textContent = `${(+inp.value).toFixed(2)}s`; }
      else if (def) {
        if (k === 's') inp.value = Utils.round(def.sx ?? 1, 3);
        else if (['color', 'metalness', 'roughness'].includes(k)) inp.value = def.mat?.[k] ?? (k === 'color' ? '#ffffff' : 0.5);
        else inp.value = Utils.round(def[k] || 0, 1);
      }
    });
  },

  // ------------------------------------------------------------------ in-place adjust on the canvas
  async l3Adjust(l) {
    this.l3AdjustEnd();
    const el = this.model.getElementById(l.target.elId); if (!el) return;
    if (!(await this.l3Boot())) return;
    const wrap = document.getElementById('canvas-wrap');
    const ov = document.createElement('div'); ov.className = 'l3-adjust'; ov.setAttribute('aria-label', 'Adjust 3D: drag to orbit, Shift+drag to turn the object, wheel to zoom, Esc to finish');
    ov.innerHTML = '<div class="l3-chip">🧊 Drag: orbit · Shift+drag: turn · Wheel: zoom · <b>Esc</b> done</div>';
    wrap.appendChild(ov);
    this.l3Gestures(ov, l);
    const place = () => {
      if (!ov.isConnected) return;
      const b = this.renderer.boundsOf([el]) || el, p0 = this.renderer.worldToScreen(b.x, b.y), z = this.model.zoom;
      Object.assign(ov.style, { left: `${p0.x}px`, top: `${p0.y}px`, width: `${b.w * z}px`, height: `${b.h * z}px` });
      this._l3Raf = requestAnimationFrame(place);
    };
    place();
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.l3AdjustEnd(); } };
    const out = (e) => { if (!ov.contains(e.target)) this.l3AdjustEnd(); };
    window.addEventListener('keydown', key, true);
    setTimeout(() => window.addEventListener('pointerdown', out, true), 0);
    this._l3Adj = { ov, key, out, l };
  },
  l3AdjustEnd() {
    const a = this._l3Adj; if (!a) return;
    this._l3Adj = null; cancelAnimationFrame(this._l3Raf);
    a.ov.remove(); window.removeEventListener('keydown', a.key, true); window.removeEventListener('pointerdown', a.out, true);
    this.l3Live(a.l, true);
  }
};
Object.assign(StudioApp.prototype, Link3DEditMixin);
