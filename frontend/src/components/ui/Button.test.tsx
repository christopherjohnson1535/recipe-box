import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink, HardLink } from "./Button";

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

describe("danger-text variant", () => {
  it("is underlined text in the danger tokens with a 44px target, on a button and on a link", () => {
    render(
      <>
        <Button variant="danger-text">Delete</Button>
        <ButtonLink href="/x" variant="danger-text">
          Remove
        </ButtonLink>
      </>,
    );
    for (const el of [screen.getByRole("button", { name: "Delete" }), screen.getByRole("link", { name: "Remove" })]) {
      expect(el.className).toContain("min-h-control");
      expect(el.className).toContain("underline");
      expect(el.className).toContain("text-(--button-danger-text-fg)");
      expect(el.className).toContain("hover:text-(--button-danger-text-hover)");
      expect(el.className).not.toContain("bg-");
    }
  });

  it("stays apart from the filled danger button used for the confirm step", () => {
    render(<Button variant="danger">Remove Sam</Button>);
    expect(screen.getByRole("button", { name: "Remove Sam" }).className).toContain("bg-(--button-danger-bg)");
  });
});
