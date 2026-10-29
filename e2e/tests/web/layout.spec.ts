import type { Locator } from "@playwright/test";
import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

// The side-column breakpoints (xl: 1280px, md: 768px) are CSS, which jsdom cannot lay out, so they are checked here at
// the three projects' real widths: web-desktop 1280 (xl applies), web-ipad 1194 (md and lg, not xl), web-phone 393.

/** The aside's side column, and the main column that comes just before it in the same grid. */
const columns = (aside: Locator) => {
  const side = aside.locator("xpath=..");
  return { side, main: side.locator("xpath=preceding-sibling::*[1]") };
};

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no box");
  return box;
}

/** Behaviour the recipe form's tips must have at this project's width. */
async function expectFormTips(tips: Locator, wide: boolean) {
  if (!wide) return expect(tips).toBeHidden(); // in the page, but out of the layout and the accessibility tree
  await expect(tips).toBeVisible();
  const { side, main } = columns(tips);
  await expect(side).toHaveCSS("position", "sticky");
  const [tipsBox, mainBox] = [await boxOf(tips), await boxOf(main)];
  expect(tipsBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width);
}

/** Behaviour the import help must have at this project's width. */
async function expectImportHelp(help: Locator, project: string) {
  if (project === "web-phone") return expect(help).toBeHidden();
  await expect(help).toBeVisible();
  const { side, main } = columns(help);
  const [helpBox, mainBox] = [await boxOf(help), await boxOf(main)];
  if (project !== "web-desktop") return expect(helpBox.y).toBeGreaterThanOrEqual(mainBox.y + mainBox.height); // stacked under the main column
  await expect(side).toHaveCSS("position", "sticky");
  expect(helpBox.x).toBeGreaterThanOrEqual(mainBox.x + mainBox.width);
}

test("the recipe form's tips sit beside the form on a wide screen only", async ({ memberPage: page }, testInfo) => {
  await page.goto("/recipes/new");
  await hydrated(page.getByLabel("Title", { exact: true }));
  await expectFormTips(page.getByRole("complementary", { name: "Tips for the recipe form", includeHidden: true }), testInfo.project.name === "web-desktop");
});

test("the import help sits beside the form on a wide screen, under it on an iPad, and is left out on a phone", async ({ memberPage: page }, testInfo) => {
  await page.goto("/import");
  await hydrated(page.getByLabel("Recipe link"));
  await expectImportHelp(page.getByRole("complementary", { name: "How importing works", includeHidden: true }), testInfo.project.name);
});

// #137: Method runs to the same right edge as the numerals band above it at every project width (desktop 1280, iPad 1194,
// phone 393), with the recipe's note under it in the same column rather than in a margin column.
test("the method and its note reach the numerals band's right edge", async ({ memberPage: page, member }) => {
  const recipe = await member.client.createRecipe({
    title: unique("Stew "),
    servings: "4",
    prepMinutes: 20,
    cookMinutes: 90,
    notes: "Better the next day.",
    ingredients: [{ text: "1 kg beef", section: null }],
    steps: [{ text: "Brown the beef in batches, then braise it slowly until it falls apart.", section: null }],
  });
  await page.goto(`/recipes/${recipe.id}`);
  const method = page.getByRole("region", { name: "Method" });
  await hydrated(page.getByRole("button", { name: /1 kg beef/ }));
  const numerals = page.getByText("Serves", { exact: true }).locator("xpath=ancestor::dl[1]");
  const note = page.getByRole("figure").filter({ hasText: "Better the next day." });
  const [methodBox, bandBox, noteBox] = [await boxOf(method), await boxOf(numerals), await boxOf(note)];
  expect(Math.abs(methodBox.x + methodBox.width - (bandBox.x + bandBox.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(noteBox.x - methodBox.x)).toBeLessThanOrEqual(1); // same column
  expect(noteBox.y).toBeGreaterThanOrEqual(methodBox.y + methodBox.height); // under the method
});
