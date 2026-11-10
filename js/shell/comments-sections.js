/**
 * DesignStudio — comments in every section (v3.16.2).
 * The Comments button (C) now works in Design, Media and 3D. Media pins sit on a source pixel of the clip (and
 * remember the frame); 3D pins stick to the surface you click and follow that object when it moves or animates
 * (empty space → a point at the orbit target depth). You can keep orbiting / zooming in 3D while commenting.
 * Each section lists its own comments in the drawer; all are saved in the project and the share package.
 */
'use strict';

(function patchComments() {
  const P = StudioApp.prototype, toggle = P.toggleCommentMode, pins = P.positionPins, composer = P.openComposer, thread = P.openThread, pageC = P.pageComments;
  const sec = (app) => app.section || 'design';
  P.pageComments = function () {
    const s = sec(this);
    if (s === 'design') return pageC.call(this).filter(c => !c.sec);
    return (this.model.comments || []).filter(c => c.sec === s);
  };
  /** Move the pin layer + drawer into the current section's viewport. */
  P.cmMount = function () {
    const layer = document.getElementById('comment-layer'), drawer = document.getElementById('comment-drawer'), s = sec(this);
    const host = s === 'media' ? document.getElementById('md-vp') : s === '3d' ? document.getElementById('s3-view') : null;
    if (host) { host.appendChild(layer); host.appendChild(drawer); }
    else { document.getElementById('canvas-wrap').appendChild(layer); document.getElementById('center-viewport').appendChild(drawer); }
    layer.classList.toggle('cm-pass', s === '3d'); // 3D: clicks go to the viewport (orbit keeps working)
  };
  P.toggleCommentMode = function (on = !this.commentMode) {
    const s = sec(this);
    if (s === 'media' && !this.media) return;
    if (s === '3d' && !this.s3?.ready) { Utils.toast('3D is still loading…', 'ℹ️'); return; }
    if (on) this.cmMount();
    if (s === 'design') return toggle.call(this, on);
    // same as the Design version, minus the section guard
    const sg = this.section; this.section = 'design';
    try { toggle.call(this, on); } finally { this.section = sg; }
    if (on) { this.renderComments(); Utils.toast(s === '3d' ? 'Comments: click an object (or empty space) to pin a comment. Orbit still works. Esc to exit.' : 'Comments: click the frame to pin a comment. Esc to exit.', '💬'); }
  };
  /** Screen position (relative to the comment layer) of a comment, or null when it can't be shown. */
  P.cmScreen = function (c) {
    const s = sec(this);
    if (s === 'design') { const w = this.commentWorldPos(c); return this.renderer.worldToScreen(w.x, w.y); }
    if (s === 'media') { const G = this.mgGeom?.(); if (!G?.has) return null; return { x: G.ox + c.mx * G.s, y: G.oy + c.my * G.s }; }
    const s3 = this.s3; if (!s3?.ready) return null;
    const T = s3.L.THREE; let wp = new T.Vector3(c.wx, c.wy, c.wz);
    const o = c.objId && s3.objs.get(c.objId);
    if (o && c.local) { o.updateMatrixWorld(true); wp = o.localToWorld(new T.Vector3(...c.local)); }
    const p = this.g3Project ? this.g3Project(wp) : null; if (!p) return null;
    const ndc = wp.clone().project(s3.camera); if (ndc.z > 1 || ndc.z < -1) return null;
    return { x: p.x, y: p.y };
  };
  P.positionPins = function () {
    if (sec(this) === 'design') return pins.call(this);
    const layer = document.getElementById('comment-layer');
    layer.querySelectorAll('.cm-pin').forEach(pin => {
      const c = this.model.comments.find(x => x.id === pin.dataset.id), sp = c && this.cmScreen(c);
      pin.hidden = !sp; if (sp) pin.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
    });
    const pop = layer.querySelector('.cm-pop');
    if (pop?.dataset.id) { const c = this.model.comments.find(x => x.id === pop.dataset.id), sp = c && this.cmScreen(c); if (sp) this.placePop(pop, sp.x, sp.y); }
  };
  P.openThread = function (id, focus = false) {
    if (sec(this) === 'design') return thread.call(this, id, focus);
    const c = this.model.comments.find(x => x.id === id);
    if (c && sec(this) === 'media' && Number.isInteger(c.frame) && this.media?.frames?.[c.frame] && this.media.cur !== c.frame) { this.media.cur = c.frame; this.mediaDrawStage?.(); this.mediaRenderStrip?.(); }
    return thread.call(this, id, false);
  };
  P.openComposer = function (sx, sy, anchor) {
    const s = sec(this);
    if (s === 'design') return composer.call(this, sx, sy);
    if (!anchor) {
      if (s === 'media') {
        const G = this.mgGeom?.();
        if (!G?.has) { Utils.toast('Open media first — comments pin to the frame', 'ℹ️'); return; }
        const mx = Math.round((sx - G.ox) / G.s), my = Math.round((sy - G.oy) / G.s);
        if (mx < 0 || my < 0 || mx > G.w || my > G.h) { Utils.toast('Click on the frame to place the comment', 'ℹ️'); return; }
        anchor = { sec: 'media', mx, my, frame: this.media.cur };
      } else return;
    }
    this.closeCommentPopover();
    const layer = document.getElementById('comment-layer');
    const pop = document.createElement('div');
    pop.className = 'cm-pop';
    const needName = !this.author();
    pop.innerHTML = `${needName ? '<input type="text" class="cm-name" placeholder="Your name" aria-label="Your name" maxlength="40">' : ''}<textarea rows="3" placeholder="Add a comment…" aria-label="Comment" maxlength="2000"></textarea><div class="md-actions"><button type="button" class="btn-ghost" data-c="cancel">Cancel</button><button type="button" class="btn-primary" data-c="post">Comment</button></div>`;
    layer.appendChild(pop);
    this.placePop(pop, sx, sy);
    const ta = pop.querySelector('textarea');
    (pop.querySelector('.cm-name') || ta).focus();
    const post = () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      if (needName) this.setAuthor(pop.querySelector('.cm-name').value.trim() || 'Guest');
      this.model.comments.push({ id: Utils.uid('cm'), pageId: null, x: 0, y: 0, ...anchor, author: this.author(), text, time: Date.now(), resolved: false, replies: [] });
      this.commentsChanged(); pop.remove(); Utils.toast('Comment added', '💬');
    };
    pop.querySelector('[data-c="post"]').addEventListener('click', post);
    pop.querySelector('[data-c="cancel"]').addEventListener('click', () => pop.remove());
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } e.stopPropagation(); });
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  };
  /** 3D: a click (not a drag) on the viewport while commenting → pin on the surface under the cursor. */
  P.cm3DClick = function (e) {
    const s3 = this.s3, T = s3.L.THREE, cv = s3.renderer.domElement, r = cv.getBoundingClientRect();
    s3.raycaster.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s3.camera);
    const hit = s3.raycaster.intersectObject(s3.root, true).find(h => h.object.isMesh && h.object.visible && !h.object.material?.isShadowMaterial && !h.object.userData.editorOnly);
    let wp, objId = null, local = null;
    if (hit) {
      wp = hit.point.clone(); let o = hit.object; while (o && !o.userData.id) o = o.parent;
      if (o) { objId = o.userData.id; local = o.worldToLocal(wp.clone()).toArray().map(v => Utils.round(v, 4)); }
    } else {
      const n = s3.camera.getWorldDirection(new T.Vector3()).negate(), plane = new T.Plane().setFromNormalAndCoplanarPoint(n, s3.orbit.target);
      wp = new T.Vector3(); if (!s3.raycaster.ray.intersectPlane(plane, wp)) return;
    }
    const layer = document.getElementById('comment-layer'), lr = layer.getBoundingClientRect();
    this.openComposer(e.clientX - lr.left, e.clientY - lr.top, { sec: '3d', wx: Utils.round(wp.x, 4), wy: Utils.round(wp.y, 4), wz: Utils.round(wp.z, 4), objId, local });
  };
})();

const CommentsSectionsMixin = {
  bindCommentsSections() {
    // 3D clicks while commenting (capture, so the 3D selection doesn't fire)
    let down = null;
    document.addEventListener('pointerdown', (e) => { if (this.commentMode && this.section === '3d' && e.target.id === 's3-canvas' && e.button === 0) down = { x: e.clientX, y: e.clientY }; }, true);
    document.addEventListener('pointerup', (e) => {
      if (!down || !this.commentMode || this.section !== '3d' || e.target.id !== 's3-canvas') { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4; down = null;
      if (!moved) { e.stopPropagation(); this.cm3DClick(e); }
    }, true);
    document.addEventListener('click', (e) => { if (this.commentMode && this.section === '3d' && e.target.id === 's3-canvas') e.stopPropagation(); }, true);
    // C / Esc in Media and 3D
    document.addEventListener('keydown', (e) => {
      if (this.section === 'design' || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (e.key.toLowerCase() === 'c' && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); this.toggleCommentMode(); }
      else if (e.key === 'Escape' && this.commentMode) { e.preventDefault(); e.stopImmediatePropagation(); if (document.querySelector('.cm-pop')) this.closeCommentPopover(); else this.toggleCommentMode(false); }
    }, true);
    // pins follow the media zoom and the 3D camera / animation
    const loop = () => { if (this.commentMode && this.section !== 'design') this.positionPins(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
};
Object.assign(StudioApp.prototype, CommentsSectionsMixin);
