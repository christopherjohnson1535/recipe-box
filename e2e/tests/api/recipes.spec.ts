import { expect, test, unique } from "../../support/fixtures.ts";

test("create, read, replace with sections, delete and restore", async ({ member }) => {
  const c = member.client;
  const title = unique("Pancakes ");
  const created = await c.createRecipe({
    title,
    ingredients: [
      { text: "200 g flour", section: "Batter" },
      { text: "1 pinch salt", section: "Batter" },
      { text: "butter", section: null },
    ],
    steps: [{ text: "Whisk.", section: "Batter" }, { text: "Fry.", section: null }],
    tags: [" Breakfast ", "breakfast", "Quick"],
  });
  expect(created.tags).toEqual(["breakfast", "quick"]);
  expect(created.ingredients[0]).toEqual({ text: "200 g flour", section: "Batter" });

  const edited = await c.updateRecipe(created.id, { title: `${title} v2`, ingredients: [{ text: "2 eggs", section: null }], tags: ["breakfast"] });
  expect(edited.title).toBe(`${title} v2`);
  expect(edited.steps).toEqual([]); // PUT replaces everything

  await c.deleteRecipe(created.id);
  expect((await c.request.get(`/api/recipes/${created.id}`)).status()).toBe(404);
  const restored = await c.restoreRecipe(created.id);
  expect(restored.id).toBe(created.id);
  expect((await c.getRecipe(created.id)).title).toBe(`${title} v2`);
});

test("validation errors use the error envelope", async ({ member }) => {
  const res = await member.client.request.post("/api/recipes", { data: { title: "" } });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: { code: "validation" } });
  expect((await member.client.request.get("/api/recipes", { params: { sort: "bogus" } })).status()).toBe(400);
});

test("search, tag filter and sort", async ({ member }) => {
  const c = member.client;
  const tag = unique("tag");
  const word = unique("word");
  const quick = await c.createRecipe({ title: `Bravo ${word}`, totalMinutes: 10, tags: [tag] });
  const slow = await c.createRecipe({ title: `Alpha ${word}`, totalMinutes: 90, tags: [tag] });
  const unknown = await c.createRecipe({ title: `Charlie ${word}`, tags: [tag] });
  await c.createRecipe({ title: `Delta ${word}`, tags: ["other"] });

  const titles = async (q: Record<string, string>) => (await c.listRecipes(q)).items.map((r) => r.title);
  expect(await titles({ tag, sort: "title" })).toEqual([slow.title, quick.title, unknown.title]);
  expect(await titles({ tag, sort: "time" })).toEqual([quick.title, slow.title, unknown.title]);
  expect(await titles({ tag, sort: "newest" })).toEqual([unknown.title, slow.title, quick.title]);
  expect((await c.listRecipes({ q: word })).total).toBe(4);
  expect((await c.listRecipes({ q: word, tag })).total).toBe(3);
  expect(await titles({ q: `charl`, tag })).toEqual([unknown.title]);
  expect((await c.listRecipes({ q: tag.slice(0, 6) })).total).toBeGreaterThanOrEqual(3); // tag-prefix match
  expect(await titles({ q: `nothing-matches-${word}` })).toEqual([]);
});
