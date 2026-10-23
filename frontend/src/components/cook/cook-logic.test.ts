import { describe, expect, it } from "vitest";
import {
  clampStep, formatClock, litIngredients, noTimers, parseVoice, railOrder, remainingMs, ringFraction, stepDurations,
  swipeDirection, timerReducer,
} from "./cook-logic";

const LINES = ["1 large onion, diced", "2 carrots, diced", "2 tbsp tomato paste", "2 cups dry red wine"];

describe("ingredients for a step", () => {
  it("lights the ones the step names and lists them first", () => {
    const lit = litIngredients("Cook the onion and carrots, then stir in the tomato paste.", LINES);
    expect([...lit]).toEqual([0, 1, 2]);
    expect(railOrder(4, litIngredients("Add the wine.", LINES))).toEqual([
      { index: 3, lit: true },
      { index: 0, lit: false },
      { index: 1, lit: false },
      { index: 2, lit: false },
    ]);
  });
  it("lights nothing when there are no ingredients", () => {
    expect(litIngredients("Stir.", []).size).toBe(0);
    expect(railOrder(0, new Set())).toEqual([]);
  });
});

describe("stepDurations", () => {
  it("finds written durations in seconds", () => {
    expect(stepDurations("Bake 25 minutes, rest 30 seconds.")).toEqual([
      { label: "25 minutes", seconds: 1500 },
      { label: "30 seconds", seconds: 30 },
    ]);
    expect(stepDurations("Stir well.")).toEqual([]);
  });
});

describe("swipeDirection", () => {
  it("needs a long, mostly horizontal swipe", () => {
    expect(swipeDirection(-80, 5)).toBe("next");
    expect(swipeDirection(80, -5)).toBe("back");
    expect(swipeDirection(-59, 0)).toBeNull();
    expect(swipeDirection(-80, 70)).toBeNull();
  });
  it("clamps the step", () => {
    expect(clampStep(-1, 3)).toBe(0);
    expect(clampStep(5, 3)).toBe(2);
    expect(clampStep(1, 0)).toBe(0);
  });
});

describe("timers", () => {
  it("run side by side and finish at their end time", () => {
    let s = timerReducer(noTimers, { type: "start", label: "a", seconds: 60, now: 0 });
    s = timerReducer(s, { type: "start", label: "b", seconds: 120, now: 0 });
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
  it("formats clocks", () => {
    expect(formatClock(518_000)).toBe("8:38");
    expect(formatClock(100)).toBe("0:01");
    expect(formatClock(3_900_000)).toBe("1:05:00");
  });
});

describe("parseVoice", () => {
  it("hears next, back and repeat", () => {
    expect(parseVoice("okay Next")).toBe("next");
    expect(parseVoice("go back")).toBe("back");
    expect(parseVoice("repeat that")).toBe("repeat");
    expect(parseVoice("banana")).toBeNull();
  });
});
