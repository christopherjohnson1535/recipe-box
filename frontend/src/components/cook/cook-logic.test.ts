import { describe, expect, it } from "vitest";
import {
  clampStep, cookParts, formatClock, litIngredients, noTimers, parseVoice, railOrder, remainingMs, ringFraction, stepDurations,
  swipeDirection, timerReducer, noTicks, parseTicks, serialiseTicks, ticksStale, toggled, TICKS_TTL_MS,
} from "./cook-logic";

const LINES = ["1 large onion, diced", "2 carrots, diced", "2 tbsp tomato paste", "2 cups dry red wine"];

describe("ingredients for a step", () => {
  it("lights the first word of a two-word name when the step says only that", () => {
    const lines = ["4 garlic cloves, smashed", "2 cups dry red wine", "1 tbsp olive oil"];
    const step = "Add the garlic and cook 1 minute.";
    expect([...litIngredients(step, lines)]).toEqual([0]);
    expect(cookParts(step, lines).filter((p) => p.kind === "ingredient").map((p) => p.text)).toEqual(["garlic"]);
    expect([...litIngredients("Add the dry olive thing.", lines)]).toEqual([]);
  });
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
    expect(parseVoice("next step")).toBe("next");
  });
  it("ignores kitchen talk that happens to contain a command word", () => {
    expect(parseVoice("put the lid back")).toBeNull();
    expect(parseVoice("stir it next to the pot")).toBeNull();
    expect(parseVoice("is it done, repeat")).toBeNull();
  });
});

describe("ticks", () => {
  const counts = { ingredients: 3, steps: 2 };
  const NOW = 1_000_000_000;

  it("round-trips, sorted", () => {
    const raw = serialiseTicks({ ingredients: new Set([2, 0]), steps: new Set([1]) }, NOW);
    expect(JSON.parse(raw)).toEqual({ v: 1, at: NOW, ingredients: [0, 2], steps: [1] });
    expect(parseTicks(raw, counts)).toEqual({ ingredients: new Set([0, 2]), steps: new Set([1]) });
  });

  it("drops indexes outside the recipe and non-integers", () => {
    const raw = JSON.stringify({ v: 1, at: NOW, ingredients: [0, 3, -1, 1.5, "1"], steps: [5, 1] });
    expect(parseTicks(raw, counts)).toEqual({ ingredients: new Set([0]), steps: new Set([1]) });
  });

  it("treats missing, corrupt and other-version text as nothing ticked", () => {
    for (const raw of [null, "", "{", "[]", "3", '{"v":2,"at":1}', '{"v":1}']) expect(parseTicks(raw, counts)).toBe(noTicks);
  });

  it("goes stale after 12 hours without a change", () => {
    const raw = serialiseTicks(noTicks, NOW);
    expect(ticksStale(raw, NOW + TICKS_TTL_MS - 1)).toBe(false);
    expect(ticksStale(raw, NOW + TICKS_TTL_MS)).toBe(true);
    expect(ticksStale("{", NOW)).toBe(true);
    expect(ticksStale(raw, NOW - 1)).toBe(true); // dated in the future (a clock that was wrong)
  });

  it("toggles without changing the original", () => {
    const a = new Set([1]);
    expect(toggled(a, 2)).toEqual(new Set([1, 2]));
    expect(toggled(a, 1)).toEqual(new Set());
    expect(a).toEqual(new Set([1]));
  });
});
