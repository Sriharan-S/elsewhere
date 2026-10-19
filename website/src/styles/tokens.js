// JS mirror of tokens.css. Import from scenes: import { color, ease, dur, bp, MQ } from '../styles/tokens.js'

export const color = {
  bg: '#0B0B0A',
  fg: '#EEEAE2',
  accent: '#FF6B1A',
  muted: '#8A857C',
  paper: '#EEEAE2',
  ink: '#0B0B0A',
  ghost: 'rgba(238,234,226,0.4)', // the leaked real position (hollow ring)
  hair: 'rgba(238,234,226,0.18)',
  mapArt: '#2F2D29',
  mapCol: '#262420',
  mapMin: '#1E1D1B',
};

/** GSAP ease names. Use these instead of literals so the motion language stays consistent. */
export const ease = {
  out: 'power2.out', // gsap default
  text: 'expo.out', // SplitText reveals, PARKED slam
  wipe: 'expo.inOut', // Swiss wipes, hold-bars
  enter: 'power3.out', // devices sliding in
  yank: 'power3.in', // things leaving fast
  pop: 'back.out(2)', // the fix dot
  land: 'back.out(1.6)', // widgets, chips landing
  drop: 'back.out(1.4)', // notification pill
  squash: 'elastic.out(1, 0.5)', // pin landings
  wobble: 'elastic.out(1, 0.3)', // rejected link bounce
  draw: 'power2.inOut', // DrawSVG strokes
  none: 'none', // scrubbed tracks
};

export const dur = {
  fast: 0.2,
  base: 0.6,
  text: 0.9,
  scramble: 0.4,
  slam: 0.4,
};

/** Text reveal defaults (storyboard). */
export const text = {
  yFrom: 125, // yPercent start for masked chars/lines (clears the descender padding of the mask)
  charStagger: 0.035,
  lineStagger: 0.06,
  wdthFrom: 62,
  wdthRest: 85,
};

/** Scrub weights. Always pass through ctx.scrub(n) so ?shots can make them jump. */
export const scrub = { base: 0.6, heavy: 1.0 };

/** Breakpoints (px). Mobile is < 768. */
export const bp = { phone: 600, tablet: 768, desktop: 1024, wide: 1600 };

/** gsap.matchMedia conditions. */
export const MQ = {
  desktop: '(min-width: 768px) and (prefers-reduced-motion: no-preference)',
  mobile: '(max-width: 767px) and (prefers-reduced-motion: no-preference)',
  reduce: '(prefers-reduced-motion: reduce)',
};

/** Mobile pin lengths are about 0.65x desktop. */
export const MOBILE_PIN = 0.65;

/** The page thread: stroke + dash rhythm '2.7w 2.2w' (round caps -> visible 3.7w dash, 1.2w gap). */
export const thread = {
  width: 2,
  widthPhone: 1.5,
  dash: (w) => `${+(2.7 * w).toFixed(2)} ${+(2.2 * w).toFixed(2)}`,
  /** The draw head sits on this viewport line during lead-ins. */
  headLine: 0.6,
};

/** Demo HUD places (the hero teleport loop). */
export const places = [
  { label: 'CHENNAI', lat: 13.0827, lng: 80.2707 },
  { label: 'PARIS', lat: 48.8566, lng: 2.3522 },
  { label: 'TOKYO', lat: 35.6762, lng: 139.6503 },
  { label: 'BENGALURU', lat: 12.9716, lng: 77.5946 },
];
