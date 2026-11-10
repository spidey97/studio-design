/**
 * DesignStudio — animation timeline: keyframes, playback, scrubbing, easing,
 * auto-key recording, onion skinning.
 */
'use strict';

const TL_ROW = 24, TL_RULER = 22, TL_PAD = 14;

const TimelineMixin = {
  bindTimeline() {
    const $ = (id) => document.getElementById(id);
    const tl = this.model.animationTimeline;
    $('btn-toggle-timeline').addEventListener('click', () => this.toggleTimeline());
    $('tl-btn-play').addEventListener('click', () => this.togglePlay());
    $('tl-btn-stop').addEventListener('click', () => { this.model.animationTimeline.isPlaying = false; this.setTime(0); this.updateTimelineButtons(); });
    $('tl-btn-loop').addEventListener('click', () => {
      const a = this.model.activeAnimation;
      a.loop = { loop: 'pingPong', pingPong: 'oneShot', oneShot: 'loop' }[a.loop] || 'loop';
      Utils.toast(`“${a.name}”: ${{ loop: 'Loop', pingPong: 'Ping-pong', oneShot: 'One shot' }[a.loop]}`, { loop: '↻', pingPong: '⇄', oneShot: '→' }[a.loop]);
      this.commit();
    });
    $('tl-btn-autokey').addEventListener('click', () => {
      const t = this.model.animationTimeline;
      t.isRecording = !t.isRecording;
      this.model.captureBaseline(this.model.allElements());
      this.updateTimelineButtons();
      Utils.toast(t.isRecording ? 'Auto-key ON — changes to the selection create keyframes' : 'Auto-key off', t.isRecording ? '🔴' : 'ℹ️');
    });
    $('tl-btn-onionskin').addEventListener('click', () => { const t = this.model.animationTimeline; t.onionSkinning = !t.onionSkinning; this.updateTimelineButtons(); this.requestRender(); });
    $('tl-add-keyframe').addEventListener('click', () => this.addKeyframes());
    $('tl-speed-select').addEventListener('change', (e) => { this.model.animationTimeline.playbackSpeed = Number(e.target.value) || 1; });
    $('tl-fps-select').addEventListener('change', (e) => { this.model.animationTimeline.fps = Number(e.target.value) || 60; this.renderTimeline(); this.scheduleAutosave(); });
    $('tl-duration-inp').addEventListener('change', (e) => {
      const t = this.model.animationTimeline;
      t.duration = Utils.clamp(Utils.num(e.target.value, 5), 0.5, 120);
      e.target.value = t.duration;
      if (t.currentTime > t.duration) this.setTime(t.duration);
      this.commit();
    });
    void tl;

    // Easing + delete controls for the selected keyframe
    const right = $('timeline-header').lastElementChild;
    const easeWrap = document.createElement('span');
    easeWrap.className = 'tl-ease-wrap';
    easeWrap.innerHTML = `<span class="prop-label">Easing</span><select id="tl-ease-select" disabled aria-label="Keyframe easing">${Object.entries(Utils.easingLabels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button class="prop-icon-btn" id="tl-del-key" disabled title="Delete keyframe (Del)" aria-label="Delete keyframe">🗑</button>`;
    right.insertBefore(easeWrap, right.firstChild);
    $('tl-ease-select').addEventListener('change', (e) => {
      for (const k of this.selectedKeyframes()) k.easing = e.target.value;
      this.commit();
    });
    $('tl-del-key').addEventListener('click', () => this.deleteSelectedKeyframe());

    // Resize handle
    $('timeline-resize-handle').addEventListener('pointerdown', (e) => {
      const h = $('timeline-panel');
      const startY = e.clientY, startH = h.offsetHeight;
      e.target.setPointerCapture(e.pointerId);
      const move = (ev) => { const nh = Utils.clamp(startH - (ev.clientY - startY), 110, Math.max(140, window.innerHeight * 0.6)); document.getElementById('center-viewport').style.setProperty('--tl-h', `${nh}px`); this.renderTimeline(); };
      const up = () => { e.target.removeEventListener('pointermove', move); e.target.removeEventListener('pointerup', up); };
      e.target.addEventListener('pointermove', move); e.target.addEventListener('pointerup', up);
    });

    // Canvas interaction
    const c = $('timeline-canvas');
    c.addEventListener('pointerdown', (e) => this.onTimelinePointer(e));
    $('tl-playhead-head').addEventListener('pointerdown', (e) => this.onTimelinePointer(e, true));
    $('timeline-right-canvas-wrap').addEventListener('scroll', () => { $('timeline-left-tracks').scrollTop = $('timeline-right-canvas-wrap').scrollTop; this.updatePlayhead(); });
    window.addEventListener('resize', () => this.renderTimeline());
    this.wrap.addEventListener('pointerdown', () => { this.timelineFocus = false; });
    this.updateTimelineButtons();
  },

  timelineOpen() { return document.getElementById('timeline-panel').style.display !== 'none'; },
  toggleTimeline(force) {
    const panel = document.getElementById('timeline-panel');
    const open = force !== undefined ? force : !this.timelineOpen();
    panel.style.display = open ? 'flex' : 'none';
    document.getElementById('center-viewport').classList.toggle('tl-open', open);
    document.body.classList.toggle('tl-open', open);
    this.renderer.resize();
    this.updateTopBarState();
    if (open) { this.renderTimeline(); this.updateTimelineButtons(); }
  },

  updateTimelineButtons() {
    const $ = (id) => document.getElementById(id);
    const t = this.model.animationTimeline;
    $('tl-btn-play').classList.toggle('active', t.isPlaying);
    $('tl-btn-play').title = t.isPlaying ? 'Pause' : 'Play animation';
    $('tl-btn-play').setAttribute('aria-label', t.isPlaying ? 'Pause' : 'Play');
    $('tl-btn-play').innerHTML = t.isPlaying
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const loopType = this.model.activeAnimation.loop;
    $('tl-btn-loop').classList.toggle('active', loopType !== 'oneShot');
    $('tl-btn-loop').title = `Loop type: ${{ loop: 'Loop', pingPong: 'Ping-pong', oneShot: 'One shot' }[loopType]} (click to change)`;
    $('tl-btn-loop').textContent = { loop: '↻', pingPong: '⇄', oneShot: '→' }[loopType];
    $('tl-btn-autokey').classList.toggle('active', t.isRecording);
    $('tl-btn-onionskin').classList.toggle('active', t.onionSkinning);
    $('tl-speed-select').value = String(t.playbackSpeed);
    $('tl-fps-select').value = String(t.fps);
    if (document.activeElement !== $('tl-duration-inp')) $('tl-duration-inp').value = t.duration;
    this.updateReadout();
  },
  updateReadout() {
    const t = this.model.animationTimeline;
    const el = document.getElementById('tl-time-readout');
    el.textContent = `${t.currentTime.toFixed(2)}s / ${Utils.round(t.duration, 2)}s`;
    el.title = `Frame ${Math.round(t.currentTime * t.fps)} of ${Math.round(t.duration * t.fps)} · , and . step one frame`;
  },

  togglePlay() {
    const t = this.model.animationTimeline;
    if (!Object.keys(t.tracks).length && !t.isPlaying) Utils.toast('Nothing is animated yet — select a layer and add a keyframe (+ ◆)', 'ℹ️');
    t.isPlaying = !t.isPlaying;
    if (t.isPlaying && t.currentTime >= t.duration - 1e-3) this.setTime(0);
    this.lastTick = null;
    if (!this.timelineOpen() && t.isPlaying) this.toggleTimeline(true);
    this.updateTimelineButtons();
  },
  tickTimeline(ts) {
    const t = this.model.animationTimeline;
    if (!t.isPlaying) { this.lastTick = null; return; }
    if (this.lastTick == null) { this.lastTick = ts; return; }
    const dt = Math.min(0.1, (ts - this.lastTick) / 1000);
    this.lastTick = ts;
    this.playClock = (this.playClock ?? t.currentTime) + dt * t.playbackSpeed;
    let time = this.playClock;
    if (t.loop === 'pingPong') {
      const d = t.duration, mm = time % (2 * d);
      const q = Math.floor((mm <= d ? mm : 2 * d - mm) * t.fps) / t.fps;
      if (q !== t.currentTime) this.setTime(q, true);
      return;
    }
    if (time > t.duration) {
      if (t.isLooping) { time %= t.duration; this.playClock = time; }
      else { time = t.duration; t.isPlaying = false; this.playClock = null; this.updateTimelineButtons(); }
    }
    const q = Math.floor(time * t.fps) / t.fps;
    if (q !== t.currentTime) this.setTime(q, true);
  },
  setTime(time, fromPlayback = false) {
    const m = this.model, t = m.animationTimeline;
    t.currentTime = Utils.clamp(time, 0, t.duration);
    if (!fromPlayback) this.playClock = null;
    m.applyTime(t.currentTime);
    m.captureBaseline(m.allElements());
    this.updatePlayhead();
    this.updateReadout();
    if (!fromPlayback || (this.frameCounter = (this.frameCounter || 0) + 1) % 4 === 0) this.updateTransformInputs();
    this.requestRender();
  },

  addKeyframes(elOverride = null) {
    const m = this.model;
    const sel = elOverride ? [elOverride] : m.topSelected();
    if (!sel.length) { Utils.toast('Select a layer to keyframe', 'ℹ️'); return; }
    const t = m.animationTimeline.currentTime;
    for (const el of sel) {
      const existing = Object.keys(m.animationTimeline.tracks[el.id] || {});
      const props = this.selectedTrack && this.selectedTrack.elId === el.id ? [this.selectedTrack.prop] : (existing.length ? existing : ['x', 'y', 'width', 'height', 'rotation', 'opacity']);
      for (const p of props) m.setKeyframe(el.id, p, t, m.getAnimValue(el, p));
    }
    m.captureBaseline(m.allElements());
    if (!this.timelineOpen()) this.toggleTimeline(true);
    this.commit();
    Utils.toast(`Keyframe added at ${t.toFixed(2)}s — move the playhead, change the layer, and a new keyframe is recorded`, '◆');
  },
  deleteSelectedKeyframe() {
    const k = this.selectedKey;
    if (!k) return;
    const m = this.model;
    const tracks = m.animationTimeline.tracks[k.elId];
    if (!tracks) return;
    const props = k.prop ? [k.prop] : Object.keys(tracks);
    for (const p of props) {
      if (!tracks[p]) continue;
      tracks[p] = tracks[p].filter(x => Math.abs(x.time - k.time) > 0.0005);
      if (!tracks[p].length) m.removeTrack(k.elId, p);
    }
    this.selectedKey = null;
    this.commit();
  },
  selectedKeyframes() {
    const k = this.selectedKey;
    if (!k) return [];
    const tracks = this.model.animationTimeline.tracks[k.elId] || {};
    const props = k.prop ? [k.prop] : Object.keys(tracks);
    return props.map(p => (tracks[p] || []).find(x => Math.abs(x.time - k.time) < 0.0005)).filter(Boolean);
  },
  handleTimelineKey(e) {
    if (!this.timelineOpen() || !this.timelineFocus) return false;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedKey) { e.preventDefault(); this.deleteSelectedKeyframe(); return true; }
    const t = this.model.animationTimeline;
    if (e.key === ',' || e.key === '.') { e.preventDefault(); this.setTime(t.currentTime + (e.key === '.' ? 1 : -1) / t.fps); return true; }
    if (e.key === 'k' || e.key === 'K') { e.preventDefault(); this.addKeyframes(); return true; }
    return false;
  },

  // ------------------------------------------------------------------ Rows & drawing
  timelineRows() {
    const m = this.model;
    const tracks = m.animationTimeline.tracks;
    const ids = new Set(Object.keys(tracks).filter(id => m.getElementById(id)));
    m.topSelected().forEach(el => ids.add(el.id));
    const ordered = m.elements.filter(e => ids.has(e.id)).reverse();
    const rows = [];
    for (const el of ordered) {
      rows.push({ kind: 'el', el });
      for (const prop of ANIM_PROPS) if (tracks[el.id]?.[prop]) rows.push({ kind: 'prop', el, prop });
    }
    return rows;
  },
  tlX(t) { const tl = this.model.animationTimeline; return TL_PAD + (t / tl.duration) * Math.max(10, this.tlWidth - TL_PAD * 2); },
  tlT(x) { const tl = this.model.animationTimeline; return Utils.clamp(((x - TL_PAD) / Math.max(10, this.tlWidth - TL_PAD * 2)) * tl.duration, 0, tl.duration); },

  renderTimeline() {
    if (!this.timelineOpen()) return;
    this.renderAnimAssets?.();
    if (this.timelineView === 'sm') { this.renderSM(); this.updateTimelineButtons(); return; }
    const m = this.model, tl = m.animationTimeline;
    const rows = this.timelineRows();
    this.tlRows = rows;
    // left list
    const left = document.getElementById('tl-tracks-list');
    left.innerHTML = '';
    if (!rows.length) {
      left.innerHTML = '<div class="tl-empty">Select a layer and press <b>+ ◆</b> to start animating.</div>';
    }
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'tl-track-row' + (r.kind === 'prop' ? ' sub-prop' : '') + (m.selectedIds.has(r.el.id) && r.kind === 'el' ? ' selected' : '') + (this.selectedTrack && this.selectedTrack.elId === r.el.id && this.selectedTrack.prop === r.prop ? ' active' : '');
      const label = document.createElement('span');
      label.className = 'tl-label';
      if (r.kind === 'el') {
        label.textContent = r.el.name;
        const add = document.createElement('button');
        add.className = 'tree-action-icon'; add.textContent = '+◆'; add.title = 'Add keyframes at playhead'; add.setAttribute('aria-label', `Add keyframe to ${r.el.name}`);
        add.addEventListener('click', (e) => { e.stopPropagation(); this.selectedTrack = null; this.addKeyframes(r.el); });
        row.append(label, add);
        row.addEventListener('click', () => { m.select([r.el.id]); this.selectedTrack = null; this.selectionChanged(); });
      } else {
        const v = m.getAnimValue(r.el, r.prop);
        label.textContent = ANIM_LABELS[r.prop];
        const val = document.createElement('span');
        val.className = 'tl-value';
        val.textContent = r.prop === 'fillColor' ? String(v).toUpperCase() : r.prop === 'opacity' ? `${Math.round(v * 100)}%` : r.prop === 'rotation' ? `${Utils.round(v, 1)}°` : Utils.round(v, 1);
        const del = document.createElement('button');
        del.className = 'tree-action-icon'; del.textContent = '✕'; del.title = 'Remove this track'; del.setAttribute('aria-label', `Remove ${ANIM_LABELS[r.prop]} track`);
        del.addEventListener('click', (e) => { e.stopPropagation(); m.removeTrack(r.el.id, r.prop); this.commit(); });
        row.append(label, val, del);
        row.addEventListener('click', () => { this.selectedTrack = { elId: r.el.id, prop: r.prop }; m.select([r.el.id]); this.selectionChanged(); });
      }
      left.appendChild(row);
    }
    // canvas
    const wrap = document.getElementById('timeline-right-canvas-wrap');
    const c = document.getElementById('timeline-canvas');
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(200, wrap.clientWidth), H = Math.max(wrap.clientHeight, TL_RULER + rows.length * TL_ROW + 8);
    this.tlWidth = W;
    c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#141416'; ctx.fillRect(0, 0, W, H);
    rows.forEach((r, i) => {
      const y = TL_RULER + i * TL_ROW;
      ctx.fillStyle = r.kind === 'el' ? '#1b1b20' : (i % 2 ? '#161619' : '#141416');
      ctx.fillRect(0, y, W, TL_ROW);
      ctx.fillStyle = '#26262c'; ctx.fillRect(0, y + TL_ROW - 1, W, 1);
    });
    // ruler
    ctx.fillStyle = '#202024'; ctx.fillRect(0, 0, W, TL_RULER);
    const pxPerSec = (W - TL_PAD * 2) / tl.duration;
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
    const step = steps.find(s => s * pxPerSec >= 60) || 10;
    ctx.font = '9px Inter, monospace'; ctx.fillStyle = '#8a8a92'; ctx.strokeStyle = '#3a3a40';
    for (let t = 0; t <= tl.duration + 1e-6; t += step) {
      const x = Math.round(this.tlX(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, TL_RULER - 8); ctx.lineTo(x, TL_RULER); ctx.stroke();
      ctx.fillText(`${Utils.round(t, 2)}s`, x + 3, 11);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.beginPath(); ctx.moveTo(x, TL_RULER); ctx.lineTo(x, H); ctx.stroke(); ctx.strokeStyle = '#3a3a40';
    }
    // keyframes
    const diamond = (x, y, s, fill, stroke) => { ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } };
    const sk = this.selectedKey;
    rows.forEach((r, i) => {
      const y = TL_RULER + i * TL_ROW + TL_ROW / 2;
      const tracks = tl.tracks[r.el.id] || {};
      if (r.kind === 'el') {
        const times = [...new Set(Object.values(tracks).flat().map(k => k.time))].sort((a, b) => a - b);
        if (times.length > 1) { ctx.fillStyle = 'rgba(13,153,255,0.18)'; ctx.fillRect(this.tlX(times[0]), y - 3, this.tlX(times[times.length - 1]) - this.tlX(times[0]), 6); }
        for (const t of times) diamond(this.tlX(t), y, 4.5, sk && !sk.prop && sk.elId === r.el.id && Math.abs(sk.time - t) < 0.0005 ? '#ffcd29' : '#7a7a88');
      } else {
        const kfs = (tracks[r.prop] || []).slice().sort((a, b) => a.time - b.time);
        for (let k = 0; k < kfs.length - 1; k++) {
          ctx.fillStyle = kfs[k].easing === 'hold' ? 'rgba(242,72,34,0.35)' : 'rgba(13,153,255,0.35)';
          ctx.fillRect(this.tlX(kfs[k].time), y - 1, this.tlX(kfs[k + 1].time) - this.tlX(kfs[k].time), 2);
        }
        for (const k of kfs) {
          const selected = sk && sk.elId === r.el.id && (sk.prop === r.prop || !sk.prop) && Math.abs(sk.time - k.time) < 0.0005;
          diamond(this.tlX(k.time), y, 5.5, selected ? '#FFC21A' : '#61A2FF', selected ? '#fff' : null);
        }
      }
    });
    this.updatePlayhead();
    const ease = document.getElementById('tl-ease-select');
    const keys = this.selectedKeyframes();
    ease.disabled = !keys.length;
    document.getElementById('tl-del-key').disabled = !keys.length;
    if (keys.length) ease.value = keys[0].easing || 'easeInOut';
    this.updateTimelineButtons();
  },
  updatePlayhead() {
    if (!this.timelineOpen() || !this.tlWidth) return;
    const wrap = document.getElementById('timeline-right-canvas-wrap');
    const x = this.tlX(this.model.animationTimeline.currentTime) - wrap.scrollLeft;
    document.getElementById('tl-playhead').style.left = `${x}px`;
  },
  hitKeyframe(x, y) {
    const rows = this.tlRows || [];
    const i = Math.floor((y - TL_RULER) / TL_ROW);
    const r = rows[i];
    if (!r) return null;
    const tracks = this.model.animationTimeline.tracks[r.el.id] || {};
    const list = r.kind === 'el' ? [...new Set(Object.values(tracks).flat().map(k => k.time))] : (tracks[r.prop] || []).map(k => k.time);
    let best = null;
    for (const t of list) { const d = Math.abs(this.tlX(t) - x); if (d <= 7 && (!best || d < best.d)) best = { d, t }; }
    return best ? { elId: r.el.id, prop: r.kind === 'prop' ? r.prop : null, time: best.t } : null;
  },
  onTimelinePointer(e, forceScrub = false) {
    e.preventDefault();
    this.timelineFocus = true;
    const c = document.getElementById('timeline-canvas');
    const r = c.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const tl = this.model.animationTimeline;
    const hit = forceScrub || y < TL_RULER ? null : this.hitKeyframe(x, y);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    if (!hit) {
      tl.isPlaying = false; this.updateTimelineButtons();
      this.selectedKey = null;
      const scrub = (ev) => this.setTime(this.snapTime(this.tlT(ev.clientX - r.left), ev.shiftKey));
      scrub(e);
      const up = () => { target.removeEventListener('pointermove', scrub); target.removeEventListener('pointerup', up); this.renderTimeline(); this.updatePropertiesUI(); };
      target.addEventListener('pointermove', scrub); target.addEventListener('pointerup', up);
      return;
    }
    this.selectedKey = { ...hit };
    if (hit.prop) this.selectedTrack = { elId: hit.elId, prop: hit.prop };
    this.model.select([hit.elId]);
    this.selectionChanged();
    const origTime = hit.time;
    let moved = false;
    const move = (ev) => {
      const nt = this.snapTime(this.tlT(ev.clientX - r.left), ev.shiftKey);
      if (Math.abs(nt - this.selectedKey.time) < 1e-6) return;
      moved = true;
      for (const k of this.selectedKeyframes()) k.time = nt;
      this.selectedKey.time = nt;
      const tracks = tl.tracks[hit.elId];
      for (const p of Object.keys(tracks)) tracks[p].sort((a, b) => a.time - b.time);
      this.model.applyTime(tl.currentTime);
      this.renderTimeline();
      this.requestRender();
    };
    const up = () => {
      target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up);
      if (moved) {
        // merge keyframes that landed on the same time
        const tracks = tl.tracks[hit.elId] || {};
        for (const p of Object.keys(tracks)) {
          const seen = new Map();
          for (const k of tracks[p]) { const key = Math.round(k.time * 1000); if (!seen.has(key) || Math.abs(k.time - this.selectedKey.time) < 0.0005) seen.set(key, k); }
          tracks[p] = [...seen.values()].sort((a, b) => a.time - b.time);
        }
        this.commit();
      } else {
        this.setTime(origTime);
        this.renderTimeline();
      }
    };
    target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
  },
  snapTime(t, coarse) {
    const tl = this.model.animationTimeline;
    if (coarse) return Utils.clamp(Math.round(t * 10) / 10, 0, tl.duration);
    return Utils.clamp(Math.round(t * tl.fps) / tl.fps, 0, tl.duration);
  }
};
Object.assign(StudioApp.prototype, TimelineMixin);
