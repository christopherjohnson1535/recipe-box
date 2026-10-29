import { describe, expect, it } from "vitest";
import { formatClock, noTimers, remainingMs, ringFraction, splitDurations, stepDurations, timerLabel, timerReducer } from "./timers";

const found = (text: string) => stepDurations(text).map((d) => [d.label, d.seconds]);

describe("splitDurations: what counts as a time", () => {
  it.each([
    ["Simmer 12 minutes.", "12 minutes", 720],
    ["Cook 25 mins", "25 mins", 1500],
    ["Cook 8 min", "8 min", 480],
    ["Rest for 1 hour.", "1 hour", 3600],
    ["Bake 3h, then rest", "3h", 10_800],
    ["Braise 1½ hours", "1½ hours", 5400],
    ["Braise 1 1/2 hours", "1 1/2 hours", 5400],
    ["Braise 1.5 hrs", "1.5 hrs", 5400],
    ["Simmer ½ hour", "½ hour", 1800],
    ["Blanch 45 seconds", "45 seconds", 45],
    ["Toast 30 secs", "30 secs", 30],
    ["Roast 1 hour 30 minutes", "1 hour 30 minutes", 5400],
    ["Roast 1 hour and 15 minutes", "1 hour and 15 minutes", 4500],
    ["Roast 1 hr 5 min", "1 hr 5 min", 3900],
    ["Whisk 2 minutes 30 seconds", "2 minutes 30 seconds", 150],
    ["Simmer for twenty-five minutes", "twenty-five minutes", 1500],
    ["Ten minutes later, stir.", "Ten minutes", 600],
    ["Rest half an hour", "half an hour", 1800],
    ["Wait half a minute", "half a minute", 30],
    ["Braise an hour and a half", "an hour and a half", 5400],
    ["Cook 1 and a half hours", "1 and a half hours", 5400],
    ["Stir for a minute", "a minute", 60],
    ["Give it a 10-minute rest", "10-minute", 600],
  ])("finds %j", (text, label, seconds) => {
    expect(found(text)).toEqual([[label, seconds]]);
  });

  it.each([
    ["Bake 10-12 minutes", "10-12 minutes"],
    ["Bake 10–12 minutes", "10–12 minutes"],
    ["Bake 10 to 12 minutes", "10 to 12 minutes"],
    ["Bake 10 or 12 minutes", "10 or 12 minutes"],
  ])("takes the start of a range, %j: the cook checks at the earliest time written", (text, label) => {
    expect(found(text)).toEqual([[label, 600]]);
  });

  it("finds every time in a step, in order", () => {
    expect(found("Sear 3 minutes a side, then roast 2 to 3 hours and rest 15 min.")).toEqual([
      ["3 minutes", 180],
      ["2 to 3 hours", 7200],
      ["15 min", 900],
    ]);
  });

  it("keeps the text around durations, in order", () => {
    const parts = splitDurations("Cook 5 minutes, then rest 10 minutes.");
    expect(parts.map((p) => p.text).join("")).toBe("Cook 5 minutes, then rest 10 minutes.");
    expect(parts.map((p) => p.seconds)).toEqual([null, 300, null, 600, null]);
  });

  it.each([
    "Heat the oven to 350°F and add 2 cups of stock.",
    "Add 2 minced cloves and 3 tablespoons of oil",
    "Use a 9x13 pan, v1.5 hours",
    "Add a second egg.",
    "Cook a few minutes, until golden.",
    "4 hot dogs, 2 hamburgers",
    "Stir in the minced garlic.",
    "Serve within the hour.",
    "",
  ])("finds no time in %j", (text) => {
    expect(found(text)).toEqual([]);
  });

  it("keeps a sentence with a rejected 'a second' whole", () => {
    expect(splitDurations("Add a second egg, then cook 2 minutes.")).toEqual([
      { text: "Add a second egg, then cook ", seconds: null },
      { text: "2 minutes", seconds: 120 },
      { text: ".", seconds: null },
    ]);
  });
});

describe("timerLabel", () => {
  it("shortens units and names the dish first when cooking together", () => {
    expect(timerLabel(2, "12 minutes", 720)).toBe("Step 2 · 12 min");
    expect(timerLabel(1, "1 hour 30 minutes", 5400, "Ragu")).toBe("Ragu · Step 1 · 1 hr 30 min");
    expect(timerLabel(3, "45 seconds", 45)).toBe("Step 3 · 45 sec");
    expect(timerLabel(1, "10-12 minutes", 600)).toBe("Step 1 · 10-12 min");
  });
  it("sets a time written in words from its length", () => {
    expect(timerLabel(2, "half an hour", 1800)).toBe("Step 2 · 30 min");
    expect(timerLabel(1, "an hour and a half", 5400)).toBe("Step 1 · 1 hr 30 min");
    expect(timerLabel(1, "Ten minutes", 600)).toBe("Step 1 · 10 min");
  });
});

describe("timerReducer", () => {
  const start = (key: string, seconds: number, now: number) => ({ type: "start" as const, key, label: key, seconds, now });

  it("runs timers side by side and finishes each at its end time", () => {
    let s = timerReducer(noTimers, start("a", 60, 0));
    s = timerReducer(s, start("b", 120, 0));
    expect(s.timers.map((t) => t.id)).toEqual([1, 2]);
    expect(timerReducer(s, { type: "tick", now: 59_999 })).toBe(s);
    s = timerReducer(s, { type: "tick", now: 60_000 });
    expect(s.timers.map((t) => t.done)).toEqual([true, false]);
    expect(remainingMs(s.timers[0], 70_000)).toBe(0);
    expect(remainingMs(s.timers[1], 30_000)).toBe(90_000);
    expect(ringFraction(s.timers[1], 30_000)).toBeCloseTo(0.75);
    s = timerReducer(s, { type: "dismiss", id: 1 });
    expect(s.timers.map((t) => t.id)).toEqual([2]);
  });

  it("keeps time from the end time, so a late tick (a sleeping tab) finishes it at once", () => {
    const s = timerReducer(timerReducer(noTimers, start("a", 60, 0)), { type: "tick", now: 3_600_000 });
    expect(s.timers[0].done).toBe(true);
  });

  it("starts a chip once while its timer runs, and again once it has finished", () => {
    const s = timerReducer(noTimers, start("a", 60, 0));
    expect(timerReducer(s, start("a", 60, 10_000))).toBe(s);
    const done = timerReducer(s, { type: "tick", now: 60_000 });
    const again = timerReducer(done, start("a", 60, 70_000));
    expect(again.timers).toEqual([{ id: 2, key: "a", label: "a", totalMs: 60_000, endsAt: 130_000, done: false }]);
  });
});

describe("formatClock", () => {
  it("rounds up so a running timer never shows 0:00", () => {
    expect(formatClock(518_000)).toBe("8:38");
    expect(formatClock(100)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(3_900_000)).toBe("1:05:00");
  });
});
