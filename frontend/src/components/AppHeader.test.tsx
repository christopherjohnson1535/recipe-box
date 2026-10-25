import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { GroceryItem, GroceryList } from "@/components/groceries/types";
import { groceryList } from "@/test/handlers";
import { server } from "@/test/server";
import { AppHeader } from "./AppHeader";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

function current(path: string) {
  nav.path = path;
  const { unmount } = render(<AppHeader />);
  const links = screen.getAllByRole("link", { name: /^(Recipes|Groceries|Add|Import|Settings)/ });
  const names = links.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent);
  unmount();
  return names;
}

describe("AppHeader", () => {
  it("lists Recipes, Groceries, Add, Import and Settings in order, with Add going to the new-recipe form", () => {
    nav.path = "/";
    render(<AppHeader />);
    const links = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-label") !== "Recipe Box home");
    expect(links.map((l) => l.textContent)).toEqual(["Recipes", "Groceries", "Add", "Import", "Settings"]);
    expect(screen.getByRole("link", { name: "Add" })).toHaveProperty("pathname", "/recipes/new");
  });

  it("marks Add current on /recipes/new only", () => {
    expect(current("/recipes/new")).toEqual(["Add"]);
    expect(current("/recipes/abc")).toEqual(["Recipes"]);
    expect(current("/")).toEqual(["Recipes"]);
    expect(current("/import")).toEqual(["Import"]);
    expect(current("/groceries")).toEqual(["Groceries"]);
  });
});

const entry = (id: string, over: Partial<GroceryItem> = {}): GroceryItem => ({
  id, name: id, amounts: [], section: "other", checked: false, manual: true, staple: false, recipeIds: [], ...over,
});
const serveList = (items: GroceryItem[]) => {
  const state: GroceryList = { ...groceryList, items };
  server.use(http.get("*/api/grocery", () => HttpResponse.json(state)));
  return state;
};
const groceries = () => screen.getByRole("link", { name: /^Groceries/ });

describe("the Groceries badge", () => {
  it("counts unticked, non-staple items once the list has loaded, and says it to screen readers", async () => {
    nav.path = "/";
    serveList([entry("a"), entry("b"), entry("c", { checked: true }), entry("d", { staple: true })]);
    render(<AppHeader />);
    expect(groceries().textContent).toBe("Groceries"); // nothing blocks the first paint
    await waitFor(() => expect(groceries().textContent).toBe("Groceries2 (2 to buy)"));
    expect(groceries().getAttribute("href")).toBe("/groceries");
  });

  it("shows no count for an empty list or one that is all crossed off", async () => {
    nav.path = "/";
    const state = serveList([entry("a", { checked: true })]);
    render(<AppHeader />);
    await new Promise((r) => setTimeout(r, 50));
    expect(groceries().textContent).toBe("Groceries");
    state.items = [];
    expect(groceries().textContent).toBe("Groceries");
  });

  it("asks again when a grocery write fires grocery:changed, and when the window gets focus", async () => {
    nav.path = "/";
    const state = serveList([entry("a")]);
    render(<AppHeader />);
    await waitFor(() => expect(groceries().textContent).toContain("1"));
    state.items = [entry("a"), entry("b"), entry("c")];
    act(() => {
      window.dispatchEvent(new Event("grocery:changed"));
    });
    await waitFor(() => expect(groceries().textContent).toBe("Groceries3 (3 to buy)"));
    state.items = [entry("a")];
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(groceries().textContent).toBe("Groceries1 (1 to buy)"));
  });

  it("keeps the header working when the list can't be fetched", async () => {
    nav.path = "/";
    server.use(http.get("*/api/grocery", () => HttpResponse.json({ error: { code: "internal", message: "x" } }, { status: 500 })));
    render(<AppHeader />);
    await new Promise((r) => setTimeout(r, 50));
    expect(groceries().textContent).toBe("Groceries");
  });
});
