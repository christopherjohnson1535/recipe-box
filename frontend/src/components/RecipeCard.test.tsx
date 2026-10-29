import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecipeCard } from "./RecipeCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("RecipeCard", () => {
  it("links to the recipe and shows title, time and tags", () => {
    render(
      <RecipeCard
        recipe={{
          id: "r1",
          title: "Weeknight lasagne",
          description: "",
          totalMinutes: 75,
          tags: ["dinner", "pasta"],
          imageUrl: "/media/0b0e0c2a-0000-4000-8000-000000000000.jpg",
          imageDisplayUrl: null,
          servings: null,
          sourceType: "link",
          updatedAt: "2026-10-21T10:00:00Z",
          isFavourite: false,
        }}
      />,
    );

    expect(screen.getByRole("link")).toHaveProperty("pathname", "/recipes/r1");
    expect(screen.getByRole("heading", { name: "Weeknight lasagne" })).toBeTruthy();
    expect(screen.getByText("1 hr 15 min")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Tags" }).textContent).toBe("dinnerpasta");
  });
});

describe("RecipeCard motion", () => {
  it("passes the stagger index and still renders without a photo", () => {
    const { container } = render(
      <RecipeCard recipe={{ id: "r2", title: "Soup", description: "", tags: [], imageUrl: null, sourceType: "manual", updatedAt: "2026-10-21T10:00:00Z" } as never} index={3} />,
    );
    expect(container.querySelector("li")?.getAttribute("style")).toContain("--i: 3");
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "Soup" })).toBeTruthy();
  });
});

describe("RecipeCard plate", () => {
  const base = { id: "r3", title: "Tart", description: "", totalMinutes: null, tags: [] as string[], servings: null, sourceType: "manual" as const, updatedAt: "2026-10-21T10:00:00Z", isFavourite: false };
  it("shows the display rendition when present", () => {
    const { container } = render(<RecipeCard recipe={{ ...base, imageUrl: "/media/o.jpg", imageDisplayUrl: "/media/p.jpg" }} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/p.jpg");
  });
  it("shows the original when there is none", () => {
    const { container } = render(<RecipeCard recipe={{ ...base, imageUrl: "/media/o.jpg", imageDisplayUrl: null }} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/o.jpg");
  });
});
