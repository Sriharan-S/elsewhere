// Scene 07: offline. A dive through nested regions (country > state > district > city) into the
// dot's own city, whose tiles print from the centre out. Then the signal drops while the map stays
// lit, and in the last beat the thread leaves the city with its route corridor printing along it.
//
// Everything in the props svg is laid out in stage px (viewBox 0 0 W H). The region polygons sit in
// one group in "geo units" around the city centre, which is pinned to the thread's head (the dot):
// screen = head + s * p. Strokes and labels divide by --s, so they stay hairline at any zoom.
import './offline.css';

const LEVELS = ['country', 'state', 'district', 'city'];
const TILE = 12; // geo units; the city grid is 8 x 8 from -48..48
const GRID0 = -48;
const NS = 'http://www.w3.org/2000/svg';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, fx, hud } = ctx;
  const stage = root.querySelector('.stage');
  const map = root.querySelector('.of-map');
  const props = root.querySelector('.of-props');
  const geo = props.querySelector('.of-geo');
  const polys = LEVELS.map((l) => geo.querySelector(`.of-poly--${l}`));
  const labels = LEVELS.map((l) => geo.querySelector(`.of-label--${l}`));
  const tiles = [...geo.querySelectorAll('.of-tiles rect')];
  const tileClip = props.querySelector('#of-tile-clip');
  const clips = [...tileClip.querySelectorAll('rect')]; // one per city tile, same order
  const routeTilesG = geo.querySelector('.of-route-tiles');
  const corridor = geo.querySelector('.of-corridor');
  const bars = [...root.querySelectorAll('.of-bar')];
  const slash = root.querySelector('.of-signal__slash');
  const sigOn = root.querySelector('.of-signal__on');
  const sigOff = root.querySelector('.of-signal__off');
  const meter = root.querySelector('.of-meter');
  const mK = meter.querySelector('.of-meter__k');
  const mWhat = meter.querySelector('.of-meter__what');
  const mV = meter.querySelector('.of-meter__v');
  const mBar = meter.querySelector('.of-meter__bar i');

  // local geometry (constant): bbox + perimeter of each region, label anchors near each top-left
  const bb = polys.map((p) => p.getBBox());
  const per = polys.map((p) => p.getTotalLength());
  LEVELS.forEach((l, i) => {
    if (l === 'city') return;
    const b = bb[i];
    const tx = b.x + b.width * 0.18;
    const ty = b.y + b.height * 0.18;
    let best = null;
    let bd = Infinity;
    const n = 160;
    for (let k = 0; k < n; k++) {
      const pt = polys[i].getPointAtLength((per[i] * k) / n);
      const d = Math.hypot(pt.x - tx, pt.y - ty);
      if (d < bd) ((bd = d), (best = pt));
    }
    labels[i].setAttribute('x', best.x.toFixed(1));
    labels[i].setAttribute('y', best.y.toFixed(1));
    labels[i].setAttribute('dx', '1.2em');
    labels[i].setAttribute('dy', '2.4em');
  });
  const cityBB = { x: GRID0, y: GRID0, w: TILE * 8, h: TILE * 8 };

  // ------------------------------------------------------------ layout (stage px), rebuilt on refresh
  const L = { W: 1, H: 1, portrait: false, hx: 0, hy: 0, s0: 1, s1: 6, sOut: 3.3 };
  function layout() {
    const W = Math.max(1, stage.clientWidth);
    const H = Math.max(1, stage.clientHeight);
    const vh = window.innerHeight;
    const portrait = W / H < 1.05;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
    const hy = Math.min(H * 0.9, 0.6 * vh);
    const c = bb[0];
    // region the whole country fits into at the start of the dive
    const r = portrait
      ? { x0: W * 0.04, x1: W * 0.96, y0: Math.max(top + 24, hy - H * 0.26), y1: H * 0.985 }
      : { x0: W * 0.47, x1: W * 0.985, y0: top + 16, y1: H * 0.985 };
    const sy = Math.min((hy - r.y0) / Math.max(1, -c.y), (r.y1 - hy) / Math.max(1, c.y + c.height));
    let s0;
    let hx;
    if (portrait) {
      // centre the city; the country fits around it
      hx = W * 0.5;
      s0 = Math.min(sy, (hx - r.x0) / Math.max(1, -c.x), (r.x1 - hx) / Math.max(1, c.x + c.width));
    } else {
      s0 = Math.min((r.x1 - r.x0) / c.width, sy);
      hx = (r.x0 + r.x1) / 2 - s0 * (c.x + c.width / 2);
    }
    // the city (8x8 tile grid) at the end of the dive, leaving room for the meter below it
    const half = cityBB.w / 2;
    // portrait: the city's top (and its label) stays clear of the copy block
    const sub = root.querySelector('.copy .sub');
    const copyBottom = sub ? sub.offsetTop + sub.offsetHeight : top + 40;
    const s1 = portrait
      ? Math.min((W * 0.86) / cityBB.w, (hy - Math.max(top, copyBottom) - 30) / half, (H - hy - 84) / half)
      : Math.min((H * 0.62) / cityBB.w, (W * 0.38) / cityBB.w, (hy - top - 36) / half, (H - hy - 84) / half);
    Object.assign(L, { W, H, vh, portrait, top, hx, hy, s0, s1, sOut: s1 * 0.56 });
    // the meter sits under the city grid (left-aligned on landscape, right-aligned on portrait)
    const gb = hy + half * s1 + 16;
    const mx = portrait ? hx + half * s1 - meter.offsetWidth : hx - half * s1;
    meter.style.left = `${mx.toFixed(1)}px`;
    meter.style.top = `${gb.toFixed(1)}px`;
    props.setAttribute('viewBox', `0 0 ${W.toFixed(1)} ${H.toFixed(1)}`);
    map.style.transformOrigin = `${hx.toFixed(1)}px ${hy.toFixed(1)}px`;
  }

  // the thread: in at (0.62, 0), down to the head (the city centre), then out through the city
  const tin = parseFloat(root.dataset.threadIn || '0.62');
  const tout = parseFloat(root.dataset.threadOut || '0.38');
  const routePts = () => {
    const { W, H, hx, hy, sOut, portrait } = L;
    const c = (cityBB.w / 2) * sOut; // zoomed-out city half-size (px)
    const xo = tout * W;
    if (portrait) {
      const y2 = Math.min(H - 70, hy + c * 1.15);
      const x1 = clamp(hx + c * 0.55, xo + 40, W * 0.9);
      return [
        [hx, hy + c * 0.5],
        [x1, hy + c * 0.5],
        [x1, y2],
        [xo, y2],
        [xo, H],
      ];
    }
    const y2 = Math.min(H - 60, hy + c * 1.12);
    return [
      [hx, hy + c * 0.5],
      [hx + c * 0.5, hy + c * 0.5],
      [hx + c * 0.5, y2],
      [xo, y2],
      [xo, H],
    ];
  };

  layout();
  const seg = thread.segment(root, {
    radius: 30,
    points: (W, H) => {
      layout();
      const { hx, hy, portrait } = L;
      const xi = tin * W;
      const yj = portrait ? Math.max(L.top + 10, hy - H * 0.16) : Math.max(L.top + 8, H * 0.15);
      const lead =
        Math.abs(xi - hx) < 2
          ? [[xi, 0]]
          : [
              [xi, 0],
              [xi, yj],
              [hx, yj],
            ];
      return [...lead, [hx, hy], ...routePts()].map(([x, y]) => [x / W, y / H]);
    },
  });

  // corridor + route tiles (geo units), from the seg's run part
  let routeTiles = [];
  function buildRoute() {
    const { hx, hy, sOut } = L;
    const toGeo = (p) => [(p.x - hx) / sOut, (p.y - hy) / sOut];
    const p0 = seg.progressAtY(hy / L.H);
    const N = 160;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(toGeo(seg.pointAt(p0 + ((1 - p0) * i) / N)));
    corridor.setAttribute('d', 'M' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join('L'));
    corridor.__len = corridor.getTotalLength();
    // cells touched by the corridor (half-width 14px), outside the city grid, in route order
    const reach = 13 / sOut;
    const seen = new Map();
    pts.forEach(([x, y], i) => {
      const t = i / N;
      for (const dx of [-reach, 0, reach])
        for (const dy of [-reach, 0, reach]) {
          const gx = Math.floor((x + dx - GRID0) / TILE);
          const gy = Math.floor((y + dy - GRID0) / TILE);
          if (gx >= 0 && gx < 8 && gy >= 0 && gy < 8) continue;
          const k = `${gx},${gy}`;
          if (!seen.has(k)) seen.set(k, { gx, gy, t });
        }
    });
    routeTilesG.replaceChildren();
    tileClip.querySelectorAll('.of-route-clip').forEach((n) => n.remove());
    routeTiles = [...seen.values()].map((c) => {
      const mk = (cls) => {
        const r = document.createElementNS(NS, 'rect');
        if (cls) r.setAttribute('class', cls);
        r.setAttribute('x', GRID0 + c.gx * TILE);
        r.setAttribute('y', GRID0 + c.gy * TILE);
        r.setAttribute('width', TILE);
        r.setAttribute('height', TILE);
        return r;
      };
      const r = mk();
      routeTilesG.appendChild(r);
      // its window onto the real map (grows with the print)
      const clip = mk('of-route-clip');
      tileClip.appendChild(clip);
      return { el: r, clip, t: c.t };
    });
  }

  // ------------------------------------------------------------ state + render
  const S = { u: 0, z: 0, d: [0, 0, 0, 0], lab: [0, 0, 0, 0], run: 0, mapO: 1 };
  function render() {
    const { hx, hy, s0, s1, sOut } = L;
    const sDive = s0 * Math.pow(s1 / s0, S.u);
    const s = lerp(sDive, sOut, S.z);
    geo.setAttribute('transform', `translate(${hx.toFixed(2)} ${hy.toFixed(2)}) scale(${s.toFixed(4)})`);
    geo.style.setProperty('--s', s.toFixed(4));
    for (let i = 0; i < 4; i++) {
      const len = per[i];
      polys[i].style.strokeDasharray = `${(len * S.d[i]).toFixed(2)} ${(len + 2).toFixed(2)}`;
      polys[i].style.visibility = S.d[i] > 0.001 ? '' : 'hidden';
      labels[i].style.opacity = S.lab[i].toFixed(3);
    }
    const cl = corridor.__len || 1;
    corridor.style.strokeDasharray = `${(cl * S.run).toFixed(2)} ${(cl + 40).toFixed(2)}`;
    corridor.style.visibility = S.run > 0.001 ? '' : 'hidden';
    for (const rt of routeTiles) {
      const k = (S.run - rt.t) / 0.07;
      // prints like the city: the streets fill the cell top to bottom with one flash
      rt.el.style.fillOpacity = k <= 0 || k >= 1 ? 0 : (0.16 * (1 - k)).toFixed(3);
      rt.el.style.strokeOpacity = k <= 0 ? 0 : 1;
      rt.clip.setAttribute('height', (TILE * clamp(k, 0, 1)).toFixed(2));
    }
  }

  const refresh = () => {
    layout();
    buildRoute();
    render();
  };
  ScrollTrigger.addEventListener('refresh', refresh);
  refresh();

  if (env.reduced) {
    // final frame: zoomed-out city, all tiles printed, signal slashed, route + corridor drawn
    S.u = 1;
    S.z = 1;
    S.d = [1, 1, 1, 1];
    S.lab = [0, 0, 0, 1];
    S.run = 1;
    seg.progress = 1;
    render();
    return;
  }

  // ------------------------------------------------------------ motion
  seg.track({ until: 'pin' });
  fx.folio(root.querySelector('.folio'));
  fx.reveal(root.querySelector('.h-scene'), { sub: root.querySelector('.sub') });

  const { tl, punch } = ctx.pinTimeline({ stage, vh: 60, mobileVh: 45, scrub: 0.6, invalidate: false });
  tl.addLabel('dive', 0).addLabel('print', 0.42).addLabel('offline', 0.64).addLabel('route', 0.78);

  const R = { onUpdate: render, immediateRender: false };
  const T = (vars, pos) => tl.to(S, { ...R, ...vars }, pos);

  // the dot's own city: the HUD and the folio name it while this stage has the thread
  const CITY = ctx.tokens.places[0];
  let llPrev = null;
  ScrollTrigger.create({
    trigger: stage,
    start: 'top 60%',
    onEnter: () => {
      llPrev = hud.state;
      hud.set({ lat: CITY.lat, lng: CITY.lng });
    },
    onLeaveBack: () => llPrev && hud.set({ lat: llPrev.lat, lng: llPrev.lng }),
  });

  // initial frame
  gsap.set(tiles, { fillOpacity: 0, strokeOpacity: 0 });
  gsap.set(clips, { attr: { height: 0 } });
  gsap.set(bars, { opacity: 1, y: 0 });
  gsap.set(slash, { drawSVG: '0%' });
  gsap.set(sigOff, { autoAlpha: 0 });
  gsap.set(sigOn, { visibility: 'visible' });
  gsap.set(mBar, { scaleX: 0 });
  gsap.set(meter, { autoAlpha: 0 });
  mK.textContent = 'DOWNLOADING';
  mWhat.textContent = ' '; // the grid already says CITY; the meter names only the route, later
  mV.textContent = '0%';

  // 1. dive: 1 -> ~10x into the dot's city; each boundary draws as you pass it, its label crossfades in
  T({ u: 1, duration: 0.4, ease: 'power1.inOut' }, 0.01);
  tl.fromTo(
    map,
    { scale: 1, opacity: 1 },
    { scale: 1.35, opacity: 0.5, duration: 0.4, ease: 'power1.inOut', immediateRender: false },
    0.01,
  );
  const draws = [
    [0.0, 0.08],
    [0.08, 0.17],
    [0.18, 0.28],
    [0.29, 0.38],
  ];
  draws.forEach(([a, b], i) => {
    tl.to(S.d, { ...R, [i]: 1, duration: b - a, ease: 'power2.inOut' }, a);
    tl.to(S.lab, { ...R, [i]: 1, duration: 0.03, ease: 'none' }, a + 0.02);
    if (i < 3) tl.to(S.lab, { ...R, [i]: 0, duration: 0.03, ease: 'none' }, draws[i + 1][0] + 0.03);
  });

  // 2. print: the empty grid lays down, then cells print from the centre out: each one flashes and the
  // real streets fill it top to bottom. The meter counts real values to 100%.
  const PRINT = { amount: 0.13, grid: [8, 8], from: 'center' };
  tl.to(tiles, { strokeOpacity: 1, duration: 0.02, ease: 'none', immediateRender: false }, 0.415);
  tl.to(
    tiles,
    { keyframes: { fillOpacity: [0, 0.16, 0], easeEach: 'none' }, duration: 0.035, ease: 'none', stagger: PRINT, immediateRender: false },
    0.43,
  );
  tl.to(clips, { attr: { height: TILE }, duration: 0.035, ease: 'power1.out', stagger: PRINT, immediateRender: false }, 0.435);
  tl.fromTo(
    meter,
    { autoAlpha: 0, y: 8 },
    { autoAlpha: 1, y: 0, duration: 0.03, ease: 'power2.out', immediateRender: false },
    0.41,
  );
  const m = { v: 0, r: 0 };
  const meterText = () => {
    if (m.r > 0) {
      const v = Math.round(m.r * 100);
      mK.textContent = v >= 100 ? 'SAVED' : 'DOWNLOADING';
      mWhat.textContent = 'CITY + ROUTE';
      mV.textContent = `${v}%`;
      mBar.style.transform = `scaleX(${m.r.toFixed(4)})`;
    } else {
      const v = Math.round(m.v);
      mK.textContent = v >= 100 ? 'SAVED' : 'DOWNLOADING';
      mWhat.textContent = ' ';
      mV.textContent = `${v}%`;
      mBar.style.transform = `scaleX(${(m.v / 100).toFixed(4)})`;
    }
  };
  const ring = ctx.traveler.el?.querySelector('.traveler__ring');
  if (ring) {
    punch(
      0.61,
      gsap.fromTo(ring, { scale: 1, opacity: 1 }, { scale: 3.4, opacity: 0, duration: 0.9, ease: 'power2.out', paused: true }),
    );
  }
  tl.to(m, { v: 100, duration: 0.18, ease: 'none', onUpdate: meterText, immediateRender: false }, 0.43);

  // 3. offline: bars drop out one by one, a slash draws across them, the map comes back fully lit
  tl.to(
    bars,
    { opacity: 0.16, y: 6, duration: 0.03, stagger: { each: 0.016, from: 'end' }, ease: 'power2.in', immediateRender: false },
    0.645,
  );
  tl.to(slash, { drawSVG: '100%', duration: 0.04, ease: 'power2.inOut' }, 0.71);
  tl.to(sigOn, { autoAlpha: 0, duration: 0.02 }, 0.71).to(sigOff, { autoAlpha: 1, duration: 0.02 }, 0.725);
  tl.to(map, { opacity: 1, duration: 0.06, ease: 'power1.out' }, 0.7);
  // the top HUD goes offline with it (the mock keeps running)
  let hudPrev = null;
  const hudOff = gsap.to(
    {},
    {
      duration: 0.01,
      paused: true,
      onStart: () => {
        hudPrev = hud.state.extra;
        hud.set({ extra: 'NO SIGNAL' });
      },
      onReverseComplete: () => hud.set({ extra: hudPrev && hudPrev !== 'NO SIGNAL' ? hudPrev : 'ACC 3 M' }),
    },
  );
  punch(0.72, hudOff);

  // 4. route: zoom out a notch, the corridor draws with the thread, tiles print along it
  T({ z: 1, duration: 0.09, ease: 'power2.inOut' }, 0.78);
  tl.to(map, { scale: 1.2, duration: 0.09, ease: 'power2.inOut' }, 0.78);
  T({ run: 1, duration: 0.15, ease: 'none' }, 0.85);
  tl.to(seg, { run: 1, duration: 0.15, ease: 'none' }, 0.85);
  tl.to(m, { r: 1, duration: 0.15, ease: 'none', onUpdate: meterText, immediateRender: false }, 0.85);

  // leaving the scene gives the HUD back
  ScrollTrigger.create({
    trigger: root,
    start: 'bottom 40%',
    onEnter: () => hud.state.extra === 'NO SIGNAL' && hud.set({ extra: 'ACC 3 M' }),
    onLeaveBack: () => tl.progress() >= 0.72 && hud.set({ extra: 'NO SIGNAL' }),
  });

  render();
}
