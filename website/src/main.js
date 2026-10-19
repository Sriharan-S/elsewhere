// Boot: native scroll + ScrollTrigger (scrubs smooth it), shared HUD/thread/traveler, then every scene
// module in document order. Scene modules live in src/scenes/<id>.js and export init(ctx).
import './styles/index.css';
import { gsap, ScrollTrigger, SplitText, DrawSVGPlugin } from './lib/gsap.js';
import { env, isMobile, isPhone } from './lib/env.js';
import * as thread from './lib/thread.js';
import { traveler } from './lib/traveler.js';
import { hud } from './lib/hud.js';
import * as fx from './lib/fx.js';
import { pinTimeline, scrubTimeline, scrub, snap, applyFinals, flushLazy } from './lib/pin.js';
import * as world from './lib/world.js';
import { phone } from './lib/phone.js';
import { seams } from './lib/seams.js';
import * as loop from './lib/loop.js';
import * as tokens from './styles/tokens.js';
import config from './config.js';
import { modules } from './scene-modules.js';

window.__booted = true;


const waits = [];
const shared = Object.create(null);
const sharedWaiters = Object.create(null);

/** Cross-scene registry (e.g. the-drive publishes its timeline for still-driving). */
const share = {
  set(key, value) {
    shared[key] = value;
    (sharedWaiters[key] || []).forEach((r) => r(value));
    delete sharedWaiters[key];
    return value;
  },
  get: (key) => shared[key],
  /** Resolves when another scene calls share.set(key). */
  wait: (key) =>
    key in shared ? Promise.resolve(shared[key]) : new Promise((r) => (sharedWaiters[key] ||= []).push(r)),
};

function setupScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/** gsap.matchMedia with the house conditions: { desktop, mobile, reduce } handlers. */
function media(handlers) {
  const mm = gsap.matchMedia();
  for (const k of ['desktop', 'mobile', 'reduce']) {
    if (handlers[k]) mm.add(tokens.MQ[k], handlers[k]);
  }
  return mm;
}

function chrome() {
  // scroll progress hairline
  const fill = document.querySelector('.progress__fill');
  if (fill) {
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (s) => fill.style.setProperty('--p', s.progress.toFixed(4)),
    });
  }
  // The top bar turns solid ink once the hero's exit pin has finished (the next scene's top reaches
  // the viewport bottom), so copy scrolling past never runs under the brand or the HUD.
  const bar = document.querySelector('[data-topbar]');
  const after = document.querySelector('#scene-hero + .scene');
  if (bar && after) {
    ScrollTrigger.create({
      trigger: after,
      start: 'top bottom',
      onEnter: () => bar.classList.add('is-solid'),
      onLeaveBack: () => bar.classList.remove('is-solid'),
      onRefresh: (self) => bar.classList.toggle('is-solid', self.progress > 0 || self.scroll() > self.start),
    });
  }
  // "03 / 09" in the top bar follows the scene under the middle of the viewport. Scene 03 runs merged
  // into the drive's pinned stage (its own section is empty), so the drive section reads 03 from 'close'.
  const idx = document.querySelector('[data-folio-index]');
  if (idx) {
    const folioOf = (s, n) => {
      const drive = s.id === 'scene-the-drive' ? share.get('drive') : null;
      if (!drive || drive.reduced || !drive.tl) return n;
      return drive.tl.progress() >= (drive.labels?.close ?? 0.55) ? '03' : n;
    };
    document.querySelectorAll('.scene').forEach((s) => {
      const n = s.dataset.folio || (s.id === 'scene-hero' ? '00' : null);
      if (!n) return;
      const set = () => {
        const v = folioOf(s, n);
        if (idx.textContent !== v) idx.textContent = v;
      };
      ScrollTrigger.create({
        trigger: s,
        start: 'top 60%',
        end: 'bottom 60%',
        onToggle: (self) => self.isActive && set(),
        onUpdate: s.id === 'scene-the-drive' ? (self) => self.isActive && set() : undefined,
      });
    });
  }
  // Each stage owns its HUD: it shows once that stage's top crosses the same 60% line.
  document.querySelectorAll('main > .scene .stage').forEach((stage) => {
    if (!stage.querySelector(':scope > .hud')) return;
    ScrollTrigger.create({
      trigger: stage,
      start: 'top 60%',
      onEnter: () => stage.classList.add('is-live'),
      onLeaveBack: () => stage.classList.remove('is-live'),
      onRefresh: (self) => stage.classList.toggle('is-live', self.progress > 0 || self.scroll() >= self.start),
    });
  });
  // the sign-off: the HUD lands on Null Island at the footer
  const footer = document.getElementById('footer');
  if (footer && !env.reduced) {
    ScrollTrigger.create({
      trigger: footer,
      start: 'top 92%',
      onEnter: () => hud.set({ lat: 0, lng: 0, extra: 'NULL ISLAND', mock: false }),
      onLeaveBack: () => hud.set({ ...tokens.places[0], extra: 'ACC 3 M', mock: true }),
    });
  }
}

/**
 * Keep the reader's place across a resize or rotation. Crossing a breakpoint reverts and rebuilds the
 * matchMedia contexts, which tears the pin spacers down for a moment: the document collapses, the
 * browser clamps the scroll, and the reader lands scenes earlier. The resize event fires before the media
 * query handlers, so it records which section sits under the 60% line and how far through it (pin spacer
 * included); after the next refresh the same point of the same section goes back under that line.
 */
function keepPlace() {
  let anchor = null;
  let at = 0;
  const HOLD = 3000; // ms after the last resize during which refreshes put the reader back
  const capture = () => {
    const line = 0.6 * window.innerHeight;
    for (const el of document.querySelectorAll('main > .scene, #footer')) {
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.top <= line && r.bottom > line) return { el, frac: (line - r.top) / r.height };
    }
    return null;
  };
  window.addEventListener(
    'resize',
    () => {
      if (!anchor || performance.now() - at > HOLD) anchor = capture();
      at = performance.now();
    },
    { passive: true },
  );
  // the reader scrolling on their own ends it
  for (const t of ['wheel', 'touchmove', 'keydown', 'pointerdown']) {
    window.addEventListener(t, () => (anchor = null), { passive: true });
  }
  // a breakpoint change runs a few refreshes in a row (one per media query, then the resize debounce),
  // and each may move the page under the reader: put them back after every one of them
  ScrollTrigger.addEventListener('refresh', () => {
    if (!anchor || performance.now() - at > HOLD) return;
    const r = anchor.el.getBoundingClientRect();
    const y = Math.max(0, Math.round(window.scrollY + r.top + anchor.frac * r.height - 0.6 * window.innerHeight));
    if (Math.abs(y - window.scrollY) > 2) {
      window.scrollTo(0, y);
      ScrollTrigger.update();
    }
  });
}

async function boot() {
  setupScroll();
  traveler.mount();
  hud.mount();

  // Fonts first: splits, fits and line breaks must use the real metrics.
  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
  const fontsLate = document.fonts.status !== 'loaded';
  // Paint the static page (map, outline wordmark, copy) before building any scene: the first paint never
  // waits for the scene inits.
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  const base = {
    // libraries
    gsap,
    ScrollTrigger,
    SplitText,
    DrawSVGPlugin,
    lenis: null,
    // flags
    reduced: env.reduced,
    env,
    isMobile,
    isPhone,
    // design system
    config,
    tokens,
    MQ: tokens.MQ,
    // shared systems
    thread,
    traveler,
    hud,
    fx,
    world,
    phone,
    pinTimeline,
    scrubTimeline,
    scrub,
    snap,
    media,
    /** Gated per-frame work: loop.add(fn) runs fn each frame only while the page moves (see lib/loop.js). */
    loop,
    shared: share,
    /** Register a promise the screenshot harness should wait for (e.g. an intro timeline). */
    ready: (p) => waits.push(p),
  };

  const timings = [];
  const mark = (k, t0) => timings.push([k, Math.round(performance.now() - t0)]);
  const sections = [...document.querySelectorAll('main > .scene[id^="scene-"]')];
  for (const root of sections) {
    const id = root.id.slice('scene-'.length);
    const mod = modules[`./scenes/${id}.js`];
    if (!mod || typeof mod.init !== 'function') continue;
    const t0 = performance.now();
    try {
      const r = mod.init({ ...base, root, id, stage: root.querySelector('.stage') });
      if (r && typeof r.then === 'function') await r;
    } catch (err) {
      console.error(`[scene:${id}] init failed`, err);
    }
    // start states now, so the next scene's ScrollTriggers (which refresh this one's) cannot revert them
    flushLazy();
    mark(id, t0);
  }

  let t0 = performance.now();
  chrome();
  keepPlace();
  seams();
  applyFinals();
  ScrollTrigger.sort();
  mark('chrome+seams', t0);
  // The full measure runs as its own task, after a paint: a pinned trigger has already queued a refresh
  // for the next frame (ScrollTrigger does that on every pin), so only refresh here if none ran.
  let refreshed = false;
  const onRefresh = () => (refreshed = true);
  ScrollTrigger.addEventListener('refresh', onRefresh);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  ScrollTrigger.removeEventListener('refresh', onRefresh);
  t0 = performance.now();
  if (!refreshed) ScrollTrigger.refresh();
  mark('refresh', t0);
  if (env.debug || env.shots) window.__bootTimings = timings;
  if (env.debug) console.info('[boot] ms', JSON.stringify(timings));
  // Slow fonts (after the 2.5s race): re-measure fits, pins and thread geometry with the real metrics.
  if (fontsLate) document.fonts.ready.then(() => ScrollTrigger.refresh());

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => location.reload());

  await Promise.allSettled(waits);
  window.__siteReady = true;
  document.documentElement.dataset.ready = '1';
}

boot().catch((err) => {
  console.error('[boot] failed', err);
  document.documentElement.classList.remove('motion');
  window.__siteReady = true;
});

if (import.meta.env.DEV || env.debug || env.shots) window.__site = { gsap, ScrollTrigger, thread, traveler, hud, env };
