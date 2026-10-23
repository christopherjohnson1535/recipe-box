import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecipeCard } from "./RecipeCard";

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
          sourceType: "link",
          updatedAt: "2026-10-21T10:00:00Z",
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
