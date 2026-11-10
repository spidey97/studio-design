#!/usr/bin/env node
/**
 * DesignStudio: pre-publish safety check. Run before every push to GitHub:
 *   node tools/check-publish.mjs
 * It checks exactly the files git would publish (tracked + new, minus .gitignore) for:
 *   secrets (API keys, tokens, private keys, .env files) · private folders · personal paths · email addresses
 *   files over 5 MB (warning) / 50 MB (blocked; GitHub refuses files over 100 MB)
 * Exit code 1 = do not push. No dependencies, no network.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let root;
try { root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
catch (e) { console.error('This folder is not a git repository yet. Run `git init` here first (or clone the repo), then run this check again.'); process.exit(2); }
const files = execSync('git ls-files --cached --others --exclude-standard -z', { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);

const SECRETS = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/],
  ['Slack token', /xox[abpr]-[0-9A-Za-z-]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const BLOCKED_PATHS = [/^\.env(\.|$)/, /(^|\/)\.env(\.|$)/, /\.(pem|key|p12|pfx)$/i, /^(_versions|_backup|Final|projects|release|assets)\//, /(^|\/)node_modules\//, /^docs\/designs\//];
const PERSONAL = /([A-Z]:\\(Users|Claude)\\|\/Users\/[a-z]|\/home\/claude|\/mnt\/user-data|Office-lap-files)/;
const EMAIL = /[A-Za-z0-9._%+-]+@(?:gmail|yahoo|outlook|hotmail|icloud|proton(?:mail)?)\.(?:com|me)/i;
const ALLOW = [/noreply@/i, /example\./i];

const errors = [], warnings = [];
const SELF = 'tools/check-publish.mjs'; // its own patterns would match
for (const f of files) {
  if (f === SELF) continue;
  if (BLOCKED_PATHS.some(r => r.test(f))) { errors.push(`${f}: private or build file; it should be in .gitignore`); continue; }
  const full = path.join(root, f);
  let st; try { st = fs.statSync(full); } catch { continue; }
  const mb = st.size / 1048576;
  if (mb > 50) errors.push(`${f}: ${mb.toFixed(1)} MB (over 50 MB; attach it to a Release instead)`);
  else if (mb > 5) warnings.push(`${f}: ${mb.toFixed(1)} MB (large)`);
  if (st.size > 20 * 1048576 || /\.(png|jpe?g|webp|gif|ico|pdf|woff2?|mp4)$/i.test(f)) continue;
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const at = `${f}:${i + 1}`;
    for (const [name, re] of SECRETS) if (re.test(line)) errors.push(`${at}: looks like a secret (${name})`);
    if (PERSONAL.test(line)) warnings.push(`${at}: personal file path (${line.match(PERSONAL)[0]})`);
    const m = line.match(EMAIL); if (m && !ALLOW.some(r => r.test(m[0]))) warnings.push(`${at}: personal email address (${m[0]})`);
  });
}
console.log(`Checked ${files.length} files that would be published.`);
warnings.forEach(w => console.log(`  ⚠ ${w}`));
errors.forEach(e => console.log(`  ✗ ${e}`));
if (errors.length) { console.log(`\n${errors.length} problem(s): fix them before pushing.`); process.exit(1); }
console.log(warnings.length ? '\nNo blocking problems. Review the warnings above.' : '\nAll clear: safe to push.');
