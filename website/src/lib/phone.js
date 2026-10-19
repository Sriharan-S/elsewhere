// CSS-only phone, cloned from <template id="tpl-phone"> (src/partials/phone.html).
// Screens are absolutely stacked .phone__layer divs inside .phone__screens; add your own.

/**
 * @param {object} [o]
 * @param {string[]} [o.layers]  class names for stacked screen layers, e.g. ['app', 'recents', 'lock']
 * @param {string}   [o.time='9:41']  status-bar clock
 * @returns {{ el: HTMLElement, screen: HTMLElement, layers: Record<string, HTMLElement> }}
 */
export function phone({ layers = [], time = '9:41' } = {}) {
  const tpl = document.getElementById('tpl-phone');
  if (!tpl) throw new Error('phone(): <template id="tpl-phone"> is missing (include:phone in index.html)');
  const el = tpl.content.firstElementChild.cloneNode(true);
  const screen = el.querySelector('.phone__screens');
  el.querySelector('[data-phone-time]').textContent = time;
  const out = {};
  for (const name of layers) {
    const l = document.createElement('div');
    l.className = `phone__layer phone__layer--${name}`;
    l.dataset.layer = name;
    screen.appendChild(l);
    out[name] = l;
  }
  return { el, screen, layers: out };
}
