import { expect, hydrated, test } from "../../support/fixtures.ts";

test("sign in with the wrong password, then the right one, then sign out", async ({ page, member }) => {
  await page.goto("/login");
  await hydrated(page.getByRole("button", { name: "Sign in" }));
  await page.getByLabel("Username").fill(member.user.username);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That username and password don’t match")).toBeVisible();

  await page.getByLabel("Password").fill(member.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Recipes", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  // the session is really gone: a protected page sends us back
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login/);
});

test("visitors without a session are sent to the login page", async ({ page }) => {
  for (const path of ["/", "/recipes/new", "/import", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("first-run setup is closed once the admin exists", async ({ page }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/login/);
});
