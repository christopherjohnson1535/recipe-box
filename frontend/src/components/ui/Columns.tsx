import type { ReactNode } from "react";
import { cx } from "./cx";

/* Layouts that use the 90rem page. Single column up to 1280px (xl); the content never stretches past its own measure. */

/**
 * A main column (form or list) with a column of help or tools beside it from 1280px. The main column keeps the form
 * measure (up to 44rem), the side column the reading measure (up to 38rem), so neither is stretched across the 90rem
 * page. Stacked below 1280px, the side column follows the main one. `sticky` keeps a short side column in view while
 * the main one scrolls. Without an `aside` there is no side column (and no empty gap): the main column takes the page.
 * The tree is the same either way, so a screen can drop its aside while a request runs without remounting the main column.
 */
export function WithAside({ children, aside, sticky }: { children: ReactNode; aside?: ReactNode; sticky?: boolean }) {
  return (
    <div className={cx("grid grid-cols-1 gap-10 xl:items-start xl:gap-x-16", Boolean(aside) && "xl:grid-cols-[minmax(0,44rem)_minmax(0,38rem)]")}>
      <div className="flex min-w-0 flex-col gap-8">{children}</div>
      {aside ? <div className={cx("flex min-w-0 max-w-form flex-col gap-8 xl:max-w-none", sticky && "xl:sticky xl:top-6")}>{aside}</div> : null}
    </div>
  );
}

/**
 * Content with a stage (a photo, a scan, a site card) beside it from 1024px while there is one, and on its own while
 * there is not. The content's node is the same either way, so a form keeps its place and focus when a stage appears.
 */
export function WithStage({ stage, children }: { stage?: ReactNode; children: ReactNode }) {
  return (
    <div className={cx("grid grid-cols-1 items-start gap-10", Boolean(stage) && "lg:grid-cols-2")}>
      {stage}
      <div className="flex flex-col gap-6">{children}</div>
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

const HIDE_BELOW = { md: "max-md:hidden", xl: "max-xl:hidden" } as const;

/**
 * The side column's block: a paper-deep panel under the thin double rule, like the recipe page's ingredient panel.
 * `hideBelow` marks a tip that a narrower screen can do without: "md" leaves it out on a phone, "xl" keeps it to the
 * wide layout where it sits beside the form (stacked, it would land after the form's own buttons).
 */
export function AsidePanel({ label, hideBelow, children }: { label: string; hideBelow?: keyof typeof HIDE_BELOW; children: ReactNode }) {
  return (
    <aside aria-label={label} className={cx("flex flex-col gap-6 bg-(--panel-bg) px-5 pt-1 pb-6 sm:px-6 print:hidden", hideBelow && HIDE_BELOW[hideBelow])}>
      <div className="rule-double -mx-5 sm:-mx-6" aria-hidden="true" />
      <div className="flex flex-col gap-6 pt-3">{children}</div>
    </aside>
  );
}
