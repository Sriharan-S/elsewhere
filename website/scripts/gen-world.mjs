// Generates the shared abstract street map (2400 x 1600) used by every scene.
// Deterministic (seeded) so the output only changes when this file changes.
//   node scripts/gen-world.mjs
// Writes:
//   src/partials/sprites.html  -> <symbol id="world"> for <use href="#world">
//   src/lib/world-data.js      -> the same geometry as data, for scenes that animate single roads
// Abstract and non-political on purpose: no real places, no borders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 2400;
const H = 1600;

let seed = 20261016;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const range = (a, b) => a + (b - a) * rnd();
const r1 = (n) => Math.round(n);

/** Catmull-Rom through points -> cubic bezier path. */
function smooth(pts, tension = 0.5) {
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const t = tension / 3;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}
const jitter = (pts, a) => pts.map(([x, y], i) => (i === 0 || i === pts.length - 1 ? [x, y] : [x + range(-a, a), y + range(-a, a)]));

// ---------------------------------------------------------------- water + park
const river = smooth([
  [-120, 1010], [260, 1080], [620, 960], [980, 1040], [1360, 900], [1720, 960], [2060, 860], [2520, 900],
]);
const parkPts = [
  [880, 170], [1190, 150], [1230, 330], [1150, 380], [900, 360], [860, 250],
];
const park = smooth([...parkPts, parkPts[0]], 0.35) + 'Z';

// ---------------------------------------------------------------- arterials (6)
const art = [
  jitter([[-80, 450], [380, 410], [800, 480], [1240, 430], [1700, 505], [2120, 470], [2480, 520]], 18),
  jitter([[-80, 1300], [420, 1330], [900, 1250], [1380, 1290], [1840, 1210], [2480, 1250]], 18),
  jitter([[600, -80], [640, 340], [560, 800], [660, 1220], [610, 1680]], 16),
  jitter([[1580, -80], [1520, 420], [1600, 830], [1500, 1260], [1550, 1680]], 16),
  jitter([[-80, 1580], [560, 1150], [1180, 780], [1800, 430], [2480, 40]], 14),
  jitter([[2120, -80], [2060, 380], [2160, 820], [2080, 1200], [2140, 1680]], 16),
].map((p) => smooth(p));

// ---------------------------------------------------------------- collectors (14)
const colPts = [
  [[-80, 180], [500, 220], [1100, 170], [1650, 230], [2480, 190]],
  [[-80, 760], [380, 720], [820, 780], [1180, 700]],
  [[1700, 680], [2050, 640], [2480, 700]],
  [[-80, 1480], [380, 1440], [880, 1500], [1300, 1450]],
  [[1650, 1450], [2050, 1500], [2480, 1430]],
  [[240, -80], [280, 420], [210, 900], [260, 1300], [220, 1680]],
  [[1020, -80], [980, 300], [1060, 640], [980, 1000], [1040, 1420], [1000, 1680]],
  [[1280, 460], [1320, 860], [1240, 1260], [1290, 1680]],
  [[1860, -80], [1820, 360], [1880, 720], [1820, 1100]],
  [[2330, 120], [2300, 640], [2350, 1120], [2310, 1680]],
  [[640, 600], [900, 560], [1280, 620]],
  [[1600, 1040], [1850, 1080], [2100, 1020]],
  [[300, 1120], [520, 1060], [700, 1120]],
  [[1180, 1100], [1350, 1050], [1520, 1110]],
];
const col = colPts.map((p) => smooth(jitter(p, 14)));

// ---------------------------------------------------------------- minor grids (30)
// Each district is one path made of short parallel streets in two directions,
// clipped to a rotated rectangle. Some streets stop short so it reads organic.
const min = [];
const cols = 6;
const rows = 5;
for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    const cx = (i + 0.5) * (W / cols) + range(-60, 60);
    const cy = (j + 0.5) * (H / rows) + range(-40, 40);
    const ang = ((i + j) % 2 ? 0 : 12) + range(-10, 10);
    const a = (ang * Math.PI) / 180;
    const hw = range(150, 200);
    const hh = range(110, 150);
    const sx = range(46, 66);
    const sy = range(42, 60);
    const rot = ([u, v]) => [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
    let d = '';
    for (let u = -hw + sx * 0.5; u < hw; u += sx) {
      const v0 = -hh + (rnd() < 0.25 ? range(0, hh * 0.8) : 0);
      const v1 = hh - (rnd() < 0.25 ? range(0, hh * 0.8) : 0);
      const p0 = rot([u, v0]);
      const p1 = rot([u, v1]);
      d += `M${r1(p0[0])} ${r1(p0[1])}L${r1(p1[0])} ${r1(p1[1])}`;
    }
    for (let v = -hh + sy * 0.5; v < hh; v += sy) {
      const u0 = -hw + (rnd() < 0.25 ? range(0, hw * 0.7) : 0);
      const u1 = hw - (rnd() < 0.25 ? range(0, hw * 0.7) : 0);
      const p0 = rot([u0, v]);
      const p1 = rot([u1, v]);
      d += `M${r1(p0[0])} ${r1(p0[1])}L${r1(p1[0])} ${r1(p1[1])}`;
    }
    min.push(d);
  }
}

// ---------------------------------------------------------------- buildings (18)
// Three city blocks of six footprints each (3 x 2), so they read as blocks, not confetti.
const bldg = [];
const blocks = [
  { x: 1230, y: 640, a: 8 },
  { x: 760, y: 1120, a: -6 },
  { x: 1830, y: 330, a: 4 },
];
for (const blk of blocks) {
  const a = (blk.a * Math.PI) / 180;
  const rot = (u, v) => [blk.x + u * Math.cos(a) - v * Math.sin(a), blk.y + u * Math.sin(a) + v * Math.cos(a)];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 3; i++) {
      const w = range(26, 38);
      const h = range(22, 32);
      const u = (i - 1) * 48 + range(-3, 3);
      const v = (j - 0.5) * 44 + range(-2, 2);
      const c = [
        rot(u - w / 2, v - h / 2), rot(u + w / 2, v - h / 2), rot(u + w / 2, v + h / 2), rot(u - w / 2, v + h / 2),
      ];
      const ctr = rot(u, v);
      bldg.push({
        d: 'M' + c.map((p) => `${r1(p[0])} ${r1(p[1])}`).join('L') + 'Z',
        h: r1(range(24, 96)),
        cx: r1(ctr[0]),
        cy: r1(ctr[1]),
      });
    }
  }
}

// ---------------------------------------------------------------- output
const data = { viewBox: `0 0 ${W} ${H}`, width: W, height: H, water: river, park, art, col, min, bldg };

const sym =
  `<symbol id="world" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
  `<path class="water" d="${river}"/>` +
  `<path class="park" d="${park}"/>` +
  `<g class="g-min">${min.map((d) => `<path class="r-min" d="${d}"/>`).join('')}</g>` +
  `<g class="g-col">${col.map((d) => `<path class="r-col" d="${d}"/>`).join('')}</g>` +
  `<g class="g-art">${art.map((d) => `<path class="r-art" d="${d}"/>`).join('')}</g>` +
  `<g class="g-bldg">${bldg.map((b) => `<path class="bldg" data-h="${b.h}" d="${b.d}"/>`).join('')}</g>` +
  `</symbol>`;

const sprites = `<!-- Generated by scripts/gen-world.mjs. Do not edit by hand. -->
<svg class="sprites" width="0" height="0" aria-hidden="true" focusable="false">
<defs>
${sym}
</defs>
</svg>
`;

fs.mkdirSync(path.join(ROOT, 'src/partials'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/partials/sprites.html'), sprites);
fs.writeFileSync(
  path.join(ROOT, 'src/lib/world-data.js'),
  `// Generated by scripts/gen-world.mjs. Do not edit by hand.\nexport default ${JSON.stringify(data)};\n`,
);
console.log(
  `world: ${art.length} arterials, ${col.length} collectors, ${min.length} minor grids, ${bldg.length} buildings, ` +
    `${(sprites.length / 1024).toFixed(1)} KB`,
);
