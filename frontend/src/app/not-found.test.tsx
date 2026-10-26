import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import NotFound from "./not-found";

vi.mock("next/navigation", () => ({ usePathname: () => "/nowhere", useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("unknown address (root not-found)", () => {
  it("renders the app shell without a session and without any API call", () => {
    const fetched = vi.spyOn(globalThis, "fetch");
    const { container } = render(<NotFound />);
    expect(fetched).not.toHaveBeenCalled();

    // One banner landmark: the band (date and season, no count), then the masthead with the wordmark and its double rule.
    const banners = screen.getAllByRole("banner");
    expect(banners).toHaveLength(1);
    const header = banners[0];
    expect(header.children[0].textContent).toMatch(/^\w+, October \d+ · Autumn$/);
    expect(within(header).queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(within(header).getByRole("link", { name: "Recipe Box home" }).getAttribute("href")).toBe("/");
    expect(header.querySelector(".rule-double")).toBeTruthy();
    expect(within(within(header).getByRole("navigation", { name: "Main" })).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Recipes",
      "Groceries",
      "Add",
      "Import",
      "Settings",
    ]);

    // The page itself, in the one main landmark after the header.
    const main = container.querySelector<HTMLElement>("main#main")!;
    expect(header.nextElementSibling).toBe(main);
    expect(within(main).getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
    expect(within(main).getByRole("link", { name: "Back to recipes" }).getAttribute("href")).toBe("/");
  });
});
