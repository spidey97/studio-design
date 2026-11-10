/**
 * DesignStudio — plugins (v3.33.0). Plugins › Plugin Studio… to write, test and install your own plugins.
 *
 *  Sandbox      each run is a fresh Web Worker. Before the plugin's code runs, the worker loses fetch, XHR, WebSocket,
 *               EventSource, importScripts, nested workers, IndexedDB, Cache Storage and BroadcastChannel. The plugin
 *               can't touch the page, the app, storage or the network: it talks to the app only through `ds.*`.
 *  Permissions  read (selection, layers) · write (create, update, delete, select) · ui (ask the user with a form)
 *               · network (ds.fetch, https only, to the domains listed in the manifest). Approved at install.
 *  Limits       10 s of run time (time spent waiting for the user's answer doesn't count), 5,000 writes per run,
 *               200 KB of code. One run = one undo step ("Plugin: <name>").
 *  Format       .dsplugin = JSON { format:'dsplugin', name, version, description, permissions, network, code }.
 */
'use strict';

const PLUGINS_KEY = 'designstudio.plugins.v1';
const PLUGIN_PERMS = { read: 'Read layers and the selection', write: 'Create, change and delete layers', ui: 'Ask you questions with a small form', network: 'Connect to the internet (only the domains listed)' };
const PLUGIN_PROPS = ['name', 'x', 'y', 'width', 'height', 'rotation', 'opacity', 'cornerRadius', 'visible', 'locked', 'fills', 'strokes', 'effects', 'text', 'fontSize', 'fontFamily', 'fontWeight', 'textAlign', 'lineHeight', 'letterSpacing', 'blendMode', 'flipX', 'flipY', 'parentId'];
const PLUGIN_LIMITS = { ms: 10000, writes: 5000, code: 200000, fetchBytes: 2 * 1048576 };

/** Runs inside the worker before the plugin's code. */
const PLUGIN_BOOT = `'use strict';
const __post = self.postMessage.bind(self), __on = self.addEventListener.bind(self), __pend = new Map(); let __n = 0;
for (const k of ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','Worker','SharedWorker','indexedDB','caches','BroadcastChannel','WebTransport','FileSystemHandle','StorageManager']) {
  for (let o = self; o; o = Object.getPrototypeOf(o)) { try { if (Object.prototype.hasOwnProperty.call(o, k)) Object.defineProperty(o, k, { value: undefined, writable: false, configurable: false }); } catch (_) {} }
  try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (_) {}
}
try { Object.defineProperty(self.navigator, 'storage', { value: undefined }); } catch (_) {}
__on('message', (e) => { const m = e.data || {}; if (m.t === 'ret' && __pend.has(m.id)) { const p = __pend.get(m.id); __pend.delete(m.id); m.ok ? p.res(m.value) : p.rej(new Error(m.error)); } });
const __call = (fn, ...args) => new Promise((res, rej) => { const id = ++__n; __pend.set(id, { res, rej }); __post({ t: 'call', id, fn, args }); });
const __str = (v) => { if (typeof v === 'string') return v; try { return JSON.stringify(v); } catch (_) { return String(v); } };
const console = Object.freeze({ log: (...a) => __post({ t: 'log', level: 'log', msg: a.map(__str).join(' ') }), info: (...a) => __post({ t: 'log', level: 'log', msg: a.map(__str).join(' ') }), warn: (...a) => __post({ t: 'log', level: 'warn', msg: a.map(__str).join(' ') }), error: (...a) => __post({ t: 'log', level: 'error', msg: a.map(__str).join(' ') }) });
const ds = Object.freeze({
  selection: () => __call('selection'), layers: () => __call('layers'), get: (id) => __call('get', id),
  create: (type, props) => __call('create', type, props), update: (id, props) => __call('update', id, props),
  remove: (ids) => __call('remove', [].concat(ids)), select: (ids) => __call('select', [].concat(ids)),
  viewport: () => __call('viewport'), notify: (msg) => __call('notify', String(msg)), ask: (title, fields) => __call('ask', title, fields),
  storage: Object.freeze({ get: (k) => __call('storageGet', k), set: (k, v) => __call('storageSet', k, v) }),
  fetch: (url, opts) => __call('fetch', url, opts),
});
`;

const PLUGIN_TEMPLATES = [
  { id: 'grid', name: 'Grid of shapes', description: 'Creates a grid of rectangles in the middle of the view.', permissions: ['write', 'ui', 'read'], code: `const o = await ds.ask('Grid of shapes', [
  { name: 'rows', label: 'Rows', type: 'number', value: 3 },
  { name: 'cols', label: 'Columns', type: 'number', value: 4 },
  { name: 'size', label: 'Size (px)', type: 'number', value: 80 },
  { name: 'gap', label: 'Gap (px)', type: 'number', value: 16 },
  { name: 'color', label: 'Colour', type: 'color', value: '#3A8BFF' },
]);
if (!o) return; // cancelled
const v = await ds.viewport(), w = o.cols * o.size + (o.cols - 1) * o.gap, h = o.rows * o.size + (o.rows - 1) * o.gap;
const ids = [];
for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) {
  ids.push(await ds.create('rect', { name: \`Cell \${r + 1}-\${c + 1}\`, x: v.cx - w / 2 + c * (o.size + o.gap), y: v.cy - h / 2 + r * (o.size + o.gap), width: o.size, height: o.size, cornerRadius: 8, fills: [{ type: 'solid', color: o.color }] }));
}
await ds.select(ids);
await ds.notify(\`Created \${ids.length} shapes\`);` },
  { id: 'rename', name: 'Rename layers', description: 'Renames the selected layers with a prefix and a number.', permissions: ['read', 'write', 'ui'], code: `const sel = await ds.selection();
if (!sel.length) return ds.notify('Select some layers first');
const o = await ds.ask('Rename layers', [{ name: 'prefix', label: 'Name', type: 'text', value: 'Item' }, { name: 'start', label: 'Start at', type: 'number', value: 1 }]);
if (!o) return;
sel.sort((a, b) => a.y - b.y || a.x - b.x);
for (const [i, el] of sel.entries()) await ds.update(el.id, { name: \`\${o.prefix} \${o.start + i}\` });
await ds.notify(\`Renamed \${sel.length} layers\`);` },
  { id: 'recolor', name: 'Recolour selection', description: 'Sets one fill colour on every selected layer.', permissions: ['read', 'write', 'ui'], code: `const sel = await ds.selection();
if (!sel.length) return ds.notify('Select some layers first');
const o = await ds.ask('Recolour', [{ name: 'color', label: 'Fill colour', type: 'color', value: '#FFC21A' }]);
if (!o) return;
for (const el of sel) await ds.update(el.id, { fills: [{ type: 'solid', color: o.color, opacity: 1, visible: true }] });` },
  { id: 'distribute', name: 'Distribute horizontally', description: 'Spaces the selected layers evenly from left to right.', permissions: ['read', 'write'], code: `const sel = (await ds.selection()).sort((a, b) => a.x - b.x);
if (sel.length < 3) return ds.notify('Select at least 3 layers');
const first = sel[0], last = sel[sel.length - 1];
const total = sel.reduce((s, e) => s + e.width, 0), gap = (last.x + last.width - first.x - total) / (sel.length - 1);
let x = first.x;
for (const el of sel) { await ds.update(el.id, { x: Math.round(x) }); x += el.width + gap; }` },
  { id: 'confetti', name: 'Confetti', description: 'Scatters random coloured dots around the middle of the view.', permissions: ['write', 'ui'], code: `const o = await ds.ask('Confetti', [{ name: 'count', label: 'How many', type: 'number', value: 40 }, { name: 'spread', label: 'Spread (px)', type: 'number', value: 400 }]);
if (!o) return;
const v = await ds.viewport(), colors = ['#3A8BFF', '#6B4FF0', '#FFC21A', '#F4ECD6', '#FF5C7A'];
for (let i = 0; i < Math.min(o.count, 500); i++) {
  const s = 6 + Math.random() * 18;
  await ds.create('ellipse', { name: 'Dot', x: v.cx + (Math.random() - 0.5) * o.spread, y: v.cy + (Math.random() - 0.5) * o.spread, width: s, height: s, fills: [{ type: 'solid', color: colors[i % colors.length] }] });
}` },
  { id: 'blank', name: 'Blank plugin', description: 'An empty plugin with the API at a glance.', permissions: ['read'], code: `// ds.selection() · ds.layers() · ds.get(id)            → layers (read)
// ds.create(type, props) · ds.update(id, props)          → id (write)   type: rect ellipse line arrow polygon star text frame
// ds.remove(ids) · ds.select(ids)                        (write)
// ds.ask(title, [{ name, label, type: number|text|color|select|checkbox, value, options }]) → values or null (ui)
// ds.viewport() → { cx, cy, x, y, width, height } · ds.notify(text) · ds.storage.get(k) / set(k, v)
// ds.fetch(url) → { status, text } (network, listed https domains only) · console.log(...) shows below
const sel = await ds.selection();
console.log(\`\${sel.length} layer(s) selected\`, sel.map(e => e.name));` },
];

const PluginsMixin = {
  bindPlugins() {
    this.plugins = this.pluginsLoad();
    if (this.commands) {
      this.commands.pluginStudio = { run: () => this.showPluginStudio() };
      this.commands.pluginImport = { run: () => this.pluginImportFile() };
    }
    this.pluginsMenu();
  },
  pluginsLoad() {
    let list = []; try { list = JSON.parse(localStorage.getItem(PLUGINS_KEY) || '[]'); } catch (_) { list = []; }
    return (Array.isArray(list) ? list : []).map(p => this.pluginSanitize(p)).filter(Boolean);
  },
  pluginsSave() { try { localStorage.setItem(PLUGINS_KEY, JSON.stringify(this.plugins)); } catch (e) { Utils.toast('Could not save plugins: browser storage is full', '⚠️'); } this.pluginsMenu(); },
  pluginSanitize(p) {
    if (!p || typeof p !== 'object' || typeof p.code !== 'string' || p.code.length > PLUGIN_LIMITS.code) return null;
    const perms = (Array.isArray(p.permissions) ? p.permissions : []).filter(x => x in PLUGIN_PERMS);
    const network = (Array.isArray(p.network) ? p.network : []).map(d => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 10);
    return { id: /^pl_[a-z0-9_]+$/i.test(p.id || '') ? p.id : Utils.uid('pl'), name: String(p.name || 'Untitled plugin').slice(0, 60), version: String(p.version || '1.0.0').slice(0, 20), description: String(p.description || '').slice(0, 300), permissions: [...new Set(perms)], network, code: p.code, enabled: p.enabled !== false, updated: +p.updated || Date.now() };
  },
  pluginsMenu() {
    const drop = document.getElementById('dropdown-plugins'); if (!drop) return;
    drop.querySelectorAll('.pl-run').forEach(n => n.remove());
    const on = this.plugins.filter(p => p.enabled), empty = drop.querySelector('.pl-empty');
    if (empty) empty.hidden = on.length > 0;
    for (const p of on) {
      const key = `plugin:${p.id}`;
      if (this.commands) this.commands[key] = { run: () => this.pluginRun(p.id) };
      const it = document.createElement('div'); it.className = 'dropdown-item pl-run'; it.dataset.action = key; it.setAttribute('role', 'menuitem'); it.textContent = p.name; it.title = p.description;
      drop.appendChild(it);
    }
  },

  // ------------------------------------------------------------------ running
  /** Runs a plugin. opts.log(level, msg) receives console output (Plugin Studio). Resolves { ok, writes, ms, error }. */
  pluginRun(idOrPlugin, opts = {}) {
    const p = typeof idOrPlugin === 'string' ? this.plugins.find(x => x.id === idOrPlugin) : idOrPlugin;
    if (!p) return Promise.resolve({ ok: false, error: 'Plugin not found' });
    if (this._pluginBusy) { Utils.toast('A plugin is already running', '⏳'); return Promise.resolve({ ok: false, error: 'busy' }); }
    this._pluginBusy = true;
    const log = opts.log || ((lv, msg) => window.DSDiag?.log(lv === 'log' ? 'info' : lv, 'plugin', `${p.name}: ${msg}`));
    const src = `${PLUGIN_BOOT}\n(async () => {\n${p.code}\n})().then(() => __post({ t: 'done' }), (e) => __post({ t: 'fail', msg: (e && e.message) || String(e) }));\n`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const st = { writes: 0, t0: performance.now(), used: 0, resumed: performance.now(), m: this.model };
    window.DSDiag?.info('plugin', `Run “${p.name}” (${p.permissions.join(', ') || 'no permissions'})`);
    return new Promise((resolve) => {
      let w, timer, done = false;
      const finish = (ok, error) => {
        if (done) return; done = true; clearTimeout(timer); try { w?.terminate(); } catch (_) { /* */ } URL.revokeObjectURL(url);
        this._pluginBusy = false;
        if (st.writes) { this._actionLabel = `Plugin: ${p.name}`; this.commit(); this.selectionChanged?.(); }
        const r = { ok, writes: st.writes, ms: Math.round(performance.now() - st.t0), error };
        if (!ok) { log('error', error); if (!opts.log) Utils.toast(`Plugin “${p.name}” stopped: ${error}`, '⚠️'); window.DSDiag?.warn('plugin', `“${p.name}” failed: ${error}`); }
        resolve(r);
      };
      const arm = () => { clearTimeout(timer); const left = PLUGIN_LIMITS.ms - st.used; timer = setTimeout(() => finish(false, `took longer than ${PLUGIN_LIMITS.ms / 1000} s, so it was stopped`), Math.max(0, left)); st.resumed = performance.now(); };
      const pause = () => { clearTimeout(timer); st.used += performance.now() - st.resumed; };
      try { w = new Worker(url); } catch (e) { finish(false, `Could not start the sandbox (${e.message})`); return; }
      w.onerror = (e) => { e.preventDefault?.(); finish(false, `${e.message || 'Script error'}${e.lineno ? ` (line ${Math.max(1, e.lineno - PLUGIN_BOOT.split('\n').length - 1)})` : ''}`); };
      w.onmessage = async (e) => {
        const m = e.data || {};
        if (m.t === 'log') { log(m.level, String(m.msg).slice(0, 2000)); return; }
        if (m.t === 'done') { finish(true); return; }
        if (m.t === 'fail') { finish(false, String(m.msg).slice(0, 300)); return; }
        if (m.t !== 'call') return;
        const isAsk = m.fn === 'ask';
        if (isAsk) pause();
        let reply;
        try { reply = { t: 'ret', id: m.id, ok: true, value: await this.pluginApi(p, st, m.fn, m.args || []) }; }
        catch (err) { reply = { t: 'ret', id: m.id, ok: false, error: String(err.message || err).slice(0, 300) }; }
        if (isAsk) arm();
        if (!done) { try { w.postMessage(reply); } catch (err) { finish(false, `Could not send the reply (${err.message})`); } }
      };
      arm();
    });
  },
  pluginNeed(p, perm) { if (!p.permissions.includes(perm)) throw new Error(`needs the “${perm}” permission (edit the plugin to add it)`); },
  pluginElOut(el) {
    const j = el.toJSON ? el.toJSON() : { ...el };
    if (typeof j.src === 'string' && j.src.length > 2000) j.src = '[image data]';
    return j;
  },
  pluginElIn(props) {
    const out = {}; if (!props || typeof props !== 'object') return out;
    for (const k of PLUGIN_PROPS) if (k in props) out[k] = props[k];
    return JSON.parse(JSON.stringify(out));
  },
  async pluginApi(p, st, fn, args) {
    const M = this.model, write = () => { this.pluginNeed(p, 'write'); if (++st.writes > PLUGIN_LIMITS.writes) throw new Error(`more than ${PLUGIN_LIMITS.writes} changes in one run`); };
    switch (fn) {
      case 'selection': this.pluginNeed(p, 'read'); return M.getSelectedElements().map(e => this.pluginElOut(e));
      case 'layers': this.pluginNeed(p, 'read'); return M.elements.map(e => this.pluginElOut(e));
      case 'get': { this.pluginNeed(p, 'read'); const e = M.getElementById(String(args[0])); return e ? this.pluginElOut(e) : null; }
      case 'viewport': { const r = this.renderer, a = r.screenToWorld(0, 0), b = r.screenToWorld(r.cssW, r.cssH); return { x: Math.round(a.x), y: Math.round(a.y), width: Math.round(b.x - a.x), height: Math.round(b.y - a.y), cx: Math.round((a.x + b.x) / 2), cy: Math.round((a.y + b.y) / 2) }; }
      case 'create': {
        const type = String(args[0] || 'rect'); if (!SHAPE_TYPES.includes(type)) throw new Error(`unknown layer type “${type}” (use ${SHAPE_TYPES.join(', ')})`);
        write();
        const props = this.pluginElIn(args[1]); const parent = props.parentId && M.getElementById(props.parentId); delete props.parentId;
        const el = StudioElement.fromJSON({ ...new StudioElement(type), ...props, type }); el.id = Utils.uid('el');
        M.insertElement(el, parent && ['frame', 'group'].includes(parent.type) ? parent.id : null);
        return el.id;
      }
      case 'update': {
        write();
        const el = M.getElementById(String(args[0])); if (!el) throw new Error(`no layer with id “${args[0]}” on this page`);
        const props = this.pluginElIn(args[1]); delete props.parentId;
        const clean = StudioElement.fromJSON({ ...el.toJSON(), ...props, id: el.id, type: el.type });
        for (const k of Object.keys(props)) if (k in clean) el[k] = clean[k];
        this.requestRender(); return true;
      }
      case 'remove': { write(); const ids = args[0].map(String).filter(id => M.getElementById(id)); if (ids.length) M.deleteElements(ids); M.pruneSelection?.(); return ids.length; }
      case 'select': { this.pluginNeed(p, 'write'); M.select(args[0].map(String).filter(id => M.getElementById(id))); this.selectionChanged?.(); this.requestRender(); return true; }
      case 'notify': Utils.toast(String(args[0]).slice(0, 200), '🧩'); return true;
      case 'ask': this.pluginNeed(p, 'ui'); return this.pluginAsk(p, args[0], args[1]);
      case 'storageGet': { const all = this.pluginStore(p.id); return all[String(args[0])] ?? null; }
      case 'storageSet': { const all = this.pluginStore(p.id); all[String(args[0])] = args[1]; const s = JSON.stringify(all); if (s.length > 100000) throw new Error('plugin storage is limited to 100 KB'); try { localStorage.setItem(`designstudio.plugin.${p.id}`, s); } catch (_) { throw new Error('browser storage is full'); } return true; }
      case 'fetch': {
        this.pluginNeed(p, 'network');
        let u; try { u = new URL(String(args[0])); } catch (_) { throw new Error('not a valid URL'); }
        if (u.protocol !== 'https:') throw new Error('only https:// addresses are allowed');
        const host = u.hostname.toLowerCase(); if (!p.network.some(d => host === d || host.endsWith(`.${d}`))) throw new Error(`${host} isn't in this plugin's network list`);
        const o = args[1] || {}, method = ['GET', 'POST'].includes(String(o.method || 'GET').toUpperCase()) ? String(o.method || 'GET').toUpperCase() : 'GET';
        const res = await fetch(u.href, { method, body: method === 'POST' && typeof o.body === 'string' ? o.body.slice(0, 100000) : undefined, headers: o.json ? { 'content-type': 'application/json' } : undefined, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
        const text = (await res.text()).slice(0, PLUGIN_LIMITS.fetchBytes); return { status: res.status, ok: res.ok, text };
      }
      default: throw new Error(`unknown call ${fn}`);
    }
  },
  pluginStore(id) { try { return JSON.parse(localStorage.getItem(`designstudio.plugin.${id}`) || '{}') || {}; } catch (_) { return {}; } },
  /** A safe form built from a field list — plugins never inject HTML. Resolves the values, or null when cancelled. */
  pluginAsk(p, title, fields) {
    const list = (Array.isArray(fields) ? fields : []).slice(0, 12).map((f, i) => ({ name: /^[a-z_][a-z0-9_]*$/i.test(f?.name || '') ? f.name : `f${i}`, label: String(f?.label || f?.name || `Field ${i + 1}`).slice(0, 60), type: ['number', 'text', 'color', 'select', 'checkbox'].includes(f?.type) ? f.type : 'text', value: f?.value, options: Array.isArray(f?.options) ? f.options.slice(0, 30).map(String) : [] }));
    const E = Utils.escapeHtml, row = (f) => {
      const id = `pa-${f.name}`;
      const input = f.type === 'select' ? `<select id="${id}" name="${f.name}">${f.options.map(o => `<option${o === String(f.value) ? ' selected' : ''}>${E(o)}</option>`).join('')}</select>`
        : f.type === 'checkbox' ? `<input id="${id}" name="${f.name}" type="checkbox"${f.value ? ' checked' : ''}>`
          : `<input id="${id}" name="${f.name}" type="${f.type}" value="${E(f.type === 'color' && !/^#[0-9a-f]{6}$/i.test(f.value || '') ? '#3a8bff' : (f.value ?? ''))}"${f.type === 'number' ? ' step="any"' : ''}>`;
      return `<label class="st-row" for="${id}"><span>${E(f.label)}</span><span class="st-ctl">${input}</span></label>`;
    };
    return new Promise((resolve) => {
      let answered = false;
      const body = `<form class="pl-ask st-form"><p class="st-note">From the plugin “${E(p.name)}”.</p>${list.map(row).join('')}</form>`;
      const ok = () => { answered = true; const out = {}; for (const x of list) { const i = f.elements[x.name]; out[x.name] = x.type === 'number' ? (Number.isFinite(+i.value) ? +i.value : 0) : x.type === 'checkbox' ? i.checked : String(i.value).slice(0, 2000); } close(); resolve(out); };
      const { el, close } = this.dialog({ title: String(title || p.name).slice(0, 80), body, actions: [{ label: 'Cancel', run: () => { answered = true; resolve(null); } }, { label: 'OK', primary: true, run: () => { if (!answered) ok(); } }] });
      const f = el.querySelector('.pl-ask');
      f.addEventListener('submit', (e) => { e.preventDefault(); ok(); });
      const gone = new MutationObserver(() => { if (!document.body.contains(el)) { gone.disconnect(); if (!answered) resolve(null); } }); gone.observe(document.body, { childList: true });
      setTimeout(() => f.querySelector('input,select')?.focus(), 30);
    });
  },

  // ------------------------------------------------------------------ files
  pluginExport(p) {
    const { id, enabled, updated, ...rest } = p;
    Utils.download(JSON.stringify({ format: 'dsplugin', formatVersion: 1, ...rest }, null, 2), `${Utils.safeFilename(p.name)}.dsplugin`, 'application/json');
  },
  pluginImportFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.dsplugin,.json,application/json';
    inp.addEventListener('change', async () => { const f = inp.files?.[0]; if (!f) return; if (f.size > 400000) { Utils.toast('That plugin file is too large (over 400 KB)', '⚠️'); return; } this.pluginInstallText(await f.text()); });
    inp.click();
  },
  /** Install from .dsplugin text, after the user approves its permissions. Resolves the plugin, or null. */
  pluginInstallText(text, { confirm = true } = {}) {
    let raw; try { raw = JSON.parse(text); } catch (_) { Utils.toast('Not a plugin file (the JSON could not be read)', '⚠️'); return Promise.resolve(null); }
    if (raw?.format !== 'dsplugin') { Utils.toast('Not a DesignStudio plugin (.dsplugin)', '⚠️'); return Promise.resolve(null); }
    const p = this.pluginSanitize({ ...raw, id: null }); if (!p) { Utils.toast('This plugin is missing its code or is too large', '⚠️'); return Promise.resolve(null); }
    const add = () => { this.plugins.push(p); this.pluginsSave(); Utils.toast(`Installed “${p.name}”. Find it in the Plugins menu.`, '🧩'); window.DSDiag?.info('plugin', `Installed “${p.name}” ${p.version}`); return p; };
    if (!confirm) return Promise.resolve(add());
    const E = Utils.escapeHtml;
    return new Promise((resolve) => {
      const body = `<p><b>${E(p.name)}</b> ${E(p.version)}<br>${E(p.description || 'No description.')}</p><p>It asks to:</p><ul class="pl-perms">${p.permissions.length ? p.permissions.map(x => `<li>${E(PLUGIN_PERMS[x])}${x === 'network' ? `: ${E(p.network.join(', ') || 'no domains listed')}` : ''}</li>`).join('') : '<li>Nothing: it can only show messages</li>'}</ul><p class="st-note">Plugins run in a sandbox and can only do what is listed above. Only install plugins from people you trust; you can read its code in Plugin Studio.</p>`;
      this.dialog({ title: 'Install plugin?', body, actions: [{ label: 'Cancel', run: () => resolve(null) }, { label: 'Install', primary: true, run: () => resolve(add()) }] });
    });
  },

  // ------------------------------------------------------------------ Plugin Studio
  showPluginStudio(selectId) {
    if (document.querySelector('.pl-studio')) return;
    const E = Utils.escapeHtml;
    const body = `<div class="pl-studio">
      <aside class="pl-side" aria-label="Your plugins"><div class="pl-side-h"><b>Your plugins</b></div><ul class="pl-list" role="listbox" aria-label="Installed plugins"></ul>
        <label class="pl-new"><span>New from template</span><select class="pl-tpl"><option value="">Choose…</option>${PLUGIN_TEMPLATES.map(t => `<option value="${t.id}">${E(t.name)}</option>`).join('')}</select></label>
        <button type="button" class="menu-btn" data-pl="import">Import .dsplugin…</button></aside>
      <section class="pl-main">
        <div class="pl-empty-main">Pick a plugin on the left, or start one from a template.</div>
        <form class="pl-form" hidden>
          <div class="pl-meta"><label>Name<input name="name" maxlength="60" required></label><label>Version<input name="version" maxlength="20"></label></div>
          <label class="pl-desc">Description<input name="description" maxlength="300"></label>
          <fieldset class="pl-permset"><legend>Permissions</legend>${Object.entries(PLUGIN_PERMS).map(([k, t]) => `<label><input type="checkbox" name="perm" value="${k}"> <b>${k}</b> <small>${E(t)}</small></label>`).join('')}
            <label class="pl-net" hidden>Allowed domains (comma separated)<input name="network" placeholder="api.example.com"></label></fieldset>
          <div class="pl-ai"><input name="ai" placeholder="Describe a change or a new plugin, and AI writes the code…" aria-label="Describe the plugin for AI"><button type="button" class="menu-btn" data-pl="ai">Write with AI</button></div>
          <label class="pl-code-l">Code <small>runs inside <code>async () =&gt; { … }</code> · API: <code>ds.*</code></small><textarea name="code" class="pl-code" spellcheck="false" wrap="off" rows="14" aria-label="Plugin code"></textarea></label>
          <div class="pl-out" role="log" aria-live="polite" aria-label="Plugin output"></div>
          <div class="pl-actions"><button type="button" class="btn-primary" data-pl="run">▶ Run</button><button type="button" class="menu-btn" data-pl="save">Save</button><label class="pl-en"><input type="checkbox" name="enabled"> In Plugins menu</label><span class="pl-gap"></span><button type="button" class="menu-btn" data-pl="export">Export…</button><button type="button" class="menu-btn" data-pl="delete">Delete</button></div>
        </form></section></div>`;
    const { el, close } = this.dialog({ title: 'Plugin Studio', body, wide: true, actions: [{ label: 'Close' }] });
    el.querySelector('.ds-dialog')?.classList.add('pl-dialog');
    const f = el.querySelector('.pl-form'), out = el.querySelector('.pl-out'), listEl = el.querySelector('.pl-list');
    let cur = null, dirty = false;
    const print = (level, msg) => { const d = document.createElement('div'); d.className = `pl-line ${level}`; d.textContent = msg; out.appendChild(d); out.scrollTop = out.scrollHeight; };
    const draw = () => {
      listEl.innerHTML = this.plugins.map(p => `<li role="option" tabindex="0" data-id="${p.id}" aria-selected="${cur?.id === p.id}" class="${cur?.id === p.id ? 'on' : ''}"><b>${E(p.name)}</b><small>${p.enabled ? 'In menu' : 'Off'} · ${E(p.permissions.join(', ') || 'no permissions')}</small></li>`).join('') || '<li class="pl-none">No plugins yet</li>';
    };
    const load = (p) => {
      cur = p; dirty = false; el.querySelector('.pl-empty-main').hidden = !!p; f.hidden = !p; out.textContent = ''; draw(); if (!p) return;
      f.name.value = p.name; f.version.value = p.version; f.description.value = p.description; f.code.value = p.code; f.enabled.checked = p.enabled; f.network.value = p.network.join(', ');
      f.querySelectorAll('[name=perm]').forEach(c => { c.checked = p.permissions.includes(c.value); });
      f.querySelector('.pl-net').hidden = !p.permissions.includes('network');
    };
    const read = () => { const perms = [...f.querySelectorAll('[name=perm]:checked')].map(c => c.value); return this.pluginSanitize({ ...cur, name: f.name.value.trim() || 'Untitled plugin', version: f.version.value.trim(), description: f.description.value.trim(), code: f.code.value, permissions: perms, network: f.network.value.split(','), enabled: f.enabled.checked, updated: Date.now() }); };
    const save = (quiet) => {
      const p = read(); if (!p) { print('error', `Code is too long (limit ${PLUGIN_LIMITS.code / 1000} KB)`); return null; }
      const i = this.plugins.findIndex(x => x.id === p.id); if (i >= 0) this.plugins[i] = p; else this.plugins.push(p);
      this.pluginsSave(); cur = p; dirty = false; draw(); if (!quiet) print('ok', `Saved “${p.name}”.`); return p;
    };
    f.addEventListener('input', (e) => { dirty = true; if (e.target.name === 'perm') f.querySelector('.pl-net').hidden = !f.querySelector('[name=perm][value=network]').checked; });
    f.addEventListener('submit', (e) => e.preventDefault());
    f.code.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); const t = f.code, s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); dirty = true; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); el.querySelector('[data-pl=run]').click(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); save(); }
      e.stopPropagation(); // typing here never triggers app shortcuts
    });
    listEl.addEventListener('click', (e) => { const li = e.target.closest('[data-id]'); if (li) load(this.plugins.find(p => p.id === li.dataset.id)); });
    listEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const li = e.target.closest('[data-id]'); if (li) { e.preventDefault(); load(this.plugins.find(p => p.id === li.dataset.id)); } } });
    el.querySelector('.pl-tpl').addEventListener('change', (e) => {
      const t = PLUGIN_TEMPLATES.find(x => x.id === e.target.value); e.target.value = ''; if (!t) return;
      const p = this.pluginSanitize({ name: t.name, description: t.description, permissions: t.permissions, code: t.code, enabled: true });
      this.plugins.push(p); this.pluginsSave(); load(p); print('ok', 'Template added. Press ▶ Run to try it (Ctrl+Enter).');
    });
    el.querySelector('.pl-studio').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pl]'); if (!b) return;
      const act = b.dataset.pl;
      if (act === 'import') { this.pluginImportFile(); setTimeout(draw, 1500); return; }
      if (!cur) return;
      if (act === 'save') save();
      if (act === 'export') { const p = save(true); if (p) this.pluginExport(p); }
      if (act === 'delete') { this.plugins = this.plugins.filter(x => x.id !== cur.id); try { localStorage.removeItem(`designstudio.plugin.${cur.id}`); } catch (_) { /* */ } this.pluginsSave(); load(null); Utils.toast('Plugin deleted', '🗑'); }
      if (act === 'run') {
        const p = read(); if (!p) return; out.textContent = ''; print('info', `Running “${p.name}”…`); b.disabled = true;
        const r = await this.pluginRun(p, { log: print }); b.disabled = false;
        if (r.ok) print('ok', `Finished in ${r.ms} ms · ${r.writes} change${r.writes === 1 ? '' : 's'}${r.writes ? ' (one undo step)' : ''}.`);
      }
      if (act === 'ai') this.pluginAIWrite(f, print, () => { dirty = true; });
    });
    if (selectId) load(this.plugins.find(p => p.id === selectId)); else draw();
    const closeBtn = el.querySelector('.ds-dialog-actions button');
    closeBtn?.addEventListener('click', () => { if (dirty && cur) save(true); }, true);
    return { el, close };
  },
  async pluginAIWrite(f, print, touched) {
    const ask = f.ai.value.trim(); if (!ask) { f.ai.focus(); return; }
    if (!this.aiComplete || !(this.aiLLMs?.() || []).length) { print('warn', 'Connect an AI first (AI panel › Add connection), then try again.'); return; }
    const sys = `You write DesignStudio plugins. Output ONLY JavaScript (no markdown fences, no explanation). The code is the BODY of an async function. Available API (all return promises):
ds.selection(), ds.layers(), ds.get(id) → layer objects {id,type,name,x,y,width,height,rotation,opacity,cornerRadius,visible,locked,fills:[{type:'solid',color:'#rrggbb',opacity}],strokes:[{color,width}],text,fontSize,fontFamily,fontWeight,textAlign}
ds.create(type, props) → id (type: ${SHAPE_TYPES.join(', ')}); ds.update(id, props); ds.remove(ids); ds.select(ids)
ds.ask(title, [{name,label,type:'number'|'text'|'color'|'select'|'checkbox',value,options}]) → values object or null if cancelled
ds.viewport() → {cx,cy,x,y,width,height}; ds.notify(text); ds.storage.get(key)/set(key,value); ds.fetch(url) → {status,ok,text} (https, allowed domains only)
console.log(...) prints to the output. No DOM, no window, no fetch other than ds.fetch. Keep it under 120 lines. Handle an empty selection with ds.notify.`;
    const msg = `${f.code.value.trim() ? `Current code:\n${f.code.value}\n\nChange it: ` : 'Write a plugin that: '}${ask}`;
    print('info', 'Asking AI…');
    try {
      const r = await this.aiComplete({ system: sys, messages: [{ role: 'user', content: msg }] });
      let code = String(r.text || r.content || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/, '');
      if (!code) throw new Error('the reply was empty');
      f.code.value = code; touched();
      const need = { read: /ds\.(selection|layers|get)\(/, write: /ds\.(create|update|remove|select)\(/, ui: /ds\.ask\(/, network: /ds\.fetch\(/ };
      for (const [k, re] of Object.entries(need)) if (re.test(code)) f.querySelector(`[name=perm][value=${k}]`).checked = true;
      f.querySelector('.pl-net').hidden = !f.querySelector('[name=perm][value=network]').checked;
      print('ok', `AI wrote ${code.split('\n').length} lines (${r.conn?.name || 'AI'}). Read it, then ▶ Run. Permissions were ticked to match the code.`);
    } catch (e) { print('error', `AI couldn't write it: ${e.message}`); }
  },
};
Object.assign(StudioApp.prototype, PluginsMixin);
