/**
 * DesignStudio — Rive-style Animate mode:
 * animations list, state-machine graph editor, global inputs, listeners and live preview.
 */
'use strict';

const AnimateMixin = {
  bindAnimate() {
    const body = document.getElementById('timeline-body');
    const assets = document.createElement('div');
    assets.id = 'tl-assets';
    assets.innerHTML = `
      <div class="tl-assets-head"><span>Animations</span><button class="prop-icon-btn" id="btn-add-anim" title="New animation" aria-label="New animation">+</button></div>
      <ul class="tl-asset-list" id="anim-list" role="listbox" aria-label="Animations"></ul>
      <div class="tl-assets-head"><span>State machines</span><button class="prop-icon-btn" id="btn-add-sm" title="New state machine" aria-label="New state machine">+</button></div>
      <ul class="tl-asset-list" id="sm-list" role="listbox" aria-label="State machines"></ul>`;
    body.insertBefore(assets, body.firstChild);
    const ed = document.createElement('div');
    ed.id = 'sm-editor';
    ed.hidden = true;
    ed.innerHTML = `
      <div id="sm-graph-wrap">
        <div id="sm-toolbar">
          <div id="sm-layer-tabs" role="tablist" aria-label="Layers"></div>
          <button class="menu-btn" id="sm-add-layer" title="Add a layer (layers play in parallel)">+ Layer</button>
          <button class="menu-btn" id="sm-add-state" title="Add an animation state">+ State</button>
          <span class="sm-hint">Drag from a state's ● to another state to add a transition</span>
          <button class="btn-primary" id="sm-preview">▶ Preview</button>
        </div>
        <div id="sm-graph" tabindex="0" aria-label="State machine graph"><svg id="sm-links" aria-hidden="true"></svg><div id="sm-nodes"></div></div>
      </div>
      <div id="sm-inspector" aria-label="State machine inspector"></div>`;
    body.appendChild(ed);
    this.timelineView = 'timeline';
    document.getElementById('btn-add-anim').addEventListener('click', () => this.addAnimation());
    document.getElementById('btn-add-sm').addEventListener('click', () => this.addStateMachine());
    document.getElementById('sm-add-layer').addEventListener('click', () => {
      const sm = this.activeSM(); if (!sm) return;
      const fresh = StudioModel.newStateMachine('x', null).layers[0];
      fresh.name = `Layer ${sm.layers.length + 1}`;
      sm.layers.push(fresh); this.activeLayerId = fresh.id; this.commit();
    });
    document.getElementById('sm-add-state').addEventListener('click', () => this.addState());
    document.getElementById('sm-preview').addEventListener('click', () => (this.previewing ? this.stopPreview() : this.startPreview()));
    document.getElementById('sm-graph').addEventListener('keydown', (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.smSel) { e.preventDefault(); this.deleteSmSelection(); }
    });
    document.getElementById('sm-graph').addEventListener('pointerdown', (e) => {
      if (e.target.id === 'sm-graph' || e.target.id === 'sm-nodes' || e.target.id === 'sm-links') { this.smSel = null; this.renderSM(); }
    });
  },

  // ------------------------------------------------------------------ Animations
  addAnimation() {
    const m = this.model;
    const a = StudioModel.newAnimation(`Timeline ${m.animations.length + 1}`, { duration: 1 });
    m.animations.push(a);
    this.setActiveAnimation(a.id);
    this.commit();
    Utils.toast(`Created “${a.name}” — select layers and add keyframes`, '🎞');
  },
  setActiveAnimation(id) {
    const m = this.model;
    if (this.previewing) this.stopPreview();
    this.restoreSetupPose();
    m.activeAnimationId = id;
    this.selectedKey = null; this.selectedTrack = null;
    this.timelineView = 'timeline';
    this.showTimelineView('timeline');
    this.setTime(0);
    this.renderTimeline();
  },
  /** Rive "setup pose": animated properties go back to their design values before another animation applies. */
  captureSetupPose() {
    const m = this.model;
    this.setupPose = new Map();
    for (const a of m.animations) for (const [elId, props] of Object.entries(a.tracks)) {
      const el = m.findAnywhere(elId); if (!el) continue;
      const o = this.setupPose.get(elId) || {};
      for (const p of Object.keys(props)) if (!(p in o)) o[p] = m.getAnimValue(el, p);
      this.setupPose.set(elId, o);
    }
  },
  restoreSetupPose() {
    if (!this.setupPose) return;
    const m = this.model;
    for (const [elId, props] of this.setupPose) {
      const el = m.findAnywhere(elId); if (!el) continue;
      for (const [p, v] of Object.entries(props)) m.setAnimValue(el, p, v);
    }
  },
  renderAnimAssets() {
    const m = this.model;
    const al = document.getElementById('anim-list');
    if (!al || al.querySelector('input')) return;
    al.innerHTML = '';
    for (const a of m.animations) {
      const li = document.createElement('li');
      li.className = 'tl-asset' + (a.id === m.activeAnimationId && this.timelineView === 'timeline' ? ' active' : '');
      li.setAttribute('role', 'option');
      li.innerHTML = `<span class="tl-asset-icon">🎞</span><span class="tl-asset-name"></span><span class="tl-asset-meta"></span><button class="tree-action-icon" data-a="dup" title="Duplicate" aria-label="Duplicate animation">⧉</button><button class="tree-action-icon" data-a="del" title="Delete" aria-label="Delete animation">✕</button>`;
      li.querySelector('.tl-asset-name').textContent = a.name; li.querySelector('.tl-asset-name').title = a.name;
      li.querySelector('.tl-asset-meta').textContent = `${Utils.round(a.duration, 2)}s · ${{ loop: '↻', oneShot: '→', pingPong: '⇄' }[a.loop]}`;
      li.querySelector('[data-a="del"]').disabled = m.animations.length < 2;
      li.addEventListener('click', (e) => {
        const act = e.target.dataset.a;
        if (act === 'dup') { const c = JSON.parse(JSON.stringify(a)); c.id = Utils.uid('anim'); c.name = `${a.name} copy`; m.animations.push(c); this.setActiveAnimation(c.id); this.commit(); return; }
        if (act === 'del') {
          if (m.animations.length < 2) return;
          m.animations = m.animations.filter(x => x !== a);
          for (const sm of m.stateMachines) for (const l of sm.layers) for (const st of l.states) if (st.animationId === a.id) st.animationId = null;
          if (m.activeAnimationId === a.id) m.activeAnimationId = m.animations[0].id;
          this.setActiveAnimation(m.activeAnimationId); this.commit(); return;
        }
        this.setActiveAnimation(a.id);
      });
      li.addEventListener('dblclick', () => this.inlineRename(li.querySelector('.tl-asset-name'), a.name, (v) => { a.name = v; this.commit(); }));
      al.appendChild(li);
    }
    const sl = document.getElementById('sm-list');
    sl.innerHTML = '';
    if (!m.stateMachines.length) sl.innerHTML = '<li class="tl-asset-empty">None yet — press + to add interactivity</li>';
    for (const sm of m.stateMachines) {
      const li = document.createElement('li');
      li.className = 'tl-asset' + (sm.id === this.activeSmId && this.timelineView === 'sm' ? ' active' : '');
      li.innerHTML = `<span class="tl-asset-icon">⧉</span><span class="tl-asset-name"></span><button class="tree-action-icon" data-a="del" title="Delete" aria-label="Delete state machine">✕</button>`;
      li.querySelector('.tl-asset-name').textContent = sm.name; li.querySelector('.tl-asset-name').title = sm.name;
      li.addEventListener('click', (e) => {
        if (e.target.dataset.a === 'del') { m.stateMachines = m.stateMachines.filter(x => x !== sm); if (this.activeSmId === sm.id) { this.activeSmId = null; this.showTimelineView('timeline'); } this.commit(); return; }
        this.openStateMachine(sm.id);
      });
      li.addEventListener('dblclick', () => this.inlineRename(li.querySelector('.tl-asset-name'), sm.name, (v) => { sm.name = v; this.commit(); }));
      sl.appendChild(li);
    }
  },
  inlineRename(span, value, save) {
    const inp = document.createElement('input');
    inp.className = 'tree-rename'; inp.value = value;
    span.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; const v = inp.value.trim(); inp.remove(); if (ok && v && v !== value) save(v.slice(0, 80)); else this.renderTimeline(); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); });
    inp.addEventListener('blur', () => fin(true));
  },

  // ------------------------------------------------------------------ State machines
  activeSM() { return this.model.stateMachines.find(s => s.id === this.activeSmId) || null; },
  activeLayer() { const sm = this.activeSM(); if (!sm) return null; return sm.layers.find(l => l.id === this.activeLayerId) || sm.layers[0]; },
  addStateMachine() {
    const m = this.model;
    const sm = StudioModel.newStateMachine(`State Machine ${m.stateMachines.length + 1}`, m.activeAnimationId);
    m.stateMachines.push(sm);
    this.openStateMachine(sm.id);
    this.commit();
    Utils.toast('State machine created — add inputs, states and transitions', '⧉');
  },
  openStateMachine(id) {
    this.activeSmId = id;
    const sm = this.activeSM();
    this.activeLayerId = sm?.layers[0]?.id;
    this.smSel = null;
    this.timelineView = 'sm';
    if (!this.timelineOpen()) this.toggleTimeline(true);
    this.showTimelineView('sm');
    this.renderTimeline();
  },
  showTimelineView(v) {
    this.timelineView = v;
    const sm = v === 'sm';
    document.getElementById('sm-editor').hidden = !sm;
    document.getElementById('timeline-left-tracks').style.display = sm ? 'none' : '';
    document.getElementById('timeline-right-canvas-wrap').style.display = sm ? 'none' : '';
    document.getElementById('timeline-panel').classList.toggle('sm-view', sm);
  },
  addState() {
    const layer = this.activeLayer(); if (!layer) return;
    const m = this.model;
    // v3.10: place the new state in the first free slot of the *visible* graph area (it used to land off-screen)
    const g = document.getElementById('sm-graph'), W = Math.max(300, g?.clientWidth || 600), H = Math.max(160, g?.clientHeight || 260);
    const x0 = (g?.scrollLeft || 0) + 20, y0 = (g?.scrollTop || 0) + 20;
    const free = (x, y) => layer.states.every(s => Math.abs(s.x - x) >= 150 || Math.abs(s.y - y) >= 64);
    let pos = null;
    for (let row = 0; !pos && row < 40; row++) for (let col = 0; col < 8; col++) {
      const x = x0 + col * 160, y = y0 + row * 72;
      if ((x + 140 <= x0 + W || col === 0) && free(x, y)) { pos = { x, y }; break; }
    }
    pos ||= { x: x0, y: y0 + Math.max(0, ...layer.states.map(s => s.y)) + 72 };
    if (pos.y + 50 > y0 + H) pos = (() => { for (let row = 0; row < 40; row++) for (let col = 0; col < 8; col++) { const x = 20 + col * 160, y = 20 + row * 72; if (x + 140 <= Math.max(W, 480) && free(x, y)) return { x, y }; } return pos; })();
    const st = { id: Utils.uid('st'), type: 'animation', name: m.activeAnimation.name, animationId: m.activeAnimationId, x: pos.x, y: pos.y, speed: 1 };
    layer.states.push(st);
    this.smSel = { kind: 'state', id: st.id }; this._smReveal = st.id;
    this.commit();
  },
  deleteSmSelection() {
    const layer = this.activeLayer(); if (!layer || !this.smSel) return;
    if (this.smSel.kind === 'transition') layer.transitions = layer.transitions.filter(t => t.id !== this.smSel.id);
    else {
      const st = layer.states.find(s => s.id === this.smSel.id);
      if (!st || st.type !== 'animation') { Utils.toast('Entry, Any State and Exit cannot be deleted', 'ℹ️'); return; }
      layer.states = layer.states.filter(s => s !== st);
      layer.transitions = layer.transitions.filter(t => t.from !== st.id && t.to !== st.id);
    }
    this.smSel = null;
    this.commit();
  },

  renderSM() {
    const sm = this.activeSM();
    if (!sm) { this.showTimelineView('timeline'); return; }
    const layer = this.activeLayer();
    const m = this.model;
    // layer tabs
    const tabs = document.getElementById('sm-layer-tabs');
    tabs.innerHTML = '';
    for (const l of sm.layers) {
      const b = document.createElement('button');
      b.className = 'sm-layer-tab' + (l === layer ? ' active' : '');
      b.textContent = l.name; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => { this.activeLayerId = l.id; this.smSel = null; this.renderSM(); });
      b.addEventListener('dblclick', () => this.inlineRename(b, l.name, (v) => { l.name = v; this.commit(); }));
      tabs.appendChild(b);
    }
    document.getElementById('sm-preview').textContent = this.previewing ? '■ Stop preview' : '▶ Preview';
    document.getElementById('sm-preview').classList.toggle('btn-danger', !!this.previewing);
    // nodes
    const nodes = document.getElementById('sm-nodes');
    nodes.innerHTML = '';
    const cur = new Set(this.previewing ? this.runtimes.flatMap(r => r.currentStateIds()) : []);
    let maxX = 600, maxY = 260;
    for (const st of layer.states) {
      const d = document.createElement('div');
      d.className = `sm-node type-${st.type}` + (this.smSel?.kind === 'state' && this.smSel.id === st.id ? ' selected' : '') + (cur.has(st.id) ? ' current' : '');
      d.style.left = `${st.x}px`; d.style.top = `${st.y}px`;
      d.dataset.id = st.id;
      d.tabIndex = 0;
      const anim = m.animations.find(a => a.id === st.animationId);
      d.innerHTML = `<div class="sm-node-title"></div>${st.type === 'animation' ? '<div class="sm-node-sub"></div>' : ''}${st.type !== 'exit' ? '<span class="sm-port" title="Drag to another state to connect"></span>' : ''}`;
      d.querySelector('.sm-node-title').textContent = st.name;
      if (st.type === 'animation') d.querySelector('.sm-node-sub').textContent = anim ? `${anim.name} · ${{ loop: '↻', oneShot: '→', pingPong: '⇄' }[anim.loop]}` : '⚠ no animation';
      this.bindNodeDrag(d, st, layer);
      nodes.appendChild(d);
      maxX = Math.max(maxX, st.x + 200); maxY = Math.max(maxY, st.y + 100);
    }
    nodes.style.width = `${maxX}px`; nodes.style.height = `${maxY}px`;
    if (this._smReveal) { nodes.querySelector(`[data-id="${this._smReveal}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); this._smReveal = null; }
    this.renderSMLinks();
    this.renderSMInspector();
  },
  nodeRect(stId) {
    const el = document.querySelector(`#sm-nodes .sm-node[data-id="${CSS.escape(stId)}"]`);
    if (!el) return null;
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  },
  renderSMLinks(temp = null) {
    const layer = this.activeLayer(); if (!layer) return;
    const svg = document.getElementById('sm-links');
    const nodes = document.getElementById('sm-nodes');
    svg.setAttribute('width', nodes.offsetWidth); svg.setAttribute('height', nodes.offsetHeight);
    const curve = (a, b, bend = 0) => {
      const x1 = a.x + a.w, y1 = a.y + a.h / 2 + bend, x2 = b.x, y2 = b.y + b.h / 2 + bend;
      const dx = Math.max(40, Math.abs(x2 - x1) / 2);
      return x2 >= x1 ? `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1 + 80} ${y1 + 60 + bend} ${x2 - 80} ${y2 + 60 + bend} ${x2} ${y2}`;
    };
    let html = '<defs><marker id="sm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>';
    for (const t of layer.transitions) {
      const a = this.nodeRect(t.from), b = this.nodeRect(t.to);
      if (!a || !b) continue;
      const rev = layer.transitions.some(o => o.from === t.to && o.to === t.from);
      const d = curve(a, b, rev ? (t.from < t.to ? -8 : 8) : 0);
      const sel = this.smSel?.kind === 'transition' && this.smSel.id === t.id;
      const cls = sel ? 'sm-link selected' : t.conditions.length || t.exitTime ? 'sm-link' : 'sm-link unconditional';
      html += `<path class="sm-link-hit" data-id="${t.id}" d="${d}"/><path class="${cls}" d="${d}" marker-end="url(#sm-arrow)"/>`;
    }
    if (temp) html += `<path class="sm-link temp" d="M${temp.x1} ${temp.y1} L${temp.x2} ${temp.y2}"/>`;
    svg.innerHTML = html;
    svg.querySelectorAll('.sm-link-hit').forEach(p => p.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.smSel = { kind: 'transition', id: p.dataset.id }; this.renderSM(); document.getElementById('sm-graph').focus({ preventScroll: true }); }));
  },
  bindNodeDrag(d, st, layer) {
    d.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const graph = document.getElementById('sm-graph');
      graph.focus({ preventScroll: true });
      const gr = document.getElementById('sm-nodes').getBoundingClientRect();
      if (e.target.classList.contains('sm-port')) {
        // connect
        const a = this.nodeRect(st.id);
        const move = (ev) => this.renderSMLinks({ x1: a.x + a.w, y1: a.y + a.h / 2, x2: ev.clientX - gr.left, y2: ev.clientY - gr.top });
        const up = (ev) => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
          const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.sm-node');
          const to = target && layer.states.find(s => s.id === target.dataset.id);
          if (!to || to === st || to.type === 'entry' || to.type === 'any' || st.type === 'exit') { this.renderSMLinks(); return; }
          if (st.type === 'entry') layer.transitions = layer.transitions.filter(t => t.from !== st.id);
          if (layer.transitions.some(t => t.from === st.id && t.to === to.id && !t.conditions.length)) { this.renderSMLinks(); return; }
          const tr = { id: Utils.uid('tr'), from: st.id, to: to.id, conditions: [], duration: st.type === 'animation' ? 150 : 0, exitTime: 0 };
          layer.transitions.push(tr);
          this.smSel = { kind: 'transition', id: tr.id };
          this.commit();
          if (st.type !== 'entry') Utils.toast('Transition added — give it a condition in the inspector', '→');
        };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
        return;
      }
      this.smSel = { kind: 'state', id: st.id };
      const sx = e.clientX, sy = e.clientY, ox = st.x, oy = st.y;
      let moved = false;
      d.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const nx = Math.max(0, Math.round((ox + ev.clientX - sx) / 10) * 10), ny = Math.max(0, Math.round((oy + ev.clientY - sy) / 10) * 10);
        if (nx !== st.x || ny !== st.y) moved = true;
        st.x = nx; st.y = ny; d.style.left = `${nx}px`; d.style.top = `${ny}px`;
        this.renderSMLinks();
      };
      const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); if (moved) this.commit(); else this.renderSM(); };
      d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
    });
    d.addEventListener('dblclick', () => { if (st.type === 'animation') this.inlineRename(d.querySelector('.sm-node-title'), st.name, (v) => { st.name = v; this.commit(); }); });
  },

  // ------------------------------------------------------------------ Inspector
  renderSMInspector() {
    const insp = document.getElementById('sm-inspector');
    if (insp.contains(document.activeElement) && document.activeElement.tagName !== 'BUTTON') return;
    const m = this.model, sm = this.activeSM(), layer = this.activeLayer();
    insp.innerHTML = '';
    const section = (title, extra = '') => { const s = document.createElement('div'); s.className = 'sm-sec'; s.innerHTML = `<div class="sm-sec-head"><span>${title}</span>${extra}</div>`; insp.appendChild(s); return s; };
    const opt = (v, label, sel) => `<option value="${Utils.escapeHtml(v)}"${sel ? ' selected' : ''}>${Utils.escapeHtml(label)}</option>`;

    // ---- selection
    if (this.smSel?.kind === 'state') {
      const st = layer.states.find(s => s.id === this.smSel.id);
      if (st) {
        const s = section(st.type === 'animation' ? 'State' : st.name);
        if (st.type === 'animation') {
          s.insertAdjacentHTML('beforeend', `
            <label class="sm-row"><span>Name</span><input data-k="name" /></label>
            <label class="sm-row"><span>Animation</span><select data-k="animationId">${m.animations.map(a => opt(a.id, a.name, a.id === st.animationId)).join('')}</select></label>
            <label class="sm-row"><span>Speed</span><input data-k="speed" type="number" step="0.1" min="-10" max="10" /></label>
            <button class="menu-btn sm-del">Delete state</button>`);
          s.querySelector('[data-k="name"]').value = st.name;
          s.querySelector('[data-k="speed"]').value = st.speed ?? 1;
          s.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => { st[inp.dataset.k] = inp.dataset.k === 'speed' ? Utils.num(inp.value, 1) : inp.value; this.commit(); }));
          s.querySelector('.sm-del').addEventListener('click', () => this.deleteSmSelection());
        } else {
          s.insertAdjacentHTML('beforeend', `<p class="muted-text">${{ entry: 'The machine starts here. Connect it to the state that should play first.', any: 'Transitions from Any State can fire whatever state is currently playing.', exit: 'Reaching Exit stops this layer.' }[st.type]}</p>`);
        }
      }
    } else if (this.smSel?.kind === 'transition') {
      const t = layer.transitions.find(x => x.id === this.smSel.id);
      if (t) {
        const name = (id) => layer.states.find(s => s.id === id)?.name || '?';
        const s = section(`Transition: ${Utils.escapeHtml(name(t.from))} → ${Utils.escapeHtml(name(t.to))}`);
        s.insertAdjacentHTML('beforeend', `
          <label class="sm-row"><span>Mix (ms)</span><input data-k="duration" type="number" min="0" step="50" /></label>
          <label class="sm-row"><span>Exit time %</span><input data-k="exitTime" type="number" min="0" max="100" step="5" title="0 = can leave immediately" /></label>
          <div class="sm-sub">Conditions <span class="muted-text">(all must be true)</span></div>
          <div class="sm-conds"></div>
          <div class="sm-row-btns"><button class="menu-btn sm-add-cond">+ Condition</button><button class="menu-btn sm-del">Delete transition</button></div>`);
        s.querySelector('[data-k="duration"]').value = t.duration;
        s.querySelector('[data-k="exitTime"]').value = t.exitTime;
        s.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => { t[inp.dataset.k] = Math.max(0, Utils.num(inp.value)); this.commit(); }));
        const conds = s.querySelector('.sm-conds');
        if (!t.conditions.length) conds.innerHTML = '<p class="muted-text">No conditions — fires as soon as allowed.</p>';
        t.conditions.forEach((c, i) => {
          const def = m.inputs.find(x => x.id === c.inputId);
          const row = document.createElement('div');
          row.className = 'sm-cond';
          const ops = !def ? [] : def.type === 'trigger' ? [] : def.type === 'boolean' ? ['==', '!='] : ['==', '!=', '>', '<', '>=', '<='];
          row.innerHTML = `<select data-c="inputId">${m.inputs.map(x => opt(x.id, `${x.name} (${x.type})`, x.id === c.inputId)).join('')}</select>` +
            (ops.length ? `<select data-c="op">${ops.map(o => opt(o, o, o === c.op)).join('')}</select>` : '<span class="muted-text">fires</span>') +
            (def?.type === 'boolean' ? `<select data-c="value">${opt('true', 'true', c.value === true)}${opt('false', 'false', c.value === false)}</select>` : def?.type === 'number' ? '<input data-c="value" type="number" step="any" />' : '') +
            '<button class="tree-action-icon" data-c="del" aria-label="Remove condition">✕</button>';
          const vi = row.querySelector('input[data-c="value"]'); if (vi) vi.value = c.value;
          row.addEventListener('change', (e) => {
            const k = e.target.dataset.c;
            if (k === 'inputId') { c.inputId = e.target.value; const nd = m.inputs.find(x => x.id === c.inputId); c.op = '=='; c.value = nd?.type === 'number' ? 0 : true; }
            else if (k === 'op') c.op = e.target.value;
            else if (k === 'value') c.value = def.type === 'boolean' ? e.target.value === 'true' : Utils.num(e.target.value);
            this.commit();
          });
          row.querySelector('[data-c="del"]').addEventListener('click', () => { t.conditions.splice(i, 1); this.commit(); });
          conds.appendChild(row);
        });
        s.querySelector('.sm-add-cond').addEventListener('click', () => {
          if (!m.inputs.length) { Utils.toast('Add an input first (Inputs section below)', 'ℹ️'); return; }
          const def = m.inputs[0];
          t.conditions.push({ inputId: def.id, op: '==', value: def.type === 'number' ? 0 : true });
          this.commit();
        });
        s.querySelector('.sm-del').addEventListener('click', () => this.deleteSmSelection());
      }
    } else {
      const s = section('State machine');
      s.insertAdjacentHTML('beforeend', '<p class="muted-text">Select a state or a transition arrow to edit it. Layers run in parallel; inputs are shared by every state machine, prototype and section.</p>');
    }

    // ---- global inputs
    const ins = section('Inputs <span class="muted-text">(global)</span>', '<span class="sm-add-input"><button class="menu-btn" data-t="boolean" title="Add Boolean input">+ Bool</button><button class="menu-btn" data-t="number" title="Add Number input">+ Num</button><button class="menu-btn" data-t="trigger" title="Add Trigger input">+ Trig</button></span>');
    ins.querySelectorAll('.sm-add-input button').forEach(b => b.addEventListener('click', () => {
      const n = m.inputs.filter(i => i.type === b.dataset.t).length + 1;
      m.inputs.push({ id: Utils.uid('in'), name: `${b.dataset.t === 'boolean' ? 'isOn' : b.dataset.t === 'number' ? 'level' : 'tap'}${n > 1 ? n : ''}`, type: b.dataset.t, value: b.dataset.t === 'number' ? 0 : false });
      this.commit();
    }));
    if (!m.inputs.length) ins.insertAdjacentHTML('beforeend', '<p class="muted-text">Inputs drive transitions. Booleans and numbers hold values; triggers fire once.</p>');
    for (const def of m.inputs) {
      const row = document.createElement('div');
      row.className = 'sm-input';
      const live = this.previewing ? this.bus.get(def.id) : def.value;
      row.innerHTML = `<span class="sm-type sm-type-${def.type}">${{ boolean: 'B', number: '#', trigger: '⚡' }[def.type]}</span><input class="sm-input-name" aria-label="Input name" />` +
        (def.type === 'boolean' ? '<input type="checkbox" class="sm-val" aria-label="Value" />' : def.type === 'number' ? '<input type="number" class="sm-val" step="any" aria-label="Value" />' : `<button class="menu-btn sm-fire"${this.previewing ? '' : ' disabled title="Start preview to fire"'}>Fire</button>`) +
        '<button class="tree-action-icon sm-del-input" aria-label="Delete input">✕</button>';
      row.querySelector('.sm-input-name').value = def.name;
      const val = row.querySelector('.sm-val');
      if (val) { if (def.type === 'boolean') val.checked = !!live; else val.value = live; }
      row.querySelector('.sm-input-name').addEventListener('change', (e) => { const v = e.target.value.trim().replace(/\s+/g, '_'); if (v) { def.name = v.slice(0, 60); this.commit(); } });
      if (val) val.addEventListener('change', () => {
        const v = def.type === 'boolean' ? val.checked : Utils.num(val.value);
        if (this.previewing) this.bus.set(def.id, v); else { def.value = v; this.commit(); }
      });
      row.querySelector('.sm-fire')?.addEventListener('click', () => this.bus?.fire(def.id));
      row.querySelector('.sm-del-input').addEventListener('click', () => {
        m.inputs = m.inputs.filter(i => i !== def);
        for (const s2 of m.stateMachines) {
          for (const l of s2.layers) for (const t of l.transitions) t.conditions = t.conditions.filter(c => c.inputId !== def.id);
          for (const li of s2.listeners) li.actions = li.actions.filter(a => a.inputId !== def.id);
        }
        this.commit();
      });
      ins.appendChild(row);
    }

    // ---- listeners
    const ls = section('Listeners', '<button class="menu-btn" id="sm-add-listener" title="Make the selected layer interactive">+ Listener</button>');
    ls.querySelector('#sm-add-listener').addEventListener('click', () => {
      const el = m.topSelected()[0];
      if (!el) { Utils.toast('Select a layer on the canvas first — it becomes the listener target', 'ℹ️'); return; }
      if (!m.inputs.length) { Utils.toast('Add an input first', 'ℹ️'); return; }
      const trig = m.inputs.find(i => i.type === 'trigger') || m.inputs[0];
      sm.listeners.push({ id: Utils.uid('li'), targetId: el.id, event: 'click', actions: [{ type: trig.type === 'trigger' ? 'fire' : trig.type === 'boolean' ? 'toggle' : 'set', inputId: trig.id, value: trig.type === 'number' ? 1 : true }] });
      this.commit();
    });
    if (!sm.listeners.length) ls.insertAdjacentHTML('beforeend', '<p class="muted-text">Listeners turn pointer events on a layer into input changes (e.g. click → fire “tap”).</p>');
    const targets = [...m.elements, ...((m.scene3d?.objects || []).filter(o => !/Light$/.test(o.type)).map(o => ({ id: o.id, name: `3D · ${o.name}` })))];
    for (const li of sm.listeners) {
      const row = document.createElement('div');
      row.className = 'sm-listener';
      const a = li.actions[0] || { type: 'fire', inputId: m.inputs[0]?.id, value: true };
      const def = m.inputs.find(i => i.id === a.inputId);
      row.innerHTML = `<select data-l="targetId" aria-label="Target layer">${targets.map(e => opt(e.id, e.name, e.id === li.targetId)).join('')}${targets.some(e => e.id === li.targetId) ? '' : opt(li.targetId, '(on another page)', true)}</select>
        <select data-l="event" aria-label="Event">${[['click', 'Click'], ['pointerDown', 'Pointer down'], ['pointerUp', 'Pointer up'], ['pointerEnter', 'Pointer enter'], ['pointerExit', 'Pointer exit']].map(([v, l]) => opt(v, l, v === li.event)).join('')}</select>
        <select data-l="type" aria-label="Action">${[['fire', 'Fire'], ['set', 'Set'], ['toggle', 'Toggle']].map(([v, l]) => opt(v, l, v === a.type)).join('')}</select>
        <select data-l="inputId" aria-label="Input">${m.inputs.map(i => opt(i.id, i.name, i.id === a.inputId)).join('')}</select>
        ${a.type === 'set' ? (def?.type === 'number' ? '<input data-l="value" type="number" step="any" aria-label="Value" />' : `<select data-l="value">${opt('true', 'true', a.value === true)}${opt('false', 'false', a.value === false)}</select>`) : ''}
        <button class="tree-action-icon" data-l="del" aria-label="Delete listener">✕</button>`;
      const vi = row.querySelector('input[data-l="value"]'); if (vi) vi.value = a.value;
      row.addEventListener('change', (e) => {
        const k = e.target.dataset.l;
        if (!li.actions.length) li.actions.push(a);
        if (k === 'targetId' || k === 'event') li[k] = e.target.value;
        else if (k === 'type' || k === 'inputId') li.actions[0][k] = e.target.value;
        else if (k === 'value') li.actions[0].value = def?.type === 'number' ? Utils.num(e.target.value) : e.target.value === 'true';
        this.commit();
      });
      row.querySelector('[data-l="del"]').addEventListener('click', () => { sm.listeners = sm.listeners.filter(x => x !== li); this.commit(); });
      ls.appendChild(row);
    }
  },

  // ------------------------------------------------------------------ Preview (runtime on the canvas)
  makeApply() {
    const m = this.model;
    return (elId, prop, v) => {
      if (this.apply3D && this.apply3D(elId, prop, v)) return;
      const el = m.findAnywhere(elId);
      if (el) m.setAnimValue(el, prop, v);
    };
  },
  startPreview() {
    const m = this.model;
    const designTriggers = (m.triggers || []).filter(t => t.scope === 'design' && t.enabled !== false);
    if (!m.stateMachines.length && !designTriggers.length) { Utils.toast('Add a state machine or a trigger first (Prototype tab › Triggers)', 'ℹ️'); return; }
    this.finishTextEdit();
    this.captureSetupPose();
    this.previewRestore = this.setupPose;
    this.bus = new InputBus(JSON.parse(JSON.stringify(m.inputs)));
    this.runtimes = m.stateMachines.map(sm => new StateMachineRuntime(m, sm, this.bus, this.makeApply()));
    this.trgEngine = new TriggerEngine(m.triggers, m, this.bus, this.designTriggerHost({ apply: (id, p, v) => { if (p === 'visible') { const el = m.findAnywhere(id); if (el) el.visible = !!v; } else this.makeApply()(id, p, v); } }), 'design');
    this.trgEngine.start(m.roots().filter(r => r.type === 'frame').map(r => r.id));
    this.previewing = true;
    this.previewLast = null;
    this.previewHover = new Set();
    this.bus.onChange(() => { this.previewUiDirty = true; });
    m.select([]);
    document.body.classList.add('previewing');
    this.selectionChanged();
    this.renderSM();
    Utils.toast('Preview running — click layers with listeners, use the Inputs panel. Esc stops.', '▶');
  },
  stopPreview() {
    if (!this.previewing) return;
    this.previewing = false;
    for (const rt of this.runtimes || []) rt.dispose();
    this.runtimes = [];
    if (this.trgEngine) { this.trgEngine.restore(); this.trgEngine.dispose(); this.trgEngine = null; }
    this.restoreSetupPose();
    this.model.applyTime(this.model.animationTimeline.currentTime);
    document.body.classList.remove('previewing');
    this.requestRender();
    this.renderTimeline();
  },
  tickPreview(ts) {
    if (!this.previewing) return;
    const dt = this.previewLast == null ? 0 : Math.min(0.1, (ts - this.previewLast) / 1000);
    this.previewLastRaw = this.previewLast == null ? 0 : Math.min(1, (ts - this.previewLast) / 1000);
    this.previewLast = ts;
    for (const rt of this.runtimes) rt.advance(dt);
    this.trgEngine?.tick(this.previewLastRaw ?? dt);
    this.requestRender();
    if (ts - (this.previewUiAt || 0) > 120) {
      this.previewUiAt = ts;
      const cur = new Set(this.runtimes.flatMap(r => r.currentStateIds()));
      document.querySelectorAll('#sm-nodes .sm-node').forEach(n => n.classList.toggle('current', cur.has(n.dataset.id)));
      if (this.previewUiDirty) {
        this.previewUiDirty = false;
        document.querySelectorAll('#sm-inspector .sm-input').forEach((row, i) => {
          const def = this.model.inputs[i]; if (!def) return;
          const val = row.querySelector('.sm-val'); if (!val || document.activeElement === val) return;
          if (def.type === 'boolean') val.checked = !!this.bus.get(def.id); else val.value = this.bus.get(def.id);
        });
      }
    }
  },
  previewHitIds(e) {
    const p = this.pointer(e);
    const deep = this.hitTestDeep(p);
    return deep ? [deep.id, ...this.model.ancestorsOf(deep).map(a => a.id)] : [];
  },
  /** Canvas pointer routing while previewing. Returns true when the event was consumed. */
  handlePreviewPointer(e, kind) {
    if (!this.previewing || e.target !== this.canvas) return false;
    const ids = this.previewHitIds(e);
    const listened = new Set([...this.runtimes.flatMap(r => r.hasListenerTargets()), ...(this.trgEngine ? this.trgEngine.listens() : [])]);
    const E = this.trgEngine;
    if (E) {
      const w = this.pointer(e), r = this.canvas.getBoundingClientRect();
      if (kind === 'move') E.pointerMove(ids, w.x, w.y, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      else if (kind === 'down') E.pointerDown(ids, w.x, w.y);
      else if (kind === 'up') E.pointerUp(ids, w.x, w.y);
    }
    this.canvas.style.cursor = ids.some(id => listened.has(id)) ? 'pointer' : 'default';
    if (kind === 'move') {
      const now = new Set(ids);
      const entered = ids.filter(id => !this.previewHover.has(id)), exited = [...this.previewHover].filter(id => !now.has(id));
      for (const rt of this.runtimes) { if (entered.length) rt.pointer('pointerEnter', entered); if (exited.length) rt.pointer('pointerExit', exited); }
      this.previewHover = now;
      return true;
    }
    if (kind === 'down') { this.previewDownIds = ids; for (const rt of this.runtimes) rt.pointer('pointerDown', ids); }
    if (kind === 'up') {
      for (const rt of this.runtimes) rt.pointer('pointerUp', ids);
      const clicked = ids.filter(id => (this.previewDownIds || []).includes(id));
      if (clicked.length) for (const rt of this.runtimes) rt.pointer('click', clicked);
    }
    return true;
  }
};
Object.assign(StudioApp.prototype, AnimateMixin);
