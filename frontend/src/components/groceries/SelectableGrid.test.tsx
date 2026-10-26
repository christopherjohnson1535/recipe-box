import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeSummary } from "@/lib/api";
import { groceryList, summary } from "@/test/handlers";
import { server } from "@/test/server";
import { SelectableGrid } from "./SelectableGrid";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
beforeEach(() => push.mockClear());

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

  it("counts and adds only the chosen recipes still on screen", async () => {
    const posted = record();
    const { rerender } = render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    fireEvent.click(screen.getByRole("button", { name: /Beef stew/ }));
    rerender(<SelectableGrid recipes={[recipes[0], recipes[2]]} />); // a search took Beef stew off the grid
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to groceries" }));
    await screen.findByText(/Added 1 recipe to your groceries/);
    expect(posted.map((p) => p.recipeId)).toEqual(["a"]);
  });

  it("puts focus on the first card going in, and back on Select recipes coming out", () => {
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Apple pie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Select recipes" }));
  });

  it("shows the result in the toast region at the bottom, above the bar while choosing goes on", async () => {
    record("b");
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    fireEvent.click(screen.getByRole("button", { name: /Beef stew/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to groceries" }));
    const alert = await screen.findByRole("alert");
    const region = alert.closest('[role="status"]')!;
    expect(region.className).toContain("fixed");
    expect(region.className).toContain("5.5rem"); // lifted clear of the bar
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
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

  const together = () => screen.getByRole("button", { name: "Cook together" });
  const off = () => together().getAttribute("aria-disabled") === "true";

  it("opens the chosen recipes in cook together, for two to four only", () => {
    const five = [...recipes, r("d", "Dal"), r("e", "Egg salad")];
    render(<SelectableGrid recipes={five} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    expect(screen.getByText("Tap recipes to shop for or cook together.")).toBeTruthy();
    expect(off()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    expect(off()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Carrot soup/ }));
    expect(off()).toBe(false);
    fireEvent.click(together());
    expect(push).toHaveBeenCalledWith("/cook?recipes=a,c");
    fireEvent.click(screen.getByRole("button", { name: /Beef stew/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dal/ }));
    expect(off()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Egg salad/ }));
    expect(off()).toBe(true); // five is too many
    push.mockClear();
    fireEvent.click(together());
    expect(push).not.toHaveBeenCalled();
  });

  it("takes the dishes in the order they were tapped, not the grid's", () => {
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    for (const name of [/Carrot soup/, /Apple pie/, /Beef stew/]) fireEvent.click(screen.getByRole("button", { name }));
    fireEvent.click(together());
    expect(push).toHaveBeenCalledWith("/cook?recipes=c,a,b");
    push.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Carrot soup/ })); // untap and tap again: now last
    fireEvent.click(screen.getByRole("button", { name: /Carrot soup/ }));
    fireEvent.click(together());
    expect(push).toHaveBeenCalledWith("/cook?recipes=a,b,c");
  });

  it("says why Cook together is off, with one chosen and with too many", () => {
    const five = [...recipes, r("d", "Dal"), r("e", "Egg salad")];
    render(<SelectableGrid recipes={five} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    expect(screen.queryByText(/to cook together$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    expect(screen.getByText("Choose one more to cook together")).toBeTruthy();
    expect(together().getAttribute("aria-describedby")).toBe(screen.getByText("Choose one more to cook together").id);
    for (const name of [/Beef stew/, /Carrot soup/, /Dal/, /Egg salad/]) fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByText("Cook together takes up to four dishes")).toBeTruthy();
    expect(off()).toBe(true);
    expect(together().hasAttribute("disabled")).toBe(false); // focusable, so it can explain itself
  });

  it("cannot be opened while the chosen recipes are being added to the list", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post("*/api/grocery/recipes", async () => {
        await gate;
        return HttpResponse.json(groceryList);
      }),
    );
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    fireEvent.click(screen.getByRole("button", { name: /Beef stew/ }));
    expect(off()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to groceries" }));
    await screen.findByRole("button", { name: "Adding…" });
    expect(off()).toBe(true);
    fireEvent.click(together());
    expect(push).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: "Select recipes" })).toBeTruthy());
  });

  it("goes off, with the reason, when the network goes while choosing", () => {
    render(<SelectableGrid recipes={recipes} />);
    fireEvent.click(screen.getByRole("button", { name: "Select recipes" }));
    fireEvent.click(screen.getByRole("button", { name: /Apple pie/ }));
    fireEvent.click(screen.getByRole("button", { name: /Beef stew/ }));
    expect(off()).toBe(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(off()).toBe(true);
    expect(screen.getByText("You’re offline: cook together needs the server")).toBeTruthy();
    vi.restoreAllMocks();
  });
});
