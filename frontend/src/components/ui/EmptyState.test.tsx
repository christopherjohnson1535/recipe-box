import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotFoundContent } from "../NotFoundContent";
import { Chip } from "./Chip";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState and Chip", () => {
  it("is an h2 by default and an h1 on request; not-found renders the h1", () => {
    render(<EmptyState title="Nothing yet" />);
    expect(screen.getByRole("heading", { level: 2, name: "Nothing yet" })).toBeTruthy();
    cleanup();
    render(<NotFoundContent />);
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeTruthy();
  });

  it("lets a very long tag wrap and keeps its full name as a title", () => {
    const tag = "x".repeat(60);
    render(<Chip href="/?tag=x" count={2}>{tag}</Chip>);
    const link = screen.getByRole("link");
    expect(link.getAttribute("title")).toBe(tag);
    expect(link.className).toContain("max-w-full");
    expect(link.className).not.toContain("whitespace-nowrap");
  });
});
