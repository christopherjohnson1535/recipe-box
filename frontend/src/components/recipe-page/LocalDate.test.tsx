import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDate } from "./LocalDate";

afterEach(cleanup);

describe("LocalDate", () => {
  it("shows the viewer's day, not the UTC day", () => {
    const { container } = render(<p><LocalDate iso="2026-10-22T02:30:00Z" timeZone="America/Denver" /></p>);
    expect(container.textContent).toBe(" on Oct 21, 2026");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-22T02:30:00Z");
  });
  it("renders an empty time on the server (nothing to mismatch)", () => {
    const html = renderToString(<LocalDate iso="2026-10-22T02:30:00Z" />);
    expect(html).toMatch(/<time datetime="2026-10-22T02:30:00Z"><\/time>/i);
    expect(html).not.toContain("Oct");
  });
  it("shows nothing for a bad date", () => {
    const { container } = render(<LocalDate iso="nope" />);
    expect(container.textContent).toBe("");
  });
});
