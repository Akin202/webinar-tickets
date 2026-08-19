/**
 * Door scanner offline shell.
 *
 * The hard constraint this file exists to satisfy: `/scan` must complete a
 * full scan-to-result cycle with the device in airplane mode. IndexedDB
 * already holds the manifest, but that only helps if the tab is still open —
 * a reload, a tab eviction or a crash at the door previously locked that
 * phone out for the rest of the night, because `middleware.ts` needs the
 * network to answer before the page can render.
 *
 * WHY HAND-ROLLED, NOT SERWIST/WORKBOX
 * The requirement is one route plus its static chunks. A build-time precache
 * plugin brings a manifest injection step, a new webpack pass, and a
 * `defaultCache` that has to be actively fought to keep it away from `/api/*`
 * and the Supabase origin. This file is ~200 lines of readable logic with an
 * explicit allow-list, no build step, and identical behaviour in dev and
 * prod. Six days before the event, auditable beats featureful.
 *
 * SCOPE IS `/` AND THAT IS DELIBERATE
 * The scanner's JS lives under `/_next/static/*`, which is outside any
 * `/scan`-rooted scope, so a narrower registration could not cache the code
 * the page needs. The blast radius is contained by the fetch handler instead:
 * it is an allow-list of exactly two things, every other request is passed
 * through untouched, and the deny-list below is stated explicitly rather than
 * left to omission.
 *
 * WHAT MUST NEVER BE CACHED
 * `/ticket/*` is a bearer credential. `/api/*` includes the buyer list.
 * Supabase is where truth lives and a stale answer at the door is worse than
 * no answer. All three are refused below, and cross-origin requests never
 * reach the caching code at all.
 *
 * Bumping VERSION purges both caches on next activate. Old `/_next/static/*`
 * entries are content-hashed and therefore harmless if left behind, so this
 * is housekeeping, not correctness — do not bump it during event week.
 */

const VERSION = 'v1';
const DOC_CACHE = `door-doc-${VERSION}`;
const ASSET_CACHE = `door-assets-${VERSION}`;

/** The only document this worker will ever serve from cache. */
const SCAN_PATH = '/scan';

/**
 * Fixed cache key. Next sends `Vary: RSC, Next-Router-State-Tree, ...` on app
 * routes; matching the raw navigation Request against that would miss. A
 * constant key plus `ignoreVary` makes the lookup deterministic.
 */
const SCAN_DOC_KEY = '/scan';

/** The door gets 4s to hear from the server before the cache decides. */
const DOC_NETWORK_TIMEOUT_MS = 4000;

/**
 * Paths this worker refuses to touch, stated rather than implied. Everything
 * not explicitly handled falls through to the network anyway; this list is
 * here so that a future edit to the routing below cannot quietly start
 * caching a bearer token or the buyer list.
 */
const NEVER_CACHE = ['/api/', '/ticket/', '/admin', '/checkout', '/scan/login'];

function isDenied(pathname) {
  if (pathname === '/') return true;
  return NEVER_CACHE.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * Shown only when this phone has never loaded the scanner online. There is
 * nothing to fall back to, so the page says exactly that instead of leaving
 * staff staring at a browser error screen during a queue.
 */
const NEVER_LOADED_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scanner unavailable offline</title>
<style>
  body{margin:0;background:#0b1120;color:#e2e8f0;font:16px/1.5 system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}
  main{max-width:26rem}
  h1{font-size:1.25rem;margin:0 0 .75rem;color:#fbbf24}
  p{margin:0 0 .75rem;color:#cbd5e1}
  b{color:#f8fafc}
</style></head>
<body><main>
<h1>This phone has no offline copy of the scanner</h1>
<p>The door scanner was never opened on this device while it had a connection,
so there is nothing stored to fall back on.</p>
<p><b>Get online once</b> — mobile data or hotspot — then open the scanner and
wait for it to say <b>Offline ready</b>. After that it will survive a reload
with no network at all.</p>
</main></body></html>`;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener('install', (event) => {
  // Install happens moments after the first online visit to /scan, so the
  // network is there. Caching the document now means the very first visit is
  // already survivable rather than needing a second load.
  event.waitUntil(
    (async () => {
      try {
        await cacheScanDocument();
      } catch {
        // A failed warm-up is not a failed install — the message handler and
        // the next navigation both get another chance.
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => /^door-(doc|assets)-/.test(k) && k !== DOC_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      // Claim immediately: the page that just registered this worker is the
      // one standing at the door, and it must be controlled before it loses
      // signal, not on some later navigation.
      await self.clients.claim();
      // A new version purged the old caches a moment ago. Re-fill the
      // document slot while there is still a network to do it with.
      try {
        await cacheScanDocument();
      } catch {
        /* offline during activate — the next navigation will refill it */
      }
    })()
  );
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin — Supabase, Paystack, anything else. Never inspected, never
  // stored, never served stale.
  if (url.origin !== self.location.origin) return;

  if (isDenied(url.pathname)) return;

  // Content-hashed and immutable: a URL that exists has exactly one body
  // forever, so cache-first is correct and a new deploy simply asks for new
  // URLs.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(assetCacheFirst(request));
    return;
  }

  // The one document. Network-first so a signed-out session still redirects
  // and a fresh deploy is still picked up, cache-second so airplane mode
  // renders.
  if (request.mode === 'navigate' && url.pathname === SCAN_PATH) {
    event.respondWith(scanDocument());
    return;
  }

  // Everything else: not our business.
});

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

async function assetCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') {
    // Clone before returning — a Response body can only be read once.
    void cache.put(request, response.clone());
  }
  return response;
}

async function scanDocument() {
  const cache = await caches.open(DOC_CACHE);
  try {
    const response = await fetchScanDocument();

    // A 307 to /scan/login when the session has expired. Hand it back so the
    // browser follows it, and do not store it — caching a redirect here would
    // permanently trap the door on the login page.
    if (response.type === 'opaqueredirect' || response.status === 0) return response;

    if (response.ok && response.type === 'basic') {
      void cache.put(SCAN_DOC_KEY, response.clone());
      return response;
    }
    // A 500 from the server is still a real answer; prefer a working cached
    // scanner over an error page.
    const stale = await cache.match(SCAN_DOC_KEY, { ignoreVary: true });
    return stale || response;
  } catch {
    const stale = await cache.match(SCAN_DOC_KEY, { ignoreVary: true });
    if (stale) return stale;
    return new Response(NEVER_LOADED_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/**
 * Fetches `/scan` as a document.
 *
 * Deliberately builds a fresh Request rather than reusing the navigation one:
 * constructing a Request from a Request whose mode is 'navigate' throws a
 * TypeError, which is the classic way this pattern breaks. `redirect: manual`
 * keeps the auth redirect intact for the caller to pass through.
 */
async function fetchScanDocument() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOC_NETWORK_TIMEOUT_MS);
  try {
    return await fetch(SCAN_PATH, {
      signal: controller.signal,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function cacheScanDocument() {
  const response = await fetchScanDocument();
  if (!response.ok || response.type !== 'basic') return false;
  const cache = await caches.open(DOC_CACHE);
  await cache.put(SCAN_DOC_KEY, response.clone());
  return true;
}

// ---------------------------------------------------------------------------
// Warm-up + readiness
// ---------------------------------------------------------------------------

/**
 * The page that registered this worker had already downloaded its own scripts
 * before the worker existed to intercept them, so nothing it needs is in the
 * cache yet. The page reports the URLs it actually loaded and they get pulled
 * in behind it — that is what makes the FIRST online visit enough, instead of
 * requiring a second load nobody at a door will remember to do.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'WARM_SHELL') return;
  const urls = Array.isArray(data.urls) ? data.urls : [];
  event.waitUntil(warmShell(urls, event.source));
});

async function warmShell(urls, client) {
  const wanted = urls
    .map((u) => {
      try {
        return new URL(u, self.location.origin);
      } catch {
        return null;
      }
    })
    .filter(
      (u) => u && u.origin === self.location.origin && u.pathname.startsWith('/_next/static/')
    )
    .map((u) => u.pathname + u.search);

  const cache = await caches.open(ASSET_CACHE);
  let missing = 0;

  await Promise.all(
    wanted.map(async (path) => {
      try {
        if (await cache.match(path)) return;
        const response = await fetch(path, { credentials: 'same-origin' });
        if (response.ok && response.type === 'basic') {
          await cache.put(path, response.clone());
        } else {
          missing += 1;
        }
      } catch {
        missing += 1;
      }
    })
  );

  let documentCached = Boolean(await (await caches.open(DOC_CACHE)).match(SCAN_DOC_KEY, {
    ignoreVary: true,
  }));
  if (!documentCached) {
    try {
      documentCached = await cacheScanDocument();
    } catch {
      documentCached = false;
    }
  }

  client?.postMessage({
    type: 'SHELL_STATUS',
    // "Ready" means a reload with no network renders the scanner: the
    // document is stored AND every script it asked for is stored. Anything
    // less is reported as not ready — an optimistic green light here would be
    // the most expensive lie in the app.
    ready: documentCached && missing === 0 && wanted.length > 0,
    assets: wanted.length - missing,
    total: wanted.length,
  });
}
