import { expect, test } from "../../support/fixtures.ts";

test("the login page is installable and carries the iOS home-screen tags", async ({ page, context }) => {
  await page.goto("/login");

  const cdp = await context.newCDPSession(page);
  await expect.poll(async () => (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors).toEqual([]);

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");

  const res = await page.request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");

  const srcs: string[] = [
    ...manifest.icons,
    ...manifest.screenshots,
    ...manifest.shortcuts.flatMap((s: { icons?: { src: string }[] }) => s.icons ?? []),
  ].map((i: { src: string }) => i.src);
  for (const src of srcs) expect((await page.request.get(src)).status(), src).toBe(200);
});
