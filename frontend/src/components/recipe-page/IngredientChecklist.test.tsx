import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IngredientChecklist } from "./IngredientChecklist";
import { RecipeBar } from "./RecipeBar";
import { RecipeStateProvider, ScaledServings } from "./RecipeState";
import { StepText } from "./StepText";

const GROUPS = [
  {
    section: null,
    items: [
      { index: 0, text: "4 lb bone-in short ribs" },
      { index: 1, text: "1 cup flour" },
      { index: 2, text: "salt to taste" },
    ],
  },
  { section: "For the gremolata", items: [{ index: 3, text: "½ cup parsley" }] },
];

function page(id = "r1") {
  return (
    <RecipeStateProvider id={id}>
      <ScaledServings servings="4-6" />
      <IngredientChecklist groups={GROUPS} />
      <RecipeBar id={id} total={4} />
    </RecipeStateProvider>
  );
}

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("IngredientChecklist", () => {
  it("shows quantities in their own column and section headings", () => {
    render(page());
    expect(screen.getByText("4 lb")).toBeTruthy();
    expect(screen.getByText("bone-in short ribs")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "For the gremolata" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /salt to taste/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("ticks a row, counts it in the bar and keeps it in sessionStorage", () => {
    render(page());
    expect(screen.getByText("Ready when you are")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /flour/ }));
    expect(screen.getByRole("button", { name: /flour/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1 ingredient checked")).toBeTruthy();
    expect(sessionStorage.getItem("recipe-ticks:r1")).toBe("[1]");
    fireEvent.click(screen.getByRole("button", { name: /parsley/ }));
    expect(screen.getByText("2 ingredients checked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /flour/ }));
    expect(sessionStorage.getItem("recipe-ticks:r1")).toBe("[3]");
  });

  it("restores ticks and scale after a reload, per recipe", () => {
    sessionStorage.setItem("recipe-ticks:r1", "[0,3]");
    sessionStorage.setItem("recipe-scale:r1", "2");
    const { unmount } = render(page());
    expect(screen.getByRole("button", { name: /short ribs/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /flour/ }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("8 lb")).toBeTruthy();
    expect(screen.getByText("2 ingredients checked")).toBeTruthy();
    unmount();
    render(page("other"));
    expect(screen.getByText("4 lb")).toBeTruthy();
    expect(screen.getByText("Ready when you are")).toBeTruthy();
  });

  it("scales quantities and servings, and says so", () => {
    render(page());
    fireEvent.click(screen.getByRole("radio", { name: "2×" }));
    expect(screen.getByText("8 lb")).toBeTruthy();
    expect(screen.getByText("2 cups")).toBeTruthy();
    expect(screen.getByText("1 cup")).toBeTruthy(); // ½ cup parsley doubled
    expect(screen.getByText("8–12")).toBeTruthy();
    expect(screen.getByText("Scaled to 2×")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "½×" }));
    expect(screen.getByText("2 lb")).toBeTruthy();
    expect(screen.getByText("¼ cup")).toBeTruthy();
    expect(screen.getByText("2–3")).toBeTruthy();
    expect(sessionStorage.getItem("recipe-scale:r1")).toBe("0.5");
    expect(screen.getByRole("radiogroup", { name: "Scale" })).toBeTruthy();
  });

  it("ignores broken stored values", () => {
    sessionStorage.setItem("recipe-ticks:r1", "not json");
    sessionStorage.setItem("recipe-scale:r1", "7");
    render(page());
    expect(screen.getByText("4 lb")).toBeTruthy();
    expect(screen.getByText("Ready when you are")).toBeTruthy();
  });

  it("has an empty note when there are no ingredients", () => {
    render(
      <RecipeStateProvider id="r2">
        <IngredientChecklist groups={[]} />
      </RecipeStateProvider>,
    );
    expect(screen.getByText("No ingredients listed.")).toBeTruthy();
  });
});

describe("StepText", () => {
  it("links named ingredients and sets durations as timers", () => {
    render(<p><StepText text="Brown the ribs, then braise 2 hours." ingredients={["4 lb bone-in short ribs"]} /></p>);
    expect(screen.getByRole("link", { name: "ribs" }).getAttribute("href")).toBe("#ingredient-0");
    expect(screen.getByText("2 hours")).toBeTruthy();
    expect(screen.getByText("2 hr")).toBeTruthy();
  });
});

describe("when sessionStorage throws", () => {
  it("still ticks, for as long as the page stays open", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(page("blocked"));
    fireEvent.click(screen.getByRole("button", { name: /flour/ }));
    expect(screen.getByText("1 ingredient checked")).toBeTruthy();
    get.mockRestore();
    set.mockRestore();
  });
});
