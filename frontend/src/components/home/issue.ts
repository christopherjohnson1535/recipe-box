import type { RecipeSummary } from "@/lib/api";

export type Season = "Spring" | "Summer" | "Autumn" | "Winter";

/** Northern-hemisphere seasons by calendar month, in the viewer-independent server clock. */
export function seasonOf(date: Date): Season {
  const m = date.getMonth(); // 0 = January
  if (m >= 2 && m <= 4) return "Spring";
  if (m >= 5 && m <= 7) return "Summer";
  if (m >= 8 && m <= 10) return "Autumn";
  return "Winter";
}

const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

/** 4 → "IV". Anything below 1 is "I": a volume always exists. */
export function toRoman(n: number): string {
  let rest = Math.max(1, Math.floor(n));
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/** "Friday, October 23, 2026" */
export const longDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(date);

/** "October 2026" */
export const monthYear = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long" }).format(new Date(iso));

const stamp = (r: RecipeSummary) => Date.parse(r.updatedAt) || 0;
/** Oldest edit first; equal times fall back to id so the pick never depends on the order the API answered in. */
const stalest = (a: RecipeSummary, b: RecipeSummary) => stamp(a) - stamp(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The issue's volume: whole years since the oldest recipe was last edited, plus one.
 * shortcut: updatedAt stands in for the first-added date until the API exposes createdAt, revisit with #23.
 */
export function volumeOf(items: RecipeSummary[], now: Date): number {
  if (items.length === 0) return 1;
  const oldest = Math.min(...items.map(stamp));
  return Math.max(0, Math.floor((now.getTime() - oldest) / (365.25 * 864e5))) + 1;
}

/** Everything the issue line prints. `total` is the whole box, `items` the first page of it. */
export function issueLine(items: RecipeSummary[], total: number, now: Date) {
  return {
    volume: toRoman(volumeOf(items, now)),
    number: total,
    name: `The ${seasonOf(now)} Issue`,
    date: longDate(now),
    dateTime: [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n, i) => String(n).padStart(i ? 2 : 4, "0")).join("-"),
  };
}

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
 * longest ago, the panel is the stalest of the rest; swap both for the Made-it log (#23) when it lands.
 */
export function planHome(items: RecipeSummary[]): HomeLayout {
  const cover = items.filter((r) => r.imageUrl).sort(stalest)[0] ?? null;
  const grid = items.filter((r) => r !== cover);
  const index = grid.slice(INDEX_FROM, INDEX_FROM + INDEX_SIZE);
  return {
    cover,
    grid,
    index: index.length >= INDEX_MIN ? index : [],
    stale: items.length >= PANEL_MIN ? ([...grid].sort(stalest)[0] ?? null) : null,
  };
}
