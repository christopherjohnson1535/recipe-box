import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveStamp } from "./SaveStamp";
import { hideSaveStamp, showSaveStamp, stampDate } from "./save-stamp-store";

afterEach(() => act(() => hideSaveStamp()));

describe("SaveStamp", () => {
  it("shows nothing until a recipe is created, then stamps and announces once", () => {
    const { container } = render(<SaveStamp />);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(container.querySelector(".stamp-run")).toBeNull();
    act(() => showSaveStamp());
    expect(screen.getByRole("status").textContent).toBe("Recipe saved.");
    const stamp = container.querySelector(".stamp-run")!;
    expect(stamp.textContent).toContain("In the box");
    expect(stamp.textContent).toContain("Saved");
    expect(stamp.closest("[aria-hidden='true']")).toBeTruthy();
    expect(stamp.closest(".pointer-events-none")).toBeTruthy();
  });

  it("goes away after it has faded", () => {
    vi.useFakeTimers();
    const { container } = render(<SaveStamp />);
    act(() => showSaveStamp());
    act(() => void vi.advanceTimersByTime(3500));
    expect(container.querySelector(".stamp-run")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("dates the stamp in the viewer's local date", () => {
    expect(stampDate(new Date(2026, 9, 23, 12))).toBe("Oct 23 · 2026");
  });
});
