import { expect, hydrated, test, TEST_PNG, unique } from "../../support/fixtures.ts";

test("add a recipe with sections and a photo, then edit it", async ({ memberPage: page }) => {
  const title = unique("Lasagne ");
  await page.goto("/recipes/new");
  await hydrated(page.getByLabel("Title", { exact: true }));
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Description").fill("Layers of everything good.");
  await page.getByLabel("Servings").fill("6");
  await page.getByLabel("Total (min)").fill("90");
  await page.getByLabel("Tags").fill("dinner, Italian,");

  await page.getByLabel("Choose photo").setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: TEST_PNG });
  await expect(page.getByAltText("Preview of the recipe photo")).toBeVisible();

  // ingredients: one with a section heading, one without
  await page.getByLabel("Ingredient 1", { exact: true }).fill("500 g mince");
  await page.getByRole("button", { name: "Start a section at ingredient 1" }).click();
  await page.getByLabel("Section heading above ingredient 1", { exact: true }).fill("For the ragù");
  await page.getByLabel("Ingredient 1", { exact: true }).press("Enter");
  await page.getByLabel("Ingredient 2", { exact: true }).fill("9 lasagne sheets");
  await page.getByRole("button", { name: "Start a section at ingredient 2" }).click();
  await page.getByLabel("Section heading above ingredient 2", { exact: true }).fill("To assemble");

  await page.getByLabel("Step 1", { exact: true }).fill("Brown the mince.");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 2", { exact: true }).fill("Layer and bake.");

  await page.getByRole("button", { name: "Save recipe" }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "For the ragù" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "To assemble" })).toBeVisible();
  await expect(page.getByText("500 g mince")).toBeVisible();
  await expect(page.getByText("Layer and bake.")).toBeVisible();
  await expect(page.getByRole("img", { name: title })).toBeVisible();

  // edit: rename and drop the photo
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Title", { exact: true }).fill(`${title} (v2)`);
  await hydrated(page.getByRole("button", { name: "Remove photo" }));
  await page.getByRole("button", { name: "Remove photo" }).click();
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByRole("heading", { name: `${title} (v2)`, level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: `${title} (v2)` })).toHaveCount(0);
  await expect(page.getByText("For the ragù")).toBeVisible(); // sections survive an edit
});

test("a recipe needs a title", async ({ memberPage: page }) => {
  await page.goto("/recipes/new");
  await hydrated(page.getByLabel("Title", { exact: true }));
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByText("Give the recipe a title.")).toBeVisible();
  await expect(page).toHaveURL(/\/recipes\/new/);
});
