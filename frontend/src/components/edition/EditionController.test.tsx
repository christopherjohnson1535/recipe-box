import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDITION_KEY } from "@/lib/edition";
import { EditionController } from "./EditionController";

const theme = () => document.documentElement.dataset.theme;
const at = (h: number, m = 0, s = 0) => new Date(2026, 9, 23, h, m, s);
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  visibility = "visible";
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("EditionController", () => {
  it("switches to evening at the 19:00 boundary", () => {
    vi.setSystemTime(at(18, 59, 30));
    render(<EditionController />);
    expect(theme()).toBe("day");
    vi.advanceTimersByTime(29_000);
    expect(theme()).toBe("day");
    vi.advanceTimersByTime(2_000);
    expect(theme()).toBe("evening");
  });

  it("a manual day choice stays day through 19:00", () => {
    localStorage.setItem(EDITION_KEY, "day");
    vi.setSystemTime(at(18, 59, 30));
    render(<EditionController />);
    vi.advanceTimersByTime(40_000);
    expect(theme()).toBe("day");
  });

  it("re-applies when the tab becomes visible, the page is restored, or another tab changes the choice", () => {
    vi.setSystemTime(at(22));
    render(<EditionController />);
    expect(theme()).toBe("evening");
    visibility = "hidden";
    vi.setSystemTime(at(8)); // asleep overnight; timers did not run
    document.dispatchEvent(new Event("visibilitychange"));
    expect(theme()).toBe("evening"); // hidden: ignored
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(theme()).toBe("day");

    vi.setSystemTime(at(20));
    window.dispatchEvent(new Event("pageshow"));
    expect(theme()).toBe("evening");

    localStorage.setItem(EDITION_KEY, "day");
    window.dispatchEvent(new StorageEvent("storage", { key: EDITION_KEY }));
    expect(theme()).toBe("day");
  });

  it("removes its listeners and timer on unmount", () => {
    vi.setSystemTime(at(12));
    const { unmount } = render(<EditionController />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    document.documentElement.dataset.theme = "marker";
    for (const [target, type] of [[document, "visibilitychange"], [window, "pageshow"], [window, "storage"], [window, "rb-edition-change"]] as const) {
      target.dispatchEvent(new Event(type));
    }
    expect(theme()).toBe("marker");
  });
});
