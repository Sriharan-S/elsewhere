// Scene 06: share-links. "Share a place. Land there."
//
// Desktop: a pinned 120vh conveyor. The thread comes in along the top, drops down the left edge and runs
// horizontally as the belt that carries map links into the pin tip, where it turns down and leaves. As each char crosses the dock line it evaporates; coordinate digits turn orange and arc into the pin
// head, the pin squashes, and the counter rolls to the new place. The short link folds into a dot, a ring
// spins once (the link being followed), then it lands. The rogue link bounces off and unfolds the one error card.
// Everything on the belt is a pure function of the pinned timeline's progress, so it scrubs both ways.
// Mobile: an unpinned list; each row fires on enter, digits fly up into the sticky pin; the card lands last.
import './share-links.css';

const PIN_VB = { x: 160, y: 86, w: 192, h: 262 };
const TIP_F = (330 - PIN_VB.y) / PIN_VB.h; // pin tip, fraction of the pin svg height
const CEN_F = (182 - PIN_VB.y) / PIN_VB.h; // pin head centre (where the fix sits)
const RING_C = 2 * Math.PI * 15;

// timeline beats (desktop)
const U_RUN = 0.05; // thread reaches the pin tip
const U_LIFT = 0.075; // the dot has risen into the pin head (the fix)
const U_FIRST = 0.13; // first chip's right edge reaches the dock line
const U_HIT = 0.84; // rogue chip hits the pin
const U_DROP = 0.95; // the fix drops back to the tip (after the error card has had its moment)
const U_EXIT = 0.97; // ...and rides the thread out

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const fmtLat = (v) => `${Math.abs(v).toFixed(4)} ${v < 0 ? 'S' : 'N'}`;
const fmtLng = (v) => `${Math.abs(v).toFixed(4)} ${v < 0 ? 'W' : 'E'}`;
const qbez = (a, c, b, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

/** offsetLeft/Top of el inside ancestor (ignores transforms). */
function offsetIn(el, anc) {
  let x = 0;
  let y = 0;
  let n = el;
  while (n && n !== anc) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return { x, y };
}

export function init(ctx) {
  const { root, gsap, ScrollTrigger, env, thread, traveler, hud, fx, tokens } = ctx;
  const stage = root.querySelector('.stage');
  const q = (s) => root.querySelector(s);
  const folio = q('.folio');
  const h2 = q('.h-scene');
  const sub = q('.sub');
  const body = q('.links__body');
  const list = q('.links__list');
  const belt = q('.links__belt');
  const beltPath = q('.links__belt-path');
  const pad = q('.links__pad');
  const pinWrap = q('.links__pin-wrap');
  const pinSvg = q('.links__pin');
  const pinPath = q('.links__pin-path');
  const pinFix = q('.links__pin-fix');
  const count = q('.links__count');
  const latEl = q('[data-links-lat]');
  const lngEl = q('[data-links-lng]');
  const srcEl = q('[data-links-src]');
  const resolve = q('.links__resolve');
  const ring = q('.links__resolve-ring');
  const rdot = q('.links__resolve-dot');
  const card = q('.links__error');
  const msg = q('[data-links-msg]');
  const MSG = msg.textContent;

  const items = [...root.querySelectorAll('.link')].map((li) => ({
    li,
    chip: li.querySelector('.link__chip'),
    pill: li.querySelector('.link__pill'),
    text: li.querySelector('.link__text'),
    out: li.querySelector('.link__out'),
    short: li.hasAttribute('data-short'),
    bad: li.hasAttribute('data-bad'),
    lat: parseFloat(li.dataset.lat),
    lng: parseFloat(li.dataset.lng),
    src: li.dataset.src || '',
  }));
  const good = items.filter((it) => !it.bad);
  const rogue = items.find((it) => it.bad);

  // the folio opens on whatever is mocked as the scene arrives (the pad's NOW) and follows each landing
  const folioScr = folio.querySelector('[data-scramble]');
  const hudNow = () => {
    const h = hud.state;
    const lat = parseFloat(h.lat);
    const lng = parseFloat(h.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { ...tokens.places[0] };
  };
  fx.folio(folio, env.reduced ? {} : { text: () => fx.fmtFolio(hudNow().lat, hudNow().lng) });
  fx.reveal(h2, { sub });

  // The thread. Desktop: down, along the belt to the pin tip, then straight down out of the pin.
  // Mobile / static: a spine down the left gutter beside the list. It never crosses the copy: above the
  // folio it jogs to the right gutter, runs down beside the headline, and crosses back under the sub.
  const spine = (W, H) => {
    const sr = stage.getBoundingClientRect();
    const lx = list.getBoundingClientRect().left - sr.left;
    const x = Math.max(6, lx - 14);
    const copyEl = stage.querySelector(':scope > .copy');
    const fTop = folio.getBoundingClientRect().top - sr.top;
    const subBottom = sub.getBoundingClientRect().bottom - sr.top;
    const padTop = pad.getBoundingClientRect().top - sr.top;
    const yJ = Math.max(8, fTop * 0.5);
    // cross back just under the sub, above the ink plate the sticky pad carries above itself (mobile)
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 64;
    const plate = window.innerWidth < 768 ? topbar + 8 : 0;
    const yC = Math.max(subBottom + 10, Math.min(padTop - plate - 12, subBottom + 36));
    const xR = W - Math.max(10, (copyEl ? parseFloat(getComputedStyle(copyEl).paddingRight) : 16) * 0.5);
    return [
      [0.38 * W, 0],
      [0.38 * W, yJ],
      [xR, yJ],
      [xR, yC],
      [x, yC],
      [x, 0.94 * H],
      [0.62 * W, 0.975 * H],
      [0.62 * W, H],
    ].map(([px, py]) => [px / W, py / H]);
  };
  // the copy sits top-left like every scene (so the headline arrives with the stage) and the belt runs
  // across the lower third. The thread comes in along the top (between the top bar and the folio) and down
  // the left gutter, so the belt is the thread itself from the left edge on (nothing drops through the
  // chip lane), and it turns down sharp at the pin tip.
  const CY = 0.66;
  const css = (v) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v)) || 0;
  const conveyor = (W, H) => {
    const top = Math.max(8, (css('--topbar-h') || 64) + 14) / H;
    const edge = Math.max(12, css('--margin') * 0.4) / W;
    return [
      [0.38, 0],
      [0.38, top],
      [edge, top],
      [edge, CY],
      [0.6195, CY], // a hair short of the tip: the corner at the tip itself has no radius
      [0.62, CY],
      [0.62, 1],
    ];
  };

  if (env.reduced) {
    thread.segment(root, { points: spine }).track();
    return;
  }

  // ---------------------------------------------------------------- the counter (shared by both layouts)
  // NOW: the place mocked as the scene arrives (the previous scene's last fix), read on entry
  const start = { ...tokens.places[0] };
  const shown = { lat: start.lat, lng: start.lng };
  let landedIdx = -2;
  let hudSaved = null;
  const paint = () => {
    latEl.textContent = fmtLat(shown.lat);
    lngEl.textContent = fmtLng(shown.lng);
  };
  function setLanded(i, { squash } = {}) {
    if (i === landedIdx) return;
    const up = i > landedIdx;
    landedIdx = i;
    const it = good[i];
    const lat = it ? it.lat : start.lat;
    const lng = it ? it.lng : start.lng;
    gsap.to(shown, { lat, lng, duration: env.shots ? 0 : 0.7, ease: 'power2.out', overwrite: true, onUpdate: paint, onComplete: paint });
    fx.scramble(srcEl, it ? it.src.toUpperCase() : 'NOW', { duration: env.shots ? 0 : 0.35 });
    if (folioScr) fx.scramble(folioScr, fx.fmtFolio(lat, lng), { duration: env.shots ? 0 : 0.4 });
    if (it) {
      if (!hudSaved) hudSaved = hud.state;
      hud.set({ lat, lng }, { scramble: true });
    } else if (hudSaved) {
      hud.set(hudSaved, { scramble: true });
      hudSaved = null;
    }
    if (up && it && squash !== false && !env.shots) {
      gsap.fromTo(pinSvg, { scaleY: 0.8, scaleX: 1.14 }, { scaleY: 1, scaleX: 1, duration: 0.8, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
      traveler.pulse();
    }
  }

  ScrollTrigger.create({
    trigger: stage,
    start: 'top 60%',
    onEnter: () => {
      if (landedIdx >= 0) return;
      Object.assign(start, hudNow());
      gsap.killTweensOf(shown);
      Object.assign(shown, start);
      paint();
    },
  });

  ctx.media({
    // ============================================================== desktop: the pinned conveyor
    desktop: () => {
      const splits = items.map((it) => fx.split(it.text, { type: 'chars', mask: false }));
      const L = { W: 1, H: 1, cy: 0, pinX: 0, ph: 96, pw: 70, D: 0, X0: 0, v: 1, hitX: 0, center: [0, 0], runTip: 0.5 };
      const meta = items.map((it, i) => ({
        chars: splits[i].chars.map((c) => ({
          el: c,
          coord: !!c.closest('.c'),
          jit: gsap.utils.random(-14, 14),
          rot: gsap.utils.random(-40, 40),
          ox: 0,
          oy: 0,
          st: -1,
        })),
        left: 0,
        w: 0,
        h: 0,
        top: 0,
        done: false,
      }));

      // one generous corner from the drop into the run, so the thread itself becomes the conveyor
      const seg = thread.segment(root, { points: conveyor, radius: 36 });
      // the incoming queue's track fades out before the drop column (no T-junction with the thread)
      const NS = 'http://www.w3.org/2000/svg';
      const grad = document.createElementNS(NS, 'linearGradient');
      grad.setAttribute('id', 'links-belt-fade');
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.innerHTML = '<stop offset="0" stop-color="#EEEAE2" stop-opacity="1"/><stop offset="1" stop-color="#EEEAE2" stop-opacity="0"/>';
      const defs = document.createElementNS(NS, 'defs');
      defs.appendChild(grad);
      belt.prepend(defs);
      beltPath.style.stroke = 'url(#links-belt-fade)';
      // the lead-in rides the 60% line down the left gutter until the stage pins; then the run takes the
      // head round the corner and along the belt to the pin tip
      seg.track({ until: 'pin' });

      function layout() {
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        const cy = CY * H;
        const pinX = 0.62 * W;
        const ph = Math.max(84, Math.min(124, H * 0.13));
        const pw = (ph * PIN_VB.w) / PIN_VB.h;
        pinSvg.style.height = `${ph}px`;
        pinSvg.style.width = `${pw}px`;
        gsap.set(pinWrap, { x: pinX - pw / 2, y: cy - TIP_F * ph });
        gsap.set(count, { x: pinX + pw / 2 + 14, y: cy - ph * 0.86 });
        const D = pinX - 78;
        const hitX = pinX - pw * 0.36;
        Object.assign(L, { W, H, cy, pinX, ph, pw, D, hitX, center: [pinX, cy - (TIP_F - CEN_F) * ph] });
        // belt: the incoming queue, left of where the thread drops in
        belt.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const w = ctx.isPhone() ? 1.5 : 2;
        const beltEnd = Math.max(12, css('--margin') * 0.4) - 10;
        beltPath.setAttribute('d', `M-20 ${cy.toFixed(1)}H${beltEnd.toFixed(1)}`);
        grad.setAttribute('x1', (beltEnd - 0.03 * W).toFixed(1));
        grad.setAttribute('x2', beltEnd.toFixed(1));
        grad.setAttribute('y1', cy.toFixed(1));
        grad.setAttribute('y2', cy.toFixed(1));
        beltPath.style.strokeWidth = w;
        beltPath.setAttribute('stroke-dasharray', `${2.7 * w} ${2.2 * w}`);
        // the error card unfolds to the right of the pin, clear of the thread that leaves straight down
        const margin = Math.max(16, W * 0.04);
        L.cardX = pinX + 32;
        L.cardW = Math.max(200, Math.min(340, W - margin - L.cardX));
        gsap.set(card, { x: L.cardX, y: cy + 40, width: L.cardW });
        // chips: chained right to left, first chip rightmost
        const gap = 150;
        let edge = 0;
        meta.forEach((m, i) => {
          const it = items[i];
          m.w = it.chip.offsetWidth;
          m.h = it.chip.offsetHeight;
          m.left = edge - m.w;
          edge = m.left - gap;
          m.top = cy - m.h / 2;
          for (const c of m.chars) {
            const o = offsetIn(c.el, it.chip);
            c.ox = o.x + c.el.offsetWidth / 2;
            c.oy = o.y + c.el.offsetHeight / 2;
          }
        });
        const r = meta[meta.length - 1];
        // chip 0's right edge docks at U_FIRST; the rogue's right edge hits the pin at U_HIT
        L.v = (hitX - D - (r.left + r.w)) / (U_HIT - U_FIRST);
        L.X0 = D - U_FIRST * L.v;
        // where on the thread the pin tip sits (end of the belt run)
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          if (seg.pointAt(mid).x < pinX - 1) lo = mid;
          else hi = mid;
        }
        L.runTip = clamp01((hi - seg.leadEnd) / (1 - seg.leadEnd || 1));
      }
      layout();
      ScrollTrigger.addEventListener('refreshInit', layout);

      const pt = ctx.pinTimeline({ stage, vh: 120, scrub: 0.6 });
      const { tl, punch } = pt;
      tl.addLabel('belt', 0).addLabel('first', U_FIRST).addLabel('hit', U_HIT).addLabel('out', U_EXIT);
      const S = { u: 0 };
      tl.fromTo(seg, { run: 0 }, { run: () => L.runTip, duration: U_RUN, ease: 'power1.inOut' }, 0);
      tl.fromTo(seg, { run: () => L.runTip }, { run: 1, duration: 1 - U_EXIT, ease: 'power1.in', immediateRender: false }, U_EXIT);
      tl.fromTo(pinPath, { drawSVG: '0% 0%' }, { drawSVG: '0% 100%', duration: 0.05, ease: 'power2.inOut' }, 0.01);
      tl.fromTo(belt, { opacity: 0 }, { opacity: 1, duration: 0.04 }, 0);
      tl.fromTo(count, { opacity: 0 }, { opacity: 1, duration: 0.04 }, 0.04);
      tl.fromTo(S, { u: 0 }, { u: 1, duration: 1, ease: 'none', onUpdate: render, immediateRender: false }, 0);
      gsap.set(pinFix, { opacity: 0 });
      gsap.set(resolve, { opacity: 0 });
      gsap.set(card, { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0 });

      // the rogue: hits, bounces back on a damped wobble, unfolds the card
      const bounce = gsap
        .timeline({ paused: true })
        .fromTo(rogue.chip, { x: 0 }, { x: -170, duration: 1.4, ease: 'elastic.out(1, 0.3)', immediateRender: false }, 0)
        .to(pinSvg, { keyframes: { rotation: [0, 7, -5, 3, -1.5, 0] }, duration: 0.6, ease: 'none' }, 0)
        .fromTo(card, { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0, y: () => L.cy + 28 }, { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1, y: () => L.cy + 40, duration: 0.55, ease: 'expo.out', immediateRender: false }, 0.28)
        .call(() => fx.scramble(msg, MSG, { duration: env.shots ? 0 : 0.5, letters: true }), null, 0.32);
      punch(U_HIT, bounce);

      function setChar(c, st, x, y, s, rot, o) {
        c.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${s.toFixed(3)})`;
        c.el.style.opacity = o.toFixed(3);
        const hot = st === 1;
        if (hot !== c.hot) {
          c.hot = hot;
          c.el.classList.toggle('is-hot', hot);
        }
      }

      function render() {
        const u = S.u;
        const tx = L.X0 + L.v * u;
        const { D, center } = L;
        let landed = -1;
        // conveyor flow: the dashes move with the chips
        const flow = (-(L.v * u) % 9.8).toFixed(2);
        beltPath.style.strokeDashoffset = flow;
        seg.path.style.strokeDashoffset = flow;

        let gi = -1;
        meta.forEach((m, i) => {
          const it = items[i];
          if (!it.bad) gi++;
          let x = tx + m.left;
          if (it.bad) x = Math.min(x, L.hitX - m.w);
          it.li.style.transform = `translate(${x.toFixed(1)}px, ${m.top.toFixed(1)}px)`;
          if (it.bad) return;
          const past = x + m.w - D; // px of this chip past the dock line
          // whole chip still upstream (or long gone): set once, skip per-char work
          const phase = past < -40 ? 0 : past > m.w + 360 ? 2 : 1;
          if (phase !== 1 && m.phase === phase) {
            if (phase === 2) landed = gi;
            return;
          }
          m.phase = phase;
          const clip = clamp01(past / m.w) * m.w;
          it.pill.style.clipPath = clip > 0 ? `inset(0 ${clip.toFixed(1)}px 0 0 round 999px)` : '';
          it.pill.style.visibility = clip >= m.w - 0.5 ? 'hidden' : '';
          let minF = 1;
          for (const c of m.chars) {
            const cx = x + c.ox;
            const cyc = m.top + c.oy;
            if (it.short) {
              const e = gsap.parseEase('power2.in')(clamp01((cx - (D - 30 + c.jit * 0.4)) / 44));
              setChar(c, 0, (D - cx) * e, (L.cy - cyc) * e, 1 - e, 0, 1 - e);
            } else if (c.coord) {
              const f = clamp01((cx - (D + c.jit * 0.3)) / 160);
              minF = Math.min(minF, f);
              const k = gsap.parseEase('power1.inOut')(f);
              const sx = D;
              const bx = qbez(sx, lerp(sx, center[0], 0.3), center[0], k);
              const by = qbez(cyc, center[1] - L.ph * 0.55, center[1], k);
              const hot = cx >= D - 6;
              const dx = f > 0 ? bx - cx : 0;
              const dy = f > 0 ? by - cyc : 0;
              setChar(c, hot ? 1 : 0, dx, dy, 1 - 0.5 * f, 0, f > 0.86 ? (1 - f) / 0.14 : 1);
            } else {
              const e = clamp01((cx - (D + c.jit)) / 36);
              const eo = 1 - (1 - e) * (1 - e);
              setChar(c, 0, 8 * eo, -28 * eo, 1, c.rot * e, 1 - e);
            }
          }
          if (it.short) {
            // fold -> spin (following the short link) -> fly
            const fold = clamp01(past / m.w);
            const spin = clamp01((past - m.w) / 170);
            const fly = clamp01((past - m.w - 170) / 150);
            const k = gsap.parseEase('power1.inOut')(fly);
            const px = qbez(D, lerp(D, center[0], 0.3), center[0], k);
            const py = qbez(L.cy, center[1] - L.ph * 0.55, center[1], k);
            resolve.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) scale(${(fold * (1 - 0.5 * fly)).toFixed(3)})`;
            resolve.style.opacity = past <= 0 || fly >= 1 ? '0' : '1';
            ring.style.strokeDasharray = `${(spin * RING_C).toFixed(1)} ${RING_C.toFixed(1)}`;
            ring.style.opacity = spin > 0 && fly < 0.4 ? '1' : '0';
            ring.setAttribute('transform', `rotate(${(spin * 360 - 90).toFixed(1)})`);
            rdot.classList.toggle('is-hot', spin >= 1);
            rdot.style.fill = spin >= 1 ? 'var(--accent)' : '';
            minF = fly;
          }
          if (minF >= 1) landed = gi;
        });
        setLanded(landed);
      }

      // the traveler: the pin's fix while links land
      const toScreen = (x, y) => {
        const r = stage.getBoundingClientRect();
        return { x: r.left + x, y: r.top + y };
      };
      const release = traveler.follow(() => {
        const r = stage.getBoundingClientRect();
        const u = S.u;
        if (r.top > 1 || r.bottom < 0.6 * window.innerHeight || u < U_RUN || u >= U_EXIT) return null;
        const tip = [L.pinX, L.cy];
        const c = L.center;
        let k = 1;
        if (u < U_LIFT) k = (u - U_RUN) / (U_LIFT - U_RUN);
        else if (u > U_DROP) k = 1 - (u - U_DROP) / (U_EXIT - U_DROP);
        k = gsap.parseEase('power2.inOut')(clamp01(k));
        return toScreen(lerp(tip[0], c[0], k), lerp(tip[1], c[1], k));
      });

      render();
      return () => {
        release();
        ScrollTrigger.removeEventListener('refreshInit', layout);
        seg.destroy();
        defs.remove();
        beltPath.style.stroke = '';
        items.forEach((it) => {
          it.li.style.transform = '';
          it.pill.style.clipPath = '';
          it.pill.style.visibility = '';
        });
        gsap.set([pinWrap, count, card, resolve, pinSvg, pinFix, rogue.chip], { clearProps: 'all' });
        pinSvg.style.height = '';
        pinSvg.style.width = '';
        msg.textContent = MSG;
        landedIdx = -2;
      };
    },

    // ============================================================== mobile: the list, pin sticky on top
    mobile: () => {
      const seg = thread.segment(root, { points: spine, radius: 24 });
      seg.track({ until: 'exit' });
      const flags = good.map(() => false);
      const refreshLanded = () => {
        let i = -1;
        flags.forEach((f, j) => f && (i = j));
        setLanded(i);
      };
      const pinCenter = () => {
        const r = pinSvg.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + CEN_F * r.height };
      };
      gsap.set(pinFix, { opacity: 0 });

      const tls = items.map((it) => {
        const s = fx.split(it.text, { type: 'chars', mask: false });
        const coord = s.chars.filter((c) => c.closest('.c'));
        const plain = s.chars.filter((c) => !c.closest('.c'));
        const t = gsap.timeline({ paused: true });
        if (it.bad) {
          t.to(it.chip, { keyframes: { x: [0, 26, -14, 8, -3, 0] }, duration: 0.8, ease: 'none' }, 0)
            .fromTo(it.out, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }, 0.4);
          return t;
        }
        if (it.short) {
          t.to(plain, { scale: 0, x: (i, el) => -el.offsetLeft * 0.6, opacity: 0, duration: 0.45, ease: 'power2.in', stagger: { each: 0.015, from: 'end' } }, 0);
        } else {
          t.to(plain, { y: -22, x: 6, opacity: 0, rotation: () => gsap.utils.random(-35, 35), duration: 0.45, ease: 'power2.out', stagger: { each: 0.012, from: 'random' } }, 0);
          // digits light up as the rest evaporates (and go back to bone when reversed)
          t.to({}, { duration: 0.01, onStart: () => coord.forEach((c) => c.classList.add('is-hot')), onReverseComplete: () => coord.forEach((c) => c.classList.remove('is-hot')) }, 0.06);
          const f = { v: 0 };
          t.fromTo(
            f,
            { v: 0 },
            {
              v: 1,
              duration: 0.75,
              ease: 'power1.inOut',
              onUpdate() {
                const P = pinCenter();
                for (const c of coord) {
                  const cx0 = gsap.getProperty(c, 'x');
                  const cy0 = gsap.getProperty(c, 'y');
                  const r = c.getBoundingClientRect();
                  const nx = r.left + r.width / 2 - cx0;
                  const ny = r.top + r.height / 2 - cy0;
                  const k = f.v;
                  const bx = qbez(nx, lerp(nx, P.x, 0.5), P.x, k);
                  const by = qbez(ny, ny - 40, P.y, k);
                  gsap.set(c, { x: bx - nx, y: by - ny, scale: 1 - 0.5 * k, opacity: k > 0.85 ? (1 - k) / 0.15 : 1 });
                }
              },
            },
            0.2,
          );
        }
        t.to(it.pill, { opacity: 0, duration: 0.35 }, 0.1).fromTo(it.out, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }, 0.7);
        // the source stays, dimmed, above what it parsed to: every row keeps its rhythm and its origin
        t.set(s.chars, { x: 0, y: 0, rotation: 0, scale: 1 }, 1.0)
          .to({}, { duration: 0.01, onStart: () => coord.forEach((c) => c.classList.remove('is-hot')), onReverseComplete: () => coord.forEach((c) => c.classList.add('is-hot')) }, 1.0)
          .fromTo(s.chars, { opacity: 0 }, { opacity: 0.32, duration: 0.3, ease: 'none', immediateRender: false }, 1.0);
        return t;
      });
      items.forEach((it, i) => {
        gsap.set(it.out, { opacity: 0 });
        const gi = good.indexOf(it);
        const t = tls[i];
        if (gi >= 0) {
          t.eventCallback('onComplete', () => {
            flags[gi] = true;
            refreshLanded();
          });
          t.eventCallback('onReverseComplete', () => {
            flags[gi] = false;
            refreshLanded();
          });
        }
        ScrollTrigger.create({
          trigger: it.li,
          start: 'top 62%',
          onEnter: () => (env.shots ? (t.progress(1), t.eventCallback('onComplete')?.()) : t.play()),
          onLeaveBack: () => (env.shots ? (t.progress(0), t.eventCallback('onReverseComplete')?.()) : t.reverse()),
        });
      });
      // the card lands last
      const cardIn = gsap.fromTo(card, { clipPath: 'inset(0% 0% 100% 0%)', y: -8 }, { clipPath: 'inset(0% 0% 0% 0%)', y: 0, duration: 0.6, ease: 'expo.out', paused: true });
      ScrollTrigger.create({
        trigger: card,
        start: 'top 80%',
        onEnter: () => {
          fx.punch(cardIn, true);
          fx.scramble(msg, MSG, { duration: env.shots ? 0 : 0.5 });
        },
        onLeaveBack: () => fx.punch(cardIn, false),
      });

      // the traveler leaves the spine to sit in the sticky pin while links land, then returns
      const release = traveler.follow(() => {
        const sr = stage.getBoundingClientRect();
        const line = 0.6 * window.innerHeight;
        if (sr.top > line || sr.bottom < line) return null;
        const lr = list.getBoundingClientRect();
        const wIn = clamp01((line - (lr.top - 30)) / 140);
        const wOut = clamp01((lr.bottom + 30 - line) / 140);
        const w = gsap.parseEase('power2.inOut')(Math.min(wIn, wOut));
        if (w <= 0) return null;
        const h = seg.headScreen();
        const p = pinCenter();
        return { x: lerp(h.x, p.x, w), y: lerp(h.y, p.y, w) };
      });

      return () => {
        release();
        seg.destroy();
        gsap.set([pinFix, card], { clearProps: 'all' });
        landedIdx = -2;
      };
    },
  });
  setLanded(-1, { squash: false });
}
