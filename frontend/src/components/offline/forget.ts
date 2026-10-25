import { CACHE_PREFIX } from "./rules";

/**
 * Drops every offline copy of recipes and photos on this device (the app shell stays). Called on sign-out so whoever
 * picks up the iPad next sees nothing from the cache. Best-effort: never throws.
 */
export async function forgetOffline(): Promise<void> {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "FORGET_OFFLINE" });
    if (typeof caches === "undefined") return;
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
  } catch {
    // storage blocked: the worker also wipes everything on the next signed-out response
  }
}
