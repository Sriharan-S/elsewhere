// Tiny static file server for built output (used by shot.mjs). Mirrors Cloudflare's
// html_handling "auto-trailing-slash" closely enough: /x -> x.html or x/index.html, misses -> 404.html.
// It also applies dist/_headers, so CSP violations show up as console errors in screenshots.
// /download is a Worker in production (worker/index.js); here, as in vite dev/preview, it 302s to the
// releases page from site.config.json, so clicking Download during QA never lands on the 404 page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './site.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Parse a Cloudflare _headers file into [{ pattern, headers }]. */
function parseHeaders(file) {
  if (!fs.existsSync(file)) return [];
  const rules = [];
  let cur = null;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      cur = { pattern: raw.trim(), headers: {} };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(':');
      if (i > 0) cur.headers[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}

const matches = (pattern, p) => (pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : pattern === p);

/**
 * Serve `dir` on 127.0.0.1 at a free port.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export function serve(dir) {
  const root = path.resolve(dir);
  const rules = parseHeaders(path.join(root, '_headers'));
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/download' || u.pathname === '/download/') {
        let to = 'https://github.com/';
        try {
          to = loadConfig().releases;
        } catch {}
        res.writeHead(302, { location: to, 'cache-control': 'no-store' });
        res.end();
        return;
      }
      const rel = decodeURIComponent(u.pathname);
      const candidates = rel.endsWith('/') ? [rel + 'index.html'] : [rel, rel + '.html', rel + '/index.html'];
      let file = null;
      for (const c of candidates) {
        const p = path.join(root, path.normalize(c));
        if (!p.startsWith(root)) continue;
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          file = p;
          break;
        }
      }
      let status = 200;
      if (!file) {
        status = 404;
        file = path.join(root, '404.html');
        if (!fs.existsSync(file)) {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('404');
          return;
        }
      }
      const extra = {};
      for (const r of rules) if (matches(r.pattern, u.pathname)) Object.assign(extra, r.headers);
      delete extra['strict-transport-security'];
      delete extra['cache-control'];
      // upgrade-insecure-requests would break plain http://127.0.0.1 in tests
      if (extra['content-security-policy']) {
        extra['content-security-policy'] = extra['content-security-policy'].replace(/;\s*upgrade-insecure-requests/, '');
      }
      res.writeHead(status, {
        ...extra,
        'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((r) => {
            for (const s of sockets) s.destroy();
            server.close(() => r());
          }),
      });
    });
  });
}
