import { describe, expect, it } from "vitest";
import { formatNumber, parseNumber, scaleIngredient, scaleQuantity, scaleServings, splitIngredient } from "./scale";

describe("splitIngredient", () => {
  it.each([
    ["4 lb bone-in short ribs", "4 lb", "bone-in short ribs"],
    ["1 large onion, diced", "1", "large onion, diced"],
    ["2 cups dry red wine", "2 cups", "dry red wine"],
    ["1/2 cup parsley", "1/2 cup", "parsley"],
    ["½ cup parsley", "½ cup", "parsley"],
    ["1½ tsp salt", "1½ tsp", "salt"],
    ["1 1/2 tbsp oil", "1 1/2 tbsp", "oil"],
    ["2-3 cloves garlic", "2-3 cloves", "garlic"],
    ["2–3 cloves garlic", "2–3 cloves", "garlic"],
    ["2 to 3 tablespoons butter", "2 to 3 tablespoons", "butter"],
    ["100g flour", "100g", "flour"],
    ["1.5 kg potatoes", "1.5 kg", "potatoes"],
    ["1 clove garlic, grated", "1 clove", "garlic, grated"],
    ["1 (14 oz) can tomatoes", "1", "(14 oz) can tomatoes"],
  ])("reads %s", (text, quantity, rest) => {
    expect(splitIngredient(text)).toEqual({ quantity, rest });
  });

  it.each(["salt to taste", "a pinch of salt", "Juice of 1 lemon", "", "14-oz can tomatoes", "350°F oven", "2x4 board"])(
    "leaves %j alone",
    (text) => {
      expect(splitIngredient(text)).toEqual({ quantity: null, rest: text });
    },
  );

  it("does not mistake the start of a word for a unit", () => {
    expect(splitIngredient("1 large egg")).toEqual({ quantity: "1", rest: "large egg" });
    expect(splitIngredient("2 tomatoes")).toEqual({ quantity: "2", rest: "tomatoes" });
    expect(splitIngredient("3 cupboards")).toEqual({ quantity: "3", rest: "cupboards" });
  });
});

describe("scaleIngredient", () => {
  it.each([
    ["4 lb bone-in short ribs", 2, "8 lb bone-in short ribs"],
    ["4 lb bone-in short ribs", 0.5, "2 lb bone-in short ribs"],
    ["1 large onion, diced", 2, "2 large onion, diced"],
    ["1 cup flour", 2, "2 cups flour"],
    ["2 cups flour", 0.5, "1 cup flour"],
    ["1 1/2 cups flour", 2, "3 cups flour"],
    ["1½ cups flour", 0.5, "¾ cup flour"],
    ["1 tsp salt", 0.5, "½ tsp salt"],
    ["1/4 tsp salt", 0.5, "⅛ tsp salt"],
    ["⅓ cup sugar", 2, "⅔ cup sugar"],
    ["1 cup sugar", 1 / 3, "⅓ cup sugar"],
    ["2-3 cloves garlic", 2, "4–6 cloves garlic"],
    ["2 to 3 tablespoons butter", 0.5, "1–1½ tablespoons butter"],
    ["1 pinch salt", 2, "2 pinches salt"],
    ["3 tbsp oil", 0.5, "1½ tbsp oil"],
    ["10 oz chocolate", 0.5, "5 oz chocolate"],
    ["12 oz pasta", 0.5, "6 oz pasta"],
    ["100g flour", 2, "200 g flour"],
    ["1.5 kg potatoes", 2, "3 kg potatoes"],
    ["5 cups stock", 2, "10 cups stock"],
    ["7 cups water", 2.5, "18 cups water"],
    ["1/8 tsp nutmeg", 0.5, "⅛ tsp nutmeg"],
    ["1 tsp salt", 4, "4 tsp salt"],
    ["1,000 g flour", 2, "2,000 g flour"],
    ["1,5 kg flour", 2, "1,5 kg flour"],
    ["1-1/2 cups flour", 2, "3 cups flour"],
    ["1⁄2 cup flour", 2, "1 cup flour"],
    ["1 1/2-inch piece ginger", 2, "1 1/2-inch piece ginger"],
    ["1½-inch piece ginger", 2, "1½-inch piece ginger"],
    ["2 cups plus 2 tbsp flour", 2, "2 cups plus 2 tbsp flour"],
    ["1 cup/240 ml milk", 2, "1 cup/240 ml milk"],
    ["2 sprigs thyme", 0.5, "1 sprig thyme"],
    ["1 head garlic", 3, "3 heads garlic"],
    ["1 dash bitters", 2, "2 dashes bitters"],
  ])("%s × %s → %s", (text, factor, expected) => {
    expect(scaleIngredient(text, factor)).toBe(expected);
  });

  it("leaves unparseable lines and ×1 untouched", () => {
    expect(scaleIngredient("salt to taste", 2)).toBe("salt to taste");
    expect(scaleIngredient("a pinch of salt", 2)).toBe("a pinch of salt");
    expect(scaleIngredient("14-oz can tomatoes", 2)).toBe("14-oz can tomatoes");
    expect(scaleIngredient("1 cup flour", 1)).toBe("1 cup flour");
  });

  it("sets fractions the way a cook writes them at ×1 too (scaleQuantity)", () => {
    expect(scaleQuantity("1/2 cup", 1)).toBe("½ cup");
    expect(scaleQuantity("1 1/2 lb", 1)).toBe("1½ lb");
    expect(scaleQuantity("1⁄2 cup", 1)).toBe("½ cup");
    expect(scaleQuantity("1-1/2 cups", 1)).toBe("1½ cups");
    expect(scaleQuantity("2", 1)).toBe("2");
    expect(scaleQuantity("2-3 cloves", 1)).toBe("2–3 cloves");
    expect(scaleQuantity("1000 g", 1)).toBe("1,000 g");
    expect(scaleQuantity("0.4 cup", 1)).toBe("0.4 cup"); // no tidy fraction: stays as written
  });

  it("splits a line with a second amount into no quantity", () => {
    expect(splitIngredient("2 cups plus 2 tbsp flour")).toEqual({ quantity: null, rest: "2 cups plus 2 tbsp flour" });
    expect(splitIngredient("1,000 g flour")).toEqual({ quantity: "1,000 g", rest: "flour" });
  });

  it("sets a servings range with an en dash", () => {
    expect(scaleServings("6-8", 1)).toBe("6–8");
    expect(scaleServings("6-8", 2)).toBe("12–16");
    expect(scaleServings("makes about 4 bowls", 1)).toBe("makes about 4 bowls");
  });

  it("scales servings strings", () => {
    expect(scaleIngredient("4", 2)).toBe("8");
    expect(scaleIngredient("4-6", 0.5)).toBe("2–3");
    expect(scaleIngredient("4 servings", 2)).toBe("8 servings");
    expect(scaleIngredient("makes 12", 2)).toBe("makes 12");
    expect(scaleIngredient("", 2)).toBe("");
  });

  it("never produces zero", () => {
    expect(scaleIngredient("1 pinch salt", 0.01)).toBe("⅛ pinch salt");
  });
});

describe("scaleQuantity", () => {
  it("scales the column text and passes through what it can't read", () => {
    expect(scaleQuantity("2 tbsp", 2)).toBe("4 tbsp");
    expect(scaleQuantity("whatever", 2)).toBe("whatever");
  });
});

describe("numbers", () => {
  it("parses fractions, mixed numbers and glyphs", () => {
    expect(parseNumber("1 1/2")).toBe(1.5);
    expect(parseNumber("1½")).toBe(1.5);
    expect(parseNumber("¾")).toBe(0.75);
    expect(parseNumber("2.5")).toBe(2.5);
  });

  it("formats the way a cook writes", () => {
    expect(formatNumber(1.5)).toBe("1½");
    expect(formatNumber(0.75)).toBe("¾");
    expect(formatNumber(2 / 3)).toBe("⅔");
    expect(formatNumber(2.99)).toBe("3");
    expect(formatNumber(4.1)).toBe("4");
    expect(formatNumber(4.6)).toBe("4½");
    expect(formatNumber(9.9)).toBe("10");
    expect(formatNumber(12.4)).toBe("12");
    expect(formatNumber(0.01)).toBe("⅛");
  });
});
