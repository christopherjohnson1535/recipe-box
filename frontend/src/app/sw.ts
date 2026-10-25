/// <reference lib="webworker" />
// Service worker (KIT-5): recipes opened before stay readable offline. Bundled by esbuild through
// src/app/serwist/[path]/route.ts and registered by components/offline/OfflineSupport.
// Precache: the app shell (.next/static, public/, the /offline page). Runtime: recipe pages, GET /api/recipes/:id
// and /media/* only, network first so online always shows the server's copy. Everything else goes to the network.
import type { PrecacheEntry, RouteHandler, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import { CACHE_PREFIX, CACHES, keepablePage, LIMITS, MEDIA, mediaIn, OFFLINE_URL, pageKey, RECIPE_API, RECIPE_PAGE, RECIPE_READ_PAGE, signedOut } from "../components/offline/rules";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// Bumped by every wipe: a fetch that started before a wipe (signed in then) must not be stored after it.
let generation = 0;

async function forgetAll() {
  generation++;
  for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
}

/** On every response we see: a signed-out answer wipes what was kept (the logged-out state is never served from cache). */
const watchSession: SerwistPlugin = {
  fetchDidSucceed: async ({ response }) => {
    if (signedOut(response)) await forgetAll();
    return response;
  },
};

/** First in every caching strategy: drops the response if a wipe happened while it was in flight. */
const sameSession: SerwistPlugin = {
  handlerWillStart: async ({ state }) => {
    if (state) state.generation = generation;
  },
  cacheWillUpdate: async ({ response, state }) => (state?.generation === generation ? response : null),
};

const expire = (maxEntries: number) =>
  new ExpirationPlugin({ maxEntries, maxAgeSeconds: LIMITS.maxAgeSeconds, maxAgeFrom: "last-used", purgeOnQuotaError: true });

/** Only 200s; a 404 (deleted recipe) also drops the stale copy. */
const okOnly = (cacheName: string): SerwistPlugin => ({
  cacheWillUpdate: async ({ request, response }) => {
    if (response.status === 404) await (await caches.open(cacheName)).delete(request);
    return response.status === 200 && !response.redirected ? response : null;
  },
});

// Media names are content ids (`Cache-Control: immutable`), so a kept copy is always right.
const media = new CacheFirst({ cacheName: CACHES.media, plugins: [watchSession, sameSession, okOnly(CACHES.media), expire(LIMITS.media)] });

const pages = new NetworkFirst({
  cacheName: CACHES.pages,
  networkTimeoutSeconds: LIMITS.networkTimeoutSeconds,
  matchOptions: { ignoreVary: true },
  plugins: [
    watchSession,
    sameSession,
    { cacheKeyWillBeUsed: async ({ request }) => pageKey(request.url) },
    {
      cacheWillUpdate: async ({ request, response }) => {
        if (response.status === 404) await (await caches.open(CACHES.pages)).delete(pageKey(request.url));
        return keepablePage(response, await response.clone().text()) ? response : null;
      },
      // Keep the page's photos too: a page kept in the background (CACHE_URLS, update refresh) never loads them.
      // And its cooking mode, the page most used in the kitchen, unless that is kept already.
      cacheDidUpdate: async ({ request, newResponse, event }) => {
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
  ],
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      // Documents and the page's CACHE_URLS fetches; React Server Component requests (RSC: 1) stay network-only.
      matcher: ({ request, sameOrigin, url }) => sameOrigin && request.headers.get("RSC") !== "1" && RECIPE_PAGE.test(url.pathname),
      handler: pages,
    },
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && RECIPE_API.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: CACHES.api,
        networkTimeoutSeconds: LIMITS.networkTimeoutSeconds,
        plugins: [watchSession, sameSession, okOnly(CACHES.api), expire(LIMITS.api)],
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
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHES.pages);
      const keys = await cache.keys();
      await Promise.allSettled(keys.map((key) => serwist.handleRequest({ request: new Request(key.url), event })));
    })(),
  );
});

// Sign-out from the page also clears the caches itself; this covers a page that cannot reach `caches`.
self.addEventListener("message", (event) => {
  if (event.data?.type === "FORGET_OFFLINE") event.waitUntil(forgetAll());
});

serwist.addEventListeners();
