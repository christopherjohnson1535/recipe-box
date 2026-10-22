import { expect, hydrated, fixtureUrl, test, unique } from "../../support/fixtures.ts";

test("import from a link, review, save", async ({ memberPage: page, member }) => {
  await page.goto("/import");
  // a unique query string: the same page imported by another test would otherwise be flagged as a duplicate
  const link = `${fixtureUrl("publisher.html")}?run=${unique()}`;
  await hydrated(page.getByLabel("Recipe link"));
  await page.getByLabel("Recipe link").fill(link);
  await page.getByRole("button", { name: "Import recipe" }).click();

  await expect(page.getByRole("heading", { name: "Check the recipe" })).toBeVisible();
  await expect(page.getByText("Nothing is saved until you press Save")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Slow-Roasted Tomato Soup");
  await expect(page.getByLabel("Ingredient 1", { exact: true })).toHaveValue("3 pounds ripe tomatoes, halved");
  await expect(page.getByAltText("Preview of the recipe photo")).toBeVisible();

  const title = `Slow-Roasted Tomato Soup ${unique()}`;
  await page.getByLabel("Title", { exact: true }).fill(title);
  // an import is only a draft: nothing exists until Save
  expect((await member.client.listRecipes({ q: title })).total).toBe(0);
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText("Roast the tomatoes and garlic for 90 minutes.")).toBeVisible();
  await expect(page.getByText("Source:")).toBeVisible();

  const saved = await member.client.listRecipes({ q: title });
  expect(saved.items.map((r) => r.title)).toEqual([title]);
});

test("a page with no recipe says so", async ({ memberPage: page }) => {
  await page.goto("/import");
  await hydrated(page.getByLabel("Recipe link"));
  await page.getByLabel("Recipe link").fill(fixtureUrl("no-recipe.html"));
  await page.getByRole("button", { name: "Import recipe" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No recipe found" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Check the recipe" })).toHaveCount(0);
});
