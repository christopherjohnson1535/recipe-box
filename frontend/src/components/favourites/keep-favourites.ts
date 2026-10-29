// Favourites stay readable offline (KIT-5): the reader's starred recipes are kept on the device without having to be
// opened first. The service worker keeps a page it is asked to fetch with CACHE_URLS (and, with it, the page's photos and
// cooking mode), so this only decides which pages to ask for and when. Production builds only, like the worker.
import { api as browserApi } from "@/lib/api";
import { CACHES, FAVOURITE_MARKER, FAVOURITES_KEPT, RECIPE_READ_PAGE } from "@/components/offline/rules";

/** How many pages the worker is asked for at once: more would starve the page the reader is looking at. */
const BATCH = 4;
/** A batch the worker has not answered by then is given up on (a worker replaced mid-way never answers). */
const BATCH_TIMEOUT_MS = 30_000;

type Api = Pick<typeof browserApi, "listRecipes">;

/**
 * The active worker, once there is one, or null where there never will be (dev builds, no service worker support). Where
 * registering failed (plain http on a LAN address) this never settles, which leaves nothing waiting on it but this task.
 */
async function worker(): Promise<ServiceWorker | null> {
  if (process.env.NODE_ENV !== "production" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.ready).active;
}

/** Asks the worker to keep `paths` and waits until it says it has (Serwist answers on the message port). */
function keep(sw: ServiceWorker, paths: string[]): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(resolve, BATCH_TIMEOUT_MS);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve();
    };
    sw.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: paths } }, [channel.port2]);
  });
}

/**
 * The recipe paths among `paths` that the device has not kept yet. Looks pages up with `caches.match`, never
 * `caches.open`: opening would create the cache, and the page must not make caches of its own (after a sign-out wipe,
 * an empty one would look like something kept).
 */
export async function notKept(paths: string[], cacheStorage: Pick<CacheStorage, "match"> | undefined = globalThis.caches): Promise<string[]> {
  if (!cacheStorage) return paths;
  const missing: string[] = [];
  for (const path of paths) if (!(await cacheStorage.match(path, { cacheName: CACHES.pages, ignoreVary: true }))) missing.push(path);
  return missing;
}

/**
 * The kept recipe pages whose favourite mark no longer matches `favourites` (the star changed on another device), so
 * `/offline` would list them under the wrong heading. Only reads an `rb-pages` cache that already exists (never creates
 * one: see `notKept`). Favourites beyond the newest FAVOURITES_KEPT are not in `favourites`, so a marked page is only
 * stale when the list was complete (`complete`).
 */
export async function staleMarks(
  favourites: Set<string>,
  complete: boolean,
  cacheStorage: Pick<CacheStorage, "has" | "open"> | undefined = globalThis.caches,
): Promise<string[]> {
  if (!cacheStorage || !(await cacheStorage.has(CACHES.pages))) return [];
  const cache = await cacheStorage.open(CACHES.pages);
  const stale: string[] = [];
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (!RECIPE_READ_PAGE.test(path)) continue;
    const marked = ((await (await cache.match(req, { ignoreVary: true }))?.text()) ?? "").includes(FAVOURITE_MARKER);
    if (favourites.has(path) ? !marked : marked && complete) stale.push(path);
  }
  return stale;
}

/** Set for the rest of the session once the device ran out of room, so later page loads don't try again. */
const QUOTA_KEY = "rb-keep-favourites-full";

function storageFull(): boolean {
  try {
    return sessionStorage.getItem(QUOTA_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberFull() {
  try {
    sessionStorage.setItem(QUOTA_KEY, "1");
  } catch {
    // storage blocked: the next page load tries again
  }
}

/** Whether the origin has used nearly all the storage the browser allows it (unknown counts as not). */
async function nearlyFull(): Promise<boolean> {
  try {
    const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
    return usage !== undefined && quota !== undefined && quota > 0 && usage / quota > 0.9;
  } catch {
    return false;
  }
}

/**
 * Keeps the reader's newest favourites (up to FAVOURITES_KEPT) on this device, a few pages at a time, skipping the ones
 * already kept with the right mark, and re-keeps kept pages whose star changed on another device. Best effort: offline,
 * signed out or without a worker it does nothing and never throws. A device out of room is not asked again this session:
 * the worker's write fails out of the page's sight, so "out of room" is storage nearly full, or a whole batch that did not
 * land while online.
 */
export async function keepFavourites(api: Api = browserApi): Promise<void> {
  try {
    if (!navigator.onLine || storageFull()) return;
    const sw = await worker();
    if (!sw) return;
    if (await nearlyFull()) return rememberFull();
    const { items, total } = await api.listRecipes({ favourite: true, limit: FAVOURITES_KEPT });
    const paths = items.map((r) => `/recipes/${r.id}`);
    const todo = [...new Set([...(await notKept(paths)), ...(await staleMarks(new Set(paths), total <= items.length))])];
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      await keep(sw, batch);
      if (navigator.onLine && (await notKept(batch)).length === batch.length) return rememberFull();
    }
  } catch {
    // offline in the meantime, storage blocked, signed out: the next visit tries again
  }
}

/**
 * After a star changed: a newly starred recipe is kept (even if never opened here), and an unstarred one already kept is
 * fetched again so its kept copy shows the star as it is now. An unstarred recipe this device never kept stays unkept.
 * Best effort.
 */
export async function rekeep(recipeId: string, starred: boolean): Promise<void> {
  try {
    const path = `/recipes/${recipeId}`;
    const sw = await worker();
    if (!sw || !navigator.onLine) return;
    if (!starred && (await notKept([path])).length > 0) return;
    await keep(sw, [path]);
  } catch {
    // nothing kept: the page is fetched again the next time it is opened
  }
}
