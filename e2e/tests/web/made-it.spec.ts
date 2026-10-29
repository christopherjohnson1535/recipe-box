import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

// REC-6: log a cook from cook mode with a note, see who and when on the recipe page, and delete your own entry.

test("Made it in cook mode lands in the recipe's log with who, when and the note", async ({ memberPage: page, member, makeUser }) => {
  const word = unique("made");
  const recipe = await member.client.createRecipe({
    title: `Braise ${word}`,
    ingredients: [{ text: "1 onion", section: null }],
    steps: [
      { text: "Brown the onion.", section: null },
      { text: "Braise for an hour.", section: null },
    ],
  });
  // Someone else made it last week; their name shows, with no Delete for this member.
  const sam = await makeUser({ displayName: `Sam ${word}` });
  expect((await sam.client.request.post(`/api/recipes/${recipe.id}/cook-log`, { data: { cookedOn: "2026-03-07", note: "Too salty." } })).status()).toBe(201);

  await page.goto(`/recipes/${recipe.id}/cook`);
  const next = page.getByRole("button", { name: /Next step/ });
  await hydrated(next);
  await expect(page.getByRole("button", { name: "Made it" })).toBeHidden();
  await next.click();
  await page.getByRole("button", { name: "Made it" }).click();
  await expect(page.getByLabel("Cooked on")).toHaveValue("2026-03-14"); // the device's day (fixed clock)
  await page.getByLabel("What I’d change").fill("Add a bay leaf.");
  await page.getByRole("button", { name: "Save to the log" }).click();
  await expect(page.getByText("In the log.")).toBeVisible();

  await page.goto(`/recipes/${recipe.id}`);
  const log = page.getByRole("region", { name: "Made it" });
  await expect(log.getByText("Made 2 times")).toBeVisible();
  const rows = log.getByRole("listitem");
  await expect(rows.nth(0)).toContainText("Today");
  await expect(rows.nth(0)).toContainText("You");
  await expect(rows.nth(0)).toContainText("Add a bay leaf.");
  await expect(rows.nth(1)).toContainText("Sat, Mar 7");
  await expect(rows.nth(1)).toContainText(`Sam ${word}`);
  await expect(rows.nth(1).getByRole("button")).toHaveCount(0);

  const del = log.getByRole("button", { name: "Delete your entry for Today" });
  await hydrated(del);
  await del.click();
  await expect(rows).toHaveCount(1);
  await expect(log.getByText("Made once")).toBeVisible();
});
