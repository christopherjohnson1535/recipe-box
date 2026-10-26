import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookTogether, type Dish } from "./CookTogether";
import { FIXED_NOW } from "@/test/clock";

const SALAD: Dish = {
  id: "a",
  title: "Salad",
  ingredients: ["2 cups lettuce", "1 tbsp olive oil"],
  steps: ["Wash the lettuce.", "Toss with the olive oil and chill for 20 minutes.", "Serve."],
};
const ROAST: Dish = { id: "b", title: "Roast", ingredients: ["1 kg beef", "2 onions"], steps: ["Season the beef.", "Roast for 90 minutes."] };
const DISHES = [SALAD, ROAST];
// Round-robin: Salad 1, Roast 1, Salad 2, Roast 2, Salad 3.
const view = (dishes = DISHES) => render(<CookTogether dishes={dishes} />);
const label = (text: string) => screen.getByText(text);
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const next = () => fireEvent.click(screen.getByRole("button", { name: /Next step/ }));
/** The all-steps list read off its Later buttons: "Salad step 2", in order. */
const listed = () => screen.getAllByRole("button", { name: /^Move .* later$/ }).map((b) => b.getAttribute("aria-label")!.replace(/^Move | later$/g, ""));
const stored = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify({ v: 1, at: FIXED_NOW.getTime(), ...(value as object) }));
const selectedTab = () => screen.getByRole("tab", { selected: true }).getAttribute("title");
const lit = () => screen.getAllByRole("listitem").filter((li) => li.getAttribute("data-lit") === "true").map((li) => li.textContent);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: FIXED_NOW, toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("data-edition-pin");
});

describe("CookTogether: one step", () => {
  it("opens on the first step of the round-robin order, with its dish named, and previews the next", () => {
    view();
    expect(document.documentElement.dataset.theme).toBe("evening");
    const kicker = label("Step 1 of 3 · 1 of 5 overall");
    expect(kicker.parentElement?.textContent).toContain("Salad");
    expect(screen.getByText(/Wash the/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Dishes" }).textContent).toContain("Roast");
    expect(screen.getByText(/Roast: Season the beef/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Back/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves through the combined order with the buttons and the arrow keys, ending on Finish at the first recipe", () => {
    view();
    next();
    const kicker = label("Step 1 of 2 · 2 of 5 overall");
    expect(kicker.parentElement?.textContent).toContain("Roast");
    expect(screen.getByRole("status").textContent).toContain("Roast, step 1 of 2: Season the beef.");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(label("Step 2 of 3 · 3 of 5 overall")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(label("Step 1 of 2 · 2 of 5 overall")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(label("Step 1 of 3 · 1 of 5 overall")).toBeTruthy();
    for (let i = 0; i < 4; i++) next();
    expect(label("Step 3 of 3 · 5 of 5 overall")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe("/recipes/a");
    expect(screen.getByText("Last step")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Close/ }).getAttribute("href")).toBe("/recipes/a");
  });

  it("moves on a swipe", () => {
    view();
    const step = label("Step 1 of 3 · 1 of 5 overall").parentElement as HTMLElement;
    fireEvent.touchStart(step, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(step, { touches: [], changedTouches: [{ clientX: 200, clientY: 105 }] });
    expect(label("Step 1 of 2 · 2 of 5 overall")).toBeTruthy();
  });

  it("brings another dish's next step here, keeps the order and a tick through a re-mount, and opens on the first step not done", () => {
    stored("cook-together:a,b", { order: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]] });
    const { unmount } = view();
    expect(label("Step 1 of 3 · 1 of 5 overall")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bring Roast’s next step here" }));
    expect(JSON.parse(localStorage.getItem("cook-together:a,b")!).order).toEqual([[0, 0], [1, 0], [0, 1], [0, 2], [1, 1]]);
    expect(screen.getByRole("status").textContent).toContain("Roast step 1 is next");
    expect(label("Step 1 of 3 · 1 of 5 overall")).toBeTruthy(); // the current step stays
    fireEvent.click(screen.getByRole("button", { name: "Salad step 1 done" }));
    unmount();
    view();
    expect(label("Step 1 of 2 · 2 of 5 overall")).toBeTruthy(); // Salad 1 is done: opens on Roast 1, the next in the stored order
  });

  it("offers a nudge only for dishes with steps still to come, and none once a dish has run out", () => {
    view();
    expect(screen.getByRole("button", { name: "Bring Roast’s next step here" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Bring Salad/ })).toBeNull(); // never for the dish being cooked
    for (let i = 0; i < 3; i++) next(); // Roast 2, the last Roast step
    expect(screen.queryByRole("button", { name: /Bring Roast/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Bring Salad’s next step here" })).toBeTruthy();
    next(); // Salad 3, the last step
    expect(screen.queryByRole("button", { name: /Bring/ })).toBeNull();
  });

  it("ticks a step of its own dish, and Clear ticks takes every dish's ticks away", () => {
    view();
    expect(screen.queryByRole("button", { name: "Clear ticks" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salad step 1 done" }));
    expect(JSON.parse(localStorage.getItem("cook-ticks:a")!).steps).toEqual([0]);
    expect(localStorage.getItem("cook-ticks:b")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear ticks" }));
    expect(JSON.parse(localStorage.getItem("cook-ticks:a")!).steps).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear ticks" })).toBeNull();
  });

  it("opens on the first step of the order not done, and on the last when all are", () => {
    stored("cook-ticks:a", { ingredients: [], steps: [0] });
    stored("cook-ticks:b", { ingredients: [], steps: [0] });
    const { unmount } = view();
    expect(label("Step 2 of 3 · 3 of 5 overall")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salad step 2 done" })); // ticking never moves the step
    expect(label("Step 2 of 3 · 3 of 5 overall")).toBeTruthy();
    unmount();
    stored("cook-ticks:a", { ingredients: [], steps: [0, 1, 2] });
    stored("cook-ticks:b", { ingredients: [], steps: [0, 1] });
    view();
    expect(label("Step 3 of 3 · 5 of 5 overall")).toBeTruthy();
  });

  it("ignores a stored order that no longer fits the recipes", () => {
    stored("cook-together:a,b", { order: [[1, 0], [0, 0]] });
    view();
    expect(label("Step 1 of 3 · 1 of 5 overall")).toBeTruthy();
  });
});

describe("CookTogether: all steps", () => {
  it("lists every step in order with its dish, and moves one past a step of another dish", () => {
    view();
    choose("All steps");
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Salad step 2", "Roast step 2", "Salad step 3"]);
    expect(screen.getByText("0 of 5 steps done")).toBeTruthy();
    const later = screen.getByRole("button", { name: "Move Salad step 2 later" });
    later.focus();
    fireEvent.click(later);
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Roast step 2", "Salad step 2", "Salad step 3"]);
    expect(screen.getByRole("status").textContent).toContain("Moved Salad step 2 later, now 4 of 5");
    expect(document.activeElement).toBe(later);
    expect(JSON.parse(localStorage.getItem("cook-together:a,b")!).order[3]).toEqual([0, 1]);
    fireEvent.click(screen.getByRole("button", { name: "Move Salad step 2 earlier" }));
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Salad step 2", "Roast step 2", "Salad step 3"]);
  });

  it("blocks a move past a step of the same dish, and at either end, without disabling the button", () => {
    view();
    choose("All steps");
    const blocked = screen.getByRole("button", { name: "Move Salad step 3 later" }); // the end
    expect(blocked.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Move Salad step 1 earlier" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(blocked);
    fireEvent.click(screen.getByRole("button", { name: "Move Salad step 1 earlier" }));
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Salad step 2", "Roast step 2", "Salad step 3"]);
    // Two steps of one dish side by side (after a move) cannot swap.
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 1 later" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 1 later" })); // now before Roast 2: same dish
    expect(listed()).toEqual(["Salad step 1", "Salad step 2", "Roast step 1", "Roast step 2", "Salad step 3"]);
    expect(screen.getByRole("button", { name: "Move Roast step 1 later" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Move Salad step 2 earlier" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps the current step the same step when the order changes under it, and Reset order restores round-robin", () => {
    view();
    next(); // Roast 1 is current
    choose("All steps");
    expect(document.querySelector("[aria-current=step]")?.textContent).toContain("Roast");
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 1 later" })); // swaps with Salad 2
    expect(document.querySelector("[aria-current=step]")?.textContent).toContain("Roast");
    expect(listed()).toEqual(["Salad step 1", "Salad step 2", "Roast step 1", "Roast step 2", "Salad step 3"]);
    fireEvent.click(screen.getByRole("button", { name: "Reset order" }));
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Salad step 2", "Roast step 2", "Salad step 3"]);
    expect(screen.queryByRole("button", { name: "Reset order" })).toBeNull();
    expect(document.querySelector("[aria-current=step]")?.textContent).toContain("Roast");
  });

  it("makes the next step current when the current one is ticked, counts done steps and ends on Finish", () => {
    view();
    choose("All steps");
    fireEvent.click(screen.getByRole("button", { name: "Salad step 1 done" }));
    expect(document.querySelector("[aria-current=step]")?.textContent).toContain("Season the beef");
    expect(screen.getByText("1 of 5 steps done")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salad step 3 done" })); // any other step leaves it be
    expect(document.querySelector("[aria-current=step]")?.textContent).toContain("Season the beef");
    expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe("/recipes/a");
    expect(screen.queryByRole("button", { name: /Next step/ })).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight" }); // arrows only move in the one-step view
    expect(document.querySelector("[aria-current=step]")?.textContent).toContain("Season the beef");
  });

  it("remembers the view on the device", () => {
    const { unmount } = view();
    choose("By dish");
    unmount();
    view();
    expect(screen.getByRole("radio", { name: "By dish" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("CookTogether: by dish", () => {
  it("lists each dish's steps in its own order, with their place in the combined order", () => {
    view();
    choose("By dish");
    const salad = within(screen.getByRole("region", { name: "Salad" }));
    expect(salad.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("Wash the lettuce."),
      expect.stringContaining("Toss with the olive oil"),
      expect.stringContaining("Serve."),
    ]);
    expect(salad.getByText("#1 overall")).toBeTruthy();
    expect(salad.getByText("#3 overall")).toBeTruthy();
    expect(salad.getByText("#5 overall")).toBeTruthy();
    const roast = within(screen.getByRole("region", { name: "Roast" }));
    expect(roast.getByText("#2 overall")).toBeTruthy();
    expect(roast.getByText("#4 overall")).toBeTruthy();
    fireEvent.click(roast.getByRole("button", { name: "Roast step 2 done" }));
    expect(JSON.parse(localStorage.getItem("cook-ticks:b")!).steps).toEqual([1]);
    expect(screen.getByText("1 of 5 steps done")).toBeTruthy();
  });
});

describe("CookTogether: ingredients rail", () => {
  it("has a tab per dish that follows the current step's dish, which the cook can still override", () => {
    view();
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("title"))).toEqual(["Salad", "Roast"]);
    expect(selectedTab()).toBe("Salad");
    expect(lit()).toEqual([expect.stringContaining("lettuce")]);
    next();
    expect(selectedTab()).toBe("Roast");
    expect(lit()).toEqual([expect.stringContaining("beef")]);
    fireEvent.click(screen.getByRole("tab", { name: "Salad" })); // look at the other dish meanwhile
    expect(selectedTab()).toBe("Salad");
    expect(lit()).toEqual([]); // nothing is lit for a dish whose step is not the current one
    next(); // Salad 2
    expect(selectedTab()).toBe("Salad");
    next(); // Roast 2
    expect(selectedTab()).toBe("Roast");
  });

  it("ticks an ingredient of the dish on show, kept in that recipe's own ticks", () => {
    view();
    fireEvent.click(screen.getByRole("tab", { name: "Roast" }));
    fireEvent.click(screen.getByRole("button", { name: /onions/ }));
    expect(JSON.parse(localStorage.getItem("cook-ticks:b")!).ingredients).toEqual([1]);
    expect(localStorage.getItem("cook-ticks:a")).toBeNull();
  });
});

describe("CookTogether: timers", () => {
  it("names a timer by its dish and step, and keeps it running while the cook moves to another dish", () => {
    view();
    next();
    next(); // Salad 2: "chill for 20 minutes"
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 20 minutes" }));
    expect(screen.getByRole("group", { name: "Salad · Step 2 · 20 min" })).toBeTruthy();
    next(); // Roast 2
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 90 minutes" }));
    expect(screen.getByRole("group", { name: "Roast · Step 2 · 90 min" })).toBeTruthy();
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByText("19:00")).toBeTruthy();
    choose("All steps");
    act(() => void vi.advanceTimersByTime(19 * 60_000));
    expect(within(screen.getByRole("group", { name: "Salad · Step 2 · 20 min" })).getByText("Done")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Timer finished: Salad · Step 2 · 20 min");
  });

  it("confirms before closing with a timer running", () => {
    view();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Start timer: 20 minutes" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    expect(fireEvent.click(screen.getByRole("link", { name: /Close/ }))).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });
});

describe("CookTogether: dishes without steps", () => {
  it("keeps a dish with no steps in the legend and the rail but skips it in the order", () => {
    view([SALAD, { ...ROAST, steps: [] }]);
    expect(label("Step 1 of 3 · 1 of 3 overall")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Dishes" }).textContent).toContain("Roast");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    choose("By dish");
    expect(within(screen.getByRole("region", { name: "Roast" })).getByText("No steps listed.")).toBeTruthy();
  });

  it("says so when no dish has any steps", () => {
    view([{ ...SALAD, steps: [] }, { ...ROAST, steps: [] }]);
    expect(screen.getByRole("heading", { name: "These recipes have no steps yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to the recipe" }).getAttribute("href")).toBe("/recipes/a");
  });
});
