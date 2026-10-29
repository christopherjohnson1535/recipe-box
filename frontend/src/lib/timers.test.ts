import { describe, expect, it } from "vitest";
import { formatClock, noTimers, rackOrder, remainingMs, ringFraction, splitDurations, stepDurations, timerLabel, timerReducer, type TimerState } from "./timers";

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
    ["Whisk a minute and a half", "a minute and a half", 90],
    ["Whisk 2 minutes and a half", "2 minutes and a half", 150],
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
    "Cook 0 minutes more.",
    "Rest 0.001 seconds",
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
    expect(timerLabel(1, "10-12 minutes", 600)).toBe("Step 1 · 10–12 min");
    expect(timerLabel(1, "4 to 5 minutes", 240)).toBe("Step 1 · 4–5 min");
    expect(timerLabel(1, "1 hour and 15 minutes", 4500)).toBe("Step 1 · 1 hr 15 min");
    expect(timerLabel(1, "10-minute", 600)).toBe("Step 1 · 10 min");
    expect(timerLabel(1, "1½ hours", 5400)).toBe("Step 1 · 1½ hr");
  });
  it("tells apart two chips with the same time in one step", () => {
    expect(timerLabel(1, "3 minutes", 180, undefined, "2nd")).toBe("Step 1 · 3 min (2nd)");
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
    expect(again.timers).toEqual([{ id: 2, key: "a", label: "a", totalMs: 60_000, endsAt: 130_000, done: false, pausedLeftMs: null }]);
  });
});

describe("timerReducer pause and +1 minute", () => {
  const start = (seconds: number, now = 0) => timerReducer(noTimers, { type: "start", key: "a", label: "a", seconds, now });
  const act = (s: TimerState, type: "pause" | "resume" | "addMinute", now: number, id = 1) => timerReducer(s, { type, id, now });

  it("keeps the time left exactly across a pause of any length", () => {
    const paused = act(start(600), "pause", 125_250);
    expect(paused.timers[0].pausedLeftMs).toBe(474_750);
    expect(remainingMs(paused.timers[0], 125_250)).toBe(474_750);
    expect(remainingMs(paused.timers[0], 9_999_999)).toBe(474_750);
    expect(ringFraction(paused.timers[0], 9_999_999)).toBeCloseTo(474_750 / 600_000);
    const resumed = act(paused, "resume", 7_000_000);
    expect(resumed.timers[0]).toMatchObject({ pausedLeftMs: null, endsAt: 7_474_750, done: false });
    expect(remainingMs(resumed.timers[0], 7_000_000)).toBe(474_750);
  });

  it("never finishes a paused timer on a tick, and finishes it normally after it resumes", () => {
    const paused = act(start(60), "pause", 10_000);
    expect(timerReducer(paused, { type: "tick", now: 3_600_000 })).toBe(paused);
    const resumed = act(paused, "resume", 3_600_000);
    expect(timerReducer(resumed, { type: "tick", now: 3_649_999 })).toBe(resumed);
    expect(timerReducer(resumed, { type: "tick", now: 3_650_000 }).timers[0].done).toBe(true);
  });

  it("ignores pause on a finished, paused or about-to-finish timer, resume on one not paused, and unknown ids", () => {
    const running = start(60);
    const done = timerReducer(running, { type: "tick", now: 60_000 });
    const paused = act(running, "pause", 1000);
    expect(act(done, "pause", 61_000)).toBe(done);
    expect(act(paused, "pause", 2000)).toBe(paused);
    expect(act(running, "pause", 60_000)).toBe(running);
    expect(act(running, "resume", 1000)).toBe(running);
    expect(act(done, "resume", 61_000)).toBe(done);
    expect(act(running, "pause", 1000, 9)).toBe(running);
    expect(act(running, "addMinute", 1000, 9)).toBe(running);
  });

  it("adds a minute to a running timer, and to the ring's total so the ring stays in proportion", () => {
    const s = act(start(60), "addMinute", 30_000);
    expect(s.timers[0]).toMatchObject({ endsAt: 120_000, totalMs: 120_000, done: false });
    expect(remainingMs(s.timers[0], 30_000)).toBe(90_000);
    expect(ringFraction(s.timers[0], 30_000)).toBeCloseTo(0.75);
    // Past its end time but not ticked yet: a whole minute from now.
    expect(act(start(60), "addMinute", 61_000).timers[0].endsAt).toBe(121_000);
  });

  it("adds a minute to a paused timer without resuming it", () => {
    const s = act(act(start(60), "pause", 20_000), "addMinute", 500_000);
    expect(s.timers[0]).toMatchObject({ pausedLeftMs: 100_000, totalMs: 120_000, done: false });
    expect(remainingMs(s.timers[0], 900_000)).toBe(100_000);
    expect(timerReducer(s, { type: "tick", now: 900_000 })).toBe(s);
  });

  it("runs a finished timer again for one minute, and it can finish again", () => {
    const done = timerReducer(start(60), { type: "tick", now: 70_000 });
    const again = act(done, "addMinute", 100_000);
    expect(again.timers[0]).toMatchObject({ id: 1, key: "a", done: false, endsAt: 160_000, totalMs: 60_000, pausedLeftMs: null });
    expect(ringFraction(again.timers[0], 100_000)).toBe(1);
    expect(timerReducer(again, { type: "tick", now: 160_000 }).timers[0].done).toBe(true);
  });

  it("starting a chip whose timer is paused does nothing", () => {
    const paused = act(start(60), "pause", 1000);
    expect(timerReducer(paused, { type: "start", key: "a", label: "a", seconds: 60, now: 2000 })).toBe(paused);
  });
});

describe("rackOrder", () => {
  const t = (id: number, endsAt: number, done = false, pausedLeftMs: number | null = null) => ({ id, key: `k${id}`, label: `t${id}`, totalMs: 1, endsAt, done, pausedLeftMs });
  const ids = (timers: ReturnType<typeof t>[], now: number) => rackOrder(timers, now).map((x) => x.id);

  it("puts finished timers first, then the others by the time left", () => {
    expect(ids([t(1, 900), t(2, 300), t(3, 500, true), t(4, 100, true)], 0)).toEqual([4, 3, 2, 1]);
  });

  it("puts paused timers among the running ones by the time they hold, ignoring their stale end time", () => {
    // At 100: 2 has 800 left, 4 holds 1000, 1 holds 5000. 4's end time (20) is the earliest of all and must not decide.
    expect(ids([t(1, 10, false, 5000), t(2, 900), t(3, 500, true), t(4, 20, false, 1000)], 100)).toEqual([3, 2, 4, 1]);
  });

  it("does not move a timer when it is paused or resumed", () => {
    const now = 1000;
    const before = [t(1, now + 5000), t(2, now + 9000), t(3, now + 7000)];
    const order = ids(before, now);
    expect(order).toEqual([1, 3, 2]);
    let state: TimerState = { nextId: 4, timers: before };
    state = timerReducer(state, { type: "pause", id: 3, now });
    expect(ids(state.timers, now)).toEqual(order);
    state = timerReducer(state, { type: "resume", id: 3, now });
    expect(ids(state.timers, now)).toEqual(order);
  });

  it("breaks ties by id", () => {
    expect(ids([t(2, 500), t(1, 500, false, null), t(3, 100, false, 400)], 100)).toEqual([1, 2, 3]);
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
