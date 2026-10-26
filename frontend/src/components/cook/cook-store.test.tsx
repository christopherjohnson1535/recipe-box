import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readCookTicks, readCookTogetherOrder, useCookTicks, useCookTogetherOrder, useCookTogetherView, useCookView, useDishTicks } from "./cook-store";
import { interleave, serialiseOrder } from "./cook-together-logic";

beforeEach(() => localStorage.clear());

describe("cook store", () => {
  it("defaults to one step and remembers all steps", () => {
    const { result } = renderHook(() => useCookView());
    expect(result.current[0]).toBe("one");
    act(() => result.current[1]("all"));
    expect(result.current[0]).toBe("all");
    expect(localStorage.getItem("cook-view")).toBe("all");
  });

  it("falls back to memory when storage throws", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); } });
    const { result } = renderHook(() => useCookTicks("throws", 2, 2));
    act(() => result.current.toggleStep(1));
    expect(result.current.ticks.steps).toEqual(new Set([1]));
    act(() => result.current.clear());
    expect(result.current.ticks.steps.size).toBe(0);
  });

  it("keeps ticks in memory once a write fails, even when reads still work", () => {
    const stored = JSON.stringify({ v: 1, at: Date.now(), ingredients: [], steps: [0] });
    vi.stubGlobal("localStorage", { getItem: () => stored, setItem: () => { throw new Error("quota"); } });
    const { result } = renderHook(() => useCookTicks("write-fails", 2, 2));
    expect(result.current.ticks.steps).toEqual(new Set([0]));
    act(() => result.current.toggleStep(1));
    expect(result.current.ticks.steps).toEqual(new Set([0, 1]));
    vi.unstubAllGlobals();
  });

  it("re-reads when another tab changes the ticks", () => {
    const { result } = renderHook(() => useCookTicks("two-tabs", 3, 3));
    act(() => result.current.toggleIngredient(0));
    localStorage.setItem("cook-ticks:two-tabs", JSON.stringify({ v: 1, at: Date.now(), ingredients: [0, 2], steps: [] }));
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: "cook-ticks:two-tabs" })));
    expect(result.current.ticks.ingredients).toEqual(new Set([0, 2]));
    act(() => result.current.toggleIngredient(1));
    expect(result.current.ticks.ingredients).toEqual(new Set([0, 1, 2]));
  });
});

describe("cook together store", () => {
  const ids = ["a", "b"];
  const counts = [2, 2];
  const swapped = [{ dish: 1, step: 0 }, { dish: 0, step: 0 }, { dish: 0, step: 1 }, { dish: 1, step: 1 }];

  it("defaults the view to one and remembers the others", () => {
    const { result } = renderHook(() => useCookTogetherView());
    expect(result.current[0]).toBe("one");
    act(() => result.current[1]("dishes"));
    expect(result.current[0]).toBe("dishes");
    expect(localStorage.getItem("cook-together-view")).toBe("dishes");
    localStorage.setItem("cook-together-view", "junk");
    act(() => void window.dispatchEvent(new StorageEvent("storage")));
    expect(result.current[0]).toBe("one");
  });

  it("starts round-robin, keeps a saved order across a re-mount and resets", () => {
    const first = renderHook(() => useCookTogetherOrder(ids, counts));
    expect(first.result.current.order).toEqual(interleave(counts));
    act(() => first.result.current.setOrder(swapped));
    expect(first.result.current.order).toEqual(swapped);
    expect(localStorage.getItem("cook-together:a,b")).toContain('"order":[[1,0],[0,0],[0,1],[1,1]]');
    first.unmount();
    const again = renderHook(() => useCookTogetherOrder(ids, counts));
    expect(again.result.current.order).toEqual(swapped);
    expect(readCookTogetherOrder(ids, counts)).toEqual(swapped);
    act(() => again.result.current.reset());
    expect(again.result.current.order).toEqual(interleave(counts));
  });

  it("keeps the same order object while the stored text is unchanged", () => {
    const { result, rerender } = renderHook(() => useCookTogetherOrder(ids, [...counts]));
    act(() => result.current.setOrder(swapped));
    const before = result.current.order;
    rerender();
    expect(result.current.order).toBe(before);
  });

  it("falls back to round-robin for a stale, invalid or outdated stored order", () => {
    const stale = serialiseOrder(swapped, Date.now() - 13 * 60 * 60 * 1000);
    localStorage.setItem("cook-together:a,b", stale);
    expect(renderHook(() => useCookTogetherOrder(ids, counts)).result.current.order).toEqual(interleave(counts));
    expect(readCookTogetherOrder(ids, counts)).toEqual(interleave(counts));
    localStorage.setItem("cook-together:a,b", serialiseOrder(swapped, Date.now()));
    expect(renderHook(() => useCookTogetherOrder(ids, [2, 3])).result.current.order).toEqual(interleave([2, 3]));
    localStorage.setItem("cook-together:a,b", "not json");
    expect(renderHook(() => useCookTogetherOrder(ids, counts)).result.current.order).toEqual(interleave(counts));
  });

  describe("dish ticks", () => {
    const dishes = [{ id: "a", ingredientCount: 3, stepCount: 2 }, { id: "b", ingredientCount: 1, stepCount: 4 }];

    it("starts with no ticks for each dish", () => {
      const { result } = renderHook(() => useDishTicks(dishes));
      expect(result.current.ticks).toHaveLength(2);
      expect(result.current.ticks[0].steps.size).toBe(0);
    });

    it("writes each recipe's own cook-ticks key, shared with single cook mode", () => {
      const { result } = renderHook(() => useDishTicks(dishes));
      act(() => result.current.toggleStep(1, 3));
      act(() => result.current.toggleIngredient(0, 2));
      expect(result.current.ticks[1].steps).toEqual(new Set([3]));
      expect(result.current.ticks[0].ingredients).toEqual(new Set([2]));
      expect(readCookTicks("b", 1, 4).steps).toEqual(new Set([3]));
      expect(readCookTicks("a", 3, 2).ingredients).toEqual(new Set([2]));
      act(() => result.current.toggleStep(1, 3));
      expect(result.current.ticks[1].steps.size).toBe(0);
    });

    it("sees ticks written by single-recipe cook mode and keeps them stable between renders", () => {
      const single = renderHook(() => useCookTicks("a", 3, 2));
      act(() => single.result.current.toggleStep(0));
      const { result, rerender } = renderHook(() => useDishTicks(dishes.map((d) => ({ ...d }))));
      expect(result.current.ticks[0].steps).toEqual(new Set([0]));
      const before = result.current.ticks;
      rerender();
      expect(result.current.ticks).toBe(before);
    });

    it("clears every dish", () => {
      const { result } = renderHook(() => useDishTicks(dishes));
      act(() => result.current.toggleStep(0, 0));
      act(() => result.current.toggleStep(1, 1));
      act(() => result.current.clearAll());
      expect(result.current.ticks.every((t) => t.steps.size === 0 && t.ingredients.size === 0)).toBe(true);
      expect(readCookTicks("b", 1, 4).steps.size).toBe(0);
    });
  });
});
