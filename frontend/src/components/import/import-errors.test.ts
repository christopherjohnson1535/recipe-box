import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { explainImportError } from "./import-errors";

const err = (code: string, message = "Server said so.", details: Record<string, unknown> = {}) =>
  new ApiError(400, code, message, details);

describe("explainImportError", () => {
  it.each(["blocked_address", "site_blocked", "fetch_failed", "no_recipe_found", "too_large", "unsupported_media", "ai_disabled", "not_implemented", "unauthenticated", "network", "internal", "whatever"])(
    "%s gets a title and a message",
    (code) => {
      const p = explainImportError(err(code), "link");
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.message.length).toBeGreaterThan(3);
    },
  );

  it("offers pasting text after a blocked or recipe-less link", () => {
    expect(explainImportError(err("site_blocked"), "link").offers).toEqual(["paste-text", "type-in"]);
    expect(explainImportError(err("no_recipe_found"), "link").offers).toContain("paste-text");
    expect(explainImportError(err("fetch_failed"), "link").offers).toEqual(["paste-text"]);
  });

  it("never offers pasting text from the text mode itself", () => {
    expect(explainImportError(err("no_recipe_found"), "text").offers).toEqual(["type-in"]);
  });

  it("puts validation under the field, without the field prefix, except for photos", () => {
    const p = explainImportError(err("validation", "text: Paste the recipe text first."), "text");
    expect(p).toMatchObject({ field: true, message: "Paste the recipe text first." });
    expect(explainImportError(err("validation", "files: 1 to 6 photos."), "photo").field).toBe(false);
  });

  it("gives every failure a next step", () => {
    expect(explainImportError(err("internal", "Something went wrong."), "link").offers).toEqual(["retry", "type-in"]);
    expect(explainImportError(err("network"), "photo").offers).toEqual(["retry", "type-in"]);
    expect(explainImportError(err("unauthenticated"), "link").offers).toEqual(["sign-in"]);
  });

  it("maps a sourceUrl error to the source field and a raw URL error to friendly copy", () => {
    const s = explainImportError(err("validation", "sourceUrl: must be an http(s) URL."), "text");
    expect(s).toMatchObject({ field: true, fieldId: "import-source", message: "Enter a full web address starting with https://" });
    expect(explainImportError(err("validation", "url: must be an http(s) URL."), "link")).toMatchObject({
      fieldId: "import-url",
      message: "Enter a full web address starting with https://",
    });
    expect(explainImportError(err("validation", "text: required."), "text").fieldId).toBe("import-text");
  });

  it("catches the backend's own url messages by field prefix", () => {
    const web = "Enter a full web address starting with https://";
    expect(explainImportError(err("validation", "url: enter a full web address starting with http:// or https://."), "link").message).toBe(web);
    expect(explainImportError(err("validation", "sourceUrl: must be an http(s) URL."), "text").message).toBe(web);
  });

  it("words too_large for photos and text differently", () => {
    expect(explainImportError(err("too_large"), "photo").title).toMatch(/photo/);
    expect(explainImportError(err("too_large"), "text").title).toMatch(/text/);
  });

  it("shows 501 as coming soon, naming the mode", () => {
    const p = explainImportError(err("not_implemented"), "photo");
    expect(p).toMatchObject({ tone: "info", title: "Coming soon", offers: ["type-in"] });
    expect(p.message).toMatch(/photos/);
  });

  it("carries the stored photo ids from ai_disabled", () => {
    const p = explainImportError(err("ai_disabled", "x", { photoImageIds: ["a", "b", 3] }), "photo");
    expect(p.photoIds).toEqual(["a", "b"]);
  });

  it("uses the client message for an unreachable server and copes with non-API errors", () => {
    expect(explainImportError(new ApiError(0, "network", "Can’t reach the Recipe Box server."), "link").message).toBe(
      "Can’t reach the Recipe Box server.",
    );
    expect(explainImportError(new Error("boom"), "link")).toMatchObject({ title: "The import failed", tone: "error", photoIds: [] });
  });
});
