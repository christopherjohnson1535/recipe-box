import { describe, expect, it } from "vitest";
import { formatMinutes, groupBySection, servingsLabel, minuteNumeral, splitDurations, typographic } from "./recipe";

describe("recipe helpers", () => {
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(75)).toBe("1 hr 15 min");
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
  });

  it("labels servings", () => {
    expect(servingsLabel("4")).toBe("Serves 4");
    expect(servingsLabel(" 4-6 ")).toBe("Serves 4-6");
    expect(servingsLabel("makes about 4 bowls")).toBe("makes about 4 bowls");
    expect(servingsLabel("")).toBeNull();
    expect(servingsLabel("   ")).toBeNull();
    expect(servingsLabel(null)).toBeNull();
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
    expect(minuteNumeral(20)).toEqual([{ value: "20", unit: "min" }]);
    expect(minuteNumeral(180)).toEqual([{ value: "3", unit: "hr" }]);
    expect(minuteNumeral(200)).toEqual([
      { value: "3", unit: "hr" },
      { value: "20", unit: "min" },
    ]);
    expect(minuteNumeral(65)).toEqual([
      { value: "1", unit: "hr" },
      { value: "5", unit: "min" },
    ]);
    expect(minuteNumeral(0)).toBeNull();
    expect(minuteNumeral(null)).toBeNull();
  });
});

describe("splitDurations", () => {
  const timers = (text: string) => splitDurations(text).filter((s) => s.minutes !== null).map((s) => [s.text, s.minutes]);

  it.each([
    ["Simmer 12 minutes.", "12 minutes", 12],
    ["Cook 25 mins", "25 mins", 25],
    ["Rest for 1 hour.", "1 hour", 60],
    ["Braise 1½ hours", "1½ hours", 90],
    ["Braise 1 1/2 hours", "1 1/2 hours", 90],
    ["Bake 10-12 minutes", "10-12 minutes", 10],
    ["Bake 10–12 minutes", "10–12 minutes", 10],
    ["Chill 2 to 3 hours", "2 to 3 hours", 120],
    ["Blanch 45 seconds", "45 seconds", 0.75],
    ["Roast 1 hour 30 minutes", "1 hour 30 minutes", 90],
    ["Roast 1 hour and 15 minutes", "1 hour and 15 minutes", 75],
    ["Simmer ½ hour", "½ hour", 30],
  ])("finds the duration in %j", (text, found, minutes) => {
    expect(timers(text)).toEqual([[found, minutes]]);
  });

  it("keeps the text around durations, in order", () => {
    const parts = splitDurations("Cook 5 minutes, then rest 10 minutes.");
    expect(parts.map((p) => p.text).join("")).toBe("Cook 5 minutes, then rest 10 minutes.");
    expect(parts.map((p) => p.minutes)).toEqual([null, 5, null, 10, null]);
  });

  it("has no false positives", () => {
    expect(splitDurations("Heat the oven to 350°F and add 2 cups of stock.")).toEqual([
      { text: "Heat the oven to 350°F and add 2 cups of stock.", minutes: null },
    ]);
    expect(timers("Add 2 minced cloves and 3 tablespoons of oil")).toEqual([]);
    expect(timers("Use a 9x13 pan, v1.5 hours")).toEqual([]);
    expect(splitDurations("")).toEqual([]);
  });
});

describe("typographic", () => {
  it("curls apostrophes between letters only", () => {
    expect(typographic("Grandma's soup")).toBe("Grandma\u2019s soup");
    expect(typographic("'quoted'")).toBe("'quoted'");
  });
});

describe("plateSrc", () => {
  it("prefers the display rendition and falls back to the original", async () => {
    const { plateSrc } = await import("./recipe");
    expect(plateSrc({ imageUrl: "/media/a.jpg", imageDisplayUrl: "/media/a-plate.jpg" })).toBe("/media/a-plate.jpg");
    expect(plateSrc({ imageUrl: "/media/a.jpg", imageDisplayUrl: null })).toBe("/media/a.jpg");
    expect(plateSrc({ imageUrl: null, imageDisplayUrl: null })).toBeNull();
  });
});
