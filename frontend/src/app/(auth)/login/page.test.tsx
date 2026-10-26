import { cleanup, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const providers = (google: boolean) => server.use(http.get("*/api/auth/providers", () => HttpResponse.json({ google })));
const open = async (params: Record<string, string> = {}) => render(await LoginPage({ searchParams: Promise.resolve(params) }));
const googleLink = () => screen.queryByRole("link", { name: "Sign in with Google" });

afterEach(() => vi.unstubAllGlobals());

describe("login page: Sign in with Google", () => {
  it("keeps the button and adds a quiet password fallback in the Home Screen app only", async () => {
    providers(true);
    await open();
    expect(screen.queryByText(/if Google sends you back here/)).toBeNull();
    cleanup();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === "(display-mode: standalone)" }));
    await open();
    const note = screen.getByText("In the Home Screen app, if Google sends you back here, sign in with your password.");
    expect(googleLink()!.getAttribute("aria-describedby")).toBe(note.id);
  });

  it("shows a secondary link under the password form when the server offers it", async () => {
    providers(true);
    await open();
    const link = googleLink()!;
    expect(link.getAttribute("href")).toBe("/api/auth/google/start?next=%2F");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" }).compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the page the visitor asked for, encoded", async () => {
    providers(true);
    await open({ next: "/recipes/abc?x=1&y=2" });
    expect(googleLink()!.getAttribute("href")).toBe("/api/auth/google/start?next=%2Frecipes%2Fabc%3Fx%3D1%26y%3D2");
  });

  it("sends a next that is not a path on this site as /", async () => {
    providers(true);
    await open({ next: "//evil.example" });
    expect(googleLink()!.getAttribute("href")).toBe("/api/auth/google/start?next=%2F");
  });

  it("hides the link when the server does not offer it", async () => {
    providers(false);
    await open();
    expect(googleLink()).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it.each([
    ["an error", () => HttpResponse.json({ error: { code: "internal", message: "x" } }, { status: 500 })],
    ["an unreachable server", () => HttpResponse.error()],
  ])("hides the link on %s and still shows the form", async (_n, respond) => {
    server.use(http.get("*/api/auth/providers", respond));
    await open();
    expect(googleLink()).toBeNull();
    expect(screen.getByLabelText("Username")).toBeTruthy();
  });

  it("explains google_not_member", async () => {
    providers(true);
    await open({ error: "google_not_member" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Ask your household admin to add your Google email first.");
    expect(googleLink()).toBeTruthy();
  });

  it("explains google_failed and points to the password", async () => {
    providers(true);
    await open({ error: "google_failed" });
    expect(screen.getByRole("alert").textContent).toContain("Try again, or sign in with your username and password.");
  });

  it.each(["", "something_else", "constructor"])("shows nothing for ?error=%s", async (error) => {
    providers(true);
    await open({ error });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("login page layout", () => {
  it("is a ruled section (kicker, title, deck, hairline), not a boxed card", async () => {
    providers(true);
    await open();
    const section = screen.getByRole("heading", { level: 1, name: "Sign in" }).closest("section")!;
    expect(section.className).not.toMatch(/\b(border|bg-|p[xy]?-\d)/);
    expect(section.querySelector("header p.label")?.textContent).toBe("Account");
    expect(section.querySelector("header p.italic")?.textContent).toMatch(/account your household admin made/);
    expect(section.querySelector("[aria-hidden=true].h-px")).toBeTruthy(); // the hairline under the head
    // the form's controls keep their 44px targets
    expect(screen.getByRole("button", { name: "Sign in" }).className).toContain("min-h-control");
    expect(screen.getByLabelText("Username").className).toContain("min-h-control");
  });
});
