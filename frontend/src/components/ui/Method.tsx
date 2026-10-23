import type { ReactNode } from "react";
import { Heading } from "./Heading";

/** "Method" in display type with the step count in small caps on the right, over a rule. */
export function MethodHeader({ steps }: { steps: number }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-(--rule-double) pb-3">
      <Heading level={2} size="title" id="steps">
        Method
      </Heading>
      {steps > 0 && <span className="label pb-1.5 text-ink-muted">{steps === 1 ? "1 step" : `${steps} steps`}</span>}
    </div>
  );
}

/** One step: a large claret numeral hanging in the margin, the text beside it. */
export function MethodStep({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
      <span aria-hidden="true" className="font-display text-[2.75rem] leading-[0.85] text-(--numeral-fg) [font-variant-numeric:lining-nums] sm:text-[4rem]">
        {number}
      </span>
      <p className="max-w-[34rem] text-body [overflow-wrap:anywhere]">{children}</p>
    </li>
  );
}

/** An ingredient named in a step: a dotted claret underline linking to its row in the ingredient list. */
export function IngredientMention({ index, children }: { index: number; children: ReactNode }) {
  return (
    <a href={`#ingredient-${index}`} className="border-b border-dotted border-(--mention-line) hover:border-solid">
      {children}
    </a>
  );
}

/**
 * A duration in a step, set as an ink pill with a clock. Display only (a running timer is #24). Screen readers and
 * print get the words as written ("12 minutes"); the pill's short label is for the eye.
 */
export function TimerChip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-(--timer-bg) py-px pr-2.5 pl-2 align-[0.1em] text-small whitespace-nowrap text-(--timer-fg) [font-variant-numeric:lining-nums_tabular-nums] print:inline print:bg-transparent print:p-0 print:text-[inherit]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 print:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 1.5M9.5 2.5h5" />
      </svg>
      <span aria-hidden="true" className="print:hidden">
        {label}
      </span>
      <span className="sr-only print:not-sr-only">{children}</span>
    </span>
  );
}
