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
});
