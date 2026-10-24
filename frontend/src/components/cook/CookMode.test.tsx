import { renderToString } from "react-dom/server";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookMode } from "./CookMode";
import { EditionController } from "@/components/edition/EditionController";
import { EDITION_EVENT } from "@/lib/edition";
import { FIXED_NOW } from "@/test/clock";

const INGREDIENTS = ["1 large onion, diced", "2 carrots, diced", "2 cups dry red wine"];
const STEPS = ["Cook the onion until soft, about 10 minutes.", "Add the wine and simmer.", "Serve."];
const view = () => render(<CookMode id="r1" title="Braised Short Ribs" ingredients={INGREDIENTS} steps={STEPS} />);
const lit = () => screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-lit") === "true").map((li) => li.textContent);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("data-edition-pin");
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
    expect(within(screen.getByRole("group", { name: "Step 1 · 10 min" })).getByText("Done")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Timer finished: Step 1 · 10 min");
    fireEvent.click(screen.getByRole("button", { name: /Dismiss timer/ }));
    expect(screen.queryByRole("group", { name: "Step 1 · 10 min" })).toBeNull();
  });

  it("makes and resumes the audio context in a gesture, chimes on it later, and closes it on unmount", () => {
    const start = vi.fn();
    const ctx = {
      currentTime: 0, destination: {}, state: "suspended", close: vi.fn(), resume: vi.fn(),
      createOscillator: () => ({ frequency: {}, connect: (n: unknown) => n, start, stop: vi.fn() }),
      createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: (n: unknown) => n }),
    };
    const Ctor = vi.fn(function () { return ctx; });
    vi.stubGlobal("AudioContext", Ctor);
    const { unmount } = view();
    expect(Ctor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(start).not.toHaveBeenCalled(); // no gesture yet, so no sound

    fireEvent.pointerDown(window);
    expect(Ctor).toHaveBeenCalledTimes(1);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss timer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    act(() => void vi.advanceTimersByTime(10 * 60_000));
    expect(start).toHaveBeenCalled();
    expect(Ctor).toHaveBeenCalledTimes(1);
    unmount();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("stays evening through edition events and gives the person's edition back on unmount", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    localStorage.setItem("rb-edition", "day");
    render(<EditionController />);
    expect(document.documentElement.dataset.theme).toBe("day");
    const { unmount } = view();
    expect(document.documentElement.dataset.theme).toBe("evening");
    act(() => void window.dispatchEvent(new Event(EDITION_EVENT)));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    act(() => void window.dispatchEvent(new Event("pageshow")));
    expect(document.documentElement.dataset.theme).toBe("evening");
    unmount();
    expect(document.documentElement.dataset.theme).toBe("day");
    localStorage.clear();
  });

  it("is a modal dialog: the app around it is inert while it is open", () => {
    const chrome = document.body.appendChild(document.createElement("nav"));
    const { unmount } = view();
    const dialog = screen.getByRole("dialog", { name: "Cooking mode" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(chrome.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(dialog);
    unmount();
    expect(chrome.hasAttribute("inert")).toBe(false);
    chrome.remove();
  });

  it("swipes anywhere on the stage except on a control, and ignores pinches, vertical moves and cancels", () => {
    view();
    const stage = screen.getByRole("dialog");
    const swipeBy = (el: Element, dx: number, dy = 0, touches = 1) => {
      fireEvent.touchStart(el, { touches: Array.from({ length: touches }, () => ({ clientX: 300, clientY: 100 })) });
      fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: 300 + dx, clientY: 100 + dy }] });
    };
    swipeBy(screen.getByText("Step 1 of 3"), 0, 200);
    swipeBy(stage, -200, 0, 2);
    fireEvent.touchStart(stage, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchCancel(stage);
    fireEvent.touchEnd(stage, { touches: [], changedTouches: [{ clientX: 100, clientY: 100 }] });
    swipeBy(screen.getByRole("button", { name: /Next step/ }), -200);
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    swipeBy(screen.getByRole("heading", { name: "For this step" }), -200); // the rail, not the step text
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });

  it("announces a step change", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
    expect(screen.getByRole("status").textContent).toContain("Step 2 of 3: Add the wine and simmer.");
  });

  it("ignores held keys and keys typed in a field", () => {
    view();
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    const input = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(input, { key: "ArrowRight" });
    input.remove();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
  });

  it("starts one timer for a double tap, and confirms before closing with one running", () => {
    view();
    const chip = screen.getByRole("button", { name: "Start timer: 10 minutes" });
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.getAllByRole("group", { name: /^Step 1 · / })).toHaveLength(1);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(fireEvent.click(screen.getByRole("link", { name: /Close/ }))).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });

  it("keeps the full stop with the timer chip, and shows only lit ingredients in portrait until asked", () => {
    view();
    const chip = screen.getByRole("button", { name: "Start timer: 10 minutes" });
    expect(chip.parentElement?.textContent).toMatch(/10 minutes\.$/);
    expect(chip.parentElement?.className).toContain("whitespace-nowrap");
    const more = screen.getByRole("button", { name: "+2 more" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "Show fewer" }).getAttribute("aria-expanded")).toBe("true");
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

  it("hears commands, survives no-speech, restarts after a pause, stops when denied and cleans up", () => {
    const recs: Rec[] = [];
    class Rec {
      continuous = false; interimResults = false;
      onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: { error: string }) => void) | null = null;
      start = vi.fn(); stop = vi.fn();
      constructor() { recs.push(this); }
    }
    vi.stubGlobal("webkitSpeechRecognition", Rec);
    const { unmount } = view();
    fireEvent.click(screen.getByRole("button", { name: /Voice off/ }));
    const rec = recs[0];
    const say = (transcript: string) => act(() => rec.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: true })] }));
    say("put the lid back");
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    say("repeat");
    const once = screen.getByRole("status").textContent;
    say("repeat");
    expect(screen.getByRole("status").textContent).not.toBe(once); // same words, still a new announcement
    say("next");
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    act(() => rec.onerror?.({ error: "no-speech" }));
    expect(screen.getByRole("button", { name: /Listening/ })).toBeTruthy();
    act(() => rec.onend?.());
    expect(rec.start).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(300));
    expect(rec.start).toHaveBeenCalledTimes(2);
    act(() => rec.onerror?.({ error: "not-allowed" }));
    expect(screen.getByRole("button", { name: /Voice off/ })).toBeTruthy();
    expect(rec.stop).toHaveBeenCalled();
    unmount();
  });

  it("has empty states", () => {
    const { unmount } = render(<CookMode id="r1" title="T" ingredients={[]} steps={["Stir."]} />);
    expect(screen.getByText("No ingredients listed.")).toBeTruthy();
    unmount();
    render(<CookMode id="r1" title="T" ingredients={INGREDIENTS} steps={[]} />);
    expect(screen.getByRole("heading", { name: "This recipe has no steps yet" })).toBeTruthy();
  });
});

const ing = (name: RegExp) => screen.getByRole("button", { name });
const pressed = (el: HTMLElement) => el.getAttribute("aria-pressed");

describe("CookMode tick-off and views", () => {
  it("ticks an ingredient and keeps it across a remount", () => {
    const { unmount } = view();
    expect(pressed(ing(/onion/))).toBe("false");
    fireEvent.click(ing(/onion/));
    expect(pressed(ing(/onion/))).toBe("true");
    expect(JSON.parse(localStorage.getItem("cook-ticks:r1") ?? "{}")).toMatchObject({ v: 1, at: FIXED_NOW.getTime(), ingredients: [0], steps: [] });
    unmount();
    view();
    expect(pressed(ing(/onion/))).toBe("true");
  });

  it("server and hydrating render show nothing ticked, stored state follows after mount", () => {
    localStorage.setItem("cook-ticks:r1", JSON.stringify({ v: 1, at: FIXED_NOW.getTime(), ingredients: [0], steps: [0] }));
    const html = renderToString(<CookMode id="r1" title="T" ingredients={INGREDIENTS} steps={STEPS} />);
    expect(html).toContain("onion"); // the real markup rendered, with its ingredient buttons
    expect(html.match(/<button[^>]*aria-pressed="false"/g)?.length).toBeGreaterThanOrEqual(INGREDIENTS.length);
    // Only the "One step" view toggle is pressed: no ingredient or step button.
    expect(html.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)/g)?.map((m) => m.replace(/<[^>]*>/, ""))).toEqual(["One step"]);
    view();
    expect(pressed(ing(/onion/))).toBe("true");
    expect(pressed(screen.getByRole("button", { name: "Step 1 done" }))).toBe("true");
  });

  it("ticks a step, shows it in the footer count and clears everything", () => {
    view();
    expect(screen.queryByRole("button", { name: "Clear ticks" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Step 1 done" }));
    expect(pressed(screen.getByRole("button", { name: "Step 1 done" }))).toBe("true");
    fireEvent.click(ing(/carrots/)); // hidden in portrait until asked, still in the DOM
    fireEvent.click(screen.getByRole("button", { name: "Clear ticks" }));
    expect(pressed(screen.getByRole("button", { name: "Step 1 done" }))).toBe("false");
    expect(pressed(ing(/carrots/))).toBe("false");
    expect(screen.queryByRole("button", { name: "Clear ticks" })).toBeNull();
  });

  it("ignores ticks older than 12 hours", () => {
    localStorage.setItem("cook-ticks:r1", JSON.stringify({ v: 1, at: FIXED_NOW.getTime() - 12 * 3600_000, ingredients: [0], steps: [] }));
    view();
    expect(pressed(ing(/onion/))).toBe("false");
  });

  it("switches to all steps, remembers it, and leaves the arrow keys alone there", () => {
    const { unmount } = view();
    fireEvent.click(screen.getByRole("button", { name: "All steps" }));
    expect(localStorage.getItem("cook-view")).toBe("all");
    expect(screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent).join("|")).toContain("Step 3: Serve.");
    expect(screen.queryByRole("button", { name: /Next step/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Finish" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const current = () => screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step")?.textContent;
    expect(current()).toContain("onion");
    fireEvent.click(screen.getByRole("button", { name: "Step 1 done" }));
    expect(current()).toContain("Add the wine");
    expect(screen.getByText("1 of 3 steps done")).toBeTruthy();
    unmount();
    view();
    expect(pressed(screen.getByRole("button", { name: "All steps" }))).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "One step" }));
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
  });

  it("starts a timer from any step in the list, labelled with that step", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "All steps" }));
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 10 minutes" }));
    expect(screen.getByRole("group", { name: "Step 1 · 10 min" })).toBeTruthy();
  });

  it("still works when storage throws", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    render(<CookMode id="r-blocked" title="T" ingredients={INGREDIENTS} steps={STEPS} />); // its own id: the store remembers a failed key
    fireEvent.click(ing(/wine/));
    expect(pressed(ing(/wine/))).toBe("true");
  });

  it("keeps focus in the stage when Clear ticks goes away", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Step 1 done" }));
    const clear = screen.getByRole("button", { name: "Clear ticks" });
    clear.focus();
    fireEvent.click(clear);
    expect(screen.queryByRole("button", { name: "Clear ticks" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("group", { name: "Cook mode controls" }));
  });

  it("in the all-steps list, ticking a step that is not current leaves the current step alone", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "All steps" }));
    fireEvent.click(screen.getByRole("button", { name: "Step 3 done" }));
    const current = screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Cook the onion");
  });

  it("says the screen may sleep when there is no wake lock, and explains on tap", () => {
    view();
    const b = screen.getByRole("button", { name: /Screen may sleep/ });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(screen.getByText(/secure \(https\) connection/)).toBeTruthy();
    expect(screen.getByText(/Auto-Lock to Never/)).toBeTruthy();
  });
});
