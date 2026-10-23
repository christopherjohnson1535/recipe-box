export type SpotName = "soups" | "vegetarian" | "baking" | "quick" | "mains" | "drinks" | "fruit" | "freezer" | "default";

// Words (singular, lower case) a tag may contain, by icon. The first word of the tag that matches wins.
const WORDS: Record<Exclude<SpotName, "default">, string[]> = {
  soups: ["soup", "stew", "broth", "chowder", "bisque"],
  vegetarian: ["vegetarian", "veggie", "vegan", "vegetable", "plant"],
  baking: ["baking", "bake", "baked", "bread", "dessert", "cake", "cookie", "pastry", "pie", "muffin", "biscuit"],
  quick: ["quick", "fast", "weeknight", "minute", "speedy", "express"],
  mains: ["main", "dinner", "entree", "supper"],
  drinks: ["drink", "cocktail", "beverage", "smoothie", "juice"],
  fruit: ["fruit", "berry", "apple", "citrus"],
  freezer: ["freezer", "freeze", "frozen", "ahead"],
};
const LOOKUP = new Map(Object.entries(WORDS).flatMap(([icon, words]) => words.map((w) => [w, icon as SpotName] as const)));

/** The spot icon for a tag: case, plurals and common synonyms are normalised ("Soups", "30-minute", "make-ahead"). */
export function iconForTag(tag: string): SpotName {
  for (const word of tag.toLowerCase().split(/[^a-z0-9]+/)) {
    for (const form of [word, word.replace(/ies$/, "y"), word.replace(/es$/, ""), word.replace(/s$/, "")]) {
      const hit = LOOKUP.get(form);
      if (hit) return hit;
    }
  }
  return "default";
}
