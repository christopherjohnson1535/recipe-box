import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberPhoto } from "./morph";
import { HomeSkeleton, RecipeSkeleton } from "./Skeleton";

const nav = vi.hoisted(() => ({ path: "/", id: "r1" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path, useParams: () => ({ id: nav.id }) }));

describe("skeletons", () => {
  beforeEach(() => {
    nav.path = "/";
  });

  it("home: one Loading status, boxes hidden, six ruled tiles after the featured recipe", () => {
    const { container } = render(<HomeSkeleton />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(container.querySelector("[aria-hidden='true']")).toBeTruthy();
    expect(container.querySelector("[class*='skeleton-bg']")).toBeTruthy();
    expect(container.querySelector("[class*='animate'], [class*='shimmer']")).toBeNull();
  });

  it("recipe: one status and the title slot; the photo box only when the tapped card had a photo", () => {
    nav.path = "/recipes/r1";
    const { container, unmount } = render(<RecipeSkeleton />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector(".aspect-\\[3\\/2\\]")).toBeNull();
    unmount();
    rememberPhoto("r1", true);
    const withPhoto = render(<RecipeSkeleton />);
    expect(withPhoto.container.querySelector(".aspect-\\[3\\/2\\]")).toBeTruthy();
    expect(withPhoto.container.querySelectorAll("aside, [class*='md:grid-cols']").length).toBeGreaterThan(0);
    rememberPhoto("r1", false);
  });

  it("falls back to the plain note on routes it is not shaped for", () => {
    nav.path = "/recipes/r1/edit";
    const { container } = render(<RecipeSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("Loading…");
    expect(container.querySelector("[class*='skeleton-bg']")).toBeNull();
    nav.path = "/settings";
    const home = render(<HomeSkeleton />);
    expect(home.container.querySelector("[class*='skeleton-bg']")).toBeNull();
  });
});
