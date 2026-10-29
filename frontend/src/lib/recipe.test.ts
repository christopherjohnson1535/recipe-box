import { describe, expect, it } from "vitest";
import { formatMinutes, groupBySection, servingsLabel, minuteNumeral, typographic } from "./recipe";

describe("recipe helpers", () => {
  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(75)).toBe("1 hr 15 min");
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(0)).toBeNull();
  });

  it("labels servings", () => {
    for (const s of ["4", "4-6", "4–6", "4 to 6", "1/2", "1½"]) expect(servingsLabel(s)).toBe(`Serves ${s}`);
    expect(servingsLabel(" 4-6 ")).toBe("Serves 4-6");
  });

  it("shows servings with words as written", () => {
    for (const s of ["4 cups", "6 cloves", "12 bars", "Serves 4", "makes 12 cookies", "makes about 4 bowls"]) {
      expect(servingsLabel(s)).toBe(s);
    }
    expect(servingsLabel("  makes 12 cookies ")).toBe("makes 12 cookies");
  });

  it("gives no label for nothing", () => {
    expect(servingsLabel("")).toBeNull();
    expect(servingsLabel("   ")).toBeNull();
    expect(servingsLabel(null)).toBeNull();
    expect(servingsLabel(undefined)).toBeNull();
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
