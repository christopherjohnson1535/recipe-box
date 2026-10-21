import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Static label, e.g. a recipe's tags in a kicker. Siblings in a `.dot-list` get a middle dot between them. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="label text-(--kicker-fg)">{children}</span>;
}

/** Filter link set like a section in a magazine index; `selected` underlines it in the accent. */
export function Chip({
  href,
  selected,
  count,
  children,
}: {
  href: string;
  selected?: boolean;
  /** Shown muted after the name, e.g. how many recipes have this tag. */
  count?: number;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cx(
        "label inline-flex min-h-control items-center gap-1.5 whitespace-nowrap border-b-2 px-1",
        "transition-[border-color,color] duration-150 ease-out",
        selected
          ? "border-(--chip-underline-selected) text-(--chip-fg-selected)"
          : "border-transparent text-(--chip-fg) hover:border-(--chip-underline-hover) hover:text-(--chip-fg-hover)",
      )}
    >
      {children}
      {count !== undefined && <span className="text-(--chip-fg)">{count}</span>}
    </Link>
  );
}
