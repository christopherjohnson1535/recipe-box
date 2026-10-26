import type { ReactNode } from "react";
import { Heading } from "./Heading";
import { Rule } from "./Rule";
import { Text } from "./Text";

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
        <Heading level={1}>{title}</Heading>
        <div className="max-w-measure">
          <Text variant="deck">{deck}</Text>
        </div>
      </header>
      <Rule />
      <div className="flex flex-col gap-8">{children}</div>
    </section>
  );
}
