import { expect, FIXED_NOW, hydrated, test, unique } from "../../support/fixtures.ts";

// KIT-6: a time written in a step is a tap-to-start timer that keeps running while the cook is on another step.

test("a step's time starts a timer that keeps running on the next step and ends with Done", async ({ memberPage: page, member }) => {
  const recipe = await member.client.createRecipe({
    title: unique("Risotto "),
    servings: "2",
    ingredients: [{ text: "1 onion", section: null }],
    steps: [
      { text: "Soften the onion, about 5 minutes.", section: null },
      { text: "Rest it for half an hour.", section: null },
    ],
  });
  await page.goto(`/recipes/${recipe.id}/cook`);
  const stage = page.getByRole("dialog", { name: "Cooking mode" });
  const chip = stage.getByRole("button", { name: "Start timer: 5 minutes" });
  await hydrated(chip);
  // From here time moves only through runFor, so the countdown is exact whatever the machine's speed.
  await page.clock.pauseAt(new Date(FIXED_NOW.getTime() + 60_000));
  await chip.click();

  const timer = stage.getByRole("group", { name: "Step 1 · 5 min" });
  await expect(timer).toContainText("5:00");
  await expect(stage.getByRole("button", { name: "Timer running: 5 minutes" })).toContainText("5:00");

  await stage.getByRole("button", { name: /Next step/ }).click();
  await expect(stage.getByText("Step 2 of 2", { exact: true })).toBeVisible();
  // The second step's words are a timer too: "half an hour".
  await stage.getByRole("button", { name: "Start timer: half an hour" }).click();
  await expect(stage.getByRole("group", { name: "Step 2 · 30 min" })).toContainText("30:00");

  await page.clock.runFor(60_000);
  await expect(timer).toContainText("4:00");
  await page.clock.runFor(4 * 60_000);
  await expect(timer).toContainText("Done");
  await expect(stage.getByRole("status")).toContainText("Timer finished: Step 1 · 5 min");
  await expect(stage.getByRole("group", { name: "Step 2 · 30 min" })).toContainText("25:00");

  await timer.getByRole("button", { name: "Dismiss timer: Step 1 · 5 min" }).click();
  await expect(timer).toBeHidden();
});
