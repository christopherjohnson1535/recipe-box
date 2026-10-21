import { describe, expect, it } from "vitest";
import { formatMinutes, groupBySection } from "./recipe";

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
