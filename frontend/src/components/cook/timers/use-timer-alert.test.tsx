import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookMode } from "../CookMode";
import { CookTogether } from "../CookTogether";
import { RING_COUNT, UNLOCK_EVENTS, useTimerAlert } from "./use-timer-alert";
import { FIXED_NOW } from "@/test/clock";

/** A fake audio context: counts notes started and the ring's output node being cut. */
function fakeAudio() {
  const notes = vi.fn();
  const disconnect = vi.fn();
  const resume = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());
  const ctx = {
    currentTime: 0, destination: {}, state: "suspended" as string, close, resume,
    createOscillator: () => ({ frequency: {}, connect: (n: unknown) => n, start: notes, stop: vi.fn() }),
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n, disconnect }),
  };
  const Ctor = vi.fn(function () { return ctx; });
  vi.stubGlobal("AudioContext", Ctor);
  return { notes, disconnect, resume, close, ctx, Ctor };
}

const STEPS = ["Simmer 10 minutes.", "Rest 1 minute."];
const cook = () => render(<CookMode id="r-alert" title="Soup" ingredients={["1 onion"]} steps={STEPS} />);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("data-edition-pin");
});

describe("useTimerAlert", () => {
  it.each(["pointerup", "touchend", "click", "keydown"] as const)("makes and resumes the audio context on %s (a touch's pointerdown is not enough on iPad)", (type) => {
    expect(UNLOCK_EVENTS).toContain(type);
    const { Ctor, resume } = fakeAudio();
    renderHook(() => useTimerAlert());
    expect(Ctor).not.toHaveBeenCalled();
    window.dispatchEvent(new Event(type));
    expect(Ctor).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it("resumes an interrupted context when a timer rings and when the page is shown again (iOS after a lock)", () => {
    const { resume, ctx } = fakeAudio();
    const { result } = renderHook(() => useTimerAlert());
    fireEvent.click(window);
    ctx.state = "interrupted";
    resume.mockClear();
    act(() => result.current.ring());
    expect(resume).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(resume).toHaveBeenCalledTimes(2);
    ctx.state = "running";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(resume).toHaveBeenCalledTimes(2); // nothing to do while it runs
  });

  it("takes a refused resume quietly (no gesture yet)", async () => {
    const { resume } = fakeAudio();
    resume.mockImplementation(() => Promise.reject(new Error("NotAllowedError")));
    renderHook(() => useTimerAlert());
    fireEvent.click(window);
    await Promise.resolve(); // the rejection is caught, so vitest sees no unhandled rejection
    expect(resume).toHaveBeenCalled();
  });

  it("on unmount closes the context, stops a buzz and stops listening", () => {
    const { close, Ctor } = fakeAudio();
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const { unmount } = renderHook(() => useTimerAlert());
    fireEvent.click(window);
    unmount();
    expect(close).toHaveBeenCalled();
    expect(vibrate).toHaveBeenLastCalledWith(0);
    fireEvent.click(window);
    expect(Ctor).toHaveBeenCalledTimes(1); // no listener left to make another
  });

  it("rings a chime several times and buzzes, and stop silences both", () => {
    const { notes, disconnect } = fakeAudio();
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const { result } = renderHook(() => useTimerAlert());
    expect(result.current.supported).toBe(true);
    act(() => result.current.ring());
    expect(notes).not.toHaveBeenCalled(); // no tap yet: the browser would keep it silent
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0]).toEqual([expect.arrayContaining([400, 150, 400])]);

    fireEvent.pointerDown(window);
    act(() => result.current.ring());
    expect(notes).toHaveBeenCalledTimes(3 * RING_COUNT);
    act(() => result.current.stop());
    expect(disconnect).toHaveBeenCalled();
    expect(vibrate).toHaveBeenLastCalledWith(0);
  });

  it("stays quiet when muted, but still buzzes, and remembers the choice on this device", () => {
    const { notes } = fakeAudio();
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    const { result } = renderHook(() => useTimerAlert());
    fireEvent.pointerDown(window);
    act(() => result.current.setMuted(true));
    expect(localStorage.getItem("cook-sound")).toBe("off");
    expect(result.current.muted).toBe(true);
    act(() => result.current.ring());
    expect(notes).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalled();
    act(() => result.current.setMuted(false));
    expect(notes).toHaveBeenCalledTimes(1); // one soft note says the sound is back
    expect(localStorage.getItem("cook-sound")).toBe("on");
  });

  it("offers the sound switch only where there is sound: vibration alone has nothing to mute", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("navigator", { ...navigator, vibrate: vi.fn(() => true) });
    expect(renderHook(() => useTimerAlert()).result.current.supported).toBe(false);
  });

  it("does nothing, without throwing, where there is neither sound nor vibration", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });
    const { result } = renderHook(() => useTimerAlert());
    expect(result.current.supported).toBe(false);
    fireEvent.pointerDown(window);
    act(() => {
      result.current.ring();
      result.current.stop();
    });
  });

  it("survives a vibrate that throws (some browsers refuse it outside a gesture)", () => {
    fakeAudio();
    vi.stubGlobal("navigator", { ...navigator, vibrate: () => { throw new Error("blocked"); } });
    const { result } = renderHook(() => useTimerAlert());
    act(() => {
      result.current.ring();
      result.current.stop();
    });
  });
});

describe("timer alert in cook mode", () => {
  it("rings when a timer ends, goes quiet on Dismiss, and the sound switch mutes the next one", () => {
    const { notes, disconnect } = fakeAudio();
    cook();
    fireEvent.pointerDown(window);
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(notes).toHaveBeenCalledTimes(3 * RING_COUNT);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss timer/ }));
    expect(disconnect).toHaveBeenCalled();

    const sound = screen.getByRole("button", { name: "Timer sound on" });
    expect(sound.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(sound);
    expect(screen.getByRole("button", { name: "Timer sound off" }).getAttribute("aria-pressed")).toBe("false");
    notes.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 1 minute" }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status").textContent).toContain("Timer finished: Step 2 · 1 min");
    expect(notes).not.toHaveBeenCalled();
  });

  it("keeps ringing while another finished timer is still up, and stops with the last", () => {
    const { disconnect } = fakeAudio();
    cook();
    fireEvent.pointerDown(window);
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 1 minute" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    const dismiss = () => screen.getAllByRole("button", { name: /Dismiss timer/ });
    expect(dismiss()).toHaveLength(2);
    fireEvent.click(dismiss()[0]);
    expect(disconnect).not.toHaveBeenCalled();
    fireEvent.click(dismiss()[0]);
    expect(disconnect).toHaveBeenCalled();
  });

  it("hides the sound switch where the browser cannot play sound", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("navigator", { ...navigator, vibrate: vi.fn(() => true) });
    cook();
    expect(screen.queryByRole("button", { name: /Timer sound/ })).toBeNull();
  });

  it("restarts a finished chip's timer with a tap, as a fresh timer", () => {
    const { disconnect } = fakeAudio();
    cook();
    fireEvent.pointerDown(window);
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(within(screen.getByRole("group", { name: "Step 1 · 10 min" })).getByText("Done")).toBeTruthy();
    expect(disconnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    expect(disconnect).toHaveBeenCalled(); // the old timer's ring ends with it
    expect(screen.getAllByRole("group", { name: "Step 1 · 10 min" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Timer running: 10 minutes" }).getAttribute("aria-disabled")).toBe("true");
    expect(within(screen.getByRole("group", { name: "Step 1 · 10 min" })).getByText("10:00")).toBeTruthy();
  });
});

describe("timer alert cooking together", () => {
  it("shows the sound switch and rings for a dish's timer while the cook is on another dish", () => {
    const { notes } = fakeAudio();
    render(
      <CookTogether
        dishes={[
          { id: "a", title: "Salad", ingredients: [], steps: ["Chill for 20 minutes."] },
          { id: "b", title: "Roast", ingredients: [], steps: ["Season.", "Roast 90 minutes."] },
        ]}
      />,
    );
    fireEvent.pointerDown(window);
    expect(screen.getByRole("button", { name: "Timer sound on" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 20 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    act(() => void vi.advanceTimersByTime(20 * 60_000));
    expect(screen.getByRole("status").textContent).toContain("Timer finished: Salad · Step 1 · 20 min");
    expect(notes).toHaveBeenCalledTimes(3 * RING_COUNT);
  });
});

describe("finished timer, reduced motion", () => {
  const accent = () => screen.getByRole("group", { name: "Step 1 · 10 min" }).querySelector(".bg-accent");
  it("blinks every 600 ms by default", () => {
    fakeAudio();
    cook();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    const seen = new Set<boolean>();
    for (let i = 0; i < 4; i++) {
      seen.add(accent() !== null);
      act(() => void vi.advanceTimersByTime(600));
    }
    expect([...seen].sort()).toEqual([false, true]);
  });
  it("holds the accent without blinking when the person asked for reduced motion", () => {
    fakeAudio();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion"), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    cook();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    for (let i = 0; i < 4; i++) {
      expect(accent()).not.toBeNull();
      act(() => void vi.advanceTimersByTime(600));
    }
  });
});

describe("two chips with the same time in one step", () => {
  it("are two timers, labelled apart", () => {
    fakeAudio();
    render(<CookMode id="r-twins" title="Steak" ingredients={[]} steps={["Sear 3 minutes, flip, then sear 3 minutes more."]} />);
    for (const chip of screen.getAllByRole("button", { name: "Start timer: 3 minutes" })) fireEvent.click(chip);
    expect(screen.getByRole("group", { name: "Step 1 · 3 min (1st)" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Step 1 · 3 min (2nd)" })).toBeTruthy();
  });
});
