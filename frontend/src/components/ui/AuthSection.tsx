import type { ReactNode } from "react";
import { Rule } from "./Rule";

/**
 * One ruled section of a sign-in page, under the wordmark and its double rule: an accent kicker, the page's `h1` in the
 * display serif, an italic deck, a hairline, then the form and whatever goes with it (alerts, the Google link). No box, border or
 * background: the page is paper and the rules do the framing.
 */
export function AuthSection({ kicker, title, deck, children }: { kicker: string; title: string; deck: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="label text-(--kicker-fg)">{kicker}</p>
        <h1 className="font-display text-title text-ink [overflow-wrap:anywhere]">{title}</h1>
        <p className="max-w-measure text-deck text-ink-muted italic [overflow-wrap:anywhere]">{deck}</p>
      </header>
      <Rule />
      <div className="flex flex-col gap-8">{children}</div>
    </section>
  );
}
