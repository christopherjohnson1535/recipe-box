import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SidebarLayout } from "./Article";
import { AsidePanel, TwoColumns, WithAside } from "./Columns";

describe("wide-screen layouts", () => {
  it("WithAside keeps the main content first and the side column after it, so the reading and Tab order is the narrow-screen order", () => {
    render(
      <WithAside aside={<p>side</p>}>
        <p>main</p>
      </WithAside>,
    );
    expect(screen.getByText("main").compareDocumentPosition(screen.getByText("side")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("WithAside is sticky only when asked", () => {
    const { container, rerender } = render(<WithAside aside={<p>side</p>}>x</WithAside>);
    expect(container.innerHTML).not.toContain("sticky");
    rerender(
      <WithAside sticky aside={<p>side</p>}>
        x
      </WithAside>,
    );
    expect(container.innerHTML).toContain("xl:sticky");
  });

  it("TwoColumns reads the left stack, then the right", () => {
    render(<TwoColumns left={<p>left</p>} right={<p>right</p>} />);
    expect(screen.getByText("left").compareDocumentPosition(screen.getByText("right")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AsidePanel is a named landmark; an optional one drops out below 768px", () => {
    render(
      <>
        <AsidePanel label="Always">a</AsidePanel>
        <AsidePanel label="Tips" optional>
          b
        </AsidePanel>
      </>,
    );
    expect(screen.getByRole("complementary", { name: "Always" }).className).not.toContain("max-md:hidden");
    expect(screen.getByRole("complementary", { name: "Tips" }).className).toContain("max-md:hidden");
  });

  it("SidebarLayout puts the rail after the method, and adds nothing when there is no rail", () => {
    const { container, rerender } = render(
      <SidebarLayout sidebar={<p>ingredients</p>} rail={<p>note</p>}>
        <p>method</p>
      </SidebarLayout>,
    );
    const order = [...container.querySelectorAll("p")].map((p) => p.textContent);
    expect(order).toEqual(["ingredients", "method", "note"]);
    rerender(
      <SidebarLayout sidebar={<p>ingredients</p>}>
        <p>method</p>
      </SidebarLayout>,
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.firstElementChild?.children).toHaveLength(2);
  });
});
