import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Static label, e.g. a recipe's tags in a kicker. Siblings in a `.dot-list` get a middle dot between them. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="label text-accent">{children}</span>;
}

/** Filter link set like a section in a magazine index; `selected` underlines it in the accent. */
export function Chip({ href, selected, children }: { href: string; selected?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "label inline-flex min-h-control items-center gap-1.5 whitespace-nowrap border-b-2 px-1",
        "transition-[border-color,color] duration-150 ease-out",
        selected ? "border-accent text-ink" : "border-transparent text-ink-muted hover:border-rule-strong hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
