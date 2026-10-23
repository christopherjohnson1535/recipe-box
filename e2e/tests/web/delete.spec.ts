import { expect, FIXED_NOW, hydrated, test, unique } from "../../support/fixtures.ts";

test("delete a recipe and undo it", async ({ memberPage: page, member }) => {
  const recipe = await member.client.createRecipe({ title: unique("Soup ") });
  await page.goto(`/recipes/${recipe.id}`);
  await hydrated(page.getByRole("button", { name: "Delete" }));
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
  // The fixture installed the fake clock before any navigation. Once the page is hydrated, freeze it: from here on
  // time moves only through runFor, so the 9 s and 11 s steps are exact whatever the machine's speed.
  await page.goto(`/recipes/${recipe.id}`);
  await hydrated(page.getByRole("button", { name: "Delete" }));
  await page.clock.pauseAt(new Date(FIXED_NOW.getTime() + 60_000));
  await page.getByRole("button", { name: "Delete" }).click();
  await page.mouse.move(0, 0); // the countdown pauses while the pointer is over the toast
  const toast = page.getByText(`Deleted “${recipe.title}”.`);
  await expect(toast).toBeVisible();

  await page.clock.runFor(9_000);
  await expect(toast).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(toast).toBeHidden();
  expect((await member.client.request.get(`/api/recipes/${recipe.id}`)).status()).toBe(404);
});
