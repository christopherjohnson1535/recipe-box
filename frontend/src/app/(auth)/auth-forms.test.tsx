import { cleanup, render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login/LoginForm";
import { SetupForm } from "./setup/SetupForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

describe("auth forms post natively", () => {
  it.each([
    ["login", <LoginForm key="l" next="/" />, "/login"],
    ["setup", <SetupForm key="s" />, "/setup"],
  ])("%s form uses method=post to its own page", (_n, el, action) => {
    const form = render(el).container.querySelector("form")!;
    expect(form.method).toBe("post");
    expect(form.getAttribute("action")).toBe(action);
    expect(form.querySelector("input[type=password]")?.getAttribute("autocomplete")).toBeTruthy();
  });
});

/** Names files whose source has a type="password" input but a <form without method="post". */
export function passwordFormViolation(source: string): boolean {
  if (!/type=["']password["']/.test(source)) return false;
  return (source.match(/<form\b[^>]*>/g) ?? []).some((tag) => !/method=["']post["']/i.test(tag));
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx") ? [join(dir, e.name)] : [],
  );
}

describe("password form guard", () => {
  it("scanner flags a GET form and accepts a post form", () => {
    expect(passwordFormViolation(`<form onSubmit={f}><input type="password" /></form>`)).toBe(true);
    expect(passwordFormViolation(`<form method="post"><input type="password" /></form>`)).toBe(false);
  });

  it("every form with a password input sets method=post", () => {
    const bad = tsxFiles(join(__dirname, "../..")).filter((f) => passwordFormViolation(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
