import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { PENCIL_MS, POLL_MS } from "./use-grocery-list";
import { GroceryView } from "./GroceryView";
import type { GroceryItem, GroceryList, GroceryRecipe, ItemPatch } from "./types";

const item = (over: Partial<GroceryItem> & { id: string; name: string }): GroceryItem => ({
  amounts: [], section: "other", checked: false, manual: false, staple: false, recipeIds: [], ...over,
});
const recipe = (over: Partial<GroceryRecipe> = {}): GroceryRecipe => ({ recipeId: "r1", title: "Chili", scale: 1, servings: "4", imageUrl: null, ...over });

const stock = (): GroceryItem[] => [
  item({ id: "i-garlic", name: "garlic", section: "produce", amounts: [{ quantity: "2", unit: "clove" }] }),
  item({ id: "i-onion", name: "onion", section: "produce", amounts: [{ quantity: "3", unit: null }], recipeIds: ["r1"] }),
  item({ id: "i-beef", name: "ground beef", section: "meat", amounts: [{ quantity: "1", unit: "lb" }] }),
  item({ id: "i-milk", name: "milk", section: "fridge", amounts: [{ quantity: "1", unit: "cup" }, { quantity: "2", unit: "tbsp" }] }),
  item({ id: "i-salt", name: "salt", section: "pantry", staple: true }),
];

type Call = { method: string; path: string; body: unknown };

/** A tiny in-memory grocery API: the handlers read and change `state`, and every write is recorded in `calls`. */
function serve(items: GroceryItem[] = stock(), recipes: GroceryRecipe[] = [recipe()]) {
  const state: GroceryList = { id: "g1", updatedAt: "2026-01-01T00:00:00Z", recipes, items };
  const calls: Call[] = [];
  const record = async (request: Request, method: string) => {
    const body = method === "GET" || method === "DELETE" ? undefined : await request.clone().json().catch(() => undefined);
    calls.push({ method, path: new URL(request.url).pathname, body });
    return body;
  };
  server.use(
    http.get("*/api/grocery", () => HttpResponse.json(state)),
    http.delete("*/api/grocery", async ({ request }) => {
      await record(request, "DELETE");
      state.items = [];
      state.recipes = [];
      return new HttpResponse(null, { status: 204 });
    }),
    http.patch("*/api/grocery/items/:id", async ({ request, params }) => {
      const patch = (await record(request, "PATCH")) as ItemPatch;
      const found = state.items.find((i) => i.id === params.id)!;
      Object.assign(found, patch);
      return HttpResponse.json(found);
    }),
    http.post("*/api/grocery/items", async ({ request }) => {
      const body = (await record(request, "POST")) as { text: string };
      const added = item({ id: `new-${calls.length}`, name: body.text, manual: true });
      state.items = [...state.items, added];
      return HttpResponse.json(added, { status: 201 });
    }),
    http.delete("*/api/grocery/items/:id", async ({ request, params }) => {
      await record(request, "DELETE");
      state.items = state.items.filter((i) => i.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post("*/api/grocery/clear-checked", async ({ request }) => {
      await record(request, "POST");
      state.items = state.items.filter((i) => !i.checked);
      return HttpResponse.json(state);
    }),
    http.post("*/api/grocery/recipes", async ({ request }) => {
      const body = (await record(request, "POST")) as { recipeId: string; scale: number };
      state.recipes = state.recipes.map((r) => (r.recipeId === body.recipeId ? { ...r, scale: body.scale } : r));
      return HttpResponse.json(state);
    }),
    http.delete("*/api/grocery/recipes/:id", async ({ request, params }) => {
      await record(request, "DELETE");
      state.recipes = state.recipes.filter((r) => r.recipeId !== params.id);
      return HttpResponse.json(state);
    }),
  );
  return { state, calls };
}

const open = async () => {
  render(<GroceryView />);
  await screen.findByRole("heading", { level: 2, name: "Produce" });
};
const row = (name: string | RegExp) => screen.getByRole("button", { name });
const sectionNames = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
const rowsIn = (section: string) =>
  [...screen.getByRole("region", { name: section }).querySelectorAll("button[aria-pressed]")].map((b) => b.textContent);

/** The area that holds the items; it takes focus when the control a person was on goes away. */
const listBody = () => document.querySelector<HTMLElement>('[tabindex="-1"]');
const garlicWith = (over: Partial<GroceryItem>) => ({ ...stock()[0], ...over });
const failure = (message = "The server hiccuped.") => HttpResponse.json({ error: { code: "internal", message } }, { status: 500 });

/** Captures timers with this delay instead of running them, so a test decides when they fire. Other timers run as usual. */
function captureTimer(kind: "setTimeout" | "setInterval", delay: number) {
  const fired: (() => void)[] = [];
  const real = globalThis[kind];
  vi.spyOn(globalThis, kind).mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms === delay) {
      fired.push(fn);
      return 0;
    }
    return (real as (...a: unknown[]) => unknown)(fn, ms, ...rest);
  }) as typeof real);
  return fired;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the list", () => {
  it("shows only the sections that have items, in store order, with amounts joined by +", async () => {
    serve();
    await open();
    expect(screen.getByRole("heading", { level: 1, name: "Groceries" })).toBeTruthy();
    expect(sectionNames().filter((n) => ["Produce", "Meat", "Fridge", "Freezer", "Pantry", "Other"].includes(n!))).toEqual(["Produce", "Meat", "Fridge"]);
    expect(row("1 cup + 2 tbsp milk")).toBeTruthy();
    expect(row("3 onion")).toBeTruthy();
    expect(row("2 cloves garlic")).toBeTruthy();
    expect(screen.getByText("4 left to buy")).toBeTruthy(); // the staple is not counted
  });

  it("hides staples until asked, and says how many there are", async () => {
    serve();
    await open();
    expect(screen.queryByRole("button", { name: /^salt/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show staples (1)" }));
    expect(row(/^salt/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Pantry" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide staples (1)" }));
    expect(screen.queryByRole("button", { name: /^salt/ })).toBeNull();
  });

  it("lists the recipes on it, linked, with their servings", async () => {
    serve();
    await open();
    expect(screen.getByText("On this list · 1 recipe")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Chili" }).getAttribute("href")).toBe("/recipes/r1");
    expect(screen.getByText("Serves 4")).toBeTruthy();
  });

  it("explains an empty list and points to recipes", async () => {
    serve([], []);
    render(<GroceryView />);
    expect(await screen.findByRole("heading", { name: "Nothing on the list yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Choose recipes" }).getAttribute("href")).toBe("/");
    expect(screen.getByLabelText("Add an item")).toBeTruthy(); // typing an item works on an empty list too
  });

  it("shows a loading note first, then an error with a retry that loads the list", async () => {
    server.use(http.get("*/api/grocery", () => HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 })));
    render(<GroceryView />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(await screen.findByText("Can’t load the list")).toBeTruthy();
    serve();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Produce" })).toBeTruthy();
  });
});

describe("ticking", () => {
  it("ticks at once, saves, and moves the item to the bottom of its section", async () => {
    const { calls } = serve();
    await open();
    expect(rowsIn("Produce")).toEqual(["2 cloves garlic", "3 onion"]);
    fireEvent.click(row("2 cloves garlic"));
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("true"); // before the server has answered
    await waitFor(() => expect(calls).toEqual([{ method: "PATCH", path: "/api/grocery/items/i-garlic", body: { checked: true } }]));
    expect(rowsIn("Produce")).toEqual(["3 onion", "2 cloves garlic"]);
    expect(screen.getByText("3 left to buy · 1 ticked")).toBeTruthy();
  });

  it("unticks", async () => {
    const { calls } = serve([item({ id: "a", name: "apple", section: "produce", checked: true })], []);
    await open();
    fireEvent.click(row("apple"));
    await waitFor(() => expect(calls[0].body).toEqual({ checked: false }));
    expect(row("apple").getAttribute("aria-pressed")).toBe("false");
  });

  it("rolls back and says so when the server refuses", async () => {
    serve();
    server.use(http.patch("*/api/grocery/items/:id", () => HttpResponse.json({ error: { code: "internal", message: "The server hiccuped." } }, { status: 500 })));
    await open();
    fireEvent.click(row("2 cloves garlic"));
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("true");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The server hiccuped.");
    expect(alert.closest('[role="status"]')?.className).toContain("fixed"); // pinned to the screen's bottom, not up the page
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps a just-ticked item in place while the line is drawn, then lets it sink", async () => {
    const { calls } = serve();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    await open();
    const release = captureTimer("setTimeout", PENCIL_MS);
    fireEvent.click(row("2 cloves garlic"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(rowsIn("Produce")).toEqual(["2 cloves garlic", "3 onion"]);
    act(() => release.forEach((fn) => fn()));
    expect(rowsIn("Produce")).toEqual(["3 onion", "2 cloves garlic"]);
  });
});

describe("overlapping changes", () => {
  it("keeps the newest tap when two are on their way and the answers arrive out of order", async () => {
    serve();
    const gates: (() => void)[] = [];
    server.use(
      http.patch("*/api/grocery/items/:id", async ({ request }) => {
        const patch = (await request.json()) as ItemPatch;
        await new Promise<void>((r) => gates.push(r));
        return HttpResponse.json(garlicWith(patch));
      }),
    );
    await open();
    fireEvent.click(row("2 cloves garlic")); // tick
    fireEvent.click(row("2 cloves garlic")); // and untick, before the first answer
    await waitFor(() => expect(gates).toHaveLength(2));
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("false");
    gates[1](); // the second answer first
    await new Promise((r) => setTimeout(r, 30));
    gates[0](); // then the first, which says "ticked"
    await new Promise((r) => setTimeout(r, 30));
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("false");
  });

  it("does not undo a move that worked when an earlier tick on the same item fails late", async () => {
    const { state } = serve();
    let failTick!: () => void;
    server.use(
      http.patch("*/api/grocery/items/:id", async ({ request }) => {
        const patch = (await request.json()) as ItemPatch;
        if (patch.checked !== undefined) {
          await new Promise<void>((r) => (failTick = r));
          return failure();
        }
        Object.assign(state.items.find((i) => i.id === "i-garlic")!, patch);
        return HttpResponse.json(garlicWith(patch));
      }),
    );
    await open();
    fireEvent.click(row("2 cloves garlic"));
    await waitFor(() => expect(failTick).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Options for garlic" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Freezer" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Freezer" })).getByRole("button", { name: "2 cloves garlic" })).toBeTruthy());
    failTick();
    expect((await screen.findByRole("alert")).textContent).toContain("The server hiccuped.");
    const garlic = within(screen.getByRole("region", { name: "Freezer" })).getByRole("button", { name: "2 cloves garlic" });
    expect(garlic.getAttribute("aria-pressed")).toBe("false"); // the tick is undone, the move is not
  });

  it("says nothing and just refreshes when someone else already took the item off", async () => {
    const { state } = serve();
    server.use(
      http.patch("*/api/grocery/items/:id", () => {
        state.items = state.items.filter((i) => i.id !== "i-garlic");
        return HttpResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
      }),
    );
    await open();
    fireEvent.click(row("2 cloves garlic"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "2 cloves garlic" })).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ignores a kept copy of the list that is older than the one it already shows", async () => {
    const { state } = serve();
    const older = JSON.parse(JSON.stringify(state)) as GroceryList; // what the service worker would answer with
    await open();
    fireEvent.click(row("2 cloves garlic"));
    await waitFor(() => expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(screen.getByText("3 left to buy · 1 ticked")).toBeTruthy());
    let asked = 0;
    server.use(
      http.get("*/api/grocery", () => {
        asked++;
        return HttpResponse.json(older);
      }),
    );
    fireEvent.focus(window);
    await waitFor(() => expect(asked).toBe(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("true"); // not un-ticked by the old copy

    server.use(http.get("*/api/grocery", () => HttpResponse.json({ ...state, updatedAt: "2026-01-01T00:00:05Z" })));
    fireEvent.focus(window); // a newer answer is taken
    expect(await screen.findByText("3 left to buy · 1 ticked")).toBeTruthy();
  });
});

describe("focus", () => {
  it("stays on the item after a keyboard tick even though the row moves", async () => {
    serve();
    await open();
    const tick = row("2 cloves garlic");
    tick.focus();
    fireEvent.click(tick, { detail: 0 });
    tick.blur(); // what a browser does when the row is moved in the page
    await waitFor(() => expect(document.activeElement).toBe(row("2 cloves garlic")));
  });

  it("follows an item that is moved to another section", async () => {
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Options for milk" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Freezer" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Freezer" })).getByRole("button", { name: "1 cup + 2 tbsp milk" })).toBeTruthy());
    expect(document.activeElement).toBe(row("1 cup + 2 tbsp milk"));
  });

  it("goes to the next item when one is removed", async () => {
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Options for garlic" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "2 cloves garlic" })).toBeNull());
    expect(document.activeElement).toBe(row("3 onion"));
  });

  it("rests on the list area after Clear ticked, whose button then switches itself off", async () => {
    serve([item({ id: "a", name: "apple", section: "produce", checked: true })], []);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Clear ticked (1)" }));
    expect(document.activeElement).toBe(listBody());
    await waitFor(() => expect(screen.queryByRole("button", { name: "apple" })).toBeNull());
    expect(document.activeElement).toBe(listBody());
  });

  it("goes to the field and says what is missing when Add is pressed empty", async () => {
    serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Add an item"));
    expect(screen.getByLabelText("Add an item").getAttribute("aria-describedby")).toBe("grocery-add-msg");
  });
});

describe("the item menu", () => {
  it("moves an item to another section and announces it", async () => {
    const { calls } = serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Options for milk" }));
    const menu = screen.getByRole("menu", { name: "Options for milk" });
    expect(within(menu).getByRole("menuitemradio", { name: "Fridge" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Freezer" }));
    await waitFor(() => expect(calls).toEqual([{ method: "PATCH", path: "/api/grocery/items/i-milk", body: { section: "freezer" } }]));
    expect(screen.getByRole("heading", { level: 2, name: "Freezer" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "Fridge" })).toBeNull();
    await waitFor(() => expect(screen.getAllByRole("status").some((s) => s.textContent === "Moved milk to Freezer.")).toBe(true));
  });

  it("marks a staple, which hides it, and removes an item", async () => {
    const { calls } = serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Options for ground beef" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as staple" }));
    await waitFor(() => expect(calls[0].body).toEqual({ staple: true }));
    expect(screen.queryByRole("button", { name: /ground beef/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Show staples (2)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Options for onion" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "3 onion" })).toBeNull();
    await waitFor(() => expect(calls[1]).toEqual({ method: "DELETE", path: "/api/grocery/items/i-onion", body: undefined }));
  });

  it("offers Not a staple for a staple", async () => {
    const { calls } = serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Show staples (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Options for salt" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Not a staple" }));
    await waitFor(() => expect(calls[0].body).toEqual({ staple: false }));
  });

  it("puts a removed item back when the server refuses", async () => {
    serve();
    server.use(http.delete("*/api/grocery/items/:id", () => HttpResponse.json({ error: { code: "internal", message: "Nope." } }, { status: 500 })));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Options for onion" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nope.");
    expect(row("3 onion")).toBeTruthy();
  });
});

describe("adding, clearing, emptying", () => {
  it("adds a typed item and clears the field", async () => {
    const { calls } = serve();
    await open();
    const field = screen.getByLabelText("Add an item") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "2 lb potatoes" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls).toEqual([{ method: "POST", path: "/api/grocery/items", body: { text: "2 lb potatoes" } }]));
    expect(await screen.findByRole("button", { name: "2 lb potatoes" })).toBeTruthy();
    expect(field.value).toBe("");
  });

  it("adds once when Add is pressed twice before the server answers", async () => {
    const { calls } = serve();
    let answer!: () => void;
    server.use(
      http.post("*/api/grocery/items", async ({ request }) => {
        calls.push({ method: "POST", path: "/api/grocery/items", body: await request.json() });
        await new Promise<void>((r) => (answer = r));
        return HttpResponse.json(item({ id: "n1", name: "paper towels", manual: true }), { status: 201 });
      }),
    );
    await open();
    fireEvent.change(screen.getByLabelText("Add an item"), { target: { value: "paper towels" } });
    const form = screen.getByLabelText("Add an item").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(answer).toBeTypeOf("function"));
    expect(screen.getByRole("button", { name: "Add" }).getAttribute("aria-busy")).toBe("true");
    answer();
    expect(await screen.findByRole("button", { name: "paper towels" })).toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it("asks for text instead of sending nothing", async () => {
    const { calls } = serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(/Type what to add/)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("clears the ticked items", async () => {
    const { calls } = serve([item({ id: "a", name: "apple", section: "produce", checked: true }), item({ id: "b", name: "beet", section: "produce" })], []);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Clear ticked (1)" }));
    await waitFor(() => expect(calls).toEqual([{ method: "POST", path: "/api/grocery/clear-checked", body: undefined }]));
    expect(screen.queryByRole("button", { name: "apple" })).toBeNull();
    expect(row("beet")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Clear ticked" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("empties the list only after a confirmation, and keeps it when you say Keep", async () => {
    const { calls } = serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Empty list" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep list" }));
    expect(calls).toEqual([]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Empty list" }));

    fireEvent.click(screen.getByRole("button", { name: "Empty list" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Confirm" })).getByRole("button", { name: "Empty list" }));
    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", path: "/api/grocery", body: undefined }]));
    expect(await screen.findByRole("heading", { name: "Nothing on the list yet" })).toBeTruthy();
    expect(document.activeElement).toBe(listBody()); // the Empty button is gone: focus rests on the list area, not the page
  });
});

describe("recipes on the list", () => {
  it("steps the scale and sends it", async () => {
    const { calls } = serve();
    await open();
    expect(screen.getByRole("group", { name: "Servings of Chili" }).textContent).toContain("1×");
    fireEvent.click(screen.getByRole("button", { name: "More servings of Chili" }));
    await waitFor(() => expect(calls).toEqual([{ method: "POST", path: "/api/grocery/recipes", body: { recipeId: "r1", scale: 2 } }]));
    await waitFor(() => expect(screen.getByRole("group", { name: "Servings of Chili" }).textContent).toContain("2×"));
    await waitFor(() => expect(screen.getByRole("button", { name: "More servings of Chili" }).getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(screen.getByRole("button", { name: "Fewer servings of Chili" }));
    await waitFor(() => expect(calls[1].body).toEqual({ recipeId: "r1", scale: 1 }));
  });

  it("keeps focus on a stepper end, and ignores a second tap while the first is on its way", async () => {
    const { calls } = serve();
    let answer!: () => void;
    server.use(
      http.post("*/api/grocery/recipes", async ({ request }) => {
        calls.push({ method: "POST", path: "/api/grocery/recipes", body: await request.json() });
        await new Promise<void>((r) => (answer = r));
        return HttpResponse.json({ id: "g1", updatedAt: "2026-01-01T00:00:01Z", recipes: [recipe({ scale: 2 })], items: stock() });
      }),
    );
    await open();
    const more = screen.getByRole("button", { name: "More servings of Chili" });
    more.focus();
    fireEvent.click(more);
    fireEvent.click(more);
    await waitFor(() => expect(answer).toBeTypeOf("function"));
    expect(document.activeElement).toBe(more); // not disabled under the person's finger
    expect(more.getAttribute("aria-disabled")).toBeNull();
    answer();
    await waitFor(() => expect(more.getAttribute("aria-disabled")).toBe("true")); // top of the range
    expect(document.activeElement).toBe(more);
    expect(calls).toHaveLength(1);
    expect(screen.getAllByRole("status").some((s) => s.textContent === "Chili is now 2×. The amounts are updated.")).toBe(true);
  });

  it("folds the shelf at the start when three or more recipes are on the list, and leaves it alone after", async () => {
    const three = [recipe(), recipe({ recipeId: "r2", title: "Dal" }), recipe({ recipeId: "r3", title: "Soup" })];
    const { state } = serve(stock(), three);
    await open();
    const shelf = () => screen.getByText(/On this list · 3 recipes/).closest("details")!;
    expect(shelf().open).toBe(false);
    shelf().open = true;
    state.recipes = three.slice(0, 2);
    fireEvent.focus(window);
    await waitFor(() => expect(screen.getByText(/On this list · 2 recipes/)).toBeTruthy());
    expect(screen.getByText(/On this list · 2 recipes/).closest("details")!.open).toBe(true);
  });

  it("starts the shelf open with one or two recipes", async () => {
    serve();
    await open();
    expect(screen.getByText(/On this list · 1 recipe/).closest("details")!.open).toBe(true);
  });

  it("takes a recipe off the list", async () => {
    const { calls } = serve();
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Take Chili off the list" }));
    await waitFor(() => expect(calls).toEqual([{ method: "DELETE", path: "/api/grocery/recipes/r1", body: undefined }]));
    await waitFor(() => expect(screen.queryByText(/On this list/)).toBeNull());
    expect(document.activeElement).toBe(listBody()); // the last recipe's button is gone
  });
});

describe("staying in sync", () => {
  const figs = item({ id: "x", name: "figs", section: "produce" });

  it("asks again when the window gets focus", async () => {
    const { state } = serve();
    await open();
    state.items = [...state.items, figs];
    fireEvent.focus(window);
    expect(await screen.findByRole("button", { name: "figs" })).toBeTruthy();
  });

  it("asks again every 20 seconds while the tab is visible, and not while it is hidden", async () => {
    const { state } = serve();
    const ticks = captureTimer("setInterval", POLL_MS);
    await open();
    expect(ticks).toHaveLength(1);
    state.items = [...state.items, figs];
    act(() => ticks[0]());
    expect(await screen.findByRole("button", { name: "figs" })).toBeTruthy();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    state.items = [...state.items, item({ id: "y", name: "dates", section: "produce" })];
    act(() => ticks[0]());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: "dates" })).toBeNull();
  });

  it("does not let a refresh that started before a tick undo it", async () => {
    const { state } = serve();
    await open();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const stale = JSON.parse(JSON.stringify(state)) as GroceryList;
    server.use(
      http.get("*/api/grocery", async () => {
        await held;
        return HttpResponse.json(stale);
      }),
    );
    fireEvent.focus(window); // a refresh starts and waits
    fireEvent.click(row("2 cloves garlic"));
    await waitFor(() => expect(state.items.find((i) => i.id === "i-garlic")?.checked).toBe(true));
    release(); // the old answer (garlic unticked) arrives after the tick
    await new Promise((r) => setTimeout(r, 50));
    expect(row("2 cloves garlic").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("offline", () => {
  it("turns the controls off with the reason, and keeps the list readable", async () => {
    serve();
    await open();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(/This is the last copy of the list/)).toBeTruthy();
    const tick = row("2 cloves garlic") as HTMLButtonElement;
    expect(tick.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Add an item") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Empty list" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Options for milk" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Add" }).getAttribute("aria-describedby")).toBe("groceries-offline");
  });
});
