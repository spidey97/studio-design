/**
 * DesignStudio — File › Import… (v3.37.0, DS-3.37.0-01). Ctrl+I in every studio.
 *
 *  One place to bring files in, the counterpart of Export. Drop or choose any mix of files and each one goes to the
 *  studio that can use it, or pick a card to choose the destination yourself:
 *    images & SVG → Design canvas · video & animated GIF → Media · GLB/glTF/OBJ/STL → 3D · design tokens → Variables
 *    code (HTML/CSS, React, Vue, Svelte, Tailwind; SwiftUI/Flutter/Compose via AI) → editable layers (js/design/code-import.js)
 *    .dsplugin → Plugins (after its permission prompt) · DesignStudio project → opens it (asks first) · a GitHub repo → the repo picker
 *  Nothing is uploaded: files are read in this browser only.
 */
'use strict';

const IMP_EXT = {
  image: /\.(svg|png|jpe?g|webp|gif|avif|bmp)$/i,
  video: /\.(mp4|webm|mov|m4v|mkv|ogv)$/i,
  model: /\.(glb|gltf|obj|stl)$/i,
  plugin: /\.dsplugin$/i,
  json: /\.json$/i
};
const IMP_KINDS = [
  { id: 'image', icon: '🖼️', name: 'Images & SVG', fmt: 'PNG · JPG · SVG', to: 'Design canvas', accept: '.svg,.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp', multi: true },
  { id: 'media', icon: '🎞️', name: 'Video & animation', fmt: 'MP4 · MOV · GIF', to: 'Media', accept: 'video/*,.mp4,.webm,.mov,.m4v,.mkv,.ogv,.gif,.apng,.webp,.avif', multi: true },
  { id: 'model', icon: '🧊', name: '3D model', fmt: 'GLB · glTF · OBJ · STL', to: '3D', accept: '.glb,.gltf,.obj,.stl' },
  { id: 'tokens', icon: '🎨', name: 'Design tokens', fmt: 'W3C · Tokens Studio', to: 'Variables', accept: '.json,application/json' },
  { id: 'code', icon: '⌨️', name: 'Code → layers', fmt: 'HTML · CSS · React · Vue · Svelte · Tailwind · SwiftUI · Flutter · Compose', to: 'Editable design layers', accept: '.html,.htm,.css,.jsx,.tsx,.js,.mjs,.ts,.vue,.svelte,.swift,.dart,.kt,.kts,.xml,image/*', multi: true, wide: true },
  { id: 'plugin', icon: '🧩', name: 'Plugin', fmt: '.dsplugin', to: 'Plugins', accept: '.dsplugin,.json,application/json' },
  { id: 'project', icon: '📂', name: 'Project', fmt: '.designstudio.json', to: 'Opens it', accept: '.json,application/json' }
];

const ImportMixin = {
  bindImport() {
    if (this.commands) this.commands.importAny = { run: () => this.openImport() };
    document.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'i') return;
      if (e.target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault(); e.stopImmediatePropagation(); this.openImport();
    }, true);
  },

  openImport() {
    this.closeMenus?.();
    const E = Utils.escapeHtml;
    const cards = IMP_KINDS.map(k => `<button type="button" class="imp-card${k.wide ? ' imp-wide' : ''}" data-kind="${k.id}"><span class="imp-ic" aria-hidden="true">${k.icon}</span><b>${E(k.name)}</b><span class="imp-fmt">${E(k.fmt)}</span><span class="imp-to">→ ${E(k.to)}</span></button>`).join('');
    const body = `<label class="imp-drop" tabindex="0"><input type="file" multiple hidden>
        <span class="imp-drop-ic" aria-hidden="true">⤓</span><b>Drop files here, or choose files</b>
        <span class="muted-text">Each file goes to the studio that can use it. Files stay on this computer.</span></label>
      <div class="imp-gh"><button type="button" class="btn-ghost" data-gh>🐙 Import from a GitHub repo…</button></div>
      <div class="imp-sub">Or choose what you're importing</div><div class="imp-grid">${cards}</div>`;
    const { el, close } = this.dialog({ title: 'Import', body, wide: true, actions: [{ label: 'Close' }] });
    const drop = el.querySelector('.imp-drop'), inp = drop.querySelector('input');
    // Esc closes even if a studio (e.g. 3D finishing its load) pulls focus out of the dialog
    const onEsc = (e) => { if (e.key !== 'Escape' || !el.isConnected) return; e.preventDefault(); e.stopImmediatePropagation(); close(); };
    document.addEventListener('keydown', onEsc, true);
    new MutationObserver((_, mo) => { if (!el.isConnected) { document.removeEventListener('keydown', onEsc, true); mo.disconnect(); } }).observe(document.body, { childList: true });
    setTimeout(() => drop.focus(), 20); // the hidden file input can't take focus, so Esc and Tab start here
    const go = (files, kind) => { files = [...files]; if (!files.length) return; close(); this.importFiles(files, kind); };
    inp.addEventListener('change', () => go(inp.files));
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); go(e.dataTransfer?.files || []); });
    el.querySelector('[data-gh]').addEventListener('click', () => { close(); this.showGitHub?.(); });
    el.querySelectorAll('.imp-card').forEach(b => b.addEventListener('click', () => {
      const k = IMP_KINDS.find(x => x.id === b.dataset.kind);
      const pick = document.createElement('input'); pick.type = 'file'; pick.accept = k.accept; pick.multiple = !!k.multi;
      pick.addEventListener('change', () => go(pick.files, k.id));
      pick.click();
    }));
    return el;
  },

  /** Sort files by kind (or force one kind) and send each group to its studio. */
  async importFiles(files, kind = null) {
    const groups = { image: [], media: [], model: [], tokens: [], plugin: [], project: [], code: [], codeAI: [] }, skipped = [];
    for (const f of files) {
      let k = kind === 'code' ? (IMP_EXT.image.test(f.name) ? 'image' : await this.importKindOf(f, true)) : kind || await this.importKindOf(f);
      if (kind === 'code' && k !== 'code' && k !== 'codeAI' && k !== 'image') k = null;
      if (k && groups[k]) groups[k].push(f); else skipped.push(f.name);
    }
    if (groups.code.length) {
      // images the code refers to (by file name) are placed inside the imported design, not on their own
      const src = (await Promise.all(groups.code.map(f => f.text()))).join('\n').toLowerCase();
      const used = groups.image.filter(f => src.includes(f.name.toLowerCase()));
      groups.image = groups.image.filter(f => !used.includes(f));
      if (this.section !== 'design') this.setSection('design');
      try { await this.importCodeFiles(groups.code, used); } catch (e) { console.error(e); Utils.toast(`Couldn't import that code: ${e.message}`, '❌'); }
    }
    for (const f of groups.codeAI) await this.importCodeWithAI(f);
    if (groups.project.length) await this.importProject(groups.project[0]);
    if (groups.image.length) this.importToDesign(groups.image);
    for (const f of groups.tokens) await this.importTokensFile(f);
    for (const f of groups.plugin) { if (f.size > 400000) { Utils.toast(`${f.name} is too large for a plugin (over 400 KB)`, '⚠️'); continue; } await this.pluginInstallText?.(await f.text()); }
    if (groups.model.length) await this.importToSpace3D(groups.model);
    if (groups.media.length) await this.importToMedia(groups.media);
    if (skipped.length) Utils.toast(`Can't import ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ` and ${skipped.length - 3} more` : ''}: unsupported file type`, '⚠️');
  },

  async importKindOf(f, codeFirst = false) {
    const n = f.name || '';
    if (this.codeKindOf) { const head = /\.(m?js|ts|xml)$/i.test(n) ? await f.text().catch(() => '') : null; const ck = this.codeKindOf(f, head); if (ck) return ck === 'ai' ? 'codeAI' : 'code'; }
    if (IMP_EXT.plugin.test(n)) return 'plugin';
    if (IMP_EXT.model.test(n)) return 'model';
    if (IMP_EXT.video.test(n) || /^video\//.test(f.type)) return 'media';
    if (IMP_EXT.image.test(n) || /^image\//.test(f.type)) return 'image';
    if (IMP_EXT.json.test(n) || f.type === 'application/json') {
      let d = null; try { d = JSON.parse(await f.text()); } catch (_) { return null; }
      if (d?.format === 'dsplugin') return 'plugin';
      if (d?.format === 'designstudio' || Array.isArray(d?.pages)) return 'project';
      return d && typeof d === 'object' ? 'tokens' : null;
    }
    return null;
  },

  importToDesign(files) {
    if (this.section !== 'design') this.setSection('design');
    const c = this.viewCenter();
    files.forEach((f, i) => this.handleImportFile(f, files.length > 1 ? { x: c.x + i * 24, y: c.y + i * 24 } : null));
  },

  async importProject(f) {
    if (this.model.allElements().length) {
      const ok = await this.confirm(`Open ${f.name}?`, 'It replaces what is open now. Your current project is kept as “Recent project” on the welcome screen.', 'Open project');
      if (!ok) return;
    }
    if (this.section !== 'design') this.setSection('design');
    this._openingHandle = null;
    this.handleImportFile(f);
  },

  async importTokensFile(f) {
    try {
      const n = this.dsImportTokens(await f.text());
      this.dsCommit?.('Import tokens');
      Utils.toast(`Imported ${n} token${n === 1 ? '' : 's'} from ${f.name}. Find them in Design System › Variables`, '🎨');
    } catch (e) { Utils.toast(`Couldn't read ${f.name} as design tokens: ${e.message}`, '⚠️'); }
  },

  async importToSpace3D(files) {
    if (this.section !== '3d') this.setSection('3d');
    for (let t = 0; t < 200 && !this.s3?.ready; t++) await new Promise(r => setTimeout(r, 100));
    if (!this.s3?.ready) { Utils.toast('The 3D engine is still loading. Try again in a moment', 'ℹ️'); return; }
    for (const f of files) await this.s3Import(f);
  },

  async importToMedia(files) {
    if (this.section !== 'media') this.setSection('media');
    await new Promise(r => setTimeout(r, 0));
    await this.mediaFiles(files, MediaUI.tool('open'));
  }
};
Object.assign(StudioApp.prototype, ImportMixin);
