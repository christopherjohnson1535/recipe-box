import type { ReactNode } from "react";
import { cx } from "./cx";

/** The rows of a list being edited (ingredients, steps). Children are `EditorItem`s. */
export function EditorList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-6">{children}</ul>;
}

type EditorItemProps = {
  /** Shows an accent numeral in a hanging column (method steps). */
  number?: number;
  /** A section heading control set above this row, marked by a left rule. */
  heading?: ReactNode;
  /** The row's buttons (move, remove), laid out under the control. */
  controls: ReactNode;
  children: ReactNode;
};

/** One editable row: optional section heading, the text control, and its buttons. */
export function EditorItem({ number, heading, controls, children }: EditorItemProps) {
  return (
    <li className="flex flex-col gap-3">
      {heading && <div className="flex flex-col gap-2 border-l-[3px] border-(--rule-hair) pl-3">{heading}</div>}
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
        <div className="flex min-w-0 flex-col gap-2">
          {children}
          <div className="flex flex-wrap gap-2">{controls}</div>
        </div>
      </div>
    </li>
  );
}
