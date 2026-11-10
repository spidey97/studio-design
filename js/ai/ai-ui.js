/**
 * DesignStudio — AI Studio (v3.9.0): drawer with Playground (chat that designs on the canvas), Connections
 * (paste any key / link / MCP URL — auto-detected and tested), Doctor (self-healing checks with one-click fixes)
 * and Activity (every request, retry, failover and repair).
 */
'use strict';

const AI_FALLBACK_COLORS = { 'color/background': '#ffffff', 'color/surface': '#f4f5f7', 'color/text': '#111118', 'color/text-muted': '#5c5f6a', 'color/primary': '#0d99ff', 'color/on-primary': '#ffffff', 'color/border': '#e1e3e8', 'color/secondary': '#eef2ff', 'color/on-secondary': '#3730a3' };
const AI_CHIPS = [
  ['✦', 'Generate screen', 'Design a mobile screen for: '],
  ['✎', 'Edit selection', 'Change the selected layers: '],
  ['◎', 'Critique', 'Critique the selected design (or the current page) for UX, hierarchy, accessibility and consistency with our tokens. Give the 5 most important fixes, then apply the safe ones.'],
  ['¶', 'Write copy', 'Rewrite the text in the selection to be clearer and shorter, keeping the tone.'],
  ['⬡', 'Tokens', 'Create design tokens (variables with Light and Dark values) for: '],
  ['</>', 'Code', 'Write production-ready React + CSS for the selection. Use our tokens as CSS variables. One file.'],
  ['🩺', 'Fix issues', '/doctor']
];

const AIStudioMixin = {
  // =================================================================== boot
  bindAIStudio() {
    this.ai = AIStore.load();
    this.ai.runtimeErrors = [];
    this.aiMcp = new Map();
    // capture runtime errors for the Doctor (self-healing)
    const capture = (msg, stack) => {
      if (/ResizeObserver loop/.test(msg)) return;
      this.ai.runtimeErrors.push({ msg: String(msg).slice(0, 300), stack: String(stack || '').slice(0, 800), at: new Date().toISOString() });
      this.ai.runtimeErrors = this.ai.runtimeErrors.slice(-30);
      this.aiBadge();
    };
    window.addEventListener('error', (e) => capture(e.message, e.error?.stack));
    window.addEventListener('unhandledrejection', (e) => { if (e.reason?.name !== 'AbortError') capture(e.reason?.message || e.reason, e.reason?.stack); });
    // top-bar button
    const right = document.querySelector('.top-bar-right');
    if (right) {
      const b = document.createElement('button');
      b.id = 'btn-ai'; b.className = 'menu-btn ai-btn'; b.type = 'button';
      b.innerHTML = '<span aria-hidden="true">✦</span> AI<i class="ai-dot" hidden></i>';
      b.title = 'AI Studio (Ctrl+Alt+I)'; b.setAttribute('aria-label', 'AI Studio');
      right.insertBefore(b, right.firstChild);
      b.addEventListener('click', () => this.toggleAI());
    }
    this.commands.aiStudio = { run: () => this.toggleAI(true) };
    const view = document.getElementById('dropdown-view');
    if (view) {
      const it = document.createElement('div');
      it.className = 'dropdown-item'; it.dataset.action = 'aiStudio'; it.setAttribute('role', 'menuitem'); it.tabIndex = -1;
      it.innerHTML = 'AI Studio… <span class="dropdown-shortcut">Ctrl+Alt+I</span>';
      view.insertBefore(it, view.firstChild);
    }
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); e.stopImmediatePropagation(); this.toggleAI(); }
    }, true);
    this.aiBadge();
    // Doctor on open (deterministic checks only, never touches the network)
    if (this.ai.settings.autoDoctor) setTimeout(() => { const n = this.aiDoctorChecks().filter(i => i.level === 'error').length; if (n) Utils.toast(`AI Doctor found ${n} problem${n === 1 ? '' : 's'} in this project`, '🩺', { action: { label: 'Review', run: () => this.toggleAI(true, 'doctor') } }); }, 1500);
  },
  aiSave() { AIStore.save({ connections: this.ai.connections, settings: this.ai.settings, log: this.ai.log, chat: this.ai.chat }); },
  aiLog(kind, text, extra = {}) {
    this.ai.log.push({ at: new Date().toISOString(), kind, text: String(text).slice(0, 500), ...extra });
    this.ai.log = this.ai.log.slice(-200);
    this.aiSave();
    if (this.aiTab === 'activity') this.renderAI();
  },
  aiBadge() {
    const dot = document.querySelector('#btn-ai .ai-dot');
    if (!dot) return;
    const bad = (this.ai?.runtimeErrors?.length || 0) + (this.ai?.connections || []).filter(c => c.enabled !== false && c.status === 'error').length;
    dot.hidden = !bad;
    dot.title = bad ? `${bad} problem${bad === 1 ? '' : 's'} — open Doctor` : '';
  },
  toggleAI(force, tab) {
    let d = document.getElementById('ai-drawer');
    const open = force ?? !(d && d.classList.contains('open'));
    if (!d) {
      d = document.createElement('aside');
      d.id = 'ai-drawer'; d.className = 'ai-drawer'; d.setAttribute('aria-label', 'AI Studio');
      d.innerHTML = `<header class="ai-head"><b>✦ AI Studio</b><nav role="tablist">${[['play', 'Playground'], ['conn', 'Connections'], ['apps', 'AI apps'], ['doctor', 'Doctor'], ['activity', 'Activity']].map(([k, l]) => `<button type="button" role="tab" data-tab="${k}">${l}<em data-badge="${k}"></em></button>`).join('')}</nav><button type="button" class="ai-x" aria-label="Close AI Studio (Esc)" title="Close (Esc)">✕</button></header><div class="ai-body"></div>`;
      document.body.appendChild(d);
      d.querySelector('.ai-x').addEventListener('click', () => this.toggleAI(false));
      d.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { this.aiTab = b.dataset.tab; this.renderAI(); }));
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.querySelector('.ds-dialog-overlay')) { e.preventDefault(); this.toggleAI(false); }
        if (!(e.ctrlKey || e.metaKey) || ['c', 'v', 'x', 'a', 'z', 'y'].includes(e.key.toLowerCase()) && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.stopPropagation();
      });
      ['pointerdown', 'wheel'].forEach(ev => d.addEventListener(ev, (e) => e.stopPropagation()));
      this.aiTab = 'play'; // the offline assistant works without any connection
    }
    if (tab) this.aiTab = tab;
    d.classList.toggle('open', open);
    document.getElementById('btn-ai')?.classList.toggle('active', open);
    if (open) { this.renderAI(); setTimeout(() => (d.querySelector('.ai-input') || d.querySelector('.ai-smart') || d.querySelector('[role="tab"]'))?.focus(), 30); }
  },
  renderAI() {
    const d = document.getElementById('ai-drawer');
    if (!d || !d.classList.contains('open')) return;
    d.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === this.aiTab); b.setAttribute('aria-selected', b.dataset.tab === this.aiTab); });
    const conns = this.ai.connections;
    d.querySelector('[data-badge="conn"]').textContent = conns.length ? (conns.some(c => c.enabled !== false && c.status === 'error') ? '!' : conns.length) : '';
    const issues = this.aiDoctorChecks();
    const n = issues.filter(i => i.level !== 'info').length;
    d.querySelector('[data-badge="doctor"]').textContent = n || '';
    d.querySelector('[data-badge="doctor"]').classList.toggle('warn', issues.some(i => i.level === 'error'));
    const body = d.querySelector('.ai-body');
    const keep = body.querySelector('.ai-input')?.value;
    const refocus = !!document.activeElement?.closest?.('#ai-drawer') || document.activeElement === document.body;
    ({ play: this.aiRenderPlay, conn: this.aiRenderConn, apps: this.aiRenderApps, doctor: this.aiRenderDoctor, activity: this.aiRenderActivity })[this.aiTab].call(this, body, issues);
    const inp = body.querySelector('.ai-input');
    if (keep && inp) inp.value = keep;
    if (refocus && inp && !document.querySelector('.ds-dialog-overlay')) inp.focus({ preventScroll: true });
    else if (refocus && document.activeElement === document.body) d.querySelector('[role="tab"].on')?.focus({ preventScroll: true });
    this.aiBadge();
  },

  // =================================================================== Connections
  aiLLMs() { return this.ai.connections.filter(c => c.type !== 'mcp' && c.enabled !== false); },
  aiRenderConn(body) {
    const S = this.ai.settings;
    const mask = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}` : '—');
    const dot = (c) => `<i class="ai-st ${c.status || 'idle'}" title="${{ ok: 'Working', error: 'Problem', warn: 'Working with warnings', testing: 'Testing…' }[c.status] || 'Not tested'}"></i>`;
    body.innerHTML = `<div class="ai-scroll">
      <div class="ai-add"><label for="ai-smart"><b>Add a connection</b><span>Paste an API key, an AI endpoint link or an MCP server URL — it’s detected and tested automatically.</span></label>
        <div class="ai-add-row"><input id="ai-smart" class="ai-smart" type="text" spellcheck="false" autocomplete="off" placeholder="sk-ant-…  ·  sk-…  ·  AIza…  ·  https://…/mcp  ·  http://localhost:11434"><button type="button" class="btn-primary" data-a="add">Add</button></div>
        <div class="ai-hint">Works with Claude, OpenAI, Gemini, OpenRouter, Groq, xAI, Ollama / LM Studio (local) and any OpenAI-compatible link. MCP servers add tools the AI can use.</div></div>
      ${this.ai.connections.map((c, i) => `<div class="ai-conn" data-id="${c.id}"><div class="ai-conn-h">${dot(c)}<span class="ai-ico">${AI_PROVIDERS[c.type]?.icon || '?'}</span><input type="text" data-k="name" value="${Utils.escapeHtml(c.name)}" aria-label="Connection name"><small>${AI_PROVIDERS[c.type]?.label || c.type}</small>
          ${c.type !== 'mcp' ? `<span class="ai-prio">${i + 1}</span><button type="button" class="ai-mini" data-a="up" aria-label="Higher priority" title="Use earlier in the fallback chain"${i ? '' : ' disabled'}>↑</button>` : ''}<label class="ai-tog" title="Enabled"><input type="checkbox" data-k="enabled"${c.enabled !== false ? ' checked' : ''}><span></span></label></div>
        <div class="ai-conn-b">
          ${c.type === 'compat' || c.type === 'mcp' ? `<label><span>URL</span><input type="url" data-k="url" value="${Utils.escapeHtml(c.url || '')}" spellcheck="false"></label>` : ''}
          <label><span>${c.type === 'mcp' ? 'Token' : 'Key'}</span><span class="ai-keyrow"><input type="password" data-k="key" value="" placeholder="${c.key ? Utils.escapeHtml(mask(c.key)) + ' (saved)' : AI_PROVIDERS[c.type]?.keyHint || ''}" autocomplete="off" spellcheck="false"></span></label>
          ${c.type !== 'mcp' ? `<label><span>Model</span><span class="ai-keyrow"><input type="text" data-k="model" list="ai-models-${c.id}" value="${Utils.escapeHtml(c.model || '')}" placeholder="auto" spellcheck="false"><datalist id="ai-models-${c.id}">${(c.models || AI_PROVIDERS[c.type].models).map(mo => `<option value="${Utils.escapeHtml(mo)}">`).join('')}</datalist></span></label>` : `<div class="ai-tools">${c.tools?.length ? `<b>${c.tools.length} tools</b> ${c.tools.slice(0, 12).map(t => `<code title="${Utils.escapeHtml(t.description)}">${Utils.escapeHtml(t.name)}</code>`).join(' ')}${c.tools.length > 12 ? ' …' : ''}` : '<span class="muted-text">Tools appear after a successful test.</span>'}<label class="ai-check"><input type="checkbox" data-k="trusted"${c.trusted ? ' checked' : ''}> Run tools without asking</label></div>`}
          ${c.lastError ? `<div class="ai-err"><b>${Utils.escapeHtml(AI_ERROR_HELP[c.lastErrorKind] || '')}</b><code>${Utils.escapeHtml(c.lastError)}</code>${this.aiFixFor(c) ? `<button type="button" class="btn-primary" data-a="heal">✚ ${Utils.escapeHtml(this.aiFixFor(c).label)}</button>` : ''}</div>` : c.status === 'ok' ? `<div class="ai-okline">✓ ${Utils.escapeHtml(c.okNote || 'Connected')}</div>` : ''}
          <div class="ai-conn-act"><button type="button" data-a="test">${c.status === 'testing' ? 'Testing…' : 'Test'}</button>${c.type === 'mcp' && c.tools?.length ? '<button type="button" data-a="tool">Try a tool…</button>' : ''}<span class="ai-sp"></span><button type="button" class="danger" data-a="del">Remove</button></div></div></div>`).join('')}
      <details class="ai-settings"><summary>Settings</summary>
        <label class="ai-check"><input type="checkbox" data-s="remember"${S.remember ? ' checked' : ''}> Remember keys on this device (otherwise until the tab closes)</label>
        <label class="ai-check"><input type="checkbox" data-s="autoApply"${S.autoApply ? ' checked' : ''}> Apply AI changes to the canvas without asking</label>
        <label class="ai-check"><input type="checkbox" data-s="autoDoctor"${S.autoDoctor ? ' checked' : ''}> Run Doctor when a project opens</label>
        <label class="ai-num"><span>Timeout</span><input type="number" data-s="timeout" min="10" max="600" value="${S.timeout}"> s</label>
        <label class="ai-num"><span>Retries</span><input type="number" data-s="retries" min="0" max="5" value="${S.retries}"></label>
        <label class="ai-num"><span>Max answer</span><input type="number" data-s="maxTokens" min="256" max="64000" step="256" value="${S.maxTokens}"> tokens</label>
        <p class="ai-hint">🔒 Keys stay in this browser only. They are never saved in project files, versions, exports or share packages.</p>
        <button type="button" class="danger" data-a="forget">Forget all keys</button></details></div>`;
    const smart = body.querySelector('#ai-smart');
    const add = () => this.aiAddFromInput(smart.value);
    body.querySelector('[data-a="add"]').addEventListener('click', add);
    smart.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    smart.addEventListener('paste', () => setTimeout(() => { if (aiDetect(smart.value)?.type && aiDetect(smart.value).type !== 'unknown' && !aiDetect(smart.value).ambiguous) add(); }, 0));
    body.querySelectorAll('.ai-conn').forEach(card => {
      const c = this.ai.connections.find(x => x.id === card.dataset.id);
      card.querySelectorAll('[data-k]').forEach(f => f.addEventListener('change', () => {
        const k = f.dataset.k;
        if (k === 'enabled' || k === 'trusted') c[k] = f.checked;
        else if (k === 'key') { if (!f.value.trim()) return; c.key = f.value.trim(); c.status = null; c.lastError = null; }
        else if (k === 'url') { c.url = aiNormalizeUrl(f.value); c.status = null; }
        else c[k] = f.value.trim();
        this.aiSave();
        if (k === 'key' || k === 'url') this.aiTest(c); else this.renderAI();
      }));
      const act = (a, fn) => card.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
      act('test', () => this.aiTest(c));
      act('heal', () => this.aiHeal(c));
      act('tool', () => this.aiToolRunner(c));
      act('up', () => { const L = this.ai.connections, i = L.indexOf(c); const j = L.slice(0, i).map((x, k) => [x, k]).filter(([x]) => x.type !== 'mcp').pop()?.[1]; if (j === undefined) return; L.splice(i, 1); L.splice(j, 0, c); this.aiSave(); this.renderAI(); });
      act('del', () => { this.ai.connections = this.ai.connections.filter(x => x !== c); this.aiMcp.delete(c.id); this.aiSave(); this.renderAI(); Utils.toast(`Removed “${c.name}”`, '🗑'); });
    });
    body.querySelectorAll('[data-s]').forEach(f => f.addEventListener('change', () => {
      const k = f.dataset.s;
      S[k] = f.type === 'checkbox' ? f.checked : Utils.clamp(Utils.num(f.value, S[k]), Number(f.min), Number(f.max));
      this.aiSave();
    }));
    body.querySelector('[data-a="forget"]').addEventListener('click', () => this.dialog({ title: 'Forget all keys?', body: '<p>Connections stay, but their keys and tokens are erased from this browser.</p>', actions: [{ label: 'Cancel' }, { label: 'Forget keys', primary: true, run: () => { this.ai.connections.forEach(c => { c.key = ''; c.status = null; }); this.aiSave(); this.renderAI(); } }] }));
  },
  async aiAddFromInput(raw) {
    const det = aiDetect(raw);
    if (!det) return;
    if (det.type === 'unknown') {
      this.dialog({ title: 'Which service is this key for?', body: '<p class="muted-text">It doesn’t match a known key format.</p>', actions: [{ label: 'Cancel' }, ...['anthropic', 'openai', 'gemini'].map(t => ({ label: AI_PROVIDERS[t].label, run: () => this.aiAddConn({ type: t, key: det.key, name: AI_PROVIDERS[t].label }) })), { label: 'Other (OpenAI-compatible)', primary: true, run: () => this.aiAddConn({ type: 'compat', key: det.key, url: '', name: 'Custom AI' }) }] });
      return;
    }
    if (det.ambiguous) {
      this.dialog({ title: 'What is this link?', body: `<p><code>${Utils.escapeHtml(det.url)}</code></p>`, actions: [{ label: 'Cancel' }, { label: 'MCP server (tools)', run: () => this.aiAddConn({ ...det, type: 'mcp' }) }, { label: 'AI model endpoint', primary: true, run: () => this.aiAddConn(det) }] });
      return;
    }
    // same key already added → just re-test
    const dup = this.ai.connections.find(c => (det.key && c.key === det.key) || (det.url && !det.key && c.url === det.url && c.type === det.type));
    if (dup) { Utils.toast(`Already connected as “${dup.name}” — re-testing`, 'ℹ️'); this.aiTest(dup); return; }
    this.aiAddConn(det);
  },
  aiAddConn(det) {
    const c = { id: Utils.uid('ai'), type: det.type, name: det.name || AI_PROVIDERS[det.type].label, key: det.key || '', url: det.url || '', model: '', enabled: true, status: null };
    this.ai.connections.push(c);
    this.aiSave();
    const inp = document.getElementById('ai-smart'); if (inp) inp.value = '';
    this.renderAI();
    this.aiTest(c);
  },
  /** Test + self-heal: discover models, choose one, check a tiny completion (or MCP handshake). */
  async aiTest(c, { quiet = false } = {}) {
    c.status = 'testing'; c.lastError = null; c.okNote = '';
    this.renderAI();
    const t0 = performance.now();
    try {
      if (c.type === 'mcp') {
        const cl = new MCPClient(c);
        const tools = await cl.connect();
        this.aiMcp.set(c.id, cl);
        c.tools = tools;
        c.okNote = `${cl.info?.name || 'Server'} · ${tools.length} tool${tools.length === 1 ? '' : 's'}`;
      } else {
        if (c.type !== 'compat' && !c.key) throw new AIError('auth', 'No key yet — paste one above');
        try { c.models = await AIProviders.listModels(c); } catch (e) { if (['auth', 'quota', 'network', 'cors'].includes(e.kind)) throw e; c.models = c.models || []; }
        if (!c.model || (c.models?.length && !c.models.includes(c.model))) {
          const pick = AIProviders.pickModel(c.type, c.models?.length ? c.models : AI_PROVIDERS[c.type].models);
          if (pick && c.model && pick !== c.model) this.aiLog('heal', `${c.name}: model “${c.model}” not available → using “${pick}”`);
          if (pick) c.model = pick;
        }
        const r = await AIProviders.chat(c, { system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'Ping' }], maxTokens: 8, temperature: 0 }, 30000);
        c.model = c.model || r.model;
        c.okNote = `${r.model || c.model} · ${Math.round(performance.now() - t0)} ms`;
      }
      c.status = 'ok';
      this.aiLog('ok', `${c.name} connected (${c.okNote})`);
      if (!quiet) Utils.toast(`${c.name} connected`, '✅');
    } catch (e) {
      c.status = 'error'; c.lastError = e.message; c.lastErrorKind = e.kind || 'unknown';
      this.aiLog('error', `${c.name}: ${e.message}`, { kind: e.kind });
      // automatic self-heal attempts that need no decision
      const fix = this.aiFixFor(c);
      if (fix?.auto && !c._healing) { c._healing = true; this.aiLog('heal', `${c.name}: trying “${fix.label}” automatically`); await fix.run(); c._healing = false; return; }
    }
    this.aiSave();
    this.renderAI();
  },
  /** A concrete repair for a connection's last error (auto = safe to try without asking). */
  aiFixFor(c) {
    const k = c.lastErrorKind;
    if (k === 'model') return { label: 'Pick an available model', auto: true, run: async () => { c.model = ''; await this.aiTest(c, { quiet: true }); } };
    if ((k === 'network' || k === 'cors' || k === 'bad_request') && c.url) {
      const n = aiNormalizeUrl(c.url);
      if (n !== c.url) return { label: `Use ${n}`, auto: true, run: async () => { c.url = n; await this.aiTest(c, { quiet: true }); } };
      if (c.type === 'compat' && !/\/v1$/.test(n) && !/\/v1\//.test(n)) return { label: 'Add /v1 to the URL', auto: true, run: async () => { c.url = `${n}/v1`; await this.aiTest(c, { quiet: true }); } };
      if (c.type === 'mcp' && !/\/(mcp|sse)$/.test(n)) return { label: 'Try …/mcp endpoint', auto: true, run: async () => { c.url = `${n}/mcp`; await this.aiTest(c, { quiet: true }); } };
      if (c.type === 'compat' && /^http:\/\/(localhost|127\.)/.test(n) && location.protocol === 'https:') return { label: 'Explain local server access', run: () => Utils.toast('Browsers block http://localhost from https pages. Open DesignStudio from a local file or use an https tunnel.', 'ℹ️', { duration: 9000 }) };
    }
    if (k === 'auth' || k === 'quota') return { label: 'Paste a new key', run: () => { const f = document.querySelector(`.ai-conn[data-id="${c.id}"] [data-k="key"]`); f?.focus(); } };
    if (['rate', 'overloaded', 'server', 'timeout'].includes(k)) return { label: 'Retry now', run: () => this.aiTest(c) };
    return null;
  },
  async aiHeal(c) { const f = this.aiFixFor(c); if (f) await f.run(); },
  aiToolRunner(c) {
    const tools = c.tools || [];
    const d = this.dialog({
      title: `Try a tool · ${c.name}`, wide: true,
      body: `<label class="dsm-field"><span>Tool</span><select class="ai-tsel">${tools.map(t => `<option value="${Utils.escapeHtml(t.name)}">${Utils.escapeHtml(t.name)}</option>`).join('')}</select></label><p class="muted-text ai-tdesc"></p><label class="dsm-field"><span>Arguments (JSON)</span><textarea class="ai-targs" rows="5" spellcheck="false">{}</textarea></label><pre class="ai-tout dsm-code" hidden></pre>`,
      actions: [{ label: 'Close' }]
    });
    const sel = d.el.querySelector('.ai-tsel'), desc = d.el.querySelector('.ai-tdesc'), args = d.el.querySelector('.ai-targs'), out = d.el.querySelector('.ai-tout');
    const sync = () => { const t = tools.find(x => x.name === sel.value); desc.textContent = t?.description || ''; const props = t?.schema?.properties || {}; args.value = JSON.stringify(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.default ?? (v.type === 'number' ? 0 : v.type === 'boolean' ? false : '')])), null, 2); };
    sel.addEventListener('change', sync); sync();
    const run = document.createElement('button'); run.type = 'button'; run.className = 'btn-primary'; run.textContent = 'Run tool';
    d.el.querySelector('.ds-dialog-actions').prepend(run);
    run.addEventListener('click', async () => {
      let a; try { a = JSON.parse(aiRepairJSON(args.value) ? JSON.stringify(aiRepairJSON(args.value)) : args.value); } catch (e) { Utils.toast('Arguments are not valid JSON', '⚠️'); return; }
      out.hidden = false; out.textContent = 'Running…';
      try { const cl = this.aiMcp.get(c.id) || new MCPClient(c); this.aiMcp.set(c.id, cl); const r = await cl.call(sel.value, a); out.textContent = mcpResultText(r); this.aiLog('tool', `${c.name}/${sel.value} ran`); }
      catch (e) { out.textContent = `${e.message}\n\n${AI_ERROR_HELP[e.kind] || ''}`; this.aiLog('error', `${c.name}/${sel.value}: ${e.message}`); }
    });
  },

  // =================================================================== Router (self-healing)
  /** Completion with retries, model repair and failover across the connection chain. */
  async aiComplete({ system, messages, prefer, signal, onStatus }) {
    const S = this.ai.settings;
    let chain = this.aiLLMs();
    if (prefer) chain = [...chain.filter(c => c.id === prefer), ...chain.filter(c => c.id !== prefer)];
    chain.sort((a, b) => (a.status === 'error') - (b.status === 'error')); // known-broken last
    if (!chain.length) throw new AIError('nocon', 'No AI connection yet');
    let last;
    for (const [ci, c] of chain.entries()) {
      let healedModel = false;
      for (let attempt = 0; attempt <= S.retries; attempt++) {
        const t0 = performance.now();
        try {
          onStatus?.(`${c.name}${attempt ? ` · retry ${attempt}` : ''}…`);
          if (!c.model && c.type !== 'compat') { c.models = await AIProviders.listModels(c).catch(() => AI_PROVIDERS[c.type].models); c.model = AIProviders.pickModel(c.type, c.models); }
          const r = await AIProviders.chat(c, { system, messages, maxTokens: S.maxTokens }, (S.timeout * 1000) * (attempt + 1), signal);
          c.status = 'ok'; c.lastError = null;
          this.aiLog('request', `${c.name} · ${r.model} · ${Math.round(performance.now() - t0)} ms · ${r.usage.in}→${r.usage.out} tokens`, { ms: Math.round(performance.now() - t0), tin: r.usage.in, tout: r.usage.out });
          if (ci > 0) this.aiLog('heal', `Answered by fallback “${c.name}” after ${chain[0].name} failed`);
          this.aiSave();
          return { ...r, conn: c };
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          last = e;
          this.aiLog('error', `${c.name}: ${e.message}`, { kind: e.kind });
          if (e.kind === 'model' && !healedModel) {
            healedModel = true;
            try { c.models = await AIProviders.listModels(c); const pick = AIProviders.pickModel(c.type, c.models); if (pick && pick !== c.model) { this.aiLog('heal', `${c.name}: switched model ${c.model || '(none)'} → ${pick}`); c.model = pick; attempt--; continue; } } catch (e2) { /* fall through */ }
          }
          if (['rate', 'overloaded', 'server', 'timeout'].includes(e.kind) && attempt < S.retries) {
            const wait = Math.min(20000, e.retryAfter ? e.retryAfter * 1000 : 1000 * 2 ** attempt + Math.random() * 400);
            onStatus?.(`${c.name} busy — retrying in ${Math.ceil(wait / 1000)} s`);
            this.aiLog('retry', `${c.name}: ${e.kind}, retry in ${Math.round(wait)} ms`);
            await aiSleep(wait, signal);
            continue;
          }
          break;
        }
      }
      c.status = 'error'; c.lastError = last.message; c.lastErrorKind = last.kind;
      if (chain[ci + 1]) { this.aiLog('heal', `Failing over: ${c.name} → ${chain[ci + 1].name}`); onStatus?.(`Switching to ${chain[ci + 1].name}…`); }
    }
    this.aiSave(); this.aiBadge();
    throw last;
  },

  // =================================================================== Context + prompt
  aiContext() {
    const m = this.model, D = m.dsVars(), sel = m.topSelected();
    const rel = (el) => { const p = el.parentId ? m.getElementById(el.parentId) : null; return { x: Math.round(el.x - (p ? p.x : 0)), y: Math.round(el.y - (p ? p.y : 0)) }; };
    let budget = 90;
    const node = (el, depth) => {
      if (budget-- <= 0) return null;
      const r = rel(el), o = { id: el.id, type: el.isComponentInstance ? 'instance' : el.type, name: el.name, x: r.x, y: r.y, w: Math.round(el.width), h: Math.round(el.height) };
      const f = el.fills.find(x => x.visible !== false); if (f) o.fill = f.type === 'solid' ? Utils.toHex(f.color) : f.type;
      if (el.bindings) o.tokens = Object.fromEntries(Object.entries(el.bindings).map(([k, id]) => [k, m.varById(id)?.name]));
      if (el.type === 'text') { o.text = el.text.slice(0, 200); o.fontSize = el.fontSize; o.fontWeight = el.fontWeight; }
      if (el.cornerRadius) o.radius = el.cornerRadius;
      if (el.isAutoLayout) o.layout = { direction: el.layoutDirection, gap: el.layoutGap, padding: el.layoutPaddingTop };
      if (el.interactions?.length) o.interactions = el.interactions.map(i => `${i.trigger}→${i.action}${i.targetId ? ':' + i.targetId : ''}`);
      const kids = m.childrenOf(el.id);
      if (kids.length && depth < 4) o.children = kids.map(k => node(k, depth + 1)).filter(Boolean);
      else if (kids.length) o.childCount = kids.length;
      return o;
    };
    const frames = m.roots().filter(e => e.type === 'frame').slice(0, 40).map(f => `${f.id} "${f.name}" ${Math.round(f.width)}×${Math.round(f.height)} at ${Math.round(f.x)},${Math.round(f.y)}`);
    const vars = [];
    for (const c of D.collections) { const vs = D.vars.filter(v => v.collectionId === c.id).slice(0, 80); if (vs.length) vars.push(`[${c.name}] modes: ${c.modes.map(x => x.name).join('/')}\n` + vs.map(v => `${v.name} (${v.type}) = ${m.varDisplay(v)}`).join('\n')); }
    const comps = m.masters().slice(0, 40).map(c => { const s = this.componentSetOf?.(c); return s ? `${s.name} / ${c.name}` : c.name; });
    const tools = [...this.ai.connections.filter(c => c.type === 'mcp' && c.enabled !== false && c.tools?.length)].flatMap(c => c.tools.slice(0, 30).map(t => `${c.name}/${t.name}: ${t.description.slice(0, 140)} args=${JSON.stringify(Object.keys(t.schema?.properties || {}))}`));
    return [
      `PROJECT: "${this.titleInput?.value || 'Untitled'}" · page "${m.page.name}" · ${m.elements.length} layers`,
      `TOP-LEVEL FRAMES:\n${frames.join('\n') || '(none)'}`,
      sel.length ? `SELECTION (${sel.length}) — x/y relative to parent:\n${JSON.stringify(sel.slice(0, 8).map(s => node(s, 0)))}` : 'SELECTION: none (new frames are placed to the right of existing ones)',
      `VARIABLES:\n${vars.join('\n') || '(none)'}`,
      `TEXT STYLES: ${m.styles.texts.map(t => `${t.name} ${t.fontSize}/${t.fontWeight}`).join(', ') || '(none)'}`,
      `COMPONENTS: ${comps.join(', ') || '(none)'}`,
      tools.length ? `MCP TOOLS (call with op "mcp"):\n${tools.join('\n')}` : ''
    ].filter(Boolean).join('\n\n');
  },
  aiSystemPrompt() {
    return `You are the design assistant inside DesignStudio, a Figma-like editor. You design directly on the canvas by returning operations, and you also answer questions, critique, write copy and write code.
Rules:
- Be concise. Start with 1–3 sentences saying what you did or recommend.
- If the canvas should change, end with ONE fenced block \`\`\`ds-ops containing a JSON array of operations (no comments). If nothing should change, don't include the block.
- Prefer the project's variables (fill "$color/primary"), text styles ("textStyle":"Body") and components. Use auto layout for stacks, 8-pt spacing, readable sizes (body ≥ 14, touch targets ≥ 44), WCAG contrast.
- Mobile screens are 390×844, desktop 1440×900 unless asked.
Operations:
{"op":"create","ref":"a","type":"frame|rect|ellipse|text|line|instance","parent":"<ref|id|null>","name":"","x":0,"y":0,"width":100,"height":40,"fill":"#hex|rgba()|$variable/name|none","stroke":"#hex 1","radius":8,"opacity":1,"text":"…","fontSize":16,"fontWeight":400,"align":"left|center|right","textStyle":"Body","layout":{"direction":"vertical|horizontal","gap":12,"padding":16,"align":"top-left|center-center|top-center|…","hug":true,"stretch":true},"shadow":true,"component":"<name, for type instance>","mode":{"<collection>":"<mode>"}}
  x/y are relative to the parent; children of auto-layout frames ignore x/y; text without width hugs its content.
{"op":"update","id":"<id|ref>", …same properties}
{"op":"delete","id":"<id>"}
{"op":"variable","collection":"Tokens","name":"color/brand","type":"color|number|string|boolean","values":{"Light":"#…","Dark":"#…"}}
{"op":"bind","id":"<id|ref>","prop":"fills.0|strokes.0|cornerRadius|opacity|layoutGap|padding|fontSize|text|width|height","variable":"color/primary"}
{"op":"textStyle","name":"Body","fontSize":16,"fontWeight":400,"lineHeight":24}
{"op":"component","id":"<id|ref>"}
{"op":"interaction","id":"<id|ref>","trigger":"click|hover|press|delay|key|mouseEnter|mouseLeave|drag","action":"navigate|overlay|back|url|scrollTo|closeOverlay","target":"<frame id|ref|name>","transition":"instant|dissolve|smart|moveIn|push|slideIn","direction":"left|right|up|down","url":"https://…"}
{"op":"mcp","server":"<connection name>","tool":"<tool>","args":{}}   ← results are sent back to you; then continue.
{"op":"github","action":"list|read|import","repo":"owner/repo","ref":"branch (optional)","path":"folder or file","kind":"svg|image|plugin|text","paths":["…"]}   ← GitHub repos: "list" files, "read" a text file (tokens, CSS, README), "import" SVG/images/.dsplugin onto the canvas (the user confirms). Results come back to you; to turn tokens into variables, read them, then return "variable" ops.

${this.aiContext()}`;
  },

  // =================================================================== Ops engine
  /** Validates and applies operations. Returns {errors, warnings, summary, created}. */
  aiApplyOps(ops, opts = {}) {
    if (opts.dry) return this.aiApplyOpsInner(ops, opts);
    // v3.12.0: helpers used by ops (instances, components) commit on their own — hold those back so one AI change is one undo step
    const label = this._actionLabel;
    this._batchDepth = (this._batchDepth || 0) + 1;
    try { return this.aiApplyOpsInner(ops, opts); } finally { this._batchDepth--; this._actionLabel = label; }
  },
  aiApplyOpsInner(ops, { dry = false } = {}) {
    const m = this.model, D = m.dsVars(), refs = {}, errors = [], warnings = [], created = [], summary = { create: 0, update: 0, delete: 0, variable: 0, bind: 0, other: 0 };
    if (!Array.isArray(ops)) return { errors: ['Operations must be a JSON array'], warnings, summary, created };
    const TYPES = ['frame', 'rect', 'ellipse', 'text', 'line', 'instance', 'polygon', 'star'];
    const find = (key) => { if (key == null || key === '') return null; if (refs[key]) return String(refs[key]).startsWith('__dry_') ? { id: refs[key], x: 0, y: 0, width: 0, height: 0, fills: [], strokes: [], interactions: [] } : m.getElementById(refs[key]); return m.getElementById(key) || m.elements.find(e => e.name === key) || null; };
    const varByName = (n) => { const name = String(n).replace(/^\$|^\{|\}$/g, '').replace(/\./g, '/'); return D.vars.find(v => v.name === name) || D.vars.find(v => v.name.toLowerCase() === name.toLowerCase()) || D.vars.find(v => v.name.endsWith('/' + name)); };
    let autoX = Math.max(0, ...m.roots().map(r => r.x + r.width)) + 120, autoY = Math.min(0, ...m.roots().map(r => r.y).concat(0));
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const setPaint = (el, key, val, i) => {
      const where = `${key}.${0}`;
      if (val === 'none' || val === null) { if (key === 'fills') el.fills = []; else el.strokes = []; return; }
      let color = String(val).trim(), width = 1;
      if (key === 'strokes') { const p = color.split(/\s+/); color = p[0]; width = num(p[1], 1); }
      if (/^\$|^\{/.test(color)) {
        const v = varByName(color);
        if (v && v.type === 'color') { if (!dry) { if (key === 'strokes' && !el.strokes[0]) el.strokes[0] = { color: '#000000', width, align: 'inside', visible: true }; el.bindings = Object.assign({}, el.bindings || {}, { [where]: v.id }); m.dsWrite(el, where, m.resolveVar(v.id, m.modeContext(el, m.elements))); } return; }
        const fb = AI_FALLBACK_COLORS[color.replace(/^\$|[{}]/g, '')];
        warnings.push(`op ${i + 1}: variable ${color} not found — used ${fb || 'gray'}`);
        color = fb || '#888888';
      }
      if (!Utils.parseColor(color)) { errors.push(`op ${i + 1}: “${val}” is not a color`); return; }
      if (dry) return;
      if (key === 'fills') m.dsWrite(el, 'fills.0', color);
      else { el.strokes = [{ color: Utils.toHex(color), width, align: 'inside', visible: true }]; }
      if (el.bindings?.[where]) delete el.bindings[where];
    };
    const applyProps = (el, o, i, isNew) => {
      const parent = el.parentId ? m.getElementById(el.parentId) : null;
      if (o.name != null) el.name = String(o.name).slice(0, 120);
      if (o.width != null) el.width = Math.max(1, num(o.width, el.width));
      if (o.height != null) el.height = Math.max(1, num(o.height, el.height));
      if (o.x != null) el.x = (parent ? parent.x : 0) + num(o.x, 0);
      if (o.y != null) el.y = (parent ? parent.y : 0) + num(o.y, 0);
      if (o.fill !== undefined) setPaint(el, 'fills', o.fill, i);
      if (o.stroke !== undefined) setPaint(el, 'strokes', o.stroke, i);
      if (o.radius != null) el.cornerRadius = Math.max(0, num(o.radius, 0));
      if (o.opacity != null) el.opacity = Utils.clamp(num(o.opacity, 1) > 1 ? num(o.opacity, 100) / 100 : num(o.opacity, 1), 0, 1);
      if (o.visible != null) el.visible = !!o.visible;
      if (el.type === 'text') {
        if (o.text != null) el.text = String(o.text).slice(0, 5000);
        if (o.fontSize != null) el.fontSize = Math.max(1, num(o.fontSize, 16));
        if (o.fontWeight != null) el.fontWeight = Utils.clamp(Math.round(num(o.fontWeight, 400) / 100) * 100, 100, 900);
        if (o.align) el.textAlign = ['left', 'center', 'right'].includes(o.align) ? o.align : el.textAlign;
        if (o.lineHeight != null) el.lineHeight = num(o.lineHeight, 0);
        if (o.textStyle) { const s = m.styles.texts.find(t => t.name.toLowerCase() === String(o.textStyle).toLowerCase()); if (s) el.styleRefs = Object.assign({}, el.styleRefs || {}, { text: s.id }), Object.assign(el, { fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, letterSpacing: s.letterSpacing || 0 }); else warnings.push(`op ${i + 1}: text style “${o.textStyle}” not found`); }
        if (isNew) el.textAutoResize = o.width != null ? 'height' : 'width';
        if (el.textAutoResize !== 'none') TextLayout.fit(el);
      }
      if (o.layout && typeof o.layout === 'object' && el.type === 'frame') {
        const L = o.layout;
        el.isAutoLayout = true;
        el.layoutDirection = L.direction === 'horizontal' ? 'horizontal' : 'vertical';
        if (L.gap != null) el.layoutGap = Math.max(0, num(L.gap, 8));
        if (L.padding != null) { const p = Array.isArray(L.padding) ? L.padding : [L.padding, L.padding, L.padding, L.padding]; [el.layoutPaddingTop, el.layoutPaddingRight, el.layoutPaddingBottom, el.layoutPaddingLeft] = [0, 1, 2, 3].map(k => Math.max(0, num(p[k] ?? p[k % 2] ?? p[0], 0))); el.layoutPadding = el.layoutPaddingTop; }
        if (L.align) { const a = String(L.align); el.layoutAlign = a === 'center' ? 'center-center' : /^(top|center|bottom)-(left|center|right)$/.test(a) ? a : el.layoutAlign; }
        el.primarySizing = L.hug ? 'hug' : 'fixed';
        el.counterSizing = L.stretch ? 'fill' : L.hug ? 'hug' : 'fixed';
      }
      if (o.shadow) {
        const st = typeof o.shadow === 'string' && m.styles.effects.find(s => s.name.toLowerCase() === o.shadow.toLowerCase());
        el.effects = st ? JSON.parse(JSON.stringify(st.effects)) : [{ type: 'dropShadow', x: 0, y: 4, blur: 16, spread: 0, color: 'rgba(0,0,0,0.12)', visible: true }];
      }
      if (o.mode && typeof o.mode === 'object') {
        for (const [cn, mn] of Object.entries(o.mode)) { const c = D.collections.find(x => x.name.toLowerCase() === cn.toLowerCase()); const md = c?.modes.find(x => x.name.toLowerCase() === String(mn).toLowerCase()); if (md) el.varModes = Object.assign({}, el.varModes || {}, { [c.id]: md.id }); else warnings.push(`op ${i + 1}: mode ${cn}/${mn} not found`); }
      }
      this.markOverride?.(el, 'fills');
    };
    ops.forEach((o, i) => {
      if (!o || typeof o !== 'object') { errors.push(`op ${i + 1}: not an object`); return; }
      try {
        switch (o.op) {
          case 'create': {
            const type = String(o.type || 'rect').toLowerCase();
            if (!TYPES.includes(type)) { errors.push(`op ${i + 1}: unknown type “${o.type}”`); return; }
            const parent = o.parent ? find(o.parent) : null;
            if (o.parent && !parent) { errors.push(`op ${i + 1}: parent “${o.parent}” not found (create the parent first)`); return; }
            if (dry) { if (o.ref) refs[o.ref] = `__dry_${i}`; summary.create++; return; }
            let el;
            if (type === 'instance') {
              const name = String(o.component || o.name || '');
              const master = m.masters().find(x => x.name === name) || m.masters().find(x => this.componentSetOf?.(x)?.name === name) || m.masters().find(x => x.name.toLowerCase().includes(name.toLowerCase()) && name);
              if (!master) { errors.push(`op ${i + 1}: component “${name}” not found`); return; }
              el = this.createInstance(master.id, { x: 0, y: 0 });
              el = el?.id ? el : m.elements.filter(e => e.isComponentInstance).pop();
              if (parent) el.parentId = parent.id;
            } else {
              const w = num(o.width, type === 'text' ? 100 : type === 'frame' && !parent ? 390 : 100), h = num(o.height, type === 'text' ? 24 : type === 'frame' && !parent ? 844 : 100);
              el = new StudioElement(type, 0, 0, w, h);
              el.name = o.name || (type === 'text' ? (o.text || 'Text').slice(0, 30) : type[0].toUpperCase() + type.slice(1));
              if (type === 'text' && o.fill === undefined && !o.textStyle) setPaint(el, 'fills', varByName('color/text') ? '$color/text' : '#111118', i);
              m.insertElement(el, parent ? parent.id : null);
            }
            if (!parent && o.x == null) { o = { ...o, x: autoX, y: o.y ?? autoY }; autoX += num(o.width, 390) + 80; }
            applyProps(el, o, i, true);
            if (o.ref) refs[o.ref] = el.id;
            if (!parent) created.push(el.id);
            summary.create++;
            return;
          }
          case 'update': {
            const el = find(o.id);
            if (!el) { errors.push(`op ${i + 1}: layer “${o.id}” not found`); return; }
            if (!dry) applyProps(el, o, i, false);
            summary.update++; return;
          }
          case 'delete': {
            const el = find(o.id);
            if (!el) { warnings.push(`op ${i + 1}: “${o.id}” already gone`); return; }
            if (!dry) m.deleteElements([el.id]);
            summary.delete++; return;
          }
          case 'variable': {
            const type = ['color', 'number', 'string', 'boolean'].includes(o.type) ? o.type : (Utils.parseColor(o.value ?? Object.values(o.values || {})[0]) ? 'color' : 'number');
            if (!o.name) { errors.push(`op ${i + 1}: variable needs a name`); return; }
            if (dry) { summary.variable++; return; }
            let col = D.collections.find(c => c.name.toLowerCase() === String(o.collection || D.collections[0]?.name || 'Tokens').toLowerCase());
            if (!col) col = this.addCollection(o.collection || 'Tokens');
            const vals = o.values && typeof o.values === 'object' ? o.values : { [col.modes[0].name]: o.value };
            for (const mn of Object.keys(vals)) if (!col.modes.some(x => x.name.toLowerCase() === mn.toLowerCase())) col.modes.push({ id: Utils.uid('m'), name: mn });
            let v = D.vars.find(x => x.collectionId === col.id && x.name === o.name);
            if (!v) { v = { id: Utils.uid('v'), collectionId: col.id, name: String(o.name).slice(0, 120), type, description: String(o.description || ''), values: {} }; D.vars.push(v); }
            const first = Object.values(vals)[0];
            for (const md of col.modes) { const raw = Object.entries(vals).find(([k]) => k.toLowerCase() === md.name.toLowerCase())?.[1] ?? first; const ref = typeof raw === 'string' && /^\$|^\{/.test(raw) ? varByName(raw) : null; v.values[md.id] = ref ? { alias: ref.id } : type === 'number' ? num(raw, 0) : type === 'boolean' ? !!raw : String(raw ?? ''); }
            summary.variable++; return;
          }
          case 'bind': {
            const el = find(o.id), v = varByName(o.variable || '');
            if (!el) { errors.push(`op ${i + 1}: layer “${o.id}” not found`); return; }
            if (!v) { errors.push(`op ${i + 1}: variable “${o.variable}” not found`); return; }
            if (!dsPropInfo(o.prop)) { errors.push(`op ${i + 1}: “${o.prop}” can’t be bound`); return; }
            if (!dry) el.bindings = Object.assign({}, el.bindings || {}, { [o.prop]: v.id });
            summary.bind++; return;
          }
          case 'textStyle': {
            if (!o.name) { errors.push(`op ${i + 1}: text style needs a name`); return; }
            if (dry) { summary.other++; return; }
            let s = m.styles.texts.find(t => t.name === o.name);
            if (!s) { s = { id: Utils.uid('t'), name: String(o.name), fontFamily: DEFAULT_FONT, fontSize: 16, fontWeight: 400, lineHeight: 0, letterSpacing: 0 }; m.styles.texts.push(s); }
            for (const k of ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']) if (o[k] != null) s[k] = num(o[k], s[k]);
            if (o.fontFamily) s.fontFamily = String(o.fontFamily);
            summary.other++; return;
          }
          case 'component': {
            const el = find(o.id);
            if (!el) { errors.push(`op ${i + 1}: layer “${o.id}” not found`); return; }
            if (!dry && !el.isComponentMaster) { m.select([el.id]); this.createComponent(); }
            summary.other++; return;
          }
          case 'interaction': {
            const el = find(o.id);
            if (!el) { errors.push(`op ${i + 1}: layer “${o.id}” not found`); return; }
            const tgt = o.target ? find(o.target) : null;
            if (o.target && !tgt && !['back', 'url', 'closeOverlay'].includes(o.action)) { errors.push(`op ${i + 1}: destination “${o.target}” not found`); return; }
            if (!dry) el.interactions.push(protoInteraction({ trigger: o.trigger || 'click', action: o.action || 'navigate', targetId: tgt?.id || null, transition: o.transition || 'dissolve', direction: o.direction || 'left', url: o.url || '', key: o.key || 'Enter', delay: num(o.delay, 800) }));
            summary.other++; return;
          }
          case 'mcp': summary.other++; return; // handled by the run loop
          default: errors.push(`op ${i + 1}: unknown op “${o.op}”`);
        }
      } catch (e) { errors.push(`op ${i + 1}: ${e.message}`); }
    });
    return { errors, warnings, summary, created, refs: dry ? {} : refs };
  },
  aiSummary(s) {
    const parts = [];
    if (s.create) parts.push(`${s.create} new layer${s.create === 1 ? '' : 's'}`);
    if (s.update) parts.push(`${s.update} edit${s.update === 1 ? '' : 's'}`);
    if (s.delete) parts.push(`${s.delete} deletion${s.delete === 1 ? '' : 's'}`);
    if (s.variable) parts.push(`${s.variable} variable${s.variable === 1 ? '' : 's'}`);
    if (s.bind) parts.push(`${s.bind} binding${s.bind === 1 ? '' : 's'}`);
    if (s.other) parts.push(`${s.other} other`);
    return parts.join(' · ') || 'no changes';
  },
  aiCommitOps(msg) {
    const res = this.aiApplyOps(msg.ops);
    this._actionLabel = `AI: ${this.aiSummary(res.summary)}`;
    this.commit();
    if (res.created.length) { this.model.select(res.created); this.zoomSelection?.(); this.selectionChanged(); }
    msg.applied = true; msg.applyErrors = res.errors; msg.warnings = [...(msg.warnings || []), ...res.warnings];
    this.aiSave();
    Utils.toast(`AI changes applied — ${this.aiSummary(res.summary)}`, '✦', { action: { label: 'Undo', run: () => { this.run('undo'); msg.applied = false; this.aiSave(); this.renderAI(); } } });
    this.renderAI();
  },

  // =================================================================== Playground
  aiRenderPlay(body) {
    const conns = this.aiLLMs(), sel = this.model.topSelected();
    const msgs = this.ai.chat;
    body.innerHTML = `<div class="ai-chat" role="log" aria-live="polite">${msgs.length ? msgs.map((x, i) => this.aiMsgHTML(x, i)).join('') : `<div class="ai-empty"><b>Design with AI</b><p>Describe a screen, ask for edits to your selection, tokens, copy, a critique or code. Changes appear as a preview you can apply or undo.</p>
      ${conns.length ? '' : '<p class="ai-warn">No model connected — the built-in offline assistant answers simple requests (login, card, navbar, pricing, “fix issues”, “design system #7c3aed”). <button type="button" class="ai-linkbtn" data-go="conn">Connect a model</button></p>'}
      <div class="ai-examples">${['A login screen with email, password and a primary button', 'Make the selection use our tokens and 8-pt spacing', 'Critique this page for accessibility', 'Design system from #0ea5e9'].map(t => `<button type="button" data-ex="${Utils.escapeHtml(t)}">${Utils.escapeHtml(t)}</button>`).join('')}</div></div>`}</div>
      <div class="ai-compose"><div class="ai-chips">${AI_CHIPS.map(([i, l, p]) => `<button type="button" data-chip="${Utils.escapeHtml(p)}" title="${Utils.escapeHtml(l)}"><span>${i}</span>${l}</button>`).join('')}</div>
        <div class="ai-ctx">${sel.length ? `◉ ${sel.length} selected: ${Utils.escapeHtml(sel.slice(0, 2).map(s => s.name).join(', '))}${sel.length > 2 ? '…' : ''}` : '○ Nothing selected — new designs go next to your frames'}</div>
        <textarea class="ai-input" rows="3" placeholder="Ask or describe… (Enter to send, Shift+Enter for a new line)" aria-label="Message"></textarea>
        <div class="ai-send-row"><select class="ai-via" aria-label="Model">${conns.length ? `<option value="">Auto · ${Utils.escapeHtml(conns[0].name)} → fallbacks</option>${conns.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}${c.model ? ` · ${Utils.escapeHtml(c.model)}` : ''}</option>`).join('')}` : '<option value="">Offline assistant</option>'}</select>
          ${msgs.length ? '<button type="button" class="ai-mini" data-a="clear" title="Clear conversation" aria-label="Clear conversation">🗑</button>' : ''}
          <button type="button" class="btn-primary ai-send" data-a="send">${this.aiBusy ? 'Stop' : 'Send'}</button></div>
        <div class="ai-status" aria-live="polite">${Utils.escapeHtml(this.aiStatusText || '')}</div></div>`;
    const input = body.querySelector('.ai-input'), chat = body.querySelector('.ai-chat');
    chat.scrollTop = chat.scrollHeight;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.aiSend(input.value); } });
    body.querySelector('[data-a="send"]').addEventListener('click', () => { if (this.aiBusy) this.aiAbort?.abort(); else this.aiSend(input.value); });
    body.querySelector('[data-a="clear"]')?.addEventListener('click', () => { this.ai.chat = []; this.aiSave(); this.renderAI(); });
    body.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { const p = b.dataset.chip; if (p === '/doctor') { this.aiSend('/doctor'); return; } if (p.endsWith(': ')) { input.value = p; input.focus(); input.setSelectionRange(p.length, p.length); } else this.aiSend(p); }));
    body.querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => this.aiSend(b.dataset.ex)));
    body.querySelector('[data-go]')?.addEventListener('click', () => { this.aiTab = 'conn'; this.renderAI(); });
    body.querySelectorAll('.ai-msg').forEach(el => {
      const msg = this.ai.chat[+el.dataset.i];
      el.querySelector('[data-a="apply"]')?.addEventListener('click', () => this.aiCommitOps(msg));
      el.querySelector('[data-a="discard"]')?.addEventListener('click', () => { msg.discarded = true; this.aiSave(); this.renderAI(); });
      el.querySelector('[data-a="json"]')?.addEventListener('click', (e) => { const pre = el.querySelector('.ai-opsjson'); pre.hidden = !pre.hidden; e.currentTarget.textContent = pre.hidden ? 'Show JSON' : 'Hide JSON'; });
      el.querySelector('[data-a="retry"]')?.addEventListener('click', () => { const u = [...this.ai.chat.slice(0, +el.dataset.i)].reverse().find(x => x.role === 'user'); if (u) this.aiSend(u.content, { retry: true }); });
      el.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => { const ok = await Utils.copyText(msg.codes[+b.dataset.copy].code); Utils.toast(ok ? 'Code copied' : 'Clipboard unavailable', ok ? '📋' : '⚠️'); }));
      el.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => { const c = msg.codes[+b.dataset.dl]; const ext = { jsx: 'jsx', tsx: 'tsx', js: 'js', ts: 'ts', css: 'css', html: 'html', json: 'json', swift: 'swift', kotlin: 'kt', dart: 'dart', vue: 'vue', svelte: 'svelte', py: 'py' }[c.lang] || 'txt'; Utils.download(c.code, `ai-${Date.now()}.${ext}`, 'text/plain'); }));
      el.querySelector('[data-a="tool-run"]')?.addEventListener('click', () => msg.toolResolve?.(true));
      el.querySelector('[data-a="tool-skip"]')?.addEventListener('click', () => msg.toolResolve?.(false));
      el.querySelector('[data-a="to-conn"]')?.addEventListener('click', () => { this.aiTab = 'conn'; this.renderAI(); });
    });
  },
  aiMd(text, codes) {
    const esc = Utils.escapeHtml;
    let out = '';
    const parts = String(text).split(/```([\w-]*)\n?([\s\S]*?)```/g);
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 0) {
        out += esc(parts[i]).replace(/^### (.*)$/gm, '<h5>$1</h5>').replace(/^## (.*)$/gm, '<h4>$1</h4>').replace(/^# (.*)$/gm, '<h4>$1</h4>')
          .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/^(?:[-*•]|\d+\.) (.*)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, (mm) => `<ul>${mm}</ul>`)
          .replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
      } else if (i % 3 === 1) {
        const lang = parts[i], code = parts[i + 1];
        i++;
        if (lang === 'ds-ops' || (/"op"\s*:/.test(code) && /^\s*\[/.test(code))) continue; // shown as the changes card
        const idx = codes.push({ lang: lang || 'txt', code }) - 1;
        out += `<div class="ai-code"><div class="ai-code-h"><span>${esc(lang || 'code')}</span><button type="button" data-copy="${idx}">Copy</button><button type="button" data-dl="${idx}">Download</button></div><pre>${esc(code)}</pre></div>`;
      }
    }
    return out;
  },
  aiMsgHTML(x, i) {
    if (x.role === 'user') return `<div class="ai-msg user" data-i="${i}"><div class="ai-bub">${Utils.escapeHtml(x.content)}</div></div>`;
    x.codes = [];
    const ops = x.ops?.length ? `<div class="ai-ops ${x.applied ? 'done' : x.discarded ? 'off' : ''}"><div class="ai-ops-h">✦ <b>${Utils.escapeHtml(x.summary || `${x.ops.length} changes`)}</b>${x.repaired ? '<span class="ai-tag" title="The answer had JSON mistakes that were repaired automatically">repaired</span>' : ''}${x.corrected ? '<span class="ai-tag" title="The AI fixed its own invalid changes">self-corrected</span>' : ''}</div>
      ${x.applied ? `<div class="ai-ops-s">Applied to the canvas${x.applyErrors?.length ? ` · ${x.applyErrors.length} skipped` : ''} — Ctrl+Z to undo</div>` : x.discarded ? '<div class="ai-ops-s">Discarded</div>' : '<div class="ai-ops-act"><button type="button" class="btn-primary" data-a="apply">Apply to canvas</button><button type="button" data-a="discard">Discard</button><button type="button" data-a="json">Show JSON</button></div>'}
      ${(x.warnings || []).length ? `<div class="ai-ops-w">${x.warnings.slice(0, 4).map(w => `⚠ ${Utils.escapeHtml(w)}`).join('<br>')}</div>` : ''}${(x.applyErrors || []).length ? `<div class="ai-ops-w">${x.applyErrors.slice(0, 4).map(w => `⛔ ${Utils.escapeHtml(w)}`).join('<br>')}</div>` : ''}
      <pre class="ai-opsjson" hidden>${Utils.escapeHtml(JSON.stringify(x.ops, null, 1))}</pre></div>` : '';
    const tool = x.toolAsk ? `<div class="ai-ops"><div class="ai-ops-h">⚙ Run <b>${Utils.escapeHtml(x.toolAsk.server)}/${Utils.escapeHtml(x.toolAsk.tool)}</b>?</div><pre class="ai-opsjson">${Utils.escapeHtml(JSON.stringify(x.toolAsk.args || {}, null, 1))}</pre>${x.toolResolve ? '<div class="ai-ops-act"><button type="button" class="btn-primary" data-a="tool-run">Run tool</button><button type="button" data-a="tool-skip">Skip</button></div>' : `<div class="ai-ops-s">${x.toolDone ? 'Ran' : 'Skipped'}</div>`}</div>` : '';
    const err = x.error ? `<div class="ai-errmsg"><b>${Utils.escapeHtml(AI_ERROR_HELP[x.errorKind] || 'Request failed')}</b><code>${Utils.escapeHtml(x.error)}</code><div class="ai-ops-act"><button type="button" data-a="retry">Retry</button>${['auth', 'quota', 'network', 'cors', 'nocon', 'model'].includes(x.errorKind) ? '<button type="button" data-a="to-conn">Open Connections</button>' : ''}</div></div>` : '';
    return `<div class="ai-msg bot" data-i="${i}"><div class="ai-bub">${this.aiMd(x.content || '', x.codes)}${tool}${ops}${err}</div>${x.meta ? `<div class="ai-meta">${Utils.escapeHtml(x.meta)}</div>` : ''}</div>`;
  },
  aiSetStatus(t) { this.aiStatusText = t; const s = document.querySelector('#ai-drawer .ai-status'); if (s) s.textContent = t || ''; },
  async aiSend(text, { retry = false } = {}) {
    text = String(text || '').trim();
    if (!text || this.aiBusy) return;
    if (!retry) this.ai.chat.push({ role: 'user', content: text });
    const box = document.querySelector('#ai-drawer .ai-input'); if (box) box.value = '';
    const reply = { role: 'assistant', content: '' };
    this.aiBusy = true; this.aiAbort = new AbortController();
    this.ai.chat.push(reply);
    this.renderAI();
    const done = () => { this.aiBusy = false; this.aiSetStatus(''); this.aiSave(); this.renderAI(); };
    if (text === '/doctor' || /^(fix|heal|repair)( all)?( the)? (issues|problems|project|errors)/i.test(text)) { this.aiDoctorReply(reply); done(); return; }
    if (!this.aiLLMs().length) { this.aiLocal(text, reply); done(); return; }
    const via = document.querySelector('#ai-drawer .ai-via')?.value || '';
    try {
      const history = this.ai.chat.filter(x => x !== reply && (x.role === 'user' || x.content)).slice(-12).map(x => ({ role: x.role, content: x.role === 'assistant' && x.ops?.length ? `${x.content}\n\`\`\`ds-ops\n${JSON.stringify(x.ops)}\n\`\`\`` : x.content || '(no text)' }));
      let messages = history, t0 = performance.now(), usage = { in: 0, out: 0 }, conn = null;
      for (let step = 0; step < 5; step++) {
        this.aiSetStatus('Thinking…');
        const r = await this.aiComplete({ system: this.aiSystemPrompt(), messages, prefer: via || null, signal: this.aiAbort.signal, onStatus: (s) => this.aiSetStatus(s) });
        conn = r.conn; usage.in += r.usage.in; usage.out += r.usage.out;
        const ex = aiExtractOps(r.text);
        reply.content = r.text.replace(/```(?:ds-ops)[\s\S]*?```/g, '').trim();
        if (r.stop === 'max_tokens' || r.stop === 'length') reply.warnings = [...(reply.warnings || []), 'The answer was cut off at the length limit (raise “Max answer” in Settings).'];
        if (ex?.error) {
          if (step < 2) { this.aiLog('heal', 'Invalid changes JSON — asking the model to correct it'); messages = [...messages, { role: 'assistant', content: r.text }, { role: 'user', content: 'Your ds-ops block was not valid JSON. Reply again with only the corrected ```ds-ops``` block.' }]; reply.corrected = true; continue; }
          reply.warnings = [...(reply.warnings || []), 'The changes could not be read.'];
          break;
        }
        if (!ex) break;
        // MCP tool calls first
        const calls = ex.ops.filter(o => o.op === 'mcp' || o.op === 'github');
        if (calls.length) {
          const results = [];
          for (const call of calls.slice(0, 4)) {
            if (call.op === 'github') { this.aiSetStatus(`GitHub: ${call.action || 'list'} ${call.repo || ''}…`); results.push(`github ${call.action || 'list'} ${call.repo} ${call.path || ''} → ${await this.aiGitHub(call)}`); }
            else results.push(`${call.server}/${call.tool} → ${await this.aiRunTool(call, reply)}`);
          }
          messages = [...messages, { role: 'assistant', content: r.text }, { role: 'user', content: `Tool results:\n${results.join('\n\n')}\n\nContinue. Return the final ds-ops (if any).` }];
          continue;
        }
        const check = this.aiApplyOps(ex.ops, { dry: true });
        if (check.errors.length && step < 2) {
          this.aiLog('heal', `Self-correcting ${check.errors.length} invalid operation(s)`);
          this.aiSetStatus('Fixing its own mistakes…');
          messages = [...messages, { role: 'assistant', content: r.text }, { role: 'user', content: `These operations are invalid:\n${check.errors.join('\n')}\nReturn the complete corrected \`\`\`ds-ops\`\`\` block.` }];
          reply.corrected = true;
          continue;
        }
        reply.ops = ex.ops; reply.repaired = ex.repaired; reply.summary = this.aiSummary(check.summary); reply.warnings = [...(reply.warnings || []), ...check.warnings];
        if (this.ai.settings.autoApply) this.aiCommitOps(reply);
        break;
      }
      reply.meta = `${conn?.name || ''} · ${conn?.model || ''} · ${((performance.now() - t0) / 1000).toFixed(1)} s · ${usage.in}→${usage.out} tokens`;
      if (!reply.content && !reply.ops) reply.content = '(empty answer)';
    } catch (e) {
      if (e.name === 'AbortError') { reply.content = reply.content || '_Stopped._'; }
      else {
        reply.error = e.message; reply.errorKind = e.kind || 'unknown';
        // last-resort self-healing: answer offline when every connection failed
        if (['auth', 'quota', 'network', 'cors', 'nocon'].includes(e.kind)) { const tmp = { content: '' }; if (this.aiLocal(text, tmp, { quiet: true })) { reply.content = `All connections failed, so the offline assistant answered.\n\n${tmp.content}`; reply.ops = tmp.ops; reply.summary = tmp.summary; } }
      }
    }
    done();
  },
  async aiRunTool(call, reply) {
    const c = this.ai.connections.find(x => x.type === 'mcp' && (x.name === call.server || x.id === call.server)) || this.ai.connections.find(x => x.type === 'mcp' && x.tools?.some(t => t.name === call.tool));
    if (!c) return `ERROR: no MCP server named “${call.server}”`;
    if (!c.trusted) {
      const ask = { role: 'assistant', content: '', toolAsk: call };
      const ok = await new Promise((res) => { ask.toolResolve = res; this.ai.chat.splice(this.ai.chat.indexOf(reply), 0, ask); this.renderAI(); });
      ask.toolResolve = null; ask.toolDone = ok; this.renderAI();
      if (!ok) return 'The user skipped this tool.';
    }
    this.aiSetStatus(`Running ${c.name}/${call.tool}…`);
    try { const cl = this.aiMcp.get(c.id) || new MCPClient(c); this.aiMcp.set(c.id, cl); const r = await cl.call(call.tool, call.args, this.aiAbort?.signal); this.aiLog('tool', `${c.name}/${call.tool} ran`); return mcpResultText(r); }
    catch (e) { this.aiLog('error', `${c.name}/${call.tool}: ${e.message}`); return `ERROR: ${e.message}`; }
  },

  // =================================================================== Offline assistant
  /** Deterministic helper for common requests when no model is connected (or all failed). Returns true if handled. */
  aiLocal(text, reply, { quiet = false } = {}) {
    const t = text.toLowerCase();
    const hex = (text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i) || [])[0];
    const T = (name) => (this.model.dsVars().vars.some(v => v.name === name) ? `$${name}` : AI_FALLBACK_COLORS[name]);
    let ops = null, say = '';
    if (/design system|tokens|palette|brand colou?r/.test(t) && !/critique/.test(t)) {
      this.dsGenerateStarter?.(hex || '#7c3aed');
      reply.content = `Generated a starter design system from ${hex || '#7c3aed'}: primitives, Light/Dark semantic tokens, spacing, radius, text styles and a Button component. Open **View › Design System** to edit it.`;
      return true;
    }
    if (/log ?in|sign ?in/.test(t)) {
      say = 'Here is a login screen built with your tokens.';
      ops = [
        { op: 'create', ref: 's', type: 'frame', name: 'Login', width: 390, height: 844, fill: T('color/background'), layout: { direction: 'vertical', gap: 16, padding: [96, 24, 24, 24], align: 'top-left', stretch: true } },
        { op: 'create', type: 'text', parent: 's', text: 'Welcome back', fontSize: 28, fontWeight: 700, fill: T('color/text') },
        { op: 'create', type: 'text', parent: 's', text: 'Sign in to continue', fontSize: 15, fill: T('color/text-muted') },
        { op: 'create', ref: 'e', type: 'frame', parent: 's', name: 'Email field', height: 48, radius: 10, fill: T('color/surface'), stroke: `${AI_FALLBACK_COLORS['color/border']} 1`, layout: { direction: 'horizontal', padding: [0, 16, 0, 16], align: 'center-left' } },
        { op: 'create', type: 'text', parent: 'e', text: 'Email', fontSize: 15, fill: T('color/text-muted') },
        { op: 'create', ref: 'p', type: 'frame', parent: 's', name: 'Password field', height: 48, radius: 10, fill: T('color/surface'), stroke: `${AI_FALLBACK_COLORS['color/border']} 1`, layout: { direction: 'horizontal', padding: [0, 16, 0, 16], align: 'center-left' } },
        { op: 'create', type: 'text', parent: 'p', text: 'Password', fontSize: 15, fill: T('color/text-muted') },
        { op: 'create', ref: 'b', type: 'frame', parent: 's', name: 'Sign in button', height: 52, radius: 12, fill: T('color/primary'), layout: { direction: 'horizontal', align: 'center-center' } },
        { op: 'create', type: 'text', parent: 'b', text: 'Sign in', fontSize: 16, fontWeight: 600, fill: T('color/on-primary') },
        { op: 'create', type: 'text', parent: 's', text: 'Forgot password?', fontSize: 14, fontWeight: 500, fill: T('color/primary') }
      ];
    } else if (/pricing/.test(t)) {
      say = 'A three-tier pricing section.';
      ops = [{ op: 'create', ref: 's', type: 'frame', name: 'Pricing', width: 1200, height: 520, fill: T('color/background'), layout: { direction: 'horizontal', gap: 24, padding: 48, align: 'top-center' } }];
      [['Starter', '$0', 'For trying things out'], ['Pro', '$19', 'For working designers'], ['Team', '$49', 'For product teams']].forEach(([n, p, d], k) => {
        ops.push({ op: 'create', ref: `c${k}`, type: 'frame', parent: 's', name: `${n} plan`, width: 340, height: 420, radius: 16, fill: k === 1 ? T('color/primary') : T('color/surface'), layout: { direction: 'vertical', gap: 12, padding: 28 } });
        const fg = k === 1 ? T('color/on-primary') : T('color/text');
        ops.push({ op: 'create', type: 'text', parent: `c${k}`, text: n, fontSize: 18, fontWeight: 600, fill: fg }, { op: 'create', type: 'text', parent: `c${k}`, text: p, fontSize: 40, fontWeight: 700, fill: fg }, { op: 'create', type: 'text', parent: `c${k}`, text: d, fontSize: 14, fill: fg });
      });
    } else if (/nav ?bar|navigation|header/.test(t)) {
      say = 'A desktop navigation bar.';
      ops = [{ op: 'create', ref: 'n', type: 'frame', name: 'Navbar', width: 1440, height: 72, fill: T('color/background'), layout: { direction: 'horizontal', gap: 32, padding: [0, 40, 0, 40], align: 'center-left' } }, { op: 'create', type: 'text', parent: 'n', text: 'Brand', fontSize: 20, fontWeight: 700, fill: T('color/text') }];
      for (const l of ['Product', 'Pricing', 'Docs', 'Company']) ops.push({ op: 'create', type: 'text', parent: 'n', text: l, fontSize: 15, fontWeight: 500, fill: T('color/text-muted') });
    } else if (/card/.test(t)) {
      say = 'A content card.';
      ops = [{ op: 'create', ref: 'c', type: 'frame', name: 'Card', width: 320, height: 360, radius: 16, fill: T('color/surface'), shadow: true, layout: { direction: 'vertical', gap: 12, padding: 20, stretch: true } },
        { op: 'create', type: 'rect', parent: 'c', name: 'Image', height: 160, radius: 10, fill: T('color/border') },
        { op: 'create', type: 'text', parent: 'c', text: 'Card title', fontSize: 18, fontWeight: 600, fill: T('color/text') },
        { op: 'create', type: 'text', parent: 'c', text: 'A short description that explains what this card is about.', width: 280, fontSize: 14, fill: T('color/text-muted') }];
    } else if (/(dark|light) mode/.test(t)) {
      const sel = this.model.topSelected().filter(e => e.type === 'frame');
      const col = this.model.dsVars().collections.find(c => c.modes.length > 1);
      const md = col?.modes.find(x => x.name.toLowerCase() === (t.includes('dark') ? 'dark' : 'light'));
      if (!sel.length || !md) { reply.content = 'Select a frame first (and make sure a collection has Light/Dark modes).'; return true; }
      sel.forEach(f => { f.varModes = Object.assign({}, f.varModes || {}, { [col.id]: md.id }); });
      this._actionLabel = `Switch to ${md.name}`; this.commit();
      reply.content = `Switched ${sel.length} frame${sel.length === 1 ? '' : 's'} to ${md.name}.`;
      return true;
    }
    if (!ops) {
      if (quiet) return false;
      reply.content = 'I’m the **offline assistant** — connect a model (Connections tab) to ask anything. Offline I can make: *login screen*, *pricing*, *navbar*, *card*, *design system #hex*, *dark mode* for the selected frame, and */doctor* to fix project issues.';
      return true;
    }
    const check = this.aiApplyOps(ops, { dry: true });
    reply.content = say; reply.ops = ops; reply.summary = this.aiSummary(check.summary); reply.meta = 'Offline assistant';
    if (this.ai.settings.autoApply) this.aiCommitOps(reply);
    return true;
  },

  // =================================================================== Doctor (self-healing)
  aiDoctorChecks() {
    const m = this.model, out = [];
    const add = (level, area, title, detail, fix, run) => out.push({ level, area, title, detail, fix, run });
    // connections
    for (const c of this.ai?.connections || []) if (c.enabled !== false && c.status === 'error') { const f = this.aiFixFor(c); add('error', 'AI', `${c.name} isn’t working`, `${AI_ERROR_HELP[c.lastErrorKind] || ''} ${c.lastError || ''}`, f ? f.label : 'Re-test', f ? f.run : () => this.aiTest(c)); }
    // runtime errors
    if (this.ai?.runtimeErrors?.length) { const e = this.ai.runtimeErrors.at(-1); add('error', 'App', `${this.ai.runtimeErrors.length} runtime error${this.ai.runtimeErrors.length === 1 ? '' : 's'} this session`, e.msg, this.aiLLMs().length ? 'Ask AI to diagnose' : 'Clear', () => { if (this.aiLLMs().length) { this.aiTab = 'play'; this.aiSend(`DesignStudio ${APP_VERSION} threw these errors. Explain the likely cause in plain words and what I can do. Do not return ds-ops.\n${this.ai.runtimeErrors.slice(-5).map(x => `${x.msg}\n${x.stack.split('\n').slice(0, 3).join('\n')}`).join('\n---\n')}`); } this.ai.runtimeErrors = []; }); }
    // design system (reuse Health)
    for (const it of (this.dsAudit?.() || []).filter(i => i.level !== 'info')) add(it.level, 'Design system', it.title, it.detail || '', it.fix, it.run);
    // prototype
    const all = m.allElements(), ids = new Set(all.map(e => e.id));
    const deadLinks = all.flatMap(e => (e.interactions || []).map((it, k) => ({ e, it, k }))).filter(x => PROTO_TARGETED.has?.(x.it.action) && (!x.it.targetId || !ids.has(x.it.targetId)));
    if (deadLinks.length) add('error', 'Prototype', `${deadLinks.length} interaction${deadLinks.length === 1 ? '' : 's'} point at a missing destination`, deadLinks.slice(0, 3).map(x => `“${x.e.name}”`).join(', '), 'Remove them', () => { for (const x of deadLinks.reverse()) x.e.interactions.splice(x.k, 1); });
    if (m.prototypeSettings.startingFrameId && !ids.has(m.prototypeSettings.startingFrameId)) add('warn', 'Prototype', 'The flow’s starting frame was deleted', '', 'Use the first frame', () => { m.prototypeSettings.startingFrameId = m.roots().find(f => f.type === 'frame')?.id || null; });
    const deadTrig = (m.triggers || []).filter(t => t.scope === 'design' && t.target && !ids.has(t.target) && t.enabled !== false);
    if (deadTrig.length) add('warn', 'Triggers', `${deadTrig.length} trigger${deadTrig.length === 1 ? '' : 's'} target a deleted layer`, '', 'Turn them off', () => deadTrig.forEach(t => { t.enabled = false; }));
    // layers
    const zero = m.elements.filter(e => e.type !== 'line' && e.type !== 'text' && e.type !== 'group' && (e.width < 0.5 || e.height < 0.5));
    if (zero.length) add('warn', 'Layers', `${zero.length} layer${zero.length === 1 ? '' : 's'} with zero size`, zero.slice(0, 4).map(e => e.name).join(', '), 'Delete them', () => m.deleteElements(zero.map(e => e.id)));
    const emptyText = m.elements.filter(e => e.type === 'text' && !String(e.text).trim() && !e.masterChildId);
    if (emptyText.length) add('warn', 'Layers', `${emptyText.length} empty text layer${emptyText.length === 1 ? '' : 's'}`, '', 'Delete them', () => m.deleteElements(emptyText.map(e => e.id)));
    const far = m.roots().filter(e => Math.abs(e.x) > 50000 || Math.abs(e.y) > 50000);
    if (far.length) add('warn', 'Layers', `${far.length} layer${far.length === 1 ? ' is' : 's are'} far off the canvas`, far.map(e => e.name).join(', '), 'Bring them back', () => far.forEach((e, k) => { const dx = -e.x + k * 40, dy = -e.y + k * 40; [e, ...m.descendantsOf(e.id)].forEach(x => { x.x += dx; x.y += dy; }); }));
    const missingImg = m.elements.filter(e => e.assetId && !m.assets[e.assetId]);
    if (missingImg.length) add('warn', 'Layers', `${missingImg.length} image${missingImg.length === 1 ? '' : 's'} lost their file`, '', 'Replace with placeholders', () => missingImg.forEach(e => { e.assetId = null; e.type = e.type === 'image' ? 'rect' : e.type; e.fills = [{ type: 'solid', color: '#c8c8d0', opacity: 1, visible: true, angle: 90, stops: [{ pos: 0, color: '#c8c8d0' }, { pos: 1, color: '#000000' }] }]; }));
    // contrast
    const lum = (hex) => { const c = Utils.parseColor(hex); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const bgOf = (el) => { for (const a of m.ancestorsOf(el)) { const f = a.fills.find(x => x.type === 'solid' && x.visible !== false && (x.opacity ?? 1) > 0.9); if (f) return f.color; } return m.page.bg; };
    const low = m.elements.filter(e => e.type === 'text' && e.visible !== false && e.fills[0]?.type === 'solid' && String(e.text).trim()).map(e => ({ e, r: ratio(e.fills[0].color, bgOf(e)), bg: bgOf(e) })).filter(x => x.r < (x.e.fontSize >= 24 || (x.e.fontSize >= 18.5 && x.e.fontWeight >= 700) ? 3 : 4.5));
    if (low.length) add('warn', 'Accessibility', `${low.length} text layer${low.length === 1 ? ' has' : 's have'} low contrast (WCAG AA)`, low.slice(0, 3).map(x => `“${x.e.name}” ${x.r.toFixed(1)}:1`).join(', '), 'Fix contrast', () => low.forEach(x => {
      // best readable color: prefer text tokens (bound), else near-black / white
      const ctx = m.modeContext(x.e, m.elements);
      const cands = m.dsVars().vars.filter(v => v.type === 'color' && /(text|on-|foreground)/i.test(v.name)).map(v => ({ v, c: m.resolveVar(v.id, ctx) })).filter(o => o.c && Utils.parseColor(o.c)).concat([{ c: '#111118' }, { c: '#ffffff' }]);
      const best = cands.map(o => ({ ...o, r: ratio(Utils.toHex(o.c), x.bg) })).sort((a, b) => b.r - a.r)[0];
      if (best.v) x.e.bindings = Object.assign({}, x.e.bindings || {}, { 'fills.0': best.v.id }); else if (x.e.bindings?.['fills.0']) delete x.e.bindings['fills.0'];
      x.e.fills[0].color = Utils.toHex(best.c);
    }));
    const hiddenN = m.elements.filter(e => e.visible === false).length;
    if (hiddenN > 20) add('info', 'Layers', `${hiddenN} hidden layers on this page`, 'Hidden layers still export in some formats and slow large files down.');
    return out;
  },
  aiDoctorReply(reply) {
    const issues = this.aiDoctorChecks(), fixable = issues.filter(i => i.run && i.level !== 'info' && i.area !== 'AI' && i.area !== 'App');
    fixable.forEach(i => { try { i.run(); } catch (e) { /* keep going */ } });
    if (fixable.length) { this._actionLabel = 'AI Doctor fixes'; this.commit(); }
    const left = this.aiDoctorChecks();
    reply.content = fixable.length ? `🩺 Fixed **${fixable.length}** issue${fixable.length === 1 ? '' : 's'}:\n${fixable.map(i => `- ${i.area}: ${i.title}`).join('\n')}${left.length ? `\n\nStill open (need your decision):\n${left.map(i => `- ${i.title}`).join('\n')}` : '\n\nThe project is healthy now.'}\n\nCtrl+Z undoes all of it.` : issues.length ? `🩺 Nothing to fix automatically. Open items:\n${issues.map(i => `- ${i.title}`).join('\n')}` : '🩺 Everything looks healthy — no broken links, tokens, layers or contrast problems found.';
    reply.meta = 'AI Doctor';
    this.aiLog('heal', `Doctor fixed ${fixable.length} issue(s)`);
  },
  aiRenderDoctor(body, issues) {
    const icon = { error: '⛔', warn: '⚠️', info: 'ℹ️' };
    const safe = issues.filter(i => i.run && i.level !== 'info' && i.area !== 'App');
    body.innerHTML = `<div class="ai-scroll"><div class="ai-doc-h"><div><b>Self-healing Doctor</b><p class="muted-text">Checks AI connections, runtime errors, design system, prototype links, layers and contrast. Every fix can be undone.</p></div>${safe.length ? `<button type="button" class="btn-primary" data-a="all">Fix all (${safe.length})</button>` : ''}<button type="button" data-a="re">Re-check</button></div>
      ${issues.length ? issues.map((it, i) => `<div class="ai-issue ${it.level}"><span>${icon[it.level]}</span><div><small>${Utils.escapeHtml(it.area)}</small><b>${Utils.escapeHtml(it.title)}</b>${it.detail ? `<p>${Utils.escapeHtml(it.detail)}</p>` : ''}</div>${it.run ? `<button type="button" data-fix="${i}">${Utils.escapeHtml(it.fix)}</button>` : ''}</div>`).join('') : '<div class="ai-ok">✅ All clear. Nothing needs fixing.</div>'}</div>`;
    const finish = (label) => { this._actionLabel = label; this.commit(); this.renderAI(); };
    body.querySelectorAll('[data-fix]').forEach(b => b.addEventListener('click', async () => { const it = issues[+b.dataset.fix]; await it.run(); if (it.area === 'AI') { this.renderAI(); return; } finish(`Doctor: ${it.fix}`); }));
    body.querySelector('[data-a="all"]')?.addEventListener('click', async () => { for (const it of safe) { try { await it.run(); } catch (e) { /* continue */ } } finish('Doctor: fix all'); Utils.toast(`Fixed ${safe.length} issue${safe.length === 1 ? '' : 's'}`, '🩺'); });
    body.querySelector('[data-a="re"]').addEventListener('click', () => { this.ai.connections.filter(c => c.enabled !== false).forEach(c => this.aiTest(c, { quiet: true })); this.renderAI(); });
  },
  aiRenderActivity(body) {
    const L = this.ai.log.slice().reverse();
    const icon = { ok: '✅', error: '⛔', heal: '✚', retry: '↻', request: '→', tool: '⚙' };
    const req = this.ai.log.filter(x => x.kind === 'request');
    const healed = this.ai.log.filter(x => x.kind === 'heal').length;
    body.innerHTML = `<div class="ai-scroll"><div class="ai-stats"><div><b>${req.length}</b><span>requests</span></div><div><b>${req.reduce((s, x) => s + (x.tin || 0) + (x.tout || 0), 0).toLocaleString()}</b><span>tokens</span></div><div><b>${req.length ? Math.round(req.reduce((s, x) => s + (x.ms || 0), 0) / req.length) : 0} ms</b><span>avg time</span></div><div><b>${healed}</b><span>auto-repairs</span></div></div>
      <div class="ai-doc-h"><span class="muted-text">Newest first · kept on this device</span><span class="ai-sp"></span><button type="button" data-a="copy">Copy log</button><button type="button" data-a="clear">Clear</button></div>
      ${L.length ? `<ul class="ai-log">${L.map(x => `<li class="${x.kind}"><span>${icon[x.kind] || '•'}</span><time>${new Date(x.at).toLocaleTimeString()}</time><p>${Utils.escapeHtml(x.text)}</p></li>`).join('')}</ul>` : '<div class="ai-ok">No activity yet.</div>'}</div>`;
    body.querySelector('[data-a="copy"]').addEventListener('click', async () => { const ok = await Utils.copyText(this.ai.log.map(x => `${x.at} [${x.kind}] ${x.text}`).join('\n')); Utils.toast(ok ? 'Log copied' : 'Clipboard unavailable', ok ? '📋' : '⚠️'); });
    body.querySelector('[data-a="clear"]').addEventListener('click', () => { this.ai.log = []; this.aiSave(); this.renderAI(); });
  }
};
Object.assign(StudioApp.prototype, AIStudioMixin);
