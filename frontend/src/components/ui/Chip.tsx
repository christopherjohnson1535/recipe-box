import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Static label, e.g. a recipe's tags on a card. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-surface-sunk px-2.5 py-0.5 text-xs font-medium text-muted">
      {children}
    </span>
  );
}

/** Filter link styled as a chip; `selected` marks the active filter. */
export function Chip({ href, selected, children }: { href: string; selected?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "inline-flex min-h-control items-center gap-1.5 whitespace-nowrap rounded-pill border px-4 text-sm font-medium",
        "transition-[background-color,border-color,color] duration-150 ease-out",
        selected
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-border bg-surface text-text hover:border-accent hover:text-accent-ink",
      )}
    >
      {children}
    </Link>
  );
}
