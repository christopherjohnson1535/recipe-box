"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { RECIPE_PAGE } from "./rules";

export const SW_URL = "/serwist/sw.js";

/**
 * Registers the service worker (src/app/sw.ts) and, after an in-app navigation to a recipe, asks it to keep that
 * page: in-app navigations fetch React Server Component data, not the page itself, so the worker never sees the page
 * otherwise. Production builds only (`next dev` rebuilds every chunk, and a worker would serve stale ones).
 */
export function OfflineSupport() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
      // no secure context (plain http on a LAN address) or storage blocked: the app works, just not offline
    });
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || !RECIPE_PAGE.test(pathname)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (navigator.onLine) reg.active?.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: [pathname] } });
      })
      .catch(() => {});
  }, [pathname]);

  return null;
}
