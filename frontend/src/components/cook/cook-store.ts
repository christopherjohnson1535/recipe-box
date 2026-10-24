import { useCallback, useMemo, useSyncExternalStore } from "react";
import { noTicks, parseTicks, serialiseTicks, ticksStale, toggled, type Ticks } from "./cook-logic";

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
