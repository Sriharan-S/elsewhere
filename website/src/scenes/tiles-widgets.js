// Scene 05: tiles-widgets. "Four tiles. Four places."
// The shade drops, four quick-settings tiles take turns (one on, the rest off, like the real
// tiles), and each tap relocates the world. Then the shade yanks up and two widgets land:
// a favorite toggle and the live route with its periodically refreshed snapshot. The app runs one mock
// at a time, so while the route is live the favorite toggle reads Off.
import './tiles-widgets.css';

// Placeholder favorites (the app's favorites are the user's own).
const FAVS = [
  [13.0418, 80.2341], // Home
  [13.0067, 80.2206], // Office
  [12.9941, 80.1709], // Airport
  [12.8186, 80.0407], // Test track
];
const CHENNAI = [13.0827, 80.2707];
const TAP = [0.11, 0.23, 0.35, 0.47];
// World offsets (map units) per mocked place: the page hard-cuts to a new district on every tap.
const DISTRICTS = [
  [0, 0],
  [-420, 180],
  [380, -260],
  [-300, -380],
  [520, 300],
];
// Snapshot refreshes: route fraction after each periodic refresh (the last one is the final frame).
const SNAP_AT = [0.8, 0.86, 0.92, 0.975];
const SNAP_F0 = 0.22;
const X0 = 0.93; // the thread leaves from here

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (k) => k * k * (3 - 2 * k);
const fmtFolio = ([la, ln]) => `${la.toFixed(4)} N ${ln.toFixed(4)} E`;

export function init(ctx) {
  const { root, gsap, thread, traveler, hud, fx } = ctx;
  const stage = root.querySelector('.stage');
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];
  const phone = q('.tw__phone');
  const shade = q('.tw-shade');
  const scrim = q('.tw-scrim');
  const tiles = qa('.tw-tile');
  const fills = qa('.tw-tile__fill');
  const touches = qa('.tw-tile__touch');
  const nums = qa('.tw__num');
  const tele = q('.tw__tele');
  const widgets = qa('.tw-w');
  const thumb = q('.tw-switch i');
  const sw = q('.tw-switch');
  const favOff = q('.tw-fav__off');
  const favOn = q('.tw-fav__on');
  const barFill = q('.tw-route__bar i');
  const minEl = q('.tw-route__min');
  const snapDot = q('.tw-snap__dot');
  const snapRoute = q('.tw-snap__route');
  const snapDriven = q('.tw-snap__driven');
  const flash = q('.tw-snap__flash');
  const folioDigits = q('.folio [data-scramble]');
  const barTime = q('.tw-bar-time');

  const tin = parseFloat(root.dataset.threadIn || '0.62');
  const tout = parseFloat(root.dataset.threadOut || '0.38');

  // ------------------------------------------------------------ snapshot geometry (route fractions)
  const snapLen = snapRoute.getTotalLength();
  const dotAt = (f) => snapRoute.getPointAtLength(clamp01(f) * snapLen);
  // final frame: the dot sits where the HTML put it; find its fraction so the driven line matches
  const SNAP_FINAL = (() => {
    const cx = +snapDot.getAttribute('cx');
    const cy = +snapDot.getAttribute('cy');
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= 200; i++) {
      const p = dotAt(i / 200);
      const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = i / 200;
      }
    }
    return best;
  })();
  const SNAP_F = [0.34, 0.45, 0.54, SNAP_FINAL];
  snapDriven.style.setProperty('--driven', SNAP_FINAL.toFixed(4));

  // ------------------------------------------------------------ the thread: down the phone's right side, under it, out
  const phoneBox = (W, H) => {
    const s = stage.getBoundingClientRect();
    const r = phone.getBoundingClientRect();
    return { l: (r.left - s.left) / W, r: (r.right - s.left) / W, t: (r.top - s.top) / H, b: (r.bottom - s.top) / H };
  };
  const geo = { exitY: 0.95 };
  const seg = thread.segment(root, {
    radius: 40,
    points: (W, H) => {
      const pb = phoneBox(W, H);
      if (ctx.isMobile()) {
        const xr = Math.min(0.94, pb.r + Math.max(18, (W * (1 - pb.r)) * 0.3) / W);
        geo.exitY = 0.86;
        return [
          [tin, 0],
          [tin, Math.max(0.08, pb.t - 0.16)],
          [xr, Math.max(0.16, pb.t - 0.03)],
          [xr, 0.86],
          [tout, 1],
        ];
      }
      const xr = Math.min(0.96, pb.r + 44 / W);
      const yb = Math.min(0.975, Math.max(pb.b + 0.045, 0.9));
      geo.exitY = yb + 1 / H;
      return [
        [tin, 0],
        [tin, 0.04],
        [xr, 0.15],
        [xr, yb],
        [tout, yb],
        [tout, 1],
      ];
    },
  });

  // the folio fades in with the stage; its digits follow the mocked place (render() scrambles them)
  fx.folio(root.querySelector('.folio'), { scramble: false });
  fx.reveal(root.querySelector('.h-scene'), { sub: root.querySelector('.sub') });

  if (ctx.reduced) {
    seg.progress = 1;
    return;
  }

  // ------------------------------------------------------------ per-frame render
  const state = { min: 18, snap: SNAP_F0 };
  let cur = null;
  const last = { prog: -1, beat: 0, min: '', snap: -1 };

  function render(force) {
    if (!cur || (!near && !force)) return;
    const p = cur.tl.progress();
    const H = seg.height;
    const vh = window.innerHeight;
    const top = stage.getBoundingClientRect().top;
    const lineY = 0.6 * vh - top;
    const hold = seg.progressAtY((0.6 * vh) / H);
    let prog;
    if (p <= 0) prog = Math.min(hold, seg.progressAtY(lineY / H));
    else if (p < X0) prog = hold;
    else {
      prog = lerp(hold, Math.max(hold, seg.progressAtY(geo.exitY)), smooth(clamp01((p - X0) / (1 - X0))));
      if (top < -0.5 || p >= 1) prog = Math.max(prog, seg.progressAtY(lineY / H));
    }
    if (Math.abs(prog - last.prog) > 1e-6) seg.progress = last.prog = prog;

    // one place at a time: folio, HUD and a pulse on every tap
    let beat = 0;
    while (beat < TAP.length && p >= TAP[beat]) beat++;
    if (beat !== last.beat) {
      const ll = beat ? FAVS[beat - 1] : CHENNAI;
      fx.scramble(folioDigits, fmtFolio(ll), { duration: ctx.env.shots ? 0 : 0.4 });
      hud.set({ lat: ll[0], lng: ll[1], extra: 'ACC 3 M', mock: true });
      if (beat > last.beat) traveler.pulse();
      last.beat = beat;
    }

    // the route widget counts down
    const m = String(Math.round(state.min));
    if (m !== last.min) minEl.textContent = last.min = m;
    if (state.snap !== last.snap) {
      last.snap = state.snap;
      const pt = dotAt(state.snap);
      snapDot.setAttribute('cx', pt.x.toFixed(1));
      snapDot.setAttribute('cy', pt.y.toFixed(1));
      snapDriven.style.setProperty('--driven', state.snap.toFixed(4));
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

  // the folio settles on whichever place is mocked right now
  const folioNow = () => fx.scramble(folioDigits, fmtFolio(last.beat ? FAVS[last.beat - 1] : CHENNAI), { duration: ctx.env.shots ? 0 : 0.4 });
  folioDigits.textContent = fmtFolio(CHENNAI);
  ctx.ScrollTrigger.create({ trigger: root.querySelector('.folio'), start: 'top 75%', onEnter: folioNow, onEnterBack: folioNow });

  // The dot rides the head beside the phone; it hides while the head runs behind the glass.
  const HIDDEN = { hidden: true };
  traveler.follow(() => {
    if (!cur || !near) return null;
    const L = 0.6 * window.innerHeight;
    const r = root.getBoundingClientRect();
    if (!(r.top <= L + 0.5 && r.bottom > L)) return null;
    render();
    const h = seg.headScreen();
    const b = phone.getBoundingClientRect();
    if (h.x > b.left + 4 && h.x < b.right - 4 && h.y > b.top + 4 && h.y < b.bottom - 4) return HIDDEN;
    return null;
  });

  // ------------------------------------------------------------ punches: the world relocates
  const teleport = (i) =>
    gsap
      .timeline({ paused: true })
      .fromTo(
        tele,
        { x: DISTRICTS[i][0], y: DISTRICTS[i][1], skewX: 0 },
        { x: DISTRICTS[i + 1][0], y: DISTRICTS[i + 1][1], skewX: 8, duration: 0.001, immediateRender: false },
        0.001,
      )
      .to(tele, { skewX: 0, duration: 0.001 }, 0.034);

  function build() {
    const accent = ctx.tokens.color.accent;
    const fg = ctx.tokens.color.fg;
    const CLIP0 = 'circle(0% at 30% 50%)';
    const CLIP1 = 'circle(150% at 30% 50%)';

    Object.assign(state, { min: 18, snap: SNAP_F0 });
    last.beat = 0;
    gsap.set(shade, { yPercent: -101, y: 0 });
    gsap.set(scrim, { autoAlpha: 0 });
    gsap.set(fills, { clipPath: CLIP0 });
    gsap.set(touches, { autoAlpha: 0 });
    gsap.set(nums, { color: 'rgba(238, 234, 226, 0)', webkitTextStrokeColor: 'rgba(238, 234, 226, 0.3)' });
    gsap.set(widgets, { autoAlpha: 0, y: 40, scale: 0.92, transformOrigin: '50% 100%' });
    gsap.set(thumb, { xPercent: 0, x: 0, backgroundColor: 'rgba(238, 234, 226, 0.6)' });
    gsap.set(sw, { borderColor: 'rgba(238, 234, 226, 0.6)' });
    gsap.set(favOff, { autoAlpha: 1 });
    gsap.set(favOn, { autoAlpha: 0 });
    gsap.set(barFill, { scaleX: 0.22 });
    gsap.set(flash, { autoAlpha: 0 });

    const { tl, punch } = ctx.pinTimeline({ stage, vh: 100, mobileVh: 70, scrub: 0.6, snap: 'labelsDirectional', invalidate: false });
    const nIR = { immediateRender: false };

    tl.addLabel('in', 0);

    // ---- the shade drops over the home screen
    tl.fromTo(shade, { yPercent: -101 }, { yPercent: 0, duration: 0.08, ease: 'back.out(1.2)', ...nIR }, 0.0)
      .fromTo(scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05, ...nIR }, 0.0)
      // the shade has its own big clock: the status-bar time steps aside while it is down
      .fromTo(barTime, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.02, ...nIR }, 0.0);

    // ---- four taps: one tile on, the previous one off on the same frame
    TAP.forEach((t, i) => {
      tl.fromTo(touches[i], { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: 0.012, ...nIR }, t - 0.02)
        .to(touches[i], { autoAlpha: 0, scale: 0.8, duration: 0.014 }, t + 0.008)
        .fromTo(fills[i], { clipPath: CLIP0 }, { clipPath: CLIP1, duration: 0.035, ease: 'power2.out', ...nIR }, t)
        .fromTo(nums[i], { color: 'rgba(238, 234, 226, 0)', webkitTextStrokeColor: 'rgba(238, 234, 226, 0.3)' }, { color: fg, webkitTextStrokeColor: fg, duration: 0.012, ...nIR }, t);
      if (i > 0) {
        tl.set(fills[i - 1], { clipPath: CLIP0 }, t).set(nums[i - 1], { color: 'rgba(238, 234, 226, 0)', webkitTextStrokeColor: 'rgba(238, 234, 226, 0.3)' }, t);
      }
      tl.addLabel(`tile${i + 1}`, t + 0.05);
      punch(t, teleport(i));
    });

    // ---- the shade yanks up; the widgets land
    tl.to(shade, { yPercent: -101, duration: 0.055, ease: 'power3.in' }, 0.6)
      .to(barTime, { autoAlpha: 1, duration: 0.02 }, 0.64)
      .to(scrim, { autoAlpha: 0, duration: 0.04 }, 0.62)
      .to(widgets, { autoAlpha: 1, y: 0, scale: 1, duration: 0.06, stagger: 0.035, ease: 'back.out(1.6)' }, 0.66)
      .addLabel('widgets', 0.79)
      // the live route: progress fills with scroll, minutes count down
      .to(barFill, { scaleX: 0.64, duration: 0.2, ease: 'none' }, 0.78)
      .to(state, { min: 11, duration: 0.2, ease: 'none' }, 0.78);
    // the snapshot refreshes in discrete frames, like the widget's periodic refresh
    SNAP_AT.forEach((t, i) => {
      tl.set(state, { snap: SNAP_F[i] }, t)
        .set(flash, { autoAlpha: 0.22 }, t)
        .to(flash, { autoAlpha: 0, duration: 0.012, ease: 'power1.out' }, t + 0.001);
    });
    tl.addLabel('out', 1);

    cur = { tl };
    render();
    return () => {
      cur = null;
      last.beat = 0;
    };
  }

  ctx.media({ desktop: build, mobile: build });
}
