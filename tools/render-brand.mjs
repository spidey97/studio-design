// Renders brand/applications/src/*.html to brand/applications/png/*.png and, with --pdf, docs/BRAND.html to
// docs/DesignStudio-Brand-Book.pdf (Playwright). node tools/render-brand.mjs [--pdf]
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path'; import url from 'url';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url))); const SRC = path.join(ROOT, 'brand/applications/src'), OUT = path.join(ROOT, 'brand/applications/png');
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
for (const f of fs.readdirSync(SRC).filter(f => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(SRC, f), 'utf8'); const [w, h] = html.match(/data-size="(\d+)x(\d+)"/).slice(1).map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: f === 'email-logo.html' ? 2 : 1 });
  await p.goto(url.pathToFileURL(path.join(SRC, f)).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, f.replace('.html', '.png')), omitBackground: html.includes('data-transparent') }); await p.close();
}
if (process.argv.includes('--pdf')) {
  const p = await b.newPage(); await p.goto(url.pathToFileURL(path.join(ROOT, 'docs/BRAND.html')).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.pdf({ path: path.join(ROOT, 'docs/DesignStudio-Brand-Book.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  console.log('pdf written');
}
await b.close(); console.log('rendered', fs.readdirSync(OUT).join(', '));
