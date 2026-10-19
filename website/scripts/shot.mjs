#!/usr/bin/env node
// Screenshot harness. Serves a built dir, opens it with ?shots (deterministic: scrubs jump,
// punches finish instantly, no idle loops), scrolls in N even steps per viewport and saves PNGs.
// Fails (exit 1) on any console error, page error, failed request or HTTP >= 400.
//
//   node scripts/shot.mjs [--dist dist] [--out shots] [--steps 14] [--widths 1440x900,390x844]
//                         [--scene <id>] [--selector <css>] [--reduced] [--wait 700] [--path /]
//                         [--from 0] [--to 1] [--tag name]
//
//   --scene <id>   only the scroll window of #scene-<id>: from its top at the 60% line (lead-in) to its
//                  bottom at the 60% line (pin spacer included), i.e. while it owns the thread head
//   --selector css after the steps, scroll that element into view and save an element screenshot
//   --from/--to    fractions of the page (or of the scene with --scene) to cover
//   --reduced      emulate prefers-reduced-motion: reduce
//   --nojs         disable JavaScript (checks the no-JS fallback renders every scene)
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './lib/static-server.mjs';
import { launchBrowser } from './lib/browser.mjs';

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}

const a = args(process.argv.slice(2));
const dist = path.resolve(a.dist || 'dist');
const out = path.resolve(a.out || 'shots');
const steps = Math.max(1, parseInt(a.steps || '14', 10));
const wait = Math.max(0, parseInt(a.wait || '700', 10));
const reduced = !!a.reduced;
const nojs = !!a.nojs;
const scene = typeof a.scene === 'string' ? a.scene : null;
const selector = typeof a.selector === 'string' ? a.selector : null;
const urlPath = typeof a.path === 'string' ? a.path : '/';
const from = a.from !== undefined ? parseFloat(a.from) : 0;
const to = a.to !== undefined ? parseFloat(a.to) : 1;
const viewports = String(a.widths || '1440x900,390x844')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [w, h] = s.split('x').map((n) => parseInt(n, 10));
    return { width: w, height: h || Math.round(w * (w < 768 ? 2.16 : 0.625)) };
  });

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error(`shot: ${dist}/index.html not found. Build first (npm run build).`);
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });

const problems = [];

/**
 * Story invariants checked in the page after every motion step (regressions the eye has caught before).
 * Runs in the browser; returns a list of problems.
 */
function invariants() {
  const out = [];
  const ST = window.__site?.ScrollTrigger;
  if (!ST) return out;
  const shown = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.01;
  };
  const stage = document.querySelector('#scene-the-drive .stage');
  const pin = stage && ST.getAll().find((t) => t.pin === stage);
  if (pin && pin.isActive) {
    const p = pin.animation ? pin.animation.progress() : pin.progress;
    // 03's copy only after the 'close' label, PARKED only from 'parked' (read from the timeline, which
    // runs 0..1, so the checks follow any retiming of the drive)
    const labels = pin.animation?.labels || {};
    const close = labels.close ?? 0.55;
    const parked = labels.parked ?? 0.96;
    if (p < close - 0.05 && shown(document.querySelector('#scene-the-drive .sd-copy'))) out.push(`03 copy visible at drive progress ${p.toFixed(2)}`);
    if (p < parked - 0.06 && shown(document.querySelector('#scene-the-drive .sd-parked__w'))) out.push(`PARKED visible at drive progress ${p.toFixed(2)}`);
  }
  return out;
}

let server;
let browser;
let cleaning = false;

async function cleanup() {
  if (cleaning) return;
  cleaning = true;
  try {
    await browser?.close();
  } catch {}
  try {
    await server?.close();
  } catch {}
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await cleanup();
    process.exit(130);
  });
}

try {
  server = await serve(dist);
  browser = await launchBrowser();
  const saved = [];
  for (const vp of viewports) {
    const mobile = vp.width < 768;
    const context = await browser.newContext({
      viewport: vp,
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      reducedMotion: reduced ? 'reduce' : 'no-preference',
      colorScheme: 'dark',
      javaScriptEnabled: !nojs,
    });
    const page = await context.newPage();
    const tagVp = `${vp.width}x${vp.height}`;
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`[${tagVp}] console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`[${tagVp}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => problems.push(`[${tagVp}] request failed: ${r.url()} (${r.failure()?.errorText})`));
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`[${tagVp}] HTTP ${r.status()}: ${r.url()}`);
    });

    await page.goto(`${server.url}${urlPath}${urlPath.includes('?') ? '&' : '?'}shots`, { waitUntil: 'load' });
    const hasApp = await page.evaluate(() => !!document.querySelector('script[type="module"]'));
    if (!nojs && hasApp) {
      try {
        await page.waitForFunction(() => window.__siteReady === true, null, { timeout: 20000 });
      } catch {
        problems.push(`[${tagVp}] timed out waiting for window.__siteReady`);
      }
    }
    await page.waitForTimeout(250);

    const range = await page.evaluate((sceneId) => {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (!sceneId) return { a: 0, b: max, max, found: true };
      const el = document.getElementById(`scene-${sceneId}`);
      if (!el) return { found: false };
      // The window in which this scene owns the thread head: from its top reaching the 60% line
      // (lead-in starts) to its bottom reaching the 60% line (the next scene takes over).
      const vh = window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const a = Math.max(0, top - 0.4 * vh);
      const b = Math.max(a, top + el.offsetHeight - 0.6 * vh);
      return { a: Math.min(a, max), b: Math.min(b, max), max, found: true };
    }, scene);
    if (!range.found) {
      problems.push(`[${tagVp}] #scene-${scene} not found`);
      await context.close();
      continue;
    }
    const y0 = range.a + (range.b - range.a) * from;
    const y1 = range.a + (range.b - range.a) * to;
    const base = [tagVp, reduced && 'reduced', nojs && 'nojs', scene, a.tag].filter(Boolean).join('-');
    for (let i = 0; i < steps; i++) {
      const y = Math.round(steps === 1 ? y0 : y0 + ((y1 - y0) * i) / (steps - 1));
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(wait);
      const file = path.join(out, `${base}-${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: file });
      saved.push(`${path.relative(process.cwd(), file)}  (y=${y})`);
      if (!nojs && !reduced) {
        const bad = await page.evaluate(invariants);
        for (const b of bad) problems.push(`[${tagVp}] y=${y}: ${b}`);
      }
    }
    if (selector) {
      const el = await page.$(selector);
      if (!el) problems.push(`[${tagVp}] selector not found: ${selector}`);
      else {
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(wait);
        const file = path.join(out, `${base}-selector.png`);
        await el.screenshot({ path: file });
        saved.push(path.relative(process.cwd(), file));
      }
    }
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (hscroll > 0) problems.push(`[${tagVp}] horizontal overflow: ${hscroll}px`);
    await context.close();
  }
  console.log(saved.map((s) => `  ${s}`).join('\n'));
} catch (e) {
  problems.push(`harness: ${e.stack || e.message}`);
} finally {
  await cleanup();
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nshot: no console errors, page errors or failed requests.');
}
