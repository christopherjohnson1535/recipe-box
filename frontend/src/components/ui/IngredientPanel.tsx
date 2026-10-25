import type { ReactNode } from "react";
import { cx } from "./cx";
import { Heading } from "./Heading";

/** The ingredient sidebar: paper-deep panel under a double rule, the title with the scale control opposite. */
export function IngredientPanel({ id, scale, footer, children }: { id: string; scale?: ReactNode; /** Actions that belong to the whole list, set under the last row. */ footer?: ReactNode; children: ReactNode }) {
  return (
    <aside aria-labelledby={id} className="flex flex-col gap-3 self-start bg-(--panel-bg) px-5 pt-1 pb-5 sm:px-6">
      <div className="rule-double -mx-5 sm:-mx-6" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
        <Heading level={2} size="title-sm" id={id}>
          Ingredients
        </Heading>
        {scale}
      </div>
      {children}
      {footer && <div className="mt-1 flex flex-col items-start gap-3 pt-3 max-sm:items-stretch print:hidden">{footer}</div>}
    </aside>
  );
}

/** An ingredient section: an italic heading (when it has one) over its rows. */
export function IngredientGroup({ title, children }: { title: string | null; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      {title && (
        <div className="pt-3 pb-1">
          <Heading level={3} size="group">
            {title}
          </Heading>
        </div>
      )}
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

type IngredientRowProps = {
  /** Position in the whole list: the step links point at `#ingredient-<index>`. */
  index: number;
  /** The amount and unit, accent in its own column; null leaves the column empty. */
  quantity: string | null;
  checked: boolean;
  onToggle: () => void;
  /** The quantity fades to a new value (set once the reader has rescaled). */
  fade?: boolean;
  children: ReactNode;
};

/** One ingredient: a button the cook taps to tick off. Ticked rows get a checked box and a drawn accent line. */
export function IngredientRow({ index, quantity, checked, onToggle, fade, children }: IngredientRowProps) {
  return (
    <li id={`ingredient-${index}`} className="scroll-mt-24 border-b border-(--rule-hair) md:scroll-mt-4 print:break-inside-avoid">
      <button
        type="button"
        aria-pressed={checked}
        onClick={onToggle}
        className="group grid min-h-control w-full cursor-pointer grid-cols-[1.25rem_5.25rem_minmax(0,1fr)] items-baseline gap-x-3 py-2.5 text-left text-body leading-snug sm:grid-cols-[1.25rem_6.25rem_minmax(0,1fr)] print:grid-cols-[5.5rem_minmax(0,1fr)]"
      >
        <span
          aria-hidden="true"
          className="grid size-5 shrink-0 translate-y-[0.2em] place-items-center self-start rounded-[2px] border-[1.5px] border-ink-muted group-aria-pressed:border-(--button-primary-bg) group-aria-pressed:bg-(--button-primary-bg) print:hidden"
        >
          <svg viewBox="0 0 12 12" className="hidden size-3 group-aria-pressed:block" fill="none" stroke="var(--button-primary-fg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
          </svg>
        </span>
        <span className="text-small font-semibold text-(--qty-fg) [font-variant-numeric:lining-nums_tabular-nums] break-words group-aria-pressed:text-ink-muted">
          {quantity && (
            <>
              <span key={quantity} className={cx("strike", fade && "qty-fade")}>
                {quantity}
              </span>{" "}
            </>
          )}
        </span>
        <span className="min-w-0 [overflow-wrap:anywhere] group-aria-pressed:text-ink-muted">
          <span className="strike">{children}</span>
        </span>
      </button>
    </li>
  );
}

export type ScaleOption = { value: number; label: string };

/** ½× / 1× / 2×: a segmented radio group with 44px targets. */
export function ScaleControl({ value, options, onChange }: { value: number; options: ScaleOption[]; onChange: (value: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Scale ingredients" className="flex overflow-hidden rounded-full border border-(--button-secondary-border) print:hidden">
      {options.map((o) => (
        <label key={o.value} className="relative cursor-pointer">
          <input type="radio" name="scale" checked={value === o.value} onChange={() => onChange(o.value)} className="peer sr-only" />
          <span className="label flex min-h-control min-w-12 items-center justify-center px-3 text-ink peer-checked:bg-(--button-primary-bg) peer-checked:text-(--button-primary-fg) peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-(--focus-ring) peer-checked:peer-focus-visible:outline-(--toast-focus)">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}
