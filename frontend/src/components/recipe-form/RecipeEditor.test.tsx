import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveStamp } from "../ui/SaveStamp";
import { hideSaveStamp } from "../ui/save-stamp-store";
import { RecipeEditor } from "./RecipeEditor";
import type { Recipe, RecipeInput } from "@/lib/api";

const h = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("@/lib/api", () => ({ api: { createRecipe: h.create, updateRecipe: h.update } }));
vi.mock("./RecipeForm", () => ({
  RecipeForm: ({ onSubmit }: { onSubmit: (i: RecipeInput) => Promise<void> }) => (
    <button onClick={() => void onSubmit({ title: "T" } as RecipeInput)}>go</button>
  ),
}));

afterEach(() => act(() => hideSaveStamp()));

describe("RecipeEditor save feedback", () => {
  it("stamps a new recipe", async () => {
    h.create.mockResolvedValue({ id: "n1" });
    render(<SaveStamp />);
    render(<RecipeEditor />);
    await act(async () => screen.getByText("go").click());
    expect(h.push).toHaveBeenCalledWith("/recipes/n1");
    expect(screen.getByRole("status").textContent).toBe("Recipe saved.");
  });

  it("does not stamp an edit", async () => {
    h.update.mockResolvedValue({ id: "e1" });
    render(<SaveStamp />);
    render(<RecipeEditor recipe={{ id: "e1" } as Recipe} />);
    await act(async () => screen.getByText("go").click());
    expect(h.update).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
