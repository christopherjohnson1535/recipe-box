import type { ReactNode, Ref } from "react";
import { cx } from "./cx";

const sizes = {
  /** Section titles ("Method"), auth headings. Display serif. */
  title: "font-display text-title text-ink",
  /** Listing titles. Display serif. */
  "title-sm": "font-display text-title-sm text-ink",
  /** Uppercase label heading ("Ingredients", "Notes"). */
  label: "label text-ink",
  /** Accent label heading for a group inside a section (a method section like "For the sauce"). */
  kicker: "label text-(--kicker-fg)",
  /** Italic semibold group name inside a list (an ingredient section). */
  group: "text-small font-semibold italic text-ink",
} as const;

type HeadingProps = {
  level: 1 | 2 | 3;
  size?: keyof typeof sizes;
  id?: string;
  /** A hairline runs from the end of the title to the column edge. */
  ruled?: boolean;
  /** Lets a page move focus here (use with `tabIndex={-1}`), e.g. when a result arrives. */
  ref?: Ref<HTMLHeadingElement>;
  tabIndex?: number;
  children: ReactNode;
};

/** A heading in the type scale. Page headlines come from PageHeader; this is for everything below. */
export function Heading({ level, size = "title", id, ruled, ref, tabIndex, children }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} ref={ref} tabIndex={tabIndex} className={cx(sizes[size], ruled && "flex items-center gap-4 [overflow-wrap:anywhere]")}>
      {children}
      {ruled && <span className="h-px flex-1 bg-(--rule-hair)" aria-hidden="true" />}
    </Tag>
  );
}
