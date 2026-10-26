import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(app)/page";
import type { RecipeSummary, Tag } from "@/lib/api";
import { server } from "@/test/server";

vi.mock("next/headers", () => ({ cookies: async () => ({ toString: () => "" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const r = (id: string, over: Partial<RecipeSummary> = {}): RecipeSummary => ({
  imageDisplayUrl: null, servings: null,
  id, title: `Recipe ${id}`, description: "", totalMinutes: 30, tags: [], imageUrl: null, sourceType: "manual", updatedAt: "2026-05-01T00:00:00Z", ...over,
});
const withPhoto = r("featured", {
  title: "Short Ribs Slow and Low",
  description: "Three hours in the oven.",
  totalMinutes: 200,
  servings: "4",
  tags: ["braise", "sunday", "winter"],
  imageUrl: "/media/featured.jpg",
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

describe("home page", () => {
  it("shows the featured recipe, ticker, grid and sidebar", async () => {
    serve([...others, withPhoto]);
    await home();

    // The date, season and count live in the top band in the layout; the page itself carries no issue line.
    expect(screen.queryByText(/Vol\.|No\.\s*\d|The \w+ Issue/)).toBeNull();
    expect(screen.queryByText("Thursday, October 22, 2026")).toBeNull();

    expect(screen.getByRole("heading", { level: 2, name: "Short Ribs Slow and Low" })).toBeTruthy();
    expect(screen.getByText("Featured · braise · sunday")).toBeTruthy();
    expect(screen.getByText("Three hours in the oven.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start cooking: Short Ribs Slow and Low" }).getAttribute("href")).toBe("/recipes/featured/cook");
    expect(screen.getByRole("link", { name: "Read the recipe: Short Ribs Slow and Low" }).getAttribute("href")).toBe("/recipes/featured");

    const ticker = screen.getByRole("region", { name: "In season" });
    expect(within(ticker).getAllByText("Delicata squash")).toHaveLength(2);
    expect(ticker.querySelectorAll("ul[aria-hidden='true']")).toHaveLength(1);

    // FND-1: every recipe but the featured one is in the grid.
    const grid = screen.getByRole("region", { name: "All recipes" });
    expect(within(grid).getAllByRole("heading", { level: 2 })).toHaveLength(9);
    expect(within(grid).queryByText("Short Ribs Slow and Low")).toBeNull();

    expect(screen.getByRole("complementary", { name: "More to cook" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Haven’t cooked in a while" }).textContent).toContain("Not touched since");
    // One h1 "Recipes" (visually hidden) even with a featured recipe.
    expect(screen.getByRole("heading", { level: 1, name: "Recipes" }).className).toContain("sr-only");
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

  it("sets the grid in three columns from 1280px, two from 640px, one below", async () => {
    serve([...others, withPhoto]);
    await home();
    const list = screen.getByRole("region", { name: "All recipes" }).querySelector("ul")!;
    expect(list.className).toContain("grid-cols-1");
    expect(list.className).toContain("min-[640px]:grid-cols-2");
    expect(list.className).toContain("min-[1280px]:grid-cols-3");
  });

  it("keeps the normal responsive columns on a filtered result, with no sidebar", async () => {
    for (const n of [2, 4]) {
      const found = others.slice(0, n);
      serve([...others, withPhoto], [{ name: "soups", count: 1 }], found);
      const { unmount } = await home({ q: "soup" });
      expect(screen.queryByRole("complementary")).toBeNull();
      const list = screen.getByRole("region", { name: `${n} matching recipes` }).querySelector("ul")!;
      expect(list.children).toHaveLength(n);
      expect(list.className).toContain("min-[640px]:grid-cols-2");
      expect(list.className).toContain("min-[1280px]:grid-cols-3");
      unmount();
    }
  });

  it("uses lasting copy: Featured and More to cook, no issue, cover or collection wording", async () => {
    serve([...others, withPhoto]);
    const { container } = await home();
    expect(screen.getByText(/^Featured · /)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "More to cook" })).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/issue|cover story|the collection|volume|edition/i);
    expect(screen.queryByText("Start cooking")).toBeTruthy();
    expect(screen.queryByText("Read the recipe")).toBeTruthy();
  });

  it("drops the collection kicker from the plain Recipes head too", async () => {
    serve(others.slice(0, 3));
    const { container } = await home();
    expect(container.textContent).not.toMatch(/the collection/i);
  });

  it("shows the time and servings in the featured meta strip", async () => {
    serve([...others, withPhoto]);
    await home();
    expect(screen.getByText("3 hr 20 min · Serves 4")).toBeTruthy();
  });

  it("shows the time only when the featured recipe has no servings", async () => {
    serve([...others, { ...withPhoto, servings: null }]);
    await home();
    expect(screen.getByText("3 hr 20 min")).toBeTruthy();
    expect(screen.queryByText(/Serves/)).toBeNull();
  });

  it("shows servings alone, as written, when there is no time", async () => {
    serve([...others, { ...withPhoto, totalMinutes: null, servings: "makes 12 cookies" }]);
    await home();
    expect(screen.getByText("makes 12 cookies")).toBeTruthy();
  });

  it("shows a servings phrase as written beside the time", async () => {
    serve([...others, { ...withPhoto, servings: "makes 12 cookies" }]);
    await home();
    expect(screen.getByText("3 hr 20 min · makes 12 cookies")).toBeTruthy();
    expect(screen.queryByText(/Serves/)).toBeNull();
  });

  it("leaves the meta strip out when the featured recipe has neither time nor servings", async () => {
    serve([...others, { ...withPhoto, totalMinutes: null, servings: null }]);
    await home();
    const featured = screen.getByRole("heading", { level: 2, name: "Short Ribs Slow and Low" }).closest("article")!;
    expect(within(featured).getByText("Three hours in the oven.")).toBeTruthy();
    expect(within(featured).queryByText(/ hr| min|Serves/)).toBeNull();
    // The kicker ("Featured · tags") is the only place the card uses "·"; a time/servings strip would add another.
    const kicker = within(featured).getByText(/^Featured · /).textContent ?? "";
    expect((featured.textContent ?? "").replace(kicker, "")).not.toContain("·");
  });

  it("hides the featured recipe, ticker and sidebar while filtering", async () => {
    serve([...others, withPhoto], [{ name: "soups", count: 1 }], [others[0]]);
    await home({ q: "soup" });
    expect(screen.queryByText("Featured · braise · sunday")).toBeNull();
    expect(screen.queryByRole("region", { name: "In season" })).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("region", { name: "1 matching recipes" })).toBeTruthy();
    expect(screen.getByText("1 recipe matches “soup”").closest('[role="status"]')).toBeTruthy();
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
