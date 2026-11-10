/**
 * DesignStudio — GitHub repos (v3.34.0). File › Import from GitHub…, and the AI can use repos too ({"op":"github"}).
 *
 *  Reads      public repos with no sign-in (GitHub allows 60 API calls an hour). For private repos or more calls, paste
 *             a fine-grained token with Contents: read-only. It's kept in this browser only (session by default) and
 *             is redacted from diagnostics. DesignStudio never writes to GitHub.
 *  Imports    SVG → editable layers · PNG/JPG/WebP/GIF → image layers · .dsplugin → plugin (after its permission
 *             prompt). JSON/CSS/JS/MD text can be read by the AI, e.g. to turn design tokens into variables.
 *  Safety     every import is confirmed by the user, ≤ 40 files and ≤ 5 MB each; repo code is never run (plugins
 *             only ever run in the plugin sandbox).
 */
'use strict';

const GH_KEY = 'designstudio.github.v1';
const GH_API = 'https://api.github.com';
const GH_LIMITS = { files: 40, bytes: 5 * 1048576, text: 60000, list: 400 };
const GH_KIND = (p) => /\.svg$/i.test(p) ? 'svg' : /\.(png|jpe?g|webp|gif)$/i.test(p) ? 'image' : /\.dsplugin$/i.test(p) ? 'plugin' : /\.(json|css|scss|less|js|mjs|ts|md|txt|ya?ml|html?)$/i.test(p) ? 'text' : null;

const GitHubMixin = {
  bindGitHub() {
    let d = null; try { d = JSON.parse(localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY) || 'null'); } catch (_) { d = null; }
    this.gh = { token: typeof d?.token === 'string' ? d.token : '', remember: !!d?.remember, recent: Array.isArray(d?.recent) ? d.recent.slice(0, 8).map(String) : [], cache: new Map(), rate: null };
    if (this.commands) this.commands.githubImport = { run: () => this.showGitHub() };
  },
  ghSave() {
    const g = this.gh, body = JSON.stringify({ token: g.token, remember: g.remember, recent: g.recent });
    try {
      if (g.remember) { localStorage.setItem(GH_KEY, body); sessionStorage.removeItem(GH_KEY); }
      else { sessionStorage.setItem(GH_KEY, body); localStorage.setItem(GH_KEY, JSON.stringify({ recent: g.recent })); }
    } catch (_) { /* private mode */ }
  },
  /** "owner/repo", "github.com/owner/repo", ".../tree/branch/dir" or ".../blob/branch/file" → { owner, repo, ref, path }. */
  ghParse(input) {
    const s = String(input || '').trim().replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
    const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?\/?$/i) || s.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], ref: m[3] || '', path: (m[4] || '').replace(/\/$/, '') };
  },
  async ghFetch(url, { raw = false, binary = false } = {}) {
    const headers = { Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (this.gh.token) headers.Authorization = `Bearer ${this.gh.token}`;
    let res;
    try { res = await fetch(url, { headers, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch (e) { throw new Error('Could not reach GitHub. Check your internet connection.'); }
    const left = res.headers.get('x-ratelimit-remaining'); if (left != null) this.gh.rate = { left: +left, reset: +res.headers.get('x-ratelimit-reset') * 1000 };
    if (!res.ok) {
      if (res.status === 401) throw new Error('GitHub refused the token (401). Check it or remove it.');
      if ((res.status === 403 || res.status === 429) && left === '0') throw new Error(`GitHub's limit of free requests is used up until ${new Date(this.gh.rate.reset).toLocaleTimeString()}. Add a token to continue now.`);
      if (res.status === 403 || res.status === 429) throw new Error(this.gh.token ? 'GitHub refused access (403). The token may not include this repo, or the request limit was reached.' : 'GitHub refused (403), usually its hourly limit for requests without a token. Add a token, or try again later.');
      if (res.status === 404) throw new Error(this.gh.token ? 'Not found. Check the name, branch and that the token can read this repo.' : 'Not found. If the repo is private, add a token.');
      throw new Error(`GitHub answered ${res.status}`);
    }
    const len = +res.headers.get('content-length'); if (len > GH_LIMITS.bytes) throw new Error(`File is larger than ${GH_LIMITS.bytes / 1048576} MB`);
    if (binary) { const b = await res.blob(); if (b.size > GH_LIMITS.bytes) throw new Error(`File is larger than ${GH_LIMITS.bytes / 1048576} MB`); return b; }
    return raw ? res.text() : res.json();
  },
  /** Repo file list (cached per session). Resolves { owner, repo, ref, files:[{path,size,kind}], truncated }. */
  async ghTree(spec) {
    const r = typeof spec === 'string' ? this.ghParse(spec) : spec; if (!r) throw new Error('Use owner/repo or a github.com link');
    const key = `${r.owner}/${r.repo}@${r.ref}`; if (this.gh.cache.has(key)) return this.gh.cache.get(key);
    let ref = r.ref;
    if (!ref) ref = (await this.ghFetch(`${GH_API}/repos/${r.owner}/${r.repo}`)).default_branch || 'main';
    const t = await this.ghFetch(`${GH_API}/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    const files = (t.tree || []).filter(x => x.type === 'blob').map(x => ({ path: x.path, size: x.size || 0, kind: GH_KIND(x.path) })).filter(x => x.kind);
    const out = { owner: r.owner, repo: r.repo, ref, files, truncated: !!t.truncated };
    this.gh.cache.set(key, out);
    const name = `${r.owner}/${r.repo}`; this.gh.recent = [name, ...this.gh.recent.filter(x => x !== name)].slice(0, 8); this.ghSave();
    window.DSDiag?.info('github', `Listed ${name}@${ref}: ${files.length} usable files`);
    return out;
  },
  ghFileUrl(t, path, raw = true) {
    const p = path.split('/').map(encodeURIComponent).join('/');
    return this.gh.token || !raw ? `${GH_API}/repos/${t.owner}/${t.repo}/contents/${p}?ref=${encodeURIComponent(t.ref)}` : `https://raw.githubusercontent.com/${t.owner}/${t.repo}/${encodeURIComponent(t.ref)}/${p}`;
  },
  async ghText(t, path) { const s = await this.ghFetch(this.ghFileUrl(t, path), { raw: true }); return s.length > GH_LIMITS.text ? `${s.slice(0, GH_LIMITS.text)}\n… (cut at ${GH_LIMITS.text / 1000} KB)` : s; },

  /** Imports files after the user confirms. Resolves a short report string. */
  async ghImport(t, paths, { confirm = true } = {}) {
    const list = [...new Set(paths)].map(p => t.files.find(f => f.path === p)).filter(f => f && f.kind !== 'text').slice(0, GH_LIMITS.files);
    if (!list.length) return 'Nothing to import (choose SVG, image or .dsplugin files).';
    if (confirm) {
      const E = Utils.escapeHtml;
      const ok = await new Promise((res) => this.dialog({ title: 'Import from GitHub?', body: `<p>${list.length} file${list.length === 1 ? '' : 's'} from <b>${E(`${t.owner}/${t.repo}`)}</b> (${E(t.ref)}):</p><ul class="gh-confirm">${list.slice(0, 12).map(f => `<li><code>${E(f.path)}</code></li>`).join('')}${list.length > 12 ? `<li>…and ${list.length - 12} more</li>` : ''}</ul>`, actions: [{ label: 'Cancel', run: () => res(false) }, { label: 'Import', primary: true, run: () => res(true) }] }));
      if (!ok) return 'The user cancelled the import.';
    }
    const c = this.viewCenter({ width: 0, height: 0 }), done = [], failed = [];
    let i = 0;
    for (const f of list) {
      const name = f.path.split('/').pop(), at = { x: c.x + (i % 8) * 120 - 420, y: c.y + Math.floor(i / 8) * 120 - 120 };
      try {
        if (f.kind === 'svg') { const s = await this.ghFetch(this.ghFileUrl(t, f.path), { raw: true }); this.importSVGText(s, name.replace(/\.svg$/i, ''), at); }
        else if (f.kind === 'image') { const b = await this.ghFetch(this.ghFileUrl(t, f.path), { raw: true, binary: true }); this.importImageFile(new File([b], name, { type: b.type || `image/${name.split('.').pop().toLowerCase().replace('jpg', 'jpeg')}` }), at); }
        else if (f.kind === 'plugin') { const s = await this.ghFetch(this.ghFileUrl(t, f.path), { raw: true }); const p = await this.pluginInstallText?.(s); if (!p) throw new Error('not installed'); }
        done.push(f.path); i++;
      } catch (e) { failed.push(`${f.path} (${e.message})`); }
    }
    window.DSDiag?.info('github', `Imported ${done.length} file(s) from ${t.owner}/${t.repo}${failed.length ? `, ${failed.length} failed` : ''}`);
    if (done.length) Utils.toast(`Imported ${done.length} file${done.length === 1 ? '' : 's'} from GitHub`, '📥');
    return `Imported ${done.length}: ${done.join(', ') || '-'}${failed.length ? `\nFailed: ${failed.join('; ')}` : ''}`;
  },

  /** The AI's {"op":"github","action":"list|read|import","repo":"owner/repo","path":"…","paths":[…]}. Returns text for the model. */
  async aiGitHub(call) {
    try {
      const t = await this.ghTree(call.ref ? { ...this.ghParse(call.repo), ref: call.ref } : call.repo);
      const act = call.action || 'list';
      if (act === 'list') {
        const pre = String(call.path || '').replace(/^\/|\/$/g, ''), kind = call.kind;
        const fs = t.files.filter(f => (!pre || f.path.startsWith(`${pre}/`) || f.path === pre) && (!kind || f.kind === kind));
        const sum = ['svg', 'image', 'plugin', 'text'].map(k => `${k}: ${fs.filter(f => f.kind === k).length}`).join(', ');
        return `${t.owner}/${t.repo}@${t.ref} — ${fs.length} files (${sum})${t.truncated ? ' (repo is very large; list truncated by GitHub)' : ''}\n${fs.slice(0, GH_LIMITS.list).map(f => `${f.path} [${f.kind}, ${Math.round(f.size / 1024)} KB]`).join('\n')}${fs.length > GH_LIMITS.list ? `\n… ${fs.length - GH_LIMITS.list} more (narrow with "path" or "kind")` : ''}`;
      }
      if (act === 'read') {
        const p = String(call.path || ''); const f = t.files.find(x => x.path === p); if (!f) return `ERROR: ${p} not found (use action "list")`;
        if (f.kind !== 'text' && f.kind !== 'svg' && f.kind !== 'plugin') return `ERROR: ${p} is a binary ${f.kind}; use action "import"`;
        return `${p}:\n${await this.ghText(t, p)}`;
      }
      if (act === 'import') return await this.ghImport(t, [].concat(call.paths || call.path || []).map(String));
      return `ERROR: unknown action ${act} (list, read, import)`;
    } catch (e) { return `ERROR: ${e.message}`; }
  },

  // ------------------------------------------------------------------ File › Import from GitHub…
  showGitHub() {
    if (document.querySelector('.gh-form')) return;
    const E = Utils.escapeHtml, g = this.gh;
    const body = `<form class="gh-form st-form">
      <label class="st-row gh-repo"><span>Repository<small>owner/repo or a github.com link (a folder link works too)</small></span><span class="st-ctl"><input name="repo" list="gh-recent" placeholder="owner/repo" spellcheck="false" autocomplete="off" required><datalist id="gh-recent">${g.recent.map(r => `<option value="${E(r)}">`).join('')}</datalist><button type="submit" class="btn-primary">Open</button></span></label>
      <details class="gh-auth"${g.token ? '' : ''}><summary>${g.token ? 'Token saved: private repos work' : 'Private repo? Add a token (optional)'}</summary>
        <p class="st-note">Create a <b>fine-grained token</b> on github.com › Settings › Developer settings with <b>Contents: Read-only</b> for the repos you need. It stays in this browser and is never shown in logs.</p>
        <span class="gh-tok"><input name="token" type="password" autocomplete="off" spellcheck="false" placeholder="${g.token ? '•••• saved' : 'github_pat_…'}" aria-label="GitHub token"><label><input type="checkbox" name="remember"${g.remember ? ' checked' : ''}> Remember on this device</label>${g.token ? '<button type="button" data-gh="forget">Remove token</button>' : ''}</span></details>
      <div class="gh-browse" hidden>
        <div class="gh-bar"><input name="filter" type="search" placeholder="Filter files…" aria-label="Filter files"><select name="kind" aria-label="File type"><option value="">Importable</option><option value="svg">SVG</option><option value="image">Images</option><option value="plugin">Plugins</option></select><button type="button" data-gh="all">Select shown</button></div>
        <ul class="gh-files" aria-label="Files"></ul>
        <div class="gh-foot"><span class="gh-count st-note"></span><button type="button" class="btn-primary" data-gh="import" disabled>Import</button></div>
      </div>
      <p class="st-live gh-status" role="status"></p>
      <p class="st-note">Tip: ask the AI, for example “import the icons from owner/repo” or “turn the tokens in owner/repo into variables”.</p></form>`;
    const { el, close } = this.dialog({ title: 'Import from GitHub', body, wide: true });
    el.querySelector('.ds-dialog')?.classList.add('st-dialog');
    const f = el.querySelector('.gh-form'), status = el.querySelector('.gh-status'), ul = el.querySelector('.gh-files'), browse = el.querySelector('.gh-browse');
    let tree = null; const picked = new Set();
    const setStatus = (s, bad) => { status.textContent = s; status.classList.toggle('err', !!bad); };
    const shown = () => { if (!tree) return []; const q = f.filter.value.trim().toLowerCase(), k = f.kind.value; return tree.files.filter(x => x.kind !== 'text' && (!k || x.kind === k) && (!q || x.path.toLowerCase().includes(q))); };
    const draw = () => {
      const fs = shown();
      ul.innerHTML = fs.slice(0, 500).map(x => `<li><label><input type="checkbox" value="${E(x.path)}"${picked.has(x.path) ? ' checked' : ''}> <span class="gh-k gh-${x.kind}">${x.kind === 'image' ? 'IMG' : x.kind === 'plugin' ? 'PLUG' : 'SVG'}</span> <code>${E(x.path)}</code> <small>${Math.max(1, Math.round(x.size / 1024))} KB</small></label></li>`).join('') || '<li class="gh-none">No importable files here.</li>';
      el.querySelector('.gh-count').textContent = `${picked.size} selected${picked.size > GH_LIMITS.files ? ` (max ${GH_LIMITS.files} per import)` : ''} · ${fs.length} shown`;
      el.querySelector('[data-gh=import]').disabled = !picked.size || picked.size > GH_LIMITS.files;
    };
    const saveTok = () => { const v = f.token.value.trim(); if (v) g.token = v; g.remember = f.remember.checked; this.ghSave(); f.token.value = ''; };
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); saveTok(); const r = this.ghParse(f.repo.value);
      if (!r) { setStatus('Use owner/repo or a github.com link.', true); return; }
      setStatus(`Opening ${r.owner}/${r.repo}…`);
      try {
        tree = await this.ghTree(r); picked.clear(); browse.hidden = false; if (r.path) f.filter.value = r.path;
        const n = tree.files.filter(x => x.kind !== 'text').length;
        setStatus(`${tree.owner}/${tree.repo} · ${tree.ref} · ${n} importable file${n === 1 ? '' : 's'}${g.rate ? ` · ${g.rate.left} GitHub requests left this hour` : ''}`); draw();
      } catch (err) { setStatus(err.message, true); }
    });
    f.addEventListener('input', (e) => { if (['filter', 'kind'].includes(e.target.name)) draw(); });
    f.addEventListener('change', (e) => { if (e.target.closest('.gh-files')) { e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value); draw(); } });
    f.addEventListener('keydown', (e) => e.stopPropagation(), true);
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-gh]'); if (!b) return;
      if (b.dataset.gh === 'forget') { g.token = ''; this.ghSave(); g.cache.clear(); close(); this.showGitHub(); Utils.toast('GitHub token removed', '🔑'); }
      if (b.dataset.gh === 'all') { shown().slice(0, GH_LIMITS.files).forEach(x => picked.add(x.path)); draw(); }
      if (b.dataset.gh === 'import') { const paths = [...picked]; close(); const r = await this.ghImport(tree, paths, { confirm: false }); if (/Failed/.test(r)) Utils.toast(r.split('\n').pop().slice(0, 160), '⚠️'); }
    });
    setTimeout(() => f.repo.focus(), 30);
  },
};
Object.assign(StudioApp.prototype, GitHubMixin);
