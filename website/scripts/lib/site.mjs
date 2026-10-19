// Shared build-time helpers: config loading, {{token}} replacement and HTML partial expansion.
// Used by vite.config.js, scripts/sync-config.mjs and scripts/render-assets.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONFIG_PATH = path.join(ROOT, 'site.config.json');

const REQUIRED = ['name', 'slug', 'domain', 'repo', 'releases', 'apk'];

/** Read site.config.json and add derived values. Throws on missing/invalid fields. */
export function loadConfig() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const missing = REQUIRED.filter((k) => !raw[k]);
  if (missing.length) throw new Error(`site.config.json is missing: ${missing.join(', ')}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(raw.slug)) {
    throw new Error(`site.config.json: slug "${raw.slug}" must be lowercase letters, digits and dashes`);
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(raw.domain)) {
    throw new Error(`site.config.json: domain "${raw.domain}" does not look like a hostname`);
  }
  return derive(raw);
}

// Uppercase advances of Archivo at wght 900, wdth 100, letter-spacing -0.035em, in em (measured in the
// browser). The hero wordmark's CSS size uses their sum (name_em) before JS fits it exactly, so the
// first paint and the fitted size agree and the fit causes no layout shift.
const ADVANCE = { A: 0.743, B: 0.743, C: 0.743, D: 0.743, E: 0.687, F: 0.632, G: 0.798, H: 0.798, I: 0.334, J: 0.632, K: 0.798, L: 0.632, M: 0.937, N: 0.798, O: 0.798, P: 0.687, Q: 0.798, R: 0.743, S: 0.687, T: 0.687, U: 0.798, V: 0.743, W: 0.965, X: 0.743, Y: 0.743, Z: 0.687, ' ': 0.26 };
const nameEm = (name) => [...name.toUpperCase()].reduce((a, c) => a + (ADVANCE[c] ?? 0.72), 0);

export function derive(raw) {
  return {
    tagline: '',
    description: '',
    author: '',
    ...raw,
    url: `https://${raw.domain}`,
    year: String(new Date().getFullYear()),
    name_len: String([...raw.name].length),
    name_em: nameEm(raw.name).toFixed(3),
  };
}

const FILTERS = {
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  json: (s) => JSON.stringify(s),
  attr: (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'),
};

/**
 * Replace {{key}} and {{key|filter}} with config values.
 * Unknown keys throw in strict mode (build) and are left in place otherwise.
 */
export function renderTokens(str, cfg, { strict = true, file = 'html', extra = {} } = {}) {
  const vals = { ...cfg, ...extra };
  return str.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*(?:\|\s*([a-z]+)\s*)?\}\}/gi, (m, key, filter) => {
    if (!(key in vals)) {
      if (strict) throw new Error(`${file}: unknown token ${m}`);
      return m;
    }
    let v = String(vals[key]);
    if (filter) {
      if (!FILTERS[filter]) throw new Error(`${file}: unknown token filter "${filter}" in ${m}`);
      v = FILTERS[filter](v);
    }
    return v;
  });
}

let componentsCache = null;
/** Load the browser-safe component builders (pure string functions). */
export async function loadComponents(fresh = false) {
  if (componentsCache && !fresh) return componentsCache;
  const href = pathToFileURL(path.join(ROOT, 'src/components/index.js')).href + (fresh ? `?t=${Date.now()}` : '');
  componentsCache = await import(href);
  return componentsCache;
}

function parseAttrs(s = '') {
  const out = {};
  const re = /([a-zA-Z_][\w-]*)(?:="([^"]*)")?/g;
  let m;
  while ((m = re.exec(s))) out[m[1]] = m[2] === undefined ? true : m[2];
  return out;
}

/**
 * Expand partial markers, then tokens.
 *   <!-- scene:<id> -->            -> src/scenes/<id>.html   (missing file = empty, warns)
 *   <!-- include:<name> -->        -> src/partials/<name>.html
 *   <!-- component:<fn> a="b" c --> -> components[fn]({ a: 'b', c: true })
 * Partials may contain further markers (max depth 6) and tokens.
 */
export async function expandHtml(html, { cfg, strict = true, warn = console.warn, fresh = false, file = 'index.html', deps, extra = {} } = {}) {
  const components = await loadComponents(fresh);
  const read = (rel, kind) => {
    const p = path.join(ROOT, rel);
    deps?.add(p);
    if (!fs.existsSync(p)) {
      warn(`[site] ${kind} partial not found: ${rel} (rendered empty)`);
      return '';
    }
    return fs.readFileSync(p, 'utf8');
  };
  const expand = (src, depth) => {
    if (depth > 6) throw new Error(`${file}: partials nested too deeply`);
    return src.replace(/<!--\s*(scene|include|component):([a-z0-9_-]+)\s*([^]*?)-->/gi, (m, kind, name, rest) => {
      if (kind === 'scene') return `\n${expand(read(`src/scenes/${name}.html`, 'scene'), depth + 1)}\n`;
      if (kind === 'include') return expand(read(`src/partials/${name}.html`, 'include'), depth + 1);
      const fn = components[name] || components[`${name}SVG`];
      if (typeof fn !== 'function') throw new Error(`${file}: unknown component "${name}"`);
      const attrs = parseAttrs(rest.trim());
      for (const k of Object.keys(attrs)) {
        if (typeof attrs[k] === 'string') attrs[k] = renderTokens(attrs[k], cfg, { strict, file, extra });
      }
      return fn(attrs);
    });
  };
  return renderTokens(expand(html, 0), cfg, { strict, file, extra });
}
