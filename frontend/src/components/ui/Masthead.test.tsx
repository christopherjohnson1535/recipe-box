import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Masthead, NavLink } from "./Masthead";

describe("Masthead", () => {
  const setup = () =>
    render(
      <Masthead>
        <NavLink href="/" active>
          Recipes
        </NavLink>
        <NavLink href="/groceries">Groceries</NavLink>
      </Masthead>,
    );

  it("sets the wordmark and the links on one baseline, over the thin double rule", () => {
    const { container } = setup();
    const row = screen.getByRole("link", { name: "Recipe Box home" }).parentElement!;
    expect(row.className).toContain("items-baseline");
    expect(row.className).not.toContain("items-center");
    expect(screen.getByRole("navigation", { name: "Main" }).className).toContain("sm:items-baseline");
    expect(container.querySelector(".rule-double")).toBeTruthy();
  });

  it("keeps 44px link boxes with the text at the foot, so the active underline sits just above the rule", () => {
    setup();
    const active = screen.getByRole("link", { name: "Recipes" });
    expect(active.getAttribute("aria-current")).toBe("page");
    for (const link of [active, screen.getByRole("link", { name: "Groceries" })]) {
      expect(link.className).toContain("min-h-control");
      expect(link.className).toContain("items-end");
      expect(link.className).toContain("border-b-2");
    }
    expect(active.className).toContain("border-(--nav-underline-active)");
    expect(screen.getByRole("link", { name: "Recipe Box home" }).parentElement!.className).toContain("pb-[3px]");
  });

  it("keeps the three-column grid for the links on a phone", () => {
    setup();
    expect(screen.getByRole("navigation", { name: "Main" }).className).toContain("grid-cols-[auto_auto_auto]");
  });
});
