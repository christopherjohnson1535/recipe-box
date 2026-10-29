import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./Disclosure";

describe("Disclosure", () => {
  it("is closed by default, names itself by its summary, and its plus is decoration that turns when open", () => {
    const { container } = render(<Disclosure summary="Can’t drag it?">Long-press instead.</Disclosure>);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    const summary = container.querySelector("summary")!;
    expect(summary.textContent).toBe("Can’t drag it?+");
    const plus = summary.querySelector("[aria-hidden]")!;
    expect(plus.className).toContain("group-open:rotate-45");
    expect(screen.getByText("Long-press instead.")).toBeTruthy();
  });
});
