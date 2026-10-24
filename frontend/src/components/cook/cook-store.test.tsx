import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCookTicks, useCookView } from "./cook-store";

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
