import { describe, expect, it } from "vitest";
import { scaleLabel, stepScale } from "./scale-steps";

describe("stepScale", () => {
  it("steps through the recipe page's ½× / 1× / 2×", () => {
    expect(stepScale(1, 1)).toBe(2);
    expect(stepScale(1, -1)).toBe(0.5);
    expect(stepScale(2, 1)).toBeNull();
    expect(stepScale(0.5, -1)).toBeNull();
  });
  it("goes to the neighbour from a scale between steps, and from outside them", () => {
    expect(stepScale(1.5, 1)).toBe(2);
    expect(stepScale(1.5, -1)).toBe(1);
    expect(stepScale(4, -1)).toBe(2);
    expect(stepScale(0.25, 1)).toBe(0.5);
  });
});

describe("scaleLabel", () => {
  it("sets the factor as a cook would", () => {
    expect([0.5, 1, 1.5, 2].map(scaleLabel)).toEqual(["½×", "1×", "1½×", "2×"]);
  });
});
