import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BandButton, TopBand } from "./TopBand";

const line = () => screen.getByText(/October 25/).closest("p") as HTMLElement;

describe("TopBand", () => {
  it("joins the date, season and recipe count with middle dots", () => {
    render(<TopBand date="Sunday, October 25" dateTime="2026-10-25" season="Autumn" count={24} />);
    expect(line().textContent).toBe("Sunday, October 25 · Autumn · 24 recipes");
    expect(screen.getByText("Sunday, October 25").getAttribute("datetime")).toBe("2026-10-25");
  });

  it("says 'recipe' for one and keeps a zero", () => {
    const { rerender } = render(<TopBand date="Sunday, October 25" dateTime="2026-10-25" season="Autumn" count={1} />);
    expect(line().textContent).toBe("Sunday, October 25 · Autumn · 1 recipe");
    rerender(<TopBand date="Sunday, October 25" dateTime="2026-10-25" season="Autumn" count={0} />);
    expect(line().textContent).toBe("Sunday, October 25 · Autumn · 0 recipes");
  });

  it("leaves the count out when it is unknown", () => {
    render(<TopBand date="Sunday, October 25" dateTime="2026-10-25" season="Autumn" />);
    expect(line().textContent).toBe("Sunday, October 25 · Autumn");
    expect(screen.queryByText(/recipe/)).toBeNull();
  });

  it("drops the season on a phone, hides in print and carries its actions", () => {
    const { container } = render(
      <TopBand date="Sunday, October 25" dateTime="2026-10-25" season="Autumn" count={3}>
        <BandButton>Sign out</BandButton>
      </TopBand>,
    );
    expect(screen.getByText(/Autumn/).className).toContain("max-sm:hidden");
    expect((container.firstElementChild as HTMLElement).className).toContain("print:hidden");
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.className).toContain("min-h-control"); // a 44px target
    expect(button.getAttribute("type")).toBe("button");
  });
});
