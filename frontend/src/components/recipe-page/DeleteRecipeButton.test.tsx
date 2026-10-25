import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { UndoToast } from "@/components/undo/UndoToast";
import { dismissUndo } from "@/components/undo/undo-store";
import { DeleteRecipeButton } from "./DeleteRecipeButton";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

afterEach(() => {
  act(() => dismissUndo());
  push.mockClear();
  refresh.mockClear();
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
    // Q1-01: the home list is refreshed so the deleted recipe is not shown while the Undo toast is up.
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain('Deleted “Soup”.');
  });

  it("stays put and says so when the delete fails", async () => {
    render(<DeleteRecipeButton id="r1" title="Soup" api={asApi(vi.fn().mockRejectedValue(new Error("x")))} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await screen.findByText("Not deleted");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  it("treats 404 as already deleted: goes home with a short notice and no Undo", async () => {
    render(
      <>
        <DeleteRecipeButton id="r1" title="Soup" api={asApi(vi.fn().mockRejectedValue(new ApiError(404, "not_found", "gone")))} />
        <UndoToast />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(screen.getByRole("status").textContent).toContain("That recipe was already deleted.");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("is off while offline, with the reason beside it and tied to the button", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<DeleteRecipeButton id="r1" title="Soup" api={asApi(vi.fn())} />);
    const button = screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const note = document.getElementById(button.getAttribute("aria-describedby")!);
    expect(note?.textContent).toMatch(/offline/i);
    vi.restoreAllMocks();
  });
});
