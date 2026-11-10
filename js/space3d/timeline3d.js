/**
 * DesignStudio — 3D timeline / dope sheet (v3.14.0).
 * Replaces the 3D scrub bar with a full timeline: object rows that expand into property rows, a ruler with seconds or
 * frames, playhead, playback range (in / out), zoom & scroll. Keys can be selected (click, Shift / Ctrl, marquee),
 * dragged in time (snaps to frames; Alt = free), nudged with ← →, copied / cut / pasted / duplicated, deleted, and given
 * an easing — any named curve or a custom cubic-bezier drawn in the curve editor. “＋ Track” keys any animatable
 * property, including shape keys (geometry parameters of primitives) and morph targets of imported models.
 */
'use strict';

const T3_ROW = 22, T3_RULER = 24, T3_PAD = 12;
const T3_PROP_LABELS = { px: 'Position X', py: 'Position Y', pz: 'Position Z', rx: 'Rotation X', ry: 'Rotation Y', rz: 'Rotation Z', sx: 'Scale X', sy: 'Scale Y', sz: 'Scale Z', opacity: 'Opacity', color: 'Color', emissive: 'Emissive', intensity: 'Intensity', metalness: 'Metalness', roughness: 'Roughness' };
const T3_GEO_LABELS = { w: 'Width', h: 'Height', d: 'Depth', r: 'Radius', rt: 'Top radius', rb: 'Bottom radius', t: 'Thickness', l: 'Length', detail: 'Detail' };
const T3_EASES = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeInOutSine', 'easeOutExpo', 'easeInBack', 'easeOutBack', 'easeInOutBack', 'spring', 'bounce', 'elastic', 'hold'];
const T3_BEZIER_PRESETS = [['Ease', [0.25, 0.1, 0.25, 1]], ['Ease out', [0.33, 1, 0.68, 1]], ['Ease in', [0.32, 0, 0.67, 0]], ['Snappy', [0.2, 0, 0, 1]], ['Overshoot', [0.34, 1.56, 0.64, 1]], ['Anticipate', [0.36, 0, 0.66, -0.56]], ['Slow-mo', [0.1, 0.9, 0.9, 0.1]], ['Linear', [0, 0, 1, 1]]];

(function patch3D() {
  const P = StudioApp.prototype, bind = P.bind3D, setTime = P.s3SetTime, restore = P.s3Restore, key = P.s3Key;
  P.bind3D = function () { bind.call(this); this.bindTimeline3D(); };
  P.s3SetTime = function (t) { setTime.call(this, t); this.t3Draw?.(); };
  P.s3Restore = async function (json) { const r = await restore.call(this, json); if (this.t3) this.t3.sel.clear(); return r; };
  P.s3RenderKeys = function () { this.t3Render?.(); };
  P.s3Key = function (e) { if (this.t3Key?.(e)) return; key.call(this, e); };
})();

const Timeline3DMixin = {
  bindTimeline3D() {
    const bar = document.querySelector('.s3-anim');
    if (!bar) return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('designstudio.t3.v1') || '{}') || {}; } catch (_) { /* ignore */ }
    this.t3 = { expanded: new Set(), sel: new Set(), zoom: 1, scrollX: 0, scrollY: 0, units: saved.units || 's', snap: saved.snap !== false, collapsed: !!saved.collapsed, height: saved.height || 200, clip: null };
    const ease = T3_EASES.map(k => `<option value="${k}">${Utils.easingLabels[k] || k}</option>`).join('');
    bar.classList.add('t3');
    bar.innerHTML = `
      <div class="t3-bar" role="toolbar" aria-label="3D timeline">
        <select id="s3-anim-sel" aria-label="Animation"></select><button id="s3-anim-add" class="btn-ghost t3-ic" title="New animation" aria-label="New animation">＋</button><button id="t3-anim-menu" class="btn-ghost t3-ic" title="Rename, duplicate or delete this animation" aria-label="Animation options">⋯</button>
        <i class="t3-sep"></i>
        <button id="t3-first" class="btn-ghost t3-ic" title="Go to start (Home)" aria-label="Go to start">⏮</button><button id="t3-prevk" class="btn-ghost t3-ic" title="Previous key (J)" aria-label="Previous key">◂◆</button><button id="s3-play" class="btn-ghost t3-ic t3-play" title="Play / pause (Space)" aria-label="Play">▶</button><button id="t3-nextk" class="btn-ghost t3-ic" title="Next key (L)" aria-label="Next key">◆▸</button><button id="t3-last" class="btn-ghost t3-ic" title="Go to end (End)" aria-label="Go to end">⏭</button>
        <button id="s3-tlabel" class="t3-time" title="Click to switch seconds / frames">0.00 s</button>
        <i class="t3-sep"></i>
        <button id="s3-key" class="btn-ghost" title="Key the selected object’s transform + material at the playhead (K)">◆ Key</button><button id="s3-unkey" class="btn-ghost t3-ic" title="Delete the selected object’s keys at the playhead" aria-label="Delete keys at playhead">◇</button><button id="s3-autokey" class="btn-ghost" title="Auto-key: edits create keys">● Auto</button>
        <button id="t3-addtrack" class="btn-ghost" title="Key any property: transform, material, light, shape keys, morph targets">＋ Track ▾</button>
        <i class="t3-sep"></i>
        <label class="t3-f" title="Easing from the selected keys to the next key"><span>Ease</span><select id="t3-ease" aria-label="Easing of selected keys"><option value="" disabled selected>—</option>${ease}<option value="custom">Custom curve</option></select></label>
        <button id="t3-curve" class="btn-ghost" title="Edit the easing curve of the selected keys">Curve…</button>
        <button id="t3-copy" class="btn-ghost t3-ic" title="Copy keys (Ctrl+C)" aria-label="Copy keys">${Icons.svg("copy", 15)}</button><button id="t3-paste" class="btn-ghost t3-ic" title="Paste keys at the playhead (Ctrl+V)" aria-label="Paste keys">${Icons.svg("paste", 15)}</button><button id="t3-del" class="btn-ghost t3-ic" title="Delete selected keys (Delete)" aria-label="Delete selected keys">${Icons.svg("trash", 15)}</button>
        <span class="t3-grow"></span>
        <select id="s3-loop" aria-label="Loop" title="Loop mode"><option value="loop">Loop</option><option value="pingPong">Ping-pong</option><option value="oneShot">Once</option></select>
        <select id="t3-speed" aria-label="Playback speed" title="Playback speed (editor)">${[0.25, 0.5, 1, 1.5, 2].map(v => `<option value="${v}"${v === 1 ? ' selected' : ''}>${v}×</option>`).join('')}</select>
        <label class="t3-f" title="Duration in seconds"><span>Dur</span><input type="number" id="s3-dur" min="0.1" max="600" step="0.1" aria-label="Duration"></label>
        <select id="t3-fps" aria-label="Frame rate" title="Frame rate">${[12, 24, 25, 30, 48, 50, 60].map(v => `<option value="${v}">${v} fps</option>`).join('')}</select>
        <button id="t3-snap" class="btn-ghost t3-ic${this.t3.snap ? ' on' : ''}" title="Snap keys to frames (hold Alt to move freely)" aria-label="Snap to frames">⌗</button>
        <button id="t3-fit" class="btn-ghost t3-ic" title="Fit the animation in view" aria-label="Fit to view">⤢</button>
        <button id="t3-toggle" class="btn-ghost t3-ic" title="Show / hide the dope sheet" aria-label="Toggle dope sheet">▾</button>
        <input type="range" id="s3-time" hidden aria-hidden="true"><div id="s3-keys" hidden></div>
      </div>
      <div class="t3-sheet" id="t3-sheet">
        <div class="t3-resize" id="t3-resize" title="Drag to resize" aria-hidden="true"></div>
        <div class="t3-names" id="t3-names" role="group" aria-label="Animated objects and properties"></div>
        <div class="t3-lanes" id="t3-lanes"><canvas id="t3-canvas" tabindex="0" aria-label="Keyframes — click to select, drag to move, right-click for options"></canvas></div>
      </div>`;
    const $ = (id) => document.getElementById(id), s3 = this.s3, a = () => this.model.activeAnimation;
    // re-bind the controls the 3D section already uses (same ids)
    $('s3-anim-sel').addEventListener('change', (e) => { this.setActiveAnimation ? this.setActiveAnimation(e.target.value) : (this.model.activeAnimationId = e.target.value); this.t3.sel.clear(); this.s3ResetPose(); this.s3SetTime(0); this.s3RenderAnim(); this.t3Render(); });
    $('s3-anim-add').addEventListener('click', () => { const m = this.model; const an = StudioModel.newAnimation(`3D Animation ${m.animations.length + 1}`, { duration: 3 }); m.animations.push(an); m.activeAnimationId = an.id; this.s3ResetPose(); this.s3SetTime(0); this.s3Commit('New animation'); });
    $('s3-play').addEventListener('click', () => this.s3Play(!s3.playing));
    $('s3-key').addEventListener('click', () => this.s3KeySelection());
    $('s3-unkey').addEventListener('click', () => this.s3UnkeySelection());
    $('s3-autokey').addEventListener('click', () => { s3.autoKey = !s3.autoKey; $('s3-autokey').classList.toggle('on', s3.autoKey); });
    $('s3-dur').addEventListener('change', (e) => { const an = a(); an.duration = Utils.clamp(Utils.num(e.target.value, an.duration), 0.1, 600); this.s3Commit('Duration'); });
    $('s3-loop').addEventListener('change', (e) => { a().loop = e.target.value; this.s3Commit('Loop mode'); });
    $('s3-tlabel').addEventListener('click', () => { this.t3.units = this.t3.units === 's' ? 'f' : 's'; this.t3Save(); this.t3Draw(); });
    $('t3-first').addEventListener('click', () => { this.s3Play(false); this.s3SetTime(this.s3Range().in); });
    $('t3-last').addEventListener('click', () => { this.s3Play(false); this.s3SetTime(this.s3Range().out); });
    $('t3-prevk').addEventListener('click', () => this.t3JumpKey(-1));
    $('t3-nextk').addEventListener('click', () => this.t3JumpKey(1));
    $('t3-speed').addEventListener('change', (e) => { s3.speed = +e.target.value || 1; });
    $('t3-fps').addEventListener('change', (e) => { a().fps = +e.target.value; this.s3Commit('Frame rate'); });
    $('t3-snap').addEventListener('click', () => { this.t3.snap = !this.t3.snap; $('t3-snap').classList.toggle('on', this.t3.snap); this.t3Save(); });
    $('t3-fit').addEventListener('click', () => { this.t3.zoom = 1; this.t3.scrollX = 0; this.t3Draw(); });
    $('t3-toggle').addEventListener('click', () => { this.t3.collapsed = !this.t3.collapsed; this.t3Save(); this.t3Layout(); });
    $('t3-ease').addEventListener('change', (e) => { if (e.target.value === 'custom') this.t3CurveEditor(); else this.t3SetEase(e.target.value); });
    $('t3-curve').addEventListener('click', () => this.t3CurveEditor());
    $('t3-copy').addEventListener('click', () => this.t3Copy());
    $('t3-paste').addEventListener('click', () => this.t3Paste());
    $('t3-del').addEventListener('click', () => this.t3DeleteKeys());
    $('t3-addtrack').addEventListener('click', (e) => this.t3TrackMenu(e.currentTarget));
    $('t3-anim-menu').addEventListener('click', (e) => this.t3AnimMenu(e.currentTarget));
    this.t3BindCanvas();
    // resize the sheet
    $('t3-resize').addEventListener('pointerdown', (e) => {
      e.preventDefault(); const y0 = e.clientY, h0 = this.t3.height;
      const mv = (ev) => { this.t3.height = Utils.clamp(h0 - (ev.clientY - y0), 90, 520); this.t3Layout(); };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.t3Save(); this.s3Resize?.(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    new ResizeObserver(() => this.t3Draw()).observe($('t3-lanes'));
    this.t3Layout();
  },
  t3Save() { try { localStorage.setItem('designstudio.t3.v1', JSON.stringify({ units: this.t3.units, snap: this.t3.snap, collapsed: this.t3.collapsed, height: this.t3.height })); } catch (_) { /* ignore */ } },
  t3Layout() {
    const sheet = document.getElementById('t3-sheet');
    if (!sheet) return;
    sheet.style.display = this.t3.collapsed ? 'none' : '';
    sheet.style.height = `${this.t3.height}px`;
    document.getElementById('t3-toggle').textContent = this.t3.collapsed ? '▴' : '▾';
    this.s3Resize?.();
    this.t3Render();
  },

  // ------------------------------------------------------------------ model helpers
  t3Anim() { return this.model.activeAnimation; },
  t3Fps() { return this.t3Anim().fps || 30; },
  t3Snap(t, alt) { const f = this.t3Fps(); return this.t3.snap && !alt ? Math.round(t * f) / f : Math.round(t * 1000) / 1000; },
  t3Fmt(t) { return this.t3.units === 'f' ? `f ${Math.round(t * this.t3Fps())}` : `${t.toFixed(2)} s`; },
  t3PropLabel(p) { if (p.startsWith('geo.')) return `Shape · ${T3_GEO_LABELS[p.slice(4)] || p.slice(4)}`; if (p.startsWith('morph.')) { const names = this.t3MorphNames(this.s3.objs.get(this._t3RowObj)); return `Morph · ${names[+p.slice(6)] || p.slice(6)}`; } return T3_PROP_LABELS[p] || p; },
  t3MorphNames(o) { let names = []; o?.traverse?.(c => { if (!names.length && c.isMesh && c.morphTargetDictionary) { names = []; for (const [n, i] of Object.entries(c.morphTargetDictionary)) names[i] = n; } }); return names; },
  /** Visible rows: animated objects (+ the selected one), expanded into their property tracks. */
  t3Rows() {
    const a = this.t3Anim(), objs = this.model.scene3d?.objects || [], rows = [];
    const ids = objs.filter(o => a.tracks[o.id] && Object.keys(a.tracks[o.id]).length || o.id === this.s3.sel).map(o => o.id);
    for (const id of ids) {
      const def = this.def3(id); if (!def) continue;
      const props = Object.keys(a.tracks[id] || {});
      rows.push({ kind: 'obj', id, def, props });
      if (this.t3.expanded.has(id)) for (const p of props) rows.push({ kind: 'prop', id, def, prop: p });
    }
    return rows;
  },
  t3KeysOfRow(r) {
    const tr = this.t3Anim().tracks[r.id] || {};
    if (r.kind === 'prop') return (tr[r.prop] || []).map(k => ({ k, prop: r.prop, id: r.id }));
    return Object.entries(tr).flatMap(([prop, kfs]) => kfs.map(k => ({ k, prop, id: r.id })));
  },
  t3AllKeys() { const a = this.t3Anim(), out = []; for (const [id, tr] of Object.entries(a.tracks)) if (id.startsWith('o3_')) for (const [prop, kfs] of Object.entries(tr)) for (const k of kfs) out.push({ k, prop, id }); return out; },
  t3SelEntries() { return this.t3AllKeys().filter(e => this.t3.sel.has(e.k)); },
  t3Cleanup() { // sort, merge keys that landed on the same time, drop empty tracks
    const a = this.t3Anim();
    for (const [id, tr] of Object.entries(a.tracks)) {
      if (!id.startsWith('o3_')) continue;
      for (const [p, kfs] of Object.entries(tr)) {
        kfs.sort((x, y) => x.time - y.time);
        for (let i = kfs.length - 1; i > 0; i--) if (Math.abs(kfs[i].time - kfs[i - 1].time) < 0.0005) { const drop = this.t3.sel.has(kfs[i]) ? kfs[i - 1] : kfs[i]; kfs.splice(kfs.indexOf(drop), 1); }
        if (!kfs.length) delete tr[p];
      }
      if (!Object.keys(tr).length) delete a.tracks[id];
    }
  },
  t3Changed(label) { this.t3Cleanup(); this.s3ResetPose(); this.s3SetTime(this.s3.time); this.s3Commit(label); },

  // ------------------------------------------------------------------ rendering
  t3Render() {
    if (!this.t3) return;
    const names = document.getElementById('t3-names');
    if (!names || this.t3.collapsed) return;
    const a = this.t3Anim();
    document.getElementById('t3-fps').value = String(a.fps || 30);
    const rows = this.t3Rows();
    const sel = new Set(this.t3SelEntries().map(e => e.k)); this.t3.sel = sel;
    const t = Utils.round(this.s3.time, 3);
    names.innerHTML = `<div class="t3-nh" style="height:${T3_RULER}px"><span>${rows.length ? Utils.escapeHtml(a.name) : ''}</span></div><div class="t3-nrows"${rows.length ? ' role="tree" aria-label="Tracks"' : ''} style="transform:translateY(${-this.t3.scrollY}px)">${rows.map(r => {
      if (r.kind === 'obj') return `<div class="t3-n obj${r.id === this.s3.sel ? ' sel' : ''}" data-id="${r.id}" role="treeitem" aria-expanded="${this.t3.expanded.has(r.id)}"><button type="button" class="t3-tw" data-tw="${r.id}" aria-label="Expand">${r.props.length ? (this.t3.expanded.has(r.id) ? '▾' : '▸') : '·'}</button><span class="t3-nm">${Utils.escapeHtml(r.def.name)}</span><small>${r.props.length ? `${r.props.length} track${r.props.length === 1 ? '' : 's'}` : 'no keys'}</small></div>`;
      this._t3RowObj = r.id;
      const atKey = (a.tracks[r.id]?.[r.prop] || []).some(k => Math.abs(k.time - t) < 0.0005);
      return `<div class="t3-n prop" data-id="${r.id}" data-prop="${r.prop}" role="treeitem"><span class="t3-nm">${Utils.escapeHtml(this.t3PropLabel(r.prop))}</span><button type="button" class="t3-kb${atKey ? ' on' : ''}" data-key="${r.id}|${r.prop}" title="${atKey ? 'Remove the key at the playhead' : 'Add a key at the playhead'}" aria-label="Toggle key">◆</button></div>`;
    }).join('') || '<div class="t3-empty">Select an object and press ◆ Key (K), or use ＋ Track to animate any property.</div>'}</div>`;
    names.querySelectorAll('[data-tw]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); const id = b.dataset.tw; this.t3.expanded.has(id) ? this.t3.expanded.delete(id) : this.t3.expanded.add(id); this.t3Render(); }));
    names.querySelectorAll('.t3-n.obj').forEach(n => n.addEventListener('click', () => this.s3Select(n.dataset.id)));
    names.querySelectorAll('.t3-n.obj').forEach(n => n.addEventListener('dblclick', () => { const id = n.dataset.id; this.t3.expanded.has(id) ? this.t3.expanded.delete(id) : this.t3.expanded.add(id); this.t3Render(); }));
    names.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); const [id, prop] = b.dataset.key.split('|'); this.t3ToggleKey(id, prop); }));
    names.onwheel = (e) => { this.t3.scrollY = Math.max(0, this.t3.scrollY + e.deltaY); this.t3Render(); e.preventDefault(); };
    this.t3Draw();
  },
  t3Geom() {
    const cv = document.getElementById('t3-canvas'), box = document.getElementById('t3-lanes');
    if (!cv || !box) return null;
    const w = box.clientWidth, h = box.clientHeight, a = this.t3Anim();
    const pps = ((w - T3_PAD * 2) / Math.max(0.1, a.duration)) * this.t3.zoom;
    return { cv, w, h, pps, x: (t) => T3_PAD + t * pps - this.t3.scrollX, t: (x) => (x - T3_PAD + this.t3.scrollX) / pps };
  },
  t3Draw() {
    if (!this.t3 || this.t3.collapsed) return;
    const G = this.t3Geom(); if (!G || !G.w) return;
    const { cv, w, h } = G, dpr = window.devicePixelRatio || 1, a = this.t3Anim();
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement), col = (v, d) => css.getPropertyValue(v).trim() || d;
    const bg = col('--bg-panel', '#252526'), line = col('--border-color', '#3a3a3e'), sub = col('--text-sub', '#949494'), acc = col('--accent', '#0d99ff');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    // range shading
    const R = this.s3Range();
    if (R.in > 0) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(G.x(0), 0, G.x(R.in) - G.x(0), h); }
    if (R.out < a.duration) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(G.x(R.out), 0, G.x(a.duration) - G.x(R.out), h); }
    // rows
    const rows = this.t3Rows();
    c.save(); c.beginPath(); c.rect(0, T3_RULER, w, h - T3_RULER); c.clip();
    rows.forEach((r, i) => {
      const y = T3_RULER + i * T3_ROW - this.t3.scrollY;
      if (y > h || y + T3_ROW < T3_RULER) return;
      c.fillStyle = r.kind === 'obj' ? 'rgba(255,255,255,.035)' : 'transparent'; c.fillRect(0, y, w, T3_ROW);
      if (r.id === this.s3.sel && r.kind === 'obj') { c.fillStyle = 'rgba(13,153,255,.08)'; c.fillRect(0, y, w, T3_ROW); }
      c.strokeStyle = line; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y + T3_ROW - 0.5); c.lineTo(w, y + T3_ROW - 0.5); c.stroke();
      const keys = this.t3KeysOfRow(r).sort((p, q) => p.k.time - q.k.time), cy = y + T3_ROW / 2;
      if (r.kind === 'prop') { // interpolation bars
        for (let k = 0; k < keys.length - 1; k++) { const k1 = keys[k].k, k2 = keys[k + 1].k; if (k1.value === k2.value) continue; c.strokeStyle = k1.easing === 'hold' && !k1.bezier ? 'rgba(255,176,32,.35)' : 'rgba(255,176,32,.6)'; c.lineWidth = 2; c.setLineDash(k1.easing === 'hold' && !k1.bezier ? [3, 3] : []); c.beginPath(); c.moveTo(G.x(k1.time), cy); c.lineTo(G.x(k2.time), cy); c.stroke(); c.setLineDash([]); }
      }
      const drawn = new Map();
      for (const e of keys) { const tk = Utils.round(e.k.time, 3); const d = drawn.get(tk) || { sel: true, any: false, ease: e.k }; d.sel = d.sel && this.t3.sel.has(e.k); d.any = true; drawn.set(tk, d); }
      for (const [tk, d] of drawn) {
        const x = G.x(tk), s = r.kind === 'obj' ? 5 : 5.5;
        if (x < -10 || x > w + 10) continue;
        c.fillStyle = d.sel ? acc : r.kind === 'obj' ? '#c8952a' : '#ffb020';
        c.strokeStyle = d.sel ? '#fff' : 'rgba(0,0,0,.55)'; c.lineWidth = 1;
        c.beginPath();
        const hold = r.kind === 'prop' && d.ease.easing === 'hold' && !d.ease.bezier, lin = r.kind === 'prop' && d.ease.easing === 'linear' && !d.ease.bezier;
        if (hold) c.rect(x - s + 1, cy - s + 1, (s - 1) * 2, (s - 1) * 2);
        else if (lin || r.kind === 'obj') { c.moveTo(x, cy - s); c.lineTo(x + s, cy); c.lineTo(x, cy + s); c.lineTo(x - s, cy); c.closePath(); }
        else { c.moveTo(x, cy - s); c.quadraticCurveTo(x + s * 0.9, cy - s * 0.9, x + s, cy); c.quadraticCurveTo(x + s * 0.9, cy + s * 0.9, x, cy + s); c.quadraticCurveTo(x - s * 0.9, cy + s * 0.9, x - s, cy); c.quadraticCurveTo(x - s * 0.9, cy - s * 0.9, x, cy - s); }
        c.fill(); c.stroke();
      }
    });
    c.restore();
    // marquee
    if (this.t3.marquee) { const m = this.t3.marquee; c.fillStyle = 'rgba(13,153,255,.12)'; c.strokeStyle = acc; c.lineWidth = 1; c.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0); c.strokeRect(m.x0 + 0.5, m.y0 + 0.5, m.x1 - m.x0, m.y1 - m.y0); }
    // ruler
    c.fillStyle = col('--bg-header', '#2d2d30'); c.fillRect(0, 0, w, T3_RULER);
    c.strokeStyle = line; c.beginPath(); c.moveTo(0, T3_RULER - 0.5); c.lineTo(w, T3_RULER - 0.5); c.stroke();
    const fps = this.t3Fps(), steps = [1 / fps, 2 / fps, 5 / fps, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
    const major = steps.find(s => s * G.pps >= 64) || 60, minor = steps.filter(s => s < major && s * G.pps >= 8).pop() || major;
    c.font = '10px Inter, -apple-system, sans-serif'; c.fillStyle = sub; c.textBaseline = 'top';
    const t0 = Math.max(0, Math.floor(G.t(0) / minor) * minor);
    for (let tt = t0; tt <= a.duration + 1e-6 && G.x(tt) <= w + 1; tt += minor) {
      const x = Math.round(G.x(tt)) + 0.5, isMajor = Math.abs(tt / major - Math.round(tt / major)) < 1e-4;
      c.strokeStyle = isMajor ? sub : line; c.beginPath(); c.moveTo(x, isMajor ? 12 : 17); c.lineTo(x, T3_RULER); c.stroke();
      if (isMajor) c.fillText(this.t3.units === 'f' ? String(Math.round(tt * fps)) : (major < 1 ? tt.toFixed(2) : `${Utils.round(tt, 2)}s`), x + 3, 3);
    }
    // end of animation
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.moveTo(Math.round(G.x(a.duration)) + 0.5, 0); c.lineTo(Math.round(G.x(a.duration)) + 0.5, h); c.stroke();
    // in / out markers
    for (const [tt, lab] of [[R.in, '['], [R.out, ']']]) { if ((lab === '[' && R.in > 0) || (lab === ']' && R.out < a.duration)) { c.fillStyle = '#3ddc84'; c.fillText(lab, G.x(tt) + (lab === '[' ? 2 : -7), 12); } }
    // playhead
    const px = Math.round(G.x(this.s3.time)) + 0.5;
    c.strokeStyle = '#ff4d4d'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, h); c.stroke();
    c.fillStyle = '#ff4d4d'; c.beginPath(); c.moveTo(px - 5, 0); c.lineTo(px + 5, 0); c.lineTo(px + 5, 6); c.lineTo(px, 11); c.lineTo(px - 5, 6); c.closePath(); c.fill();
    const lbl = document.getElementById('s3-tlabel'); if (lbl) lbl.textContent = `${this.t3Fmt(this.s3.time)} / ${this.t3Fmt(a.duration)}`;
    // keep the playhead in view while playing
    if (this.s3.playing && (px > w - 20 || px < 0) && this.t3.zoom > 1) { this.t3.scrollX = Math.max(0, this.s3.time * G.pps - w / 3); }
    // ease picker reflects the selection
    const es = this.t3SelEntries(), ez = document.getElementById('t3-ease');
    if (ez && document.activeElement !== ez) { const kinds = new Set(es.map(e => (e.k.bezier ? 'custom' : e.k.easing || 'easeInOut'))); ez.value = kinds.size === 1 ? [...kinds][0] : ''; }
  },

  // ------------------------------------------------------------------ canvas interaction
  t3HitKey(x, y) {
    const rows = this.t3Rows(), G = this.t3Geom();
    const i = Math.floor((y - T3_RULER + this.t3.scrollY) / T3_ROW), r = rows[i];
    if (!r || y < T3_RULER) return { row: r, rowIdx: i };
    const hits = this.t3KeysOfRow(r).filter(e => Math.abs(G.x(e.k.time) - x) <= 6);
    if (!hits.length) return { row: r, rowIdx: i };
    const t = hits.sort((p, q) => Math.abs(G.x(p.k.time) - x) - Math.abs(G.x(q.k.time) - x))[0].k.time;
    return { row: r, rowIdx: i, entries: hits.filter(e => Math.abs(e.k.time - t) < 0.0005) };
  },
  t3BindCanvas() {
    const cv = document.getElementById('t3-canvas');
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      cv.focus({ preventScroll: true });
      const p = pos(e), G = this.t3Geom(), s3 = this.s3;
      cv.setPointerCapture(e.pointerId);
      if (p.y < T3_RULER) { // scrub
        this.s3Play(false);
        const go = (ev) => this.s3SetTime(this.t3Snap(Utils.clamp(G.t(pos(ev).x), 0, this.t3Anim().duration), ev.altKey));
        go(e);
        const mv = (ev) => go(ev), up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); this.t3Render(); };
        cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
        return;
      }
      const hit = this.t3HitKey(p.x, p.y);
      if (hit.entries) {
        const ks = hit.entries.map(x => x.k), allSel = ks.every(k => this.t3.sel.has(k));
        if (e.ctrlKey || e.metaKey) ks.forEach(k => (allSel ? this.t3.sel.delete(k) : this.t3.sel.add(k)));
        else if (e.shiftKey) ks.forEach(k => this.t3.sel.add(k));
        else if (!allSel) { this.t3.sel = new Set(ks); }
        if (hit.row?.id && hit.row.id !== s3.sel && !e.shiftKey && !e.ctrlKey) this.s3Select(hit.row.id);
        // drag to retime
        const start = this.t3SelEntries().map(x => ({ k: x.k, t: x.k.time })), t0 = G.t(p.x);
        let moved = false;
        const mv = (ev) => {
          const dt = G.t(pos(ev).x) - t0;
          if (!moved && Math.abs(dt * G.pps) < 3) return;
          moved = true;
          const minT = Math.min(...start.map(s => s.t)), maxT = Math.max(...start.map(s => s.t)), dur = this.t3Anim().duration;
          let d = this.t3Snap(Utils.clamp(minT + dt, 0, dur), ev.altKey) - minT;
          if (maxT + d > dur) d = dur - maxT;
          for (const s of start) s.k.time = Utils.round(s.t + d, 4);
          document.getElementById('s3-tlabel').textContent = `${d >= 0 ? '+' : ''}${this.t3.units === 'f' ? `${Math.round(d * this.t3Fps())} f` : `${d.toFixed(2)} s`}`;
          this.t3Draw();
        };
        const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); if (moved) this.t3Changed('Move keys'); else this.t3Render(); };
        cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
        this.t3Draw();
        return;
      }
      // empty: marquee (or a click = set playhead + clear selection)
      const m = this.t3.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      const base = e.shiftKey || e.ctrlKey ? new Set(this.t3.sel) : new Set();
      const mv = (ev) => {
        const q = pos(ev); Object.assign(m, { x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y) });
        const sel = new Set(base), rows = this.t3Rows();
        rows.forEach((r, i) => { const cy = T3_RULER + i * T3_ROW - this.t3.scrollY + T3_ROW / 2; if (cy < m.y0 || cy > m.y1) return; for (const en of this.t3KeysOfRow(r)) { const x = G.x(en.k.time); if (x >= m.x0 && x <= m.x1) sel.add(en.k); } });
        this.t3.sel = sel; this.t3Draw();
      };
      const up = (ev) => {
        cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up);
        const q = pos(ev); this.t3.marquee = null;
        if (Math.hypot(q.x - p.x, q.y - p.y) < 3) { this.t3.sel = base; this.s3Play(false); this.s3SetTime(this.t3Snap(Utils.clamp(G.t(p.x), 0, this.t3Anim().duration), ev.altKey)); }
        this.t3Render();
      };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up);
    });
    cv.addEventListener('dblclick', (e) => {
      const p = pos(e), hit = this.t3HitKey(p.x, p.y), G = this.t3Geom();
      if (hit.entries) { this.s3Play(false); this.s3SetTime(hit.entries[0].k.time); return; }
      if (hit.row?.kind === 'prop') { const t = this.t3Snap(G.t(p.x)); this.s3SetTime(t); this.t3ToggleKey(hit.row.id, hit.row.prop, true); }
    });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const p = pos(e), hit = this.t3HitKey(p.x, p.y); if (hit.entries && !hit.entries.every(x => this.t3.sel.has(x.k))) this.t3.sel = new Set(hit.entries.map(x => x.k)); this.t3Draw(); this.t3ContextMenu(e.clientX, e.clientY, p, hit); });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const G = this.t3Geom(), p = pos(e);
      if (e.ctrlKey || e.metaKey || e.altKey) { const tAt = G.t(p.x); this.t3.zoom = Utils.clamp(this.t3.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 60); const G2 = this.t3Geom(); this.t3.scrollX = Math.max(0, tAt * G2.pps - (p.x - T3_PAD)); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.t3.scrollX = Math.max(0, this.t3.scrollX + (e.deltaX || e.deltaY));
      else { this.t3.scrollY = Math.max(0, this.t3.scrollY + e.deltaY); this.t3Render(); return; }
      this.t3Draw();
    }, { passive: false });
  },

  // ------------------------------------------------------------------ key operations
  t3ToggleKey(id, prop, forceAdd = false) {
    const a = this.t3Anim(), t = this.t3Snap(this.s3.time), def = this.def3(id);
    const list = a.tracks[id]?.[prop] || [];
    const at = list.find(k => Math.abs(k.time - t) < 0.0005);
    if (at && !forceAdd) { list.splice(list.indexOf(at), 1); this.t3Changed('Remove key'); return; }
    const v = a.tracks[id]?.[prop]?.length ? this.model.evaluateIn(a, id, prop, t) : this.t3BaseValue(def, prop);
    if (v === undefined) return;
    this.model.setKeyframe(id, prop, t, v);
    this.t3Changed('Add key');
  },
  t3BaseValue(def, prop) { const o = this.s3.objs.get(def.id); const v = o ? Scene3DCore.readProp(o, prop) : undefined; return v !== undefined ? v : Scene3DCore.baseValue(def, prop); },
  t3SetEase(name) {
    const es = this.t3SelEntries();
    if (!es.length) { Utils.toast('Select keys first (click or drag a box around them)', 'ℹ️'); return; }
    for (const e of es) { e.k.easing = name; delete e.k.bezier; }
    this.t3Changed(`Easing: ${Utils.easingLabels[name] || name}`);
  },
  t3DeleteKeys() {
    const es = this.t3SelEntries();
    if (!es.length) return false;
    const a = this.t3Anim();
    for (const e of es) { const list = a.tracks[e.id]?.[e.prop]; if (list) list.splice(list.indexOf(e.k), 1); }
    this.t3.sel.clear();
    this.t3Changed(`Delete ${es.length} key${es.length === 1 ? '' : 's'}`);
    return true;
  },
  t3Copy(cut = false) {
    const es = this.t3SelEntries();
    if (!es.length) { Utils.toast('Select keys to copy', 'ℹ️'); return false; }
    const t0 = Math.min(...es.map(e => e.k.time));
    this.t3.clip = es.map(e => ({ id: e.id, prop: e.prop, dt: e.k.time - t0, value: e.k.value, easing: e.k.easing, bezier: e.k.bezier ? [...e.k.bezier] : undefined }));
    if (cut) { this.t3DeleteKeys(); Utils.toast(`Cut ${es.length} key${es.length === 1 ? '' : 's'}`, '✂'); }
    else Utils.toast(`Copied ${es.length} key${es.length === 1 ? '' : 's'} — move the playhead (and select another object to retarget), then Ctrl+V`, '⧉');
    return true;
  },
  t3Paste() {
    const clip = this.t3.clip;
    if (!clip?.length) { Utils.toast('Copy some keys first (select keys, Ctrl+C)', 'ℹ️'); return false; }
    const ids = new Set(clip.map(c => c.id)), retarget = ids.size === 1 && this.s3.sel && this.def3(this.s3.sel) ? this.s3.sel : null;
    const a = this.t3Anim(), t0 = this.t3Snap(this.s3.time), pasted = new Set();
    for (const c of clip) {
      const id = retarget || c.id; if (!this.def3(id)) continue;
      const t = Utils.round(Math.min(a.duration, t0 + c.dt), 4);
      this.model.setKeyframe(id, c.prop, t, c.value, c.easing);
      const k = a.tracks[id][c.prop].find(x => Math.abs(x.time - t) < 0.0005);
      if (k) { if (c.bezier) k.bezier = [...c.bezier]; else delete k.bezier; pasted.add(k); }
      this.t3.expanded.add(id);
    }
    this.t3.sel = pasted;
    this.t3Changed(`Paste ${pasted.size} key${pasted.size === 1 ? '' : 's'}`);
    return true;
  },
  t3Duplicate() { if (this.t3Copy()) { const es = this.t3SelEntries(), t1 = Math.max(...es.map(e => e.k.time)); this.s3SetTime(Math.min(this.t3Anim().duration, t1 + 1 / this.t3Fps() * 6)); this.t3Paste(); } },
  t3Nudge(dir, big) {
    const es = this.t3SelEntries(); if (!es.length) return false;
    const d = (big ? 10 : 1) / this.t3Fps() * dir, dur = this.t3Anim().duration;
    if (es.some(e => e.k.time + d < -1e-6 || e.k.time + d > dur + 1e-6)) return true;
    for (const e of es) e.k.time = Utils.round(e.k.time + d, 4);
    this.t3Changed('Nudge keys');
    return true;
  },
  t3JumpKey(dir) {
    const ids = this.s3.sel ? [this.s3.sel] : null;
    const times = [...new Set(this.t3AllKeys().filter(e => !ids || ids.includes(e.id)).map(e => Utils.round(e.k.time, 4)))].sort((p, q) => p - q);
    const t = this.s3.time, next = dir > 0 ? times.find(x => x > t + 1e-4) : times.filter(x => x < t - 1e-4).pop();
    this.s3Play(false);
    if (next !== undefined) this.s3SetTime(next);
  },
  t3SelectAll() { this.t3.sel = new Set(this.t3AllKeys().map(e => e.k)); this.t3Draw(); },
  /** Keyboard for the 3D section; returns true when handled. */
  t3Key(e) {
    if (this.section !== '3d' || !this.s3?.ready || this.s3.preview || !this.t3) return false;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), hasSel = this.t3.sel.size > 0, inTl = el?.id === 't3-canvas';
    const stop = () => { e.preventDefault(); e.stopPropagation(); return true; };
    if (mod && k === 'c' && hasSel) { this.t3Copy(); return stop(); }
    if (mod && k === 'x' && hasSel) { this.t3Copy(true); return stop(); }
    if (mod && k === 'v' && this.t3.clip?.length && (inTl || !hasSel || true)) { this.t3Paste(); return stop(); }
    if (mod && k === 'd' && hasSel) { this.t3Duplicate(); return stop(); }
    if (mod && k === 'a' && inTl) { this.t3SelectAll(); return stop(); }
    if (mod) return false;
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasSel) { this.t3DeleteKeys(); return stop(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const dir = e.key === 'ArrowLeft' ? -1 : 1; if (hasSel) this.t3Nudge(dir, e.shiftKey); else { this.s3Play(false); this.s3SetTime(this.t3Snap(this.s3.time + dir * (e.shiftKey ? 10 : 1) / this.t3Fps())); } return stop(); }
    if (k === ',' || k === '.') { this.s3Play(false); this.s3SetTime(this.t3Snap(this.s3.time + (k === ',' ? -1 : 1) / this.t3Fps())); return stop(); }
    if (e.key === 'Home') { this.s3SetTime(this.s3Range().in); return stop(); }
    if (e.key === 'End') { this.s3SetTime(this.s3Range().out); return stop(); }
    if (k === 'j') { this.t3JumpKey(-1); return stop(); }
    if (k === 'l') { this.t3JumpKey(1); return stop(); }
    if (k === 'i' && e.shiftKey === false && e.altKey) { return false; }
    if (k === 'i') { this.t3SetRange('in'); return stop(); }
    if (k === 'o') { this.t3SetRange('out'); return stop(); }
    if (e.key === 'Escape' && hasSel) { this.t3.sel.clear(); this.t3Draw(); return stop(); }
    return false;
  },
  t3SetRange(which, clear = false) {
    const a = this.t3Anim(), t = this.t3Snap(this.s3.time);
    if (clear) { delete a.rangeIn; delete a.rangeOut; }
    else if (which === 'in') { a.rangeIn = t; if (a.rangeOut && a.rangeOut <= t) delete a.rangeOut; }
    else { a.rangeOut = t; if ((a.rangeIn || 0) >= t) delete a.rangeIn; }
    this.s3Commit(clear ? 'Clear play range' : `Set ${which} point`);
    Utils.toast(clear ? 'Play range cleared' : `Play range ${this.t3Fmt(this.s3Range().in)} → ${this.t3Fmt(this.s3Range().out)}`, '⏱');
  },

  // ------------------------------------------------------------------ menus
  t3Popup(anchorOrXY, items) {
    document.querySelectorAll('.t3-menu').forEach(x => x.remove());
    const mnu = document.createElement('div');
    mnu.className = 't3-menu'; mnu.setAttribute('role', 'menu');
    mnu.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.head ? `<div class="t3-mh">${Utils.escapeHtml(it.head)}</div>` : `<button type="button" role="menuitem" data-i="${i}"${it.disabled ? ' disabled' : ''}>${it.check ? '✓ ' : ''}${Utils.escapeHtml(it.label)}${it.hint ? `<kbd>${Utils.escapeHtml(it.hint)}</kbd>` : ''}</button>`).join('');
    document.body.appendChild(mnu);
    const r = anchorOrXY.getBoundingClientRect ? anchorOrXY.getBoundingClientRect() : { left: anchorOrXY.x, bottom: anchorOrXY.y, top: anchorOrXY.y };
    const mh = mnu.offsetHeight, mw = mnu.offsetWidth;
    mnu.style.left = `${Math.min(window.innerWidth - mw - 8, r.left)}px`;
    mnu.style.top = `${r.top - mh - 4 > 8 ? r.top - mh - 4 : Math.min(window.innerHeight - mh - 8, r.bottom + 4)}px`;
    mnu.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { mnu.remove(); items[+b.dataset.i].run(); }));
    const off = (ev) => { if (!mnu.contains(ev.target)) { mnu.remove(); window.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => window.addEventListener('pointerdown', off, true), 0);
    mnu.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { mnu.remove(); ev.stopPropagation(); } });
    mnu.querySelector('button')?.focus();
  },
  t3ContextMenu(x, y, p, hit) {
    const hasSel = this.t3.sel.size > 0, G = this.t3Geom();
    if (p.y < T3_RULER) {
      const t = this.t3Snap(G.t(p.x));
      return this.t3Popup({ x, y }, [
        { label: `Set in point here (${this.t3Fmt(t)})`, hint: 'I', run: () => { this.s3SetTime(t); this.t3SetRange('in'); } },
        { label: `Set out point here (${this.t3Fmt(t)})`, hint: 'O', run: () => { this.s3SetTime(t); this.t3SetRange('out'); } },
        { label: 'Clear play range', disabled: !(this.t3Anim().rangeIn || this.t3Anim().rangeOut), run: () => this.t3SetRange(null, true) }
      ]);
    }
    const items = [{ head: hasSel ? `${this.t3.sel.size} key${this.t3.sel.size === 1 ? '' : 's'} selected` : 'Keys' }];
    if (hasSel) {
      items.push(...T3_EASES.map(k => ({ label: `Ease · ${Utils.easingLabels[k] || k}`, run: () => this.t3SetEase(k) })), { label: 'Custom curve…', run: () => this.t3CurveEditor() }, '-',
        { label: 'Copy', hint: 'Ctrl+C', run: () => this.t3Copy() }, { label: 'Cut', hint: 'Ctrl+X', run: () => this.t3Copy(true) }, { label: 'Duplicate', hint: 'Ctrl+D', run: () => this.t3Duplicate() },
        { label: 'Reverse order', run: () => this.t3Reverse() }, { label: 'Delete', hint: 'Del', run: () => this.t3DeleteKeys() }, '-');
    }
    items.push({ label: 'Paste at playhead', hint: 'Ctrl+V', disabled: !this.t3.clip?.length, run: () => this.t3Paste() });
    if (hit.row?.kind === 'prop') items.push({ label: `Add key here (${this.t3Fmt(this.t3Snap(G.t(p.x)))})`, run: () => { this.s3SetTime(this.t3Snap(G.t(p.x))); this.t3ToggleKey(hit.row.id, hit.row.prop, true); } }, { label: 'Select all keys in this row', run: () => { this.t3.sel = new Set(this.t3KeysOfRow(hit.row).map(e => e.k)); this.t3Draw(); } }, { label: 'Delete this track', run: () => { const a = this.t3Anim(); delete a.tracks[hit.row.id][hit.row.prop]; this.t3Changed('Delete track'); } });
    items.push({ label: 'Select all keys', hint: 'Ctrl+A', run: () => this.t3SelectAll() });
    this.t3Popup({ x, y }, items);
  },
  t3Reverse() {
    const es = this.t3SelEntries(); if (es.length < 2) return;
    const lo = Math.min(...es.map(e => e.k.time)), hi = Math.max(...es.map(e => e.k.time));
    for (const e of es) e.k.time = Utils.round(lo + hi - e.k.time, 4);
    this.t3Changed('Reverse keys');
  },
  t3TrackMenu(anchor) {
    const def = this.def3(this.s3.sel);
    if (!def) { Utils.toast('Select an object first (in the viewport or the outliner)', 'ℹ️'); return; }
    const a = this.t3Anim(), has = (p) => !!a.tracks[def.id]?.[p]?.length, items = [{ head: `Animate “${def.name}”` }];
    const add = (p, label) => ({ label: label || T3_PROP_LABELS[p] || p, check: has(p), disabled: has(p), run: () => { this.t3.expanded.add(def.id); this.t3ToggleKey(def.id, p, true); } });
    items.push({ head: 'Transform' }, ...['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'].map(p => add(p)));
    items.push({ label: 'All transform', run: () => { this.t3.expanded.add(def.id); ['px', 'py', 'pz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'].forEach(p => { if (!has(p)) this.model.setKeyframe(def.id, p, this.t3Snap(this.s3.time), this.t3BaseValue(def, p)); }); this.t3Changed('Key transform'); } });
    if (Scene3DCore.isLight(def.type)) items.push({ head: 'Light' }, add('intensity'), add('color'));
    else if (def.mat) items.push({ head: 'Material' }, add('color'), add('opacity'), add('emissive'), add('metalness'), add('roughness'));
    const geo = def.geo && Scene3DCore.PRIMS[def.type] && def.type !== 'text' ? Object.entries(def.geo).filter(([, v]) => typeof v === 'number') : [];
    if (geo.length) items.push({ head: 'Shape keys' }, ...geo.filter(([k]) => k !== 'detail').map(([k]) => add(`geo.${k}`, T3_GEO_LABELS[k] || k)));
    const morphs = this.t3MorphNames(this.s3.objs.get(def.id));
    if (morphs.length) items.push({ head: 'Morph targets' }, ...morphs.map((n, i) => add(`morph.${i}`, n || `Target ${i}`)));
    this.t3Popup(anchor, items);
  },
  t3AnimMenu(anchor) {
    const m = this.model, a = this.t3Anim();
    this.t3Popup(anchor, [
      { label: 'Rename…', run: async () => { const n = await this.promptText?.('Rename animation', 'Name', a.name); if (n && n.trim()) { a.name = n.trim().slice(0, 80); this.s3Commit('Rename animation'); } } },
      { label: 'Duplicate', run: () => { const c = JSON.parse(JSON.stringify(a)); c.id = Utils.uid('anim'); c.name = `${a.name} copy`; m.animations.push(c); m.activeAnimationId = c.id; this.t3.sel.clear(); this.s3ResetPose(); this.s3SetTime(0); this.s3Commit('Duplicate animation'); } },
      { label: 'Delete', disabled: m.animations.length < 2, run: async () => { if (!(await this.confirm(`Delete “${a.name}”?`, 'Its keyframes (2D and 3D) are removed. You can undo in 2D with Ctrl+Z.', 'Delete'))) return; m.animations = m.animations.filter(x => x.id !== a.id); m.activeAnimationId = m.animations[0].id; this.t3.sel.clear(); this.s3ResetPose(); this.s3SetTime(0); this.s3Commit('Delete animation'); } },
      '-',
      { label: 'Set in point at playhead', hint: 'I', run: () => this.t3SetRange('in') }, { label: 'Set out point at playhead', hint: 'O', run: () => this.t3SetRange('out') }, { label: 'Clear play range', run: () => this.t3SetRange(null, true) }
    ]);
  },

  // ------------------------------------------------------------------ curve editor
  t3CurveEditor() {
    const es = this.t3SelEntries();
    if (!es.length) { Utils.toast('Select keys first — the curve shapes the motion from each selected key to the next', 'ℹ️'); return; }
    document.getElementById('t3-curve-pop')?.remove();
    const k0 = es[0].k, start = k0.bezier ? [...k0.bezier] : [...(Utils.easingBezier[k0.easing] || [0.42, 0, 0.58, 1])];
    let b = start;
    const pop = document.createElement('div');
    pop.id = 't3-curve-pop'; pop.className = 't3-curve'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Easing curve');
    pop.innerHTML = `<div class="t3-ch"><b>Easing curve</b><span class="muted-text">${es.length} key${es.length === 1 ? '' : 's'}</span><button type="button" class="t3-x" aria-label="Close">✕</button></div>
      <canvas width="440" height="440" aria-label="Drag the two handles to shape the curve"></canvas>
      <div class="t3-cp">${T3_BEZIER_PRESETS.map(([n], i) => `<button type="button" data-pr="${i}">${n}</button>`).join('')}</div>
      <div class="t3-cv"><label>x1<input type="number" step="0.01" min="0" max="1" data-b="0"></label><label>y1<input type="number" step="0.01" data-b="1"></label><label>x2<input type="number" step="0.01" min="0" max="1" data-b="2"></label><label>y2<input type="number" step="0.01" data-b="3"></label></div>
      <div class="t3-ca"><button type="button" class="menu-btn" data-a="cancel">Cancel</button><button type="button" class="btn-primary" data-a="apply">Apply</button></div>`;
    document.body.appendChild(pop);
    const cv = pop.querySelector('canvas'), ctx = cv.getContext('2d'), S = 440, M = 70, size = S - M * 2;
    const toPx = (x, y) => [M + x * size, S - M - y * size], fromPx = (px, py) => [Utils.clamp((px - M) / size, 0, 1), Utils.round((S - M - py) / size, 3)];
    let t0 = performance.now();
    const draw = () => {
      if (!pop.isConnected) return;
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#1b1b1f'; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.strokeRect(M, M, size, size);
      ctx.strokeStyle = '#2a2a30'; for (let i = 1; i < 4; i++) { const g = M + (size * i) / 4; ctx.beginPath(); ctx.moveTo(g, M); ctx.lineTo(g, M + size); ctx.moveTo(M, g); ctx.lineTo(M + size, g); ctx.stroke(); }
      const [ax, ay] = toPx(0, 0), [bx, by] = toPx(1, 1), [p1x, p1y] = toPx(b[0], b[1]), [p2x, p2y] = toPx(b[2], b[3]);
      ctx.strokeStyle = 'rgba(13,153,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(p1x, p1y); ctx.moveTo(bx, by); ctx.lineTo(p2x, p2y); ctx.stroke();
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.bezierCurveTo(p1x, p1y, p2x, p2y, bx, by); ctx.stroke();
      for (const [x, y] of [[p1x, p1y], [p2x, p2y]]) { ctx.fillStyle = '#61A2FF'; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
      // live preview ball
      const ph = ((performance.now() - t0) / 1400) % 1.4, tt = Math.min(1, ph), e = Utils.cubicBezier(...b)(tt);
      ctx.fillStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(M + e * size, S - 28, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(M, S - 28); ctx.lineTo(M + size, S - 28); ctx.stroke();
      requestAnimationFrame(draw);
    };
    const sync = () => pop.querySelectorAll('[data-b]').forEach(i => { if (document.activeElement !== i) i.value = b[+i.dataset.b]; });
    sync(); draw();
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), k = S / r.width, pt = [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
      const [p1x, p1y] = toPx(b[0], b[1]), [p2x, p2y] = toPx(b[2], b[3]);
      const which = Math.hypot(pt[0] - p1x, pt[1] - p1y) < Math.hypot(pt[0] - p2x, pt[1] - p2y) ? 0 : 2;
      cv.setPointerCapture(e.pointerId);
      const mv = (ev) => { const q = [(ev.clientX - r.left) * k, (ev.clientY - r.top) * k], [x, y] = fromPx(q[0], q[1]); b = [...b]; b[which] = Utils.round(x, 3); b[which + 1] = Utils.clamp(y, -1, 2); sync(); t0 = performance.now(); };
      const up = () => { cv.removeEventListener('pointermove', mv); cv.removeEventListener('pointerup', up); };
      cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', up); mv(e);
    });
    pop.querySelectorAll('[data-pr]').forEach(btn => btn.addEventListener('click', () => { b = [...T3_BEZIER_PRESETS[+btn.dataset.pr][1]]; sync(); t0 = performance.now(); }));
    pop.querySelectorAll('[data-b]').forEach(i => i.addEventListener('input', () => { const v = Number(i.value); if (Number.isFinite(v)) { b = [...b]; b[+i.dataset.b] = +i.dataset.b % 2 === 0 ? Utils.clamp(v, 0, 1) : Utils.clamp(v, -1, 2); t0 = performance.now(); } }));
    const close = () => pop.remove();
    pop.querySelector('.t3-x').addEventListener('click', close);
    pop.querySelector('[data-a="cancel"]').addEventListener('click', close);
    pop.querySelector('[data-a="apply"]').addEventListener('click', () => { for (const e of this.t3SelEntries()) { e.k.bezier = b.map(v => Utils.round(v, 3)); e.k.easing = e.k.easing === 'hold' ? 'easeInOut' : (e.k.easing || 'easeInOut'); } close(); this.t3Changed('Custom easing curve'); });
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } e.stopPropagation(); });
    pop.querySelector('[data-a="apply"]').focus();
  }
};
Object.assign(StudioApp.prototype, Timeline3DMixin);
