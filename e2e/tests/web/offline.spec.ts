import type { Page } from "@playwright/test";
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

const keptCount = (page: Page) =>
  page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("rb-")).length);

test("a recipe opened before loads offline, with its photo, and other pages fall back", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  await context.setOffline(true);
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page.getByRole("heading", { name: recipe.title, level: 1 })).toBeVisible();
  await expect(page.getByText("Simmer for 20 minutes.")).toBeVisible();
  const photo = page.getByRole("img", { name: `${recipe.title}, photo` });
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByText("You’re offline")).toBeVisible();

  // A page this device never kept: the offline page, listing what it did keep.
  const viaWorker = await page.evaluate(() => fetch("/api/health").then((r) => r.status, (e) => String(e)));
  const diag = `workers=${context.serviceWorkers().map((w) => w.url()).join(",")} healthViaWorker=${viaWorker} browser=${context.browser()?.version()}`;
  await page.goto("/settings").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 }), `${diag} ${await where(page)}`).toBeVisible();
  await page.getByRole("link", { name: new RegExp(recipe.title) }).click();
  await expect(page.getByRole("heading", { name: recipe.title, level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test("saving and importing are off while offline, with the reason", async ({ memberPage: page, context }) => {
  await page.goto("/import");
  const button = page.getByRole("button", { name: "Import recipe" });
  await hydrated(button);
  await context.setOffline(true);
  await expect(button).toBeDisabled();
  await expect(page.getByText(/Importing reads the recipe on the server/)).toBeVisible();
  await context.setOffline(false);
  await expect(button).toBeEnabled();
});

test("signing out drops everything kept, so nothing is served from the cache", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  const signOut = page.getByRole("button", { name: "Sign out" });
  await hydrated(signOut);
  await signOut.click();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => keptCount(page)).toBe(0);

  await context.setOffline(true);
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page.getByRole("heading", { name: "You’re offline", level: 1 })).toBeVisible();
  await expect(page.getByText(recipe.title)).toHaveCount(0);
  await context.setOffline(false);
});

test("an expired session also drops what was kept", async ({ memberPage: page, member, context }) => {
  const recipe = await recipeWithPhoto(member);
  await openAndKeep(page, recipe.id);

  await context.clearCookies();
  await page.goto(`/recipes/${recipe.id}`);
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => keptCount(page)).toBe(0);
});
