import type { RecipeSort } from "@/lib/api";

export const SORTS: { value: RecipeSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "title", label: "A–Z" },
  { value: "time", label: "Quickest" },
];

export const parseSort = (value: string | undefined): RecipeSort | undefined =>
  SORTS.find((s) => s.value === value)?.value;

/** Home URL for a search state; empty parts are left out so `/` stays `/`. */
export function homeHref({ q, tag, sort }: { q?: string; tag?: string; sort?: RecipeSort }) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (tag) params.set("tag", tag);
  if (sort) params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/** "3 recipes match “lasagne” tagged dinner". */
export function resultSummary(total: number, q: string, tag: string) {
  const noun = total === 1 ? "recipe" : "recipes";
  const parts = [`${total} ${noun}`];
  if (q) parts.push(`${total === 1 ? "matches" : "match"} “${q}”`);
  if (tag) parts.push(`tagged ${tag}`);
  return parts.join(" ");
}
