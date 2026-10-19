// THE THREAD: one dashed route drawn from the first pixel to the last.
//
// Each scene authors its own segment as normalized points in its stage box (0..1).
// The first point is (data-thread-in, 0), the last is (data-thread-out, 1), and each
// section's out equals the next section's in, so segments meet at the seams.
// Geometry is rebuilt at the stage's real pixel size on every ScrollTrigger refresh
// (viewBox 0 0 w h), so there is never aspect distortion.
//
// Drawing: the dashed path sits inside a <mask>; a solid twin inside the mask is
// revealed with a dasharray. Keep each segment's d to ONE subpath (a single M): browsers restart
// the dash pattern and the reveal at every M, so a second subpath would appear all at once. `progress` (0..1 of path length) is a plain property,
// so GSAP can tween it: tl.to(seg, { progress: 1, ease: 'none' }).
import { gsap, ScrollTrigger } from './gsap.js';
import { env, isPhone } from './env.js';
import { thread as T } from '../styles/tokens.js';

const NS = 'http://www.w3.org/2000/svg';
const f = (n) => Math.round(n * 100) / 100;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Reveal-mask bounds, in stage widths/heights on each side of the box. */
const MASK_PAD = 4;
const num = (v, d) => (v === undefined || v === null || v === '' || isNaN(+v) ? d : +v);

/**
 * Flatten SVG path data (M L H V Q C Z, absolute or relative: what roundedPath/smoothPath and the scenes
 * emit) into a polyline with cumulative lengths, in pure JS. Sampling with getPointAtLength() costs a DOM
 * path walk per call, and every segment was resampled on every refresh; this does the same in microseconds.
 * A move (M) starts a new run without adding length, as getTotalLength() counts it.
 * @returns {{ xy: Float64Array, cum: Float64Array, count: number, length: number }}
 */
export function flatten(d) {
  const xy = [];
  const cum = [];
  let len = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const push = (x, y, move) => {
    if (!move && xy.length) len += Math.hypot(x - xy[xy.length - 2], y - xy[xy.length - 1]);
    xy.push(x, y);
    cum.push(len);
  };
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
  let i = 0;
  let cmd = '';
  const num = () => +toks[i++];
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      push(sx, sy, false);
      cx = sx;
      cy = sy;
      continue;
    }
    if (!isNum()) {
      i++;
      continue;
    }
    if (C === 'M') {
      cx = num() + (rel ? cx : 0);
      cy = num() + (rel ? cy : 0);
      sx = cx;
      sy = cy;
      push(cx, cy, true);
      cmd = rel ? 'l' : 'L'; // implicit lineto after the first pair
    } else if (C === 'L') {
      cx = num() + (rel ? cx : 0);
      cy = num() + (rel ? cy : 0);
      push(cx, cy, false);
    } else if (C === 'H') {
      cx = num() + (rel ? cx : 0);
      push(cx, cy, false);
    } else if (C === 'V') {
      cy = num() + (rel ? cy : 0);
      push(cx, cy, false);
    } else if (C === 'Q') {
      const x1 = num() + (rel ? cx : 0);
      const y1 = num() + (rel ? cy : 0);
      const x = num() + (rel ? cx : 0);
      const y = num() + (rel ? cy : 0);
      const k = Math.max(4, Math.min(48, Math.ceil((Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x - x1, y - y1)) / 4)));
      for (let j = 1; j <= k; j++) {
        const t = j / k;
        const u = 1 - t;
        push(u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y, false);
      }
      cx = x;
      cy = y;
    } else if (C === 'C') {
      const x1 = num() + (rel ? cx : 0);
      const y1 = num() + (rel ? cy : 0);
      const x2 = num() + (rel ? cx : 0);
      const y2 = num() + (rel ? cy : 0);
      const x = num() + (rel ? cx : 0);
      const y = num() + (rel ? cy : 0);
      const est = Math.hypot(x1 - cx, y1 - cy) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x - x2, y - y2);
      const k = Math.max(6, Math.min(64, Math.ceil(est / 4)));
      for (let j = 1; j <= k; j++) {
        const t = j / k;
        const u = 1 - t;
        push(
          u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
          false,
        );
      }
      cx = x;
      cy = y;
    } else {
      i++; // unsupported command (A, S, T): skip its numbers
    }
  }
  return { xy: Float64Array.from(xy), cum: Float64Array.from(cum), count: cum.length, length: len };
}

/** Every live segment, kept in document order. The traveler's auto mode reads this. */
export const segments = [];
let uid = 0;

function make(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

/** Polyline with rounded (quadratic) corners. pts in px. */
export function roundedPath(pts, r = 28) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0) || 1;
    const l2 = Math.hypot(x2 - x1, y2 - y1) || 1;
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d +=
      `L${f(x1 - ((x1 - x0) / l1) * rr)} ${f(y1 - ((y1 - y0) / l1) * rr)}` +
      `Q${f(x1)} ${f(y1)} ${f(x1 + ((x2 - x1) / l2) * rr)} ${f(y1 + ((y2 - y1) / l2) * rr)}`;
  }
  const z = pts[pts.length - 1];
  return d + `L${f(z[0])} ${f(z[1])}`;
}

/** Catmull-Rom spline through pts (px) as cubic beziers. */
export function smoothPath(pts, tension = 0.5) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = tension / 3;
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) * t)} ${f(p1[1] + (p2[1] - p0[1]) * t)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) * t)} ${f(p2[1] - (p3[1] - p1[1]) * t)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** Default bend for a scene that has not authored its own: in -> S-curve -> out. */
export const defaultPoints = (tin, tout) => [
  [tin, 0],
  [tin, 0.3],
  [tout, 0.7],
  [tout, 1],
];

/**
 * Create a thread segment in a scene.
 * @param {Element} root  the <section class="scene">
 * @param {object} [o]
 * @param {Array|Function} [o.points]  normalized [[x,y],...] in the stage box, or (w, h, seg) => points
 * @param {Array|Function} [o.pointsMobile]  used when the viewport is < 768px wide
 * @param {string|Function} [o.d]  raw path data instead of points (px in stage space, or (w, h, seg) => d)
 * @param {'rounded'|'smooth'|'linear'} [o.curve='rounded']
 * @param {number} [o.radius=28]  corner radius for 'rounded' (px)
 * @param {number} [o.in] [o.out]  override data-thread-in / data-thread-out
 * @param {Element} [o.stage]  defaults to the scene's .stage
 * @param {SVGSVGElement} [o.svg]  draw into an existing svg instead of a new .thread-layer
 * @param {'stage'|'user'} [o.space]  'stage' (default without o.svg): normalized points, own .thread-layer sized to the stage.
 *   'user' (default with o.svg): points/d are in o.svg's user units, the svg's viewBox is left alone; track() is not supported.
 * @param {number} [o.width]  stroke width (default 2px, 1.5px below 600px)
 * @param {string} [o.dash]  stroke-dasharray override ('none' for a solid line)
 * @param {string} [o.className]  extra class on the visible path (e.g. 'thread--solid')
 * @param {boolean} [o.traveler=true]  false: the traveler's auto mode ignores this segment
 * @param {boolean} [o.holdAtStart=false]  true: the traveler may sit at this segment's start before it draws
 */
export function segment(root, o = {}) {
  const stage =
    o.stage || root.querySelector(':scope > .stage') || root.querySelector('.stage') || root;
  const tin = num(o.in ?? root.dataset.threadIn, 0.5);
  const tout = num(o.out ?? root.dataset.threadOut, 0.5);
  const space = o.space || (o.svg ? 'user' : 'stage');
  const id = `thr-${(o.id || root.id || 'seg').replace(/[^a-z0-9-]/gi, '')}-${++uid}`;

  let svg = o.svg;
  const ownSvg = !svg;
  if (ownSvg) {
    svg = make('svg', { class: 'thread-layer', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    const world = stage.querySelector(':scope > .world');
    if (world) world.after(svg);
    else stage.prepend(svg);
  }
  const defs = svg.querySelector(':scope > defs') || make('defs', {}, null);
  if (!defs.parentNode) svg.prepend(defs);
  const mask = make('mask', { id: `${id}-m`, maskUnits: 'userSpaceOnUse' }, defs);
  const reveal = make('path', { class: 'thread-reveal' }, mask);
  const group = make('g', { class: 'thread-group', 'data-thread': id }, svg);
  const path = make('path', { class: `thread ${o.className || ''}`.trim(), mask: `url(#${id}-m)` }, group);

  let samples = new Float32Array(0);
  let n = 0;
  let lastKey = '';
  let W = 1;
  let H = 1;
  let st = null;
  let line = T.headLine;
  let until = 'pin';

  const seg = {
    id,
    root,
    stage,
    svg,
    path,
    reveal,
    group,
    length: 0,
    leadEnd: 0,
    auto: o.traveler !== false,
    holdAtStart: !!o.holdAtStart,
    tracking: false,
    _p: 0,
    _lead: 0,
    _run: 0,

    /** Effective draw fraction (0..1 of length). Set it for full manual control (no track()). */
    get progress() {
      if (!this.tracking) return this._p;
      return this._run > 0 ? this.leadEnd + this._run * (1 - this.leadEnd) : this._lead;
    },
    set progress(v) {
      this._p = clamp01(v);
      draw();
    },
    /** With track(): 0..1 over the part after the lead-in (leadEnd..1). Tween this in your pinned timeline. */
    get run() {
      return this._run;
    },
    set run(v) {
      this._run = clamp01(v);
      draw();
    },
    get width() {
      return W;
    },
    get height() {
      return H;
    },

    rebuild,
    pointAt,
    screenAt,
    headScreen: () => screenAt(seg.progress),
    progressAtY,
    track,
    destroy,
    /** First and last points in stage px (after the latest rebuild). */
    ends: () => ({ start: pointAt(0), end: pointAt(1) }),
  };

  function resolvePoints() {
    const mobile = window.innerWidth < 768;
    let p = (mobile && o.pointsMobile) || o.points || defaultPoints(tin, tout);
    if (typeof p === 'function') p = p(W, H, seg);
    if (space === 'user') return p;
    return p.map(([x, y]) => [x * W, y * H]);
  }

  function rebuild() {
    if (space === 'stage') {
      W = Math.max(1, stage.clientWidth);
      H = Math.max(1, stage.clientHeight);
      if (ownSvg) svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      // generous bounds: segments may wander far outside the stage box (wide routes, chase cams)
      mask.setAttribute('x', -W * MASK_PAD);
      mask.setAttribute('y', -H * MASK_PAD);
      mask.setAttribute('width', W * (2 * MASK_PAD + 1));
      mask.setAttribute('height', H * (2 * MASK_PAD + 1));
    } else {
      const vb = svg.viewBox.baseVal;
      W = vb && vb.width ? vb.width : svg.clientWidth || 1;
      H = vb && vb.height ? vb.height : svg.clientHeight || 1;
      mask.setAttribute('x', (vb?.x || 0) - W * MASK_PAD);
      mask.setAttribute('y', (vb?.y || 0) - H * MASK_PAD);
      mask.setAttribute('width', W * (2 * MASK_PAD + 1));
      mask.setAttribute('height', H * (2 * MASK_PAD + 1));
    }
    let d = o.d;
    if (typeof d === 'function') d = d(W, H, seg);
    if (!d) {
      const pts = resolvePoints();
      const curve = o.curve || 'rounded';
      d = curve === 'smooth' ? smoothPath(pts) : curve === 'linear' ? roundedPath(pts, 0) : roundedPath(pts, o.radius ?? 28);
    }
    const w = o.width ?? (isPhone() ? T.widthPhone : T.width);
    // nothing moved (most refreshes): keep the geometry, only the lead-in line may depend on the viewport
    const key = `${w}|${d}`;
    if (key === lastKey && n) {
      if (seg.tracking) seg.leadEnd = computeLeadEnd();
      draw();
      return;
    }
    lastKey = key;
    path.setAttribute('d', d);
    reveal.setAttribute('d', d);
    path.style.strokeWidth = w;
    path.setAttribute('stroke-dasharray', o.dash ?? T.dash(w));
    reveal.style.strokeWidth = w + 6;
    // resample the flattened path at even arc lengths (pure JS, no DOM path walks)
    const fl = flatten(d);
    seg.length = fl.length;
    n = Math.max(32, Math.min(1200, Math.round(seg.length / 6)));
    samples = new Float32Array(n * 2);
    let j = 1;
    for (let i = 0; i < n; i++) {
      const a = (seg.length * i) / (n - 1);
      while (j < fl.count - 1 && fl.cum[j] < a) j++;
      const c0 = fl.cum[j - 1] ?? 0;
      const c1 = fl.cum[j] ?? c0;
      const k = c1 > c0 ? (a - c0) / (c1 - c0) : 1;
      const x0 = fl.xy[(j - 1) * 2] ?? 0;
      const y0 = fl.xy[(j - 1) * 2 + 1] ?? 0;
      samples[i * 2] = x0 + ((fl.xy[j * 2] ?? x0) - x0) * k;
      samples[i * 2 + 1] = y0 + ((fl.xy[j * 2 + 1] ?? y0) - y0) * k;
    }
    if (seg.tracking) seg.leadEnd = computeLeadEnd();
    draw();
  }

  function draw() {
    const p = seg.progress;
    const L = seg.length;
    path.style.visibility = p > 0.0005 ? '' : 'hidden';
    reveal.style.strokeDasharray = `${f(p * L)} ${f(L + 40)}`;
  }

  /** Point at fraction p of the length, in the svg's own units: { x, y, angle } (angle in degrees). */
  function pointAt(p) {
    if (!n) return { x: 0, y: 0, angle: 0 };
    const t = clamp01(p) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t));
    const k = t - i;
    const x0 = samples[i * 2];
    const y0 = samples[i * 2 + 1];
    const x1 = samples[i * 2 + 2];
    const y1 = samples[i * 2 + 3];
    return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, angle: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
  }

  /** Point at fraction p in viewport (client) px: { x, y, angle }. */
  function screenAt(p) {
    const pt = pointAt(p);
    if (space === 'stage' && ownSvg) {
      const r = svg.getBoundingClientRect();
      return { x: r.left + (pt.x * r.width) / W, y: r.top + (pt.y * r.height) / H, angle: pt.angle };
    }
    const m = path.getScreenCTM();
    if (!m) return { x: -999, y: -999, angle: pt.angle };
    return { x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f, angle: pt.angle };
  }

  /** First fraction where the path reaches normalized height y (0..1 of the stage). */
  function progressAtY(yN) {
    if (!n) return 0;
    const target = yN * H;
    if (samples[1] >= target) return 0;
    for (let i = 1; i < n; i++) {
      const y = samples[i * 2 + 1];
      if (y >= target) {
        const yp = samples[i * 2 - 1];
        const k = y === yp ? 0 : (target - yp) / (y - yp);
        return (i - 1 + k) / (n - 1);
      }
    }
    return 1;
  }

  function computeLeadEnd() {
    if (until === 'exit') return 1;
    if (until === 'pin') return clamp01(progressAtY((line * window.innerHeight) / H));
    return clamp01(progressAtY(+until));
  }

  function updateLead() {
    const r = stage.getBoundingClientRect();
    const y = (line * window.innerHeight - r.top) / (r.height || 1);
    seg._lead = Math.min(seg.leadEnd, progressAtY(y));
    draw();
  }

  /**
   * Lead-in: keep the draw head on the viewport's 60% line while the stage scrolls in.
   * @param {object} [t]
   * @param {'pin'|'exit'|number} [t.until='pin']
   *   'pin'  : until the stage top reaches the viewport top (use for pinned scenes, then tween `run`)
   *   'exit' : until the stage bottom reaches the 60% line (unpinned scenes: draws the whole segment)
   *   number : until normalized height y of the stage reaches the line
   */
  function track(t = {}) {
    until = t.until ?? 'pin';
    line = t.line ?? T.headLine;
    if (env.reduced) {
      seg.tracking = false;
      seg.progress = 1;
      return seg;
    }
    seg.tracking = true;
    seg.leadEnd = computeLeadEnd();
    st?.kill();
    const pct = `${line * 100}%`;
    st = ScrollTrigger.create({
      trigger: stage,
      start: `top ${pct}`,
      end:
        until === 'pin'
          ? 'top top'
          : until === 'exit'
            ? `bottom ${pct}`
            : () => `top+=${(+until) * stage.offsetHeight} ${pct}`,
      onUpdate: updateLead,
      onRefresh: () => {
        seg.leadEnd = computeLeadEnd();
        updateLead();
      },
      onLeave: () => {
        seg._lead = seg.leadEnd;
        draw();
      },
      onLeaveBack: () => {
        seg._lead = 0;
        draw();
      },
    });
    seg.st = st;
    return seg;
  }

  function destroy() {
    st?.kill();
    mask.remove();
    group.remove();
    if (ownSvg) svg.remove();
    const i = segments.indexOf(seg);
    if (i >= 0) segments.splice(i, 1);
  }

  // register in document order
  segments.push(seg);
  segments.sort((a, b) =>
    a.root === b.root ? 0 : a.root.compareDocumentPosition(b.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  );
  rebuild();
  return seg;
}

/** Rebuild every segment (called on ScrollTrigger refreshInit). */
export function rebuildAll() {
  for (const s of segments) s.rebuild();
}

ScrollTrigger.addEventListener('refreshInit', rebuildAll);

/** Convenience for timelines: a tween that draws a segment from a to b. */
export function drawTween(seg, from = 0, to = 1, vars = {}) {
  return gsap.fromTo(seg, { progress: from }, { progress: to, ease: 'none', ...vars });
}
