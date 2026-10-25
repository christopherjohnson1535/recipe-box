import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import AppLayout from "./layout";

vi.mock("next/headers", () => ({ cookies: async () => ({ toString: () => "" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const shell = async () => render(await AppLayout({ children: <p>Page body</p> }));
const bandLine = () => screen.getByText(/October 22/).closest("p")?.textContent;

beforeEach(() => {
  server.use(http.get("*/api/recipes", ({ request }) => HttpResponse.json({ items: [], total: new URL(request.url).searchParams.get("limit") === "1" ? 24 : 0 })));
});

describe("signed-in shell", () => {
  it("shows the band with the household's recipe count, read with a one-recipe page", async () => {
    await shell();
    await waitFor(() => expect(bandLine()).toBe("Thursday, October 22 · Autumn · 24 recipes"));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByText("Page body")).toBeTruthy();
    expect(screen.queryByText(/Vol\.|\bIssue\b/)).toBeNull();
  });

  it("leaves the count out, and still renders the page, when the count fails", async () => {
    server.use(http.get("*/api/recipes", () => HttpResponse.json({ error: { code: "internal", message: "x" } }, { status: 500 })));
    await shell();
    expect(bandLine()).toBe("Thursday, October 22 · Autumn");
    expect(screen.getByText("Page body")).toBeTruthy();
  });

  it("shows the sign-in name on Sign out", async () => {
    await shell();
    expect(screen.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe("Signed in as Chris");
  });
});
