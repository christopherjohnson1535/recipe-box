import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpotIcon } from "./SpotIcon";
import type { SpotName } from "./spot-icons";

const NAMES: SpotName[] = ["soups", "vegetarian", "baking", "quick", "mains", "drinks", "fruit", "freezer", "default"];

describe("SpotIcon", () => {
  it.each(NAMES)("%s is a hidden 24px drawing with one detail", (name) => {
    const { container } = render(<SpotIcon name={name} size={32} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.getAttribute("width")).toBe("32");
    expect(svg.getAttribute("stroke-width")).toBe("1.5");
    expect(svg.className.baseVal).toContain("--spot-line");
    expect(container.querySelectorAll('[class*="--spot-detail"]')).toHaveLength(1);
  });
});
