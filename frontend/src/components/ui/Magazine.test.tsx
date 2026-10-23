import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CoverStory } from "./CoverStory";
import { IssueIndex, IssueIndexItem } from "./IssueIndex";
import { IssueLine } from "./IssueLine";
import { CardGrid, MagazineCard } from "./MagazineCard";
import { Ticker } from "./Ticker";

describe("Ticker", () => {
  it("is read once: the looping copy is aria-hidden", () => {
    render(<Ticker label="In season" items={["Pears", "Quince"]} />);
    const region = screen.getByRole("region", { name: "In season" });
    expect(region.getAttribute("tabindex")).toBe("0"); // keyboard users can pause it
    const lists = region.querySelectorAll("ul");
    expect(lists).toHaveLength(2);
    expect(lists[0].getAttribute("aria-hidden")).toBeNull();
    expect(lists[1].getAttribute("aria-hidden")).toBe("true");
    expect(within(region).getAllByRole("listitem")).toHaveLength(2); // the hidden copy is out of the tree
  });
});

describe("motion.css", () => {
  const css = readFileSync(join(__dirname, "../../styles/motion.css"), "utf8");
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  it("pauses the ticker on hover and focus, and stops it under reduced motion", () => {
    expect(css).toMatch(/\.ticker:hover \.ticker-track,\s*\.ticker:focus-within \.ticker-track\s*\{\s*animation-play-state: paused/);
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

describe("IssueLine, CoverStory and IssueIndex", () => {
  it("prints the issue line", () => {
    render(<IssueLine volume="II" number={47} name="The Autumn Issue" date="Friday, October 23, 2026" dateTime="2026-10-23" />);
    expect(screen.getByText("Friday, October 23, 2026").getAttribute("datetime")).toBe("2026-10-23");
  });

  it("sets the cover headline as the one h1, omitting an empty deck", () => {
    const { container } = render(<CoverStory title="Short Ribs" kicker="Cover story" imageSrc="/media/a.jpg" actions={<a href="/x">Go</a>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Short Ribs" })).toBeTruthy();
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
