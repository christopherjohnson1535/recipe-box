import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./use-wake-lock";

function fakeLock() {
  const handlers: (() => void)[] = [];
  const sentinel = { release: vi.fn(() => Promise.resolve()), addEventListener: (_: string, h: () => void) => void handlers.push(h) };
  return { sentinel, handlers, fire: () => handlers.forEach((h) => h()) };
}
const setVisibility = (state: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};
afterEach(() => setVisibility("visible"));

describe("useWakeLock", () => {
  it("is unsupported without navigator.wakeLock", async () => {
    vi.stubGlobal("navigator", {});
    const { result } = renderHook(() => useWakeLock());
    expect(result.current).toBe("unsupported");
  });

  it("requests a screen lock, re-requests after the system releases it, and releases on unmount", async () => {
    const locks = [fakeLock(), fakeLock()];
    const types: string[] = [];
    const request = vi.fn((type: string) => (types.push(type), Promise.resolve(locks[types.length - 1].sentinel)));
    vi.stubGlobal("navigator", { wakeLock: { request } });
    const { result, unmount } = renderHook(() => useWakeLock());
    await act(async () => {});
    expect(types).toEqual(["screen"]);
    expect(result.current).toBe("on");

    act(() => locks[0].fire()); // iOS lets go on its own
    expect(result.current).toBe("off");
    await act(async () => void setVisibility("visible"));
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current).toBe("on");

    unmount();
    expect(locks[1].sentinel.release).toHaveBeenCalled();
  });

  it("does not ask while the page is hidden, and asks when it shows", async () => {
    const lock = fakeLock();
    const request = vi.fn(() => Promise.resolve(lock.sentinel));
    vi.stubGlobal("navigator", { wakeLock: { request } });
    setVisibility("hidden");
    const { result } = renderHook(() => useWakeLock());
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    expect(result.current).toBe("off");
    await act(async () => void setVisibility("visible"));
    expect(result.current).toBe("on");
  });

  it("is off when the request is refused", async () => {
    vi.stubGlobal("navigator", { wakeLock: { request: () => Promise.reject(new Error("NotAllowedError")) } });
    const { result } = renderHook(() => useWakeLock());
    await act(async () => {});
    expect(result.current).toBe("off");
  });

  it("releases a lock that arrives after unmount", async () => {
    const lock = fakeLock();
    let resolve!: (s: typeof lock.sentinel) => void;
    vi.stubGlobal("navigator", { wakeLock: { request: () => new Promise((r) => (resolve = r)) } });
    const { unmount } = renderHook(() => useWakeLock());
    unmount();
    await act(async () => resolve(lock.sentinel));
    expect(lock.sentinel.release).toHaveBeenCalled();
  });
});
