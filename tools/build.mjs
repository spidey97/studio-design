#!/usr/bin/env node
/**
 * DesignStudio — release builder.
 *   node tools/build.mjs            → release/DesignStudio-<version>.html — ONE self-contained file (v3.33.0)
 * Concatenates the app scripts in index.html order (minified with terser when it is installed: `npm i -D terser`),
 * inlines the stylesheet and the vendor libraries, and embeds the 3D engine, the MCP bridge, the user guide, the
 * changelog and the licences as non-executing <script type="text/x-ds-file"> blocks (js/core/embedded.js reads them).
 * The security policy keeps script-src strict: every script that may run is allowed by its own SHA-256 hash.
 * The source folder (tests, tools, version history) is never shipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const version = /APP_VERSION\s*=\s*'([^']+)'/.exec(read('js/core/version.js'))[1];
const OUT = path.join(ROOT, 'release', `DesignStudio-${version}`);
const require = createRequire(import.meta.url);
let terser = null;
for (const p of [path.join(ROOT, 'tools/node_modules/terser'), 'terser']) { try { terser = require(p); break; } catch (_) { /* optional */ } }

fs.rmSync(OUT, { recursive: true, force: true });
fs.rmSync(path.join(ROOT, 'release', `DesignStudio-${version}.zip`), { force: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// ---------------------------------------------------------------- scripts
const html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const app = scripts.filter(s => !s.startsWith('js/vendor/'));
const vendor = scripts.filter(s => s.startsWith('js/vendor/'));
let bundle = `/*! DesignStudio ${version} — © ${new Date().getFullYear()} Spideytech. PolyForm Noncommercial 1.0.0. Licences: File › Licences & Notices */\n`;
for (const s of app) bundle += `\n/* ${s} */\n${read(s)}\n`;
if (terser) {
  const r = await terser.minify(bundle, { ecma: 2022, compress: false, mangle: { keep_fnames: true, keep_classnames: true }, keep_fnames: true, keep_classnames: true, format: { comments: /^!/ } });
  bundle = r.code;
}

// ---------------------------------------------------------------- styles
const css = read('css/styles.css').replace(/\/\*(?!!)[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').replace(/\s*([{};,])\s*/g, '$1').replace(/;}/g, '}');

// ---------------------------------------------------------------- one file
// Script text is made safe to sit inside <script>: "</script" and "<!--" are escaped (same meaning in JavaScript).
const safe = (t) => t.replace(/\r\n?/g, '\n').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const hashes = [];
const inline = (code) => { const t = safe(code); hashes.push(`'sha256-${crypto.createHash('sha256').update(t, 'utf8').digest('base64')}'`); return `<script>${t}</script>`; };
const three = safe(read('js/vendor/three-bundle.js')); hashes.push(`'sha256-${crypto.createHash('sha256').update(three, 'utf8').digest('base64')}'`); // run later by DSEmbed.run
const files = {
  'js/vendor/three-bundle.js': three,
  'docs/USER-GUIDE.html': read('docs/USER-GUIDE.html'),
  'THIRD-PARTY-NOTICES.txt': `${read('LICENSE.txt')}\n\n${'='.repeat(72)}\n\n${read('THIRD-PARTY-NOTICES.txt')}`,
  'CHANGELOG.md': read('CHANGELOG.md'),
};
for (const f of fs.readdirSync(path.join(ROOT, 'mcp'))) files[`mcp/${f}`] = read(`mcp/${f}`);
const embedded = Object.entries(files).map(([name, text]) => `<script type="text/x-ds-file" data-name="${name}">${name.endsWith('.js') ? text : safe(text)}</script>`).join('\n');
let page = html.replace(/<link rel="stylesheet" href="css\/styles\.css">/, () => `<style>/*! DesignStudio ${version} */\n${css}</style>`);
const firstApp = new RegExp(`<script src="${app[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`);
page = page.replace(/<script src="js\/[^"]+"><\/script>\n?/g, (m) => (firstApp.test(m) ? `${vendor.map(v => inline(read(v))).join('\n')}\n${inline(bundle)}\n` : '')); // vendor libraries first, then the app
const bodyEnd = page.lastIndexOf('</body>'); page = `${page.slice(0, bodyEnd)}${embedded}\n${page.slice(bodyEnd)}`; // the LAST </body>: app code contains the string too
page = page.replace(/script-src 'self'/, () => `script-src ${hashes.join(' ')}`);
if (!/script-src 'sha256-/.test(page)) throw new Error('CSP script-src was not rewritten');
const single = `${OUT}.html`;
fs.writeFileSync(single, page);
const size = (p) => `${(fs.statSync(p).size / 1048576).toFixed(2)} MB`;
console.log(`DesignStudio ${version} → ${path.relative(ROOT, single)}  (one file, ${size(single)}${terser ? ', minified' : ', not minified — npm i -D terser'}; ${hashes.length} script hashes)`);
