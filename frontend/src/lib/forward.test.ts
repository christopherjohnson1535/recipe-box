import { afterEach, describe, expect, it, vi } from "vitest";
import { downstreamResponseHeaders, forwardToApi, upstreamRequestHeaders, upstreamUrl } from "./forward";
import { safeNext } from "./nav";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("upstreamUrl", () => {
  it("keeps path and query, tolerating a trailing slash on the base", () => {
    const incoming = new URL("https://recipes.example.com/api/recipes?q=soup&tag=dinner");
    expect(upstreamUrl("http://api:8080/", incoming)).toBe("http://api:8080/api/recipes?q=soup&tag=dinner");
    expect(upstreamUrl("http://api:8080", new URL("http://web:3000/media/abc.jpg"))).toBe(
      "http://api:8080/media/abc.jpg",
    );
  });
});

describe("header mapping", () => {
  it("forwards cookie and content-type, drops host and hop-by-hop headers", () => {
    const incoming = new Headers({
      host: "recipes.example.com",
      cookie: "rb_session=abc",
      "content-type": "multipart/form-data; boundary=x",
      connection: "keep-alive",
      "content-length": "123",
    });
    const h = upstreamRequestHeaders(incoming, new URL("https://recipes.example.com/api/media"));

    expect(h.get("cookie")).toBe("rb_session=abc");
    expect(h.get("content-type")).toBe("multipart/form-data; boundary=x");
    expect(h.has("host")).toBe(false);
    expect(h.has("connection")).toBe(false);
    expect(h.has("content-length")).toBe(false);
    expect(h.get("x-forwarded-host")).toBe("recipes.example.com");
    expect(h.get("x-forwarded-proto")).toBe("https");
  });

  it("keeps every Set-Cookie and drops encoding headers on the way back", () => {
    const upstream = new Headers();
    upstream.append("set-cookie", "rb_session=abc; HttpOnly; Path=/");
    upstream.append("set-cookie", "other=1; Path=/");
    upstream.set("content-encoding", "gzip");
    upstream.set("cache-control", "private, max-age=31536000, immutable");

    const h = downstreamResponseHeaders(upstream);
    expect(h.getSetCookie()).toEqual(["rb_session=abc; HttpOnly; Path=/", "other=1; Path=/"]);
    expect(h.has("content-encoding")).toBe(false);
    expect(h.get("cache-control")).toContain("immutable");
  });
});

describe("forwardToApi", () => {
  it("sends method, body and headers to API_INTERNAL_URL read at request time", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend.internal:9000");
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      new Response('{"ok":true}', { status: 201, headers: { "set-cookie": "rb_session=new; Path=/" } }),
    );
    vi.stubGlobal("fetch", fetch);

    const res = await forwardToApi(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "a=1" },
        body: '{"username":"chris"}',
      }),
    );

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("http://backend.internal:9000/api/auth/login");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("cookie")).toBe("a=1");
    expect(await new Response(init?.body).text()).toBe('{"username":"chris"}');
    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toEqual(["rb_session=new; Path=/"]);
  });

  it("answers 502 api_unreachable when the API is down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const res = await forwardToApi(new Request("http://localhost:3000/api/setup"));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("api_unreachable");
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/recipes/1?x=2")).toBe("/recipes/1?x=2");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});
