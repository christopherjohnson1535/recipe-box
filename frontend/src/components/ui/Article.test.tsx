import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpreadOpener } from "./SpreadOpener";
import { PlateCaption, SidebarLayout } from "./Article";

describe("recipe spread plate", () => {
  it("sets the plate and links to the original at full size", () => {
    const { container } = render(
      <>
        <SpreadOpener title="Tart" photo={{ src: "/media/plate.jpg", alt: "Tart" }} />
        <PlateCaption href="/media/original.jpg" />
      </>,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/plate.jpg");
    const link = screen.getByRole("link", { name: /^View the original photo/ });
    expect(link.getAttribute("href")).toBe("/media/original.jpg");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("SidebarLayout", () => {
  // The geometry (Method reaching the numerals band's right edge, the note under it) is CSS, checked in
  // e2e/tests/web/layout.spec.ts at real widths. Here: the order the pieces are read in.
  it("reads ingredients, then the method, then the note", () => {
    const { container } = render(
      <SidebarLayout sidebar={<aside>Ingredients</aside>} rail={<figure>Note</figure>}>
        <section>Method</section>
      </SidebarLayout>,
    );
    expect(Array.from(container.firstElementChild!.children).map((c) => c.textContent)).toEqual(["Ingredients", "Method", "Note"]);
  });

  it("has no note slot without a note", () => {
    const { container } = render(
      <SidebarLayout sidebar={<aside>Ingredients</aside>}>
        <section>Method</section>
      </SidebarLayout>,
    );
    expect(Array.from(container.firstElementChild!.children).map((c) => c.textContent)).toEqual(["Ingredients", "Method"]);
  });
});
