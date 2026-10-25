import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

// GRO-1..4: two recipes on one shared list, grouped in store order, shopped from the page, kept across a reload.

test("two recipes make one list in store order that can be ticked, moved, added to and cleared", async ({ memberPage: page, member }) => {
  // The household has exactly one list, so one project edits it: the phone and iPad projects run beside this one.
  // eslint-disable-next-line playwright/no-skipped-test -- shared household list, see above
  test.skip(test.info().project.name !== "web-desktop", "the household has one grocery list; only the desktop project edits it");
  const c = member.client;
  const word = unique("gro");
  // The household list is shared by everyone; start from an empty one.
  expect((await c.request.delete("/api/grocery")).status()).toBe(204);

  const stew = await c.createRecipe({
    title: `Stew ${word}`,
    servings: "4",
    ingredients: [
      { text: "2 onions, diced", section: null },
      { text: "1 lb ground beef", section: null },
    ],
    steps: [{ text: "Brown the beef.", section: null }],
  });
  await c.createRecipe({
    title: `Soup ${word}`,
    ingredients: [
      { text: "1 onion", section: null },
      { text: "2 tbsp olive oil", section: null },
    ],
    steps: [{ text: "Simmer.", section: null }],
  });

  // From the recipe page, at 2× (the page's current scale): 2 onions become 4.
  await page.goto(`/recipes/${stew.id}`);
  const add = page.getByRole("button", { name: "Add to groceries" });
  await hydrated(add);
  await page.getByRole("radiogroup", { name: "Scale ingredients" }).getByText("2×").click();
  await add.click();
  await expect(page.getByText("On your grocery list at 2×")).toBeVisible();

  // From the home grid, with Select: at 1×.
  await page.goto(`/?q=${word}`);
  const select = page.getByRole("button", { name: "Select recipes" });
  await hydrated(select);
  await select.click();
  await page.getByRole("button", { name: new RegExp(`Soup ${word}`) }).click();
  await page.getByRole("button", { name: "Add 1 to groceries" }).click();
  await expect(page.getByText("Added 1 recipe to your groceries")).toBeVisible();

  // One list: the nav badge counts it, the page groups it in store order.
  await page.getByRole("link", { name: /^Groceries/ }).click();
  await expect(page).toHaveURL(/\/groceries$/);
  await expect(page.getByRole("heading", { level: 1, name: "Groceries" })).toBeVisible();
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.first()).toHaveText("Produce");
  const sections = await headings.allTextContents();
  expect(sections.indexOf("Produce")).toBeLessThan(sections.indexOf("Meat"));
  expect(sections.indexOf("Meat")).toBeLessThan(sections.indexOf("Pantry"));
  const produce = page.getByRole("region", { name: "Produce" });
  // 4 (2 onions at 2×) + 1 = 5; "onion" or "onions" depending on how the API names it.
  const onions = produce.getByRole("button", { name: /^5 onions?$/ });
  await expect(onions).toBeVisible();
  await expect(page.getByRole("region", { name: "Meat" }).getByRole("button", { name: /ground beef/ })).toBeVisible();

  // Tick, untick, tick.
  await onions.click();
  await expect(onions).toHaveAttribute("aria-pressed", "true");
  await onions.click();
  await expect(onions).toHaveAttribute("aria-pressed", "false");
  await onions.click();
  await expect(onions).toHaveAttribute("aria-pressed", "true");

  // Move the beef to the freezer.
  await page.getByRole("button", { name: "Options for ground beef" }).click();
  await page.getByRole("menuitemradio", { name: "Freezer" }).click();
  const freezer = page.getByRole("region", { name: "Freezer" });
  await expect(freezer.getByRole("button", { name: /ground beef/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Meat" })).toHaveCount(0);

  // Add a manual item and tick it.
  await page.getByLabel("Add an item").fill("paper towels");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const towels = page.getByRole("button", { name: "paper towels" });
  await expect(towels).toBeVisible();
  await expect(page.getByLabel("Add an item")).toHaveValue("");
  await towels.click();
  await expect(towels).toHaveAttribute("aria-pressed", "true");

  // Clear ticked: the onions and the towels go; the beef stays.
  await page.getByRole("button", { name: /^Clear ticked/ }).click();
  await expect(onions).toHaveCount(0);
  await expect(towels).toHaveCount(0);

  // Reload: the server has all of it.
  await page.reload();
  await expect(page.getByRole("region", { name: "Freezer" }).getByRole("button", { name: /ground beef/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /onion/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "paper towels" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /olive oil/ })).toBeVisible();
  await expect(page.getByRole("link", { name: `Stew ${word}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Soup ${word}` })).toBeVisible();
});
