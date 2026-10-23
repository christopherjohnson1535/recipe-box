import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(app)/page";
import type { RecipeSummary, Tag } from "@/lib/api";
import { server } from "@/test/server";

vi.mock("next/headers", () => ({ cookies: async () => ({ toString: () => "" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const r = (id: string, over: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id, title: `Recipe ${id}`, description: "", totalMinutes: 30, tags: [], imageUrl: null, sourceType: "manual", updatedAt: "2026-05-01T00:00:00Z", ...over,
});
const withPhoto = r("cover", {
  title: "Short Ribs Slow and Low",
  description: "Three hours in the oven.",
  totalMinutes: 200,
  tags: ["braise", "sunday", "winter"],
  imageUrl: "/media/cover.jpg",
  updatedAt: "2025-01-01T00:00:00Z",
});
const others = Array.from({ length: 9 }, (_, i) => r(`o${i}`, { updatedAt: `2026-0${i + 1}-01T00:00:00Z`, tags: i === 0 ? ["soups"] : [] }));

function serve(items: RecipeSummary[], tags: Tag[] = [{ name: "soups", count: 1 }], filteredItems?: RecipeSummary[]) {
  server.use(
    http.get("*/api/recipes", ({ request }) => {
      const url = new URL(request.url);
      const list = url.searchParams.has("q") || url.searchParams.has("tag") ? (filteredItems ?? items) : items;
      return HttpResponse.json({ items: list, total: list.length });
    }),
    http.get("*/api/tags", () => HttpResponse.json(tags)),
  );
}
const home = async (sp: Record<string, string> = {}) => render(await HomePage({ searchParams: Promise.resolve(sp) }));

describe("home page, magazine layout", () => {
  it("shows the issue line, cover story, ticker, grid and sidebar", async () => {
    serve([...others, withPhoto]);
    await home();

    expect(screen.getByText(/Vol\.\s*II\s*·\s*No\.\s*10/)).toBeTruthy();
    expect(screen.getByText("The Autumn Issue")).toBeTruthy();
    expect(screen.getByText("Thursday, October 22, 2026")).toBeTruthy();

    expect(screen.getByRole("heading", { level: 1, name: "Short Ribs Slow and Low" })).toBeTruthy();
    expect(screen.getByText("Cover story · braise · sunday")).toBeTruthy();
    expect(screen.getByText("Three hours in the oven.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start cooking" }).getAttribute("href")).toBe("/recipes/cover/cook");
    expect(screen.getByRole("link", { name: "Read the recipe" }).getAttribute("href")).toBe("/recipes/cover");

    const ticker = screen.getByRole("region", { name: "In season" });
    expect(within(ticker).getAllByText("Delicata squash")).toHaveLength(2);
    expect(ticker.querySelectorAll("ul[aria-hidden='true']")).toHaveLength(1);

    // FND-1: every recipe but the cover is in the grid.
    const grid = screen.getByRole("region", { name: "All recipes" });
    expect(within(grid).getAllByRole("heading", { level: 2 })).toHaveLength(9);
    expect(within(grid).queryByText("Short Ribs Slow and Low")).toBeNull();

    expect(screen.getByRole("complementary", { name: "Also in this issue" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Haven’t cooked in a while" }).textContent).toContain("Last edited");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("falls back to the grid with a plain Recipes headline when no recipe has a photo", async () => {
    serve(others.slice(0, 3));
    await home();
    expect(screen.getByRole("heading", { level: 1, name: "Recipes" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "In season" })).toBeNull();
    const grid = screen.getByRole("region", { name: "All recipes" });
    expect(within(grid).getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(grid.querySelector("img")).toBeNull(); // paper plates with spot icons, not broken images
    expect(grid.querySelectorAll("svg[data-spot]")).toHaveLength(3);
    expect(screen.queryByRole("complementary")).toBeNull(); // too few recipes for panels
  });

  it("hides cover, ticker and sidebar while filtering but keeps the issue line", async () => {
    serve([...others, withPhoto], [{ name: "soups", count: 1 }], [others[0]]);
    await home({ q: "soup" });
    expect(screen.getByText(/Vol\./)).toBeTruthy();
    expect(screen.getByText(/No\.\s*10/)).toBeTruthy(); // the whole box, not the one match
    expect(screen.queryByText("Cover story · braise · sunday")).toBeNull();
    expect(screen.queryByRole("region", { name: "In season" })).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("region", { name: "1 matching recipes" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("1 recipe matches “soup”");
    expect(screen.getByRole("heading", { level: 1, name: "Recipes" })).toBeTruthy();
  });

  it("shows a spot icon on a tag chip only where the tag maps to one", async () => {
    serve([...others, withPhoto], [{ name: "soups", count: 1 }, { name: "party", count: 2 }]);
    await home();
    const nav = screen.getAllByRole("navigation", { name: "Filter by tag" })[0];
    expect(within(nav).getByRole("link", { name: /soups/ }).querySelector("svg[data-spot='soups']")).toBeTruthy();
    expect(within(nav).getByRole("link", { name: /party/ }).querySelector("svg")).toBeNull();
  });

  it("keeps the empty box state", async () => {
    serve([], []);
    await home();
    expect(screen.getByText("No recipes yet")).toBeTruthy();
  });
});
