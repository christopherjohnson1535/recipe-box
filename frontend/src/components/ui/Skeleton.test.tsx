import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeSkeleton, RecipeSkeleton } from "./Skeleton";

const nav = vi.hoisted(() => ({ path: "/", id: "r1" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useParams: () => ({ id: nav.id }) }));

describe("skeletons", () => {
  beforeEach(() => {
    nav.path = "/";
  });

  it("home: one Loading status, boxes hidden, entries shaped like the contents", () => {
    const { container } = render(<HomeSkeleton />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(container.querySelector(".skeleton-shimmer")).toBeTruthy();
  });

  it("recipe: one status and the photo and title slots", () => {
    nav.path = "/recipes/r1";
    const { container } = render(<RecipeSkeleton />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector(".aspect-\\[3\\/2\\]")).toBeTruthy();
    expect(container.querySelectorAll("aside, [class*='md:grid-cols']")).toBeTruthy();
  });

  it("falls back to the plain note on routes it is not shaped for", () => {
    nav.path = "/recipes/r1/edit";
    const { container } = render(<RecipeSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("Loading…");
    expect(container.querySelector(".skeleton-shimmer")).toBeNull();
    nav.path = "/settings";
    const home = render(<HomeSkeleton />);
    expect(home.container.querySelector(".skeleton-shimmer")).toBeNull();
  });
});
