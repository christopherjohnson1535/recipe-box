import { useCallback, useSyncExternalStore } from "react";

// Per-tab values (ticks, scale) kept in sessionStorage so a reload keeps them. A Map covers storage that throws (a
// private window, blocked site data): the value then lasts until the page is closed.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string) {
  memory.set(key, value);
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* the Map has it */
  }
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** A string kept in sessionStorage. The server and the hydrating render see `null`, so the HTML never differs from the first client render. */
export function useSessionString(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key), () => null);
  return [value, useCallback((v: string) => write(key, v), [key])];
}
