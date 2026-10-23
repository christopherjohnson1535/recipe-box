import { describe, expect, it } from "vitest";
import type { RecipeSummary } from "@/lib/api";
import { issueLine, longDate, monthYear, planHome, seasonOf, toRoman, volumeOf } from "./issue";

const r = (id: string, updatedAt: string, imageUrl: string | null = null): RecipeSummary => ({
  id, title: `Recipe ${id}`, description: "", totalMinutes: 30, tags: [], imageUrl, sourceType: "manual", updatedAt,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => r(`r${String(i).padStart(2, "0")}`, `2026-0${(i % 9) + 1}-10T00:00:00Z`, null));

describe("planHome cover", () => {
  it("has no cover without photos, and the grid is everything", () => {
    const items = many(3);
    const plan = planHome(items);
    expect(plan.cover).toBeNull();
    expect(plan.grid).toEqual(items);
  });

  it("picks the photo recipe edited longest ago and removes it from the grid", () => {
    const items = [r("a", "2026-09-01T00:00:00Z", "/media/a.jpg"), r("b", "2025-01-01T00:00:00Z"), r("c", "2026-02-01T00:00:00Z", "/media/c.jpg")];
    const plan = planHome(items);
    expect(plan.cover?.id).toBe("c");
    expect(plan.grid.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("breaks ties by id whatever order the API used", () => {
    const a = r("a", "2026-01-01T00:00:00Z", "/media/a.jpg");
    const b = r("b", "2026-01-01T00:00:00Z", "/media/b.jpg");
    expect(planHome([a, b]).cover?.id).toBe("a");
    expect(planHome([b, a]).cover?.id).toBe("a");
  });
});

describe("planHome slicing", () => {
  it("one recipe: cover only, no panels", () => {
    const plan = planHome([r("a", "2026-01-01T00:00:00Z", "/media/a.jpg")]);
    expect(plan.grid).toEqual([]);
    expect(plan.index).toEqual([]);
    expect(plan.stale).toBeNull();
  });

  it("five recipes: a panel but no index", () => {
    const plan = planHome(many(5));
    expect(plan.index).toEqual([]);
    expect(plan.stale?.id).toBe("r04"); // only the fifth card is below the first screen
  });

  it("ten recipes with a cover: five in the index after the first four cards", () => {
    const items = many(10);
    items[9] = { ...items[9], imageUrl: "/media/x.jpg", updatedAt: "2020-01-01T00:00:00Z" };
    const plan = planHome(items);
    expect(plan.cover?.id).toBe("r09");
    expect(plan.grid).toHaveLength(9);
    expect(plan.index.map((x) => x.id)).toEqual(items.slice(4, 9).map((x) => x.id));
    expect(plan.stale?.id).not.toBe("r09");
    // Chosen below the first screen: r00 is the stalest overall but is already card 1.
    expect(plan.stale?.id).toBe("r04");
  });

  it("ten recipes without a cover: still five in the index", () => {
    expect(planHome(many(10)).index).toHaveLength(5);
  });
});

describe("season and volume", () => {
  it.each([
    [new Date(2026, 1, 28), "Winter"],
    [new Date(2026, 2, 1), "Spring"],
    [new Date(2026, 4, 31), "Spring"],
    [new Date(2026, 5, 1), "Summer"],
    [new Date(2026, 7, 31), "Summer"],
    [new Date(2026, 8, 1), "Autumn"],
    [new Date(2026, 10, 30), "Autumn"],
    [new Date(2026, 11, 1), "Winter"],
    [new Date(2026, 0, 1), "Winter"],
  ])("%s is %s", (date, season) => expect(seasonOf(date)).toBe(season));

  it("writes roman numerals 1 to 20", () => {
    expect(Array.from({ length: 20 }, (_, i) => toRoman(i + 1))).toEqual([
      "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX",
    ]);
    expect(toRoman(0)).toBe("I");
  });

  it("counts whole years since the oldest edit, starting at volume 1", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(volumeOf([], now)).toBe(1);
    expect(volumeOf([r("a", "2026-01-01T00:00:00Z")], now)).toBe(1);
    expect(volumeOf([r("a", "2025-10-01T00:00:00Z"), r("b", "2026-01-01T00:00:00Z")], now)).toBe(2);
    expect(volumeOf([r("a", "2023-10-01T00:00:00Z")], now)).toBe(4);
  });
});

describe("issue line", () => {
  it("formats the date, season name and numbers", () => {
    const now = new Date(2026, 9, 23, 12);
    expect(longDate(now)).toBe("Friday, October 23, 2026");
    expect(issueLine([r("a", "2025-09-01T00:00:00Z")], 47, now)).toEqual({
      volume: "II", number: 47, name: "The Autumn Issue", date: "Friday, October 23, 2026", dateTime: "2026-10-23",
    });
    expect(monthYear("2026-03-14T12:00:00Z")).toBe("March 2026");
  });
});
