"use client";

import { useEffect } from "react";
import { applyEdition, EDITION_EVENT, msUntilNextSwitch } from "@/lib/edition";

const DARK = "(prefers-color-scheme: dark)";

/** Keeps data-theme and theme-color current after first paint. Renders nothing. Mounted once in the root layout. */
export function EditionController() {
  useEffect(() => {
    const media = window.matchMedia(DARK);
    let timer: number | undefined;
    const apply = () => {
      window.clearTimeout(timer);
      applyEdition(document, new Date(), media.matches);
      // +1 s so the timer lands just after the boundary, never just before it.
      timer = window.setTimeout(apply, msUntilNextSwitch(new Date()) + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") apply();
    };
    apply();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", apply);
    window.addEventListener(EDITION_EVENT, apply);
    media.addEventListener("change", apply);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", apply);
      window.removeEventListener(EDITION_EVENT, apply);
      media.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
