import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { groceryList } from "@/test/handlers";
import { server } from "@/test/server";
import { AddToGroceries } from "./AddToGroceries";
import { RecipeStateProvider } from "./RecipeState";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

function mount() {
  render(
    <RecipeStateProvider id="r1">
      <AddToGroceries recipeId="r1" />
    </RecipeStateProvider>,
  );
}
const captured = () => {
  const bodies: unknown[] = [];
  server.use(
    http.post("*/api/grocery/recipes", async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(groceryList);
    }),
  );
  return bodies;
};

describe("AddToGroceries", () => {
  it("adds the recipe at the scale the page shows (1× by default) and links to the list", async () => {
    const bodies = captured();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add to groceries" }));
    await screen.findByText(/On your grocery list at 1×/);
    expect(bodies).toEqual([{ recipeId: "r1", scale: 1 }]);
    expect(screen.getByRole("link", { name: "Open the list" }).getAttribute("href")).toBe("/groceries");
  });

  it("sends the scale the reader chose", async () => {
    sessionStorage.setItem("recipe-scale:r1", "2");
    const bodies = captured();
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add to groceries" }));
    await screen.findByText(/On your grocery list at 2×/);
    expect(bodies).toEqual([{ recipeId: "r1", scale: 2 }]);
  });

  it("tells the family when the server refuses, and the button stays", async () => {
    server.use(http.post("*/api/grocery/recipes", () => HttpResponse.json({ error: { code: "not_found", message: "That recipe was deleted." } }, { status: 404 })));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add to groceries" }));
    expect((await screen.findByRole("alert")).textContent).toContain("That recipe was deleted.");
    expect(screen.queryByText(/On your grocery list/)).toBeNull();
    expect((screen.getByRole("button", { name: "Add to groceries" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("fires grocery:changed after a successful add so the masthead count updates", async () => {
    captured();
    const changed = vi.fn();
    window.addEventListener("grocery:changed", changed);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add to groceries" }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    window.removeEventListener("grocery:changed", changed);
  });

  it("is off while offline, with the reason tied to the button", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mount();
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    const button = screen.getByRole("button", { name: "Add to groceries" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toMatch(/offline/i);
  });
});
