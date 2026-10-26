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
    const kicker = label("Step 1 of 3 · 1st of 5");
    expect(kicker.parentElement?.parentElement?.textContent).toContain("Salad");
    expect(screen.getByText(/Wash the/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Dishes" }).textContent).toContain("Roast");
    expect(screen.getByText(/Roast: Season the beef/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Back/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves through the combined order with the buttons and the arrow keys, ending on Finish at the recipes", () => {
    view();
    next();
    const kicker = label("Step 1 of 2 · 2nd of 5");
    expect(kicker.parentElement?.parentElement?.textContent).toContain("Roast");
    expect(screen.getByRole("status").textContent).toContain("Roast, step 1 of 2: Season the beef.");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(label("Step 2 of 3 · 3rd of 5")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(label("Step 1 of 2 · 2nd of 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(label("Step 1 of 3 · 1st of 5")).toBeTruthy();
    for (let i = 0; i < 4; i++) next();
    expect(label("Step 3 of 3 · 5th of 5")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe("/"); // not one of the dishes' pages
    expect(screen.getByText("Last step")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Close/ }).getAttribute("href")).toBe("/");
  });

  it("moves on a swipe", () => {
    view();
    const step = label("Step 1 of 3 · 1st of 5").parentElement as HTMLElement;
    fireEvent.touchStart(step, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(step, { touches: [], changedTouches: [{ clientX: 200, clientY: 105 }] });
    expect(label("Step 1 of 2 · 2nd of 5")).toBeTruthy();
  });

  it("brings another dish's next step here, keeps the order and a tick through a re-mount, and opens on the first step not done", () => {
    stored("cook-together:a,b", { order: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]] });
    const { unmount } = view();
    expect(label("Step 1 of 3 · 1st of 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bring Roast’s next step here" }));
    expect(JSON.parse(localStorage.getItem("cook-together:a,b")!).order).toEqual([[0, 0], [1, 0], [0, 1], [0, 2], [1, 1]]);
    expect(screen.getByRole("status").textContent).toContain("Roast step 1 is next");
    expect(label("Step 1 of 3 · 1st of 5")).toBeTruthy(); // the current step stays
    fireEvent.click(screen.getByRole("button", { name: "Salad step 1 done" }));
    unmount();
    view();
    expect(label("Step 1 of 2 · 2nd of 5")).toBeTruthy(); // Salad 1 is done: opens on Roast 1, the next in the stored order
  });

  it("offers a nudge only for a dish whose next step is not already next, and none once a dish has run out", () => {
    stored("cook-together:a,b", { order: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]] });
    view();
    expect(screen.getByRole("button", { name: "Bring Roast’s next step here" })).toBeTruthy(); // Roast 1 is three places on
    expect(screen.queryByRole("button", { name: /Bring Salad/ })).toBeNull(); // never for the dish being cooked
    next();
    next(); // Salad 3: Roast 1 is right after it
    expect(screen.queryByRole("button", { name: /Bring/ })).toBeNull();
    next(); // Roast 1
    expect(screen.queryByRole("button", { name: /Bring/ })).toBeNull(); // Salad has run out
  });

  it("shows no nudge, and no empty gap, when the other dish's next step is already next", () => {
    const { container } = view(); // round-robin: Roast 1 follows Salad 1
    expect(screen.queryByRole("button", { name: /Bring/ })).toBeNull();
    expect(container.querySelector(".mt-6")).toBeNull();
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
    expect(label("Step 2 of 3 · 3rd of 5")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Salad step 2 done" })); // ticking never moves the step
    expect(label("Step 2 of 3 · 3rd of 5")).toBeTruthy();
    unmount();
    stored("cook-ticks:a", { ingredients: [], steps: [0, 1, 2] });
    stored("cook-ticks:b", { ingredients: [], steps: [0, 1] });
    view();
    expect(label("Step 3 of 3 · 5th of 5")).toBeTruthy();
  });

  it("ignores a stored order that no longer fits the recipes", () => {
    stored("cook-together:a,b", { order: [[1, 0], [0, 0]] });
    view();
    expect(label("Step 1 of 3 · 1st of 5")).toBeTruthy();
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
    expect(screen.getByRole("status").textContent).toContain("Moved Salad step 2 later. It’s now 4th of 5.");
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
    expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe("/");
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
    expect(salad.getByText("1st of 5")).toBeTruthy();
    expect(salad.getByText("3rd of 5")).toBeTruthy();
    expect(salad.getByText("5th of 5")).toBeTruthy();
    const roast = within(screen.getByRole("region", { name: "Roast" }));
    expect(roast.getByText("2nd of 5")).toBeTruthy();
    expect(roast.getByText("4th of 5")).toBeTruthy();
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
    expect(label("Step 1 of 3 · 1st of 3")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Dishes" }).textContent).toContain("Roast");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    choose("By dish");
    expect(within(screen.getByRole("region", { name: "Roast" })).getByText("No steps listed.")).toBeTruthy();
  });

  it("says so when no dish has any steps", () => {
    view([{ ...SALAD, steps: [] }, { ...ROAST, steps: [] }]);
    expect(screen.getByRole("heading", { name: "These recipes have no steps yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to recipes" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "Edit Salad" }).getAttribute("href")).toBe("/recipes/a/edit");
    expect(screen.getByRole("link", { name: "Edit Roast" }).getAttribute("href")).toBe("/recipes/b/edit");
  });
});

describe("CookTogether: focus and announcements", () => {
  /**
   * A real browser blurs the focused element when the subtree holding it is moved (remove + insert); jsdom keeps focus. Make
   * jsdom blur too, so the test sees what React DOM has to put right (it re-focuses the element that was focused before a commit).
   */
  function blurOnMove() {
    const insertBefore = Node.prototype.insertBefore;
    vi.spyOn(Node.prototype, "insertBefore").mockImplementation(function <T extends Node>(this: Node, node: T, ref: Node | null) {
      const had = node.contains(document.activeElement);
      const result = insertBefore.call(this, node, ref) as T;
      if (had) (document.activeElement as HTMLElement | null)?.blur();
      return result;
    });
  }

  it("keeps keyboard focus on the button that moved a step, when the browser blurs the moved node (React puts it back)", () => {
    view();
    choose("All steps");
    blurOnMove();
    const later = screen.getByRole("button", { name: "Move Salad step 2 later" });
    later.focus();
    fireEvent.click(later);
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Roast step 2", "Salad step 2", "Salad step 3"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Salad step 2 later" }));
    const earlier = screen.getByRole("button", { name: "Move Salad step 2 earlier" });
    earlier.focus();
    fireEvent.click(earlier); // back where it was: the other dish's step is the one React moves
    expect(listed()).toEqual(["Salad step 1", "Roast step 1", "Salad step 2", "Roast step 2", "Salad step 3"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Move Salad step 2 earlier" }));
    vi.restoreAllMocks();
  });

  it("says why a move button that cannot move does nothing", () => {
    view();
    choose("All steps");
    fireEvent.click(screen.getByRole("button", { name: "Move Salad step 1 earlier" }));
    expect(screen.getByRole("status").textContent).toContain("Can’t move earlier: Salad step 1 is already first");
    fireEvent.click(screen.getByRole("button", { name: "Move Salad step 3 later" }));
    expect(screen.getByRole("status").textContent).toContain("Can’t move later: Salad step 3 is already last");
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 1 later" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 1 later" })); // now right before Roast 2
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 1 later" }));
    expect(screen.getByRole("status").textContent).toContain("Can’t move later: Roast’s step 2 comes next");
    fireEvent.click(screen.getByRole("button", { name: "Move Roast step 2 earlier" }));
    expect(screen.getByRole("status").textContent).toContain("Can’t move earlier: Roast’s step 1 comes first");
  });

  it("announces Reset order", () => {
    view();
    choose("All steps");
    fireEvent.click(screen.getByRole("button", { name: "Move Salad step 2 later" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset order" }));
    expect(screen.getByRole("status").textContent).toContain("Order reset");
  });
});

describe("CookTogether: the current step is a step, not a position", () => {
  const dispatchStorage = () => act(() => void window.dispatchEvent(new StorageEvent("storage", { key: "cook-together:a,b" })));

  it("stays on the same step when another tab reorders the steps", () => {
    view();
    next(); // Roast 1
    expect(label("Step 1 of 2 · 2nd of 5")).toBeTruthy();
    stored("cook-together:a,b", { order: [[0, 0], [0, 1], [1, 0], [1, 1], [0, 2]] }); // Roast 1 is now third
    dispatchStorage();
    expect(label("Step 1 of 2 · 3rd of 5")).toBeTruthy();
    expect(screen.getByText("Roast: Roast for 90 minutes.", { exact: false })).toBeTruthy(); // the preview follows the new order
  });

  it("stays on the same step when the stored order expires and the order snaps back to round-robin", () => {
    stored("cook-together:a,b", { order: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]] });
    view();
    next();
    next();
    next(); // Roast 1, fourth in the stored order
    expect(label("Step 1 of 2 · 4th of 5")).toBeTruthy();
    localStorage.setItem("cook-together:a,b", JSON.stringify({ v: 1, at: FIXED_NOW.getTime() - 13 * 3600_000, order: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]] }));
    dispatchStorage();
    expect(label("Step 1 of 2 · 2nd of 5")).toBeTruthy(); // Roast 1 is second in round-robin
  });

  it("falls back to the first step not done when the current one is gone (a recipe was edited)", () => {
    const { rerender } = view();
    for (let i = 0; i < 4; i++) next(); // Salad 3, the last
    expect(label("Step 3 of 3 · 5th of 5")).toBeTruthy();
    rerender(<CookTogether dishes={[{ ...SALAD, steps: SALAD.steps.slice(0, 2) }, ROAST]} />);
    expect(label("Step 1 of 2 · 1st of 4")).toBeTruthy();
  });
});

describe("CookTogether: the rail and the layout", () => {
  it("says 'For this step' on the current dish's tab, and 'All ingredients' on another dish's", () => {
    view();
    expect(screen.getByRole("heading", { name: "For this step" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Roast" }));
    expect(screen.queryByRole("heading", { name: "For this step" })).toBeNull();
    expect(screen.getByRole("heading", { name: "All ingredients" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Salad" }));
    expect(screen.getByRole("heading", { name: "For this step" })).toBeTruthy();
  });

  it("gives By dish the wide layout, and no other view", () => {
    view();
    const wide = () => document.querySelector('[class*="22fr_78fr"]') !== null;
    expect(wide()).toBe(false);
    choose("All steps");
    expect(wide()).toBe(false);
    choose("By dish");
    expect(wide()).toBe(true);
    choose("One step");
    expect(wide()).toBe(false);
  });
});

describe("CookTogether: dishes with the same title", () => {
  const TWIN = { ...SALAD, id: "c" };

  it("names the second one 'Salad 2' everywhere a dish is named, as its mark is", () => {
    view([SALAD, TWIN]);
    expect(screen.getAllByRole("tab").map((t) => t.getAttribute("title"))).toEqual(["Salad", "Salad 2"]);
    next();
    expect(label("Step 1 of 3 · 2nd of 6").parentElement?.parentElement?.textContent).toContain("Salad 2");
    expect(screen.getByRole("button", { name: "Salad 2 step 1 done" })).toBeTruthy();
    choose("All steps");
    expect(screen.getByRole("button", { name: "Move Salad 2 step 1 later" })).toBeTruthy();
  });

  it("starts a timer for each of them: the second dish's same step is not a double tap", () => {
    view([{ ...SALAD, steps: ["Chill for 20 minutes."] }, { ...TWIN, steps: ["Chill for 20 minutes."] }]);
    choose("All steps");
    const chips = screen.getAllByRole("button", { name: "Start timer: 20 minutes" });
    expect(chips).toHaveLength(2);
    fireEvent.click(chips[0]);
    fireEvent.click(chips[1]); // the same instant: the guard must tell the dishes apart
    expect(screen.getByRole("group", { name: "Salad · Step 1 · 20 min" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Salad 2 · Step 1 · 20 min" })).toBeTruthy();
    fireEvent.click(chips[0]); // a double tap on one chip is still one timer
    expect(screen.getAllByRole("group", { name: /Step 1 · 20 min/ })).toHaveLength(2);
  });
});
