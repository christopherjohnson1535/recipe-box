import { describe, expect, it } from "vitest";
import { keepablePage, KEEP_MARKER, MEDIA, mediaIn, pageKey, RECIPE_API, RECIPE_PAGE, RECIPE_READ_PAGE, recipeTitle, signedOut } from "./rules";

const ID = "0f8e2b4c-1a2b-4c3d-8e9f-0123456789ab";
const kept = `<html><head><meta ${KEEP_MARKER} content="1"/><title>Lasagne · Recipe Box</title></head></html>`;

describe("what the worker keeps", () => {
  it("keeps recipe pages and cooking mode, nothing else", () => {
    expect(RECIPE_PAGE.test(`/recipes/${ID}`)).toBe(true);
    expect(RECIPE_PAGE.test(`/recipes/${ID}/cook`)).toBe(true);
    for (const p of ["/", "/login", "/setup", "/settings", "/import", "/recipes/new", `/recipes/${ID}/edit`, "/recipes/abc"]) {
      expect(RECIPE_PAGE.test(p), p).toBe(false);
    }
    expect(RECIPE_READ_PAGE.test(`/recipes/${ID}/cook`)).toBe(false);
  });

  it("keeps the grocery list page and GET /api/grocery, and none of its writes or neighbours", () => {
    expect(RECIPE_PAGE.test("/groceries")).toBe(true);
    for (const p of ["/groceries/", "/groceries/x", "/groceries?x=1", "/grocery", "/api/grocery"]) expect(RECIPE_PAGE.test(p), p).toBe(false);
    expect(RECIPE_API.test("/api/grocery")).toBe(true);
    for (const p of ["/api/grocery/items", `/api/grocery/items/${ID}`, "/api/grocery/recipes", "/api/grocery/clear-checked", "/api/groceries", "/groceries"]) {
      expect(RECIPE_API.test(p), p).toBe(false);
    }
    expect(RECIPE_READ_PAGE.test("/groceries")).toBe(false); // it is not listed among the kept recipes
    expect(pageKey("https://box.example/groceries?x=1")).toBe("https://box.example/groceries");
  });

  it("keeps one recipe from the API and the media files, not lists or auth", () => {
    expect(RECIPE_API.test(`/api/recipes/${ID}`)).toBe(true);
    for (const p of ["/api/recipes", "/api/auth/me", `/api/recipes/${ID}/restore`]) expect(RECIPE_API.test(p), p).toBe(false);
    expect(MEDIA.test(`/media/${ID}.jpg`)).toBe(true);
    expect(MEDIA.test(`/media/${ID}.display.jpg`)).toBe(true);
    expect(MEDIA.test("/media/../etc/passwd")).toBe(false);
  });

  it("keeps only a 200 recipe render, never a redirect or the server-error page", () => {
    expect(keepablePage({ status: 200, redirected: false }, kept)).toBe(true);
    expect(keepablePage({ status: 200, redirected: true }, kept)).toBe(false);
    expect(keepablePage({ status: 200, redirected: false }, "<p>Can’t reach the Recipe Box server</p>")).toBe(false);
    expect(keepablePage({ status: 404, redirected: false }, kept)).toBe(false);
  });

  it("keys a page by its path so query strings share one copy", () => {
    expect(pageKey(`https://box.example/recipes/${ID}?servings=6`)).toBe(`https://box.example/recipes/${ID}`);
  });

  it("finds the photos a kept page shows, once each", () => {
    const html = `<img src="/media/${ID}.display.jpg"><a href="/media/${ID}.jpg">x</a><img src="/media/${ID}.display.jpg">`;
    expect(mediaIn(html)).toEqual([`/media/${ID}.display.jpg`, `/media/${ID}.jpg`]);
    expect(mediaIn("<p>no photos</p>")).toEqual([]);
  });
});

describe("signed out", () => {
  const res = (over: Partial<{ status: number; redirected: boolean; url: string; type: string }>) => ({ status: 200, redirected: false, url: "https://box.example/", ...over });
  it("treats a 401, a page redirect and landing on /login as signed out", () => {
    expect(signedOut(res({ status: 401 }))).toBe(true);
    expect(signedOut(res({ type: "opaqueredirect", status: 0 }))).toBe(true);
    expect(signedOut(res({ redirected: true, url: "https://box.example/login?next=%2Frecipes" }))).toBe(true);
  });
  it("leaves a normal answer alone", () => {
    expect(signedOut(res({}))).toBe(false);
    expect(signedOut(res({ status: 404 }))).toBe(false);
    expect(signedOut(res({ redirected: true, url: "https://box.example/recipes/x" }))).toBe(false);
    expect(signedOut(res({ redirected: true, url: "" }))).toBe(false);
  });
});

describe("recipeTitle", () => {
  it("reads the title without the site name and decodes entities", () => {
    expect(recipeTitle(kept)).toBe("Lasagne");
    expect(recipeTitle("<title>Mac &amp; cheese &#39;deluxe&#39; · Recipe Box</title>")).toBe("Mac & cheese 'deluxe'");
    expect(recipeTitle("<p>none</p>")).toBeNull();
    expect(recipeTitle("<title> · Recipe Box</title>")).toBeNull();
  });
});
