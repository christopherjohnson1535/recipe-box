import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { UndoToast } from "./UndoToast";
import { dismissUndo, showUndo } from "./undo-store";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

type Props = NonNullable<Parameters<typeof UndoToast>[0]>;
const setup = (restore = vi.fn().mockResolvedValue({})) => {
  render(<UndoToast api={{ restoreRecipe: restore } as unknown as Props["api"]} />);
  act(() => showUndo({ id: "r1", title: "Soup" }));
  return restore;
};
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const toastText = () => screen.getByRole("status").textContent ?? "";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => dismissUndo());
  push.mockClear();
  refresh.mockClear();
});

describe("UndoToast", () => {
  it("shows the message and goes away after 10 seconds", () => {
    setup();
    expect(toastText()).toContain('Deleted “Soup”.');
    tick(9_900);
    expect(toastText()).toContain("Deleted");
    tick(200);
    expect(toastText()).toBe("");
  });

  it("pauses while hovered and while focused", () => {
    setup();
    const toast = screen.getByText(/Deleted/).parentElement!;
    tick(6_000);
    fireEvent.mouseEnter(toast);
    tick(60_000);
    expect(toastText()).toContain("Deleted");
    fireEvent.mouseLeave(toast);
    tick(3_900);
    expect(toastText()).toContain("Deleted");
    fireEvent.focus(screen.getByRole("button", { name: "Undo" }));
    tick(60_000);
    expect(toastText()).toContain("Deleted");
    fireEvent.blur(screen.getByRole("button", { name: "Undo" }), { relatedTarget: null });
    tick(200);
    expect(toastText()).toBe("");
  });

  it("Undo restores the recipe and opens it", async () => {
    const restore = setup();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect(restore).toHaveBeenCalledWith("r1");
    expect(push).toHaveBeenCalledWith("/recipes/r1");
    expect(refresh).toHaveBeenCalled();
    expect(toastText()).toBe("");
  });

  it("says when the window has passed (409) and offers no retry", async () => {
    setup(vi.fn().mockRejectedValue(new ApiError(409, "conflict", "gone")));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect(toastText()).toContain("Too late to undo");
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
    tick(60_000);
    expect(toastText()).toContain("Too late"); // stays until dismissed
  });

  it("says so on other errors and lets you try again", async () => {
    setup(vi.fn().mockRejectedValue(new Error("offline")));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Undo" })));
    expect(toastText()).toContain("Couldn't restore");
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  it("dismisses on request", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(toastText()).toBe("");
  });

  it("two deletes within 10 s are both undoable, newest on top", async () => {
    const restore = setup();
    tick(4_000);
    act(() => showUndo({ id: "r2", title: "Stew" }));
    const undos = screen.getAllByRole("button", { name: "Undo" });
    expect(undos).toHaveLength(2);
    expect(toastText().indexOf("Stew")).toBeLessThan(toastText().indexOf("Soup"));
    await act(async () => void fireEvent.click(undos[1]));
    expect(restore).toHaveBeenCalledWith("r1");
    expect(toastText()).toContain("Stew");
    expect(toastText()).not.toContain("Soup");
  });

  it("each toast keeps its own countdown", () => {
    setup();
    tick(8_000);
    act(() => showUndo({ id: "r2", title: "Stew" }));
    tick(3_000);
    expect(toastText()).toContain('Deleted “Stew”.');
    expect(toastText()).not.toContain("Soup");
    tick(7_100);
    expect(toastText()).toBe("");
  });

  it("shows the three newest and keeps older ones in the background", () => {
    setup();
    for (const t of ["B", "C", "D"]) act(() => showUndo({ id: t, title: t }));
    expect(document.querySelectorAll("[hidden]")).toHaveLength(1);
  });

  it("clears every offer when the layout unmounts or on dismissUndo()", () => {
    const { unmount } = render(<UndoToast />);
    act(() => showUndo({ id: "r1", title: "Soup" }));
    unmount();
    render(<UndoToast />);
    expect(toastText()).toBe("");
    act(() => showUndo({ id: "r3", title: "Pie" }));
    act(() => dismissUndo());
    expect(toastText()).toBe("");
  });
});
