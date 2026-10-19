// Shared motion helpers: text splits, headline entries, GPS-fix scrambles, counters, auto-fit.
import { gsap, ScrollTrigger, SplitText } from './gsap.js';
import { env } from './env.js';
import { ease, dur, text as TXT } from '../styles/tokens.js';

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rand = (s) => s[(Math.random() * s.length) | 0];

/**
 * GPS-fix scramble: digits (and letters) flicker, then lock left to right.
 * Non-alphanumerics (. , · / spaces) never scramble. Deterministic end state.
 * @returns {gsap.core.Tween|null}
 */
export function scramble(el, finalText, { duration = dur.scramble, letters = true, delay = 0 } = {}) {
  if (!el) return null;
  el.__scr?.kill();
  if (env.reduced || duration <= 0) {
    el.textContent = finalText;
    return null;
  }
  const chars = [...finalText];
  const len = chars.length || 1;
  const state = { t: 0 };
  const tw = gsap.to(state, {
    t: 1,
    duration,
    delay,
    ease: 'none',
    onUpdate() {
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        const lockAt = 0.45 + 0.55 * (i / len);
        if (state.t >= lockAt) out += c;
        else if (DIGITS.includes(c)) out += rand(DIGITS);
        else if (letters && LETTERS.includes(c)) out += rand(LETTERS);
        else out += c;
      }
      el.textContent = out;
    },
    onComplete() {
      el.textContent = finalText;
    },
  });
  el.__scr = tw;
  return tw;
}

/**
 * SplitText with house defaults. Create inside a gsap.matchMedia/context callback so it reverts.
 * @param {Element|string} el
 * @param {object} [o]  { type: 'chars'|'words'|'lines'|'lines,chars'..., mask: 'lines'|'chars'|'words'|false }
 */
export function split(el, o = {}) {
  return SplitText.create(el, {
    type: o.type || 'lines,words,chars',
    mask: o.mask === undefined ? 'lines' : o.mask,
    linesClass: 'splitline',
    wordsClass: 'splitword',
    charsClass: 'splitchar',
    aria: 'auto',
    ...o.vars,
  });
}

/**
 * Standard headline entry: masked chars rise (yPercent 110 -> 0) and widen (--wdth 62 -> 85).
 * Returns a paused timeline you can add to a scrubbed timeline or play().
 * The element should be .h-scene (or any .kinetic text).
 */
export function headline(el, o = {}) {
  const tl = gsap.timeline({ paused: o.paused !== false });
  if (!el || env.reduced) return tl;
  const s = o.split || split(el, { type: 'lines,words,chars', mask: 'lines' });
  const rest = o.wdthTo ?? TXT.wdthRest;
  tl.fromTo(
    s.chars,
    { yPercent: o.yFrom ?? TXT.yFrom, '--wdth': o.wdthFrom ?? TXT.wdthFrom },
    {
      yPercent: 0,
      '--wdth': rest,
      duration: o.duration ?? dur.text,
      ease: o.ease || ease.text,
      stagger: o.stagger ?? TXT.charStagger,
    },
  );
  tl.split = s;
  return tl;
}

/**
 * Scroll-triggered entry for a headline (+ optional sub lines): plays on enter, reverses when you scroll back above.
 * No-op under reduced motion.
 */
export function reveal(el, { trigger, start = 'top 70%', sub, ...o } = {}) {
  if (!el || env.reduced) return null;
  const tl = headline(el, o);
  if (sub) {
    const subs = gsap.utils.toArray(sub);
    tl.fromTo(subs, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.06 }, 0.35);
  }
  ScrollTrigger.create({
    trigger: trigger || el,
    start,
    onEnter: () => (env.shots ? tl.progress(1) : tl.play()),
    onLeaveBack: () => (env.shots ? tl.progress(0) : tl.reverse()),
  });
  return tl;
}

/** "13.0827 N 80.2707 E": a folio's coordinate, the way every scene writes it. */
export const fmtFolio = (lat, lng) =>
  `${Math.abs(lat).toFixed(4)} ${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(4)} ${lng < 0 ? 'W' : 'E'}`;

/**
 * Folio: "02 / 09 · 13.0827 N 80.2707 E". Hidden until its stage takes the thread (stage top at the
 * 60% line), then it fades in and the [data-scramble] part settles like a GPS fix. On the way out it
 * fades as it reaches the top bar, so it never sits against the HUD row.
 * The coordinate a folio settles on is the one its scene opens on: pass text (a string, or a function read
 * on every entry, e.g. the HUD's live fix) when that is not the static (final-frame) text in the markup.
 * @param {object} [o]  { trigger (default: the folio's stage), start, scramble: false to skip the scramble, text }
 */
export function folio(el, { trigger, start = 'top 60%', scramble: scr = true, text } = {}) {
  if (!el || env.reduced) return null;
  const stage = trigger || el.closest('.stage') || el;
  const section = stage.closest('.scene') || stage;
  const target = el.querySelector('[data-scramble]') || el;
  const finalText = target.textContent;
  const textNow = () => (typeof text === 'function' ? text() : text) || finalText;
  if (text !== undefined) target.textContent = textNow();
  const run = () => scr && scramble(target, textNow(), { duration: env.shots ? 0 : dur.scramble });
  const state = { entered: false, under: false };
  const apply = () =>
    gsap.to(el, { autoAlpha: state.entered && !state.under ? 1 : 0, duration: env.shots ? 0 : 0.3, ease: 'none', overwrite: 'auto' });
  gsap.set(el, { autoAlpha: 0 });
  ScrollTrigger.create({
    trigger: stage,
    start,
    onEnter: () => {
      state.entered = true;
      apply();
      run();
    },
    onLeaveBack: () => {
      state.entered = false;
      apply();
    },
    onRefresh: (self) => {
      state.entered = self.progress > 0 || self.scroll() >= self.start;
      gsap.set(el, { autoAlpha: state.entered && !state.under ? 1 : 0 });
    },
  });
  // After the stage releases (it sits at the end of its section), the folio reaches the top bar when the
  // section's bottom is (topbar + stage height - folio offset) from the viewport top.
  const topbar = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
  const offset = () => {
    let y = 0;
    for (let n = el; n && n !== stage; n = n.offsetParent) y += n.offsetTop;
    return y;
  };
  ScrollTrigger.create({
    trigger: section,
    start: () => `bottom ${Math.round(topbar() + 4 + stage.offsetHeight - offset())}px`,
    refreshPriority: -1, // measure after the section's own pin has added its spacer
    onEnter: () => {
      state.under = true;
      apply();
    },
    onLeaveBack: () => {
      state.under = false;
      apply();
    },
  });
  return el;
}

/** Tween a number through real values into an element. Returns the tween. */
export function count(el, to, { from, decimals = 0, duration = 0.8, ease: e = 'power2.out', pad = 0, suffix = '' } = {}) {
  const o = { v: from ?? (parseFloat(el.textContent) || 0) };
  const fmt = (v) => {
    let s = v.toFixed(decimals);
    if (pad) s = s.padStart(pad, '0');
    return s + suffix;
  };
  if (env.reduced) {
    el.textContent = fmt(to);
    return null;
  }
  return gsap.to(o, { v: to, duration, ease: e, onUpdate: () => (el.textContent = fmt(o.v)) });
}

/**
 * Fit text to a width: measures `measure` (an unsplit twin) at 100px and sets
 * `--fit-size` on `el` so the text spans `width()` px, capped at `max()` px.
 */
export function fit(el, { measure, width, max = () => Infinity, min = 24 }) {
  const m = measure || el;
  const prev = m.style.fontSize;
  m.style.fontSize = '100px';
  const w100 = m.getBoundingClientRect().width || 1;
  m.style.fontSize = prev;
  const size = Math.max(min, Math.min(max(), (100 * width()) / w100));
  el.style.setProperty('--fit-size', `${size.toFixed(2)}px`);
  return size;
}

/** A punch that plays forward and reverses back, or finishes instantly in ?shots. */
export function punch(anim, forward) {
  if (!anim) return;
  if (env.shots) anim.progress(forward ? 1 : 0).pause();
  else if (forward) anim.play();
  else anim.reverse();
}
