import type { ReactNode } from "react";
import { cx } from "./cx";

/** The rows of a list being edited (ingredients, steps). Children are `EditorItem`s. */
export function EditorList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-4 sm:gap-6">{children}</ul>;
}

type EditorItemProps = {
  /** Shows an accent numeral in a hanging column (method steps). */
  number?: number;
  /** A section heading control set above this row, marked by a left rule. */
  heading?: ReactNode;
  /** The row's buttons (move, remove): under the control on a phone, beside it from 640px. */
  controls: ReactNode;
  children: ReactNode;
};

/** One editable row: optional section heading, the text control, and its buttons. */
export function EditorItem({ number, heading, controls, children }: EditorItemProps) {
  return (
    <li className="flex flex-col gap-3">
      {heading && <div className="flex flex-col gap-2 border-l-[3px] border-(--editor-heading-rule) pl-3 [&_input]:italic">{heading}</div>}
      <div
        className={cx(
          number !== undefined && "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]",
        )}
      >
        {number !== undefined && (
          <span className="font-display text-numeral text-(--numeral-fg) tabular-nums" aria-hidden="true">
            {number}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <div className="flex flex-wrap gap-1 sm:shrink-0 sm:flex-nowrap">{controls}</div>
        </div>
      </div>
    </li>
  );
}
