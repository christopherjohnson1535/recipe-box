import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeSummary } from "@/lib/api";
import { summary } from "@/test/handlers";
import { server } from "@/test/server";
import { DishPicker } from "./DishPicker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const r = (id: string, title: string): RecipeSummary => ({ ...summary, id, title });
const recipes = [r("a", "Apple pie"), r("b", "Beef stew"), r("c", "Carrot soup"), r("d", "Dal"), r("e", "Egg salad")];
const card = (name: RegExp) => screen.getByRole("button", { name });
const start = () => screen.getByRole("button", { name: "Start cooking" }) as HTMLButtonElement;

beforeEach(() => push.mockClear());
afterEach(() => vi.restoreAllMocks());

describe("DishPicker", () => {
  it("has the recipe you came from chosen, and starts only from two", () => {
    render(<DishPicker recipes={recipes} initial={["b"]} />);
    expect(card(/Beef stew/).getAttribute("aria-pressed")).toBe("true");
    expect(card(/Apple pie/).getAttribute("aria-pressed")).toBe("false");
    expect(start().disabled).toBe(true);
    fireEvent.click(card(/Carrot soup/));
    expect(start().disabled).toBe(false);
    fireEvent.click(start());
    expect(push).toHaveBeenCalledWith("/cook?recipes=b,c"); // in the order chosen
  });

  it("goes back to none chosen when a card is tapped again", () => {
    render(<DishPicker recipes={recipes} initial={[]} />);
    expect(screen.getByText("None chosen")).toBeTruthy();
    fireEvent.click(card(/Apple pie/));
    fireEvent.click(card(/Beef stew/));
    expect(screen.getByText("2 chosen")).toBeTruthy();
    fireEvent.click(card(/Apple pie/));
    expect(start().disabled).toBe(true);
    expect(card(/Apple pie/).getAttribute("aria-pressed")).toBe("false");
  });

  it("stops at four dishes and says so, and takes one away to make room", () => {
    render(<DishPicker recipes={recipes} initial={["a", "b", "c"]} />);
    fireEvent.click(card(/Dal/));
    expect(screen.getByText("Up to four dishes")).toBeTruthy();
    expect(screen.getByText("Up to four dishes at a time.")).toBeTruthy();
    fireEvent.click(card(/Egg salad/));
    expect(card(/Egg salad/).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(start());
    expect(push).toHaveBeenCalledWith("/cook?recipes=a,b,c,d");
    fireEvent.click(card(/Apple pie/));
    fireEvent.click(card(/Egg salad/));
    expect(card(/Egg salad/).getAttribute("aria-pressed")).toBe("true");
  });

  it("leaves out a recipe that is no longer in the box, and Cancel goes back to the one you came from", () => {
    render(<DishPicker recipes={recipes} initial={["gone", "a"]} />);
    expect(screen.getByText("1 chosen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/recipes/a");
  });

  it("cancels to the home page when nothing brought you here", () => {
    render(<DishPicker recipes={recipes} initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("says why Start cooking is off, in words, until two are chosen", () => {
    render(<DishPicker recipes={recipes} initial={[]} />);
    expect(screen.getByText("Choose two dishes")).toBeTruthy();
    fireEvent.click(card(/Apple pie/));
    expect(screen.queryByText("Choose two dishes")).toBeNull();
    expect(screen.getByText("Choose one more dish")).toBeTruthy();
    fireEvent.click(card(/Beef stew/));
    expect(screen.queryByText("Choose one more dish")).toBeNull();
  });

  it("marks the other recipes unavailable at four, still focusable and explained, and leaves the chosen ones live", () => {
    render(<DishPicker recipes={recipes} initial={["a", "b", "c", "d"]} />);
    const egg = card(/Egg salad/);
    expect(egg.getAttribute("aria-disabled")).toBe("true");
    expect(egg.getAttribute("aria-describedby")).toBe("dish-cap");
    expect(document.getElementById("dish-cap")?.textContent).toBe("Up to four dishes at a time.");
    expect(document.getElementById("dish-cap")?.closest('[role="status"]')).toBeTruthy(); // announced
    expect(egg.hasAttribute("disabled")).toBe(false);
    fireEvent.click(egg);
    expect(egg.getAttribute("aria-pressed")).toBe("false");
    expect(card(/Apple pie/).getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(card(/Apple pie/)); // one off: the rest are live again
    expect(egg.getAttribute("aria-disabled")).toBeNull();
  });
});

describe("DishPicker search", () => {
  const found = r("z", "Zucchini pie");
  /** Answers `GET /api/recipes?q=…` and records the query strings. */
  function search(items: RecipeSummary[] = [found], status = 200) {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get("*/api/recipes", ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return status === 200 ? HttpResponse.json({ items, total: items.length }) : HttpResponse.json({ error: { code: "internal", message: "Oops." } }, { status });
      }),
    );
    return seen;
  }
  const type = (value: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search recipes" }), { target: { value } });

  it("asks the server, so a recipe past the first page can be found and chosen, and keeps the chosen dish on screen", async () => {
    const seen = search();
    render(<DishPicker recipes={recipes} initial={["b"]} />);
    type("pie");
    await screen.findByRole("button", { name: /Zucchini pie/ });
    expect(seen).toHaveLength(1);
    expect(seen[0].get("q")).toBe("pie");
    expect(card(/Beef stew/).getAttribute("aria-pressed")).toBe("true"); // from the link: still there and still chosen
    expect(screen.queryByRole("button", { name: /Apple pie/ })).toBeNull();
    fireEvent.click(card(/Zucchini pie/));
    expect(screen.getByText("2 chosen")).toBeTruthy();
    fireEvent.click(start());
    expect(push).toHaveBeenCalledWith("/cook?recipes=b,z");
  });

  it("waits for a pause in typing, and shows the first page again when the box is cleared", async () => {
    const seen = search();
    render(<DishPicker recipes={recipes} initial={[]} />);
    type("p");
    type("pi");
    type("pie");
    await screen.findByRole("button", { name: /Zucchini pie/ });
    expect(seen.map((q) => q.get("q"))).toEqual(["pie"]);
    type("");
    expect(card(/Apple pie/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Zucchini pie/ })).toBeNull();
  });

  it("says when nothing matches", async () => {
    search([]);
    render(<DishPicker recipes={recipes} initial={[]} />);
    type("xyz");
    await screen.findByText("No dishes match “xyz”.");
  });

  it("keeps the dishes on screen and says so when the search fails", async () => {
    search([], 500);
    render(<DishPicker recipes={recipes} initial={[]} />);
    type("pie");
    await screen.findByText(/Couldn’t search just now/);
    expect(card(/Apple pie/)).toBeTruthy();
  });

  it("needs the server: offline the box is off, with the reason", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<DishPicker recipes={recipes} initial={[]} />);
    const box = screen.getByRole("searchbox", { name: "Search recipes" }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(screen.getByText("You’re offline. Searching needs the server.")).toBeTruthy();
    expect(box.getAttribute("aria-describedby")).toBe("dish-search-offline");
  });
});
