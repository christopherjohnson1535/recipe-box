import { expect, test, unique } from "../../support/fixtures.ts";

test("delete a recipe and undo it", async ({ memberPage: page, member }) => {
  const recipe = await member.client.createRecipe({ title: unique("Soup ") });
  await page.goto(`/recipes/${recipe.id}`);
  await page.getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL("/");
  const toast = page.getByText(`Deleted “${recipe.title}”.`);
  await expect(toast).toBeVisible();
  expect((await member.client.request.get(`/api/recipes/${recipe.id}`)).status()).toBe(404);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page).toHaveURL(`/recipes/${recipe.id}`);
  await expect(page.getByRole("heading", { name: recipe.title, level: 1 })).toBeVisible();
  expect((await member.client.getRecipe(recipe.id)).title).toBe(recipe.title);
});

test("the Undo offer expires after ten seconds", async ({ memberPage: page, member }) => {
  const recipe = await member.client.createRecipe({ title: unique("Stew ") });
  await page.goto(`/recipes/${recipe.id}`);
  await page.getByRole("button", { name: "Delete" }).click();
  const toast = page.getByText(`Deleted “${recipe.title}”.`);
  await expect(toast).toBeVisible();

  await page.clock.fastForward(9_000);
  await expect(toast).toBeVisible();
  await page.clock.fastForward(2_000);
  await expect(toast).toBeHidden();
  expect((await member.client.request.get(`/api/recipes/${recipe.id}`)).status()).toBe(404);
});
