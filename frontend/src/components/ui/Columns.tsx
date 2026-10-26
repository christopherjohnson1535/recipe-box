import type { ReactNode } from "react";
import { cx } from "./cx";

/* Layouts that use the 90rem page. Single column up to 1280px (xl); the content never stretches past its own measure. */

/**
 * A main column (form or list) with a column of help or tools beside it from 1280px. The main column keeps the form
 * measure (44rem), the side column keeps the reading measure, so neither is stretched across the 90rem page. Stacked
 * below 1280px, the side column follows the main one. `sticky` keeps a short side column in view while the main one scrolls.
 */
export function WithAside({ children, aside, sticky }: { children: ReactNode; aside: ReactNode; sticky?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,44rem)_minmax(0,38rem)] xl:items-start xl:gap-x-16">
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
      <div className={cx("flex min-w-0 max-w-form flex-col gap-8 xl:max-w-none", sticky && "xl:sticky xl:top-6")}>{aside}</div>
    </div>
  );
}

/** Two stacks of sections side by side from 1280px, one above the other before that. Reading order is the left stack, then the right. */
export function TwoColumns({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-12 xl:grid-cols-2 xl:items-start xl:gap-x-16">
      <div className="flex min-w-0 flex-col gap-12">{left}</div>
      <div className="flex min-w-0 flex-col gap-12">{right}</div>
    </div>
  );
}

/**
 * The side column's block: a paper-deep panel under the thin double rule, like the recipe page's ingredient panel.
 * `optional` marks a tip that a phone can do without: it is left out below 768px.
 */
export function AsidePanel({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  return (
    <aside aria-label={label} className={cx("flex flex-col gap-6 bg-(--panel-bg) px-5 pt-1 pb-6 sm:px-6 print:hidden", optional && "max-md:hidden")}>
      <div className="rule-double -mx-5 sm:-mx-6" aria-hidden="true" />
      <div className="flex flex-col gap-6 pt-3">{children}</div>
    </aside>
  );
}
