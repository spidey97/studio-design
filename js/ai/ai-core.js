/**
 * DesignStudio — AI core (v3.9.0).
 * Providers (Anthropic, OpenAI, Gemini, OpenAI-compatible links: OpenRouter, Groq, Ollama, LM Studio…), a minimal MCP
 * client (Streamable HTTP + SSE responses), and a self-healing router: classifies errors, retries with backoff,
 * repairs URLs / models automatically, fails over to the next healthy connection, and repairs malformed JSON answers.
 * Keys live only in this browser (localStorage or session) — never in project files or exports.
 */
'use strict';

const AI_STORE_KEY = 'designstudio.ai.v1';
const AI_PROVIDERS = {
  anthropic: { label: 'Anthropic Claude', icon: '✳', base: 'https://api.anthropic.com/v1', models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'], keyHint: 'sk-ant-…' },
  openai: { label: 'OpenAI', icon: '◎', base: 'https://api.openai.com/v1', models: [], keyHint: 'sk-…' },
  gemini: { label: 'Google Gemini', icon: '✦', base: 'https://generativelanguage.googleapis.com/v1beta', models: [], keyHint: 'AIza…' },
  compat: { label: 'OpenAI-compatible link', icon: '⇄', base: '', models: [], keyHint: 'optional' },
  mcp: { label: 'MCP server', icon: '⚙', base: '', models: [], keyHint: 'optional bearer token' }
};

/** Guess a connection from whatever the user pasted: key, endpoint URL or MCP link. */
function aiDetect(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^sk-ant-/.test(s)) return { type: 'anthropic', key: s, name: 'Claude' };
  if (/^sk-or-/.test(s)) return { type: 'compat', key: s, url: 'https://openrouter.ai/api/v1', name: 'OpenRouter' };
  if (/^gsk_/.test(s)) return { type: 'compat', key: s, url: 'https://api.groq.com/openai/v1', name: 'Groq' };
  if (/^xai-/.test(s)) return { type: 'compat', key: s, url: 'https://api.x.ai/v1', name: 'xAI' };
  if (/^AIza[0-9A-Za-z_-]{20,}/.test(s)) return { type: 'gemini', key: s, name: 'Gemini' };
  if (/^sk-[A-Za-z0-9_-]{16,}/.test(s)) return { type: 'openai', key: s, name: 'OpenAI' };
  if (/^(https?:\/\/|localhost|127\.|[\w-]+\.[\w.-]+\/)/i.test(s)) {
    const url = aiNormalizeUrl(s);
    if (/\/(mcp|sse)(\/|$|\?)/i.test(url) || /mcp/i.test(new URL(url).hostname)) return { type: 'mcp', url, name: new URL(url).hostname };
    if (/:11434/.test(url)) return { type: 'compat', url: aiNormalizeUrl(url.replace(/\/(v1)?\/?$/, '') + '/v1'), name: 'Ollama (local)' };
    if (/:1234/.test(url)) return { type: 'compat', url: aiNormalizeUrl(url.replace(/\/(v1)?\/?$/, '') + '/v1'), name: 'LM Studio (local)' };
    return { type: 'compat', url, name: new URL(url).hostname, ambiguous: true };
  }
  return { type: 'unknown', key: s };
}
/** Repairs common URL mistakes: missing scheme, trailing slashes, pasted endpoint paths. */
function aiNormalizeUrl(u) {
  let s = String(u || '').trim().replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(s)) s = (/^(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(s) ? 'http://' : 'https://') + s;
  s = s.replace(/\/(chat\/completions|completions|responses|messages)\/?$/i, '').replace(/\/+$/, '');
  try { return new URL(s).toString().replace(/\/+$/, ''); } catch (e) { return s; }
}
const aiSleep = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true }); });

/** Error with a category the router (and the UI) can act on. */
class AIError extends Error {
  constructor(kind, message, extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); }
}
const AI_ERROR_HELP = {
  auth: 'The key was rejected. Paste a new key (check it was copied completely, without spaces).',
  model: 'That model isn’t available for this key. Auto-fix picks one the key can use.',
  rate: 'Rate limit reached — DesignStudio waits and retries automatically.',
  overloaded: 'The service is busy. Retrying, then switching to your next connection.',
  network: 'The browser couldn’t reach it. Check the URL and your internet; local servers must allow this page (CORS). For Ollama start it with OLLAMA_ORIGINS=* .',
  cors: 'Blocked by the browser (CORS). The server must allow requests from this page, or use it through a proxy / MCP gateway that allows it.',
  timeout: 'No answer in time. Retrying with a longer wait.',
  quota: 'Out of credit / quota for this key. Add credit or use another connection.',
  bad_request: 'The request was refused. Details below.',
  server: 'The service had an internal error. Retrying.',
  parse: 'The answer wasn’t in the expected format. DesignStudio repaired or re-asked automatically.',
  unknown: 'Something unexpected happened. Details below.'
};

// =========================================================================== Store
const AIStore = {
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(AI_STORE_KEY) || sessionStorage.getItem(AI_STORE_KEY) || 'null'); } catch (e) { d = null; }
    return Object.assign({ connections: [], settings: { remember: true, timeout: 60, retries: 2, autoApply: false, autoDoctor: true, maxTokens: 4096 }, log: [], chat: [] }, d || {});
  },
  save(state) {
    const body = JSON.stringify({ ...state, log: state.log.slice(-200), chat: state.chat.slice(-60) });
    try {
      if (state.settings.remember) { localStorage.setItem(AI_STORE_KEY, body); sessionStorage.removeItem(AI_STORE_KEY); }
      else { sessionStorage.setItem(AI_STORE_KEY, body); localStorage.removeItem(AI_STORE_KEY); }
    } catch (e) { /* storage full / blocked: keep in memory */ }
  }
};

// =========================================================================== Providers
const AIProviders = {
  async request(conn, url, init, timeoutMs, signal) {
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const t = setTimeout(() => ctl.abort('timeout'), timeoutMs);
    let res;
    try { res = await fetch(url, { ...init, signal: ctl.signal }); }
    catch (e) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (ctl.signal.aborted) throw new AIError('timeout', `No response after ${Math.round(timeoutMs / 1000)} s`);
      // fetch gives no details for CORS vs offline; probe with no-cors to tell them apart
      let reachable = false;
      try { await fetch(url, { method: 'GET', mode: 'no-cors', signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined }); reachable = true; } catch (e2) { reachable = false; }
      throw new AIError(reachable ? 'cors' : 'network', reachable ? 'The server answered but the browser blocked the response (CORS).' : `Can’t reach ${new URL(url).host}`);
    } finally { clearTimeout(t); signal?.removeEventListener('abort', onAbort); }
    if (!res.ok) {
      let body = ''; try { body = await res.text(); } catch (e) { /* ignore */ }
      let msg = body; try { const j = JSON.parse(body); msg = j.error?.message || j.message || j.error || body; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch (e) { /* text */ }
      msg = String(msg || res.statusText).slice(0, 400);
      const ra = Number(res.headers.get('retry-after')) || 0;
      const s = res.status;
      const kind = s === 401 || s === 403 ? (/quota|billing|credit/i.test(msg) ? 'quota' : 'auth')
        : s === 404 || /model/i.test(msg) && /(not.?found|does not exist|invalid|unknown|unsupported)/i.test(msg) ? 'model'
          : s === 429 ? (/quota|billing|credit|insufficient/i.test(msg) ? 'quota' : 'rate')
            : s === 529 || s === 503 || /overload/i.test(msg) ? 'overloaded' : s >= 500 ? 'server' : s === 400 || s === 422 ? (/model/i.test(msg) ? 'model' : 'bad_request') : 'unknown';
      throw new AIError(kind, `${s} · ${msg}`, { status: s, retryAfter: ra });
    }
    return res;
  },
  headers(conn) {
    if (conn.type === 'anthropic') return { 'content-type': 'application/json', 'x-api-key': conn.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    const h = { 'content-type': 'application/json' };
    if (conn.key) h.authorization = `Bearer ${conn.key}`;
    if (/openrouter\.ai/.test(conn.url || '')) { h['HTTP-Referer'] = location.origin === 'null' ? 'https://designstudio.local' : location.origin; h['X-Title'] = 'DesignStudio'; }
    return h;
  },
  base(conn) { return conn.type === 'compat' ? aiNormalizeUrl(conn.url) : AI_PROVIDERS[conn.type].base; },
  /** Model ids the key can use (sorted, chat models first). */
  async listModels(conn, timeoutMs = 15000) {
    if (conn.type === 'gemini') {
      const r = await this.request(conn, `${this.base(conn)}/models?key=${encodeURIComponent(conn.key)}&pageSize=200`, {}, timeoutMs);
      const j = await r.json();
      return (j.models || []).filter(x => (x.supportedGenerationMethods || []).includes('generateContent')).map(x => x.name.replace(/^models\//, ''));
    }
    const r = await this.request(conn, `${this.base(conn)}/models`, { headers: this.headers(conn) }, timeoutMs);
    const j = await r.json();
    const ids = (j.data || j.models || []).map(x => x.id || x.name).filter(Boolean);
    const bad = /(embed|whisper|tts|dall|image|moderation|audio|realtime|transcribe|search|rerank|vision-preview)/i;
    return ids.filter(i => !bad.test(i)).sort();
  },
  /** One chat completion → {text, usage:{in,out}, model}. messages: [{role:'user'|'assistant', content}] */
  async chat(conn, { system, messages, maxTokens = 4096, temperature = 0.4 }, timeoutMs, signal) {
    const model = conn.model;
    if (!model && conn.type !== 'compat') throw new AIError('model', 'No model selected');
    if (conn.type === 'anthropic') {
      const r = await this.request(conn, `${this.base(conn)}/messages`, { method: 'POST', headers: this.headers(conn), body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages }) }, timeoutMs, signal);
      const j = await r.json();
      return { text: (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'), usage: { in: j.usage?.input_tokens || 0, out: j.usage?.output_tokens || 0 }, model: j.model || model, stop: j.stop_reason };
    }
    if (conn.type === 'gemini') {
      const body = { systemInstruction: { parts: [{ text: system }] }, contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: { maxOutputTokens: maxTokens, temperature } };
      const r = await this.request(conn, `${this.base(conn)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(conn.key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, timeoutMs, signal);
      const j = await r.json();
      const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
      if (!text && j.promptFeedback?.blockReason) throw new AIError('bad_request', `Blocked: ${j.promptFeedback.blockReason}`);
      return { text, usage: { in: j.usageMetadata?.promptTokenCount || 0, out: j.usageMetadata?.candidatesTokenCount || 0 }, model };
    }
    const body = { messages: [{ role: 'system', content: system }, ...messages], temperature, max_tokens: maxTokens };
    if (model) body.model = model;
    const r = await this.request(conn, `${this.base(conn)}/chat/completions`, { method: 'POST', headers: this.headers(conn), body: JSON.stringify(body) }, timeoutMs, signal);
    const j = await r.json();
    const msg = j.choices?.[0]?.message;
    const text = typeof msg?.content === 'string' ? msg.content : Array.isArray(msg?.content) ? msg.content.map(c => c.text || '').join('') : '';
    return { text, usage: { in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0 }, model: j.model || model, stop: j.choices?.[0]?.finish_reason };
  },
  /** Picks the strongest sensible default from a model list. */
  pickModel(type, list) {
    if (!list.length) return '';
    const pref = {
      anthropic: [/sonnet/, /opus/, /haiku/],
      openai: [/^gpt-5(?!.*(nano|mini))/, /^gpt-5.*mini/, /^gpt-4\.1(?!.*nano)/, /^gpt-4o(?!.*(audio|realtime|search))/, /^o\d/],
      gemini: [/pro/, /flash(?!.*lite)/, /flash/],
      compat: [/(sonnet|gpt-4|gpt-5|llama-3\.[1-9].*70|qwen.*(32|72)|mixtral|deepseek|llama|qwen|mistral|gemma)/]
    }[type] || [];
    for (const re of pref) { const hit = list.filter(m => re.test(m)).sort().reverse()[0]; if (hit) return hit; }
    return list[0];
  }
};

// =========================================================================== MCP client (Streamable HTTP)
class MCPClient {
  constructor(conn) { this.conn = conn; this.session = null; this.id = 1; this.tools = []; this.info = null; }
  async rpc(method, params, { notify = false, timeoutMs = 20000, signal } = {}) {
    const url = aiNormalizeUrl(this.conn.url);
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    if (this.conn.key) headers.authorization = /^bearer /i.test(this.conn.key) ? this.conn.key : `Bearer ${this.conn.key}`;
    if (this.session) headers['mcp-session-id'] = this.session;
    if (this.protocol) headers['mcp-protocol-version'] = this.protocol;
    const msg = notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: this.id++, method, params };
    const res = await AIProviders.request(this.conn, url, { method: 'POST', headers, body: JSON.stringify(msg) }, timeoutMs, signal);
    const sid = res.headers.get('mcp-session-id'); if (sid) this.session = sid;
    if (notify || res.status === 202) return null;
    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('text/event-stream')) {
      const text = await res.text();
      const events = text.split(/\n\n/).map(b => b.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n')).filter(Boolean);
      for (const e of events) { try { const j = JSON.parse(e); if (j.id === msg.id) { data = j; break; } } catch (err) { /* skip */ } }
      if (!data) throw new AIError('parse', 'MCP stream ended without a reply');
    } else data = await res.json();
    if (data.error) throw new AIError(data.error.code === -32601 ? 'bad_request' : 'unknown', `MCP ${data.error.code}: ${data.error.message}`);
    return data.result;
  }
  async connect(signal) {
    const r = await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'DesignStudio', version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '3' } }, { signal });
    this.info = r?.serverInfo || null; this.protocol = r?.protocolVersion || null;
    await this.rpc('notifications/initialized', {}, { notify: true, signal }).catch(() => {});
    const t = await this.rpc('tools/list', {}, { signal });
    this.tools = (t?.tools || []).map(x => ({ name: x.name, description: (x.description || '').slice(0, 300), schema: x.inputSchema || {} }));
    return this.tools;
  }
  async call(name, args, signal) {
    if (!this.session && !this.tools.length) await this.connect(signal);
    try { return await this.rpc('tools/call', { name, arguments: args || {} }, { timeoutMs: 60000, signal }); }
    catch (e) {
      // self-heal: expired session → reconnect once
      if (e.status === 404 || e.status === 400) { this.session = null; await this.connect(signal); return this.rpc('tools/call', { name, arguments: args || {} }, { timeoutMs: 60000, signal }); }
      throw e;
    }
  }
}
function mcpResultText(r) {
  if (!r) return '';
  const parts = (r.content || []).map(c => c.type === 'text' ? c.text : c.type === 'resource' ? (c.resource?.text || c.resource?.uri || '') : `[${c.type}]`);
  return (r.isError ? 'ERROR: ' : '') + (parts.join('\n') || JSON.stringify(r.structuredContent || r)).slice(0, 8000);
}

// =========================================================================== JSON repair
/** Extracts the ```ds-ops``` (or any JSON array/object) block and repairs typical model mistakes. */
function aiExtractOps(text) {
  const blocks = [...String(text).matchAll(/```(?:ds-ops|json|ops)?\s*\n?([\s\S]*?)```/g)].map(m => m[1]);
  const candidates = blocks.length ? blocks : [];
  if (!candidates.length) { const i = text.indexOf('['), j = text.lastIndexOf(']'); if (i >= 0 && j > i && /"op"\s*:/.test(text)) candidates.push(text.slice(i, j + 1)); }
  for (const raw of candidates) {
    if (!/"op"\s*:/.test(raw)) continue;
    const fixed = aiRepairJSON(raw);
    if (fixed === undefined) return { error: 'The changes block is not valid JSON', raw };
    const ops = Array.isArray(fixed) ? fixed : Array.isArray(fixed.ops) ? fixed.ops : [fixed];
    return { ops, repaired: fixed.__repaired };
  }
  return null;
}
function aiRepairJSON(s) {
  try { return JSON.parse(s); } catch (e) { /* repair below */ }
  let t = s.trim()
    .replace(/^\uFEFF/, '').replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\/[^\n"]*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, v) => `: ${JSON.stringify(v)}`);
  // close unbalanced brackets (truncated answers)
  const stack = []; let inStr = false, esc = false;
  for (const ch of t) { if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; } if (ch === '"') inStr = true; else if (ch === '[' || ch === '{') stack.push(ch); else if (ch === ']' || ch === '}') stack.pop(); }
  if (inStr) t += '"';
  t = t.replace(/,\s*$/, '');
  while (stack.length) t += stack.pop() === '[' ? ']' : '}';
  try { const r = JSON.parse(t); if (r && typeof r === 'object') Object.defineProperty(r, '__repaired', { value: true }); return r; } catch (e) { return undefined; }
}
