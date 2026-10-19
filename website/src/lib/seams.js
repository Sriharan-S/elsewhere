// SEAMS: one continuous world across stage boundaries.
//
// Every stage's .world fades out over its bottom edge (CSS: --seam). Below that fade, the next stage's
// own map continues upward: a clone of its <use href="#world"> svg, laid out so it lines up exactly with
// the stage's top edge, sits behind everything (z -1) and fades in towards the seam. Scrolling from one
// scene to the next therefore crossfades two maps instead of cutting from one district to another, and
// the new stage's map is already there when its top edge arrives. Scroll-linked pans (e.g. the credits
// crawl) are mirrored into the clone while it is near the viewport.
import { ScrollTrigger } from './gsap.js';
import * as loop from './loop.js';

const bleeds = [];

/** The seam height in px (CSS --seam on the clone, so CSS stays the one source). */
const seamOf = (b) => (b ? b.el.getBoundingClientRect().height : 0) || Math.round(window.innerHeight * 0.18);

function layout(b) {
  const { stage, world, el } = b;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const vb = world.viewBox.baseVal;
  if (!W || !H || !vb || !vb.width) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  const par = world.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
  const s = par.includes('slice') ? Math.max(W / vb.width, H / vb.height) : Math.min(W / vb.width, H / vb.height);
  const x0 = vb.x + (vb.width - W / s) / 2;
  const y0 = vb.y + (vb.height - H / s) / 2;
  const B = seamOf(b);
  el.setAttribute('viewBox', `${x0.toFixed(2)} ${(y0 - B / s).toFixed(2)} ${(W / s).toFixed(2)} ${(B / s).toFixed(2)}`);
  mirror(b);
}

/** Copy the live pan transforms of the stage's world into its upward continuation. */
function mirror(b) {
  for (let i = 0; i < b.src.length; i++) {
    const a = b.src[i];
    const c = b.dst[i];
    if (!c) continue;
    const t = a.getAttribute('transform');
    if (t !== b.last[i * 2]) {
      b.last[i * 2] = t;
      if (t === null) c.removeAttribute('transform');
      else c.setAttribute('transform', t);
    }
    const st = a.style.transform;
    if (st !== b.last[i * 2 + 1]) {
      b.last[i * 2 + 1] = st;
      c.style.transform = st;
    }
  }
}

export function seams() {
  const sections = [...document.querySelectorAll('main > .scene')];
  sections.forEach((section, i) => {
    if (i === 0) return; // nothing above the first scene
    const stage = section.querySelector('.stage');
    if (!stage || !section.offsetHeight) return;
    const world = stage.querySelector(':scope > svg.world');
    if (!world || !world.querySelector('use[href="#world"]')) return;
    const el = world.cloneNode(true);
    el.removeAttribute('style');
    el.removeAttribute('id');
    el.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    el.setAttribute('class', [...world.classList].filter((c) => c !== 'world').concat('world-bleed').join(' '));
    el.setAttribute('preserveAspectRatio', 'none');
    el.setAttribute('aria-hidden', 'true');
    section.prepend(el);
    const b = { section, stage, world, el, src: [...world.querySelectorAll('g')], dst: [...el.querySelectorAll('g')], last: [], near: false };
    bleeds.push(b);
    layout(b);
    ScrollTrigger.create({
      trigger: section,
      start: () => `top bottom+=${seamOf(b)}`,
      end: 'top top',
      refreshPriority: -1,
      onToggle: (self) => (b.near = self.isActive),
      onRefresh: (self) => (b.near = self.isActive),
    });
  });
  if (!bleeds.length) return;
  ScrollTrigger.addEventListener('refresh', () => bleeds.forEach(layout));
  loop.add(() => {
    for (const b of bleeds) if (b.near) mirror(b);
  });
}
