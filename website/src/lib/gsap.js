// Single place where GSAP and its (free, since 3.13) plugins are registered. Only what the scenes use
// ships: ScrollTrigger, SplitText and DrawSVG (the JS budget is 115 KB gzip).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';

// One MediaQueryList per query string. gsap.matchMedia() makes a new MQL for every add(), each fires its
// own "change" on a breakpoint, and GSAP reverts and refreshes every ScrollTrigger once per event: a dozen
// full rebuilds (seconds of work) per resize across the breakpoint. Shared MQLs fire once per query (a
// listener added twice to the same MQL is one listener).
if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia.__shared) {
  const native = window.matchMedia.bind(window);
  const cache = new Map();
  const shared = (q) => {
    let m = cache.get(q);
    if (!m) cache.set(q, (m = native(q)));
    return m;
  };
  shared.__shared = true;
  window.matchMedia = shared;
}

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);
gsap.defaults({ ease: 'power2.out', duration: 0.6 });

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin };
