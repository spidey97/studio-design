/**
 * DesignStudio — 3D rulers & guides (v3.16.0).
 * Rulers on the 3D viewport edges measure world units at the orbit target: the top ruler shows X (or Z when you
 * look along X), the left ruler shows Y (or Z from the top). Drag from a ruler to drop a guide plane — top ruler →
 * a plane across the vertical axis (e.g. Y = 1.5), left ruler → across the horizontal axis (e.g. X = −2).
 * Guides are colour-coded per axis (X red, Y green, Z blue); objects moved with the gizmo snap their edges and centre
 * to guides. The ⌗ corner lists guides (edit value, delete), adds guides at the selection and toggles rulers.
 * Data: scene3d.guides = [{ id, axis: 'x'|'y'|'z', pos }] — saved with the project.
 */
'use strict';

const G3_COLORS = { x: '#ff5d6c', y: '#4ade80', z: '#5aa8ff' }, G3_R = 20;

(function patch3DGuides() {
  const P = StudioApp.prototype, bind = P.bind3D, live = P.s3LiveTransform, rebuild = P.s3Rebuild;
  P.bind3D = function () { bind.call(this); this.bindGuides3D(); };
  P.s3LiveTransform = function () { this.g3SnapSelection?.(); return live.call(this); };
  P.s3Rebuild = async function (...a) { const r = await rebuild.apply(this, a); this.g3Build?.(); return r; };
})();

const Guides3DMixin = {
  bindGuides3D() {
    const view = document.getElementById('s3-view');
    if (!view || document.getElementById('g3-rx')) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('designstudio.g3.v1') || '{}') || {}; } catch (_) { /* ignore */ }
    this.g3 = { rulers: saved.rulers !== false, snap: saved.snap !== false, group: null, sig: '' };
    view.insertAdjacentHTML('beforeend', `<button type="button" class="g3-corner" id="g3-corner" title="3D rulers & guides" aria-label="3D rulers and guides">⌗</button><canvas class="g3-ruler g3-rx" id="g3-rx"></canvas><canvas class="g3-ruler g3-ry" id="g3-ry"></canvas>`);
    document.getElementById('g3-rx').addEventListener('pointerdown', (e) => this.g3Drag(e, 'top'));
    document.getElementById('g3-ry').addEventListener('pointerdown', (e) => this.g3Drag(e, 'left'));
    document.getElementById('g3-corner').addEventListener('click', (e) => this.g3Menu(e.currentTarget));
    const snapBtn = document.getElementById('s3-snap');
    if (snapBtn) { snapBtn.insertAdjacentHTML('afterend', '<button id="s3-guides" class="btn-ghost" title="Rulers & guides">' + Icons.svg('ruler', 14) + ' Guides</button>'); document.getElementById('s3-guides').addEventListener('click', (e) => this.g3Menu(e.currentTarget)); }
    view.classList.toggle('g3-on', this.g3.rulers);
    const loop = () => { if (this.section === '3d' && this.s3?.ready && this.g3.rulers) this.g3DrawRulers(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    this.g3Build();
  },
  g3Save() { try { localStorage.setItem('designstudio.g3.v1', JSON.stringify({ rulers: this.g3.rulers, snap: this.g3.snap })); } catch (_) { /* ignore */ } },
  g3List() { const sc = this.s3Scene(); if (!Array.isArray(sc.guides)) sc.guides = []; return sc.guides; },
  /** Which world axes the rulers show for the current camera. */
  g3Axes() {
    const s3 = this.s3, d = s3.camera.position.clone().sub(s3.orbit.target).normalize();
    const top = Math.abs(d.x) > Math.abs(d.z) ? 'z' : 'x', left = Math.abs(d.y) > 0.82 ? (top === 'x' ? 'z' : 'x') : 'y';
    return { top, left };
  },
  g3Project(v) { const s3 = this.s3, c = s3.renderer.domElement, p = v.clone().project(s3.camera); return { x: (p.x + 1) / 2 * c.clientWidth, y: (1 - p.y) / 2 * c.clientHeight, behind: p.z > 1 }; },
  /** World value of an axis under a screen point, on the plane through the target facing the camera. */
  g3Unproject(clientX, clientY, axis) {
    const s3 = this.s3, T = s3.L.THREE, c = s3.renderer.domElement, r = c.getBoundingClientRect();
    const ndc = new T.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new T.Raycaster(); ray.setFromCamera(ndc, s3.camera);
    const n = s3.camera.getWorldDirection(new T.Vector3()).negate(), plane = new T.Plane().setFromNormalAndCoplanarPoint(n, s3.orbit.target);
    const hit = new T.Vector3(); return ray.ray.intersectPlane(plane, hit) ? hit[axis] : 0;
  },
  g3DrawRulers() {
    const s3 = this.s3, c3 = s3.renderer.domElement, W = c3.clientWidth, H = c3.clientHeight;
    const sig = `${s3.camera.matrixWorld.elements.map(v => v.toFixed(4)).join()}|${W}x${H}|${this.g3List().map(g => g.axis + g.pos).join()}|${this.g3.drag ? this.g3.drag.pos : ''}`;
    if (sig === this.g3.sig) return; this.g3.sig = sig;
    const ax = this.g3Axes(), tgt = s3.orbit.target, dpr = window.devicePixelRatio || 1, css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue('--bg-header').trim() || '#2d2d30', line = css.getPropertyValue('--border-color').trim() || '#3a3a3e', sub = css.getPropertyValue('--text-sub').trim() || '#949494';
    document.getElementById('g3-corner').textContent = `${ax.top.toUpperCase()}${ax.left.toUpperCase()}`;
    const draw = (cv, horiz, axis) => {
      const len = horiz ? W - G3_R : H - G3_R, w = horiz ? len : G3_R, h = horiz ? G3_R : len;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = bg; c.fillRect(0, 0, w, h);
      c.strokeStyle = line; c.beginPath(); if (horiz) { c.moveTo(0, G3_R - 0.5); c.lineTo(w, G3_R - 0.5); } else { c.moveTo(G3_R - 0.5, 0); c.lineTo(G3_R - 0.5, h); } c.stroke();
      // screen position of a world value along the axis (through the target)
      const at = (v) => { const p = tgt.clone(); p[axis] = v; const s = this.g3Project(p); return (horiz ? s.x : s.y) - G3_R; };
      const p0 = at(tgt[axis]), p1 = at(tgt[axis] + 1), ppu = Math.abs(p1 - p0); // px per unit
      if (!(ppu > 0.5) || !Number.isFinite(ppu)) return;
      const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100], major = steps.find(s => s * ppu >= 48) || 100, minor = steps.filter(s => s < major && s * ppu >= 7).pop() || major;
      const sign = Math.sign(p1 - p0), vAt = (p) => tgt[axis] + (p - p0) / (ppu * sign);
      let va = vAt(0), vb = vAt(len); if (va > vb) [va, vb] = [vb, va];
      c.font = '9px Inter, -apple-system, sans-serif'; c.fillStyle = sub; c.textBaseline = 'top';
      for (let v = Math.floor(va / minor) * minor; v <= vb; v += minor) {
        const p = Math.round(p0 + (v - tgt[axis]) * ppu * sign) + 0.5, isM = Math.abs(v / major - Math.round(v / major)) < 1e-6;
        c.strokeStyle = isM ? sub : line; c.beginPath(); if (horiz) { c.moveTo(p, isM ? 8 : 14); c.lineTo(p, G3_R); } else { c.moveTo(isM ? 8 : 14, p); c.lineTo(G3_R, p); } c.stroke();
        if (isM) { const lab = `${+v.toFixed(2)}`; if (horiz) c.fillText(lab, p + 2, 1); else { c.save(); c.translate(1, p - 2); c.rotate(-Math.PI / 2); c.fillText(lab, 0, 0); c.restore(); } }
      }
      c.fillStyle = G3_COLORS[axis]; if (horiz) c.fillRect(0, G3_R - 2, w, 2); else c.fillRect(G3_R - 2, 0, 2, h);
      for (const g of this.g3List()) if (g.axis === axis) { const p = p0 + (g.pos - tgt[axis]) * ppu * sign; c.fillStyle = G3_COLORS[axis]; if (horiz) c.fillRect(p - 1, 10, 2, 10); else c.fillRect(10, p - 1, 10, 2); }
    };
    draw(document.getElementById('g3-rx'), true, ax.top);
    draw(document.getElementById('g3-ry'), false, ax.left);
  },
  /** Drag from a ruler: top ruler → guide across the left (vertical) axis, left ruler → across the top axis. */
  g3Drag(e, from) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const ax = this.g3Axes(), axis = from === 'top' ? ax.left : ax.top, list = this.g3List();
    const g = { id: Utils.uid('g3'), axis, pos: 0 }, view = document.getElementById('s3-view');
    const tag = document.createElement('div'); tag.className = 'mg-tag'; document.body.appendChild(tag);
    let moved = false, off = true;
    const mv = (ev) => {
      const r = view.getBoundingClientRect(); moved = true;
      off = from === 'top' ? ev.clientY - r.top < G3_R : ev.clientX - r.left < G3_R;
      let v = this.g3Unproject(ev.clientX, ev.clientY, axis);
      v = ev.altKey ? Utils.round(v, 3) : Math.round(v / 0.05) * 0.05;
      g.pos = Utils.round(v, 3); this.g3.drag = g;
      if (!list.includes(g)) list.push(g);
      tag.textContent = off ? 'Release on the ruler to cancel' : `${axis.toUpperCase()} = ${g.pos}`;
      tag.style.background = G3_COLORS[axis]; tag.style.left = `${ev.clientX + 12}px`; tag.style.top = `${ev.clientY + 12}px`;
      this.g3Build();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); tag.remove(); this.g3.drag = null;
      if (!moved || off) { const i = list.indexOf(g); if (i >= 0) list.splice(i, 1); this.g3Build(); return; }
      this.g3Build(); this.s3Commit('Add guide');
      Utils.toast(`Guide ${axis.toUpperCase()} = ${g.pos} — objects snap to it while moving`, '📐');
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
  /** (Re)build the guide planes in the scene. */
  g3Build() {
    const s3 = this.s3; if (!s3?.ready || !this.g3) return;
    const T = s3.L.THREE;
    if (this.g3.group) { s3.scene.remove(this.g3.group); this.g3.group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const grp = this.g3.group = new T.Group(); grp.name = 'ds-guides'; grp.userData.helper = true; grp.userData.editorOnly = true;
    const S = 24;
    for (const g of this.g3List()) {
      const color = new T.Color(G3_COLORS[g.axis]);
      const plane = new T.Mesh(new T.PlaneGeometry(S, S), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: T.DoubleSide, depthWrite: false }));
      const edges = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(S, S, 1, 1)), new T.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
      const cross = new T.LineSegments(new T.BufferGeometry().setFromPoints([new T.Vector3(-S / 2, 0, 0), new T.Vector3(S / 2, 0, 0), new T.Vector3(0, -S / 2, 0), new T.Vector3(0, S / 2, 0)]), new T.LineDashedMaterial({ color, dashSize: 0.2, gapSize: 0.15, transparent: true, opacity: 0.8 }));
      cross.computeLineDistances();
      const holder = new T.Group(); holder.add(plane, edges, cross);
      if (g.axis === 'x') holder.rotation.y = Math.PI / 2; else if (g.axis === 'y') holder.rotation.x = -Math.PI / 2;
      holder.position[g.axis] = g.pos;
      holder.traverse(o => { o.raycast = () => {}; o.renderOrder = 5; });
      grp.add(holder);
    }
    s3.scene.add(grp);
    s3.dirty = true; this.g3.sig = '';
  },
  /** While the gizmo moves an object: snap its bounds (min / centre / max) to guide planes. */
  g3SnapSelection() {
    const s3 = this.s3, g3 = this.g3; if (!g3?.snap || !s3.dragging || s3.gizmoMode !== 'translate') return;
    const o = s3.objs.get(s3.sel), list = this.g3List(); if (!o || !list.length) return;
    const T = s3.L.THREE, box = new T.Box3().setFromObject(o); if (box.isEmpty()) return;
    const thr = 0.12 * Math.max(0.5, s3.camera.position.distanceTo(s3.orbit.target) / 10);
    const shift = new T.Vector3();
    for (const axis of ['x', 'y', 'z']) {
      const gs = list.filter(g => g.axis === axis); if (!gs.length) continue;
      const cands = [box.min[axis], (box.min[axis] + box.max[axis]) / 2, box.max[axis]];
      let best = null;
      for (const g of gs) for (const cv of cands) { const d = g.pos - cv; if (Math.abs(d) < thr && (best === null || Math.abs(d) < Math.abs(best))) best = d; }
      if (best !== null) shift[axis] = best;
    }
    if (!shift.lengthSq()) return;
    const wp = o.getWorldPosition(new T.Vector3()).add(shift);
    o.position.copy(o.parent ? o.parent.worldToLocal(wp) : wp);
    o.updateMatrixWorld(true);
  },
  g3AddAtSelection(axis) {
    const s3 = this.s3, o = s3.objs.get(s3.sel), T = s3.L.THREE;
    const p = o ? new T.Box3().setFromObject(o).getCenter(new T.Vector3()) : s3.orbit.target.clone();
    this.g3List().push({ id: Utils.uid('g3'), axis, pos: Utils.round(p[axis], 3) });
    this.g3Build(); this.s3Commit('Add guide');
  },
  g3Menu(anchor) {
    const g3 = this.g3, list = this.g3List();
    const items = [{ head: '3D rulers & guides' },
      { label: 'Rulers', check: g3.rulers, run: () => { g3.rulers = !g3.rulers; this.g3Save(); document.getElementById('s3-view').classList.toggle('g3-on', g3.rulers); g3.sig = ''; } },
      { label: 'Snap objects to guides', check: g3.snap, run: () => { g3.snap = !g3.snap; this.g3Save(); } }, '-',
      { head: this.s3.sel ? 'Add guide through the selection' : 'Add guide through the view centre' },
      ...['x', 'y', 'z'].map(a => ({ label: `${a.toUpperCase()} plane`, run: () => this.g3AddAtSelection(a) }))];
    if (list.length) {
      items.push('-', { head: `Guides (${list.length}) — click to edit` });
      for (const g of list) items.push({ label: `${g.axis.toUpperCase()} = ${g.pos}`, run: () => this.g3EditGuide(g) });
      items.push({ label: 'Clear all guides', run: () => { list.splice(0); this.g3Build(); this.s3Commit('Clear guides'); } });
    }
    // Rulers off: the corner is hidden, so open from the 3D toolbar too
    this.t3Popup(anchor, items);
  },
  async g3EditGuide(g) {
    const v = await this.promptText(`Guide ${g.axis.toUpperCase()}`, 'Position (world units) — type “delete” to remove', String(g.pos));
    if (v === null || v === undefined) return;
    const list = this.g3List();
    if (/^(del|delete|remove)$/i.test(String(v).trim())) list.splice(list.indexOf(g), 1);
    else { const n = Number(v); if (!Number.isFinite(n)) return; g.pos = Utils.round(n, 3); }
    this.g3Build(); this.s3Commit('Edit guide');
  }
};
Object.assign(StudioApp.prototype, Guides3DMixin);
