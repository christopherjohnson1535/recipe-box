import { describe, expect, it } from "vitest";
import { formatMinutes, groupBySection, minuteNumeral, splitDurations } from "./recipe";

describe("recipe helpers", () => {
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(75)).toBe("1 hr 15 min");
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
  });

  it("groups consecutive sections", () => {
    const groups = groupBySection([
      { text: "a", section: "Dough" },
      { text: "b", section: "Dough" },
      { text: "c", section: null },
    ]);
    expect(groups.map((g) => [g.section, g.items.length])).toEqual([
      ["Dough", 2],
      [null, 1],
    ]);
  });
});

describe("minuteNumeral", () => {
  it("sets minutes, hours and h:mm", () => {
    expect(minuteNumeral(20)).toEqual({ value: "20", unit: "min" });
    expect(minuteNumeral(180)).toEqual({ value: "3", unit: "hr" });
    expect(minuteNumeral(200)).toEqual({ value: "3:20", unit: "hr" });
    expect(minuteNumeral(65)).toEqual({ value: "1:05", unit: "hr" });
    expect(minuteNumeral(0)).toBeNull();
    expect(minuteNumeral(null)).toBeNull();
  });
});

describe("splitDurations", () => {
  const timers = (text: string) => splitDurations(text).filter((s) => s.minutes !== null).map((s) => [s.text, s.minutes, s.label]);

  it.each([
    ["Simmer 12 minutes.", "12 minutes", 12, "12 min"],
    ["Cook 25 mins", "25 mins", 25, "25 min"],
    ["Rest for 1 hour.", "1 hour", 60, "1 hr"],
    ["Braise 1½ hours", "1½ hours", 90, "1 hr 30 min"],
    ["Braise 1 1/2 hours", "1 1/2 hours", 90, "1 hr 30 min"],
    ["Bake 10-12 minutes", "10-12 minutes", 10, "10–12 min"],
    ["Bake 10–12 minutes", "10–12 minutes", 10, "10–12 min"],
    ["Chill 2 to 3 hours", "2 to 3 hours", 120, "2–3 hr"],
    ["Blanch 45 seconds", "45 seconds", 0.75, "45 sec"],
    ["Roast 1 hour 30 minutes", "1 hour 30 minutes", 90, "1 hr 30 min"],
    ["Roast 1 hour and 15 minutes", "1 hour and 15 minutes", 75, "1 hr 15 min"],
    ["Simmer ½ hour", "½ hour", 30, "30 min"],
  ])("finds the duration in %j", (text, found, minutes, label) => {
    expect(timers(text)).toEqual([[found, minutes, label]]);
  });

  it("keeps the text around durations, in order", () => {
    const parts = splitDurations("Cook 5 minutes, then rest 10 minutes.");
    expect(parts.map((p) => p.text).join("")).toBe("Cook 5 minutes, then rest 10 minutes.");
    expect(parts.map((p) => p.minutes)).toEqual([null, 5, null, 10, null]);
  });

  it("has no false positives", () => {
    expect(splitDurations("Heat the oven to 350°F and add 2 cups of stock.")).toEqual([
      { text: "Heat the oven to 350°F and add 2 cups of stock.", minutes: null, label: null },
    ]);
    expect(timers("Add 2 minced cloves and 3 tablespoons of oil")).toEqual([]);
    expect(timers("Use a 9x13 pan, v1.5 hours")).toEqual([]);
    expect(splitDurations("")).toEqual([]);
  });
});
