import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainCard, DraftNote, DraftRow, ScanStage } from "./Darkroom";

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// Blend of 28% mustard over a paper colour (the flagged-row wash).
const wash = (paper: string) =>
  "#" +
  [1, 3, 5].map((i) => Math.round(0.28 * parseInt("d9a21b".slice(i - 1, i + 1), 16) + 0.72 * parseInt(paper.slice(i, i + 2), 16)).toString(16).padStart(2, "0")).join("");

describe("darkroom colours", () => {
  it("text on the mustard ink and its wash is at least 4.5:1", () => {
    expect(contrast("#1a1714", "#d9a21b")).toBeGreaterThanOrEqual(4.5); // ? badge: day ink on mustard
    expect(contrast("#1a1714", wash("#fbf8f1"))).toBeGreaterThanOrEqual(4.5); // day ink on wash over day paper
    expect(contrast("#efe8da", wash("#16130f"))).toBeGreaterThanOrEqual(4.5); // evening ink on wash over evening paper
    expect(contrast("#efe8da", "#241f19")).toBeGreaterThanOrEqual(4.5); // stage caption on the dark ground
    expect(contrast("#d9a21b", "#241f19")).toBeGreaterThanOrEqual(3); // scan line and boxes on the dark ground
  });
});

describe("Darkroom pieces", () => {
  it("draws the scan line only when scanning, and one box per region", () => {
    const { rerender } = render(<ScanStage src="blob:x" alt="p" caption="c" scanning regions={[{ x: 0, y: 0, w: 0.5, h: 0.5 }]} />);
    expect(screen.getByTestId("scan-line")).toBeTruthy();
    expect(screen.getAllByTestId("region")).toHaveLength(1);
    rerender(<ScanStage src="blob:x" alt="p" caption="c" scanning={false} />);
    expect(screen.queryByTestId("scan-line")).toBeNull();
    expect(screen.queryByTestId("region")).toBeNull();
  });
  it("labels a flagged row and a note, and shows a domain card", () => {
    render(
      <>
        <ul>
          <DraftRow delay={240} flagged>
            1 cup
          </DraftRow>
        </ul>
        <DraftNote>smudged</DraftNote>
        <DomainCard name="Example" host="example.com" />
      </>,
    );
    expect(screen.getByRole("img", { name: /low confidence/i })).toBeTruthy();
    expect(screen.getByText("1 cup").closest("li")?.style.animationDelay).toBe("240ms");
    expect(screen.getByText("smudged")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
  });
});
