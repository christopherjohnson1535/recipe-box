import type { ReactNode } from "react";
import { Heading } from "./Heading";

/* Pieces of the article layout a recipe page is set in. */

/** Uppercase label/value pairs in a centred line under the article head: SERVES 4 · PREP 15 MIN. */
export function MetaStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="label dot-list dot-list-stack -mt-4 flex flex-wrap justify-center gap-y-2 text-ink max-sm:grid max-sm:grid-cols-[repeat(2,auto)] max-sm:justify-center max-sm:gap-x-8 [&>*]:[overflow-wrap:anywhere]">
      {items.map((m) => (
        <div key={m.label}>
          <dt className="inline text-ink-muted">{m.label}</dt> <dd className="inline">{m.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The lead photo, wide column, 3:2. */
export function LeadPhoto({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="mx-auto w-full max-w-page">
      {/* Plain <img>: /media needs the session cookie, which next/image's optimizer wouldn't send. */}
      <img
        src={src}
        alt={alt}
        width={1200}
        height={800}
        fetchPriority="high"
        className="aspect-[3/2] h-auto max-h-[36rem] w-full object-cover [filter:var(--photo-filter)]"
      />
    </figure>
  );
}

/** Opening paragraph with an accent drop cap. */
export function Lede({ children }: { children: ReactNode }) {
  return <p className="drop-cap mx-auto max-w-measure text-deck text-ink [overflow-wrap:anywhere]">{children}</p>;
}

/** Two columns from 768px: a narrow sidebar beside the main text, on the same edges as the masthead and photo. Stacks on phones. */
export function SidebarLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-page grid-cols-1 gap-12 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-14">
      {sidebar}
      {children}
    </div>
  );
}

/** Tinted sidebar headed by the double rule, e.g. the ingredients. */
export function Sidebar({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <aside aria-labelledby={id} className="flex flex-col gap-4 self-start bg-(--panel-bg) px-5 pt-1 pb-6 sm:px-6">
      <div className="rule-double -mx-5 sm:-mx-6" aria-hidden="true" />
      <div className="pt-3">
        <Heading level={2} size="label" id={id}>
          {title}
        </Heading>
      </div>
      {children}
    </aside>
  );
}

/** A list divided by hairlines, e.g. ingredients. */
export function RuledList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col divide-y divide-(--rule-hair)">
      {items.map((text, i) => (
        <li key={i} className="py-2.5 text-body leading-snug [overflow-wrap:anywhere]">
          {text}
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps with accent display numerals in a hanging column. */
export function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {steps.map((text, i) => (
        <li key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 sm:grid-cols-[2.75rem_minmax(0,1fr)]">
          <span className="font-display text-numeral text-(--numeral-fg) tabular-nums">
            {i + 1}
          </span>
          <p className="max-w-[34rem] text-body [overflow-wrap:anywhere]">{text}</p>
        </li>
      ))}
    </ol>
  );
}

/** A closing section set off by a hairline, e.g. the cook's notes. */
export function EndNote({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-4 flex flex-col gap-3 border-t border-(--rule-hair) pt-6">
      <Heading level={2} size="label" id={id}>
        {title}
      </Heading>
      {children}
    </section>
  );
}
