import type { ReactNode } from "react";
import { cx } from "./cx";

type DotListProps = {
  /** Accessible name; when set the list is announced as a list, e.g. "Tags". */
  label?: string;
  /** `meta` sets the items as uppercase muted labels (SERVES 4 · 30 MIN). */
  tone?: "inherit" | "meta";
  align?: "start" | "center";
  /** `ul` for items that are a list; `p` for a run of phrases in a line, like a byline. */
  as?: "ul" | "p";
  children: ReactNode;
};

/** Items in a line separated by middle dots. Children are `<li>` for `ul`, `<span>` for `p`. */
export function DotList({ label, tone = "inherit", align = "start", as: Tag = "ul", children }: DotListProps) {
  return (
    <Tag
      aria-label={label}
      className={cx(
        "dot-list flex flex-wrap gap-y-1 [&>*]:[overflow-wrap:anywhere]",
        align === "center" && "justify-center",
        tone === "meta" && "label text-ink-muted",
      )}
    >
      {children}
    </Tag>
  );
}
