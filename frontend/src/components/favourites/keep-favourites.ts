// Favourites stay readable offline (KIT-5): the reader's starred recipes are kept on the device without having to be
// opened first. The service worker keeps a page it is asked to fetch with CACHE_URLS (and, with it, the page's photos and
// cooking mode), so this only decides which pages to ask for and when. Production builds only, like the worker.
import { api as browserApi } from "@/lib/api";
import { CACHES, FAVOURITES_KEPT } from "@/components/offline/rules";

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
 * Keeps the reader's newest favourites (up to FAVOURITES_KEPT) on this device, a few pages at a time, skipping the ones
 * already kept. Best effort: offline, signed out or without a worker it does nothing and never throws.
 */
export async function keepFavourites(api: Api = browserApi): Promise<void> {
  try {
    if (!navigator.onLine) return;
    const sw = await worker();
    if (!sw) return;
    const { items } = await api.listRecipes({ favourite: true, limit: FAVOURITES_KEPT });
    const missing = await notKept(items.map((r) => `/recipes/${r.id}`));
    for (let i = 0; i < missing.length; i += BATCH) await keep(sw, missing.slice(i, i + BATCH));
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
