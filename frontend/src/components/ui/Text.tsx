import type { ElementType, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Every run of text a page sets. Each variant resets case, tracking, weight and style, so one can sit inside
 * another (a small italic source line inside an uppercase byline) without inheriting the wrong look.
 */
const variants = {
  /** 19px reading text. */
  body: "text-body text-ink normal-case tracking-normal font-normal not-italic",
  /** Italic standfirst under a title, empty-state copy. */
  deck: "text-deck text-ink-muted normal-case tracking-normal font-normal italic",
  /** Hints, alerts, small print. */
  small: "text-small text-ink-muted normal-case tracking-normal font-normal not-italic",
  /** Small italic aside, e.g. "Source: …" in a byline. */
  aside: "text-small normal-case tracking-normal font-normal italic",
  /** Italic body-size note: "No steps listed.", recipe notes. */
  note: "text-body text-ink-muted normal-case tracking-normal font-normal italic",
  /** Uppercase tracked label in muted ink: counts, metadata. */
  meta: "label text-ink-muted not-italic",
  /** Upright, semibold ink inside italic copy. */
  strong: "text-ink font-semibold not-italic",
} as const;

type TextProps = {
  variant?: keyof typeof variants;
  as?: ElementType;
  /** Keep line breaks the writer typed (recipe notes). */
  preserveLines?: boolean;
  id?: string;
  children: ReactNode;
};

export function Text({ variant = "body", as: Tag = "p", preserveLines, id, children }: TextProps) {
  return (
    <Tag id={id} className={cx(variants[variant], "[overflow-wrap:anywhere]", preserveLines && "whitespace-pre-line")}>
      {children}
    </Tag>
  );
}
