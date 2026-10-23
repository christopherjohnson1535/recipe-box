import type { ReactNode } from "react";

export type Numeral = {
  label: string;
  /** What is set in big display type; a small `unit` follows it. */
  value: ReactNode;
  unit?: string;
  /** The full wording for screen readers when `value` and `unit` are shorthand ("3 hr 20 min" for 3:20). */
  spoken?: string;
};

/** Serves / Prep / Cook / Total in large numerals between a thick and a thin rule. Only items that have a value. */
export function NumeralsBand({ items }: { items: Numeral[] }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden border-t-[3px] border-b border-(--rule-double)">
      {/* Each cell has a left rule; the list is shifted one pixel so the first (and every row-start) rule is clipped. */}
      <dl className="-ml-px grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
        {items.map((n) => {
          const big = (
            <>
              {n.value}
              {n.unit && <sup className="ml-1 text-[0.4em] [vertical-align:0.9em]">{n.unit}</sup>}
            </>
          );
          return (
            <div key={n.label} className="flex min-w-0 flex-col-reverse justify-end gap-1 border-l border-(--rule-hair) px-5 py-4">
              <dt className="label text-ink-muted">{n.label}</dt>
              <dd className="font-display leading-none text-ink [font-variant-numeric:lining-nums] [font-size:clamp(2.5rem,7vw,3.25rem)] [overflow-wrap:anywhere]">
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
  );
}
