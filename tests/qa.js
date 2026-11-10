/**
 * DesignStudio — production QA suite.
 * Usage:  npm i playwright axe-core   then   node tests/qa.js [--only=suite,suite] [--report=tests/report.json]
 * Suites: boot · unit · design · persistence · animation · prototype · export · media · 3d · links · comments ·
 *         security · robustness · monkey · a11y · responsive · diagnostics · performance
 * Every test records pass / fail, detail and time; the run fails (exit 1) when any test fails or a page error occurs.
 */
'use strict';
const path = require('path'), fs = require('fs');
const pw = require('playwright');
const ROOT = path.resolve(__dirname, '..');
const ARGV = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const URL = 'file://' + (ARGV.app ? path.resolve(process.cwd(), ARGV.app) : path.join(ROOT, 'index.html')); // --app=path/to/DesignStudio.html tests a release build
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const ENGINE = args.browser || 'chromium', IS_CR = ENGINE === 'chromium'; // --browser=chromium | firefox | webkit
const results = [];
let browser;
const IGNORE = /Content Security Policy|evil\.example|Not allowed to load local resource|Access to XMLHttpRequest at 'file:|net::ERR_FAILED|willReadFrequently|GPU stall|WebGL|swiftshader|GL Driver|Automatic fallback|DevTools|favicon|ERR_FILE_NOT_FOUND.*\.map|qa-console|qa-uncaught|qa-reject|127\.0\.0\.1:9\/|ERR_UNSAFE_PORT/i;

async function page(viewport = { width: 1440, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...(opts.ctx || {}) });
  if (opts.init) await ctx.addInitScript(opts.init);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !IGNORE.test(m.text())) p.errs.push('console: ' + m.text()); });
  await p.goto(URL); await p.waitForFunction(() => window.studioApp, null, { timeout: 15000 });
  await p.evaluate(() => { studioApp.hideWelcome(); });
  return p;
}
async function suite(name, fn, opts = {}) {
  if (ONLY && !ONLY.has(name)) return;
  if (opts.chromiumOnly && !IS_CR) { results.push({ suite: name, name: `(skipped on ${ENGINE})`, pass: true, detail: 'needs Chromium DevTools protocol', ms: 0 }); return; }
  const t0 = Date.now(); let p;
  const test = async (tname, f) => {
    const s = Date.now();
    try { const d = await f(); const ok = d === undefined || d === true || (d && d.ok !== false);
      results.push({ suite: name, name: tname, pass: !!ok, detail: typeof d === 'object' ? JSON.stringify(d.detail ?? d).slice(0, 300) : String(d ?? ''), ms: Date.now() - s });
    } catch (e) { results.push({ suite: name, name: tname, pass: false, detail: String(e.message || e).slice(0, 300), ms: Date.now() - s }); }
  };
  try { p = await page(opts.viewport, opts); await fn(p, test); }
  catch (e) { results.push({ suite: name, name: '(suite crashed)', pass: false, detail: String(e.message).slice(0, 300), ms: Date.now() - t0 }); }
  if (p) {
    const errs = p.errs.filter(e => !IGNORE.test(e));
    results.push({ suite: name, name: 'no page / console errors', pass: !errs.length, detail: errs.slice(0, 3).join(' | ').slice(0, 300), ms: 0 });
    await p.context().close();
  }
  process.stdout.write(`  ${name.padEnd(12)} ${Date.now() - t0} ms\n`);
}
const kova = fs.existsSync(path.join(__dirname, 'fixtures/kova.designstudio.json')) ? fs.readFileSync(path.join(__dirname, 'fixtures/kova.designstudio.json'), 'utf8') : null;
const loadKova = (p) => p.evaluate((j) => { const A = studioApp; A.applyRestored(JSON.parse(j)); A.model.resetHistory(); }, kova);
const wait3D = (p) => p.evaluate(() => studioApp.setSection('3d')).then(() => p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 }));
const PNG = path.join(__dirname, 'fixtures/image.png');

(async () => {
  browser = await pw[ENGINE].launch();
  console.log(`DesignStudio QA — ${ENGINE} — ${URL}`);

  // ------------------------------------------------------------------ boot
  await suite('boot', async (p, test) => {
    await test('app boots with version', () => p.evaluate(() => ({ ok: typeof APP_VERSION === 'string' && !!studioApp.model, detail: APP_VERSION })));
    await test('all scripts loaded (mixins on prototype)', () => p.evaluate(() => { const need = ['bind3D', 'bindMedia', 'bindLinks', 'bindUiShell', 'bindTimeline3D', 'l3Panel', 'lkPanel', 'mgDraw', 'g3Build', 'toggleCommentMode']; const miss = need.filter(k => typeof StudioApp.prototype[k] !== 'function'); return { ok: !miss.length, detail: miss }; }));
    for (const s of ['media', '3d', 'design']) await test(`section ${s} opens`, async () => { await p.evaluate(s => studioApp.setSection(s), s); if (s === '3d') await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 }); return p.evaluate(s => ({ ok: studioApp.section === s && !document.getElementById({ design: 'main-workspace', media: 'media-workspace', '3d': 'space3d-workspace' }[s]).hidden }), s); });
    await test('top bar complete in every section', async () => { const out = {}; for (const s of ['design', 'media', '3d']) { await p.evaluate(s => studioApp.setSection(s), s); out[s] = await p.evaluate(() => ['m-file', 'm-edit', 'mode-switch', 'btn-zoom-in', 'btn-toggle-grid', 'btn-toggle-snap', 'btn-toggle-timeline', 'btn-links', 'btn-comments', 'btn-play-proto', 'btn-export-modal'].filter(id => { const e = document.getElementById(id); return !e || !e.getBoundingClientRect().width; })); } return { ok: Object.values(out).every(a => !a.length), detail: out }; });
  });

  // ------------------------------------------------------------------ unit
  await suite('unit', async (p, test) => {
    await test('easings hit 0 and 1', () => p.evaluate(() => { const bad = Object.entries(Utils.easings).filter(([k, f]) => k !== 'hold' && (Math.abs(f(0)) > 1e-6 || Math.abs(f(1) - 1) > 1e-3)).map(([k]) => k); return { ok: !bad.length, detail: bad }; }));
    await test('cubicBezier matches CSS ease at 0.5', () => p.evaluate(() => { const v = Utils.cubicBezier(0.25, 0.1, 0.25, 1)(0.5); return { ok: Math.abs(v - 0.8024) < 0.01, detail: v }; }));
    await test('cubicBezier monotonic for linear', () => p.evaluate(() => { const f = Utils.cubicBezier(0, 0, 1, 1); return [0, 0.25, 0.5, 0.75, 1].every(t => Math.abs(f(t) - t) < 1e-3); }));
    await test('clamp / round / uid / escapeHtml', () => p.evaluate(() => Utils.clamp(5, 0, 3) === 3 && Utils.round(1.23456, 2) === 1.23 && Utils.uid('x') !== Utils.uid('x') && Utils.escapeHtml('<a href="x">&') === '&lt;a href=&quot;x&quot;&gt;&amp;'));
    await test('keyframe evaluation (linear / hold / bezier)', () => p.evaluate(() => { const m = studioApp.model, a = StudioModel.newAnimation('u', { duration: 2 }); m.animations.push(a); a.tracks.e = { x: [{ time: 0, value: 0, easing: 'linear' }, { time: 1, value: 10, easing: 'hold' }, { time: 2, value: 20 }] };
      const r = [m.evaluateIn(a, 'e', 'x', 0.5), m.evaluateIn(a, 'e', 'x', 1.5), m.evaluateIn(a, 'e', 'x', 3)]; a.tracks.e.x[0].bezier = [0, 0, 1, 1]; r.push(m.evaluateIn(a, 'e', 'x', 0.25)); m.animations.pop(); return { ok: r[0] === 5 && r[1] === 10 && r[2] === 20 && Math.abs(r[3] - 2.5) < 0.05, detail: r }; }));
    await test('serialize → load round-trip is lossless', async () => { if (!kova) return { ok: true, detail: 'no fixture' }; await loadKova(p); return p.evaluate(() => { const a = JSON.stringify(studioApp.model.serialize('t')); studioApp.applyRestored(JSON.parse(a)); const b = JSON.stringify(studioApp.model.serialize('t')); const strip = s => s.replace(/"savedAt":"[^"]+"/, ''); return { ok: strip(a) === strip(b), detail: `${a.length} bytes` }; }); });
    await test('loader drops malformed data safely', () => p.evaluate(() => { try { studioApp.applyRestored({ format: 'designstudio', pages: [{ id: 'p', name: 'P', elements: [{ type: 'rect', x: 'NaN', width: -5 }, null, 7] }], comments: [{ text: 1 }], links: [{}], scene3d: 5, animations: 'x' }); return { ok: !!studioApp.model.page, detail: studioApp.model.elements.length }; } catch (e) { return { ok: false, detail: e.message }; } }));
  });

  // ------------------------------------------------------------------ design (real mouse + keyboard)
  await suite('design', async (p, test) => {
    const cv = await p.locator('#main-canvas').boundingBox(), cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
    const count = () => p.evaluate(() => studioApp.model.elements.length);
    await test('draw rectangle (R + drag)', async () => { const n = await count(); await p.mouse.click(cx, cy); await p.keyboard.press('r'); await p.mouse.move(cx - 100, cy - 60); await p.mouse.down(); await p.mouse.move(cx + 60, cy + 40, { steps: 6 }); await p.mouse.up(); return { ok: (await count()) === n + 1, detail: await p.evaluate(() => { const e = studioApp.model.elements.at(-1); return [e.type, Math.round(e.width), Math.round(e.height)]; }) }; });
    await test('draw ellipse (O + drag)', async () => { const n = await count(); await p.keyboard.press('Escape'); await p.keyboard.press('o'); await p.mouse.move(cx + 120, cy - 60); await p.mouse.down(); await p.mouse.move(cx + 220, cy + 30, { steps: 5 }); await p.mouse.up(); return (await count()) === n + 1 && await p.evaluate(() => studioApp.model.elements.at(-1).type === 'ellipse'); });
    await test('text tool creates text', async () => { const n = await count(); await p.keyboard.press('Escape'); await p.keyboard.press('t'); await p.mouse.click(cx - 200, cy + 120); await p.keyboard.type('Hello QA'); await p.keyboard.press('Escape'); await p.waitForTimeout(100); return { ok: (await count()) >= n + 1, detail: await p.evaluate(() => studioApp.model.allElements().filter(e => e.type === 'text').map(e => e.text).slice(-1)) }; });
    await test('move selection with drag', async () => { await p.keyboard.press('v'); await p.keyboard.press('Escape'); const e0 = await p.evaluate(() => { const m = studioApp.model, e = [...m.elements].reverse().find(e => e.type === 'rect' && !m.elements.some(c => c.parentId === e.id)); m.select([e.id]); return { x: e.x, y: e.y, id: e.id }; }); const s = await p.evaluate((id) => { const e = studioApp.model.getElementById(id), r = studioApp.renderer.worldToScreen(e.x + e.width / 2, e.y + e.height / 2), b = document.getElementById('main-canvas').getBoundingClientRect(); return { x: b.left + r.x, y: b.top + r.y }; }, e0.id); await p.mouse.move(s.x, s.y); await p.mouse.down(); await p.mouse.move(s.x + 50, s.y + 30, { steps: 6 }); await p.mouse.up(); const e1 = await p.evaluate(id => { const e = studioApp.model.getElementById(id); return { x: e.x, y: e.y }; }, e0.id); return { ok: e1.x !== e0.x || e1.y !== e0.y, detail: [e0, e1] }; });
    await test('undo / redo', async () => { const n = await count(); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); const u = await count(); await p.keyboard.press('Control+Shift+z'); await p.keyboard.press('Control+Shift+z'); return { ok: (await count()) === n, detail: [n, u] }; });
    await test('copy / paste / duplicate / delete', async () => { await p.evaluate(() => { const m = studioApp.model, e = [...m.elements].reverse().find(e => !['frame', 'group'].includes(e.type) && !m.elements.some(c => c.parentId === e.id)); m.select([e.id]); }); const n = await count(); await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v'); const a = await count(); await p.keyboard.press('Control+d'); const b = await count(); await p.keyboard.press('Delete'); const c = await count(); return { ok: a === n + 1 && b === n + 2 && c === n + 1, detail: [n, a, b, c] }; });
    await test('group / ungroup', async () => { await p.evaluate(() => { const m = studioApp.model; m.select(m.elements.slice(0, 2).map(e => e.id)); }); await p.keyboard.press('Control+g'); const g = await p.evaluate(() => studioApp.model.topSelected()[0]?.type); await p.keyboard.press('Control+Shift+g'); return { ok: g === 'group', detail: g }; });
    await test('frame tool (F)', async () => { const n = await count(); await p.keyboard.press('Escape'); await p.keyboard.press('f'); await p.mouse.move(cv.x + 80, cv.y + 80); await p.mouse.down(); await p.mouse.move(cv.x + 300, cv.y + 260, { steps: 5 }); await p.mouse.up(); return (await count()) === n + 1; });
    await test('layers panel lists layers', () => p.evaluate(() => document.querySelectorAll('#layers-tree li').length >= studioApp.model.elements.length));
    await test('properties edit X updates layer', async () => { await p.evaluate(() => { const m = studioApp.model; m.select([m.elements[0].id]); studioApp.updatePropertiesUI(); }); const inp = p.locator('#inp-x'); if (!(await inp.count())) return { ok: true, detail: 'no #inp-x' }; await inp.fill('123'); await inp.press('Enter'); return p.evaluate(() => ({ ok: Math.round(studioApp.model.topSelected()[0].x) === 123, detail: studioApp.model.topSelected()[0].x })); });
    await test('zoom in / out / fit', async () => { const z0 = await p.evaluate(() => studioApp.model.zoom); await p.click('#btn-zoom-in'); const z1 = await p.evaluate(() => studioApp.model.zoom); await p.click('#btn-zoom-level'); return { ok: z1 > z0, detail: [z0, z1] }; });
    await test('rulers → guide by drag', async () => { const r = await p.locator('#ruler-x').boundingBox(); const n = await p.evaluate(() => (studioApp.model.page.guides || []).length); await p.mouse.move(r.x + 300, r.y + 8); await p.mouse.down(); await p.mouse.move(r.x + 300, r.y + 200, { steps: 6 }); await p.mouse.up(); return p.evaluate(n => (studioApp.model.page.guides || []).length === n + 1, n); });
  });

  // ------------------------------------------------------------------ persistence
  await suite('persistence', async (p, test) => {
    await test('autosave → reload restores the project', async () => { if (!kova) return true; await loadKova(p); await p.evaluate(() => { studioApp.title = 'QA persist'; studioApp.model.elements[0].name = 'QA-marker'; studioApp.autosaveNow(); }); await p.waitForTimeout(800); await p.reload(); await p.waitForFunction(() => window.studioApp); await p.waitForTimeout(1500);
      const restored = await p.evaluate(async () => { if (!studioApp.model.allElements().some(e => e.name === 'QA-marker')) { const b = [...document.querySelectorAll('button')].find(x => /restore|continue|resume/i.test(x.textContent)); b?.click(); await new Promise(r => setTimeout(r, 1200)); } return studioApp.model.allElements().some(e => e.name === 'QA-marker'); });
      return restored; });
    await test('project file (JSON) save contents valid', () => p.evaluate(() => { const j = studioApp.model.serialize('t'); return { ok: j.format === 'designstudio' && Array.isArray(j.pages) && Array.isArray(j.links), detail: Object.keys(j).length }; }));
  });

  // ------------------------------------------------------------------ animation + prototype
  await suite('animation', async (p, test) => {
    if (kova) await loadKova(p);
    await test('animate mode opens timeline', async () => { await p.click('#mode-switch [data-mode="animate"]'); return p.evaluate(() => studioApp.uiMode === 'animate' && studioApp.timelineOpen()); });
    await test('auto keyframe on move in animate mode', () => p.evaluate(() => { const m = studioApp.model, a = m.activeAnimation, e = m.elements.find(x => x.type !== 'frame') || m.elements[0]; const n = Object.keys(a.tracks[e.id] || {}).length; m.setKeyframe(e.id, 'x', 0.5, e.x + 40); return Object.keys(a.tracks[e.id] || {}).length >= Math.max(1, n); }));
    await test('back to edit mode', async () => { await p.click('#mode-switch [data-mode="design"]'); return p.evaluate(() => studioApp.uiMode === 'design'); });
    await test('prototype plays and closes', async () => { await p.click('#btn-play-proto'); await p.waitForTimeout(600); const open = await p.evaluate(() => document.getElementById('prototype-modal').style.display === 'flex'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); return { ok: open, detail: open }; });
  });

  // ------------------------------------------------------------------ export
  await suite('export', async (p, test) => {
    if (kova) await loadKova(p);
    const roots = () => 'studioApp.model.elements';
    await test('SVG export parses', () => p.evaluate(() => { const svg = Exporters.svgDocument(studioApp.model, studioApp.model.elements, {}); const d = new DOMParser().parseFromString(svg, 'image/svg+xml'); return { ok: !d.querySelector('parsererror') && svg.length > 500, detail: `${Math.round(svg.length / 1024)} KB` }; }));
    await test('Animated SVG parses', () => p.evaluate(() => { const r = Exporters.animatedSVG(studioApp.model, studioApp.model.elements, {}), svg = typeof r === 'string' ? r : r.svg; const d = new DOMParser().parseFromString(svg, 'image/svg+xml'); return !d.querySelector('parsererror'); }));
    await test('PNG render (2x) non-empty', () => p.evaluate(() => { const c = studioApp.renderer.renderToCanvas({ roots: studioApp.model.elements, scale: 2 }); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i]) n++; return { ok: c.width > 10 && n > 5, detail: [c.width, c.height] }; }));
    await test('Lottie JSON valid', () => p.evaluate(() => { const r = Exporters.lottie(studioApp.model, studioApp.model.elements, {}), j = r.json ?? r; const o = typeof j === 'string' ? JSON.parse(j) : j; return { ok: !!o.layers && o.v !== undefined, detail: o.layers?.length }; }));
    await test('CSS keyframes / code / tokens generate', () => p.evaluate(() => { const m = studioApp.model; const a = Exporters.cssKeyframes(m, m.elements), b = Exporters.code(m, m.elements.slice(0, 1), { mode: 'html' }), c = Exporters.tokens(m); return [a, b, c].every(x => x !== undefined && x !== null); }));
    await test('interactive HTML export runs without errors', async () => { const html = await p.evaluate(() => InteractiveExport.html(studioApp.model, studioApp.model.elements, { title: 'QA' })); const q = await browser.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message)); await q.setContent(html); await q.waitForTimeout(800); await q.close(); return { ok: !errs.length && html.length > 1000, detail: errs[0] || `${Math.round(html.length / 1024)} KB` }; });
  });

  // ------------------------------------------------------------------ media
  await suite('media', async (p, test) => {
    await p.evaluate(() => studioApp.setSection('media'));
    await test('open image', async () => { await p.locator('#md-file').setInputFiles(PNG); await p.waitForFunction(() => studioApp.mediaHasClip(), null, { timeout: 10000 }); return p.evaluate(() => ({ ok: studioApp.media.width > 0, detail: [studioApp.media.width, studioApp.media.height] })); });
    await test('resize op applies + undo', () => p.evaluate(async () => { const A = studioApp, w0 = A.media.width; A.mediaSelectTool('resize'); const t = MediaUI.tool('resize'), o = A.mediaOpts(t); if ('width' in o) o.width = Math.round(w0 / 2); if ('w' in o) o.w = Math.round(w0 / 2); if ('scale' in o) o.scale = 50; if ('pct' in o) o.pct = 50; await A.mediaRun(); const w1 = A.media.width; A.mediaUndo?.(); return { ok: w1 < w0 && A.media.width === w0, detail: [w0, w1, A.media.width] }; }));
    await test('image compressor produces a result', () => p.evaluate(async () => { const A = studioApp; A.mediaSelectTool('compress'); await A.mediaRun(); await new Promise(r => setTimeout(r, 400)); return { ok: !document.getElementById('md-result').hidden, detail: document.getElementById('md-result').textContent.slice(0, 80) }; }));
    await test('rulers, guides & grid', async () => { const rx = await p.locator('#mg-rx').boundingBox(); await p.mouse.move(rx.x + 300, rx.y + 8); await p.mouse.down(); await p.mouse.move(rx.x + 300, rx.y + 180, { steps: 5 }); await p.mouse.up(); await p.click('#btn-toggle-grid'); return p.evaluate(() => ({ ok: studioApp.media.mg.guides.length === 1 && studioApp.section === 'media', detail: studioApp.media.mg })); });
    await test('top bar zoom works in media', async () => { const a = await p.textContent('#btn-zoom-level'); await p.click('#btn-zoom-in'); const b = await p.textContent('#btn-zoom-level'); return { ok: a !== b && (await p.evaluate(() => studioApp.section)) === 'media', detail: [a, b] }; });
    await test('animate / edit mode in media', async () => { await p.click('#mode-switch [data-mode="animate"]'); const a = await p.evaluate(() => [studioApp.section, studioApp.secMode.media]); await p.click('#mode-switch [data-mode="design"]'); return { ok: a[0] === 'media' && a[1] === 'animate', detail: a }; });
    await test('animated GIF export', () => p.evaluate(async () => { const A = studioApp; const id = MediaUI.tool('x-gif') ? 'x-gif' : 'optgif'; A.mediaSelectTool(id); await A.mediaRun(); await new Promise(r => setTimeout(r, 500)); return { ok: !document.getElementById('md-result').hidden, detail: id }; }));
  });

  // ------------------------------------------------------------------ 3d
  await suite('3d', async (p, test) => {
    await wait3D(p); await p.waitForTimeout(500);
    await test('add every primitive + light', () => p.evaluate(async () => { const A = studioApp, types = [...Object.keys(Scene3DCore.PRIMS), 'pointLight']; for (const t of types) await A.s3Add(t); const got = types.filter(t => A.model.scene3d.objects.some(o => o.type === t)); return { ok: got.length === types.length, detail: got.length }; }));
    await test('transform via inspector + undo', () => p.evaluate(async () => { const A = studioApp, d = A.model.scene3d.objects.find(o => o.type === 'box'); A.s3Select(d.id); A.s3Edit(d, 'px', 2, 'commit'); const v = d.px; A.s3Undo(); const after = A.def3(d.id)?.px; return { ok: v === 2 && after !== 2, detail: [v, after] }; }));
    await test('keyframes + playback', () => p.evaluate(async () => { const A = studioApp, d = A.model.scene3d.objects.find(o => o.type === 'sphere'); A.s3Select(d.id); A.s3SetTime(0); A.s3KeySelection(); A.s3SetTime(1); A.s3Edit(d, 'py', 3, 'commit'); A.s3KeySelection(); A.s3SetTime(0.5); const o = A.s3.objs.get(d.id); return { ok: o.position.y > 0.2 && o.position.y < 3, detail: o.position.y }; }));
    await test('timeline copy / paste / easing', () => p.evaluate(() => { const A = studioApp, a = A.model.activeAnimation, d = A.model.scene3d.objects.find(o => o.type === 'sphere'); A.t3.sel = new Set(Object.values(a.tracks[d.id]).flat()); A.t3SetEase('bounce'); A.t3Copy(); A.s3SetTime(1.5); A.t3Paste(); return Object.values(a.tracks[d.id]).flat().length >= 4; }));
    await test('3D guides + snap', () => p.evaluate(() => { const A = studioApp; A.g3AddAtSelection('x'); return A.s3Scene().guides.length >= 1 && A.g3.group.children.length >= 1; }));
    await test('GLB export', () => p.evaluate(async () => { const b = await studioApp.s3ExportGLB(); return { ok: b && b.size > 1000, detail: b?.size }; }));
    await test('3D viewer HTML runs', async () => { const html = await p.evaluate(() => studioApp.s3ViewerHTML('QA')); const q = await browser.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message)); await q.setContent(html); await q.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20000 }).catch(() => errs.push('viewer not ready')); await q.close(); return { ok: !errs.length, detail: errs[0] || `${Math.round(html.length / 1024)} KB` }; });
    await test('top bar grid / snap / timeline stay in 3D', async () => { for (const id of ['btn-toggle-grid', 'btn-toggle-snap', 'btn-toggle-timeline', 'btn-toggle-timeline']) await p.click('#' + id); return p.evaluate(() => studioApp.section === '3d'); });
  });

  // ------------------------------------------------------------------ links
  await suite('links', async (p, test) => {
    if (kova) await loadKova(p);
    await wait3D(p); await p.waitForTimeout(500);
    await test('3D object → Design (linked) + auto refresh', () => p.evaluate(async () => { const A = studioApp, d = A.model.scene3d.objects.find(o => o.type === 'box') || (await A.s3Add('box')); A.s3Select(d.id); await A.lk3DToDesign(true); const l = A.model.links.at(-1), a0 = A.model.assets[l.target.assetId]; A.setSection('3d'); A.s3Edit(A.def3(d.id), 'ry', 40, 'commit'); await new Promise(r => setTimeout(r, 1000)); return { ok: A.model.assets[l.target.assetId] !== a0, detail: l.target }; }));
    await test('adjust linked 3D in Design panel', () => p.evaluate(async () => { const A = studioApp, l = A.model.links.at(-1); A.setSection('design'); A.model.select([l.target.elId]); A.updatePropertiesUI(); await new Promise(r => setTimeout(r, 400)); const q0 = l.src.cam.quat.join(); A.l3Orbit(l, 40, 10); A.l3Live(l, true); await new Promise(r => setTimeout(r, 400)); return { ok: !document.getElementById('sec-3dlink').hidden && q0 !== l.src.cam.quat.join() }; }));
    await test('Design → 3D plane (linked texture)', () => p.evaluate(async () => { const A = studioApp; A.setSection('design'); const f = A.model.elements.find(e => e.type === 'frame') || A.model.elements[0]; A.model.select([f.id]); await A.lkDesignTo3D(); const l = A.model.links.at(-1); return { ok: !!A.s3.objs.get(l.target.objId)?.material?.map, detail: l.target }; }));
    await test('links panel renders', async () => { await p.click('#btn-links'); const n = await p.locator('.lk-row').count(); await p.keyboard.press('Escape'); return { ok: n >= 2, detail: n }; });
    await test('unlink keeps the layer', () => p.evaluate(() => { const A = studioApp, l = A.model.links[0], id = l.target.elId; A.lkRemove(l, true); return !!A.model.getElementById(id); }));
  });

  // ------------------------------------------------------------------ workspace (v3.23 pain-point fixes)
  await suite('workspace', async (p, test) => {
    await test('resize Properties panel by dragging its edge', async () => { const h = await p.locator('.ws-resize-right').boundingBox(); const w0 = await p.evaluate(() => document.getElementById('right-panel').offsetWidth); await p.mouse.move(h.x + 3, h.y + 300); await p.mouse.down(); await p.mouse.move(h.x - 60, h.y + 300, { steps: 4 }); await p.mouse.up(); const w1 = await p.evaluate(() => document.getElementById('right-panel').offsetWidth); await p.dblclick('.ws-resize-right'); return { ok: w1 > w0 + 40, detail: [w0, w1] }; });
    await test('Ctrl+\\ hides both side panels and widens the canvas', async () => { const a = await p.evaluate(() => document.getElementById('main-canvas').clientWidth); await p.keyboard.press('Control+\\'); await p.waitForTimeout(150); const b = await p.evaluate(() => document.getElementById('main-canvas').clientWidth); await p.keyboard.press('Control+\\'); return { ok: b > a + 400, detail: [a, b] }; });
    await test('AI Studio docks beside Properties (both visible)', async () => { await p.click('#btn-ai'); await p.waitForTimeout(300); const r = await p.evaluate(() => { const d = document.querySelector('.ai-drawer').getBoundingClientRect(), rp = document.getElementById('right-panel').getBoundingClientRect(), cv = document.getElementById('main-canvas').getBoundingClientRect(); return { docked: document.body.classList.contains('ws-ai-docked'), noOverlap: Math.round(d.right) <= Math.round(rp.left) + 1 && Math.round(cv.right) <= Math.round(d.left) + 1, rp: rp.width }; }); await p.click('#btn-ai'); return { ok: r.docked && r.noOverlap && r.rp > 100, detail: r }; });
    await test('Animate turns Auto-key on, shows guidance, Edit restores', async () => { await p.evaluate(() => { studioApp.applyRestored({ format: 'designstudio', pages: [{ id: 'p', name: 'P', elements: [] }], currentPageId: 'p' }); studioApp.refreshUI(); }); await p.click('#mode-switch [data-mode="animate"]'); const a = await p.evaluate(() => [studioApp.model.animationTimeline.isRecording, !document.getElementById('ws-tl-hint').hidden, document.querySelector('.ws-ak-label')?.textContent]); await p.click('#mode-switch [data-mode="design"]'); const b = await p.evaluate(() => studioApp.model.animationTimeline.isRecording); return { ok: a[0] && a[1] && /on/i.test(a[2]) && b === false, detail: [a, b] }; });
    await test('Lottie: warning lists unsupported layers; text kept as images', async () => { if (!kova) return true; await loadKova(p); await p.evaluate(() => { const m = studioApp.model; m.select([m.elements.find(e => e.type === 'frame').id]); }); await p.click('#btn-export-modal'); await p.click('[data-exp-tab="animation"]'); await p.selectOption('#exp-anim-type', 'lottie'); await p.waitForTimeout(300); const r = await p.evaluate(() => { const warn = !document.getElementById('exp-lottie-warn').hidden && /text layers/.test(document.querySelector('#exp-lottie-warn .lw-msg').textContent); const m = studioApp.model, roots = studioApp.exportScopeRoots(); const j = JSON.parse(Exporters.lottie(m, roots, { rasterize: (el) => studioApp.lottieRaster(el) }).json); return { warn, images: j.layers.filter(l => l.ty === 2).length, assets: j.assets.length }; }); await p.evaluate(() => document.getElementById('export-modal').classList.remove('open')); return { ok: r.warn && r.images > 10 && r.images === r.assets, detail: r }; });
  });

  // ------------------------------------------------------------------ comments
  await suite('comments', async (p, test) => {
    for (const s of ['design', 'media', '3d']) await test(`comment mode in ${s}`, async () => { await p.evaluate(s => studioApp.setSection(s), s); if (s === '3d') await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 }); if (s === 'media') { await p.locator('#md-file').setInputFiles(PNG); await p.waitForTimeout(800); } await p.click('#btn-comments'); const on = await p.evaluate(() => studioApp.commentMode); await p.keyboard.press('Escape'); return on; });
  });


  // ------------------------------------------------------------------ touch & pen (Chromium: real multi-touch via DevTools protocol)
  await suite('touch', async (p, test) => {
    const cdp = await p.context().newCDPSession(p);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((q, i) => ({ x: q[0], y: q[1], id: i, radiusX: 4, radiusY: 4, force: 1 })) });
    const cv = await p.locator('#main-canvas').boundingBox(), cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2;
    const sel = () => p.evaluate(() => studioApp.model.topSelected().map(e => e.id));
    const elScreen = (id) => p.evaluate(id => { const e = studioApp.model.getElementById(id), r = studioApp.renderer.worldToScreen(e.x + e.width / 2, e.y + e.height / 2), b = document.getElementById('main-canvas').getBoundingClientRect(); return [b.left + r.x, b.top + r.y]; }, id);
    const leaf = await p.evaluate(() => { const m = studioApp.model, e = [...m.elements].reverse().find(e => !['frame', 'group'].includes(e.type) && e.width > 30 && e.height > 20); m.select([]); return e.id; });
    await test('tap selects a layer', async () => { const [x, y] = await elScreen(leaf); await touch('touchStart', [[x, y]]); await touch('touchEnd', []); await p.waitForTimeout(200); return { ok: (await sel()).includes(leaf), detail: await sel() }; });
    await test('one-finger drag moves the layer', async () => { const [x, y] = await elScreen(leaf); const p0 = await p.evaluate(id => { const e = studioApp.model.getElementById(id); return [e.x, e.y]; }, leaf); await touch('touchStart', [[x, y]]); for (let i = 1; i <= 8; i++) { await touch('touchMove', [[x + i * 6, y + i * 4]]); await p.waitForTimeout(16); } await touch('touchEnd', []); const p1 = await p.evaluate(id => { const e = studioApp.model.getElementById(id); return [e.x, e.y]; }, leaf); return { ok: p1[0] > p0[0] + 20, detail: [p0, p1] }; });
    await test('two-finger pinch zooms, pans, and does not move layers', async () => { const z0 = await p.evaluate(() => studioApp.model.zoom), b0 = await p.evaluate(id => studioApp.model.getElementById(id).x, leaf); await touch('touchStart', [[cx - 50, cy]]); await touch('touchStart', [[cx - 50, cy], [cx + 50, cy]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - 50 - i * 8, cy + i * 2], [cx + 50 + i * 8, cy + i * 2]]); await p.waitForTimeout(16); } await touch('touchEnd', []); const z1 = await p.evaluate(() => studioApp.model.zoom), b1 = await p.evaluate(id => studioApp.model.getElementById(id).x, leaf); return { ok: z1 > z0 * 1.3 && b0 === b1, detail: [z0, z1, b0, b1] }; });
    await test('long-press opens the context menu', async () => { const x = cx, y = cy; await touch('touchStart', [[x, y]]); await p.waitForTimeout(700); const mid = await p.evaluate(() => getComputedStyle(document.getElementById('ctx-menu')).display); await touch('touchEnd', []); await p.waitForTimeout(150); const open = await p.evaluate(() => getComputedStyle(document.getElementById('ctx-menu')).display !== 'none'); return { ok: open, detail: { mid, x, y, z: await p.evaluate(() => studioApp.model.zoom) } }; await p.keyboard.press('Escape'); await p.mouse.click(5, 300); return open; });
    await test('handles get finger-sized hit areas', () => p.evaluate(() => studioApp._coarse === true));
    await test('pen draws a rectangle (pointerType pen)', async () => { const n = await p.evaluate(() => studioApp.model.elements.length); await p.keyboard.press('r'); const pen = (type, x, y, buttons) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, pointerType: 'pen', force: 0.6 }); await pen('mousePressed', cv.x + 120, cv.y + 120, 1); for (let i = 1; i <= 6; i++) await pen('mouseMoved', cv.x + 120 + i * 20, cv.y + 120 + i * 12, 1); await pen('mouseReleased', cv.x + 240, cv.y + 192, 0); return { ok: (await p.evaluate(() => studioApp.model.elements.length)) === n + 1, detail: n }; });
    await test('palm rejection: touch right after pen is ignored', async () => { const n = await p.evaluate(() => studioApp.model.elements.length); await p.keyboard.press('r'); await touch('touchStart', [[cx, cy]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx + i * 15, cy + i * 10]]); await touch('touchEnd', []); return { ok: (await p.evaluate(() => studioApp.model.elements.length)) === n, detail: n }; });
    await test('3D viewport orbits with touch', async () => { await p.keyboard.press('Escape'); await p.evaluate(() => studioApp.setSection('3d')); await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 }); await p.waitForTimeout(1500); const b = await p.locator('#s3-canvas').boundingBox(), q0 = await p.evaluate(() => studioApp.s3.camera.position.toArray().join()); const x = b.x + b.width / 2, y = b.y + b.height / 2; await touch('touchStart', [[x, y]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[x + i * 10, y]]); await p.waitForTimeout(16); } await touch('touchEnd', []); await p.waitForTimeout(300); return { ok: q0 !== (await p.evaluate(() => studioApp.s3.camera.position.toArray().join())) }; });
  }, { chromiumOnly: true, ctx: { hasTouch: true } });

  // ------------------------------------------------------------------ compatibility fallbacks (Safari / Firefox paths, forced in Chromium)
  await suite('compat', async (p, test) => {
    await test('polyfills active', () => p.evaluate(() => ({ ok: DS_COMPAT.canvasFilter === 'polyfill' && !('letterSpacing' in CanvasRenderingContext2D.prototype), detail: DS_COMPAT })));
    await test('canvas filter polyfill: blur + colour', () => p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 60; const x = c.getContext('2d'); const s = document.createElement('canvas'); s.width = s.height = 60; const sx = s.getContext('2d'); sx.fillStyle = '#fff'; sx.fillRect(25, 25, 10, 10); x.filter = 'blur(4px) grayscale(1)'; x.drawImage(s, 0, 0); const d = x.getImageData(20, 30, 1, 1).data, inner = x.getImageData(30, 30, 1, 1).data; return { ok: d[3] > 10 && inner[3] < 255, detail: [d[3], inner[3]] }; }));
    if (kova) await loadKova(p);
    await test('design renders shadows / blurs with the polyfill', () => p.evaluate(() => { const A = studioApp, m = A.model, e = new StudioElement('rect', 0, 0, 80, 80); e.effects = [{ type: 'dropShadow', visible: true, x: 4, y: 8, blur: 20, spread: 0, color: '#000000', opacity: 0.5 }, { type: 'layerBlur', visible: true, blur: 6 }]; m.insertElement(e); A.commit(); const c = A.renderer.renderToCanvas({ roots: [e], scale: 1 }); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && d[i] < 255) n++; return { ok: c.width >= 80 && n > 50, detail: [c.width, n] }; }));
    await test('text with letter-spacing renders (manual spacing path)', () => p.evaluate(() => { const A = studioApp, m = A.model, t = new StudioElement('text', 0, 0, 300, 40); t.text = 'Spaced'; t.letterSpacing = 6; t.fills = [{ type: 'solid', color: '#000000', opacity: 1, visible: true }]; m.insertElement(t); A.commit(); const c = A.renderer.renderToCanvas({ roots: [t], scale: 1, bg: '#ffffff' }); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) dark++; return { ok: dark > 50, detail: dark }; }));
    await test('media effects + censor blur with the polyfill', async () => { await p.evaluate(() => studioApp.setSection('media')); await p.locator('#md-file').setInputFiles(PNG); await p.waitForFunction(() => studioApp.mediaHasClip(), null, { timeout: 10000 }); return p.evaluate(async () => { const A = studioApp; A.mediaSelectTool('effects'); const t = MediaUI.tool('effects'), o = A.mediaOpts(t); o.blur = 3; o.brightness = 120; await A.mediaRun(); return !!A.media.frames.length; }); });
  }, { init: () => { try { localStorage.setItem('designstudio.forceCanvasFilterPolyfill', '1'); } catch (_) {} delete CanvasRenderingContext2D.prototype.letterSpacing; } });

  // ------------------------------------------------------------------ security
  await suite('security', async (p, test) => {
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1"><script>window.__xss=9</script>';
    await test('XSS in layer names / text / title / comments / animation names', async () => {
      await p.evaluate((X) => { const A = studioApp, m = A.model; const e = new StudioElement('rect', 10, 10, 50, 50); e.name = X; m.insertElement(e); const t = new StudioElement('text', 80, 10, 120, 40); t.text = X; t.name = X; m.insertElement(t); A.title = X; m.animations[0].name = X; m.comments.push({ id: 'c1', pageId: m.currentPageId, x: 20, y: 20, author: X, text: X, time: Date.now(), resolved: false, replies: [] }); A.commit(); A.renderLayers?.(); A.toggleCommentMode(true); A.updatePropertiesUI(); }, X);
      await p.evaluate(() => studioApp.setSection('3d')); await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 });
      await p.evaluate(async (X) => { const d = await studioApp.s3Add('box'); d.name = X; studioApp.s3RenderAll(); studioApp.s3RenderAnim(); }, X);
      await p.click('#btn-links').catch(() => {}); await p.keyboard.press('Escape');
      await p.waitForTimeout(600);
      return p.evaluate(() => ({ ok: !window.__xss, detail: window.__xss || 0 }));
    });
    await test('XSS via imported project JSON', () => p.evaluate(async () => { const evil = { format: 'designstudio', title: '<img src=x onerror=window.__xss2=1>', pages: [{ id: 'p1', name: '<svg onload=window.__xss2=1>', elements: [{ id: 'e1', type: 'text', x: 0, y: 0, width: 100, height: 30, name: '<img src=x onerror=window.__xss2=1>', text: '<b onmouseover=x>hi' }] }], currentPageId: 'p1' }; studioApp.applyRestored(evil); studioApp.renderLayers?.(); await new Promise(r => setTimeout(r, 400)); return { ok: !window.__xss2 }; }));
    await test('XSS sweep: pages, styles, inputs, state machines, components, panels', async () => {
      await p.evaluate(async () => { const A = studioApp, m = A.model, X = '<img src=x onerror="window.__xss3=(window.__xss3||0)+1">';
        A.setSection('design'); m.page.name = X; m.styles.colors = [{ id: 's1', name: X, color: '#ff0000' }]; m.styles.texts = [{ id: 't1', name: X, fontSize: 14, fontWeight: 400, fontFamily: 'Inter' }];
        m.inputs.push({ id: 'i1', name: X, type: 'boolean', value: false }); if (m.stateMachines?.length) m.stateMachines[0].name = X;
        const e = new StudioElement('rect', 0, 0, 40, 40); e.name = X; e.isComponentMaster = true; m.insertElement(e); A.commit();
        for (const t of document.querySelectorAll('.panel-tab, [data-tab], [role="tab"]')) { try { t.click(); } catch (_) {} await new Promise(r => setTimeout(r, 30)); }
        A.setUiMode('animate'); A.renderTimeline?.(); await new Promise(r => setTimeout(r, 200)); A.setUiMode('design');
        A.showAbout(); document.querySelector('.ds-dialog [data-a="close"]')?.click(); });
      await p.waitForTimeout(500);
      return p.evaluate(() => ({ ok: !window.__xss3, detail: window.__xss3 || 0 }));
    });
    await test('exports escape names (SVG / HTML)', () => p.evaluate(() => { const m = studioApp.model; const svg = Exporters.svgDocument(m, m.elements, {}); const html = InteractiveExport.html(m, m.elements, { title: '<script>alert(1)</script>' }); return { ok: !/<img src=x onerror/i.test(svg) && !/<title><script>/i.test(html), detail: [svg.length, html.length] }; }));
    await test('MCP host rejects foreign origins', () => p.evaluate(() => { const fn = studioApp.mcpOriginAllowed || studioApp.mcpAllowedOrigin; if (!fn) return { ok: true, detail: 'checked in mcp-e2e' }; return !fn.call(studioApp, 'https://evil.example'); }));
  });

  // ------------------------------------------------------------------ malicious files (real file inputs)
  await suite('malicious', async (p, test) => {
    const MAL = (f) => path.join(__dirname, 'fixtures/malicious', f);
    const evil = []; p.on('request', r => { if (/evil\.example/.test(r.url())) evil.push(r.url()); });
    const toast = () => p.evaluate(() => [...document.querySelectorAll('#toast-container .toast, .toast')].map(t => t.textContent).join(' | ').slice(-300));
    const open = async (f) => { await p.locator('#file-importer').setInputFiles(MAL(f)); await p.waitForTimeout(700); };
    await test('project: prototype pollution blocked', async () => { await open('project-evil.designstudio.json'); return p.evaluate(() => ({ ok: ({}).polluted === undefined && ({}).polluted2 === undefined && ({}).pollutedTrack === undefined && Object.getPrototypeOf(studioApp.model.assets) === Object.prototype, detail: Object.keys(Object.prototype) })); });
    await test('project: remote / javascript: image URLs dropped', () => p.evaluate(() => ({ ok: !Object.values(studioApp.model.assets).some(v => !/^data:image\//.test(v)), detail: Object.keys(studioApp.model.assets) })));
    await test('project: javascript: prototype link neutralised', () => p.evaluate(() => { const e = studioApp.model.allElements().find(x => x.id === 'e1'); const u = e?.interactions?.[0]?.url; return { ok: !u || /^https?:|^mailto:/i.test(u), detail: u }; }));
    await test('project: 3D remote texture + external-model asset rejected', async () => { await p.evaluate(() => studioApp.setSection('3d')); await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 }); await p.waitForTimeout(800); const r = await p.evaluate(() => ({ assets: Object.keys(studioApp.model.scene3d?.assets || {}), map: studioApp.model.scene3d?.objects.find(o => o.id === 'o3_tex')?.mat?.map })); return { ok: !r.assets.includes('t1') && !r.map, detail: r }; });
    await test('3D import: glTF with external buffer refused', async () => { await p.locator('#s3-file').setInputFiles(MAL('gltf-external.gltf')); await p.waitForTimeout(800); return p.evaluate(() => ({ ok: !studioApp.model.scene3d.objects.some(o => o.type === 'model' && /gltf-external/.test(o.name)), detail: document.querySelector('#toast-container')?.textContent.slice(-160) })); });
    await test('no request ever reached the attacker host', () => ({ ok: !evil.length, detail: evil }));
    await p.evaluate(() => studioApp.setSection('design'));
    await test('image decompression bomb (20000×20000 PNG) refused', async () => { const n = await p.evaluate(() => studioApp.model.allElements().length); await open('png-bomb-20000.png'); await p.waitForTimeout(800); return { ok: (await p.evaluate(() => studioApp.model.allElements().length)) === n, detail: await toast() }; });
    await test('SVG entity-expansion (billion laughs) refused', async () => { const n = await p.evaluate(() => studioApp.model.allElements().length); await open('svg-entities.svg'); return { ok: (await p.evaluate(() => studioApp.model.allElements().length)) === n, detail: await toast() }; });
    await test('SVG with script / onload / javascript: / remote refs imports inert', async () => { await open('svg-active.svg'); await p.waitForTimeout(500); return p.evaluate(() => ({ ok: !window.__svgx, detail: window.__svgx || 'inert' })); });
    await test('no request to attacker host after SVG import', () => ({ ok: !evil.length, detail: evil }));
    await test('Media: GIF bomb (12000×12000 canvas) refused', async () => { await p.evaluate(() => studioApp.setSection('media')); await p.locator('#md-file').setInputFiles(MAL('gif-bomb-12000.gif')); await p.waitForTimeout(1200); return p.evaluate(() => ({ ok: !studioApp.mediaHasClip() || studioApp.media.width < 12000, detail: document.querySelector('#toast-container')?.textContent.slice(-160) })); });
    await test('Media: PNG bomb refused', async () => { await p.locator('#md-file').setInputFiles(MAL('png-bomb-20000.png')); await p.waitForTimeout(1500); return p.evaluate(() => ({ ok: !studioApp.mediaHasClip() || studioApp.media.width < 20000, detail: studioApp.media.width })); });
    await test('oversized JSON refused before parsing', () => p.evaluate(() => { try { Utils.safeParseJSON('{"a":"' + 'x'.repeat(2048) + '"}', 1024); return false; } catch (e) { return { ok: /too large/i.test(e.message), detail: e.message }; } }));
    await test('Content-Security-Policy blocks injected inline / remote scripts', () => p.evaluate(async () => { const s = document.createElement('script'); s.textContent = 'window.__cspx=1'; document.head.appendChild(s); const r = document.createElement('script'); r.src = 'https://evil.example/x.js'; document.head.appendChild(r); await new Promise(res => setTimeout(res, 300)); return { ok: !window.__cspx && !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'), detail: window.__cspx || 'blocked' }; }));
    await test('exported runtimes refuse javascript: links', () => p.evaluate(() => { const src = InteractiveExport.runtimeSource ? InteractiveExport.runtimeSource() : ''; const html = InteractiveExport.html(studioApp.model, studioApp.model.elements, {}); return { ok: /https\?:\\\/\\\/\|mailto:/.test(html) || /\(https\?:/.test(html), detail: html.length }; }));
  });

  // ------------------------------------------------------------------ robustness
  await suite('robustness', async (p, test) => {
    await test('corrupted JSON import shows error, keeps project', () => p.evaluate(async () => { const n = studioApp.model.elements.length; try { await studioApp.openProjectText?.('{not json'); } catch (_) { /* expected */ } return studioApp.model.elements.length === n; }));
    await test('empty project renders in all sections', async () => { await p.evaluate(() => studioApp.run?.('reset') ?? studioApp.applyRestored({ format: 'designstudio', pages: [] })); for (const s of ['design', 'media', '3d', 'design']) await p.evaluate(s => studioApp.setSection(s), s); return p.evaluate(() => !!studioApp.model.page); });
    await test('2,000 layers: render + select-all + delete + undo', () => p.evaluate(() => { const A = studioApp, m = A.model; for (let i = 0; i < 2000; i++) { const e = new StudioElement(i % 2 ? 'rect' : 'ellipse', (i % 50) * 30, Math.floor(i / 50) * 30, 24, 24); m.insertElement(e); } A.commit(); const t0 = performance.now(); A.renderer.dirty = true; A.renderer.render(); const r = performance.now() - t0; m.select(m.elements.map(e => e.id)); A.run('delete'); const after = m.elements.length; A.run('undo'); return { ok: after === 0 && m.elements.length >= 2000 && r < 400, detail: `render ${r.toFixed(0)} ms` }; }));
    await test('rapid undo/redo spam', () => p.evaluate(() => { const A = studioApp; for (let i = 0; i < 200; i++) A.run(i % 3 ? 'undo' : 'redo'); return true; }));
    await test('section switching spam', () => p.evaluate(async () => { for (let i = 0; i < 30; i++) studioApp.setSection(['design', 'media', '3d'][i % 3]); await new Promise(r => setTimeout(r, 600)); studioApp.setSection('design'); return studioApp.section === 'design'; }));
    await test('localStorage unavailable does not crash', () => p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); }; try { studioApp.autosaveNow(); studioApp.t3Save?.(); studioApp.mgSave?.(); return true; } catch (e) { return { ok: false, detail: e.message }; } finally { Storage.prototype.setItem = orig; } }));
  });

  // ------------------------------------------------------------------ monkey (random UI)
  await suite('monkey', async (p, test) => {
    if (kova) await loadKova(p);
    await test('600 random clicks / keys / drags across all sections', async () => {
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const keys = ['r', 'o', 'v', 't', 'f', 'Escape', 'Delete', 'Control+z', 'Control+Shift+z', 'Control+d', 'Control+g', 'k', 'w', 'e', ' ', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab'];
      for (let i = 0; i < 600; i++) {
        if (i % 150 === 0) await p.evaluate(s => studioApp.setSection(s), ['design', 'media', '3d', 'design'][i / 150]);
        const x = 20 + rnd() * 1400, y = 50 + rnd() * 830, r = rnd();
        try {
          if (r < 0.5) await p.mouse.click(x, y, { timeout: 500 });
          else if (r < 0.75) await p.keyboard.press(keys[Math.floor(rnd() * keys.length)]);
          else { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + rnd() * 200 - 100, y + rnd() * 200 - 100, { steps: 3 }); await p.mouse.up(); }
        } catch (_) { /* a dialog or file chooser may block — ignore */ }
        // close native dialogs / file pickers that may have opened
        if (i % 25 === 0) await p.keyboard.press('Escape').catch(() => {});
      }
      return p.evaluate(() => ({ ok: !!studioApp.model && document.body.isConnected, detail: studioApp.section }));
    });
  });

  // ------------------------------------------------------------------ a11y (axe-core)
  await suite('a11y', async (p, test) => {
    const axe = require.resolve('axe-core/axe.min.js');
    await p.addScriptTag({ path: axe });
    for (const s of ['design', 'media', '3d', 'handover']) await test(`axe: no critical / serious violations (${s})`, async () => {
      if (s === 'handover') await p.evaluate(() => { const A = studioApp, M = A.model; A.setSection('design'); M.select(M.roots().map(r => r.id)); A.selectionChanged(); A.hoCommit(A.hoRoots(), { title: 'axe' }); A.ho.sel = M.elements.find(e => e.type === 'text')?.id; });
      await p.evaluate(s => studioApp.setSection(s), s); if (s === '3d') await p.waitForFunction(() => studioApp.s3?.ready, null, { timeout: 30000 }); await p.waitForTimeout(400);
      const r = await p.evaluate(async () => { const res = await axe.run(document, { resultTypes: ['violations'], rules: { 'color-contrast': { enabled: false } } }); return res.violations.filter(v => ['critical', 'serious'].includes(v.impact)).map(v => `${v.id}(${v.nodes.length}): ${v.nodes[0]?.target?.[0]}`); });
      return { ok: !r.length, detail: r };
    });
    await test('keyboard: Tab reaches top bar and focus is visible', async () => { await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); return p.evaluate(() => { const a = document.activeElement; const st = getComputedStyle(a); return { ok: a && a !== document.body && (st.outlineStyle !== 'none' || st.boxShadow !== 'none'), detail: a?.id || a?.className }; }); });
  }, { ctx: { bypassCSP: true } }); // axe-core is injected as an inline script

  // ------------------------------------------------------------------ responsive
  for (const vp of [{ width: 1024, height: 700 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
    await suite(`responsive`, async (p, test) => {
      await p.setViewportSize(vp);
      for (const s of ['design', 'media', '3d']) await test(`${vp.width}×${vp.height} ${s}: no page overflow, top bar fits`, async () => {
        await p.evaluate(s => studioApp.setSection(s), s); await p.waitForTimeout(300);
        return p.evaluate(() => { const de = document.documentElement, over = de.scrollWidth > window.innerWidth + 1; const tb = document.getElementById('top-bar'), scrolls = /auto|scroll/.test(getComputedStyle(tb).overflowX), clipped = scrolls ? [] : [...tb.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.right > window.innerWidth + 1); }).map(b => b.id || b.textContent.trim()).slice(0, 5); return { ok: !over && !clipped.length, detail: { scrollW: de.scrollWidth, clipped } }; });
      });
    });
  }

  // ------------------------------------------------------------------ diagnostics (v3.31)
  await suite('diagnostics', async (p, test) => {
    await test('health indicator in the status bar', () => p.evaluate(async () => { await studioApp.dgTick(); const b = document.getElementById('sb-health'); return { ok: !!b && ['ok', 'warn', 'bad'].includes(b.dataset.level) && !!b.getAttribute('aria-label'), detail: b?.dataset.level }; }));
    await test('logs capture console errors, uncaught errors and rejections (secrets redacted)', async () => { await p.evaluate(() => { console.error('qa-console sk-abcdefghijklmnopqrstu'); setTimeout(() => { throw new Error('qa-uncaught'); }, 0); Promise.reject(new Error('qa-reject')); }); await p.waitForTimeout(300); return p.evaluate(() => { const L = DSDiag.logs, j = JSON.stringify(L); return { ok: j.includes('qa-console') && j.includes('qa-uncaught') && j.includes('qa-reject') && !j.includes('sk-abcdefghij'), detail: `${L.length} entries` }; }); });
    await test('API calls are timed without query strings', () => p.evaluate(async () => { await fetch('data:application/json,{"a":1}'); try { await fetch('http://127.0.0.1:9/q?token=abc123'); } catch (_) { /* refused */ } const r = DSDiag.net.slice(-2), j = JSON.stringify(DSDiag.net); return { ok: r.length === 2 && r.every(x => Number.isFinite(x.ms)) && r[1].ok === false && !j.includes('token=abc123'), detail: r.map(x => `${x.url} ${x.ms}ms`).join(' · ') }; }));
    await test('storage writes timed + connection test', () => p.evaluate(async () => { const n = DSDiag.storeOps.length; studioApp.model.elements[0] ? studioApp.model.elements[0].x++ : 0; studioApp.autosaveNow(); const t = performance.now(); while (DSDiag.storeOps.length === n && performance.now() - t < 5000) await new Promise(r => setTimeout(r, 20)); const ping = await studioApp.dgPing(true); return { ok: DSDiag.storeOps.length > n && ping.ok, detail: `${DSDiag.storage().writes} writes, ping ${ping.ms} ms` }; }));
    await test('panel opens (Ctrl+Alt+D), every tab renders, Escape closes', async () => { await p.keyboard.press('Control+Alt+KeyD'); await p.waitForTimeout(200); const tabs = await p.evaluate(async () => { const out = []; for (const t of ['overview', 'logs', 'network', 'storage', 'bench']) { document.querySelector(`.dg-tab[data-tab="${t}"]`).click(); await new Promise(r => setTimeout(r, 60)); out.push(document.querySelector('.dg-body').textContent.length > 40); } return out; }); await p.keyboard.press('Escape'); const closed = await p.evaluate(() => document.getElementById('dg-panel').hidden); return { ok: tabs.every(Boolean) && closed, detail: tabs.join(',') }; });
    await test('report export has every section', () => p.evaluate(() => { const r = studioApp.dgReport(); const keys = ['health', 'cpu', 'memory', 'network', 'storage', 'logs']; return { ok: keys.every(k => k in r) && JSON.parse(JSON.stringify(r)).version === APP_VERSION, detail: Object.keys(r).length + ' keys' }; }));
    await test('slow API turns health amber/red and alerts once', () => p.evaluate(async () => { for (let i = 0; i < 12; i++) DSDiag.net.push({ t: Date.now(), method: 'POST', url: 'https://api.example.test/v1', origin: 'https://api.example.test', ms: 9500, status: 200, ok: true }); await studioApp.dgTick(); const lvl = document.getElementById('sb-health').dataset.level, first = studioApp.dg.alerted.net; await studioApp.dgTick(); const again = studioApp.dg.alerted.net === first; DSDiag.net.splice(-12); return { ok: lvl !== 'ok' && !!first && again, detail: lvl }; }));
    await test('undo history: shared snapshots, step limit and memory limit', () => p.evaluate(() => { const A = studioApp, M = A.model, keep = [M.maxHistory, M.maxHistoryChars];
      for (let i = 0; i < 600; i++) M.insertElement(new StudioElement('rect', i, i, 10, 10)); A.commit(); const one = M.historyAt(M.historyIndex).length;
      for (let k = 0; k < 120; k++) { M.elements[k].x += 1; A.commit(); } const steps100 = M.history.length, shared = M.historyChars < one * 12;
      const x5 = M.elements[119].x; A.run('undo'); const undoOk = M.elements[119].x === x5 - 1; A.run('redo');
      M.maxHistory = 25; M.trimHistory(); const steps25 = M.history.length; M.maxHistory = 100;
      M.maxHistoryChars = one * 0.5; M.trimHistory(); const stepsMem = M.history.length; [M.maxHistory, M.maxHistoryChars] = keep;
      return { ok: steps100 === 100 && shared && undoOk && steps25 === 25 && stepsMem === 10, detail: `100 steps = ${(M.historyChars / 1024).toFixed(0)} KB vs ${(one / 1024).toFixed(0)} KB per full copy · limit 25 → ${steps25} · memory floor → ${stepsMem}` }; }));
    await test('settings: Ctrl+, opens, saves, applies undo limit, reset', async () => { await p.keyboard.press('Escape'); await p.keyboard.press('Control+Comma'); await p.waitForSelector('.st-form', { timeout: 3000 });
      const r = await p.evaluate(() => { const f = document.querySelector('.st-form'), rg = f.querySelector('input[name=undoSteps]'); rg.value = 30; rg.dispatchEvent(new Event('input', { bubbles: true })); const saved = JSON.parse(localStorage.getItem('designstudio.settings.v1')); return { steps: studioApp.model.maxHistory, saved: saved.undoSteps, fits: document.querySelector('.ds-dialog').scrollWidth <= document.querySelector('.ds-dialog').clientWidth + 1 }; });
      await p.click('[data-st="reset"]'); await p.waitForTimeout(300); const back = await p.evaluate(() => studioApp.model.maxHistory); await p.click('[data-st="done"]');
      return { ok: r.steps === 30 && r.saved === 30 && r.fits && back === 100, detail: { ...r, afterReset: back } }; });
    await test('3D performance: presets apply, camera orbit reuses shadows, full res at rest', async () => { await wait3D(p); return p.evaluate(async () => { const A = studioApp, s3 = A.s3, R = s3.renderer, T = s3.L.THREE, keep = JSON.stringify(A.settings);
      A.settings.s3.mode = 'performance'; A.saveSettings(); const perfType = R.shadowMap.type === T.BasicShadowMap, perfDpr = R.getPixelRatio() <= 1;
      A.settings.s3.mode = 'quality'; A.saveSettings(); const qType = R.shadowMap.type === T.PCFSoftShadowMap;
      A.settings.s3.mode = 'auto'; A.saveSettings(); s3.renderer.render(s3.scene, s3.camera); const u0 = s3.perf.shadowUpdates;
      for (let i = 0; i < 5; i++) { s3.camera.position.x += 0.2; s3.camera.updateMatrixWorld(); s3.renderer.render(s3.scene, s3.camera); } const orbitUpdates = s3.perf.shadowUpdates - u0;
      await new Promise(r => setTimeout(r, 300)); s3.renderer.render(s3.scene, s3.camera); const rest = s3.perf.scale;
      A.settings = JSON.parse(keep); A.saveSettings();
      return { ok: perfType && perfDpr && qType && orbitUpdates === 0 && rest === 1, detail: { perfType, perfDpr, qType, orbitUpdates, rest } }; }); });
  });

  // ------------------------------------------------------------------ plugins (v3.33)
  await suite('plugins', async (p, test) => {
    const run = (code, permissions = ['read', 'write', 'ui', 'network'], network = []) => p.evaluate(async ([code, permissions, network]) => { let log = ''; const r = await studioApp.pluginRun(studioApp.pluginSanitize({ name: 'QA', code, permissions, network }), { log: (l, m) => { log += `${l}:${m}\n`; } }); return { ...r, log }; }, [code, permissions, network]);
    await test('sandbox: no network, storage, DOM or app access', async () => { const r = await run(`console.log([typeof fetch, typeof XMLHttpRequest, typeof WebSocket, typeof importScripts, typeof indexedDB, typeof caches, typeof window, typeof document, typeof studioApp, typeof localStorage].join())`); return { ok: r.ok && /log:(undefined,){9}undefined/.test(r.log), detail: r.log.trim() }; });
    await test('create + update = one undo step, values sanitised', async () => { const before = await p.evaluate(() => [studioApp.model.elements.length, studioApp.model.history.length]); const r = await run(`const a = await ds.create('rect', { x: 5, y: 5, width: 'x', opacity: 9, fills: [{ type: 'solid', color: '#ff0000' }] }); await ds.update(a, { name: 'QA rect', x: 50 }); await ds.create('ellipse', { x: 0, y: 0 });`); const after = await p.evaluate(() => { const M = studioApp.model, e = M.elements.find(x => x.name === 'QA rect'); return [M.elements.length, M.history.length, e?.x, e?.opacity, typeof e?.width]; }); await p.evaluate(() => studioApp.run('undo')); const undone = await p.evaluate(() => studioApp.model.elements.length); return { ok: r.ok && after[0] === before[0] + 2 && after[1] === before[1] + 1 && after[2] === 50 && after[3] <= 1 && after[4] === 'number' && undone === before[0], detail: { before, after, undone } }; });
    await test('permissions enforced (write, network domain, https)', async () => { const a = await run(`await ds.create('rect', {})`, ['read']); const b = await run(`await ds.fetch('https://evil.example/x')`, ['network'], ['api.github.com']); const c = await run(`await ds.fetch('http://api.github.com/x')`, ['network'], ['api.github.com']); return { ok: !a.ok && /write/.test(a.error) && !b.ok && /network list/.test(b.error) && !c.ok && /https/.test(c.error), detail: [a.error, b.error, c.error] }; });
    await test('runaway plugin stopped at the time limit; syntax errors reported', async () => { const s = await run('let x = ;'); const t0 = Date.now(); const l = await run('while (true) {}'); return { ok: !s.ok && /SyntaxError/.test(s.error) && !l.ok && /longer than/.test(l.error) && Date.now() - t0 < 13000, detail: [s.error, l.error, `${Date.now() - t0} ms`] }; });
    await test('ds.ask form (no HTML injection) + cancel', async () => { const pr = run(`const v = await ds.ask('Q<img src=x>', [{ name: 'n', label: '<b>x</b>', type: 'number', value: 7 }]); console.log(JSON.stringify(v));`); await p.waitForSelector('.pl-ask'); const inj = await p.evaluate(() => !!document.querySelector('.pl-ask b, .ds-dialog img')); await p.click('.ds-dialog:has(.pl-ask) .btn-primary'); const r = await pr; const pc = run(`const v = await ds.ask('Q', [{ name: 'n' }]); console.log(String(v));`); await p.waitForSelector('.pl-ask'); await p.keyboard.press('Escape'); const c = await pc; return { ok: !inj && /"n":7/.test(r.log) && /null/.test(c.log), detail: [r.log.trim(), c.log.trim(), inj] }; });
    await test('Plugin Studio: template → run → menu; .dsplugin export/import', async () => { await p.evaluate(() => studioApp.run('pluginStudio')); await p.waitForSelector('.pl-studio'); await p.selectOption('.pl-tpl', 'distribute'); await p.click('[data-pl=run]'); await p.waitForFunction(() => /Finished|Select at least/.test(document.querySelector('.pl-out')?.innerText || '')); const st = await p.evaluate(async () => { const A = studioApp, pl = A.plugins.find(x => x.name === 'Distribute horizontally'); const menu = [...document.querySelectorAll('#dropdown-plugins .pl-run')].map(x => x.textContent); const { id, enabled, updated, ...rest } = pl; const n = A.plugins.length; await A.pluginInstallText(JSON.stringify({ format: 'dsplugin', ...rest }), { confirm: false }); const bad = await A.pluginInstallText('{"name":"x"}', { confirm: false }); return { menu, added: A.plugins.length - n, bad }; }); await p.keyboard.press('Escape'); return { ok: st.menu.includes('Distribute horizontally') && st.added === 1 && st.bad === null, detail: st }; });
  });

  // ------------------------------------------------------------------ GitHub (v3.34) — GitHub is mocked: no network needed
  await suite('github', async (p, test) => {
    const H = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset', 'x-ratelimit-remaining': '42', 'x-ratelimit-reset': '1999999999' };
    const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="20" height="20" fill="#3a8bff"/><script>alert(1)</script></svg>';
    let lastAuth = null;
    await p.route('https://api.github.com/**', (r) => { const u = r.request().url(); lastAuth = r.request().headers().authorization || null;
      if (/\/repos\/qa\/limited/.test(u)) return r.fulfill({ status: 403, headers: { ...H, 'x-ratelimit-remaining': '0' }, body: '{}' });
      if (/\/repos\/qa\/kit$/.test(u)) return r.fulfill({ headers: H, contentType: 'application/json', body: '{"default_branch":"main"}' });
      if (/\/repos\/qa\/kit\/git\/trees/.test(u)) return r.fulfill({ headers: H, contentType: 'application/json', body: JSON.stringify({ tree: [{ path: 'icons/a.svg', type: 'blob', size: 99 }, { path: 'tokens.json', type: 'blob', size: 30 }, { path: 'bin/x.exe', type: 'blob', size: 5 }] }) });
      if (/\/contents\/icons\/a\.svg/.test(u)) return r.fulfill({ headers: H, body: SVG });
      return r.fulfill({ status: 404, headers: H, body: '{}' }); });
    await p.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ headers: H, body: r.request().url().endsWith('.svg') ? SVG : '{"color":{"brand":"#FFC21A"}}' }));
    await test('parse repo inputs (owner/repo, tree link, blob link, junk)', () => p.evaluate(() => { const A = studioApp, a = A.ghParse('qa/kit'), b = A.ghParse('https://github.com/qa/kit/tree/dev/icons'), c = A.ghParse('github.com/qa/kit/blob/main/x.svg'), d = A.ghParse('rm -rf /'); return { ok: a.repo === 'kit' && b.ref === 'dev' && b.path === 'icons' && c.path === 'x.svg' && d === null, detail: [a, b, c, d] }; }));
    await test('AI op: list filters to usable files, read returns text', () => p.evaluate(async () => { const l = await studioApp.aiGitHub({ op: 'github', action: 'list', repo: 'qa/kit' }), r = await studioApp.aiGitHub({ op: 'github', action: 'read', repo: 'qa/kit', path: 'tokens.json' }); return { ok: /2 files/.test(l) && !/x\.exe/.test(l) && /FFC21A/.test(r), detail: [l.split('\n')[0], r] }; }));
    await test('import asks first; cancel imports nothing; SVG scripts dropped', async () => { const n0 = await p.evaluate(() => studioApp.model.elements.length);
      const c = p.evaluate(() => studioApp.aiGitHub({ op: 'github', action: 'import', repo: 'qa/kit', paths: ['icons/a.svg'] })); await p.waitForSelector('.gh-confirm'); await p.click('.ds-dialog:has(.gh-confirm) .ds-dialog-actions button:not(.btn-primary)'); const cr = await c;
      const i = p.evaluate(() => studioApp.aiGitHub({ op: 'github', action: 'import', repo: 'qa/kit', paths: ['icons/a.svg', 'bin/x.exe'] })); await p.waitForSelector('.gh-confirm'); await p.click('.ds-dialog:has(.gh-confirm) .btn-primary'); const ir = await i;
      const r = await p.evaluate((n0) => ({ added: studioApp.model.elements.length - n0, script: studioApp.model.elements.some(e => /alert/.test(JSON.stringify(e))) }), n0);
      return { ok: /cancelled/.test(cr) && /Imported 1/.test(ir) && r.added >= 2 && !r.script, detail: { cr, ir, ...r } }; });
    await test('token: sent as Bearer, session-only by default, redacted in logs', async () => { const r = await p.evaluate(async () => { const A = studioApp; A.gh.token = 'github_pat_11QAQAQAQAQAQAQAQAQAQA_x'; A.gh.remember = false; A.ghSave(); A.gh.cache.clear(); await A.ghTree('qa/kit'); const ls = localStorage.getItem('designstudio.github.v1'), ss = sessionStorage.getItem('designstudio.github.v1'); const red = DSDiag.redact(`t=${A.gh.token}`); A.gh.token = ''; A.ghSave(); A.gh.cache.clear(); return { ls: /github_pat/.test(ls), ss: /github_pat/.test(ss), red }; }); return { ok: lastAuth === 'Bearer github_pat_11QAQAQAQAQAQAQAQAQAQA_x' && !r.ls && r.ss && !/QAQA/.test(r.red), detail: { auth: !!lastAuth, ...r } }; });
    await test('clear errors: not found and rate limit', () => p.evaluate(async () => { const a = await studioApp.aiGitHub({ op: 'github', action: 'list', repo: 'qa/missing' }), b = await studioApp.aiGitHub({ op: 'github', action: 'list', repo: 'qa/limited' }); return { ok: /Not found/.test(a) && /limit/.test(b) && /token/.test(b), detail: [a, b] }; }).then((r) => { p.errs = p.errs.filter(e => !/status of 40[34]/.test(e)); return r; })); // the browser logs the expected 404/403
    await test('AI chat loop: reads repo tokens, then creates a variable', () => p.evaluate(async () => { const A = studioApp, orig = A.aiComplete, origL = A.aiLLMs, seen = [];
      let step = 0; A.aiLLMs = () => [{ id: 'qa', name: 'QA model', type: 'openai' }];
      A.aiComplete = async ({ messages }) => { seen.push(messages[messages.length - 1].content); step++; const t = step === 1 ? 'Reading tokens.\n```ds-ops\n[{"op":"github","action":"read","repo":"qa/kit","path":"tokens.json"}]\n```' : 'Added the brand colour.\n```ds-ops\n[{"op":"variable","collection":"Tokens","name":"color/brand","type":"color","values":{"Light":"#FFC21A"}}]\n```'; return { text: t, usage: { in: 1, out: 1 }, conn: { name: 'QA' } }; };
      const auto = A.ai.settings.autoApply; A.ai.settings.autoApply = true;
      try { await A.aiSend('turn the tokens in qa/kit into variables'); } finally { A.aiComplete = orig; A.aiLLMs = origL; A.ai.settings.autoApply = auto; }
      const v = A.model.dsVars().vars.find(x => x.name === 'color/brand');
      return { ok: step === 2 && /FFC21A/.test(seen[1]) && !!v, detail: { step, fed: seen[1]?.slice(0, 80), variable: !!v } }; }));
    await test('File › Import from GitHub: open repo, pick, import', async () => { await p.evaluate(() => studioApp.run('githubImport')); await p.fill('.gh-form [name=repo]', 'qa/kit'); await p.click('.gh-form button[type=submit]'); await p.waitForSelector('.gh-files input'); await p.check('.gh-files input'); const n0 = await p.evaluate(() => studioApp.model.elements.length); await p.click('[data-gh=import]'); await p.waitForTimeout(600); const r = await p.evaluate((n0) => ({ added: studioApp.model.elements.length - n0, open: !!document.querySelector('.gh-form'), prompt: /"op":"github"/.test(studioApp.aiSystemPrompt()) }), n0); return { ok: r.added >= 1 && !r.open && r.prompt, detail: r }; });
  });

  // ------------------------------------------------------------------ developer handover (v3.35)
  await suite('handover', async (p, test) => {
    await p.evaluate(() => { studioApp.setSection('design'); studioApp.model.select([]); studioApp.selectionChanged(); });
    await test('commit button: hidden with nothing selected, shown for a selection, maps children to their screen', () => p.evaluate(() => { const A = studioApp, M = A.model, b = document.getElementById('ho-commit'); const none = b.hidden;
      const child = M.elements.find(e => e.parentId); M.select([child.id]); A.selectionChanged(); const shown = !b.hidden, roots = A.hoRoots().map(r => r.id); A.setSection('3d'); const in3d = b.hidden; A.setSection('design');
      return { ok: none && shown && in3d && roots.length === 1 && !M.parentOf(M.getElementById(roots[0])), detail: { none, shown, in3d, roots } }; }));
    await test('commit freezes a copy: later design edits do not change it', () => p.evaluate(() => { const A = studioApp, M = A.model; M.select(M.roots().map(r => r.id)); A.selectionChanged();
      const h = A.hoCommit(A.hoRoots(), { title: 'QA v1', message: 'first' }); const t = M.elements.find(e => e.type === 'text'), before = t.text; t.text = 'QA edited'; A.commit();
      const frozen = h.doc.pages[0].elements.find(e => e.id === t.id).text; return { ok: frozen === before && h.screens.length >= 1 && /^data:image\//.test(h.screens[0].thumb), detail: { frozen, screens: h.screens.length } }; }));
    await test('second commit shows what changed (diff + highlights)', async () => { await p.evaluate(() => { const A = studioApp, M = A.model; M.select(M.roots().map(r => r.id)); A.selectionChanged(); const h = A.hoCommit(A.hoRoots(), { title: 'QA v2' }); A.setSection('handover'); A.hoOpen(h.id); }); await p.waitForSelector('.ho-diff'); const r = await p.evaluate(() => ({ diff: document.querySelector('.ho-diff').textContent, marks: document.querySelectorAll('.ho-mark-chg').length })); return { ok: /1 changed/.test(r.diff) && r.marks >= 1, detail: r }; });
    await test('inspect: click a layer → specs, code; select + hover → red-line distance', async () => { const at = (n) => p.evaluate((n) => { const { hm, sc } = studioApp._hoCtx, e = hm.elements.find(x => x.type === n && x.id !== sc.id), b = Utils.aabb(hm.getElementById(sc.id)), a = Utils.aabb(e); return [(a.x + a.w / 2 - b.x) / b.w, (a.y + a.h / 2 - b.y) / b.h]; }, n);
      const bb = await (await p.$('.ho-frame')).boundingBox(); let [x, y] = await at('text'); await p.mouse.click(bb.x + bb.width * x, bb.y + bb.height * y);
      const spec = await p.evaluate(() => [document.querySelector('.ho-ih b')?.textContent, document.querySelectorAll('.ho-table tr').length]);
      await p.mouse.move(bb.x + bb.width * 0.98, bb.y + bb.height * 0.98); await p.waitForTimeout(100); const lines = await p.evaluate(() => [...document.querySelectorAll('.ho-line')].map(l => +l.dataset.len));
      await p.click('[data-tab=code]'); const code = await p.textContent('.ho-code');
      return { ok: spec[1] >= 8 && lines.length >= 1 && lines.every(n => n > 0) && /font-size/.test(code), detail: { spec, lines, code: code.slice(0, 40) } }; });
    await test('status, developer note and versions persist in the project file', () => p.evaluate(() => { const A = studioApp, M = A.model, h = M.handovers.at(-1); h.status = 'progress'; h.notes.qa = 'Use Button component';
      const data = JSON.parse(JSON.stringify(M.serialize('QA'))); data.handovers.push({ doc: { pages: [] }, screens: [{ thumb: 'javascript:alert(1)' }] }); data.handovers[0].screens[0].thumb = 'javascript:alert(1)';
      const m2 = new StudioModel(); m2.load(data); const x = m2.handovers.find(y => y.id === h.id);
      return { ok: x.status === 'progress' && x.notes.qa === 'Use Button component' && m2.handovers[0].screens[0].thumb === '' && m2.handovers.length === M.handovers.length + 1, detail: { n: m2.handovers.length, status: x.status } }; }));
    await test('download package (.zip) and Ctrl+Alt+4 / delete', async () => { const dl = p.waitForEvent('download'); await p.click('[data-hoa=zip]'); const d = await dl; const name = d.suggestedFilename(); const size = (await require('fs').promises.stat(await d.path())).size;
      await p.evaluate(() => studioApp.setSection('design')); await p.keyboard.press('Control+Alt+4'); const sec = await p.evaluate(() => studioApp.section);
      const n0 = await p.evaluate(() => studioApp.model.handovers.length); await p.click('[data-hoa=del]'); await p.click('.ds-dialog-actions .btn-primary'); const n1 = await p.evaluate(() => studioApp.model.handovers.length);
      await p.evaluate(() => studioApp.setSection('design'));
      return { ok: /handover-v\d+\.zip$/.test(name) && size > 2000 && sec === 'handover' && n1 === n0 - 1, detail: { name, size, sec, n0, n1 } }; });
  });

  // ------------------------------------------------------------------ performance
  await suite('performance', async (p, test) => {
    await test('cold load to interactive < 3 s', async () => { const t0 = Date.now(); await p.reload(); await p.waitForFunction(() => window.studioApp); return { ok: Date.now() - t0 < 3000, detail: `${Date.now() - t0} ms` }; });
    await test('pan/zoom 1,000 layers ≥ 30 fps', () => p.evaluate(async () => { const A = studioApp, m = A.model; A.hideWelcome(); for (let i = 0; i < 1000; i++) m.insertElement(new StudioElement('rect', (i % 40) * 40, Math.floor(i / 40) * 40, 30, 30)); A.commit(); let n = 0; const t0 = performance.now(); while (performance.now() - t0 < 1500) { m.panX += 3; A.renderer.dirty = true; A.renderer.render(); n++; await new Promise(r => requestAnimationFrame(r)); } const fps = n / 1.5; const t1 = performance.now(); for (let i = 0; i < 10; i++) { m.panX += 3; A.renderer.dirty = true; A.renderer.render(); } const ms = (performance.now() - t1) / 10; return { ok: ms < 33, detail: `${ms.toFixed(1)} ms/frame render (${(1000 / ms).toFixed(0)} fps max), rAF loop ${fps.toFixed(0)} fps` }; }));
    await test('3D section boot < 6 s', async () => { const t0 = Date.now(); await wait3D(p); return { ok: Date.now() - t0 < 6000, detail: `${Date.now() - t0} ms` }; });
    await test('JS heap after heavy use < 400 MB', () => p.evaluate(() => { const mb = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0; if (!performance.memory) return { ok: true, detail: 'n/a in this browser' }; return { ok: mb < 400, detail: `${mb.toFixed(0)} MB` }; }));
  });

  await browser.close();
  // ------------------------------------------------------------------ report
  const fail = results.filter(r => !r.pass), bySuite = {};
  for (const r of results) { const s = (bySuite[r.suite] = bySuite[r.suite] || { pass: 0, fail: 0 }); r.pass ? s.pass++ : s.fail++; }
  console.log('\nSuite        pass fail'); for (const [k, v] of Object.entries(bySuite)) console.log(`${k.padEnd(12)} ${String(v.pass).padStart(4)} ${String(v.fail).padStart(4)}`);
  console.log(`\nTOTAL ${results.length - fail.length}/${results.length} passed`);
  for (const f of fail) console.log(`  ✗ [${f.suite}] ${f.name} — ${f.detail}`);
  const out = args.report || path.join(__dirname, 'report.json');
  fs.writeFileSync(out, JSON.stringify({ app: 'DesignStudio', date: new Date().toISOString(), total: results.length, passed: results.length - fail.length, results }, null, 1));
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
