import { describe, expect, it } from "vitest";
import type { CookPlan } from "@/lib/api";
import { clockLabel, duration, offsetLabel, planOrder, serveTime, startTimes, tooLate } from "./cook-plan-logic";

const step = (recipeId: string, stepIndex: number, startOffsetMin: number | null) => ({ recipeId, stepIndex, startOffsetMin, startAt: null, note: "" });
const plan = (steps: CookPlan["steps"], totalMinutes: number | null = 100): CookPlan => ({ source: "ai", reason: null, totalMinutes, serveAt: null, steps });

describe("planOrder", () => {
  it("maps the plan onto the session's dishes", () => {
    const p = plan([step("b", 0, 0), step("a", 0, 10), step("b", 1, 20)]);
    expect(planOrder(p, ["a", "b"], [1, 2])).toEqual([
      { dish: 1, step: 0 },
      { dish: 0, step: 0 },
      { dish: 1, step: 1 },
    ]);
  });

  it("refuses a plan that does not fit: a stranger, a step missing, a recipe changed since, or out of order", () => {
    expect(planOrder(plan([step("x", 0, 0), step("a", 0, 1)]), ["a", "b"], [1, 1])).toBeNull();
    expect(planOrder(plan([step("a", 0, 0)]), ["a", "b"], [1, 1])).toBeNull();
    expect(planOrder(plan([step("a", 0, 0), step("b", 0, 1)]), ["a", "b"], [2, 1])).toBeNull();
    expect(planOrder(plan([step("a", 1, 0), step("a", 0, 1)]), ["a"], [2])).toBeNull();
  });
});

describe("serveTime", () => {
  const now = new Date("2026-10-22T12:00:00Z"); // TZ is UTC in tests
  it("is today when the time is still ahead, tomorrow when it has passed", () => {
    expect(serveTime("19:00", now)?.toISOString()).toBe("2026-10-22T19:00:00.000Z");
    expect(serveTime("11:30", now)?.toISOString()).toBe("2026-10-23T11:30:00.000Z");
    expect(serveTime("12:00", now)?.toISOString()).toBe("2026-10-23T12:00:00.000Z");
  });
  it("is null for an empty or malformed value", () => {
    for (const v of ["", "7pm", "24:00", "12:60", "1:00"]) expect(serveTime(v, now)).toBeNull();
  });
});

describe("startTimes", () => {
  it("counts back from the serve time", () => {
    const serve = new Date("2026-10-22T19:00:00Z");
    const times = startTimes(plan([step("a", 0, 0), step("b", 0, 75)], 100), serve);
    expect(times.map((t) => t?.toISOString())).toEqual(["2026-10-22T17:20:00.000Z", "2026-10-22T18:35:00.000Z"]);
  });
  it("is null without a serve time or without timing", () => {
    expect(startTimes(plan([step("a", 0, 0)]), null)).toEqual([null]);
    expect(startTimes(plan([step("a", 0, null)], null), new Date())).toEqual([null]);
  });
});

describe("labels", () => {
  it("reads durations, offsets and clock times", () => {
    expect([0, 45, 60, 100].map(duration)).toEqual(["0 min", "45 min", "1 hr", "1 hr 40 min"]);
    expect([0, 25, 90].map(offsetLabel)).toEqual(["Start", "+25 min", "+1 hr 30 min"]);
  });

  it("sets clock times in the locale's own hour cycle, as the time input does", () => {
    const at = new Date("2026-10-22T18:10:00Z");
    expect(clockLabel(at, "en-US")).toBe("6:10 PM");
    expect(clockLabel(at, "en-GB")).toBe("18:10");
    expect(clockLabel(at, "de-DE")).toBe("18:10");
    expect(clockLabel(at)).toBe("6:10 PM"); // tests run with LANG en_US, like the owner's devices
  });
});

describe("tooLate", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const p = plan([step("a", 0, 0), step("b", 0, 75)], 100);
  it("says how long ago the first start was and the soonest serve time, rounded up to 5 minutes", () => {
    const late = tooLate(p, new Date("2026-10-22T13:00:00Z"), now);
    expect(late?.minutesAgo).toBe(40);
    expect(late?.soonest.toISOString()).toBe("2026-10-22T13:40:00.000Z");
    expect(tooLate(p, new Date("2026-10-22T13:00:00Z"), new Date("2026-10-22T12:02:00Z"))?.soonest.toISOString()).toBe("2026-10-22T13:45:00.000Z");
  });
  it("is null when the first start is still ahead, or nothing is timed", () => {
    expect(tooLate(p, new Date("2026-10-22T13:40:00Z"), now)).toBeNull();
    expect(tooLate(p, null, now)).toBeNull();
    expect(tooLate(plan([step("a", 0, null)], null), new Date("2026-10-22T12:30:00Z"), now)).toBeNull();
  });
});
