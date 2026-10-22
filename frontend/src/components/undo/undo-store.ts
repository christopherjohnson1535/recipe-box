import { useSyncExternalStore } from "react";

/** The recipe just deleted, offered for undo. `seq` changes with every offer so a new toast starts fresh. */
export type UndoOffer = { id: string; title: string; seq: number };

// A module-level store: client-side navigation keeps it, so the toast outlives the move to the home page.
// shortcut: a full page reload drops it, which is fine for a 10 s window.
let current: UndoOffer | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showUndo(offer: { id: string; title: string }) {
  current = { ...offer, seq: ++seq };
  emit();
}

export function dismissUndo() {
  current = null;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const useUndoOffer = () =>
  useSyncExternalStore(subscribe, () => current, () => null);
