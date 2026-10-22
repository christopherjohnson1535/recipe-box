import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UndoToast } from "@/components/undo/UndoToast";
import { dismissUndo } from "@/components/undo/undo-store";
import { DeleteRecipeButton } from "./DeleteRecipeButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  act(() => dismissUndo());
  cleanup();
  push.mockClear();
});

const asApi = (f: ReturnType<typeof vi.fn>) => ({ deleteRecipe: f }) as unknown as Parameters<typeof DeleteRecipeButton>[0]["api"];

describe("DeleteRecipeButton", () => {
  it("deletes without asking, goes home and offers undo", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    render(
      <>
        <DeleteRecipeButton id="r1" title="Soup" api={asApi(del)} />
        <UndoToast />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(del).toHaveBeenCalledWith("r1");
    expect(screen.getByRole("status").textContent).toContain('Deleted "Soup".');
  });

  it("stays put and says so when the delete fails", async () => {
    render(<DeleteRecipeButton id="r1" title="Soup" api={asApi(vi.fn().mockRejectedValue(new Error("x")))} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Not deleted");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });
});
