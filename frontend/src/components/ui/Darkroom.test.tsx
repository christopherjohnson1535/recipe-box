import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DomainCard, DraftNote, DraftRow, DraftTitle, ScanStage } from "./Darkroom";

// Contrast of the attention and stage tokens is checked in src/styles/tokens.test.ts, from the real token files.

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
          <DraftRow delay={240} flagged text="1 cup flour" />
          <DraftRow delay={0} flagged={false} text="a pinch of salt" />
        </ul>
        <DraftNote>smudged</DraftNote>
        <DomainCard name="Example" host="example.com" />
      </>,
    );
    expect(screen.getByRole("img", { name: /low confidence/i })).toBeTruthy();
    expect(screen.getByText("flour").closest("li")?.style.animationDelay).toBe("240ms");
    expect(screen.getByText("1 cup").className).toContain("tabular-nums"); // quantity column
    expect(screen.getAllByRole("img", { name: /low confidence/i })).toHaveLength(1); // the other row has a tick, not a flag
    expect(screen.getByText("smudged")).toBeTruthy();
    expect(screen.getByText("example.com")).toBeTruthy();
  });
  it("gives screen readers the whole title while it types, and reserves its space", () => {
    const { container } = render(<DraftTitle title="Apple crumble" typed="App" />);
    expect(container.querySelector(".sr-only")?.textContent).toBe("Apple crumble");
    const typed = container.querySelector('[aria-hidden="true"]');
    expect(typed?.textContent).toBe("Apple crumble");
    expect(typed?.querySelector(".invisible")?.textContent).toBe("le crumble");
  });
});
