// Runtime flags, read once at boot.
const q = new URLSearchParams(location.search);
const mm = (s) => window.matchMedia(s).matches;

export const env = {
  /** OS asks for reduced motion: no pins/scrubs, every scene shows its final frame. */
  reduced: mm('(prefers-reduced-motion: reduce)') || q.has('reduced'),
  /** ?shots: deterministic screenshots. Scrubs jump, no snap, no idle loops, punches finish instantly. */
  shots: q.has('shots'),
  /** ?debug: ScrollTrigger markers. */
  debug: q.has('debug'),
  /** Fine pointer (mouse/trackpad): snap is allowed on desktop only with this. */
  finePointer: mm('(pointer: fine)'),
  touch: mm('(hover: none)') || navigator.maxTouchPoints > 0,
};

const root = document.documentElement;
/**
 * Late boot: the head script's no-JS fallback already fired (it strips "js" when the module has not
 * booted in time), so the static frames are on screen. A reader still at the top has not started
 * reading them, so build the motion layer after all (a slow connection should not cost the whole
 * experience). One who has scrolled into the static page keeps it: pins appearing under them would
 * jump the page, so take the reduced path (final frames, no pins), with classes that agree.
 */
env.late = !root.classList.contains('js') && !root.classList.contains('no-js');
if (env.late) {
  if (window.scrollY > window.innerHeight * 0.25) env.reduced = true;
  root.classList.add('js');
}

env.motion = !env.reduced;

/** Current layout breakpoint (re-evaluate on refresh; it changes on resize). */
export const isMobile = () => window.innerWidth < 768;
export const isPhone = () => window.innerWidth < 600;

root.classList.toggle('motion', env.motion);
root.classList.toggle('reduced', env.reduced);
root.classList.toggle('shots', env.shots);
