import { ADMIN } from "../../support/env.ts";
import { expect, test } from "../../support/fixtures.ts";

test.describe("setup and sessions", () => {
  test("health and setup status are public; setup is closed once an admin exists", async ({ anon }) => {
    const health = await anon.health();
    expect(health.status()).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", db: "ok" });
    expect(await anon.setupStatus()).toBe(false);
    const again = await anon.setupRaw({ username: "second-admin", displayName: "Second", password: "long-enough-password" });
    expect(again.status()).toBe(403);
    expect(await again.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  test("login, me, logout", async ({ anon }) => {
    const bad = await anon.loginRaw(ADMIN.username, "wrong-password-here");
    expect(bad.status()).toBe(401);
    expect(await bad.json()).toMatchObject({ error: { code: "unauthenticated" } });
    // same answer for an unknown user
    expect((await anon.loginRaw("nobody-here", "wrong-password-here")).status()).toBe(401);

    const user = await anon.login(ADMIN.username, ADMIN.password);
    expect(user).toMatchObject({ username: ADMIN.username, role: "admin" });
    const me = await anon.me();
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ username: ADMIN.username });

    expect((await anon.logout()).status()).toBe(204);
    expect((await anon.me()).status()).toBe(401);
  });
});

test.describe("unauthenticated access is refused", () => {
  const routes: Array<[string, string]> = [
    ["GET", "/api/auth/me"],
    ["GET", "/api/recipes"],
    ["POST", "/api/recipes"],
    ["GET", "/api/recipes/00000000-0000-0000-0000-000000000000"],
    ["GET", "/api/tags"],
    ["POST", "/api/media"],
    ["GET", "/api/users"],
    ["POST", "/api/users"],
    ["GET", "/api/export"],
    ["GET", "/api/import/capabilities"],
    ["POST", "/api/import/url"],
    ["GET", "/media/00000000-0000-0000-0000-000000000000.jpg"],
  ];
  for (const [method, path] of routes) {
    test(`${method} ${path}`, async ({ anon }) => {
      const res = await anon.request.fetch(path, { method, data: method === "POST" ? {} : undefined });
      expect(res.status()).toBe(401);
    });
  }
});
