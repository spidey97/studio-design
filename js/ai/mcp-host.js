/**
 * DesignStudio — AI apps over MCP (v3.12.0).
 * Lets Claude Desktop, Claude Code, Cursor, VS Code and other MCP apps read and edit the open file through the local
 * bridge in /mcp/designstudio-mcp.mjs. The tab polls the bridge on 127.0.0.1 (nothing leaves the computer), runs the
 * requested tool and posts the result back. Off until the user turns it on in ✦ AI › AI apps; Read only or Read & edit;
 * optional approval before each change; every change is one undoable step and is listed in the tab.
 */
'use strict';

const MCPHOST_KEY = 'designstudio.mcphost.v1';
const MCP_EDIT_TOOLS = new Set(['apply_operations']);

const McpHostMixin = {
  bindMcpHost() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(MCPHOST_KEY) || '{}') || {}; } catch (_) { /* storage blocked */ }
    this.mcpHost = { settings: Object.assign({ enabled: false, access: 'edit', ask: false, port: 3845 }, saved), status: 'off', bridge: null, calls: [], ctrl: null, error: '' };
    this.commands.mcpApps = { run: () => this.toggleAI(true, 'apps') };
    const view = document.getElementById('dropdown-view');
    const ai = view?.querySelector('[data-action="aiStudio"]');
    if (view) {
      const it = document.createElement('div');
      it.className = 'dropdown-item'; it.dataset.action = 'mcpApps'; it.setAttribute('role', 'menuitem'); it.tabIndex = -1;
      it.innerHTML = 'AI apps (MCP)… <span class="dropdown-shortcut">Ctrl+Alt+M</span>';
      ai ? ai.after(it) : view.insertBefore(it, view.firstChild);
    }
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'm') { e.preventDefault(); e.stopImmediatePropagation(); this.toggleAI(true, 'apps'); }
    }, true);
    // status-bar pill
    const sb = document.querySelector('#status-bar > div:last-child') || document.getElementById('status-bar');
    if (sb) {
      const pill = document.createElement('button');
      pill.type = 'button'; pill.id = 'sb-mcp'; pill.className = 'sb-mcp'; pill.hidden = true;
      pill.addEventListener('click', () => this.toggleAI(true, 'apps'));
      sb.insertBefore(pill, sb.firstChild);
    }
    this.mcpRenderPill();
    if (this.mcpHost.settings.enabled) this.mcpStart();
  },
  mcpSave() { try { localStorage.setItem(MCPHOST_KEY, JSON.stringify(this.mcpHost.settings)); } catch (_) { /* ignore */ } },
  mcpSetStatus(status, error = '') {
    const H = this.mcpHost, changed = H.status !== status || H.error !== error;
    H.status = status; H.error = error;
    if (changed) { this.mcpRenderPill(); if (this.aiTab === 'apps') this.renderAI(); }
  },
  mcpRenderPill() {
    const p = document.getElementById('sb-mcp'), H = this.mcpHost;
    if (!p) return;
    p.hidden = !H.settings.enabled;
    const apps = H.bridge?.clients?.length ? H.bridge.clients.join(', ') : '';
    p.className = `sb-mcp ${H.status}`;
    p.textContent = H.status === 'connected' ? `● AI apps${apps ? ': ' + apps : ''}` : '○ AI apps: waiting';
    p.title = H.status === 'connected' ? 'AI apps can use this file — click for settings' : 'Waiting for the DesignStudio bridge — click for setup';
  },

  // ------------------------------------------------------------------ link to the bridge
  mcpStart() {
    const H = this.mcpHost;
    if (H.ctrl) return;
    H.ctrl = new AbortController();
    this.mcpSetStatus('searching');
    this.mcpLoop(H.ctrl.signal);
  },
  mcpStop() {
    const H = this.mcpHost;
    H.ctrl?.abort(); H.ctrl = null; H.bridge = null;
    this.mcpSetStatus('off');
  },
  /** v3.20.0: pairing secret for the local bridge (kept for this browser tab). */
  mcpBridgeHeaders() {
    if (!this.mcpHost.secret) { try { this.mcpHost.secret = sessionStorage.getItem('designstudio.bridge') || ''; } catch (_) { this.mcpHost.secret = ''; } }
    return this.mcpHost.secret ? { 'x-ds-bridge': this.mcpHost.secret } : {};
  },
  mcpBase() { return `http://127.0.0.1:${Number(this.mcpHost.settings.port) || 3845}`; },
  async mcpLoop(signal) {
    let wait = 1500;
    while (!signal.aborted) {
      try {
        const q = new URLSearchParams({ v: APP_VERSION, title: this.title || 'Untitled', access: this.mcpHost.settings.access });
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 30000);
        signal.addEventListener('abort', () => ctl.abort(), { once: true });
        const r = await fetch(`${this.mcpBase()}/bridge/poll?${q}`, { signal: ctl.signal, cache: 'no-store', headers: this.mcpBridgeHeaders() });
        clearTimeout(tm);
        const sec = r.headers.get('x-ds-bridge'); if (sec) { this.mcpHost.secret = sec; try { sessionStorage.setItem('designstudio.bridge', sec); } catch (_) {} } // paired (v3.20.0)
        if (r.status === 409) throw new Error('another DesignStudio tab is using this bridge');
        if (!r.ok) throw new Error(`bridge answered ${r.status}`);
        const j = await r.json();
        this.mcpHost.bridge = j.bridge || this.mcpHost.bridge;
        this.mcpSetStatus('connected'); this.mcpRenderPill();
        wait = 1500;
        for (const call of j.calls || []) {
          const res = await this.mcpExec(call);
          await fetch(`${this.mcpBase()}/bridge/result`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ds-bridge': this.mcpHost.secret || '' }, body: JSON.stringify({ id: call.id, ...res }) }).catch(() => {});
        }
      } catch (e) {
        if (signal.aborted) return;
        this.mcpHost.bridge = null;
        this.mcpSetStatus('searching', e.name === 'TypeError' ? '' : e.message);
        await new Promise(r => setTimeout(r, wait));
        wait = Math.min(6000, wait * 1.5);
      }
    }
  },

  // ------------------------------------------------------------------ tools
  async mcpExec(call) {
    const H = this.mcpHost, t0 = performance.now();
    const entry = { at: new Date().toISOString(), client: call.client || 'AI app', tool: call.tool, ok: true, text: '' };
    const text = (s) => ({ content: [{ type: 'text', text: typeof s === 'string' ? s : JSON.stringify(s, null, 1) }] });
    let res;
    try {
      if (MCP_EDIT_TOOLS.has(call.tool) && H.settings.access !== 'edit') res = { isError: true, ...text('This DesignStudio file is shared read-only. Ask the user to switch ✦ AI › AI apps › Access to “Read & edit”.') };
      else {
        const fn = this[`mcpTool_${call.tool}`];
        res = fn ? await fn.call(this, call.args || {}, call, entry) : { isError: true, ...text(`Unknown tool ${call.tool}`) };
        if (!res.content) res = text(res);
      }
    } catch (e) { res = { isError: true, ...text(`DesignStudio error: ${e.message}`) }; }
    entry.ok = !res.isError; entry.ms = Math.round(performance.now() - t0);
    if (!entry.text) entry.text = res.isError ? (res.content?.[0]?.text || 'failed').slice(0, 160) : call.tool.replace(/_/g, ' ');
    H.calls.unshift(entry); H.calls = H.calls.slice(0, 60);
    this.aiLog?.(entry.ok ? 'tool' : 'error', `${entry.client} → ${call.tool}: ${entry.text}`);
    if (this.aiTab === 'apps') this.renderAI();
    return res;
  },
  mcpFind(idOrName) {
    const m = this.model;
    if (!idOrName) return null;
    return m.getElementById(idOrName) || m.elements.find(e => e.name === idOrName) || m.elements.find(e => e.name.toLowerCase() === String(idOrName).toLowerCase()) || null;
  },
  mcpNode(el, depth = 2) {
    const m = this.model, p = el.parentId ? m.getElementById(el.parentId) : null;
    const o = { id: el.id, type: el.isComponentSet ? 'componentSet' : el.isComponentMaster ? 'component' : el.isComponentInstance ? 'instance' : el.type, name: el.name, x: Math.round(el.x - (p ? p.x : 0)), y: Math.round(el.y - (p ? p.y : 0)), width: Math.round(el.width), height: Math.round(el.height) };
    if (el.rotation) o.rotation = Math.round(el.rotation);
    if (!el.visible) o.visible = false;
    if (el.opacity < 1) o.opacity = Utils.round(el.opacity, 2);
    const fills = el.fills.filter(f => f.visible !== false).map(f => (f.type === 'solid' ? Utils.toHex(f.color) : `${f.type}(${(f.stops || []).map(s => Utils.toHex(s.color)).join(' → ')})`));
    if (fills.length) o.fills = fills;
    if (el.strokes?.length) o.strokes = el.strokes.filter(s => s.visible !== false).map(s => `${Utils.toHex(s.color)} ${s.width}px`);
    if (el.cornerRadius) o.radius = el.cornerRadius;
    if (el.effects?.length) o.effects = el.effects.filter(e => e.visible !== false).map(e => e.type);
    if (el.type === 'text') Object.assign(o, { text: el.text.slice(0, 2000), fontSize: el.fontSize, fontWeight: el.fontWeight, fontFamily: String(el.fontFamily).split(',')[0], align: el.textAlign, lineHeight: el.lineHeight || 'auto' });
    if (el.isAutoLayout) o.layout = { direction: el.layoutDirection, gap: el.layoutGap, padding: [el.layoutPaddingTop, el.layoutPaddingRight, el.layoutPaddingBottom, el.layoutPaddingLeft], align: el.layoutAlign, sizing: [el.primarySizing, el.counterSizing] };
    if (el.isComponentInstance) { const mc = m.findAnywhere(el.masterComponentId); o.component = mc ? (this.componentSetOf?.(mc) ? `${this.componentSetOf(mc).name} / ${mc.name}` : mc.name) : '(missing)'; }
    if (el.bindings) o.tokens = Object.fromEntries(Object.entries(el.bindings).map(([k, id]) => [k, m.varById?.(id)?.name || id]));
    if (el.interactions?.length) o.interactions = el.interactions.map(i => ({ trigger: i.trigger, action: i.action, target: i.targetId ? (m.findAnywhere(i.targetId)?.name || i.targetId) : undefined, transition: i.transition }));
    const kids = m.childrenOf(el.id);
    if (kids.length) { if (depth > 0) o.children = kids.map(k => this.mcpNode(k, depth - 1)); else o.childCount = kids.length; }
    return o;
  },
  mcpTool_get_document() {
    const m = this.model, sel = m.topSelected();
    const D = m.dsVars?.() || { collections: [], vars: [] };
    return {
      title: this.title, app: `DesignStudio ${APP_VERSION}`, access: this.mcpHost.settings.access,
      pages: m.pages.map(p => ({ id: p.id, name: p.name, current: p.id === m.page.id, layers: p.elements.length, frames: p.elements.filter(e => !e.parentId && e.type === 'frame').map(f => ({ id: f.id, name: f.name, width: Math.round(f.width), height: Math.round(f.height), x: Math.round(f.x), y: Math.round(f.y), kind: f.isComponentSet ? 'component set' : f.isComponentMaster ? 'component' : 'frame' })) })),
      selection: sel.map(s => ({ id: s.id, name: s.name, type: s.type })),
      components: m.masters().slice(0, 100).map(c => { const s = this.componentSetOf?.(c); return { id: c.id, name: s ? `${s.name} / ${c.name}` : c.name }; }),
      variables: D.collections.map(c => ({ collection: c.name, modes: c.modes.map(x => x.name), count: D.vars.filter(v => v.collectionId === c.id).length })),
      textStyles: m.styles.texts.map(t => `${t.name} ${t.fontSize}/${t.fontWeight}`),
      prototype: { startingFrame: m.prototypeSettings?.startingFrameId || null, frames: m.roots().filter(f => f.type === 'frame' && m.descendantsOf(f.id).concat([f]).some(e => e.interactions?.length)).map(f => f.name) },
      scene3d: m.scene3d?.objects?.length ? `${m.scene3d.objects.length} objects — call get_scene3d` : 'empty',
      note: 'Coordinates are in pixels; child x/y are relative to the parent. Only the current page can be edited and screenshotted.'
    };
  },
  mcpTool_get_selection(a) {
    const sel = this.model.topSelected();
    if (!sel.length) return 'Nothing is selected in DesignStudio. Ask the user to select a layer, or use get_document / find_nodes.';
    return sel.slice(0, 20).map(s => this.mcpNode(s, Math.min(6, a.depth ?? 3)));
  },
  mcpTool_get_node(a) {
    const el = this.mcpFind(a.id);
    if (!el) return { isError: true, content: [{ type: 'text', text: `No layer “${a.id}” on the current page. Use find_nodes.` }] };
    return this.mcpNode(el, Math.min(6, a.depth ?? 2));
  },
  mcpTool_find_nodes(a) {
    const m = this.model, q = String(a.query || '').toLowerCase(), lim = Math.min(200, a.limit || 50);
    const typeOf = (e) => (e.isComponentMaster ? 'component' : e.isComponentInstance ? 'instance' : e.type);
    const out = [];
    for (const e of m.elements) {
      if (a.type && typeOf(e) !== a.type && !(a.type === 'frame' && e.type === 'frame')) continue;
      if (q && !e.name.toLowerCase().includes(q) && !(e.type === 'text' && e.text.toLowerCase().includes(q))) continue;
      out.push({ id: e.id, type: typeOf(e), name: e.name, width: Math.round(e.width), height: Math.round(e.height), parent: e.parentId ? m.getElementById(e.parentId)?.name : null, ...(e.type === 'text' ? { text: e.text.slice(0, 80) } : {}) });
      if (out.length >= lim) break;
    }
    return { count: out.length, layers: out };
  },
  mcpTool_get_screenshot(a) {
    const m = this.model;
    let roots = a.id ? [this.mcpFind(a.id)].filter(Boolean) : m.topSelected();
    if (a.id && !roots.length) return { isError: true, content: [{ type: 'text', text: `No layer “${a.id}” on the current page.` }] };
    if (!roots.length) roots = m.roots().filter(r => r.type === 'frame').slice(0, 1);
    if (!roots.length) roots = m.roots();
    if (!roots.length) return 'The page is empty.';
    const b = Utils.unionBounds(roots.map(r => Utils.aabb(r)));
    const maxSize = Math.min(2048, a.maxSize || 1280);
    const scale = Math.max(0.05, Math.min(a.scale || 1, maxSize / Math.max(b.w, b.h, 1)));
    const hasBg = roots.length === 1 && roots[0].type === 'frame' && roots[0].fills.some(f => f.visible !== false);
    const c = this.renderer.renderToCanvas({ roots, scale, bg: hasBg ? null : m.page.bg });
    const data = c.toDataURL('image/png').split(',')[1];
    return { content: [{ type: 'image', data, mimeType: 'image/png' }, { type: 'text', text: `${roots.map(r => `“${r.name}” (${r.id})`).join(', ')} — ${Math.round(b.w)}×${Math.round(b.h)} px at ${Utils.round(scale, 2)}×` }] };
  },
  mcpTool_get_code(a) {
    const m = this.model;
    const roots = a.id ? [this.mcpFind(a.id)].filter(Boolean) : m.topSelected();
    if (!roots.length) return { isError: true, content: [{ type: 'text', text: a.id ? `No layer “${a.id}”.` : 'Nothing selected — pass an id.' }] };
    const fmt = a.format || 'html';
    const code = fmt === 'svg' ? Exporters.svgDocument(m, roots) : Exporters.code(m, roots, { type: 'page', framework: fmt === 'html' ? 'html' : fmt, cssMode: a.css === 'tailwind' ? 'tailwind' : 'plain', title: this.title });
    return code;
  },
  mcpTool_get_design_system() {
    const m = this.model, D = m.dsVars?.() || { collections: [], vars: [] };
    return {
      variables: D.collections.map(c => ({ collection: c.name, modes: c.modes.map(x => x.name), variables: D.vars.filter(v => v.collectionId === c.id).map(v => ({ name: v.name, type: v.type, value: m.varDisplay?.(v), description: v.description || undefined })) })),
      colorStyles: m.styles.colors.map(c => ({ name: c.name, color: Utils.toHex(c.color) })),
      textStyles: m.styles.texts.map(t => ({ name: t.name, fontFamily: String(t.fontFamily).split(',')[0], fontSize: t.fontSize, fontWeight: t.fontWeight, lineHeight: t.lineHeight || 'auto', letterSpacing: t.letterSpacing || 0 })),
      effectStyles: m.styles.effects.map(e => ({ name: e.name, effects: e.effects.map(x => x.type) })),
      components: m.masters().map(c => { const s = this.componentSetOf?.(c); return { id: c.id, name: c.name, set: s?.name, width: Math.round(c.width), height: Math.round(c.height), properties: (s || c).componentProps?.map(p => `${p.name} (${p.type})`) }; }),
      tokens: JSON.parse(Exporters.tokens(m))
    };
  },
  async mcpTool_apply_operations(a, call, entry) {
    const ops = a.operations;
    const dry = this.aiApplyOps(ops, { dry: true });
    if (dry.errors.length) return { isError: true, content: [{ type: 'text', text: `Nothing was changed. Fix these and try again:\n- ${dry.errors.join('\n- ')}` }] };
    const summary = this.aiSummary(dry.summary), label = String(a.label || '').slice(0, 80) || summary;
    if (this.mcpHost.settings.ask) {
      const ok = await this.confirm(`${call.client || 'An AI app'} wants to change this file`, `${label}\n(${summary}) — you can undo it with Ctrl+Z.`, 'Allow');
      if (!ok) { entry.text = `declined: ${label}`; return { isError: true, content: [{ type: 'text', text: 'The user declined this change. Ask what they would like instead.' }] }; }
    }
    if (this.section && this.section !== 'design') this.setSection?.('design');
    const res = this.aiApplyOps(ops);
    this._actionLabel = `${call.client || 'AI app'}: ${label}`;
    this.commit();
    if (a.select !== false && res.created.length) { this.model.select(res.created); this.zoomSelection?.(); this.selectionChanged(); }
    entry.text = `${label} (${summary})`; entry.undo = true;
    Utils.toast(`${call.client || 'AI app'}: ${label}`, '✦', { action: { label: 'Undo', run: () => this.run('undo') } });
    return { applied: summary, ids: res.refs || {}, createdTopLevel: res.created, warnings: res.warnings.length ? res.warnings : undefined, errors: res.errors.length ? res.errors : undefined, next: 'Call get_screenshot to check the result.' };
  },
  mcpTool_select_nodes(a) {
    const m = this.model;
    const els = (a.ids || []).map(id => this.mcpFind(id)).filter(Boolean);
    if (!els.length) return { isError: true, content: [{ type: 'text', text: 'None of those layers exist on the current page.' }] };
    m.select(els.map(e => e.id)); this.selectionChanged();
    if (a.zoom !== false) this.zoomSelection?.();
    return `Selected ${els.length} layer${els.length === 1 ? '' : 's'}: ${els.map(e => e.name).join(', ')}`;
  },
  mcpTool_get_scene3d() {
    const s = this.model.scene3d;
    if (!s?.objects?.length) return 'The 3D section is empty.';
    const byId = new Map(s.objects.map(o => [o.id, o]));
    return {
      settings: { background: s.settings?.bg, camera: s.settings?.camera, orbit: s.settings?.orbit, fog: s.settings?.fog },
      objects: s.objects.map(o => ({ id: o.id, type: o.type, name: o.name, parent: o.parent ? byId.get(o.parent)?.name : null, visible: o.visible !== false, position: [o.px, o.py, o.pz].map(v => Utils.round(v || 0, 2)), rotation: [o.rx, o.ry, o.rz].map(v => Math.round(v || 0)), scale: [o.sx, o.sy, o.sz].map(v => Utils.round(v ?? 1, 2)), color: o.mat?.color, text: o.geo?.text })),
      triggers: (this.model.triggers || []).filter(t => t.scope === '3d').map(t => `${t.name || t.event.type}: ${t.event.type}${t.target ? ' on ' + (byId.get(t.target)?.name || t.target) : ''} → ${t.actions.map(x => x.type).join(', ')}`)
    };
  },

  // ------------------------------------------------------------------ AI apps tab
  mcpBridgePath() {
    if (location.protocol !== 'file:') return null;
    let p = decodeURIComponent(location.pathname).replace(/\/[^/]*$/, '');
    const win = /^\/[A-Za-z]:/.test(p);
    if (win) p = p.slice(1).replace(/\//g, '\\');
    const sub = window.DSEmbed?.single ? '' : (win ? 'mcp\\' : 'mcp/'); // single file: the bridge is saved next to DesignStudio.html
    return win ? `${p}\\${sub}designstudio-mcp.mjs` : `${p}/${sub}designstudio-mcp.mjs`;
  },
  aiRenderApps(body) {
    const H = this.mcpHost, S = H.settings, esc = Utils.escapeHtml;
    const bridge = this.mcpBridgePath(), shown = bridge || '<path to Studio-design>/mcp/designstudio-mcp.mjs';
    const win = /^[A-Za-z]:\\/.test(shown) || /Win/.test(navigator.platform);
    const folder = bridge ? bridge.replace(/[\\/][^\\/]+$/, '') : null;
    const desktopCfg = JSON.stringify({ mcpServers: { designstudio: { command: 'node', args: [shown] } } }, null, 2);
    const ccCmd = `claude mcp add designstudio --scope user -- node "${shown}"`;
    const url = `${this.mcpBase()}/mcp`;
    const st = !S.enabled ? ['off', 'Off — AI apps can’t see this file.'] : H.status === 'connected'
      ? ['ok', `Connected${H.bridge?.clients?.length ? ` to ${esc(H.bridge.clients.join(', '))}` : ''} · bridge ${esc(H.bridge?.version || '')}${H.bridge?.clients?.length ? '' : ' — ask your AI app something about this file'}`]
      : ['wait', 'Waiting for an AI app. Connect one below (one-time setup), then open it — it starts the bridge for you.'];
    const recent = H.calls.slice(0, 12);
    const card = (k, title, html) => `<details class="mh-card"${k === H.openCard ? ' open' : ''} data-card="${k}"><summary><b>${title}</b></summary>${html}</details>`;
    const codeBox = (id, txt) => `<div class="ai-code"><div class="ai-code-h"><span>${id}</span><button type="button" data-copy="${esc(id)}">Copy</button></div><pre data-src="${esc(id)}">${esc(txt)}</pre></div>`;
    body.innerHTML = `<div class="ai-scroll mh">
      <div class="mh-hero">
        <h3>Let AI apps use DesignStudio</h3>
        <p class="muted-text">Claude, Cursor, VS Code and other MCP apps can read this file, look at screenshots, write code from it, and make changes you can undo. Everything stays on this computer.</p>
        <label class="mh-switch"><input type="checkbox" id="mh-enabled"${S.enabled ? ' checked' : ''}><span>Let AI apps use this file</span></label>
        <p class="mh-status ${st[0]}" role="status"><i aria-hidden="true"></i>${st[1]}</p>
        ${S.enabled ? `<div class="mh-row"><span class="mh-lbl">Access</span><div class="mh-seg" role="radiogroup" aria-label="Access">
          <button type="button" role="radio" data-access="read" aria-checked="${S.access === 'read'}" class="${S.access === 'read' ? 'on' : ''}">Read only</button>
          <button type="button" role="radio" data-access="edit" aria-checked="${S.access === 'edit'}" class="${S.access === 'edit' ? 'on' : ''}">Read &amp; edit</button></div></div>
        <label class="mh-check"><input type="checkbox" id="mh-ask"${S.ask ? ' checked' : ''}${S.access === 'read' ? ' disabled' : ''}> Ask me before each change</label>` : ''}
      </div>
      ${window.DSEmbed?.single ? '<div class="mh-sec"><b>First, save the bridge</b></div><p class="muted-text">This single-file DesignStudio carries its AI bridge inside. Save it, then move the files into the same folder as <b>DesignStudio.html</b>.</p><p><button type="button" class="btn-primary" data-a="saveBridge">Save bridge files</button></p>' : ''}
      <div class="mh-sec"><b>Connect an app</b> <span class="muted-text">· one-time · needs <a href="https://nodejs.org" target="_blank" rel="noopener">Node.js 18+</a></span></div>
      ${card('desktop', 'Claude Desktop', `${win && folder ? `<p>Easiest: double-click <b>Connect-Claude-Desktop.cmd</b> in <code>${esc(folder)}</code>, then restart Claude Desktop.</p><p class="muted-text">Or add this to Claude › Settings › Developer › Edit config:</p>` : '<p>Add this to Claude › Settings › Developer › Edit config, then restart Claude Desktop:</p>'}${codeBox('claude_desktop_config.json', desktopCfg)}`)}
      ${card('code', 'Claude Code', `<p>Run once in a terminal:</p>${codeBox('Terminal', ccCmd)}`)}
      ${card('cursor', 'Cursor · Windsurf · VS Code', `${win && folder ? '<p>Cursor: double-click <b>Connect-Cursor.cmd</b>, then restart Cursor.</p>' : ''}<p class="muted-text">Or add the same server to the app’s MCP settings (VS Code: <code>.vscode/mcp.json</code> → <code>"servers"</code>):</p>${codeBox('mcp.json', desktopCfg)}<p class="muted-text">Apps that take a URL can use <code>${esc(url)}</code> while a bridge is running (<code>node designstudio-mcp.mjs --http</code>).</p>`)}
      ${!bridge ? '<p class="ai-warn">This copy of DesignStudio isn’t opened from your computer, so it can’t reach the bridge. Open <b>index.html</b> from your Studio-design folder.</p>' : ''}
      <div class="mh-sec"><b>Try asking your AI app</b></div>
      <div class="ai-examples mh-ex">${['Describe the selected frame and what could be improved.', 'Using my variables and components, add a pricing section to this file.', 'Turn the selected frame into React with Tailwind.', 'Check this file for contrast and spacing problems and fix them.'].map(t => `<button type="button" data-ex="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="mh-sec"><b>Recent requests</b>${recent.some(r => r.undo) ? '<span class="ai-sp"></span><button type="button" class="ai-mini" data-a="undo">Undo last change</button>' : ''}</div>
      ${recent.length ? `<ul class="ai-log mh-log">${recent.map(r => `<li class="${r.ok ? 'ok' : 'error'}"><span>${r.ok ? (r.undo ? '✎' : '👁') : '⛔'}</span><time>${new Date(r.at).toLocaleTimeString()}</time><p><b>${esc(r.client)}</b> · ${esc(r.text)}</p></li>`).join('')}</ul>` : '<p class="muted-text">Nothing yet. Requests from AI apps show up here.</p>'}
      <details class="mh-adv"><summary>Advanced</summary><label class="mh-row"><span class="mh-lbl">Bridge port</span><input type="number" id="mh-port" min="1024" max="65535" value="${Number(S.port) || 3845}"></label><p class="muted-text">Change only if 3845 is taken; start the bridge with <code>DESIGNSTUDIO_MCP_PORT</code> set to the same number. Websites can’t use the bridge: it only accepts this DesignStudio tab and local AI apps.</p></details>
    </div>`;
    const $ = (s) => body.querySelector(s);
    $('#mh-enabled').addEventListener('change', (e) => { S.enabled = e.target.checked; this.mcpSave(); S.enabled ? this.mcpStart() : this.mcpStop(); this.mcpRenderPill(); this.renderAI(); });
    body.querySelectorAll('[data-access]').forEach(b => b.addEventListener('click', () => { S.access = b.dataset.access; this.mcpSave(); this.renderAI(); }));
    $('#mh-ask')?.addEventListener('change', (e) => { S.ask = e.target.checked; this.mcpSave(); });
    $('#mh-port')?.addEventListener('change', (e) => { const v = Math.round(Number(e.target.value)); if (v >= 1024 && v <= 65535) { S.port = v; this.mcpSave(); if (S.enabled) { this.mcpStop(); this.mcpStart(); } } });
    body.querySelectorAll('details.mh-card').forEach(d => d.addEventListener('toggle', () => { if (d.open) H.openCard = d.dataset.card; }));
    body.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const txt = body.querySelector(`pre[data-src="${CSS.escape(b.dataset.copy)}"]`)?.textContent || '';
      const ok = await Utils.copyText(txt); b.textContent = ok ? 'Copied' : 'Select & copy'; setTimeout(() => { b.textContent = 'Copy'; }, 1500);
    }));
    body.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', async () => { const ok = await Utils.copyText(b.dataset.ex); Utils.toast(ok ? 'Prompt copied — paste it into your AI app' : b.dataset.ex, '📋'); }));
    $('[data-a="undo"]')?.addEventListener('click', () => this.run('undo'));
    $('[data-a="saveBridge"]')?.addEventListener('click', () => this.saveBridgeFiles());
  }
};
Object.assign(StudioApp.prototype, McpHostMixin);
