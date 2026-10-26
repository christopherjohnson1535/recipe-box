import { ticksStale } from "./cook-logic";

/** One step in a cook-together session: `dish` indexes the session's recipes, `step` that recipe's steps. */
export type DishStep = { dish: number; step: number };

export const MAX_DISHES = 4;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Recipe ids from the `recipes` search param ("a,b" or repeated params): valid ids only, first of each kept, at most MAX_DISHES. */
export function parseRecipeIds(param: string | string[] | undefined): string[] {
  const parts = [param ?? []].flat().flatMap((p) => p.split(",")).map((p) => p.trim());
  return [...new Set(parts.filter((p) => ID.test(p)))].slice(0, MAX_DISHES);
}

/** The URL for a session: `/cook?recipes=a,b`. */
export const cookTogetherHref = (ids: readonly string[]) => `/cook?recipes=${ids.map(encodeURIComponent).join(",")}`;

/** Round-robin: every dish's step 0 in dish order, then every dish's step 1, …, skipping dishes that have run out. */
export function interleave(stepCounts: readonly number[]): DishStep[] {
  const out: DishStep[] = [];
  for (let step = 0; step < Math.max(0, ...stepCounts); step++) {
    stepCounts.forEach((count, dish) => {
      if (step < count) out.push({ dish, step });
    });
  }
  return out;
}

/** True when `order` holds every (dish, step) of `stepCounts` exactly once and each dish's steps appear in ascending order. */
export function isValidOrder(order: readonly DishStep[], stepCounts: readonly number[]): boolean {
  if (order.length !== stepCounts.reduce((a, b) => a + b, 0)) return false;
  const next = stepCounts.map(() => 0);
  // Each entry must be its dish's next unseen step: that covers range, duplicates, gaps and order together.
  return order.every(({ dish, step }) => Number.isInteger(dish) && dish >= 0 && dish < next.length && next[dish]++ === step);
}

/** Whether the entry at `at` can move one place (dir -1 earlier, +1 later): not past either end, and only past an entry of a different dish. */
export function canMove(order: readonly DishStep[], at: number, dir: -1 | 1): boolean {
  const other = order[at + dir];
  return at >= 0 && at < order.length && other !== undefined && other.dish !== order[at].dish;
}

/** The order with the entry at `at` swapped with its neighbour; the same array when canMove is false. */
export function move(order: readonly DishStep[], at: number, dir: -1 | 1): readonly DishStep[] {
  if (!canMove(order, at, dir)) return order;
  const next = [...order];
  [next[at], next[at + dir]] = [next[at + dir], next[at]];
  return next;
}

/** The position of `dish`'s first entry after `at`, or -1. */
export function nextOfDish(order: readonly DishStep[], at: number, dish: number): number {
  for (let i = Math.max(at + 1, 0); i < order.length; i++) if (order[i].dish === dish) return i;
  return -1;
}

/** The order with `dish`'s first entry after `at` moved to `at + 1` (the entries between shift one later); the same array when there is none or it is already there. */
export function bringNext(order: readonly DishStep[], at: number, dish: number): readonly DishStep[] {
  const from = nextOfDish(order, at, dish);
  if (from === -1 || from === at + 1) return order;
  const next = [...order];
  const [entry] = next.splice(from, 1);
  next.splice(at + 1, 0, entry);
  return next;
}

/** Where to open: the first entry whose step is not ticked done; 0 when none is done; the last entry when all are. */
export function firstOpen(order: readonly DishStep[], doneSteps: readonly ReadonlySet<number>[]): number {
  const open = order.findIndex((e) => !doneSteps[e.dish]?.has(e.step));
  return open === -1 ? Math.max(order.length - 1, 0) : open;
}

/**
 * The dish's mark, one character where it can be: the first letter or digit of the title, upper-cased ("?" when none). When an
 * earlier dish has the mark, the first letter of each later word is tried ("Saffron rice" after "Shaved fennel salad" → "R"), then
 * any other letter or digit of the title; only when all are taken does it get a number suffix ("S2"). A title an earlier dish
 * has exactly always gets the suffix, as its name does ("Salad", "Salad 2"), so the two read as twins.
 */
export function dishInitials(titles: readonly string[]): string[] {
  const taken = new Set<string>();
  const counts = new Map<string, number>();
  const seenTitles = new Set<string>();
  return titles.map((title) => {
    const chars = [...title].filter((c) => /[\p{L}\p{N}]/u.test(c)).map((c) => c.toUpperCase());
    const first = chars[0] ?? "?";
    const twin = seenTitles.has(title);
    seenTitles.add(title);
    const wordStarts = title.split(/[^\p{L}\p{N}]+/u).flatMap((w) => (w ? [[...w][0].toUpperCase()] : []));
    const pick = twin ? undefined : [first, ...wordStarts.slice(1), ...chars].find((c) => !taken.has(c));
    if (pick) {
      taken.add(pick);
      return pick;
    }
    const n = (counts.get(first) ?? 1) + 1;
    counts.set(first, n);
    return `${first}${n}`;
  });
}

/** The dishes' names: a title that an earlier dish already has gets a number suffix ("Salad", "Salad 2"), as its mark does, so no two dishes read alike. */
export function dishNames(titles: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return titles.map((title) => {
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return n === 1 ? title : `${title} ${n}`;
  });
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** `{ v: 1, at, order: [[dish, step], …] }`. */
export const serialiseOrder = (order: readonly DishStep[], now: number) =>
  JSON.stringify({ v: 1, at: now, order: order.map((e) => [e.dish, e.step]) });

/** The stored order when it is valid for these step counts (a recipe edited since, corrupt text or another version → null). */
export function parseOrder(raw: string | null, stepCounts: readonly number[]): DishStep[] | null {
  try {
    const data: unknown = raw ? JSON.parse(raw) : null;
    const list = (data as { v?: unknown; order?: unknown } | null)?.order;
    if ((data as { v?: unknown } | null)?.v !== 1 || !Array.isArray(list)) return null;
    const order = list.map((e): DishStep => ({ dish: (e as unknown[])?.[0] as number, step: (e as unknown[])?.[1] as number }));
    return isValidOrder(order, stepCounts) ? order : null;
  } catch {
    return null;
  }
}

/** Same 12-hour rule as ticks (the stored shape also carries `v` and `at`). */
export const orderStale = ticksStale;
