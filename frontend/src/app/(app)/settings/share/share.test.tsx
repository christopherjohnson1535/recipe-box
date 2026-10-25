import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { parseSharedUrl } from "@/lib/shared-url";
import { bookmarkletFor, shortcutAddress } from "./bookmarklet";
import { ShareView } from "./ShareView";

afterEach(cleanup);

describe("bookmarklet", () => {
  it("opens the app with only the page address, encoded, in a tab that cannot reach back", () => {
    const code = bookmarkletFor("https://recipes.example");
    expect(new URL(code).protocol).toBe("javascript:");
    expect(code).toContain('"https://recipes.example/import?url="+encodeURIComponent(location.href)');
    expect(code).toContain('"noopener"');
    for (const leak of ["document.", "cookie", "localStorage", "innerHTML", "title"]) expect(code).not.toContain(leak);
  });

  it("round-trips an awkward address through the import page's check", () => {
    const awkward = "https://example.com/r/pancakes?a=1&b=2 3#frag";
    const sent = new URL(`https://recipes.example/import?url=${encodeURIComponent(awkward)}`).searchParams.get("url");
    expect(parseSharedUrl(sent)).toBe("https://example.com/r/pancakes?a=1&b=2%203");
  });

  it("gives the Shortcut an address ending in url=", () => {
    expect(shortcutAddress("https://recipes.example")).toBe("https://recipes.example/import?url=");
  });
});

describe("ShareView", () => {
  it("shows both routes, the address for this site, and a bookmark link", async () => {
    render(<ShareView />);
    expect(screen.getByRole("heading", { name: "On an iPad or iPhone" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "On a computer" })).toBeTruthy();
    expect(screen.getAllByText(`${window.location.origin}/import?url=`).length).toBeGreaterThan(0);
    const tab = await screen.findByText("Save to Recipe Box", { selector: "a" });
    expect(tab.getAttribute("href")).toContain(`${window.location.origin}/import?url=`);
  });
});
