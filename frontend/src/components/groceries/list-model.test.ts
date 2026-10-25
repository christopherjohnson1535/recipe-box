import { describe, expect, it } from "vitest";
import { amountsText, groupItems, itemText, toBuy, withItem } from "./list-model";
import type { GroceryItem, GroceryList } from "./types";

const item = (over: Partial<GroceryItem> & { id: string }): GroceryItem => ({
  name: over.id, amounts: [], section: "other", checked: false, manual: false, staple: false, recipeIds: [], ...over,
});
const list = (items: GroceryItem[]): GroceryList => ({ id: "g", updatedAt: "2026-01-01T00:00:00Z", recipes: [], items });

describe("amountsText", () => {
  it("joins amounts with +, in the order given", () => {
    expect(amountsText([{ quantity: "1", unit: "cup" }, { quantity: "2", unit: "tbsp" }])).toBe("1 cup + 2 tbsp");
  });
  it("handles a unit-less count, a missing quantity and no amount at all", () => {
    expect(amountsText([{ quantity: "3", unit: null }])).toBe("3");
    expect(amountsText([{ quantity: null, unit: "pinch" }])).toBe("pinch");
    expect(amountsText([])).toBe("");
  });
  it("makes word units plural past one and leaves abbreviations alone", () => {
    expect(amountsText([{ quantity: "5", unit: "clove" }])).toBe("5 cloves");
    expect(amountsText([{ quantity: "1", unit: "can" }])).toBe("1 can");
    expect(amountsText([{ quantity: "½", unit: "cup" }])).toBe("½ cup");
    expect(amountsText([{ quantity: "1½", unit: "cup" }, { quantity: "2", unit: "tbsp" }])).toBe("1½ cups + 2 tbsp");
    expect(amountsText([{ quantity: "2–3", unit: "bunch" }])).toBe("2–3 bunches");
    expect(amountsText([{ quantity: "3", unit: "lb" }])).toBe("3 lb");
  });
  it("reads a whole line", () => {
    expect(itemText(item({ id: "m", name: "milk", amounts: [{ quantity: "1", unit: "cup" }] }))).toBe("1 cup milk");
    expect(itemText(item({ id: "s", name: "salt to taste" }))).toBe("salt to taste");
  });
});

describe("groupItems", () => {
  const items = [
    item({ id: "a", name: "rice", section: "pantry" }),
    item({ id: "b", name: "onion", section: "produce" }),
    item({ id: "c", name: "beef", section: "meat" }),
    item({ id: "d", name: "tape", section: "other" }),
  ];

  it("lists only the sections that have items, in store order", () => {
    expect(groupItems(items, true).map((g) => g.label)).toEqual(["Produce", "Meat", "Pantry", "Other"]);
  });

  it("puts ticked items at the bottom of their section, keeping the order otherwise", () => {
    const produce = [
      item({ id: "1", name: "apple", section: "produce", checked: true }),
      item({ id: "2", name: "beet", section: "produce" }),
      item({ id: "3", name: "carrot", section: "produce", checked: true }),
      item({ id: "4", name: "dill", section: "produce" }),
    ];
    const [group] = groupItems(produce, true);
    expect(group.items.map((i) => i.name)).toEqual(["beet", "dill", "apple", "carrot"]);
    expect(group.left).toBe(2);
  });

  it("keeps an item that is being crossed off where it is until it is released", () => {
    const two = [item({ id: "1", name: "apple", section: "produce", checked: true }), item({ id: "2", name: "beet", section: "produce" })];
    expect(groupItems(two, true, new Set(["1"]))[0].items.map((i) => i.name)).toEqual(["apple", "beet"]);
    expect(groupItems(two, true)[0].items.map((i) => i.name)).toEqual(["beet", "apple"]);
  });

  it("hides staples unless asked, and drops a section that only had staples", () => {
    const withStaple = [item({ id: "s", name: "salt", section: "pantry", staple: true }), item({ id: "o", name: "onion", section: "produce" })];
    expect(groupItems(withStaple, false).map((g) => g.label)).toEqual(["Produce"]);
    expect(groupItems(withStaple, true).map((g) => g.label)).toEqual(["Produce", "Pantry"]);
  });
});

describe("withItem and toBuy", () => {
  it("inserts in store order, then by name, and replaces by id", () => {
    const base = list([item({ id: "a", name: "onion", section: "produce" }), item({ id: "b", name: "rice", section: "pantry" })]);
    const added = withItem(base, item({ id: "c", name: "apple", section: "produce" }));
    expect(added.items.map((i) => i.name)).toEqual(["apple", "onion", "rice"]);
    const moved = withItem(added, { ...added.items[0], section: "pantry" });
    expect(moved.items.map((i) => i.name)).toEqual(["onion", "apple", "rice"]);
  });

  it("counts unticked, non-staple items", () => {
    expect(toBuy(list([item({ id: "a" }), item({ id: "b", checked: true }), item({ id: "c", staple: true }), item({ id: "d" })]))).toBe(2);
  });
});
