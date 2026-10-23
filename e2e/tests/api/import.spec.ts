import { expect, fixtureUrl, test } from "../../support/fixtures.ts";

test("link import returns a draft and saves nothing", async ({ member }) => {
  const c = member.client;
  const before = (await c.listRecipes({ q: "Slow-Roasted Tomato Soup" })).total;
  const draft = await c.importUrl(fixtureUrl("publisher.html"));
  expect(draft.title).toBe("Slow-Roasted Tomato Soup");
  expect(draft.ingredients?.length).toBe(5);
  expect(draft.steps?.length).toBe(3);
  expect(draft.sourceUrl).toBe(fixtureUrl("publisher.html"));
  expect(draft.imageUrl).toMatch(/^\/media\//); // the main photo was fetched from the fixture site and stored
  expect((await c.listRecipes({ q: "Slow-Roasted Tomato Soup" })).total).toBe(before);
});

test("pages with no recipe, internal addresses are refused", async ({ member }) => {
  const c = member.client;
  const none = await c.importUrlRaw(fixtureUrl("no-recipe.html"));
  expect(none.status()).toBe(422);
  expect(await none.json()).toMatchObject({ error: { code: "no_recipe_found" } });

  // The test host is allowed by exactly one host:port; every other internal address stays blocked.
  for (const url of ["http://127.0.0.1:1/", "http://localhost:80/", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/"]) {
    const res = await c.importUrlRaw(url);
    expect(res.status(), url).toBe(422);
    expect(await res.json(), url).toMatchObject({ error: { code: "blocked_address" } });
  }

  const caps = await c.request.get("/api/import/capabilities");
  expect(await caps.json()).toEqual({ ai: false, provider: "none" });
});
