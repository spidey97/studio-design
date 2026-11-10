/**
 * DesignStudio — 3D scene core (v3.3.0).
 * Pure scene-description → three.js builders, shared by the 3D editor and the exported interactive viewer
 * (this object literal is serialised into exports, so it must only use its arguments, `Utils` and itself).
 * `L` is the vendor bundle (window.DS3D): { THREE, OrbitControls, GLTFLoader, OBJLoader, STLLoader, SVGLoader, RoomEnvironment, RoundedBoxGeometry … }.
 */
'use strict';

/** Animatable 3D properties (keyframes live in the same animations as 2D tracks, keyed by `o3_…` ids). */
const ANIM_PROPS_3D = ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 'opacity', 'color', 'emissive', 'intensity', 'metalness', 'roughness'];

const Scene3DCore = {
  DEG: Math.PI / 180,
  PRIMS: {
    box: { w: 1, h: 1, d: 1, r: 0.08 }, sphere: { r: 0.6 }, cylinder: { rt: 0.5, rb: 0.5, h: 1.2 }, cone: { r: 0.6, h: 1.2 },
    torus: { r: 0.5, t: 0.18 }, knot: { r: 0.45, t: 0.14 }, capsule: { r: 0.35, l: 0.8 }, plane: { w: 2, h: 2 }, icosa: { r: 0.6, detail: 0 },
    text: { text: 'Hello 3D', size: 0.5, font: 'Inter, system-ui, sans-serif', weight: 700 }
  },
  LIGHTS: { dirLight: 'Directional light', pointLight: 'Point light', spotLight: 'Spot light', hemiLight: 'Hemisphere light', ambLight: 'Ambient light' },
  isLight(type) { return /Light$/.test(type); },

  defaultSettings() {
    return { bg: '#16171d', transparent: false, env: true, envIntensity: 1, exposure: 1, ground: 'shadow', groundColor: '#2a2c35', grid: true, fog: false, fogColor: '#16171d', fogDensity: 0.04,
      camera: { pos: [4.2, 3.1, 5.2], target: [0, 0.4, 0], fov: 40 }, orbit: true, autoRotate: false };
  },
  newObject(type, extra = {}) {
    const id = `o3_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
    const base = { id, type, name: extra.name || ({ ...this.LIGHTS, box: 'Box', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone', torus: 'Torus', knot: 'Torus knot', capsule: 'Capsule', plane: 'Plane', icosa: 'Icosahedron', text: 'Text', extrude: 'Extruded vector', model: 'Model', group: 'Group' }[type] || type),
      parent: null, visible: true, px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, castShadow: true, receiveShadow: true };
    if (this.PRIMS[type]) base.geo = { ...this.PRIMS[type] };
    if (this.isLight(type)) {
      base.light = { color: '#ffffff', intensity: { dirLight: 2.2, pointLight: 12, spotLight: 30, hemiLight: 0.8, ambLight: 0.4 }[type], distance: 0, angle: 30, penumbra: 0.3, ground: '#3a3530', castShadow: type !== 'hemiLight' && type !== 'ambLight' };
      Object.assign(base, { px: 3, py: 5, pz: 4, castShadow: false, receiveShadow: false });
    } else if (type !== 'group') {
      base.mat = { type: 'standard', color: '#7c8cff', metalness: 0.1, roughness: 0.4, opacity: 1, emissive: '#000000', emissiveIntensity: 1, wireframe: false, flat: false, transmission: 0.9, ior: 1.45, override: type !== 'model' && type !== 'extrude' };
    }
    if (type === 'text') base.mat.color = '#ffffff';
    if (type === 'extrude') base.geo = { svg: '', depth: 20, bevel: 2, useSvgColors: true, scale: 0.01 };
    return Object.assign(base, extra);
  },

  // ----------------------------------------------------------------- geometry & materials
  geometry(L, def) {
    const T = L.THREE, g = def.geo || {};
    switch (def.type) {
      case 'box': return g.r > 0 ? new L.RoundedBoxGeometry(g.w, g.h, g.d, 4, Math.min(g.r, Math.min(g.w, g.h, g.d) / 2 - 0.001)) : new T.BoxGeometry(g.w, g.h, g.d);
      case 'sphere': return new T.SphereGeometry(g.r, 64, 32);
      case 'cylinder': return new T.CylinderGeometry(g.rt, g.rb, g.h, 64);
      case 'cone': return new T.ConeGeometry(g.r, g.h, 64);
      case 'torus': return new T.TorusGeometry(g.r, g.t, 32, 96);
      case 'knot': return new T.TorusKnotGeometry(g.r, g.t, 160, 24);
      case 'capsule': return new T.CapsuleGeometry(g.r, g.l, 12, 32);
      case 'plane': return new T.PlaneGeometry(g.w, g.h);
      case 'icosa': return new T.IcosahedronGeometry(g.r, g.detail | 0);
      default: return new T.BoxGeometry(1, 1, 1);
    }
  },
  material(L, m, colorOverride) {
    const T = L.THREE;
    const common = { color: colorOverride || m.color, transparent: m.opacity < 1, opacity: m.opacity, wireframe: !!m.wireframe, side: T.DoubleSide };
    let mat;
    if (m.type === 'basic') mat = new T.MeshBasicMaterial(common);
    else if (m.type === 'normal') mat = new T.MeshNormalMaterial({ wireframe: !!m.wireframe, transparent: m.opacity < 1, opacity: m.opacity, flatShading: !!m.flat, side: T.DoubleSide });
    else if (m.type === 'toon') mat = new T.MeshToonMaterial({ ...common, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity });
    else if (m.type === 'glass') mat = new T.MeshPhysicalMaterial({ ...common, metalness: 0, roughness: m.roughness, transmission: m.transmission, ior: m.ior, thickness: 0.6, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, flatShading: !!m.flat });
    else mat = new T.MeshPhysicalMaterial({ ...common, metalness: m.metalness, roughness: m.roughness, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, flatShading: !!m.flat, clearcoat: m.type === 'clearcoat' ? 1 : 0 });
    mat.userData.ds = true;
    return mat;
  },
  textMesh(L, def) {
    const T = L.THREE, g = def.geo, px = 128;
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const font = `${g.weight || 700} ${px}px ${g.font}`;
    x.font = font;
    const lines = String(g.text || ' ').split('\n');
    const w = Math.max(...lines.map(l => x.measureText(l).width), 8) + px * 0.4, h = px * 1.25 * lines.length + px * 0.2;
    c.width = Math.ceil(w); c.height = Math.ceil(h);
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#ffffff';
    lines.forEach((l, i) => x.fillText(l, c.width / 2, px * 0.1 + px * 1.25 * (i + 0.5)));
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const mat = new T.MeshBasicMaterial({ map: tex, color: def.mat.color, transparent: true, opacity: def.mat.opacity, side: T.DoubleSide, depthWrite: false });
    mat.userData.ds = true;
    const scale = g.size / px;
    return new T.Mesh(new T.PlaneGeometry(c.width * scale, c.height * scale), mat);
  },
  extrudeGroup(L, def) {
    const T = L.THREE, g = def.geo, grp = new T.Group(), inner = new T.Group();
    if (!g.svg) return grp;
    const data = new L.SVGLoader().parse(g.svg);
    data.paths.forEach((path, i) => {
      const style = path.userData?.style || {};
      const fill = style.fill && style.fill !== 'none' ? style.fill : null;
      if (!fill) return;
      const shapes = L.SVGLoader.createShapes(path);
      if (!shapes.length) return;
      const geo = new T.ExtrudeGeometry(shapes, { depth: g.depth, bevelEnabled: g.bevel > 0, bevelThickness: g.bevel, bevelSize: g.bevel * 0.6, bevelSegments: 3, curveSegments: 16 });
      const mesh = new T.Mesh(geo, this.material(L, def.mat, g.useSvgColors ? fill : null));
      mesh.position.z = -i * 0.02; // avoid z-fighting between stacked paths
      inner.add(mesh);
    });
    inner.scale.set(g.scale, -g.scale, g.scale);
    const box = new T.Box3().setFromObject(inner), ctr = box.getCenter(new T.Vector3());
    inner.position.sub(ctr);
    grp.add(inner);
    return grp;
  },
  b64ToBuf(b64) { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; },
  /** v3.20.0: glTF / GLB may not reference files outside themselves (no network fetches from a model). */
  checkGLTF(format, buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let text;
    if (format === 'gltf') text = new TextDecoder().decode(u8);
    else {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      if (u8.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a GLB file');
      const len = dv.getUint32(12, true);
      if (dv.getUint32(16, true) !== 0x4E4F534A || len > u8.byteLength - 20) throw new Error('Damaged GLB file');
      text = new TextDecoder().decode(u8.subarray(20, 20 + len));
    }
    const json = JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v));
    const ext = [...(json.buffers || []), ...(json.images || [])].filter(x => x && typeof x.uri === 'string' && !/^data:/i.test(x.uri));
    if (ext.length) throw new Error('This model links to external files — export it as a .glb (or a .gltf with embedded data) first');
  },
  async loadModel(L, asset) {
    const T = L.THREE, buf = this.b64ToBuf(asset.data);
    if (asset.format === 'glb' || asset.format === 'gltf') this.checkGLTF(asset.format, buf);
    let obj;
    if (asset.format === 'glb' || asset.format === 'gltf') {
      const gltf = await new Promise((res, rej) => new L.GLTFLoader().parse(asset.format === 'gltf' ? new TextDecoder().decode(buf) : buf, '', res, rej));
      obj = gltf.scene; obj.userData.clips = gltf.animations || [];
    } else if (asset.format === 'obj') obj = new L.OBJLoader().parse(new TextDecoder().decode(buf));
    else if (asset.format === 'stl') { const geo = new L.STLLoader().parse(buf); geo.computeVertexNormals(); obj = new T.Mesh(geo, new T.MeshStandardMaterial({ color: '#b8bcc8', roughness: 0.5 })); }
    else throw new Error(`Unsupported 3D format: ${asset.format}`);
    // normalise: centre on the ground and fit into ~2 units
    const box = new T.Box3().setFromObject(obj), size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3());
    const s = asset.fit === false ? 1 : 2 / Math.max(size.x, size.y, size.z, 1e-6);
    const wrap = new T.Group();
    obj.position.sub(new T.Vector3(ctr.x, box.min.y, ctr.z));
    wrap.add(obj); wrap.scale.setScalar(s);
    const outer = new T.Group(); outer.add(wrap);
    outer.userData.clips = obj.userData.clips;
    return outer;
  },

  /** Build one object (without children). Returns a THREE.Object3D tagged with userData.id. */
  async build(L, def, assets = {}) {
    const T = L.THREE;
    this._L = L; // v3.14.0: kept for shape keys (geometry rebuilt while animating)
    let obj;
    if (this.isLight(def.type)) {
      const l = def.light;
      if (def.type === 'dirLight') obj = new T.DirectionalLight(l.color, l.intensity);
      else if (def.type === 'pointLight') obj = new T.PointLight(l.color, l.intensity, l.distance || 0, 2);
      else if (def.type === 'spotLight') obj = new T.SpotLight(l.color, l.intensity, l.distance || 0, l.angle * this.DEG, l.penumbra, 2);
      else if (def.type === 'hemiLight') obj = new T.HemisphereLight(l.color, l.ground, l.intensity);
      else obj = new T.AmbientLight(l.color, l.intensity);
      if (obj.shadow && l.castShadow) {
        obj.castShadow = true; obj.shadow.mapSize.set(2048, 2048); obj.shadow.bias = -0.0004; obj.shadow.normalBias = 0.02;
        if (obj.shadow.camera.isOrthographicCamera) Object.assign(obj.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 40 });
      }
    } else if (def.type === 'group') obj = new T.Group();
    else if (def.type === 'text') obj = this.textMesh(L, def);
    else if (def.type === 'extrude') obj = this.extrudeGroup(L, def);
    else if (def.type === 'model') {
      const a = assets[def.asset];
      obj = a ? await this.loadModel(L, a).catch((e) => { console.warn(`3D model skipped: ${e.message}`); return new T.Group(); }) : new T.Group();
      if (def.mat?.override) obj.traverse(o => { if (o.isMesh) o.material = this.material(L, def.mat); });
    } else obj = new T.Mesh(this.geometry(L, def), this.material(L, def.mat));
    if (obj.isMesh && def.mat?.map && assets[def.mat.map]) { // v3.17.0 image texture (linked Design / Media content)
      const a = assets[def.mat.map], src = typeof a === 'string' ? a : a.data;
      try {
        if (!/^data:image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml)[;,]/i.test(String(src || ''))) throw new Error('blocked texture URL'); // inline images only
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const tex = new T.Texture(img); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true;
        obj.material.map = tex; obj.material.transparent = true; obj.material.alphaTest = 0.01; obj.material.needsUpdate = true;
      } catch (e) { /* missing image: plain material */ }
    }
    obj.name = def.name;
    if (this.PRIMS[def.type] && def.type !== 'text' && obj.isMesh) obj.userData.geo = { ...(def.geo || {}) };
    obj.userData.id = def.id;
    obj.userData.type = def.type;
    obj.traverse(o => { if (o.isMesh) { o.castShadow = !!def.castShadow; o.receiveShadow = !!def.receiveShadow; } });
    this.applyDef(obj, def);
    return obj;
  },
  applyDef(obj, def) {
    for (const p of ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz']) this.applyProp(obj, p, def[p]);
    obj.visible = def.visible !== false;
    if (def.mat && !obj.isLight) for (const p of ['opacity', 'metalness', 'roughness', 'emissive']) if (def.mat[p] !== undefined && (def.mat.override !== false || p === 'opacity')) this.applyProp(obj, p, def.mat[p]);
  },
  /** Base (un-animated) value of an animatable property. */
  baseValue(def, prop) {
    if (prop.startsWith('geo.')) return def.geo ? def.geo[prop.slice(4)] : undefined;
    if (prop.startsWith('morph.')) return (def.morph && def.morph[prop.slice(6)]) || 0;
    if (['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'].includes(prop)) return def[prop];
    if (this.isLight(def.type)) return prop === 'color' ? def.light.color : prop === 'intensity' ? def.light.intensity : undefined;
    return def.mat ? def.mat[prop] : undefined;
  },
  materials(obj) { const out = []; obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => out.push(m)); }); return out; },
  applyProp(obj, prop, v) {
    if (v === undefined || v === null) return;
    const D = this.DEG;
    switch (prop) {
      case 'px': obj.position.x = v; return; case 'py': obj.position.y = v; return; case 'pz': obj.position.z = v; return;
      case 'rx': obj.rotation.x = v * D; return; case 'ry': obj.rotation.y = v * D; return; case 'rz': obj.rotation.z = v * D; return;
      case 'sx': obj.scale.x = v; return; case 'sy': obj.scale.y = v; return; case 'sz': obj.scale.z = v; return;
      case 'visible': obj.visible = !!v; return;
      case 'intensity': if (obj.isLight) obj.intensity = v; return;
      case 'color':
        if (obj.isLight) { obj.color.set(v); return; }
        for (const m of this.materials(obj)) if (m.color && (m.userData.ds || obj.userData.type === 'model')) m.color.set(v);
        return;
      case 'opacity':
        for (const m of this.materials(obj)) { if (m.userData.baseT === undefined) m.userData.baseT = m.transparent; m.opacity = v; const t = v < 1 || m.userData.baseT; if (t !== m.transparent) { m.transparent = t; m.needsUpdate = true; } }
        return;
      case 'emissive': for (const m of this.materials(obj)) if (m.emissive) m.emissive.set(v); return;
      case 'metalness': case 'roughness': for (const m of this.materials(obj)) if (prop in m && m.userData.ds) m[prop] = v; return;
      default:
        if (prop.startsWith('geo.') && obj.isMesh && obj.userData.geo && this._L) { // shape key: geometry parameter
          const k = prop.slice(4);
          if (obj.userData.geo[k] === v) return;
          obj.userData.geo[k] = v;
          const g = this.geometry(this._L, { type: obj.userData.type, geo: obj.userData.geo });
          obj.geometry.dispose(); obj.geometry = g;
          return;
        }
        if (prop.startsWith('morph.')) { const i = +prop.slice(6); obj.traverse(o => { if (o.isMesh && o.morphTargetInfluences && i < o.morphTargetInfluences.length) o.morphTargetInfluences[i] = v; }); return; }
    }
  },

  /** Current value of an animatable property on a built object (used by triggers). */
  readProp(obj, prop) {
    const D = this.DEG, mats = this.materials(obj), m0 = mats[0];
    switch (prop) {
      case 'px': return obj.position.x; case 'py': return obj.position.y; case 'pz': return obj.position.z;
      case 'rx': return obj.rotation.x / D; case 'ry': return obj.rotation.y / D; case 'rz': return obj.rotation.z / D;
      case 'sx': return obj.scale.x; case 'sy': return obj.scale.y; case 'sz': return obj.scale.z;
      case 'visible': return obj.visible;
      case 'intensity': return obj.isLight ? obj.intensity : undefined;
      case 'color': return obj.isLight ? '#' + obj.color.getHexString() : m0?.color ? '#' + m0.color.getHexString() : undefined;
      case 'emissive': return m0?.emissive ? '#' + m0.emissive.getHexString() : undefined;
      case 'opacity': return m0 ? m0.opacity : 1;
      case 'metalness': case 'roughness': return m0 && prop in m0 ? m0[prop] : undefined;
      default:
        if (prop.startsWith('geo.')) return obj.userData.geo ? obj.userData.geo[prop.slice(4)] : undefined;
        if (prop.startsWith('morph.')) { let v; obj.traverse(o => { if (v === undefined && o.isMesh && o.morphTargetInfluences) v = o.morphTargetInfluences[+prop.slice(6)]; }); return v; }
        return undefined;
    }
  },
  /** Camera pose that frames an object (keeps the current viewing direction). */
  focusPose(L, obj, camera, target) {
    const T = L.THREE, box = new T.Box3().setFromObject(obj);
    if (box.isEmpty()) return null;
    const c = box.getCenter(new T.Vector3()), r = Math.max(0.5, box.getSize(new T.Vector3()).length() / 2);
    const dir = camera.position.clone().sub(target).normalize();
    return { pos: c.clone().add(dir.multiplyScalar((r / Math.sin((camera.fov * this.DEG) / 2)) * 1.15)), target: c };
  },
  /** Ease the camera toward a pose; returns a stepper(dt) → done. */
  cameraTween(L, camera, controlsTarget, to, ms) {
    const fromP = camera.position.clone(), fromT = controlsTarget.clone(), dur = Math.max(0.01, (ms || 800) / 1000);
    let t = 0;
    return (dt) => {
      t = Math.min(1, t + dt / dur);
      const k = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(fromP, to.pos, k); controlsTarget.lerpVectors(fromT, to.target, k); camera.lookAt(controlsTarget);
      return t >= 1;
    };
  },

  /** Renderer / scene settings shared by editor and viewer. */
  applySettings(L, renderer, scene, s, env) {
    const T = L.THREE;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = s.exposure ?? 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene.background = s.transparent ? null : new T.Color(s.bg);
    scene.environment = s.env ? env : null;
    scene.environmentIntensity = s.envIntensity ?? 1;
    scene.fog = s.fog ? new T.FogExp2(s.fogColor || s.bg, s.fogDensity || 0.04) : null;
  },
  makeGround(L, s) {
    const T = L.THREE;
    if (!s.ground || s.ground === 'none') return null;
    const geo = new T.PlaneGeometry(60, 60);
    const mat = s.ground === 'solid' ? new T.MeshStandardMaterial({ color: s.groundColor, roughness: 0.9 }) : new T.ShadowMaterial({ opacity: 0.28 });
    const g = new T.Mesh(geo, mat);
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; g.userData.ground = true;
    return g;
  },
  envMap(L, renderer) {
    const pm = new L.THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(new L.RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return tex;
  },
  /** Build every object, parent them, return { root, objs: Map(id → Object3D) }. */
  async buildAll(L, scene3d) {
    const root = new L.THREE.Group(), objs = new Map();
    for (const def of scene3d.objects) objs.set(def.id, await this.build(L, def, scene3d.assets || {}));
    for (const def of scene3d.objects) {
      const o = objs.get(def.id), p = def.parent && objs.get(def.parent);
      (p || root).add(o);
      if (o.isDirectionalLight || o.isSpotLight) { o.target.position.set(0, 0, 0); root.add(o.target); }
    }
    return { root, objs };
  }
};
