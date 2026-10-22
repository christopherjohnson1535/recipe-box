import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/server";
import { user } from "@/test/handlers";
import { ApiError, createApi } from "./api";

/** Records the one request an override receives. */
function capture(method: "get" | "post" | "delete", path: string, respond: () => Response) {
  const seen: { request: Request; body: string } = { request: undefined as never, body: "" };
  server.use(
    http[method](path, async ({ request }) => {
      seen.request = request.clone();
      seen.body = await request.text();
      return respond();
    }),
  );
  return seen;
}

/** A fetch that records the raw input the client passed, so tests can assert it was relative. */
function recordingFetch() {
  const inputs: string[] = [];
  const impl: typeof fetch = (input, init) => {
    inputs.push(String(input));
    return fetch(input, init);
  };
  return { inputs, impl };
}

describe("createApi", () => {
  it("uses relative URLs in the browser and sends JSON bodies", async () => {
    const seen = capture("post", "*/api/auth/login", () => HttpResponse.json(user));
    const rec = recordingFetch();
    const got = await createApi({ fetch: rec.impl }).login({ username: "chris", password: "secret-pass" });

    expect(got.username).toBe("chris");
    expect(rec.inputs).toEqual(["/api/auth/login"]);
    expect(new URL(seen.request.url).pathname).toBe("/api/auth/login");
    expect(seen.request.method).toBe("POST");
    expect(seen.request.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(seen.body)).toEqual({ username: "chris", password: "secret-pass" });
  });

  it("server-side: prefixes API_INTERNAL_URL and forwards the cookie", async () => {
    const seen = capture("get", "http://api:8080/api/recipes", () => HttpResponse.json({ items: [], total: 0 }));
    await createApi({ baseUrl: "http://api:8080", cookie: "rb_session=abc" }).listRecipes({ q: "soup", tag: "", limit: 10 });

    expect(seen.request.url).toBe("http://api:8080/api/recipes?q=soup&limit=10");
    expect(seen.request.headers.get("cookie")).toBe("rb_session=abc");
  });

  it("returns undefined for 204", async () => {
    const seen = capture("delete", "*/api/recipes/r1", () => new HttpResponse(null, { status: 204 }));
    await expect(createApi().deleteRecipe("r1")).resolves.toBeUndefined();
    expect(seen.request.method).toBe("DELETE");
  });

  it("sends multipart without forcing a content-type", async () => {
    const seen = capture("post", "*/api/import/photo", () => HttpResponse.json({ title: "x" }));
    await createApi().importPhoto([new Blob(["a"]), new Blob(["b"])], "dish");

    const form = await seen.request.formData();
    expect(form.getAll("files")).toHaveLength(2);
    expect(form.get("mode")).toBe("dish");
    expect(seen.request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/);
  });

  it("maps the API error body to ApiError, keeping extra fields", async () => {
    server.use(
      http.post("*/api/import/photo", () =>
        HttpResponse.json({ error: { code: "ai_disabled", message: "AI is off.", photoImageIds: ["p1"] } }, { status: 422 }),
      ),
    );
    const err = await createApi().importPhoto([new Blob(["a"])], "recipe").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "ai_disabled", message: "AI is off." });
    expect(err.details.photoImageIds).toEqual(["p1"]);
  });

  it("handles non-JSON error bodies", async () => {
    server.use(http.get("*/api/auth/me", () => new HttpResponse("Bad gateway", { status: 502 })));
    await expect(createApi().me()).rejects.toMatchObject({ status: 502, code: "internal" });
  });

  it("turns network failures into a 'network' ApiError", async () => {
    server.use(http.get("*/api/setup", () => HttpResponse.error()));
    await expect(createApi().getSetup()).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("encodes path ids", async () => {
    const seen = capture("get", "*/api/recipes/:id", () => HttpResponse.json({}));
    const rec = recordingFetch();
    await createApi({ fetch: rec.impl }).getRecipe("a/b");
    expect(rec.inputs).toEqual(["/api/recipes/a%2Fb"]);
    expect(new URL(seen.request.url).pathname).toBe("/api/recipes/a%2Fb");
  });
});
