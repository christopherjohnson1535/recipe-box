import type { BrowserContext, Page, Route } from "@playwright/test";
import { expect, hydrated, test, TEST_PNG, unique, type Member } from "../../support/fixtures.ts";

// KIT-5: a recipe opened before still loads with no network; signed out, nothing comes from the cache.

async function recipeWithPhoto(member: Member) {
  const photo = await member.client.uploadPng(TEST_PNG);
  return member.client.createRecipe({
    title: unique("Offline soup "),
    ingredients: [{ text: "1 l stock", section: null }],
    steps: [{ text: "Simmer for 20 minutes.", section: null }],
    imageId: photo.id,
  });
}

/** Opens the recipe and waits until the service worker has kept the page, its cooking mode and its photo. */
async function openAndKeep(page: Page, id: string) {
  await page.goto(`/recipes/${id}`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const pages = await (await caches.open("rb-pages")).keys();
        const media = await (await caches.open("rb-media")).keys();
        const urls = pages.map((r) => r.url);
        return urls.some((u) => u.endsWith(`/recipes/${id}`)) && urls.some((u) => u.endsWith(`/recipes/${id}/cook`)) && media.length > 0;
      }, id),
    )
    .toBe(true);
}

/** What the page shows, for assertion messages (CI only shows annotations). */
const where = async (page: Page) =>
  JSON.stringify(
    await page.evaluate(async () => ({
      url: location.href,
      title: document.title,
      h1: document.querySelector("h1")?.textContent,
      controlled: !!navigator.serviceWorker.controller,
      caches: await Promise.all((await caches.keys()).map(async (n) => `${n}:${(await (await caches.open(n)).keys()).length}`)),
      offlineKept: !!(await caches.match("/offline", { ignoreSearch: true })),
    })).catch((e) => String(e)),
  );

/**
 * Takes the device offline for the page and its service worker. `setOffline` alone does not always reach the worker's
 * own fetches (seen on the Chromium build CI uses), so requests to the stack are aborted too, and this waits until a
 * fetch through the worker really fails.
 */
const toStack = (url: URL) => url.hostname === "127.0.0.1" || url.hostname === "localhost";
const cutOff = (route: Route) => route.abort("internetdisconnected");

async function goOffline(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await context.route(toStack, cutOff);
  await expect
    .poll(() => page.evaluate(() => fetch("/api/health", { cache: "no-store" }).then(() => "reached", () => "offline")), { message: "the worker still reaches the server" })
    .toBe("offline");
}

async function goOnline(context: BrowserContext) {
  await context.unroute(toStack, cutOff);
  await context.setOffline(false);
}

const keptCount = (page: Page, prefix = "rb-") =>
  page.evaluate(async (prefix) => (await caches.keys()).filter((n) => n.startsWith(prefix)).length, prefix);

/**
 * Nothing kept, and it stays that way: a first zero can be the moment between a wipe and a fetch that started before
 * it storing its page. Each further read comes after a round trip through the worker, so late writes have had their turn.
 */
async function expectWiped(page: Page, prefix = "rb-") {
  await expect.poll(() => keptCount(page, prefix), { message: "the worker still keeps pages" }).toBe(0);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => fetch("/api/health", { cache: "no-store" }).then((r) => r.status));
    expect(await keptCount(page, prefix), await where(page)).toBe(0);
  }
}

test("a recipe opened before loads offline, with its photo, and other pages fall back", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  await goOffline(context, page);
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page.getByRole("heading", { name: recipe.title, level: 1 })).toBeVisible();
  await expect(page.getByText("Simmer for 20 minutes.")).toBeVisible();
  const photo = page.getByRole("img", { name: `${recipe.title}, photo` });
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByText("You’re offline", { exact: true })).toBeVisible();
  const del = page.getByRole("button", { name: "Delete" });
  await expect(del).toBeDisabled();
  await expect(del).toHaveAccessibleDescription(/Deleting needs the server/);

  // A page this device never kept: the offline page, listing what it did keep.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 }), await where(page)).toBeVisible();
  await page.getByRole("link", { name: new RegExp(recipe.title) }).click();
  await expect(page.getByRole("heading", { name: recipe.title, level: 1 })).toBeVisible();
  await goOnline(context);
});

test("saving and importing are off while offline, with the reason", async ({ memberPage: page, context }) => {
  await page.goto("/import");
  const button = page.getByRole("button", { name: "Import recipe" });
  await hydrated(button);
  await goOffline(context, page);
  await expect(button).toBeDisabled();
  await expect(page.getByText(/Importing reads the recipe on the server/)).toBeVisible();
  await goOnline(context);
  await expect(button).toBeEnabled();
});

test("signing out drops everything kept, so nothing is served from the cache", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  const signOut = page.getByRole("button", { name: "Sign out" });
  await hydrated(signOut);
  await signOut.click();
  await expect(page).toHaveURL(/\/login/);
  await expectWiped(page);

  await goOffline(context, page);
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 })).toBeVisible();
  await expect(page.getByText(recipe.title)).toHaveCount(0);
  await goOnline(context);
});

test("an expired session also drops what was kept", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  await context.clearCookies();
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page).toHaveURL(/\/login/);
  await expectWiped(page);
});

test("a 401 on the recipe API also drops what was kept", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  await context.clearCookies();
  const status = await page.evaluate((id) => fetch(`/api/recipes/${id}`).then((r) => r.status), recipe.id);
  expect(status).toBe(401);
  await expectWiped(page);
});

test("a second member signing in on the same browser sees none of the first one's pages", async ({ memberPage: page, member, makeUser, context }) => {
  const second = await makeUser();
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  // The first session ends without Sign out (it expired, or the cookie was cleared); no request tells the worker.
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Username").fill(second.user.username);
  await page.getByLabel("Password").fill(second.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  // Recipes are shared by the household, so the second member's own home page may keep photos; the first one's pages must be gone.
  await expectWiped(page, "rb-pages");
  await expectWiped(page, "rb-api");

  await goOffline(context, page);
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 })).toBeVisible();
  await expect(page.getByText(recipe.title)).toHaveCount(0);
  await goOnline(context);
});
