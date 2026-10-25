"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { groceryApi } from "./client";
import { sectionLabel, withItem, withoutItem } from "./list-model";
import type { GroceryItem, GroceryList, GrocerySection, ItemPatch } from "./types";

/** How often a visible list asks the server again, so two people in one shop see each other's ticks. */
export const POLL_MS = 20_000;
/** How long a just-ticked item stays in place while the line is drawn through it, before it sinks (motion.css: --duration-morph). */
export const PENCIL_MS = 600;

const reducedMotion = () => typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/**
 * The household's grocery list: loads it, keeps it fresh (window focus, tab visible, every 20 s while visible) and offers
 * the writes. Ticks, moves, staples and removals show at once and roll back with a message if the server refuses.
 * A refresh that started before a write finished is dropped, so it can't undo what you just did.
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

  const refresh = useCallback(() => {
    const started = epoch.current;
    return groceryApi.get().then(
      (next) => {
        if (epoch.current !== started || writes.current > 0) return;
        loaded.current = true;
        setList(next);
        setLoadError(null);
      },
      (e: unknown) => {
        if (!loaded.current) setLoadError(e); // a failed background refresh leaves the list as it was
      },
    );
  }, []);

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
    try {
      return await op();
    } finally {
      writes.current--;
      epoch.current++;
      setBusy(writes.current > 0);
    }
  }, []);

  const fail = useCallback(
    (e: unknown) => {
      setProblem(messageOf(e));
      if (e instanceof ApiError && e.status === 404) void refresh(); // someone else already removed it
    },
    [refresh],
  );

  const patchItem = useCallback(
    async (item: GroceryItem, patch: ItemPatch, announce?: string) => {
      setProblem(null);
      const apply = (fields: Partial<GroceryItem>) => setList((l) => (l ? withItem(l, { ...item, ...fields }) : l));
      apply(patch);
      try {
        const saved = await track(() => groceryApi.patchItem(item.id, patch));
        setList((l) => (l ? withItem(l, saved) : l));
        if (announce) setAnnouncement(announce);
      } catch (e) {
        apply({ checked: item.checked, section: item.section, staple: item.staple });
        fail(e);
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
      patchItem(item, { staple }, staple ? `${item.name} is now a staple and hidden.` : `${item.name} is no longer a staple.`),
    [patchItem],
  );

  const removeItem = useCallback(
    async (item: GroceryItem) => {
      setProblem(null);
      setList((l) => (l ? withoutItem(l, item.id) : l));
      try {
        await track(() => groceryApi.removeItem(item.id));
        setAnnouncement(`Removed ${item.name}.`);
      } catch (e) {
        setList((l) => (l ? withItem(l, item) : l));
        fail(e);
      }
    },
    [track, fail],
  );

  /** Adds a manual item from typed text. Resolves true when it worked (the caller clears its field). */
  const addItem = useCallback(
    async (text: string) => {
      setProblem(null);
      try {
        const item = await track(() => groceryApi.addItem(text));
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

  const replaceList = useCallback(
    async (op: () => Promise<GroceryList>, announce: (next: GroceryList) => string) => {
      setProblem(null);
      try {
        const next = await track(op);
        setList(next);
        setAnnouncement(announce(next));
      } catch (e) {
        fail(e);
      }
    },
    [track, fail],
  );

  const setScale = useCallback(
    (recipeId: string, scale: number) => replaceList(() => groceryApi.addRecipe(recipeId, scale), () => "Servings changed. The amounts are updated."),
    [replaceList],
  );
  const removeRecipe = useCallback(
    (recipeId: string, title: string) => replaceList(() => groceryApi.removeRecipe(recipeId), () => `Took ${title} off the list.`),
    [replaceList],
  );
  const clearChecked = useCallback(
    (count: number) => replaceList(() => groceryApi.clearChecked(), () => `Cleared ${count} ticked ${count === 1 ? "item" : "items"}.`),
    [replaceList],
  );

  const empty = useCallback(async () => {
    setProblem(null);
    try {
      await track(() => groceryApi.empty());
      setList((l) => (l ? { ...l, recipes: [], items: [] } : l));
      setAnnouncement("The list is empty.");
    } catch (e) {
      fail(e);
    }
  }, [track, fail]);

  return { list, loadError, problem, announcement, holding, busy, refresh, toggle, move, setStaple, removeItem, addItem, setScale, removeRecipe, clearChecked, empty };
}
