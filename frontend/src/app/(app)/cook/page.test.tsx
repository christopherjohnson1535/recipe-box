import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { Recipe, RecipeSummary } from "@/lib/api";
import { recipe, summary } from "@/test/handlers";
import { expectConsole } from "@/test/console";
import { server } from "@/test/server";
import CookTogetherPage, { generateMetadata } from "./page";

vi.mock("next/headers", () => ({ cookies: async () => ({ toString: () => "" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const dish = (id: string, title: string): Recipe => ({
  ...recipe, id, title, ingredients: [{ text: "1 onion" }] as Recipe["ingredients"], steps: [{ text: `Cook the ${title}.` }] as Recipe["steps"],
});
const stock = [dish("a", "Apple pie"), dish("b", "Beef stew"), dish("c", "Carrot soup"), dish("d", "Dal")];

function serve(box: Recipe[] = stock, listStatus = 200) {
  const asSummary = (r: Recipe): RecipeSummary => ({ ...summary, id: r.id, title: r.title });
  server.use(
    http.get("*/api/recipes/:id", ({ params }) => {
      const found = box.find((r) => r.id === params.id);
      return found ? HttpResponse.json(found) : HttpResponse.json({ error: { code: "not_found", message: "Gone." } }, { status: 404 });
    }),
    http.get("*/api/recipes", ({ request }) => {
      if (listStatus !== 200) return HttpResponse.json({ error: { code: "internal", message: "Oops." } }, { status: listStatus });
      expect(new URL(request.url).searchParams.get("sort")).toBe("title");
      return HttpResponse.json({ items: box.map(asSummary), total: box.length });
    }),
  );
}
const page = async (recipes?: string) => render(await CookTogetherPage({ searchParams: Promise.resolve(recipes === undefined ? {} : { recipes }) }));
const title = async (recipes: string) => (await generateMetadata({ searchParams: Promise.resolve({ recipes }) })).title;

describe("cook together page", () => {
  it("starts cooking two to four recipes, in the order of the link", async () => {
    serve();
    expectConsole("error", /Encountered a script tag/); // the evening-pin script only runs in the server's HTML
    await page("b,a");
    expect(screen.getByRole("dialog", { name: "Cooking mode" })).toBeTruthy();
    expect(screen.getByText("Cook the Beef stew.")).toBeTruthy(); // the first recipe's first step first
    expect(screen.getByRole("link", { name: "Close" }).getAttribute("href")).toBe("/"); // the recipes, not one of the dishes
    expect(await title("b,a")).toBe("Cooking together");
  });

  it("shows the picker with the one recipe from the link already chosen", async () => {
    serve();
    await page("c");
    expect(screen.getByRole("heading", { level: 1, name: "Cook together" })).toBeTruthy();
    expect(screen.getByText("Choose two to four dishes to cook at the same time.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Carrot soup/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Apple pie/ }).getAttribute("aria-pressed")).toBe("false");
    expect(await title("c")).toBe("Cook together");
  });

  it("shows the picker with nothing chosen when there is no link", async () => {
    serve();
    await page();
    expect(screen.getByRole("button", { name: /Apple pie/ })).toBeTruthy();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("falls back to the picker when a recipe has been deleted, leaving the other chosen", async () => {
    serve();
    await page("a,gone");
    expect(screen.getByRole("heading", { level: 1, name: "Cook together" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Apple pie/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 chosen")).toBeTruthy();
    expect(screen.getByText("One of those recipes is no longer in the box.")).toBeTruthy();
  });

  it("says nothing about a missing recipe when every one was found", async () => {
    serve();
    await page("c");
    expect(screen.queryByText(/no longer in the box/)).toBeNull();
  });

  it("starts over when the link changes to another set of recipes: nothing is carried across", async () => {
    serve();
    expectConsole("error", /Encountered a script tag/);
    const first = await CookTogetherPage({ searchParams: Promise.resolve({ recipes: "a,b,c" }) });
    const { rerender } = render(first);
    fireEvent.click(screen.getByRole("tab", { name: "Carrot soup" })); // the third dish's tab: no such tab in a session of two
    expect(screen.getByRole("tab", { name: "Carrot soup" }).getAttribute("aria-selected")).toBe("true");
    rerender(await CookTogetherPage({ searchParams: Promise.resolve({ recipes: "a,d" }) }));
    expect(screen.getByRole("tab", { name: "Apple pie" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("says so when the box has fewer than two recipes", async () => {
    serve([]);
    await page();
    expect(screen.getByRole("heading", { name: "No recipes yet" })).toBeTruthy();
    serve([stock[0]]);
    await page();
    expect(screen.getByRole("heading", { name: "One recipe so far" })).toBeTruthy();
  });

  it("degrades to the server error when the API fails", async () => {
    serve(stock, 500);
    await page();
    expect(screen.getByText("Can’t reach the Recipe Box server")).toBeTruthy();
    expect(await title("")).toBe("Cook together");
  });
});
