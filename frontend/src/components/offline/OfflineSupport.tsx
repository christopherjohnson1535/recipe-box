"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { KEPT_PAGE } from "./rules";

export const SW_URL = "/serwist/sw.js";

/**
 * Registers the service worker (src/app/sw.ts) and asks it to keep a recipe page it did not see load: after an
 * in-app navigation (those fetch React Server Component data, not the page) or on the first visit, before any worker
 * controlled the page. Production builds only (`next dev` rebuilds every chunk, and a worker would serve stale ones).
 */
export function OfflineSupport() {
  const pathname = usePathname();
  // The page this document loaded with already went through the worker when one controlled the load.
  const landed = useRef<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
      // no secure context (plain http on a LAN address) or storage blocked: the app works, just not offline
    });
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const first = landed.current === null;
    if (first) landed.current = pathname;
    if (!KEPT_PAGE.test(pathname) || (first && navigator.serviceWorker.controller)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (navigator.onLine) reg.active?.postMessage({ type: "CACHE_URLS", payload: { urlsToCache: [pathname] } });
      })
      .catch(() => {});
  }, [pathname]);

  return null;
}
