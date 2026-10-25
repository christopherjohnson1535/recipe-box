import Link from "next/link";
import type { ReactNode } from "react";

/** "Also in this issue": a numbered quick index under a heavy rule. Children are `<IssueIndexItem>`s. */
export function IssueIndex({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside aria-label={title} className="border-t-[3px] border-(--rule-double) pt-4">
      <h2 className="label">{title}</h2>
      {/* role: list-style none drops list semantics in Safari */}
      <ol role="list" className="mt-2">
        {children}
      </ol>
    </aside>
  );
}

/** One line of the index: accent display numeral, title, total time. The whole line is the link. */
export function IssueIndexItem({ n, href, title, time }: { n: number; href: string; title: string; time?: ReactNode }) {
  return (
    <li className="border-b border-(--rule-hair)">
      <Link
        href={href}
        className="group grid min-h-control grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 py-3"
      >
        <span aria-hidden="true" className="font-display text-[1.875rem] leading-none text-(--numeral-fg)">
          {n}
        </span>
        <span className="text-body leading-snug font-medium text-ink transition-[color] duration-150 ease-out group-hover:text-(--entry-title-hover)">
          {title}
        </span>
        {time && <span className="label-quiet text-ink-muted">{time}</span>}
      </Link>
    </li>
  );
}

/** The inverse panel under the index: a label, a recipe worth cooking again, a note. */
export function FeaturePanel({ label, title, href, note }: { label: string; title: string; href: string; note: string }) {
  return (
    <aside aria-label={label} className="group relative flex flex-col gap-2 bg-(--feature-bg) p-6 text-(--feature-fg)">
      <h2 className="label">{label}</h2>
      <p className="font-display text-title-sm">
        <Link href={href} className="after:absolute after:inset-0 hover:underline hover:underline-offset-4 group-hover:underline group-hover:underline-offset-4 focus-visible:outline-(--feature-focus)">
          {title}
        </Link>
      </p>
      <p className="text-body italic">{note}</p>
    </aside>
  );
}
