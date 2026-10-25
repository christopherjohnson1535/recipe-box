import { expect, hydrated, fixtureUrl, test, unique } from "../../support/fixtures.ts";
import { BASE_URL } from "../../support/env.ts";

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
  await expect(tab).toHaveAttribute("href", /./);
  const code = (await tab.getAttribute("href")) as string;
  expect(new URL(code).protocol).toBe("javascript:");

  // run it on a recipe page, as a bookmark would
  const site = await context.newPage();
  // The fixture host is not reachable from the browser in the compose stack, so serve a stand-in recipe page.
  const link = `https://recipes.example.test/pancakes?run=${unique()}`;
  await site.route("https://recipes.example.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Pancakes</h1>" }));
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

test("an expired session on a shared link signs in and returns to the confirm step", async ({ page, member }) => {
  const link = `${fixtureUrl("publisher.html")}?run=${unique()}`;
  // A cookie is present (so the cheap gate lets the page through) but the API no longer accepts it.
  await page.context().addCookies([{ name: "rb_session", value: "expired", url: BASE_URL }]);
  await page.goto(`/import?url=${encodeURIComponent(link)}`);
  await expect(page).toHaveURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(`/import?url=${encodeURIComponent(link)}`);

  await page.context().clearCookies();
  await page.reload();
  await hydrated(page.getByRole("button", { name: "Sign in" }));
  await page.getByLabel("Username").fill(member.user.username);
  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Import this page?" })).toBeVisible();
  await expect(page.getByText(link)).toBeVisible();
});
