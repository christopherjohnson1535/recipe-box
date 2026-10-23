import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader motion", () => {
  it("splits the headline into rising words but keeps its name", () => {
    const { container } = render(<PageHeader title="Slow braised ribs" rise />);
    expect(screen.getByRole("heading", { level: 1, name: "Slow braised ribs" })).toBeTruthy();
    expect(container.querySelectorAll(".rise-word")).toHaveLength(3);
  });

  it("draws its closing rule", () => {
    const { container } = render(<PageHeader title="Recipes" morphId="r1" />);
    expect(container.querySelectorAll(".rise-word")).toHaveLength(0);
    expect(container.querySelector(".draw-rule")).toBeTruthy();
  });
});
