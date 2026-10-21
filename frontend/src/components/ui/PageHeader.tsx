import type { ReactNode } from "react";
import { cx } from "./cx";

type PageHeaderProps = {
  title: string;
  /** Small uppercase line above the title, e.g. a section name. */
  kicker?: ReactNode;
  /** Italic standfirst under the title. */
  description?: ReactNode;
  /** Uppercase byline under the deck, e.g. "Added by Chris". */
  byline?: ReactNode;
  actions?: ReactNode;
  align?: "start" | "center";
  /** Keep the deck's height when there is no description, so the head doesn't jump between page states. */
  reserveDeck?: boolean;
};

/** Article-style page head: kicker, display headline, italic deck, byline, then a hairline. */
export function PageHeader({ title, kicker, description, byline, actions, align = "start", reserveDeck }: PageHeaderProps) {
  const centered = align === "center";
  return (
    <header className={cx("flex flex-col gap-4 border-b border-(--rule-hair) pb-8", centered && "items-center text-center")}>
      {kicker && <div className="label text-(--kicker-fg)">{kicker}</div>}
      <h1 className="max-w-measure-wide font-display text-headline text-ink">{title}</h1>
      {description && <p className="max-w-measure text-deck text-ink-muted italic">{description}</p>}
      {!description && reserveDeck && (
        <p className="text-deck" aria-hidden="true">
          &nbsp;
        </p>
      )}
      {byline && <div className="label text-ink-muted">{byline}</div>}
      {actions && <div className={cx("mt-2 flex flex-wrap gap-3", centered && "justify-center")}>{actions}</div>}
    </header>
  );
}
