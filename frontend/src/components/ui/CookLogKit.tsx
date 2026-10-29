import type { ReactNode, Ref } from "react";
import { Heading } from "./Heading";

// The "made it" log (REC-6): the sheet that records a cook, and the ledger on the recipe page. Entries arrive with the
// shared `arrive` rise (motion.css); under reduced motion they simply appear.

/**
 * The made-it form's frame: a paper-deep block under a thin ink rule. In cook mode it sits above the footer (the stage
 * pins the evening edition, so it reads dark there); on the recipe page it opens under the log's heading. Never more than
 * half the screen tall: on a phone held sideways the form scrolls inside it, so the step and the footer stay.
 */
export function MadeItPanel({ ref, label, children }: { ref?: Ref<HTMLElement>; label: string; children: ReactNode }) {
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      className="flex max-h-[50dvh] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain border-t border-(--rule-double) bg-(--panel-bg) px-5 py-5 focus:outline-none motion-safe:animate-[arrive_var(--duration-base)_var(--ease-out)_both] sm:px-6"
    >
      {children}
    </section>
  );
}

/** The made-it form's two fields: the day in a narrow column, the note beside it (stacked on a phone). */
export function MadeItFields({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">{children}</div>;
}

/** The collapsed strip above cook mode's footer: a short line and the button that opens the form. */
export function MadeItPrompt({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-(--rule-hair) py-3">
      <p className="font-text text-body text-ink-muted italic">{children}</p>
      {action}
    </div>
  );
}

/** "Made it" in display type with the count on the right, over a thin double rule. `id` names the section. */
export function CookLogHeader({ id, count, action }: { id: string; count: number; action?: ReactNode }) {
  const made = count === 0 ? null : count === 1 ? "Made once" : `Made ${count} times`;
  return (
    <div className="flex flex-col gap-3">
      <div className="rule-double w-full" aria-hidden="true" />
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Heading level={2} size="title" id={id}>
          Made it
        </Heading>
        <div className="flex items-center gap-4">
          {made && <span className="label pb-1.5 text-ink-muted">{made}</span>}
          {action}
        </div>
      </div>
    </div>
  );
}

/** The entries, newest first, between hairlines. */
export function CookLogList({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col border-b border-(--rule-hair)">{children}</ol>;
}

/**
 * One entry: the day in the accent label voice on the left (above on a phone), who made it, and the note in italics.
 * `fresh` plays the arrival rise for an entry just added on this page.
 */
export function CookLogItem({
  day,
  dateTime,
  who,
  note,
  action,
  fresh = false,
}: {
  day: string;
  /** `YYYY-MM-DD`, for the `<time>` element. */
  dateTime: string;
  who: string;
  note?: string;
  action?: ReactNode;
  fresh?: boolean;
}) {
  return (
    <li
      className={
        fresh
          ? "grid grid-cols-1 gap-x-8 gap-y-1 border-t border-(--rule-hair) py-5 sm:grid-cols-[11rem_minmax(0,1fr)_auto] motion-safe:animate-[arrive_var(--duration-base)_var(--ease-out)_both]"
          : "grid grid-cols-1 gap-x-8 gap-y-1 border-t border-(--rule-hair) py-5 sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
      }
    >
      <time dateTime={dateTime} className="label pt-1 text-(--kicker-fg)">
        {day}
      </time>
      <div className="flex min-w-0 max-w-measure flex-col gap-1">
        <p className="label-quiet text-ink">{who}</p>
        {note && <p className="font-text text-body text-ink-muted italic [overflow-wrap:anywhere] whitespace-pre-line">{note}</p>}
      </div>
      {action && <div className="flex items-start sm:justify-end">{action}</div>}
    </li>
  );
}

/** Quiet italic line under the heading when nothing is logged yet. */
export function CookLogEmpty({ children }: { children: ReactNode }) {
  return <p className="max-w-measure font-text text-deck text-ink-muted italic">{children}</p>;
}

/** The sheet's confirmation once the entry is saved: a display-type line and the day, announced politely. */
export function MadeItDone({ ref, title, children }: { ref?: Ref<HTMLParagraphElement>; title: string; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col gap-1">
      <p ref={ref} tabIndex={-1} className="font-display text-title-sm text-ink focus:outline-none">
        {title}
      </p>
      {children && <p className="font-text text-small text-ink-muted italic">{children}</p>}
    </div>
  );
}
