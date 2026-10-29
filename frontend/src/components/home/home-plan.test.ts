import { describe, expect, it } from "vitest";
import type { RecipeSummary } from "@/lib/api";
import { monthYear, planHome } from "./home-plan";

const r = (id: string, updatedAt: string, imageUrl: string | null = null): RecipeSummary => ({
  id, title: `Recipe ${id}`, description: "", totalMinutes: 30, tags: [], imageUrl, imageDisplayUrl: null, servings: null, sourceType: "manual", updatedAt, isFavourite: false,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => r(`r${String(i).padStart(2, "0")}`, `2026-0${(i % 9) + 1}-10T00:00:00Z`, null));

describe("planHome featured recipe", () => {
  it("has no featured recipe without photos, and the grid is everything", () => {
    const items = many(3);
    const plan = planHome(items);
    expect(plan.featured).toBeNull();
    expect(plan.grid).toEqual(items);
  });

  it("picks the photo recipe edited longest ago and removes it from the grid", () => {
    const items = [r("a", "2026-09-01T00:00:00Z", "/media/a.jpg"), r("b", "2025-01-01T00:00:00Z"), r("c", "2026-02-01T00:00:00Z", "/media/c.jpg")];
    const plan = planHome(items);
    expect(plan.featured?.id).toBe("c");
    expect(plan.grid.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("breaks ties by id whatever order the API used", () => {
    const a = r("a", "2026-01-01T00:00:00Z", "/media/a.jpg");
    const b = r("b", "2026-01-01T00:00:00Z", "/media/b.jpg");
    expect(planHome([a, b]).featured?.id).toBe("a");
    expect(planHome([b, a]).featured?.id).toBe("a");
  });
});

describe("planHome slicing", () => {
  it("one recipe: the featured one only, no panels", () => {
    const plan = planHome([r("a", "2026-01-01T00:00:00Z", "/media/a.jpg")]);
    expect(plan.grid).toEqual([]);
    expect(plan.more).toEqual([]);
    expect(plan.stale).toBeNull();
  });

  it("five recipes: a panel but no list", () => {
    const plan = planHome(many(5));
    expect(plan.more).toEqual([]);
    expect(plan.stale?.id).toBe("r04"); // only the fifth card is below the first screen
  });

  it("ten recipes with a featured one: five in the More to cook list after the first four cards", () => {
    const items = many(10);
    items[9] = { ...items[9], imageUrl: "/media/x.jpg", updatedAt: "2020-01-01T00:00:00Z" };
    const plan = planHome(items);
    expect(plan.featured?.id).toBe("r09");
    expect(plan.grid).toHaveLength(9);
    expect(plan.more.map((x) => x.id)).toEqual(items.slice(4, 9).map((x) => x.id));
    expect(plan.stale?.id).not.toBe("r09");
    // Chosen below the first screen: r00 is the stalest overall but is already card 1.
    expect(plan.stale?.id).toBe("r04");
  });

  it("ten recipes without a featured one: still five in the More to cook list", () => {
    expect(planHome(many(10)).more).toHaveLength(5);
  });
});

describe("monthYear", () => {
  it("formats the month and year", () => {
    expect(monthYear("2026-03-14T12:00:00Z")).toBe("March 2026");
  });
});

describe("planHome list size", () => {
  it("leaves the More to cook list out when fewer than three recipes would fill it", () => {
    expect(planHome(many(6)).more).toEqual([]); // two candidates after the first four cards
    expect(planHome(many(7)).more).toHaveLength(3);
  });
});
