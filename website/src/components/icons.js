// Tiny line icons (24 x 24 grid, 1.75 stroke, currentColor). Pure string builders.
const PATHS = {
  download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 20h14"/>',
  'arrow-up-right': '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  'arrow-right': '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
  'arrow-down': '<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="m6 6 12 12"/><path d="M18 6 6 18"/>',
  code: '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/>',
};

/** <!-- component:icon name="download" class="btn__icon" --> */
export function icon(o = {}) {
  const body = PATHS[o.name];
  if (!body) throw new Error(`icon: unknown name "${o.name}"`);
  const cls = ['icon', o.class].filter(Boolean).join(' ');
  return (
    `<svg class="${cls}" viewBox="0 0 24 24" width="${o.size || 20}" height="${o.size || 20}" fill="none" ` +
    `stroke="currentColor" stroke-width="${o.stroke || 1.75}" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${body}</svg>`
  );
}

export const ICONS = Object.keys(PATHS);
