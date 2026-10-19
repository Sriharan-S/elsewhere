// Scene 04: no-flicker. "No flicker. No leaks."
// The thread drops in and forks into four provider lanes (GPS, NETWORK, FUSED 12+, PLAY SERVICES) that
// rejoin at the orange fix. While a lane is open its line is broken and jittering, and so are the ghost
// ring (the real position) and the headline: amplitude = open lanes / 4. On each beat an orange hold-bar
// runs the lane into the fix, the line goes steady, the tag flips OPEN -> HELD and the ghost is knocked
// further off. When the fourth lane holds, the ghost shatters, everything freezes, the fix pulses once.
import './no-flicker.css';

const NS = 'http://www.w3.org/2000/svg';
const LANES = 4;
const BEATS = [0.17, 0.35, 0.53, 0.71]; // each hold beat starts here (timeline progress)
const ACC_M = [48, 24, 12, 6, 3]; // accuracy readout by lanes held
const ACC_R = [46, 34, 24, 16, 11]; // accuracy ring radius (px) by lanes held
const REAL = { lat: 13.0412, lng: 80.2391 }; // the leaked "real" position (demo value)

// The ghost (the real position) leaks right next to the fix, where the lanes rejoin, and is knocked a
// little further off on every hold: px offsets from the fix, below it (clear of the converging lanes on
// its left and the ACC label above it). Phones: under the board, the fix sits near the right edge.
const GHOST = {
  desktop: [[30, 58], [-34, 74], [64, 42], [-58, 94], [72, 90]],
  mobile: [[-30, 140], [-56, 154], [-14, 166], [-70, 172], [-36, 184]],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const f1 = (n) => Math.round(n * 10) / 10;

function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/** Tiny deterministic PRNG for ?shots frames. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, traveler, fx, hud, tokens } = ctx;
  const stage = root.querySelector('.stage');
  const hudLayer = root.querySelector('.nf-hud');
  const rows = [...root.querySelectorAll('.nf-row')];
  const tags = rows.map((r) => r.querySelector('.nf-tag'));
  const title = root.querySelector('.nf-title');
  const tin = parseFloat(root.dataset.threadIn || '0.38');
  const tout = parseFloat(root.dataset.threadOut || '0.62');

  // ------------------------------------------------------------ geometry (stage px), measured from the DOM
  function geo() {
    const W = Math.max(1, stage.clientWidth);
    const H = Math.max(1, stage.clientHeight);
    const sr = stage.getBoundingClientRect();
    const mobile = window.innerWidth < 768;
    // desktop: lanes run level with their row headers; mobile: each lane runs just under its label
    const ys = rows.map((r) => {
      if (mobile) return r.querySelector('.nf-name').getBoundingClientRect().bottom - sr.top + 10;
      const b = r.getBoundingClientRect();
      return b.top - sr.top + b.height / 2;
    });
    const yMid = (ys[0] + ys[LANES - 1]) / 2;
    const top = rows[0].getBoundingClientRect().top - sr.top;
    const bottom = rows[LANES - 1].getBoundingClientRect().bottom - sr.top;
    // the copy is top-left like every scene and the board sits in the lower half, so the thread comes in
    // along the top (between the top bar and the folio), down the left edge past the copy, and into the
    // fork between the second and third label rows
    const xL = mobile ? 10 : Math.max(12, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--margin')) * 0.4 || 24);
    const Fx = mobile ? xL + 22 : Math.max(xL + 40, tin * W + 40);
    const Jx = (mobile ? 0.9 : 0.86) * W;
    const fan = mobile ? Math.max(40, 0.13 * W) : Math.min(0.1 * W, 170);
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
    const folioEl = root.querySelector('.folio');
    const folioTop = folioEl ? folioEl.getBoundingClientRect().top - sr.top : topbar + 40;
    const fix = [Jx, yMid];
    return {
      W, H, ys, yMid, Fx, Jx, fan, mobile, top, xL,
      yA: Math.max(8, Math.min(topbar + 14, folioTop - 14)),
      xR: (mobile ? 0.955 : 0.93) * W,
      yTurn: Math.min(H - 12, bottom + (H - bottom) * 0.5),
      ghost: (mobile ? GHOST.mobile : GHOST.desktop).map(([x, y]) => [fix[0] + x, fix[1] + y]),
    };
  }
  let G = geo();

  // ------------------------------------------------------------ the thread: in -> the fork, then the fix -> out
  const segA = thread.segment(root, {
    stage,
    radius: window.innerWidth < 768 ? 18 : 28,
    points: (W, H) => {
      const g = geo();
      return [
        [tin, 0],
        [tin, g.yA / H],
        [g.xL / W, g.yA / H],
        [g.xL / W, g.yMid / H],
        [g.Fx / W, g.yMid / H],
      ];
    },
  });
  const segB = thread.segment(root, {
    stage,
    radius: 24,
    points: (W, H) => {
      const g = geo();
      return [
        [g.Jx / W, g.yMid / H],
        [g.xR / W, g.yMid / H],
        [g.xR / W, g.yTurn / H],
        [tout, g.yTurn / H],
        [tout, 1],
      ];
    },
  });

  // ------------------------------------------------------------ the lanes svg (built here, rebuilt on refresh)
  const svg = el('svg', { class: 'nf-svg', 'aria-hidden': 'true', focusable: 'false' });
  hudLayer.prepend(svg);
  const defs = el('defs', {}, svg);
  const gLanes = el('g', { class: 'nf-lanes' }, svg);
  const lanes = [];
  for (let i = 0; i < LANES; i++) {
    const cs = el('clipPath', { id: `nf-cs-${i}`, clipPathUnits: 'userSpaceOnUse' }, defs);
    const cb = el('clipPath', { id: `nf-cb-${i}`, clipPathUnits: 'userSpaceOnUse' }, defs);
    const rs = el('rect', { x: 0, y: -2000, width: 0, height: 6000 }, cs);
    const rb = el('rect', { x: 0, y: -2000, width: 0, height: 6000 }, cb);
    const jig = el('g', { class: 'nf-jig' }, gLanes);
    const broken = el('path', { class: 'nf-broken', 'clip-path': `url(#nf-cb-${i})` }, jig);
    const steady = el('path', { class: 'nf-steady', 'clip-path': `url(#nf-cs-${i})` }, gLanes);
    const bar = el('path', { class: 'nf-bar' }, gLanes);
    lanes.push({ i, rs, rb, jig, broken, steady, bar, len: 1, h: 0, t: 0, held: null });
  }
  const gAcc = el('g', { class: 'nf-acc' }, svg);
  const accRing = el('circle', { class: 'nf-acc-ring', r: ACC_R[4] }, gAcc);
  const pings = BEATS.map(() => el('circle', { class: 'nf-ping', r: 8 }, gAcc));
  const fixDot = el('circle', { class: 'nf-fix', r: 7 }, gAcc);
  const accLabel = el('text', { class: 'nf-acc-label' }, svg);
  accLabel.innerHTML = 'ACC <tspan>3</tspan> M';
  const accNum = accLabel.querySelector('tspan');

  const gPos = el('g', { class: 'nf-ghost' }, svg);
  const gShake = el('g', {}, gPos);
  const gJit = el('g', {}, gShake);
  const ARC_R = 15;
  const arcs = [];
  for (let k = 0; k < 8; k++) {
    const a0 = ((k * 45 + 3) * Math.PI) / 180;
    const a1 = ((k * 45 + 42) * Math.PI) / 180;
    const am = (a0 + a1) / 2;
    const d =
      `M${f1(Math.cos(a0) * ARC_R)} ${f1(Math.sin(a0) * ARC_R)}` +
      `A${ARC_R} ${ARC_R} 0 0 1 ${f1(Math.cos(a1) * ARC_R)} ${f1(Math.sin(a1) * ARC_R)}`;
    arcs.push({ p: el('path', { class: 'nf-ghost-arc', d }, gJit), am, mx: Math.cos(am) * ARC_R, my: Math.sin(am) * ARC_R, spin: k % 2 ? 50 : -40 });
  }
  const ghostLabel = el('text', { x: 24, y: 4 }, gJit);
  ghostLabel.textContent = 'REAL';

  function layout() {
    G = geo();
    const { Fx, Jx, fan, yMid, ys, W, H, mobile } = G;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const w = mobile ? tokens.thread.widthPhone : tokens.thread.width;
    lanes.forEach((L, i) => {
      const y = ys[i];
      const d =
        `M${f1(Fx)} ${f1(yMid)}` +
        `C${f1(Fx + fan * 0.55)} ${f1(yMid)} ${f1(Fx + fan * 0.45)} ${f1(y)} ${f1(Fx + fan)} ${f1(y)}` +
        `L${f1(Jx - fan)} ${f1(y)}` +
        `C${f1(Jx - fan * 0.45)} ${f1(y)} ${f1(Jx - fan * 0.55)} ${f1(yMid)} ${f1(Jx)} ${f1(yMid)}`;
      L.broken.setAttribute('d', d);
      L.steady.setAttribute('d', d);
      L.bar.setAttribute('d', d);
      L.steady.setAttribute('stroke-dasharray', tokens.thread.dash(w));
      L.len = L.bar.getTotalLength() || 1;
    });
    gAcc.setAttribute('transform', `translate(${f1(Jx)} ${f1(yMid)})`);
    if (mobile) {
      accLabel.setAttribute('x', f1(W - 16));
      accLabel.setAttribute('y', f1(G.top - 12));
      accLabel.setAttribute('text-anchor', 'end');
    } else {
      accLabel.setAttribute('x', f1(Jx + 22));
      accLabel.setAttribute('y', f1(yMid - 22));
      accLabel.setAttribute('text-anchor', 'start');
    }
    render();
  }

  // ------------------------------------------------------------ state, driven by the pinned timeline
  const S = { draw: 0, ghost: 0, acc: 0, shatter: 0, bPin: 0, bExit: 0 };
  let heldCount = -1;
  let amp = 1;
  let still = false;
  const rnd0 = seeded(4404);

  function setB() {
    const pA = segB.progressAtY(0.6);
    segB.progress = S.bExit > 0 ? pA + S.bExit * (1 - pA) : S.bPin * pA;
  }

  function render() {
    const { Fx, Jx, yMid, ghost } = G;
    const span = Jx - Fx + 8;
    const drawX = Fx - 4 + span * S.draw;
    let held = 0;
    for (const L of lanes) {
      const hx = L.h > 0 ? L.bar.getPointAtLength(L.h * L.len).x : Fx - 4;
      const sx = L.h >= 1 ? Jx + 8 : Math.min(hx, drawX);
      L.rs.setAttribute('x', f1(Fx - 4));
      L.rs.setAttribute('width', f1(Math.max(0, sx - (Fx - 4))));
      const bx = L.h > 0 ? hx : Fx - 4;
      L.rb.setAttribute('x', f1(bx));
      L.rb.setAttribute('width', f1(Math.max(0, drawX - bx)));
      const seg = Math.max(0, L.h - L.t) * L.len;
      L.bar.style.strokeDasharray = `${f1(seg)} ${f1(L.len * 2)}`;
      L.bar.style.strokeDashoffset = f1(-L.t * L.len);
      L.bar.style.visibility = seg > 0.5 ? '' : 'hidden';
      const isHeld = L.h >= 0.5;
      if (isHeld) held++;
      if (isHeld !== L.held) {
        L.held = isHeld;
        rows[L.i].classList.toggle('is-open', !isHeld);
        tags[L.i].textContent = isHeld ? 'HELD' : 'OPEN';
        L.broken.style.opacity = '';
        if (isHeld) L.jig.removeAttribute('transform');
      }
    }
    // the ghost: knocked off a step per hold, then shattered
    const gi = Math.min(LANES - 0.0001, S.ghost);
    const k0 = Math.floor(gi);
    const kk = gi - k0;
    const gx = lerp(ghost[k0][0], ghost[k0 + 1][0], kk);
    const gy = lerp(ghost[k0][1], ghost[k0 + 1][1], kk);
    gPos.setAttribute('transform', `translate(${f1(gx)} ${f1(gy)})`);
    const s = S.shatter;
    for (const a of arcs) {
      const dist = s * 58;
      a.p.setAttribute(
        'transform',
        s > 0
          ? `translate(${f1(Math.cos(a.am) * dist)} ${f1(Math.sin(a.am) * dist)}) rotate(${f1(a.spin * s)} ${f1(a.mx)} ${f1(a.my)})`
          : '',
      );
      a.p.style.opacity = f1(1 - s);
    }
    ghostLabel.style.opacity = f1(Math.max(0, 1 - s * 2.5));
    // accuracy
    const ai = Math.min(LANES, S.acc);
    const a0 = Math.floor(ai);
    const ar = a0 >= LANES ? ACC_R[LANES] : lerp(ACC_R[a0], ACC_R[a0 + 1], ai - a0);
    // phones: the fix sits near the right edge, so the accuracy ring shrinks to stay inside the stage
    accRing.setAttribute('r', f1(G.mobile ? ar * 0.74 : ar));
    accNum.textContent = String(ACC_M[Math.min(LANES, Math.round(ai))]);

    if (held !== heldCount) {
      heldCount = held;
      amp = (LANES - held) / LANES;
      if (amp <= 0) freeze();
      else still = false;
    }
    if (env.shots) jitterFrame(seeded(4404 + held));
    if (!env.reduced) setB();
  }

  // ------------------------------------------------------------ jitter (stepped, ~14 fps), amplitude = open / 4
  let chars = [];
  let charX = [];
  function jitterFrame(rnd = Math.random) {
    if (amp <= 0) return;
    const A = amp * 6;
    for (const L of lanes) {
      if (L.held) continue;
      L.jig.setAttribute('transform', `translate(${f1((rnd() * 2 - 1) * A)} ${f1((rnd() * 2 - 1) * amp * 1.5)})`);
      L.broken.style.strokeDashoffset = String((rnd() * 140) | 0);
      L.broken.style.opacity = f1(0.45 + rnd() * 0.55);
    }
    gJit.setAttribute('transform', `translate(${f1((rnd() * 2 - 1) * A)} ${f1((rnd() * 2 - 1) * A)})`);
    gJit.style.opacity = rnd() < 0.14 * amp ? '0.15' : f1(0.55 + rnd() * 0.45);
    for (let i = 0; i < chars.length; i++) {
      const on = rnd() < 0.2 * amp;
      charX[i](on ? (rnd() * 2 - 1) * A : 0);
      chars[i].style.opacity = on && rnd() < 0.35 ? '0.4' : '';
    }
  }
  function freeze() {
    if (still) return;
    still = true;
    for (const L of lanes) {
      L.jig.removeAttribute('transform');
      L.broken.style.opacity = '';
    }
    gJit.removeAttribute('transform');
    gJit.style.opacity = '';
    for (let i = 0; i < chars.length; i++) {
      charX[i](0);
      chars[i].style.opacity = '';
    }
    restoreHud();
  }

  // HUD leak: while lanes are open, the top bar briefly shows the real coordinates
  let hudSaved = null;
  let leaking = false;
  let pinActive = false;
  function restoreHud() {
    if (!leaking || !hudSaved) return;
    hud.set({ lat: hudSaved.lat, lng: hudSaved.lng }, { scramble: false });
    leaking = false;
  }
  function hudLeak(rnd) {
    if (!pinActive || amp <= 0) return restoreHud();
    if (leaking) return restoreHud();
    if (rnd() < amp * 0.2) {
      hudSaved = hud.state;
      hud.set(REAL, { scramble: false });
      leaking = true;
    }
  }

  // ------------------------------------------------------------ reduced motion: the final frame, nothing moves
  layout();
  ScrollTrigger.addEventListener('refreshInit', () => requestAnimationFrame(layout));
  ScrollTrigger.addEventListener('refresh', layout);

  if (env.reduced) {
    S.draw = 1;
    S.ghost = LANES;
    S.acc = LANES;
    S.shatter = 1;
    lanes.forEach((L) => {
      L.h = 1;
      L.t = 1;
    });
    segA.progress = 1;
    segB.progress = 1;
    render();
    return;
  }

  // ------------------------------------------------------------ motion
  // lead-in: the head drops from the stage top (on the 60% line) to the fork as the stage rises
  ScrollTrigger.create({
    trigger: stage,
    start: 'top 60%',
    end: 'top top',
    onUpdate: (s) => (segA.progress = s.progress),
    onRefresh: (s) => (segA.progress = s.progress),
    onLeave: () => (segA.progress = 1),
    onLeaveBack: () => (segA.progress = 0),
  });

  fx.folio(root.querySelector('.folio'));
  const rev = fx.reveal(title, { sub: root.querySelector('.nf-sub'), start: 'top 82%' });
  chars = rev?.split?.chars || [];
  charX = chars.map((c) => gsap.quickSetter(c, 'x', 'px'));

  const dirty = () => render();
  const { tl, punch } = ctx.pinTimeline({ stage, vh: 60, mobileVh: 45, scrub: 0.6, snap: 'labelsDirectional', invalidate: false });

  // 1. the fork: the timetable assembles, the lanes unzip from the fork to the fix with the dot
  gsap.set(rows, { opacity: 0, x: -18 });
  tl.fromTo(rows, { opacity: 0, x: -18 }, { opacity: 1, x: 0, duration: 0.06, stagger: 0.015, ease: 'power2.out', immediateRender: false }, 0)
    .fromTo(S, { draw: 0 }, { draw: 1, duration: 0.12, ease: 'power1.inOut', onUpdate: dirty, immediateRender: false }, 0.01)
    .addLabel('open', 0.13);

  // 2-5. one hold per lane
  const names = ['gps', 'network', 'fused', 'play'];
  BEATS.forEach((b, i) => {
    const L = lanes[i];
    tl.fromTo(L, { h: 0 }, { h: 1, duration: 0.11, ease: 'expo.inOut', onUpdate: dirty, immediateRender: false }, b)
      .fromTo(L, { t: 0 }, { t: 1, duration: 0.1, ease: 'expo.inOut', onUpdate: dirty, immediateRender: false }, b + 0.045)
      .fromTo(S, { ghost: i }, { ghost: i + 1, duration: 0.07, ease: 'power3.out', onUpdate: dirty, immediateRender: false }, b + 0.055)
      .fromTo(S, { acc: i }, { acc: i + 1, duration: 0.06, ease: 'power2.out', onUpdate: dirty, immediateRender: false }, b + 0.09)
      .addLabel(names[i], b + 0.15);
    // the ghost is knocked off with a short shake
    punch(
      b + 0.06,
      gsap.to(gShake, {
        keyframes: { x: [0, 9, -7, 5, -2, 0], y: [0, -3, 2, -1, 0, 0] },
        duration: 0.45,
        ease: 'none',
        paused: true,
      }),
    );
    // the hold-bar lands in the fix
    punch(
      b + 0.13,
      gsap.fromTo(pings[i], { attr: { r: 8 }, opacity: 0.9 }, { attr: { r: 40 }, opacity: 0, duration: 0.7, ease: 'power2.out', paused: true }),
    );
  });

  // 6. all four held: the ghost shatters, the fix gives one calm pulse
  tl.fromTo(S, { shatter: 0 }, { shatter: 1, duration: 0.09, ease: 'power2.out', onUpdate: dirty, immediateRender: false }, 0.86);
  const ring = traveler.el?.querySelector('.traveler__ring');
  if (ring) {
    punch(0.875, gsap.fromTo(ring, { scale: 1, opacity: 1 }, { scale: 4, opacity: 0, duration: 1.1, ease: 'power2.out', paused: true }));
  }

  // 7. the thread leaves the fix, then rides the 60% line out after the pin
  tl.fromTo(S, { bPin: 0 }, { bPin: 1, duration: 0.07, ease: 'none', onUpdate: setB, immediateRender: false }, 0.93).addLabel('out', 1);
  ScrollTrigger.create({
    trigger: root,
    start: 'bottom bottom',
    end: 'bottom 60%',
    onUpdate: (s) => {
      S.bExit = s.progress;
      setB();
    },
    onLeave: () => {
      S.bExit = 1;
      setB();
    },
    onLeaveBack: () => {
      S.bExit = 0;
      setB();
    },
  });

  // the dot rides the fork to the fix, then waits there until the thread leaves
  traveler.follow(() => {
    if (S.draw <= 0 || segB.progress > 0) return null;
    const r = stage.getBoundingClientRect();
    return { x: r.left + G.Fx + (G.Jx - G.Fx) * S.draw, y: r.top + G.yMid };
  });

  // ------------------------------------------------------------ the jitter loop (paused offscreen, hidden tab, ?shots)
  // the jitter is this scene's idle loop: it is on GSAP's ticker only while the scene is on screen, so an
  // idle page in any other scene lets the ticker sleep
  let inView = false;
  let jitterOn = false;
  let jitter = null;
  const setJitter = (on) => {
    if (!jitter || on === jitterOn) return;
    jitterOn = on;
    if (on) gsap.ticker.add(jitter);
    else gsap.ticker.remove(jitter);
  };
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (s) => {
      inView = s.isActive;
      setJitter(inView);
    },
    onRefresh: (s) => {
      inView = s.isActive;
      setJitter(inView);
    },
  });
  ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: 'bottom bottom',
    onToggle: (s) => {
      pinActive = s.isActive;
      if (!pinActive) restoreHud();
    },
  });
  if (!env.shots) {
    let last = 0;
    jitter = (t) => {
      if (!inView || amp <= 0 || document.hidden) return;
      if (t - last < 1 / 14) return;
      last = t;
      jitterFrame(Math.random);
      hudLeak(Math.random);
    };
    setJitter(inView);
  } else {
    jitterFrame(rnd0);
  }
}
