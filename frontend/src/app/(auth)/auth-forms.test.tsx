import { render } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login/LoginForm";
import { SetupForm } from "./setup/SetupForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("auth forms post natively", () => {
  it.each([
    ["login", <LoginForm key="l" next="/" />],
    ["setup", <SetupForm key="s" />],
  ])("%s form uses method=post and no action, so it posts to the current URL (keeps ?next=)", (_n, el) => {
    const form = render(el).container.querySelector("form")!;
    expect(form.method).toBe("post");
    expect(form.hasAttribute("action")).toBe(false);
    expect(form.querySelector("input[type=password]")?.getAttribute("autocomplete")).toBeTruthy();
  });
});

/**
 * Form guard. Rules:
 * 1. Every `<form` in non-test src/**\/*.tsx states `method="post"` or `method="get"` as a literal string, so
 *    nothing silently defaults to GET. `method={"post"}` or any dynamic method counts as missing.
 * 2. A file with a password input (`type="password"`, `type='password'`, or a `type={…}` expression containing
 *    "password") must not contain a `<form` with method="get".
 * A password input in a child component is covered by rule 1: the parent form must still state its method.
 */
type FormProblem = "method-not-literal" | "password-in-get-form";

/** Opening tags of every `<form`, scanned to the closing `>` while skipping `{…}` (so `=>` is safe). */
function formTags(source: string): string[] {
  const tags: string[] = [];
  for (const m of source.matchAll(/<form\b/g)) {
    let tag = "";
    let depth = 0;
    for (let i = m.index! + 5; i < source.length; i++) {
      const c = source[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (depth === 0 && (c === '"' || c === "'")) {
        const end = source.indexOf(c, i + 1);
        if (end < 0) break;
        tag += source.slice(i, end + 1);
        i = end;
        continue;
      } else if (depth === 0 && c === ">") break;
      if (depth === 0 && c !== "}") tag += c;
      else if (depth === 0) tag += "{}";
    }
    tags.push(tag);
  }
  return tags;
}

function hasPasswordInput(source: string): boolean {
  return /\btype=(?:"password"|'password'|\{[^}]*["'`]password["'`][^}]*\})/.test(source);
}

function formProblems(source: string): FormProblem[] {
  const methods = formTags(source).map((t) => /\bmethod=(["'])(post|get)\1/i.exec(t)?.[2].toLowerCase());
  const out: FormProblem[] = [];
  if (methods.some((m) => !m)) out.push("method-not-literal");
  if (hasPasswordInput(source) && methods.includes("get")) out.push("password-in-get-form");
  return out;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx") ? [join(dir, e.name)] : [],
  );
}

describe("form method guard", () => {
  it.each([
    ["missing method", `<form onSubmit={f}></form>`, ["method-not-literal"]],
    ["arrow handler, literal post", `<form onSubmit={(e) => go(e)} method="post">`, []],
    ["literal get", `<form role="search" method='get'>`, []],
    ["non-literal method rejected", `<form method={"post"}>`, ["method-not-literal"]],
    ["password in get form", `<form method="get"><input type="password" /></form>`, ["password-in-get-form"]],
    ["password single quotes", `<form method="get"><input type='password' /></form>`, ["password-in-get-form"]],
    ["password braces", `<form method="get"><input type={"password"} /></form>`, ["password-in-get-form"]],
    ["password expression", `<form method="get"><input type={show ? "text" : "password"} /></form>`, ["password-in-get-form"]],
    ["post form with password", `<form method="post"><input type="password" /></form>`, []],
    ["two forms, one bad", `<form method="post"><input type="password" /></form><form role="search">`, ["method-not-literal"]],
    ["two forms, post password + get search", `<form method="post"><input type="password" /></form><form method="get">`, ["password-in-get-form"]],
  ] as const)("%s", (_n, src, expected) => {
    expect(formProblems(src)).toEqual(expected);
  });

  it("every form in src states its method and no password form is GET", () => {
    const bad = tsxFiles(join(__dirname, "../..")).filter((f) => formProblems(readFileSync(f, "utf8")).length > 0);
    expect(bad).toEqual([]);
  });
});
