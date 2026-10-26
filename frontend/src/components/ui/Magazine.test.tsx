import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoverStory } from "./CoverStory";
import { IssueIndex, IssueIndexItem } from "./IssueIndex";
import { CardGrid, MagazineCard } from "./MagazineCard";
import { Ticker } from "./Ticker";

describe("Ticker", () => {
  it("is read once: the looping copy is aria-hidden", () => {
    render(<Ticker label="In season" items={["Pears", "Quince"]} />);
    const region = screen.getByRole("region", { name: "In season" });
    expect(region.getAttribute("tabindex")).toBeNull();
    const lists = region.querySelectorAll("ul");
    expect(lists).toHaveLength(2);
    expect(lists[0].getAttribute("aria-hidden")).toBeNull();
    expect(lists[1].getAttribute("aria-hidden")).toBe("true");
    expect(within(region).getAllByRole("listitem")).toHaveLength(2); // the hidden copy is out of the tree
  });

  it("has a Pause/Play button that toggles data-paused (WCAG 2.2.2)", () => {
    render(<Ticker label="In season" items={["Pears"]} />);
    const region = screen.getByRole("region", { name: "In season" });
    expect(region.hasAttribute("data-paused")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(region.hasAttribute("data-paused")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(region.hasAttribute("data-paused")).toBe(false);
    fireEvent.click(region.querySelector(".ticker-track")!); // a tap on the text toggles too
    expect(region.hasAttribute("data-paused")).toBe(true);
  });
});

describe("motion.css", () => {
  const css = readFileSync(join(__dirname, "../../styles/motion.css"), "utf8");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  it("pauses the ticker on hover and focus, and stops it under reduced motion", () => {
    expect(css).toMatch(/\.ticker:focus-within \.ticker-track,\s*\.ticker\[data-paused\] \.ticker-track\s*\{\s*animation-play-state: paused/);
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.ticker:hover \.ticker-track/);
    expect(reduced).toMatch(/\.ticker-track\s*\{\s*animation: none/);
    expect(reduced).toMatch(/\[aria-hidden="true"\]\s*\{\s*display: none/);
  });
  it("treats focus like hover on cards, and removes scale, rotate and the draw under reduced motion", () => {
    expect(css).toMatch(/\.mag-card:hover \.plate-img,\s*\.mag-card:has\(a:focus-visible\) \.plate-img\s*\{\s*scale: 1\.03;\s*rotate: -1deg/);
    expect(reduced).toMatch(/scale: none;\s*rotate: none/);
    expect(reduced).toMatch(/\.mag-card \.title-draw\s*\{\s*transition: none/);
  });
});

describe("MagazineCard", () => {
  it("draws a spot-icon plate instead of a broken image, and clamps nothing it should not", () => {
    const { container } = render(
      <CardGrid label="Cards">
        <MagazineCard href="/recipes/a" title="Soup" kicker="Soups" time="40 min" deck="A deck" fallbackIcon="soups" />
      </CardGrid>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg[data-spot='soups']")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Soup" }).getAttribute("href")).toBe("/recipes/a");
    expect(screen.getByText("40 min")).toBeTruthy();
  });
});

describe("CoverStory and IssueIndex", () => {
  it("sets the cover headline as an h2, omitting an empty deck", () => {
    const { container } = render(<CoverStory title="Short Ribs" kicker="Cover story" imageSrc="/media/a.jpg" actions={<a href="/x">Go</a>} />);
    expect(screen.getByRole("heading", { level: 2, name: "Short Ribs" })).toBeTruthy();
    expect(container.querySelectorAll(".rise-word")).toHaveLength(2);
    expect(container.querySelector("p.italic")).toBeNull();
  });

  it("numbers the index", () => {
    render(
      <IssueIndex title="Also in this issue">
        <IssueIndexItem n={1} href="/recipes/a" title="Salmon" time="25 min" />
        <IssueIndexItem n={2} href="/recipes/b" title="Biscuits" />
      </IssueIndex>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Salmon/ }).getAttribute("href")).toBe("/recipes/a");
  });
});
