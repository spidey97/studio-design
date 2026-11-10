/**
 * DesignStudio — Diagnostics panel + health indicator (v3.31.0). Data comes from js/core/diagnostics-core.js.
 *
 *  Status bar   a health dot (green / amber / red) — click it, Help › Diagnostics, or press Ctrl+Alt+D.
 *  Overview     frame rate · main-thread load (CPU) · event-loop lag · memory · storage · network · errors, with history.
 *  Logs         filter, search, copy, export; the previous session's tail is kept for after-crash reading.
 *  Network      response time per service (p50 / p95 / max, errors) and the latest calls.
 *  Storage      browser storage = the app's database: connection test, quota, persistence, autosave timings.
 *  Benchmark    a 3-second render test on a hidden canvas (does not touch your document).
 *  Alerts       one quiet toast when something turns red (memory, main thread, network); never repeated within 5 min.
 */
'use strict';

const DIAG_LIMITS = {
  memPct: [70, 85], busyPct: [30, 60], lagMs: [100, 300], netP95: [3000, 8000], netErr: [0.2, 0.5], storePct: [80, 95], fps: [40, 24],
};

const DiagnosticsMixin = {
  bindDiagnostics() {
    if (!window.DSDiag) return;
    const D = window.DSDiag;
    this.dg = { open: false, tab: 'overview', fps: [], hist: { busy: [], lag: [], net: [] }, alerted: {}, estimate: null, idb: null, filter: 'all', q: '', prev: false };
    // ---- storage = database: time every IndexedDB write (autosave, thumbnails, prefs)
    if (typeof Store !== 'undefined' && !Store._dgWrapped) {
      const set0 = Store.set.bind(Store); Store._dgWrapped = true;
      Store.set = async (key, value) => {
        const t = performance.now(); let ok = false, err;
        try { ok = await set0(key, value); } catch (e) { err = e; }
        D.recordStore({ ms: Math.round(performance.now() - t), ok: !!ok, bytes: typeof value === 'string' ? value.length : 0, target: (await Store.open()) ? 'IndexedDB' : 'localStorage', key: String(key).slice(0, 60), err: err ? String(err.message || err) : undefined });
        if (err) throw err; return ok;
      };
    }
    if (this.writeFile && !this._dgFile) {
      const w0 = this.writeFile.bind(this); this._dgFile = true;
      this.writeFile = async (json) => { const t = performance.now(); try { const r = await w0(json); D.recordStore({ ms: Math.round(performance.now() - t), ok: this.saveState?.status !== 'error', bytes: json?.length || 0, target: 'project file' }); return r; } catch (e) { D.recordStore({ ms: Math.round(performance.now() - t), ok: false, target: 'project file', err: String(e.message || e) }); throw e; } };
    }
    // ---- status-bar health dot
    const sbAnchor = document.getElementById('sb-panels') || document.getElementById('sb-version');
    if (sbAnchor) {
      const b = document.createElement('button'); b.type = 'button'; b.id = 'sb-health'; b.className = 'sb-btn dg-health';
      b.innerHTML = '<i class="dg-dot" aria-hidden="true"></i><span>Healthy</span>'; b.title = 'Diagnostics: performance, memory, storage, network and logs (Ctrl+Alt+D)';
      b.setAttribute('aria-label', 'Diagnostics: app is healthy'); b.addEventListener('click', () => this.dgToggle());
      sbAnchor.parentNode.insertBefore(b, sbAnchor);
    }
    // ---- Help menu + command + shortcut
    const about = document.querySelector('[data-action="about"]');
    if (about) { const it = document.createElement('div'); it.className = about.className; it.dataset.action = 'diagnostics'; it.setAttribute('role', 'menuitem'); it.innerHTML = 'Diagnostics… <span class="dropdown-shortcut">Ctrl+Alt+D</span>'; about.parentNode.insertBefore(it, about); }
    if (this.commands) this.commands.diagnostics = { run: () => this.dgToggle(true) };
    window.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'd' || e.key === 'D' || e.code === 'KeyD')) { e.preventDefault(); e.stopImmediatePropagation(); this.dgToggle(); } }, true); // must not also run Ctrl+D (duplicate)
    // ---- background health check (cheap: no animation frames while the panel is closed)
    setInterval(() => this.dgTick(), 5000); setTimeout(() => this.dgTick(), 1500);
    D.on((kind, item) => { if (kind === 'log' && item.level === 'error') { this.dgTickSoon(); } if (this.dg.open && (kind === 'log' || kind === 'net' || kind === 'store')) this.dgRenderSoon(); });
    D.info('app', `DesignStudio ${(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '')} ready`.trim());
  },

  // ------------------------------------------------------------------ health model
  dgHealth() {
    const D = window.DSDiag, L = DIAG_LIMITS, items = [];
    const lvl = (v, [a, b], invert) => (invert ? (v <= b ? 'bad' : v <= a ? 'warn' : 'ok') : (v >= b ? 'bad' : v >= a ? 'warn' : 'ok'));
    const m = D.memory();
    const hist = this.model?.history ? ` · undo ${this.model.history.length} steps (${((this.model.historyChars || 0) / 1048576).toFixed(1)} MB)` : '';
    items.push(m.supported ? { key: 'mem', label: 'Memory', level: lvl(m.pct, L.memPct), value: `${m.usedMB.toFixed(0)} MB`, detail: `${m.pct}% of ${(m.limitMB / 1024).toFixed(1)} GB JS heap${m.trendMBperMin > 2 ? ` · rising ${m.trendMBperMin.toFixed(1)} MB/min` : ''}${hist}`, spark: m.samples }
      : { key: 'mem', label: 'Memory', level: 'na', value: 'n/a', detail: 'This browser does not report memory (Chrome and Edge do)' });
    const c = D.cpu();
    items.push({ key: 'cpu', label: 'Main thread (CPU)', level: c.supported ? lvl(c.busyPct, L.busyPct) : 'na', value: c.supported ? `${c.busyPct}% busy` : 'n/a', detail: c.supported ? `${c.longTasks} long task${c.longTasks === 1 ? '' : 's'} in the last 10 s` : 'Long-task timing is not available in this browser', spark: this.dg.hist.busy });
    items.push({ key: 'lag', label: 'Responsiveness', level: lvl(c.lagP95, L.lagMs), value: `${c.lagP95} ms`, detail: `Event-loop delay p95 · max ${c.lagMax} ms (10 s)`, spark: this.dg.hist.lag });
    if (this.dg.fps.length) { const f = this.dg.fps[this.dg.fps.length - 1]; items.push({ key: 'fps', label: 'Frame rate', level: lvl(f, L.fps, true), value: `${f} fps`, detail: 'Measured while this panel is open', spark: this.dg.fps }); }
    const s = D.storage(), est = this.dg.estimate, idb = this.dg.idb;
    const spct = est?.quota ? Math.round(est.usage / est.quota * 100) : 0;
    const sLevel = s.lastFailed || idb?.ok === false ? 'bad' : lvl(spct, L.storePct);
    items.push({ key: 'store', label: 'Storage (database)', level: sLevel, value: idb ? (idb.ok ? (idb.fallback ? 'localStorage' : 'IndexedDB ✓') : 'Unavailable') : (s.lastFailed ? 'Failing' : 'IndexedDB'), detail: `${s.writes ? `Autosave p95 ${s.p95} ms · ${s.failures} failed` : 'No writes yet'}${est?.quota ? ` · ${spct}% of quota used` : ''}` });
    const n = D.network();
    const nLevel = !n.count ? 'ok' : (n.errorRate >= L.netErr[1] || n.p95 >= L.netP95[1] ? 'bad' : n.errorRate >= L.netErr[0] || n.p95 >= L.netP95[0] ? 'warn' : 'ok');
    items.push({ key: 'net', label: 'API response time', level: nLevel, value: n.count ? `${this.dgMs(n.p95)} p95` : 'No calls', detail: n.count ? `${n.count} calls · p50 ${this.dgMs(n.p50)} · ${n.errors} error${n.errors === 1 ? '' : 's'}` : 'AI providers, MCP bridge and local models are timed here', spark: this.dg.hist.net });
    const since = Date.now() - 15 * 60000, errs = D.logs.filter(l => l.level === 'error' && l.t >= since).length, warns = D.logs.filter(l => l.level === 'warn' && l.t >= since).length;
    items.push({ key: 'err', label: 'Errors', level: errs ? 'warn' : 'ok', value: String(errs), detail: `${warns} warning${warns === 1 ? '' : 's'} · last 15 min` });
    const order = { ok: 0, na: 0, warn: 1, bad: 2 }, worst = items.reduce((a, i) => Math.max(a, order[i.level]), 0);
    return { level: ['ok', 'warn', 'bad'][worst], items };
  },
  dgMs(ms) { return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`; },
  dgTickSoon() { clearTimeout(this._dgTs); this._dgTs = setTimeout(() => this.dgTick(), 300); },
  async dgTick() {
    const D = window.DSDiag, c = D.cpu(), n = D.network(50);
    const H = this.dg.hist, push = (a, v) => { a.push(v); if (a.length > 60) a.shift(); };
    push(H.busy, c.busyPct); push(H.lag, c.lagP95); push(H.net, n.p95);
    if (navigator.storage?.estimate && (!this.dg.estAt || Date.now() - this.dg.estAt > 30000)) { this.dg.estAt = Date.now(); try { this.dg.estimate = await navigator.storage.estimate(); } catch (_) { /* ignore */ } }
    if (!this.dg.idb) this.dgPing(true);
    const h = this.dgHealth();
    const b = document.getElementById('sb-health');
    if (b) {
      b.dataset.level = h.level; const bad = h.items.filter(i => i.level === 'bad' || i.level === 'warn');
      b.querySelector('span').textContent = h.level === 'ok' ? 'Healthy' : h.level === 'warn' ? 'Check' : 'Issue';
      b.setAttribute('aria-label', `Diagnostics: ${h.level === 'ok' ? 'app is healthy' : bad.map(i => `${i.label} ${i.value}`).join(', ')}`);
    }
    this.dgAlerts(h);
    if (this.dg.open) this.dgRender();
  },
  dgAlerts(h) {
    const msg = { mem: (i) => `Memory is high (${i.value}, ${i.detail.split(' ·')[0]}). Save your work and reload the tab to free memory.`, cpu: (i) => `DesignStudio is working hard (${i.value} over the last 10 s). Very large documents, effects or 3D scenes can slow it down.`, net: (i) => `A service is responding slowly or failing (${i.value}, ${i.detail}). Open Diagnostics › Network for details.` };
    for (const i of h.items) {
      if (i.level !== 'bad' || !msg[i.key]) continue;
      const last = this.dg.alerted[i.key] || 0; if (Date.now() - last < 300000) continue;
      this.dg.alerted[i.key] = Date.now(); window.DSDiag.warn('health', `${i.label}: ${i.value} (${i.detail})`);
      Utils.toast(msg[i.key](i), '⚠️');
    }
  },
  async dgPing(quiet) {
    const t = performance.now(); let ok = false, fallback = false, err = '';
    try {
      const db = await Store.open(); fallback = !db;
      const v = String(Date.now()); await Store.set('designstudio.diag.ping', v); ok = (await Store.get('designstudio.diag.ping')) === v;
    } catch (e) { err = String(e.message || e); }
    this.dg.idb = { ok, fallback, ms: Math.round(performance.now() - t), at: Date.now(), err };
    if (!quiet) { window.DSDiag.info('storage', `Storage connection test: ${ok ? `OK in ${this.dg.idb.ms} ms` : 'FAILED'}${fallback ? ' (IndexedDB unavailable, using localStorage)' : ''}`); this.dgRender(); }
    return this.dg.idb;
  },

  // ------------------------------------------------------------------ panel
  dgToggle(force) {
    const open = force !== undefined ? force : !this.dg.open;
    let p = document.getElementById('dg-panel');
    if (open && !p) p = this.dgBuild();
    this.dg.open = open; if (!p) return;
    p.hidden = !open; document.getElementById('sb-health')?.classList.toggle('active', open);
    if (open) { this.dgRender(); this.dgFps(); p.querySelector('.dg-tab.on')?.focus(); } else { cancelAnimationFrame(this._dgRaf); this.dg.fps = []; document.getElementById('sb-health')?.focus(); }
  },
  dgBuild() {
    const p = document.createElement('section'); p.id = 'dg-panel'; p.className = 'dg-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Diagnostics'); p.hidden = true;
    const tabs = [['overview', 'Overview'], ['logs', 'Logs'], ['network', 'Network'], ['storage', 'Storage'], ['bench', 'Benchmark']];
    p.innerHTML = `<div class="modal-header dg-head"><b>${Icons.svg('gauge', 15)} Diagnostics</b><span class="dg-sub">Everything stays in this browser</span><button type="button" class="dg-x" aria-label="Close diagnostics">×</button></div>
      <nav class="dg-tabs" role="tablist">${tabs.map(([k, t]) => `<button type="button" role="tab" class="dg-tab${k === this.dg.tab ? ' on' : ''}" data-tab="${k}" aria-selected="${k === this.dg.tab}">${t}</button>`).join('')}</nav>
      <div class="dg-body" role="tabpanel"></div>
      <div class="dg-foot"><span class="dg-up"></span><button type="button" class="dg-btn" data-act="export">Export report</button></div>`;
    document.body.appendChild(p);
    p.querySelector('.dg-x').addEventListener('click', () => this.dgToggle(false));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.dg.open && p.contains(document.activeElement)) { e.preventDefault(); e.stopImmediatePropagation(); this.dgToggle(false); } }, true); // before the app's own Escape handling
    p.querySelector('.dg-tabs').addEventListener('click', (e) => { const b = e.target.closest('.dg-tab'); if (!b) return; this.dg.tab = b.dataset.tab; p.querySelectorAll('.dg-tab').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); }); this.dgRender(); });
    p.addEventListener('click', (e) => { const a = e.target.closest('[data-act]'); if (a) this.dgAct(a.dataset.act, a); });
    p.addEventListener('input', (e) => { if (e.target.matches('.dg-q')) { this.dg.q = e.target.value; this.dgRenderSoon(); } });
    p.addEventListener('change', (e) => { if (e.target.matches('.dg-lv')) { this.dg.filter = e.target.value; this.dgRender(); } if (e.target.matches('.dg-prev')) { this.dg.prev = e.target.checked; this.dgRender(); } });
    return p;
  },
  dgFps() {
    let n = 0, t = performance.now();
    const loop = (now) => { if (!this.dg.open) return; n++; if (now - t >= 1000) { this.dg.fps.push(Math.round(n * 1000 / (now - t))); if (this.dg.fps.length > 60) this.dg.fps.shift(); n = 0; t = now; } this._dgRaf = requestAnimationFrame(loop); };
    this._dgRaf = requestAnimationFrame(loop);
  },
  dgRenderSoon() { if (this._dgR) return; this._dgR = setTimeout(() => { this._dgR = 0; this.dgRender(); }, 250); },
  dgSpark(a, w = 120, h = 26) {
    const v = (a || []).filter(Number.isFinite); if (v.length < 2) return '';
    const mx = Math.max(...v, 1), mn = Math.min(...v, 0), sx = w / (v.length - 1);
    return `<svg class="dg-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${v.map((x, i) => `${(i * sx).toFixed(1)},${(h - 2 - (x - mn) / (mx - mn || 1) * (h - 4)).toFixed(1)}`).join(' ')}"/></svg>`;
  },
  dgRender() {
    const p = document.getElementById('dg-panel'); if (!p || p.hidden) return;
    const body = p.querySelector('.dg-body'), D = window.DSDiag, esc = Utils.escapeHtml || ((s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
    const keepScroll = body.scrollTop, focusQ = document.activeElement?.classList.contains('dg-q'), selS = document.activeElement?.selectionStart;
    const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    let h = '';
    if (this.dg.tab === 'overview') {
      const hh = this.dgHealth();
      h = `<p class="dg-sum dg-${hh.level}">${hh.level === 'ok' ? 'Everything looks healthy.' : hh.level === 'warn' ? 'Something needs a look. Amber items are listed first.' : 'Something is wrong. Red items are listed first.'}</p><div class="dg-grid">${[...hh.items].sort((a, b) => ({ bad: 0, warn: 1, ok: 2, na: 3 }[a.level] - { bad: 0, warn: 1, ok: 2, na: 3 }[b.level])).map(i => `<div class="dg-tile dg-${i.level}"><span class="dg-l">${i.label}</span><b>${esc(i.value)}</b><span class="dg-d">${esc(i.detail)}</span>${this.dgSpark(i.spark)}</div>`).join('')}</div>
        <p class="dg-note">The CPU figure is main-thread load: browsers don't expose CPU %, so it counts time blocked by long tasks (over 50 ms). Memory is the JavaScript heap; images and 3D textures held by the GPU aren't included.</p>`;
    } else if (this.dg.tab === 'logs') {
      const src = this.dg.prev ? D.previous : D.logs, q = this.dg.q.toLowerCase();
      const rows = src.filter(l => (this.dg.filter === 'all' || l.level === this.dg.filter) && (!q || `${l.msg} ${l.source} ${l.data || ''}`.toLowerCase().includes(q))).slice(-400).reverse();
      h = `<div class="dg-tools"><select class="dg-lv" aria-label="Log level">${[['all', 'All levels'], ['error', 'Errors'], ['warn', 'Warnings'], ['info', 'Info']].map(([v, t]) => `<option value="${v}"${v === this.dg.filter ? ' selected' : ''}>${t}</option>`).join('')}</select><input class="dg-q" type="search" placeholder="Search logs" aria-label="Search logs" value="${esc(this.dg.q)}"><label class="dg-chk"><input type="checkbox" class="dg-prev"${this.dg.prev ? ' checked' : ''}> Previous session</label><button type="button" class="dg-btn" data-act="copy">Copy</button><button type="button" class="dg-btn" data-act="logtxt">Export .txt</button><button type="button" class="dg-btn" data-act="clear">Clear</button></div>
        <div class="dg-logs" role="log" aria-live="off">${rows.map(l => `<div class="dg-row dg-${l.level}"><time>${time(l.t)}</time><em>${l.level}</em><span class="dg-src">${esc(l.source)}</span><span class="dg-msg">${esc(l.msg)}${l.data ? `<details><summary>details</summary><pre>${esc(l.data)}</pre></details>` : ''}</span></div>`).join('') || '<p class="dg-empty">No log entries match.</p>'}</div>`;
    } else if (this.dg.tab === 'network') {
      const n = D.network();
      h = `<div class="dg-kpis"><div><span>Calls</span><b>${n.count}</b></div><div><span>p50</span><b>${n.count ? this.dgMs(n.p50) : '—'}</b></div><div><span>p95</span><b>${n.count ? this.dgMs(n.p95) : '—'}</b></div><div><span>Errors</span><b>${n.errors}</b></div><div><span>Long-poll</span><b>${n.streams}</b></div></div>
        <table class="dg-table"><thead><tr><th>Service</th><th>Calls</th><th>p50</th><th>p95</th><th>Max</th><th>Errors</th></tr></thead><tbody>${n.origins.map(o => `<tr><td>${esc(o.origin)}</td><td>${o.count}</td><td>${this.dgMs(o.p50)}</td><td class="${o.p95 >= DIAG_LIMITS.netP95[1] ? 'dg-bad' : o.p95 >= DIAG_LIMITS.netP95[0] ? 'dg-warn' : ''}">${this.dgMs(o.p95)}</td><td>${this.dgMs(o.max)}</td><td class="${o.errors ? 'dg-bad' : ''}">${o.errors}</td></tr>`).join('') || '<tr><td colspan="6" class="dg-empty">No network calls yet. AI providers, the MCP bridge and local models appear here.</td></tr>'}</tbody></table>
        <h4 class="dg-h">Latest calls</h4><div class="dg-logs">${n.recent.map(r => `<div class="dg-row ${!r.ok ? 'dg-error' : r.ms >= DIAG_LIMITS.netP95[0] && !r.stream ? 'dg-warn' : ''}"><time>${time(r.t)}</time><em>${r.method}</em><span class="dg-src">${r.stream ? 'long-poll' : r.status || esc(r.err || 'failed')} · ${this.dgMs(r.ms)}</span><span class="dg-msg">${esc(r.url)}${r.bytes ? ` · ${(r.bytes / 1024).toFixed(1)} KB` : ''}</span></div>`).join('') || '<p class="dg-empty">—</p>'}</div>
        <p class="dg-note">Only method, address and timing are recorded. Query strings, headers, keys and bodies never are.</p>`;
    } else if (this.dg.tab === 'storage') {
      const s = D.storage(), e = this.dg.estimate, i = this.dg.idb, pct = e?.quota ? Math.round(e.usage / e.quota * 100) : 0;
      let lsBytes = 0; try { lsBytes = (localStorage.getItem(typeof AUTOSAVE_KEY !== 'undefined' ? AUTOSAVE_KEY : 'designstudio.autosave.v3') || '').length; } catch (_) { /* blocked */ }
      h = `<div class="dg-kpis"><div><span>Connection</span><b class="${i?.ok === false ? 'dg-bad' : ''}">${i ? (i.ok ? (i.fallback ? 'localStorage' : 'IndexedDB ✓') : 'Failed') : '…'}</b></div><div><span>Round trip</span><b>${i ? `${i.ms} ms` : '—'}</b></div><div><span>Autosave p95</span><b>${s.writes ? `${s.p95} ms` : '—'}</b></div><div><span>Failed writes</span><b class="${s.failures ? 'dg-bad' : ''}">${s.failures}</b></div></div>
        <div class="dg-meter"><div style="width:${Math.max(1, pct)}%" class="${pct >= DIAG_LIMITS.storePct[1] ? 'dg-bad' : pct >= DIAG_LIMITS.storePct[0] ? 'dg-warn' : ''}"></div></div>
        <p class="dg-d">${e?.quota ? `${(e.usage / 1048576).toFixed(1)} MB used of ${(e.quota / 1073741824).toFixed(1)} GB available to this app (${pct}%)` : 'This browser does not report storage quota.'}</p>
        <table class="dg-table"><tbody><tr><td>Autosave writes (this session)</td><td>${s.writes}</td></tr><tr><td>Average write</td><td>${s.writes ? `${s.avg} ms` : '—'}</td></tr><tr><td>Last successful save</td><td>${s.lastOk ? time(s.lastOk) : '—'}</td></tr><tr><td>Last project size</td><td>${s.lastBytes ? `${(s.lastBytes / 1048576).toFixed(2)} MB` : '—'}</td></tr><tr><td>Quick-restore copy (localStorage)</td><td>${lsBytes ? `${(lsBytes / 1048576).toFixed(2)} MB` : 'none (project too big or private mode)'}</td></tr><tr><td>Protected from cleanup</td><td class="dg-persist">…</td></tr></tbody></table>
        <div class="dg-tools"><button type="button" class="dg-btn" data-act="ping">Test connection</button><button type="button" class="dg-btn" data-act="persist">Keep my data (ask the browser not to clear it)</button></div>`;
      navigator.storage?.persisted?.().then(v => { const c = p.querySelector('.dg-persist'); if (c) c.textContent = v ? 'Yes' : 'No (the browser may clear it when the disk is low)'; }).catch(() => {});
    } else {
      const b = this.dg.bench;
      h = `<p class="dg-d">Draws thousands of shapes on a hidden canvas for 3 seconds to measure how much this device can render. Your document isn't touched.</p><div class="dg-tools"><button type="button" class="dg-btn dg-primary" data-act="bench"${this.dg.benching ? ' disabled' : ''}>${this.dg.benching ? 'Running…' : 'Run benchmark'}</button></div>
        ${b ? `<div class="dg-kpis"><div><span>Score</span><b>${b.score}</b></div><div><span>Shapes / frame at 60 fps</span><b>${b.at60.toLocaleString()}</b></div><div><span>Frame time</span><b>${b.ms.toFixed(1)} ms</b></div><div><span>Long tasks</span><b>${b.long}</b></div></div><p class="dg-d">${b.verdict}</p>` : ''}`;
    }
    body.innerHTML = h; body.scrollTop = keepScroll;
    if (focusQ) { const q = body.querySelector('.dg-q'); q?.focus(); try { q?.setSelectionRange(selS, selS); } catch (_) { /* ignore */ } }
    p.querySelector('.dg-up').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })} · session ${Math.round((Date.now() - D.startedAt) / 60000)} min`;
  },
  async dgAct(act, el) {
    const D = window.DSDiag;
    const lines = (src) => src.map(l => `${new Date(l.t).toISOString()} ${l.level.toUpperCase().padEnd(5)} [${l.source}] ${l.msg}${l.data ? `\n    ${l.data.replace(/\n/g, '\n    ')}` : ''}`).join('\n');
    if (act === 'copy') { try { await navigator.clipboard.writeText(lines(this.dg.prev ? D.previous : D.logs)); Utils.toast('Logs copied', '📋'); } catch (_) { Utils.toast('Copy is blocked here. Use Export .txt instead.', 'ℹ️'); } }
    if (act === 'logtxt') this.dgDownload(`designstudio-log-${this.dgStamp()}.txt`, lines(this.dg.prev ? D.previous : D.logs), 'text/plain');
    if (act === 'clear') { D.logs.splice(0); D.info('app', 'Log cleared'); this.dgRender(); }
    if (act === 'ping') { el.disabled = true; await this.dgPing(false); }
    if (act === 'persist') { const ok = await navigator.storage?.persist?.().catch(() => false); Utils.toast(ok ? 'The browser will keep DesignStudio data' : 'The browser declined. Saving to a project file is still the safest option.', ok ? '✅' : 'ℹ️'); this.dgRender(); }
    if (act === 'bench') this.dgBench();
    if (act === 'export') this.dgDownload(`designstudio-diagnostics-${this.dgStamp()}.json`, JSON.stringify(this.dgReport(), null, 2), 'application/json');
  },
  dgReport() {
    const D = window.DSDiag, h = this.dgHealth();
    return { app: 'DesignStudio', version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''), generated: new Date().toISOString(), sessionMinutes: Math.round((Date.now() - D.startedAt) / 60000),
      browser: navigator.userAgent, screen: `${screen.width}×${screen.height} @${devicePixelRatio}x`, cores: navigator.hardwareConcurrency || null, deviceMemoryGB: navigator.deviceMemory || null,
      document: { layers: this.model?.allElements?.().length ?? null, section: this.section || 'design', undoSteps: this.model?.history?.length ?? null, undoMB: this.model ? Math.round((this.model.historyChars || 0) / 104857.6) / 10 : null },
      health: h, cpu: D.cpu(), memory: D.memory(), network: D.network(), storage: { ...D.storage(), estimate: this.dg.estimate ? { usage: this.dg.estimate.usage, quota: this.dg.estimate.quota } : null, connection: this.dg.idb },
      benchmark: this.dg.bench || null, logs: D.logs, previousSession: D.previous };
  },
  dgStamp() { return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); },
  dgDownload(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); Utils.toast(`Saved ${name}`, '💾'); },
  async dgBench() {
    this.dg.benching = true; this.dgRender();
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
    const lt0 = window.DSDiag.longTasks.length; let n = 2000, frames = 0, drawn = 0, total = 0; const end = performance.now() + 3000;
    while (performance.now() < end) {
      const t = performance.now();
      ctx.clearRect(0, 0, 1280, 720);
      for (let i = 0; i < n; i++) { ctx.fillStyle = i % 3 ? '#3A8BFF' : '#FFC21A'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect((i * 37) % 1260, (i * 53) % 700, 18, 18, 4) : ctx.rect((i * 37) % 1260, (i * 53) % 700, 18, 18); ctx.fill(); }
      ctx.getImageData(0, 0, 1, 1); // flush
      const ms = performance.now() - t; total += ms; frames++; drawn += n;
      n = Math.max(500, Math.min(60000, Math.round(n * (12 / Math.max(ms, 1)) ** 0.5))); // home in on ~12 ms of drawing per frame
      await new Promise(r => setTimeout(r, 0));
    }
    const msPer = total / frames, perMs = drawn / total, at60 = Math.round(perMs * 14);
    const score = Math.round(perMs * 10);
    this.dg.bench = { score, at60, ms: msPer, long: window.DSDiag.longTasks.length - lt0, verdict: at60 > 20000 ? 'Fast. Large documents with thousands of layers will stay smooth.' : at60 > 6000 ? 'Good. Typical projects will stay smooth; very large documents may slow down while zoomed out.' : 'Limited. Split very large documents into pages and turn off heavy effects while editing.' };
    window.DSDiag.info('benchmark', `Benchmark: score ${score}, ~${at60.toLocaleString()} shapes per 60 fps frame`);
    this.dg.benching = false; this.dgRender();
  },
};
Object.assign(StudioApp.prototype, DiagnosticsMixin);
