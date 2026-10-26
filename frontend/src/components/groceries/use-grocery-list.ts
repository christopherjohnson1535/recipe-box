"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { sectionLabel, withItem, withoutItem } from "./list-model";
import { scaleLabel } from "./scale-steps";
import type { GroceryItem, GroceryList, GrocerySection, ItemPatch } from "./types";

/** How often a visible list asks the server again, so two people in one shop see each other's ticks. */
export const POLL_MS = 20_000;
/** How long a just-ticked item stays in place while the line is drawn through it, before it sinks (motion.css: --duration-morph, 450ms). */
export const PENCIL_MS = 450;

const reducedMotion = () => typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/**
 * The household's grocery list: loads it, keeps it fresh (window focus, tab visible, every 20 s while visible) and offers
 * the writes. Ticks, moves, staples and removals show at once and roll back with a message if the server refuses.
 * A refresh that started before a write finished is dropped, so it can't undo what you just did; so is an answer older
 * than the list on screen (the service worker serves its kept copy when the network is slow, and that copy looks like a
 * live one). Each request only touches the fields it sent, and only while it is the newest to do so for that item.
 */
export function useGroceryList() {
  const [list, setList] = useState<GroceryList | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  /** An error from a write, to show beside the list. */
  const [problem, setProblem] = useState<string | null>(null);
  /** What to say politely to a screen reader ("Moved paper towels to Pantry"). */
  const [announcement, setAnnouncement] = useState("");
  const [holding, setHolding] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const writes = useRef(0);
  const epoch = useRef(0);
  const loaded = useRef(false);
  /** `updatedAt` of the last whole list we took from the server, and whether we have written since (so the server's is newer). */
  const appliedAt = useRef(Number.NaN);
  const dirty = useRef(false);
  /** Per item and field, the number of the newest request that sends it. */
  const newest = useRef(new Map<string, number>());
  const requests = useRef(0);
  const scaling = useRef(new Set<string>());
  /** The requests of writes on their way, so a whole-list write can wait for them (see `replaceList`). */
  const inFlight = useRef(new Set<Promise<unknown>>());

  const adopt = useCallback((next: GroceryList) => {
    appliedAt.current = Date.parse(next.updatedAt);
    dirty.current = false;
    setList(next);
  }, []);

  const refresh = useCallback(() => {
    const started = epoch.current;
    return api.getGrocery().then(
      (next) => {
        if (epoch.current !== started || writes.current > 0) return;
        loaded.current = true;
        setLoadError(null);
        const at = Date.parse(next.updatedAt);
        if (at < appliedAt.current || (dirty.current && at === appliedAt.current)) return; // an older copy than ours
        adopt(next);
      },
      (e: unknown) => {
        if (!loaded.current) setLoadError(e); // a failed background refresh leaves the list as it was
      },
    );
  }, [adopt]);

  useEffect(() => {
    void refresh();
    const again = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(again, POLL_MS);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [refresh]);

  /** Runs a write; refreshes that overlap it are dropped. */
  const track = useCallback(async <T,>(op: () => Promise<T>): Promise<T> => {
    writes.current++;
    epoch.current++;
    setBusy(true);
    const sent = (async () => op())();
    inFlight.current.add(sent);
    try {
      const result = await sent;
      dirty.current = true; // the server's list is newer than the one we hold
      return result;
    } finally {
      inFlight.current.delete(sent);
      writes.current--;
      epoch.current++;
      setBusy(writes.current > 0);
    }
  }, []);

  /**
   * A write the server refused: undo what was shown, say so, and look again (two overlapping writes can leave the screen
   * unsure). Not found means someone else got there first: no undo and no message, the fresh list drops it.
   */
  const fail = useCallback(
    (e: unknown, undo?: () => void) => {
      if (!(e instanceof ApiError && e.status === 404)) {
        undo?.();
        setProblem(messageOf(e));
      }
      void refresh();
    },
    [refresh],
  );

  const patchItem = useCallback(
    async (item: GroceryItem, patch: ItemPatch, announce?: string) => {
      setProblem(null);
      const n = ++requests.current;
      const keys = Object.keys(patch) as (keyof ItemPatch)[];
      for (const k of keys) newest.current.set(`${item.id}/${k}`, n);
      /** Sets these fields on the item as it is now, but only those no later request has taken over. */
      const apply = (from: Partial<GroceryItem>) =>
        setList((l) => {
          const now = l?.items.find((i) => i.id === item.id);
          if (!l || !now) return l;
          const own = keys.filter((k) => newest.current.get(`${item.id}/${k}`) === n);
          return withItem(l, { ...now, ...Object.fromEntries(own.map((k) => [k, from[k]])) });
        });
      apply(patch);
      try {
        apply(await track(() => api.patchGroceryItem(item.id, patch)));
        if (announce) setAnnouncement(announce);
      } catch (e) {
        fail(e, () => apply(item));
      }
    },
    [track, fail],
  );

  const toggle = useCallback(
    (item: GroceryItem) => {
      if (!item.checked && !reducedMotion()) {
        setHolding((h) => new Set(h).add(item.id));
        setTimeout(() => setHolding((h) => new Set([...h].filter((id) => id !== item.id))), PENCIL_MS);
      }
      return patchItem(item, { checked: !item.checked });
    },
    [patchItem],
  );

  const move = useCallback(
    (item: GroceryItem, section: GrocerySection) =>
      section === item.section ? undefined : patchItem(item, { section }, `Moved ${item.name} to ${sectionLabel(section)}.`),
    [patchItem],
  );

  const setStaple = useCallback(
    (item: GroceryItem, staple: boolean) =>
      patchItem(item, { staple }, staple ? `${item.name} is now a staple.` : `${item.name} is no longer a staple.`),
    [patchItem],
  );

  const removeItem = useCallback(
    async (item: GroceryItem) => {
      setProblem(null);
      setList((l) => (l ? withoutItem(l, item.id) : l));
      try {
        await track(() => api.removeGroceryItem(item.id));
        setAnnouncement(`Removed ${item.name}.`);
      } catch (e) {
        fail(e, () => setList((l) => (l ? withItem(l, item) : l)));
      }
    },
    [track, fail],
  );

  /** Adds a manual item from typed text. Resolves true when it worked (the caller clears its field). */
  const addItem = useCallback(
    async (text: string) => {
      setProblem(null);
      try {
        const item = await track(() => api.addGroceryItem(text));
        setList((l) => (l ? withItem(l, item) : l));
        setAnnouncement(`Added ${text}.`);
        return true;
      } catch (e) {
        fail(e);
        return false;
      }
    },
    [track, fail],
  );

  /**
   * Whole-list writes (clear ticked, scale, remove a recipe) first wait for the writes already on their way to settle: a tick
   * shows at once while its PATCH is still in flight, and if the server handled "clear ticked" first the item would survive
   * and then be ticked on the list that came back. Still tracked while waiting, so the screen is busy and refreshes are dropped.
   */
  const replaceList = useCallback(
    async (op: () => Promise<GroceryList>, announce: (next: GroceryList) => string) => {
      setProblem(null);
      try {
        const next = await track(async () => {
          await Promise.allSettled(inFlight.current);
          return op();
        });
        adopt(next);
        setAnnouncement(announce(next));
      } catch (e) {
        fail(e);
      }
    },
    [track, fail, adopt],
  );

  /** One change at a time per recipe: a second tap while the first is still on its way is ignored (the stepper keeps focus). */
  const setScale = useCallback(
    async (recipeId: string, scale: number) => {
      if (scaling.current.has(recipeId)) return;
      scaling.current.add(recipeId);
      const title = (next: GroceryList) => next.recipes.find((r) => r.recipeId === recipeId)?.title ?? "Recipe";
      await replaceList(() => api.addGroceryRecipe(recipeId, scale), (next) => `${title(next)} is now ${scaleLabel(scale)}. The amounts are updated.`);
      scaling.current.delete(recipeId);
    },
    [replaceList],
  );
  const removeRecipe = useCallback(
    (recipeId: string, title: string) => replaceList(() => api.removeGroceryRecipe(recipeId), () => `Took ${title} off the list.`),
    [replaceList],
  );
  const clearChecked = useCallback(
    (count: number) => replaceList(() => api.clearGroceryChecked(), () => `Cleared ${count} ticked ${count === 1 ? "item" : "items"}.`),
    [replaceList],
  );

  // No wait here: emptying drops every item, so a tick that lands later finds none (or a 404, which `fail` ignores).
  const empty = useCallback(async () => {
    setProblem(null);
    try {
      await track(() => api.emptyGrocery());
      setList((l) => (l ? { ...l, recipes: [], items: [] } : l));
      setAnnouncement("The list is empty.");
    } catch (e) {
      fail(e);
    }
  }, [track, fail]);

  const dismissProblem = useCallback(() => setProblem(null), []);

  return { list, loadError, problem, dismissProblem, announcement, holding, busy, refresh, toggle, move, setStaple, removeItem, addItem, setScale, removeRecipe, clearChecked, empty };
}
