// The brand mark: a map pin above a bent, dashed route (traced from assets/images/logo.png).
// Pure string builders with no DOM access, so the Vite plugin, the asset renderer
// (Node) and the browser all share one source of truth.

/** Pin outline. It starts and ends at the tip, so DrawSVG "0% 0%" -> "0% 100%" draws from the tip. */
export const PIN_D =
  'M256 330 C238 304 180 254 178 182 A78 78 0 1 1 334 182 C332 254 274 304 256 330 Z';

/** Route polyline, from its upper-left end (by the pin) to its lower-right end. */
export const ROUTE_POINTS = [
  [215, 308],
  [172, 308],
  [137, 351],
  [238, 403],
  [325, 374],
  [381, 406],
];
export const ROUTE_D = 'M' + ROUTE_POINTS.map((p) => p.join(' ')).join(' L');
export const ROUTE_START = ROUTE_POINTS[0];
export const ROUTE_END = ROUTE_POINTS[ROUTE_POINTS.length - 1];

/** Centre of the pin head, where the orange "fix" sits. */
export const PIN_CENTER = [256, 182];
/** Pin tip, and the point straight below it on the route (238,403 -> 325,374 leg). */
export const TIP = [256, 330];
export const ROUTE_UNDER_TIP = [256, +(403 - (29 / 87) * 18).toFixed(2)];

/** Stroke width of the mark in logo units (viewBox 512). */
export const STROKE = 14;

/**
 * The logo's own dash pattern: three long dashes with two short breaks, as in the PNG.
 * Values are dash/gap lengths along ROUTE_D for round caps at STROKE width.
 */
export const LOGO_DASH = '142.8 24 74.3 26 400';

/** Page-thread dash rhythm from the storyboard: '2.7w 2.2w' with round caps. */
export const dashFor = (w) => `${+(2.7 * w).toFixed(2)} ${+(2.2 * w).toFixed(2)}`;

/** viewBoxes: 'square' is the 512 app-icon canvas, 'icon' is a padded square crop, 'tight' hugs the mark. */
export const VIEWBOX = {
  square: '0 0 512 512',
  icon: '58 58 396 396',
  tight: '122 90 268 330',
};

let uid = 0;
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Logo markup.
 * @param {object} o
 * @param {string} [o.id]       unique id prefix (used by the route mask). Required when several logos share a page.
 * @param {string} [o.class]    extra classes on the <svg>
 * @param {'tight'|'icon'|'square'} [o.variant]
 * @param {boolean} [o.fix]     include the orange fix dot inside the pin (static end state; JS may hide it)
 * @param {boolean} [o.bg]      paint the ink square behind (favicon / app icon)
 * @param {string} [o.label]    accessible name; omit for aria-hidden
 * @param {number} [o.stroke]   stroke width in logo units (default 14)
 * @param {string} [o.fg] [o.accent] [o.ink]  explicit colours for standalone files; default uses CSS vars
 *
 * Structure (stable class names, safe to target from CSS/GSAP):
 *   svg.logo[data-logo=id]
 *     mask#{id}-rm > path.logo__route-reveal   (solid, animate with DrawSVG to reveal the dashed route)
 *     g.logo__pin  > path.logo__pin-path        (starts at the tip)
 *     g.logo__route[mask] > path.logo__route-path (dashed)
 *     circle.logo__fix                          (only with fix: true)
 */
export function logoSVG(o = {}) {
  const id = o.id || `logo${++uid}`;
  const variant = o.variant || 'tight';
  const w = +o.stroke || STROKE;
  const fg = o.fg || 'var(--fg, #EEEAE2)';
  const accent = o.accent || 'var(--accent, #FF6B1A)';
  const ink = o.ink || 'var(--bg, #0B0B0A)';
  const a11y = o.label
    ? `role="img" aria-label="${esc(o.label)}"`
    : 'aria-hidden="true" focusable="false"';
  const cls = ['logo', o.class].filter(Boolean).join(' ');
  const bg = o.bg ? `<rect class="logo__bg" width="512" height="512" fill="${ink}"/>` : '';
  const dash = w === STROKE ? LOGO_DASH : scaleDash(LOGO_DASH, w);
  const fix = o.fix
    ? `<circle class="logo__fix" cx="${PIN_CENTER[0]}" cy="${PIN_CENTER[1]}" r="17" fill="${accent}" stroke="none"/>`
    : '';
  return (
    `<svg class="${cls}" viewBox="${VIEWBOX[variant] || VIEWBOX.tight}" ${a11y} data-logo="${id}" ` +
    `fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    bg +
    `<defs><mask id="${id}-rm" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">` +
    `<path class="logo__route-reveal" d="${ROUTE_D}" stroke="#fff" stroke-width="${w + 12}" stroke-linecap="square"/>` +
    `</mask></defs>` +
    `<g class="logo__pin"><path class="logo__pin-path" d="${PIN_D}" stroke="${fg}" stroke-width="${w}"/></g>` +
    `<g class="logo__route" mask="url(#${id}-rm)"><path class="logo__route-path" d="${ROUTE_D}" ` +
    `stroke="${fg}" stroke-width="${w}" stroke-dasharray="${dash}"/></g>` +
    fix +
    `</svg>`
  );
}

// Keep the visible breaks the same size when the stroke gets thicker (round caps eat w/2 per side).
function scaleDash(pattern, w) {
  const d = w - STROKE;
  return pattern
    .split(' ')
    .map(Number)
    .map((v, i) => (i % 2 ? v + d : Math.max(0.01, v - d)))
    .map((v) => +v.toFixed(2))
    .join(' ');
}

/** Standalone favicon / app-icon SVG file (explicit colours, no CSS vars). */
export function faviconSVG() {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    logoSVG({
      id: 'fav',
      variant: 'icon',
      bg: true,
      stroke: 20,
      fg: '#EEEAE2',
      ink: '#0B0B0A',
      accent: '#FF6B1A',
    })
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace('<rect class="logo__bg" width="512" height="512"', '<rect class="logo__bg" x="58" y="58" width="396" height="396"') +
    '\n'
  );
}
