import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

function current(path: string) {
  nav.path = path;
  const { unmount } = render(<AppHeader />);
  const links = screen.getAllByRole("link", { name: /^(Recipes|Add|Import|Settings)$/ });
  const names = links.filter((l) => l.getAttribute("aria-current") === "page").map((l) => l.textContent);
  unmount();
  return names;
}

describe("AppHeader", () => {
  it("lists Recipes, Add, Import and Settings in order, with Add going to the new-recipe form", () => {
    nav.path = "/";
    render(<AppHeader />);
    const links = screen.getAllByRole("link").filter((l) => l.getAttribute("aria-label") !== "Recipe Box home");
    expect(links.map((l) => l.textContent)).toEqual(["Recipes", "Add", "Import", "Settings"]);
    expect(screen.getByRole("link", { name: "Add" })).toHaveProperty("pathname", "/recipes/new");
  });

  it("marks Add current on /recipes/new only", () => {
    expect(current("/recipes/new")).toEqual(["Add"]);
    expect(current("/recipes/abc")).toEqual(["Recipes"]);
    expect(current("/")).toEqual(["Recipes"]);
    expect(current("/import")).toEqual(["Import"]);
  });
});
