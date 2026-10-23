// Scaling a recipe: read the quantity an ingredient line starts with, multiply it, set it back as a cook would
// write it (1½, not 1.5). Lines that don't start with a number ("salt to taste") are never touched.

const GLYPHS: Record<string, number> = { "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4, "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8 };
const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];
const G = Object.keys(GLYPHS).join("");

/** Regex source for one number: "1 1/2", "1½", "1/2", "2.5", "½", "3". Reused by the duration finder in recipe.ts. */
export const NUMBER = `\\d+\\s+\\d+/\\d+|\\d+[${G}]|\\d+/\\d+|\\d+(?:\\.\\d+)?|[${G}]`;
const RANGE = "(?:\\s*[-–]\\s*|\\s+to\\s+)";
const UNIT =
  "(?:lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|l|liters?|litres?|tsp|tbsp|teaspoons?|tablespoons?|cups?|cloves?|pinch(?:es)?|cans?|sticks?|slices?|bunch(?:es)?|quarts?|qt|pints?|pt|gal)";
// Number, optional range end, optional unit, then a space, comma or the end: "14-oz can" and "350°F" don't match.
const QUANTITY = new RegExp(`^\\s*(${NUMBER})(?:${RANGE}(${NUMBER}))?(?:\\s*(${UNIT})\\.?)?(?=\\s|,|$)`, "i");

/** "1 1/2" or "1½" or "2.5" → 1.5, 2.5 */
export function parseNumber(text: string): number {
  let total = 0;
  for (const m of text.matchAll(new RegExp(`(\\d+)/(\\d+)|(\\d+(?:\\.\\d+)?)|([${G}])`, "g"))) {
    total += m[4] ? GLYPHS[m[4]] : m[1] ? Number(m[1]) / Number(m[2]) : Number(m[3]);
  }
  return total;
}

/** 1.5 → "1½", 0.33 → "⅓", 12.4 → "12". Eighths below 4, quarters below 10, whole numbers above; never "0". */
export function formatNumber(value: number): string {
  if (value >= 10) return String(Math.round(value));
  let whole = Math.floor(value);
  const frac = value - whole;
  let glyph = "";
  if (value < 4 && Math.abs(frac - 1 / 3) < 0.03) glyph = "⅓";
  else if (value < 4 && Math.abs(frac - 2 / 3) < 0.03) glyph = "⅔";
  else {
    const step = value < 4 ? 8 : 4;
    const n = Math.round(frac * step);
    if (n === step) whole += 1;
    else glyph = EIGHTHS[n * (8 / step)];
  }
  return whole || glyph ? `${whole || ""}${glyph}` : "⅛";
}

// "1 cup" → "2 cups", "2 cups" → "1 cup"; abbreviations (lb, tsp, g) never change.
function pluralize(unit: string, value: number): string {
  const m = /^(cup|clove|can|teaspoon|tablespoon|pound|ounce|stick|slice|quart|pint|bunch|pinch)(?:es|s)?$/i.exec(unit);
  if (!m) return unit;
  return m[1] + (value > 1 ? (/ch$/i.test(m[1]) ? "es" : "s") : "");
}

/**
 * Splits "4 lb bone-in short ribs" into the quantity with its unit ("4 lb", shown in its own column) and the rest.
 * Reads ranges ("2-3", "2 to 3"), fractions, mixed numbers and a unit from a short list.
 * shortcut: "1 1/2-inch piece" reads as "1" + "1/2-inch piece"; recipes that write sizes that way scale oddly, so write "1½-inch".
 */
export function splitIngredient(text: string): { quantity: string | null; rest: string } {
  const m = QUANTITY.exec(text);
  return m ? { quantity: m[0].trim(), rest: text.slice(m[0].length).trimStart() } : { quantity: null, rest: text };
}

/** Multiplies a quantity string from `splitIngredient`; one that doesn't parse comes back unchanged. */
export function scaleQuantity(quantity: string, factor: number): string {
  const m = QUANTITY.exec(quantity);
  if (!m || factor === 1) return quantity;
  const lo = parseNumber(m[1]) * factor;
  const hi = m[2] ? parseNumber(m[2]) * factor : null;
  const [a, b] = [formatNumber(lo), hi === null ? "" : formatNumber(hi)];
  const nums = b && b !== a ? `${a}–${b}` : a;
  return m[3] ? `${nums} ${pluralize(m[3], hi ?? lo)}` : nums;
}

/** Scales the leading quantity of an ingredient line or a servings string ("4-6" × ½ → "2–3"). */
export function scaleIngredient(text: string, factor: number): string {
  const { quantity, rest } = splitIngredient(text);
  if (quantity === null || factor === 1) return text;
  return `${scaleQuantity(quantity, factor)}${rest ? ` ${rest}` : ""}`;
}
