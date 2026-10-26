import type { ReactNode } from "react";

import { Rule } from "./Rule";

export type Numeral = {
  label: string;
  /** What is set in big display type: a number, or with `text` a phrase ("makes about 4 bowls") set smaller. */
  value?: ReactNode;
  text?: boolean;
  /** A time as number + small unit pairs set side by side ("3hr 20min"). */
  parts?: { value: string; unit: string }[];
  /** The full wording for screen readers when `parts` are shorthand ("3 hr 20 min"). */
  spoken?: string;
};

/** Serves / Prep / Cook / Total in large numerals between a thin double rule and a hairline. Only items that have a value. */
export function NumeralsBand({ items }: { items: Numeral[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      <Rule variant="double" />
      <div className="overflow-hidden">
        {/* Each cell has a left rule; the list is shifted one pixel so the first (and every row-start) rule is clipped. */}
        <dl className="-ml-px grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
          {items.map((n) => {
            const big = n.parts ? (
              n.parts.map((p) => (
                <span key={p.unit} className="mr-2 whitespace-nowrap last:mr-0">
                  {p.value}
                  <sup className="ml-0.5 text-[0.36em] [vertical-align:0.9em]">{p.unit}</sup>
                </span>
              ))
            ) : (
              n.value
            );
            return (
              <div key={n.label} className="flex min-w-0 flex-col-reverse justify-end gap-1 border-l border-(--rule-hair) px-5 py-4">
                <dt className="label text-ink-muted">{n.label}</dt>
                <dd
                  className={
                    n.text
                      ? "font-display text-[1.5rem] leading-tight text-ink [overflow-wrap:anywhere]"
                      : "font-display leading-none text-ink [font-variant-numeric:lining-nums] [font-size:clamp(2.5rem,7vw,3.25rem)] [overflow-wrap:anywhere]"
                  }
                >
                  {n.spoken ? (
                    <>
                      <span aria-hidden="true">{big}</span>
                      <span className="sr-only">{n.spoken}</span>
                    </>
                  ) : (
                    big
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      <Rule />
    </div>
  );
}
