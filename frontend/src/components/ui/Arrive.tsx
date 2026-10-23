"use client";

import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

// Pages already shown in this tab. sessionStorage survives reloads; the Set covers storage that throws (private
// windows, blocked site data) so Back still skips the animation within one page session.
const PREFIX = "rb-arrived:";
const shown = new Set<string>();

function hasArrived(key: string): boolean {
  if (shown.has(key)) return true;
  try {
    if (sessionStorage.getItem(PREFIX + key)) {
      shown.add(key);
      return true;
    }
  } catch {
    /* storage unavailable: the Set alone decides */
  }
  return false;
}

/** Records that a page key has arrived, so its entrance animations will not play (again). */
export function markArrived(key: string) {
  shown.add(key);
  try {
    sessionStorage.setItem(PREFIX + key, "1");
  } catch {
    /* the Set has it */
  }
}

/** Test helper: forget every arrival. */
export function resetArrivals() {
  shown.clear();
  try {
    sessionStorage.clear();
  } catch {
    /* nothing to clear */
  }
}

const noSubscribe = () => () => {};
// True while the server renders and while React hydrates that HTML; false in every client-only render (navigation).
const useDuringServerHtml = () => useSyncExternalStore(noSubscribe, () => false, () => true);

// Runs as the server HTML is parsed, before first paint: a page already shown in this tab (reload, Back without the
// bfcache) is marked done at once, so its entries never sit hidden waiting for hydration and then replay.
const earlyDone = (key: string) =>
  `try{if(sessionStorage.getItem(${JSON.stringify(PREFIX + key).replace(/</g, "\\u003c")}))document.currentScript.parentElement.dataset.arrive="done"}catch(e){}`;

// Longer than the slowest arrival (eight list steps plus a rise), so entries added later (a new search) stay still.
const PLAY_MS = 2400;

/**
 * Wraps a page so its entrance (`.rise-word`, `.draw-rule`, `.stagger-item` in motion.css) plays once per visit.
 * The server and first render say `play`: the CSS animations run from the first paint and always end visible, so
 * nothing is hidden when JS fails. Before paint the layout effect switches to `done` if this key was already shown
 * (Back, a revisit), which cancels the animation without a flash; the first time it records the key instead.
 */
export function Arrive({
  arriveKey,
  as: Tag = "div",
  className,
  children,
}: {
  arriveKey: string;
  as?: "div" | "article" | "section";
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const decided = useRef(false); // Strict Mode runs effects twice; only the first decision counts
  useLayoutEffect(() => {
    if (decided.current) return;
    decided.current = true;
    const el = ref.current;
    if (!el) return;
    // The attribute is set on the DOM, not through state: React renders a constant "play" and never overwrites it.
    if (hasArrived(arriveKey)) {
      el.dataset.arrive = "done";
      return;
    }
    markArrived(arriveKey);
    setTimeout(() => (el.dataset.arrive = "done"), PLAY_MS); // not cleared on cleanup: Strict Mode's fake unmount must not cancel it
  }, [arriveKey]);
  const inServerHtml = useDuringServerHtml();
  return (
    // suppressHydrationWarning: the early script may already have turned "play" into "done" in the server HTML.
    <Tag ref={ref as never} data-arrive="play" className={className} suppressHydrationWarning>
      {inServerHtml && <script dangerouslySetInnerHTML={{ __html: earlyDone(arriveKey) }} />}
      {children}
    </Tag>
  );
}
