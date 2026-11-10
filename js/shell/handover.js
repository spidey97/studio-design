/**
 * DesignStudio — Developer Handover (v3.35.0). The 4th section, next to 3D.
 *
 *  Commit     In Design, select the finished screens (Ctrl+A for everything). A "Commit to Handover" button appears;
 *             it freezes a copy of the selection (layers, styles, variables, images + a preview per screen) as a
 *             numbered handover version and opens it in the Handover tab. Later edits in Design don't change it.
 *  Inspect    Click any layer on a screen: specs, spacing to its screen and parent, colours, type, CSS / React /
 *             SwiftUI / Compose / Flutter code, assets and designer notes. Select one layer and hover another to
 *             measure the distance between them (red lines).
 *  Versions   Each commit has a status (Ready → In development → Changes requested → Done) and shows what changed
 *             since the previous version of the same screens (added / changed layers, highlighted on the screen).
 *  Package    Download a .zip: README, spec.json, tokens.json, screen PNGs, HTML + React code and image assets.
 * Handover commits are saved in the project file (model.handovers), so they travel with it.
 */
'use strict';

const HO_STATUS = { ready: 'Ready for development', progress: 'In development', changes: 'Changes requested', done: 'Done' };

(function patchHandover() {
  const P = StudioApp.prototype, sel = P.selectionChanged, sec = P.setSection, mode = P.setUiMode;
  P.selectionChanged = function (...a) { const r = sel.apply(this, a); this.hoSyncButton?.(); return r; };
  P.setSection = function (name, ...a) {
    const r = sec.call(this, name, ...a);
    const ws = document.getElementById('handover-workspace'); if (ws) ws.hidden = this.section !== 'handover';
    if (this.section === 'handover') this.hoEnter?.();
    this.hoSyncButton?.(); return r;
  };
  if (mode) P.setUiMode = function (...a) { const r = mode.apply(this, a); this.hoSyncButton?.(); return r; };
})();

const HandoverMixin = {
  bindHandover() {
    const vp = document.getElementById('center-viewport');
    if (vp && !document.getElementById('ho-commit')) {
      const b = document.createElement('button'); b.id = 'ho-commit'; b.type = 'button'; b.className = 'ho-commit'; b.hidden = true;
      b.title = 'Freeze the selected design as a new version for developers (Ctrl+Alt+Enter)';
      b.innerHTML = '<span class="ho-commit-i" aria-hidden="true">⇪</span><span class="ho-commit-t">Commit to Handover</span><span class="ho-commit-n"></span>';
      b.addEventListener('click', () => this.hoCommitDialog());
      vp.appendChild(b);
    }
    if (this.commands) { this.commands.handoverCommit = { run: () => this.hoCommitDialog() }; this.commands.handover = { run: () => this.setSection('handover') }; }
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === '4') { e.preventDefault(); e.stopImmediatePropagation(); this.setSection('handover'); }
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter' && this.section === 'design') { e.preventDefault(); e.stopImmediatePropagation(); this.hoCommitDialog(); }
    }, true);
    this.ho = { open: null, screen: 0, sel: null, hover: null, tab: 'specs', code: 'css', changes: true, filter: '' };
    this.hoSyncButton();
  },
  /** The screens to commit: the top-level layer (usually a frame) of everything selected. */
  hoRoots() {
    const M = this.model, out = [];
    for (const e of M.topSelected()) { let r = e; for (let i = 0; i < 60; i++) { const p = M.parentOf(r); if (!p) break; r = p; } if (!out.includes(r)) out.push(r); }
    return M.roots().filter(r => out.includes(r)); // keep layer-panel order
  },
  hoSyncButton() {
    const b = document.getElementById('ho-commit'); if (!b || !this.model) return;
    const n = this.section === 'design' && this.uiMode !== 'animate' && !this.previewing ? this.hoRoots().length : 0;
    b.hidden = !n;
    if (n) { const all = n === this.model.roots().length; b.querySelector('.ho-commit-n').textContent = all ? 'all' : String(n); b.setAttribute('aria-label', `Commit ${all ? 'the whole page' : `${n} screen${n === 1 ? '' : 's'}`} to Developer Handover`); b.querySelector('.ho-commit-n').title = `${n} screen${n === 1 ? '' : 's'}`; }
  },

  // ------------------------------------------------------------------ commit
  hoCommitDialog() {
    const M = this.model, roots = this.hoRoots();
    if (!roots.length) { Utils.toast('Select the finished screens first (Ctrl+A selects everything)', 'ℹ️'); return; }
    const E = Utils.escapeHtml, prev = (M.handovers || []).at(-1), n = (M.handovers || []).reduce((a, h) => Math.max(a, h.n), 0) + 1;
    const layers = roots.reduce((a, r) => a + 1 + M.descendantsOf(r.id).length, 0);
    const def = roots.length === 1 ? roots[0].name : roots.length === M.roots().length ? M.page.name : `${roots.slice(0, 3).map(r => r.name).join(', ')}${roots.length > 3 ? ` +${roots.length - 3}` : ''}`;
    const body = `<form class="ho-cform st-form">
      <p class="st-note">Version <b>v${n}</b> · ${roots.length} screen${roots.length === 1 ? '' : 's'} · ${layers} layers · page “${E(M.page.name)}”${prev ? ` · previous: v${prev.n} ${E(prev.title)}` : ''}</p>
      <label class="st-row"><span>Title</span><span class="st-ctl"><input name="title" maxlength="120" value="${E(def)}" required></span></label>
      <label class="ho-msg"><span>What's in this handover?</span><textarea name="message" rows="4" maxlength="4000" placeholder="e.g. Final checkout flow: new error states, updated button sizes. Uses the Brand tokens."></textarea></label>
      <label class="st-row"><span>Status</span><span class="st-ctl"><select name="status">${Object.entries(HO_STATUS).filter(([k]) => k !== 'done').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></span></label>
      <p class="st-note">This saves a frozen copy for developers. You can keep designing: later edits don't change this version.</p></form>`;
    const { el, close } = this.dialog({ title: 'Commit to Developer Handover', body, actions: [{ label: 'Cancel' }, { label: `Commit v${n}`, primary: true, run: () => go() }] });
    const f = el.querySelector('.ho-cform');
    const go = () => { const h = this.hoCommit(roots, { title: f.title.value.trim() || def, message: f.message.value.trim(), status: f.status.value }); if (h) { this.setSection('handover'); this.hoOpen(h.id); } };
    f.addEventListener('submit', (e) => { e.preventDefault(); close(); go(); });
    f.addEventListener('keydown', (e) => e.stopPropagation());
    setTimeout(() => f.message.focus(), 30);
  },
  /** Freeze roots (+ descendants) as a new handover version. Returns the commit. */
  hoCommit(roots, { title, message = '', status = 'ready' } = {}) {
    const M = this.model, ids = new Set();
    for (const r of roots) { ids.add(r.id); M.descendantsOf(r.id).forEach(d => ids.add(d.id)); }
    const elements = M.elements.filter(e => ids.has(e.id)).map(e => JSON.parse(JSON.stringify(e.toJSON ? e.toJSON() : e)));
    const assets = {}; for (const e of elements) if (e.assetId && M.assets[e.assetId]) assets[e.assetId] = M.assets[e.assetId];
    const screens = roots.map(r => {
      let thumb = '';
      try {
        const b = Utils.aabb(r), scale = Math.min(2, 1800 / Math.max(1, b.w, b.h));
        const c = this.renderer.renderToCanvas({ roots: [r], scale, maxSize: 3600 });
        thumb = c.toDataURL('image/webp', 0.88); if (!thumb.startsWith('data:image/webp')) thumb = c.toDataURL('image/png');
      } catch (err) { window.DSDiag?.warn('handover', `Preview failed for ${r.name}`, err); }
      return { id: r.id, name: r.name, w: Math.round(r.width), h: Math.round(r.height), thumb };
    });
    const n = (M.handovers || []).reduce((a, h) => Math.max(a, h.n), 0) + 1;
    const h = { id: Utils.uid('ho'), n, title: String(title || `Handover ${n}`).slice(0, 120), message, status, createdAt: new Date().toISOString(), page: M.page.name, author: '', screens, notes: {},
      doc: { pages: [{ id: 'page_1', name: M.page.name, elements }], styles: JSON.parse(JSON.stringify(M.styles)), variables: JSON.parse(JSON.stringify(M.variables)), assets } };
    (M.handovers = M.handovers || []).push(h);
    if (M.handovers.length > 60) M.handovers.splice(0, M.handovers.length - 60);
    this.hoSaved();
    window.DSDiag?.info('handover', `Committed v${n} “${h.title}”: ${screens.length} screen(s), ${elements.length} layers`);
    Utils.toast(`Committed v${n} to Developer Handover`, '⇪');
    return h;
  },
  hoSaved() { this.unsaved = true; this.scheduleAutosave?.(); },
  hoFind(id) { return (this.model.handovers || []).find(h => h.id === id); },
  /** A read-only model built from a commit (cached). */
  hoModel(h) {
    this._hoModels = this._hoModels || new Map();
    if (!this._hoModels.has(h.id)) { const m = new StudioModel(); m.load({ ...h.doc, pages: JSON.parse(JSON.stringify(h.doc.pages)) }); this._hoModels.set(h.id, m); }
    return this._hoModels.get(h.id);
  },
  /** Previous commit containing any of the same screens. */
  hoPrev(h) { const L = this.model.handovers || [], ids = new Set(h.screens.map(s => s.id)); return L.filter(x => x.n < h.n && x.screens.some(s => ids.has(s.id))).sort((a, b) => b.n - a.n)[0] || null; },
  hoDiff(h) {
    const p = this.hoPrev(h); if (!p) return null;
    const cur = new Map(h.doc.pages[0].elements.map(e => [e.id, e])), old = new Map(p.doc.pages[0].elements.map(e => [e.id, e]));
    const strip = (e) => JSON.stringify({ ...e, assetId: undefined });
    const added = [], changed = [], removed = [];
    for (const [id, e] of cur) { if (!old.has(id)) added.push(id); else if (strip(e) !== strip(old.get(id))) changed.push(id); }
    const roots = new Set(h.screens.map(s => s.id));
    for (const [id, e] of old) if (!cur.has(id) && (roots.has(id) || [...roots].some(r => this.hoInScreen(p, e, r)))) removed.push(e.name || id);
    return { prev: p, added, changed, removed };
  },
  hoInScreen(h, e, rootId) { const els = h.doc.pages[0].elements, byId = new Map(els.map(x => [x.id, x])); let c = e; for (let i = 0; c && i < 50; i++) { if (c.id === rootId) return true; c = byId.get(c.parentId); } return false; },

  // ------------------------------------------------------------------ workspace
  hoEnter() {
    let ws = document.getElementById('handover-workspace');
    if (!ws) { ws = document.createElement('div'); ws.id = 'handover-workspace'; ws.className = 'workspace ho-ws'; document.getElementById('space3d-workspace')?.after(ws); }
    ws.hidden = false;
    const L = this.model.handovers || [];
    if (this.ho.open && !this.hoFind(this.ho.open)) this.ho.open = null;
    if (!this.ho.open && L.length) this.ho.open = L.at(-1).id;
    this.hoRender();
  },
  hoOpen(id) { this.ho.open = id; this.ho.screen = 0; this.ho.sel = null; this.ho.hover = null; this.hoRender(); },
  hoRender() {
    const ws = document.getElementById('handover-workspace'); if (!ws) return;
    const E = Utils.escapeHtml, L = [...(this.model.handovers || [])].sort((a, b) => b.n - a.n), h = this.hoFind(this.ho.open);
    const when = (s) => { const d = new Date(s); return Number.isNaN(+d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
    const list = L.filter(x => !this.ho.filter || x.status === this.ho.filter);
    const side = `<aside class="ho-side" aria-label="Handover versions"><div class="ho-side-h"><b>Handover</b><span>${L.length} version${L.length === 1 ? '' : 's'}</span></div>
      <select class="ho-filter" aria-label="Filter by status"><option value="">All statuses</option>${Object.entries(HO_STATUS).map(([k, v]) => `<option value="${k}"${this.ho.filter === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <ul class="ho-list">${list.map(x => `<li><button type="button" class="ho-item${x.id === this.ho.open ? ' on' : ''}" data-ho="${x.id}" aria-current="${x.id === this.ho.open}"><span class="ho-v">v${x.n}</span><span class="ho-it"><b>${E(x.title)}</b><small>${when(x.createdAt)} · ${x.screens.length} screen${x.screens.length === 1 ? '' : 's'}</small></span><span class="ho-st ho-st-${x.status}" title="${HO_STATUS[x.status]}"></span></button></li>`).join('') || `<li class="ho-none">${L.length ? 'No versions with this status.' : 'No handovers yet.'}</li>`}</ul></aside>`;
    if (!h) {
      ws.innerHTML = `${side}<section class="ho-empty"><div><div class="ho-empty-i" aria-hidden="true">⇪</div><h2>Nothing handed over yet</h2><p>In <b>Design</b>, select the screens you've finished (<kbd>Ctrl</kbd>+<kbd>A</kbd> selects everything) and press <b>Commit to Handover</b>. Developers get specs, code, assets and every version here.</p><button type="button" class="btn-primary" data-hoa="design">Go to Design</button></div></section>`;
      this.hoWire(ws); return;
    }
    const hm = this.hoModel(h), diff = this.hoDiff(h), sc = h.screens[Math.min(this.ho.screen, h.screens.length - 1)];
    const layers = h.doc.pages[0].elements.length;
    const main = `<section class="ho-main" aria-label="Handover v${h.n}">
      <header class="ho-head"><div class="ho-title"><h2><span class="ho-v">v${h.n}</span> ${E(h.title)}</h2><p class="ho-meta">${when(h.createdAt)} · page “${E(h.page)}” · ${h.screens.length} screen${h.screens.length === 1 ? '' : 's'} · ${layers} layers</p></div>
        <div class="ho-acts"><label class="ho-stsel"><span class="ho-st ho-st-${h.status}" aria-hidden="true"></span><select data-hoa="status" aria-label="Status">${Object.entries(HO_STATUS).map(([k, v]) => `<option value="${k}"${h.status === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <button type="button" class="btn-primary" data-hoa="zip">Download package</button><button type="button" class="menu-btn" data-hoa="design" title="Select these layers in Design">Open in Design</button><button type="button" class="menu-btn" data-hoa="del" aria-label="Delete this version">Delete</button></div></header>
      ${h.message ? `<p class="ho-message">${E(h.message)}</p>` : ''}
      ${diff ? `<p class="ho-diff">Since <button type="button" class="ho-link" data-ho="${diff.prev.id}">v${diff.prev.n}</button>: <b class="ho-c-add">${diff.added.length} added</b> · <b class="ho-c-chg">${diff.changed.length} changed</b> · <b class="ho-c-rem">${diff.removed.length} removed</b>${diff.removed.length ? ` <small>(${E(diff.removed.slice(0, 5).join(', '))}${diff.removed.length > 5 ? '…' : ''})</small>` : ''} <label class="ho-chk"><input type="checkbox" data-hoa="changes"${this.ho.changes ? ' checked' : ''}> Highlight on screen</label></p>` : '<p class="ho-diff ho-first">First version of these screens.</p>'}
      ${h.screens.length > 1 ? `<div class="ho-screens" role="tablist" aria-label="Screens">${h.screens.map((s, i) => `<button type="button" role="tab" aria-selected="${s === sc}" class="ho-scr${s === sc ? ' on' : ''}" data-scr="${i}">${s.thumb ? `<img src="${s.thumb}" alt="">` : ''}<span>${E(s.name)}</span></button>`).join('')}</div>` : ''}
      <div class="ho-stage"><div class="ho-frame" style="aspect-ratio:${Math.max(1, sc.w)}/${Math.max(1, sc.h)};max-width:min(100%, ${Math.max(320, sc.w)}px)">${sc.thumb ? `<img class="ho-img" src="${sc.thumb}" alt="${E(sc.name)} preview" draggable="false">` : '<div class="ho-noimg">No preview</div>'}<div class="ho-marks"></div><div class="ho-hl" hidden></div><div class="ho-sl" hidden></div><div class="ho-rl"></div></div>
        <p class="ho-hint">Click a layer for its specs. Select one, then hover another to measure. <kbd>Esc</kbd> clears.</p></div></section>`;
    ws.innerHTML = `${side}${main}<aside class="ho-insp" aria-label="Inspector"></aside>`;
    this._hoCtx = { h, hm, sc, diff };
    this.hoWire(ws); this.hoMarks(); this.hoInspector(); this.hoDrawSel();
  },
  hoScreenEls() {
    const { h, hm, sc } = this._hoCtx, root = hm.getElementById(sc.id); if (!root) return [];
    return [root, ...hm.descendantsOf(root.id)].filter(e => e.visible !== false);
  },
  hoBox(el) { const { hm, sc } = this._hoCtx, r = hm.getElementById(sc.id), b = Utils.aabb(r), a = Utils.aabb(el); return { x: (a.x - b.x) / b.w * 100, y: (a.y - b.y) / b.h * 100, w: a.w / b.w * 100, h: a.h / b.h * 100, raw: a, sb: b }; },
  hoPlace(node, el) { const q = this.hoBox(el); Object.assign(node.style, { left: `${q.x}%`, top: `${q.y}%`, width: `${q.w}%`, height: `${q.h}%` }); node.hidden = false; },
  hoMarks() {
    const box = document.querySelector('.ho-marks'), { diff } = this._hoCtx || {}; if (!box) return;
    box.innerHTML = '';
    if (!diff || !this.ho.changes) return;
    const add = new Set(diff.added), chg = new Set(diff.changed);
    for (const el of this.hoScreenEls()) {
      const k = add.has(el.id) ? 'add' : chg.has(el.id) ? 'chg' : null; if (!k || el.id === this._hoCtx.sc.id) continue;
      const d = document.createElement('div'); d.className = `ho-mark ho-mark-${k}`; d.title = `${k === 'add' ? 'Added' : 'Changed'}: ${el.name}`; this.hoPlace(d, el); box.appendChild(d);
    }
  },
  hoHit(ev) {
    const fr = ev.currentTarget, r = fr.getBoundingClientRect(), { hm, sc } = this._hoCtx, b = Utils.aabb(hm.getElementById(sc.id));
    const x = b.x + (ev.clientX - r.left) / r.width * b.w, y = b.y + (ev.clientY - r.top) / r.height * b.h;
    let best = null, area = Infinity;
    for (const el of this.hoScreenEls()) { const a = Utils.aabb(el); if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) { const s = a.w * a.h; if (s <= area) { area = s; best = el; } } }
    return best;
  },
  hoDrawSel() {
    const sl = document.querySelector('.ho-sl'); if (!sl) return;
    const el = this.ho.sel && this._hoCtx.hm.getElementById(this.ho.sel);
    if (el) { this.hoPlace(sl, el); sl.dataset.label = `${el.name} · ${Math.round(el.width)}×${Math.round(el.height)}`; } else sl.hidden = true;
  },
  /** Red-line distances between the selected layer and the hovered one. */
  hoRedlines(hov) {
    const rl = document.querySelector('.ho-rl'); if (!rl) return; rl.innerHTML = '';
    const sel = this.ho.sel && this._hoCtx.hm.getElementById(this.ho.sel); if (!sel || !hov || hov.id === sel.id) return;
    const A = Utils.aabb(sel), B = Utils.aabb(hov), sb = Utils.aabb(this._hoCtx.hm.getElementById(this._hoCtx.sc.id));
    const lines = [], inside = A.x >= B.x && A.y >= B.y && A.x + A.w <= B.x + B.w && A.y + A.h <= B.y + B.h;
    const mid = (a0, a1, b0, b1) => (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
    if (inside) {
      const cy = A.y + A.h / 2, cx = A.x + A.w / 2;
      lines.push([B.x, cy, A.x, cy], [A.x + A.w, cy, B.x + B.w, cy], [cx, B.y, cx, A.y], [cx, A.y + A.h, cx, B.y + B.h]);
    } else {
      const cy = A.y + A.h <= B.y || B.y + B.h <= A.y ? null : mid(A.y, A.y + A.h, B.y, B.y + B.h), cx = A.x + A.w <= B.x || B.x + B.w <= A.x ? null : mid(A.x, A.x + A.w, B.x, B.x + B.w);
      const y0 = cy ?? A.y + A.h / 2, x0 = cx ?? A.x + A.w / 2;
      if (A.x + A.w <= B.x) lines.push([A.x + A.w, y0, B.x, y0]); else if (B.x + B.w <= A.x) lines.push([B.x + B.w, y0, A.x, y0]);
      if (A.y + A.h <= B.y) lines.push([x0, A.y + A.h, x0, B.y]); else if (B.y + B.h <= A.y) lines.push([x0, B.y + B.h, x0, A.y]);
    }
    for (const [x1, y1, x2, y2] of lines) {
      const len = Math.round(Math.abs(x2 - x1) + Math.abs(y2 - y1)); if (len < 1) continue;
      const d = document.createElement('div'), horiz = y1 === y2;
      d.className = `ho-line ${horiz ? 'h' : 'v'}`;
      Object.assign(d.style, { left: `${(Math.min(x1, x2) - sb.x) / sb.w * 100}%`, top: `${(Math.min(y1, y2) - sb.y) / sb.h * 100}%`, width: horiz ? `${Math.abs(x2 - x1) / sb.w * 100}%` : '0', height: horiz ? '0' : `${Math.abs(y2 - y1) / sb.h * 100}%` });
      d.dataset.len = `${len}`; rl.appendChild(d);
    }
  },
  hoWire(ws) {
    ws.querySelector('.ho-filter')?.addEventListener('change', (e) => { this.ho.filter = e.target.value; this.hoRender(); });
    ws.querySelectorAll('[data-ho]').forEach(b => b.addEventListener('click', () => this.hoOpen(b.dataset.ho)));
    ws.querySelectorAll('[data-scr]').forEach(b => b.addEventListener('click', () => { this.ho.screen = +b.dataset.scr; this.ho.sel = null; this.hoRender(); }));
    const act = (k, fn) => ws.querySelectorAll(`[data-hoa="${k}"]`).forEach(b => b.addEventListener(b.tagName === 'SELECT' || b.type === 'checkbox' ? 'change' : 'click', fn));
    act('design', () => this.hoToDesign());
    act('status', (e) => { const h = this.hoFind(this.ho.open); h.status = e.target.value; this.hoSaved(); this.hoRender(); Utils.toast(`v${h.n}: ${HO_STATUS[h.status]}`, '✓'); });
    act('changes', (e) => { this.ho.changes = e.target.checked; this.hoMarks(); });
    act('zip', () => this.hoZip(this.hoFind(this.ho.open)));
    act('del', () => { const h = this.hoFind(this.ho.open); this.dialog({ title: `Delete v${h.n}?`, body: `<p>“${Utils.escapeHtml(h.title)}” will be removed from Handover. Your design isn't affected. This can't be undone, so download the package first if you need it.</p>`, actions: [{ label: 'Cancel' }, { label: 'Delete', danger: true, primary: true, run: () => { this.model.handovers = this.model.handovers.filter(x => x !== h); this._hoModels?.delete(h.id); this.ho.open = null; this.hoSaved(); this.hoEnter(); } }] }); });
    const fr = ws.querySelector('.ho-frame'); if (!fr) return;
    const hl = fr.querySelector('.ho-hl');
    fr.addEventListener('mousemove', (e) => { const el = this.hoHit(e); if (el?.id === this.ho.hover) return; this.ho.hover = el?.id || null; if (el) { this.hoPlace(hl, el); hl.dataset.label = el.name; } else hl.hidden = true; this.hoRedlines(el); });
    fr.addEventListener('mouseleave', () => { hl.hidden = true; this.ho.hover = null; this.hoRedlines(null); });
    fr.addEventListener('click', (e) => { const el = this.hoHit(e); this.ho.sel = el?.id || null; this.hoDrawSel(); this.hoInspector(); this.hoRedlines(null); });
    if (!this._hoKey) { this._hoKey = true; window.addEventListener('keydown', (e) => { if (this.section === 'handover' && e.key === 'Escape' && this.ho.sel && !document.querySelector('.ds-dialog-overlay')) { this.ho.sel = null; this.hoDrawSel(); this.hoInspector(); } }); }
  },
  hoToDesign() {
    const h = this.hoFind(this.ho.open); this.setSection('design');
    if (!h) return;
    const M = this.model, ids = h.screens.map(s => s.id).filter(id => M.getElementById(id));
    if (!ids.length) { Utils.toast('These screens are no longer in the design (they were deleted or are on another page)', 'ℹ️'); return; }
    M.select(ids); this.selectionChanged(); this.zoomToBounds?.(this.renderer.boundsOf(ids.map(id => M.getElementById(id))));
    this.requestRender();
  },

  // ------------------------------------------------------------------ inspector
  hoInspector() {
    const box = document.querySelector('.ho-insp'); if (!box || !this._hoCtx) return;
    const E = Utils.escapeHtml, { h, hm, sc } = this._hoCtx, el = this.ho.sel && hm.getElementById(this.ho.sel);
    const copyBtn = (v, label = 'Copy') => `<button type="button" class="ho-copy" data-copy="${E(v)}" aria-label="${E(label)}">⧉</button>`;
    let html;
    if (!el) {
      const els = this.hoScreenEls(), colors = new Map(), fonts = new Map();
      for (const e of els) {
        for (const f of (e.fills || []).filter(f => f.visible !== false && f.type === 'solid')) { const k = Utils.toHex(f.color).toUpperCase(); colors.set(k, (colors.get(k) || 0) + 1); }
        if (e.type === 'text') { const k = `${String(e.fontFamily).split(',')[0].replace(/["']/g, '')} · ${e.fontWeight} · ${e.fontSize}px${e.lineHeight ? `/${e.lineHeight}px` : ''}`; fonts.set(k, (fonts.get(k) || 0) + 1); }
      }
      const imgs = els.filter(e => e.type === 'image').length;
      html = `<div class="ho-ih"><b>${E(sc.name)}</b><small>${sc.w} × ${sc.h} px · ${els.length} layers</small></div>
        <section class="ho-sec"><h4>Colours</h4><ul class="ho-colors">${[...colors].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([c, n]) => `<li><span class="ho-sw" style="background:${c}"></span><code>${c}</code><small>×${n}</small>${copyBtn(c, `Copy ${c}`)}</li>`).join('') || '<li class="ho-none">No solid colours</li>'}</ul></section>
        <section class="ho-sec"><h4>Typography</h4><ul class="ho-fonts">${[...fonts].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([f, n]) => `<li><code>${E(f)}</code><small>×${n}</small></li>`).join('') || '<li class="ho-none">No text</li>'}</ul></section>
        <section class="ho-sec"><h4>Screen</h4><div class="ho-btnrow"><button type="button" class="menu-btn" data-hx="png">Download PNG</button><button type="button" class="menu-btn" data-hx="html">HTML + CSS</button><button type="button" class="menu-btn" data-hx="react">React</button><button type="button" class="menu-btn" data-hx="tokens">Tokens JSON</button></div>
        <p class="st-note">${imgs} image${imgs === 1 ? '' : 's'} on this screen. Click any layer on the left for its specs.</p></section>`;
    } else {
      const ins = Exporters.inspect(hm, el), a = Utils.aabb(el), sb = Utils.aabb(hm.getElementById(sc.id)), par = hm.parentOf(el), pb = par ? Utils.aabb(par) : null;
      const r = (v) => Math.round(v * 100) / 100;
      const sp = (b) => `L ${r(a.x - b.x)} · T ${r(a.y - b.y)} · R ${r(b.x + b.w - a.x - a.w)} · B ${r(b.y + b.h - a.y - a.h)}`;
      const fills = (el.fills || []).filter(f => f.visible !== false);
      const tab = this.ho.tab, code = { css: ins.css, react: ins.react, swiftui: ins.swift, compose: ins.kotlin, flutter: ins.flutter }[this.ho.code] || ins.css;
      html = `<div class="ho-ih"><b>${E(el.name)}</b><small>${E(el.type)} · ${r(el.width)} × ${r(el.height)} px</small><button type="button" class="ho-x" data-hx="clear" aria-label="Back to the screen overview">✕</button></div>
        <div class="ho-tabs" role="tablist">${[['specs', 'Specs'], ['code', 'Code'], ['assets', 'Assets']].map(([k, t]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>`;
      if (tab === 'specs') {
        html += `<table class="ho-table">${ins.table.map(([k, v]) => `<tr><th>${E(k)}</th><td>${E(String(v))}</td></tr>`).join('')}
          <tr><th>In screen</th><td>${sp(sb)}</td></tr>${pb && par.id !== sc.id ? `<tr><th>In ${E(par.name)}</th><td>${sp(pb)}</td></tr>` : ''}</table>
          ${fills.length ? `<section class="ho-sec"><h4>Fills</h4><ul class="ho-colors">${fills.map(f => { const c = f.type === 'solid' ? Utils.toHex(f.color).toUpperCase() : Exporters.cssColorOf(f); return `<li><span class="ho-sw" style="background:${E(Exporters.cssColorOf(f))}"></span><code>${E(c)}</code>${copyBtn(c)}</li>`; }).join('')}</ul></section>` : ''}
          ${el.type === 'text' ? `<section class="ho-sec"><h4>Text</h4><p class="ho-text">${E(el.text || '')}</p>${copyBtn(el.text || '', 'Copy text')}</section>` : ''}`;
      } else if (tab === 'code') {
        html += `<div class="ho-codebar"><select data-hx="lang" aria-label="Code language">${[['css', 'CSS'], ['react', 'React'], ['swiftui', 'SwiftUI'], ['compose', 'Jetpack Compose'], ['flutter', 'Flutter']].map(([k, t]) => `<option value="${k}"${this.ho.code === k ? ' selected' : ''}>${t}</option>`).join('')}</select>${copyBtn(code, 'Copy code')}</div><pre class="ho-code"><code>${E(code)}</code></pre>`;
      } else {
        html += `<section class="ho-sec"><p class="st-note">Export this layer as it was committed.</p><div class="ho-btnrow"><button type="button" class="menu-btn" data-hx="el-svg">SVG</button><button type="button" class="menu-btn" data-hx="el-png1">PNG 1×</button><button type="button" class="menu-btn" data-hx="el-png2">PNG 2×</button><button type="button" class="menu-btn" data-hx="el-png3">PNG 3×</button>${el.type === 'image' && hm.assets[el.assetId] ? '<button type="button" class="menu-btn" data-hx="el-orig">Original image</button>' : ''}</div></section>`;
      }
      html += `<section class="ho-sec"><h4>Note for developers</h4><textarea class="ho-note" rows="3" maxlength="2000" placeholder="e.g. Use the shared Button component; disabled state at 40% opacity.">${E(h.notes[el.id] || '')}</textarea></section>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => { navigator.clipboard?.writeText(b.dataset.copy).then(() => Utils.toast('Copied', '⧉'), () => Utils.toast('Copy failed: select the text instead', '⚠️')); }));
    box.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { this.ho.tab = b.dataset.tab; this.hoInspector(); }));
    box.querySelector('[data-hx="lang"]')?.addEventListener('change', (e) => { this.ho.code = e.target.value; this.hoInspector(); });
    box.querySelector('[data-hx="clear"]')?.addEventListener('click', () => { this.ho.sel = null; this.hoDrawSel(); this.hoInspector(); });
    const note = box.querySelector('.ho-note');
    note?.addEventListener('input', () => { if (note.value.trim()) h.notes[el.id] = note.value; else delete h.notes[el.id]; clearTimeout(this._hoNoteT); this._hoNoteT = setTimeout(() => this.hoSaved(), 600); });
    note?.addEventListener('keydown', (e) => e.stopPropagation());
    box.querySelectorAll('[data-hx]').forEach(b => { if (b.tagName === 'BUTTON' && b.dataset.hx !== 'clear') b.addEventListener('click', () => this.hoExport(b.dataset.hx, el)); });
  },
  hoName(s) { return Utils.safeFilename(String(s || 'layer')).replace(/\s+/g, '-').slice(0, 60) || 'layer'; },
  /** SVG of committed layers → PNG blob (the committed copy, not the live design). */
  async hoPng(hm, roots, scale = 1) {
    const svg = Exporters.svgDocument(hm, roots), b = Utils.unionBounds(roots.map(r => Utils.aabb(r)));
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not draw this layer')); i.src = url; });
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.min(8192, Math.round((img.naturalWidth || b.w) * scale))); c.height = Math.max(1, Math.min(8192, Math.round((img.naturalHeight || b.h) * scale)));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(res => c.toBlob(res, 'image/png'));
    } finally { URL.revokeObjectURL(url); }
  },
  async hoExport(kind, el) {
    const { h, hm, sc } = this._hoCtx, root = hm.getElementById(sc.id), base = `v${h.n}-${this.hoName(el ? el.name : sc.name)}`;
    try {
      if (kind === 'png') { const blob = await (await fetch(sc.thumb)).blob(); Utils.download(blob, `${base}.${blob.type.includes('webp') ? 'webp' : 'png'}`); }
      if (kind === 'html') Utils.download(Exporters.code(hm, [root], { type: 'full-webpage', framework: 'plain', cssMode: 'plain', title: sc.name }), `${base}.html`, 'text/html');
      if (kind === 'react') Utils.download(Exporters.code(hm, [root], { type: 'full-webpage', framework: 'react', cssMode: 'tailwind', title: sc.name }), `${base}.jsx`, 'text/plain');
      if (kind === 'tokens') Utils.download(Exporters.tokens(hm), `v${h.n}-tokens.json`, 'application/json');
      if (kind === 'el-svg') Utils.download(Exporters.svgDocument(hm, [el]), `${base}.svg`, 'image/svg+xml');
      if (/^el-png\d$/.test(kind)) { const s = +kind.slice(-1); Utils.download(await this.hoPng(hm, [el], s), `${base}${s > 1 ? `@${s}x` : ''}.png`); }
      if (kind === 'el-orig') { const blob = await (await fetch(hm.assets[el.assetId])).blob(); Utils.download(blob, `${base}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`); }
    } catch (e) { Utils.toast(`Export failed: ${e.message}`, '⚠️'); }
  },
  /** The developer package: README, spec.json, tokens, screens, code, assets. */
  async hoZip(h) {
    if (!h) return;
    if (!window.MediaLibs?.zipSync) { Utils.toast('Zip support is not available in this build', '⚠️'); return; }
    Utils.toast('Preparing the handover package…', '📦');
    const hm = this.hoModel(h), enc = (s) => new TextEncoder().encode(s), files = {}, r = (v) => Math.round(v * 100) / 100;
    const bin = async (dataUrl) => new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());
    const spec = { format: 'designstudio-handover', version: h.n, title: h.title, status: HO_STATUS[h.status], message: h.message, committedAt: h.createdAt, page: h.page, app: `DesignStudio ${APP_VERSION}`, screens: [] };
    const used = new Set();
    for (const sc of h.screens) {
      const root = hm.getElementById(sc.id); if (!root) continue;
      const sb = Utils.aabb(root), name = this.hoName(sc.name); let u = name, i = 2; while (used.has(u)) u = `${name}-${i++}`; used.add(u);
      const layer = (el) => { const a = Utils.aabb(el), o = { id: el.id, name: el.name, type: el.type, x: r(a.x - sb.x), y: r(a.y - sb.y), width: r(el.width), height: r(el.height) };
        const f = (el.fills || []).filter(x => x.visible !== false).map(x => Exporters.cssColorOf(x)); if (f.length) o.fills = f;
        if (el.cornerRadius) o.radius = el.cornerRadius; if (el.opacity < 1) o.opacity = el.opacity;
        if (el.type === 'text') Object.assign(o, { text: el.text, font: String(el.fontFamily).split(',')[0].replace(/["']/g, ''), fontSize: el.fontSize, fontWeight: el.fontWeight, lineHeight: el.lineHeight || null, align: el.textAlign });
        if (h.notes[el.id]) o.note = h.notes[el.id];
        const kids = hm.elements.filter(c => c.parentId === el.id && c.visible !== false); if (kids.length) o.children = kids.map(layer); return o; };
      spec.screens.push({ name: sc.name, file: `screens/${u}.png`, width: sc.w, height: sc.h, layers: [layer(root)] });
      if (sc.thumb) files[`screens/${u}.${sc.thumb.startsWith('data:image/webp') ? 'webp' : 'png'}`] = await bin(sc.thumb);
      files[`code/${u}.html`] = enc(Exporters.code(hm, [root], { type: 'full-webpage', framework: 'plain', cssMode: 'plain', title: sc.name }));
      files[`code/${u}.jsx`] = enc(Exporters.code(hm, [root], { type: 'full-webpage', framework: 'react', cssMode: 'tailwind', title: sc.name }));
      for (const el of [root, ...hm.descendantsOf(root.id)]) if (el.type === 'image' && hm.assets[el.assetId]) { const d = hm.assets[el.assetId]; files[`assets/${this.hoName(el.name)}-${el.id.slice(-5)}.${(d.match(/^data:image\/(\w+)/)?.[1] || 'png').replace('jpeg', 'jpg')}`] = await bin(d); }
    }
    files['spec.json'] = enc(JSON.stringify(spec, null, 2));
    files['tokens.json'] = enc(Exporters.tokens(hm));
    const diff = this.hoDiff(h);
    files['README.md'] = enc(`# ${h.title} — handover v${h.n}\n\n${HO_STATUS[h.status]} · committed ${h.createdAt} · page “${h.page}”\n\n${h.message || ''}\n\n## Screens\n\n${h.screens.map(s => `- ${s.name} (${s.w}×${s.h})`).join('\n')}\n\n${diff ? `## Changes since v${diff.prev.n}\n\n${diff.added.length} layers added, ${diff.changed.length} changed, ${diff.removed.length} removed.\n\n` : ''}## Files\n\n- \`spec.json\`: every layer with position (relative to its screen), size, colours, type and notes\n- \`tokens.json\`: design tokens\n- \`screens/\`: previews · \`code/\`: HTML + CSS and React (Tailwind) starting points · \`assets/\`: original images\n\nMade with DesignStudio ${APP_VERSION}.\n`);
    Utils.download(new Blob([MediaLibs.zipSync(files, { level: 6 })], { type: 'application/zip' }), `${this.hoName(h.title)}-handover-v${h.n}.zip`);
    window.DSDiag?.info('handover', `Packaged v${h.n}: ${Object.keys(files).length} files`);
  },
};
Object.assign(StudioApp.prototype, HandoverMixin);
