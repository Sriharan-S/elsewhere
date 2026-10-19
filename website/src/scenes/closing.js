// CLOSING: the loop closes. The thread wraps the mark and hooks into the route's end, the fix
// rides the route back under the tip and rises into the pin as the pin redraws (the wordmark's outline
// arrives with it; the solid letters land in real time once the fix is home). Then the setup rows switch
// on, the mock goes live, and the footer signs off on Null Island.
import './closing.css';
import { PIN_CENTER, ROUTE_UNDER_TIP, ROUTE_POINTS, ROUTE_END } from '../components/logo.js';

function polyLen(pts) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return t;
}
function polyAt(pts, u) {
  let d = Math.max(0, Math.min(1, u)) * polyLen(pts);
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= l || i === pts.length - 1) {
      const k = l ? Math.min(1, d / l) : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
    }
    d -= l;
  }
  return pts[pts.length - 1];
}

// Fraction of the route (from its start) where the point under the tip sits.
const UNDER_TIP_F = polyLen([...ROUTE_POINTS.slice(0, 4), ROUTE_UNDER_TIP]) / polyLen(ROUTE_POINTS);
const RIDE = [ROUTE_END, ROUTE_POINTS[4], ROUTE_UNDER_TIP];
const RISE = [ROUTE_UNDER_TIP, PIN_CENTER];

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, traveler, fx } = ctx;
  const stage = root.querySelector('.closing__stage');
  const mark = root.querySelector('.closing__mark');
  const word = root.querySelector('.closing__word');
  const pinPath = mark.querySelector('.logo__pin-path');
  const routeReveal = mark.querySelector('.logo__route-reveal');
  const nameText = root.querySelector('.closing__name-text');
  const ghost = root.querySelector('.closing__ghost');
  const tagline = root.querySelector('.closing__tagline');
  const setup = root.querySelector('.closing__setup');

  const toScreen = (x, y) => {
    const m = mark.getScreenCTM();
    return m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x: -99, y: -99 };
  };
  const unitPx = () => mark.getScreenCTM()?.a || 1;

  // ------------------------------------------------------------ thread: down the right of the mark, then a
  // short hook that merges into the route's end along its last leg (so the thread becomes the route)
  const tin = parseFloat(root.dataset.threadIn || '0.5');
  const seg = thread.segment(root, {
    stage,
    radius: 48,
    points: (W, H) => {
      const r = stage.getBoundingClientRect();
      const m = mark.getBoundingClientRect();
      const nx = (x) => (x - r.left) / W;
      const ny = (y) => (y - r.top) / H;
      const e = toScreen(...ROUTE_END);
      const dx = ROUTE_END[0] - ROUTE_POINTS[4][0];
      const dy = ROUTE_END[1] - ROUTE_POINTS[4][1];
      const dl = Math.hypot(dx, dy);
      const t = Math.max(48, 0.075 * H); // px along the last leg's extension
      const p4 = [e.x + (dx / dl) * t, e.y + (dy / dl) * t];
      const xR = Math.min(0.965, nx(m.right) + Math.max(0.06, 90 / W));
      const yA = Math.max(0.035, ny(m.top) - 0.06);
      return [
        [tin, 0],
        [tin, yA],
        [xR, yA],
        [xR, ny(p4[1])],
        [nx(p4[0]), ny(p4[1])],
        [nx(e.x), ny(e.y)],
      ];
    },
  });

  if (env.reduced) {
    seg.progress = 1;
    return;
  }

  seg.track({ until: 'pin' });

  // ------------------------------------------------------------ the fix: route ride (k 0..1), rise (k 1..2)
  const s = { k: 0 };
  const fixScale = () => Math.max(1, Math.min(2.6, (34 * unitPx()) / 16));
  traveler.follow(() => {
    if (s.k <= 0) return null;
    const p = s.k <= 1 ? polyAt(RIDE, s.k) : polyAt(RISE, s.k - 1);
    return toScreen(p[0], p[1]);
  });

  const split = fx.split(nameText, { type: 'chars', mask: 'chars' });
  gsap.set(pinPath, { drawSVG: '0% 0%' });
  gsap.set(routeReveal, { drawSVG: '100% 100%' });
  gsap.set(split.chars, { yPercent: ctx.tokens.text.yFrom, '--wdth': ctx.tokens.text.wdthFrom });
  gsap.set(tagline, { opacity: 0, y: 12 });

  // The pin outline redraws while the stage scrolls in, so the approach is never an empty map:
  // by the time the stage pins, the mark is waiting for the thread and the fix.
  gsap.set(ghost, { opacity: 0 });
  ctx
    .scrubTimeline({ trigger: stage, start: 'top 85%', end: 'top 8%', scrub: 0.6 })
    .fromTo(pinPath, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 1, ease: 'power1.inOut' }, 0)
    .fromTo(ghost, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'none', immediateRender: false }, 0.35);

  const { tl, punch } = ctx.pinTimeline({ stage, vh: 100, mobileVh: 70, scrub: 0.6 });
  const ut = `${(UNDER_TIP_F * 100).toFixed(2)}%`;
  tl.to(seg, { run: 1, duration: 0.3, ease: 'none' }, 0)
    .to(routeReveal, { drawSVG: `${ut} 100%`, duration: 0.18, ease: 'none' }, 0.3)
    .to(s, { k: 1, duration: 0.18, ease: 'none' }, 0.3)
    .to(routeReveal, { drawSVG: '0% 100%', duration: 0.14, ease: 'power1.out' }, 0.48)
    .to(s, { k: 2, duration: 0.16, ease: 'power2.out' }, 0.48)
    .fromTo(traveler.dot, { scale: 1 }, { scale: () => fixScale(), duration: 0.16, immediateRender: false }, 0.48)
    .to(tagline, { opacity: 1, y: 0, duration: 0.12 }, 0.7);
  // the letters land in real time once the fix is home, so the wordmark is never left at rest mid-stagger
  const nameIn = gsap
    .timeline({ paused: true })
    .fromTo(
      split.chars,
      { yPercent: ctx.tokens.text.yFrom, '--wdth': ctx.tokens.text.wdthFrom },
      { yPercent: 0, '--wdth': 100, duration: 0.8, stagger: 0.03, ease: 'expo.out', immediateRender: false },
    );
  punch(0.6, nameIn);

  const ring = traveler.el?.querySelector('.traveler__ring');
  if (ring) {
    punch(
      0.64,
      gsap.fromTo(ring, { scale: 1, opacity: 1 }, { scale: 3.2, opacity: 0, duration: 0.9, ease: 'power2.out', paused: true }),
    );
  }

  // ------------------------------------------------------------ setup rows: each switches on as it enters
  fx.reveal(root.querySelector('.closing__title'), { start: 'top 78%' });

  const pulseSvg = root.querySelector('.closing__pulse');
  const pulse = pulseSvg.querySelector('circle');
  const rows = gsap.utils.toArray(root.querySelectorAll('.setup__row'));
  rows.forEach((row) => {
    const a = gsap.timeline({ paused: true });
    a.fromTo(row, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, 0);
    const step = row.dataset.step;
    if (step === 'dev') {
      const t = row.querySelector('.toggle');
      gsap.set(t, { attr: { class: 'toggle' } });
      a.set(t, { attr: { class: 'toggle is-on' } }, 0.35);
    } else if (step === 'mock') {
      const r = row.querySelector('.radio');
      const tick = row.querySelector('.radio__tick');
      gsap.set(r, { attr: { class: 'radio' } });
      gsap.set(tick, { drawSVG: '0%' });
      const centre = () => {
        const b = r.getBoundingClientRect();
        const c = setup.getBoundingClientRect();
        return [b.left + b.width / 2 - c.left, b.top + b.height / 2 - c.top];
      };
      const reach = () => Math.hypot(setup.clientWidth, setup.clientHeight);
      a.set(r, { attr: { class: 'radio is-on' } }, 0.4)
        .to(tick, { drawSVG: '100%', duration: 0.3, ease: 'power2.out' }, 0.45)
        .add(() => {
          const [x, y] = centre();
          pulse.setAttribute('cx', x.toFixed(1));
          pulse.setAttribute('cy', y.toFixed(1));
        }, 0.69)
        .fromTo(pulse, { attr: { r: 0 }, opacity: 1 }, { attr: { r: () => reach() }, opacity: 0, duration: 1.6, ease: 'power2.out' }, 0.7);
    }
    ScrollTrigger.create({
      trigger: row,
      start: 'top 84%',
      onEnter: () => fx.punch(a, true),
      onLeaveBack: () => fx.punch(a, false),
    });
  });

  const actions = root.querySelector('.closing__actions');
  const aIn = gsap.fromTo(actions.children, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.07, ease: 'power3.out', paused: true });
  ScrollTrigger.create({
    trigger: actions,
    start: 'top 92%',
    onEnter: () => fx.punch(aIn, true),
    onLeaveBack: () => fx.punch(aIn, false),
  });

  // ------------------------------------------------------------ footer divider: the route draws full width
  const divider = document.querySelector('.site-footer__divider');
  if (divider) {
    const d = gsap.fromTo(divider, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 1.2, ease: 'power2.inOut', paused: true });
    ScrollTrigger.create({
      trigger: divider,
      start: 'top 96%',
      onEnter: () => fx.punch(d, true),
      onLeaveBack: () => fx.punch(d, false),
    });
  }
}
