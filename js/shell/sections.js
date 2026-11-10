/**
 * DesignStudio — workspace sections (Design / Media / 3D), Design ↔ Animate mode,
 * version display and the About / diagnostics dialog.
 */
'use strict';

const SectionsMixin = {
  bindSections() {
    const $ = (id) => document.getElementById(id);
    this.section = 'design';
    this.uiMode = 'design';
    document.body.dataset.section = 'design';
    document.body.dataset.mode = 'design';
    document.querySelectorAll('#section-switch [data-section]').forEach(b => b.addEventListener('click', () => this.setSection(b.dataset.section)));
    document.querySelectorAll('#mode-switch [data-mode]').forEach(b => b.addEventListener('click', () => this.setUiMode(b.dataset.mode)));
    $('sb-version').textContent = `v${APP_VERSION}`;
    $('sb-version').title = `DesignStudio ${APP_VERSION} (${APP_BUILD_DATE}) — click for details`;
    $('sb-version').addEventListener('click', () => this.showAbout());
    document.title = `DesignStudio ${APP_VERSION}`;
    // Section shortcuts: Ctrl+Alt+1/2/3
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        this.setSection({ 1: 'design', 2: 'media', 3: '3d' }[e.key]);
      }
    }, true);
  },

  setSection(name) {
    if (name === this.section) return;
    if (this.previewing) this.stopPreview();
    this.finishTextEdit();
    this.closeMenus();
    this.section = name;
    document.body.dataset.section = name;
    document.querySelectorAll('#section-switch [data-section]').forEach(b => { b.classList.toggle('active', b.dataset.section === name); b.setAttribute('aria-selected', String(b.dataset.section === name)); });
    document.getElementById('main-workspace').hidden = name !== 'design';
    document.getElementById('media-workspace').hidden = name !== 'media';
    document.getElementById('space3d-workspace').hidden = name !== '3d';
    if (name === 'design') { this.renderer.resize(); this.requestRender(); }
    if (name === 'media') this.enterMedia?.();
    if (name === '3d') this.enter3D?.();
    this.updateStatusBar();
  },

  setUiMode(mode) {
    this.uiMode = mode;
    document.body.dataset.mode = mode;
    document.querySelectorAll('#mode-switch [data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    if (mode === 'animate') {
      this.captureSetupPose();
      this._tlOpenedByAnimate = !this.timelineOpen();
      if (!this.timelineOpen()) this.toggleTimeline(true);
      document.getElementById('center-viewport').style.setProperty('--tl-h', '300px');
      this.renderer.resize();
      this.renderTimeline();
      Utils.toast('Animate mode — timelines, state machines, inputs & listeners', '🎬');
    } else {
      if (this.previewing) this.stopPreview();
      this.showTimelineView('timeline');
      if (this._tlOpenedByAnimate && this.timelineOpen()) this.toggleTimeline(false); // v3.22: back to the canvas the user had
      this._tlOpenedByAnimate = false;
      this.restoreSetupPose();
      this.setupPose = null;
      this.commit();
    }
  },

  showAbout() {
    const m = this.model;
    const stats = `${m.pages.length} page(s) · ${m.allElements().length} layers · ${m.animations.length} animation(s) · ${m.stateMachines.length} state machine(s) · ${m.inputs.length} input(s)`;
    const diag = [`DesignStudio ${APP_VERSION} (${APP_BUILD_DATE}, ${APP_CODENAME})`, `Browser: ${navigator.userAgent}`, `Screen: ${screen.width}×${screen.height} @${window.devicePixelRatio}x`, `Project: ${this.title} — ${stats}`, `Section: ${this.section} · Mode: ${this.uiMode === 'design' ? 'edit' : this.uiMode}`, `Render: ${document.getElementById('sb-fps')?.textContent || '—'}`].join('\n');
    const ov = document.createElement('div');
    ov.className = 'ds-dialog-overlay';
    ov.innerHTML = `<div class="ds-dialog" role="dialog" aria-modal="true" aria-labelledby="about-h">
      <h3 id="about-h">DesignStudio <span class="ver-pill"></span></h3>
      <p class="about-meta"></p>
      <p>Every release has an entry in <b>CHANGELOG.md</b> with numbered items (<code>DS-&lt;version&gt;-NN</code>) and a full copy in <b>_versions/</b>. When reporting an issue, include the diagnostics below.</p>
      <pre class="about-diag"></pre>
      <div class="ds-dialog-actions"><button class="menu-btn" data-a="copy">Copy diagnostics</button><button class="btn-primary" data-a="close">Close</button></div></div>`;
    ov.querySelector('.ver-pill').textContent = `v${APP_VERSION}`;
    ov.querySelector('.about-meta').textContent = `Build ${APP_BUILD_DATE} · “${APP_CODENAME}”`;
    ov.querySelector('.about-diag').textContent = diag;
    const close = () => ov.remove();
    ov.addEventListener('click', async (e) => {
      const a = e.target.dataset.a;
      if (e.target === ov || a === 'close') close();
      if (a === 'copy') { const ok = await Utils.copyText(diag); Utils.toast(ok ? 'Diagnostics copied' : 'Clipboard unavailable', ok ? '📋' : '⚠️'); }
    });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.appendChild(ov);
    ov.querySelector('[data-a="close"]').focus();
  }
};
Object.assign(StudioApp.prototype, SectionsMixin);
