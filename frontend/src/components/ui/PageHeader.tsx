import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cx } from "./cx";
import { Morph, titleName } from "./morph";

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
  /** Announce the description politely when it changes (a live result count). */
  liveDescription?: boolean;
  /** The title's words rise in one after another (inside an `Arrive` scope, first visit only). */
  rise?: boolean;
  /** Recipe id: names the title so the card that opened this page morphs into it. */
  morphId?: string;
};

/** Article-style page head: kicker, display headline, italic deck, byline, then a 1px ink rule. */
export function PageHeader({ title, kicker, description, byline, actions, align = "start", reserveDeck, liveDescription, rise, morphId }: PageHeaderProps) {
  const centered = align === "center";
  return (
    <header className={cx("relative flex flex-col gap-4 pb-[calc(clamp(1.75rem,3.5vw,3rem)+1px)]", centered && "items-center text-center")}>
      {kicker && <div className="label text-(--kicker-fg)">{kicker}</div>}
      <Morph name={morphId ? titleName(morphId) : undefined}>
        <h1 className="min-w-0 max-w-measure-wide font-display text-headline text-ink [overflow-wrap:anywhere]">
          {rise
            ? title.split(" ").map((word, i) => (
                <Fragment key={i}>
                  {i > 0 && " "}
                  <span className="rise-word" style={{ "--w": Math.min(i, 8) } as CSSProperties}>
                    {word}
                  </span>
                </Fragment>
              ))
            : title}
        </h1>
      </Morph>
      {description && <p role={liveDescription ? "status" : undefined} className="max-w-measure text-deck text-ink-muted italic [overflow-wrap:anywhere]">{description}</p>}
      {!description && reserveDeck && (
        <p className="text-deck" aria-hidden="true">
          &nbsp;
        </p>
      )}
      {byline && <div className="label text-ink-muted">{byline}</div>}
      {actions && <div className={cx("mt-2 flex flex-wrap gap-3 print:hidden", centered && "justify-center")}>{actions}</div>}
      {/* The closing rule, 1px in full ink (muted ink in the evening, like the double rule); it draws in from the left on a first visit. */}
      <div className="draw-rule absolute inset-x-0 bottom-0 h-px bg-(--rule-double) print:border-t print:border-(--rule-double)" aria-hidden="true" />
    </header>
  );
}
