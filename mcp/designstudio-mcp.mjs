#!/usr/bin/env node
/**
 * DesignStudio MCP bridge (v3.12.0) — lets AI apps (Claude Desktop, Claude Code, Cursor, VS Code, Windsurf…) read and
 * edit the DesignStudio file that is open in your browser, through the Model Context Protocol.
 *
 *   AI app ──MCP (stdio or http://127.0.0.1:3845/mcp)──▶ this bridge ◀──local polling── DesignStudio tab (AI › AI apps)
 *
 * No dependencies: needs only Node.js 18+. Everything stays on this computer (binds 127.0.0.1 only).
 *
 *   node designstudio-mcp.mjs                      stdio MCP server (what AI apps launch) + local bridge
 *   node designstudio-mcp.mjs --http               bridge + http://127.0.0.1:3845/mcp only (for URL-based clients)
 *   node designstudio-mcp.mjs --install claude-desktop | cursor | claude-code | vscode | print
 *   node designstudio-mcp.mjs --status             is DesignStudio connected?
 *
 * Several AI apps can be connected at once: the first bridge owns the port, later ones forward to it.
 * Env: DESIGNSTUDIO_MCP_PORT (default 3845).
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const VERSION = '3.12.0';
const PORT = Number(process.env.DESIGNSTUDIO_MCP_PORT) || 3845;
const HOST = '127.0.0.1';
const SCRIPT = fileURLToPath(import.meta.url);
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const log = (...a) => process.stderr.write(`[designstudio-mcp] ${a.join(' ')}\n`);

// ------------------------------------------------------------------------------------------------ tools
const OPS_DOC = `Operations (JSON array, applied in order as ONE undoable step; x/y are relative to the parent):
{"op":"create","ref":"a","type":"frame|rect|ellipse|text|line|instance|polygon|star","parent":"<ref|id|null>","name":"","x":0,"y":0,"width":100,"height":40,"fill":"#hex|rgba()|$variable/name|none","stroke":"#hex 1","radius":8,"opacity":1,"text":"…","fontSize":16,"fontWeight":400,"align":"left|center|right","lineHeight":24,"textStyle":"Body","layout":{"direction":"vertical|horizontal","gap":8,"padding":16|[t,r,b,l],"align":"top-left|center|…","hug":true,"stretch":false},"shadow":true|"<effect style>","component":"<component name, for type instance>"}
  Top-level frames without x/y are placed to the right of existing work. Children of auto-layout frames ignore x/y. Text without width hugs its content.
{"op":"update","id":"<id|ref>", …same properties}
{"op":"delete","id":"<id>"}
{"op":"variable","collection":"Tokens","name":"color/brand","type":"color|number|string|boolean","values":{"Light":"#…","Dark":"#…"}}
{"op":"bind","id":"<id|ref>","prop":"fills.0|strokes.0|cornerRadius|opacity|layoutGap|padding|fontSize|text|width|height","variable":"color/primary"}
{"op":"textStyle","name":"Body","fontSize":16,"fontWeight":400,"lineHeight":24}
{"op":"component","id":"<id|ref>"}
{"op":"interaction","id":"<id|ref>","trigger":"click|hover|press|delay|key|mouseEnter|mouseLeave|drag","action":"navigate|overlay|back|url|scrollTo|closeOverlay","target":"<frame id|ref|name>","transition":"instant|dissolve|smart|moveIn|push|slideIn","direction":"left|right|up|down","url":"https://…"}
Tips: call get_document / get_design_system first and reuse the file's variables ("$color/primary"), text styles and components. Use auto layout for stacks, 8-pt spacing, body text ≥ 14, touch targets ≥ 44. Mobile 390×844, desktop 1440×900. After applying, call get_screenshot to check the result.`;

const TOOLS = [
  { name: 'get_document', title: 'Get document overview', annotations: { readOnlyHint: true },
    description: 'Overview of the DesignStudio file open in the browser: title, pages, top-level frames (id, name, size, position), current selection, components, variable collections, text styles and the 3D scene summary. Start here.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_selection', title: 'Get selection', annotations: { readOnlyHint: true },
    description: 'The layers the user has selected in DesignStudio, with their properties and children (x/y relative to the parent). Use it when the user says "this", "the selected frame", etc.',
    inputSchema: { type: 'object', properties: { depth: { type: 'integer', minimum: 0, maximum: 6, default: 3, description: 'How many levels of children to include' } }, additionalProperties: false } },
  { name: 'get_node', title: 'Get layer', annotations: { readOnlyHint: true },
    description: 'One layer (frame, text, shape, instance…) by id or exact name, with properties and children.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Layer id (e.g. "el_…") or exact layer name' }, depth: { type: 'integer', minimum: 0, maximum: 6, default: 2 } }, required: ['id'], additionalProperties: false } },
  { name: 'find_nodes', title: 'Find layers', annotations: { readOnlyHint: true },
    description: 'Search layers on the current page by name or text content, optionally by type. Returns id, type, name, size and parent.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Case-insensitive text to match in names and text content (empty = all)' }, type: { type: 'string', enum: ['frame', 'text', 'rect', 'ellipse', 'instance', 'component', 'group', 'path', 'image', 'line', 'polygon', 'star'] }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }, additionalProperties: false } },
  { name: 'get_screenshot', title: 'Screenshot a layer', annotations: { readOnlyHint: true },
    description: 'PNG image of a frame or layer (or of the selection / whole page when no id is given) so you can see the design. Use after making changes to verify them.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Layer id or name; omitted = selection, or the first frame' }, scale: { type: 'number', minimum: 0.1, maximum: 3, default: 1 }, maxSize: { type: 'integer', minimum: 64, maximum: 2048, default: 1280, description: 'Longest side in pixels' } }, additionalProperties: false } },
  { name: 'get_code', title: 'Get code for a layer', annotations: { readOnlyHint: true },
    description: 'Generate code for a frame or layer: HTML+CSS, React, Vue, Svelte (plain CSS or Tailwind) or SVG.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Layer id or name; omitted = selection' }, format: { type: 'string', enum: ['html', 'react', 'vue', 'svelte', 'svg'], default: 'html' }, css: { type: 'string', enum: ['plain', 'tailwind'], default: 'plain' } }, additionalProperties: false } },
  { name: 'get_design_system', title: 'Get design system', annotations: { readOnlyHint: true },
    description: 'Variables (collections, modes, values), color / text / effect styles and components of the file, plus W3C design tokens JSON.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'apply_operations', title: 'Change the design', annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    description: `Create, edit or delete layers, variables, text styles, components and prototype links in the open DesignStudio file. All operations are validated first; if any is invalid nothing is applied and the errors are returned. The change is one undoable step for the user (Ctrl+Z). Returns ids for every "ref".\n\n${OPS_DOC}`,
    inputSchema: { type: 'object', properties: { operations: { type: 'array', items: { type: 'object' }, minItems: 1, maxItems: 400, description: 'Operations as documented above' }, select: { type: 'boolean', default: true, description: 'Select and zoom to new top-level frames' }, label: { type: 'string', description: 'Short description shown to the user in Undo and Activity' } }, required: ['operations'], additionalProperties: false } },
  { name: 'select_nodes', title: 'Select layers', annotations: { readOnlyHint: true },
    description: 'Select layers in DesignStudio and zoom the canvas to them, to point the user at something.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' }, minItems: 1 }, zoom: { type: 'boolean', default: true } }, required: ['ids'], additionalProperties: false } },
  { name: 'get_scene3d', title: 'Get 3D scene', annotations: { readOnlyHint: true },
    description: 'Objects of the 3D section (id, type, name, parent, position, rotation, scale, material color), scene settings and 3D triggers.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];

// ------------------------------------------------------------------------------------------------ app link (browser tab)
const app = { session: null, origin: null, lastSeen: 0, info: null, waiting: [], queue: [], pending: new Map(), clients: new Map(), lastClient: 'AI app' };
const appConnected = () => Date.now() - app.lastSeen < 35000;
function flushQueue() {
  while (app.waiting.length && app.queue.length) {
    const res = app.waiting.shift();
    const batch = app.queue.splice(0, app.queue.length);
    sendJSON(res, 200, { calls: batch, bridge: bridgeInfo() });
  }
}
function bridgeInfo() { return { version: VERSION, port: PORT, clients: [...app.clients.values()].map(c => c.name).filter((v, i, a) => a.indexOf(v) === i) }; }
function callApp(tool, args, client) {
  if (!appConnected()) return Promise.resolve({ isError: true, content: [{ type: 'text', text: 'DesignStudio is not connected. Open DesignStudio in your browser, open ✦ AI › AI apps and turn on “Let AI apps use this file”. Then try again.' }] });
  return new Promise((resolve) => {
    const id = randomUUID();
    const timer = setTimeout(() => { app.pending.delete(id); resolve({ isError: true, content: [{ type: 'text', text: 'DesignStudio did not answer in time (the tab may be in the background, or the user has not approved the change yet).' }] }); }, 120000);
    app.pending.set(id, { resolve, timer });
    app.queue.push({ id, tool, args: args || {}, client: client || 'AI app' });
    flushQueue();
  });
}

// ------------------------------------------------------------------------------------------------ MCP (JSON-RPC)
async function handleRpc(msg, ctx) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg && msg.id !== undefined ? fail(-32600, 'Invalid request') : null;
  const isNote = msg.id === undefined || msg.id === null;
  switch (msg.method) {
    case 'initialize': {
      const want = msg.params?.protocolVersion;
      const name = msg.params?.clientInfo?.name || 'AI app';
      app.clients.set(ctx.session, { name, at: Date.now() }); app.lastClient = name;
      return reply({
        protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'designstudio', title: 'DesignStudio', version: VERSION },
        instructions: 'Tools for the DesignStudio file open in the user\'s browser. Start with get_document (and get_design_system before designing), make changes with apply_operations, then verify with get_screenshot. If a tool says DesignStudio is not connected, ask the user to open ✦ AI › AI apps in DesignStudio and turn it on.'
      });
    }
    case 'notifications/initialized': case 'notifications/cancelled': return null;
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name, args = msg.params?.arguments || {};
      if (!TOOLS.some(t => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
      const res = await callApp(name, args, app.clients.get(ctx.session)?.name || app.lastClient);
      return reply({ content: res.content || [{ type: 'text', text: 'Done.' }], isError: !!res.isError });
    }
    case 'resources/list': return reply({ resources: [] });
    case 'prompts/list': return reply({ prompts: [] });
    default: return isNote ? null : fail(-32601, `Method not found: ${msg.method}`);
  }
}
async function handleBody(body, ctx) {
  if (Array.isArray(body)) { const out = (await Promise.all(body.map(m => handleRpc(m, ctx)))).filter(Boolean); return out.length ? out : null; }
  return handleRpc(body, ctx);
}

// ------------------------------------------------------------------------------------------------ HTTP server
const LOCAL_ORIGIN = /^(null|https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?)$/i;
// v3.32 hot path: one compiled host check, lazy URL parsing, CORS headers only for browsers, cached /health body
const HOST_RE = new RegExp(`^(127\\.0\\.0\\.1|localhost|\\[::1\\])(:${PORT})?$`);
let healthCache = { at: 0, body: '' };
function healthBody() { const now = Date.now(); if (now - healthCache.at > 100) healthCache = { at: now, body: JSON.stringify({ ok: true, name: 'designstudio-mcp', version: VERSION, appConnected: appConnected(), app: app.info, clients: bridgeInfo().clients }) }; return healthCache.body; }
function cors(req, res) {
  const o = req.headers.origin;
  if (o && LOCAL_ORIGIN.test(o)) res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version, authorization, x-ds-bridge');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Vary', 'Origin');
}
function sendRaw(res, code, body, headers) { if (res.writableEnded) return; res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body), ...headers }); res.end(body); }
function sendJSON(res, code, obj, headers = {}) { if (res.writableEnded) return; if (!headers['content-length']) return sendRaw(res, code, JSON.stringify(obj), headers); res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); }
function readBody(req, limit = 25e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (origin !== undefined) cors(req, res); // non-browser clients (AI apps) never need CORS headers
      const raw = req.url || '/', qi = raw.indexOf('?'), pathname = qi < 0 ? raw : raw.slice(0, qi);
      const url = pathname === '/bridge/poll' ? new URL(raw, `http://${HOST}:${PORT}`) : { pathname };
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      // websites must never drive the bridge: only the DesignStudio file:// / localhost tab, or clients without an Origin
      if (origin && !LOCAL_ORIGIN.test(origin)) { sendJSON(res, 403, { error: 'Origin not allowed' }); return; }
      // DNS-rebinding guard: only requests addressed to this machine by name / loopback IP
      const host = String(req.headers.host || '').toLowerCase();
      if (!HOST_RE.test(host)) { sendJSON(res, 403, { error: 'Host not allowed' }); return; }
      // AI apps (no browser) use /mcp — a web page can never drive the tools directly
      if (url.pathname === '/mcp' && origin) { sendJSON(res, 403, { error: 'Browsers cannot call /mcp' }); return; }
      // bridge: the first DesignStudio tab pairs and gets a secret; other pages are refused while it is connected
      if (url.pathname.startsWith('/bridge/')) {
        const sent = req.headers['x-ds-bridge'] || '';
        if (!sent || sent !== app.session) {
          if (app.session && appConnected() && url.pathname !== '/bridge/poll') { sendJSON(res, 403, { error: 'Not paired' }); return; }
          if (app.session && appConnected()) { sendJSON(res, 409, { error: 'Another DesignStudio tab is connected to this bridge' }); return; }
          if (url.pathname !== '/bridge/poll') { sendJSON(res, 403, { error: 'Not paired' }); return; }
          app.session = randomUUID(); app.origin = origin || '(none)';
          process.stderr.write(`[designstudio-mcp] DesignStudio tab paired (origin ${app.origin})\n`);
          res.setHeader('x-ds-bridge', app.session);
          res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, x-ds-bridge');
        }
      }
      try {
        if (url.pathname === '/health') return sendRaw(res, 200, healthBody());
        if (url.pathname === '/bridge/poll' && req.method === 'GET') {
          app.lastSeen = Date.now();
          app.info = { version: String(url.searchParams.get('v') || '').slice(0, 20), title: String(url.searchParams.get('title') || '').slice(0, 200), access: url.searchParams.get('access') === 'read' ? 'read' : 'edit' };
          if (app.queue.length) return sendJSON(res, 200, { calls: app.queue.splice(0), bridge: bridgeInfo() });
          app.waiting.push(res);
          const t = setTimeout(() => { const i = app.waiting.indexOf(res); if (i >= 0) { app.waiting.splice(i, 1); sendJSON(res, 200, { calls: [], bridge: bridgeInfo() }); } }, 20000);
          req.on('close', () => { clearTimeout(t); const i = app.waiting.indexOf(res); if (i >= 0) app.waiting.splice(i, 1); });
          return;
        }
        if (url.pathname === '/bridge/result' && req.method === 'POST') {
          app.lastSeen = Date.now();
          const b = await readBody(req);
          const p = b && app.pending.get(b.id);
          if (p) { clearTimeout(p.timer); app.pending.delete(b.id); p.resolve({ content: b.content, isError: !!b.isError }); }
          return sendJSON(res, 200, { ok: !!p });
        }
        if (url.pathname === '/mcp') {
          if (req.method === 'GET') { res.writeHead(405, { allow: 'POST, DELETE' }); res.end(); return; }
          if (req.method === 'DELETE') { app.clients.delete(req.headers['mcp-session-id']); res.writeHead(200); res.end(); return; }
          if (req.method === 'POST') {
            const body = await readBody(req);
            const session = req.headers['mcp-session-id'] || randomUUID();
            const out = await handleBody(body, { session });
            if (!out) { res.writeHead(202, { 'mcp-session-id': session }); res.end(); return; }
            return sendJSON(res, 200, out, { 'mcp-session-id': session });
          }
        }
        sendJSON(res, 404, { error: 'Not found' });
      } catch (e) { sendJSON(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: `Bad request: ${e.message}` } }); }
    });
    server.keepAliveTimeout = 30000; server.headersTimeout = 35000;
    server.on('error', reject);
    server.listen(PORT, HOST, () => resolve(server));
  });
}
async function existingBridge() {
  try { const r = await fetch(`http://${HOST}:${PORT}/health`, { signal: AbortSignal.timeout(1500) }); const j = await r.json(); return j?.name === 'designstudio-mcp' ? j : null; } catch { return null; }
}

// ------------------------------------------------------------------------------------------------ stdio transport
function startStdio(forward) {
  let buf = '';
  const session = `stdio-${randomUUID()}`;
  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
      (forward ? forward(msg, session) : handleBody(msg, { session })).then(out => { if (out) write(out); }).catch(e => log('error', e.message));
    }
  });
  process.stdin.on('end', () => process.exit(0));
}
/** Secondary bridge: another AI app already owns the port, so pass messages through to it. */
function forwarder() {
  let sid = null, local = false, lastInit = null;
  return async (msg, session) => {
    if (msg && msg.method === 'initialize') lastInit = msg;
    if (local) return handleBody(msg, { session });
    try {
      const r = await fetch(`http://${HOST}:${PORT}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', ...(sid ? { 'mcp-session-id': sid } : {}) }, body: JSON.stringify(msg) });
      sid = r.headers.get('mcp-session-id') || sid;
      if (r.status === 202) return null;
      return r.json();
    } catch {
      // the AI app that owned the port quit: take over so this app keeps working
      try { await startServer(); local = true; log(`took over the bridge on port ${PORT}`); if (lastInit) await handleRpc(lastInit, { session }); } catch { /* someone else took it */ }
      return local ? handleBody(msg, { session }) : { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32000, message: 'DesignStudio bridge restarting — try again.' } };
    }
  };
}

// ------------------------------------------------------------------------------------------------ installers
function claudeDesktopConfigPath() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}
function mergeServer(file, key, entry) {
  let cfg = {};
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    try { cfg = raw.trim() ? JSON.parse(raw) : {}; } catch { throw new Error(`${file} is not valid JSON — fix it or remove it, then run this again.`); }
    fs.copyFileSync(file, `${file}.bak`);
  } else fs.mkdirSync(path.dirname(file), { recursive: true });
  cfg[key] = cfg[key] && typeof cfg[key] === 'object' ? cfg[key] : {};
  cfg[key].designstudio = entry;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return file;
}
function install(target) {
  const entry = { command: process.execPath, args: [SCRIPT] };
  const q = (s) => (/\s/.test(s) ? `"${s}"` : s);
  switch (target) {
    case 'claude-desktop': {
      const f = mergeServer(claudeDesktopConfigPath(), 'mcpServers', entry);
      console.log(`✓ Added DesignStudio to Claude Desktop (${f}).\n  Quit Claude Desktop completely and open it again. Then in DesignStudio: ✦ AI › AI apps › turn on.`);
      break;
    }
    case 'cursor': {
      const f = mergeServer(path.join(os.homedir(), '.cursor', 'mcp.json'), 'mcpServers', entry);
      console.log(`✓ Added DesignStudio to Cursor (${f}).\n  Restart Cursor, then enable “designstudio” in Settings › MCP.`);
      break;
    }
    case 'claude-code':
      console.log(`Run this in a terminal:\n\n  claude mcp add designstudio --scope user -- ${q(process.execPath)} ${q(SCRIPT)}\n`);
      break;
    case 'vscode':
      console.log(`Add to .vscode/mcp.json (or your user mcp.json):\n\n${JSON.stringify({ servers: { designstudio: { type: 'stdio', ...entry } } }, null, 2)}\n`);
      break;
    default:
      console.log(`stdio (most apps):\n${JSON.stringify({ mcpServers: { designstudio: entry } }, null, 2)}\n\nURL (apps that take a server URL, while a bridge is running):\n  http://${HOST}:${PORT}/mcp`);
  }
}

// ------------------------------------------------------------------------------------------------ main
const argv = process.argv.slice(2);
if (argv[0] === '--install') { try { install(argv[1] || 'print'); } catch (e) { console.error(`✗ ${e.message}`); process.exitCode = 1; } }
else if (argv[0] === '--status') {
  const h = await existingBridge();
  console.log(!h ? 'No bridge is running (an AI app starts it, or run with --http).' : h.appConnected ? `Connected: DesignStudio ${h.app?.version || ''} — “${h.app?.title || 'Untitled'}” · AI apps: ${h.clients.join(', ') || 'none yet'}` : `Bridge ${h.version} is running on port ${PORT}, waiting for DesignStudio (✦ AI › AI apps).`);
} else if (argv[0] === '--version') console.log(VERSION);
else {
  const httpOnly = argv.includes('--http');
  let forward = null;
  try { await startServer(); log(`bridge ${VERSION} listening on http://${HOST}:${PORT} (MCP: /mcp)`); }
  catch (e) {
    if (e.code !== 'EADDRINUSE') { log(`could not start: ${e.message}`); process.exit(1); }
    const other = await existingBridge();
    if (!other) { log(`port ${PORT} is used by another program — set DESIGNSTUDIO_MCP_PORT to a free port (and the same port in DesignStudio › AI apps).`); process.exit(1); }
    if (httpOnly) { log(`a bridge is already running on port ${PORT}.`); process.exit(0); }
    forward = forwarder(); log(`sharing the bridge already running on port ${PORT}`);
  }
  if (!httpOnly) startStdio(forward);
}
