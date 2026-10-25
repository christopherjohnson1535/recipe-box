"use client";

import { useEffect, useRef } from "react";

/**
 * A draggable bookmark tab. React refuses a `javascript:` href, so the attribute is set by hand. A click does nothing
 * (the link is for dragging to the bookmarks bar, not for running on this page).
 */
export function BookmarkTab({ href, children }: { href: string; children: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (href) ref.current?.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={ref}
      draggable
      onClick={(e) => e.preventDefault()}
      className="label inline-flex min-h-control cursor-grab items-center gap-3 self-start border border-(--button-secondary-border) bg-(--alert-bg) px-5 py-2 text-ink active:cursor-grabbing hover:border-(--button-secondary-hover)"
    >
      <span aria-hidden="true" className="font-display text-title leading-none text-(--kicker-fg)">
        ❧
      </span>
      {children}
    </a>
  );
}
