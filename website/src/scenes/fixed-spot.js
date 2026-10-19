// Scene 01: fixed-spot. "Drop a pin. Be there."
// The thread arrives as a road the pin stands on. Four scrubbed beats move the pin (drag, tap and
// long-press, search, paste) and the road re-routes to the tip every time. The orange fix rides in
// the pin; at the end it drops back onto the thread and leaves at data-thread-out.
import './fixed-spot.css';
import { roundedPath } from '../lib/thread.js';

// Pin tip positions, normalized to the stage. Kept clear of the thread's entry column (x = 0.62).
// Desktop: C sits right under the search slot (CSS anchors the slot above it), right of the thread's
// entry column, so the road never runs under the search UI. Mobile: the pins live
// in the band between the giant digits and the search slot, which docks at the bottom of the stage.
const POS = {
  desktop: { S: [0.52, 0.6], D: [0.72, 0.52], Dc: [0.67, 0.7], A: [0.46, 0.72], B: [0.77, 0.65], C: [0.72, 0.47], E: [0.7, 0.54] },
  mobile: { S: [0.42, 0.76], D: [0.78, 0.72], Dc: [0.62, 0.8], A: [0.24, 0.79], B: [0.7, 0.8], C: [0.44, 0.74], E: [0.78, 0.77] },
};
// The fix after each landing (S = start, then drag, tap, hold, search "Chennai", paste).
const LL = {
  S: [13.0827, 80.2707],
  D: [13.0911, 80.2794],
  A: [13.0764, 80.2633],
  B: [13.0868, 80.2851],
  C: [13.0827, 80.2707],
  E: [48.8584, 2.2945],
};
// Timeline marks (progress fractions of the pinned scrub).
const T = { draw: 0.04, rise0: 0.035, rise1: 0.065, exit0: 0.92, exit1: 0.95 };
// (the search beat reads Chennai the moment its result row highlights, before the pin drops there)
const HUD_AT = [0.235, 0.335, 0.479, 0.64, 0.815, 0.95];
const HUD_LL = [LL.S, LL.D, LL.A, LL.B, LL.C, LL.E, LL.S];
const BEATS = [
  [0.07, 0.255],
  [0.28, 0.5],
  [0.51, 0.715],
  [0.73, 0.88],
];
// The paste lands in another city: the map hard-cuts by this offset (map units).
const TELEPORT = [472, -488];
const RADIUS = 30;
const FLAT = 44; // px the road runs on past the tip before it turns away

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (k) => k * k * (3 - 2 * k);

export function init(ctx) {
  const { root, gsap, ScrollTrigger, thread, traveler, hud, fx } = ctx;
  const stage = root.querySelector('.stage');
  const q = (s) => root.querySelector(s);
  const pin = q('.fs__pin');
  const body = q('.fs__body');
  const squashEl = q('.fs__squash');
  const fixEl = q('.fs__fix');
  const tipEl = q('.fs__tip');
  const ground = q('.fs__ground');
  const acc = q('.fs__acc');
  const groundPulse = q('.fs__ground-pulse');
  const touchDrag = q('.fs__touch--drag');
  const touchTap = q('.fs__touch--tap');
  const touchHold = q('.fs__touch--hold');
  const ripple = q('.fs__ripple');
  const holdSvg = q('.fs__hold');
  const holdRing = q('.fs__hold-ring');
  const latEl = q('.fs__lat');
  const lngEl = q('.fs__lng');
  const search = q('.fs__search');
  const bar = q('.fs__bar');
  const outline = q('.fs__bar-outline');
  const outlinePath = outline.querySelector('path');
  const glass = q('.fs__glass');
  const placeholder = q('.fs__placeholder');
  const typed = q('.fs__typed');
  const caret = q('.fs__caret');
  const result = q('.fs__result');
  const paste = q('.fs__paste');
  const pasteOk = q('.fs__paste-ok path');
  const pan = q('.fs__pan');
  const tele = q('.fs__tele');
  const indexItems = [...root.querySelectorAll('.fs__index li')];

  const tin = parseFloat(root.dataset.threadIn || '0.62');
  const tout = parseFloat(root.dataset.threadOut || '0.38');
  const layout = () => (ctx.isMobile() ? POS.mobile : POS.desktop);

  // ------------------------------------------------------------ state (normalized pin + thread target)
  const state = { x: 0, y: 0, tx: 0, ty: 0, link: 1, lat: LL.S[0], lng: LL.S[1] };
  const P0 = ctx.reduced ? layout().E : layout().S;
  Object.assign(state, { x: P0[0], y: P0[1], tx: P0[0], ty: P0[1] });

  // A scratch path to measure the incoming run (entry -> tip) of the route.
  const NS = 'http://www.w3.org/2000/svg';
  const scratchSvg = document.createElementNS(NS, 'svg');
  scratchSvg.setAttribute('aria-hidden', 'true');
  scratchSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  const scratch = document.createElementNS(NS, 'path');
  scratchSvg.appendChild(scratch);
  stage.appendChild(scratchSvg);

  let lenIn = 0;
  let geomDirty = true;
  let tipFrac = 0;
  const outY = new Float32Array(241);

  // ------------------------------------------------------------ the thread: a road the pin stands on
  const seg = thread.segment(root, {
    radius: RADIUS,
    d: (W, H) => {
      const P = ctx.reduced ? layout().E : null;
      const tx = (P ? P[0] : state.tx) * W;
      const ty = (P ? P[1] : state.ty) * H;
      const inX = tin * W;
      const outX = tout * W;
      const yB = Math.min(H - 36, Math.max(ty + 0.16 * H, 0.86 * H));
      // Phones: the column at x = in would cross the copy and the giant digits, so the road jogs over
      // to the right gutter above the folio, runs down beside everything, and turns in to the tip.
      const phone = window.innerWidth < 768;
      const xR = 0.93 * W;
      const yJ = Math.min(ty - 40, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) + 14 || 90);
      const ptsIn = phone
        ? [
            [inX, 0],
            [inX, yJ],
            [xR, yJ],
            [xR, ty],
            [tx, ty],
          ]
        : [
            [inX, 0],
            [inX, ty],
            [tx, ty],
          ];
      const from = ptsIn[ptsIn.length - 2][0];
      const dir = tx < from ? -1 : 1;
      const pts = [...ptsIn, [tx + dir * FLAT, ty], [outX, yB], [outX, H]];
      scratch.setAttribute('d', roundedPath(ptsIn, RADIUS));
      lenIn = scratch.getTotalLength();
      geomDirty = true;
      return roundedPath(pts, RADIUS);
    },
  });

  function measure() {
    if (!geomDirty || !seg.length) return;
    geomDirty = false;
    tipFrac = clamp01(lenIn / seg.length);
    for (let i = 0; i < outY.length; i++) outY[i] = seg.pointAt(tipFrac + ((1 - tipFrac) * i) / (outY.length - 1)).y;
  }
  /** First fraction after the tip where the road reaches y (stage px). */
  function fracAfterTip(y) {
    measure();
    if (y <= outY[0]) return tipFrac;
    const n = outY.length;
    for (let i = 1; i < n; i++) {
      if (outY[i] >= y) {
        const k = outY[i] === outY[i - 1] ? 0 : (y - outY[i - 1]) / (outY[i] - outY[i - 1]);
        return tipFrac + ((1 - tipFrac) * (i - 1 + k)) / (n - 1);
      }
    }
    return 1;
  }

  // the folio follows the pin: it opens on Chennai and settles on each landing (the markup holds the final one)
  const folioScr = root.querySelector('.folio [data-scramble]');
  fx.folio(root.querySelector('.folio'), ctx.reduced ? {} : { text: fx.fmtFolio(...LL.S) });
  fx.reveal(root.querySelector('.h-scene'), { sub: [root.querySelector('.sub'), root.querySelector('.fs__index')] });

  if (ctx.reduced) {
    seg.progress = 1;
    return;
  }

  // ------------------------------------------------------------ geometry helpers
  const center = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const mix = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
  const HIDDEN = { hidden: true };

  function pillPath() {
    const w = bar.offsetWidth;
    const h = bar.offsetHeight;
    const r = h / 2;
    // svg sits 1px outside the bar's border box; trace the border's centre line
    const x0 = 1.5;
    const y0 = 1.5;
    const x1 = w + 0.5;
    const y1 = h + 0.5;
    const rr = r - 0.5;
    outlinePath.setAttribute(
      'd',
      `M${x0 + rr} ${y0}H${x1 - rr}A${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}H${x0 + rr}A${rr} ${rr} 0 0 1 ${x0 + rr} ${y0}Z`,
    );
  }
  pillPath();
  ScrollTrigger.addEventListener('refreshInit', pillPath);

  // ------------------------------------------------------------ per-frame render (idempotent)
  let cur = null; // { tl } of the active breakpoint
  const last = { px: NaN, py: NaN, tx: NaN, ty: NaN, prog: -1, lat: '', lng: '', idx: -1, k: -1, hud: 0, fix: null };
  const setPX = gsap.quickSetter(pin, 'x', 'px');
  const setPY = gsap.quickSetter(pin, 'y', 'px');

  function render(force) {
    if (!cur || (!near && !force)) return;
    const tl = cur.tl;
    const p = tl.progress();
    const W = seg.width;
    const H = seg.height;

    // pin on the ground
    const px = state.x * W;
    const py = state.y * H;
    if (px !== last.px) setPX((last.px = px));
    if (py !== last.py) setPY((last.py = py));

    // the road re-routes to the tip
    if (state.link) {
      state.tx = state.x;
      state.ty = state.y;
    }
    if (!(Math.abs(state.tx - last.tx) <= 1e-5 && Math.abs(state.ty - last.ty) <= 1e-5)) {
      last.tx = state.tx;
      last.ty = state.ty;
      seg.rebuild();
    }
    measure();

    // draw head: lead-in on the 60% line, tip while pinned, then off down the road
    const vh = window.innerHeight;
    const top = stage.getBoundingClientRect().top;
    const lineY = 0.6 * vh - top;
    const leadMax = Math.min(tipFrac, seg.progressAtY((0.6 * vh) / H));
    const exitTo = Math.max(fracAfterTip(0.6 * vh), fracAfterTip(state.ty * H + 1));
    let prog;
    if (p <= 0) prog = Math.min(leadMax, seg.progressAtY(lineY / H));
    else if (p < T.draw) prog = lerp(leadMax, tipFrac, smooth(p / T.draw));
    else if (p < T.exit1) prog = tipFrac;
    else {
      prog = lerp(tipFrac, exitTo, smooth(clamp01((p - T.exit1) / (1 - T.exit1))));
      if (top < -0.5 || p >= 1) prog = Math.max(prog, fracAfterTip(lineY));
    }
    if (Math.abs(prog - last.prog) > 1e-6) seg.progress = last.prog = prog;

    // own fix while the traveler hides
    const fixOn = p >= T.rise1 && p < T.exit0;
    if (fixOn !== last.fix) {
      last.fix = fixOn;
      fixEl.style.visibility = fixOn ? 'visible' : 'hidden';
    }

    // giant digits
    const lat = state.lat.toFixed(4) + ',';
    const lng = state.lng.toFixed(4);
    if (lat !== last.lat) latEl.textContent = last.lat = lat;
    if (lng !== last.lng) lngEl.textContent = last.lng = lng;

    // step index
    const idx = p < 0.27 ? 0 : p < 0.505 ? 1 : p < 0.725 ? 2 : 3;
    if (idx !== last.idx) {
      last.idx = idx;
      indexItems.forEach((li, i) => li.classList.toggle('is-on', i === idx));
    }
    const [b0, b1] = BEATS[idx];
    const k = Math.round(clamp01((p - b0) / (b1 - b0)) * 100) / 100;
    if (k !== last.k) indexItems[idx].style.setProperty('--beat', (last.k = k));

    // the top-bar fix follows each landing
    let beat = 0;
    while (beat < HUD_AT.length && p >= HUD_AT[beat]) beat++;
    if (beat !== last.hud) {
      last.hud = beat;
      const [la, ln] = HUD_LL[beat];
      hud.set({ lat: la, lng: ln, extra: 'ACC 3 M', mock: true });
      if (folioScr) fx.scramble(folioScr, fx.fmtFolio(la, ln), { duration: ctx.env.shots ? 0 : 0.4 });
    }
  }
  // only while the scene is near the viewport (one last render on the way out)
  let near = false;
  ctx.ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    refreshPriority: -1, // after this scene's own pin, whose spacer sets the section height
    onToggle: (self) => {
      near = self.isActive;
      render(true);
    },
  });
  ctx.loop.add(() => near && render());

  // ------------------------------------------------------------ the orange fix
  traveler.follow(() => {
    if (!cur || !near) return null;
    render();
    const p = cur.tl.progress();
    if (p <= 0 || p >= T.exit1) return null; // auto mode: the head of this thread
    if (p < T.rise0) return seg.headScreen();
    if (p < T.rise1) return mix(center(tipEl), center(fixEl), smooth((p - T.rise0) / (T.rise1 - T.rise0)));
    if (p < T.exit0) return HIDDEN;
    return mix(center(fixEl), center(tipEl), smooth((p - T.exit0) / (T.exit1 - T.exit0)));
  });

  // ------------------------------------------------------------ punches (non-scrubbed)
  const squash = () =>
    gsap
      .timeline({ paused: true })
      .fromTo(squashEl, { scaleY: 1, scaleX: 1 }, { scaleY: 0.82, scaleX: 1.1, duration: 0.07, ease: 'power2.out', immediateRender: false })
      .to(squashEl, { scaleY: 1, scaleX: 1, duration: 0.8, ease: ctx.tokens.ease.squash })
      .fromTo(groundPulse, { scale: 1, opacity: 0 }, { opacity: 0.9, duration: 0.01, immediateRender: false }, 0.02)
      .to(groundPulse, { scale: 3.2, opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.03);

  const ripplePunch = () =>
    gsap.fromTo(ripple, { scale: 0, opacity: 1 }, { scale: 3, opacity: 0, duration: 0.7, ease: 'power2.out', paused: true, immediateRender: false });

  const teleport = () =>
    gsap
      .timeline({ paused: true })
      .to(tele, { x: TELEPORT[0], y: TELEPORT[1], skewX: 8, duration: 0.001 }, 0.001)
      .to(tele, { skewX: 0, duration: 0.001 }, 0.034);

  // ------------------------------------------------------------ the scrubbed story
  function build(P, mobile) {
    const H = () => seg.height;
    const place = (el, pt) => {
      el.style.left = `${pt[0] * 100}%`;
      el.style.top = `${pt[1] * 100}%`;
    };
    place(touchTap, P.A);
    place(ripple, P.A);
    place(touchHold, P.B);
    place(holdSvg, P.B);

    Object.assign(state, { x: P.S[0], y: P.S[1], tx: P.S[0], ty: P.S[1], link: 1, lat: LL.S[0], lng: LL.S[1] });
    const drag = { k: 0 };
    last.tx = NaN;
    const chars = fx.split(typed, { type: 'chars', mask: false }).chars;

    gsap.set([touchDrag, touchTap, touchHold, holdSvg, groundPulse], { opacity: 0 });
    gsap.set(ripple, { scale: 0, opacity: 1 });
    gsap.set(holdRing, { drawSVG: '0%' });
    gsap.set(fixEl, { visibility: 'hidden' });
    gsap.set([search, paste], { opacity: 0 });
    gsap.set(outlinePath, { drawSVG: '0%' });
    gsap.set([glass, placeholder, caret], { opacity: 0 });
    gsap.set(result, { opacity: 0 });
    gsap.set(chars, { display: 'none' });
    gsap.set(pasteOk, { drawSVG: '0%' });

    const pt = ctx.pinTimeline({ stage, vh: 80, mobileVh: 60, scrub: 0.6, snap: 'labelsDirectional' });
    const { tl, punch } = pt;
    const nIR = { immediateRender: false };
    const hop = -0.42; // drops start this far above the ground (fraction of stage height)

    tl.addLabel('in', 0)
      .addLabel('ready', 0.07)
      .addLabel('drag', 0.255)
      .addLabel('tap', 0.5)
      .addLabel('search', 0.715)
      .addLabel('paste', 0.88)
      .addLabel('out', 1);

    // ---- 1. DRAG: lift, follow a curve, the map counter-pans, land
    const dx = P.D[0] - P.S[0];
    tl.to(body, { y: -12, scaleY: 1.08, duration: 0.02, ease: 'power2.out' }, 0.08)
      .to(ground, { scale: 1.7, opacity: 0.35, duration: 0.02 }, 0.08)
      .to(acc, { scale: 0.6, opacity: 0, duration: 0.02 }, 0.08)
      .fromTo(touchDrag, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.015, ...nIR }, 0.076)
      // the drag follows a curve through Dc: a quadratic Bezier whose midpoint is Dc
      .fromTo(
        drag,
        { k: 0 },
        {
          k: 1,
          duration: 0.12,
          ease: 'power1.inOut',
          immediateRender: false,
          onUpdate: () => {
            const k = drag.k;
            const cx = 2 * P.Dc[0] - (P.S[0] + P.D[0]) / 2;
            const cy = 2 * P.Dc[1] - (P.S[1] + P.D[1]) / 2;
            state.x = (1 - k) * (1 - k) * P.S[0] + 2 * (1 - k) * k * cx + k * k * P.D[0];
            state.y = (1 - k) * (1 - k) * P.S[1] + 2 * (1 - k) * k * cy + k * k * P.D[1];
          },
        },
        0.1,
      )
      .to(pan, { x: -Math.sign(dx) * 26, duration: 0.12, ease: 'power1.inOut' }, 0.1)
      .to(state, { lat: LL.D[0], lng: LL.D[1], duration: 0.12, ease: 'power1.inOut' }, 0.1)
      .to(body, { y: 0, scaleY: 1, duration: 0.014, ease: 'power2.in' }, 0.221)
      .to(ground, { scale: 1, opacity: 1, duration: 0.014, ease: 'power2.in' }, 0.221)
      .to(acc, { scale: 1, opacity: 1, duration: 0.02 }, 0.226)
      .to(touchDrag, { opacity: 0, scale: 0.7, duration: 0.014 }, 0.228);
    punch(0.235, squash());

    // ---- 2. TAP: ripple, the pin arcs over; then HOLD: a ring fills and the pin drops
    tl.fromTo(touchTap, { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.01, ...nIR }, 0.279)
      .to(state, { x: P.A[0], y: P.A[1], duration: 0.04, ease: 'power2.inOut' }, 0.295)
      .to(body, { y: -50, duration: 0.02, ease: 'power2.out' }, 0.295)
      .to(body, { y: 0, duration: 0.02, ease: 'power2.in' }, 0.315)
      .to(state, { lat: LL.A[0], lng: LL.A[1], duration: 0.04, ease: 'power2.inOut' }, 0.295)
      .to(touchTap, { opacity: 0, duration: 0.012 }, 0.302);
    punch(0.29, ripplePunch());
    punch(0.335, squash());

    tl.fromTo(touchHold, { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: 0.01, ...nIR }, 0.36)
      .fromTo(holdSvg, { opacity: 0 }, { opacity: 1, duration: 0.008, ...nIR }, 0.364)
      .fromTo(holdRing, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.07, ease: 'none', ...nIR }, 0.37)
      .to(body, { opacity: 0, y: -24, duration: 0.01, ease: 'power2.in' }, 0.44)
      // the touch beats are over: the dashed ring goes with them (search and paste have no touch)
      .to(acc, { opacity: 0, scale: 0.6, duration: 0.012 }, 0.44)
      .set(state, { link: 0, x: P.B[0], y: P.B[1] }, 0.451)
      .set(body, { y: () => hop * H() }, 0.452)
      .to(body, { opacity: 1, duration: 0.008 }, 0.453)
      .to(body, { y: 0, duration: 0.026, ease: 'power3.in' }, 0.453)
      .to(state, { tx: P.B[0], ty: P.B[1], duration: 0.027, ease: 'power2.inOut' }, 0.452)
      .to(state, { lat: LL.B[0], lng: LL.B[1], duration: 0.027, ease: 'power2.inOut' }, 0.452)
      .set(state, { link: 1 }, 0.4795)
      .to([touchHold, holdSvg], { opacity: 0, duration: 0.015 }, 0.482);
    punch(0.479, squash());

    // ---- 3. SEARCH: the pill draws, "Chennai" types, one result, the pin drops from above
    tl.fromTo(search, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.012, ...nIR }, 0.51)
      .fromTo(outlinePath, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.035, ease: 'power2.inOut', ...nIR }, 0.51)
      .fromTo(glass, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.015, ...nIR }, 0.524)
      .fromTo(placeholder, { opacity: 0 }, { opacity: 1, duration: 0.01, ...nIR }, 0.53)
      .to(placeholder, { opacity: 0, duration: 0.003 }, 0.553)
      .fromTo(caret, { opacity: 0 }, { opacity: 1, duration: 0.002, ...nIR }, 0.554);
    chars.forEach((c, i) => tl.set(c, { display: 'inline-block' }, 0.557 + i * 0.0075));
    tl.fromTo(result, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.02, ease: 'power3.out', ...nIR }, 0.615)
      .to(result, { backgroundColor: '#1f1e1b', borderColor: 'rgba(238, 234, 226, 0.5)', duration: 0.01 }, 0.638)
      .to(caret, { opacity: 0, duration: 0.002 }, 0.64)
      .to(body, { opacity: 0, y: -24, duration: 0.01, ease: 'power2.in' }, 0.646)
      .set(state, { link: 0, x: P.C[0], y: P.C[1] }, 0.657)
      .set(body, { y: () => hop * H() }, 0.658)
      .to(body, { opacity: 1, duration: 0.008 }, 0.659)
      .to(body, { y: 0, duration: 0.029, ease: 'power3.in' }, 0.659)
      .to(state, { tx: P.C[0], ty: P.C[1], duration: 0.03, ease: 'power2.inOut' }, 0.658)
      .to(state, { lat: LL.C[0], lng: LL.C[1], duration: 0.016, ease: 'power2.inOut' }, 0.638)
      .set(state, { link: 1 }, 0.6885);
    punch(0.688, squash());

    // ---- 4. PASTE: the chip slides in, the map jumps cities, the digits roll, the pin lands
    tl.to(search, { opacity: 0, y: -10, duration: 0.014, ease: 'power2.in' }, 0.73)
      .fromTo(paste, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.025, ease: 'power3.out', ...nIR }, 0.738)
      .fromTo(pasteOk, { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.012, ...nIR }, 0.758)
      .to(body, { opacity: 0, y: -24, duration: 0.01, ease: 'power2.in' }, 0.772)
      .set(state, { link: 0, x: P.E[0], y: P.E[1] }, 0.783)
      .set(body, { y: () => hop * H() }, 0.784)
      .to(body, { opacity: 1, duration: 0.008 }, 0.785)
      .to(body, { y: 0, duration: 0.03, ease: 'power3.in' }, 0.785)
      .to(state, { tx: P.E[0], ty: P.E[1], duration: 0.031, ease: 'power2.inOut' }, 0.784)
      .to(state, { lat: LL.E[0], lng: LL.E[1], duration: 0.05, ease: 'power2.inOut' }, 0.766)
      .set(state, { link: 1 }, 0.8155);
    punch(0.77, teleport());
    punch(0.815, squash());
    // the input slot steps away as the fix leaves the pin
    tl.to(paste, { opacity: 0, y: 10, duration: 0.025, ease: 'power2.in' }, 0.93);

    cur = { tl, mobile };
    render();
    return () => {
      cur = null;
      last.hud = 0;
    };
  }

  ctx.media({
    desktop: () => build(POS.desktop, false),
    mobile: () => build(POS.mobile, true),
  });
}
