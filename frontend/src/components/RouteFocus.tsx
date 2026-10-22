"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * After a client-side navigation, moves focus to the new page's h1 (else `main`) so screen-reader users hear where
 * they landed and keyboard users start at the top of the page. Does nothing on first load or when focus is already
 * inside the page content (a form that kept its field focused).
 */
export function RouteFocus() {
  const path = usePathname();
  const previous = useRef(path);
  useEffect(() => {
    if (previous.current === path) return;
    previous.current = path;
    const main = document.getElementById("main");
    if (!main) return;
    const target = main.querySelector<HTMLElement>("h1") ?? main;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [path]);
  return null;
}
