// Scene 09: credits. "No keys. No accounts."
// The thread becomes the spine of an end-credits roll that crawls a little faster than the page.
// "None" always reads in bone; as the orange dot passes each of those rows, the faint placeholder behind
// it gets struck out. LICENSE reads MIT throughout and re-flaps on the crossing.
import './credits.css';

const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rand = () => FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0];

export function init(ctx) {
  const { root, gsap, ScrollTrigger, thread, fx, env, hud } = ctx;
  const stage = root.querySelector('.stage');
  const list = root.querySelector('.cr__list');
  const pan = root.querySelector('.cr__pan');
  const tin = parseFloat(root.dataset.threadIn || '0.62');

  // The spine: in at data-thread-in, ease over to the centre below the headline, then straight down.
  const seg = thread.segment(root, {
    radius: 56,
    points: [
      [tin, 0],
      [tin, 0.2],
      [0.5, 0.29],
      [0.5, 1],
    ],
    // phones: above the folio, step over to the right gutter, run down beside the copy until it has
    // ended, then ease onto the spine (the headline is nearly full width here)
    pointsMobile: (W, H) => {
      const sr = stage.getBoundingClientRect();
      const head = root.querySelector('.cr__copy .h-scene');
      const fol = root.querySelector('.cr__copy .folio');
      const y1 = head ? (head.getBoundingClientRect().bottom - sr.top + 22) / H : 0.3;
      const y0 = fol ? (fol.getBoundingClientRect().top - sr.top) * 0.5 / H : 0.05;
      const xr = 1 - 10 / W;
      return [
        [tin, 0],
        [tin, y0],
        [xr, y0],
        [xr, y1],
        [0.5, y1 + 0.05],
        [0.5, 1],
      ];
    },
  });
  seg.track({ until: 'exit' });

  // the folio reads the last live fix (whatever the HUD shows as the scene arrives); 0.0000 is the footer's
  const live = () => {
    const s = hud.state;
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? fx.fmtFolio(lat, lng) : '';
  };
  fx.folio(root.querySelector('.folio'), ctx.reduced ? {} : { text: live });
  fx.reveal(root.querySelector('.h-scene'));

  if (ctx.reduced) return;

  // ------------------------------------------------------------ the crawl (a fixed ratio to scroll)
  ctx.media({
    desktop: () => crawl(0.14),
    mobile: () => crawl(0.1),
  });
  function crawl(k) {
    const tl = ctx.scrubTimeline({ trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.6 });
    tl.fromTo(list, { y: () => k * window.innerHeight }, { y: () => -k * window.innerHeight, duration: 1, ease: 'none' }, 0).fromTo(
      pan,
      { x: 0, y: 0 },
      { x: -90, y: -40, duration: 1, ease: 'none' },
      0,
    );
  }

  // ------------------------------------------------------------ moments as rows cross the dot's line
  const moments = [];

  root.querySelectorAll('.cr__row--none').forEach((row) => {
    const ghost = row.querySelector('.cr__ghost');
    const line = row.querySelector('.cr__strike line');
    const none = row.querySelector('.cr__none');
    // "None" is always there; behind it the placeholder sits at 30% until the line crosses it out
    gsap.set(ghost, { opacity: 0.3 });
    gsap.set(line, { drawSVG: '0%' });
    const anim = gsap
      .timeline({ paused: true })
      .to(line, { drawSVG: '100%', duration: 0.45, ease: 'power2.inOut' }, 0)
      .to(ghost, { opacity: 0.1, duration: 0.35, ease: 'power1.out' }, 0.3)
      .fromTo(none, { scale: 1 }, { keyframes: { scale: [1, 1.06, 1] }, duration: 0.5, ease: 'power2.out', immediateRender: false }, 0.3);
    moments.push({ row, on: false, run: (fwd) => fx.punch(anim, fwd) });
  });

  const flapRow = root.querySelector('.cr__row--flap');
  if (flapRow) {
    const cells = [...flapRow.querySelectorAll('.cr__cell')];
    const finals = cells.map((c) => c.textContent);
    // rest state: MIT, always (it re-flaps MIT -> MIT on the crossing, never from blanks)
    const blank = () => cells.forEach((c, i) => (c.textContent = finals[i]));
    let flap = null;
    const play = () => {
      flap?.kill();
      flap = gsap.timeline();
      cells.forEach((c, i) => {
        const t0 = i * 0.03;
        for (let k = 0; k < 4; k++) {
          const t = t0 + k * 0.1;
          const ch = k === 3 ? finals[i] : rand();
          flap
            .to(c, { rotateX: -90, duration: 0.05, ease: 'power1.in' }, t)
            .call(() => (c.textContent = ch), null, t + 0.05)
            .fromTo(c, { rotateX: 90 }, { rotateX: 0, duration: 0.05, ease: 'power1.out', immediateRender: false }, t + 0.05);
        }
      });
      if (env.shots) flap.progress(1);
    };
    moments.push({
      row: flapRow,
      on: false,
      run: (fwd) => {
        if (fwd) play();
        else {
          flap?.kill();
          gsap.set(cells, { rotateX: 0 });
          blank();
        }
      },
    });
  }

  // focus: rows read brightest as they pass the dot, like a lit line in a teleprompter
  const rows = [...root.querySelectorAll('.cr__row dd')];
  const lastO = rows.map(() => -1);

  let active = false;
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => (active = self.isActive),
  });
  function check() {
    if (!active) return;
    const vh = window.innerHeight;
    const line = 0.6 * vh;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - line) / (0.5 * vh);
      // floor 0.5: bone at half strength is still over 4.5:1 on ink; the mono labels are never dimmed
      const o = Math.round((1 - 0.5 * Math.min(1, d * d)) * 100) / 100;
      if (o !== lastO[i]) row.style.opacity = lastO[i] = o;
    });
    for (const m of moments) {
      const r = m.row.getBoundingClientRect();
      const on = r.top + r.height / 2 <= line;
      if (on !== m.on) {
        m.on = on;
        m.run(on);
      }
    }
  }
  ctx.loop.add(check);
}
