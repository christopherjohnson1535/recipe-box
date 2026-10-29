import type { CookPlan } from "@/lib/api";
import { isValidOrder, type DishStep } from "./cook-together-logic";

/**
 * The plan as a cook-together order, or null when it does not fit this session: a recipe that is not one of `ids`, or a
 * step order that is not every step of every dish once, each dish in its own order (a recipe edited since the page
 * opened). The server checks the plan too; this is the client's own guard before it replaces the cook's order.
 */
export function planOrder(plan: CookPlan, ids: readonly string[], stepCounts: readonly number[]): DishStep[] | null {
  const order = plan.steps.map((s) => ({ dish: ids.indexOf(s.recipeId), step: s.stepIndex }));
  return isValidOrder(order, stepCounts) ? order : null;
}

/** "19:00" (a time input's value) as the next such time from `now`: today if it is still ahead, else tomorrow. Null for anything else. */
export function serveTime(value: string, now: Date): Date | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 23 || min > 59) return null;
  const at = new Date(now);
  at.setHours(h, min, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** When each step starts: the serve time less the plan's total, plus the step's offset. Null when there is no serve time or the plan is not timed. */
export function startTimes(plan: CookPlan, serveAt: Date | null): (Date | null)[] {
  const total = plan.totalMinutes;
  return plan.steps.map((s) =>
    serveAt && total !== null && s.startOffsetMin !== null ? new Date(serveAt.getTime() - (total - s.startOffsetMin) * 60_000) : null,
  );
}

/** 0 → "0 min", 45 → "45 min", 60 → "1 hr", 100 → "1 hr 40 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** A step's offset as a label: "Start" at 0, else "+25 min". */
export const offsetLabel = (minutes: number) => (minutes === 0 ? "Start" : `+${duration(minutes)}`);

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
/** "5:20 PM", in the device's own time zone and style. */
export const clockLabel = (at: Date) => clock.format(at);
