/**
 * DesignStudio — v3.4.0 "Polish": fixes from the UX & workflow review (UX-01 … UX-15).
 * Loaded last. Cross-section behaviour lives here: feedback (toasts, undo labels), keyboard access,
 * one Export entry point, section-aware status bar, inspector ergonomics, keyframe diamonds,
 * and local-first collaboration (comment pins, named versions, share package).
 */
'use strict';

/** Undo labels for menu / shortcut commands (UX-03). */
const ACTION_LABELS = {
  cut: 'Cut', paste: 'Paste', duplicate: 'Duplicate', delete: 'Delete', group: 'Group', ungroup: 'Ungroup', frame: 'Frame selection',
  autoLayout: 'Auto layout', createComp: 'Create component', detachComp: 'Detach instance', front: 'Bring to front', forward: 'Bring forward',
  backward: 'Send backward', back: 'Send to back', flipH: 'Flip horizontal', flipV: 'Flip vertical', toggleLock: 'Lock / unlock', toggleVis: 'Show / hide', reset: 'Clear page'
};
const VERSIONS_KEY = 'designstudio.versions';
const AUTHOR_KEY = 'designstudio.author';
const WHATS_NEW_340 = [
  ['Media work is saved', 'Your Media session is kept in this browser and offered back after a reload.'],
  ['Edit / Animate', 'The mode switch is now Edit / Animate, so “Design” only names the section.'],
  ['One Export button', 'Top-right in every section, opening that section’s formats (Ctrl+E everywhere).'],
  ['Comments, versions, share', 'Pin comments on the canvas (C), save named versions, and hand over a one-file share package.'],
  ['Keyframe diamonds', 'In Animate mode, ◆ next to X, Y, W, H, rotation, radius, opacity and fill keys a property in one click.'],
  ['Clearer undo', 'Each section undoes only its own work, and tells you what was undone.'],
  ['Smaller screens & keyboard', 'Works from 1024 px; menus and the welcome screen are fully keyboard-accessible; better contrast.']
];

const PolishMixin = {
  bindPolish() {
    this.patchToasts();
    this.patchSections();
    this.bindMenuKeyboard();
    this.bindWelcomeStart();
    this.labelIconButtons();
    this.bindExportRouting();
    this.bindCollapsibleSections();
    this.bindPropertyLabels();
    this.bindKeyDiamonds();
    this.bindExportPreviewCaption();
    this.bindComments();
    this.bindCollabCommands();
    document.getElementById('project-title')?.setAttribute('aria-label', 'Project name');
    [['btn-add-layout-grid', 'Add layout grid'], ['btn-add-fill', 'Add fill'], ['btn-add-stroke', 'Add stroke'], ['btn-add-effect', 'Add effect'], ['btn-zoom-level', 'Zoom level — click to fit'], ['btn-play-proto', 'Play prototype']]
      .forEach(([id, l]) => { const b = document.getElementById(id); if (b) { b.setAttribute('aria-label', l); if (!b.title) b.title = l; } });
    setInterval(() => this.updateSectionStatus(), 600);
    this.updateSectionStatus();
  },

  // ------------------------------------------------------------------ UX-05 feedback
  patchToasts() {
    const cont = document.getElementById('toast-container');
    cont.setAttribute('role', 'status');
    cont.setAttribute('aria-live', 'polite');
    /** Utils.toast(msg, icon, { duration, action: { label, run } }) — duration scales with length. */
    Utils.toast = (msg, icon = 'ℹ️', opts = {}) => {
      const t = document.createElement('div');
      t.className = 'toast';
      const i = document.createElement('span'); const ico = typeof Icons !== 'undefined' ? (Icons.fromEmoji(icon) || 'info') : null; if (ico) { i.innerHTML = Icons.svg(ico, 16); i.className = `toast-ico ti-${ico}`; } else i.textContent = icon; i.setAttribute('aria-hidden', 'true');
      const m = document.createElement('span'); m.textContent = msg; m.className = 'toast-msg';
      t.append(i, m);
      if (opts.action) {
        t.classList.add('has-action');
        const b = document.createElement('button'); b.className = 'toast-action'; b.textContent = opts.action.label;
        b.addEventListener('click', () => { dismiss(); opts.action.run(); });
        t.appendChild(b);
      }
      const words = String(msg).split(/\s+/).length;
      const ms = opts.duration || Utils.clamp(1600 + words * 260, 2400, 8000) + (opts.action ? 2000 : 0);
      let timer = null;
      const dismiss = () => { clearTimeout(timer); t.style.transition = 'opacity .2s ease, transform .2s ease'; t.style.opacity = '0'; t.style.transform = 'translateY(-4px)'; setTimeout(() => t.remove(), 220); };
      const arm = () => { timer = setTimeout(dismiss, ms); };
      t.addEventListener('mouseenter', () => clearTimeout(timer)); // hover keeps it readable
      t.addEventListener('mouseleave', arm);
      cont.appendChild(t);
      while (cont.children.length > 3) cont.firstChild.remove();
      arm();
      return dismiss;
    };
  },
  /** "Undid: Move" — short, names the section whose history moved (UX-03). */
  historyFeedback(kind, label, section) {
    Utils.toast(`${kind === 'Undo' ? 'Undid' : 'Redid'}: ${label || 'last change'} · ${section}`, kind === 'Undo' ? '↶' : '↷', { duration: 1600 });
  },
  patchSections() {
    const orig = StudioApp.prototype.setSection;
    this.setSection = (name) => {
      if (name !== this.section) document.getElementById('toast-container').replaceChildren(); // toasts belong to the section that raised them
      this.closeSectionExportMenus();
      if (this.commentMode) this.toggleCommentMode(false);
      orig.call(this, name);
      this.updateSectionStatus();
    };
  },

  // ------------------------------------------------------------------ UX-04 keyboard access
  bindMenuKeyboard() {
    document.querySelector('.menu-bar')?.setAttribute('role', 'menubar');
    ['file', 'edit', 'view', 'object'].forEach(name => {
      const btn = document.getElementById(`m-${name}`), drop = document.getElementById(`dropdown-${name}`);
      if (!btn || !drop) return;
      btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', drop.id);
      drop.setAttribute('role', 'menu'); drop.setAttribute('aria-label', btn.textContent.trim());
      drop.querySelectorAll('.dropdown-item').forEach(it => { it.setAttribute('role', 'menuitem'); it.tabIndex = -1; });
      drop.querySelectorAll('.dropdown-sep').forEach(sp => sp.setAttribute('role', 'separator'));
      const items = () => [...drop.querySelectorAll('.dropdown-item')].filter(i => i.offsetParent !== null);
      const open = () => { this.closeMenus(); this.updateMenuState(drop); drop.classList.add('open'); };
      const focusAt = (i) => { const l = items(); if (l.length) l[(i + l.length) % l.length].focus(); };
      new MutationObserver(() => {
        const isOpen = drop.classList.contains('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        drop.querySelectorAll('.dropdown-item').forEach(it => it.setAttribute('aria-disabled', String(it.classList.contains('disabled'))));
      }).observe(drop, { attributes: true, attributeFilter: ['class'], subtree: true });
      btn.addEventListener('keydown', (e) => {
        if (['ArrowDown', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); focusAt(0); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); open(); focusAt(-1); }
      });
      drop.addEventListener('keydown', (e) => {
        const l = items(), i = l.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
        else if (e.key === 'End') { e.preventDefault(); focusAt(-1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement?.click(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeMenus(); btn.focus(); }
        else if (e.key === 'Tab') this.closeMenus();
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const btns = [...document.querySelectorAll('.menu-bar .menu-btn')].filter(b => b.offsetParent !== null);
          const nb = btns[(btns.indexOf(btn) + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
          nb.click(); setTimeout(() => document.getElementById(nb.getAttribute('aria-controls'))?.querySelector('.dropdown-item')?.focus(), 0);
        }
      });
    });
    // Undo / Redo menu items name the step (UX-03)
    const origState = this.updateMenuState.bind(this);
    this.updateMenuState = (container) => {
      origState(container);
      const u = container.querySelector('[data-action="undo"]'), r = container.querySelector('[data-action="redo"]');
      const set = (el, verb, label) => { if (!el) return; const sc = el.querySelector('.dropdown-shortcut'); el.firstChild.nodeValue = `${verb}${label ? ` ${label}` : ''} `; if (sc && !el.contains(sc)) el.appendChild(sc); };
      set(u, 'Undo', this.model.undoLabel()); set(r, 'Redo', this.model.redoLabel());
    };
  },
  bindWelcomeStart() {
    const ws = document.getElementById('welcome-screen');
    ws.setAttribute('role', 'dialog'); ws.setAttribute('aria-label', 'Welcome to DesignStudio');
    ws.querySelectorAll('.welcome-card').forEach(c => {
      c.setAttribute('role', 'button'); c.tabIndex = 0;
      c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } });
      new MutationObserver(() => c.setAttribute('aria-disabled', String(c.classList.contains('disabled')))).observe(c, { attributes: true, attributeFilter: ['class'] });
    });
    ws.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => {
      const to = b.dataset.start;
      this.hideWelcome();
      if (to === 'animate') { this.setSection('design'); this.setUiMode('animate'); }
      else this.setSection(to);
    }));
    document.getElementById('btn-whats-new')?.addEventListener('click', () => this.showWhatsNew());
    ws.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.hideWelcome(); } });
    const origShow = this.showWelcome.bind(this);
    this.showWelcome = () => { origShow(); setTimeout(() => ws.querySelector('[data-start]')?.focus(), 30); };
  },
  showWhatsNew() {
    this.dialog({
      title: `What’s new in ${APP_VERSION}`,
      body: `<ul class="whats-new">${WHATS_NEW_340.map(([h, t]) => `<li><b>${Utils.escapeHtml(h)}</b><span>${Utils.escapeHtml(t)}</span></li>`).join('')}</ul><p class="muted-text">Full list with issue IDs: CHANGELOG.md (DS-3.4.0-NN).</p>`,
      actions: [{ label: 'Got it', primary: true }]
    });
  },
  /** UX-10: icon-only buttons get an accessible name from their tooltip (also for buttons rendered later). */
  labelIconButtons() {
    const fix = (root) => root?.querySelectorAll?.('button:not([aria-label])').forEach(b => {
      const txt = b.textContent.replace(/[^\p{L}\p{N}]+/gu, '');
      if (txt.length < 2 && b.title) b.setAttribute('aria-label', b.title.replace(/\s*\([^)]*\)\s*$/, ''));
    });
    fix(document);
    new MutationObserver(muts => { for (const mu of muts) mu.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === 'BUTTON') fix(n.parentNode); else fix(n); }); }).observe(document.body, { childList: true, subtree: true });
  },

  // ------------------------------------------------------------------ UX-06 one Export entry point
  bindExportRouting() {
    const orig = () => StudioApp.prototype.openExportModal.call(this); // late-bound: the scope default below patches the prototype
    this.openExportModal = () => {
      if (this.section === 'media') return this.toggleSectionExportMenu('media');
      if (this.section === '3d') return this.toggleSectionExportMenu('3d');
      return orig();
    };
    // the top-bar button routes through the command, in every section
    const btn = document.getElementById('btn-export-modal');
    btn.title = 'Export (Ctrl+E)';
    btn.addEventListener('click', (e) => { if (this.section !== 'design') { e.stopImmediatePropagation(); e.stopPropagation(); this.openExportModal(); } }, true);
    // media export menu (same pattern as 3D)
    const menu = document.createElement('div');
    menu.id = 'md-export-menu'; menu.className = 's3-menu section-export-menu'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Media export');
    const tools = MEDIA_TOOLS.find(g => g.group === 'Convert & export').tools.concat(MEDIA_TOOLS.find(g => g.group === 'Optimize').tools);
    menu.innerHTML = tools.map(t => `<button role="menuitem" data-mx="${t.id}"><span class="md-ico" aria-hidden="true">${t.icon}</span>${t.name}</button>`).join('');
    document.body.appendChild(menu);
    menu.querySelectorAll('[data-mx]').forEach(b => b.addEventListener('click', () => {
      this.closeSectionExportMenus();
      if (!this.mediaHasClip?.()) { Utils.toast('Open or create media first — then choose a format here', 'ℹ️'); this.mediaSelectTool?.('open'); return; }
      this.mediaSelectTool(b.dataset.mx);
      document.querySelector(`#media-workspace .md-tool[data-tool="${b.dataset.mx}"]`)?.scrollIntoView({ block: 'nearest' });
      document.getElementById('md-run')?.focus();
    }));
    const s3m = () => document.getElementById('s3-export-menu');
    document.addEventListener('click', (e) => { if (!e.target.closest('.section-export-menu, #s3-export-menu, #btn-export-modal')) this.closeSectionExportMenus(); });
    document.addEventListener('keydown', (e) => {
      const open = [menu, s3m()].find(mm => mm && !mm.hidden);
      if (open && e.key === 'Escape') { this.closeSectionExportMenus(); btn.focus(); }
      if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const l = [...open.querySelectorAll('button')], i = l.indexOf(document.activeElement);
        l[(i + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % l.length].focus();
      }
      // Ctrl+E works in every section
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && this.section !== 'design') { e.preventDefault(); this.openExportModal(); }
    });
  },
  toggleSectionExportMenu(section) {
    if (section === '3d' && !this.s3?.ready) { Utils.toast('The 3D engine is still loading', 'ℹ️'); return; }
    const menu = document.getElementById(section === 'media' ? 'md-export-menu' : 's3-export-menu');
    const wasOpen = !menu.hidden;
    this.closeSectionExportMenus();
    if (wasOpen) return;
    const r = document.getElementById('btn-export-modal').getBoundingClientRect();
    menu.classList.add('section-export-menu');
    Object.assign(menu.style, { position: 'fixed', top: `${r.bottom + 6}px`, right: `${Math.max(8, innerWidth - r.right)}px`, left: 'auto' });
    menu.hidden = false;
    menu.querySelector('button')?.focus();
  },
  closeSectionExportMenus() { document.querySelectorAll('#md-export-menu, #s3-export-menu').forEach(mm => { mm.hidden = true; }); },

  // ------------------------------------------------------------------ UX-11 section-aware status bar
  updateSectionStatus() {
    const el = document.getElementById('sb-section');
    if (!el) return;
    let txt = '';
    if (this.section === 'media' && this.media) {
      const m = this.media;
      txt = m.frames.length ? `${m.name} · ${m.width}×${m.height} · ${m.frames.length} frame${m.frames.length > 1 ? 's' : ''} · ${(Media.duration(m.frames) / 1000).toFixed(2)} s${m.srcSize ? ` · source ${Media.fmtBytes(m.srcSize)}` : ''}` : 'No media loaded — drop a GIF, video or images';
    } else if (this.section === '3d') {
      const sc = this.model.scene3d, d = this.s3?.sel && this.def3?.(this.s3.sel);
      txt = !this.s3?.ready ? 'Loading 3D engine…' : `${sc?.objects.length || 0} objects · ${d ? `Selected: ${d.name}` : 'Nothing selected'} · ${this.model.activeAnimation.name} @ ${(this.s3.time || 0).toFixed(2)} s${this.s3.preview ? ' · PREVIEW' : ''}`;
    }
    if (el.textContent !== txt) el.textContent = txt;
  },

  // ------------------------------------------------------------------ UX-12 inspector ergonomics
  bindCollapsibleSections() {
    let state = {};
    try { state = JSON.parse(localStorage.getItem('designstudio.collapsed') || '{}'); } catch (e) { /* private mode */ }
    document.querySelectorAll('#right-panel .prop-section-header').forEach(h => {
      const key = h.firstElementChild?.textContent.trim() || h.textContent.trim();
      const sec = h.parentElement;
      h.classList.add('collapsible');
      const tgl = document.createElement('button');
      tgl.type = 'button'; tgl.className = 'sec-toggle'; tgl.setAttribute('aria-label', `Collapse ${key}`); tgl.textContent = '▾';
      h.insertBefore(tgl, h.firstChild);
      const apply = (c) => { sec.classList.toggle('collapsed', c); tgl.setAttribute('aria-expanded', String(!c)); tgl.setAttribute('aria-label', `${c ? 'Expand' : 'Collapse'} ${key}`); };
      apply(!!state[key]);
      const toggle = () => { const c = !sec.classList.contains('collapsed'); apply(c); state[key] = c; try { localStorage.setItem('designstudio.collapsed', JSON.stringify(state)); } catch (e) { /* ignore */ } };
      tgl.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
      h.addEventListener('click', (e) => { if (e.target === h || e.target === h.querySelector('span')) toggle(); });
    });
  },
  /** Property edits name themselves after their inspector section ("Change Fill"), for undo (UX-03). */
  bindPropertyLabels() {
    const panel = document.getElementById('right-panel');
    const name = (e) => { const sec = e.target.closest('.prop-section'); const t = sec?.querySelector('.prop-section-header span:not(.sec-toggle)')?.textContent.trim(); this._actionLabel = t ? `Change ${t}` : 'Change property'; };
    panel.addEventListener('input', name, true);
    panel.addEventListener('change', name, true);
    panel.addEventListener('pointerdown', name, true);
  },

  // ------------------------------------------------------------------ UX-08 keyframe diamonds in Animate mode
  bindKeyDiamonds() {
    const map = [['x', 'inp-pos-x'], ['y', 'inp-pos-y'], ['width', 'inp-dim-w'], ['height', 'inp-dim-h'], ['rotation', 'inp-rotation'], ['cornerRadius', 'inp-corner-radius'], ['opacity', 'layer-opacity-val']];
    for (const [prop, id] of map) {
      const inp = document.getElementById(id);
      if (!inp) continue;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'kf-diamond'; b.dataset.prop = prop; b.textContent = '◆';
      b.setAttribute('aria-label', `Keyframe ${prop}`);
      inp.insertAdjacentElement('afterend', b);
      b.addEventListener('click', (e) => { e.preventDefault(); this.toggleKey(prop); });
    }
    const fillHead = [...document.querySelectorAll('#right-panel .prop-section-header')].find(h => /^\W*Fill/.test(h.textContent.trim().replace('▾', '')));
    if (fillHead) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'kf-diamond kf-head'; b.dataset.prop = 'fillColor'; b.textContent = '◆'; b.setAttribute('aria-label', 'Keyframe fill colour');
      fillHead.insertBefore(b, fillHead.children[2] || null);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.toggleKey('fillColor'); });
    }
    const origProps = this.updatePropertiesUI.bind(this), origTl = this.renderTimeline.bind(this);
    this.updatePropertiesUI = (...a) => { const r = origProps(...a); this.renderKeyDiamonds(); return r; };
    this.renderTimeline = (...a) => { const r = origTl(...a); this.renderKeyDiamonds(); return r; };
  },
  renderKeyDiamonds() {
    const m = this.model, tl = m.animationTimeline, sel = m.topSelected();
    const t = tl.currentTime;
    document.querySelectorAll('.kf-diamond').forEach(b => {
      const p = b.dataset.prop;
      const tracks = sel.map(el => tl.tracks[el.id]?.[p]).filter(Boolean);
      const keyed = tracks.some(k => k.some(kf => Math.abs(kf.time - t) < 0.001));
      b.classList.toggle('animated', tracks.length > 0);
      b.classList.toggle('keyed', keyed);
      b.title = !sel.length ? '' : keyed ? `Remove ${p} key at ${t.toFixed(2)} s` : `Add ${p} key at ${t.toFixed(2)} s`;
    });
  },
  toggleKey(prop) {
    const m = this.model, tl = m.animationTimeline, sel = m.topSelected();
    if (!sel.length) { Utils.toast('Select a layer to keyframe it', 'ℹ️'); return; }
    const t = Math.round(tl.currentTime * 1000) / 1000;
    const keyed = sel.some(el => tl.tracks[el.id]?.[prop]?.some(k => Math.abs(k.time - t) < 0.001));
    for (const el of sel) {
      if (keyed) {
        const list = tl.tracks[el.id]?.[prop];
        if (!list) continue;
        tl.tracks[el.id][prop] = list.filter(k => Math.abs(k.time - t) >= 0.001);
        if (!tl.tracks[el.id][prop].length) m.removeTrack(el.id, prop);
      } else m.setKeyframe(el.id, prop, t, m.getAnimValue(el, prop));
    }
    this._actionLabel = `${keyed ? 'Remove' : 'Add'} ${prop} key`;
    m.captureBaseline(m.allElements());
    this.commit();
  },

  // ------------------------------------------------------------------ UX-13 export preview context
  bindExportPreviewCaption() {
    const img = document.getElementById('exp-image-preview-thumb');
    if (!img) return;
    const cap = document.createElement('div');
    cap.id = 'exp-thumb-caption'; cap.className = 'exp-thumb-caption';
    img.parentElement.insertAdjacentElement('afterend', cap);
    img.parentElement.classList.add('checker-bg');
    const origThumb = this.updateExportThumbPreview.bind(this);
    this.updateExportThumbPreview = () => {
      origThumb();
      const roots = this.exportScopeRoots();
      if (!roots.length) { cap.textContent = 'Nothing in this scope'; return; }
      const b = this.renderer.boundsOf(roots);
      cap.textContent = `${roots.length === 1 ? roots[0].name : `${roots.length} layers`} · ${Math.round(b.w)} × ${Math.round(b.h)} px at 1x`;
    };
    // default scope: the frame you're working in (selection only when it is part of a frame)
    const origOpen = StudioApp.prototype.openExportModal;
    const m = this.model;
    StudioApp.prototype.openExportModal = function () {
      origOpen.call(this);
      const scope = document.getElementById('exp-img-scope'), fc = document.getElementById('exp-img-frame-choice');
      const sel = m.topSelected(), frames = m.roots().filter(f => f.type === 'frame' && f.visible);
      if (!frames.length) return;
      const rootOfSel = sel[0] && this.rootOf(sel[0]);
      const selIsWholeFrame = sel.length === 1 && sel[0].type === 'frame' && !sel[0].parentId;
      if (!sel.length || selIsWholeFrame) { scope.value = 'frame'; fc.value = (rootOfSel?.type === 'frame' ? rootOfSel : frames[0]).id; }
      this.syncExportControls();
      if (this.exportTab === 'image') this.updateExportThumbPreview();
    };
  },

  // ------------------------------------------------------------------ UX-14 comments (local-first review)
  author() {
    let a = '';
    try { a = localStorage.getItem(AUTHOR_KEY) || ''; } catch (e) { /* ignore */ }
    return a;
  },
  setAuthor(a) { try { localStorage.setItem(AUTHOR_KEY, a); } catch (e) { /* ignore */ } },
  bindComments() {
    const tb = document.querySelector('.top-bar-right');
    const btn = document.createElement('button');
    btn.id = 'btn-comments'; btn.className = 'menu-btn'; btn.type = 'button'; btn.title = 'Comments (C)';
    btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16v12H7l-3 3V4z"/></svg><span class="cm-count"></span>';
    btn.setAttribute('aria-label', 'Comments');
    tb.insertBefore(btn, document.getElementById('btn-play-proto'));
    btn.addEventListener('click', () => this.toggleCommentMode());
    const layer = document.createElement('div');
    layer.id = 'comment-layer'; layer.hidden = true;
    document.getElementById('canvas-wrap').appendChild(layer);
    const drawer = document.createElement('aside');
    drawer.id = 'comment-drawer'; drawer.hidden = true; drawer.setAttribute('aria-label', 'Comments');
    document.getElementById('center-viewport').appendChild(drawer);
    layer.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.target !== layer) return;
      const r = layer.getBoundingClientRect();
      this.openComposer(e.clientX - r.left, e.clientY - r.top);
    });
    ['pointermove', 'pointerup', 'dblclick', 'contextmenu'].forEach(ev => layer.addEventListener(ev, (e) => e.stopPropagation()));
    document.addEventListener('keydown', (e) => {
      const a = document.activeElement;
      if (this.section !== 'design' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) { if (e.key === 'Escape' && a.closest('#comment-layer, #comment-drawer')) { this.closeCommentPopover(); a.blur(); } return; }
      if (e.key.toLowerCase() === 'c' && !e.shiftKey) { e.preventDefault(); this.toggleCommentMode(); }
      else if (e.key === 'Escape' && this.commentMode) { e.stopImmediatePropagation(); if (document.querySelector('.cm-pop')) this.closeCommentPopover(); else this.toggleCommentMode(false); }
    }, true);
    let last = '';
    const loop = () => { // keep pins glued to the canvas while panning / zooming
      if (this.commentMode) { const m = this.model, k = `${m.zoom}|${m.panX}|${m.panY}|${m.currentPageId}`; if (k !== last) { last = k; this.positionPins(); } }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.updateCommentCount();
  },
  pageComments() { return (this.model.comments || []).filter(c => c.pageId === this.model.currentPageId); },
  updateCommentCount() {
    const open = (this.model.comments || []).filter(c => !c.resolved).length;
    const el = document.querySelector('#btn-comments .cm-count');
    if (el) el.textContent = open ? String(open) : '';
    document.getElementById('btn-comments')?.setAttribute('aria-label', `Comments${open ? ` (${open} open)` : ''}`);
  },
  toggleCommentMode(on = !this.commentMode) {
    if (on && this.section !== 'design') return;
    this.commentMode = on;
    document.getElementById('btn-comments').classList.toggle('active', on);
    document.getElementById('comment-layer').hidden = !on;
    document.getElementById('comment-drawer').hidden = !on;
    document.body.classList.toggle('commenting', on);
    if (on) {
      if (!this.author()) Utils.toast('Comment mode: click anywhere on the canvas to leave a comment. Esc to exit.', '💬');
      this.renderComments();
    } else this.closeCommentPopover();
  },
  /** Pins anchor to the top-level frame they were dropped on, so they follow it when it moves. */
  commentWorldPos(c) {
    const el = c.elementId && this.model.getElementById(c.elementId);
    return el ? { x: el.x + c.dx, y: el.y + c.dy } : { x: c.x, y: c.y };
  },
  positionPins() {
    const layer = document.getElementById('comment-layer');
    layer.querySelectorAll('.cm-pin').forEach(pin => {
      const c = this.model.comments.find(x => x.id === pin.dataset.id);
      if (!c) return;
      const w = this.commentWorldPos(c), s = this.renderer.worldToScreen(w.x, w.y);
      pin.style.transform = `translate(${s.x}px, ${s.y}px)`;
    });
    const pop = layer.querySelector('.cm-pop');
    if (pop?.dataset.id) { const c = this.model.comments.find(x => x.id === pop.dataset.id); if (c) { const w = this.commentWorldPos(c), s = this.renderer.worldToScreen(w.x, w.y); this.placePop(pop, s.x, s.y); } }
  },
  /** Keep a popover beside its pin but inside the free canvas area (never under the comments drawer). */
  placePop(pop, sx, sy) {
    const layer = document.getElementById('comment-layer'), drawer = document.getElementById('comment-drawer');
    const free = layer.clientWidth - (drawer.hidden ? 0 : drawer.offsetWidth + 16);
    const w = pop.offsetWidth || 260, h = pop.offsetHeight || 140;
    let x = sx + 18;
    if (x + w > free) x = sx - 18 - w;
    x = Utils.clamp(x, 8, Math.max(8, free - w));
    const y = Utils.clamp(sy - 8, 8, Math.max(8, layer.clientHeight - h - 8));
    pop.style.transform = `translate(${x}px, ${y}px)`;
  },
  renderComments() {
    const layer = document.getElementById('comment-layer'), drawer = document.getElementById('comment-drawer');
    const list = this.pageComments();
    layer.querySelectorAll('.cm-pin').forEach(p => p.remove());
    list.forEach((c, i) => {
      if (c.resolved && !this.showResolved) return;
      const pin = document.createElement('button');
      pin.type = 'button'; pin.className = `cm-pin${c.resolved ? ' resolved' : ''}`; pin.dataset.id = c.id; pin.textContent = String(i + 1);
      pin.setAttribute('aria-label', `Comment ${i + 1} by ${c.author}: ${c.text}`);
      pin.addEventListener('pointerdown', (e) => e.stopPropagation());
      pin.addEventListener('click', (e) => { e.stopPropagation(); this.openThread(c.id); });
      layer.appendChild(pin);
    });
    const open = list.filter(c => !c.resolved), done = list.filter(c => c.resolved);
    const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    drawer.innerHTML = `<div class="cm-head"><b>Comments</b><span>${open.length} open · ${done.length} resolved</span><button type="button" class="btn-ghost" id="cm-close" aria-label="Close comments">✕</button></div>
      <label class="cm-filter"><input type="checkbox" id="cm-show-resolved"${this.showResolved ? ' checked' : ''}> Show resolved</label>
      <div class="cm-list">${(this.showResolved ? list : open).map(c => `<button type="button" class="cm-item${c.resolved ? ' resolved' : ''}" data-id="${c.id}"><span class="cm-n">${list.indexOf(c) + 1}</span><span class="cm-body"><b>${Utils.escapeHtml(c.author)}</b> <small>${fmt(c.time)}</small><span>${Utils.escapeHtml(c.text)}</span>${c.replies.length ? `<small>${c.replies.length} repl${c.replies.length > 1 ? 'ies' : 'y'}</small>` : ''}</span></button>`).join('') || '<p class="muted-text">No comments on this page yet. Click the canvas to add one.</p>'}</div>
      <p class="cm-tip">Comments are saved in the project file, so they travel with it (and with the share package).</p>`;
    drawer.querySelector('#cm-close').addEventListener('click', () => this.toggleCommentMode(false));
    drawer.querySelector('#cm-show-resolved').addEventListener('change', (e) => { this.showResolved = e.target.checked; this.renderComments(); });
    drawer.querySelectorAll('.cm-item').forEach(it => it.addEventListener('click', () => this.openThread(it.dataset.id, true)));
    this.positionPins();
    this.updateCommentCount();
  },
  closeCommentPopover() { document.querySelectorAll('.cm-pop').forEach(p => p.remove()); },
  openComposer(sx, sy) {
    this.closeCommentPopover();
    const w = this.renderer.screenToWorld(sx, sy);
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
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      if (needName) this.setAuthor(pop.querySelector('.cm-name').value.trim() || 'Guest');
      const frame = this.frameAt(w);
      const top = frame ? this.rootOf(frame) : null;
      const c = { id: Utils.uid('cm'), pageId: this.model.currentPageId, x: w.x, y: w.y, author: this.author(), text, time: Date.now(), resolved: false, replies: [] };
      if (top) Object.assign(c, { elementId: top.id, dx: w.x - top.x, dy: w.y - top.y });
      this.model.comments.push(c);
      this.commentsChanged();
      pop.remove();
      Utils.toast('Comment added', '💬');
    };
    pop.querySelector('[data-c="post"]').addEventListener('click', post);
    pop.querySelector('[data-c="cancel"]').addEventListener('click', () => pop.remove());
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } });
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  },
  openThread(id, focusCanvas = false) {
    const c = this.model.comments.find(x => x.id === id);
    if (!c) return;
    this.closeCommentPopover();
    if (focusCanvas) { // bring the pin into view
      const w = this.commentWorldPos(c), s = this.renderer.worldToScreen(w.x, w.y), m = this.model;
      const wrap = document.getElementById('canvas-wrap');
      if (s.x < 40 || s.y < 40 || s.x > wrap.clientWidth - 320 || s.y > wrap.clientHeight - 120) { m.panX += wrap.clientWidth / 2 - s.x; m.panY += wrap.clientHeight / 2 - s.y; this.requestRender(); }
    }
    const layer = document.getElementById('comment-layer');
    const pop = document.createElement('div');
    pop.className = 'cm-pop thread'; pop.dataset.id = id; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Comment thread');
    const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const msg = (r) => `<div class="cm-msg"><b>${Utils.escapeHtml(r.author)}</b> <small>${fmt(r.time)}</small><p>${Utils.escapeHtml(r.text)}</p></div>`;
    pop.innerHTML = `<div class="cm-thread">${msg(c)}${c.replies.map(msg).join('')}</div>
      <textarea rows="2" placeholder="Reply…" aria-label="Reply" maxlength="2000"></textarea>
      <div class="md-actions"><button type="button" class="btn-ghost danger" data-c="del">Delete</button><button type="button" class="btn-ghost" data-c="resolve">${c.resolved ? 'Reopen' : 'Resolve'}</button><button type="button" class="btn-primary" data-c="reply">Reply</button></div>`;
    layer.appendChild(pop);
    this.positionPins();
    const ta = pop.querySelector('textarea');
    ta.focus();
    const reply = () => {
      const text = ta.value.trim(); if (!text) return;
      if (!this.author()) this.setAuthor('Guest');
      c.replies.push({ author: this.author(), text, time: Date.now() });
      this.commentsChanged(); this.openThread(id);
    };
    pop.querySelector('[data-c="reply"]').addEventListener('click', reply);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reply(); } });
    pop.querySelector('[data-c="resolve"]').addEventListener('click', () => { c.resolved = !c.resolved; this.commentsChanged(); this.closeCommentPopover(); });
    pop.querySelector('[data-c="del"]').addEventListener('click', () => {
      const idx = this.model.comments.indexOf(c);
      this.model.comments.splice(idx, 1); this.commentsChanged(); this.closeCommentPopover();
      Utils.toast('Comment deleted', '🗑', { action: { label: 'Undo', run: () => { this.model.comments.splice(idx, 0, c); this.commentsChanged(); } } });
    });
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  },
  commentsChanged() {
    this.unsaved = true; this.pristineDemo = false; this.scheduleAutosave();
    if (this.commentMode) this.renderComments(); else this.updateCommentCount();
  },

  // ------------------------------------------------------------------ UX-14 versions & share package
  bindCollabCommands() {
    Object.assign(this.commands, {
      saveVersion: { run: () => this.saveVersionDialog() },
      versionHistory: { run: () => this.versionHistoryDialog() },
      sharePackage: { run: () => this.exportSharePackage() }
    });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveVersionDialog(); }
    });
  },
  async versions() { const all = await Store.get(VERSIONS_KEY).catch(() => null); return Array.isArray(all) ? all : []; },
  saveVersionDialog() {
    const d = this.dialog({
      title: 'Save version',
      body: `<label class="dlg-field">Name<input type="text" id="ver-name" maxlength="80" value="${Utils.escapeHtml(`${this.title} – ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`)}"></label>
        <label class="dlg-field">What changed (optional)<textarea id="ver-note" rows="2" maxlength="500"></textarea></label>
        <p class="muted-text">Versions are kept in this browser (up to 30). Download one to share it.</p>`,
      actions: [{ label: 'Cancel' }, { label: 'Save version', primary: true, run: async () => {
        const name = d.el.querySelector('#ver-name').value.trim() || this.title;
        const note = d.el.querySelector('#ver-note').value.trim();
        this.finishTextEdit();
        const data = JSON.stringify(this.model.serialize(this.title));
        const all = await this.versions();
        all.unshift({ id: Utils.uid('ver'), name, note, author: this.author() || '', time: Date.now(), title: this.title, size: data.length, data, app: APP_VERSION });
        const ok = await Store.set(VERSIONS_KEY, all.slice(0, 30));
        Utils.toast(ok ? `Saved version “${name}”` : 'Could not save the version in this browser', ok ? '🔖' : '⚠️', ok ? { action: { label: 'History', run: () => this.versionHistoryDialog() } } : {});
      } }]
    });
    setTimeout(() => d.el.querySelector('#ver-name')?.select(), 20);
  },
  async versionHistoryDialog() {
    const all = await this.versions();
    const fmt = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    const d = this.dialog({
      title: 'Version history',
      wide: true,
      body: all.length ? `<div class="ver-list">${all.map(v => `<div class="ver-row" data-id="${v.id}"><div><b>${Utils.escapeHtml(v.name)}</b><small>${fmt(v.time)}${v.author ? ` · ${Utils.escapeHtml(v.author)}` : ''} · ${Media.fmtBytes(v.size)} · v${Utils.escapeHtml(v.app || '')}</small>${v.note ? `<span>${Utils.escapeHtml(v.note)}</span>` : ''}</div>
          <div class="ver-actions"><button type="button" class="btn-ghost" data-v="restore">Restore</button><button type="button" class="btn-ghost" data-v="download">Download</button><button type="button" class="btn-ghost danger" data-v="delete" aria-label="Delete version">✕</button></div></div>`).join('')}</div>`
        : '<p class="muted-text">No versions yet. Use File › Save Version… (Ctrl+Alt+S) at milestones — before a review, after feedback.</p>',
      actions: [{ label: 'Save current as version…', run: () => setTimeout(() => this.saveVersionDialog(), 0) }, { label: 'Close', primary: true }]
    });
    d.el.querySelectorAll('.ver-row').forEach(row => {
      const v = all.find(x => x.id === row.dataset.id);
      row.querySelector('[data-v="download"]').addEventListener('click', () => Utils.download(v.data, `${Utils.safeFilename(v.name)}.designstudio.json`, 'application/json'));
      row.querySelector('[data-v="delete"]').addEventListener('click', async () => { const rest = (await this.versions()).filter(x => x.id !== v.id); await Store.set(VERSIONS_KEY, rest); row.remove(); });
      row.querySelector('[data-v="restore"]').addEventListener('click', async () => {
        // keep the current state as a version first, so a restore is never destructive
        const cur = JSON.stringify(this.model.serialize(this.title));
        const list = await this.versions();
        list.unshift({ id: Utils.uid('ver'), name: `Before restoring “${v.name}”`, note: 'Automatic backup', author: this.author() || '', time: Date.now(), title: this.title, size: cur.length, data: cur, app: APP_VERSION });
        await Store.set(VERSIONS_KEY, list.slice(0, 30));
        d.close();
        this.loadProjectData(JSON.parse(v.data), v.name);
        Utils.toast(`Restored “${v.name}” — your previous state was saved as a version`, '🔖', { action: { label: 'History', run: () => this.versionHistoryDialog() } });
      });
    });
  },
  /** One zip a reviewer or developer can open without installing anything. */
  async exportSharePackage() {
    this.finishTextEdit();
    const m = this.model, name = Utils.safeFilename(this.title, 'design');
    const done = Utils.toast('Building share package…', '📦', { duration: 60000 });
    try {
      const enc = MediaLibs.strToU8;
      const files = {};
      files[`${name}.designstudio.json`] = enc(JSON.stringify(m.serialize(this.title)));
      const roots = m.roots().filter(e => e.visible);
      if (roots.length) {
        files[`${name}.interactive.html`] = enc(InteractiveExport.html(m, roots, { title: this.title, bg: m.page.bg }));
        const b = this.renderer.boundsOf(roots);
        const c = this.renderer.renderToCanvas({ roots, bounds: b, scale: Math.min(2, 1600 / Math.max(b.w, b.h, 1)), bg: m.page.bg });
        files['preview.png'] = new Uint8Array(await (await Media.toBlob(c, 'image/png')).arrayBuffer());
      }
      if (m.scene3d?.objects?.length) {
        try { await this.s3LoadLib(); files[`${name}.3d.html`] = enc(this.s3ViewerHTML(this.title)); } catch (e) { console.warn('3D viewer skipped', e); }
      }
      const fmt = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 16);
      const comments = (m.comments || []).map((c, i) => {
        const page = (c.sec === 'media' ? 'Media' : c.sec === '3d' ? '3D scene' : m.pages.find(p => p.id === c.pageId)?.name) || 'Page';
        return `### ${i + 1}. ${c.resolved ? '[resolved] ' : ''}${page}\n\n**${c.author}** · ${fmt(c.time)}\n\n${c.text}\n${c.replies.map(r => `\n> **${r.author}** · ${fmt(r.time)}: ${r.text}`).join('\n')}\n`;
      }).join('\n');
      files['comments.md'] = enc(`# Review comments — ${this.title}\n\n${comments || '_No comments._'}\n`);
      files['README.txt'] = enc([
        `${this.title} — share package (DesignStudio ${APP_VERSION}, ${new Date().toISOString().slice(0, 10)})`, '',
        `${name}.interactive.html   Open in any browser: the design with its animations, state machines and inputs (DesignStudioPlayer API).`,
        m.scene3d?.objects?.length ? `${name}.3d.html            Interactive 3D scene viewer.` : null,
        'preview.png                  Snapshot of the current page.',
        'comments.md                  Review comments and replies.',
        `${name}.designstudio.json  The editable project: open it in DesignStudio (File › Open). Comments are included.`
      ].filter(Boolean).join('\n'));
      const blob = new Blob([MediaLibs.zipSync(files, { level: 6 })], { type: 'application/zip' });
      Utils.download(blob, `${name}.share.zip`, 'application/zip');
      done();
      Utils.toast(`Share package ready (${Media.fmtBytes(blob.size)}): project, interactive HTML${files[`${name}.3d.html`] ? ', 3D viewer' : ''}, preview and comments`, '📦');
    } catch (e) { done(); console.error(e); Utils.toast(`Could not build the share package: ${e.message}`, '❌'); }
  },

  // ------------------------------------------------------------------ shared dialog
  /** Accessible modal: Esc closes, focus is trapped and returned. actions: [{label, primary, run}] */
  dialog({ title, body, actions = [], wide = false }) {
    const prev = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'ds-dialog-overlay';
    ov.innerHTML = `<div class="ds-dialog${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-h"><h3 id="dlg-h">${Utils.escapeHtml(title)}</h3><div class="dlg-body">${body}</div><div class="ds-dialog-actions">${actions.map((a, i) => `<button type="button" class="${a.primary ? 'btn-primary' : 'menu-btn'}" data-i="${i}">${Utils.escapeHtml(a.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); prev?.focus?.(); };
    ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const f = [...ov.querySelectorAll('button, input, textarea, select, [tabindex="0"]')].filter(x => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      }
      e.stopPropagation(); // keep app shortcuts out of the dialog
    });
    ov.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', async () => { const a = actions[+b.dataset.i]; close(); await a.run?.(); }));
    setTimeout(() => (ov.querySelector('input, textarea') || ov.querySelector('.btn-primary') || ov.querySelector('button'))?.focus(), 10);
    return { el: ov, close };
  }
};
Object.assign(StudioApp.prototype, PolishMixin);

/* v3.10.0 QC: accessible names for every field + valid ARIA structure (axe: label, select-name, aria-required-*). */
const A11yMixin = {
  bindA11y310() {
    const human = (s) => String(s || '').replace(/^(inp|tl|s3|sm|ds|ai)[-_]/, '').replace(/[-_.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const nameFor = (el) => {
      if (el.title) return el.title;
      const prev = el.previousElementSibling; if (prev && /^(SPAN|LABEL|B)$/.test(prev.tagName) && prev.textContent.trim()) return prev.textContent.trim();
      const row = el.closest('.prop-row, .cmp-field, .dsm-row, label'); const lab = row?.querySelector('.prop-label, .prop-input-prefix, span'); if (lab && lab !== el && lab.textContent.trim()) return lab.textContent.trim();
      return el.placeholder || human(el.id || el.dataset.p || el.dataset.k || el.name || '') || 'Value';
    };
    const fix = () => {
      for (const el of document.querySelectorAll('input:not([type="hidden"]):not([aria-label]):not([aria-labelledby]), select:not([aria-label]):not([aria-labelledby]), textarea:not([aria-label])')) {
        if (el.labels?.length && [...el.labels].some(l => l.textContent.trim())) continue;
        el.setAttribute('aria-label', nameFor(el).slice(0, 80));
      }
      document.querySelectorAll('.menu-bar .menu-btn:not([role])').forEach(b => { b.setAttribute('role', 'menuitem'); b.setAttribute('aria-haspopup', 'menu'); });
      const tree = document.getElementById('layers-tree'); if (tree && !tree.getAttribute('role')) { tree.setAttribute('role', 'tree'); tree.setAttribute('aria-label', 'Layers'); }
      const sm = document.getElementById('sm-list'); if (sm?.getAttribute('role') === 'listbox') sm.removeAttribute('role');
    };
    let t = null; const later = () => { if (!t) t = setTimeout(() => { t = null; fix(); }, 250); };
    fix(); new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  }
};
Object.assign(StudioApp.prototype, A11yMixin);
