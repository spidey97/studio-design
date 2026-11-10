/**
 * DesignStudio — 3D section (v3.3.0), Spline-style.
 * Scene = model.scene3d { settings, objects[], assets{} }. Keyframes for 3D objects live in the shared animations
 * (track ids `o3_…`), so state machines, global inputs and listeners drive Design and 3D alike.
 * three.js is loaded lazily from js/vendor/three-bundle.js the first time the section opens.
 */
'use strict';

const S3_KEY_PROPS = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'];

const Space3DMixin = {
  bind3D() {
    const ws = document.getElementById('space3d-workspace');
    ws.classList.add('s3-ws');
    const prim = [['box', '■', 'Box'], ['sphere', '●', 'Sphere'], ['cylinder', '▮', 'Cylinder'], ['cone', '▲', 'Cone'], ['torus', '◯', 'Torus'], ['knot', '∞', 'Knot'], ['capsule', '⬮', 'Capsule'], ['icosa', '⬡', 'Icosa'], ['plane', '▭', 'Plane'], ['text', 'T', 'Text']];
    const lights = [['dirLight', '☀', 'Sun'], ['pointLight', '💡', 'Point'], ['spotLight', '🔦', 'Spot'], ['hemiLight', '◐', 'Hemi'], ['ambLight', '○', 'Ambient']];
    ws.innerHTML = `
      <aside class="s3-side" aria-label="3D objects">
        <div class="s3-sec-title">Add</div>
        <div class="s3-add">${prim.map(([t, i, l]) => `<button data-add="${t}" title="Add ${l}"><span>${i}</span>${l}</button>`).join('')}</div>
        <div class="s3-sec-title">Lights</div>
        <div class="s3-add">${lights.map(([t, i, l]) => `<button data-add="${t}" title="Add ${l} light"><span>${i}</span>${l}</button>`).join('')}</div>
        <div class="s3-add s3-add-wide"><button id="s3-import" title="GLB / glTF (embedded) / OBJ / STL">${Icons.svg('upload', 14)} Import model…</button><button id="s3-extrude" title="Extrude the layers selected in Design">${Icons.svg('extrude', 14)} Extrude from Design</button></div>
        <div class="s3-sec-title">Scene <button id="s3-scene-btn" class="s3-link" title="Scene settings">settings</button></div>
        <div id="s3-outliner" class="s3-outliner" role="tree" aria-label="Scene objects"></div>
      </aside>
      <section class="s3-center">
        <div class="s3-toolbar">
          <div class="s3-seg" role="group" aria-label="Transform mode">
            <button data-gz="translate" class="active" title="Move (W)">✥ Move</button><button data-gz="rotate" title="Rotate (E)">⟳ Rotate</button><button data-gz="scale" title="Scale (R)">⤡ Scale</button>
          </div>
          <button id="s3-space" class="btn-ghost" title="Gizmo space">World</button>
          <button id="s3-snap" class="btn-ghost" title="Snap (0.25 · 15° · 0.1)">Snap</button>
          <button id="s3-focus" class="btn-ghost" title="Focus selection (F)">Focus</button>
          <button id="s3-undo" class="btn-ghost" title="Undo (Ctrl+Z)" disabled>↶</button><button id="s3-redo" class="btn-ghost" title="Redo (Ctrl+Shift+Z)" disabled>↷</button>
          <span class="md-spacer"></span>
          <button id="s3-preview" class="btn-ghost" title="Run state machines & listeners (Rive-style). Esc stops.">▶ Preview</button>
          <div class="s3-menu-wrap">
            <div id="s3-export-menu" class="s3-menu" role="menu" aria-label="3D export" hidden>
              <button role="menuitem" data-x="png">PNG image (current view, up to 4K)</button><button role="menuitem" data-x="glb">GLB model (+ animations)</button><button role="menuitem" data-x="html">Interactive 3D HTML (viewer + state machines)</button><button role="menuitem" data-x="media">Animation → Media (GIF · MP4 · WebM …)</button>
            </div></div>
        </div>
        <div id="s3-view" class="s3-view"><canvas id="s3-canvas" tabindex="0" aria-label="3D viewport"></canvas><div id="s3-loading" class="s3-loading">Loading 3D engine…</div><div id="s3-hint" class="s3-hint">Drag: orbit · Right-drag: pan · Wheel: zoom · Click: select · W/E/R: move/rotate/scale</div></div>
        <div class="s3-anim" aria-label="3D animation">
          <select id="s3-anim-sel" aria-label="Animation"></select><button id="s3-anim-add" class="btn-ghost" title="New animation">＋</button>
          <button id="s3-play" class="btn-ghost" title="Play / pause (Space)">▶</button>
          <div class="s3-scrub"><input type="range" id="s3-time" min="0" max="5" step="0.01" value="0" aria-label="Time"><div id="s3-keys" class="s3-keys"></div></div>
          <span id="s3-tlabel" class="s3-tlabel">0.00 s</span>
          <button id="s3-key" class="btn-ghost" title="Keyframe the selected object at this time (K)">◆ Key</button>
          <button id="s3-unkey" class="btn-ghost" title="Delete keys of the selection at this time">◇ Unkey</button>
          <button id="s3-autokey" class="btn-ghost" title="Auto-key: edits create keyframes">● Auto-key</button>
          <label class="s3-dur">Duration <input type="number" id="s3-dur" min="0.1" max="600" step="0.1"></label>
          <select id="s3-loop" aria-label="Loop"><option value="loop">Loop</option><option value="pingPong">Ping-pong</option><option value="oneShot">One shot</option></select>
        </div>
      </section>
      <aside id="s3-panel" class="s3-panel" aria-label="3D inspector"></aside>
      <input type="file" id="s3-file" accept=".glb,.gltf,.obj,.stl" hidden>`;
    this.s3 = { ready: false, objs: new Map(), sel: null, time: 0, playing: false, autoKey: false, undo: [], redo: [], dirty: true, gizmoMode: 'translate' };
    const $ = (id) => document.getElementById(id);
    ws.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => this.s3Add(b.dataset.add)));
    ws.querySelectorAll('[data-gz]').forEach(b => b.addEventListener('click', () => this.s3GizmoMode(b.dataset.gz)));
    $('s3-import').addEventListener('click', () => $('s3-file').click());
    $('s3-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) this.s3Import(f); });
    $('s3-extrude').addEventListener('click', () => this.s3ExtrudeFromDesign());
    $('s3-scene-btn').addEventListener('click', () => this.s3Select(null));
    $('s3-space').addEventListener('click', () => { const g = this.s3.gizmo; if (!g) return; g.setSpace(g.space === 'world' ? 'local' : 'world'); $('s3-space').textContent = g.space === 'world' ? 'World' : 'Local'; });
    $('s3-snap').addEventListener('click', () => this.s3ToggleSnap());
    $('s3-focus').addEventListener('click', () => this.s3Focus());
    $('s3-undo').addEventListener('click', () => this.s3Undo());
    $('s3-redo').addEventListener('click', () => this.s3Redo());
    $('s3-preview').addEventListener('click', () => (this.s3.preview ? this.s3StopPreview() : this.s3StartPreview()));
    document.addEventListener('click', () => { const mm = $('s3-export-menu'); if (mm) mm.hidden = true; });
    $('s3-export-menu').querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => this.s3Export(b.dataset.x)));
    // animation bar
    $('s3-anim-sel').addEventListener('change', (e) => { this.setActiveAnimation ? this.setActiveAnimation(e.target.value) : (this.model.activeAnimationId = e.target.value); this.s3ResetPose(); this.s3SetTime(0); this.s3RenderAnim(); });
    $('s3-anim-add').addEventListener('click', () => { const m = this.model; const a = StudioModel.newAnimation(`3D Animation ${m.animations.length + 1}`, { duration: 3 }); m.animations.push(a); m.activeAnimationId = a.id; this.s3ResetPose(); this.s3SetTime(0); this.s3Commit(); Utils.toast(`Created “${a.name}” — move objects with Auto-key on, or press ◆ Key`, '🎬'); });
    $('s3-play').addEventListener('click', () => this.s3Play(!this.s3.playing));
    $('s3-time').addEventListener('input', (e) => { this.s3Play(false); this.s3SetTime(+e.target.value); });
    $('s3-key').addEventListener('click', () => this.s3KeySelection());
    $('s3-unkey').addEventListener('click', () => this.s3UnkeySelection());
    $('s3-autokey').addEventListener('click', () => { this.s3.autoKey = !this.s3.autoKey; $('s3-autokey').classList.toggle('on', this.s3.autoKey); });
    $('s3-dur').addEventListener('change', (e) => { const a = this.model.activeAnimation; a.duration = Utils.clamp(Utils.num(e.target.value, a.duration), 0.1, 600); this.s3Commit(); });
    $('s3-loop').addEventListener('change', (e) => { this.model.activeAnimation.loop = e.target.value; this.s3Commit(); });
    // viewport
    const view = $('s3-view');
    view.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
    view.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (!f) return; e.preventDefault(); this.s3Import(f); });
    document.addEventListener('keydown', (e) => this.s3Key(e));
  },

  async enter3D() {
    if (!this.s3) this.bind3D();
    try { await this.s3Boot(); } catch (e) { console.error(e); document.getElementById('s3-loading').textContent = e.message; return; }
    if (this.s3.sceneRef !== this.model.scene3d) await this.s3Rebuild();
    const snap = this.s3Snapshot();
    if (this.s3.lastSnap && this.s3.lastSnap !== snap) { this.s3.undo = []; this.s3.redo = []; } // edited in Design meanwhile: old 3D undo steps would overwrite it
    this.s3.lastSnap = snap;
    this.s3Resize();
    this.s3ResetPose(); this.s3SetTime(Math.min(this.s3.time, this.model.activeAnimation.duration));
    this.s3RenderAll();
  },
  s3LoadLib() {
    if (window.DS3D) return Promise.resolve(window.DS3D);
    if (this._s3LibP) return this._s3LibP;
    this._s3LibP = new Promise((res, rej) => {
      if (window.DSEmbed?.has('js/vendor/three-bundle.js')) { // single-file release: the engine is embedded
        try { DSEmbed.run('js/vendor/three-bundle.js'); } catch (e) { this._s3LibP = null; rej(e); return; }
        if (window.DS3D) res(window.DS3D); else { this._s3LibP = null; rej(new Error('3D engine failed to initialise')); }
        return;
      }
      const s = document.createElement('script');
      s.src = 'js/vendor/three-bundle.js';
      s.onload = () => (window.DS3D ? res(window.DS3D) : rej(new Error('3D engine failed to initialise')));
      s.onerror = () => { this._s3LibP = null; rej(new Error('Could not load the 3D engine (js/vendor/three-bundle.js)')); };
      document.head.appendChild(s);
    });
    return this._s3LibP;
  },
  async s3Boot() {
    const s3 = this.s3;
    if (s3.ready) return;
    const L = s3.L = await this.s3LoadLib(), T = L.THREE;
    const canvas = document.getElementById('s3-canvas');
    let renderer;
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch (e) { throw new Error('WebGL is not available in this browser — the 3D section needs it'); }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(40, 1, 0.05, 500);
    const orbit = new L.OrbitControls(camera, canvas);
    orbit.enableDamping = true; orbit.dampingFactor = 0.12;
    orbit.addEventListener('change', () => { s3.dirty = true; });
    const gizmo = new L.TransformControls(camera, canvas);
    gizmo.setSize(0.9);
    gizmo.addEventListener('dragging-changed', (e) => { orbit.enabled = !e.value; s3.dragging = e.value; if (!e.value) this.s3GizmoEnd(); });
    gizmo.addEventListener('objectChange', () => { s3.dirty = true; this.s3LiveTransform(); });
    gizmo.addEventListener('change', () => { s3.dirty = true; });
    const grid = new T.GridHelper(20, 40, 0x555a6a, 0x30333d);
    grid.material.transparent = true; grid.material.opacity = 0.55; grid.userData.editorOnly = true;
    const selBox = new T.BoxHelper(undefined, 0x0d99ff); selBox.visible = false; selBox.userData.editorOnly = true;
    Object.assign(s3, { renderer, scene, camera, orbit, gizmo, grid, selBox, ready: true, env: Scene3DCore.envMap(L, renderer), raycaster: new T.Raycaster() });
    scene.add(grid, selBox, gizmo.getHelper());
    new ResizeObserver(() => this.s3Resize()).observe(document.getElementById('s3-view'));
    // picking & preview pointer routing
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; if (s3.preview) { this.s3PreviewPointer(e, 'pointerDown'); if (this.s3DeepHitIds(e).some(id => s3.preview.listened.has(id))) { s3.orbit.enabled = false; s3.orbitHeld = true; } } }); // QA-06: gestures on interactive objects don't orbit
    window.addEventListener('pointerup', () => { if (s3.orbitHeld) { s3.orbit.enabled = true; s3.orbitHeld = false; } });
    canvas.addEventListener('pointermove', (e) => { if (s3.preview) this.s3PreviewPointer(e, 'move'); });
    canvas.addEventListener('pointerleave', () => { if (s3.preview) this.s3PreviewPointer(null, 'leave'); });
    // wheel = scroll progress for Scroll triggers while previewing (orbit zoom is paused then)
    canvas.addEventListener('wheel', (e) => {
      const P = s3.preview;
      if (!P?.engine || s3.orbit.enableZoom) return;
      e.preventDefault();
      P.scroll = Math.max(0, Math.min(100, P.scroll + e.deltaY * 0.05));
      P.engine.scroll(P.scroll);
    }, { passive: false });
    canvas.addEventListener('pointerup', (e) => {
      if (s3.preview) { this.s3PreviewPointer(e, 'pointerUp'); return; }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || s3.dragging || gizmo.dragging) return;
      const hit = this.s3Pick(e);
      if (hit !== undefined && !gizmo.axis) this.s3Select(hit);
    });
    document.getElementById('s3-loading').hidden = true;
  },
  s3Resize() {
    const s3 = this.s3;
    if (!s3?.ready) return;
    const v = document.getElementById('s3-view'), w = Math.max(10, v.clientWidth), h = Math.max(10, v.clientHeight);
    s3.renderer.setSize(w, h, false);
    s3.camera.aspect = w / h; s3.camera.updateProjectionMatrix();
    s3.dirty = true;
  },
  s3Scene() {
    const m = this.model;
    if (!m.scene3d || !Array.isArray(m.scene3d.objects)) {
      const C = Scene3DCore;
      m.scene3d = { version: 1, settings: C.defaultSettings(), assets: {}, objects: [
        C.newObject('box', { name: 'Rounded box', px: -0.9, py: 0.5, ry: 20, mat: { ...C.newObject('box').mat, color: '#7c8cff' } }),
        C.newObject('sphere', { name: 'Sphere', px: 0.9, py: 0.6, mat: { ...C.newObject('sphere').mat, color: '#ff7a59', metalness: 0.2, roughness: 0.25 } }),
        C.newObject('dirLight', { name: 'Key light', px: 3, py: 6, pz: 4 }),
        C.newObject('hemiLight', { name: 'Fill light', py: 4 })
      ] };
    }
    const sc = m.scene3d;
    sc.settings = { ...Scene3DCore.defaultSettings(), ...(sc.settings || {}) };
    sc.assets ||= {};
    return sc;
  },
  def3(id) { return this.model.scene3d?.objects.find(o => o.id === id) || null; },

  // ------------------------------------------------------------------ build
  async s3Rebuild() {
    const s3 = this.s3, L = s3.L, sc = this.s3Scene();
    s3.sceneRef = sc;
    const token = (s3.buildToken = (s3.buildToken || 0) + 1);
    let built;
    try { built = await Scene3DCore.buildAll(L, sc); } catch (e) { console.error(e); Utils.toast(`3D scene could not be built: ${e.message}`, '❌'); built = { root: new L.THREE.Group(), objs: new Map() }; }
    if (token !== s3.buildToken) return;
    if (s3.root) { s3.scene.remove(s3.root); this.s3Dispose(s3.root); }
    if (s3.ground) s3.scene.remove(s3.ground);
    s3.root = built.root; s3.objs = built.objs;
    s3.scene.add(s3.root);
    for (const [id, o] of s3.objs) this.s3AddHelper(o, id);
    if (!s3.lastSnap) s3.lastSnap = this.s3Snapshot();
    if (s3.sel && !s3.objs.has(s3.sel)) s3.sel = null;
    this.s3ApplySettings();
    if (!s3.camInit) { this.s3UseSceneCamera(); s3.camInit = true; }
    this.s3AttachGizmo();
    s3.dirty = true;
  },
  async s3RebuildObject(id) {
    const s3 = this.s3, def = this.def3(id), old = s3.objs.get(id);
    if (!def || !old) return this.s3Rebuild();
    const obj = await Scene3DCore.build(s3.L, def, this.model.scene3d.assets);
    const parent = old.parent;
    for (const ch of [...old.children]) if (ch.userData.id && s3.objs.get(ch.userData.id) === ch) obj.add(ch);
    parent.add(obj); parent.remove(old);
    if (obj.isDirectionalLight || obj.isSpotLight) { obj.target.position.set(0, 0, 0); s3.root.add(obj.target); }
    this.s3Dispose(old);
    s3.objs.set(id, obj);
    this.s3AddHelper(obj, id);
    this.s3ApplyTimeTo(id);
    this.s3AttachGizmo();
    s3.dirty = true;
  },
  s3Dispose(o) { o.traverse(c => { c.geometry?.dispose?.(); (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => { m?.map?.dispose?.(); m?.dispose?.(); }); }); },
  /** Lights get a small pickable marker (editor only). */
  s3AddHelper(o, id) {
    if (!o.isLight) return;
    const T = this.s3.L.THREE;
    const mk = new T.Mesh(new T.OctahedronGeometry(0.12), new T.MeshBasicMaterial({ color: 0xffd34d, wireframe: true }));
    mk.userData.editorOnly = true; mk.userData.pickId = id;
    o.add(mk);
  },
  s3ApplySettings() {
    const s3 = this.s3, s = this.s3Scene().settings;
    Scene3DCore.applySettings(s3.L, s3.renderer, s3.scene, s, s3.env);
    if (s3.ground) s3.scene.remove(s3.ground);
    s3.ground = Scene3DCore.makeGround(s3.L, s);
    if (s3.ground) s3.scene.add(s3.ground);
    s3.grid.visible = s.grid !== false;
    document.getElementById('s3-view').classList.toggle('transparent', !!s.transparent);
    s3.dirty = true;
  },
  s3UseSceneCamera() {
    const s3 = this.s3, c = this.s3Scene().settings.camera;
    s3.camera.position.set(...c.pos); s3.orbit.target.set(...c.target); s3.camera.fov = c.fov; s3.camera.updateProjectionMatrix(); s3.orbit.update();
  },

  // ------------------------------------------------------------------ selection & gizmo
  s3Pick(e) {
    const s3 = this.s3, r = s3.renderer.domElement.getBoundingClientRect();
    const p = new s3.L.THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    s3.raycaster.setFromCamera(p, s3.camera);
    const hits = s3.raycaster.intersectObject(s3.root, true).filter(h => h.object.visible && (h.object.isMesh) && !(h.object.material?.isShadowMaterial));
    for (const h of hits) {
      if (h.object.userData.pickId) return h.object.userData.pickId;
      let o = h.object;
      while (o && !o.userData.id) o = o.parent;
      if (o && this.s3VisibleChain(o)) return this.s3TopPickable(o.userData.id);
    }
    return null;
  },
  s3VisibleChain(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; },
  /** Clicking a child of a group selects the group first (like Design); the outliner reaches children. */
  s3TopPickable(id) { let d = this.def3(id); while (d?.parent && this.def3(d.parent)) d = this.def3(d.parent); return d ? d.id : id; },
  s3Select(id) {
    const s3 = this.s3;
    s3.sel = id && s3.objs.has(id) ? id : null;
    this.s3AttachGizmo();
    this.s3RenderOutliner(); this.s3RenderPanel(); this.s3RenderKeys();
    s3.dirty = true;
  },
  s3AttachGizmo() {
    const s3 = this.s3;
    if (!s3.gizmo) return;
    const o = s3.sel && s3.objs.get(s3.sel), def = s3.sel && this.def3(s3.sel);
    if (o && !s3.preview && def && def.type !== 'ambLight' && def.type !== 'hemiLight') s3.gizmo.attach(o); else s3.gizmo.detach();
    s3.selBox.visible = !!o && !o.isLight;
    if (s3.selBox.visible) s3.selBox.setFromObject(o);
  },
  s3GizmoMode(mode) {
    this.s3.gizmoMode = mode;
    this.s3.gizmo?.setMode(mode);
    document.querySelectorAll('#space3d-workspace [data-gz]').forEach(b => b.classList.toggle('active', b.dataset.gz === mode));
  },
  s3ToggleSnap() {
    const s3 = this.s3, on = (s3.snap = !s3.snap);
    s3.gizmo?.setTranslationSnap(on ? 0.25 : null); s3.gizmo?.setRotationSnap(on ? 15 * Scene3DCore.DEG : null); s3.gizmo?.setScaleSnap(on ? 0.1 : null);
    document.getElementById('s3-snap').classList.toggle('on', on);
  },
  s3ReadTransform(o) {
    const D = Scene3DCore.DEG, r = (v, p = 4) => Utils.round(v, p);
    return { px: r(o.position.x), py: r(o.position.y), pz: r(o.position.z), rx: r(o.rotation.x / D, 2), ry: r(o.rotation.y / D, 2), rz: r(o.rotation.z / D, 2), sx: r(o.scale.x), sy: r(o.scale.y), sz: r(o.scale.z) };
  },
  s3LiveTransform() {
    const s3 = this.s3, o = s3.objs.get(s3.sel);
    if (!o) return;
    if (s3.selBox.visible) s3.selBox.setFromObject(o);
    const t = this.s3ReadTransform(o);
    for (const k of S3_KEY_PROPS) { const inp = document.querySelector(`#s3-panel [data-p="${k}"]`); if (inp && document.activeElement !== inp) inp.value = t[k]; }
  },
  s3GizmoEnd() {
    const s3 = this.s3, id = s3.sel, o = s3.objs.get(id), def = this.def3(id);
    if (!o || !def) return;
    const t = this.s3ReadTransform(o);
    let changed = false;
    for (const k of S3_KEY_PROPS) if (Math.abs(t[k] - this.s3Value(def, k)) > 1e-4) { this.s3SetProp(id, k, t[k], false); changed = true; }
    if (changed) this.s3Commit(`${{ translate: 'Move', rotate: 'Rotate', scale: 'Scale' }[s3.gizmoMode] || 'Transform'} ${def.name}`);
  },

  // ------------------------------------------------------------------ values, keyframes, time
  s3Value(def, prop) {
    const a = this.model.activeAnimation;
    if (a.tracks[def.id]?.[prop]?.length) return this.model.evaluateIn(a, def.id, prop, this.s3.time);
    return Scene3DCore.baseValue(def, prop);
  },
  setBase3(def, prop, v) {
    if (S3_KEY_PROPS.includes(prop)) def[prop] = v;
    else if (Scene3DCore.isLight(def.type)) { if (prop === 'color') def.light.color = v; else if (prop === 'intensity') def.light.intensity = v; }
    else if (def.mat) def.mat[prop] = v;
  },
  /** Stopwatch semantics (as in Design): animated props get a key at the current time; with Auto-key, others start a track. */
  s3SetProp(id, prop, v, commit = true) {
    const m = this.model, def = this.def3(id), a = m.activeAnimation, t = Utils.round(this.s3.time, 3);
    if (!def) return;
    if (ANIM_PROPS_3D.includes(prop) && a.tracks[id]?.[prop]?.length) m.setKeyframe(id, prop, t, v);
    else if (ANIM_PROPS_3D.includes(prop) && this.s3.autoKey) {
      const old = this.s3Value(def, prop);
      if (t > 0 && old !== undefined && old !== v) m.setKeyframe(id, prop, 0, old);
      m.setKeyframe(id, prop, t, v);
    } else this.setBase3(def, prop, v);
    const o = this.s3.objs.get(id);
    if (o) Scene3DCore.applyProp(o, prop, v);
    this.s3.dirty = true;
    if (commit) this.s3Commit();
  },
  s3KeyProps(def) { return [...S3_KEY_PROPS, ...(Scene3DCore.isLight(def.type) ? ['intensity', 'color'] : def.mat && (def.mat.override !== false) ? ['color', 'opacity'] : ['opacity'])]; },
  s3KeySelection() {
    const def = this.def3(this.s3.sel);
    if (!def) { Utils.toast('Select an object to keyframe', 'ℹ️'); return; }
    const t = Utils.round(this.s3.time, 3);
    for (const p of this.s3KeyProps(def)) { const v = this.s3Value(def, p); if (v !== undefined) this.model.setKeyframe(def.id, p, t, v); }
    this.s3Commit(`Keyframe ${def.name}`);
    Utils.toast(`Keyed “${def.name}” at ${t.toFixed(2)} s`, '◆');
  },
  s3UnkeySelection() {
    const def = this.def3(this.s3.sel), a = this.model.activeAnimation;
    if (!def || !a.tracks[def.id]) return;
    const t = this.s3.time;
    for (const p of Object.keys(a.tracks[def.id])) {
      a.tracks[def.id][p] = a.tracks[def.id][p].filter(k => Math.abs(k.time - t) > 0.02);
      if (!a.tracks[def.id][p].length) delete a.tracks[def.id][p];
    }
    if (!Object.keys(a.tracks[def.id]).length) delete a.tracks[def.id];
    this.s3ResetPose(); this.s3SetTime(t); this.s3Commit(`Remove keys of ${def.name}`);
  },
  /** Base pose for every object (used when switching animation / stopping preview). */
  s3ResetPose() {
    const s3 = this.s3;
    if (!s3?.ready) return;
    for (const def of this.model.scene3d?.objects || []) {
      const o = s3.objs.get(def.id); if (!o) continue;
      Scene3DCore.applyDef(o, def);
      if (Scene3DCore.isLight(def.type)) { Scene3DCore.applyProp(o, 'color', def.light.color); Scene3DCore.applyProp(o, 'intensity', def.light.intensity); }
      else if (def.mat?.override !== false && def.mat) Scene3DCore.applyProp(o, 'color', def.mat.color);
    }
    s3.dirty = true;
  },
  s3ApplyTimeTo(id) {
    const a = this.model.activeAnimation, o = this.s3.objs.get(id), tr = a.tracks[id];
    if (!o || !tr) return;
    for (const p of Object.keys(tr)) { const v = this.model.evaluateIn(a, id, p, this.s3.time); if (v !== undefined) Scene3DCore.applyProp(o, p, v); }
  },
  s3SetTime(t) {
    const s3 = this.s3, a = this.model.activeAnimation;
    s3.time = Utils.clamp(t, 0, a.duration);
    for (const id of Object.keys(a.tracks)) if (id.startsWith('o3_')) this.s3ApplyTimeTo(id);
    const r = document.getElementById('s3-time');
    if (r) { r.max = a.duration; r.value = s3.time; document.getElementById('s3-tlabel').textContent = `${s3.time.toFixed(2)} s`; }
    if (s3.selBox?.visible) s3.selBox.setFromObject(s3.objs.get(s3.sel));
    if (!s3.playing) this.s3LiveTransform();
    s3.dirty = true;
  },
  s3Play(on) {
    const s3 = this.s3;
    s3.playing = !!on && !s3.preview;
    s3.playClock = s3.time; s3.lastTs = null;
    document.getElementById('s3-play').textContent = s3.playing ? '⏸' : '▶';
    if (!s3.playing && s3.wasPlaying) this.s3RenderPanel();
    s3.wasPlaying = s3.playing;
  },
  /** Called from the app's render loop. */
  tick3D(ts) {
    const s3 = this.s3;
    if (!s3?.ready || this.section !== '3d') { if (s3) s3.lastTs = null; return; }
    if (this.model.scene3d !== s3.sceneRef) { // a project was opened / created while the 3D section is visible
      if (s3.preview) this.s3StopPreview();
      s3.undo = []; s3.redo = []; s3.lastSnap = null; s3.sel = null; s3.camInit = false;
      this.s3Rebuild().then(() => { this.s3ResetPose(); this.s3SetTime(0); this.s3RenderAll(); });
      return;
    }
    const dt = s3.lastTs == null ? 0 : Math.min(0.1, (ts - s3.lastTs) / 1000);
    s3.lastTsRaw = s3.lastTs == null ? null : (ts - s3.lastTs) / 1000;
    s3.lastTs = ts;
    if (s3.preview) {
      if (s3.preview.runtimes.length) s3.preview.runtimes.forEach(rt => rt.advance(dt));
      else if (!s3.preview.engine) { s3.playClock += dt; this.s3SetTime(this.s3LoopTime(s3.playClock)); }
      s3.preview.engine?.tick(s3.lastTsRaw == null ? dt : Math.min(1, s3.lastTsRaw)); // QA-05: trigger timers follow real time even at low frame rates
      if (s3.camStep && s3.camStep(s3.lastTsRaw == null ? dt : Math.min(1, s3.lastTsRaw))) s3.camStep = null;
      s3.dirty = true;
    } else if (s3.playing) {
      const a = this.model.activeAnimation;
      s3.playClock += dt * (s3.speed || 1);
      if (a.loop === 'oneShot' && s3.playClock >= (this.s3Range().out)) { this.s3SetTime(this.s3Range().out); this.s3Play(false); } else this.s3SetTime(this.s3LoopTime(s3.playClock));
    }
    if (s3.orbit.enabled) s3.orbit.update();
    if (this.s3Scene().settings.autoRotate && s3.preview) { s3.root.rotation.y += dt * 0.4; s3.dirty = true; }
    if (s3.dirty) { s3.renderer.render(s3.scene, s3.camera); s3.dirty = false; }
  },
  /** v3.14.0: playback range (in / out points) of the active animation. */
  s3Range() { const a = this.model.activeAnimation, i = Utils.clamp(+a.rangeIn || 0, 0, a.duration), o = a.rangeOut > i ? Math.min(a.duration, +a.rangeOut) : a.duration; return { in: i, out: o }; },
  s3LoopTime(t) {
    const a = this.model.activeAnimation, R = this.s3Range(), d = Math.max(0.0001, R.out - R.in);
    if (a.loop === 'oneShot') return R.in + Math.min(Math.max(0, t - R.in), d);
    const rel = Math.max(0, t - R.in);
    if (a.loop === 'pingPong') { const m = rel % (2 * d); return R.in + (m <= d ? m : 2 * d - m); }
    return R.in + (rel % d);
  },

  // ------------------------------------------------------------------ edit operations
  async s3Add(type, extra = {}) {
    if (!this.s3.ready) return;
    if (!this.s3.root) await this.s3Rebuild(); // QA: adding right after boot, before the first build finished
    const sc = this.s3Scene();
    const def = Scene3DCore.newObject(type, extra);
    if (!Scene3DCore.isLight(type) && extra.py === undefined) {
      // drop new objects in front of the orbit target, resting on the ground
      const tg = this.s3.orbit.target, taken = sc.objects.filter(o => !Scene3DCore.isLight(o.type));
      const spots = [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4], [2.8, 0], [-2.8, 0], [0, 2.8]];
      const free = spots.find(([dx, dz]) => !taken.some(o => Math.hypot(o.px - (tg.x + dx), o.pz - (tg.z + dz)) < 1.1)) || [0, 0];
      def.px = Utils.round(tg.x + free[0], 2); def.pz = Utils.round(tg.z + free[1], 2);
      def.py = type === 'plane' ? 0.01 : type === 'text' ? 0.6 : ({ box: 0.5, sphere: 0.6, cylinder: 0.6, cone: 0.6, torus: 0.68, knot: 0.75, capsule: 0.75, icosa: 0.6 }[type] ?? 0.5);
      if (type === 'plane') def.rx = -90;
      const hues = ['#7c8cff', '#ff7a59', '#2ec4b6', '#ffd166', '#ef476f', '#8338ec', '#06d6a0'];
      if (def.mat && type !== 'text' && !extra.mat) def.mat.color = hues[sc.objects.length % hues.length];
    }
    sc.objects.push(def);
    const o = await Scene3DCore.build(this.s3.L, def, sc.assets);
    this.s3.root.add(o);
    if (o.isDirectionalLight || o.isSpotLight) this.s3.root.add(o.target);
    this.s3.objs.set(def.id, o);
    this.s3AddHelper(o, def.id);
    this.s3Commit(`Add ${def.name}`);
    this.s3Select(def.id);
    return def;
  },
  s3Delete(id = this.s3.sel) {
    const sc = this.model.scene3d, def = this.def3(id);
    if (!def) return;
    const kill = new Set([id]);
    let grew = true;
    while (grew) { grew = false; for (const o of sc.objects) if (o.parent && kill.has(o.parent) && !kill.has(o.id)) { kill.add(o.id); grew = true; } }
    sc.objects = sc.objects.filter(o => !kill.has(o.id));
    for (const a of this.model.animations) for (const k of kill) delete a.tracks[k];
    for (const sm of this.model.stateMachines) sm.listeners = sm.listeners.filter(l => !kill.has(l.targetId));
    this.model.triggers = (this.model.triggers || []).filter(t => !kill.has(t.target));
    for (const k of kill) { const o = this.s3.objs.get(k); if (o) { o.parent?.remove(o); if (o.target) o.target.parent?.remove(o.target); this.s3Dispose(o); this.s3.objs.delete(k); } }
    this.s3.sel = null;
    this.s3Commit(`Delete ${def.name}`);
    this.s3Select(null);
    Utils.toast(`Deleted ${def.name}`, '🗑');
  },
  async s3Duplicate(id = this.s3.sel) {
    const def = this.def3(id);
    if (!def) return;
    const copy = JSON.parse(JSON.stringify(def));
    const nid = Scene3DCore.newObject(def.type).id;
    Object.assign(copy, { id: nid, name: `${def.name} copy`, px: Utils.round(def.px + 0.4, 3), pz: Utils.round(def.pz + 0.4, 3) });
    for (const a of this.model.animations) if (a.tracks[id]) a.tracks[nid] = JSON.parse(JSON.stringify(a.tracks[id]));
    this.model.scene3d.objects.push(copy);
    await this.s3Rebuild();
    this.s3Commit(`Duplicate ${def.name}`);
    this.s3Select(nid);
  },
  s3Focus() {
    const s3 = this.s3, o = s3.objs.get(s3.sel), T = s3.L.THREE;
    const box = new T.Box3().setFromObject(o || s3.root);
    if (box.isEmpty()) return;
    const c = box.getCenter(new T.Vector3()), r = Math.max(0.5, box.getSize(new T.Vector3()).length() / 2);
    const dir = s3.camera.position.clone().sub(s3.orbit.target).normalize();
    s3.orbit.target.copy(c);
    s3.camera.position.copy(c.clone().add(dir.multiplyScalar(r / Math.sin((s3.camera.fov * Scene3DCore.DEG) / 2) * 1.1)));
    s3.orbit.update(); s3.dirty = true;
  },
  async s3Import(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['glb', 'gltf', 'obj', 'stl'].includes(ext)) { Utils.toast('3D import supports .glb, .gltf (embedded), .obj and .stl', '⚠️'); return; }
    if (file.size > 30 * 1024 * 1024) { Utils.toast('Model is larger than 30 MB — please simplify or compress it first', '⚠️'); return; }
    if (!this.s3.ready) await this.enter3D();
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const assetId = `a3_${Math.random().toString(36).slice(2, 10)}`;
    const sc = this.s3Scene();
    sc.assets[assetId] = { name: file.name, format: ext, data: btoa(bin) };
    try {
      await Scene3DCore.loadModel(this.s3.L, sc.assets[assetId]);
    } catch (e) {
      delete sc.assets[assetId];
      Utils.toast(`Could not read ${file.name}: ${ext === 'gltf' ? 'use a .glb or a .gltf with embedded buffers' : e.message}`, '❌');
      return;
    }
    await this.s3Add('model', { name: file.name.replace(/\.[a-z0-9]+$/i, ''), asset: assetId, py: 0 });
    Utils.toast(`Imported ${file.name}`, '📦');
  },
  async s3ExtrudeFromDesign() {
    const m = this.model;
    const roots = m.topSelected ? m.topSelected() : [];
    if (!roots.length) { Utils.toast('Select vector layers in the Design section first, then come back and press Extrude', 'ℹ️'); return; }
    const svg = Exporters.svgDocument(m, roots);
    if (!/<(path|rect|ellipse|circle|polygon|polyline|line)\b/.test(svg)) { Utils.toast('The selection has no vector shapes to extrude (text must be outlined first)', '⚠️'); return; }
    // fit the artwork into ~2 world units, depth ~8 % of its size, resting on the ground
    const W = parseFloat((svg.match(/\bwidth="([\d.]+)"/) || [])[1]) || 200, H = parseFloat((svg.match(/\bheight="([\d.]+)"/) || [])[1]) || 200;
    const scale = Utils.round(2 / Math.max(W, H, 1), 5), depth = Utils.round(Math.max(W, H) * 0.08, 1);
    const def = await this.s3Add('extrude', { name: `${roots.length === 1 ? roots[0].name : 'Vectors'} 3D`, geo: { svg, depth, bevel: Utils.round(depth * 0.1, 1), useSvgColors: true, scale }, py: Utils.round((H * scale) / 2 + 0.02, 3), castShadow: true });
    if (def && !this.s3.objs.get(def.id)?.children[0]?.children.length) Utils.toast('Nothing filled to extrude — give the shapes a fill colour', '⚠️');
  },

  // ------------------------------------------------------------------ history
  s3Snapshot() {
    const sc = this.model.scene3d || {};
    const tracks = {};
    for (const a of this.model.animations) { const t = {}; for (const [k, v] of Object.entries(a.tracks)) if (k.startsWith('o3_')) t[k] = v; tracks[a.id] = t; }
    return JSON.stringify({ objects: sc.objects || [], settings: sc.settings || {}, tracks, anims: this.model.animations.map(a => ({ id: a.id, name: a.name, duration: a.duration, loop: a.loop, rangeIn: a.rangeIn, rangeOut: a.rangeOut, fps: a.fps })), inputs: this.model.inputs, stateMachines: this.model.stateMachines, triggers: (this.model.triggers || []).filter(t => t.scope === '3d').map(({ open, ...t }) => t) });
  },
  async s3Restore(json) {
    const d = JSON.parse(json), m = this.model, sc = this.s3Scene();
    sc.objects = d.objects; sc.settings = d.settings;
    for (const a of m.animations) {
      for (const k of Object.keys(a.tracks)) if (k.startsWith('o3_')) delete a.tracks[k];
      Object.assign(a.tracks, d.tracks[a.id] || {});
      const meta = d.anims.find(x => x.id === a.id); if (meta) { a.duration = meta.duration; a.loop = meta.loop; a.rangeIn = meta.rangeIn; a.rangeOut = meta.rangeOut; }
    }
    // animations created in 3D (e.g. “Idle” by a quick interaction) are removed again when undone
    for (const meta of d.anims) if (!m.animations.some(a => a.id === meta.id)) m.animations.push({ ...StudioModel.newAnimation(meta.name, { duration: meta.duration, loop: meta.loop }), id: meta.id, tracks: d.tracks[meta.id] || {} });
    m.animations = m.animations.filter(a => d.anims.some(x => x.id === a.id));
    if (!m.animations.some(a => a.id === m.activeAnimationId)) m.activeAnimationId = m.animations[0].id;
    m.inputs = d.inputs; m.stateMachines = d.stateMachines;
    if (d.triggers) m.triggers = [...(m.triggers || []).filter(t => t.scope !== '3d'), ...d.triggers];
    await this.s3Rebuild();
    this.s3ResetPose(); this.s3SetTime(this.s3.time);
    this.s3RenderAll();
    this.unsaved = true; this.scheduleAutosave();
  },
  s3Commit(label = 'Edit') {
    const s3 = this.s3, snap = this.s3Snapshot();
    if (s3.lastSnap && s3.lastSnap !== snap) { s3.undo.push({ snap: s3.lastSnap, label }); if (s3.undo.length > 60) s3.undo.shift(); s3.redo = []; }
    s3.lastSnap = snap;
    this.unsaved = true; this.scheduleAutosave();
    this.s3RenderAll();
  },
  async s3Undo() { const s3 = this.s3; if (!s3.undo.length) return; const e = s3.undo.pop(); s3.redo.push({ snap: s3.lastSnap, label: e.label }); s3.lastSnap = e.snap; await this.s3Restore(e.snap); this.historyFeedback?.('Undo', e.label, '3D'); },
  async s3Redo() { const s3 = this.s3; if (!s3.redo.length) return; const e = s3.redo.pop(); s3.undo.push({ snap: s3.lastSnap, label: e.label }); s3.lastSnap = e.snap; await this.s3Restore(e.snap); this.historyFeedback?.('Redo', e.label, '3D'); },

  // ------------------------------------------------------------------ UI rendering
  s3RenderAll() { this.s3RenderOutliner(); this.s3RenderPanel(); this.s3RenderAnim(); this.s3RenderKeys(); this.s3AttachGizmo(); },
  s3RenderOutliner() {
    const box = document.getElementById('s3-outliner'), sc = this.model.scene3d;
    if (!box || !sc) return;
    const kids = (pid) => sc.objects.filter(o => (o.parent || null) === pid && (pid === null || this.def3(pid)));
    const orphans = sc.objects.filter(o => o.parent && !this.def3(o.parent));
    const icon = (t) => (Icons.S3[t] ? Icons.svg(Icons.S3[t], 14) : t === 'model' ? Icons.svg('download', 14) : t === 'extrude' ? Icons.svg('extrude', 14) : t === 'group' ? Icons.svg('layers', 14) : null) || ({ box: '■', sphere: '●', cylinder: '▮', cone: '▲', torus: '◯', knot: '∞', capsule: '⬮', icosa: '⬡', plane: '▭', text: 'T', extrude: '⬢', model: '📦', group: '▣', dirLight: '☀', pointLight: '💡', spotLight: '🔦', hemiLight: '◐', ambLight: '○' }[t] || '•');
    const anim = this.model.activeAnimation;
    const row = (o, depth) => `<div class="s3-row${o.id === this.s3.sel ? ' sel' : ''}" role="treeitem" aria-selected="${o.id === this.s3.sel}" data-id="${o.id}" style="padding-left:${8 + depth * 14}px">
        <span class="s3-ico">${icon(o.type)}</span><span class="s3-name">${Utils.escapeHtml(o.name)}</span>${anim.tracks[o.id] ? '<span class="s3-anim-dot" title="Animated in this animation">◆</span>' : ''}
        <button class="s3-eye" data-eye="${o.id}" title="${o.visible === false ? 'Show' : 'Hide'}" aria-label="Toggle visibility">${o.visible === false ? '◌' : '👁'}</button></div>` + kids(o.id).map(k => row(k, depth + 1)).join('');
    box.innerHTML = [...kids(null), ...orphans].map(o => row(o, 0)).join('') || '<p class="muted-text">Empty scene — add something above.</p>';
    box.querySelectorAll('.s3-row').forEach(r => r.addEventListener('click', (e) => { if (!e.target.closest('[data-eye]')) this.s3Select(r.dataset.id); }));
    box.querySelectorAll('[data-eye]').forEach(b => b.addEventListener('click', () => { const d = this.def3(b.dataset.eye); d.visible = d.visible === false; const o = this.s3.objs.get(d.id); if (o) o.visible = d.visible; this.s3.dirty = true; this.s3Commit(); }));
  },
  s3RenderAnim() {
    const m = this.model, a = m.activeAnimation, sel = document.getElementById('s3-anim-sel');
    if (!sel) return;
    sel.innerHTML = m.animations.map(x => `<option value="${x.id}"${x.id === a.id ? ' selected' : ''}>${Utils.escapeHtml(x.name)}</option>`).join('');
    document.getElementById('s3-dur').value = a.duration;
    document.getElementById('s3-loop').value = a.loop || 'loop';
    const r = document.getElementById('s3-time'); r.max = a.duration; r.step = 1 / (a.fps || 30); r.value = this.s3.time;
    const lastU = this.s3.undo.at(-1), lastR = this.s3.redo.at(-1);
    document.getElementById('s3-undo').disabled = !lastU; document.getElementById('s3-redo').disabled = !lastR;
    document.getElementById('s3-undo').title = lastU ? `Undo ${lastU.label} (Ctrl+Z)` : 'Nothing to undo in 3D';
    document.getElementById('s3-redo').title = lastR ? `Redo ${lastR.label} (Ctrl+Shift+Z)` : 'Nothing to redo in 3D';
  },
  s3RenderKeys() {
    const box = document.getElementById('s3-keys');
    if (!box) return;
    const a = this.model.activeAnimation, ids = this.s3.sel ? [this.s3.sel] : Object.keys(a.tracks).filter(k => k.startsWith('o3_'));
    const times = new Set();
    for (const id of ids) for (const kfs of Object.values(a.tracks[id] || {})) for (const k of kfs) times.add(Utils.round(k.time, 3));
    box.innerHTML = [...times].map(t => `<i style="left:${(t / a.duration) * 100}%" title="${t.toFixed(2)} s" data-t="${t}"></i>`).join('');
    box.querySelectorAll('i').forEach(i => i.addEventListener('click', () => { this.s3Play(false); this.s3SetTime(+i.dataset.t); }));
  },
  /** Inspector: object properties, or scene settings when nothing is selected. */
  s3RenderPanel() {
    const panel = document.getElementById('s3-panel');
    if (!panel || !this.model.scene3d) return;
    if (this.s3.preview) return this.s3RenderPreviewPanel();
    const def = this.def3(this.s3.sel);
    const num = (p, v, step = 0.1, attrs = '') => `<input type="number" data-p="${p}" value="${Utils.round(v ?? 0, 4)}" step="${step}" ${attrs}>`;
    const col = (p, v) => `<input type="color" data-p="${p}" value="${Utils.toHex(v)}">`;
    const chk = (p, v, label) => `<label class="s3-chk"><input type="checkbox" data-p="${p}"${v ? ' checked' : ''}> ${label}</label>`;
    const sel = (p, v, opts) => `<select data-p="${p}">${opts.map(([k, l]) => `<option value="${k}"${String(k) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const rng = (p, v, min, max, step) => `<div class="md-range"><input type="range" data-p="${p}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${Utils.round(v, 2)}</output></div>`;
    const sec = (title, body, extra = '') => `<div class="md-card"><div class="md-card-title">${title}${extra}</div>${body}</div>`;
    const row = (label, html) => { const al = ` aria-label="${String(label).replace(/<[^>]*>/g, '').replace(/"/g, '')}"`; html = html.replace(/<(input|select)(?![^>]*aria-label)/g, (m0) => m0 + al); return `<div class="s3-prow"><label>${label}</label><div class="s3-pv">${html}</div></div>`; };
    if (!def) {
      const s = this.s3Scene().settings;
      panel.innerHTML = sec('Scene', [
        row('Background', `${col('s.bg', s.bg)}${chk('s.transparent', s.transparent, 'Transparent')}`),
        row('Environment', `${chk('s.env', s.env, 'Studio lighting (IBL)')}`),
        row('Env. intensity', rng('s.envIntensity', s.envIntensity, 0, 3, 0.05)),
        row('Exposure', rng('s.exposure', s.exposure, 0.2, 3, 0.05)),
        row('Ground', sel('s.ground', s.ground, [['shadow', 'Shadow catcher'], ['solid', 'Solid floor'], ['none', 'None']]) + (s.ground === 'solid' ? col('s.groundColor', s.groundColor) : '')),
        row('Editor grid', chk('s.grid', s.grid !== false, 'Show')),
        row('Fog', `${chk('s.fog', s.fog, 'On')}${s.fog ? col('s.fogColor', s.fogColor) + rng('s.fogDensity', s.fogDensity, 0.005, 0.2, 0.005) : ''}`)
      ].join('')) + sec('Camera (used by exports)', [
        row('Field of view', rng('s.fov', s.camera.fov, 15, 90, 1)),
        `<div class="md-actions"><button class="btn-ghost" data-act="camsave">Use current view</button><button class="btn-ghost" data-act="camgo">Go to scene camera</button></div>`,
        row('Viewer', `${chk('s.orbit', s.orbit, 'Allow orbit')}${chk('s.autoRotate', s.autoRotate, 'Auto-rotate')}${chk('s.showInputs', s.showInputs !== false, 'Show input controls')}`)
      ].join('')) + `<div class="md-card trg-box" id="s3-triggers"></div><p class="s3-tip">Select an object to edit it. Keyframes and interactions use the same animations, state machines and <b>global inputs</b> as Design › Animate.</p>`;
    } else {
      const isL = Scene3DCore.isLight(def.type), mt = def.mat, v = (p) => this.s3Value(def, p);
      const a = this.model.activeAnimation;
      const kd = (props) => props.some(p => a.tracks[def.id]?.[p]?.some(k => Math.abs(k.time - this.s3.time) < 0.02)) ? ' keyed' : props.some(p => a.tracks[def.id]?.[p]) ? ' animated' : '';
      const xyz = (pre, step, lbl) => row(`<span class="s3-kd${kd([pre + 'x', pre + 'y', pre + 'z'])}" title="Animated / keyed at this time">◆</span> ${lbl}`, `<div class="s3-xyz">${num(pre + 'x', v(pre + 'x'), step)}${num(pre + 'y', v(pre + 'y'), step)}${num(pre + 'z', v(pre + 'z'), step)}</div>`);
      const g = def.geo || {};
      const geoRows = {
        box: [['w', 'Width'], ['h', 'Height'], ['d', 'Depth'], ['r', 'Corner radius']], sphere: [['r', 'Radius']], cylinder: [['rt', 'Top radius'], ['rb', 'Bottom radius'], ['h', 'Height']], cone: [['r', 'Radius'], ['h', 'Height']],
        torus: [['r', 'Radius'], ['t', 'Tube']], knot: [['r', 'Radius'], ['t', 'Tube']], capsule: [['r', 'Radius'], ['l', 'Length']], plane: [['w', 'Width'], ['h', 'Height']], icosa: [['r', 'Radius'], ['detail', 'Detail (0 = faceted)']]
      }[def.type];
      const parents = this.model.scene3d.objects.filter(o => o.id !== def.id && !Scene3DCore.isLight(o.type) && !this.s3IsDescendant(o.id, def.id));
      let html = sec('Object', row('Name', `<input type="text" data-p="name" value="${Utils.escapeHtml(def.name)}">`) + row('Parent', sel('parent', def.parent || '', [['', '— Scene —'], ...parents.map(o => [o.id, Utils.escapeHtml(o.name)])])) + row('', chk('visible', def.visible !== false, 'Visible')) +
        `<div class="md-actions"><button class="btn-ghost" data-act="dup">Duplicate</button><button class="btn-ghost" data-act="focus">Focus</button><button class="btn-ghost danger" data-act="del">Delete</button></div>`);
      html += sec('Transform', xyz('p', 0.1, 'Position') + xyz('r', 5, 'Rotation°') + xyz('s', 0.1, 'Scale'));
      if (geoRows) html += sec('Shape', geoRows.map(([k, l]) => row(l, num(`g.${k}`, g[k], k === 'detail' ? 1 : 0.05, k === 'detail' ? 'min="0" max="5"' : 'min="0"'))).join(''));
      if (def.type === 'text') html += sec('Text', row('Text', `<textarea data-p="g.text" rows="2">${Utils.escapeHtml(g.text)}</textarea>`) + row('Size', num('g.size', g.size, 0.05, 'min="0.05"')) + row('Font', sel('g.font', g.font, MD_FONTS)) + row('Weight', sel('g.weight', g.weight, [[400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black']])));
      if (def.type === 'extrude') html += sec('Extrusion', row('Depth (px)', num('g.depth', g.depth, 1, 'min="0"')) + row('Bevel (px)', num('g.bevel', g.bevel, 0.5, 'min="0"')) + row('Units / px', num('g.scale', g.scale, 0.001, 'min="0.0001"')) + row('', chk('g.useSvgColors', g.useSvgColors, 'Use the vector colours')));
      if (def.type === 'model') { const as = this.model.scene3d.assets[def.asset]; html += sec('Model', `<p class="s3-tip">${Utils.escapeHtml(as?.name || 'missing asset')} · ${as ? Media.fmtBytes(Math.round(as.data.length * 0.75)) : ''}${this.s3.objs.get(def.id)?.userData.clips?.length ? ` · ${this.s3.objs.get(def.id).userData.clips.length} embedded clip(s) (not played)` : ''}</p>` + row('', chk('m.override', mt.override, 'Override materials'))); }
      if (isL) {
        const l = def.light;
        html += sec('Light', row(`<span class="s3-kd${kd(['color'])}">◆</span> Colour`, col('color', v('color'))) + row(`<span class="s3-kd${kd(['intensity'])}">◆</span> Intensity`, num('intensity', v('intensity'), 0.1, 'min="0"')) +
          (def.type === 'hemiLight' ? row('Ground colour', col('l.ground', l.ground)) : '') + (['pointLight', 'spotLight'].includes(def.type) ? row('Distance (0 = ∞)', num('l.distance', l.distance, 0.5, 'min="0"')) : '') +
          (def.type === 'spotLight' ? row('Cone angle°', num('l.angle', l.angle, 1, 'min="1" max="89"')) + row('Penumbra', rng('l.penumbra', l.penumbra, 0, 1, 0.05)) : '') +
          (['dirLight', 'pointLight', 'spotLight'].includes(def.type) ? row('', chk('l.castShadow', l.castShadow, 'Cast shadows')) : ''));
      } else if (mt && (def.type !== 'model' || mt.override) && !(def.type === 'extrude' && g.useSvgColors && false)) {
        const showColor = !(def.type === 'extrude' && g.useSvgColors);
        html += sec('Material', row('Type', sel('m.type', mt.type, [['standard', 'Standard (PBR)'], ['clearcoat', 'Clear-coat'], ['glass', 'Glass'], ['toon', 'Toon'], ['basic', 'Unlit'], ['normal', 'Normals']])) +
          (showColor ? row(`<span class="s3-kd${kd(['color'])}">◆</span> Colour`, col('color', v('color'))) : '') +
          (!['basic', 'normal', 'toon'].includes(mt.type) ? row(`<span class="s3-kd${kd(['metalness'])}">◆</span> Metalness`, rng('metalness', v('metalness'), 0, 1, 0.01)) + row(`<span class="s3-kd${kd(['roughness'])}">◆</span> Roughness`, rng('roughness', v('roughness'), 0, 1, 0.01)) : '') +
          (mt.type === 'glass' ? row('Transmission', rng('m.transmission', mt.transmission, 0, 1, 0.01)) + row('IOR', rng('m.ior', mt.ior, 1, 2.33, 0.01)) : '') +
          row(`<span class="s3-kd${kd(['opacity'])}">◆</span> Opacity`, rng('opacity', v('opacity'), 0, 1, 0.01)) +
          (!['basic', 'normal'].includes(mt.type) ? row(`<span class="s3-kd${kd(['emissive'])}">◆</span> Glow colour`, col('emissive', v('emissive'))) + row('Glow intensity', rng('m.emissiveIntensity', mt.emissiveIntensity, 0, 10, 0.1)) : '') +
          row('', chk('m.wireframe', mt.wireframe, 'Wireframe') + chk('m.flat', mt.flat, 'Flat shading')));
      } else if (mt) html += sec('Material', row(`<span class="s3-kd${kd(['opacity'])}">◆</span> Opacity`, rng('opacity', v('opacity'), 0, 1, 0.01)));
      if (!isL) html += sec('Shadows', row('', chk('castShadow', def.castShadow, 'Cast') + chk('receiveShadow', def.receiveShadow, 'Receive')));
      if (!isL) {
        const legacy = this.model.stateMachines.reduce((n, sm) => n + sm.listeners.filter(l => l.targetId === def.id).length, 0);
        html += `<div class="md-card trg-box" id="s3-triggers"></div>${legacy ? `<p class="s3-tip">+ ${legacy} state-machine listener${legacy > 1 ? 's' : ''} on this object (Design › Animate).</p>` : ''}`;
      }
      panel.innerHTML = html;
    }
    this.renderTriggerEditor(document.getElementById('s3-triggers'), { scope: '3d', target: def && !Scene3DCore.isLight(def.type) ? def.id : null });
    panel.querySelectorAll('[data-p]').forEach(inp => {
      const live = inp.type === 'range' || inp.type === 'number';
      const ev = live || inp.tagName === 'TEXTAREA' || inp.type === 'text' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        let val = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' || inp.type === 'range' ? Utils.num(inp.value, 0) : inp.value;
        if (inp.type === 'range') inp.nextElementSibling.textContent = Utils.round(val, 2);
        if (inp.dataset.p === 'g.weight') val = +val;
        if (inp.type === 'number' && inp.value === '') return;
        this.s3Edit(def, inp.dataset.p, val, live ? 'live' : ev === 'input' ? 'text' : 'commit');
      });
      if (ev === 'input') inp.addEventListener('change', () => { clearTimeout(this._s3CommitT); this._s3CommitT = setTimeout(() => this.s3Commit(), 200); });
    });
    panel.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'dup') this.s3Duplicate(); else if (act === 'del') this.s3Delete(); else if (act === 'focus') this.s3Focus();
      else if (act === 'camsave') { const s3 = this.s3, c = this.s3Scene().settings.camera; c.pos = s3.camera.position.toArray().map(x => Utils.round(x, 3)); c.target = s3.orbit.target.toArray().map(x => Utils.round(x, 3)); this.s3Commit(); Utils.toast('Scene camera set to the current view', '🎥'); }
      else if (act === 'camgo') { this.s3UseSceneCamera(); this.s3.dirty = true; }
    }));
  },
  s3IsDescendant(id, ancestorId) { let d = this.def3(id); const seen = new Set(); while (d?.parent && !seen.has(d.id)) { seen.add(d.id); if (d.parent === ancestorId) return true; d = this.def3(d.parent); } return false; },
  /** Apply one inspector edit. mode: live (no history), text (debounced rebuild), commit. */
  async s3Edit(def, key, val, mode) {
    const s3 = this.s3;
    if (!def) { // scene settings
      const s = this.s3Scene().settings, k = key.slice(2);
      if (k === 'fov') { s.camera.fov = val; s3.camera.fov = val; s3.camera.updateProjectionMatrix(); s3.dirty = true; }
      else s[k] = val;
      this.s3ApplySettings();
      if (mode === 'commit') { this.s3Commit(); if (['ground', 'fog'].includes(k)) this.s3RenderPanel(); }
      return;
    }
    const o = s3.objs.get(def.id);
    if (S3_KEY_PROPS.includes(key) || ANIM_PROPS_3D.includes(key)) { this.s3SetProp(def.id, key, val, mode === 'commit'); if (s3.selBox.visible) s3.selBox.setFromObject(o); return; }
    if (key === 'name') { def.name = val; if (o) o.name = val; clearTimeout(this._s3NameT); this._s3NameT = setTimeout(() => this.s3RenderOutliner(), 200); return; }
    if (key === 'visible') { def.visible = val; if (o) o.visible = val; s3.dirty = true; this.s3Commit(); return; }
    if (key === 'parent') {
      def.parent = val || null;
      await this.s3Rebuild(); this.s3ResetPose(); this.s3SetTime(s3.time); this.s3Commit(); return;
    }
    if (key === 'castShadow' || key === 'receiveShadow') { def[key] = val; o?.traverse(c => { if (c.isMesh) c[key] = val; }); s3.dirty = true; this.s3Commit(); return; }
    if (key.startsWith('g.') && typeof val === 'number' && this.model.activeAnimation.tracks[def.id]?.[`geo.${key.slice(2)}`]?.length) { // v3.14.0 shape key: edit = key at the playhead
      this.model.setKeyframe(def.id, `geo.${key.slice(2)}`, Utils.round(s3.time, 3), val); if (o) Scene3DCore.applyProp(o, `geo.${key.slice(2)}`, val); s3.dirty = true; if (mode === 'commit') this.s3Commit('Shape key'); return;
    }
    const [grp, k] = key.split('.');
    const target = grp === 'g' ? def.geo : grp === 'm' ? def.mat : def.light;
    target[k] = val;
    // light params that can be set live
    if (grp === 'l' && o) {
      if (k === 'ground') o.groundColor?.set(val); else if (k === 'distance') o.distance = val; else if (k === 'angle') o.angle = val * Scene3DCore.DEG; else if (k === 'penumbra') o.penumbra = val;
      else if (k === 'castShadow') { await this.s3RebuildObject(def.id); }
      s3.dirty = true; if (mode !== 'live') this.s3Commit(); return;
    }
    if (grp === 'm' && o && ['transmission', 'ior', 'emissiveIntensity', 'wireframe', 'flat'].includes(k)) {
      for (const mat of Scene3DCore.materials(o)) { if (k === 'flat') mat.flatShading = val; else if (k in mat) mat[k] = val; mat.needsUpdate = k === 'flat' || k === 'wireframe' ? true : mat.needsUpdate; }
      s3.dirty = true; if (mode !== 'live') this.s3Commit(); return;
    }
    // geometry / material type / override → rebuild that object (debounced while typing)
    clearTimeout(this._s3RebuildT);
    const run = async () => { await this.s3RebuildObject(def.id); if (mode !== 'live') this.s3Commit(); if (grp === 'm' || k === 'useSvgColors') this.s3RenderPanel(); };
    if (mode === 'text' || mode === 'live') this._s3RebuildT = setTimeout(run, 160); else await run();
  },

  // ------------------------------------------------------------------ interactions (global inputs)
  /** First state machine, created (with the active animation as its idle state) when none exists. */
  s3EnsureMachine() {
    const m = this.model;
    const idleAnim = () => { let a = m.animations.find(x => !Object.keys(x.tracks).length); if (!a) { a = StudioModel.newAnimation('Idle', { duration: 1 }); m.animations.push(a); } return a; };
    if (!m.stateMachines.length) {
      m.stateMachines.push(StudioModel.newStateMachine('State Machine 1', idleAnim().id));
      Utils.toast('Created “State Machine 1” — edit it in Design › Animate', '🧠');
    }
    const sm = m.stateMachines[0], layer = sm.layers[0], entry = layer.states.find(st => st.type === 'entry');
    // the layer must leave Entry into an animation state, otherwise Any-State transitions never run
    if (entry && !layer.transitions.some(t => t.from === entry.id)) {
      const a = idleAnim();
      const st = { id: Utils.uid('st'), type: 'animation', name: a.name, animationId: a.id, x: 260, y: 120, speed: 1 };
      layer.states.push(st);
      layer.transitions.push({ id: Utils.uid('tr'), from: entry.id, to: st.id, conditions: [], duration: 0, exitTime: 0 });
    }
    return sm;
  },
  /** Rive recipe in one click: input + listener + animation state + transition from Any State. */
  s3QuickInteraction(def, event, animId) {
    const m = this.model, anim = m.animations.find(a => a.id === animId);
    if (!anim) return;
    if (!Object.keys(anim.tracks).some(k => k.startsWith('o3_'))) Utils.toast(`“${anim.name}” has no 3D keyframes yet — key some objects in it first`, 'ℹ️');
    const sm = this.s3EnsureMachine(), layer = sm.layers[0];
    const base = `${Utils.slug(def.name, 'object').replace(/-/g, '_')}_${event === 'click' ? 'click' : 'hover'}`;
    let name = base, n = 2; while (m.inputs.some(i => i.name === name)) name = `${base}${n++}`;
    const isHover = event === 'pointerEnter';
    const inp = { id: Utils.uid('in'), name, type: isHover ? 'boolean' : 'trigger', value: false };
    m.inputs.push(inp);
    sm.listeners.push({ id: Utils.uid('li'), targetId: def.id, event, actions: [{ type: isHover ? 'set' : 'fire', inputId: inp.id, value: true }] });
    if (isHover) sm.listeners.push({ id: Utils.uid('li'), targetId: def.id, event: 'pointerExit', actions: [{ type: 'set', inputId: inp.id, value: false }] });
    let st = layer.states.find(s => s.type === 'animation' && s.animationId === anim.id);
    if (!st) { st = { id: Utils.uid('st'), type: 'animation', name: anim.name, animationId: anim.id, x: 300 + layer.states.length * 30, y: 230 + layer.states.length * 20, speed: 1 }; layer.states.push(st); }
    const any = layer.states.find(s => s.type === 'any');
    layer.transitions.push({ id: Utils.uid('tr'), from: any.id, to: st.id, conditions: [{ inputId: inp.id, op: '==', value: true }], duration: 200, exitTime: 0 });
    // back to the resting state: hover → when the pointer leaves; click → when the animation has played once
    const entry = layer.states.find(s => s.type === 'entry'), first = layer.transitions.find(t => t.from === entry?.id);
    const idle = layer.states.find(s => s.id === first?.to && s.id !== st.id) || layer.states.find(s => s.type === 'animation' && s.id !== st.id);
    if (idle) layer.transitions.push({ id: Utils.uid('tr'), from: st.id, to: idle.id, conditions: isHover ? [{ inputId: inp.id, op: '==', value: false }] : [], duration: 200, exitTime: isHover ? 0 : 100 });
    this.s3Commit(`Interaction on ${def.name}`);
    Utils.toast(`${isHover ? 'Hover' : 'Click'} on “${def.name}” → “${anim.name}” (input “${name}”). Try ▶ Preview.`, '⚡');
  },

  // ------------------------------------------------------------------ preview (Rive-style runtime)
  s3StartPreview() {
    const s3 = this.s3, m = this.model;
    if (!s3.ready) return;
    this.s3Play(false);
    const bus = new InputBus(m.inputs.map(i => ({ ...i })));
    const apply = (id, p, v) => { const o = s3.objs.get(id); if (o) Scene3DCore.applyProp(o, p, v); };
    this.s3ResetPose();
    const runtimes = m.stateMachines.map(sm => new StateMachineRuntime(m, sm, bus, apply));
    const has3DTriggers = (m.triggers || []).some(t => t.scope === '3d' && t.enabled !== false);
    const engine = has3DTriggers ? new TriggerEngine(m.triggers, m, bus, this.s3TriggerHost(), '3d') : null;
    s3.preview = { bus, runtimes, engine, scroll: 0, hover: new Set(), down: [], listened: new Set([...runtimes.flatMap(rt => rt.hasListenerTargets()), ...(engine ? engine.listens() : [])]) };
    s3.camHome = { pos: s3.camera.position.clone(), target: s3.orbit.target.clone() };
    s3.orbit.enableZoom = !(m.triggers || []).some(t => t.scope === '3d' && t.enabled !== false && t.event.type === 'scroll');
    engine?.start(null);
    s3.playClock = 0; s3.lastTs = null;
    s3.gizmo.detach(); s3.selBox.visible = false;
    document.getElementById('s3-preview').classList.add('on'); document.getElementById('s3-preview').textContent = '■ Stop';
    document.getElementById('space3d-workspace').classList.add('previewing');
    this.s3RenderPanel();
    Utils.toast(runtimes.length ? 'Preview: state machines running — click/hover objects, change inputs on the right. Esc stops.' : 'Preview: playing the active animation (add interactions to make it reactive). Esc stops.', '▶');
  },
  s3StopPreview() {
    const s3 = this.s3;
    if (!s3.preview) return;
    s3.preview.runtimes.forEach(rt => rt.dispose());
    if (s3.preview.engine) { s3.preview.engine.restore(); s3.preview.engine.dispose(); }
    s3.preview = null; s3.camStep = null; s3.orbit.enableZoom = true;
    s3.root.rotation.y = 0;
    document.getElementById('s3-preview').classList.remove('on'); document.getElementById('s3-preview').textContent = '▶ Preview';
    document.getElementById('space3d-workspace').classList.remove('previewing');
    document.getElementById('s3-canvas').style.cursor = '';
    this.s3ResetPose(); this.s3SetTime(s3.time);
    this.s3RenderAll();
  },
  /** Also accept hits on children: the deepest object hit plus its ancestors. */
  s3DeepHitIds(e) {
    const s3 = this.s3, r = s3.renderer.domElement.getBoundingClientRect();
    s3.raycaster.setFromCamera(new s3.L.THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s3.camera);
    const h = s3.raycaster.intersectObject(s3.root, true).find(x => x.object.isMesh && !x.object.userData.editorOnly && this.s3VisibleChain(x.object));
    if (!h) return [];
    const out = [];
    for (let o = h.object; o; o = o.parent) if (o.userData.id && !out.includes(o.userData.id)) out.push(o.userData.id);
    return out;
  },
  s3PreviewPointer(e, kind) {
    const P = this.s3.preview, rts = P.runtimes;
    const ids = e ? this.s3DeepHitIds(e) : [];
    if (P.engine) {
      if (!e) P.engine.pointerLeave();
      else {
        const r = this.s3.renderer.domElement.getBoundingClientRect();
        if (kind === 'pointerDown') P.engine.pointerDown(ids, e.clientX, e.clientY);
        else if (kind === 'pointerUp') P.engine.pointerUp(ids, e.clientX, e.clientY);
        else P.engine.pointerMove(ids, e.clientX, e.clientY, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }
    }
    if (kind === 'pointerDown') { P.down = ids; rts.forEach(rt => rt.pointer('pointerDown', ids)); }
    else if (kind === 'pointerUp') { const c = ids.filter(i => P.down.includes(i)); rts.forEach(rt => { rt.pointer('pointerUp', ids); if (c.length) rt.pointer('click', c); }); }
    else {
      const now = new Set(ids), ent = ids.filter(i => !P.hover.has(i)), ex = [...P.hover].filter(i => !now.has(i));
      rts.forEach(rt => { if (ent.length) rt.pointer('pointerEnter', ent); if (ex.length) rt.pointer('pointerExit', ex); });
      P.hover = now;
      document.getElementById('s3-canvas').style.cursor = ids.some(i => P.listened.has(i)) ? 'pointer' : '';
    }
  },
  s3RenderPreviewPanel() {
    const panel = document.getElementById('s3-panel'), P = this.s3.preview, m = this.model;
    panel.innerHTML = `<div class="md-card"><div class="md-card-title">Preview · global inputs</div><div id="s3-inputs"></div>
      <div id="s3-states" class="s3-tip"></div><div class="md-actions"><button class="btn-primary" id="s3-stop2">■ Stop preview</button></div></div>`;
    const box = panel.querySelector('#s3-inputs');
    if (!m.inputs.length) box.innerHTML = '<p class="s3-tip">No inputs yet. Add interactions to objects, or inputs in Design › Animate.</p>';
    for (const def of m.inputs) {
      const row = document.createElement('div'); row.className = 's3-prow';
      const lab = document.createElement('label'); lab.textContent = `${def.name} (${def.type})`;
      let ctl;
      if (def.type === 'trigger') { ctl = document.createElement('button'); ctl.className = 'btn-ghost'; ctl.textContent = 'Fire'; ctl.onclick = () => P.bus.fire(def.id); }
      else if (def.type === 'boolean') { ctl = document.createElement('input'); ctl.type = 'checkbox'; ctl.checked = !!P.bus.get(def.id); ctl.onchange = () => P.bus.set(def.id, ctl.checked); P.bus.onChange((id, v) => { if (id === def.id) ctl.checked = !!v; }); }
      else { ctl = document.createElement('input'); ctl.type = 'number'; ctl.step = 'any'; ctl.value = P.bus.get(def.id); ctl.oninput = () => P.bus.set(def.id, ctl.value); P.bus.onChange((id, v) => { if (id === def.id && document.activeElement !== ctl) ctl.value = v; }); }
      row.append(lab, ctl); box.appendChild(row);
    }
    panel.querySelector('#s3-stop2').addEventListener('click', () => this.s3StopPreview());
    const st = panel.querySelector('#s3-states');
    const upd = () => { if (!this.s3.preview) return; st.textContent = P.runtimes.length ? `States: ${P.runtimes.map(rt => rt.layers.map(L => L.state?.name).join(' + ')).join(' | ')}` : 'No state machine — playing the active animation.'; setTimeout(upd, 250); };
    upd();
  },
  /** Trigger host for the 3D section (apply / read Object3D values, camera moves). */
  s3TriggerHost() {
    const s3 = this.s3;
    return {
      apply: (id, p, v) => { const o = s3.objs.get(id); if (o) { Scene3DCore.applyProp(o, p, v); s3.dirty = true; } },
      get: (id, p) => { const o = s3.objs.get(id); return o ? Scene3DCore.readProp(o, p) : undefined; },
      evaluateIn: (a, id, p, t) => this.model.evaluateIn(a, id, p, t),
      camera: (a) => {
        const to = a.type === 'cameraReset' ? s3.camHome : (s3.objs.get(a.targetId) && Scene3DCore.focusPose(s3.L, s3.objs.get(a.targetId), s3.camera, s3.orbit.target));
        if (to) s3.camStep = Scene3DCore.cameraTween(s3.L, s3.camera, s3.orbit.target, to, +a.duration || 800);
      },
      openUrl: (u) => { const s = String(u || '').trim(), l = s.toLowerCase(); if (l.startsWith('https://') || l.startsWith('http://') || l.startsWith('mailto:')) window.open(s, '_blank', 'noopener,noreferrer'); },
      emit: (name) => Utils.toast(`Event “${name}” sent to page code`, '📣', { duration: 1500 }),
      notice: (msg) => Utils.toast(msg, 'ℹ️')
    };
  },
  /** Hook used by Design-side runtimes (Animate preview, Prototype) so global inputs also move 3D objects. */
  apply3D(id, prop, v) {
    if (!String(id).startsWith('o3_')) return false;
    const o = this.s3?.objs?.get(id);
    if (o) { Scene3DCore.applyProp(o, prop, v); this.s3.dirty = true; }
    return true;
  },

  // ------------------------------------------------------------------ export
  /** Render one clean frame (no grid / gizmo / helpers) at w×h into a new 2D canvas. */
  s3RenderClean(w, h, { camera = 'scene' } = {}) {
    const s3 = this.s3, T = s3.L.THREE, s = this.s3Scene().settings;
    const cam = new T.PerspectiveCamera(s.camera.fov, w / h, 0.05, 500);
    if (camera === 'scene') { cam.position.set(...s.camera.pos); cam.lookAt(new T.Vector3(...s.camera.target)); } else { cam.position.copy(s3.camera.position); cam.quaternion.copy(s3.camera.quaternion); cam.fov = s3.camera.fov; cam.updateProjectionMatrix(); }
    const hidden = [];
    s3.scene.traverse(o => { if ((o.userData.editorOnly || o === s3.gizmo.getHelper()) && o.visible) { hidden.push(o); o.visible = false; } });
    const prev = s3.renderer.getSize(new T.Vector2()), pr = s3.renderer.getPixelRatio();
    s3.renderer.setPixelRatio(1); s3.renderer.setSize(w, h, false);
    s3.renderer.render(s3.scene, cam);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(s3.renderer.domElement, 0, 0, w, h);
    s3.renderer.setPixelRatio(pr); s3.renderer.setSize(prev.x, prev.y, false);
    hidden.forEach(o => { o.visible = true; });
    s3.dirty = true;
    return c;
  },
  s3ExportSize(max = 1920) {
    const v = document.getElementById('s3-view'), k = Math.min(2, max / Math.max(v.clientWidth, v.clientHeight));
    return [Math.round(v.clientWidth * k) & ~1, Math.round(v.clientHeight * k) & ~1];
  },
  async s3Export(kind) {
    document.getElementById('s3-export-menu').hidden = true;
    if (!this.s3.ready) return;
    const name = Utils.safeFilename(this.title || 'scene', 'scene');
    try {
      if (kind === 'png') {
        const [w, h] = this.s3ExportSize(3840);
        const c = this.s3RenderClean(w, h, { camera: 'view' });
        Utils.download(await new Promise(r => c.toBlob(r, 'image/png')), `${name}.3d.png`, 'image/png');
        Utils.toast(`Exported ${w}×${h} PNG (current view)`, '🖼');
      } else if (kind === 'glb') {
        const blob = await this.s3ExportGLB();
        Utils.download(blob, `${name}.glb`, 'model/gltf-binary');
        Utils.toast(`Exported GLB (${Media.fmtBytes(blob.size)}) with ${this.model.animations.filter(a => Object.keys(a.tracks).some(k => k.startsWith('o3_'))).length} animation clip(s)`, '📦');
      } else if (kind === 'html') {
        Utils.download(this.s3ViewerHTML(name), `${name}.3d.html`, 'text/html');
        Utils.toast('Exported interactive 3D viewer (window.DesignStudioPlayer API)', '⬇️');
      } else if (kind === 'media') await this.s3ToMedia();
    } catch (e) { console.error(e); Utils.toast(`Export failed: ${e.message}`, '❌'); }
  },
  async s3ToMedia() {
    const a = this.model.activeAnimation, fps = 24;
    const n = Utils.clamp(Math.round(a.duration * fps), 1, 480);
    const [w, h] = this.s3ExportSize(720);
    const keep = this.s3.time, frames = [];
    this.s3Play(false);
    Utils.toast(`Rendering ${n} frames…`, '🎞');
    for (let i = 0; i < n; i++) {
      this.s3SetTime((i / n) * a.duration);
      frames.push({ canvas: this.s3RenderClean(w, h), delay: Math.round(1000 / fps) });
      if (i % 8 === 0) await new Promise(r => setTimeout(r, 0));
    }
    this.s3SetTime(keep);
    this.setSection('media');
    this.mediaLoad({ frames, width: w, height: h, loop: a.loop === 'oneShot' ? 1 : 0, source: '3d' }, { name: `${this.title || 'Scene'} – ${a.name} (3D)`, format: '3d render' });
    this.mediaSelectTool('x-mp4');
  },
  async s3ExportGLB() {
    const s3 = this.s3, L = s3.L, T = L.THREE, m = this.model;
    const { root, objs } = await Scene3DCore.buildAll(L, this.s3Scene());
    const clips = [];
    for (const a of m.animations) {
      const ids = Object.keys(a.tracks).filter(k => k.startsWith('o3_') && objs.has(k));
      if (!ids.length) continue;
      const fps = 30, n = Math.max(2, Math.round(a.duration * fps) + 1), times = Array.from({ length: n }, (_, i) => Utils.round((i / (n - 1)) * a.duration, 4));
      const tracks = [];
      for (const id of ids) {
        const def = this.def3(id), o = objs.get(id), tr = a.tracks[id];
        const val = (p, t) => (tr[p]?.length ? m.evaluateIn(a, id, p, t) : Scene3DCore.baseValue(def, p));
        if (['px', 'py', 'pz'].some(p => tr[p])) tracks.push(new T.VectorKeyframeTrack(`${o.uuid}.position`, times, times.flatMap(t => [val('px', t), val('py', t), val('pz', t)])));
        if (['rx', 'ry', 'rz'].some(p => tr[p])) tracks.push(new T.QuaternionKeyframeTrack(`${o.uuid}.quaternion`, times, times.flatMap(t => new T.Quaternion().setFromEuler(new T.Euler(val('rx', t) * Scene3DCore.DEG, val('ry', t) * Scene3DCore.DEG, val('rz', t) * Scene3DCore.DEG)).toArray())));
        if (['sx', 'sy', 'sz'].some(p => tr[p])) tracks.push(new T.VectorKeyframeTrack(`${o.uuid}.scale`, times, times.flatMap(t => [val('sx', t), val('sy', t), val('sz', t)])));
      }
      if (tracks.length) clips.push(new T.AnimationClip(a.name, a.duration, tracks));
    }
    const out = await new L.GLTFExporter().parseAsync(root, { binary: true, animations: clips, onlyVisible: true });
    return new Blob([out], { type: 'model/gltf-binary' });
  },
  /** Self-contained viewer: three.js factory + scene core + state-machine runtime + data. */
  s3ViewerHTML(title) {
    const m = this.model, s = this.s3Scene().settings;
    const used = new Set(m.scene3d.objects.map(o => o.id));
    const anims = m.animations.map(a => ({ ...a, tracks: Object.fromEntries(Object.entries(a.tracks).filter(([k]) => used.has(k))) }));
    const data = { title, scene3d: m.scene3d, animations: anims, activeAnimationId: m.activeAnimationId, inputs: m.inputs, stateMachines: m.stateMachines.map(sm => ({ ...sm, listeners: sm.listeners.filter(l => used.has(l.targetId)) })), triggers: (m.triggers || []).filter(t => t.scope === '3d' && t.enabled !== false).map(({ open, ...t }) => t) };
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const evalSrc = StudioModel.prototype.evaluateIn.toString();
    const runtime = [
      '"use strict";',
      `const Utils = ${InteractiveExport.serializeValue(Utils)};`,
      `const ANIM_PROPS_3D = ${JSON.stringify(ANIM_PROPS_3D)};`,
      `const Scene3DCore = ${InteractiveExport.serializeValue(Scene3DCore)};`,
      `const APP_VERSION = ${JSON.stringify(APP_VERSION)};`,
      InputBus.toString(), StateMachineRuntime.toString(), ...InteractiveExport.triggerRuntime()
    ].join('\n').replace(/<\/script/gi, '<\\/script');
    const boot = `
(async function () {
  const data = JSON.parse(document.getElementById('ds-data').textContent);
  const L = __ds3dFactory(), T = L.THREE, S = data.scene3d.settings;
  const canvas = document.getElementById('ds-canvas');
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(S.camera.fov, 1, 0.05, 500);
  camera.position.set(...S.camera.pos);
  Scene3DCore.applySettings(L, renderer, scene, S, Scene3DCore.envMap(L, renderer));
  const ground = Scene3DCore.makeGround(L, S); if (ground) scene.add(ground);
  const { root, objs } = await Scene3DCore.buildAll(L, data.scene3d); scene.add(root);
  let controls = null;
  if (S.orbit) { controls = new L.OrbitControls(camera, canvas); controls.target.set(...S.camera.target); controls.enableDamping = true; controls.autoRotate = !!S.autoRotate; controls.update(); }
  else camera.lookAt(new T.Vector3(...S.camera.target));
  const model = { animations: data.animations, ${evalSrc} };
  const bus = new InputBus(data.inputs);
  const apply = (id, p, v) => { const o = objs.get(id); if (o) Scene3DCore.applyProp(o, p, v); };
  const runtimes = data.stateMachines.map(sm => new StateMachineRuntime(model, sm, bus, apply));
  const evHandlers = new Map();
  const emit = (name) => { (evHandlers.get(name) || []).concat(evHandlers.get('*') || []).forEach(fn => { try { fn(name); } catch (e) { console.error(e); } }); try { parent.postMessage({ source: 'designstudio', event: name }, '*'); } catch (e) { /* no parent */ } };
  const home = { pos: camera.position.clone(), target: controls ? controls.target.clone() : new T.Vector3(...S.camera.target) };
  const camTarget = controls ? controls.target : home.target.clone();
  let camStep = null;
  const engine = data.triggers.length ? new TriggerEngine(data.triggers, { animations: data.animations, inputs: data.inputs }, bus, {
    apply, get: (id, p) => { const o = objs.get(id); return o ? Scene3DCore.readProp(o, p) : undefined; },
    evaluateIn: (a, id, p, t) => model.evaluateIn(a, id, p, t),
    camera: (a) => { const to = a.type === 'cameraReset' ? home : (objs.get(a.targetId) && Scene3DCore.focusPose(L, objs.get(a.targetId), camera, camTarget)); if (to) camStep = Scene3DCore.cameraTween(L, camera, camTarget, to, +a.duration || 800); },
    openUrl: (u) => { const s = String(u || '').trim(), l = s.toLowerCase(); if (l.startsWith('https://') || l.startsWith('http://') || l.startsWith('mailto:')) window.open(s, '_blank', 'noopener,noreferrer'); }, emit
  }, '3d') : null;
  const fallback = runtimes.length || engine ? null : data.animations.find(a => a.id === data.activeAnimationId);
  function resize() { const w = innerWidth, h = innerHeight - ${'${CTL}'}; renderer.setSize(w, h, false); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  let last = null, clock = 0;
  let last0 = null;
  function frame(ts) {
    const dt = last == null ? 0 : Math.min(0.1, (ts - last) / 1000); last0 = last; last = ts;
    if (runtimes.length) runtimes.forEach(rt => rt.advance(dt));
    if (engine) engine.tick(last0 == null ? 0 : Math.min(1, (ts - last0) / 1000));
    if (camStep && camStep(last0 == null ? 0 : Math.min(1, (ts - last0) / 1000))) camStep = null;
    if (!runtimes.length && fallback && Object.keys(fallback.tracks).length) {
      clock += dt; const d = Math.max(0.0001, fallback.duration);
      const t = fallback.loop === 'oneShot' ? Math.min(clock, d) : fallback.loop === 'pingPong' ? ((m) => m <= d ? m : 2 * d - m)(clock % (2 * d)) : clock % d;
      for (const [id, props] of Object.entries(fallback.tracks)) for (const p of Object.keys(props)) apply(id, p, model.evaluateIn(fallback, id, p, t));
    }
    if (controls) controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const ray = new T.Raycaster();
  function hit(e) {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const h = ray.intersectObject(root, true).find(x => x.object.isMesh);
    const out = []; if (h) for (let o = h.object; o; o = o.parent) if (o.userData.id) out.push(o.userData.id);
    return out;
  }
  const listened = new Set(runtimes.flatMap(rt => rt.hasListenerTargets()));
  let down = [], hover = new Set(), downPos = null;
  canvas.addEventListener('pointerdown', (e) => { down = hit(e); downPos = [e.clientX, e.clientY]; if (controls && down.some(i => listened.has(i))) { controls.enabled = false; addEventListener('pointerup', () => { controls.enabled = true; }, { once: true }); } runtimes.forEach(rt => rt.pointer('pointerDown', down)); if (engine) engine.pointerDown(down, e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', (e) => { const ids = hit(e); const moved = downPos && Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]) > 5; const c = moved ? [] : ids.filter(i => down.includes(i)); runtimes.forEach(rt => { rt.pointer('pointerUp', ids); if (c.length) rt.pointer('click', c); }); if (engine) engine.pointerUp(ids, e.clientX, e.clientY); });
  if (engine) {
    for (const id of engine.listens()) listened.add(id);
    canvas.addEventListener('pointerleave', () => engine.pointerLeave());
    window.addEventListener('keydown', (e) => engine.key('down', e.key));
    window.addEventListener('keyup', (e) => engine.key('up', e.key));
    if (data.triggers.some(t => t.event.type === 'scroll')) {
      if (controls) controls.enableZoom = false;
      let sp = 0;
      canvas.addEventListener('wheel', (e) => { e.preventDefault(); sp = Math.max(0, Math.min(100, sp + e.deltaY * 0.05)); engine.scroll(sp); }, { passive: false });
    }
    engine.start(null);
  }
  canvas.addEventListener('pointermove', (e) => {
    const ids = hit(e), now = new Set(ids), ent = ids.filter(i => !hover.has(i)), ex = [...hover].filter(i => !now.has(i));
    runtimes.forEach(rt => { if (ent.length) rt.pointer('pointerEnter', ent); if (ex.length) rt.pointer('pointerExit', ex); });
    canvas.style.cursor = ids.some(i => listened.has(i)) ? 'pointer' : (controls ? 'grab' : 'default'); hover = now;
    if (engine) { const r = canvas.getBoundingClientRect(); engine.pointerMove(ids, e.clientX, e.clientY, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }
  });
  const api = {
    version: APP_VERSION,
    inputs: () => data.inputs.map(i => ({ name: i.name, type: i.type, value: bus.get(i.id) })),
    fire(name) { const d = bus.byName(name); if (d) bus.fire(d.id); },
    set(name, v) { const d = bus.byName(name); if (d) bus.set(d.id, v); },
    get(name) { const d = bus.byName(name); return d ? bus.get(d.id) : undefined; },
    onInput(fn) { return bus.onChange((id, v) => { const d = data.inputs.find(i => i.id === id); fn(d && d.name, v); }); },
    states: () => runtimes.map(rt => rt.layers.map(L => L.state && L.state.name)),
    three: { scene, camera, renderer, objects: objs },
    on(name, fn) { if (!evHandlers.has(name)) evHandlers.set(name, []); evHandlers.get(name).push(fn); return () => evHandlers.set(name, evHandlers.get(name).filter(f => f !== fn)); }
  };
  window.DesignStudioPlayer = api;
  const panel = document.getElementById('ds-controls');
  if (panel && data.inputs.length) for (const def of data.inputs) {
    const row = document.createElement('label'); row.className = 'ds-ctl';
    const nm = document.createElement('span'); nm.textContent = def.name; let ctl;
    if (def.type === 'trigger') { ctl = document.createElement('button'); ctl.textContent = 'Fire'; ctl.onclick = (e) => { e.preventDefault(); bus.fire(def.id); }; }
    else if (def.type === 'boolean') { ctl = document.createElement('input'); ctl.type = 'checkbox'; ctl.checked = !!bus.get(def.id); ctl.onchange = () => bus.set(def.id, ctl.checked); bus.onChange((id, v) => { if (id === def.id) ctl.checked = !!v; }); }
    else { ctl = document.createElement('input'); ctl.type = 'number'; ctl.step = 'any'; ctl.value = bus.get(def.id); ctl.oninput = () => bus.set(def.id, ctl.value); }
    row.append(nm, ctl); panel.appendChild(row);
  } else if (panel) panel.remove();
  document.documentElement.dataset.ready = '1';
})().catch((e) => { document.body.insertAdjacentHTML('beforeend', '<p style="color:#f88;font:14px sans-serif;padding:16px">3D viewer error: ' + String(e.message).replace(/</g, '&lt;') + '</p>'); });`.replace('${CTL}', m.inputs.length && s.showInputs !== false ? '52' : '0');
    const lib = __ds3dFactory.toString().replace(/<\/script/gi, '<\\/script');
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="DesignStudio ${APP_VERSION}"><title>${Utils.escapeHtml(title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:${s.transparent ? 'transparent' : Utils.safeColor(s.bg, '#16171d')};font-family:system-ui,sans-serif}#ds-canvas{display:block;touch-action:none}
#ds-controls{position:fixed;left:0;right:0;bottom:0;height:52px;display:flex;gap:14px;align-items:center;padding:0 16px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;overflow-x:auto}.ds-ctl{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}.ds-ctl input[type=number]{width:64px}</style>
</head><body><canvas id="ds-canvas" aria-label="${Utils.escapeHtml(title)}"></canvas>${m.inputs.length && s.showInputs !== false ? '<div id="ds-controls" aria-label="State machine inputs"></div>' : ''}
<script type="application/json" id="ds-data">${json}</script>
<script>/*! three.js r170 — MIT License — https://threejs.org */
${lib}</script>
<script>
${runtime}
${boot}
</script></body></html>
`;
  },

  // ------------------------------------------------------------------ keyboard
  s3Key(e) {
    if (this.section !== '3d' || !this.s3?.ready) return;
    const a = document.activeElement;
    if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    if (document.querySelector('.modal-overlay.open, .modal.open')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.s3Redo(); else this.s3Undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); this.s3Redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); this.s3Duplicate(); return; }
    if (mod) return;
    if (e.key === 'Escape') { if (this.s3.preview) this.s3StopPreview(); else this.s3Select(null); return; }
    if (this.s3.preview) return;
    if (k === 'w') this.s3GizmoMode('translate');
    else if (k === 'e') this.s3GizmoMode('rotate');
    else if (k === 'r') this.s3GizmoMode('scale');
    else if (k === 'f') this.s3Focus();
    else if (k === 'k') this.s3KeySelection();
    else if (e.key === ' ') { e.preventDefault(); this.s3Play(!this.s3.playing); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.s3Delete(); }
  }
};
Object.assign(StudioApp.prototype, Space3DMixin);
