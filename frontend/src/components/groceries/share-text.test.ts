import { describe, expect, it } from "vitest";
import { groceryShareText } from "./share-text";
import type { GroceryItem, GroceryList } from "./types";

const item = (over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem => ({
  amounts: [], section: "other", checked: false, manual: false, staple: false, recipeIds: [], ...over,
});
const list = (items: GroceryItem[]): GroceryList => ({ id: "g1", updatedAt: "2026-01-01T00:00:00Z", recipes: [], items });

describe("groceryShareText", () => {
  it("sets a title, then each section in store order with its items", () => {
    const text = groceryShareText(
      list([
        item({ id: "1", name: "paper towels" }),
        item({ id: "2", name: "milk", section: "fridge", amounts: [{ quantity: "1", unit: "cup" }, { quantity: "2", unit: "tbsp" }] }),
        item({ id: "3", name: "garlic", section: "produce", amounts: [{ quantity: "2", unit: "clove" }] }),
        item({ id: "4", name: "ground beef", section: "meat", amounts: [{ quantity: "1", unit: "lb" }] }),
        item({ id: "5", name: "peas", section: "freezer", amounts: [{ quantity: "1", unit: "bag" }] }),
        item({ id: "6", name: "rice", section: "pantry" }),
      ]),
      false,
    );
    expect(text).toBe(
      "Groceries\n\nProduce\n- 2 cloves garlic\n\nMeat\n- 1 lb ground beef\n\nFridge\n- 1 cup + 2 tbsp milk\n\nFreezer\n- 1 bag peas\n\nPantry\n- rice\n\nOther\n- paper towels",
    );
  });

  it("words amounts the way the page does (plural units, ranges, none)", () => {
    const text = groceryShareText(
      list([
        item({ id: "1", name: "onion", section: "produce", amounts: [{ quantity: "3", unit: null }] }),
        item({ id: "2", name: "carrots", section: "produce", amounts: [{ quantity: "2–3", unit: null }] }),
        item({ id: "3", name: "basil", section: "produce", amounts: [{ quantity: "½", unit: "bunch" }] }),
        item({ id: "4", name: "salt", section: "produce" }),
      ]),
      false,
    );
    expect(text).toBe("Groceries\n\nProduce\n- 3 onion\n- 2–3 carrots\n- ½ bunch basil\n- salt");
  });

  it("leaves out ticked items and sections that end up empty", () => {
    const text = groceryShareText(
      list([item({ id: "1", name: "milk", section: "fridge", checked: true }), item({ id: "2", name: "eggs", section: "fridge" }), item({ id: "3", name: "kale", section: "produce", checked: true })]),
      false,
    );
    expect(text).toBe("Groceries\n\nFridge\n- eggs");
  });

  it("includes staples only when the page shows them", () => {
    const items = [item({ id: "1", name: "salt", section: "pantry", staple: true }), item({ id: "2", name: "rice", section: "pantry" })];
    expect(groceryShareText(list(items), false)).toBe("Groceries\n\nPantry\n- rice");
    expect(groceryShareText(list(items), true)).toBe("Groceries\n\nPantry\n- salt\n- rice");
  });

  it("still leaves out a ticked staple when staples are shown", () => {
    expect(groceryShareText(list([item({ id: "1", name: "salt", staple: true, checked: true })]), true)).toBe("Groceries\n\nNothing to buy.");
  });

  it("says there is nothing to buy for an empty list, an all-ticked list, or only hidden staples", () => {
    expect(groceryShareText(list([]), false)).toBe("Groceries\n\nNothing to buy.");
    expect(groceryShareText(list([item({ id: "1", name: "milk", checked: true })]), false)).toBe("Groceries\n\nNothing to buy.");
    expect(groceryShareText(list([item({ id: "1", name: "salt", staple: true })]), false)).toBe("Groceries\n\nNothing to buy.");
  });
});
