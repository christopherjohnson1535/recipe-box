import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpreadOpener } from "./SpreadOpener";
import { PlateCaption } from "./Article";

describe("recipe spread plate", () => {
  it("sets the plate and links to the original at full size", () => {
    const { container } = render(
      <>
        <SpreadOpener title="Tart" photo={{ src: "/media/plate.jpg", alt: "Tart" }} />
        <PlateCaption href="/media/original.jpg" />
      </>,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/plate.jpg");
    const link = screen.getByRole("link", { name: "View the original photo" });
    expect(link.getAttribute("href")).toBe("/media/original.jpg");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
