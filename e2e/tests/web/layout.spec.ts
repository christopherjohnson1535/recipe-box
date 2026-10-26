import type { Locator } from "@playwright/test";
import { expect, hydrated, test } from "../../support/fixtures.ts";

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
