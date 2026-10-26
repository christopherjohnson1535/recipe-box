import { render, screen, within } from "@testing-library/react";
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

  it("WithAside's side column holds the aside and nothing else, and sticky changes neither what is rendered nor its order", () => {
    const tree = (sticky: boolean) => (
      <WithAside sticky={sticky} aside={<p>side</p>}>
        <p>main</p>
      </WithAside>
    );
    const { container, rerender } = render(tree(false));
    const side = screen.getByText("side");
    const [mainColumn, sideColumn] = [...container.firstElementChild!.children];
    expect(mainColumn).toBe(screen.getByText("main").parentElement);
    expect(sideColumn).toBe(side.parentElement);
    rerender(tree(true)); // how it sticks is CSS, checked in e2e/tests/web/layout.spec.ts
    expect(screen.getByText("side")).toBe(side);
    expect([...container.firstElementChild!.children]).toEqual([mainColumn, sideColumn]);
  });

  it("WithAside leaves no empty side column when there is no aside", () => {
    const { container, rerender } = render(<WithAside aside={false}>x</WithAside>);
    expect(container.firstElementChild?.children).toHaveLength(1);
    rerender(<WithAside aside={<p>side</p>}>x</WithAside>);
    expect(container.firstElementChild?.children).toHaveLength(2);
  });

  it("WithAside keeps the main column's node when the aside comes and goes", () => {
    const { rerender } = render(<WithAside aside={<p>side</p>}><button>go</button></WithAside>);
    const button = screen.getByRole("button", { name: "go" });
    rerender(<WithAside aside={null}><button>go</button></WithAside>);
    expect(screen.getByRole("button", { name: "go" })).toBe(button);
  });

  it("TwoColumns reads the left stack, then the right", () => {
    render(<TwoColumns left={<p>left</p>} right={<p>right</p>} />);
    expect(screen.getByText("left").compareDocumentPosition(screen.getByText("right")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AsidePanel is a named landmark that holds its content, whatever hideBelow says", () => {
    render(
      <>
        <AsidePanel label="Always">a</AsidePanel>
        <AsidePanel label="Tips" hideBelow="md">
          b
        </AsidePanel>
        <AsidePanel label="Wide tips" hideBelow="xl">
          c
        </AsidePanel>
      </>,
    );
    // jsdom has no CSS, so when a tip is hidden is checked in e2e/tests/web/layout.spec.ts
    for (const [label, text] of [["Always", "a"], ["Tips", "b"], ["Wide tips", "c"]]) {
      expect(within(screen.getByRole("complementary", { name: label })).getByText(text)).toBeTruthy();
    }
    expect(screen.getAllByRole("complementary")).toHaveLength(3);
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
