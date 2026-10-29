import type { ReactNode } from "react";
import { typographic } from "@/lib/recipe";
import { cx } from "./cx";
import { Rule } from "./Rule";

const text = (children: ReactNode) => (typeof children === "string" ? typographic(children) : children);
// A long note keeps its line breaks as paragraphs.
const paragraphs = (children: ReactNode) => (typeof children === "string" ? typographic(children).split(/\n+/).filter(Boolean) : [children]);

/**
 * The recipe's note, set between a thin double rule and a hairline. A short note is a display-type quotation; a longer one keeps
 * the same frame at body size, one paragraph per line break. The rules run the column's width; the words keep a reading measure.
 */
export function PullQuote({ caption, short, children }: { caption: string; short: boolean; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-5">
      <Rule variant="double" />
      <blockquote
        className={cx(
          "text-ink [overflow-wrap:anywhere]",
          short ? "max-w-measure font-display text-[1.75rem] leading-[1.2] sm:text-[2.125rem]" : "flex max-w-measure flex-col gap-3 text-body",
        )}
      >
        {short ? <>&ldquo;{text(children)}&rdquo;</> : paragraphs(children).map((p, i) => <p key={i}>{p}</p>)}
      </blockquote>
      <figcaption className="label text-ink-muted">{caption}</figcaption>
      <Rule />
    </figure>
  );
}
