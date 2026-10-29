import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

// REC-5: each member stars recipes for themselves, and the Favourites filter works with search.

test("stars are per member and the Favourites filter combines with search", async ({ memberPage: page, member, makeUser }) => {
  const word = unique("fav");
  const soup = await member.client.createRecipe({ title: `Lentil soup ${word}`, tags: [] });
  const stew = await member.client.createRecipe({ title: `Lentil stew ${word}`, tags: [] });
  await member.client.createRecipe({ title: `Lemon cake ${word}`, tags: [] });
  // Someone else's star on the stew: never shown to this member.
  const sam = await makeUser();
  expect((await sam.client.request.put(`/api/recipes/${stew.id}/favourite`)).status()).toBe(204);

  // Star the soup from its page.
  await page.goto(`/recipes/${soup.id}`);
  const recipeStar = page.getByRole("button", { name: "Favourite" });
  await hydrated(recipeStar);
  await expect(recipeStar).toHaveAttribute("aria-pressed", "false");
  await recipeStar.click();
  await expect(recipeStar).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(`Added “${soup.title}” to your favourites.`)).toBeAttached();

  // Star the cake from its card, searching for the shared word.
  await page.goto(`/?q=${word}`);
  const cakeStar = page.getByRole("button", { name: `Favourite: Lemon cake ${word}` });
  await hydrated(cakeStar);
  await cakeStar.click();
  await expect(cakeStar).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: `Favourite: Lentil stew ${word}` })).toHaveAttribute("aria-pressed", "false");

  // Favourites + "lentil": only this member's lentil favourite.
  await page.goto(`/?q=lentil+${word}`);
  await page.getByRole("link", { name: "Favourites" }).click();
  await expect(page).toHaveURL(/favourite=true/);
  const results = page.getByRole("region", { name: /matching recipes/ });
  await expect(results.getByRole("heading", { level: 2 })).toHaveText([soup.title]);
  await expect(page.getByText(`1 of your favourites matches “lentil ${word}”`)).toBeVisible();

  // Taking the star off keeps the card in place until the list is loaded again.
  const soupStar = results.getByRole("button", { name: `Favourite: ${soup.title}` });
  await hydrated(soupStar);
  await soupStar.click();
  await expect(soupStar).toHaveAttribute("aria-pressed", "false");
  await expect(soupStar).toBeFocused();
  await page.reload();
  await expect(page.getByRole("heading", { name: "None of your favourites match" })).toBeVisible();
});
