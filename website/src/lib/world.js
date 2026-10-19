// Helpers for the shared abstract street map (symbol #world, 2400 x 1600).
// Use <use href="#world"> for backdrops (styled through --map-* custom properties), or
// paths() when a scene must animate individual roads (e.g. fade in by hierarchy).
import data from './world-data.js';

const NS = 'http://www.w3.org/2000/svg';
export const WORLD = { width: data.width, height: data.height, viewBox: data.viewBox };
export { data as worldData };

/**
 * Markup for a backdrop: an <svg class="world"> showing a window (x, y, w, h) of the map.
 * The <use> sits inside g.world__pan so you can translate it (teleports, chase cams).
 */
export function worldSVG({ x = 400, y = 300, w = 1600, h = 1000, className = '', slice = true } = {}) {
  return (
    `<svg class="world ${className}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid ${slice ? 'slice' : 'meet'}" ` +
    `aria-hidden="true" focusable="false"><g class="world__pan"><use href="#world" width="${data.width}" height="${data.height}"/></g></svg>`
  );
}

/**
 * Append real <path> elements for chosen layers into an SVG group (same 2400x1600 space).
 * @param {SVGGElement} g
 * @param {object} [o]  { layers: ['water','park','min','col','art','bldg'] }
 * @returns {{water:SVGPathElement[], park:SVGPathElement[], min:SVGPathElement[], col:SVGPathElement[], art:SVGPathElement[], bldg:SVGPathElement[]}}
 */
export function paths(g, { layers = ['water', 'park', 'min', 'col', 'art', 'bldg'] } = {}) {
  const out = { water: [], park: [], min: [], col: [], art: [], bldg: [] };
  const add = (cls, d, key, extra) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    if (extra) for (const k in extra) p.setAttribute(k, extra[k]);
    g.appendChild(p);
    out[key].push(p);
  };
  for (const L of layers) {
    if (L === 'water') add('water', data.water, 'water');
    if (L === 'park') add('park', data.park, 'park');
    if (L === 'min') data.min.forEach((d) => add('r-min', d, 'min'));
    if (L === 'col') data.col.forEach((d) => add('r-col', d, 'col'));
    if (L === 'art') data.art.forEach((d) => add('r-art', d, 'art'));
    if (L === 'bldg') data.bldg.forEach((b) => add('bldg', b.d, 'bldg', { 'data-h': b.h }));
  }
  return out;
}
