import { useSyncExternalStore } from "react";

/**
 * A recipe just deleted, offered for undo, or (with `notice`) a plain status message. `seq` is unique per offer so
 * each gets its own toast and its own countdown.
 */
export type UndoOffer = { id: string; title: string; seq: number; notice?: string };

// A module-level store: client-side navigation keeps it, so the toasts outlive the move to the home page.
// shortcut: a full page reload drops it, which is fine for a 10 s window.
let offers: UndoOffer[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const set = (next: UndoOffer[]) => {
  offers = next;
  listeners.forEach((l) => l());
};

export function showUndo(offer: { id: string; title: string }) {
  set([...offers, { ...offer, seq: ++seq }]);
}

/** A short status in the same stack, no Undo (for example "That recipe was already deleted."). */
export function showNotice(notice: string) {
  set([...offers, { id: "", title: "", notice, seq: ++seq }]);
}

/** Removes one offer, or every offer when no `seq` is given (sign-out, leaving the app). */
export function dismissUndo(only?: number) {
  if (only === undefined) {
    if (offers.length > 0) set([]);
  } else if (offers.some((o) => o.seq === only)) {
    set(offers.filter((o) => o.seq !== only));
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const NONE: UndoOffer[] = [];

/** Oldest first. */
export const useUndoOffers = () =>
  useSyncExternalStore(subscribe, () => offers, () => NONE);
