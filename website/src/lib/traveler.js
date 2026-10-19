// The traveler: one position:fixed orange dot (12px + 2px ink ring) that rides the head of the thread.
// "Orange only ever means where the world thinks you are."
//
// Each frame it is placed by, in priority order:
//   1. the most recent follow() source that returns a position (scenes whose subject is the dot)
//   2. auto: the head of the last thread segment (document order) whose stage top has crossed
//      the 60% line and that has started drawing
// It never jumps between sections because each segment starts where the previous one ended.
import { gsap, ScrollTrigger } from './gsap.js';
import { env } from './env.js';
import { segments } from './thread.js';
import * as loop from './loop.js';
import { thread as T } from '../styles/tokens.js';

const CHEVRON =
  '<svg viewBox="0 0 18 22" width="18" height="22" aria-hidden="true"><path d="M9 1.5 16.5 20 9 15.6 1.5 20Z" ' +
  'fill="var(--accent)" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/></svg>';

let el;
let body;
let dot;
let chev;
const stack = [];
let shown = false;
let setX;
let setY;
let setRot;
const pos = { x: -100, y: -100, angle: 0, visible: false };

function resolve(src) {
  if (typeof src === 'function') return src();
  if (src && typeof src.headScreen === 'function') return src.headScreen();
  if (src instanceof Element) {
    const r = src.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return null;
}

// Document-space tops of each segment's stage, measured once per refresh (a pinned stage is measured at
// its pin spacer, i.e. where it starts), so auto mode never reads layout per frame. Comparing the spacer
// top against the 60% line gives the same answer as the live stage top: both have crossed it or neither.
let tops = new WeakMap();
function measureTops() {
  tops = new WeakMap();
  const y = window.scrollY;
  for (const s of segments) {
    const box = s.stage.parentElement?.classList.contains('pin-spacer') ? s.stage.parentElement : s.stage;
    tops.set(s, box.getBoundingClientRect().top + y);
  }
}
ScrollTrigger.addEventListener('refresh', measureTops);

function autoOwner() {
  const lineY = T.headLine * window.innerHeight + 0.5;
  const y = window.scrollY;
  let owner = null;
  for (const s of segments) {
    if (!s.auto || (s.progress <= 0 && !s.holdAtStart)) continue;
    let docTop = tops.get(s);
    if (docTop === undefined) {
      docTop = s.stage.getBoundingClientRect().top + y; // a segment created since the last refresh
      tops.set(s, docTop);
    }
    if (docTop - y <= lineY) owner = s;
  }
  return owner;
}

function tick() {
  if (!shown || document.hidden) return;
  let p = null;
  for (let i = stack.length - 1; i >= 0 && !p; i--) p = resolve(stack[i]);
  if (!p) {
    const o = autoOwner();
    p = o ? o.headScreen() : null;
  }
  const visible = !!p && !p.hidden;
  if (visible !== pos.visible) {
    el.classList.toggle('is-on', visible);
    pos.visible = visible;
  }
  if (!visible) return;
  if (p.x !== pos.x) setX((pos.x = p.x));
  if (p.y !== pos.y) setY((pos.y = p.y));
  if (p.angle !== undefined && p.angle !== pos.angle) setRot((pos.angle = p.angle) + 90);
}

export const traveler = {
  /** Root element (position: fixed, 0x0, moved with transforms). */
  get el() {
    return el;
  },
  /** The orange dot. Tween its scale for emphasis (e.g. gsap.to(traveler.dot, { scale: 2 })). */
  get dot() {
    return dot;
  },
  /** The chevron used in drive mode (rotated to the path bearing). */
  get chevron() {
    return chev;
  },
  /** Last rendered position { x, y, angle, visible } in viewport px. */
  get position() {
    return pos;
  },

  mount() {
    if (el) return traveler;
    el = document.createElement('div');
    el.className = 'traveler';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      `<div class="traveler__body"><span class="traveler__ring"></span>` +
      `<span class="traveler__chev">${CHEVRON}</span><span class="traveler__dot"></span></div>`;
    document.body.appendChild(el);
    body = el.firstElementChild;
    dot = el.querySelector('.traveler__dot');
    chev = el.querySelector('.traveler__chev');
    setX = gsap.quickSetter(body, 'x', 'px');
    setY = gsap.quickSetter(body, 'y', 'px');
    setRot = gsap.quickSetter(chev, 'rotation', 'deg');
    if (!env.reduced) loop.add(tick);
    return traveler;
  },

  /** Start rendering (the hero calls this at the intro's fix). No-op under reduced motion. */
  show() {
    if (env.reduced) return;
    shown = true;
    tick();
  },
  hide() {
    shown = false;
    el?.classList.remove('is-on');
    pos.visible = false;
  },

  /**
   * Take ownership of the dot. source: () => ({ x, y, angle?, hidden? }) | null, an Element (its centre),
   * or a thread segment (its draw head). Return null from a function to pass ownership on.
   * Returns a release() function. Call it when your scene hands the dot back.
   */
  follow(source) {
    stack.push(source);
    return () => {
      const i = stack.lastIndexOf(source);
      if (i >= 0) stack.splice(i, 1);
    };
  },

  /** Switch between the round dot and the bearing chevron. */
  chevronMode(on) {
    el?.classList.toggle('is-chevron', !!on);
  },

  /** One 1px ring pulsing out from the dot (scale 1 -> 3, opacity 1 -> 0). Returns the tween. */
  pulse({ scale = 3, duration = 0.9, ease = 'power2.out' } = {}) {
    if (!el || env.reduced) return null;
    const ring = el.querySelector('.traveler__ring');
    return gsap.fromTo(ring, { scale: 1, opacity: 1 }, { scale, opacity: 0, duration, ease, overwrite: true });
  },

  /** The fix: dot pops in (scale 0 -> s, back.out(2)) with a pulse. */
  pop(s = 1) {
    if (!el || env.reduced) return null;
    traveler.pulse();
    return gsap.fromTo(dot, { scale: 0 }, { scale: s, duration: 0.5, ease: 'back.out(2)' });
  },
};
