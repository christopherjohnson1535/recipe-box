import { expect, test } from "../../support/fixtures.ts";

test("the login page is installable and carries the iOS home-screen tags", async ({ page, context }) => {
  await page.goto("/login");

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  expect(installabilityErrors).toEqual([]);

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");

  const res = await page.request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  expect((await res.json()).display).toBe("standalone");
});
