// One gated frame loop for per-frame work that only matters while the page moves.
//
// Callbacks run on GSAP's ticker only while something can change: during scroll, resize, wheel, touch and
// key input, after a ScrollTrigger refresh, and for a grace period after the last of those (scrub lag,
// quickTo cams, punches), or while a hold() is open. When the page is idle the listener leaves the ticker,
// so GSAP's ticker can sleep and requestAnimationFrame stops.
import { gsap, ScrollTrigger } from './gsap.js';

const fns = [];
let awake = false;
let until = 0;
let holds = 0;
/** ms of frames after the last input: the heaviest scrub (1.0) plus the longest punch (about 1.2s). */
const GRACE = 2600;

function run(time, dt, frame) {
  for (let i = 0; i < fns.length; i++) fns[i](time, dt, frame);
  if (!holds && performance.now() > until) {
    gsap.ticker.remove(run);
    awake = false;
  }
}

/** Keep the loop running for at least `ms` from now. */
export function wake(ms = GRACE) {
  until = Math.max(until, performance.now() + ms);
  if (!awake && fns.length) {
    awake = true;
    gsap.ticker.add(run);
  }
}

/** Run fn every frame while the page is awake. Returns a remover. */
export function add(fn) {
  fns.push(fn);
  wake();
  return () => {
    const i = fns.indexOf(fn);
    if (i >= 0) fns.splice(i, 1);
  };
}

/** Keep the loop awake until the returned release() is called (e.g. for a tween's lifetime). */
export function hold() {
  holds++;
  wake();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds--;
    wake();
  };
}

if (typeof window !== 'undefined') {
  const w = () => wake();
  for (const t of ['scroll', 'resize', 'wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown']) {
    window.addEventListener(t, w, { passive: true });
  }
  document.addEventListener('visibilitychange', w);
  ScrollTrigger.addEventListener('refresh', w);
}
