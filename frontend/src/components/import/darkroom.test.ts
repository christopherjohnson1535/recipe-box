import { describe, expect, it } from "vitest";
import { flaggedRows, hostCard, readConfidence, readRegions, staggerDelays } from "./darkroom";

describe("darkroom logic", () => {
  it("flags only rows with a present score under 0.6", () => {
    expect(flaggedRows([0.98, 0.61, 0.6, 0.59], 5)).toEqual([false, false, false, true, false]);
    expect(flaggedRows(undefined, 2)).toEqual([false, false]);
    expect(flaggedRows([NaN], 1)).toEqual([false]);
  });
  it("reads confidence defensively", () => {
    expect(readConfidence({})).toEqual({});
    expect(readConfidence(null)).toEqual({});
    expect(readConfidence({ confidence: { title: 0.9, ingredients: [0.4, "x", 2] } })).toEqual({ title: 0.9, ingredients: [0.4, NaN, NaN] });
    expect(readConfidence({ confidence: "high" })).toEqual({});
  });
  it("reads only well-formed regions", () => {
    expect(readRegions({})).toEqual([]);
    expect(readRegions({ regions: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.4, label: "title" }, { x: 2, y: 0, w: 1, h: 1 }, "no"] })).toEqual([
      { x: 0.1, y: 0.2, w: 0.3, h: 0.4, photo: 0, label: "title" },
    ]);
  });
  it("staggers 120 ms apart", () => {
    expect(staggerDelays(3)).toEqual([0, 120, 240]);
  });
  it("makes a domain card without fetching anything", () => {
    expect(hostCard("https://www.example.com/a/b")).toEqual({ name: "example.com", host: "example.com" });
    expect(hostCard("https://example.com", " Example Kitchen ")).toEqual({ name: "Example Kitchen", host: "example.com" });
    expect(hostCard("not a url")).toBeNull();
    expect(hostCard("")).toBeNull();
  });
});
