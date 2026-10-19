// The corner HUD in the top bar: "LAT 13.0827 · LNG 80.2707 · ACC 3 M · MOCK ON".
// Scenes may relocate it: ctx.hud.set({ lat, lng, extra, mock }, { scramble: true }).
import { scramble } from './fx.js';
import { env } from './env.js';

const fmt = (v) => (typeof v === 'number' ? v.toFixed(4) : String(v));

let root;
let f = {};
const state = { lat: 13.0827, lng: 80.2707, extra: 'ACC 3 M', mock: true };

export const hud = {
  get el() {
    return root;
  },
  get state() {
    return { ...state };
  },

  mount() {
    root = document.querySelector('[data-hud]');
    if (!root) return hud;
    f = {
      lat: root.querySelector('[data-hud-lat]'),
      lng: root.querySelector('[data-hud-lng]'),
      extra: root.querySelector('[data-hud-extra]'),
      status: root.querySelector('[data-hud-status]'),
    };
    return hud;
  },

  /**
   * Update any of the fields. Numbers are shown with 4 decimals.
   * @param {{lat?:number|string, lng?:number|string, extra?:string, mock?:boolean}} next
   * @param {{scramble?:boolean, duration?:number}} [o]
   */
  set(next, { scramble: scr = true, duration = 0.4 } = {}) {
    if (!root) return;
    Object.assign(state, next);
    const d = scr && !env.reduced ? (env.shots ? 0 : duration) : 0;
    if ('lat' in next && f.lat) scramble(f.lat, fmt(state.lat), { duration: d });
    if ('lng' in next && f.lng) scramble(f.lng, fmt(state.lng), { duration: d });
    if ('extra' in next && f.extra) scramble(f.extra, String(state.extra), { duration: d });
    if ('mock' in next && f.status) {
      f.status.textContent = state.mock ? 'MOCK ON' : 'MOCK OFF';
      f.status.classList.toggle('is-on', !!state.mock);
    }
  },

  /** The pre-fix state: "LAT —— · LNG —— · ACC —— · MOCK OFF". */
  blank() {
    if (!root) return;
    f.lat && (f.lat.textContent = '——');
    f.lng && (f.lng.textContent = '——');
    f.extra && (f.extra.textContent = 'ACC ——');
    if (f.status) {
      f.status.textContent = 'MOCK OFF';
      f.status.classList.remove('is-on');
    }
    state.mock = false;
  },
};
