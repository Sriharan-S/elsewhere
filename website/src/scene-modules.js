// All scene modules, eagerly imported so their CSS lands in the main stylesheet
// (no-JS visitors get it too). Kept in its own module so it is evaluated after
// src/styles/index.css: scene rules must come later in the cascade than base rules.
export const modules = import.meta.glob('./scenes/*.js', { eager: true });
