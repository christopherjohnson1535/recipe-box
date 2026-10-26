import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FeaturedRecipe } from "./FeaturedRecipe";
import { FeaturePanel, MoreList, MoreListItem } from "./MoreList";
import { HomeLayout, RecipeTile, TileGrid } from "./RecipeTile";
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
    expect(css).toMatch(/\.recipe-tile:hover \.plate-img,\s*\.recipe-tile:has\(a:focus-visible\) \.plate-img\s*\{\s*scale: 1\.03;\s*rotate: -1deg/);
    expect(reduced).toMatch(/scale: none;\s*rotate: none/);
    expect(reduced).toMatch(/\.recipe-tile \.title-draw\s*\{\s*transition: none/);
  });
});

describe("RecipeTile", () => {
  it("draws a spot-icon plate instead of a broken image, and clamps nothing it should not", () => {
    const { container } = render(
      <TileGrid label="Cards">
        <RecipeTile href="/recipes/a" title="Soup" kicker="Soups" time="40 min" deck="A deck" fallbackIcon="soups" />
      </TileGrid>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg[data-spot='soups']")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Soup" }).getAttribute("href")).toBe("/recipes/a");
    expect(screen.getByText("40 min")).toBeTruthy();
  });

  it("is ruled on top with a 3:2 photo and the kicker above it", () => {
    const { container } = render(
      <TileGrid>
        <RecipeTile href="/recipes/a" title="Soup" kicker="Soups" time="40 min" imageSrc="/media/a.jpg" fallbackIcon="soups" />
      </TileGrid>,
    );
    const tile = container.querySelector("article")!;
    expect(tile.className).toContain("border-t");
    expect(tile.className).not.toMatch(/border-t-\[3px\]|border-t-[2-9]/);
    const [kicker, photo] = [screen.getByText("Soups"), container.querySelector("img")!];
    expect(photo.parentElement!.className).toContain("aspect-[3/2]");
    expect(kicker.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("TileGrid columns", () => {
  const classes = (count?: number) => {
    const { container } = render(<TileGrid count={count}>{[]}</TileGrid>);
    return container.querySelector("ul")!.className;
  };
  it("is one column on a phone, two from 640px and three from 1180px", () => {
    const c = classes(9);
    expect(c).toContain("grid-cols-1");
    expect(c).toContain("min-[640px]:grid-cols-2");
    expect(c).toContain("min-[1180px]:grid-cols-3");
  });
  it("keeps two columns for two or four recipes, so the last row is never one tile", () => {
    for (const n of [2, 4]) expect(classes(n)).not.toContain("grid-cols-3");
    for (const n of [1, 3, 5, 6, 13]) expect(classes(n)).toContain("min-[1180px]:grid-cols-3");
  });
});

describe("HomeLayout", () => {
  it("puts the 22rem sidebar beside the grid from 1024px, and nothing extra without one", () => {
    const { container, rerender } = render(<HomeLayout aside={<p>side</p>}>grid</HomeLayout>);
    expect(container.firstElementChild!.className).toContain("lg:grid-cols-[minmax(0,1fr)_22rem]");
    rerender(<HomeLayout>grid</HomeLayout>);
    expect(container.firstElementChild!.className).toBe("");
  });
});

describe("FeaturedRecipe", () => {
  const render_ = (over: Partial<Parameters<typeof FeaturedRecipe>[0]> = {}) =>
    render(<FeaturedRecipe title="Short Ribs" kicker="Featured · braise" imageSrc="/media/a.jpg" cookHref="/recipes/a/cook" readHref="/recipes/a" {...over} />);

  it("sets the headline as an h2, omitting an empty deck and meta strip", () => {
    const { container } = render_();
    expect(screen.getByRole("heading", { level: 2, name: "Short Ribs" })).toBeTruthy();
    expect(container.querySelectorAll(".rise-word")).toHaveLength(2);
    expect(container.querySelector("p.italic")).toBeNull();
    expect(container.querySelector("p.border-y")).toBeNull();
  });

  it("shows the meta strip between two hairlines, Start cooking as a button and Read the recipe as an accent link", () => {
    const { container } = render_({ meta: "3 hr 20 min", deck: "Slow." });
    expect(screen.getByText("3 hr 20 min").className).toContain("border-y");
    expect(screen.getByRole("link", { name: "Start cooking" }).getAttribute("href")).toBe("/recipes/a/cook");
    const read = screen.getByRole("link", { name: "Read the recipe" });
    expect(read.getAttribute("href")).toBe("/recipes/a");
    expect(read.className).toContain("link");
    expect(read.className).toContain("min-h-control");
    expect(container.querySelector("img")!.className).toContain("aspect-[3/2]");
    expect(container.querySelector("img")!.className).toContain("outline-offset-8");
  });
});

describe("MoreList", () => {
  it("numbers the list under the thin double rule, with no heavy border", () => {
    const { container } = render(
      <MoreList title="More to cook">
        <MoreListItem n={1} href="/recipes/a" title="Salmon" time="25 min" />
        <MoreListItem n={2} href="/recipes/b" title="Biscuits" />
      </MoreList>,
    );
    expect(screen.getByRole("complementary", { name: "More to cook" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Salmon/ }).getAttribute("href")).toBe("/recipes/a");
    expect(container.querySelector(".rule-double")).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/border-t-\[3px\]/);
  });

  it("draws the revisit panel in the top band's colours with a saffron label", () => {
    render(<FeaturePanel label="Haven’t cooked in a while" title="Stew" href="/recipes/s" note="Not touched since May 2026" />);
    const panel = screen.getByRole("complementary", { name: "Haven’t cooked in a while" });
    expect(panel.className).toContain("bg-band");
    expect(panel.className).toContain("text-on-band");
    expect(screen.getByRole("heading", { name: "Haven’t cooked in a while" }).className).toContain("text-band-accent");
  });
});
