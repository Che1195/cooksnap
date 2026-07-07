/**
 * CookSnap service worker — hand-rolled (no build-tool coupling; Next 16's
 * Turbopack has no stable SW plugin story). Strategy:
 *
 *   /_next/static, /icons, manifest  → cache-first (hashed/immutable assets)
 *   /_next/image                     → stale-while-revalidate
 *   navigations (HTML)               → network-first, cached page fallback
 *   /api, /auth, cross-origin        → untouched (never cached)
 *
 * Data offline is handled in the app layer: the Zustand store snapshot is
 * persisted to localStorage and list toggles queue for replay when online.
 */

const STATIC_CACHE = "cooksnap-static-v1";
const PAGE_CACHE = "cooksnap-pages-v1";
const IMAGE_CACHE = "cooksnap-images-v1";
const ACTIVE_CACHES = [STATIC_CACHE, PAGE_CACHE, IMAGE_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !ACTIVE_CACHES.includes(name))
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await refresh) || Response.error();
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort: any cached page beats a white screen; the app shell
    // renders the persisted store data client-side.
    const anyPage = await cache.match("/shopping-list");
    if (anyPage) return anyPage;
    return new Response(
      "<!doctype html><title>Offline</title><h1>Offline</h1><p>CookSnap needs a connection for this page.</p>",
      { status: 503, headers: { "Content-Type": "text/html" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/auth/")) return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/image")) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGE_CACHE));
  }
});
