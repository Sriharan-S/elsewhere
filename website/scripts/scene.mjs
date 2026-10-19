#!/usr/bin/env node
// Build the whole site into a private outDir and shoot one scene. Safe to run in parallel
// with other scene builders (each id gets its own .tmp/<id>/).
//
//   node scripts/scene.mjs <id> [--steps 8] [--widths 1440x900,390x844] [--reduced] [--nojs]
//                               [--from 0] [--to 1] [--wait 700] [--full] [--no-build]
//
//   --full      shoot the whole page instead of just #scene-<id>
//   --no-build  reuse .tmp/<id>/dist from the previous run
// Output: .tmp/<id>/dist (build), .tmp/<id>/shots/*.png. Exit code 1 on any console/page error.
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const id = argv.find((a) => !a.startsWith('--') && !/^\d/.test(a));
if (!id) {
  console.error('usage: node scripts/scene.mjs <scene-id> [--steps 8] [--widths ...] [--reduced] [--nojs] [--full]');
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'src/scenes', `${id}.html`))) {
  console.warn(`scene: src/scenes/${id}.html does not exist (the section will render empty)`);
}
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const tmp = path.join(ROOT, '.tmp', id);
const dist = path.join(tmp, 'dist');
const shots = path.join(tmp, 'shots');

if (!has('--no-build')) {
  const sync = spawnSync(process.execPath, [path.join(ROOT, 'scripts/sync-config.mjs')], { cwd: ROOT, stdio: 'inherit' });
  if (sync.status) process.exit(sync.status);
  const { build } = await import('vite');
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.js'),
    logLevel: 'warn',
    build: { outDir: dist, emptyOutDir: true, reportCompressedSize: false },
  });
}

fs.rmSync(shots, { recursive: true, force: true });
const pass = [];
for (const f of ['--steps', '--widths', '--from', '--to', '--wait']) {
  const v = val(f);
  if (v !== undefined) pass.push(f, v);
}
for (const f of ['--reduced', '--nojs']) if (has(f)) pass.push(f);
if (!has('--full')) pass.push('--scene', id);
if (!val('--steps')) pass.push('--steps', '8');

const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/shot.mjs'), '--dist', dist, '--out', shots, ...pass], {
  cwd: ROOT,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
