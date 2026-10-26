"use client";

import { useEffect } from "react";
import { hideSaveStamp, useSaveStamp } from "./save-stamp-store";

// Land (--duration-slow), hold two seconds, fade (--duration-base): the CSS animation in motion.css ends at 3.2 s.
const GONE_MS = 3400;

/**
 * The "In the box · Saved" rubber stamp shown once when a new recipe is saved. Mounted once in the app layout. The stamp is
 * decorative and ignores the pointer; a hidden live region says "Recipe saved." instead (this replaces the toast
 * notice for new recipes, so it is announced once). Fixed to the bottom corner, clear of the page head and actions.
 */
export function SaveStamp() {
  const stamp = useSaveStamp();
  const seq = stamp?.seq;
  useEffect(() => {
    if (seq === undefined) return;
    const t = setTimeout(() => hideSaveStamp(seq), GONE_MS);
    return () => clearTimeout(t);
  }, [seq]);
  return (
    <>
      <p role="status" className="sr-only">
        {stamp ? "Recipe saved." : ""}
      </p>
      {stamp && (
        <div
          key={stamp.seq}
          aria-hidden="true"
          className="pointer-events-none fixed right-[max(1rem,env(safe-area-inset-right))] bottom-24 z-40 print:hidden sm:right-[max(2rem,env(safe-area-inset-right))] sm:bottom-28"
        >
          <div className="stamp-run -rotate-[8deg] text-(--stamp-fg)">
            <div className="grid size-40 place-items-center rounded-full border-[3px] border-(--stamp-fg) sm:size-48">
              <div className="grid size-[calc(100%-0.75rem)] place-items-center rounded-full border border-(--stamp-fg) text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="label whitespace-nowrap">In the box</span>
                  <span className="font-display text-title leading-none">Saved</span>
                  <span className="label tracking-[0.08em] whitespace-nowrap">{stamp.date}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
