// HERO: the mark draws itself, the fix lands, the name rises; scrolling stretches the name,
// slides the fix out of the pin along the route, and the thread runs off the bottom edge.
import './hero.css';
import { PIN_CENTER, ROUTE_UNDER_TIP, ROUTE_POINTS, ROUTE_END } from '../components/logo.js';

// Pan offsets (map units) for each teleport city. Index 0 = Chennai = the authored window.
const OFFSETS = [
  [0, 0],
  [340, -230],
  [-380, 210],
  [190, 250],
];

// The fix's path out of the pin: centre -> straight down through the tip -> along the route's last legs.
const DOT_PATH = [PIN_CENTER, ROUTE_UNDER_TIP, ROUTE_POINTS[4], ROUTE_END];

function polyAt(pts, u) {
  const segs = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, u)) * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, d / segs[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, traveler, hud, fx, tokens } = ctx;
  const stage = root.querySelector('.stage');
  const copy = root.querySelector('.hero__copy');
  const mark = root.querySelector('.hero__mark');
  const pinG = mark.querySelector('.logo__pin');
  const routeG = mark.querySelector('.logo__route');
  const pinPath = mark.querySelector('.logo__pin-path');
  const routeReveal = mark.querySelector('.logo__route-reveal');
  const name = root.querySelector('#hero-title');
  const nameText = name.querySelector('.hero__name-text');
  const measure = root.querySelector('.hero__measure');
  const lines = root.querySelector('.hero__lines');
  const formerly = root.querySelector('.hero__formerly');
  const actions = root.querySelector('.hero__actions');
  const worldSvg = root.querySelector('.hero__world');
  const pan = root.querySelector('.hero__pan');
  const brand = document.querySelector('.topbar__brand');
  const brandMark = document.querySelector('.topbar__mark');
  const topDl = document.querySelector('.topbar__dl');

  // ------------------------------------------------------------ name auto-fit
  const fitName = () =>
    fx.fit(name, {
      measure,
      width: () => {
        const cs = getComputedStyle(copy);
        const inner = copy.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return ctx.isMobile() ? inner : inner + parseFloat(cs.paddingRight) * 0.5;
      },
      max: () => Math.max(80, stage.clientHeight * (ctx.isMobile() ? 0.2 : 0.4)),
    });
  fitName();
  ScrollTrigger.addEventListener('refreshInit', fitName);

  // ------------------------------------------------------------ logo <-> screen mapping
  const toScreen = (x, y) => {
    const m = mark.getScreenCTM();
    return m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x: -99, y: -99 };
  };
  const toStage = (x, y) => {
    const p = toScreen(x, y);
    const r = stage.getBoundingClientRect();
    return [(p.x - r.left) / r.width, (p.y - r.top) / r.height];
  };
  const unitPx = () => mark.getScreenCTM()?.a || 1;

  // ------------------------------------------------------------ the thread: out of the mark, off the bottom
  const tout = parseFloat(root.dataset.threadOut || '0.62');
  const seg = thread.segment(root, {
    holdAtStart: true,
    radius: 44,
    points: (W, H) => {
      const [ex, ey] = toStage(...ROUTE_END);
      // continue the route's last leg (slope 32/56) until x = out, then run straight down
      const slope = (ROUTE_END[1] - ROUTE_POINTS[4][1]) / (ROUTE_END[0] - ROUTE_POINTS[4][0]);
      const dx = (tout - ex) * W;
      const cy = Math.min(0.88, ey + (Math.abs(dx) * slope) / H);
      return [
        [ex, ey],
        [tout, cy],
        [tout, 1],
      ];
    },
  });

  if (env.reduced) {
    seg.progress = 1;
    if (brand) brand.style.opacity = '';
    // one orange button at a time here too: the top bar's Download appears (no motion, a plain switch)
    // once the hero's own CTA has scrolled out of view
    const heroDl = actions?.querySelector('[data-download]');
    if (topDl && heroDl) {
      const set = (on) => topDl.classList.toggle('is-in', on);
      ScrollTrigger.create({
        trigger: heroDl,
        start: () => `bottom ${parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64}px`,
        onEnter: () => set(true),
        onLeaveBack: () => set(false),
        onRefresh: (self) => set(self.progress > 0 || self.scroll() >= self.start),
      });
    }
    return;
  }

  // ------------------------------------------------------------ the fix (the traveler starts here)
  const dot = { u: 0 };
  const fixScale = () => {
    const s = (34 * unitPx()) / 16; // the static fix is r=17 logo units; the traveler is 16px
    return Math.max(1, Math.min(2.4, s));
  };
  traveler.follow(() => {
    if (dot.u >= 1) return null; // on the thread now: auto mode follows its head
    const [x, y] = polyAt(DOT_PATH, dot.u);
    return toScreen(x, y);
  });

  // ------------------------------------------------------------ start states
  hud.blank();
  const split = fx.split(nameText, { type: 'chars', mask: 'chars' });
  gsap.set([mark, nameText], { opacity: 1 });
  gsap.set(pinPath, { drawSVG: '0% 0%' });
  gsap.set(routeReveal, { drawSVG: '0% 0%', visibility: 'hidden' });
  gsap.set(split.chars, { yPercent: tokens.text.yFrom, '--wdth': tokens.text.wdthFrom });
  gsap.set([formerly, lines, actions], { opacity: 0, y: 12 });
  gsap.set(traveler.dot, { scale: 0 });

  // ------------------------------------------------------------ intro (about 2s)
  let introDone = false;
  let resolveReady;
  ctx.ready(new Promise((r) => (resolveReady = r)));
  const city = tokens.places[0];
  const intro = gsap.timeline({
    paused: true,
    onComplete() {
      introDone = true;
      split.chars.forEach((c) => c.style.removeProperty('--wdth'));
      resolveReady();
    },
  });
  intro
    .to(pinPath, { drawSVG: '0% 100%', duration: 0.9, ease: 'power2.inOut' }, 0)
    .set(routeReveal, { visibility: 'visible' }, 0.6)
    .to(routeReveal, { drawSVG: '0% 100%', duration: 0.7, ease: 'power2.inOut' }, 0.6)
    .call(
      () => {
        traveler.show();
        traveler.pop(fixScale());
        hud.set({ lat: city.lat, lng: city.lng, extra: 'ACC 3 M', mock: true });
      },
      null,
      1.3,
    )
    .to(split.chars, { yPercent: 0, '--wdth': 100, duration: 0.9, ease: 'expo.out', stagger: 0.035 }, 1.3)
    .to([formerly, lines, actions], { opacity: 1, y: 0, duration: 0.6, stagger: 0.08 }, 1.8);
  intro.play();

  // ------------------------------------------------------------ scroll exit (pinned, scrubbed)
  const exit = ctx.pinTimeline({ stage, vh: 80, mobileVh: 60, scrub: 0.6, finalAt: 0 });
  const tl = exit.tl;
  // fromTo + immediateRender:false everywhere: the intro owns these properties until it finishes,
  // so the exit must never record its start values from a half-played intro.
  const noIR = { immediateRender: false };
  const brandOffset = () => {
    // pin centre -> header mark, in logo units, measured relative to the stage (pinned at top 0)
    const b = brandMark?.getBoundingClientRect();
    const c = toScreen(...PIN_CENTER);
    const top = stage.getBoundingClientRect().top;
    if (!b) return [0, -200];
    return [(b.left + b.width / 2 - c.x) / unitPx(), (b.top + b.height * 0.4 - (c.y - top)) / unitPx()];
  };
  tl.fromTo(name, { '--wdth': 100, x: 0 }, { '--wdth': 125, x: () => -0.6 * exit.length(), duration: 1, ease: 'none', ...noIR }, 0)
    .fromTo([formerly, lines, actions], { opacity: 1, y: 0 }, { opacity: 0, y: -16, duration: 0.24, stagger: 0.03, ease: 'power1.in', ...noIR }, 0)
    .fromTo(dot, { u: 0 }, { u: 1, duration: 0.4, ease: 'power1.inOut', ...noIR }, 0.05)
    .fromTo(traveler.dot, { scale: () => fixScale() }, { scale: 1, duration: 0.22, ease: 'power1.inOut', ...noIR }, 0.05)
    // the whole mark (pin and route together, one origin) shrinks into the header slot once the fix has
    // left it along the route; only the thread's extra dash stays behind, running on from the route's end
    .fromTo(
      [pinG, routeG].filter(Boolean),
      { opacity: 1, scale: 1, x: 0, y: 0 },
      {
        opacity: 0,
        scale: 0.12,
        x: () => brandOffset()[0],
        y: () => brandOffset()[1],
        svgOrigin: `${PIN_CENTER[0]} ${PIN_CENTER[1]}`,
        duration: 0.3,
        ease: 'power2.in',
        ...noIR,
      },
      0.46,
    )
    .fromTo(seg, { progress: 0 }, { progress: 1, duration: 0.55, ease: 'none', ...noIR }, 0.45)
    .fromTo(worldSvg, { opacity: 1 }, { opacity: 0.55, duration: 0.6, ...noIR }, 0.4)
    .fromTo(brand, { opacity: 0 }, { opacity: 1, duration: 0.24, ...noIR }, 0.64)
    // ...with the top-bar Download: the hero's CTA has gone by then
    .fromTo(topDl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.24, ...noIR }, 0.64);

  // Scrolling during the intro fast-forwards it, so nothing is half-built.
  ScrollTrigger.create({
    trigger: stage,
    start: 'top top-=4',
    onEnter: () => !introDone && intro.progress(1),
  });

  // ------------------------------------------------------------ idle loop: the teleport
  let inView = true;
  let cityIdx = 0;
  let loop = null; // the teleport's delayed call (below)
  // The slow sideways drift is a CSS animation on the <svg> itself (hero.css): a compositor-only
  // transform, so the map never repaints and GSAP's ticker can sleep while the reader sits here.
  // It runs only while the hero is on screen and the tab is visible.
  const setDrift = (on) => stage.classList.toggle('is-drifting', on && !env.shots);
  setDrift(true);
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      inView = self.isActive;
      // the idle loops run only while the hero is on screen, so GSAP's ticker can sleep while the reader is further down
      setDrift(inView && !document.hidden);
      if (inView) loop?.resume();
      else loop?.pause();
    },
  });
  document.addEventListener('visibilitychange', () => setDrift(inView && !document.hidden));

  const canTeleport = () =>
    introDone && inView && !document.hidden && !env.shots && (exit.st ? exit.st.progress < 0.01 && window.scrollY < 8 : true);

  function teleport() {
    if (canTeleport()) {
      cityIdx = (cityIdx + 1) % OFFSETS.length;
      const [x, y] = OFFSETS[cityIdx];
      const c = tokens.places[cityIdx];
      gsap.set(pan, { x, y, skewX: 8, transformOrigin: '50% 50%' });
      gsap.delayedCall(2 / 60, () => gsap.set(pan, { skewX: 0 }));
      hud.set({ lat: c.lat, lng: c.lng, extra: cityIdx === 0 ? 'ACC 3 M' : c.label, mock: true });
      traveler.pulse();
    }
    loop.restart(true);
  }
  loop = gsap.delayedCall(5, teleport);
  if (!inView) loop.pause();
  if (env.shots) {
    loop.kill();
  }

  // Leaving the top hands the HUD back to Chennai, so it never names a teleport city over the scenes below.
  ScrollTrigger.create({
    trigger: stage,
    start: 'top top-=2',
    onEnter: () => {
      if (cityIdx !== 0) hud.set({ lat: city.lat, lng: city.lng, extra: 'ACC 3 M', mock: true });
    },
  });
}
