/// <reference lib="webworker" />
// Service worker (KIT-5): recipes opened before stay readable offline. Bundled by esbuild through
// src/app/serwist/[path]/route.ts and registered by components/offline/OfflineSupport.
// Precache: the app shell (.next/static, public/, the /offline page). Runtime: recipe pages, GET /api/recipes/:id
// and /media/* only, network first so online always shows the server's copy. Everything else goes to the network.
import type { PrecacheEntry, RouteHandler, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import { CACHES, LIMITS, MEDIA, mediaIn, OFFLINE_URL, pageKey, KEPT_API, KEPT_PAGE, RECIPE_READ_PAGE } from "../components/offline/rules";
import { createSession } from "../components/offline/worker-plugins";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const { forgetAll, begin, stale, watchSession, sameSession, okOnly, pageStore } = createSession();

const expire = (maxEntries: number) =>
  new ExpirationPlugin({ maxEntries, maxAgeSeconds: LIMITS.maxAgeSeconds, maxAgeFrom: "last-used", purgeOnQuotaError: true });

// Media names are content ids (`Cache-Control: immutable`), so a kept copy is always right.
const media = new CacheFirst({ cacheName: CACHES.media, plugins: [watchSession, okOnly(CACHES.media), expire(LIMITS.media), sameSession] });

const pages = new NetworkFirst({
  cacheName: CACHES.pages,
  networkTimeoutSeconds: LIMITS.networkTimeoutSeconds,
  matchOptions: { ignoreVary: true },
  plugins: [
    watchSession,
    ...pageStore(CACHES.pages),
    {
      handlerWillStart: async ({ state }) => begin(state),
      // Keep the page's photos too: a page kept in the background (CACHE_URLS, update refresh) never loads them.
      // And its cooking mode, the page most used in the kitchen, unless that is kept already.
      cacheDidUpdate: async ({ request, newResponse, event, state }) => {
        if (stale(state)) return; // wiped while this was in flight: keep nothing, fetch nothing
        const urls = mediaIn(await newResponse.clone().text());
        const jobs = urls.map((url) => media.handle({ request: new Request(url), event }));
        const cook = pageKey(request.url) + "/cook";
        if (RECIPE_READ_PAGE.test(new URL(request.url).pathname) && !(await (await caches.open(CACHES.pages)).match(cook, { ignoreVary: true }))) {
          jobs.push(pages.handle({ request: new Request(cook), event }));
        }
        await Promise.allSettled(jobs);
      },
    },
    expire(LIMITS.pages),
    sameSession, // last: its check is the final one before the put, and it removes the entry if a wipe slips in after
  ],
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      // Documents and the page's CACHE_URLS fetches; React Server Component requests (RSC: 1) stay network-only.
      matcher: ({ request, sameOrigin, url }) => sameOrigin && request.headers.get("RSC") !== "1" && KEPT_PAGE.test(url.pathname),
      handler: pages,
    },
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && KEPT_API.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: CACHES.api,
        networkTimeoutSeconds: LIMITS.networkTimeoutSeconds,
        plugins: [watchSession, okOnly(CACHES.api), expire(LIMITS.api), sameSession],
      }),
    },
    { matcher: ({ sameOrigin, url }) => sameOrigin && MEDIA.test(url.pathname), handler: media },
    {
      matcher: ({ sameOrigin }) => sameOrigin,
      handler: new NetworkOnly({ plugins: [watchSession] }) as RouteHandler,
    },
  ],
  fallbacks: { entries: [{ url: OFFLINE_URL, matcher: ({ request }) => request.destination === "document" }] },
});

// Kept pages name the build's script chunks. After an update the old chunks leave the precache, so fetch the kept
// pages again (this runs when the new worker takes over, which only happens while the server is reachable).
const REFRESH_BATCH = 4;
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHES.pages);
      const keys = await cache.keys();
      // A few at a time: up to LIMITS.pages pages at once would starve the page the person is looking at.
      for (let i = 0; i < keys.length; i += REFRESH_BATCH) {
        await Promise.allSettled(keys.slice(i, i + REFRESH_BATCH).map((key) => serwist.handleRequest({ request: new Request(key.url), event })));
      }
    })(),
  );
});

// Sign-out from the page also clears the caches itself; this covers a page that cannot reach `caches`.
self.addEventListener("message", (event) => {
  if (event.data?.type === "FORGET_OFFLINE") event.waitUntil(forgetAll());
});

serwist.addEventListeners();
