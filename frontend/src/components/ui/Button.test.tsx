import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HardLink } from "./Button";

describe("HardLink", () => {
  it("is a plain anchor (a full page load), as a button or as an inline link", () => {
    render(
      <>
        <HardLink href="/api/x" variant="secondary" aria-describedby="why">
          Go
        </HardLink>
        <HardLink href="/api/y">Again</HardLink>
      </>,
    );
    const go = screen.getByRole("link", { name: "Go" });
    expect(go.getAttribute("href")).toBe("/api/x");
    expect(go.getAttribute("aria-describedby")).toBe("why");
    expect(go.className).toContain("min-h-control");
    expect(screen.getByRole("link", { name: "Again" }).className).toBe("link");
  });
});
