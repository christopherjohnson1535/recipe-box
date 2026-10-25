"use client";

import { useSyncExternalStore } from "react";
import { dayKey } from "./local-day";

/** Re-checks the clock once a minute and when the tab comes back (a tab left open overnight changes day). */
function subscribe(notify: () => void) {
  const timer = window.setInterval(notify, 60_000);
  document.addEventListener("visibilitychange", notify);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", notify);
  };
}

/**
 * The reader's local day as YYYY-MM-DD. The server renders (and hydration keeps) `serverDay`; once mounted it
 * switches to the browser's own calendar day, so an evening in Denver is never printed as tomorrow's UTC date.
 */
export function useLocalDay(serverDay: string): string {
  return useSyncExternalStore(subscribe, () => dayKey(new Date()), () => serverDay);
}
