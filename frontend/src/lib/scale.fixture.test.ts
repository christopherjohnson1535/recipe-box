import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NUMBER, parseNumber, splitIngredient } from "./scale";

// The backend's grocery parser reads the same lines (backend/crates/domain/tests/grocery.rs). Both must find the same
// quantity, so recipe scaling and the grocery list never disagree.
type Line = { text: string; quantity: { min: number; max: number | null } | null; unit: string | null };
const lines: Line[] = JSON.parse(
  readFileSync(resolve(process.cwd(), "../backend/crates/domain/tests/fixtures/ingredient-lines.json"), "utf8"),
);

// scale.ts keeps the unit as written; the backend stores the canonical short singular (same table as grocery/parse.rs).
const CANON: Record<string, string> = {
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", oz: "oz", ounce: "oz", ounces: "oz", g: "g", gram: "g", grams: "g", kg: "kg", ml: "ml",
  l: "l", liter: "l", liters: "l", litre: "l", litres: "l", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", tbsp: "tbsp", tablespoon: "tbsp",
  tablespoons: "tbsp", cup: "cup", cups: "cup", clove: "clove", cloves: "clove", pinch: "pinch", pinches: "pinch", dash: "dash", dashes: "dash",
  can: "can", cans: "can", stick: "stick", sticks: "stick", slice: "slice", slices: "slice", bunch: "bunch", bunches: "bunch", sprig: "sprig",
  sprigs: "sprig", head: "head", heads: "head", stalk: "stalk", stalks: "stalk", piece: "piece", pieces: "piece", package: "package",
  packages: "package", handful: "handful", handfuls: "handful", quart: "qt", quarts: "qt", qt: "qt", pint: "pt", pints: "pt", pt: "pt", gal: "gal",
};
const PARTS = new RegExp(`^(${NUMBER})(?:(?:\\s*[-–]\\s*|\\s+to\\s+)(${NUMBER}))?(?:\\s*([a-z]+))?\\.?$`, "i");

describe("ingredient-lines fixture", () => {
  it("is big enough to mean something", () => {
    expect(lines.length).toBeGreaterThanOrEqual(60);
  });

  it.each(lines.map((l) => [l.text, l] as const))("%s reads the same as the backend", (text, line) => {
    const { quantity } = splitIngredient(text);
    expect(quantity !== null).toBe(line.quantity !== null);
    if (quantity === null || line.quantity === null) return;
    const m = PARTS.exec(quantity.replace(/⁄/g, "/"));
    expect(m, `quantity ${quantity}`).not.toBeNull();
    const [a, b] = [parseNumber(m![1]), m![2] ? parseNumber(m![2]) : null];
    expect(Math.min(a, b ?? a)).toBeCloseTo(line.quantity.min, 9);
    const max = b !== null && b !== a ? Math.max(a, b) : null;
    expect(max === null).toBe(line.quantity.max === null);
    if (max !== null) expect(max).toBeCloseTo(line.quantity.max!, 9);
    // A unit scale.ts recognises must be the one the backend stored; "1 (14 oz) can ..." has none here but one there.
    if (m![3]) expect(CANON[m![3].toLowerCase()]).toBe(line.unit);
  });
});
