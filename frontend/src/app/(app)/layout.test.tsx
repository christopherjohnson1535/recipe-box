import { act, render, screen, waitFor } from "@testing-library/react";
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

// The count is read with use(), which suspends: render inside an async act.
const shell = async () => {
  const page = await AppLayout({ children: <p>Page body</p> });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(page);
  });
  return view;
};
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
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(bandLine()).toBe("Thursday, October 22 · Autumn");
    expect(screen.getByText("Page body")).toBeTruthy();
  });

  it("does not wait for the count: the shell is built while the count request is still open", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get("*/api/recipes", async () => {
        await gate;
        return HttpResponse.json({ items: [], total: 24 });
      }),
    );
    await shell(); // would never return if the layout awaited the count
    expect(bandLine()).toBe("Thursday, October 22 · Autumn");
    expect(screen.getByText("Page body")).toBeTruthy();
    release();
    await waitFor(() => expect(bandLine()).toBe("Thursday, October 22 · Autumn · 24 recipes"));
  });

  it("shows no count when me() fails with a server error", async () => {
    server.use(http.get("*/api/auth/me", () => HttpResponse.json({ error: { code: "internal", message: "x" } }, { status: 500 })));
    await shell();
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(bandLine()).toBe("Thursday, October 22 · Autumn");
    expect(screen.queryByText("Page body")).toBeNull();
  });

  it("puts the band and the masthead in the page's one banner, in reading order, with main outside it", async () => {
    const { container } = await shell();
    const banners = screen.getAllByRole("banner");
    expect(banners).toHaveLength(1);
    const header = banners[0];
    const signOut = screen.getByRole("button", { name: "Sign out" });
    const home = screen.getByRole("link", { name: "Recipe Box home" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const el of [signOut, home, nav]) expect(header.contains(el)).toBe(true);
    // Document order is the visual and tab order: band (Sign out), wordmark, section links.
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(signOut, home)).toBe(true);
    expect(follows(home, nav)).toBe(true);
    const main = screen.getByRole("main");
    expect(main.id).toBe("main"); // the skip link's target
    expect(header.contains(main)).toBe(false);
    expect(follows(header, main)).toBe(true);
    expect(container.querySelectorAll("header")).toHaveLength(1);
  });

  it("shows the sign-in name on Sign out", async () => {
    await shell();
    expect(screen.getByRole("button", { name: "Sign out" }).getAttribute("title")).toBe("Signed in as Chris");
  });
});
