import type { ReactNode } from "react";

/** The open/close mark of a `details` in a `group`: an accent plus that turns 45° to a cross when open. */
export function PlusMark() {
  return (
    <span aria-hidden="true" className="font-text text-[1.5rem] leading-none font-normal text-(--kicker-fg) transition-transform duration-150 ease-out group-open:rotate-45">
      +
    </span>
  );
}

/** A closed-by-default note: a label you tap to open it. Native `details`, so it works without script. */
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group max-w-measure border-t border-rule text-small text-ink-muted">
      <summary className="label flex min-h-control cursor-pointer list-none items-center justify-between gap-4 text-ink [&::-webkit-details-marker]:hidden">
        {summary}
        <PlusMark />
      </summary>
      <div className="flex flex-col gap-3 pb-2">{children}</div>
    </details>
  );
}
