// Scene 02: the-drive. "The page becomes the car."
//
// One pinned stage (240vh desktop, 165vh mobile, scrub 1.0) that also carries scene 03 (still-driving).
// The thread drops into a real OSRM route on a real OSM road network; the traveler drives it with your
// scroll as the throttle at one steady speed (like the app: 48 km/h, then 0 when parked), true compass
// bearing, live lat/lng in the top-bar HUD, a quickTo chase cam with a small lean, and the headline riding
// a smoothed rail just above the road on a textPath (desktop), its sub line hanging under it.
//
// SHARED API (ctx.shared.get('drive')), for still-driving:
//   tl        the pinned 0..1 timeline. Labels: roads 0, go .08, chips .10/.25/.40, close .55, arrive .82, parked .96
//   st        its ScrollTrigger (null under reduced motion)
//   stage     the pinned .stage (append your .device / .copy layers into it)
//   seg       the thread segment (entry leg + exit leg); punch(at, anim) as from ctx.pinTimeline
//   state     { u, s, kmh } live drive state (u = tl progress, s = distance fraction 0..1)
//   dot()     the traveler's screen position { x, y, angle } this frame (for drawing a dot behind a phone)
//   focus     { x, y } normalized screen point the chase cam keeps the car on (tween it to re-frame)
//   parts     { world, cam, live, dest, destFill, copy, hud, numeral }
// What the-drive already does across the whole stage (so 03 should not redo it): the dot's drive and
// its stop at the pin, the km/h numeral (48, then 0 on arrival), BRG/ETA/LEFT, the top-bar HUD (lat/lng live, '0 KM/H · PARKED'
// from .96), the destination pin filling orange with two ripples (~.92), fading its own copy and dropping
// the road headline at .55. still-driving owns: its phone, its copy, the PARKED slam.
import './the-drive.css';

// Real OSRM driving route (Chennai Central -> T. Nagar -> Guindy -> Tambaram, 33.66 km), Douglas-Peucker to 120 points,
// projected and rotated so start -> end runs +x; 3600 route units from start to end (about 6.97 m per unit).
const ROUTE = [[6.3,-10.7],[5.5,-13.1],[-19.4,-31.3],[-15.1,-30.4],[20.1,-5.7],[25.7,-5.5],[41.4,-25.5],[54.3,-35.4],[55.8,-41.4],[51.1,-51.3],[51.3,-55.1],[89.2,-100.4],[94.8,-109.7],[134.2,-108.9],[156.8,-116.8],[184.2,-115],[204.6,-119.4],[221.2,-117.4],[244.6,-118.3],[255.5,-115.9],[267.1,-107.4],[291.8,-103.9],[481.4,-92.1],[509.9,-94.6],[621.5,-82.1],[636.5,-85.4],[641.9,-91.8],[638.4,-95.8],[628.9,-88.4],[632.2,-81.2],[672.9,-80],[719.7,-75.6],[817.6,-52.4],[813,-28.4],[845.9,19.2],[872.6,52.4],[907.7,27.1],[936.9,-0.3],[922.5,-21.5],[928.7,-27.4],[928.9,-29.8],[870.8,-101.5],[931.9,-152.4],[963.3,-146.1],[972.9,-142],[995.4,-168],[1002,-178.7],[1005.4,-174.5],[1058.1,-175.6],[1066.1,-173.7],[1081.3,-183],[1095.6,-180.8],[1100.3,-188.8],[1134.1,-173],[1180.1,-167.1],[1218.3,-168.1],[1271.1,-177.8],[1280.3,-185.8],[1335.5,-319.5],[1339.9,-326.8],[1343.7,-327.9],[1346.7,-325.4],[1375.5,-258.5],[1455.6,-285.7],[1469.3,-279.9],[1478.2,-269.3],[1468.4,-241.9],[1467.5,-229.3],[1471.7,-217.7],[1486.7,-203.9],[1480.3,-191],[1517,-187.2],[1531.9,-190.9],[1546.3,-201.2],[1553,-213],[1575.7,-220.6],[1586.4,-227],[1614.3,-204.2],[1622,-194.4],[1623.4,-188.8],[1577.1,-165.9],[1562,-153.4],[1613.4,-117.1],[1634.4,-108.9],[1692.9,-99.2],[1699.2,-101.3],[1727,-119],[1736.2,-121.2],[1748.8,-116.3],[1771.1,-90.7],[1783.5,-83.8],[1934.8,-72.6],[2029.9,-46.9],[2148.7,-35.3],[2227.8,-24.2],[2363.9,4.3],[2401.6,22.1],[2412.3,24.9],[2601.2,53.2],[2615.6,54.2],[2624.7,52.2],[2698.1,22.3],[2760.2,-0.1],[2896.1,-46.4],[2945.5,-61.3],[3009.1,-70.9],[3053,-81.4],[3099,-88.5],[3209.4,-93.1],[3323.8,-104.7],[3416.6,-108.5],[3455.9,-56.1],[3483.2,-37.4],[3499.3,-31.5],[3533.3,-24.3],[3600.2,-6.1]];
const ROUTE_LL = [[13.08199,80.27636],[13.08192,80.2765],[13.08217,80.27847],[13.08202,80.27823],[13.08163,80.27549],[13.0814,80.27522],[13.0798,80.27537],[13.07879,80.2752],[13.07845,80.2754],[13.0782,80.27606],[13.07801,80.27621],[13.0743,80.27644],[13.07362,80.27659],[13.07196,80.27471],[13.07062,80.274],[13.06952,80.27264],[13.06843,80.27188],[13.0678,80.27102],[13.06675,80.26996],[13.06639,80.26935],[13.06628,80.26843],[13.06537,80.26712],[13.05771,80.25774],[13.05636,80.25652],[13.0521,80.25075],[13.0513,80.2502],[13.05078,80.25022],[13.05075,80.25057],[13.0515,80.25068],[13.05169,80.25021],[13.04997,80.24826],[13.04816,80.24587],[13.04498,80.24028],[13.04628,80.23943],[13.04705,80.23579],[13.04741,80.23308],[13.04473,80.23256],[13.04221,80.2324],[13.04186,80.23401],[13.04133,80.23398],[13.0412,80.23408],[13.04043,80.23995],[13.03545,80.23934],[13.03438,80.23759],[13.03416,80.23696],[13.03199,80.23706],[13.03121,80.23722],[13.03126,80.23688],[13.02893,80.23446],[13.02867,80.234],[13.02758,80.2337],[13.02706,80.23294],[13.0265,80.23307],[13.02576,80.2308],[13.02404,80.22839],[13.02234,80.22664],[13.01961,80.2246],[13.01885,80.22452],[13.01032,80.22784],[13.0098,80.22795],[13.00958,80.22783],[13.00957,80.22758],[13.01139,80.22328],[13.00668,80.22074],[13.00635,80.21984],[13.00645,80.21895],[13.00814,80.21821],[13.00875,80.21769],[13.0091,80.21699],[13.00909,80.21568],[13.00995,80.21541],[13.00854,80.21352],[13.00773,80.21299],[13.00663,80.21277],[13.0058,80.21298],[13.00447,80.21225],[13.00371,80.21204],[13.00355,80.20972],[13.00367,80.20893],[13.00387,80.20862],[13.00692,80.20977],[13.00814,80.20993],[13.00758,80.20592],[13.00705,80.20458],[13.00497,80.20142],[13.0046,80.20122],[13.00258,80.2007],[13.00208,80.20037],[13.00176,80.19956],[13.00197,80.19739],[13.00175,80.19651],[12.99572,80.18894],[12.99279,80.18336],[12.98818,80.1773],[12.98527,80.17311],[12.98068,80.16549],[12.97987,80.16295],[12.97954,80.16232],[12.97266,80.15224],[12.97208,80.15153],[12.9716,80.15119],[12.96705,80.14908],[12.96334,80.14716],[12.95533,80.14285],[12.95251,80.1412],[12.94932,80.13865],[12.94694,80.13706],[12.94463,80.13522],[12.93963,80.13026],[12.93415,80.12543],[12.92997,80.12126],[12.93067,80.11711],[12.93035,80.11501],[12.92992,80.114],[12.92878,80.11209],[12.92672,80.10816]];
const STOPS = [[924.8,-17.7],[1456.9,-284.1]];
const ROTATION = 136.674;
// One distance everywhere (HUD, overview, phone): 42 min at an average 48 km/h is 33.6 km.
const DISTANCE_KM = 33.6;

const LABELS = { roads: 0, go: 0.08, chip1: 0.1, chip2: 0.25, chip3: 0.4, close: 0.55, arrive: 0.82, parked: 0.96 };
const U_GO = LABELS.go;
const U_TIP = 0.905; // the car reaches the pin's tip
const U_LIFT = 0.93; // the dot has risen into the pin head
const PIN_LIFT = -41.44; // px, pin centre above its tip (logo pin at scale 0.28)
const N = 240; // drive samples (HUD arrays)
const DUR_MIN = 42;
const AVG_KMH = 48;
// Phones: the car rides above centre so the road ahead has room before the HUD band, and the stage
// parks the destination at MOBILE_PARK_Y (still-driving tweens focus.y there while the phone is up).
const MOBILE_FOCUS_Y = 0.47;
const MOBILE_PARK_Y = 0.4;
// ...and pans the map right as it arrives, so the parked pin sits beside the copy, never under it
const MOBILE_PARK_DX = 0.3;
// desktop: as it arrives the camera settles the destination a little lower, so the road into it runs
// under 03's two-line headline and its sub instead of through them
const ARRIVE_DROP = 0.12;
const parkPan = (u) => {
  const t = Math.min(1, Math.max(0, (u - 0.8) / 0.08));
  return t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2; // power2.inOut
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const pad = (n, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
const angDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

// ---------------------------------------------------------------- polyline math (route units)
function polyline(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  let last = 1;
  /** point at distance fraction s: { x, y, i, k } (segment index + local t) */
  const at = (s) => {
    const d = clamp01(s) * total;
    let i = last;
    if (cum[i] < d) while (i < cum.length - 1 && cum[i] < d) i++;
    else while (i > 1 && cum[i - 1] > d) i--;
    last = i;
    const L = cum[i] - cum[i - 1] || 1;
    const k = (d - cum[i - 1]) / L;
    return { x: lerp(pts[i - 1][0], pts[i][0], k), y: lerp(pts[i - 1][1], pts[i][1], k), i, k };
  };
  return { cum, total, at };
}

/** Gaussian smoothing (sigma = r / 2 samples), clamped at the ends. */
function gauss(arr, r) {
  const sig = r / 2;
  const w = [];
  for (let j = -r; j <= r; j++) w.push(Math.exp(-(j * j) / (2 * sig * sig)));
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = -r; j <= r; j++) {
      const k = Math.min(arr.length - 1, Math.max(0, i + j));
      s += arr[k] * w[j + r];
      n += w[j + r];
    }
    out[i] = s / n;
  }
  return out;
}

function smooth(arr, r) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) {
      s += arr[j];
      n++;
    }
    out[i] = s / n;
  }
  return out;
}

/**
 * Precomputed drive: true bearing, lean and lat/lng along the route. Like the app (MockingService: one
 * cruise speed = distance / duration, progress linear in time), the car holds one speed the whole way:
 * the selected 48 km/h average, then 0 once it is parked on the destination.
 */
function driveModel() {
  const P = polyline(ROUTE);
  const ang = new Float32Array(N);
  const win = 30 / P.total; // tangent over +-30 units
  for (let i = 0; i < N; i++) {
    const s = i / (N - 1);
    const a = P.at(Math.max(0, s - win));
    const b = P.at(Math.min(1, s + win));
    ang[i] = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  }
  // unwrap for smoothing
  const un = new Float32Array(N);
  un[0] = ang[0];
  for (let i = 1; i < N; i++) un[i] = un[i - 1] + angDiff(ang[i - 1], ang[i]);
  const angS = smooth(un, 1);
  const turn = new Float32Array(N);
  for (let i = 1; i < N; i++) turn[i] = angS[i] - angS[i - 1];

  const bearing = Float32Array.from(angS, (a) => (((a + 90 + ROTATION) % 360) + 360) % 360);
  const lean = Float32Array.from(smooth(turn, 4), (t, i) => {
    const s = i / (N - 1);
    const ends = Math.min(1, s / 0.04, (1 - s) / 0.06);
    return Math.max(-2, Math.min(2, t * 0.35)) * Math.max(0, ends);
  });
  // lat/lng along the same polyline vertices
  const ll = (s) => {
    const p = P.at(s);
    const a = ROUTE_LL[p.i - 1];
    const b = ROUTE_LL[p.i];
    return [lerp(a[0], b[0], p.k), lerp(a[1], b[1], p.k)];
  };
  // constant speed: distance is linear in time
  const sAtTau = (x) => clamp01(x);
  const tauAtS = (x) => clamp01(x);
  return { P, bearing, lean, ll, sAtTau, tauAtS };
}

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, traveler, hud, fx } = ctx;
  const stage = root.querySelector('.stage');
  const q = (s) => root.querySelector(s);
  const qa = (s) => [...root.querySelectorAll(s)];
  const world = q('.drive__world');
  const leanEl = q('.drive__lean');
  const cam = q('.drive__cam');
  const roadsSvg = q('.drive__roads');
  const live = q('.drive__live');
  const geos = qa('.drive__geo');
  const routePath = q('#drive-route');
  const planned = q('.drive__planned');
  const plannedReveal = q('.drive__planned-reveal');
  const driven = q('.drive__driven');
  const textEl = q('.drive__road-h');
  const textPath = textEl.querySelector('textPath');
  const textLine = q('#drive-textline');
  const subEl = q('.drive__road-sub');
  const subPath = subEl?.querySelector('textPath');
  const subLine = q('#drive-subline');
  const startMark = q('.drive__start');
  const stopMarks = qa('.drive__stop');
  const dest = q('.drive__dest');
  const destUp = dest.querySelector('.drive__upright');
  const destFill = q('.drive__pin-fill');
  const destPinG = destFill.parentNode;
  const destFix = q('.drive__pin-fix');
  const ripA = q('.drive__ripple--a');
  const ripB = q('.drive__ripple--b');
  const numWrap = q('.drive__num');
  const numEl = q('[data-drive-kmh]');
  const brgEl = q('[data-drive-brg]');
  const etaEl = q('[data-drive-eta]');
  const distEl = q('[data-drive-dist]');
  const needle = q('.drive__needle');
  const modes = qa('.drive__mode');
  const pill = q('.drive__pill');
  const hudLayer = q('.drive__hud');
  const panel = q('.drive__panel');
  const overview = q('.drive__overview');
  const ovDriven = q('.drive__ov-driven');
  const ovDot = q('.drive__ov-dot');
  const copy = q('.drive__copy');
  const copyIn = q('.drive__copy-in') || copy;
  const folio = q('.folio');
  const h2 = q('.drive__h');
  const sub = q('.drive__sub');

  fx.folio(folio);

  const M = driveModel();
  const RL = routePath.getTotalLength(); // route length in units (== M.P.total)
  const END = ROUTE[ROUTE.length - 1];

  // ---------------------------------------------------------------- reduced motion: static final frame
  if (env.reduced) {
    const pt = ctx.pinTimeline({ stage, vh: 240, mobileVh: 165, scrub: 1 });
    // the thread drops into the static overview's start ring and leaves from under the parked pin
    const toStage = (x, y) => {
      const m = live.getScreenCTM();
      const r = stage.getBoundingClientRect();
      if (!m) return [0, 0];
      return [m.a * x + m.c * y + m.e - r.left, m.b * x + m.d * y + m.f - r.top];
    };
    const seg = thread.segment(root, {
      out: 0.38,
      d: (W, H) => {
        const [sx, sy] = toStage(...ROUTE[0]);
        const [ex, ey] = toStage(...END);
        const r = (pts) => thread.roundedPath(pts, 24);
        return r([[0.38 * W, 0], [0.38 * W, sy * 0.5], [sx, sy]]) + r([[ex, ey], [ex, ey + (H - ey) * 0.5], [0.38 * W, H]]);
      },
    });
    seg.progress = 1;
    ctx.shared.set('drive', { tl: pt.tl, st: null, stage, seg, punch: pt.punch, reduced: true, labels: LABELS, state: { u: 1, s: 1, kmh: 0 }, parts: { world, cam, live, dest, destFill, copy, hud: hudLayer, numeral: numEl } });
    return;
  }

  // ---------------------------------------------------------------- layout (rebuilt on every refresh)
  const L = { W: 1, H: 1, k: 1, fx: 0, y0: 0, m: [1, 0, 0, 1, 0, 0], mobile: false };
  const focus = { x: 0.38, y: 0.56 };
  const toLocal = (x, y) => [L.m[0] * x + L.m[2] * y + L.m[4], L.m[1] * x + L.m[3] * y + L.m[5]];
  const dirLocal = (dx, dy) => [L.m[0] * dx + L.m[2] * dy, L.m[1] * dx + L.m[3] * dy];
  // the headline's rail: the route resampled every textStep units and Gaussian-smoothed (sigma 600 units),
  // with its own cumulative arc length. Each frame the headline sits on one gentle quadratic laid over the
  // stretch of rail just ahead of the car (its bend clamped), so tight corners never pile glyphs up.
  let rail = null;
  const textStep = 30;
  const RAIL_SIGMA_SAMPLES = 40;
  const MAX_SAG = 0.03; // sagitta / chord: at most ~13 degrees of turn across the whole line
  let textLen = 700; // the headline's advance at rest, in route units (measured in layout)
  let headFs = 60; // headline font size, px

  function layout() {
    const W = Math.max(1, stage.clientWidth);
    const H = Math.max(1, stage.clientHeight);
    const mobile = ctx.isMobile();
    const k = mobile ? W / 700 : Math.max(H / 1000, (2.4 * W) / 3600);
    focus.y = mobile ? MOBILE_FOCUS_Y : 0.56;
    const fxp = focus.x * W;
    const y0 = focus.y * H;
    const [sx, sy] = ROUTE[0];
    const m = mobile ? [0, k, -k, 0, 0, 0] : [k, 0, 0, k, 0, 0];
    m[4] = fxp - (m[0] * sx + m[2] * sy);
    m[5] = y0 - (m[1] * sx + m[3] * sy);
    Object.assign(L, { W, H, k, fx: fxp, y0, m, mobile, yPark: (mobile ? MOBILE_PARK_Y : focus.y) * H });

    for (const svg of [roadsSvg, live]) {
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('preserveAspectRatio', 'none');
    }
    for (const g of geos) g.setAttribute('transform', `matrix(${m.map((v) => +v.toFixed(5)).join(' ')})`);
    const w = ctx.isPhone() ? 1.5 : 2;
    planned.style.strokeWidth = w / k;
    planned.setAttribute('stroke-dasharray', `${(2.7 * w) / k} ${(2.2 * w) / k}`);
    plannedReveal.style.strokeWidth = (w + 8) / k;
    driven.style.strokeWidth = (w + 0.75) / k;
    // marks live in local px, upright
    const place = (el, [x, y]) => {
      const [lx, ly] = toLocal(x, y);
      el.setAttribute('transform', `translate(${lx.toFixed(2)} ${ly.toFixed(2)})`);
    };
    place(startMark, ROUTE[0]);
    stopMarks.forEach((el, i) => place(el, STOPS[i]));
    place(dest, END);

    // the road headline (desktop only): rail + measured length; the per-frame curve is built in render()
    if (!mobile) {
      headFs = Math.min(110, Math.max(32, W * (W < 1100 ? 0.042 : 0.046)));
      textEl.style.fontSize = `${headFs / k}px`;
      if (subEl) subEl.style.fontSize = `${(parseFloat(getComputedStyle(sub).fontSize) || 18) / k}px`;
      const n = Math.ceil(M.P.total / textStep) + 1;
      const raw = [];
      for (let i = 0; i < n; i++) raw.push(M.P.at(i / (n - 1)));
      const xs = gauss(Float32Array.from(raw, (p) => p.x), RAIL_SIGMA_SAMPLES);
      const ys = gauss(Float32Array.from(raw, (p) => p.y), RAIL_SIGMA_SAMPLES);
      const cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
      rail = { xs, ys, cum, n };
      // the headline's length at rest (wdth 85), with the knockout it is drawn with
      textEl.style.setProperty('--wdth', '85');
      textLine.setAttribute('d', 'M0 0H100000');
      textLen = textEl.getComputedTextLength() || textLen;
    }
  }

  /** point on the rail at arc length a (units) */
  function railAt(a) {
    const { xs, ys, cum, n } = rail;
    if (a <= 0) return [xs[0], ys[0]];
    if (a >= cum[n - 1]) return [xs[n - 1], ys[n - 1]];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] < a) lo = m;
      else hi = m;
    }
    const t = (a - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [lerp(xs[lo], xs[hi], t), lerp(ys[lo], ys[hi], t)];
  }

  /** this frame's headline curve (route units) from rail arc a0: { A, Q, B, ux, uy, nx, ny, ang } */
  function headCurve(a0) {
    const span = textLen * 1.04;
    const A = railAt(a0);
    const B = railAt(a0 + span);
    const C = railAt(a0 + span / 2);
    const cx = B[0] - A[0];
    const cy = B[1] - A[1];
    const c = Math.hypot(cx, cy) || 1;
    const ux = cx / c;
    const uy = cy / c;
    // clamp the bend: the curve's midpoint may sit at most MAX_SAG * chord off the chord
    const mx = (A[0] + B[0]) / 2;
    const my = (A[1] + B[1]) / 2;
    let hx = C[0] - mx;
    let hy = C[1] - my;
    const h = Math.hypot(hx, hy);
    const hMax = MAX_SAG * c;
    if (h > hMax) {
      hx *= hMax / h;
      hy *= hMax / h;
    }
    // a quadratic through A, (mid + h), B has its control point at mid + 2h
    const Q = [mx + 2 * hx, my + 2 * hy];
    return { A, Q, B, ux, uy, nx: uy, ny: -ux, ang: (Math.atan2(uy, ux) * 180) / Math.PI };
  }

  /** the cam offset once it has parked on the destination (local px = stage px minus this) */
  function camEnd() {
    const [dx, dy] = toLocal(...END);
    return L.mobile ? { x: MOBILE_PARK_DX * L.W, y: L.yPark - dy } : { x: L.fx - dx, y: (L.y0 - dy) * 0.7 + ARRIVE_DROP * L.H };
  }

  // ---------------------------------------------------------------- the thread: entry leg + exit leg (local px)
  layout();
  const seg = thread.segment(root, {
    svg: live,
    space: 'user',
    out: 0.38,
    d: () => {
      const [dx, dy] = toLocal(...END);
      const ce = camEnd();
      const ex = L.fx - ce.x;
      const ey = L.H - ce.y;
      // One continuous path (Chrome restarts dash patterns per subpath): the entry leg, the route itself
      // (kept hidden under the planned/driven roads, never revealed), then the exit leg from under the pin.
      const route = ROUTE.slice(1)
        .map(([x, y]) => toLocal(x, y).map((v) => v.toFixed(2)).join(' '))
        .join('L');
      // phones: leave down the left margin (under PARKED, clear of the HUD band), then step over to the seam
      const exitPts = L.mobile
        ? [[dx, dy], [dx, dy + 34], [8 - ce.x, dy + 34], [8 - ce.x, L.H - 5 - ce.y], [ex, L.H - 5 - ce.y], [ex, ey]]
        : [[dx, dy], [dx, lerp(dy, ey, 0.55)], [ex, ey]];
      return (
        `M${L.fx.toFixed(2)} 0L${L.fx.toFixed(2)} ${L.y0.toFixed(2)}L${route}` +
        thread.roundedPath(exitPts, L.mobile ? 16 : 28).replace(/^M/, 'L')
      );
    },
  });
  const segMask = live.querySelector(`#${seg.id}-m`);
  const baseRebuild = seg.rebuild;
  seg.rebuild = () => {
    layout();
    baseRebuild();
    // the route is wider than 3 viewports: open the reveal mask up
    segMask?.setAttribute('x', -2e4);
    segMask?.setAttribute('y', -2e4);
    segMask?.setAttribute('width', 4e4);
    segMask?.setAttribute('height', 4e4);
  };
  seg.rebuild();
  const eFrac = () => clamp01(L.y0 / (seg.length || 1));
  const xFrac = () => clamp01((L.y0 + RL * L.k) / (seg.length || 1));

  // ---------------------------------------------------------------- road headline chars (tspans on the textPath)
  const TEXT = textPath.textContent;
  textPath.textContent = '';
  const tsp = [...TEXT].map((c) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    t.textContent = c;
    textPath.appendChild(t);
    return t;
  });
  const rnd = gsap.utils.random;
  const fallDelay = tsp.map(() => rnd(0, 0.45));
  const fallRot = tsp.map(() => rnd(-38, 38));

  // ---------------------------------------------------------------- the pinned timeline
  const pin = ctx.pinTimeline({ stage, vh: 240, mobileVh: 165, scrub: 1.0, snap: false, invalidate: false });
  const { tl, punch } = pin;
  for (const [k, v] of Object.entries(LABELS)) tl.addLabel(k, v);

  const S = { u: 0, s: 0, kmh: 0, exit: 0, mode: -1, planned: 0, pre: 0 };
  // the strip starts with no mode chosen (static HTML shows the final one)
  modes.forEach((m) => m.classList.remove('is-active'));
  modes[0].prepend(pill);
  pill.classList.add('is-off');

  // roads by hierarchy: water + arterials, then collectors, then hairlines; staggered by length tier
  const roadEls = qa('.drive__roads path');
  const order = { water: 0, runway: 0, art: 0, col: 1, min: 2 };
  const kind = (p) => (p.classList.contains('drive__water') ? 'water' : p.classList.contains('drive__runway') ? 'runway' : p.classList.contains('drive__r--art') ? 'art' : p.classList.contains('drive__r--col') ? 'col' : 'min');
  // ...while the stage scrolls in, so the map is already there when the stage's top edge arrives
  const roadsIn = ctx.scrubTimeline({ trigger: stage, start: 'top bottom', end: 'top 20%', scrub: 0.6, invalidate: false });
  roadEls.forEach((p) => {
    const c = order[kind(p)];
    const tier = +p.dataset.tier || 0;
    const at = 0.04 + c * 0.17 + (tier - c) * 0.06;
    roadsIn.fromTo(p, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' }, Math.max(0, at));
  });
  // the thread keeps drawing: the dashed planned route runs out ahead of the start ring
  tl.fromTo(S, { planned: 0 }, { planned: 1, duration: 0.07, ease: 'power1.in', onUpdate: renderPlanned, immediateRender: false }, 0.008);
  // marks pop by attribute (GSAP's svgOrigin on these nested, re-placed groups bakes in a stray offset)
  const pop = (el, at, dur, ease) =>
    tl.fromTo(el, { attr: { transform: 'scale(0.001 0.001)' } }, { attr: { transform: 'scale(1 1)' }, duration: dur, ease }, at);
  pop(startMark.firstElementChild, 0.002, 0.015, 'back.out(2)');
  stopMarks.forEach((m, i) => pop(m.firstElementChild, 0.03 + i * 0.012, 0.012, 'back.out(2)'));
  pop(destUp, 0.064, 0.014, 'back.out(1.6)');
  tl.fromTo([overview, panel], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.03, stagger: 0.012, ease: 'power2.out' }, 0.01);
  tl.fromTo(numWrap, { opacity: 0 }, { opacity: 1, duration: 0.03 }, 0.06);
  // .55: our copy leaves for still-driving's
  // (gone just before close, so the two headlines never sit on top of each other)
  tl.fromTo(copyIn, { opacity: 1, y: 0 }, { opacity: 0, y: -24, duration: 0.022, ease: 'power2.in', immediateRender: false }, LABELS.close - 0.024);
  // the drive itself: one linear proxy; everything reads S.u in render()
  tl.fromTo(S, { u: 0 }, { u: 1, duration: 1, ease: 'none', onUpdate: render, immediateRender: false }, 0);

  // start hidden (motion only)
  gsap.set(destFill, { fillOpacity: 0 });
  gsap.set(destFix, { opacity: 0 });
  gsap.set([ripA, ripB], { strokeOpacity: 0 });
  stopMarks.forEach((m) => m.classList.remove('is-passed'));

  // ---------------------------------------------------------------- punches
  const stopU = STOPS.map(([x, y]) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i <= 400; i++) {
      const p = M.P.at(i / 400);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) {
        bd = d;
        best = i / 400;
      }
    }
    return { s: best, u: U_GO + M.tauAtS(best) * (U_TIP - U_GO) };
  });
  stopMarks.forEach((m, i) => {
    const rip = m.querySelector('.drive__ripple');
    const ring = m.querySelector('.drive__stop-ring');
    const a = gsap
      .timeline({ paused: true })
      .fromTo(rip, { attr: { r: 9 }, strokeOpacity: 0.9 }, { attr: { r: 32 }, strokeOpacity: 0, duration: 0.9, ease: 'power2.out', immediateRender: false }, 0)
      .fromTo(ring, { attr: { r: 13 } }, { attr: { r: 9 }, duration: 0.6, ease: 'elastic.out(1, 0.5)', immediateRender: false }, 0);
    punch(stopU[i].u, a);
  });
  const arrive = gsap
    .timeline({ paused: true })
    .to(destFill, { fillOpacity: 1, duration: 0.35, ease: 'power2.out' }, 0)
    .fromTo(destPinG, { attr: { transform: 'scale(0.31 0.235) translate(-256 -330)' } }, { attr: { transform: 'scale(0.28 0.28) translate(-256 -330)' }, duration: 0.8, ease: 'elastic.out(1, 0.5)', immediateRender: false }, 0)
    .fromTo(ripA, { attr: { r: 20 }, strokeOpacity: 1 }, { attr: { r: 76 }, strokeOpacity: 0, duration: 1.1, ease: 'power2.out', immediateRender: false }, 0.05)
    .fromTo(ripB, { attr: { r: 20 }, strokeOpacity: 1 }, { attr: { r: 76 }, strokeOpacity: 0, duration: 1.1, ease: 'power2.out', immediateRender: false }, 0.3);
  punch(U_LIFT - 0.008, arrive);

  // ---------------------------------------------------------------- chase cam
  const camX = gsap.quickTo(cam, 'x', { duration: 0.45, ease: 'power3' });
  const camY = gsap.quickTo(cam, 'y', { duration: 0.45, ease: 'power3' });
  const leanTo = gsap.quickTo(leanEl, 'rotation', { duration: 0.8, ease: 'power3' });
  const setOrigin = () => gsap.set(leanEl, { transformOrigin: `${L.fx}px ${L.y0}px` });
  setOrigin();

  // ---------------------------------------------------------------- render
  function renderPlanned() {
    plannedReveal.style.strokeDasharray = `${(S.planned * RL).toFixed(1)} ${(RL + 200).toFixed(0)}`;
  }

  const sAtU = (u) => (u <= U_GO ? 0 : u >= U_TIP ? 1 : M.sAtTau((u - U_GO) / (U_TIP - U_GO)));
  let etaLock = 0;
  let hudSaved = null;
  let hudParked = false;
  let hudKey = '';
  let chev = false;

  function setMode(i) {
    if (i === S.mode) return;
    const was = S.mode;
    S.mode = i;
    // FLIP by hand: measure, move the pill into the new mode, play it back from the old box
    const from = pill.classList.contains('is-off') ? null : pill.getBoundingClientRect();
    gsap.set(pill, { x: 0, y: 0, scaleX: 1 });
    modes.forEach((m, j) => m.classList.toggle('is-active', j === i));
    if (i >= 0) modes[i].prepend(pill);
    pill.classList.toggle('is-off', i < 0);
    if (from && i >= 0 && !env.shots) {
      const to = pill.getBoundingClientRect();
      gsap.fromTo(
        pill,
        { x: from.left - to.left, y: from.top - to.top, scaleX: from.width / (to.width || 1), transformOrigin: '0 50%' },
        { x: 0, y: 0, scaleX: 1, duration: 0.55, ease: 'expo.inOut', overwrite: true },
      );
    }
    if (was >= 0 && i >= 0 && !env.shots) {
      etaLock = performance.now() + 380;
      fx.scramble(etaEl, etaEl.textContent, { duration: 0.35, letters: false });
    }
  }

  function setChevron(on) {
    if (on === chev) return;
    chev = on;
    traveler.chevronMode(on);
  }

  function render() {
    const u = S.u;
    const s = sAtU(u);
    S.s = s;
    const i = Math.round(s * (N - 1));
    const kmh = u <= U_GO || s >= 1 ? 0 : AVG_KMH;
    S.kmh = kmh;

    // driven line (solid) over the dashed planned road
    const dl = (s * RL).toFixed(1);
    driven.style.strokeDasharray = `${dl} ${(RL + 200).toFixed(0)}`;
    ovDriven.style.strokeDasharray = `${dl} ${(RL + 200).toFixed(0)}`;
    const p = M.P.at(s);
    ovDot.setAttribute('cx', p.x.toFixed(1));
    ovDot.setAttribute('cy', p.y.toFixed(1));

    // readouts
    numEl.textContent = String(kmh);
    const brg = Math.round(M.bearing[i]) % 360;
    brgEl.textContent = `${pad(brg, 3)}°`;
    needle.style.setProperty('--brg', `${M.bearing[i].toFixed(1)}deg`);
    // ETA and LEFT read the same fraction, so they always agree (42 min over 33.6 km)
    const rem = DUR_MIN * 60 * (1 - s);
    if (performance.now() > etaLock) etaEl.textContent = `${pad(rem / 3600)}:${pad((rem % 3600) / 60)}:${pad(rem % 60)}`;
    distEl.textContent = `${(DISTANCE_KM * (1 - s)).toFixed(1)} km`;
    stopMarks.forEach((m, j) => m.classList.toggle('is-passed', s >= stopU[j].s));
    setMode(u >= LABELS.chip3 ? 2 : u >= LABELS.chip2 ? 1 : u >= LABELS.chip1 ? 0 : -1);

    // chase cam (+ lean from the bearing delta)
    const [lx, ly] = toLocal(p.x, p.y);
    if (L.mobile) {
      camX(MOBILE_PARK_DX * L.W * parkPan(u));
      camY(focus.y * L.H - ly);
    } else {
      // x locks the car on the focus line; y follows at 70% so detours stay inside the band
      camX(focus.x * L.W - lx);
      camY((focus.y * L.H - ly) * 0.7 + ARRIVE_DROP * L.H * parkPan(u));
    }
    leanTo(u > U_GO && u < U_TIP ? -M.lean[i] : 0);

    // the road headline (desktop): rides just ahead of the car, rises in, falls off at .55
    if (!L.mobile && rail) {
      const j = Math.min(rail.n - 1, (s * M.P.total) / textStep);
      const j0 = Math.floor(j);
      const arc = lerp(rail.cum[j0], rail.cum[Math.min(rail.n - 1, j0 + 1)], j - j0);
      const fsU = parseFloat(textEl.style.fontSize) || 60;
      // the curve starts just ahead of the car and is lifted 0.7em off the road; it runs on past the
      // text's end so the falling glyphs always have path under them
      const cv = headCurve(arc + 46 / L.k);
      const lift = fsU * 0.7;
      const lp = (pt, d) => `${(pt[0] + cv.nx * d).toFixed(1)} ${(pt[1] + cv.ny * d).toFixed(1)}`;
      const ext = [cv.B[0] + cv.ux * textLen * 0.3, cv.B[1] + cv.uy * textLen * 0.3];
      textLine.setAttribute('d', `M${lp(cv.A, lift)}Q${lp(cv.Q, lift)} ${lp(cv.B, lift)}L${lp(ext, lift)}`);
      if (subLine) {
        // the sub line hangs under the road at the headline's start, on the same tilt
        const drop = -(24 / L.k + (parseFloat(subEl.style.fontSize) || 18) * 0.85);
        subLine.setAttribute('d', `M${lp(cv.A, drop)}L${lp(ext, drop)}`);
      }
      // the headline rises onto the road while the stage scrolls in, so it is set before the drive starts
      const tin = Math.max(S.pre, clamp01((u - 0.012) / 0.07));
      const tout = clamp01((u - LABELS.close) / 0.06);
      textEl.style.setProperty('--wdth', lerp(62, 85, gsap.parseEase('expo.out')(clamp01(tin * 1.4))).toFixed(1));
      let prev = 0;
      const n = tsp.length;
      for (let c = 0; c < n; c++) {
        const ein = gsap.parseEase('expo.out')(clamp01((tin - (c / n) * 0.55) / 0.45));
        const eo = gsap.parseEase('power2.in')(clamp01((tout - fallDelay[c]) / 0.55));
        const off = (1 - ein) * fsU * 0.9 + eo * fsU * 1.3;
        tsp[c].setAttribute('dy', (off - prev).toFixed(2));
        tsp[c].setAttribute('rotate', (eo * fallRot[c]).toFixed(1));
        const o = (ein * (1 - eo)).toFixed(3);
        tsp[c].style.fillOpacity = o;
        tsp[c].style.strokeOpacity = o; // the ink knockout comes and goes with the glyph
        prev = off;
      }
      // the sub fades up once the headline has risen and leaves with it
      if (subEl) subEl.style.opacity = (clamp01((tin - 0.55) / 0.45) * (1 - clamp01(tout / 0.4))).toFixed(3);
    }

    // top-bar HUD: real coordinates along the real road
    if (u > 0 && S.exit === 0) {
      if (!hudSaved) hudSaved = hud.state;
      const [lat, lng] = M.ll(s);
      const extra = u >= LABELS.parked ? '0 KM/H · PARKED' : `${kmh} KM/H`;
      const key = `${lat.toFixed(4)}${lng.toFixed(4)}${extra}`;
      if (key !== hudKey) {
        hudKey = key;
        hud.set({ lat, lng, extra, mock: true }, { scramble: false });
      }
    } else if (u === 0 && hudSaved) {
      hud.set(hudSaved, { scramble: true });
      hudSaved = null;
      hudKey = '';
    }

    if (u > 0 && S.exit === 0) seg.progress = eFrac();
    setChevron(u > U_GO && u < U_TIP && S.exit === 0);
  }

  // ---------------------------------------------------------------- lead-in and exit (unpinned scroll around the pin)
  const lead = () => {
    const top = stage.getBoundingClientRect().top;
    seg.progress = eFrac() * clamp01((0.6 * window.innerHeight - top) / (L.y0 || 1));
    const pre = clamp01((0.6 * window.innerHeight - top) / (0.45 * window.innerHeight));
    if (pre !== S.pre) {
      S.pre = pre;
      if (S.u === 0) render();
    }
  };
  ScrollTrigger.create({
    trigger: stage,
    start: 'top 60%',
    end: 'top top',
    onUpdate: lead,
    onRefresh: (self) => self.isActive && lead(),
    onLeave: () => {
      seg.progress = eFrac();
      S.pre = 1;
    },
    onLeaveBack: () => {
      seg.progress = 0;
      S.pre = 0;
      if (S.u === 0) render();
    },
  });
  const applyExit = () => {
    const e = S.exit;
    seg.progress = e > 0 ? xFrac() + (1 - xFrac()) * clamp01((e - 0.15) / 0.85) : S.u > 0 ? eFrac() : seg.progress;
    // full orange while the dot is parked in it; an outline the moment the dot has left (no half tint)
    gsap.set(dest.querySelector('.drive__pin-fill'), { opacity: e < 0.15 ? 1 : 0 });
    if (e > 0) setChevron(false);
  };
  ScrollTrigger.create({
    trigger: stage,
    start: () => pin.st.end,
    end: () => pin.st.end + 0.4 * window.innerHeight,
    onUpdate: (self) => {
      S.exit = self.progress;
      applyExit();
      // leaving the stage: the phone stays parked here, but the HUD no longer reads the brake
      const gone = S.exit > 0.25;
      if (gone !== hudParked) {
        hudParked = gone;
        hudKey = '';
        hud.set({ extra: gone ? 'ACC 3 M' : '0 KM/H · PARKED' });
      }
    },
    onLeaveBack: () => {
      S.exit = 0;
      hudParked = false;
      hudKey = '';
      applyExit();
      render();
    },
  });

  // ---------------------------------------------------------------- the traveler: this stage owns it
  const pinCenterLocal = () => {
    const [x, y] = toLocal(...END);
    return [x, y + PIN_LIFT];
  };
  const toScreen = (x, y) => {
    const m = live.getScreenCTM();
    return m ? { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f } : { x: -99, y: -99 };
  };
  const leanDeg = () => gsap.getProperty(leanEl, 'rotation') || 0;
  function dot() {
    const u = S.u;
    if (S.exit > 0) {
      const e = S.exit;
      if (e < 0.15) {
        const [tx, ty] = toLocal(...END);
        const [cx, cy] = pinCenterLocal();
        const k = gsap.parseEase('power2.inOut')(e / 0.15);
        return { ...toScreen(lerp(cx, tx, k), lerp(cy, ty, k)), angle: 90 };
      }
      return seg.headScreen();
    }
    if (u <= 0) return seg.headScreen();
    if (u < U_TIP) {
      const s = S.s;
      const p = M.P.at(s);
      const a = M.P.at(Math.min(1, s + 0.002));
      const b = M.P.at(Math.max(0, s - 0.002));
      const [dx, dy] = dirLocal(a.x - b.x, a.y - b.y);
      const [lx, ly] = toLocal(p.x, p.y);
      return { ...toScreen(lx, ly), angle: (Math.atan2(dy, dx) * 180) / Math.PI + leanDeg() };
    }
    const [tx, ty] = toLocal(...END);
    const [cx, cy] = pinCenterLocal();
    const k = gsap.parseEase('power2.inOut')(clamp01((u - U_TIP) / (U_LIFT - U_TIP)));
    return { ...toScreen(lerp(tx, cx, k), lerp(ty, cy, k)), angle: -90 };
  }
  traveler.follow(() => {
    const r = stage.getBoundingClientRect();
    const line = 0.6 * window.innerHeight;
    if (r.top > line + 1 || r.bottom < line - 1) {
      if (chev) setChevron(false);
      return null;
    }
    return dot();
  });

  // ---------------------------------------------------------------- copy (mobile: real h2; desktop: the road headline)
  ctx.media({
    // desktop: the headline and its sub ride the road (render() above); the HTML twins stay for assistive tech
    mobile: () => {
      fx.reveal(h2, { sub, trigger: stage, start: 'top 55%' });
    },
  });

  ScrollTrigger.addEventListener('refresh', () => {
    setOrigin();
    renderPlanned();
    render();
  });
  renderPlanned();
  render();

  ctx.shared.set('drive', {
    tl,
    st: pin.st,
    stage,
    seg,
    punch,
    length: pin.length,
    labels: LABELS,
    state: S,
    focus,
    dot,
    parts: { world, cam, live, dest, destFill, copy, hud: hudLayer, numeral: numEl },
  });
}
