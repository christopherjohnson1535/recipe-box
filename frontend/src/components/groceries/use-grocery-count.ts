"use client";

import { useEffect, useState } from "react";
import { GROCERY_CHANGED, groceryApi } from "./client";
import { toBuy } from "./list-model";

/**
 * How many items are still to buy, for the masthead badge. Fetched in the browser after the page is up (never a blocking
 * request), again when the window gets focus or the tab becomes visible, and whenever a grocery write fires `grocery:changed`.
 * A failure leaves the last count (the badge is a nicety).
 */
export function useGroceryCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let live = true;
    let latest = 0;
    const load = () => {
      const mine = ++latest;
      groceryApi.get().then(
        (list) => live && mine === latest && setCount(toBuy(list)),
        () => undefined,
      );
    };
    const visible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener(GROCERY_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener(GROCERY_CHANGED, load);
    };
  }, []);
  return count;
}
