import { expect, openTagFilter, test, unique } from "../../support/fixtures.ts";

test("search, tag filter and sort", async ({ memberPage: page, member }) => {
  const c = member.client;
  const tag = unique("tag");
  const word = unique("word");
  await c.createRecipe({ title: `Bravo ${word}`, totalMinutes: 10, tags: [tag] });
  await c.createRecipe({ title: `Alpha ${word}`, totalMinutes: 90, tags: [tag] });
  await c.createRecipe({ title: `Charlie ${word}`, tags: [tag] });
  await c.createRecipe({ title: `Delta ${word}`, tags: ["other"] });

  const titles = page.getByRole("region", { name: /recipes$/ }).getByRole("link");
  await page.goto("/");

  // search
  await page.getByRole("searchbox", { name: "Search recipes" }).fill(word);
  await expect(page).toHaveURL(new RegExp(`q=${word}`));
  await expect(titles).toHaveCount(4);
  await page.getByRole("searchbox", { name: "Search recipes" }).fill(`nothing-${word}`);
  await expect(page.getByText("No recipes match")).toBeVisible();
  await page.getByRole("link", { name: "Clear search" }).click();

  // tag filter (shared household: filter by this test's own tag)
  await page.goto(`/?q=${word}`);
  await openTagFilter(page);
  await page.getByRole("navigation", { name: "Filter by tag" }).getByRole("link", { name: new RegExp(`^${tag}`) }).click();
  await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
  await expect(titles).toHaveCount(3);
  await expect(page.getByText(`Delta ${word}`)).toHaveCount(0);

  // sort
  await page.getByLabel("Sort recipes").selectOption({ label: "A–Z" });
  await expect(page).toHaveURL(/sort=title/);
  await expect(titles.first()).toContainText(`Alpha ${word}`);
  await expect(titles.last()).toContainText(`Charlie ${word}`);

  await page.getByLabel("Sort recipes").selectOption({ label: "Quickest" });
  await expect(page).toHaveURL(/sort=time/);
  await expect(titles.first()).toContainText(`Bravo ${word}`);
  await expect(titles.last()).toContainText(`Charlie ${word}`); // unknown time last
});
