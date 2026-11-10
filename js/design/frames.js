/**
 * DesignStudio — Figma-style frame creation (v3.11.0).
 * Frame tool (F): the Design panel lists frame presets (Phone, Tablet, Desktop, Presentation, Watch, Paper,
 * Social media) with search — click one to add a frame of that size next to your work, or drag on the canvas
 * to draw any size (Shift = square, Alt = from centre, click = 100×100).
 * Selected frame: a size-preset menu, portrait / landscape switch and Resize to fit in the Design panel.
 */
'use strict';

const FRAME_PRESETS = [
  ['Phone', [
    ['iPhone 16 Pro Max', 440, 956], ['iPhone 16 Pro', 402, 874], ['iPhone 16', 393, 852], ['iPhone 16 Plus', 430, 932],
    ['iPhone 13 mini', 375, 812], ['iPhone SE', 375, 667], ['Android Compact', 412, 917], ['Android Medium', 700, 840],
    ['Google Pixel 9', 412, 923], ['Samsung Galaxy S24', 360, 780]
  ]],
  ['Tablet', [
    ['iPad mini 8.3', 744, 1133], ['iPad Air 11"', 820, 1180], ['iPad Pro 11"', 834, 1194], ['iPad Pro 12.9"', 1024, 1366],
    ['Surface Pro 8', 1440, 960], ['Android Expanded', 1280, 800]
  ]],
  ['Desktop', [
    ['MacBook Air', 1280, 832], ['MacBook Pro 14"', 1512, 982], ['MacBook Pro 16"', 1728, 1117], ['Desktop', 1440, 1024],
    ['Desktop HD', 1920, 1080], ['Wireframe', 1440, 1024], ['TV', 1280, 720]
  ]],
  ['Presentation', [['Slide 16:9', 1920, 1080], ['Slide 4:3', 1024, 768]]],
  ['Watch', [['Apple Watch 41mm', 176, 215], ['Apple Watch 45mm', 198, 242], ['Apple Watch Ultra 49mm', 205, 251], ['Wear OS small round', 192, 192]]],
  ['Paper', [['A4', 595, 842], ['A5', 420, 595], ['A6', 297, 420], ['Letter', 612, 792], ['Tabloid', 792, 1224]]],
  ['Social media', [
    ['Instagram post', 1080, 1080], ['Instagram portrait', 1080, 1350], ['Instagram story', 1080, 1920], ['X post', 1200, 675],
    ['X header', 1500, 500], ['Facebook post', 1200, 630], ['Facebook cover', 820, 312], ['LinkedIn post', 1200, 627],
    ['LinkedIn cover', 1584, 396], ['YouTube thumbnail', 1280, 720], ['Dribbble shot', 400, 300], ['Dribbble shot HD', 800, 600]
  ]]
];

const FramesMixin = {
  bindFrames() {
    const design = document.getElementById('panel-tab-design');
    // ---- presets (frame tool)
    const sec = document.createElement('div');
    sec.className = 'prop-section'; sec.id = 'sec-frame-presets';
    sec.innerHTML = `
      <div class="fp-head"><span class="fp-title">Frame</span><span class="muted-text fp-sub">Pick a size or drag on the canvas</span></div>
      <input type="search" class="fp-search" id="fp-search" placeholder="Search sizes…" aria-label="Search frame sizes" autocomplete="off" />
      <div class="fp-list" id="fp-list" role="list"></div>`;
    design.insertBefore(sec, design.firstChild);
    const list = sec.querySelector('#fp-list');
    this._fpOpen = new Set(['Phone', 'Tablet', 'Desktop']);
    sec.querySelector('#fp-search').addEventListener('input', () => this.renderFramePresets());
    list.addEventListener('click', (e) => {
      const head = e.target.closest('.fp-cat-head');
      if (head) { const c = head.dataset.cat; this._fpOpen.has(c) ? this._fpOpen.delete(c) : this._fpOpen.add(c); this.renderFramePresets(); return; }
      const row = e.target.closest('.fp-item');
      if (row) this.addPresetFrame(row.dataset.name, +row.dataset.w, +row.dataset.h);
    });
    list.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.fp-item, .fp-cat-head')) { e.preventDefault(); e.target.click(); } });
    this.renderFramePresets();

    // ---- selected frame: preset menu · orientation · resize to fit
    const transformSec = document.getElementById('inp-rotation').closest('.prop-section');
    const row = document.createElement('div');
    row.className = 'prop-row'; row.id = 'row-frame-preset';
    const opts = FRAME_PRESETS.map(([cat, items]) => `<optgroup label="${cat}">${items.map(([n, w, h]) => `<option value="${w}x${h}|${Utils.escapeHtml(n)}">${n} · ${w}×${h}</option>`).join('')}</optgroup>`).join('');
    row.innerHTML = `
      <select id="sel-frame-preset" class="fp-select" aria-label="Frame size preset"><option value="">Custom size</option>${opts}</select>
      <div class="prop-btn-group fp-orient" role="group" aria-label="Orientation">
        <button class="prop-icon-btn" data-orient="portrait" title="Portrait" aria-label="Portrait"><svg width="12" height="14" viewBox="0 0 12 14"><rect x="1.5" y="1" width="9" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
        <button class="prop-icon-btn" data-orient="landscape" title="Landscape" aria-label="Landscape"><svg width="14" height="12" viewBox="0 0 14 12"><rect x="1" y="1.5" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button>
      </div>
      <button class="prop-icon-btn fp-fit" id="btn-frame-fit" title="Resize to fit contents" aria-label="Resize to fit contents"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/><rect x="4.5" y="4.5" width="5" height="5" rx="1"/></svg></button>`;
    const anchor = document.getElementById('row-clip-content');
    anchor ? anchor.before(row) : transformSec.appendChild(row);
    row.querySelector('#sel-frame-preset').addEventListener('change', (e) => {
      const v = e.target.value; if (!v) return;
      const [size, name] = v.split('|'); const [w, h] = size.split('x').map(Number);
      this.resizeSelectedFrames(w, h, `Frame size: ${name}`);
    });
    row.querySelectorAll('[data-orient]').forEach(b => b.addEventListener('click', () => {
      const f = this.selectedFrames()[0]; if (!f) return;
      const want = b.dataset.orient, isPortrait = f.height >= f.width;
      if ((want === 'portrait') === isPortrait) return;
      this.resizeSelectedFrames(null, null, 'Swap orientation', true);
    }));
    row.querySelector('#btn-frame-fit').addEventListener('click', () => this.fitFramesToContent());

    // keep the frame row in sync with the selection
    const orig = this.updatePropertiesUI.bind(this);
    this.updatePropertiesUI = (...a) => { const r = orig(...a); this.syncFrameRow(); return r; };
    this.commands.fitFrame = { run: () => this.fitFramesToContent(), enabled: () => this.selectedFrames().length > 0 };
  },

  onToolChanged(tool) {
    const design = document.getElementById('panel-tab-design');
    if (!design) return;
    const on = tool === 'frame';
    design.classList.toggle('frame-tool', on);
    if (on && this.activeRightTab !== 'design') document.querySelector('#right-panel .panel-tab-btn[data-tab="design"]')?.click();
    if (on) { const s = document.getElementById('fp-search'); if (s && s.value) { s.value = ''; this.renderFramePresets(); } }
  },

  renderFramePresets() {
    const list = document.getElementById('fp-list');
    if (!list) return;
    const q = (document.getElementById('fp-search')?.value || '').trim().toLowerCase();
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let html = '';
    for (const [cat, items] of FRAME_PRESETS) {
      const shown = q ? items.filter(([n, w, h]) => `${cat} ${n} ${w}x${h} ${w}×${h}`.toLowerCase().includes(q)) : items;
      if (!shown.length) continue;
      const open = q || this._fpOpen.has(cat);
      html += `<div class="fp-cat${open ? ' open' : ''}">
        <div class="fp-cat-head" data-cat="${esc(cat)}" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}"><span class="fp-caret" aria-hidden="true">▸</span>${esc(cat)}</div>
        ${open ? shown.map(([n, w, h]) => `<div class="fp-item" role="listitem button" tabindex="0" data-name="${esc(n)}" data-w="${w}" data-h="${h}" title="Add a ${w}×${h} frame"><span class="fp-name">${esc(n)}</span><span class="fp-size">${w}×${h}</span></div>`).join('') : ''}
      </div>`;
    }
    list.innerHTML = html || '<div class="muted-text fp-empty">No sizes match — drag on the canvas for a custom frame.</div>';
  },

  /** Add a preset frame to the right of the current work (or of the selected frame), select it and bring it into view. */
  addPresetFrame(name, w, h) {
    const m = this.model;
    let x = 0, y = 0;
    const sel = m.topSelected()[0];
    const ref = sel ? (this.rootOf ? this.rootOf(sel) : sel) : null;
    if (ref && !ref.parentId) { x = Math.round(ref.x + ref.width + 80); y = Math.round(ref.y); }
    else if (m.roots().length) { const s = this.freeSpot(); x = Math.round(s.x); y = Math.round(s.y); }
    const f = new StudioElement('frame', x, y, w, h);
    f.name = name;
    if (f.fills?.[0]) f.fills[0].color = '#ffffff';
    m.insertElement(f, null);
    m.select([f.id]);
    this._actionLabel = `Add frame: ${name}`;
    this.setTool('select');
    this.commit();
    this.zoomSelection?.();
    Utils.toast(`Added “${name}” · ${w}×${h}`, '▢');
  },

  selectedFrames() { return this.model.topSelected().filter(e => e.type === 'frame' && !e.isComponentSet); },

  resizeSelectedFrames(w, h, label, swap = false) {
    const frames = this.selectedFrames();
    if (!frames.length) return;
    const m = this.model;
    const keep = m.selectedIds;
    for (const f of frames) {
      const nw = swap ? f.height : w, nh = swap ? f.width : h;
      const cp = f.constrainProportions; f.constrainProportions = false;
      m.selectedIds = new Set([f.id]);
      this.applyTransformInput('w', nw); this.applyTransformInput('h', nh); // same path as typing W / H (constraints, auto layout)
      f.constrainProportions = cp;
    }
    m.selectedIds = keep;
    this._actionLabel = label;
    this.commit();
  },

  /** Resize to fit: frame bounds hug its visible children (children stay where they are). */
  fitFramesToContent() {
    const m = this.model;
    const frames = this.selectedFrames();
    let done = 0;
    for (const f of frames) {
      const kids = m.childrenOf(f.id).filter(k => k.visible);
      if (!kids.length) continue;
      if (f.isAutoLayout) { f.primarySizing = 'hug'; f.counterSizing = 'hug'; done++; continue; }
      const b = Utils.unionBounds(kids.map(k => Utils.aabb(k)));
      if (!b || f.rotation) continue;
      Object.assign(f, { x: Math.round(b.x), y: Math.round(b.y), width: Math.max(1, Math.round(b.w)), height: Math.max(1, Math.round(b.h)) });
      done++;
    }
    if (!done) { Utils.toast(frames.length ? 'Nothing to fit — the frame is empty' : 'Select a frame first', 'ℹ️'); return; }
    m.computeAutoLayout?.();
    this._actionLabel = 'Resize to fit';
    this.commit();
  },

  syncFrameRow() {
    const frames = this.selectedFrames();
    const row = document.getElementById('row-frame-preset');
    if (!row) return;
    const one = frames.length === 1 && this.model.topSelected().length === 1 ? frames[0] : null;
    row.style.display = one ? '' : 'none';
    if (!one) return;
    const sel = row.querySelector('#sel-frame-preset');
    const key = `${Math.round(one.width)}x${Math.round(one.height)}`;
    const match = [...sel.options].find(o => o.value.startsWith(`${key}|`) && o.value.split('|')[1] === one.name) || [...sel.options].find(o => o.value.startsWith(`${key}|`));
    sel.value = match ? match.value : '';
    const portrait = one.height >= one.width;
    row.querySelector('[data-orient="portrait"]').classList.toggle('active', portrait);
    row.querySelector('[data-orient="landscape"]').classList.toggle('active', !portrait);
    row.querySelector('[data-orient="portrait"]').setAttribute('aria-pressed', String(portrait));
    row.querySelector('[data-orient="landscape"]').setAttribute('aria-pressed', String(!portrait));
  }
};
Object.assign(StudioApp.prototype, FramesMixin);
