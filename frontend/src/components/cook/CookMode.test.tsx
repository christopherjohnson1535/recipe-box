import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookMode } from "./CookMode";
import { FIXED_NOW } from "@/test/clock";

const INGREDIENTS = ["1 large onion, diced", "2 carrots, diced", "2 cups dry red wine"];
const STEPS = ["Cook the onion until soft, about 10 minutes.", "Add the wine and simmer.", "Serve."];
const view = () => render(<CookMode id="r1" title="Braised Short Ribs" ingredients={INGREDIENTS} steps={STEPS} />);
const lit = () => screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-lit") === "true").map((li) => li.textContent);

beforeEach(() => vi.useFakeTimers({ now: FIXED_NOW, toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] }));
afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("CookMode", () => {
  it("shows one step, lights its ingredients and previews the next", () => {
    view();
    expect(document.documentElement.dataset.theme).toBe("evening");
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(lit()).toEqual([expect.stringContaining("onion")]);
    expect(screen.getByText(/Add the wine and simmer/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Back/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves with the buttons and the arrow keys, and ends on Finish", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(lit()).toEqual([expect.stringContaining("wine")]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("Step 3 of 3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe("/recipes/r1");
    expect(screen.getByText("Last step")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
  });

  it("moves on a swipe", () => {
    view();
    const step = screen.getByText("Step 1 of 3").parentElement as HTMLElement;
    fireEvent.touchStart(step, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(step, { changedTouches: [{ clientX: 200, clientY: 105 }] });
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });

  it("keeps timers running across steps, finishes them and announces it", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    expect(screen.getByText("10:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText("9:00")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(9 * 60_000));
    expect(screen.getByText("Done")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Timer finished: Step 1: 10 minutes");
    fireEvent.click(screen.getByRole("button", { name: /Dismiss timer/ }));
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("chimes only after a gesture", () => {
    const start = vi.fn();
    const ctx = {
      currentTime: 0, destination: {}, close: vi.fn(),
      createOscillator: () => ({ frequency: {}, connect: (n: unknown) => n, start, stop: vi.fn() }),
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n }),
    };
    vi.stubGlobal("AudioContext", function () { return ctx; });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(start).not.toHaveBeenCalled();

    fireEvent.pointerDown(window);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss timer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(start).toHaveBeenCalled();
  });

  it("hides the voice toggle without speech recognition and offers it with", () => {
    const { unmount } = view();
    expect(screen.queryByRole("button", { name: /Voice off/ })).toBeNull();
    unmount();
    class Rec {
      continuous = false; interimResults = false; onresult = null; onend = null; onerror = null;
      start() {} stop() {}
    }
    vi.stubGlobal("webkitSpeechRecognition", Rec);
    view();
    fireEvent.click(screen.getByRole("button", { name: /Voice off/ }));
    expect(screen.getByRole("button", { name: /Listening/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("has empty states", () => {
    const { unmount } = render(<CookMode id="r1" title="T" ingredients={[]} steps={["Stir."]} />);
    expect(screen.getByText("No ingredients listed.")).toBeTruthy();
    unmount();
    render(<CookMode id="r1" title="T" ingredients={INGREDIENTS} steps={[]} />);
    expect(screen.getByRole("heading", { name: "This recipe has no steps yet" })).toBeTruthy();
  });
});
