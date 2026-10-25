// The grocery shapes are the generated ones (docs/openapi.json, see docs/API.md, "Grocery list").
import type { components } from "@/lib/api-types";

type Schemas = components["schemas"];

export type GrocerySection = Schemas["GrocerySection"];
/** One amount of an item: `quantity` as a cook writes it ("1½", "2–3"), `unit` in its short form; either may be null. */
export type GroceryAmount = Schemas["GroceryAmount"];
export type GroceryItem = Schemas["GroceryItem"];
export type GroceryRecipe = Schemas["GroceryRecipe"];
export type GroceryList = Schemas["GroceryList"];

/** The fields the client sends in a PATCH (it never sends null, which the API reads as "absent"). */
export type ItemPatch = { [K in keyof Schemas["UpdateGroceryItem"]]?: NonNullable<Schemas["UpdateGroceryItem"][K]> };
