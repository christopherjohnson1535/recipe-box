"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { scaleIngredient } from "@/lib/scale";
import { useSessionString } from "./session-store";

type RecipeState = {
  ticked: ReadonlySet<number>;
  toggle: (index: number) => void;
  scale: number;
  setScale: (scale: number) => void;
  /** True once the reader has rescaled: only then do quantities fade (not on first paint). */
  rescaled: boolean;
};

const Ctx = createContext<RecipeState | null>(null);

function useRecipeState(): RecipeState {
  const state = useContext(Ctx);
  if (!state) throw new Error("recipe state used outside <RecipeStateProvider>");
  return state;
}

function parseTicks(raw: string | null): Set<number> {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((n): n is number => Number.isInteger(n)) : []);
  } catch {
    return new Set();
  }
}

/** Which ingredients are ticked and the scale, for one recipe, kept in sessionStorage (`recipe-ticks:<id>`, `recipe-scale:<id>`). */
export function RecipeStateProvider({ id, children }: { id: string; children: ReactNode }) {
  const [rawTicks, writeTicks] = useSessionString(`recipe-ticks:${id}`);
  const [rawScale, writeScale] = useSessionString(`recipe-scale:${id}`);
  const [rescaled, setRescaled] = useState(false);
  const ticked = useMemo(() => parseTicks(rawTicks), [rawTicks]);
  const scale = [0.5, 1, 2].includes(Number(rawScale)) ? Number(rawScale) : 1;

  const toggle = useCallback(
    (index: number) => {
      const next = new Set(ticked);
      if (!next.delete(index)) next.add(index);
      writeTicks(JSON.stringify([...next].sort((a, b) => a - b)));
    },
    [ticked, writeTicks],
  );
  const setScale = useCallback(
    (value: number) => {
      setRescaled(true);
      writeScale(String(value));
    },
    [writeScale],
  );

  const value = useMemo(() => ({ ticked, toggle, scale, setScale, rescaled }), [ticked, toggle, scale, setScale, rescaled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { useRecipeState };

/** The servings string at the current scale ("4" → "8"), for the numerals band. */
export function ScaledServings({ servings }: { servings: string }) {
  return <>{scaleIngredient(servings, useRecipeState().scale)}</>;
}
