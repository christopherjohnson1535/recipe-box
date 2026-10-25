// Replaced by aliases of the generated api-types once #79 lands.
// Hand-written to match docs/API.md, "Grocery list".

export type GrocerySection = "produce" | "meat" | "fridge" | "freezer" | "pantry" | "other";

/** One amount of an item: `quantity` as a cook writes it ("1½", "2–3"), `unit` in its short form; either may be null. */
export type GroceryAmount = { quantity: string | null; unit: string | null };

export type GroceryItem = {
  id: string;
  name: string;
  /** Empty means "no amount". Different units sit side by side ("1 cup + 2 tbsp"). */
  amounts: GroceryAmount[];
  section: GrocerySection;
  checked: boolean;
  manual: boolean;
  staple: boolean;
  recipeIds: string[];
};

export type GroceryRecipe = {
  recipeId: string;
  title: string;
  /** The factor the recipe page uses (½× = 0.5). */
  scale: number;
  /** The recipe's servings text at that scale, or null. */
  servings: string | null;
  imageUrl: string | null;
};

export type GroceryList = {
  id: string;
  /** Changes on every write. */
  updatedAt: string;
  recipes: GroceryRecipe[];
  /** Ordered by section (produce, meat, fridge, freezer, pantry, other), then by name. */
  items: GroceryItem[];
};

export type ItemPatch = Partial<Pick<GroceryItem, "checked" | "section" | "staple">>;
