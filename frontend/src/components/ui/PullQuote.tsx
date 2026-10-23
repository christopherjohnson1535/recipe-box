import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * The recipe's note, set between a thick and a thin rule. A short note is a display-type quotation; a longer one keeps
 * the same frame at body size with its line breaks.
 */
export function PullQuote({ caption, short, children }: { caption: string; short: boolean; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2 border-t-[3px] border-b border-(--rule-double) py-5">
      <blockquote
        className={cx(
          "text-ink [overflow-wrap:anywhere]",
          short ? "font-display text-[1.75rem] leading-[1.2] sm:text-[2.125rem]" : "text-body whitespace-pre-line",
        )}
      >
        {short ? <>&ldquo;{children}&rdquo;</> : children}
      </blockquote>
      <figcaption className="label text-ink-muted">{caption}</figcaption>
    </figure>
  );
}
