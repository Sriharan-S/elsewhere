// Scene 03: still-driving. Close the app, the drive keeps going, then it parks.
//
// Two ways to run:
//  - merged (the storyboard): the-drive publishes { tl, stage, seg, punch, state, dot, focus, parts } via
//    ctx.shared.set('drive'). This scene moves its copy, phone and PARKED word into that stage and adds its
//    tweens to the same 0..1 timeline (close 0.55, arrive 0.82, parked 0.96), so the dot never pauses.
//    Its own section is emptied (zero height). The drive already stops at the pin, sets the numeral to 0,
//    fills the destination pin with ripples, sets the HUD and drops its road headline; this scene owns the
//    phone, its copy and the PARKED slam.
//  - standalone (no drive published, or reduced motion): its own pinned stage continues the drive,
//    brakes into a destination pin, fills it orange and parks. The storyboard's 0.5..1 range maps onto
//    this stage's own 0..1 timeline.
import './still-driving.css';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pad = (n) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const NS = 'http://www.w3.org/2000/svg';
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// Demo trip (agrees with the-drive's mode strip): 42 min at 48 km/h, arrive by 18:30, so a 17:48 start.
const TRIP_MIN = 42;
const START_MIN = 17 * 60 + 48;
const clockAt = (f) => {
  const m = Math.round(START_MIN + TRIP_MIN * clamp(f));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};
const etaAt = (f) => {
  const s = Math.round(TRIP_MIN * 60 * (1 - clamp(f)));
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
};

export function init(ctx) {
  const drive = !ctx.reduced ? ctx.shared.get('drive') : null;
  if (drive && drive.tl && drive.stage && !drive.reduced) return merged(ctx, drive);
  return standalone(ctx);
}

/* ============================================================== shared pieces */

function nodes(root) {
  const q = (s) => root.querySelector(s);
  return {
    stage: q('.sd-stage'),
    world: q('.sd-world'),
    props: q('.sd-props'),
    dest: q('.sd-dest'),
    pin: q('.sd-dest__pin'),
    hole: q('.sd-dest__hole'),
    ripples: [...root.querySelectorAll('.sd-ripple')],
    car: q('.sd-car'),
    speedWrap: q('.sd-speed'),
    speed: q('.sd-speed__n'),
    readout: q('.sd-readout'),
    kmh: q('.sd-kmh'),
    brg: q('.sd-brg'),
    eta: q('.sd-eta'),
    state: q('.sd-state'),
    copy: q('.sd-copy'),
    folio: q('.sd-copy .folio'),
    title: q('.sd-title'),
    sub: q('.sd-sub'),
    device: q('.sd-device'),
    phone: q('.sd-phone'),
    barTime: q('.sd-bar-time'),
    app: q('.sd-app'),
    recents: q('.sd-recents'),
    recentsApp: q('.sd-recents__app'),
    lock: q('.sd-lock'),
    clock: q('.sd-clock__t'),
    pill: q('.sd-pill'),
    pillT: q('.sd-pill__t'),
    pillS: q('.sd-pill__s'),
    mini: q('.sd-mini'),
    miniMap: q('.sd-mini__map'),
    miniWorld: q('.sd-mini__world'),
    miniPlan: q('.sd-mini__plan'),
    miniDriven: q('.sd-mini__driven'),
    miniCar: q('.sd-mini__car'),
    appLeft: q('.sd-app-left'),
    appKmh: q('.sd-app-kmh'),
    appBar: q('.sd-sheet__bar i'),
    parked: q('.sd-parked'),
    parkedW: q('.sd-parked__w'),
  };
}

/** PARKED is sized so that, at wdth 125, it spans its box. */
function fitParked(n) {
  const w = n.parkedW;
  const prev = w.style.getPropertyValue('--wdth');
  w.style.setProperty('--wdth', '125');
  n.parked.style.fontSize = '100px';
  const w100 = w.getBoundingClientRect().width || 1;
  n.parked.style.fontSize = '';
  if (prev) w.style.setProperty('--wdth', prev);
  else w.style.removeProperty('--wdth');
  const box = n.parked.clientWidth || window.innerWidth * 0.9;
  n.parked.style.setProperty('--fit-size', `${((100 * box) / w100).toFixed(2)}px`);
}

/**
 * The phone story, the headline swap and the PARKED slam, on any 0..1 timeline.
 * P(m) maps a storyboard position (0.55 close, 0.82 arrive, 0.96 parked) to the host timeline, D(d) a duration.
 * mini: { frame() -> { x, y, angle, driven } in map units, z (px per unit) } for the app's mini-map.
 */
function story(ctx, n, o) {
  const { gsap, fx, hud, ScrollTrigger, env } = ctx;
  const { tl, punch, P, D, tripAt, kmhAt, mini, revealOnEnter = false, setHud = false, onSlam } = o;

  // ---- phone: slides up, shows the app (its mini-map mirrors the world), recents, then the lock screen
  n.app.hidden = false;
  n.recents.hidden = false;
  gsap.set(n.recents, { autoAlpha: 0 });
  gsap.set(n.recentsApp, { autoAlpha: 0, y: 6 });
  gsap.set([n.lock, n.pill], { autoAlpha: 0 });
  gsap.set(n.app, { scale: 1, yPercent: 0, rotation: 0, autoAlpha: 1 });

  tl.fromTo(n.phone, { yPercent: 140 }, { yPercent: 0, duration: D(0.05), ease: 'power3.out' }, P(0.535)); // 140%: below even a tall stage
  tl.to(n.recents, { autoAlpha: 1, duration: D(0.02), ease: 'none' }, P(0.625));
  tl.to(n.app, { scale: 0.8, duration: D(0.035), ease: 'power2.out' }, P(0.625));
  tl.to(n.recentsApp, { autoAlpha: 1, y: 0, duration: D(0.02) }, P(0.64));
  tl.to(n.app, { yPercent: -122, rotation: -4, duration: D(0.03), ease: 'power3.in' }, P(0.665));
  tl.to(n.recentsApp, { autoAlpha: 0, duration: D(0.012), ease: 'none' }, P(0.672));
  tl.to(n.lock, { autoAlpha: 1, duration: D(0.025), ease: 'none' }, P(0.698));
  tl.fromTo(
    n.pill,
    { yPercent: -180, autoAlpha: 0 },
    { yPercent: 0, autoAlpha: 1, duration: D(0.04), ease: 'back.out(1.4)', immediateRender: false },
    P(0.728),
  );

  // ---- the headline. Merged: a punch (real-time entry) when the drive passes close.
  // Standalone, the scene is its own chapter, so the headline enters with the stage like the others.
  if (revealOnEnter) {
    fx.folio(n.folio);
    fx.reveal(n.title, { sub: n.sub });
  } else {
    const folioIdx = document.querySelector('[data-folio-index]');
    const own = n.folio.querySelector('.folio__n')?.textContent.slice(0, 2) || '03';
    let idxPrev = null;
    const intro = fx.headline(n.title);
    intro.eventCallback('onStart', () => {
      if (!folioIdx) return;
      idxPrev = folioIdx.textContent;
      folioIdx.textContent = own;
    });
    intro.eventCallback('onReverseComplete', () => folioIdx && idxPrev && (folioIdx.textContent = idxPrev));
    // the whole copy block is hidden until close (CSS keeps it hidden too if a refresh ever strips this)
    intro.fromTo(n.copy, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, ease: 'none' }, 0);
    intro.fromTo([n.folio, n.sub], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.06 }, 0.3);
    const scr = n.folio.querySelector('[data-scramble]');
    const scrText = scr?.textContent || '';
    intro.call(() => scr && fx.scramble(scr, scrText, { duration: env.shots ? 0 : 0.4 }), null, 0.3);
    punch(P(0.55), intro);
  }

  // ---- PARKED: slams across the width (wdth 62 -> 125, 0.4s, expo.out)
  fitParked(n);
  ScrollTrigger.addEventListener('refreshInit', () => fitParked(n));
  let hudPrev = null;
  const slam = gsap.timeline({
    paused: true,
    onStart: () => {
      if (!setHud) return;
      hudPrev = hud.state.extra;
      hud.set({ extra: '0 KM/H · PARKED' });
    },
    onReverseComplete: () => {
      if (setHud) hud.set({ extra: hudPrev && hudPrev !== '0 KM/H · PARKED' ? hudPrev : 'ACC 3 M' });
    },
  });
  slam.fromTo(
    n.parkedW,
    { '--wdth': 62, autoAlpha: 0, yPercent: 18 },
    { '--wdth': 125, autoAlpha: 1, yPercent: 0, duration: 0.4, ease: 'expo.out' },
  );
  onSlam?.(slam);
  punch(P(0.96), slam);

  // ---- mini-map strokes in map units (the map group scales by z)
  const z = mini.z;
  n.miniPlan.setAttribute('stroke-width', (3 / z).toFixed(3));
  n.miniPlan.setAttribute('stroke-dasharray', `${(7 / z).toFixed(2)} ${(6 / z).toFixed(2)}`);
  n.miniDriven.setAttribute('stroke-width', (5 / z).toFixed(3));

  // ---- the notification: a route while it drives; on arrival the app holds the destination as a fixed
  // mock ("Mock location active · Arrived · holding <place>", as MockingService posts it)
  const PILL = { route: 'Mock route active', held: n.pillT?.textContent || 'Mock location active' };
  const pillState = (arrived) => {
    if (!n.pillT || st.arrived === arrived) return;
    st.arrived = arrived;
    n.pillT.textContent = arrived ? PILL.held : PILL.route;
    if (n.pillS) n.pillS.hidden = !arrived;
  };

  // ---- clocks, app sheet, mini-map: written every tick while the phone is up
  const st = { last: '', rot: null, arrived: null };
  pillState(false);
  const tick = () => {
    const p = tl.progress();
    if (p < P(0.52) || p > P(1)) return;
    const f = tripAt(p);
    const t = clockAt(f);
    if (t !== st.last) {
      st.last = t;
      n.barTime.textContent = t;
      n.clock.textContent = t;
    }
    pillState(f >= 0.999);
    if (p > P(0.7)) return;
    n.appLeft.textContent = String(Math.max(0, Math.round(TRIP_MIN * (1 - f))));
    n.appKmh.textContent = String(Math.round(kmhAt(p)));
    n.appBar.style.transform = `scaleX(${f.toFixed(4)})`;
    const c = mini.frame();
    if (!c) return;
    // heading-up: the map turns so the car always points up (smoothed, like a nav app)
    const target = -90 - c.angle;
    st.rot = st.rot === null || env.shots ? target : st.rot + wrap180(target - st.rot) * 0.14;
    n.miniMap.setAttribute(
      'transform',
      `translate(150 400) rotate(${st.rot.toFixed(2)}) scale(${z}) translate(${(-c.x).toFixed(2)} ${(-c.y).toFixed(2)})`,
    );
    const L = mini.planLen() || 1;
    n.miniDriven.style.strokeDasharray = `${c.driven.toFixed(2)} ${(L + 50).toFixed(0)}`;
  };
  ctx.loop.add(tick);
  tick();
}

/* ============================================================== merged into the drive stage */

function merged(ctx, drive) {
  const { root, gsap, traveler } = ctx;
  const n = nodes(root);
  const dstage = drive.stage;
  const tl = drive.tl;
  const punch = drive.punch;
  const parts = drive.parts || {};
  const P = (m) => m;
  const D = (d) => d;
  const U_GO = drive.labels?.go ?? 0.08;
  const U_TIP = 0.905;

  // move the copy, phone and PARKED word into the drive stage; this section collapses
  n.parked.classList.add('sd-parked--merged');
  n.device.classList.add('sd-device--merged');
  dstage.append(n.copy, n.device, n.parked);
  n.stage.remove();
  root.classList.add('sd-merged');

  // a twin of the dot that slips under the phone glass (the traveler itself sits above every layer)
  const ghost = document.createElement('div');
  ghost.className = 'sd-ghost';
  ghost.innerHTML =
    '<svg viewBox="-12 -12 24 24" width="24" height="24" aria-hidden="true" focusable="false">' +
    '<circle class="sd-ghost__dot" r="7" /><path class="sd-ghost__chev" d="M0 -11 8 9 0 4.6 -8 9Z" /></svg>';
  n.device.prepend(ghost);
  const G = { under: false };
  traveler.follow(() => (G.under ? { hidden: true } : null));
  const phoneUp = () => parseFloat(n.phone.style.opacity || '1') > 0.5;
  const ghostTick = () => {
    const p = tl.progress();
    let under = false;
    if (p > 0.53 && p < 1 && typeof drive.dot === 'function' && phoneUp()) {
      const d = drive.dot();
      const r = n.phone.getBoundingClientRect();
      const pad = 10;
      under = d.x > r.left - pad && d.x < r.right + pad && d.y > r.top - pad && d.y < r.bottom + pad;
      if (under) {
        const s = dstage.getBoundingClientRect();
        const chev = traveler.el?.classList.contains('is-chevron');
        ghost.classList.toggle('is-chev', !!chev);
        ghost.style.transform = `translate(${(d.x - s.left).toFixed(1)}px, ${(d.y - s.top).toFixed(1)}px) rotate(${((d.angle || 0) + 90).toFixed(1)}deg)`;
      }
    }
    if (under !== G.under) {
      G.under = under;
      ghost.classList.toggle('is-on', under);
    }
  };
  ctx.loop.add(ghostTick);

  // make room for the phone; give the speed back on mobile when the phone leaves at arrival
  const overview = dstage.querySelector('.drive__overview');
  const panel = dstage.querySelector('.drive__panel');
  const numWrap = dstage.querySelector('.drive__num');
  ctx.media({
    desktop: () => {
      if (overview)
        tl.fromTo(overview, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.02, ease: 'none', immediateRender: false }, 0.53);
      // arrive: the locked phone steps out to the right, so PARKED lands on a clear frame
      const out = gsap.fromTo(n.phone, { xPercent: 0, autoAlpha: 1 }, { xPercent: 30, autoAlpha: 0, duration: 0.4, ease: 'power3.in', paused: true });
      punch(0.82, out);
      return () => gsap.set(n.phone, { clearProps: 'opacity,visibility,transform' });
    },
    mobile: () => {
      const f = drive.focus;
      const fy = f ? f.y : 0.47;
      // keep the car above the phone while it is up; the drive parks the destination there too
      if (f) tl.fromTo(f, { y: fy }, { y: 0.4, duration: 0.04, ease: 'power2.inOut', immediateRender: false }, 0.54);
      // the speed and the strip make way for the phone; the strip comes back (the numeral does not)
      // once the phone, locked with its pill, has stayed in the lower half up to PARKED
      if (numWrap) tl.to(numWrap, { autoAlpha: 0, duration: 0.02, ease: 'none' }, 0.53);
      if (panel) {
        tl.to(panel, { autoAlpha: 0, duration: 0.02, ease: 'none' }, 0.53);
        tl.to(panel, { autoAlpha: 1, duration: 0.025, ease: 'none' }, 0.965);
      }
      tl.to(n.phone, { yPercent: 140, duration: 0.03, ease: 'power3.in' }, 0.952);
    },
  });

  // mini-map: a clone of the drive's own road network, in route units
  const routeEl = document.getElementById('drive-route');
  const roadsGeo = dstage.querySelector('.drive__roads .drive__geo');
  if (roadsGeo && routeEl) {
    const g = roadsGeo.cloneNode(true);
    g.removeAttribute('transform');
    g.setAttribute('class', 'sd-mini__roads');
    // the drive fades its roads in by hierarchy (inline opacity); the phone's copy is always lit
    g.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
    n.miniWorld.replaceChildren(g);
    for (const el of [n.miniPlan, n.miniDriven]) {
      const u = document.createElementNS(NS, 'use');
      u.setAttribute('href', '#drive-route');
      u.setAttribute('class', el.getAttribute('class'));
      el.replaceWith(u);
    }
    n.miniPlan = n.miniMap.querySelector('.sd-mini__plan');
    n.miniDriven = n.miniMap.querySelector('.sd-mini__driven');
  }
  const RL = routeEl ? routeEl.getTotalLength() : 1;
  const mini = {
    z: 2.6,
    planLen: () => RL,
    frame: () => {
      if (!routeEl) return null;
      const s = clamp(drive.state?.s ?? 0);
      const a = routeEl.getPointAtLength(s * RL);
      const b = routeEl.getPointAtLength(Math.min(RL, s * RL + 6));
      const c = routeEl.getPointAtLength(Math.max(0, s * RL - 6));
      return { x: a.x, y: a.y, angle: (Math.atan2(b.y - c.y, b.x - c.x) * 180) / Math.PI, driven: s * RL };
    },
  };

  const tripAt = (u) => clamp((u - U_GO) / (U_TIP - U_GO));
  const kmhAt = () => drive.state?.kmh ?? 0;

  story(ctx, n, {
    tl,
    punch,
    P,
    D,
    tripAt,
    kmhAt,
    mini,
    // PARKED lands over the speed: clear the drive's own readouts from under it
    onSlam: (slam) => {
      const under = [parts.numeral?.closest?.('.drive__num') || numWrap, panel].filter(Boolean);
      if (under.length && !ctx.isMobile()) slam.to(under, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0);
    },
  });
}

/* ============================================================== standalone stage */

function standalone(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, traveler } = ctx;
  const n = nodes(root);
  const stage = n.stage;
  const tout = parseFloat(root.dataset.threadOut || '0.38');
  // under reduced motion the drive still publishes (its own final frame) and ends its thread at 0.38
  const tin = ctx.shared.get('drive') ? 0.38 : parseFloat(root.dataset.threadIn || '0.62');

  // local timeline positions (storyboard 0.5..1 -> 0..1)
  const P = (m) => clamp((m - 0.5) / 0.5);
  const D = (d) => d * 2;
  const T_ARRIVE = P(0.82); // brake begins
  const T_STOP = P(0.91); // wheels stop at the pin tip
  const T_SETTLE = P(0.935); // dot settled inside the pin

  // ---- the route: in from the drive above, a few blocks, a destination pin on the road, then the exit
  const DEST = { land: [0.235, 0.6], port: [0.16, 0.72] };
  const portrait = () => stage.clientWidth / Math.max(1, stage.clientHeight) < 1.05;
  const seg = thread.segment(root, {
    stage,
    radius: 30,
    points: () =>
      portrait()
        ? [
            [tin, 0],
            [tin, 0.4],
            [0.4, 0.4],
            [0.4, 0.62],
            [DEST.port[0], 0.62],
            [DEST.port[0], DEST.port[1]],
            [DEST.port[0], 0.9],
            [tout, 0.9],
            [tout, 1],
          ]
        : [
            [tin, 0],
            [tin, 0.58],
            [0.5, 0.58],
            [0.5, 0.7],
            [0.32, 0.7],
            [0.32, DEST.land[1]],
            DEST.land,
            [0.14, DEST.land[1]],
            [0.14, 0.84],
            [tout, 0.84],
            [tout, 1],
          ],
  });

  // geometry derived from the seg (rebuilt on refresh): dest fraction, cruise speeds by curvature
  const G = { destP: 0.8, lead: 0.3, kmh: new Float32Array(0), W: 1, H: 1, plan: 1 };
  function geometry() {
    G.W = stage.clientWidth;
    G.H = stage.clientHeight;
    n.props.setAttribute('viewBox', `0 0 ${G.W} ${G.H}`);
    n.props.setAttribute('preserveAspectRatio', 'none');
    const d = portrait() ? DEST.port : DEST.land;
    const tx = d[0] * G.W;
    const ty = d[1] * G.H;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= 600; i++) {
      const pt = seg.pointAt(i / 600);
      const dd = Math.hypot(pt.x - tx, pt.y - ty);
      if (dd < bd) ((bd = dd), (best = i / 600));
    }
    G.destP = best;
    G.lead = seg.tracking ? seg.leadEnd : seg.progressAtY(Math.min(0.95, (0.6 * window.innerHeight) / G.H));
    const tip = seg.pointAt(best);
    n.dest.setAttribute('transform', `translate(${tip.x.toFixed(1)} ${tip.y.toFixed(1)})`);
    // cruise speed: slower through bends (|delta angle| over a short window), smoothed
    const N = 240;
    const ang = [];
    for (let i = 0; i < N; i++) ang.push(seg.pointAt((i / (N - 1)) * best).angle);
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let c = 0;
      for (let k = -4; k <= 4; k++) {
        const a = ang[clamp(i + k, 0, N - 1)];
        const b = ang[clamp(i + k + 1, 0, N - 1)];
        let dA = Math.abs(b - a);
        if (dA > 180) dA = 360 - dA;
        c += dA;
      }
      raw[i] = lerp(52, 24, clamp(c / 25));
    }
    const sm = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = -8; j <= 8; j++) s += raw[clamp(i + j, 0, N - 1)];
      sm[i] = s / 17;
    }
    G.kmh = sm;
    buildMiniPlan();
  }

  // the mini-map's planned route in world units (the world here is static, so once per layout)
  const worldPan = n.world.querySelector('.world__pan');
  const toScreen = (x, y) => {
    const s = stage.getBoundingClientRect();
    return { x: s.left + (x * s.width) / G.W, y: s.top + (y * s.height) / G.H };
  };
  const toWorld = (sx, sy) => {
    const m = worldPan.getScreenCTM();
    return m ? new DOMPoint(sx, sy).matrixTransform(m.inverse()) : { x: 0, y: 0 };
  };
  function buildMiniPlan() {
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const pt = seg.pointAt((i / 120) * G.destP);
      const s = toScreen(pt.x, pt.y);
      const w = toWorld(s.x, s.y);
      pts.push(`${w.x.toFixed(1)} ${w.y.toFixed(1)}`);
    }
    n.miniPlan.setAttribute('d', 'M' + pts.join('L'));
    n.miniDriven.setAttribute('d', 'M' + pts.join('L'));
    G.plan = n.miniPlan.getTotalLength();
  }

  // ---- reduced motion: the final frame, no pin
  if (env.reduced) {
    seg.progress = 1;
    geometry();
    ScrollTrigger.addEventListener('refresh', geometry);
    fitParked(n);
    ScrollTrigger.addEventListener('refreshInit', () => fitParked(n));
    return;
  }

  seg.track({ until: 'pin' });
  geometry();
  ScrollTrigger.addEventListener('refresh', geometry);

  const { tl, punch } = ctx.pinTimeline({ stage, vh: 170, mobileVh: 115, scrub: 1.0, snap: false });
  tl.addLabel('close', P(0.55)).addLabel('arrive', T_ARRIVE).addLabel('parked', P(0.96));

  // ---- car: t is this timeline's progress; q = fraction of the seg length
  const car = { t: 0, x: 0, y: 0, angle: 0 };
  const exit = { k: 0 };
  const qAt = (t) => {
    const a = G.lead;
    const b = G.destP;
    const qA = lerp(a, b, 0.8);
    if (t <= T_ARRIVE) return lerp(a, qA, t / T_ARRIVE);
    if (t <= T_STOP) {
      const u = (t - T_ARRIVE) / (T_STOP - T_ARRIVE);
      return lerp(qA, b, 1 - (1 - u) * (1 - u)); // brake: power2.out, so speed falls linearly to 0
    }
    return b;
  };
  const kmhAt = (t) => {
    if (t >= T_STOP) return 0;
    const q = qAt(t);
    const i = Math.round(clamp(q / G.destP) * (G.kmh.length - 1));
    const base = G.kmh[i] || 40;
    if (t <= T_ARRIVE) return base;
    return base * (1 - (t - T_ARRIVE) / (T_STOP - T_ARRIVE));
  };
  // trip fraction: this stage picks the drive up at 55% and finishes it
  const tripAt = (t) => lerp(0.55, 1, clamp((qAt(t) - G.lead) / Math.max(1e-4, G.destP - G.lead)));

  let readKey = '';
  function renderCar() {
    const t = car.t;
    const q = qAt(t);
    const pt = seg.pointAt(q);
    let x = pt.x;
    let y = pt.y;
    const settle = clamp((t - T_STOP) / (T_SETTLE - T_STOP));
    if (settle > 0) {
      const tip = seg.pointAt(G.destP);
      x = tip.x;
      y = tip.y - 35.5 * (1 - Math.pow(1 - settle, 3));
    }
    Object.assign(car, { x, y, angle: pt.angle });
    n.car.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(pt.angle + 90).toFixed(1)})`);
    n.car.classList.toggle('is-chev', t > 0.002 && t < T_STOP);
    if (exit.k <= 0) {
      n.car.style.visibility = t > 0.0005 ? 'visible' : 'hidden';
      seg.run = clamp((q - G.lead) / Math.max(1e-4, 1 - G.lead));
    }
    const kmh = Math.round(kmhAt(t));
    const brg = Math.round((pt.angle + 90 + 360) % 360);
    const f = tripAt(t);
    const parked = t >= T_STOP;
    const key = `${kmh}|${brg}|${Math.round(f * 2520)}|${parked}`;
    if (key !== readKey) {
      readKey = key;
      n.speed.textContent = String(kmh);
      n.kmh.textContent = `${kmh} KM/H`;
      n.brg.textContent = `BRG ${String(brg).padStart(3, '0')}°`;
      n.eta.textContent = `ETA ${etaAt(f)}`;
      n.state.textContent = parked ? 'PARKED' : 'ON ROUTE';
    }
  }
  tl.fromTo(car, { t: 0 }, { t: 1, duration: 1, ease: 'none', onUpdate: renderCar, immediateRender: false }, 0);

  // ---- arrival: the pin fills orange, two ripples
  const fg = ctx.tokens.color.fg;
  const accent = ctx.tokens.color.accent;
  gsap.set(n.pin, { fillOpacity: 0, stroke: fg });
  gsap.set(n.hole, { opacity: 0 });
  tl.to(n.pin, { fillOpacity: 1, stroke: accent, duration: 0.03, ease: 'none' }, T_STOP + 0.005);
  tl.to(n.hole, { opacity: 1, duration: 0.02, ease: 'none' }, T_SETTLE - 0.01);
  const rip = gsap.timeline({ paused: true });
  n.ripples.forEach((r, i) => {
    rip.fromTo(r, { scale: 1, opacity: 0.9 }, { scale: 3.6, opacity: 0, duration: 1.1, ease: 'power2.out' }, i * 0.22);
  });
  punch(T_SETTLE, rip);

  // ---- traveler: hidden while our own car (under the phone glass) carries the dot
  const exitHandoff = () => {
    const tip = seg.pointAt(G.destP);
    const head = seg.headScreen();
    const from = toScreen(tip.x, tip.y - 35.5);
    const u = clamp(exit.k / 0.2);
    return { x: lerp(from.x, head.x, u), y: lerp(from.y, head.y, u) };
  };
  traveler.follow(() => {
    if (exit.k > 0) return exit.k < 0.2 ? exitHandoff() : null;
    return car.t > 0.0005 ? { hidden: true } : null;
  });

  // ---- exit: after the pin the dot leaves along the tail to the next scene (head on the 60% line);
  // the pin goes back to an outline once nobody is parked in it
  const tintPin = gsap.utils.interpolate(accent, fg);
  ScrollTrigger.create({
    trigger: root,
    start: 'bottom bottom',
    end: 'bottom 60%',
    onUpdate: (self) => {
      exit.k = self.progress;
      if (exit.k > 0) {
        seg.run = lerp((G.destP - G.lead) / (1 - G.lead), 1, exit.k);
        n.car.style.visibility = 'hidden';
        const e = clamp(exit.k / 0.2);
        gsap.set(n.pin, { fillOpacity: 1 - e, stroke: tintPin(e) });
        gsap.set(n.hole, { opacity: 1 - e });
      } else {
        renderCar();
      }
    },
    onLeaveBack: () => {
      exit.k = 0;
      gsap.set(n.pin, { fillOpacity: 1, stroke: accent });
      gsap.set(n.hole, { opacity: 1 });
      renderCar();
    },
  });

  // ---- the phone story, headline, PARKED (the readouts make way for it)
  const mini = {
    z: 1.7,
    planLen: () => G.plan,
    frame: () => {
      const s = toScreen(car.x, car.y);
      const w = toWorld(s.x, s.y);
      const q = qAt(car.t);
      return { x: w.x, y: w.y, angle: car.angle, driven: G.plan * clamp(q / G.destP) };
    },
  };
  story(ctx, n, {
    tl,
    punch,
    P,
    D,
    tripAt,
    kmhAt,
    mini,
    revealOnEnter: true,
    setHud: true,
    onSlam: (slam) => slam.to([n.speedWrap, n.readout], { opacity: 0.18, duration: 0.3, ease: 'power2.out' }, 0),
  });

  renderCar();
}
