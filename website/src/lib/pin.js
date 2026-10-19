// Pinned, scrubbed scene timelines with the house conventions baked in.
import { gsap, ScrollTrigger } from './gsap.js';
import { env, isMobile } from './env.js';
import { MOBILE_PIN } from '../styles/tokens.js';
import { punch as runPunch } from './fx.js';
import * as loop from './loop.js';

const NOOP = {};
/**
 * Render every pending lazy GSAP render now. GSAP defers the start state of a from()/fromTo() to the end
 * of the tick ("lazy"). If a ScrollTrigger refresh reverts some timeline before that, the deferred render
 * runs while GSAP is reverting, so it removes the start state instead of applying it, and a paused punch
 * (e.g. the PARKED slam) shows its end frame from the first scroll. main.js calls this after every scene
 * init, and punch() calls it on registration.
 */
export function flushLazy() {
  gsap.to(NOOP, { duration: 1, paused: true }).progress(1, true).kill();
}

/** Scrub value: numeric smoothing normally, `true` (jump) in ?shots. */
export const scrub = (n = 0.6) => (env.shots ? true : n);

/** Snap config: desktop + fine pointer only, never in ?shots/reduced/mobile. */
export function snap(mode = 'labelsDirectional') {
  if (!mode || env.shots || env.reduced || isMobile() || !env.finePointer) return undefined;
  return { snapTo: mode, duration: { min: 0.2, max: 0.5 }, delay: 0.05, ease: 'power1.inOut' };
}

/** Timelines that must jump to their final frame once every scene has initialised (reduced motion). */
export const finals = [];

/**
 * A pinned stage driving a 0..1 timeline (positions you add are progress fractions).
 *
 * @param {object} o
 * @param {Element} o.stage      element to pin (the scene's .stage)
 * @param {number}  o.vh         scroll length on desktop in vh (e.g. 180)
 * @param {number}  [o.mobileVh] scroll length below 768px (default vh * 0.65)
 * @param {number}  [o.scrub=0.6]
 * @param {string|false} [o.snap=false]  e.g. 'labelsDirectional' (desktop + fine pointer only)
 * @param {number}  [o.finalAt=1]  progress shown under reduced motion (no pin, no scrub)
 * @param {string}  [o.start='top top']
 * @param {object}  [o.trigger]   extra ScrollTrigger vars merged in
 * @param {boolean} [o.invalidate=true]  re-record tween values on every refresh. Needed only when a tween
 *   uses function-based values (they depend on the viewport); false skips re-initialising every tween on
 *   each refresh, which is most of a refresh's cost.
 * @returns {{ tl: gsap.core.Timeline, st: ScrollTrigger|null, punch: (at:number, anim, opts?) => void, length: () => number }}
 *
 * punch(at, anim): a non-scrubbed moment (ripple, squash, PARKED slam) that play()s when the
 * timeline passes `at` going forward and reverse()s going back. Instant in ?shots.
 */
export function pinTimeline(o) {
  const stage = o.stage;
  const length = () => {
    const vh = isMobile() ? (o.mobileVh ?? o.vh * MOBILE_PIN) : o.vh;
    return (vh / 100) * window.innerHeight;
  };
  const punches = [];
  const syncPunches = () => {
    const p = tl.progress();
    for (const k of punches) {
      const on = p >= k.at;
      if (on !== k.on) {
        k.on = on;
        runPunch(k.anim, on);
      }
    }
  };
  const tl = gsap.timeline({
    paused: env.reduced,
    defaults: { ease: 'none' },
    onUpdate: syncPunches,
    scrollTrigger: env.reduced
      ? undefined
      : {
          trigger: stage,
          start: o.start || 'top top',
          end: () => `+=${Math.round(length())}`,
          pin: stage,
          scrub: scrub(o.scrub ?? 0.6),
          anticipatePin: 1,
          invalidateOnRefresh: o.invalidate !== false,
          snap: o.snap ? snap(o.snap) : undefined,
          markers: env.debug,
          onToggle: (self) => stage.classList.toggle('is-pinned', self.isActive),
          ...o.trigger,
        },
  });
  // Guarantee a 0..1 duration so positions read as progress.
  tl.to({}, { duration: 1 }, 0);
  if (env.reduced) finals.push({ tl, at: o.finalAt ?? 1, punches });
  // A refresh (resize, fonts, a late layout change) re-renders the scrubbed timeline with callbacks
  // suppressed, so punches could be left on the wrong side of their threshold. Re-sync after every refresh.
  else {
    ScrollTrigger.addEventListener('refresh', syncPunches);
    // ...and self-heal while the page moves: a punch whose animation sits on the wrong side of the playhead
    // (played or reversed by anything other than this timeline) is put back where the timeline says.
    let off = null;
    const heal = () => {
      const st = tl.scrollTrigger;
      if (!st) return off?.(); // killed (e.g. a matchMedia revert): stop for good
      if (!punches.length || !st.enabled) return;
      // only around this stage: from a viewport before its start to a viewport past its end
      const y = st.scroll();
      const vh = window.innerHeight;
      if (y < st.start - vh || y > st.end + vh) return;
      const p = tl.progress();
      for (const k of punches) {
        const on = p >= k.at;
        if (on !== k.on) {
          k.on = on;
          runPunch(k.anim, on);
          continue;
        }
        const a = k.anim;
        if (a.isActive()) continue; // mid play/reverse: leave it to finish
        const prog = a.progress();
        if (on ? a.reversed() || prog < 1 : !a.reversed() && prog > 0) runPunch(a, on);
      }
    };
    off = loop.add(heal);
  }

  return {
    tl,
    st: tl.scrollTrigger || null,
    length,
    punch(at, anim, { on = false } = {}) {
      if (!anim) return;
      anim.pause?.();
      // apply its start state now, before any refresh can revert a timeline mid-render (see flushLazy)
      flushLazy();
      punches.push({ at, anim, on });
    },
  };
}

/** Called by main.js after all scenes are built: reduced-motion end frames. */
export function applyFinals() {
  for (const f of finals) {
    f.tl.progress(f.at).pause();
    for (const k of f.punches) k.anim.progress(f.at >= k.at ? 1 : 0).pause();
  }
  finals.length = 0;
}

/** Plain scroll-linked (unpinned) scrub between two points. */
export function scrubTimeline({ trigger, start = 'top bottom', end = 'bottom top', scrub: s = 0.6, finalAt = 1, invalidate = true, ...rest }) {
  const tl = gsap.timeline({
    paused: env.reduced,
    defaults: { ease: 'none' },
    scrollTrigger: env.reduced ? undefined : { trigger, start, end, scrub: scrub(s), invalidateOnRefresh: invalidate, markers: env.debug, ...rest },
  });
  tl.to({}, { duration: 1 }, 0);
  if (env.reduced) finals.push({ tl, at: finalAt, punches: [] });
  return tl;
}

export { ScrollTrigger };
