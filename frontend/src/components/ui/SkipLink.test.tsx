import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  it("jumps to the main region", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe("#main");
  });

  it("keeps its padding when revealed and lifts the focus ring onto the charcoal", () => {
    render(<SkipLink />);
    const cls = screen.getByRole("link", { name: "Skip to content" }).className;
    // sr-only and focus:not-sr-only both set padding: 0; the later focus: variant wins over a plain px-4, so the padding must be a focus: utility too.
    expect(cls).toContain("focus:px-4");
    expect(cls.split(/\s+/)).not.toContain("px-4");
    expect(cls).toContain("focus:[--focus-ring:var(--color-band-accent)]");
  });
});
