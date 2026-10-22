import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Static label, e.g. a recipe's tags in a kicker. Siblings in a `.dot-list` get a middle dot between them. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className="label text-(--kicker-fg)">{children}</span>;
}

/** The tag index: chips wrap onto further lines instead of scrolling. Children are `<li><Chip/></li>`. */
export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-x-4">{children}</ul>
    </nav>
  );
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
      title={typeof children === "string" && children.length > 24 ? children : undefined}
      className={cx(
        "label inline-flex min-h-control max-w-full items-center gap-1.5 border-b-2 px-1 [overflow-wrap:anywhere]",
        "transition-[border-color,color] duration-150 ease-out",
        selected
          ? "border-(--chip-underline-selected) text-(--chip-fg-selected)"
          : "border-transparent text-(--chip-fg) hover:border-(--chip-underline-hover) hover:text-(--chip-fg-hover)",
      )}
    >
      {children}
      {count !== undefined && <span className="shrink-0 text-(--chip-fg)">{count}</span>}
    </Link>
  );
}
