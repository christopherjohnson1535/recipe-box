import { useSyncExternalStore } from "react";

/** The stamp on screen, or null. `seq` is unique per stamp so a second save restarts the animation. */
export type StampState = { seq: number; date: string } | null;

// A module-level store like undo-store: client navigation keeps it, so the stamp lands on the page the save opens.
let current: StampState = null;
let seq = 0;
const listeners = new Set<() => void>();
const set = (next: StampState) => {
  current = next;
  listeners.forEach((l) => l());
};

/** "OCT 23 · 2026" in the viewer's time zone (case is set by the stamp's CSS). */
export function stampDate(now = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.month} ${p.day} · ${p.year}`;
}

/** One rubber-stamp moment for a NEW recipe. Edits keep the quiet "Saved." notice instead. */
export function showSaveStamp() {
  set({ seq: ++seq, date: stampDate() });
}

export function hideSaveStamp(only?: number) {
  if (current && (only === undefined || current.seq === only)) set(null);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useSaveStamp = () => useSyncExternalStore(subscribe, () => current, () => null);
