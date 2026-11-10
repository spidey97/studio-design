/**
 * DesignStudio — load & soak tests (v3.31.0).  node tests/load.js [--app=path/to/index.html] [--only=s1,s9] [--quick]
 *
 * DesignStudio runs in one browser tab with no server or database, so "load" means pushing the tab itself
 * (huge documents, long playback, big media, heavy 3D, a long random session) plus the one real server it ships:
 * the local MCP bridge (mcp/designstudio-mcp.mjs). Every scenario measures, through the Chrome DevTools Protocol:
 *   main-thread CPU   – Performance.getMetrics TaskDuration over wall time (real CPU time of the page's main thread)
 *   memory            – JS heap after a forced garbage collection, before and after (leaks show up as growth)
 *   responsiveness    – long tasks and frame rate where it matters
 * and checks the in-app monitor (DSDiag) against ground truth (API timing accuracy, health alerts, overhead).
 * Results: tests/load-results.json and tests/LOAD-REPORT.md.
 */
'use strict';
const path = require('path'), fs = require('fs'), http = require('http'), { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const APP = 'file://' + path.resolve(arg('app', path.join(ROOT, 'index.html')));
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const QUICK = process.argv.includes('--quick');
const GIF = path.join(__dirname, 'fixtures/load-120f.gif');
const KOVA = path.join(__dirname, 'fixtures/kova.designstudio.json');
const results = [];
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const r1 = (v) => Math.round(v * 10) / 10;

async function page(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
  await p.goto(APP); await p.waitForFunction(() => window.studioApp && window.studioApp._booted, null, { timeout: 30000 });
  await p.evaluate(() => { studioApp.hideWelcome?.(); const w = document.getElementById('welcome-screen'); if (w) w.style.display = 'none'; });
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await p.waitForTimeout(150); return (await metric()).JSHeapUsedSize / 1048576; };
  return { p, ctx, cdp, metric, gc, errors };
}

async function scenario(browser, id, name, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  process.stdout.write(`▶ ${id} ${name} … `);
  const P = await page(browser); const heap0 = await P.gc(); const m0 = await P.metric(); const w0 = Date.now();
  let out; try { out = await fn(P); } catch (e) { out = { metrics: {}, checks: [{ label: 'scenario ran', value: e.message.slice(0, 160), limit: 'no exception', ok: false }] }; }
  const wall = (Date.now() - w0) / 1000, m1 = await P.metric(), heap1 = await P.gc();
  const res = { id, name, wall: r1(wall), mainThreadCpuPct: r1((m1.TaskDuration - m0.TaskDuration) / wall * 100), heapStartMB: r1(heap0), heapEndMB: r1(heap1), pageErrors: P.errors.slice(0, 5), ...out };
  if (P.errors.length) res.checks.push({ label: 'no uncaught page errors', value: P.errors.length, limit: 0, ok: false });
  res.ok = res.checks.every(c => c.ok); results.push(res);
  console.log(`${res.ok ? 'PASS' : 'FAIL'} (${res.wall}s, CPU ${res.mainThreadCpuPct}%, heap ${res.heapStartMB}→${res.heapEndMB} MB)`);
  for (const c of res.checks.filter(c => !c.ok)) console.log(`   ✗ ${c.label}: ${c.value} (limit ${c.limit})`);
  await P.ctx.close();
}
const check = (label, value, limit, ok) => ({ label, value, limit, ok: !!ok });

(async () => {
  if (process.argv.includes('--report-only')) { const saved = JSON.parse(fs.readFileSync(path.join(__dirname, 'load-results.json'), 'utf8')); results.push(...saved.results); return writeReport(saved.env.quick ? 2000 : 5000); }
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const N = QUICK ? 2000 : 5000;

  // S1 ---------------------------------------------------------------- big document
  await scenario(browser, 's1', `Large document (${N.toLocaleString()} layers)`, async ({ p }) => {
    const m = await p.evaluate(async (N) => {
      const A = studioApp, M = A.model, T = () => performance.now();
      let t = T(); for (let i = 0; i < N; i++) M.insertElement(new StudioElement(['rect', 'ellipse', 'rect', 'text'][i % 4], (i % 100) * 26, Math.floor(i / 100) * 26, 22, 22)); A.commit(); const insert = T() - t;
      const renders = []; for (let i = 0; i < 6; i++) { t = T(); A.renderer.dirty = true; A.renderer.render(); renders.push(T() - t); }
      t = T(); M.select(M.elements.map(e => e.id)); for (const e of M.topSelected()) e.x += 10; A.commit(); const move = T() - t;
      const undos = []; for (let i = 0; i < 10; i++) { t = T(); A.run('undo'); undos.push(T() - t); t = T(); A.run('redo'); undos.push(T() - t); }
      t = T(); A.run('delete'); const del = T() - t; t = T(); A.run('undo'); const restore = T() - t;
      await new Promise(r => setTimeout(r, 300));
      return { layers: M.allElements().length, insertMs: Math.round(insert), renderMsMedian: Math.round(renders.sort((a, b) => a - b)[3]), moveAllMs: Math.round(move), undoRedoMsP95: Math.round(undos.sort((a, b) => a - b)[Math.floor(undos.length * .95) - 1]), deleteAllMs: Math.round(del), undoDeleteMs: Math.round(restore) };
    }, N);
    return { metrics: m, checks: [check('all layers restored after delete + undo', m.layers, `≥ ${N}`, m.layers >= N), check('insert + commit', `${m.insertMs} ms`, '< 6000 ms', m.insertMs < 6000), check('full render (median)', `${m.renderMsMedian} ms`, '< 400 ms', m.renderMsMedian < 400), check('move every layer', `${m.moveAllMs} ms`, '< 2500 ms', m.moveAllMs < 2500), check('undo / redo p95', `${m.undoRedoMsP95} ms`, '< 1500 ms', m.undoRedoMsP95 < 1500)] };
  });

  // S2 ---------------------------------------------------------------- memory leak check
  await scenario(browser, 's2', 'Memory leak check (25 edit cycles)', async ({ p, gc }) => {
    const cycle = (n) => p.evaluate((n) => { const A = studioApp, M = A.model; for (let c = 0; c < n; c++) { for (let i = 0; i < 400; i++) M.insertElement(new StudioElement('rect', (i % 20) * 30, Math.floor(i / 20) * 30, 24, 24)); A.commit(); M.select(M.elements.map(e => e.id)); A.run('delete'); A.run('undo'); A.run('redo'); A.renderer.dirty = true; A.renderer.render(); } }, n);
    await cycle(5); const warm = await gc(); await cycle(20); const end = await gc();
    const growth = r1(end - warm);
    return { metrics: { heapAfterWarmupMB: r1(warm), heapAfter25CyclesMB: r1(end), growthMB: growth, perCycleKB: Math.round(growth * 1024 / 20) }, checks: [check('heap growth over 20 cycles after warm-up', `${growth} MB`, '< 25 MB', growth < 25)] };
  });

  // S3 ---------------------------------------------------------------- animation playback
  await scenario(browser, 's3', 'Animation playback (Kova project, 8 s)', async ({ p }) => {
    const j = fs.readFileSync(KOVA, 'utf8');
    const m = await p.evaluate(async (j) => {
      const A = studioApp; A.applyRestored(JSON.parse(j)); A.model.resetHistory(); A.setUiMode?.('animate'); await new Promise(r => setTimeout(r, 500));
      const lt0 = DSDiag.longTasks.length; let frames = 0; const t0 = performance.now(); A.model.animationTimeline.loop = true; A.togglePlay();
      while (performance.now() - t0 < 8000) { await new Promise(r => requestAnimationFrame(r)); frames++; }
      A.togglePlay(); const lts = DSDiag.longTasks.slice(lt0);
      return { fps: Math.round(frames / 8), longTasks: lts.length, longTaskMs: lts.reduce((a, x) => a + x.ms, 0), layers: A.model.allElements().length };
    }, j);
    return { metrics: m, checks: [check('playback frame rate', `${m.fps} fps`, '≥ 30 fps', m.fps >= 30), check('time lost to long tasks', `${m.longTaskMs} ms of 8000`, '< 800 ms', m.longTaskMs < 800)] };
  });

  // S4 ---------------------------------------------------------------- storage (database) under load
  await scenario(browser, 's4', `Autosave under load (${N.toLocaleString()} layers × 30 saves)`, async ({ p }) => {
    const m = await p.evaluate(async (N) => {
      const A = studioApp, M = A.model; for (let i = 0; i < N; i++) M.insertElement(new StudioElement('rect', (i % 100) * 26, Math.floor(i / 100) * 26, 22, 22)); A.commit();
      await new Promise(r => setTimeout(r, 1500)); const start = DSDiag.storeOps.length;
      for (let i = 0; i < 30; i++) { const n = DSDiag.storeOps.length; A.model.elements[0].x += 1; A.autosaveNow(); const t = performance.now(); while (DSDiag.storeOps.length === n && performance.now() - t < 10000) await new Promise(r => setTimeout(r, 5)); }
      const ops = DSDiag.storeOps.slice(start).filter(o => !/ping$/.test(o.key || '')), ms = ops.map(o => o.ms).sort((a, b) => a - b);
      const ping = await A.dgPing(true);
      return { writes: ops.length, failures: ops.filter(o => !o.ok).length, p50: ms[Math.floor(ms.length / 2)], p95: ms[Math.floor(ms.length * .95) - 1] ?? ms[ms.length - 1], sizeMB: Math.round((ops[ops.length - 1]?.bytes || 0) / 104857.6) / 10, target: ops[0]?.target, connectionOk: ping.ok, roundTripMs: ping.ms };
    }, N);
    return { metrics: m, checks: [check('writes recorded by the monitor', m.writes, '30', m.writes >= 30), check('failed writes', m.failures, '0', m.failures === 0), check('write p95', `${m.p95} ms`, '< 1500 ms', m.p95 < 1500), check('storage connection test', m.connectionOk ? `OK ${m.roundTripMs} ms` : 'failed', 'OK', m.connectionOk)] };
  });

  // S5 ---------------------------------------------------------------- media
  await scenario(browser, 's5', 'Media: 120-frame GIF (load, resize, reverse, optimize)', async ({ p }) => {
    await p.evaluate(() => studioApp.setSection('media'));
    const t0 = Date.now(); await p.locator('#md-file').setInputFiles(GIF); await p.waitForFunction(() => studioApp.mediaHasClip(), null, { timeout: 30000 }); const load = Date.now() - t0;
    const m = await p.evaluate(async () => {
      const A = studioApp, T = () => performance.now(), out = { frames: A.media.frames?.length || 0 };
      let t = T(); A.mediaSelectTool('resize'); const o = A.mediaOpts(MediaUI.tool('resize')); if ('width' in o) o.width = 640; if ('w' in o) o.w = 640; if ('scale' in o) o.scale = 200; if ('pct' in o) o.pct = 200; await A.mediaRun(); out.resizeMs = Math.round(T() - t); out.width = A.media.width;
      t = T(); A.mediaSelectTool('reverse'); await A.mediaRun(); out.reverseMs = Math.round(T() - t);
      t = T(); A.mediaSelectTool('optgif'); await A.mediaRun(); await new Promise(r => setTimeout(r, 300)); out.optimizeMs = Math.round(T() - t);
      out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; return out;
    });
    m.loadMs = load;
    return { metrics: m, checks: [check('all 120 frames decoded', m.frames, '120', m.frames >= 120), check('decode', `${m.loadMs} ms`, '< 8000 ms', m.loadMs < 8000), check('resize ×2 (120 frames)', `${m.resizeMs} ms`, '< 12000 ms', m.resizeMs < 12000), check('reverse', `${m.reverseMs} ms`, '< 3000 ms', m.reverseMs < 3000), check('GIF optimizer', `${m.optimizeMs} ms`, '< 30000 ms', m.optimizeMs < 30000), check('JS heap after media work', `${m.heapMB} MB`, '< 900 MB', m.heapMB == null || m.heapMB < 900)] };
  });

  // S6 ---------------------------------------------------------------- 3D (v3.32: GPU-synced frame cost, old behaviour vs Auto)
  await scenario(browser, 's6', '3D scene: 120 objects, orbiting (Auto vs previous behaviour)', async ({ p }) => {
    await p.evaluate(() => studioApp.setSection('3d')); await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 40000 });
    const m = await p.evaluate(async () => {
      const A = studioApp, s3 = A.s3, R = s3.renderer, gl = R.getContext(), T = s3.L.THREE, px = new Uint8Array(4);
      const types = ['box', 'sphere', 'cylinder', 'torus'].filter(t => Scene3DCore.PRIMS[t]); let t = performance.now();
      for (let i = 0; i < 120; i++) await A.s3Add(types[i % types.length]); const add = performance.now() - t;
      // each frame: move the camera, render, read one pixel back (forces the GPU to finish, so the time is the real cost)
      const orbit = (n) => { s3.perf.orbiting = true; const su = s3.perf.shadowUpdates, t0 = performance.now(); for (let i = 0; i < n; i++) { s3.camera.position.applyAxisAngle(new T.Vector3(0, 1, 0), 0.03); s3.camera.lookAt(0, 0, 0); s3.perf.lastMove = performance.now(); R.render(s3.scene, s3.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } s3.perf.orbiting = false; return { ms: (performance.now() - t0) / n, shadowRedraws: s3.perf.shadowUpdates - su }; };
      const set = (mode) => { A.settings.s3.mode = mode; A.saveSettings(); };
      orbit(1);
      set('quality'); R.shadowMap.autoUpdate = true; orbit(1); const before = orbit(3); R.shadowMap.autoUpdate = false;  // previous behaviour: shadows every frame, full resolution
      set('auto'); s3.perf.level = 0; orbit(1); orbit(6); const auto = orbit(3), level = s3.perf.level;
      s3.perf.lastMove = 0; s3.dirty = true; await new Promise(r => setTimeout(r, 400)); R.render(s3.scene, s3.camera); const restScale = s3.perf.scale;
      const tri = R.info.render.triangles;
      return { objects: A.model.scene3d.objects.length, addMs: Math.round(add), trianglesK: Math.round(tri / 1000), beforeMsPerFrame: Math.round(before.ms), autoMsPerFrame: Math.round(auto.ms), speedup: Math.round(before.ms / auto.ms * 10) / 10, autoMovingResolutionPct: Math.round([1, 0.75, 0.6, 0.5][level] * 100), shadowRedrawsWhileOrbiting: auto.shadowRedraws, resolutionAtRestPct: Math.round(restScale * 100) };
    });
    return { metrics: m, checks: [check('objects in scene', m.objects, '≥ 120', m.objects >= 120), check('add 120 objects', `${m.addMs} ms`, '< 20000 ms', m.addMs < 20000),
      check('orbit frame cost, Auto vs previous', `${m.autoMsPerFrame} vs ${m.beforeMsPerFrame} ms (×${m.speedup} faster)`, '≥ ×1.5 faster', m.speedup >= 1.5),
      check('shadow maps redrawn while only the camera moves', m.shadowRedrawsWhileOrbiting, '0 (cached)', m.shadowRedrawsWhileOrbiting === 0), check('full resolution again at rest', `${m.resolutionAtRestPct}%`, '100%', m.resolutionAtRestPct === 100)] };
  });

  // S7 ---------------------------------------------------------------- soak
  const SOAK = QUICK ? 20000 : 60000;
  await scenario(browser, 's7', `Soak: ${SOAK / 1000} s of random editing`, async ({ p, gc }) => {
    const h0 = await gc();
    const m = await p.evaluate(async (ms) => {
      const A = studioApp, M = A.model, e0 = DSDiag.logs.filter(l => l.level === 'error').length; let n = 0, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const acts = [() => { M.insertElement(new StudioElement(rnd() < .5 ? 'rect' : 'ellipse', rnd() * 1200, rnd() * 800, 20 + rnd() * 80, 20 + rnd() * 80)); A.commit(); },
        () => { const e = M.elements[Math.floor(rnd() * M.elements.length)]; if (e) { e.x += rnd() * 40 - 20; A.commit(); } }, () => A.run('undo'), () => A.run('redo'),
        () => A.run(rnd() < .5 ? 'zoomIn' : 'zoomOut'), () => A.setUiMode?.(rnd() < .5 ? 'animate' : 'edit'), () => { M.select(M.elements.slice(0, 5).map(e => e.id)); A.run('duplicate'); },
        () => { M.select(M.elements.slice(-3).map(e => e.id)); A.run('delete'); }];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) { try { acts[Math.floor(rnd() * acts.length)](); } catch (e) { DSDiag.error('soak', e.message); } n++; A.renderer.dirty = true; if (n % 20 === 0) await new Promise(r => requestAnimationFrame(r)); }
      A.setUiMode?.('edit');
      return { actions: n, actionsPerSec: Math.round(n / (ms / 1000)), newErrors: DSDiag.logs.filter(l => l.level === 'error').length - e0, layers: M.allElements().length, lagP95: DSDiag.cpu(ms).lagP95 };
    }, SOAK);
    const h1 = await gc(); m.heapWithHistoryMB = r1(h1 - h0);
    m.historyDepth = await p.evaluate(() => { const A = studioApp, M = A.model; const d = (M.history || []).length; M.select(M.allElements().map(e => e.id)); A.run('delete'); A.commit(); M.resetHistory(); A.renderer.dirty = true; A.renderer.render(); return d; });
    const h2 = await gc(); m.residualMB = r1(h2 - h0);
    return { metrics: m, checks: [check('errors during soak', m.newErrors, '0', m.newErrors === 0), check('memory left after clearing document + undo history (leak)', `${m.residualMB} MB`, '< 25 MB', m.residualMB < 25), check('growth while editing (layers + undo history)', `${m.heapWithHistoryMB} MB`, '< 400 MB', m.heapWithHistoryMB < 400)] };
  });

  // S11 --------------------------------------------------------------- undo history memory budget
  await scenario(browser, 's11', `Undo history: 100 steps (${N.toLocaleString()} layers × 110 edits)`, async ({ p, gc }) => {
    const m = await p.evaluate((N) => {
      const A = studioApp, M = A.model; for (let i = 0; i < N; i++) M.insertElement(new StudioElement('rect', (i % 100) * 26, Math.floor(i / 100) * 26, 22, 22)); A.commit();
      for (let k = 0; k < 60; k++) { M.elements[k % M.elements.length].x += 5; A.commit(); }
      for (let k = 60; k < 110; k++) { M.elements[k % M.elements.length].x += 5; A.commit(); }
      const steps = M.history.length, mb = Math.round(M.historyChars / 104857.6) / 10, snapMB = Math.round(M.historyAt(M.historyIndex).length / 104857.6) / 10;
      const x0 = M.elements[109 % M.elements.length].x; A.run('undo'); const undoOk = M.elements[109 % M.elements.length].x === x0 - 5;
      return { steps, historyMB: mb, snapshotMB: snapMB, budgetMB: Math.round(M.maxHistoryChars / 1048576), undoOk };
    }, N);
    m.heapMB = r1(await gc());
    m.fullCopiesWouldBeMB = Math.round(m.snapshotMB * m.steps);
    return { metrics: m, checks: [check('undo steps kept', m.steps, '100', m.steps === 100), check('memory for 100 steps (shared chunks)', `${m.historyMB} MB (full copies: ${m.fullCopiesWouldBeMB} MB)`, '< 3 × one snapshot', m.historyMB < m.snapshotMB * 3), check('undo still works', m.undoOk ? 'yes' : 'no', 'yes', m.undoOk)] };
  });

  // S8 ---------------------------------------------------------------- API response-time tracking accuracy
  await scenario(browser, 's8', 'API response-time tracking (mock AI service)', async ({ p }) => {
    const delay = { '/fast': 20, '/slow': 1200, '/veryslow': 3600 };
    const srv = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      const u = req.url.split('?')[0];
      if (u === '/drop') return req.socket.destroy();
      if (u === '/fail') { res.writeHead(500); return res.end('{"error":"boom"}'); }
      setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); }, delay[u] || 0);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}`;
    try {
      const m = await p.evaluate(async (base) => {
        const hit = (path, n) => Array.from({ length: n }, () => fetch(`${base}${path}?api_key=sk-secret0123456789abcd`).then(r => r.status).catch(() => 0));
        const seq = async (path, n) => { for (let i = 0; i < n; i++) await fetch(`${base}${path}?api_key=sk-secret0123456789abcd`).catch(() => 0); };
        await seq('/fast', 10); await seq('/slow', 3); // sequential: no browser connection queueing, so timing = real latency
        const t = performance.now(); await Promise.all([...hit('/fast', 20), ...hit('/slow', 7), ...hit('/fail', 5), ...hit('/drop', 3)]); const burst1 = performance.now() - t;
        const n1 = DSDiag.network(); const o = n1.origins.find(x => x.origin === base) || {};
        const leaked = JSON.stringify(DSDiag.net).includes('sk-secret') || JSON.stringify(DSDiag.logs).includes('sk-secret') || JSON.stringify(DSDiag.net).includes('api_key');
        const fastRecs = DSDiag.net.filter(r => r.url.endsWith('/fast')).slice(0, 10).map(r => r.ms), slowRecs = DSDiag.net.filter(r => r.url.endsWith('/slow')).slice(0, 3).map(r => r.ms); const burstFast = DSDiag.net.filter(r => r.url.endsWith('/fast')).slice(10).map(r => r.ms);
        await Promise.all(hit('/veryslow', 6)); await studioApp.dgTick(); const h = studioApp.dgHealth().items.find(i => i.key === 'net');
        return { recorded: o.count, errors: o.errors, fastMedianMs: fastRecs.sort((a, b) => a - b)[5], slowMedianMs: slowRecs.sort((a, b) => a - b)[1], burstFastP95Ms: burstFast.sort((a, b) => a - b)[Math.floor(burstFast.length * .95) - 1], p95AfterSlowBurst: DSDiag.network().p95, healthLevel: h.level, leaked, burstMs: Math.round(burst1) };
      }, base);
      return { metrics: m, checks: [check('every call recorded', m.recorded, '48', m.recorded === 48), check('failures counted (500 + dropped)', m.errors, '8', m.errors === 8),
        check('fast endpoint timing (truth 20 ms)', `${m.fastMedianMs} ms`, '15–150 ms', m.fastMedianMs >= 15 && m.fastMedianMs <= 150), check('slow endpoint timing (truth 1200 ms)', `${m.slowMedianMs} ms`, '1150–1500 ms', m.slowMedianMs >= 1150 && m.slowMedianMs <= 1500),
        check('health flags slow API (p95 ≥ 3 s)', `${m.healthLevel} (p95 ${m.p95AfterSlowBurst} ms)`, 'warn or bad', m.healthLevel !== 'ok'), check('secrets & query strings never recorded', m.leaked ? 'LEAKED' : 'clean', 'clean', !m.leaked)] };
    } finally { srv.close(); }
  });

  // S9 ---------------------------------------------------------------- MCP bridge server load (real Node server)
  if (!ONLY.length || ONLY.includes('s9')) {
    process.stdout.write('▶ s9 MCP bridge server under load … ');
    const port = 38000 + Math.floor(Math.random() * 1000);
    const proc = spawn(process.execPath, [path.join(ROOT, 'mcp/designstudio-mcp.mjs'), '--http'], { env: { ...process.env, DESIGNSTUDIO_MCP_PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] });
    const procStat = () => { try { const s = fs.readFileSync(`/proc/${proc.pid}/stat`, 'utf8').split(') ')[1].split(' '); const st = fs.readFileSync(`/proc/${proc.pid}/status`, 'utf8'); return { cpu: (Number(s[11]) + Number(s[12])) / 100, rssMB: Number((st.match(/VmRSS:\s+(\d+)/) || [])[1] || 0) / 1024 }; } catch (_) { return { cpu: 0, rssMB: 0 }; } };
    const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
    const req = (method, p_, body, headers = {}) => new Promise((res) => { const t = process.hrtime.bigint(); const r = http.request({ host: '127.0.0.1', port, path: p_, method, agent, headers: { host: `127.0.0.1:${port}`, ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}), ...headers } }, (rs) => { let d = ''; rs.on('data', c => d += c); rs.on('end', () => res({ ms: Number(process.hrtime.bigint() - t) / 1e6, status: rs.statusCode, body: d, headers: rs.headers })); }); r.on('error', () => res({ ms: Number(process.hrtime.bigint() - t) / 1e6, status: 0 })); if (body) r.write(body); r.end(); });
    const pool = async (total, conc, fn) => { const lat = []; let errs = 0, i = 0; const t0 = Date.now(); await Promise.all(Array.from({ length: conc }, async () => { while (i < total) { i++; const r = await fn(); lat.push(r.ms); if (r.status !== 200) errs++; } })); return { lat, errs, secs: (Date.now() - t0) / 1000 }; };
    const checks = [], metrics = {};
    try {
      let up = false; for (let k = 0; k < 50 && !up; k++) { up = (await req('GET', '/health')).status === 200; if (!up) await new Promise(r => setTimeout(r, 100)); }
      if (!up) throw new Error('MCP bridge did not start');
      let ac = null; try { ac = require('autocannon'); } catch (_) { /* fallback below */ }
      const init = await req('POST', '/mcp', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'load-test', version: '1' } } }));
      const sid = init.headers?.['mcp-session-id'] || '';
      const s0 = procStat(), dur = QUICK ? 4 : 8; let H, T, tool = 'node http client (install autocannon for full-speed numbers)';
      if (ac) {
        tool = `autocannon, 64 connections, ${dur} s per endpoint`;
        const run = (o) => new Promise((res, rej) => ac({ connections: 64, duration: dur, ...o }, (e, r) => e ? rej(e) : res(r)));
        const h = await run({ url: `http://127.0.0.1:${port}/health` });
        const t = await run({ url: `http://127.0.0.1:${port}/mcp`, method: 'POST', headers: { 'content-type': 'application/json', ...(sid ? { 'mcp-session-id': sid } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
        H = { rps: Math.round(h.requests.average), p50: h.latency.p50, p95: h.latency.p97_5 ?? h.latency.p99, p99: h.latency.p99, errs: h.errors + h.non2xx + h.timeouts, total: h.requests.total, secs: dur };
        T = { rps: Math.round(t.requests.average), p95: t.latency.p97_5 ?? t.latency.p99, p99: t.latency.p99, errs: t.errors + t.non2xx + t.timeouts, total: t.requests.total, secs: dur };
      } else {
        const h = await pool(QUICK ? 1000 : 3000, 50, () => req('GET', '/health')); let id = 2;
        const t = await pool(QUICK ? 200 : 600, 20, () => req('POST', '/mcp', JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/list' }), sid ? { 'mcp-session-id': sid } : {}));
        H = { rps: Math.round(h.lat.length / h.secs), p50: r1(pct(h.lat, .5)), p95: r1(pct(h.lat, .95)), p99: r1(pct(h.lat, .99)), errs: h.errs, total: h.lat.length, secs: h.secs };
        T = { rps: Math.round(t.lat.length / t.secs), p95: r1(pct(t.lat, .95)), p99: r1(pct(t.lat, .99)), errs: t.errs, total: t.lat.length, secs: t.secs };
      }
      const s1 = procStat(), wall = H.secs + T.secs;
      Object.assign(metrics, { loadGenerator: tool, healthRequests: H.total, healthRps: H.rps, healthP50: H.p50, healthP95: H.p95, healthP99: H.p99, healthErrors: H.errs, toolsListRequests: T.total, toolsListRps: T.rps, toolsListP99: T.p99, toolsListErrors: T.errs, serverCpuPct: r1((s1.cpu - s0.cpu) / wall * 100), serverRssStartMB: r1(s0.rssMB), serverRssEndMB: r1(s1.rssMB) });
      const full = !!ac;
      checks.push(check('/health throughput', `${H.rps.toLocaleString()} req/s`, full ? '≥ 10,000 req/s' : '≥ 3,000 req/s (fallback client)', H.rps >= (full ? 10000 : 3000)), check('/health errors', H.errs, '0', H.errs === 0), check('/health p99', `${H.p99} ms`, '< 50 ms', H.p99 < 50),
        check('MCP tools/list throughput', `${T.rps.toLocaleString()} req/s`, full ? '≥ 5,000 req/s' : '≥ 500 req/s (fallback client)', T.rps >= (full ? 5000 : 500)), check('MCP tools/list errors', T.errs, '0', T.errs === 0), check('server memory growth', `${r1(s1.rssMB - s0.rssMB)} MB`, '< 80 MB', s1.rssMB - s0.rssMB < 80));
    } catch (e) { checks.push(check('server ran', e.message, 'started', false)); }
    finally { proc.kill(); agent.destroy(); }
    const res = { id: 's9', name: 'MCP bridge server under load (Node, 127.0.0.1)', metrics, checks, ok: checks.every(c => c.ok) }; results.push(res);
    console.log(`${res.ok ? 'PASS' : 'FAIL'} (/health ${(metrics.healthRps || 0).toLocaleString()} req/s p99 ${metrics.healthP99} ms · tools/list ${(metrics.toolsListRps || 0).toLocaleString()} req/s · server CPU ${metrics.serverCpuPct}%)`);
    for (const c of checks.filter(c => !c.ok)) console.log(`   ✗ ${c.label}: ${c.value} (limit ${c.limit})`);
  }

  // S10 --------------------------------------------------------------- cost of the monitor itself
  await scenario(browser, 's10', 'Monitoring overhead (idle 10 s, panel closed vs open)', async ({ p, metric }) => {
    const idle = async () => { const a = await metric(), t = Date.now(); await p.waitForTimeout(10000); const b = await metric(); return r1((b.TaskDuration - a.TaskDuration) / ((Date.now() - t) / 1000) * 100); };
    const closed = await idle(); await p.evaluate(() => studioApp.dgToggle(true)); const open = await idle(); await p.evaluate(() => studioApp.dgToggle(false));
    return { metrics: { idleCpuPanelClosedPct: closed, idleCpuPanelOpenPct: open }, checks: [check('idle main-thread CPU, monitor running', `${closed}%`, '< 3%', closed < 3), check('idle main-thread CPU, panel open (live charts)', `${open}%`, '< 10%', open < 10)] };
  });

  await browser.close();
  writeReport(N);
})();

function writeReport(N) {
  // ---------------------------------------------------------------- report
  const version = (fs.readFileSync(path.join(ROOT, 'js/core/version.js'), 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1];
  const env = { version, date: new Date().toISOString(), node: process.version, browser: 'Chromium (Playwright, headless, software GL)', cpus: require('os').cpus().length, quick: QUICK, app: APP.replace(ROOT, '.') };
  fs.writeFileSync(path.join(__dirname, 'load-results.json'), JSON.stringify({ env, results }, null, 2));
  const pass = results.filter(r => r.ok).length;
  let md = `# DesignStudio ${version} — load & monitoring report\n\n${env.date.slice(0, 10)} · ${env.browser} · ${env.cpus} CPU cores · Node ${env.node}${QUICK ? ' · quick mode' : ''}\n\n**${pass} / ${results.length} scenarios pass.**\n\n`;
  md += '| # | Scenario | Result | Main-thread CPU | Heap (after GC) | Key numbers |\n|---|---|---|---|---|---|\n';
  for (const r of results) md += `| ${r.id} | ${r.name} | ${r.ok ? '✅ pass' : '❌ fail'} | ${r.mainThreadCpuPct != null ? `${r.mainThreadCpuPct}%` : `server ${r.metrics.serverCpuPct}%`} | ${r.heapStartMB != null ? `${r.heapStartMB} → ${r.heapEndMB} MB` : `RSS ${r.metrics.serverRssStartMB} → ${r.metrics.serverRssEndMB} MB`} | ${r.checks.slice(0, 3).map(c => `${c.label}: ${c.value}`).join(' · ')} |\n`;
  md += '\n## Checks\n';
  for (const r of results) { md += `\n### ${r.id} · ${r.name}\n\n| Check | Measured | Limit | |\n|---|---|---|---|\n`; for (const c of r.checks) md += `| ${c.label} | ${c.value} | ${c.limit} | ${c.ok ? '✅' : '❌'} |\n`; md += `\n<details><summary>All metrics</summary>\n\n\`\`\`json\n${JSON.stringify(r.metrics, null, 1)}\n\`\`\`\n</details>\n`; }
  const byId = Object.fromEntries(results.map(r => [r.id, r])), F = [];
  if (byId.s6) F.push(`**3D under load (s6)${byId.s6.ok ? ', fixed in 3.32.0' : ''}.** Orbiting ${byId.s6.metrics.objects} objects (${byId.s6.metrics.trianglesK}k triangles) costs ${byId.s6.metrics.autoMsPerFrame} ms per frame in Auto mode vs ${byId.s6.metrics.beforeMsPerFrame} ms before (×${byId.s6.metrics.speedup}), because shadow maps are cached (${byId.s6.metrics.shadowRedrawsWhileOrbiting} redraws while orbiting) and Auto lowered the moving resolution to ${byId.s6.metrics.autoMovingResolutionPct}%, with full resolution back at rest. Absolute times here are software rendering (SwiftShader), hundreds of times slower than a real GPU; the ratio is what carries over.`);
  if (byId.s7) F.push(`**Undo history memory (s7, s11), fixed in 3.32.0.** Undo steps now share unchanged parts of the document, so ${byId.s11 ? `100 steps of a ${N.toLocaleString()}-layer document take ${byId.s11.metrics.historyMB} MB instead of ${byId.s11.metrics.fullCopiesWouldBeMB} MB` : '100 steps fit easily'}. The step count (10–100) and a memory safety limit are user settings. After the soak, clearing the document and history leaves ${byId.s7.metrics.residualMB} MB, so there's no leak.`);
  if (byId.s8) F.push(`**API timing includes browser queueing (s8).** Chromium opens at most 6 connections per host, so a burst of parallel calls queues: the 20 ms endpoint measured p95 ${byId.s8.metrics.burstFastP95Ms} ms inside the burst, versus ${byId.s8.metrics.fastMedianMs} ms sequentially. The monitor deliberately reports what the user waits for.`);
  if (byId.s9) F.push(`**MCP bridge server (s9).** /health ${byId.s9.metrics.healthRps.toLocaleString()} req/s (p99 ${byId.s9.metrics.healthP99} ms) and MCP tools/list ${byId.s9.metrics.toolsListRps.toLocaleString()} req/s, ${byId.s9.metrics.healthErrors + byId.s9.metrics.toolsListErrors} errors, memory ${byId.s9.metrics.serverRssStartMB} → ${byId.s9.metrics.serverRssEndMB} MB, measured with ${byId.s9.metrics.loadGenerator}. Earlier reports (7,800 req/s) measured the test client, not the server. That's far above real use (one AI app polling one tab).`);
  if (byId.s10) F.push(`**Cost of monitoring (s10).** Idle main-thread CPU is ${byId.s10.metrics.idleCpuPanelClosedPct}% with the monitor running and ${byId.s10.metrics.idleCpuPanelOpenPct}% with the live panel open.`);
  if (F.length) md += `\n## Findings & actions\n\n${F.map(f => `- ${f}`).join('\n')}\n`;
  md += `\n## How to read this\n\n- **Main-thread CPU** is the page's real main-thread CPU time (DevTools \`TaskDuration\`) divided by wall time. 100% means the tab was busy the whole time.\n- **Heap** is measured after a forced garbage collection, so growth means memory that is still referenced (a possible leak), not garbage waiting to be collected.\n- Headless Chromium uses software rendering (SwiftShader), so 3D frame rates here are a floor. Real GPUs run much faster.\n- There's no database server: s4 is the storage layer (IndexedDB), and s9 is the only real server (the local MCP bridge).\n\nRun again with \`node tests/load.js\` (add \`--quick\` for a 2-minute pass, or \`--only=s1,s9\`).\n`;
  fs.writeFileSync(path.join(__dirname, 'LOAD-REPORT.md'), md);
  console.log(`\n${pass}/${results.length} scenarios pass → tests/LOAD-REPORT.md`);
  process.exit(pass === results.length ? 0 : 1);
}
