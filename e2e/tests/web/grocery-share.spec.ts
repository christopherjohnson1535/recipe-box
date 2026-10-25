import type { Page } from "@playwright/test";
import { expect, hydrated, test, unique } from "../../support/fixtures.ts";

// GRO-5: the list leaves the app as text (Share on a device that has a share sheet, Copy elsewhere). The stack has no
// Google OAuth client, so the Google Tasks controls must be absent and Settings must say the admin can turn it on.

/** Desktop Chromium on Linux has no share sheet; remove it anyway so the test does not depend on that. */
const withoutShareSheet = (page: Page) => page.addInitScript(() => Object.defineProperty(Navigator.prototype, "share", { value: undefined, configurable: true }));

test("Copy puts the unticked items on the clipboard, and there is no Google Tasks button", async ({ memberPage: page, member }) => {
  const c = member.client;
  const word = unique("gro");
  let status = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/integrations/google");
  await withoutShareSheet(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  // The household has one list and other specs empty it, so seed again and look again until one pass holds.
  await expect(async () => {
    const res = await c.request.post("/api/grocery/items", { data: { text: `2 lb ${word}` } });
    expect(res.status()).toBe(201);
    status = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/integrations/google");
    await page.goto("/groceries");
    const copy = page.getByRole("button", { name: "Copy list" });
    await expect(copy).toBeVisible({ timeout: 2_000 });
    await hydrated(copy);
    await copy.click();
    await expect(page.getByRole("group", { name: "Send to…" }).getByText("Copied.")).toBeVisible({ timeout: 2_000 });
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.startsWith("Groceries\n\n")).toBe(true);
    expect(text).toContain(`Other\n`);
    expect(text).toContain(`- 2 lb ${word}`);
  }).toPass({ timeout: 30_000 });

  // Absence only means something once the status answer is in and the page has drawn from it.
  expect(await (await status).json()).toMatchObject({ configured: false });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect(page.getByRole("button", { name: /Google Tasks/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Google Tasks/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const box = await page.getByRole("button", { name: "Copy list" }).boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("Share hands the same text to the device's share sheet", async ({ memberPage: page, member }) => {
  const c = member.client;
  const word = unique("gro");
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: (data: unknown) => {
        (window as unknown as { shared: unknown }).shared = data;
        return Promise.resolve();
      },
    });
  });
  await expect(async () => {
    expect((await c.request.post("/api/grocery/items", { data: { text: `3 ${word}` } })).status()).toBe(201);
    await page.goto("/groceries");
    const share = page.getByRole("button", { name: "Share list" });
    await expect(share).toBeVisible({ timeout: 2_000 });
    await hydrated(share);
    await expect(page.getByRole("button", { name: "Copy list" })).toHaveCount(0);
    await share.click();
    const shared = await page.evaluate(() => (window as unknown as { shared?: { title: string; text: string } }).shared);
    expect(shared?.title).toBe("Groceries");
    expect(shared?.text).toContain(`- 3 ${word}`);
  }).toPass({ timeout: 30_000 });
});

test("Settings says the household admin can turn Google Tasks on", async ({ memberPage: page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 2, name: "Google Tasks" })).toBeVisible();
  await expect(page.getByText(/household admin can turn it on/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Google Tasks" })).toHaveCount(0);
});
