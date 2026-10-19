#!/usr/bin/env node
// Fails the build when the shipped JavaScript outgrows its budget (gzip, default level, like Vite reports).
//   npm run check:size
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from './lib/site.mjs';

const BUDGET_KB = 115; // kB (1000 bytes), gzip, all JS in dist/assets together
const dir = path.join(ROOT, 'dist', 'assets');
if (!fs.existsSync(dir)) {
  console.error('check:size: dist/assets not found. Build first.');
  process.exit(2);
}
let total = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const gz = zlib.gzipSync(fs.readFileSync(path.join(dir, f))).length;
  total += gz;
  console.log(`check:size: ${f} ${(gz / 1000).toFixed(2)} kB gzip`);
}
const kb = total / 1000;
if (kb > BUDGET_KB) {
  console.error(`check:size: ${kb.toFixed(2)} kB gzip of JS is over the ${BUDGET_KB} kB budget.`);
  process.exit(1);
}
console.log(`check:size: ok (${kb.toFixed(2)} kB of ${BUDGET_KB} kB)`);
