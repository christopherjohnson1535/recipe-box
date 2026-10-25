import type { RecipeSummary } from "@/lib/api";

/** "October 2026" */
export const monthYear = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(iso));

const stamp = (r: RecipeSummary) => Date.parse(r.updatedAt) || 0;
/** Oldest edit first; equal times fall back to id so the pick never depends on the order the API answered in. */
const stalest = (a: RecipeSummary, b: RecipeSummary) => stamp(a) - stamp(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const INDEX_FROM = 4; // the grid's first four cards are already on screen beside the index
const INDEX_SIZE = 5;
const INDEX_MIN = 3; // a "numbered index" of one or two lines is just clutter
const PANEL_MIN = 4; // cover plus at least three others, so "haven't cooked in a while" has something to choose from

export type HomeLayout = {
  cover: RecipeSummary | null;
  /** Every recipe but the cover, in the order the API returned them (FND-1: the grid is the full list). */
  grid: RecipeSummary[];
  index: RecipeSummary[];
  stale: RecipeSummary | null;
};

/**
 * Decides who goes where on the home page.
 * shortcut: no "times cooked" data yet, so updatedAt stands in. The cover is the recipe with a photo that was edited
 * longest ago, the panel is the stalest of the cards below the first screen; swap both for the Made-it log (#23) when it lands.
 */
export function planHome(items: RecipeSummary[]): HomeLayout {
  const cover = items.filter((r) => r.imageUrl).sort(stalest)[0] ?? null;
  const grid = items.filter((r) => r !== cover);
  const index = grid.slice(INDEX_FROM, INDEX_FROM + INDEX_SIZE);
  // Not one of the first four cards: those are already on screen beside the panel. Small boxes have nothing else to pick from.
  const pool = grid.length > INDEX_FROM ? grid.slice(INDEX_FROM) : grid;
  return {
    cover,
    grid,
    index: index.length >= INDEX_MIN ? index : [],
    stale: items.length >= PANEL_MIN ? ([...pool].sort(stalest)[0] ?? null) : null,
  };
}
