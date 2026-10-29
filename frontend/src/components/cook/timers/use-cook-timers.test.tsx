import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookMode } from "../CookMode";
import { RING_COUNT } from "./use-timer-alert";
import { useCookTimers } from "./use-cook-timers";
import { FIXED_NOW } from "@/test/clock";

/** A fake audio context: counts notes started and the ring's output node being cut. */
function fakeAudio() {
  const notes = vi.fn();
  const disconnect = vi.fn();
  const ctx = {
    currentTime: 0, destination: {}, state: "running", close: vi.fn(() => Promise.resolve()), resume: vi.fn(() => Promise.resolve()),
    createOscillator: () => ({ frequency: {}, connect: (n: unknown) => n, start: notes, stop: vi.fn() }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n, disconnect }),
  };
  vi.stubGlobal("AudioContext", vi.fn(function () { return ctx; }));
  return { notes, disconnect };
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const group = (name: string) => within(screen.getByRole("group", { name }));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("data-edition-pin");
});

describe("timer controls in cook mode", () => {
  const cook = () => render(<CookMode id="r-pause" title="Soup" ingredients={[]} steps={["Simmer 10 minutes."]} />);
  const startTimer = () => fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));

  it("pauses at the exact time left, stays silent for as long as it is paused, and carries on from there", () => {
    const { notes } = fakeAudio();
    cook();
    fireEvent.pointerDown(window);
    startTimer();
    advance(60_000);
    expect(group("Step 1 · 10 min").getByText("9:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer: Step 1 · 10 min" }));
    advance(30 * 60_000);
    expect(group("Step 1 · 10 min").getByText("9:00")).toBeTruthy();
    expect(group("Step 1 · 10 min").getByText("Paused")).toBeTruthy();
    expect(notes).not.toHaveBeenCalled();
    // The chip in the step shows the frozen time and starting it again does nothing.
    expect(screen.getByRole("button", { name: "Timer running: 10 minutes" }).textContent).toContain("9:00");
    fireEvent.click(screen.getByRole("button", { name: "Timer running: 10 minutes" }));
    expect(screen.getAllByRole("group", { name: "Step 1 · 10 min" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Resume timer: Step 1 · 10 min" }));
    expect(screen.queryByText("Paused")).toBeNull();
    advance(60_000);
    expect(group("Step 1 · 10 min").getByText("8:00")).toBeTruthy();
    advance(8 * 60_000);
    expect(notes).toHaveBeenCalledTimes(3 * RING_COUNT);
  });

  it("adds a minute to a running timer, a paused one and a finished one", () => {
    fakeAudio();
    cook();
    startTimer();
    advance(1000);
    fireEvent.click(screen.getByRole("button", { name: "Add a minute: Step 1 · 10 min" }));
    expect(group("Step 1 · 10 min").getByText("10:59")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Pause timer: Step 1 · 10 min" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a minute: Step 1 · 10 min" }));
    expect(group("Step 1 · 10 min").getByText("11:59")).toBeTruthy();
    expect(group("Step 1 · 10 min").getByText("Paused")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume timer: Step 1 · 10 min" }));
    advance(11 * 60_000 + 59_000);
    expect(group("Step 1 · 10 min").getByText("Done")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Pause|Resume) timer/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a minute: Step 1 · 10 min" }));
    expect(group("Step 1 · 10 min").getByText("1:00")).toBeTruthy();
    expect(screen.getAllByRole("group", { name: "Step 1 · 10 min" })).toHaveLength(1);
  });

  it("labels every control and makes each at least 44px", () => {
    fakeAudio();
    cook();
    startTimer();
    for (const name of ["Pause timer: Step 1 · 10 min", "Add a minute: Step 1 · 10 min", "Cancel timer: Step 1 · 10 min"]) {
      expect(screen.getByRole("button", { name }).className).toContain("min-h-control min-w-control");
    }
  });
});

describe("useCookTimers pause and +1 minute", () => {
  const setup = () => {
    const audio = fakeAudio();
    const announce = vi.fn();
    const hook = renderHook(() => useCookTimers(announce));
    fireEvent.pointerDown(window); // the first tap makes the audio context
    act(() => hook.result.current.start("a", "Soup", 60));
    return { ...audio, announce, hook };
  };
  const finished = (announce: ReturnType<typeof vi.fn>) => announce.mock.calls.filter(([text]) => text === "Timer finished: Soup").length;

  it("announces and rings again when a timer finishes again after +1 minute, and +1 on the only finished timer quiets the first ring", () => {
    const { announce, notes, disconnect, hook } = setup();
    advance(60_000);
    expect(finished(announce)).toBe(1);
    expect(notes).toHaveBeenCalledTimes(3 * RING_COUNT);
    expect(disconnect).not.toHaveBeenCalled();

    act(() => hook.result.current.addMinute(hook.result.current.timers[0].id));
    expect(disconnect).toHaveBeenCalled();
    expect(hook.result.current.timers[0].done).toBe(false);
    advance(59_000);
    expect(finished(announce)).toBe(1);
    advance(1000);
    expect(finished(announce)).toBe(2);
    expect(notes).toHaveBeenCalledTimes(2 * 3 * RING_COUNT);
  });

  it("keeps ringing when +1 minute is pressed on one finished timer while another is still finished", () => {
    const { hook, disconnect } = setup();
    act(() => hook.result.current.start("b", "Rice", 60));
    advance(60_000);
    expect(hook.result.current.timers.filter((t) => t.done)).toHaveLength(2);
    act(() => hook.result.current.addMinute(hook.result.current.timers[0].id));
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("stops ticking while the only timer is paused, and starts again when it resumes", () => {
    const { hook } = setup();
    expect(hook.result.current.running).toBe(true);
    act(() => hook.result.current.pause(1));
    expect(hook.result.current.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    act(() => hook.result.current.resume(1));
    expect(hook.result.current.running).toBe(true);
  });
});
