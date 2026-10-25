import { describe, expect, it } from "vitest";
import { loginPath } from "./login-redirect";

describe("loginPath", () => {
  it("keeps the shared address of an expired Shortcut link", () => {
    const requested = `/import?url=${encodeURIComponent("https://example.com/r?a=1&b=2")}`;
    const login = loginPath(requested);
    expect(login.startsWith("/login?next=")).toBe(true);
    expect(new URL(login, "http://x").searchParams.get("next")).toBe(requested);
  });
  it("has no next for the home page or a missing path", () => {
    expect(loginPath("/")).toBe("/login");
    expect(loginPath(null)).toBe("/login");
  });
  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "evil",
  ])("never carries %j", (bad) => {
    expect(loginPath(bad)).toBe("/login");
  });
});
