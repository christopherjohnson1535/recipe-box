import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { RecipeSummary } from "@/lib/api";
import { groceryList, summary } from "@/test/handlers";
import { server } from "@/test/server";
import { SelectableGrid } from "./SelectableGrid";

const r = (id: string, title: string): RecipeSummary => ({ ...summary, id, title });
const recipes = [r("a", "Apple pie"), r("b", "Beef stew"), r("c", "Carrot soup")];

function record(failFor?: string) {
  const posted: { recipeId: string; scale: number }[] = [];
  server.use(
    http.post("*/api/grocery/recipes", async ({ request }) => {
      const body = (await request.json()) as { recipeId: string; scale: number };
      posted.push(body);
      if (body.recipeId === failFor) return HttpResponse.json({ error: { code: "not_found", message: "Gone." } }, { status: 404 });
      return HttpResponse.json(groceryList);
    }),
  );
  return posted;
}

describe("SelectableGrid", () => {
  it("shows the normal cards, linking to the recipes, until you choose Select recipes", () => {
    render(<SelectableGrid recipes={recipes} />);
    expect(screen.getByRole("link", { name: /Apple pie/ }).getAttribute("href")).toBe("/recipes/a");
    expect(screen.queryByRole("button", { name: /Add .* to groceries/ })).toBeNull();
  });

  it("adds each chosen recipe at 1×, one after another, then leaves select mode with a link to the list", async () => {
    const posted = record();
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    expect((screen.getByRole("button", { name: "Add to groceries" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    fireEvent.click(screen.getByRole("button", { name: /Carrot soup/ }));
    expect(screen.getByRole("button", { name: /Apple pie/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Beef stew/ }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to groceries" }));
    await screen.findByText(/Added 2 recipes to your groceries/);
    expect(posted).toEqual([{ recipeId: "a", scale: 1 }, { recipeId: "c", scale: 1 }]);
    expect(screen.getByRole("link", { name: "Open the list" }).getAttribute("href")).toBe("/groceries");
    expect(screen.getByRole("button", { name: "Select recipes" })).toBeTruthy(); // back to the normal grid
  });

  it("keeps the ones that failed chosen and says which", async () => {
    const posted = record("b");
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    for (const name of [/Apple pie/, /Beef stew/]) fireEvent.click(screen.getByRole("button", { name: name }));
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to groceries" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn’t add Beef stew");
    expect(alert.textContent).toContain("Added 1 recipe");
    expect(posted.map((p) => p.recipeId)).toEqual(["a", "b"]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Add 1 to groceries" })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Beef stew/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("cancels without sending anything", () => {
    const posted = record();
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(posted).toEqual([]);
    expect(screen.getByRole("link", { name: /Apple pie/ })).toBeTruthy();
  });
});
