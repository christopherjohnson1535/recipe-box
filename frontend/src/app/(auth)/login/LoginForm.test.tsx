import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { LoginForm } from "./LoginForm";

const login = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: { login: (b: unknown) => login(b) } }));

function signInRefused(error: ApiError) {
  login.mockRejectedValue(error);
  render(<LoginForm next="/" />);
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "chris" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "not the password" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
}

describe("LoginForm errors", () => {
  it("shows a friendly message for a wrong password", async () => {
    signInRefused(new ApiError(401, "unauthenticated", "Wrong username or password."));
    expect((await screen.findByRole("alert")).textContent).toContain("don’t match");
  });

  it("tells you how long to wait when the server throttles sign-in, and lets you try again", async () => {
    signInRefused(new ApiError(429, "rate_limited", "Too many attempts. Try again in 5 minutes."));
    expect((await screen.findByRole("alert")).textContent).toBe("Too many attempts. Try again in 5 minutes.");
    // Not stuck on "Signing in…": the button is back and enabled.
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
    expect(login).toHaveBeenCalledWith({ username: "chris", password: "not the password" });
  });
});
