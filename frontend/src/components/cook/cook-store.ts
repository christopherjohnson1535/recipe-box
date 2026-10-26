import { useCallback, useMemo, useSyncExternalStore } from "react";
import { noTicks, parseTicks, serialiseTicks, ticksStale, toggled, type Ticks } from "./cook-logic";
import { interleave, orderStale, parseOrder, serialiseOrder, type DishStep } from "./cook-together-logic";

// Cook-mode values kept in localStorage so a reload or a return later the same evening keeps them. A Map covers storage
// that throws (a private window, blocked site data): the value then lasts until the page is closed.
// shortcut: recipe-page/session-store.ts is the same hook on sessionStorage; share one if a third caller appears.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
// Keys whose last write threw. Reads for them come from the Map, or a getItem that still works would keep serving the old value.
const failed = new Set<string>();

function read(key: string): string | null {
  if (failed.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
    failed.delete(key);
  } catch {
    failed.add(key); // the Map has it
  }
  listeners.forEach((l) => l());
}

// Another tab wrote to localStorage: read again, so this tab does not build on (and then overwrite with) stale state.
const onStorage = () => listeners.forEach((l) => l());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
};

/** A string kept in localStorage. The server and the hydrating render see `null`, so the HTML never differs from the first client render. */
export function useLocalString(key: string, stale?: (raw: string, now: number) => boolean): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = read(key);
      return raw !== null && stale?.(raw, Date.now()) ? null : raw;
    },
    () => null,
  );
  return [value, useCallback((v: string) => write(key, v), [key])];
}

export type CookView = "one" | "all";
/** One step or all steps, remembered on this device (`cook-view`). */
export function useCookView(): [CookView, (view: CookView) => void] {
  const [raw, set] = useLocalString("cook-view");
  return [raw === "all" ? "all" : "one", set];
}

/** The stored ticks for one recipe, read once and now (not subscribed): for a decision made on first load. */
export function readCookTicks(id: string, ingredientCount: number, stepCount: number): Ticks {
  const raw = read(`cook-ticks:${id}`);
  return parseTicks(raw !== null && ticksStale(raw, Date.now()) ? null : raw, { ingredients: ingredientCount, steps: stepCount });
}

/** Ticked ingredients and steps for one recipe (`cook-ticks:<id>`: `{ v: 1, at, ingredients, steps }`). */
export function useCookTicks(id: string, ingredientCount: number, stepCount: number) {
  const key = `cook-ticks:${id}`;
  // Ticks older than 12 hours read as none (judged each time the store is read).
  const [raw, set] = useLocalString(key, ticksStale);
  const ticks = useMemo<Ticks>(() => parseTicks(raw, { ingredients: ingredientCount, steps: stepCount }), [raw, ingredientCount, stepCount]);
  const save = useCallback((next: Ticks) => set(serialiseTicks(next, Date.now())), [set]);
  return {
    ticks,
    toggleIngredient: (i: number) => save({ ...ticks, ingredients: toggled(ticks.ingredients, i) }),
    toggleStep: (i: number) => save({ ...ticks, steps: toggled(ticks.steps, i) }),
    clear: () => save(noTicks),
  };
}

export type CookTogetherView = "one" | "all" | "dishes";
/** One step, all steps or one column per dish, remembered on this device (`cook-together-view`). */
export function useCookTogetherView(): [CookTogetherView, (view: CookTogetherView) => void] {
  const [raw, set] = useLocalString("cook-together-view");
  return [raw === "all" || raw === "dishes" ? raw : "one", set];
}

const orderKey = (ids: readonly string[]) => `cook-together:${ids.join(",")}`;
const parseCounts = (key: string) => (key ? key.split(",").map(Number) : []);

/** The stored order for a session, read once and now (not subscribed): the stored order, or round-robin. */
export function readCookTogetherOrder(ids: readonly string[], stepCounts: readonly number[]): DishStep[] {
  const raw = read(orderKey(ids));
  return parseOrder(raw !== null && orderStale(raw, Date.now()) ? null : raw, stepCounts) ?? interleave(stepCounts);
}

/** The order of a cook-together session (`cook-together:<ids>`: `{ v: 1, at, order }`); round-robin when nothing valid and fresh is stored. */
export function useCookTogetherOrder(ids: readonly string[], stepCounts: readonly number[]) {
  const [raw, set] = useLocalString(orderKey(ids), orderStale);
  const countsKey = stepCounts.join(",");
  const counts = useMemo(() => parseCounts(countsKey), [countsKey]);
  const order = useMemo(() => parseOrder(raw, counts) ?? interleave(counts), [raw, counts]);
  const setOrder = useCallback((o: readonly DishStep[]) => set(serialiseOrder(o, Date.now())), [set]);
  const reset = useCallback(() => setOrder(interleave(counts)), [setOrder, counts]);
  return { order, setOrder, reset };
}

type DishSpec = { id: string; ingredientCount: number; stepCount: number };

/** Ticks for several recipes at once, in each recipe's own `cook-ticks:<id>` (shared with single-recipe cook mode). `ticks[d]` matches `dishes[d]`. */
export function useDishTicks(dishes: readonly DishSpec[]) {
  const specKey = dishes.map((d) => `${d.id}:${d.ingredientCount}:${d.stepCount}`).join("|");
  const specs = useMemo<DishSpec[]>(
    () =>
      specKey
        ? specKey.split("|").map((s) => {
            const [id, ingredientCount, stepCount] = s.split(":");
            return { id, ingredientCount: Number(ingredientCount), stepCount: Number(stepCount) };
          })
        : [],
    [specKey],
  );
  // One string snapshot of every recipe's stored text (stale ones as null), so a single subscription covers all dishes.
  const snapshot = useSyncExternalStore(
    subscribe,
    () =>
      JSON.stringify(
        specs.map((d) => {
          const raw = read(`cook-ticks:${d.id}`);
          return raw !== null && ticksStale(raw, Date.now()) ? null : raw;
        }),
      ),
    () => "",
  );
  const ticks = useMemo<Ticks[]>(() => {
    const raws: (string | null)[] = snapshot ? JSON.parse(snapshot) : [];
    return specs.map((d, i) => parseTicks(raws[i] ?? null, { ingredients: d.ingredientCount, steps: d.stepCount }));
  }, [snapshot, specs]);

  // Built from the stored text at click time, so two quick taps never build on a stale render.
  const update = useCallback(
    (dish: number, change: (t: Ticks) => Ticks) => {
      const d = specs[dish];
      write(`cook-ticks:${d.id}`, serialiseTicks(change(readCookTicks(d.id, d.ingredientCount, d.stepCount)), Date.now()));
    },
    [specs],
  );
  return {
    ticks,
    toggleIngredient: (dish: number, i: number) => update(dish, (t) => ({ ...t, ingredients: toggled(t.ingredients, i) })),
    toggleStep: (dish: number, i: number) => update(dish, (t) => ({ ...t, steps: toggled(t.steps, i) })),
    clearAll: () => specs.forEach((_, dish) => update(dish, () => noTicks)),
  };
}
