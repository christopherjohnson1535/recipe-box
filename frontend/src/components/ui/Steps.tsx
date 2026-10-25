import type { ReactNode } from "react";

/** Numbered how-to steps: a large display numeral in the margin, the instruction beside it. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex max-w-measure list-none flex-col gap-6 border-t border-rule pt-6">{children}</ol>;
}

export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] items-baseline gap-x-3">
      <span aria-hidden="true" className="font-display text-title leading-none text-(--kicker-fg)">
        {n}
      </span>
      <div className="flex flex-col gap-3 text-body text-ink [overflow-wrap:anywhere]">{children}</div>
    </li>
  );
}
