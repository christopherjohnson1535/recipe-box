import { ApiError } from "@/lib/api";
import type { GroceryItem, GroceryList, GrocerySection, ItemPatch } from "./types";

// shortcut: a small client of its own because src/lib/api.ts is not part of #80. Once #79 lands, move these into
// createApi (api.ts) and delete this request helper.

/** Dispatched on `window` after every grocery write, so the nav badge (and any other open view) refetches. */
export const GROCERY_CHANGED = "grocery:changed";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Can’t reach the Recipe Box server. Check your connection and try again.");
  }
  if (!res.ok) {
    const error = await res
      .json()
      .then((b: { error?: Record<string, unknown> }) => b?.error)
      .catch(() => undefined);
    const code = typeof error?.code === "string" ? error.code : "internal";
    const message = typeof error?.message === "string" ? error.message : `Request failed (${res.status}).`;
    throw new ApiError(res.status, code, message, error ?? {});
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** A write that worked: tell the rest of the page. */
async function write<T>(method: string, path: string, body?: unknown): Promise<T> {
  const result = await request<T>(method, path, body);
  window.dispatchEvent(new Event(GROCERY_CHANGED));
  return result;
}

const id = encodeURIComponent;

export const groceryApi = {
  get: () => request<GroceryList>("GET", "/api/grocery"),
  /** Adds the recipe, or sets the scale of one already on the list. */
  addRecipe: (recipeId: string, scale = 1) => write<GroceryList>("POST", "/api/grocery/recipes", { recipeId, scale }),
  removeRecipe: (recipeId: string) => write<GroceryList>("DELETE", `/api/grocery/recipes/${id(recipeId)}`),
  addItem: (text: string, section?: GrocerySection) =>
    write<GroceryItem>("POST", "/api/grocery/items", section ? { text, section } : { text }),
  patchItem: (itemId: string, patch: ItemPatch) => write<GroceryItem>("PATCH", `/api/grocery/items/${id(itemId)}`, patch),
  removeItem: (itemId: string) => write<void>("DELETE", `/api/grocery/items/${id(itemId)}`),
  clearChecked: () => write<GroceryList>("POST", "/api/grocery/clear-checked"),
  empty: () => write<void>("DELETE", "/api/grocery"),
};
