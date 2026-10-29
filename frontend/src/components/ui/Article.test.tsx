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
  it("keeps the method and the note in one column beside the ingredients (no margin column), so the method spans to the edge", () => {
    const { container } = render(
      <SidebarLayout sidebar={<aside>Ingredients</aside>} rail={<figure>Note</figure>}>
        <section>Method</section>
      </SidebarLayout>,
    );
    const grid = container.firstElementChild!;
    expect(grid.className).not.toMatch(/col-start-3|90rem\]:grid-cols/);
    const [sidebar, method, rail] = Array.from(grid.children);
    expect(sidebar.className).toContain("md:row-span-2");
    expect(method.textContent).toBe("Method");
    expect(rail.className).toContain("md:col-start-2");
  });

  it("has no spare row without a note", () => {
    const { container } = render(
      <SidebarLayout sidebar={<aside>Ingredients</aside>}>
        <section>Method</section>
      </SidebarLayout>,
    );
    expect(container.firstElementChild!.className).not.toContain("grid-rows");
    expect(container.firstElementChild!.children).toHaveLength(2);
  });
});
