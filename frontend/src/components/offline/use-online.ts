"use client";

import { useSyncExternalStore } from "react";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/**
 * Whether the browser thinks it has a network. The server render (and hydration) says online, so nothing is
 * disabled until the page knows. `navigator.onLine` is false only when there is surely no network (airplane mode).
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
