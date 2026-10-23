"use client";

import { useState } from "react";
import { Button } from "./Button";

/**
 * The in-season ticker: a slow marquee of produce under the cover. A screen reader gets the list once (the looping
 * copy is `aria-hidden`). It pauses under a hovering pointer or focus, and the Pause button (also a tap on the
 * ticker) stops it for good, which is the WCAG 2.2.2 mechanism. Reduced motion stops it, hides the button and wraps the list (motion.css).
 */
export function Ticker({ label, items }: { label: string; items: string[] }) {
  const [paused, setPaused] = useState(false);
  const list = (hidden?: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 gap-x-10 pe-10">
      {items.map((item) => (
        <li key={item} className="whitespace-nowrap text-body text-ink italic">
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <section
      aria-label={label}
      data-paused={paused || undefined}
      className="ticker flex items-center gap-6 border-y border-(--rule-hair) py-1 print:hidden"
    >
      <span aria-hidden="true" className="label shrink-0 text-(--kicker-fg)">
        {label}
      </span>
      {/* The tap target for touch: a tap anywhere on the moving text toggles it. */}
      <div
        className="min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_2rem,#000_calc(100%-2rem),transparent)]"
        onClick={() => setPaused((p) => !p)}
      >
        <div className="ticker-track">
          {list()}
          {list(true)}
        </div>
      </div>
      <Button variant="ghost" className="ticker-pause shrink-0" onClick={() => setPaused((p) => !p)}>
        {paused ? "Play" : "Pause"}
      </Button>
    </section>
  );
}
