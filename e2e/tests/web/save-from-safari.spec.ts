import { expect, hydrated, fixtureUrl, test, unique } from "../../support/fixtures.ts";

test("a shared link waits for a confirm before anything is fetched", async ({ memberPage: page }) => {
  const link = `${fixtureUrl("publisher.html")}?run=${unique()}`;
  let imports = 0;
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/import/") && imports++);

  await page.goto(`/import?url=${encodeURIComponent(link)}`);
  await expect(page.getByRole("heading", { name: "Import this page?" })).toBeVisible();
  await expect(page.getByText(link)).toBeVisible();
  expect(imports).toBe(0);

  await hydrated(page.getByRole("button", { name: "Import this recipe" }));
  await page.getByRole("button", { name: "Import this recipe" }).click();
  await expect(page.getByRole("heading", { name: "Check the recipe" })).toBeVisible();
  expect(imports).toBe(1);
});

test("an address that is not http(s) is refused and never imported", async ({ memberPage: page }) => {
  let imports = 0;
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/import/") && imports++);
  await page.goto(`/import?url=${encodeURIComponent("javascript:alert(1)")}`);
  await expect(page.getByText("That link can’t be imported")).toBeVisible();
  await expect(page.getByLabel("Recipe link")).toHaveValue("");
  expect(imports).toBe(0);
});

test("the bookmarklet sends only the page address to Recipe Box", async ({ memberPage: page, context }) => {
  await page.goto("/settings/share");
  const tab = page.getByRole("link", { name: "Save to Recipe Box" });
  await expect(tab).toHaveAttribute("href", /^javascript:/);
  const code = (await tab.getAttribute("href")) as string;

  // run it on a recipe page, as a bookmark would
  const site = await context.newPage();
  const link = `${fixtureUrl("publisher.html")}?run=${unique()}`;
  await site.goto(link);
  const opened = context.waitForEvent("page");
  await site.evaluate((c) => new Function(c.slice("javascript:".length))(), code);
  const dest = await opened;
  await dest.waitForURL(/\/import\?/);
  const url = new URL(dest.url());
  expect(url.pathname).toBe("/import");
  expect([...url.searchParams.keys()]).toEqual(["url"]);
  expect(url.searchParams.get("url")).toBe(link);
  await expect(dest.getByRole("heading", { name: "Import this page?" })).toBeVisible();
});
