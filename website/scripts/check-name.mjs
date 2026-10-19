#!/usr/bin/env node
// Guards the one-file rename: the product name may only appear in site.config.json.
// Fails if the configured name is hard-coded in sources, or if dist/ has unreplaced {{tokens}}.
//   npm run check:name
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from './lib/site.mjs';

const cfg = loadConfig();
const SOURCES = ['index.html', 'src', 'public', 'scripts/templates'];
const SKIP = new Set(['site.webmanifest', '.assets-stamp']); // generated from the config
const TEXT = /\.(html|js|mjs|css|json|txt|md|svg|webmanifest)$|^_headers$/;

const walk = (p) =>
  fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((f) => walk(path.join(p, f))) : [p];

const nameRe = new RegExp(`\\b${cfg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
const bad = [];
for (const s of SOURCES) {
  const p = path.join(ROOT, s);
  if (!fs.existsSync(p)) continue;
  for (const f of walk(p)) {
    const base = path.basename(f);
    if (SKIP.has(base) || !TEXT.test(base)) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (nameRe.test(line)) bad.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
}

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  for (const f of walk(dist)) {
    if (!/\.(html|_headers)$|_headers$/.test(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    const m = t.match(/\{\{\s*[a-z_]+[^}]*\}\}/i);
    if (m) bad.push(`${path.relative(ROOT, f)}: unreplaced token ${m[0]}`);
  }
}

if (bad.length) {
  console.error(`check:name: "${cfg.name}" must only live in site.config.json. Use {{name}} / config.name:\n  ` + bad.join('\n  '));
  process.exit(1);
}
console.log(`check:name: ok ("${cfg.name}" only in site.config.json)`);
