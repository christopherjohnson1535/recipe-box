import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "./api";

function mockFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createApi", () => {
  it("uses relative URLs in the browser and sends JSON bodies", async () => {
    const fetch = mockFetch(json({ id: "u1", username: "chris" }));
    const user = await createApi({ fetch }).login({ username: "chris", password: "secret-pass" });

    expect(user.username).toBe("chris");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init?.body as string)).toEqual({ username: "chris", password: "secret-pass" });
  });

  it("server-side: prefixes API_INTERNAL_URL and forwards the cookie", async () => {
    const fetch = mockFetch(json({ items: [], total: 0 }));
    await createApi({ baseUrl: "http://api:8080", cookie: "rb_session=abc", fetch }).listRecipes({
      q: "soup",
      tag: "",
      limit: 10,
    });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://api:8080/api/recipes?q=soup&limit=10");
    expect(new Headers(init?.headers).get("cookie")).toBe("rb_session=abc");
  });

  it("returns undefined for 204", async () => {
    const fetch = mockFetch(new Response(null, { status: 204 }));
    await expect(createApi({ fetch }).deleteRecipe("r1")).resolves.toBeUndefined();
    expect(fetch.mock.calls[0][0]).toBe("/api/recipes/r1");
    expect(fetch.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("sends multipart without forcing a content-type", async () => {
    const fetch = mockFetch(json({ id: "i1", url: "/media/x.jpg", width: 1, height: 1 }, 201));
    await createApi({ fetch }).importPhoto([new Blob(["a"]), new Blob(["b"])], "dish");

    const init = fetch.mock.calls[0][1]!;
    const form = init.body as FormData;
    expect(form.getAll("files")).toHaveLength(2);
    expect(form.get("mode")).toBe("dish");
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it("maps the API error body to ApiError, keeping extra fields", async () => {
    const fetch = mockFetch(
      json({ error: { code: "ai_disabled", message: "AI is off.", photoImageIds: ["p1"] } }, 422),
    );
    const err = await createApi({ fetch }).importPhoto([new Blob(["a"])], "recipe").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "ai_disabled", message: "AI is off." });
    expect(err.details.photoImageIds).toEqual(["p1"]);
  });

  it("handles non-JSON error bodies", async () => {
    const fetch = mockFetch(new Response("Bad gateway", { status: 502 }));
    await expect(createApi({ fetch }).me()).rejects.toMatchObject({ status: 502, code: "internal" });
  });

  it("turns network failures into a 'network' ApiError", async () => {
    const fetch = mockFetch(new TypeError("fetch failed"));
    await expect(createApi({ fetch }).getSetup()).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("encodes path ids", async () => {
    const fetch = mockFetch(json({}));
    await createApi({ fetch }).getRecipe("a/b");
    expect(fetch.mock.calls[0][0]).toBe("/api/recipes/a%2Fb");
  });
});
