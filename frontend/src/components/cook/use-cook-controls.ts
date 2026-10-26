"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { swipeDirection } from "./cook-logic";

/** The polite live region's text, and a function to say something: the same words twice in a row get a trailing no-break space, so it is a new change and a screen reader says them again. */
export function useAnnounce(): [{ text: string }, (text: string) => void] {
  const [live, setLive] = useState({ text: "" });
  const announce = useCallback((text: string) => setLive((l) => ({ text: l.text === text ? `${text} ` : text })), []);
  return [live, announce];
}

/** ← and → call `go(-1)` / `go(1)`; not while typing in a field or a slider, on a held key or with a modifier. */
export function useStepKeys(go: (by: number) => void) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], [role=slider], [role=radiogroup]")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go]);
}

/** Touch handlers for the stage: a swipe left or right calls `go(1)` / `go(-1)`; not from a control, not a pinch. */
export function useSwipe(go: (by: number) => void) {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      swipe.current = e.touches.length > 1 || (e.target instanceof Element && e.target.closest("button, a, input, select, textarea, [role=slider]")) ? null : { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const from = swipe.current;
      swipe.current = null;
      const t = e.changedTouches[0];
      if (!from || !t || e.touches.length > 0) return;
      const dir = swipeDirection(t.clientX - from.x, t.clientY - from.y);
      if (dir) go(dir === "next" ? 1 : -1);
    },
    onTouchCancel: () => void (swipe.current = null),
  };
}
