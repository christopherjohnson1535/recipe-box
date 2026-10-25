// The service worker's caching rules as plugins (src/app/sw.ts only wires them up), kept here so vitest can drive them
// with a fake cache. No DOM or worker globals at module level: this file is bundled into the worker by esbuild.
import type { SerwistPlugin } from "serwist";
import { CACHE_PREFIX, keepablePage, pageKey, signedOut } from "./rules";

/** The part of `CacheStorage` the worker uses. */
export type Store = Pick<CacheStorage, "keys" | "delete" | "open">;

/**
 * Sign-out safety. `generation` is bumped by every wipe; a fetch remembers the generation it started in, and nothing
 * it fetched is stored (or left stored) once a wipe has happened since. Order the plugins so `sameSession` comes LAST
 * in a strategy: its `cacheWillUpdate` is then the final check before the put. The put still happens a few awaits
 * later (open the cache, read the old entry), so `cacheDidUpdate` checks again and deletes the entry just written.
 */
export function createSession(store: Store = caches) {
  let generation = 0;

  async function forgetAll() {
    generation++;
    for (const name of await store.keys()) if (name.startsWith(CACHE_PREFIX)) await store.delete(name);
  }

  // Serwist gives every plugin its own `state` object, so each plugin that wants the check must also call `begin`.
  const begin = (state?: Record<string, unknown>) => {
    if (state) state.generation = generation;
  };
  const stale = (state?: Record<string, unknown>) => state?.generation !== generation;

  /** On every response we see: a signed-out answer wipes what was kept (the logged-out state is never served from cache). */
  const watchSession: SerwistPlugin = {
    fetchDidSucceed: async ({ response }) => {
      if (signedOut(response)) await forgetAll();
      return response;
    },
  };

  /** Put LAST in the plugin list of every caching strategy. */
  const sameSession: SerwistPlugin = {
    handlerWillStart: async ({ state }) => begin(state),
    cacheWillUpdate: async ({ response, state }) => (stale(state) ? null : response),
    cacheDidUpdate: async ({ cacheName, request, state }) => {
      if (stale(state)) await (await store.open(cacheName)).delete(request, { ignoreVary: true });
    },
  };

  /**
   * Only plain 200s, never a redirect and never a response that sets a cookie. A 404 (deleted recipe) also drops the
   * stale copy. Not checked: `Cache-Control: no-store`. Next.js sends it on every dynamic page and the API sends it
   * on recipe JSON, and keeping exactly those is the feature (docs/SPEC.md, "Offline"); the wipe on sign-out and the
   * rule that only recipe pages, their API read and /media are ever stored are what protect the data instead.
   * (Browsers hide `Set-Cookie` from scripts, so that check can only trip outside a browser: it is a backstop.)
   */
  const okOnly = (cacheName: string): SerwistPlugin => ({
    cacheWillUpdate: async ({ request, response }) => {
      if (response.status === 404) await (await store.open(cacheName)).delete(request, { ignoreVary: true });
      return response.status === 200 && !response.redirected && !response.headers.has("set-cookie") ? response : null;
    },
  });

  /** Recipe pages: the render must carry the keep marker (`keepablePage`), and the key ignores the query string. */
  const pageStore = (cacheName: string): SerwistPlugin[] => [
    { cacheKeyWillBeUsed: async ({ request }) => pageKey(request.url) },
    {
      cacheWillUpdate: async ({ request, response }) => {
        if (response.status === 404) await (await store.open(cacheName)).delete(pageKey(request.url), { ignoreVary: true });
        if (response.headers.has("set-cookie")) return null;
        return keepablePage(response, await response.clone().text()) ? response : null;
      },
    },
  ];

  return { forgetAll, begin, stale, watchSession, sameSession, okOnly, pageStore };
}
