// node --test worker/   (npm run test:worker)
// Exercises the /download Worker with a mocked fetch and Cache API.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { apiUrl, releasesUrl } from './index.js';

const REPO = 'Sriharan-S/gps-mock';
const env = (extra = {}) => ({
  GITHUB_REPO: REPO,
  USER_AGENT: 'elsewhere-site',
  ASSETS: { fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`, { status: 200 }) },
  ...extra,
});

/** A Map-backed stand-in for caches.default. */
function mockCache() {
  const store = new Map();
  return {
    store,
    default: {
      async match(req) {
        const hit = store.get(req.url);
        return hit ? hit.clone() : undefined;
      },
      async put(req, res) {
        store.set(req.url, res.clone());
      },
    },
  };
}

function mockFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  fn.calls = calls;
  return fn;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const ctx = () => {
  const waits = [];
  return { waits, waitUntil: (p) => waits.push(p) };
};

async function run(path, { fetchImpl, cache = mockCache(), e = env(), c = ctx() } = {}) {
  globalThis.fetch = fetchImpl;
  globalThis.caches = cache;
  const res = await worker.fetch(new Request(`https://elsewhere.sriharan.me${path}`), e, c);
  await Promise.all(c.waits);
  return { res, cache, c };
}

const APK_URL = `https://github.com/${REPO}/releases/download/v1.4.0/Elsewhere.apk`;

test('success: 302 to the first .apk asset, with the GitHub API headers', async () => {
  const f = mockFetch(() =>
    json({
      tag_name: 'v1.4.0',
      assets: [
        { name: 'checksums.txt', browser_download_url: 'https://example.invalid/checksums.txt' },
        { name: 'Elsewhere.apk', browser_download_url: APK_URL },
        { name: 'Elsewhere-arm64.apk', browser_download_url: 'https://example.invalid/second.apk' },
      ],
    }),
  );
  const { res, cache } = await run('/download', { fetchImpl: f });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), APK_URL);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, apiUrl(REPO));
  assert.equal(f.calls[0].init.headers['User-Agent'], 'elsewhere-site');
  assert.equal(f.calls[0].init.headers.Accept, 'application/vnd.github+json');
  // cached for 10 minutes
  const stored = cache.store.get(apiUrl(REPO));
  assert.ok(stored, 'API response is stored in the Cache API');
  assert.equal(stored.headers.get('Cache-Control'), 'public, max-age=600');
});

test('several APKs: the universal build wins over ABI splits, whatever the upload order', async () => {
  const U = 'https://example.invalid/app-universal.apk';
  const f = mockFetch(() =>
    json({
      assets: [
        { name: 'app-arm64-v8a.apk', browser_download_url: 'https://example.invalid/app-arm64-v8a.apk' },
        { name: 'app-armeabi-v7a.apk', browser_download_url: 'https://example.invalid/app-armeabi-v7a.apk' },
        { name: 'app-universal.apk', browser_download_url: U },
      ],
    }),
  );
  const { res } = await run('/download', { fetchImpl: f });
  assert.equal(res.headers.get('Location'), U);
});

test('several APKs, none universal: the one not tied to a CPU architecture wins', async () => {
  const f = mockFetch(() =>
    json({
      assets: [
        { name: 'Elsewhere-arm64-v8a.apk', browser_download_url: 'https://example.invalid/arm64.apk' },
        { name: 'Elsewhere.apk', browser_download_url: APK_URL },
      ],
    }),
  );
  const { res } = await run('/download', { fetchImpl: f });
  assert.equal(res.headers.get('Location'), APK_URL);
});

test('renamed repository: the API request follows redirects', async () => {
  const f = mockFetch(() => json({ assets: [{ name: 'Elsewhere.apk', browser_download_url: APK_URL }] }));
  const { res } = await run('/download', { fetchImpl: f });
  assert.equal(f.calls[0].init.redirect, 'follow');
  assert.equal(res.headers.get('Location'), APK_URL);
});

test('trailing slash: /download/ redirects too', async () => {
  const f = mockFetch(() => json({ assets: [{ name: 'Elsewhere.apk', browser_download_url: APK_URL }] }));
  const { res } = await run('/download/', { fetchImpl: f });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), APK_URL);
});

test('cache hit: no second request to GitHub', async () => {
  const cache = mockCache();
  const f = mockFetch(() => json({ assets: [{ name: 'GPS Mock-Universal.apk', browser_download_url: APK_URL }] }));
  await run('/download', { fetchImpl: f, cache });
  const { res } = await run('/download', { fetchImpl: f, cache });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), APK_URL);
  assert.equal(f.calls.length, 1);
});

test('no .apk asset: falls back to the releases page', async () => {
  const f = mockFetch(() =>
    json({ assets: [{ name: 'source.zip', browser_download_url: 'https://example.invalid/source.zip' }] }),
  );
  const { res } = await run('/download', { fetchImpl: f });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), releasesUrl(REPO));
});

test('API error: falls back to the releases page and caches nothing', async () => {
  const f = mockFetch(() => json({ message: 'API rate limit exceeded' }, 403));
  const { res, cache } = await run('/download', { fetchImpl: f });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), releasesUrl(REPO));
  assert.equal(cache.store.size, 0);
});

test('network failure: falls back to the releases page', async () => {
  const f = mockFetch(() => {
    throw new TypeError('fetch failed');
  });
  const { res } = await run('/download', { fetchImpl: f });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), releasesUrl(REPO));
});

test('any other path is delegated to the ASSETS binding', async () => {
  const f = mockFetch(() => {
    throw new Error('must not call GitHub');
  });
  const { res } = await run('/index.html', { fetchImpl: f });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'asset:/index.html');
  assert.equal(f.calls.length, 0);
});
