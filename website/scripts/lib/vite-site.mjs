// Vite plugin: one config file drives every name/link on the site.
//  - transformIndexHtml (pre): inline scene/include/component partials, replace {{tokens}}
//  - transformIndexHtml (post, build): strip HTML comments, preload the two Latin woff2 fonts
//  - writeBundle: run the same expansion on public/*.html (404.html) and write the CSP
//    (with sha256 hashes of inline scripts) into dist/_headers
//  - dev: full reload when partials or site.config.json change
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, CONFIG_PATH, loadConfig, expandHtml, renderTokens } from './site.mjs';

/** Authoring comments (storyboard notes, partial headers) stay in the source, never in the shipped HTML. */
const stripComments = (html) => html.replace(/<!--(?!\[if)[^]*?-->\s*/g, '');

const PRELOAD_FONTS = [/^archivo-latin-wdth-normal-.*\.woff2$/, /^jetbrains-mono-latin-wght-normal-.*\.woff2$/];

export default function sitePlugin() {
  let cfg = loadConfig();
  let isBuild = false;
  let outDir = path.join(ROOT, 'dist');
  let fontFiles = [];

  return {
    name: 'site-config',
    configResolved(c) {
      isBuild = c.command === 'build';
      outDir = path.resolve(c.root, c.build.outDir);
    },

    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        cfg = loadConfig();
        return expandHtml(html, {
          cfg,
          strict: isBuild,
          fresh: !isBuild,
          file: path.basename(ctx.filename || 'index.html'),
          warn: (m) => this?.warn ? this.warn(m) : console.warn(m),
        });
      },
    },

    // /download is a Worker in production (worker/index.js). Locally it just goes to the releases page.
    configurePreviewServer(server) {
      server.middlewares.use(downloadRedirect(() => cfg));
    },

    // Separate hook object for the post phase (font preloads need the bundle).
    configureServer(server) {
      server.middlewares.use(downloadRedirect(() => cfg));
      const watched = [CONFIG_PATH, path.join(ROOT, 'src/scenes'), path.join(ROOT, 'src/partials'), path.join(ROOT, 'src/components')];
      server.watcher.add(watched);
      server.watcher.on('change', (file) => {
        const f = path.resolve(file);
        if (f === CONFIG_PATH || (/\.(html)$/.test(f) && watched.some((w) => f.startsWith(w))) || f.includes(`${path.sep}components${path.sep}`)) {
          server.ws.send({ type: 'full-reload' });
        }
      });
    },

    generateBundle(_opts, bundle) {
      fontFiles = Object.values(bundle)
        .filter((a) => a.type === 'asset' && PRELOAD_FONTS.some((re) => re.test(path.basename(a.fileName))))
        .map((a) => '/' + a.fileName);
    },

    async writeBundle() {
      // 1. public/*.html (copied verbatim by Vite) -> expand partials + tokens in place.
      for (const f of fs.readdirSync(outDir)) {
        if (!f.endsWith('.html') || f === 'index.html') continue;
        const p = path.join(outDir, f);
        let html = fs.readFileSync(p, 'utf8');
        const fonts = Object.fromEntries(
          fontFiles.map((u) => [path.basename(u).startsWith('archivo') ? 'font_display' : 'font_mono', u]),
        );
        html = await expandHtml(html, { cfg, strict: true, file: f, extra: fonts });
        fs.writeFileSync(p, stripComments(html));
      }
      // 2. CSP with hashes of every inline <script> across the emitted pages.
      const hashes = new Set();
      for (const f of fs.readdirSync(outDir)) {
        if (!f.endsWith('.html')) continue;
        const html = fs.readFileSync(path.join(outDir, f), 'utf8');
        for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([^]*?)<\/script>/gi)) {
          if (!m[1].trim()) continue;
          hashes.add(`'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
        }
      }
      const headersPath = path.join(outDir, '_headers');
      if (fs.existsSync(headersPath)) {
        const h = fs.readFileSync(headersPath, 'utf8');
        fs.writeFileSync(
          headersPath,
          renderTokens(h, cfg, { extra: { csp_script_hashes: [...hashes].join(' ') }, file: '_headers' }),
        );
      }
    },
  };
}

function downloadRedirect(getCfg) {
  return (req, res, next) => {
    if ((req.url || '').split('?')[0] !== '/download') return next();
    res.statusCode = 302;
    res.setHeader('Location', getCfg().releases);
    res.end();
  };
}

/** Post-phase HTML hook: font preloads (build only). Kept as a second plugin so ordering is explicit. */
export function fontPreloadPlugin() {
  return {
    name: 'site-font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        html = stripComments(html);
        const tags = Object.values(ctx.bundle)
          .filter((a) => a.type === 'asset' && PRELOAD_FONTS.some((re) => re.test(path.basename(a.fileName))))
          .map((a) => ({
            tag: 'link',
            attrs: { rel: 'preload', href: '/' + a.fileName, as: 'font', type: 'font/woff2', crossorigin: '' },
            injectTo: 'head-prepend',
          }));
        return { html, tags };
      },
    },
  };
}
