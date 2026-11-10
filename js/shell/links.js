/**
 * DesignStudio — dynamic links between Design, Media and 3D (v3.17.0).
 * A link renders a source into a target and keeps it in sync:
 *   3D view / 3D object  → Design image layer       (re-renders after every 3D edit)
 *   Media frame          → Design image layer / 3D plane (updates after every Media edit)
 *   Design layer / frame → 3D plane texture         (updates after every Design edit)
 *   Design layer         → Media (one-off copy, to compress / convert)
 * 🔗 in the top bar opens the Links panel (all links, update, go to source / target, auto on/off, unlink) and the
 * “Send to …” actions. Double-click a linked layer in Design to jump to its source.
 * Data: model.links = [{ id, name, src: {kind:'3d', objId?, cam, transparent} | {kind:'media', frame} | {kind:'design', elId},
 *   target: {kind:'design', elId, assetId} | {kind:'3d', objId, assetId}, auto, updated, stale }]
 */
'use strict';

(function patchLinks() {
  const P = StudioApp.prototype, commit = P.commit, s3c = P.s3Commit, setClip = P.mediaSetClip, bind3 = P.bind3D, bindM = P.bindMedia;
  P.commit = function (...a) { const r = commit.apply(this, a); if (!this._lkApplying) this.lkDirty('design'); return r; };
  P.s3Commit = function (...a) { const r = s3c.apply(this, a); this.lkDirty('3d'); return r; };
  P.mediaSetClip = function (...a) { const r = setClip.apply(this, a); this.lkDirty('media'); return r; };
  P.bind3D = function () { bind3.call(this); this.lkTool3D(); };
  P.bindMedia = function () { bindM.call(this); this.lkToolMedia(); };
})();

const LK_ICON = { get design() { return Icons.svg('palette', 14); }, get media() { return Icons.svg('film', 14); }, get '3d'() { return Icons.svg('cube', 14); } };

const LinksMixin = {
  bindLinks() {
    if (!Array.isArray(this.model.links)) this.model.links = [];
    const tb = document.querySelector('.top-bar-right');
    const btn = document.createElement('button');
    btn.id = 'btn-links'; btn.className = 'menu-btn'; btn.type = 'button'; btn.title = 'Links between Design, Media & 3D';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg><span class="lk-count"></span>';
    tb.insertBefore(btn, document.getElementById('btn-comments') || document.getElementById('btn-play-proto'));
    btn.addEventListener('click', () => this.lkPanel());
    // Design: double-click a linked layer → its source
    document.getElementById('canvas-wrap')?.addEventListener('dblclick', (e) => {
      const sel = this.model.topSelected?.() || []; if (sel.length !== 1) return;
      const l = this.model.links.find(x => x.target.kind === 'design' && x.target.elId === sel[0].id); if (!l) return;
      e.stopPropagation(); e.preventDefault(); if (l.src.kind === '3d' && this.l3Adjust) this.l3Adjust(l); else this.lkGoSource(l);
    }, true);
    this.lkBadge();
  },
  lkBadge() { const el = document.querySelector('#btn-links .lk-count'); if (el) el.textContent = this.model.links.length ? String(this.model.links.length) : ''; },
  lkTool3D() {
    const anchor = document.getElementById('s3-focus'); if (!anchor || document.getElementById('s3-link')) return;
    anchor.insertAdjacentHTML('afterend', '<button id="s3-link" class="btn-ghost" title="Use this 3D scene / object in Design (stays linked)">' + Icons.svg('swap', 14) + ' To Design</button>');
    document.getElementById('s3-link').addEventListener('click', (e) => this.t3Popup(e.currentTarget, [
      { head: 'Use in Design — stays linked' },
      { label: 'Current view (whole scene)', run: () => this.lk3DToDesign(false) },
      { label: 'Selected object only', disabled: !this.s3?.sel, run: () => this.lk3DToDesign(true) },
      '-', { label: 'Links panel…', run: () => this.lkPanel() }
    ]));
  },
  lkToolMedia() {
    const anchor = document.getElementById('md-to-design'); if (!anchor || document.getElementById('md-link')) return;
    anchor.insertAdjacentHTML('afterend', '<button id="md-link" class="btn-ghost" title="Use this frame in Design or 3D (stays linked)">' + Icons.svg('swap', 14) + ' Use in…</button>');
    document.getElementById('md-link').addEventListener('click', (e) => {
      if (!this.mediaHasClip()) { Utils.toast('Open media first', 'ℹ️'); return; }
      this.t3Popup(e.currentTarget, [
        { head: `Frame ${this.media.cur + 1} — stays linked` },
        { label: 'Design (image layer)', run: () => this.lkMediaTo('design') }, { label: '3D (image plane)', run: () => this.lkMediaTo('3d') },
        '-', { label: 'Links panel…', run: () => this.lkPanel() }
      ]);
    });
  },

  // ------------------------------------------------------------------ rendering sources
  lkWait3D: async function () {
    if (this.section !== '3d') this.setSection('3d');
    for (let i = 0; i < 300 && !this.s3?.ready; i++) await new Promise(r => setTimeout(r, 50));
    return !!this.s3?.ready;
  },
  /** Render a 3D source to a canvas (transparent background unless the link says otherwise). */
  lkRender3D(src, w, h) {
    const s3 = this.s3, T = s3.L.THREE;
    const cam = new T.PerspectiveCamera(src.cam.fov || 40, w / h, 0.05, 500);
    cam.position.fromArray(src.cam.pos); cam.quaternion.fromArray(src.cam.quat);
    const hidden = [], bg = s3.scene.background, alpha = s3.renderer.getClearAlpha();
    s3.scene.traverse(o => { if ((o.userData.editorOnly || o === s3.gizmo.getHelper?.()) && o.visible) { hidden.push(o); o.visible = false; } });
    const target = src.objId && s3.objs.get(src.objId);
    if (src.objId && !target) return null;
    if (target) { // isolate the object and frame it from the stored direction
      const keep = new Set(); target.traverse(o => keep.add(o)); for (let p = target.parent; p; p = p.parent) keep.add(p);
      s3.root.traverse(o => { if (o.isMesh && !keep.has(o) && o.visible) { hidden.push(o); o.visible = false; } });
      const box = new T.Box3().setFromObject(target), c = box.getCenter(new T.Vector3()), r = Math.max(0.01, box.getBoundingSphere(new T.Sphere()).radius);
      const dir = new T.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
      const dist = (r / Math.sin(THREE_DEG(cam.fov) / 2)) * 1.08 * (src.zoom || 1);
      cam.position.copy(c).addScaledVector(dir, dist); cam.lookAt(c);
    }
    cam.updateProjectionMatrix();
    if (src.transparent !== false) { s3.scene.background = null; s3.renderer.setClearAlpha(0); }
    const prev = s3.renderer.getSize(new T.Vector2()), pr = s3.renderer.getPixelRatio();
    s3.renderer.setPixelRatio(1); s3.renderer.setSize(w, h, false);
    s3.renderer.render(s3.scene, cam);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(s3.renderer.domElement, 0, 0, w, h);
    s3.renderer.setPixelRatio(pr); s3.renderer.setSize(prev.x, prev.y, false);
    s3.scene.background = bg; s3.renderer.setClearAlpha(alpha);
    hidden.forEach(o => { o.visible = true; });
    s3.dirty = true;
    return c;
  },
  /** Source → canvas, or null when the source isn't available right now (kept stale until it is). */
  lkRenderSource(l, maxPx = 1600) {
    const s = l.src;
    if (s.kind === '3d') {
      if (!this.s3?.ready) return null;
      const a = s.aspect || 1, w = Math.round(a >= 1 ? maxPx : maxPx * a), h = Math.round(a >= 1 ? maxPx / a : maxPx);
      return this.lkRender3D(s, Math.max(16, w), Math.max(16, h));
    }
    if (s.kind === 'media') { const f = this.media?.frames?.[Math.min(s.frame, (this.media.frames.length || 1) - 1)]; return f ? f.canvas : null; }
    if (s.kind === 'design') {
      const el = this.model.getElementById(s.elId); if (!el) return null;
      const b = this.renderer.boundsOf([el]); if (!b) return null;
      return this.renderer.renderToCanvas({ roots: [el], scale: Math.min(4, maxPx / Math.max(1, b.w, b.h)), bg: null });
    }
    return null;
  },
  lkEncode(c) {
    const png = c.toDataURL('image/png');
    try { const webp = c.toDataURL('image/webp', 0.92); if (webp.startsWith('data:image/webp') && webp.length < png.length * 0.8) return webp; } catch (_) { /* ignore */ }
    return png;
  },

  // ------------------------------------------------------------------ applying to targets
  async lkApply(l) {
    const m = this.model, t = l.target;
    if (t.kind === 'design' && !m.getElementById(t.elId)) return this.lkRemove(l, true);
    if (t.kind === '3d' && !(m.scene3d?.objects || []).some(o => o.id === t.objId)) return this.lkRemove(l, true);
    const c = this.lkRenderSource(l, t.kind === '3d' ? 1024 : (l.src.res || 1600));
    if (!c) { l.stale = true; return false; }
    const url = this.lkEncode(c);
    if (t.kind === 'design') {
      const old = m.assets[t.assetId]; m.assets[t.assetId] = url;
      if (old && old !== url) this.renderer.images?.delete(old);
      this.requestRender();
    } else {
      const sc = this.s3Scene(); sc.assets = sc.assets || {}; sc.assets[t.assetId] = url;
      if (this.s3?.ready && this.s3.objs.get(t.objId)) await this.s3RebuildObject(t.objId);
    }
    l.stale = false; l.updated = Date.now();
    this.unsaved = true; this.scheduleAutosave?.();
    return true;
  },
  lkDirty(kind) {
    if (!this.model?.links?.length) return;
    const ls = this.model.links.filter(l => l.src.kind === kind);
    if (!ls.length) return;
    ls.forEach(l => { l.stale = true; });
    const T = this.__lkT || (this.__lkT = {});
    clearTimeout(T[kind]);
    T[kind] = setTimeout(() => this.lkRefresh(ls.filter(l => l.auto !== false)), 450);
  },
  async lkRefresh(list = this.model.links) {
    this._lkApplying = true;
    try { for (const l of [...list]) await this.lkApply(l); } finally { this._lkApplying = false; }
    this.lkRenderPanel?.();
  },
  lkRemove(l, silent) {
    this.model.links = this.model.links.filter(x => x !== l);
    this.lkBadge(); this.lkRenderPanel?.(); this.unsaved = true; this.scheduleAutosave?.();
    if (!silent) Utils.toast('Unlinked — the layer keeps its last image', '🔗');
    return false;
  },

  // ------------------------------------------------------------------ creating links
  lkNew(src, target, name) {
    const l = { id: Utils.uid('lk'), name, src, target, auto: true, updated: Date.now(), stale: false };
    this.model.links.push(l); this.lkBadge();
    return l;
  },
  /** Place an image layer in Design for a source canvas and link it. */
  lkPlaceInDesign(c, src, name) {
    const m = this.model;
    if (this.section !== 'design') this.setSection('design');
    const max = 480, s = Math.min(1, max / Math.max(c.width, c.height));
    const el = new StudioElement('image', 0, 0, Math.max(8, Math.round(c.width * s)), Math.max(8, Math.round(c.height * s)));
    el.fills = []; el.name = `${name} (linked)`;
    el.assetId = Utils.uid('img'); m.assets[el.assetId] = this.lkEncode(c);
    const pos = this.viewCenter(el); el.x = pos.x; el.y = pos.y;
    const parent = this.frameAt?.({ x: el.x + el.width / 2, y: el.y + el.height / 2 });
    const l = this.lkNew(src, { kind: 'design', elId: el.id, assetId: el.assetId }, name);
    m.insertElement(el, parent ? parent.id : null); m.select([el.id]);
    this._lkApplying = true; try { this.commit(); } finally { this._lkApplying = false; }
    this.requestRender();
    Utils.toast(`Placed “${name}” in Design — linked: it updates when the ${src.kind === '3d' ? '3D scene' : 'media'} changes. Double-click it to edit the source.`, '🔗');
    return l;
  },
  async lk3DToDesign(objOnly) {
    if (!(await this.lkWait3D())) return;
    const s3 = this.s3, v = document.getElementById('s3-view');
    if (objOnly && !s3.sel) { Utils.toast('Select an object first', 'ℹ️'); return; }
    const def = objOnly ? this.def3(s3.sel) : null;
    const aspect = objOnly ? 1 : Utils.round(v.clientWidth / Math.max(1, v.clientHeight), 4);
    const src = { kind: '3d', objId: objOnly ? s3.sel : null, aspect, transparent: true, cam: { pos: s3.camera.position.toArray(), quat: s3.camera.quaternion.toArray(), fov: s3.camera.fov, target: s3.orbit.target.toArray() } };
    const c = this.lkRender3D(src, aspect >= 1 ? 1600 : Math.round(1600 * aspect), aspect >= 1 ? Math.round(1600 / aspect) : 1600);
    if (!c) return;
    // trim transparent margins for single objects so the layer hugs the render
    this.lkPlaceInDesign(c, src, objOnly ? `${def?.name || 'Object'} (3D)` : `${this.title || 'Scene'} (3D view)`);
  },
  async lkMediaTo(kind) {
    const m = this.media; if (!this.mediaHasClip()) return;
    const src = { kind: 'media', frame: m.cur }, c = m.frames[m.cur].canvas, name = `${(m.name || 'Media').replace(/\.[a-z0-9]+$/i, '')} – frame ${m.cur + 1}`;
    if (kind === 'design') return this.lkPlaceInDesign(c, src, name);
    return this.lkPlaneIn3D(c, src, name);
  },
  async lkDesignTo3D() {
    const sel = this.model.topSelected?.() || [];
    if (!sel.length) { Utils.toast('Select a layer or frame in Design first', 'ℹ️'); return; }
    const el = sel[0], src = { kind: 'design', elId: el.id };
    const c = this.lkRenderSource({ src }, 1024); if (!c) return;
    return this.lkPlaneIn3D(c, src, el.name || 'Design');
  },
  /** Add an unlit image plane in 3D showing the source, linked. */
  async lkPlaneIn3D(c, src, name) {
    const url = this.lkEncode(c);
    if (!(await this.lkWait3D())) return;
    const sc = this.s3Scene(), aid = Utils.uid('tex'); sc.assets = sc.assets || {}; sc.assets[aid] = url;
    const a = c.width / Math.max(1, c.height), w = a >= 1 ? 2.4 : Utils.round(2.4 * a, 3), h = a >= 1 ? Utils.round(2.4 / a, 3) : 2.4;
    const mat = { ...Scene3DCore.newObject('plane').mat, type: 'basic', color: '#ffffff', map: aid, override: true };
    const def = await this.s3Add('plane', { name: `${name} (linked)`, geo: { w, h }, mat, py: Utils.round(h / 2 + 0.02, 3), castShadow: false, receiveShadow: false });
    if (!def) return;
    this.lkNew(src, { kind: '3d', objId: def.id, assetId: aid }, name);
    Utils.toast(`“${name}” is in 3D as a linked image plane — it updates when the ${src.kind === 'design' ? 'Design layer' : 'media'} changes`, '🔗');
  },
  async lkDesignToMedia() {
    const sel = this.model.topSelected?.() || [];
    if (!sel.length) { Utils.toast('Select a layer or frame in Design first', 'ℹ️'); return; }
    const c = this.lkRenderSource({ src: { kind: 'design', elId: sel[0].id } }, 2048); if (!c) return;
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    this.setSection('media');
    if (!this.media) this.bindMedia();
    this.mediaFiles([new File([blob], `${sel[0].name || 'Design'}.png`, { type: 'image/png' })], MediaUI.tool('open'));
    Utils.toast('Copied to Media — compress, resize or convert it there', '🎞');
  },

  // ------------------------------------------------------------------ navigation
  lkGoSource(l) {
    const s = l.src;
    if (s.kind === 'design') { this.setSection('design'); const el = this.model.getElementById(s.elId); if (el) { this.model.select([el.id]); this.zoomSelection?.(); this.requestRender(); } }
    else if (s.kind === '3d') { this.lkWait3D().then(ok => { if (ok && s.objId) this.s3Select(s.objId); }); Utils.toast('Edit the 3D scene — the linked layer updates automatically', '🧊'); }
    else { this.setSection('media'); if (this.media?.frames?.[s.frame]) { this.media.cur = s.frame; this.mediaDrawStage?.(); this.mediaRenderStrip?.(); } else Utils.toast('Open the same media again to keep this link updating', 'ℹ️'); }
  },
  lkGoTarget(l) {
    const t = l.target;
    if (t.kind === 'design') { this.setSection('design'); if (this.model.getElementById(t.elId)) { this.model.select([t.elId]); this.zoomSelection?.(); this.requestRender(); } }
    else this.lkWait3D().then(ok => { if (ok) this.s3Select(t.objId); });
  },
  lkName(kind, ref) {
    if (kind === 'design') return this.model.getElementById(ref)?.name || 'missing layer';
    if (kind === '3d') return ref ? (this.def3?.(ref)?.name || (this.model.scene3d?.objects || []).find(o => o.id === ref)?.name || 'missing object') : 'Scene view';
    return '';
  },
  lkSrcLabel(l) { const s = l.src; return s.kind === 'design' ? `Design · ${this.lkName('design', s.elId)}` : s.kind === '3d' ? `3D · ${s.objId ? this.lkName('3d', s.objId) : 'scene view'}` : `Media · frame ${s.frame + 1}`; },
  lkTgtLabel(l) { const t = l.target; return t.kind === 'design' ? `Design · ${this.lkName('design', t.elId)}` : `3D · ${this.lkName('3d', t.objId)}`; },

  // ------------------------------------------------------------------ panel
  lkPanel() {
    document.getElementById('lk-panel')?.closest('.ds-dialog-overlay')?.remove();
    const d = this.dialog({ title: 'Links — Design · Media · 3D', body: '<div id="lk-panel" class="lk-panel"></div>', wide: true, actions: [{ label: 'Update all', run: async () => { if (this.model.links.some(l => l.src.kind === '3d') && !this.s3?.ready) await this.lkWait3D(); await this.lkRefresh(); Utils.toast('Links updated', '🔗'); } }, { label: 'Close', primary: true }] });
    this._lkDlg = d; d.el.querySelector('.ds-dialog')?.classList.add('lk-dlg'); // width without :has() (Firefox ESR)
    this.lkRenderPanel();
  },
  lkRenderPanel() {
    const box = document.getElementById('lk-panel'); if (!box) return;
    const m = this.model, sel = m.topSelected?.() || [], ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };
    const has3 = !!this.s3?.ready, hasMd = this.mediaHasClip?.();
    const acts = [
      ['d3', 'design>cube', `Selected Design layer → 3D plane${sel.length ? ` (${Utils.escapeHtml(sel[0].name)})` : ''}`, !sel.length],
      ['dm', 'design>film', 'Selected Design layer → Media (copy)', !sel.length],
      ['3d', 'cube>design', '3D view → Design layer', false],
      ['3o', 'cube>design', `Selected 3D object → Design layer`, !(has3 && this.s3.sel)],
      ['md', 'film>design', 'Media frame → Design layer', !hasMd],
      ['m3', 'film>cube', 'Media frame → 3D plane', !hasMd]
    ];
    box.innerHTML = `<div class="lk-acts">${acts.map(([k, ic, lab, dis]) => `<button type="button" class="lk-act" data-a="${k}"${dis ? ' disabled' : ''}><span class="lk-pair">${ic.split('>').map(n => Icons.svg(n === 'design' ? 'palette' : n, 15)).join('<i>→</i>')}</span>${lab}</button>`).join('')}</div>
      <div class="lk-list">${m.links.length ? m.links.map(l => `<div class="lk-row${l.stale ? ' stale' : ''}" data-id="${l.id}">
        <div class="lk-ends"><b>${LK_ICON[l.src.kind]} ${Utils.escapeHtml(this.lkSrcLabel(l))}</b><span>→ ${LK_ICON[l.target.kind]} ${Utils.escapeHtml(this.lkTgtLabel(l))}</span>
        <small>${l.stale ? (l.src.kind === 'media' && !hasMd ? 'Waiting — open the media again' : l.src.kind === '3d' && !has3 ? 'Waiting — opens 3D to update' : 'Out of date') : `Updated ${ago(l.updated)}`}</small></div>
        <label class="lk-auto" title="Update automatically when the source changes"><input type="checkbox" data-k="auto"${l.auto !== false ? ' checked' : ''}> Auto</label>
        <button type="button" class="btn-ghost" data-k="up">Update</button><button type="button" class="btn-ghost" data-k="src">Source</button><button type="button" class="btn-ghost" data-k="tgt">Target</button><button type="button" class="btn-ghost danger" data-k="un">Unlink</button></div>`).join('') : '<p class="lk-empty">No links yet. Use the buttons above (or ⇄ in the 3D and Media toolbars). Linked layers update automatically when their source changes.</p>'}</div>`;
    const close = () => box.closest('.ds-dialog-overlay')?.remove();
    box.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      close();
      ({ d3: () => this.lkDesignTo3D(), dm: () => this.lkDesignToMedia(), '3d': () => this.lk3DToDesign(false), '3o': () => this.lk3DToDesign(true), md: () => this.lkMediaTo('design'), m3: () => this.lkMediaTo('3d') })[b.dataset.a]();
    }));
    box.querySelectorAll('.lk-row').forEach(r => {
      const l = m.links.find(x => x.id === r.dataset.id); if (!l) return;
      r.querySelector('[data-k="auto"]').addEventListener('change', (e) => { l.auto = e.target.checked; this.unsaved = true; this.scheduleAutosave?.(); });
      r.querySelector('[data-k="up"]').addEventListener('click', async () => { if (l.src.kind === '3d' && !this.s3?.ready) { close(); await this.lkWait3D(); } await this.lkRefresh([l]); });
      r.querySelector('[data-k="src"]').addEventListener('click', () => { close(); this.lkGoSource(l); });
      r.querySelector('[data-k="tgt"]').addEventListener('click', () => { close(); this.lkGoTarget(l); });
      r.querySelector('[data-k="un"]').addEventListener('click', () => this.lkRemove(l));
    });
  }
};
function THREE_DEG(d) { return (d * Math.PI) / 180; }
Object.assign(StudioApp.prototype, LinksMixin);
