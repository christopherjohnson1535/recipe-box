import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KEEP_MARKER } from "@/components/offline/rules";
import GroceriesPage, { metadata } from "./page";

describe("groceries page", () => {
  it("is titled, loads the list, and marks itself to be kept for offline use", async () => {
    const { container } = render(<GroceriesPage />);
    expect(metadata.title).toBe("Groceries");
    expect(container.innerHTML.includes(KEEP_MARKER) || document.head.innerHTML.includes(KEEP_MARKER)).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "Groceries" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Nothing on the list yet" })).toBeTruthy();
  });
});
