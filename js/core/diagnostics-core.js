/**
 * DesignStudio — diagnostics core (v3.31.0). Loads first, so it sees boot errors too.
 *
 * DesignStudio has no server or database: everything runs in this tab. So "monitoring" means watching the tab itself:
 *   logs      – a 1,000-entry ring buffer: console.error / warn, uncaught errors, unhandled promise rejections,
 *               CSP violations and app events (DSDiag.log). The last 200 entries survive a reload (localStorage).
 *   network   – every fetch() is timed (AI providers, the MCP bridge, local models): method, origin + path, status,
 *               duration, size. Query strings, headers and bodies are never recorded.
 *   cpu       – browsers expose no CPU %, so main-thread load is measured instead: Long Tasks (> 50 ms blocks) and
 *               event-loop lag (timer drift, sampled every 500 ms).
 *   memory    – JS heap (Chromium's performance.memory), sampled every 5 s; elsewhere reported as unavailable.
 *   storage   – browser storage is the app's database: autosave writes are timed and failures counted (shell/diagnostics.js).
 * Nothing here is sent anywhere. Everything stays in this browser until you export it.
 */
'use strict';

const DSDiag = (() => {
  const LOG_MAX = 1000, NET_MAX = 500, KEEP = 200, PERSIST_KEY = 'designstudio.diag.log';
  const t0 = Date.now();
  const logs = [], net = [], longTasks = [], lag = [], mem = [], storeOps = [], listeners = new Set();
  let previous = [];
  try { previous = JSON.parse(localStorage.getItem(PERSIST_KEY) || '[]') || []; } catch (_) { previous = []; }

  // ---- redaction: never keep secrets in logs
  const SECRET = /\b(sk-[A-Za-z0-9_-]{12,}|sk-ant-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abpr]-[A-Za-z0-9-]{10,})\b/g;
  const redact = (s) => String(s).replace(SECRET, '[redacted]').replace(/(authorization|api[-_]?key|x-api-key|token)(["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1$2[redacted]');
  const str = (v) => {
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (typeof v === 'string') return v;
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  };
  const cleanUrl = (u) => { try { const x = new URL(u, location.href); return x.protocol === 'data:' || x.protocol === 'blob:' ? `${x.protocol} (${String(u).length} chars)` : `${x.origin}${x.pathname}`; } catch (_) { return String(u).slice(0, 120); } };
  const push = (arr, max, item) => { arr.push(item); if (arr.length > max) arr.splice(0, arr.length - max); };
  const emit = (kind, item) => listeners.forEach(fn => { try { fn(kind, item); } catch (_) { /* a listener must not break logging */ } });

  function log(level, source, message, data) {
    const e = { t: Date.now(), level, source: String(source || 'app').slice(0, 40), msg: redact(String(message)).slice(0, 600) };
    if (data !== undefined) e.data = redact(str(data)).slice(0, 1200);
    push(logs, LOG_MAX, e); emit('log', e); return e;
  }

  // ---- console + global errors
  const orig = { error: console.error.bind(console), warn: console.warn.bind(console) };
  let inLog = false;
  ['error', 'warn'].forEach((lv) => {
    console[lv] = (...args) => {
      orig[lv](...args);
      if (inLog) return; inLog = true;
      try { const err = args.find(a => a instanceof Error); log(lv, 'console', args.map(str).join(' '), err?.stack ? err.stack.split('\n').slice(0, 6).join('\n') : undefined); } finally { inLog = false; }
    };
  });
  window.addEventListener('error', (e) => {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) { log('error', 'resource', `Failed to load ${e.target.tagName.toLowerCase()}: ${cleanUrl(e.target.src || e.target.href)}`); return; }
    log('error', 'uncaught', e.message || 'Script error', e.error?.stack ? e.error.stack.split('\n').slice(0, 6).join('\n') : `${e.filename || ''}:${e.lineno || ''}`);
  }, true);
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; log('error', 'promise', r instanceof Error ? `${r.name}: ${r.message}` : `Unhandled rejection: ${str(r)}`, r?.stack ? r.stack.split('\n').slice(0, 6).join('\n') : undefined); });
  document.addEventListener('securitypolicyviolation', (e) => log('warn', 'csp', `Blocked by the security policy: ${e.violatedDirective} → ${cleanUrl(e.blockedURI || '(inline)')}`));

  // ---- network timing (fetch is the only transport the app uses)
  const LONG_POLL = /\/bridge\/poll$/; // the MCP bridge holds this open on purpose (long-poll): not a latency signal
  if (window.fetch) {
    const f0 = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input?.url || String(input));
      const method = String(init?.method || input?.method || 'GET').toUpperCase();
      const rec = { t: Date.now(), method, url: cleanUrl(url), origin: (() => { try { const x = new URL(url, location.href); return /^(data|blob|file):$/.test(x.protocol) ? 'local data (data: / blob:)' : x.origin; } catch (_) { return '?'; } })(), stream: LONG_POLL.test(cleanUrl(url)) };
      const s = performance.now();
      try {
        const res = await f0(input, init);
        rec.ms = Math.round(performance.now() - s); rec.status = res.status; rec.ok = res.ok || res.type === 'opaque';
        const len = Number(res.headers?.get?.('content-length')); if (len) rec.bytes = len;
        push(net, NET_MAX, rec); emit('net', rec);
        if (!rec.ok && !rec.stream) log('warn', 'network', `${method} ${rec.url} → ${res.status} in ${rec.ms} ms`);
        return res;
      } catch (err) {
        rec.ms = Math.round(performance.now() - s); rec.status = 0; rec.ok = false; rec.err = err?.name === 'AbortError' ? 'aborted' : String(err?.message || err).slice(0, 160);
        push(net, NET_MAX, rec); emit('net', rec);
        if (rec.err !== 'aborted') log('warn', 'network', `${method} ${rec.url} failed after ${rec.ms} ms: ${rec.err}`);
        throw err;
      }
    };
  }

  // ---- CPU proxies: long tasks + event-loop lag
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) push(longTasks, 600, { t: performance.timeOrigin + e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
  } catch (_) { /* Long Tasks API not in this browser (Firefox / Safari) → lag only */ }
  let expect = performance.now() + 500;
  setInterval(() => { const now = performance.now(); push(lag, 240, { t: Date.now(), ms: Math.max(0, Math.round(now - expect)) }); expect = now + 500; }, 500);

  // ---- memory samples
  const sampleMem = () => { const m = performance.memory; if (m) push(mem, 120, { t: Date.now(), used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit }); };
  sampleMem(); setInterval(sampleMem, 5000);

  // ---- persist the tail of the log so a crash can be read after reload
  const persist = () => { try { localStorage.setItem(PERSIST_KEY, JSON.stringify(logs.slice(-KEEP))); } catch (_) { /* quota */ } };
  window.addEventListener('pagehide', persist); document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

  // ---- summaries
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
  function cpu(windowMs = 10000) {
    const since = Date.now() - windowMs;
    const busy = longTasks.filter(x => x.t >= since).reduce((a, x) => a + x.ms, 0);
    const lags = lag.filter(x => x.t >= since).map(x => x.ms);
    return { supported: typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes || []).includes('longtask'), busyPct: Math.min(100, Math.round(busy / windowMs * 100)), longTasks: longTasks.filter(x => x.t >= since).length, lagP95: pct(lags, .95), lagMax: lags.length ? Math.max(...lags) : 0 };
  }
  function memory() {
    const m = mem[mem.length - 1]; if (!m) return { supported: false };
    const first = mem.find(x => x.t >= Date.now() - 300000) || mem[0];
    const mins = (m.t - first.t) / 60000;
    return { supported: true, usedMB: m.used / 1048576, limitMB: m.limit / 1048576, pct: Math.round(m.used / m.limit * 100), trendMBperMin: mins > 0.5 ? (m.used - first.used) / 1048576 / mins : 0, samples: mem.map(x => x.used / 1048576) };
  }
  function network(last = 200) {
    const rows = net.slice(-last).filter(r => !r.stream), by = {};
    for (const r of rows) (by[r.origin] = by[r.origin] || []).push(r);
    const origins = Object.entries(by).map(([o, rs]) => ({ origin: o, count: rs.length, p50: pct(rs.map(r => r.ms), .5), p95: pct(rs.map(r => r.ms), .95), max: Math.max(...rs.map(r => r.ms)), errors: rs.filter(r => !r.ok).length }));
    const all = rows.map(r => r.ms);
    return { count: rows.length, p50: pct(all, .5), p95: pct(all, .95), errors: rows.filter(r => !r.ok).length, errorRate: rows.length ? rows.filter(r => !r.ok).length / rows.length : 0, origins, recent: net.slice(-60).reverse(), streams: net.filter(r => r.stream).length };
  }
  function storage() {
    const ops = storeOps.filter(o => !/diag\.ping$/.test(o.key || '')).slice(-100), ok = ops.filter(o => o.ok), last = ops[ops.length - 1];
    return { writes: ops.length, failures: ops.filter(o => !o.ok).length, p95: pct(ok.map(o => o.ms), .95), avg: ok.length ? Math.round(ok.reduce((a, o) => a + o.ms, 0) / ok.length) : 0, lastOk: [...ops].reverse().find(o => o.ok)?.t || 0, lastFailed: last && !last.ok, lastBytes: last?.bytes || 0 };
  }
  function recordStore(op) { push(storeOps, 300, { t: Date.now(), ...op }); emit('store', op); if (!op.ok) log('error', 'storage', `Autosave write failed (${op.target || 'browser storage'})`, op.err); }

  return {
    log, info: (s, m, d) => log('info', s, m, d), warn: (s, m, d) => log('warn', s, m, d), error: (s, m, d) => log('error', s, m, d),
    logs, previous, net, longTasks, lag, mem, storeOps, recordStore, cpu, memory, network, storage, pct, redact, cleanUrl,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, startedAt: t0, persist,
  };
})();
window.DSDiag = DSDiag;
DSDiag.info('app', 'Diagnostics started');
