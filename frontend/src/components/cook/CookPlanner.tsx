"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { CookPlanList, CookPlanPanel, CookPlanRow, CookPlanSummary, CookServeAt, CookTextButton } from "@/components/ui/CookKit";
import { Pending } from "@/components/ui/Pending";
import type { CookPlan } from "@/lib/api";
import { clockLabel, duration, offsetLabel, serveTime, startTimes, tooLate } from "./cook-plan-logic";
import { ordinal } from "./cook-together-logic";
import type { PlanState } from "./use-cook-plan";

const and = new Intl.ListFormat("en", { type: "conjunction" });

type Props = {
  state: Exclude<PlanState, { status: "closed" }>;
  /** The session's recipe ids, in dish order. */
  ids: readonly string[];
  names: readonly string[];
  mark: (dish: number) => ReactNode;
  stepText: (dish: number, step: number) => string;
  onRetry: () => void;
  /** "Serve at" as typed ("19:00", or "" for none); the cook-together screen keeps it so it survives a retry. */
  serveAt: string;
  onServeAt: (value: string) => void;
};

/** The preview of a suggested order: loading, failed, or the plan with its timing. Accepting it is the footer's job. */
export function CookPlanner({ state, ids, names, mark, stepText, onRetry, serveAt, onServeAt }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  // The clock is read when the panel opens and when the serve time changes, not on every render: the times stay put while the cook reads them.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [state.status]);

  if (state.status === "loading") {
    return (
      <CookPlanPanel headingRef={heading}>
        <Pending>Working out an order for {and.format(names)}. This can take up to a minute.</Pending>
      </CookPlanPanel>
    );
  }
  if (state.status === "error") {
    return (
      <CookPlanPanel headingRef={heading}>
        <Alert tone="error" title="No plan this time">
          {state.message}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <CookTextButton onClick={onRetry}>Try again</CookTextButton>
        </div>
      </CookPlanPanel>
    );
  }

  const plan: CookPlan = state.plan;
  const timed = plan.source === "ai" && plan.totalMinutes !== null;
  const serve = timed ? serveTime(serveAt, now) : null;
  const starts = startTimes(plan, serve);
  const first = starts[0];
  const late = tooLate(plan, serve, now);
  const summary = !timed
    ? plan.reason ?? "The dishes take turns, one step each."
    : late
      ? `That start was ${duration(late.minutesAgo)} ago. The soonest you can serve is ${clockLabel(late.soonest)}.`
      : serve && first
        ? `Start at ${clockLabel(first)} to serve at ${clockLabel(serve)}.`
        : `Ready to serve ${duration(plan.totalMinutes ?? 0)} after you start.`;

  return (
    <CookPlanPanel
      headingRef={heading}
      controls={
        timed ? (
          <CookServeAt
            value={serveAt}
            onChange={(v) => {
              setNow(new Date());
              onServeAt(v);
            }}
            hint={serve ? "Each step shows the time to start it." : "Optional. Without it, each step shows minutes from the start."}
          />
        ) : undefined
      }
    >
      <CookPlanSummary warn={late !== null}>{summary}</CookPlanSummary>
      <CookPlanList label="Suggested order">
        {plan.steps.map((s, i) => {
          const dish = ids.indexOf(s.recipeId);
          const at = starts[i];
          const time = at ? clockLabel(at) : s.startOffsetMin !== null && timed ? offsetLabel(s.startOffsetMin) : ordinal(i + 1);
          return (
            <CookPlanRow key={`${s.recipeId}:${s.stepIndex}`} index={i} time={time} mark={mark(dish)} note={s.note || undefined}>
              <span className="sr-only">{`${names[dish]} step ${s.stepIndex + 1}: `}</span>
              {stepText(dish, s.stepIndex)}
            </CookPlanRow>
          );
        })}
      </CookPlanList>
    </CookPlanPanel>
  );
}
