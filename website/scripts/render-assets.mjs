#!/usr/bin/env node
// Renders the favicon set and the Open Graph image from the shared logo component and
// scripts/templates/og.html, via playwright-core + an installed Edge/Chrome.
//   node scripts/render-assets.mjs [--force]
// Writes to public/: favicon.svg, favicon-32.png, apple-touch-icon.png (180), icon-192.png,
// icon-512.png and og.png (1200x630). The cache key lives in .tmp/assets-stamp (skips work when nothing
// changed), outside public/, so it is never copied into dist/ or uploaded.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, loadConfig, expandHtml } from './lib/site.mjs';

const PUB = path.join(ROOT, 'public');
const STAMP = path.join(ROOT, '.tmp', 'assets-stamp');
const OUTPUTS = ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og.png'];
const FONT_DISPLAY = path.join(ROOT, 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2');
const FONT_MONO = path.join(ROOT, 'node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2');

function inputsHash(cfg) {
  const h = crypto.createHash('sha256');
  const { year, ...stable } = cfg;
  h.update(JSON.stringify(stable));
  for (const f of [
    'scripts/templates/og.html',
    'src/components/logo.js',
    'src/partials/sprites.html',
    'scripts/render-assets.mjs',
  ]) {
    h.update(fs.readFileSync(path.join(ROOT, f)));
  }
  return h.digest('hex').slice(0, 16);
}

export async function renderAssets({ force = false, log = console.log } = {}) {
  const cfg = loadConfig();
  const hash = inputsHash(cfg);
  const fresh =
    !force &&
    fs.existsSync(STAMP) &&
    fs.readFileSync(STAMP, 'utf8').trim() === hash &&
    OUTPUTS.every((f) => fs.existsSync(path.join(PUB, f)));
  if (fresh) return 'fresh';

  const { faviconSVG } = await import(pathToFileURL(path.join(ROOT, 'src/components/logo.js')).href);
  const { launchBrowser } = await import('./lib/browser.mjs');
  fs.mkdirSync(PUB, { recursive: true });
  const svg = faviconSVG();
  fs.writeFileSync(path.join(PUB, 'favicon.svg'), svg);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const [file, size] of [
      ['favicon-32.png', 32],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<html><body style="margin:0;background:#0B0B0A">${svg.replace(/^<\?xml[^>]*>\s*/, '').replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
      );
      await page.screenshot({ path: path.join(PUB, file), clip: { x: 0, y: 0, width: size, height: size } });
    }

    const tpl = fs.readFileSync(path.join(ROOT, 'scripts/templates/og.html'), 'utf8');
    const font = (p) => `data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}`;
    const html = await expandHtml(tpl, {
      cfg,
      file: 'og.html',
      extra: { font_display_data: font(FONT_DISPLAY), font_mono_data: font(FONT_MONO) },
    });
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(PUB, 'og.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  } finally {
    await browser.close();
  }
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, hash + '\n');
  log(`assets: rendered ${OUTPUTS.join(', ')}`);
  return 'rendered';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  renderAssets({ force: process.argv.includes('--force') }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
