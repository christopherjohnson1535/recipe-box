import Link from "next/link";
import type { ReactNode } from "react";
import { Rule } from "./Rule";

/** "More to cook": a numbered quick list under the thin double rule. Children are `<MoreListItem>`s. */
export function MoreList({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside aria-label={title}>
      <Rule variant="double" />
      <h2 className="label mt-4">{title}</h2>
      {/* role: list-style none drops list semantics in Safari */}
      <ol role="list" className="mt-2">
        {children}
      </ol>
    </aside>
  );
}

/** One line of the list: accent display numeral, title, total time. The whole line is the link. */
export function MoreListItem({ n, href, title, time }: { n: number; href: string; title: string; time?: ReactNode }) {
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

/** The panel under the list, drawn in the top band's colours: a saffron label, a recipe worth cooking again, a note. */
export function FeaturePanel({ label, title, href, note }: { label: string; title: string; href: string; note: string }) {
  return (
    <aside
      aria-label={label}
      className="group relative flex flex-col gap-2 border border-(--feature-edge) bg-band p-6 text-on-band [--focus-ring:var(--color-band-accent)]"
    >
      <h2 className="label text-band-accent">{label}</h2>
      <p className="font-display text-title-sm">
        <Link
          href={href}
          className="after:absolute after:inset-0 hover:underline hover:underline-offset-4 group-hover:underline group-hover:underline-offset-4"
        >
          {title}
        </Link>
      </p>
      <p className="text-body italic">{note}</p>
    </aside>
  );
}
