import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@/test/server";
import { clientAddress, downstreamResponseHeaders, forwardToApi, upstreamRequestHeaders, upstreamUrl } from "./forward";
import { safeNext } from "./nav";

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

  it("drops Expect so Node's fetch doesn't reject large uploads", () => {
    const incoming = new Headers({ expect: "100-continue", cookie: "rb_session=abc", "content-type": "image/jpeg" });
    const h = upstreamRequestHeaders(incoming, new URL("https://recipes.example.com/api/media"));

    expect(h.has("expect")).toBe(false);
    expect(h.get("cookie")).toBe("rb_session=abc");
    expect(h.get("content-type")).toBe("image/jpeg");
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

describe("client address for the sign-in throttle", () => {
  const url = new URL("https://recipes.example.com/api/auth/login");
  const spoofed = {
    "x-forwarded-for": "6.6.6.6, 198.51.100.4",
    "x-real-ip": "6.6.6.6",
    forwarded: "for=6.6.6.6",
    "x-client-ip": "6.6.6.6",
    "cf-connecting-ip": "6.6.6.6",
  };

  it("passes on no client-sent address headers unless the proxy is trusted", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "");
    const h = upstreamRequestHeaders(new Headers(spoofed), url);
    for (const name of Object.keys(spoofed)) expect(h.has(name), name).toBe(false);
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    expect(upstreamRequestHeaders(new Headers(spoofed), url).has("x-forwarded-for")).toBe(false);
  });

  it("when trusted, sends only the right-most X-Forwarded-For entry, the one our proxy added", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const h = upstreamRequestHeaders(new Headers(spoofed), url);
    expect(h.get("x-forwarded-for")).toBe("198.51.100.4");
    for (const name of ["x-real-ip", "forwarded", "x-client-ip", "cf-connecting-ip"]) expect(h.has(name), name).toBe(false);
  });

  it("drops anything that is not an address", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "1.2.3.4, evil<script>" }), true)).toBeNull();
    expect(clientAddress(new Headers({ "x-forwarded-for": "unknown" }), true)).toBeNull();
    expect(clientAddress(new Headers({ "x-forwarded-for": "" }), true)).toBeNull();
    expect(clientAddress(new Headers(), true)).toBeNull();
    expect(clientAddress(new Headers({ "x-forwarded-for": "2001:db8::7" }), true)).toBe("2001:db8::7");
    expect(clientAddress(new Headers({ "x-forwarded-for": "198.51.100.4" }), false)).toBeNull();
  });
});

describe("forwardToApi", () => {
  it("sends method, body and headers to API_INTERNAL_URL read at request time", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend.internal:9000");
    let seen: { url: string; method: string; cookie: string | null; body: string } | undefined;
    server.use(
      http.post("http://backend.internal:9000/api/auth/login", async ({ request }) => {
        seen = { url: request.url, method: request.method, cookie: request.headers.get("cookie"), body: await request.text() };
        return new HttpResponse('{"ok":true}', { status: 201, headers: { "set-cookie": "rb_session=new; Path=/" } });
      }),
    );

    const res = await forwardToApi(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "a=1" },
        body: '{"username":"chris"}',
      }),
    );

    expect(seen).toEqual({ url: "http://backend.internal:9000/api/auth/login", method: "POST", cookie: "a=1", body: '{"username":"chris"}' });
    expect(res.status).toBe(201);
    expect(res.headers.getSetCookie()).toEqual(["rb_session=new; Path=/"]);
  });

  it("answers 502 api_unreachable when the API is down", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend.internal:9000");
    server.use(http.get("http://backend.internal:9000/api/setup", () => HttpResponse.error()));
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
