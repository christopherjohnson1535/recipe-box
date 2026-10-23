/**
 * The in-season ticker: a slow marquee of produce under the cover. A screen reader gets the list once (the looping
 * copy is `aria-hidden`); the pointer or focus inside pauses it; reduced motion stops it and wraps the list (motion.css).
 * The region is focusable so a keyboard user can pause it.
 */
export function Ticker({ label, items }: { label: string; items: string[] }) {
  const list = (hidden?: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 gap-x-10 pe-10">
      {items.map((item) => (
        <li key={item} className="whitespace-nowrap text-body text-ink italic">
          {item}
        </li>
      ))}
    </ul>
  );
  return (
    <section
      aria-label={label}
      // shortcut: focusable so keyboard users can pause the loop (WCAG 2.2.2); the pause is :focus-within in motion.css.
      tabIndex={0}
      className="ticker flex items-baseline gap-6 border-y border-(--rule-hair) py-3 print:hidden"
    >
      <span aria-hidden="true" className="label shrink-0 text-(--kicker-fg)">
        {label}
      </span>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="ticker-track">
          {list()}
          {list(true)}
        </div>
      </div>
    </section>
  );
}
