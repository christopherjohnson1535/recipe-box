import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecipeSummary } from "@/lib/api";
import { summary } from "@/test/handlers";
import { DishPicker } from "./DishPicker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const r = (id: string, title: string): RecipeSummary => ({ ...summary, id, title });
const recipes = [r("a", "Apple pie"), r("b", "Beef stew"), r("c", "Carrot soup"), r("d", "Dal"), r("e", "Egg salad")];
const card = (name: RegExp) => screen.getByRole("button", { name });
const start = () => screen.getByRole("button", { name: "Start cooking" }) as HTMLButtonElement;

beforeEach(() => push.mockClear());

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
});
