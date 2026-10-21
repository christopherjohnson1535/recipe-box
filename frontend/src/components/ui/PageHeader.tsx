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
};

/** Article-style page head: kicker, display headline, italic deck, byline, then a hairline. */
export function PageHeader({ title, kicker, description, byline, actions, align = "start" }: PageHeaderProps) {
  const centered = align === "center";
  return (
    <header className={cx("flex flex-col gap-4 border-b border-rule pb-8", centered && "items-center text-center")}>
      {kicker && <div className="label text-accent">{kicker}</div>}
      <h1 className="max-w-measure-wide font-display text-headline text-ink">{title}</h1>
      {description && <p className="max-w-measure text-deck text-ink-muted italic">{description}</p>}
      {byline && <div className="label text-ink-muted">{byline}</div>}
      {actions && <div className={cx("mt-2 flex flex-wrap gap-3", centered && "justify-center")}>{actions}</div>}
    </header>
  );
}
