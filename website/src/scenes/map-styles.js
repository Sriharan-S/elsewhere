// Scene 08: map-styles. "Five looks. Same pin."
// The thread runs down into a square frame and stops on the pin at its centre. Five styles of the same
// streets replace each other with hard Swiss wipes (clip-path inset, expo.inOut) while the pin never
// moves; the label strip flips like a split-flap. On 3D the map tilts back and prisms rise. Last, the
// frame steps back and the favorites and history ledger types in. Then the thread leaves the pin.
import './map-styles.css';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const WIPES = [0.1, 0.27, 0.44, 0.61]; // layer i+1 wipes in at these
const WIPE_D = 0.09;
const LABELS = ['streets', 'minimal', 'dark', 'satellite', '3d'];

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, fx, tokens } = ctx;
  const stage = root.querySelector('.stage');
  const frame = root.querySelector('.ms-frame');
  const layers = [...root.querySelectorAll('.ms-layer')];
  const plane = root.querySelector('.ms-plane');
  const bldgs = [...root.querySelectorAll('.ms-b')];
  const edge = root.querySelector('.ms-edge');
  const strip = root.querySelector('.ms-strip');
  const flap = root.querySelector('.ms-flap');
  const count = root.querySelector('.ms-count');
  const folio = root.querySelector('.folio');
  const title = root.querySelector('.ms-title');
  const sub = root.querySelector('.ms-sub');
  const ledger = root.querySelector('.ms-ledger');
  const tin = parseFloat(root.dataset.threadIn || '0.38');
  const tout = parseFloat(root.dataset.threadOut || '0.62');
  const names = layers.map((l) => l.dataset.style || '');

  // ------------------------------------------------------------ geometry (stage px, untransformed layout boxes)
  function geo() {
    const W = Math.max(1, stage.clientWidth);
    const H = Math.max(1, stage.clientHeight);
    const S = frame.offsetWidth;
    const fl = frame.offsetLeft;
    const ft = frame.offsetTop;
    const mobile = window.innerWidth < 768;
    const folioTop = folio.offsetTop; // .copy sits at the stage's inset 0
    return {
      W, H, S, mobile,
      cx: fl + S / 2,
      cy: ft + S / 2,
      fTop: ft,
      fBot: ft + S,
      yA: Math.max(folioTop - 26, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) + 10 || 72),
      xR: W - (mobile ? 18 : 40),
    };
  }

  const motion = !env.reduced;
  let pC = 0.5;
  const seg = thread.segment(root, {
    stage,
    radius: window.innerWidth < 768 ? 18 : 28,
    points: (W, H) => {
      if (!motion) {
        // static frame: hug the right edge, then back to the exit
        return [[tin, 0], [tin, 0.02], [0.975, 0.02], [0.975, 0.985], [tout, 0.985], [tout, 1]];
      }
      const g = geo();
      const n = ([x, y]) => [x / W, y / H];
      const yB = g.fBot + 44;
      const pts = g.mobile
        ? [[tin * W, 0], [tin * W, g.yA], [g.xR, g.yA], [g.xR, g.fTop - 22], [g.cx, g.fTop - 22], [g.cx, g.cy], [g.cx, yB], [tout * W, yB], [tout * W, H]]
        : [[tin * W, 0], [tin * W, g.yA], [g.cx, g.yA], [g.cx, g.cy], [g.cx, yB], [tout * W, yB], [tout * W, H]];
      return pts.map(n);
    },
  });

  /** Fraction of the segment closest to the frame centre (where the head waits on the pin). */
  function findCentre() {
    const g = geo();
    let best = 0.5;
    let bd = Infinity;
    for (let i = 0; i <= 600; i++) {
      const p = i / 600;
      const pt = seg.pointAt(p);
      const d = Math.hypot(pt.x - g.cx, pt.y - g.cy);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    pC = best;
  }

  if (!motion) {
    seg.progress = 1;
    return;
  }

  // ------------------------------------------------------------ state
  const S = { tilt: 0, scale: 1 };
  const wipes = WIPES.map(() => ({ v: 100 }));
  const T = { lead: 0, exit: 0 };
  let G = geo();
  findCentre();
  ScrollTrigger.addEventListener('refresh', () => {
    G = geo();
    findCentre();
    setProgress();
  });

  function setProgress() {
    seg.progress = T.exit > 0 ? pC + T.exit * (1 - pC) : T.lead * pC;
  }

  // the frame's own road follows the draw head (flat styles: the frame box; 3D: the tilted plane)
  let lastR = -1;
  let lastRp = -1;
  function syncRoad() {
    const hy = seg.pointAt(seg.progress).y;
    const s = S.scale || 1;
    const ys = (hy - G.cy) / s; // offset from the centre in unscaled frame px
    const r = clamp01(ys / G.S + 0.5);
    const th = (S.tilt * Math.PI) / 180;
    const P = 2.15 * G.S;
    const den = Math.cos(th) * P + ys * Math.sin(th);
    const v = den > 1 ? (ys * P) / den : ys > 0 ? 1e6 : -1e6;
    const rp = clamp01((v + 1.4 * G.S) / (2.8 * G.S));
    if (Math.abs(r - lastR) > 0.0005) frame.style.setProperty('--ms-reveal', (lastR = r).toFixed(4));
    if (Math.abs(rp - lastRp) > 0.0005) frame.style.setProperty('--ms-reveal-p', (lastRp = rp).toFixed(4));
  }

  // ------------------------------------------------------------ the split-flap label
  let shown = -1;
  function flapTo(i, animate = true) {
    if (i === shown) return;
    shown = i;
    const text = names[i].toUpperCase();
    flap.innerHTML = [...text].map((c) => `<span class="ms-fc">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
    count.textContent = `${String(i + 1).padStart(2, '0')} / 05`;
    if (!animate || env.shots) return;
    gsap.fromTo(
      flap.children,
      { rotationX: -92, opacity: 0.2 },
      { rotationX: 0, opacity: 1, duration: 0.42, stagger: 0.03, ease: 'back.out(1.6)', overwrite: true },
    );
  }

  function render() {
    // the active wipe's edge rides the cut
    let ex = null;
    let idx = 0;
    wipes.forEach((w, i) => {
      // a finished wipe snaps to exactly inset(0) and the style under it is hidden (no sliver at the edge)
      const v = w.v < 0.5 ? 0 : w.v > 99.5 ? 100 : w.v;
      layers[i + 1].style.clipPath = `inset(0% 0% 0% ${v.toFixed(3)}%)`;
      layers[i].style.visibility = v === 0 ? 'hidden' : '';
      if (v > 0 && v < 100) ex = v;
      if (w.v < 50) idx = i + 1;
    });
    if (ex === null) edge.style.opacity = '0';
    else {
      // the bone edge fades out as the cut reaches either side of the frame, so none is left behind
      edge.style.opacity = Math.min(1, Math.min(ex, 100 - ex) / 6).toFixed(3);
      edge.style.transform = `translateX(${((ex / 100) * G.S).toFixed(1)}px)`;
    }
    flapTo(idx);
    plane.style.setProperty('--tilt', `${S.tilt.toFixed(2)}deg`);
    syncRoad();
  }

  // ------------------------------------------------------------ entries
  const PLACE = tokens.places[2];
  let llPrev = null;
  ScrollTrigger.create({
    trigger: stage,
    start: 'top 60%',
    onEnter: () => {
      llPrev = ctx.hud.state;
      ctx.hud.set({ lat: PLACE.lat, lng: PLACE.lng });
    },
    onLeaveBack: () => llPrev && ctx.hud.set({ lat: llPrev.lat, lng: llPrev.lng }),
  });
  fx.folio(folio);
  fx.reveal(title, { sub, start: 'top 75%' });

  // lead-in: the head travels from the stage top (on the 60% line) down to the pin as the stage rises
  ScrollTrigger.create({
    trigger: stage,
    start: 'top 60%',
    end: 'top top',
    onUpdate: (s) => {
      T.lead = s.progress;
      setProgress();
    },
    onRefresh: (s) => {
      T.lead = s.progress;
      setProgress();
    },
    onLeave: () => {
      T.lead = 1;
      setProgress();
    },
    onLeaveBack: () => {
      T.lead = 0;
      setProgress();
    },
  });

  // ------------------------------------------------------------ the pinned timeline
  const { tl, punch } = ctx.pinTimeline({ stage, vh: 80, mobileVh: 60, scrub: 0.6, snap: 'labelsDirectional' });
  gsap.set(layers.slice(1), { clipPath: 'inset(0% 0% 0% 100%)' });
  gsap.set(bldgs, { '--rise': 0.001 });
  flapTo(0, false);
  tl.addLabel(LABELS[0], 0.02);

  WIPES.forEach((at, i) => {
    tl.fromTo(wipes[i], { v: 100 }, { v: 0, duration: WIPE_D, ease: tokens.ease.wipe, onUpdate: render, immediateRender: false }, at)
      .addLabel(LABELS[i + 1], at + WIPE_D + 0.005);
  });
  // 3D: the tilt starts with the 3D wipe itself and the prisms rise while the label flips, so the frame
  // is already leaning back with tall buildings when it reads 3D BUILDINGS
  const T3 = WIPES[3];
  tl.fromTo(S, { tilt: 0 }, { tilt: 55, duration: 0.1, ease: 'power2.inOut', onUpdate: render, immediateRender: false }, T3)
    .fromTo(
      bldgs,
      { '--rise': 0.001 },
      {
        '--rise': 1,
        duration: 0.07,
        ease: 'back.out(1.3)',
        stagger: { each: 0.003, from: 'center' },
        immediateRender: false,
      },
      T3 + 0.03,
    );
  tl.removeLabel(LABELS[4]);
  tl.addLabel(LABELS[4], 0.8);

  // ledger: the frame steps back around the pin (which stays put) and the rows type in
  const mobile = () => window.innerWidth < 768;
  const rows = [...ledger.querySelectorAll('.ms-led-h, .ms-t, .ms-type, .ms-time')];
  const typed = rows.map((r) => fx.split(r, { type: 'chars', mask: false }));
  const chars = typed.flatMap((t) => t.chars);
  const dots = [...ledger.querySelectorAll('.ms-dot')];
  const rules = [...ledger.querySelectorAll('.ms-hist, .ms-hist .ms-row')];
  gsap.set(chars, { opacity: 0 });
  gsap.set(dots, { scale: 0 });
  gsap.set(rules, { borderColor: 'transparent' });

  tl.fromTo(
    S,
    { scale: 1 },
    { scale: () => (mobile() ? 0.86 : 0.78), duration: 0.08, ease: 'power3.inOut', onUpdate: () => { gsap.set(frame, { scale: S.scale }); gsap.set(strip, { y: -(1 - S.scale) * G.S * 0.5 }); render(); }, immediateRender: false },
    0.87,
  )
    .fromTo(chars, { opacity: 0 }, { opacity: 1, duration: 0.004, stagger: 0.0011, ease: 'none', immediateRender: false }, 0.885)
    .fromTo(dots, { scale: 0 }, { scale: 1, duration: 0.02, stagger: 0.012, ease: 'back.out(2)', immediateRender: false }, 0.89)
    .fromTo(rules, { borderColor: 'transparent' }, { borderColor: tokens.color.hair, duration: 0.03, stagger: 0.01, immediateRender: false }, 0.9);
  // mobile: the ledger takes the headline's place
  ctx.media({
    mobile: () => {
      const out = gsap.timeline();
      out.fromTo([title, sub], { opacity: 1, y: 0 }, { opacity: 0, y: -24, duration: 0.04, ease: 'power2.in', immediateRender: false });
      tl.add(out, 0.87);
      return () => {
        tl.remove(out);
        gsap.set([title, sub], { clearProps: 'opacity,y' });
      };
    },
  });
  tl.addLabel('ledger', 1);

  // the fix gives a calm pulse when the ledger lands (favorites are where you can go next)
  const ring = ctx.traveler.el?.querySelector('.traveler__ring');
  if (ring) punch(0.9, gsap.fromTo(ring, { scale: 1, opacity: 1 }, { scale: 3, opacity: 0, duration: 0.9, ease: 'power2.out', paused: true }));

  // exit: the thread leaves the pin and rides down to the next scene as the stage rises
  ScrollTrigger.create({
    trigger: root,
    start: 'bottom bottom',
    end: 'bottom 60%',
    onUpdate: (s) => {
      T.exit = s.progress;
      setProgress();
    },
    onLeave: () => {
      T.exit = 1;
      setProgress();
    },
    onLeaveBack: () => {
      T.exit = 0;
      setProgress();
    },
  });

  // Render from the ticker as well: ScrollTrigger refreshes re-render the timeline with events suppressed,
  // so onUpdate alone can leave the DOM on a stale frame.
  let lastP = -1;
  let near = false;
  ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: (s) => (near = s.isActive), onRefresh: (s) => (near = s.isActive) });
  ctx.loop.add(() => {
    if (!near) return;
    const p = tl.progress();
    if (p !== lastP) {
      lastP = p;
      render();
    } else syncRoad();
  });
  render();
}
