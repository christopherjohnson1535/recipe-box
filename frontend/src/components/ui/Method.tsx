"use client";

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

/**
 * An ingredient named in a step: a dotted claret underline linking to its row in the ingredient list. Activating it
 * jumps to the row (the browser's own jump, so nothing animates) and moves focus to the row's button; the row is
 * highlighted while it is the link target. On touch screens the hit area grows to 44px without moving the text.
 */
export function IngredientMention({ index, children }: { index: number; children: ReactNode }) {
  return (
    <a
      href={`#ingredient-${index}`}
      onClick={() => document.getElementById(`ingredient-${index}`)?.querySelector("button")?.focus({ preventScroll: true })}
      className="relative border-b border-dotted border-(--mention-line) hover:border-solid pointer-coarse:before:absolute pointer-coarse:before:-inset-y-3 pointer-coarse:before:inset-x-0 pointer-coarse:before:content-['']"
    >
      {children}
    </a>
  );
}

/**
 * A duration in a step, set as a pill with a clock around the words as written ("12 minutes"), so the step reads and
 * copies the same as without it. Display only (a running timer is #24). Plain text in print.
 */
export function TimerChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-(--rule-hair) bg-(--timer-bg) py-[3px] pr-2.5 pl-2 text-small leading-none whitespace-nowrap text-(--timer-fg) [font-variant-numeric:lining-nums_tabular-nums] print:inline print:border-0 print:bg-transparent print:p-0 print:text-[inherit]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 print:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 1.5M9.5 2.5h5" />
      </svg>
      {children}
    </span>
  );
}
