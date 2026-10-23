import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/** Static label, e.g. a recipe's tags in a kicker; takes the colour of the kicker it sits in. Siblings in a `.dot-list` get a middle dot between them. */
export function Badge({ children, icon }: { children: ReactNode; /** A `SpotIcon` drawn before the name. */ icon?: ReactNode }) {
  if (icon) {
    return (
      <span className="label inline-flex items-baseline gap-2 [&>svg]:-translate-y-1 [&>svg]:self-center">
        {icon}
        {children}
      </span>
    );
  }
  return <span className="label">{children}</span>;
}

/**
 * The tag index: chips wrap onto further lines instead of scrolling. Children are `<li><Chip/></li>`. Below 640px
 * the chips sit behind a disclosure whose summary names the current choice (`current`, e.g. "Baking 2"), so a long
 * tag list does not push the recipes off the first screen; the rest of the time they are always shown.
 */
export function ChipRow({ label, current, children }: { label: string; current: string; children: ReactNode }) {
  return (
    <>
      <nav aria-label={label} className="max-sm:hidden">
        <ul className="flex flex-wrap gap-x-4">{children}</ul>
      </nav>
      <details className="group sm:hidden">
        <summary className="label-quiet flex min-h-control cursor-pointer list-none items-center justify-between border-b border-(--rule-hair) [&::-webkit-details-marker]:hidden">
          <span>
            Tag: <span className="font-semibold text-(--chip-fg-selected)">{current}</span>
          </span>
          <span aria-hidden="true" className="px-1 text-body">
            <span className="group-open:hidden">+</span>
            <span className="hidden group-open:inline">−</span>
          </span>
        </summary>
        <nav aria-label={label}>
          <ul className="flex flex-wrap gap-x-4">{children}</ul>
        </nav>
      </details>
    </>
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
        "label-quiet inline-flex min-h-control max-w-full items-center gap-1.5 border-b-2 px-1 [overflow-wrap:anywhere]",
        "transition-[border-color,color] duration-150 ease-out",
        selected
          ? "border-(--chip-underline-selected) font-semibold text-(--chip-fg-selected)"
          : "border-transparent text-(--chip-fg) hover:border-(--chip-underline-hover) hover:text-(--chip-fg-hover)",
      )}
    >
      {children}
      {count !== undefined && <span className="shrink-0 font-normal text-(--chip-fg)">{count}</span>}
    </Link>
  );
}
